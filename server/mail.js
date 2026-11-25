import nodemailer from "nodemailer";
import { internalApp, logMail, mailSettings } from "./db.js";

function writeLog(applicationId, to, subject, body, status, detail) {
  logMail({ applicationId, to, subject, body, status, detail });
}

export async function notifySubmitted(publicId) {
  const found = internalApp(publicId);
  if (!found) return;
  const { app, school } = found;
  const settings = mailSettings();
  const students = app.students_label || "Sin estudiantes registrados";
  const plan = app.requested_plan ? `Plan ${app.requested_plan}` : "Plan por confirmar";
  const schoolText = [
    `Nueva postulación ${app.reference}`,
    `Colegio: ${school.name}`,
    `Formulario: ${app.form_code}`,
    `Año lectivo: ${app.school_year}`,
    `Plan al que postula: ${plan}`,
    `Representante: ${app.rep1_name}`,
    `Correo: ${app.rep1_email}`,
    `WhatsApp: ${app.rep1_phone}`,
    `Estudiantes: ${students}`,
    "",
    "Revise el expediente en el panel de administración."
  ].join("\n");
  const familyText = [
    `${school.name} recibió la postulación ${app.reference}.`,
    "",
    `Estudiantes: ${students}`,
    `Plan al que postula: ${plan}`,
    `Año lectivo: ${app.school_year}`,
    "",
    "Conserve este número para cualquier consulta. La información es confidencial.",
    school.phone ? `Teléfono: ${school.phone}` : "",
    school.email ? `Correo: ${school.email}` : ""
  ].filter(Boolean).join("\n");

  const mailbox = school.email || school.notify_email;
  await deliver({
    applicationId: app.id,
    to: mailbox,
    subject: `Postulación ${app.reference} recibida`,
    text: schoolText,
    settings,
    user: mailbox,
    pass: school.mailbox_pass,
    fromEmail: mailbox
  });
  await deliver({
    applicationId: app.id,
    to: app.rep1_email,
    subject: `Recibimos su postulación ${app.reference}`,
    text: familyText,
    settings,
    user: mailbox,
    pass: school.mailbox_pass,
    fromEmail: mailbox
  });
}

async function deliver({ applicationId, to, subject, text, settings, user, pass, fromEmail }) {
  if (!to) {
    writeLog(applicationId, "", subject, text, "pendiente", "Sin destinatario");
    return;
  }
  if (!settings.host || !user || !pass) {
    writeLog(applicationId, to, subject, text, "pendiente", "Falta la contraseña del buzón");
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: { user, pass }
    });
    const from = fromEmail || user;
    await transporter.sendMail({
      from: `"${settings.fromName}" <${from}>`,
      to,
      subject,
      text
    });
    writeLog(applicationId, to, subject, text, "enviado", "");
  } catch (error) {
    writeLog(applicationId, to, subject, text, "error", error.message || "No se pudo enviar");
  }
}
