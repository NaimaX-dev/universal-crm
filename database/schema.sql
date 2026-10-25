-- Universal CRM - MySQL / MariaDB schema (InnoDB, utf8mb4)
-- Works on MySQL 5.7+/8 and MariaDB 10.4+ (XAMPP). Create an empty database first, then import this file
-- (phpMyAdmin > Import) or run:  php backend/bin/setup_db.php
-- Every business-owned table carries business_id so the API can enforce business-level isolation.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS schema_version (
  version INT NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS businesses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(80) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  logo MEDIUMTEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  settings LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','agent') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  scope ENUM('assigned','all') NOT NULL DEFAULT 'assigned',
  permissions LONGTEXT NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_business (business_id, role, status),
  CONSTRAINT fk_users_business FOREIGN KEY (business_id) REFERENCES businesses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY uq_token_hash (token_hash),
  KEY idx_token_user (user_id),
  CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_attempt (email, ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_counters (
  business_id INT UNSIGNED NOT NULL,
  doc_type VARCHAR(20) NOT NULL,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, doc_type),
  CONSTRAINT fk_counter_business FOREIGN KEY (business_id) REFERENCES businesses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  company VARCHAR(150) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  notes TEXT NULL,
  details TEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  assigned_to INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_cust_business (business_id, status),
  KEY idx_cust_phone (business_id, phone_normalized),
  KEY idx_cust_email (business_id, email),
  KEY idx_cust_assigned (business_id, assigned_to),
  CONSTRAINT fk_cust_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_cust_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cust_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  source ENUM('facebook','instagram','whatsapp','phone','website','walk-in','referral','other') NOT NULL,
  status ENUM('new','contacted','follow_up','interested','converted','lost') NOT NULL DEFAULT 'new',
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  assigned_to INT UNSIGNED NULL,
  inquiry_date DATE NOT NULL,
  requirements TEXT NULL,
  notes TEXT NULL,
  next_follow_up DATE NULL,
  lost_reason VARCHAR(255) NOT NULL DEFAULT '',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_lead_business (business_id, status),
  KEY idx_lead_customer (customer_id),
  KEY idx_lead_assigned (business_id, assigned_to),
  CONSTRAINT fk_lead_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_lead_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_lead_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  lead_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  text VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_lh_lead (lead_id),
  CONSTRAINT fk_lh_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS follow_ups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  lead_id INT UNSIGNED NULL,
  responsible_id INT UNSIGNED NULL,
  due_at DATETIME NOT NULL,
  notes TEXT NULL,
  status ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  outcome TEXT NULL,
  completed_at DATETIME NULL,
  reminder_email_sent_at DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_fu_business (business_id, status, due_at),
  KEY idx_fu_responsible (business_id, responsible_id, status),
  KEY idx_fu_lead (lead_id),
  CONSTRAINT fk_fu_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_fu_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_fu_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_fu_responsible FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  follow_up_id INT UNSIGNED NULL,
  to_email VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('sent','failed','skipped') NOT NULL,
  error VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  KEY idx_email_business (business_id, created_at),
  CONSTRAINT fk_email_business FOREIGN KEY (business_id) REFERENCES businesses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT '',
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  duration VARCHAR(60) NOT NULL DEFAULT '',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_svc_business (business_id, status),
  CONSTRAINT fk_svc_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT chk_svc_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  duration VARCHAR(60) NOT NULL DEFAULT '',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_pkg_business (business_id, status),
  CONSTRAINT fk_pkg_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT chk_pkg_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS package_services (
  package_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (package_id, service_id),
  CONSTRAINT fk_ps_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_service FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  number VARCHAR(30) NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  lead_id INT UNSIGNED NULL,
  quote_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('draft','sent','accepted','rejected') NOT NULL DEFAULT 'draft',
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  terms TEXT NULL,
  invoice_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_quote_number (business_id, number),
  KEY idx_quote_customer (customer_id),
  KEY idx_quote_status (business_id, status),
  CONSTRAINT fk_quote_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_quote_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT chk_quote_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotation_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_type ENUM('service','package','custom') NOT NULL DEFAULT 'custom',
  ref_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  KEY idx_qi_quote (quotation_id),
  CONSTRAINT fk_qi_quote FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  number VARCHAR(30) NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  quotation_id INT UNSIGNED NULL,
  subscription_id INT UNSIGNED NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  terms TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_invoice_number (business_id, number),
  KEY idx_inv_customer (customer_id),
  KEY idx_inv_status (business_id, status, due_date),
  KEY idx_inv_sub (subscription_id),
  CONSTRAINT fk_inv_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_inv_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_inv_quote FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  CONSTRAINT chk_inv_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE quotations ADD CONSTRAINT fk_quote_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_type ENUM('service','package','custom') NOT NULL DEFAULT 'custom',
  ref_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  KEY idx_ii_invoice (invoice_id),
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  plan_type ENUM('service','package') NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  plan_name VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  billing_cycle ENUM('monthly','quarterly','yearly') NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  status ENUM('active','paused','cancelled') NOT NULL DEFAULT 'active',
  next_billing_date DATE NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_sub_business (business_id, status, next_billing_date),
  KEY idx_sub_customer (customer_id),
  CONSTRAINT fk_sub_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_sub_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT chk_sub_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE invoices ADD CONSTRAINT fk_inv_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS subscription_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  text VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_sh_sub (subscription_id),
  CONSTRAINT fk_sh_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  lead_id INT UNSIGNED NULL,
  quotation_id INT UNSIGNED NULL,
  invoice_id INT UNSIGNED NULL,
  purchase_date DATE NOT NULL,
  status ENUM('recorded','cancelled') NOT NULL DEFAULT 'recorded',
  notes TEXT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_pur_business (business_id, status, purchase_date),
  KEY idx_pur_customer (customer_id),
  CONSTRAINT fk_pur_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_pur_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_pur_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_pur_quote FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  CONSTRAINT fk_pur_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  CONSTRAINT chk_pur_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  item_type ENUM('service','package','custom') NOT NULL DEFAULT 'custom',
  ref_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount DECIMAL(5,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  KEY idx_pi_purchase (purchase_id),
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  invoice_id INT UNSIGNED NULL,
  purchase_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  method ENUM('cash','bank_transfer','card','cheque','mobile_wallet','other') NOT NULL,
  transaction_id VARCHAR(100) NULL,
  status ENUM('pending','completed','failed','voided') NOT NULL DEFAULT 'completed',
  notes TEXT NULL,
  void_reason VARCHAR(255) NOT NULL DEFAULT '',
  receipt_no VARCHAR(30) NOT NULL,
  recorded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  -- A transaction/reference ID may be used once per business while the payment is pending or completed.
  txn_active VARCHAR(100) GENERATED ALWAYS AS (IF(transaction_id IS NOT NULL AND transaction_id <> '' AND status IN ('pending','completed'), transaction_id, NULL)) STORED,
  UNIQUE KEY uq_receipt (business_id, receipt_no),
  UNIQUE KEY uq_txn_active (business_id, txn_active),
  KEY idx_pay_invoice (invoice_id, status),
  KEY idx_pay_purchase (purchase_id, status),
  KEY idx_pay_business (business_id, status, payment_date),
  KEY idx_pay_customer (customer_id),
  CONSTRAINT fk_pay_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_pay_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_pay_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT chk_pay_amount CHECK (amount > 0),
  CONSTRAINT chk_pay_target CHECK ((invoice_id IS NULL) <> (purchase_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  text VARCHAR(500) NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  KEY idx_act_business (business_id, created_at),
  KEY idx_act_user (user_id, created_at),
  CONSTRAINT fk_act_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_act_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_version (version) VALUES (1);
