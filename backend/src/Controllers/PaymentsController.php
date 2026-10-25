<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Lister, Page, Perm, Request, Util};

final class PaymentsController
{
    private const METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'mobile_wallet', 'other'];

    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer_ref', 'p');
        $sql = "SELECT p.id, p.business_id, p.customer_id, p.invoice_id, p.purchase_id, p.amount, p.payment_date AS date, p.method, p.transaction_id, p.status, p.notes, p.void_reason, p.receipt_no, p.recorded_by, p.created_at,
            c.name AS customer_name, ru.name AS recorded_by_name, CASE WHEN p.invoice_id IS NOT NULL THEN 'invoice' ELSE 'purchase' END AS target_type,
            COALESCE(i.number, CONCAT('Purchase ', pu.purchase_date)) AS target_number
            FROM payments p JOIN customers c ON c.id = p.customer_id LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN purchases pu ON pu.id = p.purchase_id LEFT JOIN users ru ON ru.id = p.recorded_by
            WHERE p.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id']], $sp)];
    }

    public static function shape(array $row): array { return Util::shape($row); }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :pid', ['pid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Payment not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'view');
        [$inner, $params] = self::inner($u);
        $page = Lister::run($inner, $params, $r, [
            'search' => ['receipt_no', 'transaction_id', 'customer_name', 'target_number'], 'filters' => ['status' => 'status', 'method' => 'method', 'customerId' => 'customer_id', 'invoiceId' => 'invoice_id', 'purchaseId' => 'purchase_id'],
            'sorts' => ['receiptNo' => 't.receipt_no', 'date' => 't.date', 'customerName' => 't.customer_name', 'amount' => 't.amount', 'status' => 't.status'], 'sort' => 'date', 'dir' => 'desc', 'date' => 'date',
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'view');
        return self::shape(self::find($u, $p['id']));
    }

    /** Remaining balance of an invoice or purchase, computed from COMPLETED payments. Row must already be locked. */
    private static function balance(string $kind, array $target, ?int $excludePaymentId = null): float
    {
        $col = $kind === 'invoice' ? 'invoice_id' : 'purchase_id';
        $paid = (float)Db::val("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE $col = :id AND status = 'completed' AND id <> :x", ['id' => $target['id'], 'x' => $excludePaymentId ?? 0]);
        return round((float)$target['total'] - $paid, 2);
    }

    /** Loads + locks the invoice/purchase a payment belongs to (inside a transaction). */
    private static function lockTarget(array $u, ?int $invoiceId, ?int $purchaseId): array
    {
        if ($invoiceId !== null) {
            $t = Db::one('SELECT * FROM invoices WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $invoiceId, 'b' => $u['business_id']]);
            if (!$t || !Perm::customerVisible($u, (int)$t['customer_id'])) { throw new ApiException(404, 'Invoice not found.'); }
            if ($t['status'] !== 'issued') { throw new ApiException(409, 'Payments can only be recorded against issued invoices.'); }
            return ['invoice', $t];
        }
        if ($purchaseId !== null) {
            $t = Db::one('SELECT * FROM purchases WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $purchaseId, 'b' => $u['business_id']]);
            if (!$t || !Perm::customerVisible($u, (int)$t['customer_id'])) { throw new ApiException(404, 'Purchase not found.'); }
            if ($t['status'] !== 'recorded') { throw new ApiException(409, 'This purchase is cancelled.'); }
            if ($t['invoice_id'] !== null) { throw new ApiException(409, 'This purchase is linked to an invoice. Record the payment against the invoice instead.'); }
            return ['purchase', $t];
        }
        throw ApiException::validation(['invoiceId' => 'Choose an invoice or purchase.']);
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'create');
        $b = $r->body; $e = [];
        $invoiceId = Util::idOrNull($b['invoiceId'] ?? null); $purchaseId = Util::idOrNull($b['purchaseId'] ?? null);
        if (($invoiceId === null) === ($purchaseId === null)) { throw ApiException::validation(['invoiceId' => 'Choose an invoice or a purchase (not both).']); }
        $amountRaw = $b['amount'] ?? null;
        if (!is_numeric($amountRaw) || (float)$amountRaw <= 0 || (float)$amountRaw > 1000000000) { $e['amount'] = 'Enter an amount greater than zero.'; }
        $date = Util::str($b['date'] ?? '');
        if (!Util::isDate($date)) { $e['date'] = 'Payment date is required.'; }
        $method = Util::str($b['method'] ?? '');
        if (!in_array($method, self::METHODS, true)) { $e['method'] = 'Choose a payment method.'; }
        $txn = mb_substr(Util::str($b['transactionId'] ?? ''), 0, 100);
        $status = Util::str($b['status'] ?? '') === 'pending' ? 'pending' : 'completed';
        if ($e) { throw ApiException::validation($e); }
        $amount = round((float)$amountRaw, 2);

        $id = Db::tx(function () use ($u, $invoiceId, $purchaseId, $amount, $date, $method, $txn, $status, $b) {
            [$kind, $target] = self::lockTarget($u, $invoiceId, $purchaseId);
            $bal = self::balance($kind, $target);
            if ($amount > $bal + 0.001) { throw ApiException::validation(['amount' => 'Amount exceeds the remaining balance (' . number_format($bal, 2) . ').']); }
            if ($txn !== '' && Db::val("SELECT 1 FROM payments WHERE business_id = :b AND transaction_id = :t AND status IN ('pending','completed')", ['b' => $u['business_id'], 't' => $txn])) {
                throw ApiException::validation(['transactionId' => 'This transaction ID is already recorded.']);
            }
            $receipt = Biz::nextNumber((int)$u['business_id'], 'receipt', 'RCPT'); $now = Util::now();
            try {
                return Db::insert('INSERT INTO payments (business_id, customer_id, invoice_id, purchase_id, amount, payment_date, method, transaction_id, status, notes, receipt_no, recorded_by, created_at, updated_at) VALUES (:b, :c, :i, :p, :a, :d, :m, :t, :s, :n, :r, :u, :now, :now)', [
                    'b' => $u['business_id'], 'c' => $target['customer_id'], 'i' => $invoiceId, 'p' => $purchaseId, 'a' => $amount, 'd' => $date, 'm' => $method, 't' => $txn === '' ? null : $txn, 's' => $status, 'n' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000), 'r' => $receipt, 'u' => $u['id'], 'now' => $now,
                ]);
            } catch (\PDOException $ex) {
                if ($ex->getCode() === '23000') { throw ApiException::validation(['transactionId' => 'This transaction ID is already recorded.']); }
                throw $ex;
            } finally {
                Activity::log($u, 'create', 'payment', null, "Payment $receipt recorded (" . number_format($amount, 2) . ", $status)");
            }
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'edit');
        $x = self::find($u, $p['id']);
        Db::exec('UPDATE payments SET notes = :n, updated_at = :now WHERE id = :id AND business_id = :b', ['n' => mb_substr(Util::str($r->body['notes'] ?? ''), 0, 5000), 'now' => Util::now(), 'id' => $x['id'], 'b' => $u['business_id']]);
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'manage', 'You are not allowed to change payment status.');
        $x = self::find($u, $p['id']); $s = Util::str($r->body['status'] ?? '');
        if (!in_array($s, ['completed', 'failed'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::tx(function () use ($u, $x, $s) {
            [$kind, $target] = self::lockTarget($u, $x['invoice_id'] !== null ? (int)$x['invoice_id'] : null, $x['purchase_id'] !== null ? (int)$x['purchase_id'] : null);
            $row = Db::one('SELECT status, amount FROM payments WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $x['id'], 'b' => $u['business_id']]);
            if ($row['status'] !== 'pending') { throw new ApiException(409, 'Only pending payments can be confirmed or marked failed.'); }
            if ($s === 'completed' && (float)$row['amount'] > self::balance($kind, $target, (int)$x['id']) + 0.001) { throw new ApiException(409, 'Confirming this payment would exceed the remaining balance.'); }
            Db::exec('UPDATE payments SET status = :s, updated_at = :now WHERE id = :id', ['s' => $s, 'now' => Util::now(), 'id' => $x['id']]);
            Activity::log($u, 'status', 'payment', (int)$x['id'], "Payment {$x['receipt_no']} marked $s");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function void(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'manage', 'You are not allowed to void payments.');
        $x = self::find($u, $p['id']);
        $reason = mb_substr(Util::str($r->body['reason'] ?? ''), 0, 255);
        if ($reason === '') { throw ApiException::validation(['reason' => 'Please enter a reason.']); }
        Db::tx(function () use ($u, $x, $reason) {
            $row = Db::one('SELECT status FROM payments WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $x['id'], 'b' => $u['business_id']]);
            if (!in_array($row['status'], ['completed', 'pending'], true)) { throw new ApiException(409, 'This payment cannot be voided.'); }
            Db::exec("UPDATE payments SET status = 'voided', void_reason = :r, updated_at = :now WHERE id = :id", ['r' => $reason, 'now' => Util::now(), 'id' => $x['id']]);
            Activity::log($u, 'void', 'payment', (int)$x['id'], "Payment {$x['receipt_no']} voided: $reason");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function receipt(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'payments', 'view');
        $x = self::find($u, $p['id']);
        $doc = null;
        if ($x['invoice_id'] !== null) {
            $i = InvoicesController::find($u, (string)$x['invoice_id']);
            $doc = ['type' => 'Invoice', 'number' => $i['number'], 'total' => (float)$i['total'], 'paid' => (float)$i['paid'], 'balance' => (float)$i['balance']];
        } elseif ($x['purchase_id'] !== null) {
            $pu = PurchasesController::find($u, (string)$x['purchase_id']);
            $doc = ['type' => 'Purchase', 'number' => 'Purchase ' . $pu['date'], 'total' => (float)$pu['total'], 'paid' => (float)$pu['paid'], 'balance' => (float)$pu['balance']];
        }
        $cust = Db::one('SELECT id, name, phone, email, address FROM customers WHERE id = :id AND business_id = :b', ['id' => $x['customer_id'], 'b' => $u['business_id']]);
        return ['payment' => self::shape($x), 'customer' => $cust ? Util::shape($cust) : null, 'business' => Biz::shape(Biz::find((int)$u['business_id'])), 'document' => $doc];
    }
}
