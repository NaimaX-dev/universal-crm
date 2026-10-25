# Universal CRM - full-stack project

**One CRM for Different Types of Businesses.** A multi-business Customer Relationship Management system for clinics, travel agencies, service shops, software houses and other organisations.

| Part | Technology | Folder |
|---|---|---|
| Frontend | React (Vite) + JavaScript + React Router + **custom CSS only** (no Bootstrap) | `frontend/` |
| Backend | **PHP 8.1+ REST API** (separate project, PDO prepared statements, no framework needed) | `backend/` |
| Database | **MySQL / MariaDB** (InnoDB, foreign keys, transactions) | `database/` |
| Docs | API reference, test checklist, test evidence | `docs/` |

The React app talks to the PHP API only through the configurable address `VITE_API_BASE_URL`. The PHP code is **not** inside the React `src/` folder.

> **Honest status.** Everything described here was built and tested on Linux with PHP 8.3, MariaDB 10.11, Apache 2.4 and Chromium (see `docs/TESTING_CHECKLIST.md`). It has **not** been run on a real Windows/XAMPP machine, with a real email provider, or on MySQL proper. The Windows instructions below follow the standard XAMPP layout; if something differs on your PC see *Troubleshooting*.

## What you get

* **Multi-business:** each business has its own profile, Admin, Agents, customers, leads, follow-ups, services, packages, purchases, quotations, invoices, subscriptions, payments, reports and activity log. Isolation is enforced **in PHP on every query**, not just in the UI.
* **Roles:** Business Admin (everything in their business) and Agent (only the modules the Admin grants: view / create / edit / delete / manage, plus "assigned records only" or "all records"). Changes take effect immediately.
* **Modules:** dashboard, customers (search, filters, pagination, duplicate warning, history, delete), leads (Facebook / Instagram / WhatsApp / phone / website / walk-in / referral / other, priority, status history, convert), follow-ups & in-app reminders (+ optional **email** reminders), services & packages, purchases, **quotations** (print, convert to invoice), **invoices** (print, partial payments), **subscriptions** (manual renewals), **payments & receipts** (transaction IDs, duplicate protection, void, history), reports (10 types, date filters, CSV export), settings, activity log.
* **WhatsApp:** buttons open WhatsApp (Web) with a prepared message. **You press Send yourself.** Nothing is ever sent automatically.
* **Money rules live in the backend:** totals, balances, over-payment checks and duplicate transaction IDs are calculated/validated by PHP inside database transactions. The browser only shows estimates.

## Folder layout

```
universal-crm/
  frontend/    React app            (npm install, npm run dev)
  backend/     PHP API              (public/index.php is the only web entry point)
    public/      index.php + .htaccess
    src/         core classes and Controllers/
    bin/         setup_db.php, create_business.php, seed_demo.php, send_reminders.php
    tests/       api_test.php (end-to-end API tests)
    .env.example
  database/    schema.sql (+ README)
  docs/        API.md, TESTING_CHECKLIST.md, test-evidence/
```

---
## 1. Required software (Windows)

| Software | Version | Notes |
|---|---|---|
| **XAMPP** (Apache + MySQL/MariaDB + PHP) | PHP **8.1 or newer** (XAMPP 8.1/8.2/8.x) | https://www.apachefriends.org |
| **Node.js LTS** | 18 or newer | https://nodejs.org (includes npm) |
| **VS Code** (optional) | any | to edit and open terminals |

Install XAMPP (default folder `C:\xampp`) and Node.js, then restart VS Code.

## 2. Get the project in place

Unzip so you have, for example, `C:\xampp\htdocs\universal-crm\` containing `frontend`, `backend`, `database`, `docs`. (Any folder works if you use the PHP built-in server in step 4A; `htdocs` is only needed for Apache, step 4B.)

## 3. Start MySQL and create the database

1. Open the **XAMPP Control Panel** and click **Start** next to **MySQL** (and **Apache** if you will use step 4B).
2. Create the backend configuration. Open a terminal in `backend` and run:

```
copy .env.example .env
```

3. Open `backend\.env` and check the database section. XAMPP's defaults already work:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=universal_crm
DB_USER=root
DB_PASS=
```

