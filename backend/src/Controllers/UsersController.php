<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Lister, Page, Perm, Request, Util};

final class UsersController
{
    /** Minimal team list (id, name, role, status) for dropdowns. Available to every signed-in user of the business. */
    public static function team(Request $r, array $p): array
    {
        $u = Auth::require($r);
        $rows = Db::all('SELECT id, name, role, status FROM users WHERE business_id = :b ORDER BY name', ['b' => $u['business_id']]);
        return array_map(fn($x) => ['id' => (string)$x['id'], 'name' => $x['name'], 'role' => $x['role'], 'status' => $x['status']], $rows);
    }

    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $page = Lister::run("SELECT x.* FROM users x WHERE x.business_id = :bid AND x.role = 'agent'", ['bid' => $u['business_id']], $r, [
            'search' => ['name', 'email'], 'filters' => ['status' => 'status'], 'sorts' => ['name' => 't.name', 'email' => 't.email', 'status' => 't.status'], 'sort' => 'name',
        ]);
        $page->rows = array_map(fn($x) => Auth::publicUser($x), $page->rows);
        return $page;
    }

    private static function agent(array $u, string $id): array
    {
        $row = Db::one("SELECT * FROM users WHERE id = :id AND business_id = :b AND role = 'agent'", ['id' => (int)$id, 'b' => $u['business_id']]);
        if (!$row) { throw new ApiException(404, 'Agent not found.'); }
        return $row;
    }

    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        return Auth::publicUser(self::agent($u, $p['id']));
    }

    private static function validate(array $b, ?array $existing): array
    {
        $e = [];
        $name = Util::str($b['name'] ?? ''); $email = strtolower(Util::str($b['email'] ?? '')); $scope = Util::str($b['scope'] ?? '');
        $pw = is_string($b['password'] ?? null) ? $b['password'] : '';
        if ($name === '' || strlen($name) > 120) { $e['name'] = 'Name is required.'; }
        if (!Util::isEmail($email)) { $e['email'] = 'Enter a valid email address.'; }
        elseif (Db::val('SELECT 1 FROM users WHERE email = :e AND id <> :id', ['e' => $email, 'id' => $existing['id'] ?? 0])) { $e['email'] = 'This email is already used by another account.'; }
        if (!$existing && $pw === '') { $e['password'] = 'Password is required.'; }
        elseif ($pw !== '' && ($m = Auth::passwordErrors($pw))) { $e['password'] = $m; }
        if (!in_array($scope, ['assigned', 'all'], true)) { $e['scope'] = 'Choose a record access scope.'; }
        if ($e) { throw ApiException::validation($e); }
        return ['name' => $name, 'email' => $email, 'scope' => $scope, 'phone' => mb_substr(Util::str($b['phone'] ?? ''), 0, 40), 'password' => $pw, 'permissions' => Perm::sanitize($b['permissions'] ?? [])];
    }

    public static function create(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $v = self::validate($r->body, null);
        $id = Db::insert("INSERT INTO users (business_id, name, email, phone, password_hash, role, status, scope, permissions, created_at, updated_at) VALUES (:b, :n, :e, :ph, :h, 'agent', 'active', :s, :perm, :now, :now)", [
            'b' => $u['business_id'], 'n' => $v['name'], 'e' => $v['email'], 'ph' => $v['phone'], 'h' => Auth::hash($v['password']), 's' => $v['scope'], 'perm' => json_encode($v['permissions']), 'now' => Util::now(),
        ]);
        Activity::log($u, 'create', 'agent', $id, "Agent {$v['name']} created");
        return Auth::publicUser(self::agent($u, (string)$id));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $a = self::agent($u, $p['id']);
        $v = self::validate($r->body, $a);
        Db::exec('UPDATE users SET name = :n, email = :e, phone = :ph, scope = :s, permissions = :perm, updated_at = :now WHERE id = :id', ['n' => $v['name'], 'e' => $v['email'], 'ph' => $v['phone'], 's' => $v['scope'], 'perm' => json_encode($v['permissions']), 'now' => Util::now(), 'id' => $a['id']]);
        if ($v['password'] !== '') { Db::exec('UPDATE users SET password_hash = :h WHERE id = :id', ['h' => Auth::hash($v['password']), 'id' => $a['id']]); Auth::revokeAll((int)$a['id']); }
        Activity::log($u, 'update', 'agent', (int)$a['id'], "Agent {$v['name']} updated");
        return Auth::publicUser(self::agent($u, $p['id']));
    }

    public static function setStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $a = self::agent($u, $p['id']);
        $s = Util::str($r->body['status'] ?? '');
        if (!in_array($s, ['active', 'inactive'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::exec('UPDATE users SET status = :s, updated_at = :now WHERE id = :id', ['s' => $s, 'now' => Util::now(), 'id' => $a['id']]);
        if ($s === 'inactive') { Auth::revokeAll((int)$a['id']); }
        Activity::log($u, 'status', 'agent', (int)$a['id'], "Agent {$a['name']} " . ($s === 'active' ? 'activated' : 'deactivated'));
        return Auth::publicUser(self::agent($u, $p['id']));
    }

    public static function activity(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $a = self::agent($u, $p['id']);
        $rows = Db::all('SELECT id, text, created_at FROM activity_logs WHERE business_id = :b AND user_id = :u ORDER BY id DESC LIMIT 40', ['b' => $u['business_id'], 'u' => $a['id']]);
        return Util::shapeAll($rows);
    }
}
