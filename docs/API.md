# Universal CRM - REST API reference

Base URL: the address where the PHP backend is served (`http://localhost:8000` with the PHP built-in server, or `http://localhost/universal-crm/backend` under Apache/XAMPP).
Everything below was implemented and tested against MySQL/MariaDB (see `TESTING_CHECKLIST.md`).

## Conventions

* **Format:** JSON requests (`Content-Type: application/json`) and JSON responses.
* **Authentication:** `POST /auth/login` returns a random token. Send it as `Authorization: Bearer <token>` on every other request (except those marked *public*). Only a SHA-256 hash of the token is stored; tokens expire after `TOKEN_TTL_HOURS` (default 12) or at logout.
* **Business isolation:** the business is ALWAYS taken from the authenticated user, never from the request. Records of another business answer `404`.
* **Success:** single record `{ "data": {...} }`; list `{ "data": [...], "meta": { "total": 42, "page": 1, "pageSize": 10 } }`.
* **Errors:** `{ "message": "...", "errors": { "field": "text" }, "code": "DUPLICATE" }`.

| Status | Meaning |
|---|---|
| 400 | body is not valid JSON |
| 401 | not signed in / token invalid, expired or user deactivated / wrong credentials |
| 403 | signed in but the role/permission does not allow it (or registration disabled) |
| 404 | record not found **or belongs to another business** / unknown route |
| 405 | method not allowed on that route |
| 409 | conflict with current state (duplicate customer, record has dependants, wrong status, already converted...) |
| 422 | validation failed - `errors` lists the fields |
| 429 | too many failed sign-ins (15-minute lock for that email + IP) |
| 500 | server error. Details are written to `backend/storage/logs/error.log`, never sent to the client |

**List query parameters (all list endpoints):** `search`, `page`, `pageSize` (1-500, default 10), `sort`, `dir` (`asc`|`desc`), `from`/`to` (`YYYY-MM-DD`, filters on the main date of the record), plus the module filters listed below.

**Permissions.** Modules: customers, leads, followUps, services, packages, quotations, invoices, subscriptions, purchases, payments, reports. Actions: `view`, `create`, `edit`, `delete`, `manage`. Admins have everything inside their business. Agents have only what the Admin granted. Agents also have a **scope**: `assigned` (only records assigned to them / of customers assigned to them) or `all` (every record of their business). `manage` means: leads = assign to other Agents; followUps = assign to other Agents; quotations = convert to invoice; invoices = cancel; subscriptions = renew/pause/cancel; payments = void / confirm / fail.

Permission shorthand below: `cust.view` = customers.view, etc.

---
## Authentication and account

| Method | Path | Access | Body / notes |
|---|---|---|---|
| GET | `/health` | public | `{data:{ok:true}}` (checks the database) |
| GET | `/auth/options` | public | `{registrationEnabled, forgotPasswordEnabled}` |
| POST | `/auth/login` | public | **email, password** -> `{token, user, business}`. 401 wrong credentials / 403 deactivated / 429 throttled |
| POST | `/auth/register-business` | public, only if `ALLOW_BUSINESS_REGISTRATION=true` | **businessName, adminName, email, password**, businessType -> creates business + Admin, returns `{token,user,business}`. Password: >= 8 chars with a letter and a number |
| POST | `/auth/logout` | signed in | invalidates the token |
| GET | `/auth/me` | signed in | `{user, business}` (permissions are re-read every request) |
| PUT | `/auth/me` | signed in | **name**, phone, newPassword (+ **currentPassword**). A password change signs out the user's other sessions |

## Business, Agents, activity