(XAMPP's `root` user has no password by default. **Never** leave an empty root password on a server that is reachable from the internet; create a dedicated MySQL user instead, see *Going live*.)

4. Create and initialise the database (still in the `backend` folder):

```
C:\xampp\php\php.exe bin\setup_db.php
```

It creates the `universal_crm` database and all tables from `database\schema.sql`. Running it again is safe.

*No command line?* Open http://localhost/phpmyadmin, create an empty database named `universal_crm` (collation `utf8mb4_unicode_ci`), choose **Import**, and select `database\schema.sql`.

## 4. Run the PHP API

**A. PHP built-in server (simplest, recommended for development).** In the `backend` folder:

```
C:\xampp\php\php.exe -S localhost:8000 -t public
```

Keep that window open. Test: open http://localhost:8000/health - you should see `{"data":{"ok":true,...}}`. The API address is **http://localhost:8000**.

**B. Apache (XAMPP).** With the project in `C:\xampp\htdocs\universal-crm`, the API is available at **http://localhost/universal-crm/backend** (the included `.htaccess` files route everything to `public/index.php` and keep `.env`, `src` and `bin` unreachable). Requirements: Apache running, `mod_rewrite` enabled (it is by default in XAMPP) and `AllowOverride All` for `htdocs` (default in XAMPP). Test http://localhost/universal-crm/backend/health.

> Do not point your web server's document root at the `backend` folder itself; only `backend/public` should ever be web-reachable (option B's `.htaccess` handles this for you).

## 5. Run the React frontend

In the `frontend` folder:

```
copy .env.example .env
npm install
npm run dev
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`: the backend allows that exact origin).

Set the API address in `frontend\.env` (restart `npm run dev` after changing it):

```
VITE_API_BASE_URL=http://localhost:8000
```

(for option B use `http://localhost/universal-crm/backend`). If you serve the frontend from a different address, add that exact origin to `CORS_ALLOWED_ORIGINS` in `backend\.env`.

Production build: `npm run build` (output in `frontend\dist`, upload it to any static web host and set `VITE_API_BASE_URL` to your HTTPS API address **before** building).

## 6. Create the first business and Admin (securely)

Pick one:

**A. Register page (easy, for local use).** Keep `ALLOW_BUSINESS_REGISTRATION=true` in `backend\.env`, open http://localhost:5173 and click **Register your business**. Enter the business name/type and the Admin's name, email and password (at least 8 characters with a letter and a number). You are signed in and taken to **Settings** to complete the business profile (address, phone, logo, tax rate, payment terms, WhatsApp template).

**B. Command line (recommended for production).** Set `ALLOW_BUSINESS_REGISTRATION=false`, then in `backend`:

```
C:\xampp\php\php.exe bin\create_business.php
```

It asks for the business name, type, Admin name, email and password (the password is hashed with PHP `password_hash`, never stored as text). Use it once per business.

Passwords are stored only as hashes; session tokens are random and only their SHA-256 hash is stored.

## 7. Agents and permissions

Sign in as the Admin, open **Agents**, click **Add agent**: enter name, email, an initial password, choose **Record access** (*Assigned records only* or *All records*) and tick the permission matrix (View / Create / Edit / Delete / Manage per module). **Manage** means: assign leads/follow-ups to others, convert quotations, cancel invoices, renew subscriptions, void payments. Edit an Agent at any time; changes apply on their next click. **Deactivating** an Agent signs them out immediately.

Customers created by an *assigned-only* Agent are assigned to that Agent automatically. An Admin (or an *All records* Agent) can reassign customers and leads.

## 8. Optional: demo data

For a quick tour (two fictional businesses with every module filled in):

```
C:\xampp\php\php.exe bin\seed_demo.php
```

Logins - Admin: `admin@northwind.demo` / `Admin@123`; Agent (assigned customers only, no payments): `bilal@northwind.demo` / `Agent@123`; Agent (all customers, can record payments): `hina@northwind.demo` / `Agent@123`; a second business (to see isolation): `admin@skyline.demo` / `Admin@123`. **Never run this on a real/production database** (it refuses when `APP_ENV=production`). These are real database rows created by the script, not a front-end mock.

## 9. Email reminders (optional)

