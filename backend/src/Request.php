<?php
declare(strict_types=1);
namespace App;

final class Request
{
    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public array $body,
        private array $headers
    ) {}

    public static function capture(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Support running in a sub-folder (e.g. XAMPP: http://localhost/crm-api/public/...)
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        foreach ([$base, rtrim(dirname($base), '/')] as $prefix) {
            if ($prefix !== '' && $prefix !== '.' && str_starts_with($uri, $prefix . '/')) { $uri = substr($uri, strlen($prefix)); break; }
        }
        $uri = '/' . trim($uri, '/');
        if (str_starts_with($uri, '/index.php')) { $uri = '/' . ltrim(substr($uri, 10), '/'); }

        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) { $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v; }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) { $headers['content-type'] = (string)$_SERVER['CONTENT_TYPE']; }
        if (!isset($headers['authorization']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) { $headers['authorization'] = (string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION']; }
        if (!isset($headers['authorization']) && function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { $headers[strtolower($k)] = (string)$v; }
        }

        $body = [];
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $raw = file_get_contents('php://input') ?: '';
            if (strlen($raw) > 2_000_000) { throw new ApiException(413, 'Request body is too large.'); }
            if (trim($raw) !== '') {
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) { throw new ApiException(400, 'Request body must be valid JSON.'); }
                $body = $decoded;
            }
        }
        return new self($method, $uri, $_GET, $body, $headers);
    }

    public function header(string $name): ?string { return $this->headers[strtolower($name)] ?? null; }

    public function bearer(): ?string
    {
        $h = $this->header('authorization');
        if ($h !== null && preg_match('/^Bearer\s+([A-Za-z0-9]+)$/', trim($h), $m)) { return $m[1]; }
        return null;
    }

    public function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
    public function userAgent(): string { return substr((string)($this->header('user-agent') ?? ''), 0, 255); }
    public function q(string $key, string $default = ''): string { $v = $this->query[$key] ?? $default; return is_scalar($v) ? trim((string)$v) : $default; }
}
