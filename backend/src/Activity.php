<?php
declare(strict_types=1);

namespace App;

final class Activity
{
    public static function log(
        ?array $u,
        string $action,
        string $entity,
        ?int $entityId,
        string $text,
        ?int $businessId = null
    ): void {
        $bid = $businessId ?? ($u['business_id'] ?? null);

        if ($bid === null) {
            return;
        }

        Db::exec(
            'INSERT INTO activity_logs
            (business_id, user_id, action, entity, entity_id, text, ip, created_at)
            VALUES (:b, :u, :a, :e, :eid, :t, :ip, :now)',
            [
                'b' => $bid,
                'u' => $u['id'] ?? null,
                'a' => $action,
                'e' => $entity,
                'eid' => $entityId,
                't' => mb_substr($text, 0, 500),
                'ip' => substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45),
                'now' => Util::now(),
            ]
        );
    }
}
