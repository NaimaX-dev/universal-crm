<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Db, Lister, Page, Perm, Request, Util};

/** Services and packages (business-specific offerings, managed without code changes). */
final class CatalogController
{
    // ---------------- services ----------------
    public static function serviceShape(array $r): array { return Util::shape($r, ['updated_at']); }

    private static function service(array $u, string $id): array
    {
        $row = Db::one('SELECT * FROM services WHERE id = :id AND business_id = :b', ['id' => (int)$id, 'b' => $u['business_id']]);
        if (!$row) { throw new ApiException(404, 'Service not found.'); }
        return $row;
    }

    public static function listServices(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'view');
        $page = Lister::run('SELECT s.* FROM services s WHERE s.business_id = :bid', ['bid' => $u['business_id']], $r, [
            'search' => ['name', 'description', 'category'], 'filters' => ['status' => 'status'],
            'sorts' => ['name' => 't.name', 'category' => 't.category', 'price' => 't.price', 'status' => 't.status'], 'sort' => 'name',
        ]);
        $page->rows = array_map([self::class, 'serviceShape'], $page->rows);
        return $page;
    }

    public static function showService(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'view');
        return self::serviceShape(self::service($u, $p['id']));
    }

    private static function cleanOffering(array $b): array
    {
        $e = []; $name = Util::str($b['name'] ?? '');
        if ($name === '' || mb_strlen($name) > 150) { $e['name'] = 'Name is required.'; }
        if (!isset($b['price']) || $b['price'] === '' || !is_numeric($b['price']) || (float)$b['price'] < 0 || (float)$b['price'] > 1000000000) { $e['price'] = 'Enter a price of zero or more.'; }
        if ($e) { throw ApiException::validation($e); }
        return ['name' => $name, 'description' => mb_substr(Util::str($b['description'] ?? ''), 0, 5000), 'price' => round((float)$b['price'], 2), 'duration' => mb_substr(Util::str($b['duration'] ?? ''), 0, 60), 'category' => mb_substr(Util::str($b['category'] ?? ''), 0, 80)];
    }

    public static function createService(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'create');
        $v = self::cleanOffering($r->body);
        $id = Db::insert("INSERT INTO services (business_id, name, category, description, price, duration, status, created_at, updated_at) VALUES (:b, :n, :c, :d, :p, :du, 'active', :now, :now)", ['b' => $u['business_id'], 'n' => $v['name'], 'c' => $v['category'], 'd' => $v['description'], 'p' => $v['price'], 'du' => $v['duration'], 'now' => Util::now()]);
        Activity::log($u, 'create', 'service', $id, "Service {$v['name']} created");
        return self::serviceShape(self::service($u, (string)$id));
    }

    public static function updateService(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'edit');
        $s = self::service($u, $p['id']); $v = self::cleanOffering($r->body);
        Db::exec('UPDATE services SET name = :n, category = :c, description = :d, price = :p, duration = :du, updated_at = :now WHERE id = :id AND business_id = :b', ['n' => $v['name'], 'c' => $v['category'], 'd' => $v['description'], 'p' => $v['price'], 'du' => $v['duration'], 'now' => Util::now(), 'id' => $s['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'update', 'service', (int)$s['id'], "Service {$v['name']} updated");
        return self::serviceShape(self::service($u, $p['id']));
    }

    public static function serviceStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'delete', 'You are not allowed to deactivate services.');
        $s = self::service($u, $p['id']); $st = Util::str($r->body['status'] ?? '');
        if (!in_array($st, ['active', 'inactive'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::exec('UPDATE services SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $st, 'now' => Util::now(), 'id' => $s['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'status', 'service', (int)$s['id'], "Service {$s['name']} $st");
        return self::serviceShape(self::service($u, $p['id']));
    }

    public static function deleteService(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'services', 'delete');
        $s = self::service($u, $p['id']); $id = (int)$s['id'];
        $used = (int)Db::val('SELECT (SELECT COUNT(*) FROM package_services WHERE service_id = :id) + (SELECT COUNT(*) FROM quotation_items WHERE item_type = \'service\' AND ref_id = :id) + (SELECT COUNT(*) FROM invoice_items WHERE item_type = \'service\' AND ref_id = :id) + (SELECT COUNT(*) FROM purchase_items WHERE item_type = \'service\' AND ref_id = :id) + (SELECT COUNT(*) FROM subscriptions WHERE plan_type = \'service\' AND plan_id = :id)', ['id' => $id]);
        if ($used > 0) { throw new ApiException(409, 'This service is used in packages, documents or subscriptions and cannot be deleted. Deactivate it instead.', null, 'IN_USE'); }
        Db::exec('DELETE FROM services WHERE id = :id AND business_id = :b', ['id' => $id, 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'service', $id, "Service {$s['name']} deleted");
        return ['ok' => true];
    }

    // ---------------- packages ----------------
    private static function package(array $u, string $id): array
    {
        $row = Db::one('SELECT * FROM packages WHERE id = :id AND business_id = :b', ['id' => (int)$id, 'b' => $u['business_id']]);
        if (!$row) { throw new ApiException(404, 'Package not found.'); }
        return $row;
    }

    private static function packageShape(array $r): array
    {
        $s = Util::shape($r, ['updated_at']);
        $s['serviceIds'] = array_map(fn($x) => (string)$x['service_id'], Db::all('SELECT service_id FROM package_services WHERE package_id = :p ORDER BY service_id', ['p' => $r['id']]));
        return $s;
    }

    public static function listPackages(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'view');
        $page = Lister::run('SELECT p.* FROM packages p WHERE p.business_id = :bid', ['bid' => $u['business_id']], $r, [
            'search' => ['name', 'description'], 'filters' => ['status' => 'status'],
            'sorts' => ['name' => 't.name', 'price' => 't.price', 'status' => 't.status'], 'sort' => 'name',
        ]);
        $page->rows = array_map([self::class, 'packageShape'], $page->rows);
        return $page;
    }

    public static function showPackage(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'view');
        return self::packageShape(self::package($u, $p['id']));
    }

    private static function syncPackageServices(array $u, int $pid, mixed $ids): void
    {
        Db::exec('DELETE FROM package_services WHERE package_id = :p', ['p' => $pid]);
        foreach (array_unique(array_filter(array_map([Util::class, 'idOrNull'], is_array($ids) ? $ids : []))) as $sid) {
            if (Db::val('SELECT 1 FROM services WHERE id = :id AND business_id = :b', ['id' => $sid, 'b' => $u['business_id']])) {
                Db::exec('INSERT INTO package_services (package_id, service_id) VALUES (:p, :s)', ['p' => $pid, 's' => $sid]);
            }
        }
    }

    public static function createPackage(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'create');
        $v = self::cleanOffering($r->body);
        $id = Db::tx(function () use ($u, $v, $r) {
            $id = Db::insert("INSERT INTO packages (business_id, name, description, price, duration, status, created_at, updated_at) VALUES (:b, :n, :d, :p, :du, 'active', :now, :now)", ['b' => $u['business_id'], 'n' => $v['name'], 'd' => $v['description'], 'p' => $v['price'], 'du' => $v['duration'], 'now' => Util::now()]);
            self::syncPackageServices($u, $id, $r->body['serviceIds'] ?? []);
            Activity::log($u, 'create', 'package', $id, "Package {$v['name']} created");
            return $id;
        });
        return self::packageShape(self::package($u, (string)$id));
    }

    public static function updatePackage(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'edit');
        $pk = self::package($u, $p['id']); $v = self::cleanOffering($r->body);
        Db::tx(function () use ($u, $pk, $v, $r) {
            Db::exec('UPDATE packages SET name = :n, description = :d, price = :p, duration = :du, updated_at = :now WHERE id = :id AND business_id = :b', ['n' => $v['name'], 'd' => $v['description'], 'p' => $v['price'], 'du' => $v['duration'], 'now' => Util::now(), 'id' => $pk['id'], 'b' => $u['business_id']]);
            self::syncPackageServices($u, (int)$pk['id'], $r->body['serviceIds'] ?? []);
            Activity::log($u, 'update', 'package', (int)$pk['id'], "Package {$v['name']} updated");
        });
        return self::packageShape(self::package($u, $p['id']));
    }

    public static function packageStatus(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'delete', 'You are not allowed to deactivate packages.');
        $pk = self::package($u, $p['id']); $st = Util::str($r->body['status'] ?? '');
        if (!in_array($st, ['active', 'inactive'], true)) { throw ApiException::validation(['status' => 'Invalid status.']); }
        Db::exec('UPDATE packages SET status = :s, updated_at = :now WHERE id = :id AND business_id = :b', ['s' => $st, 'now' => Util::now(), 'id' => $pk['id'], 'b' => $u['business_id']]);
        Activity::log($u, 'status', 'package', (int)$pk['id'], "Package {$pk['name']} $st");
        return self::packageShape(self::package($u, $p['id']));
    }

    public static function deletePackage(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::need($u, 'packages', 'delete');
        $pk = self::package($u, $p['id']); $id = (int)$pk['id'];
        $used = (int)Db::val('SELECT (SELECT COUNT(*) FROM quotation_items WHERE item_type = \'package\' AND ref_id = :id) + (SELECT COUNT(*) FROM invoice_items WHERE item_type = \'package\' AND ref_id = :id) + (SELECT COUNT(*) FROM purchase_items WHERE item_type = \'package\' AND ref_id = :id) + (SELECT COUNT(*) FROM subscriptions WHERE plan_type = \'package\' AND plan_id = :id)', ['id' => $id]);
        if ($used > 0) { throw new ApiException(409, 'This package is used in documents or subscriptions and cannot be deleted. Deactivate it instead.', null, 'IN_USE'); }
        Db::exec('DELETE FROM packages WHERE id = :id AND business_id = :b', ['id' => $id, 'b' => $u['business_id']]);
        Activity::log($u, 'delete', 'package', $id, "Package {$pk['name']} deleted");
        return ['ok' => true];
    }
}
