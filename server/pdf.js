import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFKit from "pdfkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { statusLabel } from "./catalog.js";
import { formatEC } from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lato = path.join(root, "public", "fonts", "Lato-Regular.ttf");
const latoBold = path.join(root, "public", "fonts", "Lato-Bold.ttf");
const montserrat = path.join(root, "public", "fonts", "Montserrat-SemiBold.ttf");

function money(value) {
  const amount = Math.round(Number(value) || 0);
  return (amount < 0 ? "-" : "") + "$" + Math.abs(amount).toLocaleString("es-EC");
}

function summaryBuffer(detail) {
  return new Promise((resolve, reject) => {
    const doc = new PDFKit({ size: "A4", margin: 48, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Lato", lato);
    doc.registerFont("Lato-Bold", latoBold);
    doc.registerFont("Montserrat", montserrat);

    const navy = "#1B3A5C";
    const ink = "#142536";
    const muted = "#5C6B7A";
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const ensure = (height) => {
      if (doc.y + height > doc.page.height - 56) doc.addPage();
    };
    const h1 = (text) => {
      ensure(36);
      doc.font("Montserrat").fontSize(16).fillColor(navy).text(text, { width });
      doc.moveDown(0.3);
    };
    const h2 = (text) => {
      ensure(28);
      doc.moveDown(0.4);
      doc.font("Montserrat").fontSize(12).fillColor(navy).text(text, { width });
      const y = doc.y + 2;
      doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(navy).stroke();
      doc.moveDown(0.5);
    };
    const row = (label, value) => {
      ensure(18);
      const y = doc.y;
      doc.font("Lato").fontSize(10).fillColor(muted).text(label, doc.page.margins.left, y, { width: 190 });
      doc.font("Lato").fontSize(10).fillColor(ink).text(String(value || "—"), doc.page.margins.left + 200, y, { width: width - 200 });
      doc.y = Math.max(doc.y, y + 16);
    };

    doc.font("Montserrat").fontSize(11).fillColor(navy).text(detail.school.name);
    doc.font("Lato").fontSize(9).fillColor(muted).text(detail.school.campus || "");
    doc.moveDown(0.2);
    doc.font("Montserrat").fontSize(18).fillColor(ink).text("Solicitud de Tuition Plan");
    doc.font("Lato").fontSize(10).fillColor(muted).text(`${detail.formCode} · Año lectivo ${detail.year}`);
    doc.moveDown(0.4);
    row("Número", detail.reference || "Borrador");
    row("Estado", statusLabel(detail.status));
    row("Enviada", detail.submittedAtLabel || "—");
    row("Plan al que postula", detail.requestedPlan ? `Plan ${detail.requestedPlan}` : "—");
    row("Plan asignado", detail.assignedPlan ? `Plan ${detail.assignedPlan}` : "Sin asignar");
    if (detail.assignmentNote) row("Nota de asignación", detail.assignmentNote);

    h2("Estudiantes");
    if (!detail.students.length) row("Estudiantes", "Sin registrar");
    detail.students.forEach((student, index) => {
      row(`Estudiante ${index + 1}`, `${student.name}${student.grade ? " · " + student.grade : ""}`);
    });

    h2("Representantes");
    for (const rep of detail.representatives) {
      h1(rep.slot === 1 ? "Representante 1" : "Representante 2");
      if (rep.slot === 2 && rep.situation === "absent") {
        row("Situación", "No se completa la información");
        row("Motivo", rep.absent_reason);
        continue;
      }
      row("Nombre", rep.full_name);
      row("Relación", rep.relationship);
      row("Correo", rep.email);
      row("WhatsApp", rep.phone);
      row("Trabajo", [rep.workplace, rep.position].filter(Boolean).join(" · "));
      row("Relación de dependencia", rep.employed === "si" ? "Sí" : rep.employed === "no" ? "No" : "—");
      row("RUC", { no: "No tiene", per: "Personal", emp: "Empresa propia", amb: "Personal y empresa" }[rep.ruc_type] || "—");
      row("Vehículos", String(rep.vehicles || 0));
      row("Hijos en etapa estudiantil", `Guardería ${rep.kids_daycare}, colegio ${rep.kids_school}, universidad ${rep.kids_university}`);
      row("Firma", rep.signature_name);
    }

    h2("Ingresos de los próximos 12 meses");
    const byRep = new Map();
    for (const line of detail.income) {
      if (!byRep.has(line.rep_slot)) byRep.set(line.rep_slot, []);
      byRep.get(line.rep_slot).push(line);
    }
    for (const [slot, lines] of byRep) {
      const who = detail.representatives.find((rep) => rep.slot === slot);
      h1(who?.full_name || `Representante ${slot}`);
      for (const line of lines) {
        row(line.label, `${money(line.annual_amount / 12)} mensual · ${money(line.annual_amount)} anual${line.comment ? " · " + line.comment : ""}`);
      }
    }
    row("Total de ingresos", `${money(detail.totals.incomeMonthly)} mensual · ${money(detail.totals.incomeAnnual)} anual`);

    h2("Gastos de los próximos 12 meses");
    const byHome = new Map();
    for (const line of detail.expenses) {
      if (!byHome.has(line.household)) byHome.set(line.household, []);
      byHome.get(line.household).push(line);
    }
    for (const [household, lines] of byHome) {
      h1(byHome.size > 1 ? `Hogar ${household}` : "Hogar");
      for (const line of lines) {
        row(line.label, `${money(line.annual_amount / 12)} mensual · ${money(line.annual_amount)} anual${line.comment ? " · " + line.comment : ""}`);
      }
    }
    row("Total de gastos", `${money(detail.totals.expenseMonthly)} mensual · ${money(detail.totals.expenseAnnual)} anual`);
    row("Disponible mensual", money(detail.totals.disposableMonthly));

    h2("Documentos");
    if (!detail.files.length && !Object.keys(detail.na).length) row("Documentos", "Sin registros");
    for (const file of detail.files) {
      row(`Representante ${file.slot} · ${file.label}`, file.name);
    }
    for (const [key, flag] of Object.entries(detail.na || {})) {
      if (!flag?.on) continue;
      const [slot, docId] = key.split("_");
      const doc = detail.documents.find((item) => item.id === docId);
      row(`Representante ${slot} · ${doc ? doc.t : docId}`, `No lo tiene${flag.why ? ": " + flag.why : ""}`);
    }

    h2("Fechas");
    const labels = {
      received_at: "Recibida",
      file_complete_at: "Expediente completo",
      review_started_at: "Inicio de revisión",
      committee_at: "Comité",
      response_at: "Respuesta",
      accept_deadline: "Límite para aceptar",
      accepted_at: "Aceptación",
      reconsideration_deadline: "Límite de reconsideración",
      reconsideration_at: "Reconsideración",
      valid_from: "Vigencia desde",
      valid_until: "Vigencia hasta"
    };
    for (const [key, label] of Object.entries(labels)) row(label, detail.dates?.[key] ? formatEC(detail.dates[key]) : "—");

    h2("Declaraciones");
    row("Autorización de datos", detail.auth ? "Aceptada" : "Pendiente");
    row("Declaración de veracidad", detail.declaration ? "Aceptada" : "Pendiente");
    if (detail.suggested) row("Plan sugerido por la métrica", `Plan ${detail.suggested.code}`);

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Lato").fontSize(8).fillColor(muted).text(
        `${detail.reference || detail.formCode} · ${i + 1} / ${pages.count}`,
        doc.page.margins.left,
        doc.page.height - 36,
        { width, align: "right", lineBreak: false }
      );
    }
    doc.end();
  });
}

