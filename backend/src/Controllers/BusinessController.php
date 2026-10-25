<?php
declare(strict_types=1);
namespace App\Controllers;

use App\{Activity, ApiException, Auth, Biz, Db, Perm, Request, Util};

final class BusinessController
{
    public static function show(Request $r, array $p): array
    {
        $u = Auth::require($r);
        return Biz::shape(Biz::find((int)$u['business_id']));
    }

    public static function update(Request $r, array $p): array
    {
        $u = Auth::require($r); Perm::needAdmin($u);
        $b = $r->body; $e = [];
        $row = Biz::find((int)$u['business_id']);
        $name = Util::str($b['name'] ?? ''); $email = Util::str($b['email'] ?? '');
        if ($name === '' || strlen($name) > 150) { $e['name'] = 'Business name is required.'; }
        if ($email !== '' && !Util::isEmail($email)) { $e['email'] = 'Enter a valid email address.'; }
        $logo = $b['logo'] ?? ($row['logo'] ?? '');
        if (!is_string($logo)) { $logo = ''; }
        if ($logo !== '' && (!preg_match('#^data:image/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$#', $logo) || strlen($logo) > 400000)) { $e['logo'] = 'Logo must be a PNG/JPG/GIF/WEBP image under about 250 KB.'; }

        $cur = Biz::settings($row); $in = is_array($b['settings'] ?? null) ? $b['settings'] : [];
        $s = $cur;
        if (array_key_exists('currency', $in)) { $s['currency'] = mb_substr(Util::str($in['currency']), 0, 5) ?: '$'; }
        if (array_key_exists('taxRate', $in)) { if (!is_numeric($in['taxRate']) || $in['taxRate'] < 0 || $in['taxRate'] > 100) { $e['taxRate'] = 'Tax must be between 0 and 100.'; } else { $s['taxRate'] = (float)$in['taxRate']; } }
        foreach (['quotationValidityDays' => [1, 365], 'invoiceDueDays' => [0, 365]] as $k => [$lo, $hi]) {
            if (array_key_exists($k, $in)) { if (!is_numeric($in[$k]) || $in[$k] < $lo || $in[$k] > $hi) { $e[$k] = "Enter a number between $lo and $hi."; } else { $s[$k] = (int)$in[$k]; } }
        }
        if (array_key_exists('defaultCountryCode', $in)) { $s['defaultCountryCode'] = substr(preg_replace('/\D/', '', Util::str($in['defaultCountryCode'])) ?? '', 0, 4); }
        if (array_key_exists('whatsappTemplate', $in)) { $s['whatsappTemplate'] = mb_substr(Util::str($in['whatsappTemplate']), 0, 500); }
        if (is_array($in['notifications'] ?? null)) { foreach (['email', 'sms', 'whatsapp'] as $k) { if (array_key_exists($k, $in['notifications'])) { $s['notifications'][$k] = (bool)$in['notifications'][$k]; } } }
        if ($e) { throw ApiException::validation($e); }

        Db::exec('UPDATE businesses SET name = :n, type = :t, email = :e, phone = :p, address = :a, logo = :l, settings = :s, updated_at = :now WHERE id = :id', [
            'n' => $name, 't' => mb_substr(Util::str($b['type'] ?? $row['type']), 0, 80), 'e' => $email, 'p' => mb_substr(Util::str($b['phone'] ?? ''), 0, 40),
            'a' => mb_substr(Util::str($b['address'] ?? ''), 0, 255), 'l' => $logo, 's' => json_encode($s), 'now' => Util::now(), 'id' => $u['business_id'],
        ]);
        Activity::log($u, 'update', 'business', (int)$u['business_id'], 'Business profile/settings updated');
        return Biz::shape(Biz::find((int)$u['business_id']));
    }
}
