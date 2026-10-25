<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Lister, Money, Page, Perm, Request, Util};

final class SubscriptionsController
{
    private const CYCLES = ['monthly' => 1, 'quarterly' => 3, 'yearly' => 12];

    public static function inner(array $u): array
    {
        [$sc, $sp] = Perm::scopeSql($u, 'customer_ref', 's');
        $sql = "SELECT s.id, s.business_id, s.customer_id, s.plan_type, s.plan_id, s.plan_name, s.start_date, s.end_date, s.billing_cycle, s.price, s.next_billing_date, s.created_at, s.status AS stored_status,
            CASE WHEN s.status = 'active' AND s.end_date IS NOT NULL AND s.end_date < :today THEN 'expired' ELSE s.status END AS status,
            DATEDIFF(s.next_billing_date, :today) AS days_to_renewal,
            (CASE WHEN s.status = 'active' AND NOT (s.end_date IS NOT NULL AND s.end_date < :today) AND DATEDIFF(s.next_billing_date, :today) <= 14 THEN 1 ELSE 0 END) AS renewing_soon,
            c.name AS customer_name, c.phone AS customer_phone
            FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.business_id = :bid$sc";
        return [$sql, array_merge(['bid' => $u['business_id'], 'today' => Util::today()], $sp)];
    }

    public static function shape(array $row): array
    {
        $s = Util::shape($row);
        $s['daysToRenewal'] = (int)$row['days_to_renewal']; $s['renewingSoon'] = (bool)$row['renewing_soon'];
        return $s;
    }

    public static function find(array $u, string $id): array
    {
        [$inner, $p] = self::inner($u);
        $rows = Lister::all($inner, $p, ' AND t.id = :sid', ['sid' => (int)$id]);
        if (!$rows) { throw new ApiException(404, 'Subscription not found.'); }
        return $rows[0];
    }

    public static function history(int $id): array
    {
        return array_map(fn($h) => ['at' => str_replace(' ', 'T', $h['created_at']), 'by' => (string)($h['user_id'] ?? ''), 'text' => $h['text']], Db::all('SELECT text, created_at, user_id FROM subscription_history WHERE subscription_id = :s ORDER BY id', ['s' => $id]));
    }

