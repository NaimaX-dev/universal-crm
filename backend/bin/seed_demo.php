<?php
declare(strict_types=1);
/**
 * OPTIONAL test data: two fictional businesses with Admin/Agent accounts and sample records in every module.
 * Usage:  php bin/seed_demo.php          (refuses to run twice, or when APP_ENV=production)
 * Demo logins (password for admins: Admin@123, for agents: Agent@123):
 *   admin@northwind.demo, bilal@northwind.demo (assigned customers only), hina@northwind.demo (all customers, can record payments)
 *   admin@skyline.demo   (a second business, to test data isolation)
 */
require __DIR__ . '/_bootstrap.php';

use App\{Auth, Biz, Db, Docs, Env, Money, Perm, Util};
use App\Controllers\{AuthController, InvoicesController};

if (Env::get('APP_ENV') === 'production') { fwrite(STDERR, "Refusing to insert demo data when APP_ENV=production.\n"); exit(1); }
if (Db::val("SELECT 1 FROM users WHERE email = 'admin@northwind.demo'")) { echo "Demo data already exists. Nothing to do.\n"; exit(0); }

$today = Util::today(); $d = fn(int $n) => Util::addDays($today, $n); $dt = fn(int $n, string $t) => Util::addDays($today, $n) . ' ' . $t . ':00'; $now = Util::now();

function agentPerms(array $extra = []): array
{
    $p = array_fill_keys(array_keys(Perm::MODULES), []);
    $p['customers'] = ['view' => true, 'create' => true, 'edit' => true]; $p['leads'] = ['view' => true, 'create' => true, 'edit' => true];
    $p['followUps'] = ['view' => true, 'create' => true, 'edit' => true]; $p['services'] = ['view' => true]; $p['packages'] = ['view' => true]; $p['reports'] = ['view' => true];
    foreach ($extra as $m => $a) { $p[$m] = array_merge($p[$m], $a); }
    return $p;
}
function mkUser(int $bid, string $name, string $email, string $pw, array $perms, string $scope): int
{
    return Db::insert("INSERT INTO users (business_id, name, email, password_hash, role, status, scope, permissions, created_at, updated_at) VALUES (:b, :n, :e, :h, 'agent', 'active', :s, :p, :now, :now)", ['b' => $bid, 'n' => $name, 'e' => $email, 'h' => Auth::hash($pw), 's' => $scope, 'p' => json_encode($perms), 'now' => Util::now()]);
}

