<?php
declare(strict_types=1);
/**
 * End-to-end API tests against a RUNNING backend + database.
 *   1. Start MySQL, run  php bin/setup_db.php  and  php bin/seed_demo.php
 *   2. Start the API:    php -S 127.0.0.1:8000 -t public      (from the backend folder)
 *   3. Run:              php tests/api_test.php [http://127.0.0.1:8000]
 * Requirements in backend/.env: ALLOW_BUSINESS_REGISTRATION=true, CORS_ALLOWED_ORIGINS=http://localhost:5173.
 * The test registers two throw-away businesses with random emails, so it can be run repeatedly.
 */
$base = rtrim($argv[1] ?? 'http://127.0.0.1:8000', '/');
$pass = 0; $fail = 0; $results = [];

function call(string $method, string $path, ?array $body = null, ?string $token = null, array $headers = []): array
{
    global $base;
    $h = ['Accept: application/json'];
    if ($body !== null) { $h[] = 'Content-Type: application/json'; }
    if ($token) { $h[] = "Authorization: Bearer $token"; }
    foreach ($headers as $x) { $h[] = $x; }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $h), 'content' => $body !== null ? json_encode($body) : null, 'ignore_errors' => true, 'timeout' => 30]]);
    $raw = @file_get_contents($base . $path, false, $ctx);
    preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m);
    $hdrs = [];
    foreach ($http_response_header ?? [] as $line) { if (str_contains($line, ':')) { [$k, $v] = explode(':', $line, 2); $hdrs[strtolower(trim($k))] = trim($v); } }
    return ['status' => (int)($m[1] ?? 0), 'json' => json_decode((string)$raw, true), 'raw' => (string)$raw, 'headers' => $hdrs];
}
function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail, $results;
    $ok ? $pass++ : $fail++;
    $results[] = ['name' => $name, 'ok' => $ok];
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($ok ? '' : "  <-- $detail") . "\n";
}
function data(array $r): mixed { return $r['json']['data'] ?? null; }
function login(string $email, string $pw): ?string { $r = call('POST', '/auth/login', ['email' => $email, 'password' => $pw]); return data($r)['token'] ?? null; }
function register(string $name, string $email): array
{
    $r = call('POST', '/auth/register-business', ['businessName' => $name, 'businessType' => 'Test', 'adminName' => "Admin $name", 'email' => $email, 'password' => 'Passw0rdTest']);
    return [data($r)['token'] ?? '', $r];
}
function money(float $v): string { return number_format($v, 2, '.', ''); }

$run = bin2hex(random_bytes(3));
echo "== Universal CRM API tests ($base) run $run ==\n";

// ---------------------------------------------------------------- basics
$r = call('GET', '/health'); check('health endpoint reaches the database', $r['status'] === 200 && ($r['json']['data']['ok'] ?? false) === true);
$r = call('GET', '/nope'); check('unknown route returns 404 JSON', $r['status'] === 404 && isset($r['json']['message']));
$r = call('POST', '/auth/login', null, null, ['Content-Type: application/json']); check('empty login rejected (422)', $r['status'] === 422);
$ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => '{bad json', 'ignore_errors' => true]]);
@file_get_contents($base . '/auth/login', false, $ctx); preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m); check('malformed JSON body rejected (400)', ($m[1] ?? '') === '400');
$r = call('GET', '/customers'); check('protected endpoint without token returns 401', $r['status'] === 401);
$r = call('GET', '/customers', null, 'deadbeef'); check('protected endpoint with invalid token returns 401', $r['status'] === 401);

// CORS
$r = call('OPTIONS', '/customers', null, null, ['Origin: http://localhost:5173', 'Access-Control-Request-Method: GET']);
check('CORS preflight allowed for the configured origin', $r['status'] === 204 && ($r['headers']['access-control-allow-origin'] ?? '') === 'http://localhost:5173');
$r = call('GET', '/health', null, null, ['Origin: http://evil.example']);
check('CORS not granted to an unknown origin', !isset($r['headers']['access-control-allow-origin']));

// ---------------------------------------------------------------- authentication
$r = call('POST', '/auth/login', ['email' => 'admin@northwind.demo', 'password' => 'wrong']); check('wrong password rejected (401)', $r['status'] === 401);
$r = call('POST', '/auth/login', ['email' => "' OR 1=1 --", 'password' => "' OR '1'='1"]); check('SQL injection in login is rejected, no server error', $r['status'] === 401 || $r['status'] === 422);
$adm = login('admin@northwind.demo', 'Admin@123'); check('Admin login works (seed data)', $adm !== null);
$bil = login('bilal@northwind.demo', 'Agent@123'); check('Agent (assigned scope) login works', $bil !== null);
$hin = login('hina@northwind.demo', 'Agent@123'); check('Agent (all scope) login works', $hin !== null);
$sky = login('admin@skyline.demo', 'Admin@123'); check('second business Admin login works', $sky !== null);
if (!$adm || !$bil || !$hin || !$sky) { echo "Seed data missing: run  php bin/seed_demo.php\n"; exit(1); }
$r = call('GET', '/auth/me', null, $adm); check('/auth/me returns user, role and business', data($r)['user']['role'] === 'admin' && isset(data($r)['business']['settings']) && !isset(data($r)['user']['passwordHash']) && !str_contains($r['raw'], 'password'));