| Method | Path | Access | Body / notes |
|---|---|---|---|
| GET | `/business` | any user | business profile + settings |
| PUT | `/business` | Admin | **name**, type, email, phone, address, logo (data URL image < ~250 KB), settings `{currency, taxRate 0-100, quotationValidityDays, invoiceDueDays, defaultCountryCode, whatsappTemplate, notifications{email,sms,whatsapp}}` |
| GET | `/team` | any user | `[{id,name,role,status}]` for dropdowns |
| GET | `/users` | Admin | Agents. Filters `status`; `search` |
| POST | `/users` | Admin | **name, email, password, scope** (`assigned`\|`all`), phone, permissions `{module:{action:true}}` |
| GET / PUT | `/users/{id}` | Admin | same fields (password optional on PUT; setting it signs the Agent out) |
| PATCH | `/users/{id}/status` | Admin | **status** `active`\|`inactive`. Deactivating revokes the Agent's sessions immediately |
| GET | `/users/{id}/activity` | Admin | last 40 actions of that Agent |
| GET | `/activity` | Admin | audit log. Filters `userId`, `entity`, `action`; `search`; `from`/`to` |
| GET | `/reminders/status` | Admin | `{configured, driver, from, businessEmailEnabled, recent[]}` |
| POST | `/reminders/send` | Admin | sends due follow-up reminder emails now. `{configured,total,sent,failed,skipped,message,results[]}` - `sent` counts only emails the SMTP server accepted |

## Customers (`customers.*`)

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/customers` | cust.view | filters `status`, `assignedTo` |
| POST | `/customers` | cust.create | **name, phone**, email, company, address, notes, details, assignedTo. `409 DUPLICATE` (`data.customer`) when the phone/email already exists in the business, unless `allowDuplicate:true` |
| GET | `/customers/check-duplicate?phone=&email=&excludeId=` | cust.view | `{customer: {...}|null}` |
| GET | `/customers/{id}` | cust.view | |
| GET | `/customers/{id}/overview` | cust.view | customer + leads, followUps, quotations, invoices, purchases, payments, subscriptions (each `null` if the user lacks that module's view permission) + merged `history` |
| PUT | `/customers/{id}` | cust.edit | same fields. Reassigning needs Admin or scope `all` |
| PATCH | `/customers/{id}/status` | cust.delete | status `active`\|`inactive` |
| DELETE | `/customers/{id}` | cust.delete | `409` if the customer has leads, follow-ups, quotations, invoices, purchases, payments or subscriptions (deactivate instead) |

## Leads and follow-ups

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/leads` | leads.view | filters `status`, `source`, `priority`, `assignedTo`, `customerId` |
| POST | `/leads` | leads.create | **source** (`facebook, instagram, whatsapp, phone, website, walk-in, referral, other`) and **customerId** *or* `newCustomer{name,phone,...}` (needs cust.create; duplicates -> 409), priority (`low\|medium\|high`), inquiryDate, requirements, notes, nextFollowUp, assignedTo (other users need leads.manage) |
| GET | `/leads/{id}` | leads.view | includes `history[]` |
| PUT | `/leads/{id}` | leads.edit | source, priority, inquiryDate, nextFollowUp, requirements, notes, assignedTo |
| PATCH | `/leads/{id}/status` | leads.edit | **status** (`new, contacted, follow_up, interested, converted, lost`); `lost` requires **reason**; note |
| DELETE | `/leads/{id}` | leads.delete | removes its follow-ups |
| GET | `/follow-ups` | followUps.view | `view=upcoming\|overdue\|completed\|all`; filters `status`, `responsibleId`, `customerId`, `leadId`. `status` is `overdue` when scheduled and past due |
| POST | `/follow-ups` | followUps.create | **customerId, dueAt** (`YYYY-MM-DDTHH:mm`), leadId, notes, responsibleId (others need followUps.manage). Keeps `lead.nextFollowUp` in sync |
| GET/PUT | `/follow-ups/{id}` | .view / .edit | PUT: dueAt, notes, responsibleId (scheduled only) |
| POST | `/follow-ups/{id}/complete` | followUps.edit | **outcome** (>= 3 chars) |
| POST | `/follow-ups/{id}/reschedule` | followUps.edit | **dueAt**, note |
| PATCH | `/follow-ups/{id}/status` | followUps.edit | status `cancelled` |
| DELETE | `/follow-ups/{id}` | followUps.delete | |

