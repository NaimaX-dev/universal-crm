<?php
declare(strict_types=1);
namespace App;

/**
 * Generic filtered / sorted / paginated list over an "inner" SELECT.
 * The inner query already contains the business_id and Agent-scope conditions; this class only adds
 * whitelisted filters, a LIKE search, date range, sorting and LIMIT/OFFSET (ints only).
 */
final class Lister
{
    /**
     * @param array $o keys: search (cols), filters (queryKey=>col), sorts (queryKey=>col), sort, dir, date (col), where (extra SQL), params
     */
    public static function run(string $inner, array $params, Request $req, array $o): Page
    {
        [$where, $wp] = self::where($req, $o);
        $params = array_merge($params, $wp);
        $total = (int)Db::val("SELECT COUNT(*) FROM ($inner) t WHERE 1=1 $where", $params);

        $sortKey = $req->q('sort');
        $col = $o['sorts'][$sortKey] ?? $o['sorts'][$o['sort']] ?? 't.id';
        $dir = strtolower($req->q('dir', $o['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';
        $pageSize = max(1, min(500, (int)($req->q('pageSize', '10') ?: 10)));
        $page = max(1, (int)($req->q('page', '1') ?: 1));
        $offset = ($page - 1) * $pageSize;

        $rows = Db::all("SELECT * FROM ($inner) t WHERE 1=1 $where ORDER BY $col $dir, t.id DESC LIMIT $pageSize OFFSET $offset", $params);
        return new Page($rows, $total, $page, $pageSize);
    }

    public static function all(string $inner, array $params, string $where = '', array $wp = [], string $order = 't.id DESC'): array
    {
        return Db::all("SELECT * FROM ($inner) t WHERE 1=1 $where ORDER BY $order", array_merge($params, $wp));
    }

    private static function where(Request $req, array $o): array
    {
        $sql = ''; $p = [];
        foreach ($o['filters'] ?? [] as $qk => $col) {
            $v = $req->q($qk);
            if ($v !== '') { $sql .= " AND t.$col = :f_$qk"; $p["f_$qk"] = $v; }
        }
        $search = $req->q('search');
        if ($search !== '' && !empty($o['search'])) {
            $parts = [];
            foreach ($o['search'] as $c) { $parts[] = "t.$c LIKE :search"; }
            $sql .= ' AND (' . implode(' OR ', $parts) . ')';
            $p['search'] = '%' . addcslashes($search, '\\%_') . '%';
        }
        if (!empty($o['date'])) {
            $from = $req->q('from'); $to = $req->q('to');
            if ($from !== '' && Util::isDate($from)) { $sql .= " AND DATE(t.{$o['date']}) >= :d_from"; $p['d_from'] = $from; }
            if ($to !== '' && Util::isDate($to)) { $sql .= " AND DATE(t.{$o['date']}) <= :d_to"; $p['d_to'] = $to; }
        }
        if (!empty($o['where'])) { $sql .= ' ' . $o['where']; $p = array_merge($p, $o['params'] ?? []); }
        return [$sql, $p];
    }
}