$tmp = login('hina@northwind.demo', 'Agent@123'); call('POST', '/auth/logout', [], $tmp);
check('logout invalidates the token (401 afterwards)', call('GET', '/auth/me', null, $tmp)['status'] === 401);

// throttle (unique throw-away email so real accounts are not locked)
$lockEmail = "nobody-$run@example.com"; $last = 0;
for ($i = 0; $i < 10; $i++) { $last = call('POST', '/auth/login', ['email' => $lockEmail, 'password' => 'x'])['status']; }
check('repeated failed logins are throttled (429)', $last === 429);

// ---------------------------------------------------------------- registration + token storage
[$t1, $reg1] = register("Alpha $run", "alpha-$run@example.com");
[$t2, $reg2] = register("Beta $run", "beta-$run@example.com");
check('business self-registration creates business + Admin and signs in', $t1 !== '' && $t2 !== '' && data($reg1)['user']['role'] === 'admin');
$r = call('POST', '/auth/register-business', ['businessName' => 'X', 'adminName' => 'Y', 'email' => "alpha-$run@example.com", 'password' => 'Passw0rdTest']); check('duplicate admin email rejected on registration', $r['status'] === 422);
$r = call('POST', '/auth/register-business', ['businessName' => 'X', 'adminName' => 'Y', 'email' => "weak-$run@example.com", 'password' => 'short']); check('weak password rejected on registration', $r['status'] === 422);
spl_autoload_register(function (string $c): void { $f = __DIR__ . '/../src/' . str_replace(['App\\', '\\'], ['', '/'], $c) . '.php'; if (is_file($f)) { require $f; } });
App\Env::load(__DIR__ . '/../.env');
$cnt = (int)App\Db::val('SELECT COUNT(*) FROM api_tokens WHERE token_hash = :t', ['t' => $t1]);
$hashOk = (int)App\Db::val("SELECT COUNT(*) FROM users WHERE email = :e AND password_hash LIKE '\$%' AND password_hash <> 'Passw0rdTest'", ['e' => "alpha-$run@example.com"]);
check('tokens are stored hashed (plain token not in DB)', $cnt === 0 && (int)App\Db::val('SELECT COUNT(*) FROM api_tokens WHERE token_hash = :t', ['t' => hash('sha256', $t1)]) === 1);
check('passwords are stored as secure hashes', $hashOk === 1);

// ---------------------------------------------------------------- customers CRUD (business A = t1)
$r = call('POST', '/customers', ['name' => '', 'phone' => ''], $t1); check('customer validation errors (422 with field messages)', $r['status'] === 422 && isset($r['json']['errors']['name']) && isset($r['json']['errors']['phone']));
$r = call('POST', '/customers', ['name' => 'Alice Alpha', 'phone' => '+92 300 111 2222', 'email' => 'alice@example.com', 'company' => 'Acme', 'details' => 'Prefers mornings'], $t1);
$cA = data($r); check('create customer', $r['status'] === 200 && ($cA['name'] ?? '') === 'Alice Alpha' && $cA['company'] === 'Acme');
$r = call('POST', '/customers', ['name' => 'Alice Again', 'phone' => '0300 1112222'], $t1); check('duplicate customer (same phone, different format) returns 409 DUPLICATE', $r['status'] === 409 && ($r['json']['code'] ?? '') === 'DUPLICATE' && ($r['json']['data']['customer']['id'] ?? '') === $cA['id']);
$r = call('POST', '/customers', ['name' => 'Alice Again', 'phone' => '0300 1112222', 'allowDuplicate' => true], $t1); check('duplicate can be created when explicitly allowed', $r['status'] === 200); $cDup = data($r);
$r = call('GET', '/customers/check-duplicate?phone=' . urlencode('0300-111-2222'), null, $t1); check('duplicate check endpoint finds existing customer', data($r)['customer'] !== null);
$r = call('PUT', '/customers/' . $cA['id'], ['name' => 'Alice A.', 'phone' => '+92 300 111 2222', 'email' => 'alice@example.com'], $t1); check('update customer', data($r)['name'] === 'Alice A.');
$r = call('GET', '/customers?search=Alice&pageSize=1&page=1', null, $t1); check('search + pagination (meta.total counts all matches)', ($r['json']['meta']['total'] ?? 0) === 2 && count(data($r)) === 1);
$r = call('GET', "/customers?search=" . urlencode("' OR 1=1 --"), null, $t1); check('SQL injection in search is harmless', $r['status'] === 200 && count(data($r)) === 0);
$r = call('PATCH', '/customers/' . $cDup['id'] . '/status', ['status' => 'inactive'], $t1); check('deactivate customer', data($r)['status'] === 'inactive');
$r = call('DELETE', '/customers/' . $cDup['id'], null, $t1); check('delete customer without records succeeds', $r['status'] === 200 && call('GET', '/customers/' . $cDup['id'], null, $t1)['status'] === 404);

