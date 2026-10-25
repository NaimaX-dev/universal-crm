<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Docs, Lister, Money, Page, Perm, Request, Util};

final class InvoicesController
{
    /** SQL fragment: paid amount per invoice = sum of COMPLETED payments only. */
    public static function paidJoin(): string
    {
        return '(SELECT invoice_id, SUM(amount) AS paid FROM payments WHERE status = \'completed\' AND invoice_id IS NOT NULL AND business_id = :bid GROUP BY invoice_id)';
    }

    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer_ref', 'i');
        $sql = 'SELECT i.id, i.business_id, i.number, i.customer_id, i.quotation_id, i.subscription_id, i.invoice_date AS date, i.due_date, i.tax_rate, i.subtotal, i.discount_total, i.tax_total AS tax, i.total, i.notes, i.terms, i.created_at,
            i.status AS stored_status, COALESCE(p.paid, 0) AS paid, (i.total - COALESCE(p.paid, 0)) AS balance,
            CASE WHEN i.status <> \'issued\' THEN i.status WHEN COALESCE(p.paid, 0) >= i.total AND i.total > 0 THEN \'paid\' WHEN i.due_date < :today THEN \'overdue\' WHEN COALESCE(p.paid, 0) > 0 THEN \'partially_paid\' ELSE \'issued\' END AS status,
            c.name AS customer_name, c.phone AS customer_phone
            FROM invoices i JOIN customers c ON c.id = i.customer_id LEFT JOIN ' . self::paidJoin() . " p ON p.invoice_id = i.id
            WHERE i.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id'], 'today' => Util::today()], $sp)];
    }

    public static function shape(array $row): array { return Util::shape($row); }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :iid', ['iid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Invoice not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'invoices', 'view');
        [$inner, $params] = self::inner($u);
        $where = ''; $wp = [];
        if ($r->q('payable') === '1') { $where = " AND t.stored_status = 'issued' AND t.balance > 0"; }
        $page = Lister::run($inner, $params, $r, [
            'search' => ['number', 'customer_name', 'notes'], 'filters' => ['status' => 'status', 'customerId' => 'customer_id'],
            'sorts' => ['number' => 't.number', 'customerName' => 't.customer_name', 'date' => 't.date', 'dueDate' => 't.due_date', 'total' => 't.total', 'status' => 't.status'],
            'sort' => 'date', 'dir' => 'desc', 'date' => 'date', 'where' => $where, 'params' => $wp,
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'invoices', 'view');
        $i = self::find($u, $p['id']);
        $s = self::shape($i);
        $s['items'] = Docs::items('invoice', (int)$i['id']);
        $s['payments'] = [];
        if (Perm::can($u, 'payments', 'view')) {
            [$pi, $pp] = PaymentsController::inner($u);
            $s['payments'] = array_map([PaymentsController::class, 'shape'], Lister::all($pi, $pp, ' AND t.invoice_id = :iid', ['iid' => $i['id']], 't.date DESC, t.id DESC'));
        }
        $s['customer'] = Util::shape(Db::one('SELECT id, name, phone, email, address FROM customers WHERE id = :id AND business_id = :b', ['id' => $i['customer_id'], 'b' => $u['business_id']]) ?? []);
        $s['business'] = Biz::shape(Biz::find((int)$u['business_id']));
        return $s;
    }

    /** Inserts an invoice (+items). Must be called inside a transaction when combined with other writes. */
    public static function createCore(array $u, int $customerId, ?int $quotationId, ?int $subscriptionId, string $date, string $due, float $rate, string $notes, string $terms, array $calc, string $status): int
    {
        $number = Biz::nextNumber((int)$u['business_id'], 'invoice', 'INV');
        $now = Util::now();
        $id = Db::insert('INSERT INTO invoices (business_id, number, customer_id, quotation_id, subscription_id, invoice_date, due_date, status, tax_rate, subtotal, discount_total, tax_total, total, notes, terms, created_by, created_at, updated_at) VALUES (:b, :num, :c, :q, :s, :d, :du, :st, :tr, :sub, :dis, :tax, :tot, :no, :te, :cb, :now, :now)', [
            'b' => $u['business_id'], 'num' => $number, 'c' => $customerId, 'q' => $quotationId, 's' => $subscriptionId, 'd' => $date, 'du' => $due, 'st' => $status, 'tr' => $rate,
            'sub' => $calc['subtotal'], 'dis' => $calc['discountTotal'], 'tax' => $calc['tax'], 'tot' => $calc['total'], 'no' => $notes, 'te' => $terms, 'cb' => $u['id'], 'now' => $now,
        ]);
        Docs::saveItems('invoice', $id, $calc, (int)$u['business_id']);
        Activity::log($u, 'create', 'invoice', $id, "Invoice $number created" . ($status === 'issued' ? ' and issued' : ''));
        return $id;
    }

    private static function payload(array $u, array $b, ?array $existing): array
    {
        $e = [];
        $cid = $existing ? (int)$existing['customer_id'] : Util::idOrNull($b['customerId'] ?? null);
        if ($cid === null || !Perm::customerVisible($u, $cid)) { $e['customerId'] = 'Please select a customer.'; }
        $settings = Biz::settings(Biz::find((int)$u['business_id']));
        $date = Docs::date($b['date'] ?? '', Util::today(), 'date', $e);
        $due = Docs::date($b['dueDate'] ?? '', Util::addDays($date, (int)$settings['invoiceDueDays']), 'dueDate', $e);
        if (!isset($e['dueDate']) && $due < $date) { $e['dueDate'] = 'Due date cannot be before the invoice date.'; }
        $rate = array_key_exists('taxRate', $b) && $b['taxRate'] !== '' ? $b['taxRate'] : $settings['taxRate'];
        if ($e) { throw ApiException::validation($e); }
        return [['customer_id' => $cid, 'date' => $date, 'due' => $due, 'rate' => (float)$rate, 'notes' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000), 'terms' => mb_substr(Util::str($b['terms'] ?? ''), 0, 5000)], Money::compute($b['items'] ?? null, $rate)];
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'invoices', 'create');
        [$f, $calc] = self::payload($u, $r->body, null);
        $status = Util::str($r->body['status'] ?? '') === 'issued' ? 'issued' : 'draft';
        $id = Db::tx(fn() => self::createCore($u, $f['customer_id'], null, null, $f['date'], $f['due'], $f['rate'], $f['notes'], $f['terms'], $calc, $status));
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'invoices', 'edit');
        $i = self::find($u, $p['id']);
        [$f, $calc] = self::payload($u, $r->body, $i);
        Db::tx(function () use ($u, $i, $f, $calc) {
            // Lock the invoice so no payment can be recorded while the total changes.
            $row = Db::one('SELECT status FROM invoices WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $i['id'], 'b' => $u['business_id']]);
            $pay = (int)Db::val("SELECT COUNT(*) FROM payments WHERE invoice_id = :id AND status IN ('completed','pending')", ['id' => $i['id']]);
            if ($row['status'] === 'cancelled' || $pay > 0) { throw new ApiException(409, 'This invoice cannot be edited (it is cancelled or already has payments).'); }
            Db::exec('UPDATE invoices SET invoice_date = :d, due_date = :du, tax_rate = :tr, subtotal = :st, discount_total = :dt, tax_total = :tx, total = :tt, notes = :no, terms = :te, updated_at = :now WHERE id = :id AND business_id = :b', [
                'd' => $f['date'], 'du' => $f['due'], 'tr' => $f['rate'], 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'no' => $f['notes'], 'te' => $f['terms'], 'now' => Util::now(), 'id' => $i['id'], 'b' => $u['business_id'],
            ]);
            Docs::saveItems('invoice', (int)$i['id'], $calc, (int)$u['business_id']);
            Activity::log($u, 'update', 'invoice', (int)$i['id'], "Invoice {$i['number']} updated");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r);
        $s = Util::str($r->body['status'] ?? '');
        if ($s === 'issued') { Perm::need($u, 'invoices', 'edit'); }
        elseif ($s === 'cancelled') { Perm::need($u, 'invoices', 'manage', 'You are not allowed to cancel invoices.'); }
        else { throw ApiException::validation(['status' => 'Invalid status.']); }
        $i = self::find($u, $p['id']);
        Db::tx(function () use ($u, $i, $s) {
            $row = Db::one('SELECT status FROM invoices WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $i['id'], 'b' => $u['business_id']]);
            if ($s === 'issued') {
                if ($row['status'] !== 'draft') { throw new ApiException(409, 'Only draft invoices can be issued.'); }
            } else {
                if ($row['status'] === 'cancelled') { throw new ApiException(409, 'This invoice is already cancelled.'); }
                if ((int)Db::val("SELECT COUNT(*) FROM payments WHERE invoice_id = :id AND status IN ('completed','pending')", ['id' => $i['id']]) > 0) {
                    throw new ApiException(409, 'This invoice has completed or pending payments. Void them first, then cancel the invoice.');
                }
            }
            Db::exec('UPDATE invoices SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $s, 'now' => Util::now(), 'id' => $i['id'], 'b' => $u['business_id']]);
            Activity::log($u, 'status', 'invoice', (int)$i['id'], "Invoice {$i['number']} $s");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function delete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'invoices', 'delete');
        $i = self::find($u, $p['id']);
        if ($i['stored_status'] !== 'draft') { throw new ApiException(409, 'Only draft invoices can be deleted. Cancel issued invoices instead.'); }
        Db::exec('DELETE FROM invoices WHERE id = :id AND business_id = :b', ['id' => $i['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'invoice', (int)$i['id'], "Invoice {$i['number']} deleted");
        return ['ok' => true];
    }
}
