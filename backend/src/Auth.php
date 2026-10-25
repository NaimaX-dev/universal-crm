<?php
declare(strict_types=1);
namespace App;

/**
 * Authentication: opaque random bearer tokens. Only the SHA-256 hash of a token is stored, so a database leak does
 * not reveal usable tokens. Users, role, permissions and business status are re-read from the database on EVERY
 * request, so deactivation or permission changes take effect immediately.
 */
final class Auth
{
    private static ?array $user = null;
    private static ?string $tokenHash = null;

    public static function passwordErrors(string $pw): ?string
    {
        if (strlen($pw) < 8) { return 'Use at least 8 characters.'; }
        if (strlen($pw) > 200) { return 'Password is too long.'; }
        if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) { return 'Use at least one letter and one number.'; }
        return null;
    }

    public static function hash(string $pw): string { return password_hash($pw, PASSWORD_DEFAULT); }

    public static function issueToken(int $userId, Request $req): string
    {
        $token = bin2hex(random_bytes(32));
        $ttl = max(1, Env::int('TOKEN_TTL_HOURS', 12));
        $now = new \DateTimeImmutable('now', Util::tz());
        Db::exec('INSERT INTO api_tokens (user_id, token_hash, created_at, expires_at, last_used_at, ip, user_agent) VALUES (:u, :h, :c, :e, :c, :ip, :ua)', [
            'u' => $userId, 'h' => hash('sha256', $token), 'c' => $now->format('Y-m-d H:i:s'),
            'e' => $now->modify("+$ttl hour")->format('Y-m-d H:i:s'), 'ip' => $req->ip(), 'ua' => $req->userAgent(),
        ]);
        Db::exec('DELETE FROM api_tokens WHERE expires_at < :now', ['now' => $now->format('Y-m-d H:i:s')]);
        return $token;
    }

    /** Verifies credentials with brute-force throttling. Returns the user row. */
    public static function attempt(string $email, string $password, Request $req): array
    {
        $email = strtolower($email);
        $since = (new \DateTimeImmutable('now', Util::tz()))->modify('-15 minute')->format('Y-m-d H:i:s');
        $fails = (int)Db::val('SELECT COUNT(*) FROM login_attempts WHERE email = :e AND ip = :ip AND success = 0 AND created_at > :s', ['e' => $email, 'ip' => $req->ip(), 's' => $since]);
        if ($fails >= 8) { throw new ApiException(429, 'Too many failed sign-in attempts. Please wait 15 minutes and try again.'); }

        $u = Db::one('SELECT u.*, b.status AS business_status FROM users u JOIN businesses b ON b.id = u.business_id WHERE u.email = :e', ['e' => $email]);
        $ok = $u && password_verify($password, $u['password_hash']);
        Db::exec('INSERT INTO login_attempts (email, ip, success, created_at) VALUES (:e, :ip, :s, :now)', ['e' => $email, 'ip' => $req->ip(), 's' => $ok ? 1 : 0, 'now' => Util::now()]);
        if (!$ok) { throw new ApiException(401, 'Invalid email or password.'); }
        if ($u['status'] !== 'active') { throw new ApiException(403, 'This account has been deactivated. Contact your Admin.'); }
        if ($u['business_status'] !== 'active') { throw new ApiException(403, 'This business account is inactive.'); }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            Db::exec('UPDATE users SET password_hash = :h WHERE id = :id', ['h' => self::hash($password), 'id' => $u['id']]);
        }
        Db::exec('UPDATE users SET last_login_at = :now WHERE id = :id', ['now' => Util::now(), 'id' => $u['id']]);
        return $u;
    }

    /** Loads the authenticated user or throws 401. */
    public static function require(Request $req): array
    {
        if (self::$user !== null) { return self::$user; }
        $token = $req->bearer();
        if ($token === null) { throw new ApiException(401, 'You are not signed in.'); }
        $hash = hash('sha256', $token);
        $row = Db::one('SELECT u.*, b.status AS business_status, t.expires_at FROM api_tokens t JOIN users u ON u.id = t.user_id JOIN businesses b ON b.id = u.business_id WHERE t.token_hash = :h', ['h' => $hash]);
        if (!$row || $row['expires_at'] < Util::now()) {
            throw new ApiException(401, 'Your session has expired. Please sign in again.');
        }
        if ($row['status'] !== 'active' || $row['business_status'] !== 'active') { throw new ApiException(401, 'This account has been deactivated.'); }
        $row['permissions'] = Util::jsonDecode($row['permissions'], []);
        self::$user = $row; self::$tokenHash = $hash;
        return $row;
    }

    public static function logout(Request $req): void
    {
        $token = $req->bearer();
        if ($token !== null) { Db::exec('DELETE FROM api_tokens WHERE token_hash = :h', ['h' => hash('sha256', $token)]); }
    }

    public static function revokeAll(int $userId, ?string $exceptHash = null): void
    {
        if ($exceptHash) { Db::exec('DELETE FROM api_tokens WHERE user_id = :u AND token_hash <> :h', ['u' => $userId, 'h' => $exceptHash]); }
        else { Db::exec('DELETE FROM api_tokens WHERE user_id = :u', ['u' => $userId]); }
    }

    public static function currentTokenHash(): ?string { return self::$tokenHash; }

    /** API shape of a user (never includes the password hash). */
    public static function publicUser(array $u): array
    {
        $perms = $u['permissions'];
        if (is_string($perms)) { $perms = Util::jsonDecode($perms, []); }
        return [
            'id' => (string)$u['id'], 'businessId' => (string)$u['business_id'], 'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'],
            'role' => $u['role'], 'status' => $u['status'], 'scope' => $u['scope'], 'permissions' => $perms ?: new \stdClass(), 'createdAt' => str_replace(' ', 'T', (string)$u['created_at']),
        ];
    }
}
