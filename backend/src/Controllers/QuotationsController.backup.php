<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Docs, Lister, Money, Page, Perm, Request, Util};

final class QuotationsController
{
    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer_ref', 'q');
        $sql = "SELECT q.id, q.business_id, q.quote_number, q.customer_id, q.lead_id, q.quote_date AS date, q.expiry_date, q.tax_rate, q.subtotal, q.discount_total, q.tax_total AS tax, q.total, q.notes, q.terms, q.invoice_id, q.created_at, q.status AS stored_status,
            CASE WHEN q.status = 'sent' AND q.expiry_date < :today THEN 'expired' ELSE q.status END AS status,
            c.name AS customer_name, c.phone AS customer_phone, i.number AS invoice_number, cu.name AS created_by_name
            FROM quotations q JOIN customers c ON c.id = q.customer_id LEFT JOIN invoices i ON i.id = q.invoice_id LEFT JOIN users cu ON cu.id = q.created_by
            WHERE q.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id'], 'today' => Util::today()], $sp)];
    }

    public static function shape(array $row): array { return Util::shape($row); }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :qid', ['qid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Quotation not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'view');
        [$inner, $params] = self::inner($u);
        $page = Lister::run($inner, $params, $r, [
            'search' => ['quote_number', 'customer_name', 'notes'], 'filters' => ['status' => 'status', 'customerId' => 'customer_id'],
           'sorts' => ['number' => 't.quote_number', 'customerName' => 't.customer_name', 'date' => 't.date', 'expiryDate' => 't.expiry_date', 'total' => 't.total', 'status' => 't.status'],
            'sort' => 'date', 'dir' => 'desc', 'date' => 'date',
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'view');
        $q = self::find($u, $p['id']);
        $s = self::shape($q);
        $s['items'] = Docs::items('quotation', (int)$q['id']);
        $s['customer'] = Util::shape(Db::one('SELECT id, name, phone, email, address FROM customers WHERE id = :id AND business_id = :b', ['id' => $q['customer_id'], 'b' => $u['business_id']]) ?? []);
        $s['business'] = Biz::shape(Biz::find((int)$u['business_id']));
        return $s;
    }

    /** Validates the common document payload. Returns [fields, moneyCalc]. */
    private static function payload(array $u, array $b, ?array $existing): array
    {
        $e = [];
        $cid = $existing ? (int)$existing['customer_id'] : Util::idOrNull($b['customerId'] ?? null);
        if ($cid === null || !Perm::customerVisible($u, $cid)) { $e['customerId'] = 'Please select a customer.'; }
        $lid = Util::idOrNull($b['leadId'] ?? null);
        if ($lid !== null && !Db::val('SELECT 1 FROM leads WHERE id = :id AND business_id = :b', ['id' => $lid, 'b' => $u['business_id']])) { $lid = null; }
        $settings = Biz::settings(Biz::find((int)$u['business_id']));
        $date = Docs::date($b['date'] ?? '', Util::today(), 'date', $e);
        $expiry = Docs::date($b['expiryDate'] ?? '', Util::addDays($date, (int)$settings['quotationValidityDays']), 'expiryDate', $e);
        if (!isset($e['expiryDate']) && $expiry < $date) { $e['expiryDate'] = 'Expiry date cannot be before the quotation date.'; }
        $rate = array_key_exists('taxRate', $b) && $b['taxRate'] !== '' ? $b['taxRate'] : $settings['taxRate'];
        if ($e) { throw ApiException::validation($e); }
        $calc = Money::compute($b['items'] ?? null, $rate);
        return [['customer_id' => $cid, 'lead_id' => $lid, 'date' => $date, 'expiry' => $expiry, 'rate' => (float)$rate, 'notes' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000), 'terms' => mb_substr(Util::str($b['terms'] ?? ''), 0, 5000)], $calc];
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'create');
        [$f, $calc] = self::payload($u, $r->body, null);
        $status = Util::str($r->body['status'] ?? '') === 'sent' ? 'sent' : 'draft';
        $id = Db::tx(function () use ($u, $f, $calc, $status) {
            $number = Biz::nextNumber((int)$u['business_id'], 'quotation', 'QT');
            $now = Util::now();
            $id = Db::insert('INSERT INTO quotations (business_id, quote_number, customer_id, lead_id, quote_date, expiry_date, status, tax_rate, subtotal, discount_total, tax_total, total, notes, terms, created_by, created_at, updated_at) VALUES (:b, :num, :c, :l, :d, :x, :s, :tr, :st, :dt, :tx, :tt, :no, :te, :cb, :now, :now)', [
                'b' => $u['business_id'], 'num' => $number, 'c' => $f['customer_id'], 'l' => $f['lead_id'], 'd' => $f['date'], 'x' => $f['expiry'], 's' => $status, 'tr' => $f['rate'], 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'no' => $f['notes'], 'te' => $f['terms'], 'cb' => $u['id'], 'now' => $now,
            ]);
            Docs::saveItems('quotation', $id, $calc, (int)$u['business_id']);
            Activity::log($u, 'create', 'quotation', $id, "Quotation $number created");
            return $id;
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'edit');
        $q = self::find($u, $p['id']);
        if ($q['invoice_id'] !== null) { throw new ApiException(409, 'This quotation was converted to an invoice and can no longer be edited.'); }
        if (!in_array($q['stored_status'], ['draft', 'sent'], true)) { throw new ApiException(409, 'Only draft or sent quotations can be edited.'); }
        [$f, $calc] = self::payload($u, $r->body, $q);
        Db::tx(function () use ($u, $q, $f, $calc) {
            Db::exec('UPDATE quotations SET quote_date = :d, expiry_date = :x, tax_rate = :tr, subtotal = :st, discount_total = :dt, tax_total = :tx, total = :tt, notes = :no, terms = :te, updated_at = :now WHERE id = :id AND business_id = :b', [
                'd' => $f['date'], 'x' => $f['expiry'], 'tr' => $f['rate'], 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'no' => $f['notes'], 'te' => $f['terms'], 'now' => Util::now(), 'id' => $q['id'], 'b' => $u['business_id'],
            ]);
            Docs::saveItems('quotation', (int)$q['id'], $calc, (int)$u['business_id']);
            Activity::log($u, 'update', 'quotation', (int)$q['id'], "Quotation {$q['number']} updated");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'edit');
        $q = self::find($u, $p['id']);
        $s = Util::str($r->body['status'] ?? '');
        if (!in_array($s, ['draft', 'sent', 'accepted', 'rejected'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        if ($q['invoice_id'] !== null) { throw new ApiException(409, 'This quotation was already converted to an invoice.'); }
        Db::exec('UPDATE quotations SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $s, 'now' => Util::now(), 'id' => $q['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'status', 'quotation', (int)$q['id'], "Quotation {$q['number']} marked $s");
        return self::shape(self::find($u, $p['id']));
    }

    /** Creates an issued invoice from an accepted quotation. The quotation is kept and linked to the invoice. */
    public static function convert(Request $r, array $p): array
    {
        $u = Auth::require($r);
        Perm::need($u, 'quotations', 'manage', 'You are not allowed to convert quotations.');
        Perm::need($u, 'invoices', 'create', 'You are not allowed to create invoices.');
        $q0 = self::find($u, $p['id']);
        $invoiceId = Db::tx(function () use ($u, $q0, $r) {
            $q = Db::one('SELECT * FROM quotations WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $q0['id'], 'b' => $u['business_id']]);
            if ($q['invoice_id'] !== null) { throw new ApiException(409, 'This quotation was already converted.'); }
            if ($q['status'] !== 'accepted') { throw new ApiException(409, 'Only accepted quotations can be converted to an invoice.'); }
            $settings = Biz::settings(Biz::find((int)$u['business_id']));
            $date = Util::today();
            $due = Util::str($r->body['dueDate'] ?? '') ?: Util::addDays($date, (int)$settings['invoiceDueDays']);
            if (!Util::isDate($due) || $due < $date) { throw ApiException::validation(['dueDate' => 'Choose a valid due date (today or later).']); }
            $calc = Money::compute(Docs::itemsForCopy('quotation', (int)$q['id']), $q['tax_rate']);
            $iid = InvoicesController::createCore($u, (int)$q['customer_id'], (int)$q['id'], null, $date, $due, (float)$q['tax_rate'], (string)$q['notes'], (string)$q['terms'], $calc, 'issued');
            Db::exec('UPDATE quotations SET invoice_id = :i, updated_at = :now WHERE id = :id', ['i' => $iid, 'now' => Util::now(), 'id' => $q['id']]);
            Activity::log($u, 'convert', 'quotation', (int)$q['id'], "Quotation {$q['number']} converted to an invoice");
            return $iid;
        });
        return ['invoice' => InvoicesController::shape(InvoicesController::find($u, (string)$invoiceId)), 'quotation' => self::shape(self::find($u, $p['id']))];
    }

    public static function delete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'quotations', 'delete');
        $q = self::find($u, $p['id']);
        if ($q['stored_status'] !== 'draft' || $q['invoice_id'] !== null) { throw new ApiException(409, 'Only draft quotations can be deleted.'); }
        Db::exec('DELETE FROM quotations WHERE id = :id AND business_id = :b', ['id' => $q['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'quotation', (int)$q['id'], "Quotation {$q['number']} deleted");
        return ['ok' => true];
    }
}