async function appendFile(merged, file) {
  const bytes = fs.readFileSync(file.path);
  if (file.mime === "application/pdf") {
    try {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      return;
    } catch {
      await notePage(merged, `${file.label}: no se pudo incorporar el PDF ${file.original_name || file.name}. Descárguelo desde el expediente.`);
      return;
    }
  }
  if (file.mime === "image/png" || file.mime === "image/jpeg") {
    const page = merged.addPage();
    const image = file.mime === "image/png" ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
    const margin = 40;
    const maxW = page.getWidth() - margin * 2;
    const maxH = page.getHeight() - margin * 2 - 24;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    const caption = `${file.label} · ${file.original_name || file.name}`;
    page.drawText(caption.slice(0, 110), { x: margin, y: page.getHeight() - 28, size: 10 });
    page.drawImage(image, { x: margin, y: margin, width: w, height: h });
    return;
  }
  await notePage(merged, `${file.label}: el archivo ${file.original_name || file.name} queda en el expediente y no se incrustó en este PDF.`);
}

async function notePage(merged, text) {
  const page = merged.addPage();
  const font = await merged.embedFont(StandardFonts.Helvetica);
  page.drawText(text.slice(0, 500), {
    x: 48,
    y: page.getHeight() - 80,
    size: 12,
    font,
    color: rgb(0.08, 0.16, 0.24),
    maxWidth: page.getWidth() - 96
  });
}

export async function buildExpediente(detail, files) {
  const summary = await PDFDocument.load(await summaryBuffer(detail));
  const merged = await PDFDocument.create();
  const copied = await merged.copyPages(summary, summary.getPageIndices());
  copied.forEach((page) => merged.addPage(page));
  for (const file of files) {
    await appendFile(merged, file);
  }
  return Buffer.from(await merged.save());
}