In-app reminders (dashboard, Follow-ups page, overdue badges) work out of the box. **Email** reminders need an SMTP account (Gmail app password, your hosting's SMTP, Mailgun/SendGrid SMTP, ...). Edit `backend\.env`:

```
MAIL_DRIVER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls          # tls (587) | ssl (465) | none
MAIL_USERNAME=you@example.com
MAIL_PASSWORD=your-smtp-password
MAIL_FROM_ADDRESS=crm@example.com
MAIL_FROM_NAME=Universal CRM
```

Restart the PHP server. Then, as Admin, open **Settings > Email reminders**: it shows whether the server is configured and has a **Send due reminders now** button plus a log of attempts. A reminder goes to the Agent responsible for each follow-up that is due/overdue, **once** per follow-up (rescheduling re-arms it).

* A message is shown as **sent** only if the SMTP server accepted it. If email is not configured or fails, the screen says exactly that and the follow-up is *not* marked as reminded.
* `MAIL_DRIVER=log` writes messages to `backend/storage/mail.log` and sends nothing; `disabled` (default) sends nothing.
* To send automatically, schedule `php bin\send_reminders.php`. On Windows: *Task Scheduler > Create Basic Task > Repeat every 15 minutes > Start a program:* `C:\xampp\php\php.exe`, arguments `C:\xampp\htdocs\universal-crm\backend\bin\send_reminders.php`. On Linux: `*/15 * * * * php /path/backend/bin/send_reminders.php`.
* SMS is **not** integrated (optional per requirements); the SMS switch in Settings is only a stored preference.

## 10. Tests

With MySQL and the PHP API running, `ALLOW_BUSINESS_REGISTRATION=true`, and demo data loaded (step 8), run in `backend`:

```
C:\xampp\php\php.exe tests\api_test.php http://localhost:8000
```

148 end-to-end checks run against the live API and database (login, permissions, business isolation, CRUD, follow-ups, quotation and invoice maths, partial/full payments, duplicate transaction IDs, over-payment and a concurrent-payment race, subscriptions, reports, dashboard, CORS, injection attempts...). It exits with code 1 if anything fails. It registers throw-away businesses with random emails, so it can be repeated. Lint every PHP file: `for %f in (src\*.php src\Controllers\*.php public\*.php bin\*.php) do C:\xampp\php\php.exe -l %f`.

Frontend: `npm run build` must finish without errors. The browser test used in development (Playwright driving the real React + PHP + MySQL stack) is described in `docs/TESTING_CHECKLIST.md`; its results are in `docs/test-evidence/`.

## Going live (production checklist)

1. Serve everything over **HTTPS**. Set `APP_ENV=production`, `APP_DEBUG=false`, `ALLOW_BUSINESS_REGISTRATION=false`.
2. Create a dedicated MySQL user with rights only on this database (not `root`): `CREATE USER 'crm'@'localhost' IDENTIFIED BY '<strong password>'; GRANT SELECT,INSERT,UPDATE,DELETE ON universal_crm.* TO 'crm'@'localhost';` (run `setup_db.php` with an account that can create tables first), then put it in `.env`.
3. Set `CORS_ALLOWED_ORIGINS` to your exact frontend origin only (never `*`).
4. Only `backend/public` may be web-reachable; `.env` must never be downloadable. Make `backend/storage` writable by the web server (error log, optional mail log).
5. Back up the database regularly (`mysqldump`), and test a restore.
6. Keep PHP and dependencies updated.

## Troubleshooting

| Problem | Fix |
|---|---|
| Login page shows "Cannot reach the API..." | The PHP server is not running, the URL in `frontend\.env` is wrong (restart `npm run dev` after editing), or you opened the site at `127.0.0.1` instead of `localhost` (CORS). |
| Browser console: "blocked by CORS policy" | Add your frontend's exact origin (e.g. `http://localhost:5173`) to `CORS_ALLOWED_ORIGINS` in `backend\.env`, restart PHP. |
| `setup_db.php`: "Access denied" / "Could not connect" | MySQL not started in XAMPP, or `DB_USER` / `DB_PASS` in `backend\.env` are wrong. |
| API answers "could not connect to the database" | Same as above; check `backend\storage\logs\error.log`. |
| `could not find driver` | Enable `extension=pdo_mysql` in `C:\xampp\php\php.ini` (on by default in XAMPP) and restart. |
| Everything is `404` under Apache | `mod_rewrite` off or `AllowOverride None`; or use option A (PHP built-in server). |
| `401 Unauthorized` on every call under Apache | Apache dropped the `Authorization` header; make sure the provided `.htaccess` files are active (`AllowOverride All`). |
| "Self-registration is disabled" | Set `ALLOW_BUSINESS_REGISTRATION=true`, or use `bin\create_business.php`. |
| "Too many failed sign-in attempts" | Wait 15 minutes (per email + IP), or clear `login_attempts` in the database. |
| Reminder emails not arriving | Open Settings > Email reminders: it reports the SMTP error. Check host/port/encryption/credentials. Gmail needs an *app password*. |
| Forgot password | Password reset by email is **not implemented**. An Admin sets a new password for an Agent via *Agents > Edit*. If the only Admin password is lost, generate a hash with `php -r "echo password_hash('NewPass123', PASSWORD_DEFAULT);"` and paste it into `users.password_hash` for that user in phpMyAdmin. |
| `npm install` fails | Use Node 18+; delete `node_modules` and run again. |

## Known limitations

* Not tested on Windows/XAMPP hardware, MySQL proper (tested on MariaDB 10.11), real SMTP providers or TLS mail servers, browsers other than Chromium, screen readers, or under heavy load.
* No password-reset-by-email, no SMS, no online payment gateway, no automatic recurring charging (subscriptions are tracked and renewed manually), no server-generated PDFs ("Print / PDF" uses the browser's print dialog), one currency symbol per business.
* The login token is kept in the browser's `localStorage`; a cross-site-scripting bug would expose it. Tokens expire (default 12 h) and are revoked at logout/deactivation.
* The PHP built-in server is for development only; use Apache/Nginx + PHP-FPM in production.
* Dashboards and reports aggregate in PHP from the business's records; very large data volumes would need SQL-level aggregation or caching.
* The built-in SMTP client is minimal (AUTH LOGIN, STARTTLS/SSL, plain-text mail).