// ---------------------------------------------------------------- business isolation (t2 = business B)
$r = call('POST', '/customers', ['name' => 'Bob Beta', 'phone' => '+92 321 999 8888'], $t2); $cB = data($r);
check('business B can create its own customer', $r['status'] === 200);
check('isolation: B cannot read A\'s customer by id (404)', call('GET', '/customers/' . $cA['id'], null, $t2)['status'] === 404);
check('isolation: B cannot update A\'s customer', call('PUT', '/customers/' . $cA['id'], ['name' => 'Hacked', 'phone' => '1234567'], $t2)['status'] === 404);
check('isolation: B cannot delete A\'s customer', call('DELETE', '/customers/' . $cA['id'], null, $t2)['status'] === 404);
check('isolation: B cannot see A\'s customer in lists/search', count(data(call('GET', '/customers?search=Alice', null, $t2))) === 0);
check('isolation: B cannot read A\'s customer overview', call('GET', '/customers/' . $cA['id'] . '/overview', null, $t2)['status'] === 404);
$r = call('POST', '/leads', ['customerId' => $cA['id'], 'source' => 'phone'], $t2); check('isolation: B cannot create a lead for A\'s customer', $r['status'] === 422);
$r = call('POST', '/quotations', ['customerId' => $cA['id'], 'items' => [['description' => 'x', 'qty' => 1, 'unitPrice' => 1]]], $t2); check('isolation: B cannot create a quotation for A\'s customer', $r['status'] === 422);
$r = call('POST', '/follow-ups', ['customerId' => $cA['id'], 'dueAt' => '2030-01-01T10:00'], $t2); check('isolation: B cannot schedule a follow-up for A\'s customer', $r['status'] === 422);
// seed demo data from other business
$northCust = data(call('GET', '/customers?pageSize=1', null, $adm))[0]['id'];
check('isolation: demo business Skyline cannot read Northwind customer', call('GET', '/customers/' . $northCust, null, $sky)['status'] === 404);
$northInv = data(call('GET', '/invoices?pageSize=1', null, $adm))[0]['id'];
check('isolation: other business cannot read an invoice, payments or receipts', call('GET', '/invoices/' . $northInv, null, $sky)['status'] === 404 && call('GET', '/payments/1', null, $sky)['status'] === 404 && call('GET', '/payments/1/receipt', null, $sky)['status'] === 404);
check('isolation: lists of other business are empty of foreign data', count(data(call('GET', '/invoices', null, $sky))) === 0 && count(data(call('GET', '/payments', null, $sky))) === 0);

// ---------------------------------------------------------------- team / agents / permissions (business A)
$r = call('POST', '/users', ['name' => 'Agent Ann', 'email' => "ann-$run@example.com", 'password' => 'weak', 'scope' => 'assigned', 'permissions' => []], $t1); check('agent creation validates password strength', $r['status'] === 422 && isset($r['json']['errors']['password']));
$perms = ['customers' => ['view' => true, 'create' => true, 'edit' => true], 'leads' => ['view' => true, 'create' => true, 'edit' => true], 'followUps' => ['view' => true, 'create' => true, 'edit' => true], 'services' => ['view' => true], 'quotations' => ['view' => true]];
$r = call('POST', '/users', ['name' => 'Agent Ann', 'email' => "ann-$run@example.com", 'password' => 'AgentPass1', 'scope' => 'assigned', 'permissions' => $perms], $t1); $ann = data($r); check('Admin creates an Agent with permissions', $r['status'] === 200 && ($ann['role'] ?? '') === 'agent');
$tAnn = login("ann-$run@example.com", 'AgentPass1'); check('new Agent can sign in', $tAnn !== null);
check('Agent cannot manage Agents (403)', call('GET', '/users', null, $tAnn)['status'] === 403 && call('POST', '/users', ['name' => 'x'], $tAnn)['status'] === 403);
check('Agent cannot change business settings (403)', call('PUT', '/business', ['name' => 'Hijack'], $tAnn)['status'] === 403);
check('Agent without payments permission gets 403 on /payments', call('GET', '/payments', null, $tAnn)['status'] === 403);
check('Agent without invoices permission gets 403 on /invoices', call('GET', '/invoices', null, $tAnn)['status'] === 403);
check('Agent without delete permission cannot delete/deactivate customers', call('PATCH', '/customers/' . $cA['id'] . '/status', ['status' => 'inactive'], $tAnn)['status'] === 403);
check('Agent without create permission cannot create services', call('POST', '/services', ['name' => 'S', 'price' => 1], $tAnn)['status'] === 403);
check('Agent cannot see admin-only activity log or agent report', call('GET', '/activity', null, $tAnn)['status'] === 403 && call('GET', '/reports/agents', null, $tAnn)['status'] === 403);
check('assigned-scope Agent sees no customers they do not own', count(data(call('GET', '/customers', null, $tAnn))) === 0 && call('GET', '/customers/' . $cA['id'], null, $tAnn)['status'] === 404);
$r = call('POST', '/customers', ['name' => 'Ann Own', 'phone' => '+92 333 555 6666'], $tAnn); $cAnn = data($r);
check('Agent can create a customer (auto-assigned to self) and sees it', $r['status'] === 200 && ($cAnn['assignedTo'] ?? '') === $ann['id'] && count(data(call('GET', '/customers', null, $tAnn))) === 1);
check('Agent cannot reassign customers to others', call('PUT', '/customers/' . $cAnn['id'], ['name' => 'Ann Own', 'phone' => '+92 333 555 6666', 'assignedTo' => data($reg1)['user']['id']], $tAnn)['status'] === 403);
$r = call('PUT', '/users/' . $ann['id'], ['name' => 'Agent Ann', 'email' => "ann-$run@example.com", 'scope' => 'assigned', 'permissions' => $perms + ['payments' => ['view' => true]]], $t1);
check('permission change takes effect immediately (no re-login)', call('GET', '/payments', null, $tAnn)['status'] === 200);
$r = call('PATCH', '/users/' . $ann['id'] . '/status', ['status' => 'inactive'], $t1);
check('deactivating an Agent blocks their existing session at once', call('GET', '/customers', null, $tAnn)['status'] === 401 && login("ann-$run@example.com", 'AgentPass1') === null);
check('demo Agent Bilal (assigned) sees only his customers, Hina (all) sees all', count(data(call('GET', '/customers?pageSize=50', null, $bil))) === 4 && count(data(call('GET', '/customers?pageSize=50', null, $hin))) === 8);
check('demo Agent Bilal has no payments permission', call('GET', '/payments', null, $bil)['status'] === 403);

