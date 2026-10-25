<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Docs, Lister, Money, Page, Perm, Request, Util};

final class PurchasesController
{
    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer_ref', 'pu');
        $sql = 'SELECT pu.id, pu.business_id, pu.customer_id, pu.lead_id, pu.quotation_id, pu.invoice_id, pu.purchase_date AS date, pu.notes, pu.subtotal, pu.discount_total, pu.tax_total AS tax, pu.total, pu.created_at, pu.status AS stored_status,
            (CASE WHEN pu.invoice_id IS NOT NULL THEN COALESCE(ip.paid, 0) ELSE COALESCE(pp.paid, 0) END) AS paid,
            (pu.total - (CASE WHEN pu.invoice_id IS NOT NULL THEN COALESCE(ip.paid, 0) ELSE COALESCE(pp.paid, 0) END)) AS balance,
            pu.status AS status,
            CASE WHEN pu.status = \'cancelled\' THEN \'cancelled\' WHEN pu.total > 0 AND (CASE WHEN pu.invoice_id IS NOT NULL THEN COALESCE(ip.paid, 0) ELSE COALESCE(pp.paid, 0) END) >= pu.total THEN \'paid\' WHEN (CASE WHEN pu.invoice_id IS NOT NULL THEN COALESCE(ip.paid, 0) ELSE COALESCE(pp.paid, 0) END) > 0 THEN \'partial\' ELSE \'unpaid\' END AS payment_status,
            c.name AS customer_name, (SELECT GROUP_CONCAT(pi.description ORDER BY pi.line_no SEPARATOR \', \') FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS item_summary
            FROM purchases pu JOIN customers c ON c.id = pu.customer_id
            LEFT JOIN (SELECT purchase_id, SUM(amount) AS paid FROM payments WHERE status = \'completed\' AND purchase_id IS NOT NULL AND business_id = :bid GROUP BY purchase_id) pp ON pp.purchase_id = pu.id
            LEFT JOIN ' . InvoicesController::paidJoin() . " ip ON ip.invoice_id = pu.invoice_id
            WHERE pu.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id']], $sp)];
    }

    public static function shape(array $row): array { return Util::shape($row); }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :pid', ['pid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Purchase not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'purchases', 'view');
        [$inner, $params] = self::inner($u);
        $where = $r->q('payable') === '1' ? " AND t.stored_status = 'recorded' AND t.balance > 0 AND t.invoice_id IS NULL" : '';
        $page = Lister::run($inner, $params, $r, [
            'search' => ['customer_name', 'item_summary', 'notes'], 'filters' => ['status' => 'stored_status', 'customerId' => 'customer_id', 'paymentStatus' => 'payment_status'],
            'sorts' => ['date' => 't.date', 'customerName' => 't.customer_name', 'total' => 't.total'], 'sort' => 'date', 'dir' => 'desc', 'date' => 'date', 'where' => $where,
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'purchases', 'view');
        $x = self::find($u, $p['id']);
        $s = self::shape($x);
        $s['items'] = Docs::items('purchase', (int)$x['id']);
        $s['payments'] = [];
        if (Perm::can($u, 'payments', 'view')) {
            [$pi, $pp] = PaymentsController::inner($u);
            $s['payments'] = array_map([PaymentsController::class, 'shape'], Lister::all($pi, $pp, ' AND t.purchase_id = :pid', ['pid' => $x['id']], 't.date DESC'));
        }
        return $s;
    }

    private static function payload(array $u, array $b, ?array $existing): array
    {
        $e = [];
        $cid = $existing ? (int)$existing['customer_id'] : Util::idOrNull($b['customerId'] ?? null);
        if ($cid === null || !Perm::customerVisible($u, $cid)) { $e['customerId'] = 'Please select a customer.'; }
        $date = Docs::date($b['date'] ?? '', Util::today(), 'date', $e);
        $links = [];
        foreach (['leadId' => ['leads', 'lead_id'], 'quotationId' => ['quotations', 'quotation_id'], 'invoiceId' => ['invoices', 'invoice_id']] as $k => [$tbl, $col]) {
            $v = Util::idOrNull($b[$k] ?? null); $links[$col] = null;
            if ($v !== null) { if (!Db::val("SELECT 1 FROM $tbl WHERE id = :id AND business_id = :b", ['id' => $v, 'b' => $u['business_id']])) { $e[$k] = 'Linked record not found.'; } else { $links[$col] = $v; } }
        }
        if ($e) { throw ApiException::validation($e); }
        return [['customer_id' => $cid, 'date' => $date, 'notes' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000)] + $links, Money::compute($b['items'] ?? null, 0)];
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'purchases', 'create');
        [$f, $calc] = self::payload($u, $r->body, null);
        $id = Db::tx(function () use ($u, $f, $calc) {
            $now = Util::now();
            $id = Db::insert('INSERT INTO purchases (business_id, customer_id, lead_id, quotation_id, invoice_id, purchase_date, status, notes, subtotal, discount_total, tax_total, total, created_by, created_at, updated_at) VALUES (:b, :c, :l, :q, :i, :d, \'recorded\', :no, :st, :dt, :tx, :tt, :cb, :now, :now)', [
                'b' => $u['business_id'], 'c' => $f['customer_id'], 'l' => $f['lead_id'], 'q' => $f['quotation_id'], 'i' => $f['invoice_id'], 'd' => $f['date'], 'no' => $f['notes'], 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'cb' => $u['id'], 'now' => $now,
            ]);
            Docs::saveItems('purchase', $id, $calc, (int)$u['business_id']);
            Activity::log($u, 'create', 'purchase', $id, 'Purchase recorded (total ' . number_format($calc['total'], 2) . ')');
            return $id;
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'purchases', 'edit');
        $x = self::find($u, $p['id']);
        [$f, $calc] = self::payload($u, $r->body, $x);
        Db::tx(function () use ($u, $x, $f, $calc) {
            $row = Db::one('SELECT status FROM purchases WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $x['id'], 'b' => $u['business_id']]);
            if ($row['status'] === 'cancelled') { throw new ApiException(409, 'Cancelled purchases cannot be edited.'); }
            if ((int)Db::val("SELECT COUNT(*) FROM payments WHERE purchase_id = :id AND status IN ('completed','pending')", ['id' => $x['id']]) > 0) { throw new ApiException(409, 'This purchase already has payments and cannot be edited.'); }
            Db::exec('UPDATE purchases SET purchase_date = :d, notes = :no, subtotal = :st, discount_total = :dt, tax_total = :tx, total = :tt, updated_at = :now WHERE id = :id AND business_id = :b', ['d' => $f['date'], 'no' => $f['notes'], 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'now' => Util::now(), 'id' => $x['id'], 'b' => $u['business_id']]);
            Docs::saveItems('purchase', (int)$x['id'], $calc, (int)$u['business_id']);
            Activity::log($u, 'update', 'purchase', (int)$x['id'], 'Purchase updated');
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'purchases', 'delete', 'You are not allowed to cancel purchases.');
        $x = self::find($u, $p['id']); $s = Util::str($r->body['status'] ?? '');
        if (!in_array($s, ['recorded', 'cancelled'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::tx(function () use ($u, $x, $s) {
            Db::one('SELECT id FROM purchases WHERE id = :id FOR UPDATE', ['id' => $x['id']]);
            if ($s === 'cancelled' && (int)Db::val("SELECT COUNT(*) FROM payments WHERE purchase_id = :id AND status IN ('completed','pending')", ['id' => $x['id']]) > 0) { throw new ApiException(409, 'This purchase has payments. Void them first.'); }
            Db::exec('UPDATE purchases SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $s, 'now' => Util::now(), 'id' => $x['id'], 'b' => $u['business_id']]);
            Activity::log($u, 'status', 'purchase', (int)$x['id'], "Purchase $s");
        });
        return self::shape(self::find($u, $p['id']));
    }
}