    private static function addHistory(array $u, int $id, string $text): void
    {
        Db::exec('INSERT INTO subscription_history (subscription_id, user_id, text, created_at) VALUES (:s, :u, :t, :now)', ['s' => $id, 'u' => $u['id'], 't' => mb_substr($text, 0, 500), 'now' => Util::now()]);
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'subscriptions', 'view');
        [$inner, $params] = self::inner($u);
        $page = Lister::run($inner, $params, $r, [
            'search' => ['plan_name', 'customer_name'], 'filters' => ['status' => 'status', 'customerId' => 'customer_id', 'billingCycle' => 'billing_cycle'],
            'sorts' => ['customerName' => 't.customer_name', 'planName' => 't.plan_name', 'price' => 't.price', 'nextBillingDate' => 't.next_billing_date', 'status' => 't.status'], 'sort' => 'nextBillingDate', 'date' => 'start_date',
        ]);
        $page->rows = array_map([self::class, 'shape'], $page->rows);
        return $page;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'subscriptions', 'view');
        $s = self::find($u, $p['id']);
        $out = self::shape($s);
        $out['history'] = self::history((int)$s['id']);
        if (Perm::can($u, 'invoices', 'view')) {
            [$ii, $ip] = InvoicesController::inner($u);
            $out['invoices'] = array_map([InvoicesController::class, 'shape'], Lister::all($ii, $ip, ' AND t.subscription_id = :sid', ['sid' => $s['id']], 't.id DESC'));
        }
        return $out;
    }

    private static function plan(array $u, string $type, ?int $id): ?array
    {
        if ($id === null) { return null; }
        $tbl = $type === 'package' ? 'packages' : 'services';
        return Db::one("SELECT id, name, price FROM $tbl WHERE id = :id AND business_id = :b", ['id' => $id, 'b' => $u['business_id']]);
    }

    private static function validate(array $u, array $b, ?array $existing): array
    {
        $e = [];
        $type = $existing ? $existing['plan_type'] : Util::str($b['planType'] ?? '');
        $planId = $existing ? (int)$existing['plan_id'] : Util::idOrNull($b['planId'] ?? null);
        $cid = $existing ? (int)$existing['customer_id'] : Util::idOrNull($b['customerId'] ?? null);
        if ($cid === null || !Perm::customerVisible($u, $cid)) { $e['customerId'] = 'Please select a customer.'; }
        if (!in_array($type, ['service', 'package'], true)) { $e['planType'] = 'Choose service or package.'; }
        $plan = in_array($type, ['service', 'package'], true) ? self::plan($u, $type, $planId) : null;
        if (!$plan) { $e['planId'] = 'Choose a plan.'; }
        $start = Util::str($b['startDate'] ?? '');
        if (!Util::isDate($start)) { $e['startDate'] = 'Start date is required.'; }
        $end = Util::str($b['endDate'] ?? '');
        if ($end !== '' && !Util::isDate($end)) { $e['endDate'] = 'Enter a valid date.'; }
        elseif ($end !== '' && !isset($e['startDate']) && $end < $start) { $e['endDate'] = 'End date cannot be before the start date.'; }
        $cycle = Util::str($b['billingCycle'] ?? '');
        if (!isset(self::CYCLES[$cycle])) { $e['billingCycle'] = 'Choose a billing cycle.'; }
        $priceRaw = $b['price'] ?? '';
        if ($priceRaw === '' || $priceRaw === null) { $price = $plan ? (float)$plan['price'] : 0.0; }
        elseif (!is_numeric($priceRaw) || (float)$priceRaw < 0) { $e['price'] = 'Enter a valid price.'; $price = 0.0; }
        else { $price = round((float)$priceRaw, 2); }
        $next = Util::str($b['nextBillingDate'] ?? '') ?: ($existing['next_billing_date'] ?? $start);
        if (!Util::isDate((string)$next)) { $e['nextBillingDate'] = 'Enter a valid date.'; }
        if ($e) { throw ApiException::validation($e); }
        return ['customer_id' => $cid, 'type' => $type, 'plan' => $plan, 'start' => $start, 'end' => $end === '' ? null : $end, 'cycle' => $cycle, 'price' => $price, 'next' => $next];
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'subscriptions', 'create');
        $v = self::validate($u, $r->body, null);
        $id = Db::tx(function () use ($u, $v) {
            $now = Util::now();
            $id = Db::insert("INSERT INTO subscriptions (business_id, customer_id, plan_type, plan_id, plan_name, start_date, end_date, billing_cycle, price, status, next_billing_date, created_by, created_at, updated_at) VALUES (:b, :c, :pt, :pi, :pn, :sd, :ed, :bc, :pr, 'active', :nb, :cb, :now, :now)", [
                'b' => $u['business_id'], 'c' => $v['customer_id'], 'pt' => $v['type'], 'pi' => $v['plan']['id'], 'pn' => $v['plan']['name'], 'sd' => $v['start'], 'ed' => $v['end'], 'bc' => $v['cycle'], 'pr' => $v['price'], 'nb' => $v['next'], 'cb' => $u['id'], 'now' => $now,
            ]);
            self::addHistory($u, $id, 'Subscription created');
            Activity::log($u, 'create', 'subscription', $id, "Subscription {$v['plan']['name']} created");
            return $id;
        });
        return self::shape(self::find($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'subscriptions', 'edit');
        $s = self::find($u, $p['id']);
        if ($s['stored_status'] === 'cancelled') { throw new ApiException(409, 'Cancelled subscriptions cannot be edited.'); }
        $v = self::validate($u, $r->body, Db::one('SELECT * FROM subscriptions WHERE id = :id', ['id' => $s['id']]));
        Db::tx(function () use ($u, $s, $v) {
            Db::exec('UPDATE subscriptions SET start_date = :sd, end_date = :ed, billing_cycle = :bc, price = :pr, next_billing_date = :nb, updated_at = :now WHERE id = :id AND business_id = :b', ['sd' => $v['start'], 'ed' => $v['end'], 'bc' => $v['cycle'], 'pr' => $v['price'], 'nb' => $v['next'], 'now' => Util::now(), 'id' => $s['id'], 'b' => $u['business_id']]);
            self::addHistory($u, (int)$s['id'], 'Subscription details updated');
        });
        return self::shape(self::find($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'subscriptions', 'manage', 'You are not allowed to change subscription status.');
        $s = self::find($u, $p['id']); $st = Util::str($r->body['status'] ?? '');
        if (!in_array($st, ['active', 'paused', 'cancelled'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        if ($s['stored_status'] === 'cancelled') { throw new ApiException(409, 'A cancelled subscription cannot be reactivated.'); }
        Db::tx(function () use ($u, $s, $st) {
            Db::exec('UPDATE subscriptions SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $st, 'now' => Util::now(), 'id' => $s['id'], 'b' => $u['business_id']]);
            self::addHistory($u, (int)$s['id'], "Status changed to $st");
            Activity::log($u, 'status', 'subscription', (int)$s['id'], "Subscription {$s['plan_name']} $st");
        });
        return self::shape(self::find($u, $p['id']));
    }

    /** Manual renewal: creates an issued invoice for the next period and moves the next billing date. Nobody is charged. */
    public static function renew(Request $r, array $p): array
    {
        $u = Auth::require($r);
        Perm::need($u, 'subscriptions', 'manage', 'You are not allowed to renew subscriptions.');
        Perm::need($u, 'invoices', 'create', 'You are not allowed to create invoices.');
        $s0 = self::find($u, $p['id']);
        $iid = Db::tx(function () use ($u, $s0) {
            $s = Db::one('SELECT * FROM subscriptions WHERE id = :id AND business_id = :b FOR UPDATE', ['id' => $s0['id'], 'b' => $u['business_id']]);
            if ($s['status'] !== 'active') { throw new ApiException(409, 'Only active subscriptions can be renewed.'); }
            $settings = Biz::settings(Biz::find((int)$u['business_id']));
            $date = Util::today();
            $calc = Money::compute([['type' => $s['plan_type'], 'refId' => (int)$s['plan_id'], 'description' => "{$s['plan_name']} ({$s['billing_cycle']} subscription)", 'qty' => 1, 'unitPrice' => (float)$s['price'], 'discount' => 0]], $settings['taxRate']);
            $iid = InvoicesController::createCore($u, (int)$s['customer_id'], null, (int)$s['id'], $date, Util::addDays($date, (int)$settings['invoiceDueDays']), (float)$settings['taxRate'], 'Subscription renewal. Billed manually: no automatic charge is made.', '', $calc, 'issued');
            $next = Util::addMonths($s['next_billing_date'], self::CYCLES[$s['billing_cycle']]);
            Db::exec('UPDATE subscriptions SET next_billing_date = :n, updated_at = :now WHERE id = :id', ['n' => $next, 'now' => Util::now(), 'id' => $s['id']]);
            self::addHistory($u, (int)$s['id'], 'Renewal invoice created; next billing date ' . $next);
            Activity::log($u, 'renew', 'subscription', (int)$s['id'], "Renewal invoice created for {$s['plan_name']}");
            return $iid;
        });
        return ['invoice' => InvoicesController::shape(InvoicesController::find($u, (string)$iid)), 'subscription' => self::shape(self::find($u, $p['id']))];
    }
}