// ---------------------------------------------------------------- leads
$r = call('POST', '/leads', ['newCustomer' => ['name' => 'Lead Larry', 'phone' => '+92 300 777 0000'], 'source' => 'instagram', 'priority' => 'high', 'requirements' => 'Wants a demo'], $t1); $lead = data($r);
check('create lead with a brand-new customer', $r['status'] === 200 && $lead['source'] === 'instagram' && $lead['priority'] === 'high' && $lead['customerName'] === 'Lead Larry');
$r = call('POST', '/leads', ['newCustomer' => ['name' => 'Lead Larry 2', 'phone' => '0300-777-0000'], 'source' => 'facebook'], $t1); check('creating a lead with a duplicate new customer is blocked (409)', $r['status'] === 409);
$r = call('POST', '/leads', ['customerId' => $lead['customerId'], 'source' => 'bogus'], $t1); check('invalid inquiry source rejected', $r['status'] === 422);
$r = call('PATCH', '/leads/' . $lead['id'] . '/status', ['status' => 'lost'], $t1); check('closing a lead requires a reason', $r['status'] === 422 && isset($r['json']['errors']['reason']));
$r = call('PATCH', '/leads/' . $lead['id'] . '/status', ['status' => 'contacted', 'note' => 'Called'], $t1); check('lead status change works', data($r)['status'] === 'contacted');
$r = call('GET', '/leads/' . $lead['id'], null, $t1); check('lead history records creation and status change', count(data($r)['history']) === 2);
$r = call('GET', '/leads?status=contacted&source=instagram', null, $t1); check('lead filters (status + source)', count(data($r)) === 1);
$r = call('PATCH', '/leads/' . $lead['id'] . '/status', ['status' => 'lost', 'reason' => 'Budget'], $t1); check('lead closed with reason keeps lost_reason', data($r)['lostReason'] === 'Budget');

// ---------------------------------------------------------------- follow-ups + reminders
$leadId = $lead['id']; $cid = $lead['customerId'];
$past = date('Y-m-d\TH:i', time() - 7200); $future = date('Y-m-d\TH:i', time() + 86400 * 2);
$r = call('POST', '/follow-ups', ['customerId' => $cid, 'leadId' => $leadId, 'dueAt' => 'garbage'], $t1); check('follow-up requires a valid date/time', $r['status'] === 422);
$r = call('POST', '/follow-ups', ['customerId' => $cid, 'leadId' => $leadId, 'dueAt' => $past, 'notes' => 'Past one'], $t1); $fuPast = data($r); check('create follow-up', $r['status'] === 200 && $fuPast['storedStatus'] === 'scheduled');
$r = call('POST', '/follow-ups', ['customerId' => $cid, 'leadId' => $leadId, 'dueAt' => $future, 'notes' => 'Future one'], $t1); $fuFut = data($r);
check('a past scheduled follow-up is shown as overdue', $fuPast['status'] === 'overdue');
check('overdue / upcoming views work', count(data(call('GET', '/follow-ups?view=overdue', null, $t1))) === 1 && count(data(call('GET', '/follow-ups?view=upcoming', null, $t1))) === 1);
check('lead.nextFollowUp is kept in sync with scheduled follow-ups', data(call('GET', '/leads/' . $leadId, null, $t1))['nextFollowUp'] === substr($past, 0, 10));
$r = call('POST', '/follow-ups/' . $fuPast['id'] . '/complete', ['outcome' => ''], $t1); check('completing a follow-up requires an outcome', $r['status'] === 422);
$r = call('POST', '/follow-ups/' . $fuPast['id'] . '/complete', ['outcome' => 'Spoke to customer'], $t1); check('complete follow-up', data($r)['status'] === 'completed' && data($r)['outcome'] === 'Spoke to customer');
check('completed follow-up cannot be completed again (409)', call('POST', '/follow-ups/' . $fuPast['id'] . '/complete', ['outcome' => 'again'], $t1)['status'] === 409);
$r = call('POST', '/follow-ups/' . $fuFut['id'] . '/reschedule', ['dueAt' => date('Y-m-d\TH:i', time() + 86400 * 5), 'note' => 'customer travelling'], $t1); check('reschedule follow-up', $r['status'] === 200 && str_contains(data($r)['notes'], 'Rescheduled'));
$r = call('POST', '/reminders/send', [], $t1); check('email reminders: with email NOT configured nothing is reported as sent', $r['status'] === 200 && data($r)['sent'] === 0 && data($r)['configured'] === false);
check('only an Admin can trigger reminder emails', call('POST', '/reminders/send', [], $hin)['status'] === 403);
check('delete follow-up', call('DELETE', '/follow-ups/' . $fuFut['id'], null, $t1)['status'] === 200);

