<?php
declare(strict_types=1);
/**
 * Creates the database (if missing) and imports database/schema.sql.
 * Usage:  php bin/setup_db.php
 * Safe to run again: it will not touch an existing, already-initialised database.
 */
require __DIR__ . '/_bootstrap.php';

use App\Env;

$name = Env::get('DB_NAME', 'universal_crm');
if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', (string)$name)) { fwrite(STDERR, "DB_NAME may only contain letters, numbers and underscores.\n"); exit(1); }
try {
    $pdo = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', Env::get('DB_HOST', '127.0.0.1'), Env::int('DB_PORT', 3306)), Env::get('DB_USER', 'root'), Env::get('DB_PASS', ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (PDOException $e) {
    fwrite(STDERR, "Could not connect to MySQL: " . $e->getMessage() . "\nIs MySQL running (XAMPP Control Panel > Start MySQL)? Are DB_HOST/DB_USER/DB_PASS in backend/.env correct?\n");
    exit(1);
}
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$name`");
$exists = $pdo->query("SHOW TABLES LIKE 'schema_version'")->fetchColumn();
if ($exists) { echo "Database '$name' is already initialised. Nothing to do.\n"; exit(0); }

$sql = file_get_contents(__DIR__ . '/../../database/schema.sql');
// Remove comment lines, then split on ';' at end of statement.
$sql = preg_replace('/^\s*--.*$/m', '', $sql);
$count = 0;
foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
    $stmt = trim($stmt);
    if ($stmt === '') { continue; }
    $pdo->exec($stmt); $count++;
}
echo "Database '$name' created and initialised ($count statements).\n";
echo "Next: create your business and Admin account with  php bin/create_business.php  (or use the Register page if enabled).\n";
