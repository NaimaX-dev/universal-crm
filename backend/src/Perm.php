<?php
declare(strict_types=1);
namespace App;

/** Module/action permissions. Admins can do everything inside their own business. */
final class Perm
{
    public const MODULES = [
        'customers' => ['view', 'create', 'edit', 'delete'],
        'leads' => ['view', 'create', 'edit', 'delete', 'manage'],
        'followUps' => ['view', 'create', 'edit', 'delete', 'manage'],
        'services' => ['view', 'create', 'edit', 'delete'],
        'packages' => ['view', 'create', 'edit', 'delete'],
        'quotations' => ['view', 'create', 'edit', 'delete', 'manage'],
        'invoices' => ['view', 'create', 'edit', 'delete', 'manage'],
        'subscriptions' => ['view', 'create', 'edit', 'delete', 'manage'],
        'purchases' => ['view', 'create', 'edit', 'delete'],
        'payments' => ['view', 'create', 'edit', 'delete', 'manage'],
        'reports' => ['view'],
    ];

    public static function isAdmin(array $u): bool { return $u['role'] === 'admin'; }

    public static function can(array $u, string $module, string $action): bool
    {
        return self::isAdmin($u) || !empty($u['permissions'][$module][$action]);
    }

    public static function need(array $u, string $module, string $action, string $message = 'You do not have permission to do this.'): void
    {
        if (!self::can($u, $module, $action)) { throw new ApiException(403, $message); }
    }

    public static function needAdmin(array $u): void
    {
        if (!self::isAdmin($u)) { throw new ApiException(403, 'Only a Business Admin can do this.'); }
    }

    /** Keeps only known modules/actions with a true value. */
    public static function sanitize(mixed $input): array
    {
        $out = [];
        foreach (self::MODULES as $m => $actions) {
            $out[$m] = [];
            foreach ($actions as $a) { if (!empty($input[$m][$a])) { $out[$m][$a] = true; } }
        }
        return $out;
    }

    /** Record visibility for Agents whose scope is "assigned". Returns [sql, params]; sql starts with ' AND '. */
    public static function scopeSql(array $u, string $kind, string $alias): array
    {
        if (self::isAdmin($u) || $u['scope'] === 'all') { return ['', []]; }
        return match ($kind) {
            'customer' => [" AND $alias.assigned_to = :scope_uid", ['scope_uid' => $u['id']]],
            'lead' => [" AND $alias.assigned_to = :scope_uid", ['scope_uid' => $u['id']]],
            'followup' => [" AND $alias.responsible_id = :scope_uid", ['scope_uid' => $u['id']]],
            // documents / payments: visible when the customer is assigned to this Agent
            'customer_ref' => [" AND $alias.customer_id IN (SELECT sc.id FROM customers sc WHERE sc.business_id = :scope_bid AND sc.assigned_to = :scope_uid)", ['scope_uid' => $u['id'], 'scope_bid' => $u['business_id']]],
            default => ['', []],
        };
    }

    /** Can this user see the customer? (same business AND Agent scope) */
    public static function customerVisible(array $u, int $customerId): bool
    {
        [$sql, $p] = self::scopeSql($u, 'customer', 'c');
        return Db::val('SELECT 1 FROM customers c WHERE c.id = :id AND c.business_id = :bid' . $sql, array_merge(['id' => $customerId, 'bid' => $u['business_id']], $p)) !== null;
    }
}
