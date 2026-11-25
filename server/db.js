import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { openDatabase } from "./mysql-sync.js";
import {
  DEFAULT_DOCS,
  DEFAULT_EXPENSE,
  DEFAULT_INCOME,
  EXAMPLE_METRICS,
  GRADES,
  PLANS,
  PRICE_TABLE,
  STAGES
} from "./catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(root, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "archivos");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function translate(sql) {
  return String(sql)
    .replaceAll("INSERT INTO settings(key, value)", "INSERT INTO settings(`key`, value)")
    .replaceAll("SELECT key, value FROM settings", "SELECT `key`, value FROM settings")
    .replace(/ON CONFLICT\([^)]*\) DO UPDATE SET (\w+) = excluded\.\1/gi, "ON DUPLICATE KEY UPDATE $1 = VALUES($1)");
}

function bind(args) {
  return args.map((value) => (value === undefined ? null : value));
}

const database = openDatabase({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "solicitudes_pension"
});

function run(sql, ...args) {
  const result = database.query(translate(sql), bind(args));
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}
function get(sql, ...args) {
  return database.query(translate(sql), bind(args)).rows[0];
}
function all(sql, ...args) {
  return database.query(translate(sql), bind(args)).rows;
}

export const db = {
  prepare(sql) {
    const text = translate(sql);
    return {
      run: (...args) => run(text, ...args),
      get: (...args) => get(text, ...args),
      all: (...args) => all(text, ...args)
    };
  },
  exec(sql) {
    const text = String(sql);
    if (text.includes("PRAGMA") || text.includes("CREATE TABLE")) return;
    for (const part of text.split(";")) {
      const statement = part.trim();
      if (statement) run(statement);
    }
  }
};

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function tokenMatches(stored, given) {
  if (!stored || !given) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(hashToken(given));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function todayEC(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function addCalendarDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addBusinessDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let left = days;
  while (left > 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const day = dt.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return dt.toISOString().slice(0, 10);
}

export function addYearsMinusDay(iso, years) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function formatEC(iso) {
  if (!iso) return "";
  const hasTime = iso.includes("T");
  const date = hasTime ? new Date(iso) : new Date(iso + "T12:00:00-05:00");
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  campus TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notify_email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT '',
  ruc TEXT NOT NULL DEFAULT '',
  policy_url TEXT NOT NULL DEFAULT '',
  logo_path TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  stage_id INTEGER NOT NULL REFERENCES stages(id),
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL,
  variant TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_prices (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  stage_id INTEGER NOT NULL REFERENCES stages(id),
  school_year TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL,
  UNIQUE(school_id, plan_id, stage_id, school_year)
);
CREATE TABLE IF NOT EXISTS plan_metrics (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  school_year TEXT NOT NULL,
  basis TEXT NOT NULL,
  min_amount REAL,
  max_amount REAL,
  UNIQUE(school_id, plan_id, school_year)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  school_year TEXT NOT NULL,
  variant TEXT NOT NULL,
  form_code TEXT NOT NULL,
  status TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT -1,
  requested_plan TEXT NOT NULL DEFAULT '',
  assigned_plan_id INTEGER REFERENCES plans(id),
  suggested_plan_id INTEGER REFERENCES plans(id),
  assignment_note TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  reference TEXT UNIQUE,
  rep1_name TEXT NOT NULL DEFAULT '',
  rep1_email TEXT NOT NULL DEFAULT '',
  rep1_phone TEXT NOT NULL DEFAULT '',
  students_label TEXT NOT NULL DEFAULT '',
  income_annual INTEGER NOT NULL DEFAULT 0,
  expense_annual INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  grade_name TEXT NOT NULL,
  sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS representatives (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  workplace TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  employed TEXT NOT NULL DEFAULT '',
  ruc_type TEXT NOT NULL DEFAULT '',
  vehicles INTEGER NOT NULL DEFAULT 0,
  kids_daycare INTEGER NOT NULL DEFAULT 0,
  kids_school INTEGER NOT NULL DEFAULT 0,
  kids_university INTEGER NOT NULL DEFAULT 0,
  same_children INTEGER NOT NULL DEFAULT 0,
  situation TEXT NOT NULL DEFAULT '',
  absent_reason TEXT NOT NULL DEFAULT '',
  signature_name TEXT NOT NULL DEFAULT '',
  UNIQUE(application_id, slot)
);
CREATE TABLE IF NOT EXISTS income_lines (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  rep_slot INTEGER NOT NULL,
  category TEXT NOT NULL,
  annual_amount INTEGER NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS expense_lines (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  household INTEGER NOT NULL,
  category TEXT NOT NULL,
  annual_amount INTEGER NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  rep_slot INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS application_dates (
  application_id INTEGER PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  received_at TEXT,
  file_complete_at TEXT,
  review_started_at TEXT,
  committee_at TEXT,
  response_at TEXT,
  accept_deadline TEXT,
  accepted_at TEXT,
  reconsideration_deadline TEXT,
  reconsideration_at TEXT,
  valid_from TEXT,
  valid_until TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS mail_log (
  id INTEGER PRIMARY KEY,
  application_id INTEGER,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_school ON applications(school_id, status);
CREATE INDEX IF NOT EXISTS idx_files_app ON files(application_id);
`);

function setSetting(key, value) {
  run(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    String(value)
  );
}

export function getSettings() {
  const out = {};
  for (const row of all("SELECT key, value FROM settings")) out[row.key] = row.value;
  return out;
}

function jsonSetting(key, fallback) {
  const raw = getSettings()[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function seed() {
  if (get("SELECT COUNT(*) AS c FROM schools").c > 0) return;
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    const settings = {
      school_year: "2027-2028",
      school_year_start: "2027-09-01",
      accept_days: "5",
      reconsideration_business_days: "5",
      validity_years: "3",
      committee_lead_days: "5",
      metrics_confirmed: "0",
      response_text_short:
        "La Gerencia Administrativa y Financiera analiza la postulación y responde en 2 a 3 días calendario desde la recepción del expediente completo.",
      response_text_full:
        "Las postulaciones a los planes C, D y E se resuelven en cortes del Comité de Admisiones, según los cupos disponibles. Admisiones le informará la fecha del corte que corresponde a su postulación. El expediente debe estar completo hasta 5 días hábiles antes del corte; si llega después, pasa al corte siguiente.",
      smtp_host: "",
      smtp_port: "587",
      smtp_secure: "0",
      smtp_user: "",
      smtp_pass: "",
      smtp_from_name: "ReinventED Admisiones",
      income_items: JSON.stringify(DEFAULT_INCOME),
      expense_items: JSON.stringify(DEFAULT_EXPENSE),
      documents: JSON.stringify(DEFAULT_DOCS)
    };
    for (const [key, value] of Object.entries(settings)) setSetting(key, value);

    const schools = [
      {
        slug: "santa-clara",
        code: "SC",
        name: "ReinventED Santa Clara",
        campus: "Admisiones",
        phone: "02 392 3532",
        email: "ayudafinanciera@reinventedsantaclara.edu.ec",
        address: "Leopoldo Mercado y Atuntaqui, Sangolquí",
        legal_name: "EDUCACIÓN SANTA CLARA EDUSANTACLARA S.A.S.",
        ruc: "1793196314001",
        policy_url: "https://reinventedschools.com/docs/Politica-Proteccion-de-Datos-Reinvented-Santa-Clara.pdf",
        logo_path: "/logos/santa-clara.svg"
      },
      {
        slug: "puembo",
        code: "PU",
        name: "ReinventED Puembo",
        campus: "Admisiones",
        phone: "",
        email: "",
        address: "",
        legal_name: "",
        ruc: "",
        policy_url: "https://reinventedschools.com/",
        logo_path: "/logos/puembo.svg"
      }
    ];
    const insertSchool = db.prepare(`INSERT INTO schools
      (slug, code, name, campus, phone, email, notify_email, address, legal_name, ruc, policy_url, logo_path)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`);
    for (const school of schools) {
      insertSchool.run(
        school.slug,
        school.code,
        school.name,
        school.campus,
        school.phone,
        school.email,
        school.address,
        school.legal_name,
        school.ruc,
        school.policy_url,
        school.logo_path
      );
    }

    const insertStage = db.prepare("INSERT INTO stages(name, sort) VALUES(?, ?)");
    STAGES.forEach((name, index) => insertStage.run(name, index + 1));
    const stageId = Object.fromEntries(all("SELECT id, name FROM stages").map((row) => [row.name, row.id]));

    const insertGrade = db.prepare("INSERT INTO grades(name, stage_id, sort) VALUES(?, ?, ?)");
    GRADES.forEach(([name, stage], index) => insertGrade.run(name, stageId[stage], index + 1));

    const insertPlan = db.prepare("INSERT INTO plans(code, name, sort, variant) VALUES(?, ?, ?, ?)");
    for (const plan of PLANS) insertPlan.run(plan.code, plan.name, plan.sort, plan.variant);
    const planId = Object.fromEntries(all("SELECT id, code FROM plans").map((row) => [row.code, row.id]));

    const insertPrice = db.prepare(`INSERT INTO plan_prices
      (school_id, plan_id, stage_id, school_year, monthly_amount) VALUES(?, ?, ?, '2027-2028', ?)`);
    const insertMetric = db.prepare(`INSERT INTO plan_metrics
      (school_id, plan_id, school_year, basis, min_amount, max_amount) VALUES(?, ?, '2027-2028', 'ingreso_mensual', ?, ?)`);
    for (const school of all("SELECT id FROM schools")) {
      for (const [stage, amounts] of Object.entries(PRICE_TABLE)) {
        for (const [code, amount] of Object.entries(amounts)) {
          insertPrice.run(school.id, planId[code], stageId[stage], amount);
        }
      }
      for (const metric of EXAMPLE_METRICS) {
        insertMetric.run(school.id, planId[metric.plan], metric.min, metric.max);
      }
    }

    const email = process.env.ADMIN_EMAIL || "admin@reinvented.local";
    const password = process.env.ADMIN_PASSWORD || "Pension2026";
    run(
      "INSERT INTO users(name, email, password_hash, created_at) VALUES(?, ?, ?, ?)",
      process.env.ADMIN_NAME || "Administrador",
      email.toLowerCase(),
      bcrypt.hashSync(password, 10),
      now
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

seed();

function familyLinks() {
  const raw = getSettings().family_links;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureFamilyLinks() {
  if (familyLinks().length) return;
  const links = [
    ["santa-clara", "short", "Santa Clara · Plan B"],
    ["santa-clara", "full", "Santa Clara · Planes C, D y E"],
    ["puembo", "short", "Puembo · Plan B"],
    ["puembo", "full", "Puembo · Planes C, D y E"]
  ].map(([school, variant, label]) => ({
    code: randomBytes(9).toString("hex"),
    school,
    variant,
    label
  }));
  setSetting("family_links", JSON.stringify(links));
}

async function importLocalFamilyLinks() {
  if (familyLinks().length) return;
  const sqlitePath = path.join(DATA_DIR, "solicitudes.db");
  if (!fs.existsSync(sqlitePath)) return;
  let local;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    local = new DatabaseSync(sqlitePath, { readOnly: true });
    const row = local.prepare("SELECT value FROM settings WHERE key = ?").get("family_links");
    if (row?.value) setSetting("family_links", row.value);
  } catch (error) {
    console.error("No se copiaron los enlaces locales:", error.message);
  } finally {
    if (local) local.close();
  }
}

await importLocalFamilyLinks();
ensureFamilyLinks();

export function listFamilyLinks() {
  return familyLinks().map((link) => ({
    code: link.code,
    school: link.school,
    variant: link.variant,
    label: link.label
  }));
}

export function resolveFamilyLink(code) {
  return familyLinks().find((link) => link.code === String(code || "")) || null;
}

export function regenerateFamilyLink(code) {
  const links = familyLinks();
  const link = links.find((item) => item.code === code);
  if (!link) throw httpError(404, "No encontramos ese enlace.");
  link.code = randomBytes(9).toString("hex");
  setSetting("family_links", JSON.stringify(links));
  return listFamilyLinks();
}

const LINK_LABELS = {
  "santa-clara|short": "Santa Clara · Plan B",
  "santa-clara|full": "Santa Clara · Planes C, D y E",
  "puembo|short": "Puembo · Plan B",
  "puembo|full": "Puembo · Planes C, D y E"
};

export function ensureFamilyLink(school, variant) {
  const key = `${school}|${variant}`;
  if (!LINK_LABELS[key]) throw httpError(400, "Elija el colegio y el tipo de formulario.");
  const links = familyLinks();
  let link = links.find((item) => item.school === school && item.variant === variant);
  let created = false;
  if (!link) {
    link = { code: randomBytes(9).toString("hex"), school, variant, label: LINK_LABELS[key] };
    links.push(link);
    created = true;
    setSetting("family_links", JSON.stringify(links));
  }
  return { code: link.code, school: link.school, variant: link.variant, label: link.label, created };
}

export function listSchools() {
  return all("SELECT * FROM schools WHERE active = 1 ORDER BY name");
}

export function schoolBySlug(slug) {
  return get("SELECT * FROM schools WHERE slug = ?", slug);
}

function publicSchool(school) {
  return {
    slug: school.slug,
    code: school.code,
    name: school.name,
    campus: school.campus,
    phone: school.phone,
    email: school.email,
    address: school.address,
    legalName: school.legal_name,
    ruc: school.ruc,
    policyUrl: school.policy_url,
    logo: school.logo_path
  };
}

export function publicConfig(slug) {
  const school = schoolBySlug(slug);
  if (!school || !school.active) return null;
  const settings = getSettings();
  const year = settings.school_year;
  const prices = {};
  for (const row of all(
    `SELECT st.name AS stage, p.code AS plan, pp.monthly_amount AS amount
     FROM plan_prices pp
     JOIN stages st ON st.id = pp.stage_id
     JOIN plans p ON p.id = pp.plan_id
     WHERE pp.school_id = ? AND pp.school_year = ?`,
    school.id,
    year
  )) {
    prices[row.stage] = prices[row.stage] || {};
    prices[row.stage][row.plan] = row.amount;
  }
  return {
    school: publicSchool(school),
    year,
    grades: all(
      `SELECT g.name, s.name AS stage
       FROM grades g JOIN stages s ON s.id = g.stage_id
       ORDER BY g.sort`
    ),
    stages: all("SELECT name FROM stages ORDER BY sort").map((row) => row.name),
    plans: all("SELECT code, name, variant FROM plans ORDER BY sort"),
    prices,
    income: jsonSetting("income_items", DEFAULT_INCOME),
    expense: jsonSetting("expense_items", DEFAULT_EXPENSE),
    documents: jsonSetting("documents", DEFAULT_DOCS),
    deadlines: {
      acceptDays: Number(settings.accept_days),
      reconsiderationBusinessDays: Number(settings.reconsideration_business_days),
      validityYears: Number(settings.validity_years),
      committeeLead: Number(settings.committee_lead_days),
      responseTextShort: settings.response_text_short,
      responseTextFull: settings.response_text_full
    }
  };
}

function cleanD(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 2000);
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function cleanNa(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (!/^[12]_[a-z0-9_]+$/i.test(key) || !value || typeof value !== "object") continue;
    out[key] = { on: Boolean(value.on), why: String(value.why || "").slice(0, 500) };
  }
  return out;
}

function cleanStu(input) {
  const list = Array.isArray(input) && input.length ? input.slice(0, 4) : [{ n: "", g: "" }];
  return list.map((item) => ({
    n: String(item?.n || "").slice(0, 160),
    g: String(item?.g || "").slice(0, 80)
  }));
}

function amountOf(value) {
  if (value === "" || value == null) return null;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : null;
}

function loadApp(publicId) {
  return get("SELECT * FROM applications WHERE public_id = ?", publicId);
}

function requireToken(publicId, token) {
  const app = loadApp(publicId);
  if (!app || !tokenMatches(app.token_hash, token)) throw httpError(404, "No encontramos la solicitud.");
  return app;
}

function filesMap(applicationId) {
  const map = {};
  for (const row of all("SELECT * FROM files WHERE application_id = ? ORDER BY id", applicationId)) {
    const key = `${row.rep_slot}_${row.doc_id}`;
    if (!map[key]) map[key] = [];
    map[key].push({ id: row.id, name: row.original_name, size: row.size });
  }
  return map;
}

function familyPayload(app) {
  const school = get("SELECT slug FROM schools WHERE id = ?", app.school_id);
  const payload = JSON.parse(app.payload);
  return {
    id: app.public_id,
    status: app.status,
    step: app.step,
    variant: app.variant,
    formCode: app.form_code,
    year: app.school_year,
    reference: app.reference || "",
    reviewNote: app.review_note || "",
    submittedAt: app.submitted_at || "",
    submittedAtLabel: formatEC(app.submitted_at),
    school: school.slug,
    d: payload.d || {},
    na: payload.na || {},
    stu: payload.stu || [{ n: "", g: "" }],
    files: filesMap(app.id),
    config: publicConfig(school.slug)
  };
}

export function createApplication(code) {
  const link = resolveFamilyLink(code);
  if (!link) throw httpError(404, "Este enlace no corresponde a una postulación.");
  const variant = link.variant;
  const school = schoolBySlug(link.school);
  if (!school || !school.active) throw httpError(400, "Este colegio no está disponible.");
  const settings = getSettings();
  const now = new Date().toISOString();
  const publicId = randomBytes(12).toString("hex");
  const token = randomBytes(24).toString("hex");
  const formCode = school.code + (variant === "full" ? "-02" : "-01");
  const payload = JSON.stringify({ d: {}, na: {}, stu: [{ n: "", g: "" }] });
  const info = run(
    `INSERT INTO applications
      (public_id, token_hash, school_id, school_year, variant, form_code, status, step, requested_plan, assignment_note, review_note, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'borrador', -1, ?, '', '', ?, ?, ?)`,
    publicId,
    hashToken(token),
    school.id,
    settings.school_year,
    variant,
    formCode,
    variant === "short" ? "B" : "",
    payload,
    now,
    now
  );
  run("INSERT INTO application_dates(application_id) VALUES(?)", info.lastInsertRowid);
  run(
    "INSERT INTO events(application_id, at, kind, detail, actor) VALUES(?, ?, 'creada', 'Borrador iniciado', 'familia')",
    info.lastInsertRowid,
    now
  );
  return { id: publicId, token, ...familyPayload(loadApp(publicId)) };
}

export function readFamily(publicId, token) {
  return familyPayload(requireToken(publicId, token));
}

function storedPhone(d, slot) {
  let local = String(d[`r${slot}_tel`] || "").replace(/\D/g, "");
  if (!local) return "";
  const raw = String(d[`r${slot}_cc`] || "");
  const code = (raw.includes("|") ? raw.split("|")[0] : raw).replace(/\D/g, "") || "593";
  if (code === "593" && local.startsWith("0")) local = local.slice(1);
  return `+${code} ${local}`;
}

function syncApplication(app, step, d, na, stu) {
  const incomeCats = jsonSetting("income_items", DEFAULT_INCOME).map((item) => item.id);
  const expenseCats = jsonSetting("expense_items", DEFAULT_EXPENSE).map((item) => item.id);
  const repSlots = d.r2s === "full" ? [1, 2] : [1];
  const homes = d.r2s === "full" && d.home === "two" ? 2 : 1;
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    run("DELETE FROM students WHERE application_id = ?", app.id);
    const insertStudent = db.prepare("INSERT INTO students(application_id, full_name, grade_name, sort) VALUES(?, ?, ?, ?)");
    stu.forEach((student, index) => insertStudent.run(app.id, student.n.trim(), student.g, index));

    run("DELETE FROM representatives WHERE application_id = ?", app.id);
    const insertRep = db.prepare(`INSERT INTO representatives
      (application_id, slot, full_name, relationship, email, phone, workplace, position, employed, ruc_type, vehicles,
       kids_daycare, kids_school, kids_university, same_children, situation, absent_reason, signature_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const slots = d.r2s ? [1, 2] : [1];
    for (const slot of slots) {
      const prefix = `r${slot}_`;
      insertRep.run(
        app.id,
        slot,
        String(d[prefix + "name"] || ""),
        String(d[prefix + "rel"] || ""),
        String(d[prefix + "mail"] || ""),
        storedPhone(d, slot),
        String(d[prefix + "work"] || ""),
        String(d[prefix + "pos"] || ""),
        String(d[prefix + "qdep"] || ""),
        String(d[prefix + "qruc"] || ""),
        Math.max(0, Math.round(Number(d[prefix + "veh"]) || 0)),
        Math.max(0, Math.round(Number(d[prefix + "kg"]) || 0)),
        Math.max(0, Math.round(Number(d[prefix + "kc"]) || 0)),
        Math.max(0, Math.round(Number(d[prefix + "ku"]) || 0)),
        slot === 2 && d.r2_same === true ? 1 : 0,
        slot === 2 ? String(d.r2s || "") : "full",
        slot === 2 ? String(d.r2_why || "") : "",
        String(d["sig" + slot] || "")
      );
    }

    run("DELETE FROM income_lines WHERE application_id = ?", app.id);
    const insertIncome = db.prepare(
      "INSERT INTO income_lines(application_id, rep_slot, category, annual_amount, comment) VALUES(?, ?, ?, ?, ?)"
    );
    let income = 0;
    for (const slot of repSlots) {
      for (const category of incomeCats) {
        const raw = d[`r${slot}_${category}`];
        const comment = String(d[`r${slot}_${category}_c`] || "");
        const annual = amountOf(raw);
        if (annual == null && !comment) continue;
        const value = annual || 0;
        income += value;
        insertIncome.run(app.id, slot, category, value, comment);
      }
    }

    run("DELETE FROM expense_lines WHERE application_id = ?", app.id);
    const insertExpense = db.prepare(
      "INSERT INTO expense_lines(application_id, household, category, annual_amount, comment) VALUES(?, ?, ?, ?, ?)"
    );
    let expense = 0;
    for (let household = 1; household <= homes; household += 1) {
      for (const category of expenseCats) {
        const raw = d[`h${household}_${category}`];
        const comment = String(d[`h${household}_${category}_c`] || "");
        const annual = amountOf(raw);
        if (annual == null && !comment) continue;
        const value = annual || 0;
        expense += value;
        insertExpense.run(app.id, household, category, value, comment);
      }
    }

    const studentsLabel = stu
      .filter((student) => student.n.trim())
      .map((student) => student.n.trim() + (student.g ? ` (${student.g})` : ""))
      .join(", ");
    const requested = app.variant === "short" ? "B" : String(d.plan || "");
    run(
      `UPDATE applications SET
        step = ?, payload = ?, requested_plan = ?, rep1_name = ?, rep1_email = ?, rep1_phone = ?,
        students_label = ?, income_annual = ?, expense_annual = ?, updated_at = ?
       WHERE id = ?`,
      step,
      JSON.stringify({ d, na, stu }),
      requested,
      String(d.r1_name || ""),
      String(d.r1_mail || ""),
      storedPhone(d, 1),
      studentsLabel,
      income,
      expense,
      now,
      app.id
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function saveFamily(publicId, token, body) {
  const app = requireToken(publicId, token);
  if (app.status !== "borrador" && app.status !== "incompleta") {
    throw httpError(409, "Esta solicitud ya fue enviada y no admite cambios.");
  }
  const step = Number.isInteger(body.step) ? Math.min(7, Math.max(-1, body.step)) : app.step;
  syncApplication(app, step, cleanD(body.d), cleanNa(body.na), cleanStu(body.stu));
  return loadApp(publicId);
}

export function discardFamily(publicId, token) {
  const app = requireToken(publicId, token);
  if (app.status !== "borrador") throw httpError(409, "Solo se puede descartar un borrador.");
  for (const file of all("SELECT stored_path FROM files WHERE application_id = ?", app.id)) {
    fs.rmSync(file.stored_path, { force: true });
  }
  run("DELETE FROM applications WHERE id = ?", app.id);
  fs.rmSync(path.join(UPLOAD_DIR, publicId), { recursive: true, force: true });
}

function safeStoredPath(stored) {
  const full = path.resolve(stored);
  const relative = path.relative(path.resolve(UPLOAD_DIR), full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw httpError(400, "Archivo no disponible.");
  return full;
}

export function addFiles(publicId, token, key, uploaded) {
  const app = requireToken(publicId, token);
  if (app.status !== "borrador" && app.status !== "incompleta") {
    for (const file of uploaded) fs.rmSync(file.path, { force: true });
    throw httpError(409, "Esta solicitud ya fue enviada y no admite cambios.");
  }
  const match = /^([12])_([a-z0-9_]+)$/i.exec(key || "");
  if (!match) {
    for (const file of uploaded) fs.rmSync(file.path, { force: true });
    throw httpError(400, "Documento no reconocido.");
  }
  const slot = Number(match[1]);
  const docId = match[2].toLowerCase();
  const existing = get(
    "SELECT COUNT(*) AS c FROM files WHERE application_id = ? AND rep_slot = ? AND doc_id = ?",
    app.id,
    slot,
    docId
  ).c;
  if (existing + uploaded.length > 8) {
    for (const file of uploaded) fs.rmSync(file.path, { force: true });
    throw httpError(400, "Puede adjuntar hasta 8 archivos por documento.");
  }
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO files
    (application_id, rep_slot, doc_id, original_name, stored_path, mime, size, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const file of uploaded) {
    const original = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 180);
    insert.run(app.id, slot, docId, original, file.path, file.mimetype, file.size, now);
  }
  const payload = JSON.parse(app.payload);
  if (payload.na && payload.na[`${slot}_${docId}`]) payload.na[`${slot}_${docId}`].on = false;
  run("UPDATE applications SET payload = ?, updated_at = ? WHERE id = ?", JSON.stringify(payload), now, app.id);
  return filesMap(app.id)[`${slot}_${docId}`] || [];
}

export function removeFile(publicId, token, fileId) {
  const app = requireToken(publicId, token);
  if (app.status !== "borrador" && app.status !== "incompleta") {
    throw httpError(409, "Esta solicitud ya fue enviada y no admite cambios.");
  }
  const file = get("SELECT * FROM files WHERE id = ? AND application_id = ?", fileId, app.id);
  if (!file) throw httpError(404, "No encontramos el archivo.");
  fs.rmSync(safeStoredPath(file.stored_path), { force: true });
  run("DELETE FROM files WHERE id = ?", file.id);
  run("UPDATE applications SET updated_at = ? WHERE id = ?", new Date().toISOString(), app.id);
}

function makeReference(school, year) {
  const yy = String(year).replace(/\D/g, "").slice(2, 4) || "27";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const reference = `TP-${yy}-${school.code}-${randomBytes(2).toString("hex").toUpperCase()}`;
    if (!get("SELECT 1 AS ok FROM applications WHERE reference = ?", reference)) return reference;
  }
  return `TP-${yy}-${school.code}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function markSubmitted(publicId) {
  const app = loadApp(publicId);
  if (!app) throw httpError(404, "No encontramos la solicitud.");
  if (app.status !== "borrador" && app.status !== "incompleta") {
    throw httpError(409, "Esta solicitud ya fue enviada.");
  }
  const school = get("SELECT * FROM schools WHERE id = ?", app.school_id);
  const now = new Date().toISOString();
  const reference = app.reference || makeReference(school, app.school_year);
  const suggestion = suggestForApplication(app.id);
  const resubmit = app.status === "incompleta";
  run(
    `UPDATE applications SET
      status = 'enviada', reference = ?, submitted_at = COALESCE(submitted_at, ?),
      suggested_plan_id = ?, review_note = '', updated_at = ?
     WHERE id = ?`,
    reference,
    now,
    suggestion ? suggestion.id : null,
    now,
    app.id
  );
  run(
    "UPDATE application_dates SET received_at = COALESCE(received_at, ?) WHERE application_id = ?",
    todayEC(),
    app.id
  );
  run(
    "INSERT INTO events(application_id, at, kind, detail, actor) VALUES(?, ?, ?, ?, 'familia')",
    app.id,
    now,
    resubmit ? "reenvio" : "enviada",
    resubmit ? "La familia reenvió la solicitud" : "Solicitud enviada"
  );
  return loadApp(publicId);
}

export function familyView(publicId, token) {
  return familyPayload(requireToken(publicId, token));
}

function metricValue(basis, incomeAnnual, expenseAnnual, students) {
  const income = incomeAnnual / 12;
  const expense = expenseAnnual / 12;
  const disposable = income - expense;
  if (basis === "disponible_mensual") return disposable;
  if (basis === "disponible_por_estudiante") return students > 0 ? disposable / students : disposable;
  return income;
}

export function suggestForApplication(applicationId) {
  const app = get("SELECT * FROM applications WHERE id = ?", applicationId);
  if (!app) return null;
  const students = get(
    "SELECT COUNT(*) AS c FROM students WHERE application_id = ? AND TRIM(full_name) <> ''",
    applicationId
  ).c;
  const metrics = all(
    `SELECT m.*, p.code, p.name, p.sort, p.id AS plan_id
     FROM plan_metrics m JOIN plans p ON p.id = m.plan_id
     WHERE m.school_id = ? AND m.school_year = ?
     ORDER BY p.sort DESC`,
    app.school_id,
    app.school_year
  );
  for (const metric of metrics) {
    const value = metricValue(metric.basis, app.income_annual, app.expense_annual, students);
    const minOk = metric.min_amount == null || value >= metric.min_amount;
    const maxOk = metric.max_amount == null || value <= metric.max_amount;
    if (minOk && maxOk) return { ...metric, id: metric.plan_id, value, students };
  }
  return null;
}

function lineLabel(list, id) {
  return (list.find((item) => item.id === id) || { label: id }).label;
}

export function applicationDetail(publicId) {
  const app = loadApp(publicId);
  if (!app) return null;
  const school = get("SELECT * FROM schools WHERE id = ?", app.school_id);
  const payload = JSON.parse(app.payload);
  const incomeCats = jsonSetting("income_items", DEFAULT_INCOME);
  const expenseCats = jsonSetting("expense_items", DEFAULT_EXPENSE);
  const documents = jsonSetting("documents", DEFAULT_DOCS);
  const plans = all("SELECT id, code, name, variant FROM plans ORDER BY sort");
  const assigned = plans.find((plan) => plan.id === app.assigned_plan_id) || null;
  const suggestion = suggestForApplication(app.id);
  const prices = all(
    `SELECT st.name AS stage, p.code AS plan, pp.monthly_amount AS amount
     FROM plan_prices pp
     JOIN stages st ON st.id = pp.stage_id
     JOIN plans p ON p.id = pp.plan_id
     WHERE pp.school_id = ? AND pp.school_year = ?`,
    app.school_id,
    app.school_year
  );
  const metrics = all(
    `SELECT p.code AS plan, m.basis, m.min_amount AS min, m.max_amount AS max
     FROM plan_metrics m JOIN plans p ON p.id = m.plan_id
     WHERE m.school_id = ? AND m.school_year = ?
     ORDER BY p.sort`,
    app.school_id,
    app.school_year
  );
  const students = all(
    "SELECT full_name AS name, grade_name AS grade FROM students WHERE application_id = ? ORDER BY sort",
    app.id
  );
  const gradeStage = Object.fromEntries(
    all("SELECT g.name, s.name AS stage FROM grades g JOIN stages s ON s.id = g.stage_id").map((row) => [row.name, row.stage])
  );
  return {
    id: app.public_id,
    reference: app.reference || "",
    status: app.status,
    variant: app.variant,
    formCode: app.form_code,
    year: app.school_year,
    requestedPlan: app.requested_plan,
    assignedPlan: assigned ? assigned.code : "",
    assignmentNote: app.assignment_note,
    reviewNote: app.review_note,
    suggested: suggestion
      ? { code: suggestion.code, name: suggestion.name, value: Math.round(suggestion.value), basis: suggestion.basis }
      : null,
    school: publicSchool(school),
    rep1Name: app.rep1_name,
    rep1Email: app.rep1_email,
    rep1Phone: app.rep1_phone,
    students: students.map((student) => ({ ...student, stage: gradeStage[student.grade] || "" })),
    representatives: all("SELECT * FROM representatives WHERE application_id = ? ORDER BY slot", app.id),
    income: all("SELECT * FROM income_lines WHERE application_id = ? ORDER BY rep_slot, id", app.id).map((line) => ({
      ...line,
      label: lineLabel(incomeCats, line.category)
    })),
    expenses: all("SELECT * FROM expense_lines WHERE application_id = ? ORDER BY household, id", app.id).map((line) => ({
      ...line,
      label: lineLabel(expenseCats, line.category)
    })),
    totals: {
      incomeAnnual: app.income_annual,
      expenseAnnual: app.expense_annual,
      incomeMonthly: Math.round(app.income_annual / 12),
      expenseMonthly: Math.round(app.expense_annual / 12),
      disposableMonthly: Math.round((app.income_annual - app.expense_annual) / 12)
    },
    files: all("SELECT * FROM files WHERE application_id = ? ORDER BY rep_slot, doc_id, id", app.id).map((file) => ({
      id: file.id,
      slot: file.rep_slot,
      docId: file.doc_id,
      name: file.original_name,
      mime: file.mime,
      size: file.size,
      label: lineLabel(documents.map((doc) => ({ id: doc.id, label: doc.t })), file.doc_id)
    })),
    na: payload.na || {},
    auth: payload.d?.auth === true,
    declaration: payload.d?.decl === true,
    home: payload.d?.home || "",
    dates: get("SELECT * FROM application_dates WHERE application_id = ?", app.id) || {},
    events: all("SELECT at, kind, detail, actor FROM events WHERE application_id = ? ORDER BY id DESC", app.id),
    mail: all(
      "SELECT to_email, subject, status, detail, created_at FROM mail_log WHERE application_id = ? ORDER BY id DESC",
      app.id
    ),
    plans,
    prices,
    metrics,
    documents,
    metricsConfirmed: getSettings().metrics_confirmed === "1",
    createdAt: app.created_at,
    updatedAt: app.updated_at,
    submittedAt: app.submitted_at || "",
    submittedAtLabel: formatEC(app.submitted_at)
  };
}

const DATE_FIELDS = [
  "received_at",
  "file_complete_at",
  "review_started_at",
  "committee_at",
  "response_at",
  "accept_deadline",
  "accepted_at",
  "reconsideration_deadline",
  "reconsideration_at",
  "valid_from",
  "valid_until"
];

export function updateAdmin(publicId, body, actor) {
  const app = loadApp(publicId);
  if (!app) throw httpError(404, "No encontramos la solicitud.");
  const allowed = new Set([
    "enviada",
    "en_revision",
    "incompleta",
    "en_comite",
    "asignada",
    "aceptada",
    "no_admitida",
    "caducada",
    "reconsideracion",
    "borrador"
  ]);
  let status = body.status || app.status;
  if (!allowed.has(status)) throw httpError(400, "Estado no reconocido.");
  let reviewNote = body.reviewNote != null ? String(body.reviewNote).slice(0, 2000) : app.review_note;
  if (status === "incompleta" && !reviewNote.trim()) {
    throw httpError(400, "Escriba qué debe corregir la familia.");
  }
  let assignedId = app.assigned_plan_id;
  let assignmentNote = body.assignmentNote != null ? String(body.assignmentNote).slice(0, 2000) : app.assignment_note;
  if (body.assignedPlan) {
    const plan = get("SELECT * FROM plans WHERE code = ?", String(body.assignedPlan).toUpperCase());
    if (!plan) throw httpError(400, "Plan no reconocido.");
    const suggestion = suggestForApplication(app.id);
    if (suggestion && suggestion.code !== plan.code && !assignmentNote.trim()) {
      throw httpError(400, "Si asigna un plan distinto al sugerido, escriba el motivo.");
    }
    assignedId = plan.id;
    if (!body.status) status = "asignada";
  }
  const current = get("SELECT * FROM application_dates WHERE application_id = ?", app.id) || {};
  const dates = {};
  for (const field of DATE_FIELDS) dates[field] = current[field] || null;
  const incoming = body.dates || {};
  for (const field of DATE_FIELDS) {
    if (incoming[field] == null) continue;
    if (incoming[field] === "") {
      dates[field] = null;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incoming[field])) throw httpError(400, "Use fechas en formato AAAA-MM-DD.");
    dates[field] = incoming[field];
  }
  const settings = getSettings();
  const today = todayEC();
  if (status === "en_revision" && !dates.review_started_at) dates.review_started_at = today;
  if (status === "en_comite" && !dates.committee_at) dates.committee_at = today;
  if (status === "aceptada" && !dates.accepted_at) dates.accepted_at = today;
  if ((status === "asignada" || body.assignedPlan) && assignedId) {
    if (!dates.response_at) dates.response_at = today;
    if (!dates.accept_deadline) dates.accept_deadline = addCalendarDays(dates.response_at, Number(settings.accept_days) || 5);
    if (!dates.reconsideration_deadline) {
      dates.reconsideration_deadline = addBusinessDays(
        dates.response_at,
        Number(settings.reconsideration_business_days) || 5
      );
    }
    if (!dates.valid_from) dates.valid_from = settings.school_year_start;
    if (!dates.valid_until) dates.valid_until = addYearsMinusDay(dates.valid_from, Number(settings.validity_years) || 3);
  }
  if ((status === "no_admitida" || status === "caducada") && !dates.response_at) dates.response_at = today;
  const now = new Date().toISOString();
  const suggestion = suggestForApplication(app.id);
  db.exec("BEGIN");
  try {
    run(
      `UPDATE applications SET status = ?, review_note = ?, assigned_plan_id = ?, assignment_note = ?, suggested_plan_id = ?, updated_at = ? WHERE id = ?`,
      status,
      reviewNote,
      assignedId,
      assignmentNote,
      suggestion ? suggestion.id : app.suggested_plan_id,
      now,
      app.id
    );
    run(
      `UPDATE application_dates SET
        received_at = ?, file_complete_at = ?, review_started_at = ?, committee_at = ?, response_at = ?,
        accept_deadline = ?, accepted_at = ?, reconsideration_deadline = ?, reconsideration_at = ?, valid_from = ?, valid_until = ?
       WHERE application_id = ?`,
      dates.received_at,
      dates.file_complete_at,
      dates.review_started_at,
      dates.committee_at,
      dates.response_at,
      dates.accept_deadline,
      dates.accepted_at,
      dates.reconsideration_deadline,
      dates.reconsideration_at,
      dates.valid_from,
      dates.valid_until,
      app.id
    );
    const bits = [`Estado: ${status}`];
    if (body.assignedPlan) bits.push(`Plan asignado: ${String(body.assignedPlan).toUpperCase()}`);
    run(
      "INSERT INTO events(application_id, at, kind, detail, actor) VALUES(?, ?, 'actualizacion', ?, ?)",
      app.id,
      now,
      bits.join(". "),
      actor
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return applicationDetail(publicId);
}

export function listApplications({ school, status, q, limit }) {
  const query = String(q || "").replace(/[%_]/g, "").trim();
  const where = [];
  const params = [];
  if (school) {
    where.push("s.slug = ?");
    params.push(school);
  }
  const groups = {
    porRevisar: ["enviada", "en_revision", "incompleta", "reconsideracion"],
    comite: ["en_comite"],
    asignadas: ["asignada", "aceptada"],
    aceptadas: ["aceptada"]
  };
  if (groups[status]) {
    where.push(`a.status IN (${groups[status].map(() => "?").join(", ")})`);
    params.push(...groups[status]);
  } else if (status && status !== "todos") {
    where.push("a.status = ?");
    params.push(status);
  } else if (!status) {
    where.push("a.status <> 'borrador'");
  }
  if (query) {
    where.push("(a.reference LIKE ? OR a.rep1_name LIKE ? OR a.rep1_email LIKE ? OR a.students_label LIKE ? OR a.form_code LIKE ?)");
    const like = `%${query}%`;
    params.push(like, like, like, like, like);
  }
  const cap = Math.min(200, Math.max(1, Number(limit) || 100));
  return all(
    `SELECT a.public_id AS id, a.reference, a.status, a.school_year AS year, a.variant, a.form_code AS formCode,
            a.requested_plan AS requestedPlan, a.rep1_name AS rep, a.rep1_email AS email, a.rep1_phone AS phone,
            a.students_label AS students, a.income_annual AS incomeAnnual, a.expense_annual AS expenseAnnual,
            a.submitted_at AS submittedAt, a.updated_at AS updatedAt,
            s.name AS schoolName, s.slug AS school, s.code AS schoolCode, p.code AS assignedPlan
     FROM applications a
     JOIN schools s ON s.id = a.school_id
     LEFT JOIN plans p ON p.id = a.assigned_plan_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY COALESCE(a.submitted_at, a.updated_at) DESC
     LIMIT ${cap}`,
    ...params
  );
}

export function summary(schoolSlug) {
  const params = [];
  let schoolSql = "";
  if (schoolSlug) {
    schoolSql = " AND s.slug = ?";
    params.push(schoolSlug);
  }
  const rows = all(
    `SELECT a.status, COUNT(*) AS c
     FROM applications a JOIN schools s ON s.id = a.school_id
     WHERE 1 = 1 ${schoolSql}
     GROUP BY a.status`,
    ...params
  );
  const count = (codes) => rows.filter((row) => codes.includes(row.status)).reduce((sum, row) => sum + row.c, 0);
  return {
    recibidas: count(["enviada", "en_revision", "incompleta", "en_comite", "asignada", "aceptada", "no_admitida", "caducada", "reconsideracion"]),
    porRevisar: count(["enviada", "en_revision", "incompleta", "reconsideracion"]),
    comite: count(["en_comite"]),
    asignadas: count(["asignada", "aceptada"]),
    aceptadas: count(["aceptada"])
  };
}

export function fileForAdmin(publicId, fileId) {
  const app = loadApp(publicId);
  if (!app) return null;
  const file = get("SELECT * FROM files WHERE id = ? AND application_id = ?", fileId, app.id);
  if (!file) return null;
  return { ...file, path: safeStoredPath(file.stored_path) };
}

export function filesForZip(publicId) {
  const detail = applicationDetail(publicId);
  if (!detail) return null;
  const app = loadApp(publicId);
  return {
    reference: detail.reference || detail.id,
    files: all("SELECT * FROM files WHERE application_id = ? ORDER BY rep_slot, doc_id, id", app.id).map((file) => ({
      ...file,
      path: safeStoredPath(file.stored_path),
      label: (detail.files.find((item) => item.id === file.id) || {}).label || file.doc_id
    }))
  };
}

export function logMail({ applicationId, to, subject, body, status, detail }) {
  run(
    "INSERT INTO mail_log(application_id, to_email, subject, body, status, detail, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
    applicationId || null,
    to || "",
    subject,
    body,
    status,
    detail || "",
    new Date().toISOString()
  );
}

export function findUser(email) {
  return get("SELECT * FROM users WHERE email = ?", String(email || "").toLowerCase());
}

export function checkPassword(user, password) {
  return Boolean(user && bcrypt.compareSync(password, user.password_hash));
}

function copyYearRows(table, year) {
  const count = get(`SELECT COUNT(*) AS c FROM ${table} WHERE school_year = ?`, year).c;
  if (count) return;
  const previous = get(
    `SELECT school_year FROM ${table} WHERE school_year <> ? ORDER BY school_year DESC LIMIT 1`,
    year
  );
  if (!previous) return;
  if (table === "plan_prices") {
    run(
      `INSERT INTO plan_prices(school_id, plan_id, stage_id, school_year, monthly_amount)
       SELECT school_id, plan_id, stage_id, ?, monthly_amount FROM plan_prices WHERE school_year = ?`,
      year,
      previous.school_year
    );
  } else {
    run(
      `INSERT INTO plan_metrics(school_id, plan_id, school_year, basis, min_amount, max_amount)
       SELECT school_id, plan_id, ?, basis, min_amount, max_amount FROM plan_metrics WHERE school_year = ?`,
      year,
      previous.school_year
    );
  }
}

export function adminConfig() {
  const settings = getSettings();
  const year = settings.school_year;
  return {
    schoolYear: year,
    schoolYearStart: settings.school_year_start,
    acceptDays: Number(settings.accept_days),
    reconsiderationBusinessDays: Number(settings.reconsideration_business_days),
    validityYears: Number(settings.validity_years),
    committeeLeadDays: Number(settings.committee_lead_days),
    responseTextShort: settings.response_text_short,
    responseTextFull: settings.response_text_full,
    metricsConfirmed: settings.metrics_confirmed === "1",
    grades: all(
      `SELECT g.name, s.name AS stage FROM grades g JOIN stages s ON s.id = g.stage_id ORDER BY g.sort`
    ),
    stages: all("SELECT name FROM stages ORDER BY sort").map((row) => row.name),
    schools: listSchools().map((school) => ({ ...publicSchool(school), notifyEmail: school.notify_email })),
    plans: all("SELECT code, name FROM plans ORDER BY sort"),
    prices: all(
      `SELECT s.slug AS school, st.name AS stage, p.code AS plan, pp.monthly_amount AS amount
       FROM plan_prices pp
       JOIN schools s ON s.id = pp.school_id
       JOIN stages st ON st.id = pp.stage_id
       JOIN plans p ON p.id = pp.plan_id
       WHERE pp.school_year = ?`,
      year
    ),
    metrics: all(
      `SELECT s.slug AS school, p.code AS plan, m.basis, m.min_amount AS min, m.max_amount AS max
       FROM plan_metrics m
       JOIN schools s ON s.id = m.school_id
       JOIN plans p ON p.id = m.plan_id
       WHERE m.school_year = ?
       ORDER BY p.sort`,
      year
    ),
    income: jsonSetting("income_items", DEFAULT_INCOME),
    expense: jsonSetting("expense_items", DEFAULT_EXPENSE),
    documents: jsonSetting("documents", DEFAULT_DOCS),
    smtp: {
      host: settings.smtp_host || "",
      port: Number(settings.smtp_port) || 587,
      secure: settings.smtp_secure === "1",
      user: settings.smtp_user || "",
      passwordSet: Boolean(settings.smtp_pass),
      fromName: settings.smtp_from_name || ""
    }
  };
}

export function saveGeneral(body) {
  const year = String(body.schoolYear || "").trim();
  const start = String(body.schoolYearStart || "").trim();
  if (!year) throw httpError(400, "Indique el año lectivo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw httpError(400, "Indique la fecha de inicio del año lectivo.");
  const stages = new Set(all("SELECT name FROM stages").map((row) => row.name));
  const grades = Array.isArray(body.grades) ? body.grades : [];
  if (!grades.length) throw httpError(400, "Debe haber al menos un grado.");
  const cleanGrades = [];
  const seen = new Set();
  for (const grade of grades) {
    const name = String(grade.name || "").trim().slice(0, 80);
    const stage = String(grade.stage || "");
    if (!name || seen.has(name)) continue;
    if (!stages.has(stage)) throw httpError(400, `El grado ${name} no tiene una etapa válida.`);
    seen.add(name);
    cleanGrades.push({ name, stage });
  }
  setSetting("school_year", year);
  setSetting("school_year_start", start);
  setSetting("accept_days", String(Math.max(1, Number(body.acceptDays) || 5)));
  setSetting("reconsideration_business_days", String(Math.max(1, Number(body.reconsiderationBusinessDays) || 5)));
  setSetting("validity_years", String(Math.max(1, Number(body.validityYears) || 3)));
  setSetting("committee_lead_days", String(Math.max(1, Number(body.committeeLeadDays) || 5)));
  setSetting("response_text_short", String(body.responseTextShort || "").slice(0, 2000));
  setSetting("response_text_full", String(body.responseTextFull || "").slice(0, 2000));
  db.exec("BEGIN");
  try {
    run("DELETE FROM grades");
    const stageId = Object.fromEntries(all("SELECT id, name FROM stages").map((row) => [row.name, row.id]));
    const insert = db.prepare("INSERT INTO grades(name, stage_id, sort) VALUES(?, ?, ?)");
    cleanGrades.forEach((grade, index) => insert.run(grade.name, stageId[grade.stage], index + 1));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  copyYearRows("plan_prices", year);
  copyYearRows("plan_metrics", year);
  return adminConfig();
}

export function saveSchool(slug, body) {
  const school = schoolBySlug(slug);
  if (!school) throw httpError(404, "No encontramos el colegio.");
  run(
    `UPDATE schools SET name = ?, campus = ?, phone = ?, email = ?, notify_email = ?, address = ?, legal_name = ?, ruc = ?, policy_url = ?
     WHERE id = ?`,
    String(body.name || school.name).slice(0, 120),
    String(body.campus || "").slice(0, 160),
    String(body.phone || "").slice(0, 40),
    String(body.email || "").slice(0, 160),
    String(body.notifyEmail || "").slice(0, 160),
    String(body.address || "").slice(0, 200),
    String(body.legalName || "").slice(0, 200),
    String(body.ruc || "").slice(0, 20),
    String(body.policyUrl || "").slice(0, 300),
    school.id
  );
  return adminConfig();
}

export function saveLogo(slug, filePath, publicPath) {
  const school = schoolBySlug(slug);
  if (!school) throw httpError(404, "No encontramos el colegio.");
  run("UPDATE schools SET logo_path = ? WHERE id = ?", publicPath, school.id);
  return filePath;
}

export function savePrices(body) {
  const school = schoolBySlug(body.school);
  if (!school) throw httpError(400, "Seleccione un colegio.");
  const year = getSettings().school_year;
  const stageId = Object.fromEntries(all("SELECT id, name FROM stages").map((row) => [row.name, row.id]));
  const planId = Object.fromEntries(all("SELECT id, code FROM plans").map((row) => [row.code, row.id]));
  const rows = Array.isArray(body.amounts) ? body.amounts : [];
  db.exec("BEGIN");
  try {
    const upsert = db.prepare(`INSERT INTO plan_prices(school_id, plan_id, stage_id, school_year, monthly_amount)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(school_id, plan_id, stage_id, school_year) DO UPDATE SET monthly_amount = excluded.monthly_amount`);
    for (const row of rows) {
      if (!stageId[row.stage] || !planId[row.plan]) continue;
      const amount = Math.round(Number(row.amount));
      if (!Number.isFinite(amount) || amount < 0) throw httpError(400, "Las pensiones deben ser números mayores o iguales a cero.");
      upsert.run(school.id, planId[row.plan], stageId[row.stage], year, amount);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return adminConfig();
}

export function saveMetrics(body) {
  const school = schoolBySlug(body.school);
  if (!school) throw httpError(400, "Seleccione un colegio.");
  const basis = ["ingreso_mensual", "disponible_mensual", "disponible_por_estudiante"].includes(body.basis)
    ? body.basis
    : "ingreso_mensual";
  const year = getSettings().school_year;
  const planId = Object.fromEntries(all("SELECT id, code FROM plans").map((row) => [row.code, row.id]));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  db.exec("BEGIN");
  try {
    run("DELETE FROM plan_metrics WHERE school_id = ? AND school_year = ?", school.id, year);
    const insert = db.prepare(`INSERT INTO plan_metrics(school_id, plan_id, school_year, basis, min_amount, max_amount)
      VALUES(?, ?, ?, ?, ?, ?)`);
    for (const row of rows) {
      if (!planId[row.plan]) continue;
      const min = row.min === "" || row.min == null ? null : Number(row.min);
      const max = row.max === "" || row.max == null ? null : Number(row.max);
      if (min != null && !Number.isFinite(min)) throw httpError(400, "Revise los montos de las métricas.");
      if (max != null && !Number.isFinite(max)) throw httpError(400, "Revise los montos de las métricas.");
      insert.run(school.id, planId[row.plan], year, basis, min, max);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  setSetting("metrics_confirmed", body.confirmed ? "1" : "0");
  return adminConfig();
}

function cleanConcepts(list) {
  if (!Array.isArray(list) || !list.length) throw httpError(400, "La lista de conceptos no puede quedar vacía.");
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = String(item.id || "").toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,12}$/.test(id) || seen.has(id)) throw httpError(400, "Hay un identificador de concepto inválido.");
    seen.add(id);
    out.push({
      id,
      label: String(item.label || "").trim().slice(0, 80),
      hint: String(item.hint || "").trim().slice(0, 300)
    });
    if (!out[out.length - 1].label) throw httpError(400, "Cada concepto necesita un nombre.");
  }
  return out;
}

export function saveConcepts(body) {
  setSetting("income_items", JSON.stringify(cleanConcepts(body.income)));
  setSetting("expense_items", JSON.stringify(cleanConcepts(body.expense)));
  if (Array.isArray(body.documents)) {
    const current = jsonSetting("documents", DEFAULT_DOCS);
    const byId = Object.fromEntries(current.map((doc) => [doc.id, doc]));
    const next = body.documents.map((doc) => {
      const base = byId[doc.id];
      if (!base) return null;
      return {
        ...base,
        t: String(doc.t || base.t).slice(0, 120),
        p: String(doc.p || base.p).slice(0, 80),
        h: String(doc.h || base.h).slice(0, 240)
      };
    }).filter(Boolean);
    if (next.length === current.length) setSetting("documents", JSON.stringify(next));
  }
  return adminConfig();
}

export function saveMailSettings(body) {
  setSetting("smtp_host", String(body.host || "").trim().slice(0, 160));
  setSetting("smtp_port", String(Number(body.port) || 587));
  setSetting("smtp_secure", body.secure ? "1" : "0");
  setSetting("smtp_user", String(body.user || "").trim().slice(0, 160));
  setSetting("smtp_from_name", String(body.fromName || "").trim().slice(0, 120));
  if (body.password) setSetting("smtp_pass", String(body.password));
  return adminConfig();
}

export function mailSettings() {
  const settings = getSettings();
  return {
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: settings.smtp_secure === "1",
    user: settings.smtp_user,
    pass: settings.smtp_pass,
    fromName: settings.smtp_from_name || "ReinventED Admisiones"
  };
}

export function internalApp(publicId) {
  const app = loadApp(publicId);
  if (!app) return null;
  const school = get("SELECT * FROM schools WHERE id = ?", app.school_id);
  return { app, school };
}
