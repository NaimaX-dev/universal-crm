<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Lister, Page, Perm, Request, Util};

final class CustomersController
{
    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer', 'c');
        return ["SELECT c.*, au.name AS assigned_name, (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id) AS lead_count FROM customers c LEFT JOIN users au ON au.id = c.assigned_to WHERE c.business_id = :bid$sc", array_merge(['bid' => $u['business_id']], $sp)];
    }

    public static function shape(array $row): array
    {
        $s = Util::shape($row, ['phone_normalized', 'created_by', 'updated_at']);
        $s['leadCount'] = (int)($row['lead_count'] ?? 0);
        return $s;
    }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :cid', ['cid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Customer not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'view');
        [$inner, $params] = self::inner($u);
        $page = Lister::run($inner, $params, $r, [
            'search' => ['name', 'phone', 'email', 'company', 'address'], 'filters' => ['status' => 'status', 'assignedTo' => 'assigned_to'],
            'sorts' => ['name' => 't.name', 'assignedName' => 't.assigned_name', 'leadCount' => 't.lead_count', 'status' => 't.status', 'createdAt' => 't.created_at'], 'sort' => 'name',
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'view');
        return self::shape(self::find($u, $p['id']));
    }

    public static function findDuplicate(array $u, string $phone, string $email, int $excludeId = 0): ?array
    {
        $pn = Util::phoneNorm($phone); $em = strtolower($email);
        if ($pn === '' && $em === '') { return null; }
        return Db::one('SELECT id, name, phone, email FROM customers WHERE business_id = :b AND id <> :x AND ((:pn <> \'\' AND phone_normalized = :pn) OR (:em <> \'\' AND LOWER(email) = :em)) LIMIT 1', ['b' => $u['business_id'], 'x' => $excludeId, 'pn' => $pn, 'em' => $em]);
    }

    public static function checkDuplicate(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'view');
        $d = self::findDuplicate($u, $r->q('phone'), $r->q('email'), (int)$r->q('excludeId', '0'));
        return ['customer' => $d ? ['id' => (string)$d['id'], 'name' => $d['name'], 'phone' => $d['phone'], 'email' => $d['email']] : null];
    }

    /** @return array validated + cleaned field values */
    private static function clean(array $u, array $b, bool $creating, ?array $existing): array
    {
        $e = [];
        $name = Util::str($b['name'] ?? ''); $phone = Util::str($b['phone'] ?? ''); $email = Util::str($b['email'] ?? '');
        $cnic = Util::str($b['cnic'] ?? '');

       if ($cnic !== '' && !preg_match('/^\d{5}-?\d{7}-?\d{1}$/', $cnic)) {
    $e['cnic'] = 'Enter a valid CNIC number.';
        }
        if ($name === '' || mb_strlen($name) > 150) { $e['name'] = 'Name is required.'; }
        if ($phone === '' || strlen($phone) > 40) { $e['phone'] = 'Phone is required.'; }
        if ($email !== '' && !Util::isEmail($email)) { $e['email'] = 'Enter a valid email address.'; }
        $free = Perm::isAdmin($u) || $u['scope'] === 'all';
        $assigned = $existing ? (int)($existing['assigned_to'] ?? 0) : (int)$u['id'];
        $req = Util::idOrNull($b['assignedTo'] ?? null);
        if ($req !== null && $req !== $assigned) {
            if (!$free) { if (!$creating) { throw new ApiException(403, 'You are not allowed to reassign customers.'); } }
            else {
                if (!Db::val("SELECT 1 FROM users WHERE id = :id AND business_id = :b AND status = 'active'", ['id' => $req, 'b' => $u['business_id']])) { $e['assignedTo'] = 'Selected user was not found in your business.'; }
                else { $assigned = $req; }
            }
        }
        if ($e) { throw ApiException::validation($e); }
        return ['name' => $name, 'phone' => $phone, 'email' => $email,   'cnic' => $cnic, 'company' => mb_substr(Util::str($b['company'] ?? ''), 0, 150), 'address' => mb_substr(Util::str($b['address'] ?? ''), 0, 255),
            'notes' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000), 'details' => mb_substr(Util::str($b['details'] ?? ''), 0, 5000), 'assigned' => $assigned ?: null];
    }

    /** Creates a customer (used by this controller and when a lead is created with a new customer). Returns new id. */
    public static function createCore(array $u, array $b, bool $allowDuplicate): int
    {
        $v = self::clean($u, $b, true, null);
        if (!$allowDuplicate && ($d = self::findDuplicate($u, $v['phone'], $v['email']))) {
            throw new ApiException(409, "A customer with the same phone or email already exists: {$d['name']}.", null, 'DUPLICATE', ['customer' => ['id' => (string)$d['id'], 'name' => $d['name'], 'phone' => $d['phone'], 'email' => $d['email']]]);
        }
        $now = Util::now();
        
$id = Db::insert(
    'INSERT INTO customers (business_id, name, phone, phone_normalized, email, cnic, company, address, notes, details, status, assigned_to, created_by, created_at, updated_at)
    VALUES (:b, :n, :p, :pn, :e, :cnic, :co, :a, :no, :de, \'active\', :as, :cb, :now, :now)',
    [
        'b' => $u['business_id'],
        'n' => $v['name'],
        'p' => $v['phone'],
        'pn' => Util::phoneNorm($v['phone']),
        'e' => $v['email'],
        'cnic' => $v['cnic'],
        'co' => $v['company'],
        'a' => $v['address'],
        'no' => $v['notes'],
        'de' => $v['details'],
        'as' => $v['assigned'],
        'cb' => $u['id'],
        'now' => $now,
    ]
);

        Activity::log($u, 'create', 'customer', $id, "Customer \"{$v['name']}\" created");
        return $id;
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'create');
        $id = self::createCore($u, $r->body, !empty($r->body['allowDuplicate']));
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'edit');
        $c = self::find($u, $p['id']);
        $v = self::clean($u, $r->body, false, $c);
        Db::exec(
    'UPDATE customers SET name = :n, phone = :p, phone_normalized = :pn, email = :e, cnic = :cnic, company = :co, address = :a, notes = :no, details = :de, assigned_to = :as, updated_at = :now WHERE id = :id AND business_id = :b',
    [
        'n' => $v['name'],
        'p' => $v['phone'],
        'pn' => Util::phoneNorm($v['phone']),
        'e' => $v['email'],
        'cnic' => $v['cnic'],
        'co' => $v['company'],
        'a' => $v['address'],
        'no' => $v['notes'],
        'de' => $v['details'],
        'as' => $v['assigned'],
        'now' => Util::now(),
        'id' => $c['id'],
        'b' => $u['business_id'],
    ]
);
        Activity::log($u, 'update', 'customer', (int)$c['id'], "Customer \"{$v['name']}\" updated");
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'delete', 'You are not allowed to deactivate customers.');
        $c = self::find($u, $p['id']);
        $s = Util::str($r->body['status'] ?? '');
        if (!in_array($s, ['active', 'inactive'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::exec('UPDATE customers SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $s, 'now' => Util::now(), 'id' => $c['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'status', 'customer', (int)$c['id'], "Customer \"{$c['name']}\" " . ($s === 'active' ? 'activated' : 'deactivated'));
        return self::shape(self::find($u, $p['id']));
    }

    public static function delete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'delete');
        $c = self::find($u, $p['id']); $id = (int)$c['id'];
        $deps = [];
        foreach (['leads' => 'leads', 'follow-ups' => 'follow_ups', 'quotations' => 'quotations', 'invoices' => 'invoices', 'purchases' => 'purchases', 'payments' => 'payments', 'subscriptions' => 'subscriptions'] as $label => $tbl) {
            $n = (int)Db::val("SELECT COUNT(*) FROM $tbl WHERE customer_id = :id AND business_id = :b", ['id' => $id, 'b' => $u['business_id']]);
            if ($n > 0) { $deps[] = "$n $label"; }
        }
        if ($deps) { throw new ApiException(409, 'This customer has linked records (' . implode(', ', $deps) . ') and cannot be deleted. Deactivate the customer instead.', null, 'HAS_RECORDS'); }
        Db::exec('DELETE FROM customers WHERE id = :id AND business_id = :b', ['id' => $id, 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'customer', $id, "Customer \"{$c['name']}\" deleted");
        return ['ok' => true];
    }

    /** One customer with all related records the user is allowed to see. */
    public static function overview(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'customers', 'view');
        $c = self::find($u, $p['id']); $cid = (int)$c['id'];
        $w = ' AND t.customer_id = :cid'; $wp = ['cid' => $cid];
        $pick = function (string $module, callable $inner, callable $shape, string $order) use ($u, $w, $wp) {
            if (!Perm::can($u, $module, 'view')) { return null; }
            [$sql, $params] = $inner($u);
            return array_map($shape, Lister::all($sql, $params, $w, $wp, $order));
        };
        $leads = $pick('leads', [LeadsController::class, 'inner'], [LeadsController::class, 'shape'], 't.inquiry_date DESC, t.id DESC');
        $fus = $pick('followUps', [FollowUpsController::class, 'inner'], [FollowUpsController::class, 'shape'], 't.due_at DESC');
        $quotes = $pick('quotations', [QuotationsController::class, 'inner'], [QuotationsController::class, 'shape'], 't.id DESC');
        $invs = $pick('invoices', [InvoicesController::class, 'inner'], [InvoicesController::class, 'shape'], 't.id DESC');
        $purs = $pick('purchases', [PurchasesController::class, 'inner'], [PurchasesController::class, 'shape'], 't.id DESC');
        $pays = $pick('payments', [PaymentsController::class, 'inner'], [PaymentsController::class, 'shape'], 't.id DESC');
        $subs = $pick('subscriptions', [SubscriptionsController::class, 'inner'], [SubscriptionsController::class, 'shape'], 't.id DESC');

        $hist = [];
        if ($leads !== null && $leads) {
            $ids = array_map(fn($l) => (int)$l['id'], $leads);
            $in = implode(',', $ids);
            foreach (Db::all("SELECT h.text, h.created_at, x.name FROM lead_history h LEFT JOIN users x ON x.id = h.user_id WHERE h.lead_id IN ($in) AND h.business_id = :b", ['b' => $u['business_id']]) as $h) {
                $hist[] = ['at' => str_replace(' ', 'T', $h['created_at']), 'kind' => 'Lead', 'text' => $h['text'] . ($h['name'] ? " ({$h['name']})" : '')];
            }
        }
        foreach ($fus ?? [] as $f) { $hist[] = ['at' => $f['completedAt'] ?: $f['dueAt'], 'kind' => 'Follow-up', 'text' => ($f['status'] === 'completed' ? 'Completed: ' . ($f['outcome'] ?: $f['notes']) : $f['status'] . ': ' . $f['notes'])]; }
        foreach ($quotes ?? [] as $q) { $hist[] = ['at' => $q['createdAt'], 'kind' => 'Quotation', 'text' => "{$q['number']} ({$q['status']})"]; }
        foreach ($invs ?? [] as $i) { $hist[] = ['at' => $i['createdAt'], 'kind' => 'Invoice', 'text' => "{$i['number']} ({$i['status']})"]; }
        foreach ($pays ?? [] as $x) { $hist[] = ['at' => $x['createdAt'], 'kind' => 'Payment', 'text' => "{$x['receiptNo']}: {$x['amount']} ({$x['status']})"]; }
        usort($hist, fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']));

        return ['customer' => self::shape($c), 'leads' => $leads, 'followUps' => $fus, 'quotations' => $quotes, 'invoices' => $invs, 'purchases' => $purs, 'payments' => $pays, 'subscriptions' => $subs, 'history' => array_slice($hist, 0, 60)];
    }
}
