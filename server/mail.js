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
  const familyContact = [
    school.phone ? `Teléfono: ${school.phone}` : "",
    school.email ? `Correo electrónico: ${school.email}` : ""
  ].filter(Boolean).join("\n");
  const familyText = [
    "Querida familia:",
    "",
    `Les confirmamos que hemos recibido exitosamente su postulación al programa de Ayuda Financiera de ${school.name}. En los próximos días recibirán una respuesta sobre su proceso.`,
    "",
    "Agradecemos el tiempo dedicado a completar la postulación y enviar la documentación solicitada. En caso de requerir información adicional o de existir alguna novedad, nos pondremos en contacto con ustedes a través de nuestros canales oficiales de comunicación.",
    "",
    "Para consultar el estado de su postulación, podrán utilizar el siguiente código de referencia:",
    "",
    `Código de postulación: ${app.reference}`,
    "",
    "Les recordamos que toda la información relacionada con este proceso será tratada con estricta confidencialidad y únicamente será compartida con las personas debidamente autorizadas.",
    "",
    "Si tienen alguna duda o desean realizar una consulta, pueden comunicarse con nosotros a través de los siguientes canales:",
    "",
    familyContact,
    "",
    "Agradecemos su confianza en nuestra institución y la oportunidad de acompañarlos durante este proceso.",
    "",
    "Con cariño,",
    "Equipo de Ayuda Financiera",
    school.name
  ].join("\n");

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
    subject: "Confirmación de recepción de postulación – Ayuda Financiera",
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
