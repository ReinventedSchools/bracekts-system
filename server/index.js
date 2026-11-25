import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import multer from "multer";
import archiver from "archiver";
import { validateApplication } from "./validate.js";
import { notifySubmitted } from "./mail.js";
import { buildExpediente } from "./pdf.js";
import {
  UPLOAD_DIR,
  addFiles,
  adminConfig,
  applicationDetail,
  checkPassword,
  createApplication,
  discardFamily,
  familyView,
  fileForAdmin,
  filesForZip,
  findUser,
  internalApp,
  listApplications,
  ensureFamilyLink,
  listFamilyLinks,
  listSchools,
  regenerateFamilyLink,
  resolveFamilyLink,
  markSubmitted,
  publicConfig,
  readFamily,
  removeFile,
  saveConcepts,
  saveFamily,
  saveGeneral,
  saveLogo,
  saveMailSettings,
  saveMetrics,
  savePrices,
  saveSchool,
  summary,
  updateAdmin
} from "./db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "desarrollo-local",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "1",
      maxAge: 12 * 60 * 60 * 1000
    }
  })
);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAdmin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Inicie sesión." });
  next();
};

function storageFor(folder) {
  return multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_DIR, folder(req));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
      cb(null, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
  });
}

const upload = multer({
  storage: storageFor((req) => req.params.id),
  limits: { fileSize: 15 * 1024 * 1024, files: 8 },
  fileFilter(req, file, cb) {
    const ok = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!ok) {
      const error = new Error("Solo se aceptan PDF, JPG, PNG o WEBP.");
      error.status = 400;
      error.publicMessage = error.message;
      cb(error);
      return;
    }
    cb(null, true);
  }
});

const logoUpload = multer({
  storage: storageFor(() => "logos"),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ok = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.mimetype);
    if (!ok) {
      const error = new Error("El logo debe ser SVG, PNG, JPG o WEBP.");
      error.status = 400;
      error.publicMessage = error.message;
      cb(error);
      return;
    }
    cb(null, true);
  }
});

app.get("/api/salud", (req, res) => res.json({ ok: true }));

app.get("/api/publico/colegios", (req, res) => {
  res.json({
    schools: listSchools().map((school) => ({
      slug: school.slug,
      name: school.name,
      campus: school.campus,
      logo: school.logo_path
    }))
  });
});

app.get("/api/publico/config", (req, res) => {
  const config = publicConfig(req.query.school);
  if (!config) return res.status(404).json({ error: "No encontramos el colegio." });
  res.json(config);
});

app.get("/api/publico/enlace", (req, res) => {
  const link = resolveFamilyLink(req.query.f);
  if (!link) return res.status(404).json({ error: "Este enlace no corresponde a una postulación." });
  const school = listSchools().find((item) => item.slug === link.school);
  res.json({
    code: link.code,
    school: link.school,
    variant: link.variant,
    label: link.label,
    name: school ? school.name : link.label
  });
});

app.post("/api/solicitudes", (req, res, next) => {
  try {
    res.status(201).json(createApplication(req.body.code));
  } catch (error) {
    next(error);
  }
});

