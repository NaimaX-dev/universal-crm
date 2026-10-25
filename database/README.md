# Database

* `schema.sql` - complete MySQL/MariaDB schema (InnoDB, utf8mb4, 24 tables, primary/foreign keys, indexes, CHECK constraints).
* Create it with `php backend/bin/setup_db.php` (creates the database named in `backend/.env` if missing), or import `schema.sql` into an empty database with phpMyAdmin / `mysql -u root universal_crm < schema.sql`.
* Optional demo data: `php backend/bin/seed_demo.php`.

## Design notes

* **Multi-business:** every business-owned table has `business_id` (customers, leads, follow-ups, services, packages, quotations, invoices, purchases, payments, subscriptions, activity logs, counters...). Child tables (items, history) reach it through their parent. The API adds `business_id = <authenticated user's business>` to every query.
* **Money:** `DECIMAL(12,2)`; CHECK constraints keep totals/prices non-negative and `payments.amount > 0`; a payment must reference exactly one of invoice or purchase.
* **Duplicate transaction IDs:** a generated column `txn_active` is set only while a payment is pending/completed and carries `UNIQUE (business_id, txn_active)`. Voided/failed payments free their reference.
* **Numbering:** `document_counters` gives gap-free-per-business numbers (`QT-0001`, `INV-0001`, `RCPT-0001`) atomically inside the saving transaction; `UNIQUE (business_id, number)` backs it up.
* **Sessions:** `api_tokens` stores only SHA-256 hashes; `login_attempts` supports sign-in throttling.
* **Audit:** `activity_logs`, `lead_history`, `subscription_history`, `email_logs`.
* Related financial writes (payment + numbering, quotation conversion, renewals) run in transactions and lock the invoice/purchase row (`SELECT ... FOR UPDATE`) so concurrent payments cannot over-pay.
