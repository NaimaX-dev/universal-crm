<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, Auth, Biz, Db, Env, Mailer, Perm, Request, Util};

/**
 * Email reminders for due follow-ups. A reminder is reported as "sent" ONLY when the SMTP server accepted it.
 * If email is not configured or fails, the follow-up is NOT marked as reminded and the result says so.
 */
final class RemindersController
{
    public static function status(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $settings = Biz::settings(Biz::find((int)$u['business_id']));
        $recent = Db::all('SELECT id, follow_up_id, to_email, subject, status, error, created_at FROM email_logs WHERE business_id = :b ORDER BY id DESC LIMIT 20', ['b' => $u['business_id']]);
        return ['configured' => Mailer::configured(), 'driver' => Mailer::driver(), 'from' => Mailer::configured() ? Env::get('MAIL_FROM_ADDRESS') : '', 'businessEmailEnabled' => (bool)$settings['notifications']['email'], 'recent' => Util::shapeAll($recent)];
    }

    public static function send(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $res = self::run((int)$u['business_id']);
        Activity::log($u, 'reminders', 'follow-up', null, "Email reminders run: {$res['sent']} sent, {$res['failed']} failed, {$res['skipped']} not sent");
        return $res;
    }

    /** Sends reminder emails for all overdue/due follow-ups of one business. Also used by bin/send_reminders.php. */
    public static function run(int $businessId): array
    {
        $biz = Biz::find($businessId); $settings = Biz::settings($biz);
        $res = ['configured' => Mailer::configured(), 'total' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'message' => '', 'results' => []];
        if (empty($settings['notifications']['email'])) { $res['message'] = 'Email notifications are turned off in Settings, so nothing was sent.'; return $res; }

        $due = Db::all("SELECT f.id, f.due_at, f.notes, c.name AS customer_name, c.phone AS customer_phone, u.email AS to_email, u.name AS user_name FROM follow_ups f JOIN customers c ON c.id = f.customer_id JOIN users u ON u.id = f.responsible_id AND u.status = 'active' WHERE f.business_id = :b AND f.status = 'scheduled' AND f.due_at <= :now AND f.reminder_email_sent_at IS NULL ORDER BY f.due_at LIMIT 200", ['b' => $businessId, 'now' => Util::now()]);
        $res['total'] = count($due);
        if (!$due) { $res['message'] = 'No follow-ups need a reminder right now.'; return $res; }
        if (!Mailer::configured()) {
            $res['skipped'] = count($due);
            $res['message'] = 'Email is not configured on the server, so NO emails were sent. Set MAIL_DRIVER=smtp and the MAIL_* values in backend/.env.';
            return $res;
        }
        foreach ($due as $f) {
            $subject = 'Follow-up due: ' . $f['customer_name'];
            $body = "Hello {$f['user_name']},\n\nThis is a reminder from {$biz['name']}.\n\nFollow-up with: {$f['customer_name']} ({$f['customer_phone']})\nDue: " . substr((string)$f['due_at'], 0, 16) . "\nNotes: " . ($f['notes'] ?: '-') . "\n\nPlease open the CRM to complete or reschedule it.\n";
            $m = Mailer::send($f['to_email'], $subject, $body);
            Db::exec('INSERT INTO email_logs (business_id, follow_up_id, to_email, subject, status, error, created_at) VALUES (:b, :f, :t, :s, :st, :e, :now)', ['b' => $businessId, 'f' => $f['id'], 't' => $f['to_email'], 's' => $subject, 'st' => $m['status'], 'e' => $m['error'], 'now' => Util::now()]);
            if ($m['status'] === 'sent') { Db::exec('UPDATE follow_ups SET reminder_email_sent_at = :now WHERE id = :id', ['now' => Util::now(), 'id' => $f['id']]); $res['sent']++; }
            elseif ($m['status'] === 'failed') { $res['failed']++; } else { $res['skipped']++; }
            if (count($res['results']) < 20) { $res['results'][] = ['followUpId' => (string)$f['id'], 'to' => $f['to_email'], 'status' => $m['status'], 'error' => $m['error']]; }
        }
        $res['message'] = "{$res['sent']} email(s) accepted by the mail server, {$res['failed']} failed.";
        return $res;
    }
}
