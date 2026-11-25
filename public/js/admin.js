(function () {
  "use strict";
  var app = document.getElementById("app");
  var state = { me: null, school: sessionStorage.getItem("tp-school") || "", error: "" };
  var STATUS = {
    borrador: "Borrador", enviada: "Enviada", en_revision: "En revisión", incompleta: "Incompleta",
    en_comite: "En comité", asignada: "Plan asignado", aceptada: "Aceptada", no_admitida: "No admitida",
    caducada: "Caducada", reconsideracion: "Reconsideración"
  };
  var BASIS = {
    ingreso_mensual: "Ingreso mensual del hogar",
    disponible_mensual: "Disponible mensual (ingreso − gasto)",
    disponible_por_estudiante: "Disponible mensual por estudiante"
  };
  var DATES = [
    ["received_at", "Recibida"],
    ["file_complete_at", "Expediente completo"],
    ["review_started_at", "Inicio de revisión"],
    ["committee_at", "Comité"],
    ["response_at", "Respuesta a la familia"],
    ["accept_deadline", "Límite para aceptar"],
    ["accepted_at", "Aceptación"],
    ["reconsideration_deadline", "Límite de reconsideración"],
    ["reconsideration_at", "Reconsideración recibida"],
    ["valid_from", "Vigencia desde"],
    ["valid_until", "Vigencia hasta"]
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(n) {
    var value = Math.round(Number(n) || 0);
    return (value < 0 ? "-" : "") + "$" + Math.abs(value).toLocaleString("es-EC");
  }
  function route() {
    var hash = location.hash.replace(/^#\/?/, "");
    var parts = hash.split("/").filter(Boolean);
    return { name: parts[0] || "resumen", id: parts[1] || "" };
  }
  async function api(url, opts) {
    opts = opts || {};
    var res = await fetch(url, opts);
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 401) { state.me = null; render(); throw new Error("auth"); }
    if (!res.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }
  function json(url, method, body) {
    return api(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function shell(inner) {
    var r = route();
    var scope = state.me.schoolSlug === "santa-clara" ? "ReinventED Santa Clara" : state.me.schoolSlug === "puembo" ? "ReinventED Puembo" : "ReinventED Puembo y Santa Clara";
    return '<header class="top"><div><h1>Solicitudes de pensión</h1><p class="muted">' + scope + '</p></div><nav class="nav">' +
      '<a class="' + (r.name === "resumen" ? "on" : "") + '" href="#/">Resumen</a>' +
      '<a class="' + (r.name === "solicitudes" || r.name === "solicitud" ? "on" : "") + '" href="#/solicitudes">Solicitudes</a>' +
      '<a class="' + (r.name === "config" ? "on" : "") + '" href="#/config">Configuración</a>' +
      '<button type="button" id="logout">' + esc(state.me.name) + " · Salir</button></nav></header><div class=\"wrap\">" + inner + "</div>";
  }
  function pills(schools, current) {
    if (state.me.schoolSlug || schools.length < 2) return "";
    return '<div class="pills"><button type="button" class="pill' + (!current ? " on" : "") + '" data-school="">TODO</button>' +
      schools.map(function (s) {
        return '<button type="button" class="pill' + (current === s.slug ? " on" : "") + '" data-school="' + esc(s.slug) + '" aria-label="' + esc(s.name) + '"><img src="' + esc(s.logo) + '" alt=""></button>';
      }).join("") + "</div>";
  }
  function table(items) {
    if (!items.length) return '<p class="muted">No hay solicitudes con este filtro.</p>';
    return "<table><thead><tr><th>Referencia</th><th>Colegio</th><th>Representante</th><th>Estudiantes</th><th>Plan</th><th>Ingreso</th><th>Gasto</th><th>Estado</th></tr></thead><tbody>" +
      items.map(function (item) {
        return '<tr class="click" data-open="' + esc(item.id) + '"><td><b>' + esc(item.reference || "Borrador") + "</b><br><small>" + esc(item.formCode) + "</small></td><td>" +
          esc(item.schoolName.replace("ReinventED ", "")) + "</td><td>" + esc(item.rep || "—") + "<br><small>" + esc(item.email || "") + "</small></td><td>" +
          esc(item.students || "—") + "</td><td>" + esc(item.requestedPlan ? "Postula " + item.requestedPlan : "—") + (item.assignedPlan ? "<br><small>Asignado " + esc(item.assignedPlan) + "</small>" : "") +
          '</td><td class="money">' + money(item.incomeAnnual / 12) + '</td><td class="money">' + money(item.expenseAnnual / 12) + '</td><td><span class="badge' + (item.status === "incompleta" ? " warn" : "") + '">' + esc(STATUS[item.status] || item.status) + "</span></td></tr>";
      }).join("") + "</tbody></table>";
  }

  async function render() {
    var r = route();
    if (!state.me) { login(); return; }
    if (state.me.schoolSlug) state.school = state.me.schoolSlug;
    try {
      if (r.name === "config") await configView();
      else if (r.name === "solicitud" && r.id) await detailView(r.id);
      else if (r.name === "solicitudes") await listView();
      else await resumenView();
    } catch (error) {
      if (error.message === "auth") return;
      app.innerHTML = shell('<div class="err">' + esc(error.message) + "</div>");
    }
    bindShell();
  }

  function login() {
    app.innerHTML = '<div class="login"><form class="card" id="loginForm"><div class="logos"><img src="/logos/puembo.svg" alt="ReinventED Puembo"><img src="/logos/santa-clara.svg" alt="ReinventED Santa Clara"></div><h1>Administración</h1><p class="muted">Acceso del personal autorizado del colegio.</p><label for="email">Correo</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required><div style="margin-top:16px"><button class="btn pri" type="submit">Entrar</button></div>' + (state.error ? '<div class="err">' + esc(state.error) + "</div>" : "") + "</form></div>";
    fetch("/api/admin/pista").then(function (res) { return res.json(); }).then(function (data) {
      if (data.hint && data.email) { var input = document.getElementById("email"); if (input && !input.value) input.value = data.email; }
    });
    document.getElementById("loginForm").onsubmit = async function (ev) {
      ev.preventDefault();
      state.error = "";
      var body = { email: ev.target.email.value, password: ev.target.password.value };
      var res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var data = await res.json();
      if (!res.ok) { state.error = data.error || "No se pudo entrar"; login(); return; }
      state.me = data;
      location.hash = "#/";
      render();
    };
  }

  function bindShell() {
    var out = document.getElementById("logout");
    if (out) out.onclick = async function () { await fetch("/api/admin/logout", { method: "POST" }); state.me = null; render(); };
    app.querySelectorAll("[data-school]").forEach(function (button) {
      button.onclick = function () {
        state.school = button.getAttribute("data-school");
        sessionStorage.setItem("tp-school", state.school);
        render();
      };
    });
    app.querySelectorAll("[data-open]").forEach(function (row) {
      row.onclick = function () { location.hash = "#/solicitud/" + row.getAttribute("data-open"); };
    });
    app.querySelectorAll("[data-status]").forEach(function (button) {
      button.onclick = function () { location.hash = "#/solicitudes?estado=" + button.getAttribute("data-status"); };
    });
  }

  function linkModal(schools) {
    var schoolBtns = schools.map(function (s) {
      return '<button type="button" class="choice school' + (state.school === s.slug ? " on" : "") + '" data-pick-school="' + esc(s.slug) + '" aria-label="' + esc(s.name) + '"><img src="' + esc(s.logo) + '" alt=""></button>';
    }).join("");
    return '<div class="modal" id="linkModal" hidden><div class="modal-back" data-close-link></div>' +
      '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="linkTitle">' +
      '<div class="modal-head"><div><p class="kicker">Admisiones</p><h2 id="linkTitle" tabindex="-1">Generar link</h2></div><button type="button" class="modal-x" data-close-link aria-label="Cerrar">×</button></div>' +
      '<p class="modal-lead">' + (schools.length < 2 ? "Elija el formulario. La familia abre solo esa postulación." : "Elija el colegio y el formulario. El enlace abre solo esa postulación.") + '</p>' +
      '<div class="modal-body">' + (schools.length < 2 ? "" : '<p class="field-label">Colegio</p><div class="choices">' + schoolBtns + '</div>') +
      '<p class="field-label">Formulario</p><div class="choices">' +
      '<button type="button" class="choice" data-pick-variant="short"><b>Plan B</b><small>Formulario 01</small></button>' +
      '<button type="button" class="choice" data-pick-variant="full"><b>Planes C, D y E</b><small>Formulario 02</small></button></div>' +
      '<p class="err" id="linkErr" hidden></p>' +
      '<div class="linkout" id="linkOut" hidden><input id="linkUrl" readonly aria-label="Enlace generado"><button type="button" class="btn" id="copyLink">Copiar</button></div>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-close-link>Cerrar</button><button type="button" class="btn pri" id="doGenerate">Generar</button></div></div></div></div>';
  }

  async function resumenView() {
    var data = await api("/api/admin/resumen?school=" + encodeURIComponent(state.school));
    var c = data.counts;
    var cards = [
      ["", "Recibidas", c.recibidas],
      ["porRevisar", "Por revisar", c.porRevisar],
      ["comite", "En comité", c.comite],
      ["asignadas", "Asignadas", c.asignadas],
      ["aceptadas", "Aceptadas", c.aceptadas]
    ];
    app.innerHTML = shell(pills(data.schools, state.school) +
      '<section class="card panel"><div class="section-head"><h2>Enlaces para las familias</h2><button type="button" class="btn pri" id="openLink">Generar link</button></div><p class="muted">' + (state.me.schoolSlug ? "Elija el formulario. La familia abre solo esa postulación." : "Elija el colegio y el formulario. La familia abre solo esa postulación.") + '</p></section>' +
      linkModal(data.schools) +
      '<div class="stats">' + cards.map(function (card, index) {
      return '<button class="card stat' + (index === 0 ? " on" : "") + '" data-status="' + card[0] + '"><span>' + card[1] + "</span><b>" + card[2] + "</b></button>";
    }).join("") + "</div>" + '<section class="card panel"><h2>Últimas solicitudes</h2>' + table(data.recent) + "</section>");
    var pick = { school: state.school || (data.schools[0] ? data.schools[0].slug : ""), variant: "" };
    var modal = document.getElementById("linkModal");
    function closeLink() {
      modal.hidden = true;
      document.removeEventListener("keydown", onLinkKey);
      var opener = document.getElementById("openLink");
      if (opener) opener.focus();
    }
    function onLinkKey(ev) {
      if (ev.key === "Escape") closeLink();
    }
    document.getElementById("openLink").onclick = function () {
      if (modal.hidden) document.addEventListener("keydown", onLinkKey);
      modal.hidden = false;
      document.getElementById("linkTitle").focus();
    };
    modal.querySelectorAll("[data-close-link]").forEach(function (el) { el.onclick = closeLink; });
    modal.querySelector(".modal-card").onclick = function (ev) { ev.stopPropagation(); };
    function choose(attr, value) {
      pick[attr === "data-pick-school" ? "school" : "variant"] = value;
      modal.querySelectorAll("[" + attr + "]").forEach(function (button) {
        button.classList.toggle("on", button.getAttribute(attr) === value);
      });
      document.getElementById("linkOut").hidden = true;
      document.getElementById("linkErr").hidden = true;
    }
    modal.querySelectorAll("[data-pick-school]").forEach(function (button) {
      button.onclick = function () { choose("data-pick-school", button.getAttribute("data-pick-school")); };
    });
    modal.querySelectorAll("[data-pick-variant]").forEach(function (button) {
      button.onclick = function () { choose("data-pick-variant", button.getAttribute("data-pick-variant")); };
    });
    document.getElementById("doGenerate").onclick = async function () {
      var err = document.getElementById("linkErr");
      if (!pick.school || !pick.variant) {
        err.hidden = false;
        err.textContent = "Elija el colegio y el tipo de formulario.";
        return;
      }
      err.hidden = true;
      try {
        var data = await json("/api/admin/enlaces", "POST", { school: pick.school, variant: pick.variant });
        document.getElementById("linkUrl").value = location.origin + "/?f=" + encodeURIComponent(data.link.code);
        document.getElementById("linkOut").hidden = false;
      } catch (e) {
        if (e.message === "auth") return;
        err.hidden = false;
        err.textContent = e.message;
      }
    };
    document.getElementById("copyLink").onclick = async function () {
      var button = document.getElementById("copyLink");
      var url = document.getElementById("linkUrl").value;
      try { await navigator.clipboard.writeText(url); button.textContent = "Copiado"; }
      catch (e) { window.prompt("Copie este enlace", url); }
      setTimeout(function () { if (button) button.textContent = "Copiar enlace"; }, 1600);
    };
  }

  function hashParams() {
    return new URLSearchParams((location.hash.split("?")[1]) || "");
  }
  async function listView() {
    var status = hashParams().get("estado") || "";
    var q = hashParams().get("q") || "";
    var data = await api("/api/admin/solicitudes?school=" + encodeURIComponent(state.school) + "&status=" + encodeURIComponent(status) + "&q=" + encodeURIComponent(q));
    var schools = (await api("/api/admin/resumen?school=")).schools;
    var options = '<option value="">Recibidas</option><option value="todos">Todas, con borradores</option><option value="porRevisar">Por revisar</option><option value="comite">En comité</option><option value="asignadas">Asignadas</option><option value="aceptadas">Aceptadas</option>' + Object.keys(STATUS).map(function (key) {
      return '<option value="' + key + '"' + (status === key ? " selected" : "") + ">" + STATUS[key] + "</option>";
    }).join("");
    app.innerHTML = shell(pills(schools, state.school) + '<div class="tools"><input class="search" id="q" placeholder="Buscar por nombre, correo o referencia" value="' + esc(q) + '"><select id="status">' + options + '</select><button class="btn" id="find" type="button">Buscar</button></div>' + table(data.items));
    document.getElementById("status").value = status;
    document.getElementById("find").onclick = function () {
      var next = "#/solicitudes?estado=" + document.getElementById("status").value + "&q=" + encodeURIComponent(document.getElementById("q").value);
      if (location.hash === next) listView();
      else location.hash = next;
    };
    document.getElementById("q").onkeydown = function (ev) { if (ev.key === "Enter") document.getElementById("find").click(); };
    bindShell();
  }

  function repText(rep) {
    if (rep.situation === "absent") return "<p><b>Representante " + rep.slot + ".</b> No se completa. " + esc(rep.absent_reason || "") + "</p>";
    var ruc = { no: "Sin RUC", per: "RUC personal", emp: "Empresa propia", amb: "RUC personal y empresa" }[rep.ruc_type] || "—";
    return "<p><b>" + esc(rep.full_name || "Representante " + rep.slot) + "</b><br>" + esc(rep.relationship) + "<br>" + esc(rep.email) + " · " + esc(rep.phone) + "<br>" + esc([rep.workplace, rep.position].filter(Boolean).join(" · ")) + "<br>" + (rep.employed === "si" ? "Relación de dependencia" : "Sin relación de dependencia") + " · " + ruc + " · " + (rep.vehicles || 0) + " vehículos<br>Firma: " + esc(rep.signature_name || "—") + "</p>";
  }

  async function detailView(id) {
    var d = await api("/api/admin/solicitudes/" + id);
    var statusOpts = Object.keys(STATUS).filter(function (key) { return key !== "borrador" || d.status === "borrador"; }).map(function (key) {
      return '<option value="' + key + '"' + (d.status === key ? " selected" : "") + ">" + STATUS[key] + "</option>";
    }).join("");
    var planOpts = '<option value="">Sin cambiar</option>' + d.plans.map(function (p) {
      return '<option value="' + p.code + '"' + (d.assignedPlan === p.code ? " selected" : "") + ">Plan " + p.code + "</option>";
    }).join("");
    var priceRows = d.students.map(function (student) {
      var cells = d.plans.map(function (p) {
        var amount = d.prices.find(function (x) { return x.stage === student.stage && x.plan === p.code; });
        var mark = d.suggested && d.suggested.code === p.code ? " ★" : "";
        return "<td>" + (amount ? money(amount.amount) + mark : "—") + "</td>";
      }).join("");
      return "<tr><td>" + esc(student.name) + "<br><small>" + esc(student.grade) + " · " + esc(student.stage) + "</small></td>" + cells + "</tr>";
    }).join("");
    var metricRows = d.metrics.map(function (m) {
      return "<tr><td>Plan " + esc(m.plan) + "</td><td>" + (m.min == null ? "—" : money(m.min)) + "</td><td>" + (m.max == null ? "sin tope" : money(m.max)) + "</td><td>" + (d.suggested && d.suggested.code === m.plan ? "Coincide" : "") + "</td></tr>";
    }).join("");
    var income = d.income.map(function (line) {
      return "<tr><td>Representante " + line.rep_slot + "</td><td>" + esc(line.label) + "</td><td>" + money(line.annual_amount / 12) + "</td><td>" + money(line.annual_amount) + "</td><td>" + esc(line.comment) + "</td></tr>";
    }).join("") || "<tr><td colspan=\"5\">Sin ingresos registrados</td></tr>";
    var expenses = d.expenses.map(function (line) {
      return "<tr><td>Hogar " + line.household + "</td><td>" + esc(line.label) + "</td><td>" + money(line.annual_amount / 12) + "</td><td>" + money(line.annual_amount) + "</td><td>" + esc(line.comment) + "</td></tr>";
    }).join("") || "<tr><td colspan=\"5\">Sin gastos registrados</td></tr>";
    var files = d.files.map(function (file) {
      return "<li><a href=\"/api/admin/solicitudes/" + d.id + "/archivos/" + file.id + "\">" + esc(file.label) + " · " + esc(file.name) + "</a> <small>Representante " + file.slot + "</small></li>";
    }).join("");
    var missing = Object.keys(d.na || {}).filter(function (key) { return d.na[key] && d.na[key].on; }).map(function (key) {
      return "<li>No lo tiene: " + esc(key) + (d.na[key].why ? " · " + esc(d.na[key].why) : "") + "</li>";
    }).join("");
    var dates = DATES.map(function (pair) {
      return '<label>' + pair[1] + '<input type="date" data-date="' + pair[0] + '" value="' + esc((d.dates && d.dates[pair[0]]) || "") + '"></label>';
    }).join("");
    var mails = (d.mail || []).map(function (mail) {
      return "<li>" + esc(mail.to_email || "Sin destinatario") + " · " + esc(mail.status) + (mail.detail ? " · " + esc(mail.detail) : "") + "</li>";
    }).join("") || "<li>Todavía no hay avisos.</li>";
    var events = d.events.slice(0, 8).map(function (event) { return "<li>" + esc(event.detail) + " · " + esc(event.actor) + "</li>"; }).join("");
    app.innerHTML = shell('<p><a href="#/solicitudes">Volver al listado</a></p><div class="split"><div><section class="card panel"><h2>' + esc(d.reference || "Borrador") + "</h2><p class=\"muted\">" + esc(d.school.name) + " · " + esc(d.formCode) + " · " + esc(d.year) + "</p><div class=\"kv\"><span>Estado</span><b>" + esc(STATUS[d.status] || d.status) + "</b><span>Postula a</span><b>Plan " + esc(d.requestedPlan || "—") + "</b><span>Enviada</span><b>" + esc(d.submittedAtLabel || "—") + "</b><span>Representante</span><b>" + esc(d.rep1Name) + "<br>" + esc(d.rep1Email) + " · " + esc(d.rep1Phone) + "</b></div><div class=\"row-actions\"><a class=\"btn pri\" href=\"/api/admin/solicitudes/" + d.id + "/pdf\">Descargar PDF</a><a class=\"btn\" href=\"/api/admin/solicitudes/" + d.id + "/zip\">Descargar adjuntos</a></div></section>" +
      '<section class="card panel section"><h2>Totales mensuales</h2><div class="stats"><div class="card stat"><span>Ingresos</span><b>' + money(d.totals.incomeMonthly) + '</b></div><div class="card stat"><span>Gastos</span><b>' + money(d.totals.expenseMonthly) + '</b></div><div class="card stat"><span>Disponible</span><b>' + money(d.totals.disposableMonthly) + "</b></div></div></section>" +
      '<section class="card panel section"><h2>Estudiantes</h2>' + d.students.map(function (s) { return "<p>" + esc(s.name) + " · " + esc(s.grade) + "</p>"; }).join("") + "</section>" +
      '<section class="card panel section"><h2>Representantes</h2>' + d.representatives.map(repText).join("") + "</section>" +
      '<section class="card panel section"><h2>Ingresos</h2><div class="matrix"><table><thead><tr><th>Quién</th><th>Concepto</th><th>Mensual</th><th>12 meses</th><th>Comentario</th></tr></thead><tbody>' + income + "</tbody></table></div></section>" +
      '<section class="card panel section"><h2>Gastos</h2><div class="matrix"><table><thead><tr><th>Hogar</th><th>Concepto</th><th>Mensual</th><th>12 meses</th><th>Comentario</th></tr></thead><tbody>' + expenses + "</tbody></table></div></section>" +
      '<section class="card panel section"><h2>Documentos</h2><ul>' + (files || "<li>Sin archivos.</li>") + missing + "</ul></section></div><aside><section class=\"suggest\"><h2>Plan según la métrica</h2><p>" + (d.suggested ? "Sugerido: plan " + esc(d.suggested.code) + " · valor usado " + money(d.suggested.value) : "Ningún rango coincide.") + "</p><p>" + esc(BASIS[d.metrics[0] && d.metrics[0].basis] || "") + (d.metricsConfirmed ? "" : ". Las bandas actuales son un punto de partida: confírmelas en Configuración antes de asignar.") + "</p></section>" +
      '<section class="card panel section"><h2>Pensiones del año</h2><div class="matrix"><table><thead><tr><th>Estudiante</th>' + d.plans.map(function (p) { return "<th>" + p.code + "</th>"; }).join("") + "</tr></thead><tbody>" + priceRows + "</tbody></table></div><table style=\"margin-top:10px\"><thead><tr><th>Plan</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>" + metricRows + "</tbody></table></section>" +
      '<form class="card panel section" id="assign"><h2>Asignar y registrar fechas</h2><label>Estado<select name="status">' + statusOpts + '</select></label><label>Nota para la familia<textarea name="reviewNote" placeholder="Obligatoria si el estado es Incompleta">' + esc(d.reviewNote) + '</textarea></label><label>Plan asignado<select name="assignedPlan">' + planOpts + '</select></label><label>Motivo si difiere del sugerido<textarea name="assignmentNote">' + esc(d.assignmentNote) + "</textarea></label><div class=\"dates\">" + dates + '</div><p class="note">Al asignar un plan se completan las fechas que estén vacías: respuesta, plazo de aceptación, reconsideración y vigencia.</p><button class="btn pri" type="submit">Guardar revisión</button><p id="saveMsg" class="muted"></p></form><section class="card panel section"><h2>Avisos</h2><ul>' + mails + "</ul></section><section class=\"card panel section\"><h2>Historial</h2><ul>" + events + "</ul></section></aside></div>");
    document.getElementById("assign").onsubmit = async function (ev) {
      ev.preventDefault();
      var form = ev.target;
      var datesBody = {};
      form.querySelectorAll("[data-date]").forEach(function (input) { datesBody[input.getAttribute("data-date")] = input.value; });
      try {
        var saved = await json("/api/admin/solicitudes/" + id, "PATCH", {
          status: form.status.value,
          reviewNote: form.reviewNote.value,
          assignedPlan: form.assignedPlan.value,
          assignmentNote: form.assignmentNote.value,
          dates: datesBody
        });
        document.getElementById("saveMsg").textContent = "Revisión guardada.";
        d = saved;
        await detailView(id);
      } catch (error) {
        var msg = document.getElementById("saveMsg");
        if (msg) msg.textContent = error.message;
      }
    };
    bindShell();
  }

  async function configView() {
    var c = await api("/api/admin/config");
    window.__cfg = c;
    var school = state.school && c.schools.some(function (s) { return s.slug === state.school; }) ? state.school : c.schools[0].slug;
    app.innerHTML = shell('<div class="config-grid">' + generalBlock(c) + schoolsBlock(c) + pricesBlock(c, school) + metricsBlock(c, school) + conceptsBlock(c) + mailBlock(c) + "</div>");
    bindShell();
    document.getElementById("saveGeneral").onclick = async function () {
      var grades = [];
      document.querySelectorAll("[data-grade]").forEach(function (row) {
        grades.push({ name: row.querySelector("[data-gname]").value, stage: row.querySelector("[data-gstage]").value });
      });
      try {
        window.__cfg = await json("/api/admin/general", "PUT", {
          schoolYear: val("schoolYear"), schoolYearStart: val("schoolYearStart"), acceptDays: val("acceptDays"),
          reconsiderationBusinessDays: val("reconDays"), validityYears: val("validityYears"), committeeLeadDays: val("leadDays"),
          responseTextShort: val("textShort"), responseTextFull: val("textFull"), grades: grades
        });
        flash("generalMsg", "Año lectivo y plazos guardados.");
      } catch (error) { flash("generalMsg", error.message); }
    };
    document.getElementById("addGrade").onclick = function () {
      var stage = c.stages[0];
      document.getElementById("gradeList").insertAdjacentHTML("beforeend", gradeRow("", stage, c.stages));
    };
    c.schools.forEach(function (s) {
      document.getElementById("save-" + s.slug).onclick = async function () {
        try {
          window.__cfg = await json("/api/admin/colegios/" + s.slug, "PUT", {
            name: val("name-" + s.slug), campus: val("campus-" + s.slug), phone: val("phone-" + s.slug),
            email: val("email-" + s.slug), notifyEmail: val("notify-" + s.slug), address: val("address-" + s.slug),
            legalName: val("legal-" + s.slug), ruc: val("ruc-" + s.slug), policyUrl: val("policy-" + s.slug)
          });
          flash("msg-" + s.slug, "Datos del colegio guardados.");
        } catch (error) { flash("msg-" + s.slug, error.message); }
      };
    });
    document.getElementById("priceSchool").onchange = function () {
      state.school = document.getElementById("priceSchool").value;
      sessionStorage.setItem("tp-school", state.school);
      configView();
    };
    document.getElementById("savePrices").onclick = async function () {
      var amounts = [];
      document.querySelectorAll("[data-price]").forEach(function (input) {
        amounts.push({ stage: input.getAttribute("data-stage"), plan: input.getAttribute("data-plan"), amount: input.value });
      });
      try {
        window.__cfg = await json("/api/admin/precios", "PUT", { school: document.getElementById("priceSchool").value, amounts: amounts });
        flash("priceMsg", "Pensiones guardadas.");
      } catch (error) { flash("priceMsg", error.message); }
    };
    document.getElementById("metricSchool").onchange = function () { state.school = document.getElementById("metricSchool").value; configView(); };
    document.getElementById("saveMetrics").onclick = async function () {
      var rows = [];
      document.querySelectorAll("[data-metric]").forEach(function (row) {
        rows.push({ plan: row.getAttribute("data-metric"), min: row.querySelector("[data-min]").value, max: row.querySelector("[data-max]").value });
      });
      try {
        window.__cfg = await json("/api/admin/metricas", "PUT", {
          school: document.getElementById("metricSchool").value,
          basis: document.getElementById("basis").value,
          confirmed: document.getElementById("confirmed").checked,
          rows: rows
        });
        flash("metricMsg", "Métricas guardadas.");
      } catch (error) { flash("metricMsg", error.message); }
    };
    document.getElementById("saveConcepts").onclick = async function () {
      var read = function (kind) {
        return Array.prototype.map.call(document.querySelectorAll('[data-concept="' + kind + '"]'), function (row) {
          return { id: row.getAttribute("data-id"), label: row.querySelector("[data-label]").value, hint: row.querySelector("[data-hint]").value };
        });
      };
      var documents = Array.prototype.map.call(document.querySelectorAll("[data-doc]"), function (row) {
        return { id: row.getAttribute("data-doc"), t: row.querySelector("[data-title]").value, p: row.querySelector("[data-period]").value, h: row.querySelector("[data-help]").value };
      });
      try {
        window.__cfg = await json("/api/admin/conceptos", "PUT", { income: read("income"), expense: read("expense"), documents: documents });
        flash("conceptMsg", "Conceptos guardados.");
      } catch (error) { flash("conceptMsg", error.message); }
    };
    document.getElementById("saveMail").onclick = async function () {
      try {
        window.__cfg = await json("/api/admin/correo", "PUT", {
          host: val("smtpHost"), port: val("smtpPort"), secure: document.getElementById("smtpSecure").checked,
          user: val("smtpUser"), password: val("smtpPass"), fromName: val("smtpFrom")
        });
        flash("mailMsg", "Correo guardado. La contraseña solo se reemplaza si escribe una nueva.");
        document.getElementById("smtpPass").value = "";
      } catch (error) { flash("mailMsg", error.message); }
    };
  }
  function val(id) { return document.getElementById(id).value; }
  function flash(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function gradeRow(name, stage, stages) {
    return '<div class="tools" data-grade><input data-gname value="' + esc(name) + '" placeholder="Grado"><select data-gstage>' + stages.map(function (item) {
      return '<option' + (item === stage ? " selected" : "") + ">" + esc(item) + "</option>";
    }).join("") + "</select></div>";
  }
  function generalBlock(c) {
    return '<section class="card panel"><h2>Año lectivo y plazos</h2><div class="dates"><label>Año lectivo<input id="schoolYear" value="' + esc(c.schoolYear) + '"></label><label>Inicio del año<input id="schoolYearStart" type="date" value="' + esc(c.schoolYearStart) + '"></label><label>Días para aceptar<input id="acceptDays" type="number" value="' + esc(c.acceptDays) + '"></label><label>Días hábiles de reconsideración<input id="reconDays" type="number" value="' + esc(c.reconsiderationBusinessDays) + '"></label><label>Años de vigencia<input id="validityYears" type="number" value="' + esc(c.validityYears) + '"></label><label>Días hábiles antes del corte<input id="leadDays" type="number" value="' + esc(c.committeeLeadDays) + '"></label></div><label>Texto de respuesta, plan B<textarea id="textShort">' + esc(c.responseTextShort) + '</textarea></label><label>Texto de respuesta, planes C, D y E<textarea id="textFull">' + esc(c.responseTextFull) + '</textarea></label><h3 style="margin-top:16px">Grados</h3><div id="gradeList">' + c.grades.map(function (g) { return gradeRow(g.name, g.stage, c.stages); }).join("") + '</div><div class="row-actions"><button class="btn" id="addGrade" type="button">Agregar grado</button><button class="btn pri" id="saveGeneral" type="button">Guardar</button></div><p id="generalMsg" class="muted"></p></section>';
  }
  function schoolsBlock(c) {
    return c.schools.map(function (s) {
      return '<section class="card school-box"><h2>' + esc(s.name) + '</h2><img src="' + esc(s.logo) + '" alt="" style="height:42px;margin:8px 0"><div class="dates"><label>Nombre<input id="name-' + s.slug + '" value="' + esc(s.name) + '"></label><label>Campus<input id="campus-' + s.slug + '" value="' + esc(s.campus) + '"></label><label>Teléfono<input id="phone-' + s.slug + '" value="' + esc(s.phone) + '"></label><label>Correo de contacto<input id="email-' + s.slug + '" value="' + esc(s.email) + '"></label><label>Correo que recibe las solicitudes<input id="notify-' + s.slug + '" value="' + esc(s.notifyEmail) + '" placeholder="Se configura cuando comparta el correo"></label><label>Dirección<input id="address-' + s.slug + '" value="' + esc(s.address) + '"></label><label>Razón social<input id="legal-' + s.slug + '" value="' + esc(s.legalName) + '"></label><label>RUC<input id="ruc-' + s.slug + '" value="' + esc(s.ruc) + '"></label><label>Política de datos<input id="policy-' + s.slug + '" value="' + esc(s.policyUrl) + '"></label></div><div class="row-actions"><button class="btn pri" id="save-' + s.slug + '" type="button">Guardar colegio</button></div><p id="msg-' + s.slug + '" class="muted"></p></section>';
    }).join("");
  }
  function pricesBlock(c, school) {
    var head = "<tr><th>Etapa</th>" + c.plans.map(function (p) { return "<th>Plan " + p.code + "</th>"; }).join("") + "</tr>";
    var body = c.stages.map(function (stage) {
      return "<tr><td>" + esc(stage) + "</td>" + c.plans.map(function (p) {
        var found = c.prices.find(function (x) { return x.school === school && x.stage === stage && x.plan === p.code; });
        return '<td><input data-price data-stage="' + esc(stage) + '" data-plan="' + p.code + '" value="' + (found ? found.amount : "") + '"></td>';
      }).join("") + "</tr>";
    }).join("");
    return '<section class="card panel"><h2>Pensiones mensuales</h2><label>Colegio<select id="priceSchool">' + c.schools.map(function (s) {
      return '<option value="' + s.slug + '"' + (s.slug === school ? " selected" : "") + ">" + esc(s.name) + "</option>";
    }).join("") + '</select></label><div class="matrix"><table><thead>' + head + "</thead><tbody>" + body + '</tbody></table></div><button class="btn pri" id="savePrices" type="button">Guardar pensiones</button><p id="priceMsg" class="muted"></p></section>';
  }
  function metricsBlock(c, school) {
    var rows = c.plans.map(function (p) {
      var found = c.metrics.find(function (m) { return m.school === school && m.plan === p.code; }) || {};
      return '<tr data-metric="' + p.code + '"><td>Plan ' + p.code + '</td><td><input data-min value="' + (found.min == null ? "" : found.min) + '"></td><td><input data-max value="' + (found.max == null ? "" : found.max) + '"></td></tr>';
    }).join("");
    var basis = (c.metrics.find(function (m) { return m.school === school; }) || {}).basis || "ingreso_mensual";
    return '<section class="card panel"><h2>Métricas para asignar el plan</h2><p class="note">Estas bandas son el punto de partida. El plan sugerido es el primer rango que contiene el monto, revisando de E hacia A. Si asigna otro plan, el expediente pide un motivo.</p><label>Colegio<select id="metricSchool">' + c.schools.map(function (s) {
      return '<option value="' + s.slug + '"' + (s.slug === school ? " selected" : "") + ">" + esc(s.name) + "</option>";
    }).join("") + '</select></label><label>Qué monto se compara<select id="basis">' + Object.keys(BASIS).map(function (key) {
      return '<option value="' + key + '"' + (basis === key ? " selected" : "") + ">" + BASIS[key] + "</option>";
    }).join("") + '</select></label><table><thead><tr><th>Plan</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>' + rows + '</tbody></table><label class="tools"><input id="confirmed" type="checkbox" style="width:auto"' + (c.metricsConfirmed ? " checked" : "") + "> Estas métricas ya fueron revisadas por el colegio</label><div><button class=\"btn pri\" id=\"saveMetrics\" type=\"button\">Guardar métricas</button></div><p id=\"metricMsg\" class=\"muted\"></p></section>";
  }
  function conceptsBlock(c) {
    var block = function (title, kind, items) {
      return "<h3>" + title + "</h3>" + items.map(function (item) {
        return '<div data-concept="' + kind + '" data-id="' + esc(item.id) + '"><label>' + esc(item.id) + '<input data-label value="' + esc(item.label) + '"></label><label>Ayuda<textarea data-hint>' + esc(item.hint) + "</textarea></label></div>";
      }).join("");
    };
    var docs = c.documents.map(function (doc) {
      var who = { dep: "Si es dependiente", rucp: "Si tiene RUC personal", ruce: "Si tiene empresa", veh: "Si tiene vehículos", all: "Siempre" }[doc.cond] || doc.cond;
      return '<div data-doc="' + esc(doc.id) + '"><label>' + esc(who) + (doc.full ? " · solo C, D y E" : "") + '<input data-title value="' + esc(doc.t) + '"></label><label>Periodo<input data-period value="' + esc(doc.p) + '"></label><label>Ayuda<input data-help value="' + esc(doc.h) + '"></label></div>';
    }).join("");
    return '<section class="card panel"><h2>Conceptos y documentos</h2>' + block("Ingresos", "income", c.income) + block("Gastos", "expense", c.expense) + "<h3>Documentos</h3>" + docs + '<button class="btn pri" id="saveConcepts" type="button">Guardar conceptos</button><p id="conceptMsg" class="muted"></p></section>';
  }
  function mailBlock(c) {
    return '<section class="card panel"><h2>Correo de aviso</h2><p class="note">Cuando comparta los correos de Puembo y Santa Clara, escríbalos en cada colegio. Aquí va el servidor desde el que se envían. Hasta entonces el aviso queda registrado en la solicitud como pendiente.</p><div class="dates"><label>Servidor SMTP<input id="smtpHost" value="' + esc(c.smtp.host) + '"></label><label>Puerto<input id="smtpPort" value="' + esc(c.smtp.port) + '"></label><label>Usuario<input id="smtpUser" value="' + esc(c.smtp.user) + '"></label><label>Contraseña<input id="smtpPass" type="password" placeholder="' + (c.smtp.passwordSet ? "Guardada" : "Pendiente") + '"></label><label>Nombre del remitente<input id="smtpFrom" value="' + esc(c.smtp.fromName) + '"></label></div><label class="tools"><input id="smtpSecure" type="checkbox" style="width:auto"' + (c.smtp.secure ? " checked" : "") + '> Conexión segura (SSL)</label><div><button class="btn pri" id="saveMail" type="button">Guardar correo</button></div><p id="mailMsg" class="muted"></p></section>';
  }

  window.addEventListener("hashchange", render);
  api("/api/admin/me").then(function (me) { state.me = me; render(); }).catch(function () { state.me = null; render(); });
})();