## Services and packages

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/services`, `/packages` | .view | filter `status` |
| POST | `/services` | services.create | **name, price** (>= 0), category, description, duration |
| POST | `/packages` | packages.create | **name, price**, description, duration, serviceIds[] |
| GET / PUT | `/services/{id}`, `/packages/{id}` | .view / .edit | |
| PATCH | `/services/{id}/status`, `/packages/{id}/status` | .delete | `active`\|`inactive` |
| DELETE | `/services/{id}`, `/packages/{id}` | .delete | `409` if used in a package, document or subscription |

## Quotations and invoices

Line item: `{ type: "service"|"package"|"custom", refId, description, qty, unitPrice, discount (0-100 %) }`. **The server calculates** `lineTotal`, `subtotal`, `discountTotal`, `tax`, `total` (integer cents, tax on the net amount); totals sent by the client are ignored.

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/quotations` | quot.view | filters `status` (`draft,sent,accepted,rejected,expired`), `customerId`; date filter = quotation date |
| POST | `/quotations` | quot.create | **customerId, items[]**, date, expiryDate, taxRate (default from business settings), notes, terms, status `draft`\|`sent`, leadId. Number `QT-0001...` is generated per business |
| GET | `/quotations/{id}` | quot.view | includes `items`, `customer`, `business`, `invoiceNumber` |
| PUT | `/quotations/{id}` | quot.edit | only while draft/sent and not converted |
| PATCH | `/quotations/{id}/status` | quot.edit | `draft, sent, accepted, rejected` (not after conversion) |
| POST | `/quotations/{id}/convert-to-invoice` | quot.manage + inv.create | body `{dueDate}`. Only **accepted**, not already converted (409). Creates an **issued** invoice with the same items/totals; the quotation is kept and linked (`invoiceId`) |
| DELETE | `/quotations/{id}` | quot.delete | drafts only |
| GET | `/invoices` | inv.view | filters `status` (`draft,issued,partially_paid,paid,overdue,cancelled`), `customerId`; `payable=1` = issued with balance > 0 |
| POST | `/invoices` | inv.create | **customerId, items[]**, date, dueDate, taxRate, notes, terms, status `draft`\|`issued`. Number `INV-0001...` |
| GET | `/invoices/{id}` | inv.view | includes `items`, `payments[]`, `customer`, `business`; `paid` = completed payments only; `balance = total - paid` |
| PUT | `/invoices/{id}` | inv.edit | refused (409) when cancelled or any completed/pending payment exists (row is locked so a payment cannot slip in) |
| PATCH | `/invoices/{id}/status` | inv.edit (issue) / inv.manage (cancel) | `issued` from draft only; `cancelled` refused while completed/pending payments exist |
| DELETE | `/invoices/{id}` | inv.delete | drafts only |

Derived invoice status: not `issued` -> as stored; paid >= total -> `paid`; due date passed -> `overdue`; some paid -> `partially_paid`; else `issued`.

