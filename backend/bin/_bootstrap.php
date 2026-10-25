<?php
declare(strict_types=1);
// Shared start-up for command line scripts.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Command line only.'); }
spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/../src/' . str_replace(['App\\', '\\'], ['', '/'], $class) . '.php';
    if (is_file($file)) { require $file; }
});
App\Env::load(__DIR__ . '/../.env');
date_default_timezone_set(App\Env::get('APP_TIMEZONE', 'UTC') ?: 'UTC');

function ask(string $label, bool $hidden = false): string
{
    echo $label . ': ';
    if ($hidden && stripos(PHP_OS, 'WIN') !== 0 && function_exists('shell_exec')) {
        shell_exec('stty -echo'); $v = trim((string)fgets(STDIN)); shell_exec('stty echo'); echo "\n"; return $v;
    }
    if ($hidden) { echo "(your typing will be visible on this system) "; }
    return trim((string)fgets(STDIN));
}
function opt(array $argv, string $name): ?string
{
    foreach ($argv as $a) { if (str_starts_with($a, "--$name=")) { return substr($a, strlen($name) + 3); } }
    return null;
}