Db::tx(function () use ($d, $dt, $now, $today) {
    // ---------- Business A ----------
    $admin = AuthController::createBusinessWithAdmin('Northwind Clinic (demo)', 'Clinic', 'admin@northwind.demo', 'Sara Malik', 'Admin@123');
    $A = (int)$admin['business_id']; $adminId = (int)$admin['id'];
    Db::exec('UPDATE businesses SET email = \'info@northwind.demo\', phone = \'+92 300 1112233\', address = \'12 Demo Street, Sample City\', settings = :s WHERE id = :id', ['s' => json_encode(array_merge(Biz::defaultSettings('Northwind Clinic'), ['taxRate' => 5, 'defaultCountryCode' => '92'])), 'id' => $A]);
    $bilal = mkUser($A, 'Bilal Rauf', 'bilal@northwind.demo', 'Agent@123', agentPerms(['quotations' => ['view' => true, 'create' => true], 'invoices' => ['view' => true]]), 'assigned');
    $hina = mkUser($A, 'Hina Siddiqui', 'hina@northwind.demo', 'Agent@123', agentPerms(['quotations' => ['view' => true, 'create' => true, 'edit' => true], 'invoices' => ['view' => true, 'create' => true], 'payments' => ['view' => true, 'create' => true], 'purchases' => ['view' => true, 'create' => true], 'subscriptions' => ['view' => true], 'leads' => ['manage' => true], 'followUps' => ['manage' => true]]), 'all');

    $cust = function (string $name, string $phone, string $email, int $assigned) use ($A, $adminId, $now): int {
        return Db::insert('INSERT INTO customers (business_id, name, phone, phone_normalized, email, address, status, assigned_to, created_by, created_at, updated_at) VALUES (:b, :n, :p, :pn, :e, \'Sample address, Demo City\', \'active\', :a, :cb, :now, :now)', ['b' => $A, 'n' => $name, 'p' => $phone, 'pn' => Util::phoneNorm($phone), 'e' => $email, 'a' => $assigned, 'cb' => $adminId, 'now' => $now]);
    };
    $c1 = $cust('Ayesha Khan', '+92 300 0000001', 'ayesha.k@example.com', $bilal); $c2 = $cust('Daniel Cruz', '+92 300 0000002', 'd.cruz@example.com', $hina);
    $c3 = $cust('Maria Lopez', '+92 300 0000003', 'maria.l@example.com', $bilal); $c4 = $cust('Omar Farooq', '0321 0000004', 'omar.f@example.com', $hina);
    $c5 = $cust('Lina Ahmed', '+92 333 0000005', 'lina.a@example.com', $bilal); $c6 = $cust('Sana Iqbal', '+92 345 0000006', 'sana.i@example.com', $hina);
    $c7 = $cust('Kamran Ali', '+92 311 0000007', 'kamran.a@example.com', $bilal); $c8 = $cust('Noor Fatima', '+92 322 0000008', 'noor.f@example.com', $hina);

    $svc = fn(string $n, string $cat, string $desc, float $p, string $dur, string $st = 'active') => Db::insert('INSERT INTO services (business_id, name, category, description, price, duration, status, created_at, updated_at) VALUES (:b, :n, :c, :d, :p, :du, :s, :now, :now)', ['b' => $A, 'n' => $n, 'c' => $cat, 'd' => $desc, 'p' => $p, 'du' => $dur, 's' => $st, 'now' => $now]);
    $s1 = $svc('Initial Consultation', 'Consultation', 'One-time introductory session.', 40, '30 minutes'); $s2 = $svc('Follow-up Visit', 'Consultation', 'Standard follow-up appointment.', 25, '20 minutes');
    $s3 = $svc('Treatment Session', 'Treatment', 'Single treatment session.', 90, '60 minutes'); $svc('Maintenance Check', 'Maintenance', 'Periodic check and report.', 60, '45 minutes', 'inactive');
    $pkg = function (string $n, string $desc, float $p, string $dur, array $sv) use ($A, $now): int {
        $id = Db::insert('INSERT INTO packages (business_id, name, description, price, duration, status, created_at, updated_at) VALUES (:b, :n, :d, :p, :du, \'active\', :now, :now)', ['b' => $A, 'n' => $n, 'd' => $desc, 'p' => $p, 'du' => $dur, 'now' => $now]);
        foreach ($sv as $s) { Db::exec('INSERT INTO package_services (package_id, service_id) VALUES (:p, :s)', ['p' => $id, 's' => $s]); }
        return $id;
    };
    $p1 = $pkg('Standard Annual', '12-month care plan', 480, '12 months', [$s1, $s2]); $p2 = $pkg('Premium Care', 'Extended plan with priority support', 900, '12 months', [$s1, $s2, $s3]);

    $lead = function (int $c, string $src, string $st, string $pr, int $as, int $off, string $req, ?int $next, string $lost = '') use ($A, $adminId, $d, $now): int {
        $id = Db::insert('INSERT INTO leads (business_id, customer_id, source, status, priority, assigned_to, inquiry_date, requirements, notes, next_follow_up, lost_reason, created_by, created_at, updated_at) VALUES (:b, :c, :src, :st, :pr, :as, :idt, :rq, \'\', :nf, :lr, :cb, :now, :now)', ['b' => $A, 'c' => $c, 'src' => $src, 'st' => $st, 'pr' => $pr, 'as' => $as, 'idt' => $d($off), 'rq' => $req, 'nf' => $next === null ? null : $d($next), 'lr' => $lost, 'cb' => $adminId, 'now' => $now]);
        Db::exec('INSERT INTO lead_history (business_id, lead_id, user_id, text, created_at) VALUES (:b, :l, :u, \'Lead created\', :now)', ['b' => $A, 'l' => $id, 'u' => $adminId, 'now' => $now]);
        return $id;
    };
    $l1 = $lead($c1, 'facebook', 'new', 'high', $bilal, -1, 'Asked about a consultation next week.', 0); $l2 = $lead($c2, 'phone', 'contacted', 'medium', $hina, -5, 'Wants pricing for treatment sessions.', 1);
    $l3 = $lead($c3, 'website', 'interested', 'high', $bilal, -8, 'Interested in the Standard Annual package.', 0); $l4 = $lead($c4, 'walk-in', 'follow_up', 'low', $hina, -10, 'Needs approval from family.', 2);
    $l5 = $lead($c5, 'instagram', 'converted', 'medium', $bilal, -35, 'Signed up for Standard Annual.', null); $l6 = $lead($c6, 'referral', 'follow_up', 'medium', $hina, -6, 'Referred by an existing customer.', -2);
    $l7 = $lead($c7, 'whatsapp', 'lost', 'low', $bilal, -15, 'Asked about premium plan.', null, 'Chose another provider (price)'); $l8 = $lead($c8, 'other', 'new', 'medium', $hina, 0, 'Called the number on the sign.', 3);

    $fu = function (int $c, ?int $l, int $r, string $due, string $notes, string $st = 'scheduled', string $out = '') use ($A, $adminId, $now): void {
        Db::exec('INSERT INTO follow_ups (business_id, customer_id, lead_id, responsible_id, due_at, notes, status, outcome, completed_at, created_by, created_at, updated_at) VALUES (:b, :c, :l, :r, :d, :n, :s, :o, :ca, :cb, :now, :now)', ['b' => $A, 'c' => $c, 'l' => $l, 'r' => $r, 'd' => $due, 'n' => $notes, 's' => $st, 'o' => $out, 'ca' => $st === 'completed' ? $due : null, 'cb' => $adminId, 'now' => $now]);
    };
    $fu($c7, $l7, $bilal, $dt(-3, '15:00'), 'Last attempt before closing the lead'); $fu($c6, $l6, $hina, $dt(-2, '12:00'), 'Confirm referral details');
    $fu($c1, $l1, $bilal, $dt(0, '10:00'), 'Confirm requirements'); $fu($c3, $l3, $bilal, $dt(0, '17:30'), 'Send package details and pricing');
    $fu($c2, $l2, $hina, $dt(1, '09:30'), 'Discuss treatment pricing'); $fu($c4, $l4, $hina, $dt(2, '14:00'), 'Call back after family decision'); $fu($c8, $l8, $hina, $dt(3, '11:00'), 'Introductory call');
    $fu($c3, $l3, $bilal, $dt(-4, '11:00'), 'Initial call', 'completed', 'Customer interested; sent details by email.');

    $items = fn(array ...$rows) => array_map(fn($r) => ['type' => $r[0], 'refId' => $r[1], 'description' => $r[2], 'qty' => $r[3], 'unitPrice' => $r[4], 'discount' => $r[5] ?? 0], $rows);
    $quote = function (int $c, ?int $l, int $off, int $validity, array $it, string $st, int $by) use ($A, $d, $now): int {
        $calc = Money::compute($it, 5); $n = Biz::nextNumber($A, 'quotation', 'QT');
        $id = Db::insert('INSERT INTO quotations (business_id, number, customer_id, lead_id, quote_date, expiry_date, status, tax_rate, subtotal, discount_total, tax_total, total, notes, terms, created_by, created_at, updated_at) VALUES (:b, :n, :c, :l, :d, :x, :s, 5, :st, :dt, :tx, :tt, \'Thank you for your interest.\', \'Prices valid until the expiry date.\', :cb, :now, :now)', ['b' => $A, 'n' => $n, 'c' => $c, 'l' => $l, 'd' => $d($off), 'x' => $d($off + $validity), 's' => $st, 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'cb' => $by, 'now' => $now]);
        Docs::saveItems('quotation', $id, $calc, $A); return $id;
    };
    $q1 = $quote($c5, $l5, -34, 14, $items(['package', $p1, 'Standard Annual', 1, 480]), 'accepted', $bilal);
    $quote($c3, $l3, -2, 14, $items(['package', $p1, 'Standard Annual', 1, 480, 10]), 'sent', $bilal);
    $quote($c2, $l2, -1, 14, $items(['service', $s3, 'Treatment Session', 3, 90, 5], ['service', $s1, 'Initial Consultation', 1, 40]), 'draft', $hina);
    $quote($c4, $l4, -25, 7, $items(['service', $s1, 'Initial Consultation', 1, 40]), 'sent', $hina);

    $adminRow = ['id' => $adminId, 'business_id' => $A];
    $inv = function (int $c, int $off, int $due, array $it, string $st, ?int $q = null) use ($adminRow, $d): int {
        return InvoicesController::createCore($adminRow, $c, $q, null, $d($off), $d($off + $due), 5.0, '', '', Money::compute($it, 5), $st);
    };
    $pay = function (int $invoice, int $c, int $off, float $amt, string $method, ?string $txn, string $st = 'completed', string $notes = '') use ($A, $adminId, $d, $now): void {
        Db::exec('INSERT INTO payments (business_id, customer_id, invoice_id, amount, payment_date, method, transaction_id, status, notes, receipt_no, recorded_by, created_at, updated_at) VALUES (:b, :c, :i, :a, :d, :m, :t, :s, :n, :r, :u, :now, :now)', ['b' => $A, 'c' => $c, 'i' => $invoice, 'a' => $amt, 'd' => $d($off), 'm' => $method, 't' => $txn, 's' => $st, 'n' => $notes, 'r' => Biz::nextNumber($A, 'receipt', 'RCPT'), 'u' => $adminId, 'now' => $now]);
    };
    $i1 = $inv($c5, -33, 14, $items(['package', $p1, 'Standard Annual', 1, 480]), 'issued', $q1); Db::exec('UPDATE quotations SET invoice_id = :i WHERE id = :q', ['i' => $i1, 'q' => $q1]);
    $pay($i1, $c5, -32, 300, 'bank_transfer', 'TXN-DEMO-1001'); $pay($i1, $c5, -10, 100, 'cash', null);
    $i2 = $inv($c3, -12, 14, $items(['package', $p2, 'Premium Care', 1, 900]), 'issued'); $pay($i2, $c3, -11, 945, 'card', 'TXN-DEMO-2002');
    $inv($c1, -30, 14, $items(['service', $s1, 'Initial Consultation', 1, 40], ['service', $s2, 'Follow-up Visit', 2, 25]), 'issued');
    $i4 = $inv($c2, -1, 14, $items(['service', $s3, 'Treatment Session', 2, 90]), 'issued'); $pay($i4, $c2, 0, 50, 'cash', null, 'pending', 'Awaiting confirmation');
    $inv($c6, 0, 14, $items(['service', $s1, 'Initial Consultation', 1, 40]), 'draft');

    $pur = function (int $c, ?int $l, int $off, array $it, string $notes) use ($A, $adminId, $d, $now): int {
        $calc = Money::compute($it, 0);
        $id = Db::insert('INSERT INTO purchases (business_id, customer_id, lead_id, purchase_date, status, notes, subtotal, discount_total, tax_total, total, created_by, created_at, updated_at) VALUES (:b, :c, :l, :d, \'recorded\', :n, :st, :dt, :tx, :tt, :cb, :now, :now)', ['b' => $A, 'c' => $c, 'l' => $l, 'd' => $d($off), 'n' => $notes, 'st' => $calc['subtotal'], 'dt' => $calc['discountTotal'], 'tx' => $calc['tax'], 'tt' => $calc['total'], 'cb' => $adminId, 'now' => $now]);
        Docs::saveItems('purchase', $id, $calc, $A); return $id;
    };
    $pu1 = $pur($c4, $l4, -7, $items(['service', $s2, 'Follow-up Visit', 2, 25]), 'Walk-in purchase, paid at desk.'); $pur($c8, null, -1, $items(['service', $s3, 'Treatment Session', 1, 90]), '');
    Db::exec('INSERT INTO payments (business_id, customer_id, purchase_id, amount, payment_date, method, status, receipt_no, recorded_by, created_at, updated_at) VALUES (:b, :c, :p, 50, :d, \'cash\', \'completed\', :r, :u, :now, :now)', ['b' => $A, 'c' => $c4, 'p' => $pu1, 'd' => $d(-7), 'r' => Biz::nextNumber($A, 'receipt', 'RCPT'), 'u' => $adminId, 'now' => $now]);

    $sub = function (int $c, string $type, int $plan, string $pname, int $start, ?int $end, string $cycle, float $price, string $st, int $next) use ($A, $adminId, $d, $now): void {
        $id = Db::insert('INSERT INTO subscriptions (business_id, customer_id, plan_type, plan_id, plan_name, start_date, end_date, billing_cycle, price, status, next_billing_date, created_by, created_at, updated_at) VALUES (:b, :c, :pt, :pi, :pn, :sd, :ed, :bc, :pr, :s, :nb, :cb, :now, :now)', ['b' => $A, 'c' => $c, 'pt' => $type, 'pi' => $plan, 'pn' => $pname, 'sd' => $d($start), 'ed' => $end === null ? null : $d($end), 'bc' => $cycle, 'pr' => $price, 's' => $st, 'nb' => $d($next), 'cb' => $adminId, 'now' => $now]);
        Db::exec('INSERT INTO subscription_history (subscription_id, user_id, text, created_at) VALUES (:s, :u, \'Subscription created\', :now)', ['s' => $id, 'u' => $adminId, 'now' => $now]);
    };
    $sub($c5, 'package', $p1, 'Standard Annual', -33, 332, 'yearly', 480, 'active', 332); $sub($c3, 'package', $p2, 'Premium Care', -60, 305, 'monthly', 75, 'active', 6);
    $sub($c2, 'service', $s2, 'Follow-up Visit', -200, 165, 'quarterly', 60, 'paused', 20); $sub($c1, 'service', $s2, 'Follow-up Visit', -400, -10, 'monthly', 25, 'active', -10);

    // ---------- Business B (proves business isolation) ----------
    $adminB = AuthController::createBusinessWithAdmin('Skyline Travels (demo)', 'Travel agency', 'admin@skyline.demo', 'Rida Shah', 'Admin@123');
    $B = (int)$adminB['business_id'];
    $cb = Db::insert('INSERT INTO customers (business_id, name, phone, phone_normalized, email, status, assigned_to, created_by, created_at, updated_at) VALUES (:b, \'Faisal Mehmood\', \'+92 300 7770001\', :pn, \'faisal@example.com\', \'active\', :a, :a, :now, :now)', ['b' => $B, 'pn' => Util::phoneNorm('+92 300 7770001'), 'a' => $adminB['id'], 'now' => $now]);
    Db::exec('INSERT INTO services (business_id, name, category, description, price, duration, status, created_at, updated_at) VALUES (:b, \'Dubai Weekend Tour\', \'Tour\', \'3 days / 2 nights\', 650, \'3 days\', \'active\', :now, :now)', ['b' => $B, 'now' => $now]);
    Db::exec("INSERT INTO leads (business_id, customer_id, source, status, priority, assigned_to, inquiry_date, requirements, next_follow_up, created_by, created_at, updated_at) VALUES (:b, :c, 'facebook', 'new', 'medium', :a, :d, 'Family of four, March travel.', :n, :a, :now, :now)", ['b' => $B, 'c' => $cb, 'a' => $adminB['id'], 'd' => $d(-1), 'n' => $d(1), 'now' => $now]);
});
echo "Demo data created. Sign in with admin@northwind.demo / Admin@123 (Agents: bilal@northwind.demo or hina@northwind.demo / Agent@123; other business: admin@skyline.demo / Admin@123).\n";
