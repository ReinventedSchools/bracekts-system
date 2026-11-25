-- Solicitudes de pensión · ReinventED Puembo y Santa Clara
-- MariaDB / MySQL. En HeidiSQL: Archivo → Ejecutar archivo SQL.
-- Crea una base nueva. No toca las bases que ya existen en el servidor.
-- Los PDF quedan en disco; aquí solo se guarda la ruta.

CREATE DATABASE IF NOT EXISTS solicitudes_pension
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE solicitudes_pension;

CREATE TABLE IF NOT EXISTS schools (
  id INT NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(160) NOT NULL,
  campus VARCHAR(160) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(160) NOT NULL DEFAULT '',
  notify_email VARCHAR(160) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  legal_name VARCHAR(255) NOT NULL DEFAULT '',
  ruc VARCHAR(20) NOT NULL DEFAULT '',
  policy_url VARCHAR(500) NOT NULL DEFAULT '',
  logo_path VARCHAR(255) NOT NULL DEFAULT '',
  active TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schools_slug (slug),
  UNIQUE KEY uq_schools_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(64) NOT NULL,
  value LONGTEXT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stages (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  sort INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stages_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grades (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  stage_id INT NOT NULL,
  sort INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grades_name (name),
  CONSTRAINT fk_grades_stage FOREIGN KEY (stage_id) REFERENCES stages (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plans (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(8) NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort INT NOT NULL,
  variant VARCHAR(16) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plan_prices (
  id INT NOT NULL AUTO_INCREMENT,
  school_id INT NOT NULL,
  plan_id INT NOT NULL,
  stage_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  monthly_amount INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_price (school_id, plan_id, stage_id, school_year),
  CONSTRAINT fk_prices_school FOREIGN KEY (school_id) REFERENCES schools (id),
  CONSTRAINT fk_prices_plan FOREIGN KEY (plan_id) REFERENCES plans (id),
  CONSTRAINT fk_prices_stage FOREIGN KEY (stage_id) REFERENCES stages (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plan_metrics (
  id INT NOT NULL AUTO_INCREMENT,
  school_id INT NOT NULL,
  plan_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  basis VARCHAR(40) NOT NULL,
  min_amount DECIMAL(14,2) NULL,
  max_amount DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metric (school_id, plan_id, school_year),
  CONSTRAINT fk_metrics_school FOREIGN KEY (school_id) REFERENCES schools (id),
  CONSTRAINT fk_metrics_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  school_slug VARCHAR(40) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id INT NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(40) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  school_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  variant VARCHAR(16) NOT NULL,
  form_code VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL,
  step INT NOT NULL DEFAULT -1,
  requested_plan VARCHAR(8) NOT NULL DEFAULT '',
  assigned_plan_id INT NULL,
  suggested_plan_id INT NULL,
  assignment_note TEXT NOT NULL DEFAULT (''),
  review_note TEXT NOT NULL DEFAULT (''),
  reference VARCHAR(32) NULL,
  rep1_name VARCHAR(160) NOT NULL DEFAULT '',
  rep1_email VARCHAR(160) NOT NULL DEFAULT '',
  rep1_phone VARCHAR(40) NOT NULL DEFAULT '',
  students_label VARCHAR(500) NOT NULL DEFAULT '',
  income_annual INT NOT NULL DEFAULT 0,
  expense_annual INT NOT NULL DEFAULT 0,
  payload LONGTEXT NOT NULL,
  submitted_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_public (public_id),
  UNIQUE KEY uq_app_reference (reference),
  KEY idx_app_school (school_id, status),
  CONSTRAINT fk_app_school FOREIGN KEY (school_id) REFERENCES schools (id),
  CONSTRAINT fk_app_assigned FOREIGN KEY (assigned_plan_id) REFERENCES plans (id),
  CONSTRAINT fk_app_suggested FOREIGN KEY (suggested_plan_id) REFERENCES plans (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  grade_name VARCHAR(80) NOT NULL,
  sort INT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_students_app (application_id),
  CONSTRAINT fk_students_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS representatives (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  slot INT NOT NULL,
  full_name VARCHAR(160) NOT NULL DEFAULT '',
  relationship VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(160) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  workplace VARCHAR(160) NOT NULL DEFAULT '',
  position VARCHAR(120) NOT NULL DEFAULT '',
  employed VARCHAR(8) NOT NULL DEFAULT '',
  ruc_type VARCHAR(8) NOT NULL DEFAULT '',
  vehicles INT NOT NULL DEFAULT 0,
  kids_daycare INT NOT NULL DEFAULT 0,
  kids_school INT NOT NULL DEFAULT 0,
  kids_university INT NOT NULL DEFAULT 0,
  same_children TINYINT NOT NULL DEFAULT 0,
  situation VARCHAR(16) NOT NULL DEFAULT '',
  absent_reason TEXT NOT NULL,
  signature_name VARCHAR(160) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_rep_slot (application_id, slot),
  CONSTRAINT fk_reps_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS income_lines (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  rep_slot INT NOT NULL,
  category VARCHAR(40) NOT NULL,
  annual_amount INT NOT NULL DEFAULT 0,
  comment VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_income_app (application_id),
  CONSTRAINT fk_income_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expense_lines (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  household INT NOT NULL,
  category VARCHAR(40) NOT NULL,
  annual_amount INT NOT NULL DEFAULT 0,
  comment VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_expense_app (application_id),
  CONSTRAINT fk_expense_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS files (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  rep_slot INT NOT NULL,
  doc_id VARCHAR(40) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size INT NOT NULL,
  uploaded_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_files_app (application_id),
  CONSTRAINT fk_files_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_dates (
  application_id INT NOT NULL,
  received_at VARCHAR(40) NULL,
  file_complete_at VARCHAR(40) NULL,
  review_started_at VARCHAR(40) NULL,
  committee_at VARCHAR(40) NULL,
  response_at VARCHAR(40) NULL,
  accept_deadline VARCHAR(40) NULL,
  accepted_at VARCHAR(40) NULL,
  reconsideration_deadline VARCHAR(40) NULL,
  reconsideration_at VARCHAR(40) NULL,
  valid_from VARCHAR(40) NULL,
  valid_until VARCHAR(40) NULL,
  PRIMARY KEY (application_id),
  CONSTRAINT fk_dates_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  at VARCHAR(40) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  detail TEXT NOT NULL,
  actor VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_events_app (application_id),
  CONSTRAINT fk_events_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mail_log (
  id INT NOT NULL AUTO_INCREMENT,
  application_id INT NULL,
  to_email VARCHAR(160) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body LONGTEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  detail TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_mail_app (application_id)
) ENGINE=InnoDB;
