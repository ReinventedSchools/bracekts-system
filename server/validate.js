import { DEFAULT_DOCS } from "./catalog.js";
import { db } from "./db.js";

function all(sql, ...args) {
  return db.prepare(sql).all(...args);
}
function get(sql, ...args) {
  return db.prepare(sql).get(...args);
}

function emailOk(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(text) && !text.includes("..");
}

function mobileOk(value) {
  const text = String(value || "").trim();
  const international = text.match(/^\+(\d+)\s+(\d+)$/);
  if (international) {
    const code = international[1];
    let local = international[2];
    if (code === "593") {
      if (local.startsWith("0")) local = local.slice(1);
      return /^9\d{8}$/.test(local);
    }
    return local.length >= 6 && local.length <= 14;
  }
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("593") && digits.length >= 12 && digits.length <= 13) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^9\d{8}$/.test(digits);
}

function docsFor(rep, documents, variant) {
  return documents.filter((doc) => {
    if (doc.full && variant !== "full") return false;
    if (doc.cond === "dep") return rep.employed === "si";
    if (doc.cond === "rucp") return rep.ruc_type === "per" || rep.ruc_type === "amb";
    if (doc.cond === "ruce") return rep.ruc_type === "emp" || rep.ruc_type === "amb";
    if (doc.cond === "veh") return rep.vehicles > 0;
    return true;
  });
}

export function validateApplication(applicationId) {
  const app = get("SELECT * FROM applications WHERE id = ?", applicationId);
  const payload = JSON.parse(app.payload);
  const d = payload.d || {};
  const na = payload.na || {};
  const errors = [];
  const students = all("SELECT * FROM students WHERE application_id = ? ORDER BY sort", applicationId);
  const grades = new Set(all("SELECT name FROM grades").map((row) => row.name));
  const reps = all("SELECT * FROM representatives WHERE application_id = ? ORDER BY slot", applicationId);
  const rep1 = reps.find((rep) => rep.slot === 1);
  const rep2 = reps.find((rep) => rep.slot === 2);
  const documents = JSON.parse(get("SELECT value FROM settings WHERE key = 'documents'")?.value || "null") || DEFAULT_DOCS;
  const fileCount = {};
  for (const file of all("SELECT rep_slot, doc_id FROM files WHERE application_id = ?", applicationId)) {
    const key = `${file.rep_slot}_${file.doc_id}`;
    fileCount[key] = (fileCount[key] || 0) + 1;
  }

  if (d.auth !== true) errors.push("Acepte la autorización de datos.");
  if (!students.length) errors.push("Registre al menos un estudiante.");
  students.forEach((student, index) => {
    if (!student.full_name.trim()) errors.push(`Nombres y apellidos del estudiante ${index + 1}.`);
    if (!student.grade_name || !grades.has(student.grade_name)) errors.push(`Grado del estudiante ${index + 1}.`);
  });
  if (app.variant === "full" && !["C", "D", "E"].includes(d.plan)) errors.push("Plan al que postula.");
  if (d.decl !== true) errors.push("Acepte la declaración de veracidad.");

  if (!rep1 || !rep1.full_name.trim()) errors.push("Nombres y apellidos del representante 1.");
  if (!rep1 || !["Madre", "Padre", "Representante legal"].includes(rep1.relationship)) {
    errors.push("Relación del representante 1 con el estudiante.");
  }
  if (!rep1 || !emailOk(rep1.email)) errors.push(rep1?.email ? "Escriba un correo válido, por ejemplo nombre@correo.com." : "Correo electrónico del representante 1.");
  if (!rep1 || !mobileOk(rep1.phone)) {
    const foreign = String(rep1?.phone || "").startsWith("+") && !String(rep1?.phone || "").startsWith("+593");
    errors.push(rep1?.phone ? (foreign ? "Escriba el número de celular, entre 6 y 14 dígitos." : "Escriba un celular de 9 dígitos que empiece con 9.") : "WhatsApp del representante 1.");
  }
  if (!rep1 || !["si", "no"].includes(rep1.employed)) errors.push("Indique si el representante 1 trabaja en relación de dependencia.");
  if (!rep1 || !["no", "per", "emp", "amb"].includes(rep1.ruc_type)) errors.push("Indique si el representante 1 tiene RUC.");
  if (!d.r2s) errors.push("Situación del representante 2.");
  if (d.r2s === "full") {
    if (!rep2 || !rep2.full_name.trim()) errors.push("Nombres y apellidos del representante 2.");
    if (!rep2 || !["Madre", "Padre", "Representante legal"].includes(rep2.relationship)) {
      errors.push("Relación del representante 2 con el estudiante.");
    }
    if (rep2?.email && !emailOk(rep2.email)) errors.push("Escriba un correo válido, por ejemplo nombre@correo.com.");
    if (rep2?.phone && !mobileOk(rep2.phone)) {
      const foreign = String(rep2.phone).startsWith("+") && !String(rep2.phone).startsWith("+593");
      errors.push(foreign ? "Escriba el número de celular, entre 6 y 14 dígitos." : "Escriba un celular de 9 dígitos que empiece con 9.");
    }
    if (!rep2 || !["si", "no"].includes(rep2.employed)) errors.push("Indique si el representante 2 trabaja en relación de dependencia.");
    if (!rep2 || !["no", "per", "emp", "amb"].includes(rep2.ruc_type)) errors.push("Indique si el representante 2 tiene RUC.");
    if (!["one", "two"].includes(d.home)) errors.push("Indique si los representantes comparten hogar.");
  } else if (d.r2s === "absent" && !String(d.r2_why || "").trim()) {
    errors.push("Explicación de la situación del representante 2.");
  }

  const homes = d.r2s === "full" && d.home === "two" ? 2 : 1;
  for (let household = 1; household <= homes; household += 1) {
    const total = get(
      "SELECT COALESCE(SUM(annual_amount), 0) AS t FROM expense_lines WHERE application_id = ? AND household = ?",
      applicationId,
      household
    ).t;
    if (!total) errors.push(homes > 1 ? `Registre al menos un gasto del hogar ${household}.` : "Registre al menos un gasto.");
  }

  const activeReps = d.r2s === "full" ? reps.filter((rep) => rep.slot === 1 || rep.slot === 2) : reps.filter((rep) => rep.slot === 1);
  for (const rep of activeReps) {
    if (rep.slot === 2 && d.r2s !== "full") continue;
    for (const doc of docsFor(rep, documents, app.variant)) {
      const key = `${rep.slot}_${doc.id}`;
      const marked = na[key] && na[key].on;
      if (!fileCount[key] && !marked) errors.push(`Adjunte o marque “No lo tengo”: ${doc.t}.`);
    }
  }

  if (!String(d.sig1 || "").trim()) errors.push("Firma del representante 1.");
  if (d.r2s === "full" && !String(d.sig2 || "").trim()) errors.push("Firma del representante 2.");
  return errors;
}
