<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{ApiException, Auth, Db, Perm, Request, Util};

/** Reports are built from live database records, limited to what the signed-in user may see. */
final class ReportsController
{
    private static function col(string $key, string $label, string $type = 'text'): array { return ['key' => $key, 'label' => $label, 'type' => $type]; }
    private static function inRange(mixed $v, string $from, string $to): bool { $d = substr((string)$v, 0, 10); return ($from === '' || $d >= $from) && ($to === '' || $d <= $to); }
    private static function breakdown(array $rows, string $key): array { $o = []; foreach (DashboardController::countBy($rows, $key) as $k => $v) { $o[] = ['label' => (string)$k, 'value' => $v]; } return $o; }
    private static function s(array $rows, string $k): float { return DashboardController::sum($rows, $k); }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r);
        if (!Perm::can($u, 'reports', 'view')) { throw new ApiException(403, 'You do not have permission to view reports.'); }
        $from = Util::isDate($r->q('from')) ? $r->q('from') : ''; $to = Util::isDate($r->q('to')) ? $r->q('to') : '';
        $need = function (string $m) use ($u) { if (!Perm::can($u, $m, 'view')) { throw new ApiException(403, "You do not have permission to view $m data."); } };
        $in = fn($v) => self::inRange($v, $from, $to);
        $rows = fn(string $c, string $m) => DashboardController::rows($u, $c, $m) ?? [];

        switch ($p['type']) {
            case 'customers':
                $need('customers'); $all = $rows(CustomersController::class, 'customers'); $f = array_values(array_filter($all, fn($c) => $in($c['createdAt'])));
                return ['title' => 'Customers', 'summary' => [['label' => 'Customers (all time)', 'value' => count($all)], ['label' => 'Active', 'value' => count(array_filter($all, fn($c) => $c['status'] === 'active'))], ['label' => 'Inactive', 'value' => count(array_filter($all, fn($c) => $c['status'] !== 'active'))], ['label' => 'Added in period', 'value' => count($f)]],
                    'columns' => [self::col('name', 'Customer'), self::col('phone', 'Phone'), self::col('email', 'Email'), self::col('assignedName', 'Assigned to'), self::col('leadCount', 'Leads', 'number'), self::col('status', 'Status', 'status'), self::col('createdAt', 'Added', 'date')], 'rows' => $f];
            case 'leads':
                $need('leads'); $f = array_values(array_filter($rows(LeadsController::class, 'leads'), fn($l) => $in($l['inquiryDate']))); $conv = count(array_filter($f, fn($l) => $l['status'] === 'converted'));
                return ['title' => 'Leads by status and source', 'summary' => [['label' => 'Leads', 'value' => count($f)], ['label' => 'Converted', 'value' => $conv], ['label' => 'Closed / lost', 'value' => count(array_filter($f, fn($l) => $l['status'] === 'lost'))], ['label' => 'Conversion rate', 'value' => ($f ? (int)round($conv / count($f) * 100) : 0) . '%']],
                    'breakdowns' => [['title' => 'By status', 'items' => self::breakdown($f, 'status')], ['title' => 'By source', 'items' => self::breakdown($f, 'source')]],
                    'columns' => [self::col('customerName', 'Customer'), self::col('source', 'Source'), self::col('priority', 'Priority'), self::col('status', 'Status', 'status'), self::col('assignedName', 'Agent'), self::col('inquiryDate', 'Inquiry date', 'date'), self::col('lostReason', 'Lost reason')], 'rows' => $f];
            case 'agents':
                Perm::needAdmin($u);
                $leads = array_filter(DashboardController::rows($u, LeadsController::class) ?? [], fn($l) => $in($l['inquiryDate']));
                $fus = array_filter(DashboardController::rows($u, FollowUpsController::class) ?? [], fn($x) => $in($x['dueAt']));
                $out = [];
                foreach (Db::all("SELECT id, name, status FROM users WHERE business_id = :b AND role = 'agent' ORDER BY name", ['b' => $u['business_id']]) as $a) {
                    $id = (string)$a['id']; $ls = array_filter($leads, fn($l) => $l['assignedTo'] === $id); $cv = count(array_filter($ls, fn($l) => $l['status'] === 'converted')); $mine = array_filter($fus, fn($x) => $x['responsibleId'] === $id);
                    $out[] = ['name' => $a['name'], 'status' => $a['status'], 'customers' => (int)Db::val('SELECT COUNT(*) FROM customers WHERE business_id = :b AND assigned_to = :a', ['b' => $u['business_id'], 'a' => $a['id']]), 'leads' => count($ls), 'converted' => $cv, 'lost' => count(array_filter($ls, fn($l) => $l['status'] === 'lost')), 'rate' => ($ls ? (int)round($cv / count($ls) * 100) : 0) . '%', 'done' => count(array_filter($mine, fn($x) => $x['status'] === 'completed')), 'overdue' => count(array_filter($mine, fn($x) => $x['status'] === 'overdue'))];
                }
                return ['title' => 'Agent performance', 'summary' => [['label' => 'Agents', 'value' => count($out)], ['label' => 'Leads assigned', 'value' => array_sum(array_column($out, 'leads'))], ['label' => 'Converted', 'value' => array_sum(array_column($out, 'converted'))], ['label' => 'Overdue follow-ups', 'value' => array_sum(array_column($out, 'overdue'))]],
                    'columns' => [self::col('name', 'Agent'), self::col('status', 'Status', 'status'), self::col('customers', 'Customers', 'number'), self::col('leads', 'Leads', 'number'), self::col('converted', 'Converted', 'number'), self::col('lost', 'Lost', 'number'), self::col('rate', 'Conversion'), self::col('done', 'Follow-ups done', 'number'), self::col('overdue', 'Overdue', 'number')], 'rows' => $out];
            case 'followups':
                $need('followUps'); $f = array_values(array_filter($rows(FollowUpsController::class, 'followUps'), fn($x) => $in($x['dueAt'])));
                return ['title' => 'Follow-ups and overdue tasks', 'summary' => [['label' => 'Follow-ups', 'value' => count($f)], ['label' => 'Completed', 'value' => count(array_filter($f, fn($x) => $x['status'] === 'completed'))], ['label' => 'Scheduled', 'value' => count(array_filter($f, fn($x) => $x['status'] === 'scheduled'))], ['label' => 'Overdue', 'value' => count(array_filter($f, fn($x) => $x['status'] === 'overdue'))]],
                    'columns' => [self::col('dueAt', 'Due', 'datetime'), self::col('customerName', 'Customer'), self::col('responsibleName', 'Responsible'), self::col('status', 'Status', 'status'), self::col('notes', 'Notes'), self::col('outcome', 'Outcome')], 'rows' => $f];
            case 'quotations':
                $need('quotations'); $f = array_values(array_filter($rows(QuotationsController::class, 'quotations'), fn($q) => $in($q['date']))); $sent = array_filter($f, fn($q) => $q['status'] !== 'draft'); $acc = array_filter($f, fn($q) => $q['status'] === 'accepted');
                return ['title' => 'Quotations and conversion', 'summary' => [['label' => 'Quotations', 'value' => count($f)], ['label' => 'Total value', 'value' => self::s($f, 'total'), 'type' => 'money'], ['label' => 'Accepted', 'value' => count($acc)], ['label' => 'Converted to invoice', 'value' => count(array_filter($f, fn($q) => $q['invoiceId'] !== ''))], ['label' => 'Acceptance rate', 'value' => ($sent ? (int)round(count($acc) / count($sent) * 100) : 0) . '%']],
                    'breakdowns' => [['title' => 'By status', 'items' => self::breakdown($f, 'status')]],
                    'columns' => [self::col('number', 'Number'), self::col('customerName', 'Customer'), self::col('date', 'Date', 'date'), self::col('expiryDate', 'Expires', 'date'), self::col('total', 'Total', 'money'), self::col('status', 'Status', 'status')], 'rows' => $f];
            case 'invoices':
                $need('invoices'); $f = array_values(array_filter($rows(InvoicesController::class, 'invoices'), fn($i) => $in($i['date']))); $live = array_filter($f, fn($i) => !in_array($i['status'], ['draft', 'cancelled'], true));
                return ['title' => 'Invoices and statuses', 'summary' => [['label' => 'Invoices', 'value' => count($f)], ['label' => 'Invoiced', 'value' => self::s($live, 'total'), 'type' => 'money'], ['label' => 'Paid', 'value' => self::s($live, 'paid'), 'type' => 'money'], ['label' => 'Outstanding', 'value' => self::s($live, 'balance'), 'type' => 'money']],
                    'breakdowns' => [['title' => 'By status', 'items' => self::breakdown($f, 'status')]],
                    'columns' => [self::col('number', 'Number'), self::col('customerName', 'Customer'), self::col('date', 'Date', 'date'), self::col('dueDate', 'Due', 'date'), self::col('total', 'Total', 'money'), self::col('paid', 'Paid', 'money'), self::col('balance', 'Balance', 'money'), self::col('status', 'Status', 'status')], 'rows' => $f];
            case 'payments':
                $need('payments'); $f = array_values(array_filter($rows(PaymentsController::class, 'payments'), fn($x) => $in($x['date']))); $done = array_filter($f, fn($x) => $x['status'] === 'completed');
                return ['title' => 'Payments received', 'summary' => [['label' => 'Received (completed)', 'value' => self::s($done, 'amount'), 'type' => 'money'], ['label' => 'Completed payments', 'value' => count($done)], ['label' => 'Pending', 'value' => self::s(array_filter($f, fn($x) => $x['status'] === 'pending'), 'amount'), 'type' => 'money'], ['label' => 'Voided / failed', 'value' => count(array_filter($f, fn($x) => in_array($x['status'], ['voided', 'failed'], true)))]],
                    'columns' => [self::col('receiptNo', 'Receipt'), self::col('date', 'Date', 'date'), self::col('customerName', 'Customer'), self::col('targetNumber', 'For'), self::col('method', 'Method'), self::col('transactionId', 'Transaction ID'), self::col('amount', 'Amount', 'money'), self::col('status', 'Status', 'status')], 'rows' => $f];
            case 'outstanding':
                $need('invoices'); $rowsOut = [];
                foreach ($rows(InvoicesController::class, 'invoices') as $i) { if ($i['storedStatus'] === 'issued' && $i['balance'] > 0) { $rowsOut[] = ['type' => 'Invoice', 'number' => $i['number'], 'customerName' => $i['customerName'], 'dueDate' => $i['dueDate'], 'total' => $i['total'], 'paid' => $i['paid'], 'balance' => $i['balance'], 'status' => $i['status']]; } }
                if (Perm::can($u, 'purchases', 'view')) { foreach ($rows(PurchasesController::class, 'purchases') as $x) { if ($x['invoiceId'] === '' && $x['storedStatus'] === 'recorded' && $x['balance'] > 0) { $rowsOut[] = ['type' => 'Purchase', 'number' => 'Purchase ' . $x['date'], 'customerName' => $x['customerName'], 'dueDate' => '', 'total' => $x['total'], 'paid' => $x['paid'], 'balance' => $x['balance'], 'status' => $x['paymentStatus']]; } } }
                $f = array_values(array_filter($rowsOut, fn($x) => $in($x['dueDate'] ?: Util::today())));
                return ['title' => 'Outstanding balances', 'summary' => [['label' => 'Outstanding', 'value' => self::s($f, 'balance'), 'type' => 'money'], ['label' => 'Overdue', 'value' => self::s(array_filter($f, fn($x) => $x['status'] === 'overdue'), 'balance'), 'type' => 'money'], ['label' => 'Open items', 'value' => count($f)]],
                    'columns' => [self::col('type', 'Type'), self::col('number', 'Reference'), self::col('customerName', 'Customer'), self::col('dueDate', 'Due', 'date'), self::col('total', 'Total', 'money'), self::col('paid', 'Paid', 'money'), self::col('balance', 'Balance', 'money'), self::col('status', 'Status', 'status')], 'rows' => $f];
            case 'subscriptions':
                $need('subscriptions'); $f = array_values(array_filter($rows(SubscriptionsController::class, 'subscriptions'), fn($s) => $from === '' || $in($s['startDate'])));
                $monthly = fn($s) => $s['billingCycle'] === 'monthly' ? $s['price'] : ($s['billingCycle'] === 'quarterly' ? $s['price'] / 3 : $s['price'] / 12);
                $active = array_filter($f, fn($s) => $s['status'] === 'active');
                return ['title' => 'Subscriptions and renewals', 'summary' => [['label' => 'Active', 'value' => count($active)], ['label' => 'Paused / cancelled', 'value' => count(array_filter($f, fn($s) => in_array($s['status'], ['paused', 'cancelled'], true)))], ['label' => 'Renewing in 14 days', 'value' => count(array_filter($f, fn($s) => $s['renewingSoon']))], ['label' => 'Monthly recurring value', 'value' => round(array_sum(array_map($monthly, $active)), 2), 'type' => 'money']],
                    'columns' => [self::col('customerName', 'Customer'), self::col('planName', 'Plan'), self::col('billingCycle', 'Cycle'), self::col('price', 'Price', 'money'), self::col('status', 'Status', 'status'), self::col('nextBillingDate', 'Next billing', 'date'), self::col('endDate', 'Ends', 'date')], 'rows' => $f];
            case 'sales':
                $need('invoices'); $rowsOut = [];
                foreach ($rows(InvoicesController::class, 'invoices') as $i) { if (!in_array($i['status'], ['draft', 'cancelled'], true) && $in($i['date'])) { $rowsOut[] = ['date' => $i['date'], 'type' => 'Invoice', 'number' => $i['number'], 'customerName' => $i['customerName'], 'total' => $i['total'], 'paid' => $i['paid'], 'balance' => $i['balance']]; } }
                if (Perm::can($u, 'purchases', 'view')) { foreach ($rows(PurchasesController::class, 'purchases') as $x) { if ($x['invoiceId'] === '' && $x['storedStatus'] === 'recorded' && $in($x['date'])) { $rowsOut[] = ['date' => $x['date'], 'type' => 'Purchase', 'number' => 'Purchase ' . $x['date'], 'customerName' => $x['customerName'], 'total' => $x['total'], 'paid' => $x['paid'], 'balance' => $x['balance']]; } } }
                usort($rowsOut, fn($a, $b) => strcmp($b['date'], $a['date'])); $total = self::s($rowsOut, 'total');
                return ['title' => 'Sales summary', 'summary' => [['label' => 'Total sales', 'value' => $total, 'type' => 'money'], ['label' => 'Sales records', 'value' => count($rowsOut)], ['label' => 'Collected', 'value' => self::s($rowsOut, 'paid'), 'type' => 'money'], ['label' => 'Average sale', 'value' => $rowsOut ? round($total / count($rowsOut), 2) : 0, 'type' => 'money']],
                    'columns' => [self::col('date', 'Date', 'date'), self::col('type', 'Type'), self::col('number', 'Reference'), self::col('customerName', 'Customer'), self::col('total', 'Total', 'money'), self::col('paid', 'Paid', 'money'), self::col('balance', 'Balance', 'money')], 'rows' => $rowsOut];
            default:
                throw new ApiException(404, 'Unknown report.');
        }
    }
}
