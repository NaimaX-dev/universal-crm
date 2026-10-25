<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Env, Perm, Request, Util};

final class AuthController
{
    public static function options(Request $r, array $p): array
    {
        return ['registrationEnabled' => Env::bool('ALLOW_BUSINESS_REGISTRATION', false), 'forgotPasswordEnabled' => false];
    }

    public static function login(Request $r, array $p): array
    {
        $email = strtolower(Util::str($r->body['email'] ?? ''));
        $password = is_string($r->body['password'] ?? null) ? $r->body['password'] : '';
        if ($email === '' || $password === '') {
            $e = [];
            if ($email === '') { $e['email'] = 'Enter your email address.'; }
            if ($password === '') { $e['password'] = 'Enter your password.'; }
            throw ApiException::validation($e, 'Enter your email and password.');
        }
        $u = Auth::attempt($email, $password, $r);
        $token = Auth::issueToken((int)$u['id'], $r);
        Activity::log($u, 'login', 'user', (int)$u['id'], 'Signed in');
        return ['token' => $token, 'user' => Auth::publicUser($u), 'business' => Biz::shape(Biz::find((int)$u['business_id']))];
    }

    /** Creates a business + its first Admin. Only available when ALLOW_BUSINESS_REGISTRATION=true. */
    public static function register(Request $r, array $p): array
    {
        if (!Env::bool('ALLOW_BUSINESS_REGISTRATION', false)) {
            throw new ApiException(403, 'Self-registration is disabled. Ask the system administrator to create your business (php backend/bin/create_business.php).');
        }
        $b = $r->body; $e = [];
        $name = Util::str($b['businessName'] ?? ''); $type = Util::str($b['businessType'] ?? '');
        $admin = Util::str($b['adminName'] ?? ''); $email = strtolower(Util::str($b['email'] ?? '')); $pw = is_string($b['password'] ?? null) ? $b['password'] : '';
        if ($name === '' || strlen($name) > 150) { $e['businessName'] = 'Business name is required.'; }
        if ($admin === '' || strlen($admin) > 120) { $e['adminName'] = 'Your name is required.'; }
        if (!Util::isEmail($email)) { $e['email'] = 'Enter a valid email address.'; }
        elseif (Db::val('SELECT 1 FROM users WHERE email = :e', ['e' => $email])) { $e['email'] = 'This email is already registered.'; }
        if ($m = Auth::passwordErrors($pw)) { $e['password'] = $m; }
        if ($e) { throw ApiException::validation($e); }

        $user = self::createBusinessWithAdmin($name, $type, $email, $admin, $pw);
        $token = Auth::issueToken((int)$user['id'], $r);
        return ['token' => $token, 'user' => Auth::publicUser($user), 'business' => Biz::shape(Biz::find((int)$user['business_id']))];
    }

    /** Shared with bin/create_business.php. Returns the admin user row. */
    public static function createBusinessWithAdmin(string $name, string $type, string $email, string $adminName, string $password): array
    {
        return Db::tx(function () use ($name, $type, $email, $adminName, $password) {
            $now = Util::now();
            $bid = Db::insert('INSERT INTO businesses (name, type, settings, created_at, updated_at) VALUES (:n, :t, :s, :now, :now)', ['n' => $name, 't' => $type, 's' => json_encode(Biz::defaultSettings($name)), 'now' => $now]);
            $perms = [];
            foreach (Perm::MODULES as $m => $actions) { foreach ($actions as $a) { $perms[$m][$a] = true; } }
            $uid = Db::insert('INSERT INTO users (business_id, name, email, password_hash, role, status, scope, permissions, created_at, updated_at) VALUES (:b, :n, :e, :h, \'admin\', \'active\', \'all\', :p, :now, :now)', ['b' => $bid, 'n' => $adminName, 'e' => strtolower($email), 'h' => Auth::hash($password), 'p' => json_encode($perms), 'now' => $now]);
            $user = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $uid]);
            $user['permissions'] = $perms;
            Activity::log($user, 'create', 'business', $bid, 'Business and Admin account created');
            return $user;
        });
    }

    public static function me(Request $r, array $p): array
    {
        $u = Auth::require($r);
        return ['user' => Auth::publicUser($u), 'business' => Biz::shape(Biz::find((int)$u['business_id']))];
    }

    public static function updateMe(Request $r, array $p): array
    {
        $u = Auth::require($r); $b = $r->body; $e = [];
        $name = Util::str($b['name'] ?? ''); $phone = Util::str($b['phone'] ?? '');
        if ($name === '' || strlen($name) > 120) { $e['name'] = 'Name is required.'; }
        $new = is_string($b['newPassword'] ?? null) ? $b['newPassword'] : '';
        if ($new !== '') {
            $cur = is_string($b['currentPassword'] ?? null) ? $b['currentPassword'] : '';
            if (!password_verify($cur, $u['password_hash'])) { $e['currentPassword'] = 'Current password is incorrect.'; }
            if ($m = Auth::passwordErrors($new)) { $e['newPassword'] = $m; }
        }
        if ($e) { throw ApiException::validation($e); }
        Db::exec('UPDATE users SET name = :n, phone = :p, updated_at = :now WHERE id = :id', ['n' => $name, 'p' => mb_substr($phone, 0, 40), 'now' => Util::now(), 'id' => $u['id']]);
        if ($new !== '') {
            Db::exec('UPDATE users SET password_hash = :h WHERE id = :id', ['h' => Auth::hash($new), 'id' => $u['id']]);
            Auth::revokeAll((int)$u['id'], Auth::currentTokenHash());
            Activity::log($u, 'password', 'user', (int)$u['id'], 'Changed own password');
        }
        $fresh = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $u['id']]);
        return ['user' => Auth::publicUser($fresh), 'business' => Biz::shape(Biz::find((int)$u['business_id']))];
    }

    public static function logout(Request $r, array $p): array
    {
        $u = Auth::require($r);
        Auth::logout($r);
        Activity::log($u, 'logout', 'user', (int)$u['id'], 'Signed out');
        return ['ok' => true];
    }
}
