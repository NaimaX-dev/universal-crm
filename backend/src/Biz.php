<?php
declare(strict_types=1);
namespace App;

/** Business helpers: default settings and the API shape of a business. */
final class Biz
{
    public static function defaultSettings(string $name): array
    {
        return [
            'currency' => '$', 'taxRate' => 0, 'quotationValidityDays' => 14, 'invoiceDueDays' => 14, 'defaultCountryCode' => '',
            'notifications' => ['email' => true, 'sms' => false, 'whatsapp' => true],
            'whatsappTemplate' => 'Hello {name}, this is ' . $name . '. {message}',
        ];
    }

    public static function settings(array $row): array
    {
        $s = Util::jsonDecode($row['settings'] ?? '', []);
        $d = self::defaultSettings((string)$row['name']);
        $merged = array_merge($d, is_array($s) ? $s : []);
        $merged['notifications'] = array_merge($d['notifications'], is_array($s['notifications'] ?? null) ? $s['notifications'] : []);
        return $merged;
    }

    public static function shape(array $row): array
    {
        return [
            'id' => (string)$row['id'], 'name' => $row['name'], 'type' => $row['type'], 'email' => $row['email'], 'phone' => $row['phone'],
            'address' => $row['address'], 'logo' => $row['logo'] ?? '', 'status' => $row['status'], 'settings' => self::settings($row),
        ];
    }

    public static function find(int $id): array
    {
        $row = Db::one('SELECT * FROM businesses WHERE id = :id', ['id' => $id]);
        if (!$row) { throw new ApiException(404, 'Business not found.'); }
        return $row;
    }

    /** Next sequential document number for a business, e.g. INV-0007. Must run inside a transaction for strict ordering. */
    public static function nextNumber(int $businessId, string $type, string $prefix): string
    {
        Db::exec('INSERT INTO document_counters (business_id, doc_type, last_number) VALUES (:b, :t, 1) ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1)', ['b' => $businessId, 't' => $type]);
        $n = (int)Db::val('SELECT last_number FROM document_counters WHERE business_id = :b AND doc_type = :t', ['b' => $businessId, 't' => $type]);
        return $prefix . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
    }
}
