<?php
declare(strict_types=1);
namespace App;

/** All money maths happens here, on the server, in integer cents to avoid floating-point drift. */
final class Money
{
    private static function cents(float|int|string $v): int { return (int)round(((float)$v) * 100); }

    /**
     * Validates line items and computes totals.
     * line = qty * unit price - line discount%; subtotal = sum of gross lines; discount = gross - net; tax on net.
     * @return array{items:array,subtotal:float,discountTotal:float,tax:float,total:float}
     */
    public static function compute(mixed $rawItems, float|int|string $taxRate): array
    {
        if (!is_array($rawItems) || count($rawItems) === 0) { throw ApiException::validation(['items' => 'Add at least one line item.']); }
        if (count($rawItems) > 100) { throw ApiException::validation(['items' => 'A document can have at most 100 lines.']); }
        $rate = (float)$taxRate;
        if ($rate < 0 || $rate > 100) { throw ApiException::validation(['taxRate' => 'Tax must be between 0 and 100.']); }

        $items = []; $grossC = 0; $netC = 0; $n = 0;
        foreach (array_values($rawItems) as $raw) {
            $n++;
            if (!is_array($raw)) { throw ApiException::validation(['items' => "Line $n is invalid."]); }
            $desc = Util::str($raw['description'] ?? '');
            $qty = is_numeric($raw['qty'] ?? null) ? (float)$raw['qty'] : -1;
            $unit = is_numeric($raw['unitPrice'] ?? null) ? (float)$raw['unitPrice'] : -1;
            $disc = is_numeric($raw['discount'] ?? 0) ? (float)($raw['discount'] ?? 0) : -1;
            if ($desc === '' || strlen($desc) > 255) { throw ApiException::validation(['items' => "Line $n: description is required (max 255 characters)."]); }
            if (!($qty > 0) || $qty > 1000000) { throw ApiException::validation(['items' => "Line $n: quantity must be greater than zero."]); }
            if ($unit < 0 || $unit > 1000000000) { throw ApiException::validation(['items' => "Line $n: unit price must be zero or more."]); }
            if ($disc < 0 || $disc > 100) { throw ApiException::validation(['items' => "Line $n: discount must be between 0 and 100."]); }
            $type = in_array($raw['type'] ?? '', ['service', 'package'], true) ? $raw['type'] : 'custom';
            $grossLine = self::cents($qty * $unit);
            $lineNet = (int)round($grossLine * (1 - $disc / 100));
            $grossC += $grossLine; $netC += $lineNet;
            $items[] = ['type' => $type, 'refId' => Util::idOrNull($raw['refId'] ?? null), 'description' => $desc, 'qty' => $qty, 'unitPrice' => round($unit, 2), 'discount' => $disc, 'lineTotal' => $lineNet / 100];
        }
        $taxC = (int)round($netC * $rate / 100);
        return ['items' => $items, 'subtotal' => $grossC / 100, 'discountTotal' => ($grossC - $netC) / 100, 'tax' => $taxC / 100, 'total' => ($netC + $taxC) / 100];
    }
}