app.get("/api/solicitudes/:id", (req, res, next) => {
  try {
    res.json(readFamily(req.params.id, req.query.token));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/solicitudes/:id", (req, res, next) => {
  try {
    saveFamily(req.params.id, req.body.token, req.body);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/solicitudes/:id", (req, res, next) => {
  try {
    discardFamily(req.params.id, req.query.token);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/solicitudes/:id/archivos", upload.array("files", 8), (req, res, next) => {
  try {
    const files = addFiles(req.params.id, req.body.token, req.body.key, req.files || []);
    res.json({ files });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/solicitudes/:id/archivos/:fileId", (req, res, next) => {
  try {
    removeFile(req.params.id, req.query.token, Number(req.params.fileId));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/solicitudes/:id/enviar", wrap(async (req, res) => {
  saveFamily(req.params.id, req.body.token, req.body);
  const internal = internalApp(req.params.id);
  const errors = validateApplication(internal.app.id);
  if (errors.length) return res.status(400).json({ error: "Revise la solicitud antes de enviarla.", details: errors });
  markSubmitted(req.params.id);
  await notifySubmitted(req.params.id);
  res.json(familyView(req.params.id, req.body.token));
}));

app.get("/api/admin/pista", (req, res) => {
  if (process.env.LOCAL_HINT !== "1") return res.json({ hint: false });
  res.json({ hint: true, email: process.env.ADMIN_EMAIL || "admin@reinvented.local" });
});

app.post("/api/admin/login", (req, res) => {
  const user = findUser(req.body.email);
  if (!checkPassword(user, req.body.password || "")) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email };
  res.json({ name: user.name, email: user.email });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json(req.session.user);
});

app.get("/api/admin/resumen", requireAdmin, (req, res) => {
  const school = req.query.school || "";
  res.json({
    schools: listSchools().map((item) => ({ slug: item.slug, name: item.name, logo: item.logo_path })),
    links: listFamilyLinks(),
    counts: summary(school),
    recent: listApplications({ school, limit: 8 })
  });
});

app.get("/api/admin/solicitudes", requireAdmin, (req, res) => {
  res.json({
    items: listApplications({
      school: req.query.school || "",
      status: req.query.status || "",
      q: String(req.query.q || "").slice(0, 80),
      limit: req.query.limit
    })
  });
});

app.get("/api/admin/solicitudes/:id", requireAdmin, (req, res) => {
  const detail = applicationDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "No encontramos la solicitud." });
  res.json(detail);
});

app.patch("/api/admin/solicitudes/:id", requireAdmin, (req, res, next) => {
  try {
    res.json(updateAdmin(req.params.id, req.body, req.session.user.email));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/solicitudes/:id/pdf", requireAdmin, wrap(async (req, res) => {
  const detail = applicationDetail(req.params.id);
  const pack = filesForZip(req.params.id);
  if (!detail || !pack) return res.status(404).json({ error: "No encontramos la solicitud." });
  const buffer = await buildExpediente(detail, pack.files);
  const name = `${detail.reference || detail.id}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(buffer);
}));

app.get("/api/admin/solicitudes/:id/zip", requireAdmin, (req, res, next) => {
  try {
    const pack = filesForZip(req.params.id);
    if (!pack) return res.status(404).json({ error: "No encontramos la solicitud." });
    const name = `${pack.reference || req.params.id}-documentos.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", next);
    archive.pipe(res);
    for (const file of pack.files) {
      const folder = `Representante ${file.rep_slot}/${file.label || file.doc_id}`;
      archive.file(file.path, { name: `${folder}/${file.original_name}` });
    }
    if (!pack.files.length) archive.append("Esta solicitud no tiene archivos adjuntos.", { name: "sin-adjuntos.txt" });
    archive.finalize();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/solicitudes/:id/archivos/:fileId", requireAdmin, (req, res) => {
  const file = fileForAdmin(req.params.id, Number(req.params.fileId));
  if (!file) return res.status(404).json({ error: "No encontramos el archivo." });
  const ascii = file.original_name.replace(/[^\x20-\x7E]+/g, "_");
  res.setHeader("Content-Type", file.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`
  );
  fs.createReadStream(file.path).pipe(res);
});

app.post("/api/admin/enlaces", requireAdmin, (req, res, next) => {
  try { res.json({ link: ensureFamilyLink(req.body?.school, req.body?.variant) }); } catch (error) { next(error); }
});
app.post("/api/admin/enlaces/:code/regenerar", requireAdmin, (req, res, next) => {
  try { res.json({ links: regenerateFamilyLink(req.params.code) }); } catch (error) { next(error); }
});
app.get("/api/admin/config", requireAdmin, (req, res) => res.json(adminConfig()));
app.put("/api/admin/general", requireAdmin, (req, res, next) => {
  try { res.json(saveGeneral(req.body)); } catch (error) { next(error); }
});
app.put("/api/admin/colegios/:slug", requireAdmin, (req, res, next) => {
  try { res.json(saveSchool(req.params.slug, req.body)); } catch (error) { next(error); }
});
app.post("/api/admin/colegios/:slug/logo", requireAdmin, logoUpload.single("logo"), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Seleccione un logo." });
    const publicPath = `/api/publico/logo/${req.params.slug}`;
    saveLogo(req.params.slug, req.file.path, publicPath);
    fs.writeFileSync(path.join(UPLOAD_DIR, "logos", `${req.params.slug}.path`), req.file.path);
    res.json(adminConfig());
  } catch (error) {
    next(error);
  }
});
app.get("/api/publico/logo/:slug", (req, res) => {
  if (!/^[a-z0-9-]+$/.test(req.params.slug)) return res.status(404).end();
  const marker = path.join(UPLOAD_DIR, "logos", `${req.params.slug}.path`);
  if (!fs.existsSync(marker)) return res.status(404).end();
  const filePath = fs.readFileSync(marker, "utf8");
  res.sendFile(path.resolve(filePath));
});
app.put("/api/admin/precios", requireAdmin, (req, res, next) => {
  try { res.json(savePrices(req.body)); } catch (error) { next(error); }
});
app.put("/api/admin/metricas", requireAdmin, (req, res, next) => {
  try { res.json(saveMetrics(req.body)); } catch (error) { next(error); }
});
app.put("/api/admin/conceptos", requireAdmin, (req, res, next) => {
  try { res.json(saveConcepts(req.body)); } catch (error) { next(error); }
});
app.put("/api/admin/correo", requireAdmin, (req, res, next) => {
  try { res.json(saveMailSettings(req.body)); } catch (error) { next(error); }
});

app.get("/", (req, res) => {
  if (!req.query.f) return res.redirect("/admin");
  res.sendFile(path.join(root, "public", "form.html"));
});
app.get("/admin", (req, res) => res.sendFile(path.join(root, "public", "admin.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.use(express.static(path.join(root, "public")));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 400 : 500);
  const message = error.publicMessage
    || (error.code === "LIMIT_FILE_SIZE" ? "Cada archivo puede pesar hasta 15 MB." : "")
    || (status < 500 ? error.message : "");
  if (status >= 500) console.error(error);
  res.status(status).json({ error: message || "No se pudo completar la operación." });
});

const port = Number(process.env.PORT) || 3080;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Formulario: http://localhost:${port}`);
  console.log(`Administración: http://localhost:${port}/admin`);
});
