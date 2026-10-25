# Testing checklist

**Legend:** PASSED = executed and succeeded in the environment below. FAILED = executed and failed. NOT TESTED = not executed (reason given).

**Test environment (the only one used):** Ubuntu 24.04, PHP 8.3.6, MariaDB 10.11.14, Apache 2.4.58 (mod_php), Node 22 / npm 10, Chromium 141 driven by Playwright. Logs are in `docs/test-evidence/`.

How the tests were run:
* **API tests:** `php backend/tests/api_test.php <api-url>` - 148 checks against the live PHP API and a real database (`php-api-tests-full-output.txt`). Run against both the PHP built-in server and Apache with the XAMPP-style sub-folder layout (`apache-xampp-style-test.txt`).
* **Browser tests:** Playwright drove the built React app against the live PHP API + MariaDB (39 checks, 14 pages visited, `automated-tests-php-api-and-browser.txt`).
* **Email test:** a fake SMTP server received real SMTP conversations from the PHP mailer (`email-reminder-test-fake-smtp.txt`).

## Required verification list

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Frontend production build (`npm run build`) | PASSED | builds with no errors; also rebuilt from a clean ZIP extract |
| 2 | PHP syntax (`php -l` on every `.php` file) | PASSED | 0 errors |
| 3 | Database setup (`bin/setup_db.php` creates DB + 24 tables; re-run is a no-op; `schema.sql` imports on MariaDB) | PASSED | |
| 4 | Login and logout (valid, wrong password, empty, SQL-injection strings; token invalid after logout; throttling after repeated failures) | PASSED | API tests; browser login/logout |
| 5 | Admin and Agent permissions (Agent 403 on Agents, business settings, payments/invoices without permission, activity log, agent report; permission change effective immediately; deactivated Agent loses session at once; assigned-scope vs all-scope visibility) | PASSED | API + browser |
| 6 | Business-level data isolation (business B cannot read/update/delete/list A's customers, invoices, payments, receipts, overview, activity; cannot create leads/quotations/follow-ups/payments for A's records) | PASSED | API tests; browser (second business sees only own data) |
| 7 | Customer CRUD (create, validation, duplicate 409 + allow-duplicate, update, deactivate, delete, delete blocked when records exist, search, filters, pagination) | PASSED | API + browser |
| 8 | Lead CRUD (create with existing / new customer, duplicate blocked, invalid source, status change, lost needs reason, history, filters, delete) | PASSED | API + browser |
| 9 | Follow-up creation, completion, rescheduling, overdue/upcoming views, lead next-follow-up sync | PASSED | API + browser |
| 10 | In-app reminders (dashboard counts, overdue tab) | PASSED | API (`/dashboard`) + browser |
| 11 | Email reminders with a working SMTP server: only accepted messages counted "sent"; each follow-up reminded once; correct recipient/subject/body | PASSED | tested with a **fake local SMTP server**, not a real provider |
| 12 | Email reminders when email is not configured / SMTP unreachable: nothing reported as sent, follow-ups not marked reminded, honest message in API and UI | PASSED | API + browser + CLI |
| 13 | Quotation calculations (discount per line, tax on net, rounding, client-sent totals ignored, numbering, expiry rule, status flow) | PASSED | 319.99 / 30.00 / 14.50 / 304.49 verified |
| 14 | Quotation -> invoice conversion (accepted only, same items/totals, original kept and linked, second conversion and editing blocked) | PASSED | |
| 15 | Invoice calculations and statuses (issued, partially paid, paid, overdue, cancelled, draft rules; edit/cancel blocked when payments exist) | PASSED | |
| 16 | Partial and full payments; balance = total - completed payments; pending does not count until confirmed | PASSED | |
| 17 | Payment validation: zero/negative/non-numeric, over-payment, draft/cancelled target, other business's invoice | PASSED | |
| 18 | Duplicate transaction/reference ID rejected; reusable after void | PASSED | |
| 19 | Concurrent payments racing for the last balance (two processes): exactly one succeeds, balance never negative | PASSED | row locking inside a transaction |
| 20 | Void payment (reason required, history preserved, balance restored), receipts | PASSED | |
| 21 | Subscription creation, renewal (invoice created, next date moved, month-end safe), pause, cancel (final), expired and "renewing soon" tracking | PASSED | |
| 22 | Purchases (totals, payments against a purchase, partial/paid status, edit/cancel blocked after payments) | PASSED | |
| 23 | Reports (all 10 types, date filters, totals consistent with dashboard/invoices) and CSV export | PASSED | API + browser (CSV download not re-run after the move to the real API) |
| 24 | Dashboard figures calculated from DB (payments received matches an independent SQL sum) | PASSED | |
| 25 | Activity log (Admin only, per business) | PASSED | |
| 26 | Data persistence after browser refresh and after a new login | PASSED | browser + API |
| 27 | Frontend-to-PHP communication (all pages load real data; create/update/delete reach the database) | PASSED | browser |
| 28 | No fake success when the API is down (UI shows "Cannot reach the API", no success message) | PASSED | browser (API stopped mid-test) |
| 29 | Business registration through the UI; start empty | PASSED | |
| 30 | CORS: allowed origin gets headers, unknown origin does not, preflight 204 | PASSED | |
| 31 | SQL injection strings in login and search are harmless | PASSED | |
| 32 | Tokens and passwords stored hashed only | PASSED | checked directly in the database |
| 33 | Apache deployment with `.htaccess` in a sub-folder (`/universal-crm/backend`), Authorization header passes, `.env` blocked (403), `src/` and `bin/` not served | PASSED | |
| 34 | Responsive layout - mobile menu opens at 390 px | PASSED | only the menu was checked automatically |
| 35 | No console errors during the browser run | PASSED | |

## Not tested

| Item | Why |
|---|---|
| Real Windows + XAMPP installation (paths, `php.ini`, Task Scheduler) | no Windows machine available; commands follow the standard XAMPP layout |
| MySQL 8 / MySQL 5.7 (only MariaDB 10.11 used) | not installed; schema uses standard syntax incl. a generated column and CHECK constraints (need MySQL 5.7.6+/8.0.16+ or MariaDB 10.2.1+) |
| PHP 8.1 and 8.2 (only 8.3 used) | code avoids 8.3-only features but this was not run |
| Real email providers, TLS/STARTTLS against a real server | only a local fake SMTP (plain) was used; TLS code path is untested |
| Browsers other than Chromium; real phones/tablets; screen readers; print/PDF output visuals | not available |
| Load/performance, large data volumes | not attempted |
| WhatsApp links opening WhatsApp | links are generated and rendered; opening the external app/site was not verified |
| Password reset by email, SMS, online payments, automatic recurring billing | **not implemented** (documented as out of scope / future) |
| Frontend unit tests | none written; behaviour is covered by the browser run |

## Problems found while testing (all fixed)

* First API test run: 12 of 148 checks failed. All were mistakes in the test script (PHP decodes `30.0` as integer `30`; one scenario's arithmetic) - no backend defect. Fixed the tests; 148/148 pass.
* First browser runs failed on wrong selectors/expected text in the test script (case of CSS-capitalised labels, a catalog item picked by position). Fixed the script; 39/39 pass. No application defect was found.
* Early frontend work (before this full-stack version) used a built-in mock adapter. It has been **removed**; the app only talks to the PHP API.
