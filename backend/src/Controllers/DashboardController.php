<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Auth, Db, Lister, Perm, Request, Util};

/** Dashboard figures are calculated from database records the signed-in user is allowed to see. */
final class DashboardController
{
    /** Shaped rows of a module, limited to what the user can see (business + Agent scope). */
    public static function rows(array $u, string $controller, ?string $module = null): ?array
    {
        if ($module !== null && !Perm::can($u, $module, 'view')) { return null; }
        [$sql, $p] = $controller::inner($u);
        return array_map([$controller, 'shape'], Lister::all($sql, $p));
    }

    public static function sum(array $rows, string $key): float { return round(array_sum(array_map(fn($r) => (float)$r[$key], $rows)), 2); }

    public static function countBy(array $rows, string $key): object
    {
        $m = [];
        foreach ($rows as $r) { $m[$r[$key]] = ($m[$r[$key]] ?? 0) + 1; }
        return (object)$m;
    }

    /**
     * Last 6 calendar months (oldest first) for the dashboard charts: completed payment totals by payment date and
     * leads by inquiry date. Built only from rows the user is allowed to see (null module = no permission = zeros).
     * @return array<int,array{month:string,revenue:float,leads:int}>
     */
    public static function trends(?array $pays, ?array $leads): array
    {
        $first = new \DateTimeImmutable('first day of this month 00:00:00');
        $series = [];
        for ($i = 5; $i >= 0; $i--) {
            $k = $first->modify("-$i month")->format('Y-m');
            $series[$k] = ['month' => $k, 'revenue' => 0.0, 'leads' => 0];
        }
        foreach ($pays ?? [] as $p) {
            if (($p['status'] ?? '') !== 'completed') { continue; }
            $k = substr((string)($p['date'] ?? ''), 0, 7);
            if (isset($series[$k])) { $series[$k]['revenue'] = round($series[$k]['revenue'] + (float)$p['amount'], 2); }
        }
        foreach ($leads ?? [] as $l) {
            $k = substr((string)($l['inquiryDate'] ?? ''), 0, 7);
            if (isset($series[$k])) { $series[$k]['leads']++; }
        }
        return array_values($series);
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); $admin = Perm::isAdmin($u);
        $out = ['role' => $u['role'], 'scope' => $u['scope'], 'generatedAt' => Util::now()];
        $custs = self::rows($u, CustomersController::class, 'customers');
        $leads = self::rows($u, LeadsController::class, 'leads');
        $fus = self::rows($u, FollowUpsController::class, 'followUps');
        $quotes = self::rows($u, QuotationsController::class, 'quotations');
        $invs = self::rows($u, InvoicesController::class, 'invoices');
        $pays = self::rows($u, PaymentsController::class, 'payments');
        $subs = self::rows($u, SubscriptionsController::class, 'subscriptions');
        $purs = self::rows($u, PurchasesController::class, 'purchases');

        if ($custs !== null) { $out['customers'] = ['total' => count($custs), 'active' => count(array_filter($custs, fn($c) => $c['status'] === 'active'))]; }
        if ($leads !== null) {
            $out['leads'] = ['total' => count($leads), 'newCount' => count(array_filter($leads, fn($l) => $l['status'] === 'new')), 'byStatus' => self::countBy($leads, 'status'), 'open' => count(array_filter($leads, fn($l) => !in_array($l['status'], ['converted', 'lost'], true)))];
            usort($leads, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
            $out['recentLeads'] = array_slice($leads, 0, 5);
        }
        if ($fus !== null) {
            $out['followUps'] = ['today' => count(array_filter($fus, fn($f) => $f['status'] === 'scheduled' && $f['isToday'])), 'overdue' => count(array_filter($fus, fn($f) => $f['status'] === 'overdue')), 'upcoming' => count(array_filter($fus, fn($f) => $f['status'] === 'scheduled'))];
            $due = array_values(array_filter($fus, fn($f) => ($f['status'] === 'scheduled' && $f['isToday']) || $f['status'] === 'overdue'));
            usort($due, fn($a, $b) => strcmp($a['dueAt'], $b['dueAt']));
            $out['todayList'] = array_slice($due, 0, 6);
        }
        if ($quotes !== null) { $out['quotations'] = ['total' => count($quotes), 'byStatus' => self::countBy($quotes, 'status'), 'openValue' => self::sum(array_filter($quotes, fn($q) => in_array($q['status'], ['draft', 'sent'], true)), 'total')]; }
        $live = [];
        if ($invs !== null) {
            $live = array_values(array_filter($invs, fn($i) => !in_array($i['status'], ['draft', 'cancelled'], true)));
            $out['invoices'] = ['total' => count($invs), 'byStatus' => self::countBy($invs, 'status'), 'invoiced' => self::sum($live, 'total'), 'outstanding' => self::sum($live, 'balance'), 'overdue' => self::sum(array_filter($invs, fn($i) => $i['status'] === 'overdue'), 'balance')];
        }
        if ($pays !== null) {
            $done = array_filter($pays, fn($x) => $x['status'] === 'completed');
            $out['payments'] = ['received' => self::sum($done, 'amount'), 'pending' => self::sum(array_filter($pays, fn($x) => $x['status'] === 'pending'), 'amount'), 'count' => count($done)];
        }
        if ($invs !== null || $purs !== null) {
            $purOnly = array_values(array_filter($purs ?? [], fn($x) => $x['invoiceId'] === '' && $x['storedStatus'] === 'recorded'));
            $out['sales'] = ['total' => round(self::sum($live, 'total') + self::sum($purOnly, 'total'), 2), 'outstanding' => round(self::sum($live, 'balance') + self::sum($purOnly, 'balance'), 2)];
        }
        if ($subs !== null) {
            $out['subscriptions'] = ['active' => count(array_filter($subs, fn($s) => $s['status'] === 'active')), 'paused' => count(array_filter($subs, fn($s) => $s['status'] === 'paused')), 'renewingSoon' => count(array_filter($subs, fn($s) => $s['renewingSoon']))];
            $ren = array_values(array_filter($subs, fn($s) => $s['renewingSoon']));
            usort($ren, fn($a, $b) => $a['daysToRenewal'] <=> $b['daysToRenewal']);
            $out['renewals'] = array_slice($ren, 0, 5);
        }
        if ($admin) { $out['activeAgents'] = (int)Db::val("SELECT COUNT(*) FROM users WHERE business_id = :b AND role = 'agent' AND status = 'active'", ['b' => $u['business_id']]); }
        $out['trends'] = self::trends($pays, $leads);
        $sql = 'SELECT a.id, a.text, a.created_at, x.name AS user_name FROM activity_logs a LEFT JOIN users x ON x.id = a.user_id WHERE a.business_id = :b' . ($admin ? '' : ' AND a.user_id = :u') . ' ORDER BY a.id DESC LIMIT 8';
        $params = ['b' => $u['business_id']]; if (!$admin) { $params['u'] = $u['id']; }
        $out['recentActivity'] = array_map(function ($a) { $s = Util::shape($a); $s['at'] = $s['createdAt']; return $s; }, Db::all($sql, $params));
        return $out;
    }
}