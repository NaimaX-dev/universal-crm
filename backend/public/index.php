<?php
declare(strict_types=1);

use App\{ApiException, Env, Page, Request, Router};
use App\Controllers\{ActivityController, AuthController, BusinessController, CatalogController, CustomersController, DashboardController, FollowUpsController, InvoicesController, LeadsController, PaymentsController, PurchasesController, QuotationsController, RemindersController, ReportsController, SubscriptionsController, UsersController};

spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/../src/' . str_replace(['App\\', '\\'], ['', '/'], $class) . '.php';
    if (is_file($file)) { require $file; }
});

Env::load(__DIR__ . '/../.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'UTC') ?: 'UTC');
ini_set('display_errors', '0');
mb_internal_encoding('UTF-8');

function send_json(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

// ---- security + CORS headers ----
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = array_filter(array_map('trim', explode(',', Env::get('CORS_ALLOWED_ORIGINS', 'http://localhost:5173') ?? '')));
if ($origin !== '' && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) {
    header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

$router = new Router();
$r = fn(string $m, string $path, callable $h) => $router->add($m, $path, $h);

$r('GET', '/health', function () { \App\Db::val('SELECT 1'); return ['ok' => true, 'time' => \App\Util::now()]; });
// auth
$r('GET', '/auth/options', [AuthController::class, 'options']);
$r('POST', '/auth/login', [AuthController::class, 'login']);
$r('POST', '/auth/register-business', [AuthController::class, 'register']);
$r('POST', '/auth/logout', [AuthController::class, 'logout']);
$r('GET', '/auth/me', [AuthController::class, 'me']);
$r('PUT', '/auth/me', [AuthController::class, 'updateMe']);
// business, team, agents, activity
$r('GET', '/business', [BusinessController::class, 'show']);
$r('PUT', '/business', [BusinessController::class, 'update']);
$r('GET', '/team', [UsersController::class, 'team']);
$r('GET', '/users', [UsersController::class, 'list']);
$r('POST', '/users', [UsersController::class, 'create']);
$r('GET', '/users/{id}', [UsersController::class, 'show']);
$r('PUT', '/users/{id}', [UsersController::class, 'update']);
$r('PATCH', '/users/{id}/status', [UsersController::class, 'setStatus']);
$r('GET', '/users/{id}/activity', [UsersController::class, 'activity']);
$r('GET', '/activity', [ActivityController::class, 'list']);
// dashboard + reports + reminders
$r('GET', '/dashboard', [DashboardController::class, 'show']);
$r('GET', '/reports/{type}', [ReportsController::class, 'show']);
$r('GET', '/reminders/status', [RemindersController::class, 'status']);
$r('POST', '/reminders/send', [RemindersController::class, 'send']);
// customers
$r('GET', '/customers', [CustomersController::class, 'list']);
$r('POST', '/customers', [CustomersController::class, 'create']);
$r('GET', '/customers/check-duplicate', [CustomersController::class, 'checkDuplicate']);
$r('GET', '/customers/{id}', [CustomersController::class, 'show']);
$r('GET', '/customers/{id}/overview', [CustomersController::class, 'overview']);
$r('PUT', '/customers/{id}', [CustomersController::class, 'update']);
$r('PATCH', '/customers/{id}/status', [CustomersController::class, 'setStatus']);
$r('DELETE', '/customers/{id}', [CustomersController::class, 'delete']);
// leads
$r('GET', '/leads', [LeadsController::class, 'list']);
$r('POST', '/leads', [LeadsController::class, 'create']);
$r('GET', '/leads/{id}', [LeadsController::class, 'show']);
$r('PUT', '/leads/{id}', [LeadsController::class, 'update']);
$r('PATCH', '/leads/{id}/status', [LeadsController::class, 'setStatus']);
$r('DELETE', '/leads/{id}', [LeadsController::class, 'delete']);
// follow-ups
$r('GET', '/follow-ups', [FollowUpsController::class, 'list']);
$r('POST', '/follow-ups', [FollowUpsController::class, 'create']);
$r('GET', '/follow-ups/{id}', [FollowUpsController::class, 'show']);
$r('PUT', '/follow-ups/{id}', [FollowUpsController::class, 'update']);
$r('PATCH', '/follow-ups/{id}/status', [FollowUpsController::class, 'setStatus']);
$r('POST', '/follow-ups/{id}/complete', [FollowUpsController::class, 'complete']);
$r('POST', '/follow-ups/{id}/reschedule', [FollowUpsController::class, 'reschedule']);
$r('DELETE', '/follow-ups/{id}', [FollowUpsController::class, 'delete']);
// services + packages
$r('GET', '/services', [CatalogController::class, 'listServices']);
$r('POST', '/services', [CatalogController::class, 'createService']);
$r('GET', '/services/{id}', [CatalogController::class, 'showService']);
$r('PUT', '/services/{id}', [CatalogController::class, 'updateService']);
$r('PATCH', '/services/{id}/status', [CatalogController::class, 'serviceStatus']);
$r('DELETE', '/services/{id}', [CatalogController::class, 'deleteService']);
$r('GET', '/packages', [CatalogController::class, 'listPackages']);
$r('POST', '/packages', [CatalogController::class, 'createPackage']);
$r('GET', '/packages/{id}', [CatalogController::class, 'showPackage']);
$r('PUT', '/packages/{id}', [CatalogController::class, 'updatePackage']);
$r('PATCH', '/packages/{id}/status', [CatalogController::class, 'packageStatus']);
$r('DELETE', '/packages/{id}', [CatalogController::class, 'deletePackage']);
// quotations, invoices
$r('GET', '/quotations', [QuotationsController::class, 'list']);
$r('POST', '/quotations', [QuotationsController::class, 'create']);
$r('GET', '/quotations/{id}', [QuotationsController::class, 'show']);
$r('PUT', '/quotations/{id}', [QuotationsController::class, 'update']);
$r('PATCH', '/quotations/{id}/status', [QuotationsController::class, 'setStatus']);
$r('POST', '/quotations/{id}/convert-to-invoice', [QuotationsController::class, 'convert']);
$r('DELETE', '/quotations/{id}', [QuotationsController::class, 'delete']);
$r('GET', '/invoices', [InvoicesController::class, 'list']);
$r('POST', '/invoices', [InvoicesController::class, 'create']);
$r('GET', '/invoices/{id}', [InvoicesController::class, 'show']);
$r('PUT', '/invoices/{id}', [InvoicesController::class, 'update']);
$r('PATCH', '/invoices/{id}/status', [InvoicesController::class, 'setStatus']);
$r('DELETE', '/invoices/{id}', [InvoicesController::class, 'delete']);
// subscriptions, purchases, payments
$r('GET', '/subscriptions', [SubscriptionsController::class, 'list']);
$r('POST', '/subscriptions', [SubscriptionsController::class, 'create']);
$r('GET', '/subscriptions/{id}', [SubscriptionsController::class, 'show']);
$r('PUT', '/subscriptions/{id}', [SubscriptionsController::class, 'update']);
$r('PATCH', '/subscriptions/{id}/status', [SubscriptionsController::class, 'setStatus']);
$r('POST', '/subscriptions/{id}/renew', [SubscriptionsController::class, 'renew']);
$r('GET', '/purchases', [PurchasesController::class, 'list']);
$r('POST', '/purchases', [PurchasesController::class, 'create']);
$r('GET', '/purchases/{id}', [PurchasesController::class, 'show']);
$r('PUT', '/purchases/{id}', [PurchasesController::class, 'update']);
$r('PATCH', '/purchases/{id}/status', [PurchasesController::class, 'setStatus']);
$r('GET', '/payments', [PaymentsController::class, 'list']);
$r('POST', '/payments', [PaymentsController::class, 'create']);
$r('GET', '/payments/{id}', [PaymentsController::class, 'show']);
$r('PUT', '/payments/{id}', [PaymentsController::class, 'update']);
$r('PATCH', '/payments/{id}/status', [PaymentsController::class, 'setStatus']);
$r('POST', '/payments/{id}/void', [PaymentsController::class, 'void']);
$r('GET', '/payments/{id}/receipt', [PaymentsController::class, 'receipt']);

try {
    $req = Request::capture();
    $result = $router->dispatch($req);
    if ($result instanceof Page) {
        send_json(200, ['data' => $result->rows, 'meta' => ['total' => $result->total, 'page' => $result->page, 'pageSize' => $result->pageSize]]);
    }
    send_json(200, ['data' => $result]);
} catch (ApiException $e) {
    $body = ['message' => $e->getMessage()];
    if ($e->errors) { $body['errors'] = array_filter($e->errors, fn($v) => $v !== null); }
    if ($e->errCode) { $body['code'] = $e->errCode; }
    if ($e->data !== null) { $body['data'] = $e->data; }
    send_json($e->status, $body);
} catch (\Throwable $e) {
    // Never leak SQL, paths or credentials to the client. Details go to storage/logs/error.log.
    $dir = __DIR__ . '/../storage/logs';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    @file_put_contents($dir . '/error.log', '[' . date('c') . '] ' . get_class($e) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n\n", FILE_APPEND);
    $msg = 'Something went wrong on the server. Please try again.';
    if ($e instanceof \PDOException && str_contains($e->getMessage(), 'SQLSTATE[HY000] [20')) { $msg = 'The server could not connect to the database. Check backend/.env and that MySQL is running.'; }
    $body = ['message' => $msg];
    if (Env::bool('APP_DEBUG', false)) { $body['debug'] = $e->getMessage(); }
    send_json(500, $body);
}
