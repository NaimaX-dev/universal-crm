<?php
declare(strict_types=1);
namespace App;

/**
 * Minimal SMTP sender (no external libraries). Returns ['ok'=>bool,'status'=>'sent|failed|skipped','error'=>string].
 * "sent" is returned ONLY when the SMTP server accepted the message (250 reply after DATA).
 * MAIL_DRIVER=log or disabled never sends anything and reports 'skipped'.
 */
final class Mailer
{
    public static function driver(): string { return strtolower(Env::get('MAIL_DRIVER', 'disabled') ?? 'disabled'); }

    public static function configured(): bool
    {
        return self::driver() === 'smtp' && Env::get('MAIL_HOST', '') !== '' && Env::get('MAIL_FROM_ADDRESS', '') !== '';
    }

    public static function send(string $to, string $subject, string $body): array
    {
        $driver = self::driver();
        if ($driver === 'log') {
            $dir = dirname(__DIR__) . '/storage';
            if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
            @file_put_contents($dir . '/mail.log', '[' . Util::now() . "] TO: $to | SUBJECT: $subject\n$body\n---\n", FILE_APPEND);
            return ['ok' => false, 'status' => 'skipped', 'error' => 'MAIL_DRIVER=log: the message was written to storage/mail.log and NOT sent.'];
        }
        if (!self::configured()) { return ['ok' => false, 'status' => 'skipped', 'error' => 'Email is not configured (set MAIL_DRIVER=smtp and the MAIL_* values in backend/.env).']; }
        try {
            self::smtp($to, $subject, $body);
            return ['ok' => true, 'status' => 'sent', 'error' => ''];
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 450)];
        }
    }

    private static function smtp(string $to, string $subject, string $body): void
    {
        $host = (string)Env::get('MAIL_HOST'); $port = Env::int('MAIL_PORT', 587); $enc = strtolower(Env::get('MAIL_ENCRYPTION', 'tls') ?? 'tls');
        $from = (string)Env::get('MAIL_FROM_ADDRESS'); $fromName = Env::get('MAIL_FROM_NAME', 'Universal CRM');
        $user = Env::get('MAIL_USERNAME', ''); $pass = Env::get('MAIL_PASSWORD', '');
        if (preg_match('/[\r\n]/', $to . $subject . $from)) { throw new \RuntimeException('Invalid header characters.'); }

        $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $fp = @stream_socket_client($remote, $errno, $errstr, 15);
        if (!$fp) { throw new \RuntimeException("Cannot connect to SMTP server $host:$port ($errstr)"); }
        stream_set_timeout($fp, 15);
        $read = function () use ($fp): string {
            $out = '';
            while (($line = fgets($fp, 1024)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') { break; } }
            return $out;
        };
        $cmd = function (string $c, array $ok) use ($fp, $read): string {
            fwrite($fp, $c . "\r\n");
            $r = $read();
            if (!in_array((int)substr($r, 0, 3), $ok, true)) { throw new \RuntimeException('SMTP error: ' . trim($r)); }
            return $r;
        };
        $greet = $read();
        if ((int)substr($greet, 0, 3) !== 220) { throw new \RuntimeException('SMTP server did not accept the connection: ' . trim($greet)); }
        $domain = gethostname() ?: 'localhost';
        $cmd("EHLO $domain", [250]);
        if ($enc === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { throw new \RuntimeException('Could not start TLS encryption.'); }
            $cmd("EHLO $domain", [250]);
        }
        if ($user !== '') {
            $cmd('AUTH LOGIN', [334]); $cmd(base64_encode($user), [334]); $cmd(base64_encode((string)$pass), [235]);
        }
        $cmd("MAIL FROM:<$from>", [250]);
        $cmd("RCPT TO:<$to>", [250, 251]);
        $cmd('DATA', [354]);
        $headers = [
            'Date: ' . date('r'), 'From: ' . self::encodeName((string)$fromName) . " <$from>", "To: <$to>", 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
        ];
        $data = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
        fwrite($fp, $data . "\r\n.\r\n");
        $r = $read();
        if ((int)substr($r, 0, 3) !== 250) { throw new \RuntimeException('SMTP server rejected the message: ' . trim($r)); }
        @fwrite($fp, "QUIT\r\n");
        fclose($fp);
    }

    private static function encodeName(string $n): string { return '=?UTF-8?B?' . base64_encode($n) . '?='; }
}
