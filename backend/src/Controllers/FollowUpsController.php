<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Lister, Page, Perm, Request, Util};

final class FollowUpsController
{
    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'followup', 'f');
        $sql = "SELECT f.id, f.business_id, f.customer_id, f.lead_id, f.responsible_id, f.due_at, f.notes, f.outcome, f.completed_at, f.created_at, f.status AS stored_status,
            CASE WHEN f.status = 'scheduled' AND f.due_at < :now THEN 'overdue' ELSE f.status END AS status,
            (DATE(f.due_at) = :today) AS is_today, c.name AS customer_name, c.phone AS customer_phone, ru.name AS responsible_name, l.status AS lead_status
            FROM follow_ups f JOIN customers c ON c.id = f.customer_id LEFT JOIN users ru ON ru.id = f.responsible_id LEFT JOIN leads l ON l.id = f.lead_id
            WHERE f.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id'], 'now' => Util::now(), 'today' => Util::today()], $sp)];
    }

    public static function shape(array $row): array
    {
        $s = Util::shape($row);
        $s['isToday'] = (bool)($row['is_today'] ?? false);
        return $s;
    }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :fid', ['fid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Follow-up not found.'); }
        return $rows[0];
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'view');
        [$inner, $params] = self::inner($u);
        $view = $r->q('view', 'all');
        $where = ''; $wp = [];
        if (in_array($view, ['upcoming', 'overdue', 'completed'], true)) { $where = ' AND t.status = :view_status'; $wp['view_status'] = $view === 'upcoming' ? 'scheduled' : $view; }
        $page = Lister::run($inner, $params, $r, [
            'search' => ['customer_name', 'notes', 'outcome'], 'filters' => ['status' => 'status', 'responsibleId' => 'responsible_id', 'customerId' => 'customer_id', 'leadId' => 'lead_id'],
            'sorts' => ['dueAt' => 't.due_at', 'customerName' => 't.customer_name', 'responsibleName' => 't.responsible_name', 'status' => 't.status'], 'sort' => 'dueAt', 'date' => 'due_at', 'where' => $where, 'params' => $wp,
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'view');
        return self::shape(self::find($u, $p['id']));
    }

    public static function syncLeadNext(?int $leadId): void
    {
        if (!$leadId) { return; }
        Db::exec("UPDATE leads SET next_follow_up = (SELECT MIN(DATE(due_at)) FROM follow_ups WHERE lead_id = :l AND status = 'scheduled') WHERE id = :l", ['l' => $leadId]);
    }

    private static function responsible(array $u, array $b, ?int $current): int
    {
        $req = Util::idOrNull($b['responsibleId'] ?? null) ?? $current ?? (int)$u['id'];
        if ($req !== (int)$u['id'] && $req !== $current) { Perm::need($u, 'followUps', 'manage', 'You are not allowed to assign follow-ups to other Agents.'); }
        if (!Db::val("SELECT 1 FROM users WHERE id = :id AND business_id = :b AND status = 'active'", ['id' => $req, 'b' => $u['business_id']])) { throw ApiException::validation(['responsibleId' => 'Selected user was not found in your business.']); }
        return $req;
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'create');
        $b = $r->body; $e = [];
        $cid = Util::idOrNull($b['customerId'] ?? null);
        if ($cid === null || !Perm::customerVisible($u, $cid)) { $e['customerId'] = 'Please select a customer.'; }
        $lid = Util::idOrNull($b['leadId'] ?? null);
        if ($lid !== null && !Db::val('SELECT 1 FROM leads WHERE id = :id AND business_id = :b AND customer_id = :c', ['id' => $lid, 'b' => $u['business_id'], 'c' => $cid ?? 0])) { $e['leadId'] = 'Lead not found for this customer.'; }
        $due = Util::parseDateTime(Util::str($b['dueAt'] ?? ''));
        if ($due === null) { $e['dueAt'] = 'Choose a date and time.'; }
        if ($e) { throw ApiException::validation($e); }
        $resp = self::responsible($u, $b, null);
        $id = Db::tx(function () use ($u, $cid, $lid, $resp, $due, $b) {
            $now = Util::now();
            $id = Db::insert('INSERT INTO follow_ups (business_id, customer_id, lead_id, responsible_id, due_at, notes, status, created_by, created_at, updated_at) VALUES (:b, :c, :l, :r, :d, :n, \'scheduled\', :cb, :now, :now)', ['b' => $u['business_id'], 'c' => $cid, 'l' => $lid, 'r' => $resp, 'd' => $due, 'n' => mb_substr(Util::str($b['notes'] ?? ''), 0, 5000), 'cb' => $u['id'], 'now' => $now]);
            self::syncLeadNext($lid);
            Activity::log($u, 'create', 'follow-up', $id, 'Follow-up scheduled');
            return $id;
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'edit');
        $f = self::find($u, $p['id']);
        if ($f['stored_status'] !== 'scheduled') { throw new ApiException(409, 'Only scheduled follow-ups can be edited.'); }
        $due = Util::parseDateTime(Util::str($r->body['dueAt'] ?? ''));
        if ($due === null) { throw ApiException::validation(['dueAt' => 'Choose a date and time.']); }
        $resp = self::responsible($u, $r->body, $f['responsible_id'] !== null ? (int)$f['responsible_id'] : null);
        Db::exec('UPDATE follow_ups SET due_at = :d, notes = :n, responsible_id = :r, reminder_email_sent_at = IF(due_at <> :d, NULL, reminder_email_sent_at), updated_at = :now WHERE id = :id AND business_id = :b', ['d' => $due, 'n' => mb_substr(Util::str($r->body['notes'] ?? ''), 0, 5000), 'r' => $resp, 'now' => Util::now(), 'id' => $f['id'], 'b' => $u['business_id']]);
        self::syncLeadNext($f['lead_id'] !== null ? (int)$f['lead_id'] : null);
        return self::shape(self::find($u, $p['id']));
    }

    public static function complete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'edit');
        $f = self::find($u, $p['id']);
        if ($f['stored_status'] !== 'scheduled') { throw new ApiException(409, 'This follow-up is already closed.'); }
        $out = mb_substr(Util::str($r->body['outcome'] ?? ''), 0, 5000);
        if (mb_strlen($out) < 3) { throw ApiException::validation(['outcome' => 'Please record the outcome.']); }
        Db::exec("UPDATE follow_ups SET status = 'completed', outcome = :o, completed_at = :now, updated_at = :now WHERE id = :id AND business_id = :b", ['o' => $out, 'now' => Util::now(), 'id' => $f['id'], 'b' => $u['business_id']]);
        self::syncLeadNext($f['lead_id'] !== null ? (int)$f['lead_id'] : null);
        Activity::log($u, 'complete', 'follow-up', (int)$f['id'], 'Follow-up completed');
        return self::shape(self::find($u, $p['id']));
    }

    public static function reschedule(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'edit');
        $f = self::find($u, $p['id']);
        if ($f['stored_status'] !== 'scheduled') { throw new ApiException(409, 'Only scheduled follow-ups can be rescheduled.'); }
        $due = Util::parseDateTime(Util::str($r->body['dueAt'] ?? ''));
        if ($due === null) { throw ApiException::validation(['dueAt' => 'Choose a new date and time.']); }
        $note = mb_substr(Util::str($r->body['note'] ?? ''), 0, 255);
        $notes = mb_substr(($f['notes'] ?? '') . ($note !== '' ? " | Rescheduled: $note" : ' | Rescheduled'), 0, 5000);
        Db::exec('UPDATE follow_ups SET due_at = :d, notes = :n, reminder_email_sent_at = NULL, updated_at = :now WHERE id = :id AND business_id = :b', ['d' => $due, 'n' => $notes, 'now' => Util::now(), 'id' => $f['id'], 'b' => $u['business_id']]);
        self::syncLeadNext($f['lead_id'] !== null ? (int)$f['lead_id'] : null);
        Activity::log($u, 'reschedule', 'follow-up', (int)$f['id'], 'Follow-up rescheduled');
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'edit');
        $f = self::find($u, $p['id']);
        if (Util::str($r->body['status'] ?? '') !== 'cancelled') { throw ApiException::validation(['status' => 'Use complete or reschedule.']); }
        if ($f['stored_status'] !== 'scheduled') { throw new ApiException(409, 'Only scheduled follow-ups can be cancelled.'); }
        Db::exec("UPDATE follow_ups SET status = 'cancelled', updated_at = :now WHERE id = :id AND business_id = :b", ['now' => Util::now(), 'id' => $f['id'], 'b' => $u['business_id']]);
        self::syncLeadNext($f['lead_id'] !== null ? (int)$f['lead_id'] : null);
        return self::shape(self::find($u, $p['id']));
    }

    public static function delete(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'followUps', 'delete');
        $f = self::find($u, $p['id']);
        Db::exec('DELETE FROM follow_ups WHERE id = :id AND business_id = :b', ['id' => $f['id'], 'b' => $u['business_id']]);
        self::syncLeadNext($f['lead_id'] !== null ? (int)$f['lead_id'] : null);
        Activity::log($u, 'delete', 'follow-up', (int)$f['id'], 'Follow-up deleted');
        return ['ok' => true];
    }
}
