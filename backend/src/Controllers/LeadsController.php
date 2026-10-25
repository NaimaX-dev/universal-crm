<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Lister, Page, Perm, Request, Util};

final class LeadsController
{
    private const SOURCES = ['facebook', 'instagram', 'whatsapp', 'phone', 'website', 'walk-in', 'referral', 'other'];
    private const STATUSES = ['new', 'contacted', 'follow_up', 'interested', 'converted', 'lost'];
    private const PRIORITIES = ['low', 'medium', 'high'];

    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'lead', 'l');
        return ["SELECT l.*, c.name AS customer_name, c.phone AS customer_phone, au.name AS assigned_name, (SELECT COUNT(*) FROM follow_ups f WHERE f.lead_id = l.id) AS follow_up_count FROM leads l JOIN customers c ON c.id = l.customer_id LEFT JOIN users au ON au.id = l.assigned_to WHERE l.business_id = :bid$sc", array_merge(['bid' => $u['business_id']], $sp)];
    }

    public static function shape(array $row): array
    {
        $s = Util::shape($row, ['created_by', 'updated_at']);
        $s['followUpCount'] = (int)($row['follow_up_count'] ?? 0);
        return $s;
    }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :lid', ['lid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Lead not found.'); }
        return $rows[0];
    }

    public static function history(int $leadId, int $bid): array
    {
        $rows = Db::all('SELECT h.text, h.created_at, h.user_id, x.name FROM lead_history h LEFT JOIN users x ON x.id = h.user_id WHERE h.lead_id = :l AND h.business_id = :b ORDER BY h.id', ['l' => $leadId, 'b' => $bid]);
        return array_map(fn($h) => ['at' => str_replace(' ', 'T', $h['created_at']), 'by' => (string)($h['user_id'] ?? ''), 'byName' => $h['name'] ?? '', 'text' => $h['text']], $rows);
    }

    public static function addHistory(array $u, int $leadId, string $text): void
    {
        Db::exec('INSERT INTO lead_history (business_id, lead_id, user_id, text, created_at) VALUES (:b, :l, :u, :t, :now)', ['b' => $u['business_id'], 'l' => $leadId, 'u' => $u['id'], 't' => mb_substr($text, 0, 500), 'now' => Util::now()]);
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'view');
        [$inner, $params] = self::inner($u);
        $page = Lister::run($inner, $params, $r, [
            'search' => ['customer_name', 'requirements', 'notes'], 'filters' => ['status' => 'status', 'source' => 'source', 'priority' => 'priority', 'assignedTo' => 'assigned_to', 'customerId' => 'customer_id'],
            'sorts' => ['customerName' => 't.customer_name', 'source' => 't.source', 'status' => 't.status', 'priority' => 't.priority', 'assignedName' => 't.assigned_name', 'nextFollowUp' => 't.next_follow_up', 'inquiryDate' => 't.inquiry_date'],
            'sort' => 'inquiryDate', 'dir' => 'desc', 'date' => 'inquiry_date',
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'view');
        $l = self::find($u, $p['id']);
        $s = self::shape($l);
        $s['history'] = self::history((int)$l['id'], (int)$u['business_id']);
        return $s;
    }

    private static function fields(array $u, array $b, bool $creating, ?array $existing): array
    {
        $e = []; $out = [];
        if ($creating || array_key_exists('source', $b)) { $src = Util::str($b['source'] ?? ''); if (!in_array($src, self::SOURCES, true)) { $e['source'] = 'Choose an inquiry source.'; } else { $out['source'] = $src; } }
        if (array_key_exists('priority', $b) || $creating) { $pr = Util::str($b['priority'] ?? 'medium') ?: 'medium'; if (!in_array($pr, self::PRIORITIES, true)) { $e['priority'] = 'Choose a priority.'; } else { $out['priority'] = $pr; } }
        if ($creating || array_key_exists('inquiryDate', $b)) { $d = Util::str($b['inquiryDate'] ?? '') ?: Util::today(); if (!Util::isDate($d)) { $e['inquiryDate'] = 'Enter a valid date.'; } else { $out['inquiry_date'] = $d; } }
        if (array_key_exists('nextFollowUp', $b)) { $d = Util::str($b['nextFollowUp']); if ($d !== '' && !Util::isDate($d)) { $e['nextFollowUp'] = 'Enter a valid date.'; } else { $out['next_follow_up'] = $d === '' ? null : $d; } }
        foreach (['requirements', 'notes'] as $k) { if (array_key_exists($k, $b)) { $out[$k] = mb_substr(Util::str($b[$k]), 0, 5000); } }
        $cur = $existing ? (int)($existing['assigned_to'] ?? 0) : (int)$u['id'];
        $req = Util::idOrNull($b['assignedTo'] ?? null);
        $out['assigned_to'] = $cur ?: null;
        if ($req !== null && $req !== $cur) {
            if ($req !== (int)$u['id']) { Perm::need($u, 'leads', 'manage', 'You are not allowed to assign leads to other Agents.'); }
            if (!Db::val("SELECT 1 FROM users WHERE id = :id AND business_id = :b AND status = 'active'", ['id' => $req, 'b' => $u['business_id']])) { $e['assignedTo'] = 'Selected user was not found in your business.'; }
            else { $out['assigned_to'] = $req; }
        }
        if ($e) { throw ApiException::validation($e); }
        return $out;
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'create');
        $b = $r->body;
        $f = self::fields($u, $b, true, null);
        $id = Db::tx(function () use ($u, $b, $f) {
            $cid = Util::idOrNull($b['customerId'] ?? null);
            if ($cid === null) {
                if (!is_array($b['newCustomer'] ?? null)) { throw ApiException::validation(['customerId' => 'Please select a customer.']); }
                Perm::need($u, 'customers', 'create', 'You are not allowed to create customers.');
                $cid = CustomersController::createCore($u, $b['newCustomer'], !empty($b['allowDuplicate']));
            } elseif (!Perm::customerVisible($u, $cid)) { throw ApiException::validation(['customerId' => 'Customer not found.']); }
            $now = Util::now();
            $lid = Db::insert('INSERT INTO leads (business_id, customer_id, source, status, priority, assigned_to, inquiry_date, requirements, notes, next_follow_up, created_by, created_at, updated_at) VALUES (:b, :c, :src, \'new\', :pr, :as, :idt, :rq, :no, :nf, :cb, :now, :now)', [
                'b' => $u['business_id'], 'c' => $cid, 'src' => $f['source'], 'pr' => $f['priority'] ?? 'medium', 'as' => $f['assigned_to'], 'idt' => $f['inquiry_date'], 'rq' => $f['requirements'] ?? '', 'no' => $f['notes'] ?? '', 'nf' => $f['next_follow_up'] ?? null, 'cb' => $u['id'], 'now' => $now,
            ]);
            self::addHistory($u, $lid, 'Lead created');
            Activity::log($u, 'create', 'lead', $lid, 'Lead created');
            return $lid;
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'edit');
        $l = self::find($u, $p['id']);
        $f = self::fields($u, $r->body, false, $l);
        $sets = []; $params = ['id' => $l['id'], 'b' => $u['business_id'], 'now' => Util::now()];
        foreach ($f as $col => $v) { $sets[] = "$col = :$col"; $params[$col] = $v; }
        Db::exec('UPDATE leads SET ' . implode(', ', $sets) . ', updated_at = :now WHERE id = :id AND business_id = :b', $params);
        Activity::log($u, 'update', 'lead', (int)$l['id'], 'Lead updated');
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'edit');
        $l = self::find($u, $p['id']);
        $s = Util::str($r->body['status'] ?? ''); $reason = mb_substr(Util::str($r->body['reason'] ?? ''), 0, 255); $note = mb_substr(Util::str($r->body['note'] ?? ''), 0, 255);
        if (!in_array($s, self::STATUSES, true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        if ($s === 'lost' && $reason === '') { throw ApiException::validation(['reason' => 'Please record why the lead was closed / lost.']); }
        Db::tx(function () use ($u, $l, $s, $reason, $note) {
            Db::exec('UPDATE leads SET status = :s, lost_reason = :lr, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $s, 'lr' => $s === 'lost' ? $reason : '', 'now' => Util::now(), 'id' => $l['id'], 'b' => $u['business_id']]);
            self::addHistory($u, (int)$l['id'], "Status changed to $s" . ($reason !== '' ? ": $reason" : ($note !== '' ? ": $note" : '')));
            Activity::log($u, 'status', 'lead', (int)$l['id'], "Lead marked $s");
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function delete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'leads', 'delete');
        $l = self::find($u, $p['id']);
        Db::exec('DELETE FROM leads WHERE id = :id AND business_id = :b', ['id' => $l['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'lead', (int)$l['id'], 'Lead deleted (its follow-ups were removed; quotations and purchases keep their data)');
        return ['ok' => true];
    }
}
