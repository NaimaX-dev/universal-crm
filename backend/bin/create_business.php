<?php
declare(strict_types=1);
/**
 * Creates a new business together with its first Admin account (secure: the password is hashed, never stored as text).
 * Usage:  php bin/create_business.php
 * Optional: --business="Name" --type="Clinic" --admin-name="Full Name" --email=admin@example.com   (password is always asked)
 * You may also set the ADMIN_PASSWORD environment variable instead of typing it.
 */
require __DIR__ . '/_bootstrap.php';

use App\{Auth, Db, Util};
use App\Controllers\AuthController;

$business = opt($argv, 'business') ?? ask('Business name');
$type = opt($argv, 'type') ?? ask('Business type (e.g. Clinic, Travel agency)');
$adminName = opt($argv, 'admin-name') ?? ask('Admin full name');
$email = strtolower(opt($argv, 'email') ?? ask('Admin email (used to sign in)'));
$password = getenv('ADMIN_PASSWORD') ?: ask('Admin password (min 8 characters, letters + numbers)', true);

$errors = [];
if ($business === '') { $errors[] = 'Business name is required.'; }
if ($adminName === '') { $errors[] = 'Admin name is required.'; }
if (!Util::isEmail($email)) { $errors[] = 'Enter a valid email address.'; }
elseif (Db::val('SELECT 1 FROM users WHERE email = :e', ['e' => $email])) { $errors[] = 'That email is already registered.'; }
if ($m = Auth::passwordErrors($password)) { $errors[] = "Password: $m"; }
if ($errors) { fwrite(STDERR, implode("\n", $errors) . "\n"); exit(1); }

$u = AuthController::createBusinessWithAdmin($business, $type, $email, $adminName, $password);
echo "Created business #{$u['business_id']} \"$business\" with Admin $email (user #{$u['id']}).\nYou can now sign in at the React app.\n";
