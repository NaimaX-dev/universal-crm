<?php
declare(strict_types=1);
namespace App;

/** Shared helpers for documents that have line items (quotations, invoices, purchases). */
final class Docs
{
    public const TABLES = [
        'quotation' => ['items' => 'quotation_items', 'fk' => 'quotation_id'],
        'invoice' => ['items' => 'invoice_items', 'fk' => 'invoice_id'],
        'purchase' => ['items' => 'purchase_items', 'fk' => 'purchase_id'],
    ];

    /** Replaces all items of a document. Validates that catalog references belong to the business. */
    public static function saveItems(string $kind, int $docId, array $calc, int $businessId): void
    {
        $t = self::TABLES[$kind];
        Db::exec("DELETE FROM {$t['items']} WHERE {$t['fk']} = :id", ['id' => $docId]);
        $line = 0;
        foreach ($calc['items'] as $it) {
            $ref = $it['refId'];
            if ($ref !== null && $it['type'] !== 'custom') {
                $tbl = $it['type'] === 'package' ? 'packages' : 'services';
                if (!Db::val("SELECT 1 FROM $tbl WHERE id = :id AND business_id = :b", ['id' => $ref, 'b' => $businessId])) { throw ApiException::validation(['items' => 'A selected service/package was not found in your business.']); }
            } else { $ref = null; }
            $line++;
            Db::exec("INSERT INTO {$t['items']} ({$t['fk']}, line_no, item_type, ref_id, description, qty, unit_price, discount, line_total) VALUES (:d, :n, :ty, :ref, :de, :q, :up, :di, :lt)", [
                'd' => $docId, 'n' => $line, 'ty' => $it['type'], 'ref' => $ref, 'de' => $it['description'], 'q' => $it['qty'], 'up' => $it['unitPrice'], 'di' => $it['discount'], 'lt' => $it['lineTotal'],
            ]);
        }
    }

    public static function items(string $kind, int $docId): array
    {
        $t = self::TABLES[$kind];
        $rows = Db::all("SELECT item_type, ref_id, description, qty, unit_price, discount, line_total FROM {$t['items']} WHERE {$t['fk']} = :id ORDER BY line_no", ['id' => $docId]);
        return array_map(fn($r) => ['type' => $r['item_type'], 'refId' => $r['ref_id'] === null ? '' : (string)$r['ref_id'], 'description' => $r['description'], 'qty' => (float)$r['qty'], 'unitPrice' => (float)$r['unit_price'], 'discount' => (float)$r['discount'], 'lineTotal' => (float)$r['line_total']], $rows);
    }

    /** Items re-shaped for Money::compute() when copying a document (quotation -> invoice). */
    public static function itemsForCopy(string $kind, int $docId): array
    {
        return array_map(fn($i) => ['type' => $i['type'], 'refId' => $i['refId'] === '' ? null : (int)$i['refId'], 'description' => $i['description'], 'qty' => $i['qty'], 'unitPrice' => $i['unitPrice'], 'discount' => $i['discount']], self::items($kind, $docId));
    }

    /** Validates an optional date; returns Y-m-d. */
    public static function date(mixed $v, string $default, string $field, array &$errors): string
    {
        $s = Util::str($v) ?: $default;
        if (!Util::isDate($s)) { $errors[$field] = 'Enter a valid date.'; return $default; }
        return $s;
    }
}