// ---------------------------------------------------------------- services + packages
$r = call('POST', '/services', ['name' => 'Consult', 'price' => 100, 'duration' => '30 min', 'category' => 'Core'], $t1); $svc = data($r); check('create service with duration', $r['status'] === 200 && $svc['duration'] === '30 min');
$r = call('POST', '/services', ['name' => 'Bad', 'price' => -5], $t1); check('negative price rejected', $r['status'] === 422);
$r = call('POST', '/packages', ['name' => 'Bundle', 'price' => 250, 'serviceIds' => [$svc['id']]], $t1); $pkg = data($r); check('create package with services', $r['status'] === 200 && $pkg['serviceIds'] === [$svc['id']]);
check('service used by a package cannot be deleted (409)', call('DELETE', '/services/' . $svc['id'], null, $t1)['status'] === 409);
check('catalog is business-specific', count(data(call('GET', '/services', null, $t2))) === 0);

// ---------------------------------------------------------------- quotations: calculation + conversion
$items = [['type' => 'service', 'refId' => $svc['id'], 'description' => 'Consult', 'qty' => 3, 'unitPrice' => 100, 'discount' => 10], ['type' => 'custom', 'description' => 'Extra', 'qty' => 1, 'unitPrice' => 19.99, 'discount' => 0]];
// gross 319.99, line1 270.00 (after 10%), line2 19.99 => net 289.99, tax 5% = 14.50 (14.4995 -> 14.50), total 304.49
$r = call('POST', '/quotations', ['customerId' => $cid, 'items' => $items, 'taxRate' => 5], $t1); $q = data($r);
check('quotation totals are calculated by the server (subtotal/discount/tax/total)', $r['status'] === 200 && $q['subtotal'] == 319.99 && $q['discountTotal'] == 30.0 && $q['tax'] == 14.5 && $q['total'] == 304.49, json_encode($q));
check('quotation gets a unique sequential number', $q['number'] === 'QT-0001');
$r = call('POST', '/quotations', ['customerId' => $cid, 'items' => $items, 'taxRate' => 5, 'total' => 1, 'subtotal' => 1], $t1); check('client-sent totals are ignored (server recalculates)', data($r)['total'] == 304.49 && data($r)['number'] === 'QT-0002');
$r = call('POST', '/quotations', ['customerId' => $cid, 'items' => [['description' => 'x', 'qty' => 0, 'unitPrice' => 5]]], $t1); check('invalid line item (qty 0) rejected', $r['status'] === 422);
$r = call('POST', '/quotations', ['customerId' => $cid, 'items' => []], $t1); check('quotation needs at least one line', $r['status'] === 422);
check('quotation expiry before date rejected', call('POST', '/quotations', ['customerId' => $cid, 'date' => '2026-05-10', 'expiryDate' => '2026-05-01', 'items' => $items], $t1)['status'] === 422);
check('cannot convert a draft quotation (409)', call('POST', '/quotations/' . $q['id'] . '/convert-to-invoice', [], $t1)['status'] === 409);
check('quotation status flow draft -> sent -> accepted', data(call('PATCH', '/quotations/' . $q['id'] . '/status', ['status' => 'sent'], $t1))['status'] === 'sent' && data(call('PATCH', '/quotations/' . $q['id'] . '/status', ['status' => 'accepted'], $t1))['status'] === 'accepted');
$r = call('POST', '/quotations', ['customerId' => $cid, 'date' => date('Y-m-d', time() - 86400 * 20), 'expiryDate' => date('Y-m-d', time() - 86400 * 10), 'items' => $items, 'status' => 'sent'], $t1);
check('a sent quotation past its expiry date is reported as expired', data($r)['status'] === 'expired');
$r = call('POST', '/quotations/' . $q['id'] . '/convert-to-invoice', ['dueDate' => date('Y-m-d', time() + 86400 * 10)], $t1); $inv = data($r)['invoice'];
check('convert accepted quotation -> issued invoice with identical totals and items', $r['status'] === 200 && $inv['total'] == 304.49 && $inv['status'] === 'issued' && $inv['quotationId'] === $q['id'] && count(data(call('GET', '/invoices/' . $inv['id'], null, $t1))['items']) === 2);
$qAfter = data(call('GET', '/quotations/' . $q['id'], null, $t1)); check('original quotation is preserved and linked to the invoice', $qAfter['invoiceId'] === $inv['id'] && $qAfter['total'] == 304.49 && $qAfter['invoiceNumber'] === $inv['number']);
check('a quotation cannot be converted twice (409) or edited after conversion', call('POST', '/quotations/' . $q['id'] . '/convert-to-invoice', [], $t1)['status'] === 409 && call('PUT', '/quotations/' . $q['id'], ['customerId' => $cid, 'items' => $items], $t1)['status'] === 409);