## Payments (`payments.*`) and purchases

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/payments` | pay.view | filters `status` (`pending, completed, failed, voided`), `method`, `customerId`, `invoiceId`, `purchaseId`; search receipt no / transaction ID / customer |
| POST | `/payments` | pay.create | **invoiceId** *or* **purchaseId**, **amount** (> 0), **date**, **method** (`cash, bank_transfer, card, cheque, mobile_wallet, other`), transactionId, notes, status `completed`\|`pending`. In one database transaction with the invoice/purchase row locked: target must be an *issued* invoice / *recorded* purchase; `amount` must not exceed the remaining balance (422); a transaction ID already used by a pending/completed payment in the business is rejected (422). Receipt `RCPT-0001...` generated |
| GET | `/payments/{id}` | pay.view | |
| PUT | `/payments/{id}` | pay.edit | notes only |
| PATCH | `/payments/{id}/status` | pay.manage | pending -> `completed` (balance re-checked) or `failed` |
| POST | `/payments/{id}/void` | pay.manage | **reason**. Voided payments stay in the history but no longer count; their transaction ID can be reused |
| GET | `/payments/{id}/receipt` | pay.view | `{payment, customer, business, document{type,number,total,paid,balance}}` |
| GET | `/purchases` | purch.view | filters `status` (`recorded, cancelled`), `paymentStatus` (`unpaid, partial, paid`), `customerId`; `payable=1` |
| POST | `/purchases` | purch.create | **customerId, items[]**, date, notes, leadId/quotationId/invoiceId (links). A purchase linked to an invoice is paid through that invoice |
| GET / PUT | `/purchases/{id}` | .view / .edit | PUT refused when payments exist |
| PATCH | `/purchases/{id}/status` | purch.delete | `recorded`\|`cancelled` (refused while payments exist) |

## Subscriptions (`subscriptions.*`)

| Method | Path | Permission | Body / notes |
|---|---|---|---|
| GET | `/subscriptions` | sub.view | filters `status` (`active, paused, cancelled, expired`), `customerId`, `billingCycle`. Each row has `daysToRenewal`, `renewingSoon` (<= 14 days) |
| POST | `/subscriptions` | sub.create | **customerId, planType** (`service`\|`package`), **planId, startDate, billingCycle** (`monthly, quarterly, yearly`), endDate, price (defaults to the plan price), nextBillingDate |
| GET | `/subscriptions/{id}` | sub.view | adds `history[]` and `invoices[]` |
| PUT | `/subscriptions/{id}` | sub.edit | dates, cycle, price, nextBillingDate |
| PATCH | `/subscriptions/{id}/status` | sub.manage | `active, paused, cancelled` (cancelled is final) |
| POST | `/subscriptions/{id}/renew` | sub.manage + inv.create | creates an **issued** invoice for one period and moves `nextBillingDate` by one cycle (month-end safe). **Nobody is charged**; payments are recorded manually |

## Dashboard and reports

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard` | any user | sections appear only for modules the user may view; Agents see only their scope. Figures are calculated from the database on every call |
| GET | `/reports/{type}` | reports.view **and** the module's view permission | `type`: `customers, leads, agents (Admin only), followups, quotations, invoices, payments, outstanding, subscriptions, sales`. Query `from`, `to`. Returns `{title, summary[], breakdowns[], columns[], rows[]}` |

## Example responses

```jsonc
// POST /auth/login
{ "data": { "token": "9f2c...64 hex chars...", "user": { "id": "1", "businessId": "1", "name": "Sara Malik", "email": "admin@northwind.demo", "role": "admin", "status": "active", "scope": "all", "permissions": { "customers": { "view": true, "create": true } } }, "business": { "id": "1", "name": "Northwind Clinic (demo)", "settings": { "currency": "$", "taxRate": 5 } } } }

// GET /customers?search=ayesha&pageSize=1
{ "data": [ { "id": "2", "name": "Ayesha Khan", "phone": "+92 300 0000001", "email": "ayesha.k@example.com", "status": "active", "assignedTo": "2", "assignedName": "Bilal Rauf", "leadCount": 1 } ], "meta": { "total": 1, "page": 1, "pageSize": 1 } }

// POST /customers  (duplicate phone) -> 409
{ "message": "A customer with the same phone or email already exists: Ayesha Khan.", "code": "DUPLICATE", "data": { "customer": { "id": "2", "name": "Ayesha Khan", "phone": "+92 300 0000001", "email": "ayesha.k@example.com" } } }

// POST /payments  (too much) -> 422
{ "message": "Please correct the highlighted fields.", "errors": { "amount": "Amount exceeds the remaining balance (204.49)." } }

// GET /invoices/{id}  (abridged)
{ "data": { "id": "5", "number": "INV-0001", "status": "partially_paid", "storedStatus": "issued", "subtotal": 319.99, "discountTotal": 30, "tax": 14.5, "total": 304.49, "paid": 100, "balance": 204.49, "items": [ { "type": "service", "description": "Consult", "qty": 3, "unitPrice": 100, "discount": 10, "lineTotal": 270 } ], "payments": [ { "receiptNo": "RCPT-0001", "amount": 100, "status": "completed", "method": "cash", "transactionId": "TXN-1" } ] } }

// 403
{ "message": "You do not have permission to do this." }
```
