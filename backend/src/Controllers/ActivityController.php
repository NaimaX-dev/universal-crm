<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Auth, Lister, Page, Perm, Request, Util};

final class ActivityController
{
    /** Activity log of the whole business. Admin only. */
    public static function list(Request $r, array $p): Page
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $inner = 'SELECT a.id, a.user_id, a.action, a.entity, a.entity_id, a.text, a.ip, a.created_at, COALESCE(x.name, \'(deleted user)\') AS user_name FROM activity_logs a LEFT JOIN users x ON x.id = a.user_id WHERE a.business_id = :bid';
        $page = Lister::run($inner, ['bid' => $u['business_id']], $r, [
            'search' => ['text', 'user_name'], 'filters' => ['userId' => 'user_id', 'entity' => 'entity', 'action' => 'action'],
            'sorts' => ['createdAt' => 't.created_at', 'userName' => 't.user_name', 'entity' => 't.entity', 'action' => 't.action'], 'sort' => 'createdAt', 'dir' => 'desc', 'date' => 'created_at',
        ]);
        $page->rows = array_map(function ($row) { $s = Util::shape($row); $s['at'] = $s['createdAt']; return $s; }, $page->rows);
        return $page;
    }
}
