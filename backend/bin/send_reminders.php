<?php
declare(strict_types=1);
/**
 * Sends email reminders for due/overdue follow-ups for every active business.
 * Run it by hand, or schedule it (Windows Task Scheduler / cron) every 15 minutes:
 *     php C:\xampp\htdocs\universal-crm\backend\bin\send_reminders.php
 * A reminder is counted as "sent" only if the SMTP server accepted it.
 */
require __DIR__ . '/_bootstrap.php';

use App\Db;
use App\Controllers\RemindersController;

foreach (Db::all("SELECT id, name FROM businesses WHERE status = 'active'") as $b) {
    $r = RemindersController::run((int)$b['id']);
    echo "[{$b['name']}] due: {$r['total']}, sent: {$r['sent']}, failed: {$r['failed']}, not sent: {$r['skipped']}. {$r['message']}\n";
}
