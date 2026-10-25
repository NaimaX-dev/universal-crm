<?php
declare(strict_types=1);
namespace App;

final class Util
{
    private const FLOAT_KEYS = ['price', 'total', 'subtotal', 'discount_total', 'tax_total', 'tax', 'tax_rate', 'amount', 'paid', 'balance', 'unit_price', 'line_total', 'qty', 'discount'];
    private const ID_KEYS = ['assigned_to', 'created_by', 'recorded_by', 'responsible_id', 'user_id'];

    public static function tz(): \DateTimeZone { return new \DateTimeZone(Env::get('APP_TIMEZONE', 'UTC') ?: 'UTC'); }
    public static function now(): string { return (new \DateTimeImmutable('now', self::tz()))->format('Y-m-d H:i:s'); }
    public static function today(): string { return (new \DateTimeImmutable('now', self::tz()))->format('Y-m-d'); }

    /** Coerces any scalar to a trimmed string; arrays/null become ''. */
    public static function str(mixed $v): string { return is_scalar($v) ? trim((string)$v) : ''; }

    public static function isEmail(string $s): bool { return (bool)filter_var($s, FILTER_VALIDATE_EMAIL) && strlen($s) <= 190; }

    public static function isDate(string $s): bool
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $s);
        return $d !== false && $d->format('Y-m-d') === $s;
    }

    /** Accepts 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DD HH:MM[:SS]' and returns 'Y-m-d H:i:s' or null. */
    public static function parseDateTime(string $s): ?string
    {
        $s = str_replace('T', ' ', trim($s));
        foreach (['Y-m-d H:i:s', 'Y-m-d H:i'] as $f) {
            $d = \DateTimeImmutable::createFromFormat('!' . $f, $s);
            if ($d !== false && $d->format($f) === $s) { return $d->format('Y-m-d H:i:s'); }
        }
        return null;
    }

    public static function addDays(string $date, int $n): string
    {
        return (new \DateTimeImmutable($date))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d');
    }

    /** Adds months and clamps to the last day of the month (31 Jan + 1 month = 28/29 Feb). */
    public static function addMonths(string $date, int $n): string
    {
        $d = new \DateTimeImmutable($date);
        $day = (int)$d->format('j');
        $first = $d->modify('first day of this month')->modify(($n >= 0 ? '+' : '') . $n . ' month');
        $last = (int)$first->format('t');
        return $first->setDate((int)$first->format('Y'), (int)$first->format('n'), min($day, $last))->format('Y-m-d');
    }

    public static function phoneNorm(string $phone): string
    {
        $d = preg_replace('/\D+/', '', $phone) ?? '';
        return strlen($d) >= 7 ? substr($d, -9) : $d;
    }

    public static function money(float|int|string $v): float { return round((float)$v, 2); }

    public static function snakeToCamel(string $s): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $s))));
    }

    /**
     * Turns a DB row (snake_case) into the API shape (camelCase): ids become strings, money becomes float,
     * *_at timestamps become ISO-like local strings.
     */
    public static function shape(array $row, array $drop = []): array
    {
        $out = [];
        foreach ($row as $k => $v) {
            if (in_array($k, $drop, true)) { continue; }
            if ($v !== null) {
                if ($k === 'id' || str_ends_with($k, '_id') || in_array($k, self::ID_KEYS, true)) { $v = (string)$v; }
                elseif (in_array($k, self::FLOAT_KEYS, true)) { $v = (float)$v; }
                elseif ($k === 'due_at' || $k === 'completed_at') { $v = substr(str_replace(' ', 'T', (string)$v), 0, 16); }
                elseif (str_ends_with($k, '_at')) { $v = str_replace(' ', 'T', (string)$v); }
            } else {
                $v = ($k === 'id' || str_ends_with($k, '_id') || in_array($k, self::ID_KEYS, true) || str_ends_with($k, '_at')) ? '' : $v;
                if (is_null($v)) { $v = ''; }
            }
            $out[self::snakeToCamel($k)] = $v;
        }
        return $out;
    }

    /** @param array<int,array<string,mixed>> $rows */
    public static function shapeAll(array $rows, array $drop = []): array
    {
        return array_map(fn($r) => self::shape($r, $drop), $rows);
    }

    public static function jsonDecode(?string $s, mixed $default = []): mixed
    {
        if ($s === null || $s === '') { return $default; }
        $d = json_decode($s, true);
        return $d === null ? $default : $d;
    }

    public static function idOrNull(mixed $v): ?int
    {
        $s = self::str($v);
        return ($s !== '' && ctype_digit($s) && (int)$s > 0) ? (int)$s : null;
    }
}