// ---------------------------------------------------------------- invoices + payments
check('new issued invoice has number, balance = total, status issued', $inv['number'] === 'INV-0001' && $inv['balance'] == 304.49 && $inv['paid'] == 0.0);
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 100, 'date' => date('Y-m-d'), 'method' => 'cash', 'transactionId' => "TXN-$run-1"], $t1); $p1 = data($r);
check('partial payment recorded with receipt number', $r['status'] === 200 && $p1['receiptNo'] === 'RCPT-0001' && $p1['status'] === 'completed');
$i2 = data(call('GET', '/invoices/' . $inv['id'], null, $t1)); check('invoice shows partially paid with correct balance', $i2['status'] === 'partially_paid' && $i2['paid'] == 100.0 && $i2['balance'] == 204.49);
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 50, 'date' => date('Y-m-d'), 'method' => 'bank_transfer', 'transactionId' => "TXN-$run-1"], $t1); check('duplicate transaction/reference ID is rejected', $r['status'] === 422 && isset($r['json']['errors']['transactionId']));
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 204.50, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1); check('payment exceeding the remaining balance is rejected', $r['status'] === 422 && isset($r['json']['errors']['amount']));
check('zero / negative / non-numeric amounts rejected', call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 0, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 422 && call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => -5, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 422 && call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 'abc', 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 422);
check('payment against another business\'s invoice is rejected', call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 10, 'date' => date('Y-m-d'), 'method' => 'cash'], $t2)['status'] === 404);
check('invoice with payments cannot be edited or cancelled (409)', call('PUT', '/invoices/' . $inv['id'], ['items' => $items], $t1)['status'] === 409 && call('PATCH', '/invoices/' . $inv['id'] . '/status', ['status' => 'cancelled'], $t1)['status'] === 409);
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 204.49, 'date' => date('Y-m-d'), 'method' => 'cheque', 'transactionId' => "TXN-$run-2", 'notes' => 'second part'], $t1); $p2 = data($r); check('second partial payment OK', $r['status'] === 200);
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 100, 'date' => date('Y-m-d'), 'method' => 'cash', 'status' => 'pending'], $t1); $pPend = data($r);
check('pending payment not allowed above the remaining balance', $r['status'] === 422);
$i3 = data(call('GET', '/invoices/' . $inv['id'], null, $t1)); check('invoice becomes paid when balance reaches zero; payment history kept', $i3['status'] === 'paid' && $i3['balance'] == 0.0 && count($i3['payments']) === 2);
check('payments cannot be added to a fully paid invoice', call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 1, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 422);
$r = call('POST', '/payments/' . $p2['id'] . '/void', [], $t1); check('voiding a payment requires a reason', $r['status'] === 422);
$r = call('POST', '/payments/' . $p2['id'] . '/void', ['reason' => 'Cheque bounced'], $t1); check('void payment', data($r)['status'] === 'voided');
$i4 = data(call('GET', '/invoices/' . $inv['id'], null, $t1)); check('voided payment is excluded: balance restored, history preserved', $i4['balance'] == 204.49 && $i4['status'] === 'partially_paid' && count($i4['payments']) === 2);
check('transaction ID of a voided payment can be reused', call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 4.49, 'date' => date('Y-m-d'), 'method' => 'cheque', 'transactionId' => "TXN-$run-2"], $t1)['status'] === 200);
$rc = call('GET', '/payments/' . $p1['id'] . '/receipt', null, $t1); check('receipt data available', data($rc)['payment']['receiptNo'] === 'RCPT-0001' && data($rc)['document']['number'] === $inv['number']);
$r = call('POST', '/payments', ['invoiceId' => $inv['id'], 'amount' => 50, 'date' => date('Y-m-d'), 'method' => 'cash', 'status' => 'pending'], $t1); $pend = data($r);
check('pending payment does not reduce the balance', $r['status'] === 200 && data(call('GET', '/invoices/' . $inv['id'], null, $t1))['balance'] == 200.0);
check('confirm pending payment', data(call('PATCH', '/payments/' . $pend['id'] . '/status', ['status' => 'completed'], $t1))['status'] === 'completed' && data(call('GET', '/invoices/' . $inv['id'], null, $t1))['balance'] == 150.0);
$invD = data(call('POST', '/invoices', ['customerId' => $cid, 'items' => [['description' => 'Draft item', 'qty' => 2, 'unitPrice' => 10]], 'taxRate' => 0], $t1));
check('invoice drafts cannot receive payments', call('POST', '/payments', ['invoiceId' => $invD['id'], 'amount' => 1, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 409);
check('issue then cancel a draft invoice', data(call('PATCH', '/invoices/' . $invD['id'] . '/status', ['status' => 'issued'], $t1))['status'] === 'issued' && data(call('PATCH', '/invoices/' . $invD['id'] . '/status', ['status' => 'cancelled'], $t1))['status'] === 'cancelled');
$invOver = data(call('POST', '/invoices', ['customerId' => $cid, 'date' => date('Y-m-d', time() - 86400 * 30), 'dueDate' => date('Y-m-d', time() - 86400 * 5), 'items' => [['description' => 'Old', 'qty' => 1, 'unitPrice' => 80]], 'taxRate' => 0, 'status' => 'issued'], $t1));
check('unpaid issued invoice past due date is reported as overdue', $invOver['status'] === 'overdue');

// ---------------------------------------------------------------- concurrency: two payments racing for the last balance
$invR = data(call('POST', '/invoices', ['customerId' => $cid, 'items' => [['description' => 'Race', 'qty' => 1, 'unitPrice' => 100]], 'taxRate' => 0, 'status' => 'issued'], $t1));
$procs = [];
for ($i = 0; $i < 2; $i++) {
    $json = json_encode(['invoiceId' => $invR['id'], 'amount' => 100, 'date' => date('Y-m-d'), 'method' => 'cash']);
    $procs[] = proc_open([PHP_BINARY, __DIR__ . '/helper_post.php', $base . '/payments', $t1, $json], [1 => ['pipe', 'w']], $pipes[$i]);
}
$codes = []; foreach ($procs as $i => $p) { $codes[] = trim(stream_get_contents($pipes[$i][1])); proc_close($p); }
sort($codes); $paidR = data(call('GET', '/invoices/' . $invR['id'], null, $t1));
check('concurrent payments cannot over-pay (exactly one wins, balance never negative)', $paidR['balance'] == 0.0 && $paidR['paid'] == 100.0 && $codes === ['200', '422'], 'codes=' . implode(',', $codes) . ' balance=' . $paidR['balance']);

// ---------------------------------------------------------------- subscriptions
$r = call('POST', '/subscriptions', ['customerId' => $cid, 'planType' => 'package', 'planId' => $pkg['id'], 'startDate' => date('Y-m-d', time() - 86400 * 25), 'billingCycle' => 'monthly', 'nextBillingDate' => date('Y-m-d', time() + 86400 * 5)], $t1); $sub = data($r);
check('create subscription (price defaults to the plan price)', $r['status'] === 200 && $sub['price'] == 250.0 && $sub['renewingSoon'] === true);
$r = call('POST', '/subscriptions/' . $sub['id'] . '/renew', [], $t1); $renew = data($r);
check('manual renewal creates an issued invoice and moves the next billing date', $r['status'] === 200 && $renew['invoice']['subscriptionId'] === $sub['id'] && $renew['invoice']['status'] === 'issued' && $renew['subscription']['nextBillingDate'] === date('Y-m-d', strtotime(date('Y-m-d', time() + 86400 * 5) . ' +1 month')));
check('subscription shows associated invoices and history', count(data(call('GET', '/subscriptions/' . $sub['id'], null, $t1))['invoices']) === 1 && count(data(call('GET', '/subscriptions/' . $sub['id'], null, $t1))['history']) >= 2);
check('pause subscription; paused cannot be renewed (409)', data(call('PATCH', '/subscriptions/' . $sub['id'] . '/status', ['status' => 'paused'], $t1))['status'] === 'paused' && call('POST', '/subscriptions/' . $sub['id'] . '/renew', [], $t1)['status'] === 409);
$r = call('POST', '/subscriptions', ['customerId' => $cid, 'planType' => 'service', 'planId' => $svc['id'], 'startDate' => date('Y-m-d', time() - 86400 * 90), 'endDate' => date('Y-m-d', time() - 86400 * 2), 'billingCycle' => 'monthly'], $t1);
check('subscription past its end date is reported as expired', data($r)['status'] === 'expired');
check('cancelled subscription cannot be reactivated', data(call('PATCH', '/subscriptions/' . $sub['id'] . '/status', ['status' => 'cancelled'], $t1))['status'] === 'cancelled' && call('PATCH', '/subscriptions/' . $sub['id'] . '/status', ['status' => 'active'], $t1)['status'] === 409);

// ---------------------------------------------------------------- purchases
$r = call('POST', '/purchases', ['customerId' => $cid, 'date' => date('Y-m-d'), 'items' => [['type' => 'service', 'refId' => $svc['id'], 'description' => 'Consult', 'qty' => 2, 'unitPrice' => 100, 'discount' => 5]]], $t1); $pu = data($r);
check('purchase totals calculated (2 x 100 less 5% = 190)', $r['status'] === 200 && $pu['total'] == 190.0 && $pu['paymentStatus'] === 'unpaid' && str_contains($pu['itemSummary'], 'Consult'));
$r = call('POST', '/payments', ['purchaseId' => $pu['id'], 'amount' => 90, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1); check('payment against a purchase', $r['status'] === 200);
check('purchase becomes partial then paid', data(call('GET', '/purchases/' . $pu['id'], null, $t1))['paymentStatus'] === 'partial' && call('POST', '/payments', ['purchaseId' => $pu['id'], 'amount' => 100, 'date' => date('Y-m-d'), 'method' => 'cash'], $t1)['status'] === 200 && data(call('GET', '/purchases/' . $pu['id'], null, $t1))['paymentStatus'] === 'paid');
check('purchase with payments cannot be edited or cancelled', call('PUT', '/purchases/' . $pu['id'], ['customerId' => $cid, 'date' => date('Y-m-d'), 'items' => [['description' => 'x', 'qty' => 1, 'unitPrice' => 1]]], $t1)['status'] === 409 && call('PATCH', '/purchases/' . $pu['id'] . '/status', ['status' => 'cancelled'], $t1)['status'] === 409);

// ---------------------------------------------------------------- customer overview, reports, dashboard
$ov = data(call('GET', '/customers/' . $cid . '/overview', null, $t1));
check('customer overview aggregates leads, follow-ups, quotations, invoices, purchases, payments, subscriptions, history', count($ov['leads']) === 1 && count($ov['quotations']) >= 3 && count($ov['invoices']) >= 3 && count($ov['payments']) >= 4 && count($ov['subscriptions']) === 2 && count($ov['history']) > 5);
$dash = data(call('GET', '/dashboard', null, $t1));
$rep = data(call('GET', '/reports/payments', null, $t1)); $repInv = data(call('GET', '/reports/invoices', null, $t1)); $out = data(call('GET', '/reports/outstanding', null, $t1));
$dbReceived = (float)App\Db::val("SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN businesses b ON b.id = p.business_id JOIN users u ON u.business_id = b.id WHERE u.email = :e AND p.status = 'completed' AND p.business_id = u.business_id", ['e' => "alpha-$run@example.com"]);
check('dashboard figures come from the database (payments received matches SQL)', abs($dash['payments']['received'] - $dbReceived) < 0.001 && $dash['payments']['received'] > 0, "dash={$dash['payments']['received']} sql=$dbReceived");
check('dashboard invoice/subscription/follow-up/lead sections present', isset($dash['invoices']['outstanding'], $dash['subscriptions']['active'], $dash['followUps']['overdue'], $dash['leads']['byStatus'], $dash['quotations']['total'], $dash['recentActivity']));
check('payments report total equals dashboard received amount', abs(array_sum(array_map(fn($x) => $x['status'] === 'completed' ? $x['amount'] : 0, $rep['rows'])) - $dash['payments']['received']) < 0.001);
check('outstanding report equals dashboard outstanding (invoices + open purchases)', abs($out['summary'][0]['value'] - $dash['sales']['outstanding']) < 0.001, $out['summary'][0]['value'] . ' vs ' . $dash['sales']['outstanding']);
check('invoice report summary is consistent (invoiced - paid = outstanding)', abs($repInv['summary'][1]['value'] - $repInv['summary'][2]['value'] - $repInv['summary'][3]['value']) < 0.001);
$ok = true; foreach (['customers', 'leads', 'agents', 'followups', 'quotations', 'invoices', 'payments', 'outstanding', 'subscriptions', 'sales'] as $t) { $x = call('GET', "/reports/$t?from=2000-01-01&to=2100-01-01", null, $t1); $ok = $ok && $x['status'] === 200 && isset(data($x)['columns'], data($x)['rows']); }
check('all 10 report types return data with date filters', $ok);
check('report date filter excludes out-of-range rows', count(data(call('GET', '/reports/invoices?from=2000-01-01&to=2000-12-31', null, $t1))['rows']) === 0);
$act = call('GET', '/activity?pageSize=5', null, $t1); check('Admin activity log lists important actions', $act['status'] === 200 && count(data($act)) === 5 && $act['json']['meta']['total'] > 20);
check('activity log is isolated per business', count(array_filter(data(call('GET', '/activity?pageSize=100', null, $t2)), fn($a) => str_contains($a['text'], 'Alice'))) === 0);

// ---------------------------------------------------------------- settings
$r = call('PUT', '/business', ['name' => '', 'settings' => []], $t1); check('business profile validation', $r['status'] === 422);
$r = call('PUT', '/business', ['name' => "Alpha $run Ltd", 'type' => 'Clinic', 'email' => 'bad'], $t1); check('invalid business email rejected', $r['status'] === 422);
$r = call('PUT', '/business', ['name' => "Alpha $run Ltd", 'type' => 'Clinic', 'email' => 'hello@alpha.test', 'phone' => '123', 'address' => 'Street 1', 'settings' => ['currency' => 'Rs', 'taxRate' => 17, 'notifications' => ['email' => false]]], $t1);
check('update business profile and settings', $r['status'] === 200 && data($r)['settings']['currency'] === 'Rs' && data($r)['settings']['taxRate'] == 17 && data($r)['settings']['notifications']['email'] === false);
check('email reminders respect the "email notifications" setting', str_contains(data(call('POST', '/reminders/send', [], $t1))['message'], 'turned off'));
$r = call('PUT', '/auth/me', ['name' => 'Admin Renamed', 'currentPassword' => 'wrong', 'newPassword' => 'NewPassw0rd1'], $t1); check('changing password requires the correct current password', $r['status'] === 422);
$r = call('PUT', '/auth/me', ['name' => 'Admin Renamed', 'currentPassword' => 'Passw0rdTest', 'newPassword' => 'NewPassw0rd1'], $t1); check('password change works', $r['status'] === 200 && login("alpha-$run@example.com", 'NewPassw0rd1') !== null && login("alpha-$run@example.com", 'Passw0rdTest') === null);

// ---------------------------------------------------------------- persistence
$again = login("alpha-$run@example.com", 'NewPassw0rd1');
check('data persists across sessions (new login sees earlier records)', $again !== null && count(data(call('GET', '/invoices?pageSize=50', null, $again))) >= 5 && data(call('GET', '/quotations/' . $q['id'], null, $again))['number'] === 'QT-0001');

echo "\n== $pass passed, $fail failed ==\n";
file_put_contents(__DIR__ . '/last_results.json', json_encode(['run' => $run, 'passed' => $pass, 'failed' => $fail, 'results' => $results], JSON_PRETTY_PRINT));
exit($fail > 0 ? 1 : 0);
