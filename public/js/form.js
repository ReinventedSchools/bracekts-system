(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var fmt = function (n) { return Math.round(n || 0).toLocaleString("es-EC"); };
  var money = function (n) { return "$" + fmt(n); };
  var STEPS = ["Autorización", "Postulación", "Representantes", "Ingresos del hogar", "Gastos del hogar", "Documentos", "Revisión y firma"];
  var pick = { code: "", school: "", variant: "short" };
  function draftKey() { return "tp-" + (pick.code || "none"); }
  var CFG = null;
  var hold = null;
  var ERR = {};
  var S = blank();

  function blank() {
    return {
      id: "", token: "", step: -1, d: {}, na: {}, stu: [{ n: "", g: "" }], files: {},
      status: "", reference: "", reviewNote: "", submittedAtLabel: "",
      variant: pick.variant, formCode: "", year: "", back: false, busy: false, serverErrors: []
    };
  }
  function full() { return (S.id ? S.variant : pick.variant) === "full"; }
  function V(k) { return S.d[k] == null ? "" : S.d[k]; }
  function N(k) { var v = +S.d[k]; return isNaN(v) ? 0 : v; }
  function r2full() { return V("r2s") === "full"; }
  function homes() { return r2full() && V("home") === "two" ? 2 : 1; }
  function cats(name) { return (CFG && CFG[name]) || []; }
  function incT(r) { return cats("income").reduce(function (a, i) { return a + N("r" + r + "_" + i.id); }, 0); }
  function expT(h) { return cats("expense").reduce(function (a, e) { return a + N("h" + h + "_" + e.id); }, 0); }
  function reps() { return r2full() ? [1, 2] : [1]; }
  function incH() { return reps().reduce(function (a, r) { return a + incT(r); }, 0); }
  function expH() { var t = 0; for (var h = 1; h <= homes(); h++) t += expT(h); return t; }
  function who(r) { return V("r" + r + "_name") || ("Representante " + r); }
  function etapa(g) { var row = (CFG.grades || []).find(function (x) { return x.name === g; }); return row ? row.stage : ""; }
  function docs() { return (CFG.documents || []).filter(function (d) { return full() || !d.full; }); }
  function whenText() { return !CFG ? "" : (full() ? CFG.deadlines.responseTextFull : CFG.deadlines.responseTextShort); }
  function docWho(d) {
    return { dep: "Si trabaja en relación de dependencia", rucp: "Si tiene RUC personal", ruce: "Si tiene empresa propia", veh: "Si tiene vehículos" }[d.cond] || "Todos";
  }
  function formCode() { return S.formCode || ((CFG && CFG.school.code) + (full() ? "-02" : "-01")); }

  function paint() {
    if (!CFG) return;
    var school = CFG.school;
    $("#logo").src = school.logo;
    $("#logo").alt = school.name;
    $("#schoolName").textContent = "";
    $("#campus").textContent = school.campus;
    $("#fcode").textContent = "FORMULARIO " + formCode();
    $("#yearLine").textContent = "Año lectivo " + (S.year || CFG.year);
    var bits = [school.address, school.phone, school.email].filter(Boolean);
    $("#foot").innerHTML = "<span>" + esc(bits.join(" · ") || school.name) + "</span><span>Año lectivo " + esc(S.year || CFG.year) + "</span>";
    $("#faqWhen").textContent = whenText();
    $("#faqContact").innerHTML = esc(school.name) + (school.phone ? " · " + esc(school.phone) : "") + (school.email ? "<br>" + esc(school.email) : "");
  }

  var tSave;
  function save() {
    clearTimeout(tSave);
    if (!S.id || (S.status && S.status !== "borrador" && S.status !== "incompleta")) return;
    tSave = setTimeout(async function () {
      try {
        localStorage.setItem(draftKey(), JSON.stringify({ id: S.id, token: S.token }));
        var res = await fetch("/api/solicitudes/" + S.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: S.token, step: S.step, d: S.d, na: S.na, stu: S.stu })
        });
        $("#saved").textContent = res.ok ? "Borrador guardado" : "No se pudo guardar";
      } catch (e) {
        $("#saved").textContent = "Sin conexión: el borrador no se guardó";
      }
    }, 350);
  }

  function em(k) { return ERR[k] ? '<div class="errmsg" id="e-' + k + '">' + esc(ERR[k]) + "</div>" : ""; }
  function dialCode(stored) {
    var raw = String(stored || "");
    var code = raw.indexOf("|") >= 0 ? raw.split("|")[0] : raw;
    code = code.replace(/\D/g, "");
    return code || "593";
  }
  function cleanTel(value, storedCode) {
    var digits = String(value || "").replace(/\D/g, "");
    if (dialCode(storedCode) === "593") {
      if (digits.charAt(0) === "0") digits = digits.slice(1);
      return digits.slice(0, 9);
    }
    return digits.slice(0, 14);
  }
  function phoneText(slot) {
    var number = V("r" + slot + "_tel");
    if (!number) return "";
    return "+" + dialCode(V("r" + slot + "_cc")) + " " + number;
  }
  function field(k, label, o) {
    o = o || {};
    var ccStored = o.tel ? V(k.replace(/_tel$/, "_cc")) : "";
    if (o.tel) { var tel = cleanTel(V(k), ccStored); if (tel !== V(k)) S.d[k] = tel; }
    var id = "f-" + k;
    var desc = [o.hint ? "h-" + k : "", ERR[k] ? "e-" + k : ""].filter(Boolean).join(" ");
    var a = (desc ? ' aria-describedby="' + desc + '"' : "") + (ERR[k] ? ' aria-invalid="true"' : "") + (o.opt ? "" : ' aria-required="true"');
    var inp = o.area
      ? '<textarea class="in" id="' + id + '" data-k="' + k + '"' + a + ">" + esc(V(k)) + "</textarea>"
      : '<input class="in" id="' + id + '" data-k="' + k + '" type="' + (o.type || "text") + '"' + (o.tel ? ' data-tel="1" maxlength="' + (dialCode(ccStored) === "593" ? "10" : "14") + '"' : "") + (o.im ? ' inputmode="' + o.im + '"' : "") + (o.ac ? ' autocomplete="' + o.ac + '"' : "") + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ' value="' + esc(V(k)) + '"' + a + ">";
    var prefix = "";
    if (o.tel) {
      var ccKey = k.replace(/_tel$/, "_cc");
      var selected = V(ccKey) || "593|EC";
      var codes = (window.DIAL_CODES || [["EC", "Ecuador", "593"]]).map(function (row) {
        var value = row[2] + "|" + row[0];
        return '<option value="' + esc(value) + '"' + (selected === value ? " selected" : "") + ">" + esc(row[1] + " +" + row[2]) + "</option>";
      }).join("");
      prefix = '<label class="sr" for="f-' + ccKey + '">Prefijo de ' + label + '</label><select class="in cc" id="f-' + ccKey + '" data-k="' + ccKey + '" data-cc="1">' + codes + "</select>";
      inp = '<div class="phone">' + prefix + inp + "</div>";
      prefix = "";
    }
    return '<div class="f' + (ERR[k] ? " bad" : "") + '"><label class="lbl" for="' + id + '">' + label + (o.opt ? ' <span class="opt">(opcional)</span>' : '<span class="req">*</span>') + "</label>" + inp + (o.hint ? '<div class="hint" id="h-' + k + '">' + o.hint + "</div>" : "") + em(k) + "</div>";
  }
  function sel(k, label, opts) {
    var id = "f-" + k;
    return '<div class="f' + (ERR[k] ? " bad" : "") + '"><label class="lbl" for="' + id + '">' + label + '<span class="req">*</span></label><select class="in" id="' + id + '" data-k="' + k + '" aria-required="true"><option value="">Seleccione</option>' + opts.map(function (x) { return "<option" + (V(k) === x ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>" + em(k) + "</div>";
  }
  function radios(k, label, opts) {
    return '<fieldset class="' + (ERR[k] ? "bad" : "") + '"><legend class="lbl">' + label + '<span class="req">*</span></legend><div class="radios">' +
      opts.map(function (o) {
        var on = V(k) === o.v;
        return '<label class="radio' + (on ? " on" : "") + '"><input type="radio" name="' + k + '" value="' + o.v + '" data-k="' + k + '" data-re="1"' + (on ? " checked" : "") + "><span><b>" + o.t + "</b>" + (o.s ? "<small>" + o.s + "</small>" : "") + "</span></label>";
      }).join("") + "</div>" + em(k) + "</fieldset>";
  }
  function decl(k, text) {
    var on = V(k) === true;
    return '<div class="' + (ERR[k] ? "bad" : "") + '"><div class="decl"><label class="check"><input type="checkbox" data-k="' + k + '" data-chk="1"' + (on ? " checked" : "") + "><span>" + text + "</span></label></div>" + em(k) + "</div>";
  }
  function secErr() {
    var n = Object.keys(ERR).length;
    var extra = (S.serverErrors || []).length ? '<div class="secerr" role="alert"><b>No se pudo enviar.</b><br>' + S.serverErrors.map(esc).join("<br>") + "</div>" : "";
    return extra + (n ? '<div class="secerr" role="alert"><b>Revise ' + (n === 1 ? "el campo marcado" : "los " + n + " campos marcados") + ".</b> No es posible continuar hasta completarlos.</div>" : "");
  }
  function secHead(i, intro) {
    var note = S.status === "incompleta" && S.reviewNote ? '<div class="pend" role="alert"><b>El colegio pidió completar la solicitud.</b><br>' + esc(S.reviewNote) + "</div>" : "";
    return note + '<div class="sec-title"><span class="num">' + (i + 1) + '</span><h2 id="stepTitle">' + STEPS[i] + '</h2></div><p class="sec-intro">' + intro + "</p>" + secErr();
  }
  function sub(n, t) { return '<h3 class="sub">' + (n ? "<span>" + n + "</span>" : "") + t + "</h3>"; }
  function moneyTable(prefix, rows, caption) {
    var body = rows.map(function (r) {
      var k = prefix + r.id, a = N(k), has = V(k) !== "";
      var cmOpen = (S.cm && S.cm[k]) || V(k + "_c") !== "";
      return "<tr><td><label for=\"m-" + k + '" style="font-weight:600">' + esc(r.label) + '</label><div class="hint">' + esc(r.hint) + "</div>" +
        (cmOpen ? '<label class="sr" for="c-' + k + '">Comentario sobre ' + esc(r.label) + '</label><input class="in cmin" id="c-' + k + '" data-k="' + k + '_c" value="' + esc(V(k + "_c")) + '" placeholder="Comentario">' : '<button type="button" class="cmb" data-cm="' + k + '">Agregar comentario</button>') + "</td>" +
        '<td class="r"><div class="usd"><input class="in" id="m-' + k + '" data-mon="' + k + '" inputmode="numeric" value="' + (has ? fmt(a / 12) : "") + '" placeholder="0" aria-label="' + esc(r.label) + ', mensual"></div></td>' +
        '<td class="r"><div class="usd"><input class="in" id="a-' + k + '" data-ann="' + k + '" inputmode="numeric" value="' + (has ? fmt(a) : "") + '" placeholder="0" aria-label="' + esc(r.label) + ', próximos 12 meses"></div></td></tr>';
    }).join("");
    var tot = prefix.charAt(0) === "r" ? incT(+prefix.charAt(1)) : expT(+prefix.charAt(1));
    return '<div class="tw"><table class="money"><caption class="sr">' + caption + '</caption><thead><tr><th>Concepto</th><th class="r">Mensual</th><th class="r">Próximos 12 meses</th></tr></thead><tbody>' + body + "</tbody>" +
      '<tfoot><tr><td>Total</td><td class="r" id="tm-' + prefix + '">' + money(tot / 12) + '</td><td class="r" id="ta-' + prefix + '">' + money(tot) + "</td></tr></tfoot></table></div>";
  }
  function yn(k, label) {
    var v = V(k);
    return '<fieldset class="yn' + (ERR[k] ? " bad" : "") + '"><legend class="lbl">' + label + '<span class="req">*</span></legend><div class="yn-opts">' +
      [["si", "Sí"], ["no", "No"]].map(function (o) {
        return '<label class="radio' + (v === o[0] ? " on" : "") + '"><input type="radio" name="' + k + '" value="' + o[0] + '" data-k="' + k + '" data-re="1"' + (v === o[0] ? " checked" : "") + "><span><b>" + o[1] + "</b></span></label>";
      }).join("") + "</div>" + em(k) + "</fieldset>";
  }
  function repBlock(r) {
    var p = "r" + r + "_";
    var kt = N(p + "kg") + N(p + "kc") + N(p + "ku");
    var kids = r === 2 && V("r2_same") === true ? "" : '<div class="tw"><table class="kids"><thead><tr><th></th><th>Guardería</th><th>Colegio</th><th>Universidad</th><th>Total</th></tr></thead><tbody><tr><td class="hint">“Colegio” incluye a quienes están o ingresarán a ReinventED.</td>' +
      [["kg", "Guardería"], ["kc", "Colegio"], ["ku", "Universidad"]].map(function (x) {
        return '<td><label class="sr" for="f-' + p + x[0] + '">Hijos en ' + x[1].toLowerCase() + '</label><input class="in" id="f-' + p + x[0] + '" data-k="' + p + x[0] + '" data-int="1" data-kid="' + p + '" inputmode="numeric" value="' + esc(V(p + x[0])) + '" placeholder="0"></td>';
      }).join("") +
      '<td><label class="sr" for="kt-' + p + '">Total de hijos en etapa estudiantil</label><input class="in kt" id="kt-' + p + '" value="' + kt + '" readonly tabindex="-1" aria-readonly="true"></td></tr></tbody></table></div>';
    return '<h4 class="minor">Datos generales</h4><div class="grid">' + field(p + "name", "Nombres y apellidos", r === 1 ? { ac: "name" } : {}) + sel(p + "rel", "Relación con el estudiante", ["Madre", "Padre", "Representante legal"]) +
      field(p + "mail", "Correo electrónico", r === 1 ? { type: "email", ac: "email", im: "email", ph: "nombre@correo.com" } : { type: "email", im: "email", opt: 1, ph: "nombre@correo.com" }) + field(p + "tel", "WhatsApp", r === 1 ? { type: "tel", tel: 1, ac: "tel", im: "numeric", ph: dialCode(V(p + "cc")) === "593" ? "991234567" : "Número" } : { type: "tel", tel: 1, im: "numeric", opt: 1, ph: dialCode(V(p + "cc")) === "593" ? "991234567" : "Número" }) +
      field(p + "work", "Lugar de trabajo", { opt: 1, ph: "Empresa o independiente" }) + field(p + "pos", "Cargo", { opt: 1 }) + "</div>" +
      '<h4 class="minor">Situación laboral y bienes</h4><p class="hint" style="margin:-4px 0 12px">Con estas respuestas el formulario le pide solo los documentos que le corresponden.</p><div class="grid">' +
      yn(p + "qdep", "¿Trabaja en relación de dependencia?") + "</div>" +
      radios(p + "qruc", "¿Tiene RUC?", [{ v: "no", t: "No tengo RUC" }, { v: "per", t: "Tengo RUC personal" }, { v: "emp", t: "Tengo una empresa propia", s: "La empresa tiene su propio RUC." }, { v: "amb", t: "Tengo RUC personal y empresa propia" }]) +
      '<div class="f" style="max-width:220px"><label class="lbl" for="f-' + p + 'veh">Vehículos propios <span class="opt">(número)</span></label><input class="in" id="f-' + p + 'veh" data-k="' + p + 'veh" data-int="1" inputmode="numeric" value="' + esc(V(p + "veh")) + '" placeholder="0"></div>' +
      "<h4 class=\"minor\">Hijos en etapa estudiantil</h4>" + (r === 2 ? '<label class="check" style="border:0;padding:0 0 12px"><input type="checkbox" data-k="r2_same" data-chk="1"' + (V("r2_same") === true ? " checked" : "") + "><span>Los hijos son los mismos que los del representante 1</span></label>" : "") + kids;
  }
  function legal() {
    var school = CFG.school;
    var responsable = school.legalName || school.name;
    var ruc = school.ruc ? ", RUC " + school.ruc : "";
    var policy = school.policyUrl ? '<p>Puede consultar la Política General de Protección de Datos Personales en el sitio web <a href="' + esc(school.policyUrl) + '" target="_blank" rel="noopener">' + esc(school.policyUrl) + "</a>.</p>" : "";
    return "<p><b>Autorización para el Tratamiento de Datos:</b></p><p>En mi calidad de solicitante de ayuda financiera, reconozco que proporcionar esta información no me confiere ningún derecho. La decisión final estará sujeta a la evaluación y aceptación expresa de " + esc(responsable) + ". Declaro que todos los datos proporcionados en esta solicitud son completos, veraces y reflejan la realidad. En consecuencia, asumo toda responsabilidad por los posibles daños que pueda sufrir " + esc(responsable) + " debido a la eventual falsedad o imprecisión de la información suministrada. Además, he sido informado sobre el tratamiento de mis datos personales acorde a la Ley Orgánica de Protección de Datos Personales, su reglamento y conforme a la Política de Protección de Datos Personales que mantiene " + esc(responsable) + ". Autorizo de manera libre, expresa, inequívoca e informada a " + esc(responsable) + " para que recopile, almacene, archive, copie, analice, use y consulte mis datos personales para las finalidades descritas a continuación:</p><p>a. Atender requerimientos de autoridades.</p><p>b. Analizar la información y riesgo crediticio, realizar reportes y consultas a centrales de riesgo legalmente establecidas en Ecuador u otras entidades que gestionen bases de datos con propósitos informativos, financieros, estadísticos, de control, supervisión, gerenciales y de consolidación de información.</p><p>c. Consultar mi historial crediticio y datos relacionados con mi solvencia patrimonial o crediticia.</p><p>d. Recibir correos electrónicos o comunicarse telefónicamente.</p><p>e. Compartir mi información con proveedores de sus diversos programas de financiamiento.</p><p>f. Compartir información con aliados comerciales para recibir servicios con beneficios.</p><p>g. Compartir o enviar datos a terceros con quienes realice alianzas o contratos con fines comerciales relacionados con su objeto social.</p><p>h. Transferir internacionalmente y transmitir mis datos a terceros con quienes establezca alianzas relacionadas con su objeto social o les encomiende el tratamiento de datos.</p><p>i. Gestionar cobranzas.</p><p>La información proporcionada se conservará durante el periodo de tiempo necesario para cumplir con las finalidades del tratamiento, de acuerdo con las normas comerciales, tributarias o cualquier otra aplicable.</p><p>El titular podrá ejercer sus derechos previstos en la Ley Orgánica de Protección de Datos Personales: información, acceso, rectificación, eliminación, oposición y portabilidad, entre otros.</p>" + policy;
  }
  function vIntro() {
    var resume = "";
    if (hold && hold.status === "borrador") {
      resume = '<div class="resume"><p>Existe una solicitud en borrador.</p><div class="actions"><button class="btn" type="button" id="restart">Descartar</button><button class="btn pri" type="button" id="resume" style="min-width:0">Continuar borrador</button></div></div>';
    } else if (hold && hold.status === "incompleta") {
      resume = '<div class="resume"><p>El colegio pidió completar la solicitud ' + esc(hold.reference || "") + ".</p><div class=\"actions\"><button class=\"btn pri\" type=\"button\" id=\"resume\">Corregir y reenviar</button></div></div>";
    } else if (hold && hold.reference) {
      resume = '<div class="resume"><p>Su postulación ' + esc(hold.reference) + ' ya fue enviada.</p><div class="actions"><button class="btn" type="button" id="viewLast">Ver constancia</button><button class="btn pri" type="button" id="fresh" style="min-width:0">Nueva solicitud</button></div></div>';
    }
    var plans = full() ? "C, D o E" : "B";
    var locked = full()
      ? "Este enlace es solo para los planes C, D o E. Dentro del formulario elige uno de esos tres."
      : "Este enlace es solo para el plan B.";
    var docsTable = '<div class="tw"><table style="min-width:480px;margin-top:6px"><thead><tr><th>Documento</th><th>Periodo</th><th>Se pide</th></tr></thead><tbody>' + docs().map(function (d) {
      return "<tr><td>" + esc(d.t) + '</td><td style="white-space:nowrap">' + esc(d.p) + "</td><td>" + esc(docWho(d)) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return resume + '<p class="kicker">Instrucciones</p><h1>Aplicación a Tuition Plans</h1>' +
      '<p class="lead">Los Tuition Plans son cinco planes estándar de pensión, de A a E. Este formulario es para las familias que postulan al plan ' + plans + ". El plan A no requiere información financiera. " + locked + "</p>" +
      '<div class="clauses">' +
      '<div class="clause"><div><h4>Quiénes lo completan</h4><p>Se completa con la información de ambos representantes del estudiante: madre, padre o representante legal. Si los padres están separados o divorciados, se requiere la información de ambos. Solo se omite a un representante si no participa de ninguna forma en la vida ni en los gastos del estudiante.</p></div></div>' +
      '<div class="clause"><div><h4>Asignación</h4><p>La familia postula y el colegio asigna. Tras la evaluación, el colegio puede asignar el plan postulado, uno de precio mayor o determinar que corresponde el plan A. Postular a un plan no implica admisión. El plan asignado rige por tres años lectivos.</p></div></div>' +
      '<div class="clause"><div><h4>Información que se declara</h4><p>Datos de los representantes, ingresos del hogar y gastos del hogar proyectados para los próximos 12 meses. Los montos pueden ingresarse de forma mensual o anual.</p></div></div>' +
      '<div class="clause"><div><h4>Documentos solicitados</h4><p>De cada representante, en PDF o fotografía legible. El formulario pide solo los que corresponden según sus respuestas. Si no tiene alguno, lo indica y escribe el motivo. Los estados de cuenta bancarios y el certificado crediticio son obligatorios.</p>' + docsTable + "</div></div>" +
      '<div class="clause"><div><h4>Expediente completo</h4><p>Solo se analizan expedientes completos y los plazos corren desde la recepción de la documentación completa. El colegio puede solicitar aclaraciones o documentos adicionales si la información es inconsistente.</p></div></div>' +
      '<div class="clause"><div><h4>Plazos de respuesta</h4><p>' + esc(whenText()) + "</p></div></div>" +
      '<div class="clause"><div><h4>Confidencialidad</h4><p>Solo tienen acceso la Gerencia Administrativa y Financiera y el Comité de Admisiones. Los expedientes se conservan durante la vigencia del plan y un año adicional; los de postulaciones no admitidas, seis meses.</p></div></div>' +
      '<div class="clause"><div><h4>Borrador</h4><p>El avance y los documentos se guardan. Antes de enviar podrá revisar y corregir toda la información. Continúe desde este mismo dispositivo.</p></div></div></div>';
  }
  function vAut() {
    var school = CFG.school;
    var responsable = (school.legalName || school.name) + (school.ruc ? ", RUC " + school.ruc : "");
    return secHead(0, "Lea el texto y acepte la autorización. Ambos representantes la confirman al firmar en la sección 7.") +
      '<div class="tw"><table style="min-width:440px;margin-bottom:18px"><tbody><tr><td style="width:30%;font-weight:600">Responsable</td><td>' + esc(responsable) + "</td></tr><tr><td style=\"font-weight:600\">Finalidad</td><td>Asignar, recertificar o revisar el Tuition Plan del estudiante</td></tr><tr><td style=\"font-weight:600\">Acceso</td><td>Gerencia Administrativa y Financiera y Comité de Admisiones</td></tr><tr><td style=\"font-weight:600\">Conservación</td><td>Durante la vigencia del plan y un año adicional. Postulaciones no admitidas: seis meses.</td></tr><tr><td style=\"font-weight:600\">Derechos</td><td>Acceso, rectificación, eliminación, oposición y portabilidad, conforme a la Ley Orgánica de Protección de Datos Personales</td></tr></tbody></table></div>" +
      '<div class="legal" tabindex="0" aria-label="Texto de la autorización">' + legal() + "</div>" +
      decl("auth", "He leído y acepto la autorización para el tratamiento de mis datos personales.");
  }
  function planBox() {
    var et = [];
    S.stu.forEach(function (x) { var e = etapa(x.g); if (e && et.indexOf(e) < 0) et.push(e); });
    var plans = full() ? ["C", "D", "E"] : ["B"];
    var tbl = et.length ? '<div class="tw"><table style="min-width:360px;margin-top:4px"><thead><tr><th>Etapa de sus estudiantes</th>' + plans.map(function (x) { return '<th class="r">Plan ' + x + "</th>"; }).join("") + "</tr></thead><tbody>" + et.map(function (e) {
      return "<tr><td>" + esc(e) + "</td>" + plans.map(function (x) {
        var amount = CFG.prices[e] && CFG.prices[e][x];
        return '<td class="r">' + (amount == null ? "—" : "$" + amount) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>" : '<p class="hint">Indique el grado de sus estudiantes para ver la pensión mensual de cada plan.</p>';
    if (!full()) return "<p style=\"margin-bottom:8px\">Usted postula al <b>plan B</b>.</p>" + tbl;
    return radios("plan", "Plan al que postula", [{ v: "C", t: "Plan C" }, { v: "D", t: "Plan D" }, { v: "E", t: "Plan E" }]) + tbl;
  }
  function vSol() {
    var grades = (CFG.grades || []).map(function (g) { return g.name; });
    var rows = S.stu.map(function (s, i) {
      return "<tr><td><label class=\"sr\" for=\"sn" + i + "\">Nombres y apellidos del estudiante " + (i + 1) + '</label><input class="in' + (ERR["stu" + i] ? " bad" : "") + '" id="sn' + i + '" data-stu="' + i + '" data-p="n" value="' + esc(s.n) + '" placeholder="Nombres y apellidos"></td>' +
        '<td style="width:36%"><label class="sr" for="sg' + i + '">Grado ' + esc(CFG.year) + " del estudiante " + (i + 1) + '</label><select class="in' + (ERR["stug" + i] ? " bad" : "") + '" id="sg' + i + '" data-stu="' + i + '" data-p="g"><option value="">Seleccione</option>' + grades.map(function (g) { return "<option" + (s.g === g ? " selected" : "") + ">" + esc(g) + "</option>"; }).join("") + "</select></td>" +
        "<td>" + (S.stu.length > 1 ? '<button type="button" class="x" data-rm="' + i + '">Quitar</button>' : "") + "</td></tr>";
    }).join("");
    var se = Object.keys(ERR).filter(function (k) { return k.indexOf("stu") === 0; }).map(function (k) { return '<div class="errmsg">' + esc(ERR[k]) + "</div>"; }).join("");
    return secHead(1, "Indique los estudiantes y el plan al que postula.") + '<p class="reqlegend">Los campos marcados con <span class="req">*</span> son obligatorios.</p>' +
      sub("2.1", "Estudiantes") + '<div class="tw"><table class="stu"><thead><tr><th>Nombres y apellidos<span class="req">*</span></th><th>Grado ' + esc(CFG.year) + '<span class="req">*</span></th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" + se +
      (S.stu.length < 4 ? '<button type="button" class="add" id="addStu">Agregar otro estudiante</button>' : "") +
      sub("2.2", "Plan al que postula") + planBox() +
      sub("2.3", "Declaración") + decl("decl", "Declaro que la información que entrego es verdadera y completa. Entiendo que, de no serlo, la solicitud será anulada y no podré presentar una nueva en el futuro. Si se comprueba, en cualquier momento, que se presentó información falsa o se ocultó información relevante, el colegio reasignará al estudiante al plan A con efecto inmediato desde el inicio de la asignación y cobrará cualquier diferencia que se haya generado en meses previos.");
  }
  function vReps() {
    var st = V("r2s");
    return secHead(2, "Datos de los representantes del estudiante: madre, padre o representante legal. El representante 1 es el contacto principal.") + '<p class="reqlegend">Los campos marcados con <span class="req">*</span> son obligatorios.</p>' +
      sub("3.1", "Representante 1") + repBlock(1) +
      sub("3.2", "Representante 2") + '<p class="hint" style="margin:-4px 0 12px">Se requiere la información de ambos representantes, también si están separados o divorciados.</p>' +
      radios("r2s", "Situación del representante 2", [{ v: "full", t: "Completaré su información" }, { v: "absent", t: "No completaré su información", s: "Por ejemplo, si no participa de ninguna forma en la vida ni en los gastos del estudiante. Explique la situación en la casilla siguiente." }]) +
      (st === "full" ? repBlock(2) : (st ? field("r2_why", "Explique brevemente la situación", { area: 1, hint: "Indique el motivo por el que no se completa la información del representante 2." }) : ""));
  }
  function vInc() {
    var rs = reps();
    var b = rs.map(function (r, i) { return sub("4." + (i + 1), "Ingresos de " + esc(who(r))) + moneyTable("r" + r + "_", cats("income"), "Ingresos de " + who(r)); }).join("");
    var sum = rs.length > 1 ? sub("4." + (rs.length + 1), "Total de ingresos del hogar") + '<div class="tw"><table class="money sumt"><thead><tr><th>Representante</th><th class="r">Mensual</th><th class="r">Próximos 12 meses</th></tr></thead><tbody>' +
      rs.map(function (r) { return "<tr><td>" + esc(who(r)) + '</td><td class="r" id="si-m' + r + '">' + money(incT(r) / 12) + '</td><td class="r" id="si-a' + r + '">' + money(incT(r)) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td>Total del hogar</td><td class="r" id="ih-m">' + money(incH() / 12) + '</td><td class="r" id="ih-a">' + money(incH()) + "</td></tr></tfoot></table></div>" : "";
    return secHead(3, "Ingresos de cada representante proyectados para los próximos 12 meses.") + '<p class="note wide">Escriba el valor mensual o el de 12 meses; el formulario completa el otro. Deje en blanco las fuentes que no apliquen y use “Agregar comentario” para aclarar cualquier monto.</p>' + b + sum;
  }
  function vGas() {
    var q = r2full() ? sub("5.1", "Hogar") + radios("home", "¿Los dos representantes viven en el mismo hogar?", [{ v: "one", t: "Sí, comparten un mismo hogar" }, { v: "two", t: "No, cada uno tiene su propio hogar", s: "Cada representante declara los gastos de su hogar." }]) : "";
    var b = "", base = r2full() ? 2 : 1;
    if (!r2full() || V("home")) {
      for (var h = 1; h <= homes(); h++) {
        b += sub("5." + (base + h - 1), homes() === 1 ? "Gastos del hogar" : "Gastos del hogar de " + esc(who(h))) + (ERR["h" + h] ? '<div class="errmsg" id="e-h' + h + '" style="margin-bottom:8px">' + esc(ERR["h" + h]) + "</div>" : "") + moneyTable("h" + h + "_", cats("expense"), "Gastos del hogar " + h);
      }
    }
    if (b && homes() === 2) {
      b += sub("5.4", "Total de gastos de los hogares") + '<div class="tw"><table class="money sumt"><thead><tr><th>Hogar</th><th class="r">Mensual</th><th class="r">Próximos 12 meses</th></tr></thead><tbody>' +
        [1, 2].map(function (h) { return "<tr><td>Hogar de " + esc(who(h)) + '</td><td class="r" id="se-m' + h + '">' + money(expT(h) / 12) + '</td><td class="r" id="se-a' + h + '">' + money(expT(h)) + "</td></tr>"; }).join("") +
        '</tbody><tfoot><tr><td>Total</td><td class="r" id="eh-m">' + money(expH() / 12) + '</td><td class="r" id="eh-a">' + money(expH()) + "</td></tr></tfoot></table></div>";
    }
    return secHead(4, "Gastos esperados en los próximos 12 meses. No incluya la pensión de ReinventED.") + '<p class="note wide"><b>Nota.</b> No se pregunta por educación para evitar duplicar la pensión del mismo estudiante. La pensión de otro hijo en otra institución o la universidad se registra en “Otros gastos”.</p>' + q + b;
  }
  function docsFor(r) {
    return docs().filter(function (d) {
      if (d.cond === "dep") return V("r" + r + "_qdep") === "si";
      var q = V("r" + r + "_qruc");
      if (d.cond === "rucp") return q === "per" || q === "amb";
      if (d.cond === "ruce") return q === "emp" || q === "amb";
      if (d.cond === "veh") return N("r" + r + "_veh") > 0;
      return true;
    });
  }
  function docKeys() { var k = []; reps().forEach(function (r) { docsFor(r).forEach(function (d) { k.push(r + "_" + d.id); }); }); return k; }
  function docOf(key) { return docs().filter(function (d) { return d.id === String(key).slice(2); })[0]; }
  function allowsNa(doc) {
    if (!doc) return true;
    var title = String(doc.t || "").toLowerCase();
    if (doc.fileRequired || doc.id === "banco" || doc.id === "buro") return false;
    if (title.indexOf("estados de cuenta bancarios") >= 0 || title.indexOf("certificado crediticio") >= 0) return false;
    return true;
  }
  function dStat(key) {
    if ((S.files[key] || []).length) return "ok";
    if (allowsNa(docOf(key)) && (S.na[key] || {}).on) return "na";
    return "miss";
  }
  function vDoc() {
    var h = "";
    reps().forEach(function (r, ri) {
      h += sub("6." + (ri + 1), "Documentos de " + esc(who(r))) + '<div class="tw"><table class="docs"><thead><tr><th>N.º</th><th>Documento</th><th>Estado</th><th class="r">Acción</th></tr></thead><tbody>' +
        docsFor(r).map(function (d, i) {
          var key = r + "_" + d.id, st = dStat(key), fs = S.files[key] || [], na = S.na[key] || {};
          var stTxt = st === "ok" ? fs.length + (fs.length > 1 ? " archivos" : " archivo") : st === "na" ? "No lo tiene" : "Pendiente";
          return '<tr class="' + (ERR["d" + key] ? "bad" : "") + '" data-drop="' + key + '"><td>' + (i + 1) + "</td><td><b style=\"font-weight:600\">" + esc(d.t) + '</b><div class="hint">' + esc(d.p) + ". " + esc(d.h) + "</div>" +
            (fs.length ? '<ul class="flist">' + fs.map(function (f, j) { return "<li><span>" + esc(f.name) + " · " + Math.max(1, Math.round(f.size / 1024)) + ' KB</span><button type="button" class="x" style="padding:0" data-rmf="' + f.id + '" data-key="' + key + '" data-i="' + j + '">Quitar</button></li>'; }).join("") + "</ul>" : "") +
            (st === "na" ? '<label class="sr" for="nw-' + key + '">Motivo</label><input class="in naw" id="nw-' + key + '" data-naw="' + key + '" placeholder="Motivo (obligatorio)" required value="' + esc(na.why || "") + '">' : "") +
            (ERR["d" + key] ? '<div class="errmsg">' + esc(ERR["d" + key]) + "</div>" : "") + "</td>" +
            '<td><span class="st ' + (st === "ok" ? "ok" : st === "na" ? "na" : "miss") + '">' + stTxt + "</span></td>" +
            '<td class="act">' + (st === "na" ? "" : '<label class="btn-o">Adjuntar<input type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp" data-file="' + key + '" aria-label="Adjuntar ' + esc(d.t) + '"></label>') +
            (fs.length || !allowsNa(d) ? "" : '<button type="button" class="linkbtn" data-natog="' + key + '">' + (st === "na" ? "Adjuntar en su lugar" : "No lo tengo") + "</button>") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    });
    return secHead(5, "Solo se piden los documentos que corresponden según lo que indicó en Representantes. Adjunte cada uno. Si no lo tiene, márquelo y escriba el motivo. Los estados de cuenta bancarios y el certificado crediticio son obligatorios.") + '<p class="note wide">Formatos: PDF, JPG, PNG o WEBP, hasta 15 MB por archivo. Puede adjuntar varios archivos por documento. Los archivos quedan guardados con la solicitud.</p>' + h;
  }
  function pending() { var l = []; for (var i = 0; i < 6; i++) validate(i).forEach(function (x) { l.push({ s: i, m: x.m }); }); return l; }
  function vRev() {
    var pe = pending(), keys = docKeys();
    var up = keys.filter(function (k) { return dStat(k) === "ok"; }).length, na = keys.filter(function (k) { return dStat(k) === "na"; }).length;
    var st = function (i, rows) { return '<div class="stmt"><div class="stmt-h"><b>' + (i + 1) + ". " + STEPS[i] + '</b><button type="button" data-go="' + i + '">Modificar</button></div><dl>' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl></div>"; };
    var stu = S.stu.filter(function (x) { return x.n.trim(); }).map(function (x) { return esc(x.n) + (x.g ? ", " + esc(x.g) : ""); }).join("<br>") || "Sin registrar";
    var today = new Date().toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "long", year: "numeric" });
    var sign = function (k, whoName) { return '<div class="sign"><div class="line" id="sp-' + k + '" aria-hidden="true">' + esc(V(k)) + '</div><div class="cap">' + whoName + " · Firma electrónica · " + today + "</div>" + field(k, "Escriba su nombre completo para firmar") + "</div>"; };
    return secHead(6, "Revise la información antes de enviarla. Puede modificar cualquier sección.") +
      (pe.length ? '<div class="pend" role="alert"><b>Información pendiente (' + pe.length + ")</b><ol>" + pe.slice(0, 10).map(function (x) { return '<li><button type="button" data-go="' + x.s + '">' + esc(x.m) + '</button> <span class="hint" style="display:inline">Sección ' + (x.s + 1) + "</span></li>"; }).join("") + (pe.length > 10 ? "<li>y " + (pe.length - 10) + " más</li>" : "") + "</ol></div>" : "") +
      st(1, [["Plan al que postula", full() ? (V("plan") ? "Plan " + esc(V("plan")) : "—") : "Plan B"], ["Estudiantes", stu]]) +
      st(2, [["Representante 1", esc(V("r1_name")) || "—"], ["Contacto", (esc(V("r1_mail")) + (phoneText(1) ? "<br>" + esc(phoneText(1)) : "")) || "—"], ["Representante 2", r2full() ? (esc(V("r2_name")) || "—") : (V("r2s") === "absent" ? "No se completa: " + esc(V("r2_why") || "sin explicación") : "Sin registrar")]]) +
      st(3, reps().map(function (r) { return ["Ingresos de " + esc(who(r)) + ", mensual", money(incT(r) / 12)]; }).concat([["Total del hogar, mensual", money(incH() / 12)], ["Total del hogar, 12 meses", money(incH())]])) +
      st(4, (homes() === 2 ? [1, 2].map(function (h) { return ["Hogar de " + esc(who(h)) + ", mensual", money(expT(h) / 12)]; }) : []).concat([["Total de gastos, mensual", money(expH() / 12)], ["Total de gastos, 12 meses", money(expH())]])) +
      st(5, [["Adjuntos", up], ["Marcados “No lo tengo”", na], ["Pendientes", keys.length - up - na]]) +
      sub("7.1", "Firmas") + '<p class="note">Con su firma, cada representante declara que la información es veraz y completa y autoriza su tratamiento conforme a la sección 1.</p><div class="signs">' + sign("sig1", "Representante 1") + (r2full() ? sign("sig2", "Representante 2") : "") + "</div>";
  }
  function vDone() {
    var stu = S.stu.filter(function (x) { return x.n.trim(); }).map(function (x) { return esc(x.n) + (x.g ? ", " + esc(x.g) : ""); }).join("<br>");
    return '<p class="kicker">Constancia</p><h1>Postulación recibida</h1><p class="lead">La información es confidencial. Conserve el número de postulación para cualquier consulta.</p>' +
      '<div class="const"><div class="const-h"><span>Constancia de recepción</span><b>' + esc(S.reference) + "</b></div><dl><dt>Fecha y hora</dt><dd>" + esc(S.submittedAtLabel) + "</dd><dt>Representante</dt><dd>" + esc(V("r1_name")) + "</dd><dt>Estudiantes</dt><dd>" + stu + "</dd><dt>Plan al que postula</dt><dd>Plan " + esc(full() ? V("plan") : "B") + "</dd><dt>Formulario</dt><dd>" + esc(formCode()) + " · Año lectivo " + esc(S.year || CFG.year) + "</dd></dl></div>" +
      sub("", "Próximos pasos") + '<ol class="next">' +
      "<li><div><b>Revisión</b>Se verifica que el expediente esté completo. Si falta algo, le contactaremos por correo o WhatsApp.</div></li>" +
      "<li><div><b>Respuesta</b>" + esc(whenText()) + "</div></li>" +
      "<li><div><b>Asignación por escrito</b>Le comunicaremos el plan asignado, la etapa, la pensión mensual del año lectivo, la vigencia del plan y el plazo para aceptar.</div></li>" +
      "<li><div><b>Aceptación</b>Tendrá " + esc(CFG.deadlines.acceptDays) + " días calendario para aceptar y pagar la matrícula. Vencido ese plazo, la asignación caduca y el cupo queda liberado.</div></li>" +
      "<li><div><b>Reconsideración</b>Puede pedir una única reconsideración por escrito dentro de los " + esc(CFG.deadlines.reconsiderationBusinessDays) + " días hábiles siguientes a la notificación, con información nueva o no considerada.</div></li></ol>";
  }

  function mailOk(value) {
    var text = String(value || "").trim();
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(text) && text.indexOf("..") < 0;
  }
  function celOk(value, storedCode) {
    var digits = String(value || "").replace(/\D/g, "");
    if (dialCode(storedCode) === "593") return /^9\d{8}$/.test(digits);
    return digits.length >= 6 && digits.length <= 14;
  }
  function celMsg(storedCode, filled) {
    if (!filled) return "";
    return dialCode(storedCode) === "593" ? "Escriba un celular de 9 dígitos que empiece con 9." : "Escriba el número de celular, entre 6 y 14 dígitos.";
  }
  function validate(i) {
    var e = [], need = function (k, m) { var v = V(k); if (v === "" || v === false) e.push({ k: k, m: m }); };
    if (i === 0) need("auth", "Acepte la autorización de datos.");
    if (i === 1) {
      S.stu.forEach(function (s, j) {
        if (!s.n.trim()) e.push({ k: "stu" + j, m: "Nombres y apellidos del estudiante " + (j + 1) + "." });
        if (!s.g) e.push({ k: "stug" + j, m: "Grado del estudiante " + (j + 1) + "." });
      });
      if (full()) need("plan", "Plan al que postula.");
      need("decl", "Acepte la declaración de veracidad.");
    }
    if (i === 2) {
      need("r1_name", "Nombres y apellidos del representante 1.");
      need("r1_rel", "Relación del representante 1 con el estudiante.");
      if (!mailOk(V("r1_mail"))) e.push({ k: "r1_mail", m: V("r1_mail") ? "Escriba un correo válido, por ejemplo nombre@correo.com." : "Correo electrónico del representante 1." });
      if (!celOk(V("r1_tel"), V("r1_cc"))) e.push({ k: "r1_tel", m: V("r1_tel") ? celMsg(V("r1_cc"), true) : "WhatsApp del representante 1." });
      need("r1_qdep", "Indique si el representante 1 trabaja en relación de dependencia.");
      need("r1_qruc", "Indique si el representante 1 tiene RUC.");
      need("r2s", "Situación del representante 2.");
      if (r2full()) {
        need("r2_name", "Nombres y apellidos del representante 2.");
        need("r2_rel", "Relación del representante 2 con el estudiante.");
        if (V("r2_mail") && !mailOk(V("r2_mail"))) e.push({ k: "r2_mail", m: "Escriba un correo válido, por ejemplo nombre@correo.com." });
        if (V("r2_tel") && !celOk(V("r2_tel"), V("r2_cc"))) e.push({ k: "r2_tel", m: celMsg(V("r2_cc"), true) });
        need("r2_qdep", "Indique si el representante 2 trabaja en relación de dependencia.");
        need("r2_qruc", "Indique si el representante 2 tiene RUC.");
      } else if (V("r2s") && !String(V("r2_why")).trim()) e.push({ k: "r2_why", m: "Explicación de la situación del representante 2." });
    }
    if (i === 4) {
      if (r2full()) need("home", "Indique si los representantes comparten hogar.");
      if (!r2full() || V("home")) for (var h = 1; h <= homes(); h++) if (!expT(h)) e.push({ k: "h" + h, m: "Registre al menos un gasto" + (homes() > 1 ? " del hogar de " + who(h) : "") + "." });
    }
    if (i === 5) docKeys().forEach(function (k) {
      var d = docOf(k);
      var name = (d ? d.t : "documento") + (r2full() ? " (" + who(+k.charAt(0)) + ")" : "");
      var st = dStat(k);
      if (!allowsNa(d)) {
        if (st !== "ok") e.push({ k: "d" + k, m: "Adjunte: " + name + "." });
        return;
      }
      if (st === "miss") e.push({ k: "d" + k, m: "Adjunte o marque “No lo tengo”: " + name + "." });
      if (st === "na" && !String((S.na[k] || {}).why || "").trim()) e.push({ k: "d" + k, m: "Escriba el motivo por el que no tiene: " + name + "." });
    });
    if (i === 6) { need("sig1", "Firma del representante 1."); if (r2full()) need("sig2", "Firma del representante 2."); }
    return e;
  }

  function render(focus) {
    paint();
    var i = S.step, m = $("#main");
    if (!CFG) { m.innerHTML = "<p>No se pudo cargar el formulario.</p>"; return; }
    m.innerHTML = i === -1 ? vIntro() : i === 7 ? vDone() : [vAut, vSol, vReps, vInc, vGas, vDoc, vRev][i]();
    var inForm = i >= 0 && i <= 6;
    $("#toc").hidden = !inForm;
    $("#mprog").hidden = !inForm;
    if (inForm) {
      $("#toc").innerHTML = STEPS.map(function (t, j) {
        var c = j < i ? "done" : j === i ? "cur" : "";
        var inner = '<span class="n">' + (j + 1) + ".</span>" + t;
        return j < i ? '<button type="button" class="' + c + '" data-go="' + j + '">' + inner + "</button>" : '<span class="' + c + '"' + (j === i ? ' aria-current="step"' : "") + ">" + inner + "</span>";
      }).join("");
      $("#mprog").innerHTML = "Sección <b>" + (i + 1) + " de " + STEPS.length + "</b> · " + STEPS[i] + '<div class="bar"><i style="width:' + ((i + 1) / STEPS.length * 100) + '%"></i></div>';
    }
    $("#back").hidden = i < 0 || i === 7;
    $("#next").textContent = i === -1 ? "Iniciar solicitud" : i === 6 ? "Firmar y enviar" : i === 7 ? "Nueva solicitud" : S.back ? "Volver a la revisión" : "Guardar y continuar";
    $("#next").disabled = S.busy;
    $("#dock").hidden = i === -1 && !!hold;
    if (focus) {
      window.scrollTo(0, 0);
      var t = $("#stepTitle") || $("h1", m);
      if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
    }
  }
  function go(i) { ERR = {}; S.serverErrors = []; S.step = i; render(true); save(); }

  function showErr(list) {
    ERR = {};
    list.forEach(function (x) { if (!ERR[x.k]) ERR[x.k] = x.m; });
    render(false);
    var f = $(".secerr");
    if (f) f.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function startNew() {
    S.busy = true;
    render(false);
    var res = await fetch("/api/solicitudes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pick.code })
    });
    var data = await res.json();
    S.busy = false;
    if (!res.ok) { $("#saved").textContent = data.error || "No se pudo iniciar"; render(false); return; }
    hold = null;
    var token = data.token;
    S = blank();
    S.id = data.id;
    S.token = token;
    S.variant = data.variant;
    S.formCode = data.formCode;
    S.year = data.year;
    S.status = "borrador";
    S.step = 0;
    CFG = data.config;
    localStorage.setItem(draftKey(), JSON.stringify({ id: S.id, token: S.token }));
    render(true);
  }

  function applyHold(step) {
    S = blank();
    S.id = hold.id;
    S.token = hold.token;
    S.d = hold.d || {};
    S.na = hold.na || {};
    S.stu = hold.stu && hold.stu.length ? hold.stu : [{ n: "", g: "" }];
    S.files = hold.files || {};
    S.status = hold.status;
    S.reference = hold.reference;
    S.reviewNote = hold.reviewNote;
    S.submittedAtLabel = hold.submittedAtLabel;
    S.variant = hold.variant;
    S.formCode = hold.formCode;
    S.year = hold.year;
    CFG = hold.config || CFG;
    S.step = step;
    render(true);
  }

  $("#next").addEventListener("click", async function () {
    if (S.busy) return;
    var i = S.step;
    if (i === -1) { await startNew(); return; }
    if (i === 7) {
      localStorage.removeItem(draftKey());
      hold = null;
      S = blank();
      render(true);
      return;
    }
    if (i === 6) {
      if (pending().length) { render(false); var p = $(".pend"); if (p) p.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
      var e6 = validate(6);
      if (e6.length) { showErr(e6); return; }
      S.busy = true;
      $("#next").disabled = true;
      var res = await fetch("/api/solicitudes/" + S.id + "/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: S.token, step: 6, d: S.d, na: S.na, stu: S.stu })
      });
      var data = await res.json();
      S.busy = false;
      if (!res.ok) { S.serverErrors = data.details || [data.error || "No se pudo enviar"]; render(false); return; }
      S.status = data.status;
      S.reference = data.reference;
      S.submittedAtLabel = data.submittedAtLabel;
      S.year = data.year;
      S.formCode = data.formCode;
      S.step = 7;
      render(true);
      return;
    }
    var e = validate(i);
    if (e.length) { showErr(e); return; }
    if (S.back) { S.back = false; go(6); return; }
    go(i + 1);
  });
  $("#back").addEventListener("click", function () { S.back = false; go(S.step - 1); });
  $("#toc").addEventListener("click", function (ev) { var b = ev.target.closest("[data-go]"); if (b) { S.back = false; go(+b.getAttribute("data-go")); } });

  var main = $("#main");
  function clr(t, k) {
    if (ERR[k]) { delete ERR[k]; var f = t.closest(".bad"); if (f) f.classList.remove("bad"); t.classList.remove("bad"); var m = $("#e-" + k); if (m) m.remove(); }
  }
  function setT(id, v) { var el = $("#" + id); if (el) el.textContent = money(v); }
  function totals() {
    [1, 2].forEach(function (n) {
      setT("ta-r" + n + "_", incT(n)); setT("tm-r" + n + "_", incT(n) / 12);
      setT("ta-h" + n + "_", expT(n)); setT("tm-h" + n + "_", expT(n) / 12);
      setT("si-a" + n, incT(n)); setT("si-m" + n, incT(n) / 12);
      setT("se-a" + n, expT(n)); setT("se-m" + n, expT(n) / 12);
    });
    setT("ih-a", incH()); setT("ih-m", incH() / 12); setT("eh-a", expH()); setT("eh-m", expH() / 12);
  }
  main.addEventListener("beforeinput", function (ev) {
    var t = ev.target;
    if (!t.hasAttribute || !t.hasAttribute("data-tel") || ev.inputType !== "insertText" || !ev.data) return;
    if (/\D/.test(ev.data)) ev.preventDefault();
  });
  main.addEventListener("input", function (ev) {
    var t = ev.target, k = t.getAttribute("data-k");
    if (k && !t.hasAttribute("data-re") && !t.hasAttribute("data-chk")) {
      if (t.hasAttribute("data-int")) t.value = t.value.replace(/\D/g, "").slice(0, 2);
      if (t.hasAttribute("data-tel")) t.value = cleanTel(t.value, S.d[k.replace(/_tel$/, "_cc")]);
      S.d[k] = t.value;
      var kp = t.getAttribute("data-kid");
      if (kp) { var ko = $("#kt-" + kp); if (ko) ko.value = N(kp + "kg") + N(kp + "kc") + N(kp + "ku"); }
      clr(t, k);
      if (k === "sig1" || k === "sig2") { var sp = $("#sp-" + k); if (sp) sp.textContent = t.value; }
      save();
    }
    var mk = t.getAttribute("data-mon") || t.getAttribute("data-ann");
    if (mk) {
      var isMon = t.hasAttribute("data-mon"), dg = t.value.replace(/\D/g, "").slice(0, 9), n = dg ? +dg : 0;
      t.value = dg ? fmt(n) : "";
      S.d[mk] = dg ? (isMon ? n * 12 : n) : "";
      var other = isMon ? $("#a-" + mk) : $("#m-" + mk);
      if (other) other.value = dg ? fmt(isMon ? n * 12 : n / 12) : "";
      totals();
      var hk = mk.slice(0, 2);
      if (ERR[hk] && expT(+hk.charAt(1))) { delete ERR[hk]; var em2 = $("#e-" + hk); if (em2) em2.remove(); }
      save();
    }
    var si = t.getAttribute("data-stu");
    if (si != null) { S.stu[+si][t.getAttribute("data-p")] = t.value; clr(t, (t.getAttribute("data-p") === "n" ? "stu" : "stug") + si); save(); }
    var nw = t.getAttribute("data-naw");
    if (nw) {
      S.na[nw] = S.na[nw] || {};
      S.na[nw].why = t.value;
      if (String(t.value || "").trim()) {
        delete ERR["d" + nw];
        var row = t.closest("tr");
        if (row) row.classList.remove("bad");
        var msg = row && row.querySelector(".errmsg");
        if (msg) msg.remove();
      }
      save();
    }
  });
  main.addEventListener("change", async function (ev) {
    var t = ev.target, k = t.getAttribute("data-k");
    if (t.hasAttribute("data-cc")) { S.d[k] = t.value; delete ERR[k.replace(/_cc$/, "_tel")]; render(false); save(); return; }
    if (t.tagName === "SELECT" && t.hasAttribute("data-stu") && S.step === 1) { S.stu[+t.getAttribute("data-stu")].g = t.value; render(false); save(); return; }
    if (t.hasAttribute("data-re")) { S.d[k] = t.value; delete ERR[k]; render(false); save(); return; }
    if (t.hasAttribute("data-chk")) { S.d[k] = t.checked; delete ERR[k]; render(false); save(); return; }
    var fk = t.getAttribute("data-file");
    if (fk && t.files.length) await addFiles(fk, t.files);
  });
  main.addEventListener("click", async function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "resume") { applyHold(hold.status === "incompleta" ? 6 : Math.min(Math.max(hold.step, 0), 6)); return; }
    if (b.id === "viewLast") { applyHold(7); return; }
    if (b.id === "fresh") { localStorage.removeItem(draftKey()); hold = null; S = blank(); render(false); return; }
    if (b.id === "restart") {
      if (hold) await fetch("/api/solicitudes/" + hold.id + "?token=" + encodeURIComponent(hold.token), { method: "DELETE" });
      localStorage.removeItem(draftKey());
      hold = null;
      render(false);
      return;
    }
    if (b.id === "addStu") { S.stu.push({ n: "", g: "" }); render(false); var n = $("#sn" + (S.stu.length - 1)); if (n) n.focus(); save(); return; }
    if (b.hasAttribute("data-rm")) { S.stu.splice(+b.getAttribute("data-rm"), 1); render(false); save(); return; }
    if (b.hasAttribute("data-rmf")) { await removeUploaded(b.getAttribute("data-key"), +b.getAttribute("data-rmf"), +b.getAttribute("data-i")); return; }
    if (b.hasAttribute("data-cm")) { var ck = b.getAttribute("data-cm"); S.cm = S.cm || {}; S.cm[ck] = 1; render(false); var ci = $("#c-" + ck); if (ci) ci.focus(); return; }
    if (b.hasAttribute("data-natog")) {
      var nk = b.getAttribute("data-natog");
      S.na[nk] = S.na[nk] || {};
      S.na[nk].on = !S.na[nk].on;
      delete ERR["d" + nk];
      render(false);
      save();
      var w = $("#nw-" + nk);
      if (w) w.focus();
      return;
    }
    if (b.hasAttribute("data-go")) { S.back = S.step === 6; go(+b.getAttribute("data-go")); }
  });
  ["dragenter", "dragover"].forEach(function (n) {
    main.addEventListener(n, function (ev) { var r = ev.target.closest("[data-drop]"); if (r) { ev.preventDefault(); r.classList.add("drag"); } });
  });
  ["dragleave", "drop"].forEach(function (n) {
    main.addEventListener(n, function (ev) {
      var r = ev.target.closest("[data-drop]");
      if (!r) return;
      ev.preventDefault();
      r.classList.remove("drag");
      if (n === "drop" && ev.dataTransfer && ev.dataTransfer.files.length) addFiles(r.getAttribute("data-drop"), ev.dataTransfer.files);
    });
  });

  async function addFiles(k, list) {
    var fd = new FormData();
    fd.append("token", S.token);
    fd.append("key", k);
    Array.prototype.forEach.call(list, function (f) { fd.append("files", f); });
    var res = await fetch("/api/solicitudes/" + S.id + "/archivos", { method: "POST", body: fd });
    var data = await res.json();
    if (!res.ok) { $("#saved").textContent = data.error || "No se pudo adjuntar"; return; }
    S.files[k] = data.files;
    if (S.na[k]) S.na[k].on = false;
    delete ERR["d" + k];
    render(false);
    save();
  }
  async function removeUploaded(key, id) {
    await fetch("/api/solicitudes/" + S.id + "/archivos/" + id + "?token=" + encodeURIComponent(S.token), { method: "DELETE" });
    S.files[key] = (S.files[key] || []).filter(function (f) { return f.id !== id; });
    render(false);
  }
  function showGate(message) {
    $("#dock").hidden = true;
    $("#toc").hidden = true;
    $("#mprog").hidden = true;
    $("#schoolName").textContent = "";
    $("#campus").textContent = "Admisiones";
    $("#fcode").textContent = "FORMULARIO";
    $("#yearLine").textContent = "";
    $("#foot").textContent = "";
    $("#main").innerHTML = '<p class="kicker">Admisiones</p><h1>Este formulario se abre con el enlace del colegio</h1><p class="lead">' + esc(message) + "</p>";
  }

  var lf;
  var helpClosing = false;
  function openH() {
    var d = $("#drawer");
    lf = document.activeElement;
    helpClosing = false;
    d.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add("open"); }); });
    $("#helpClose").focus();
  }
  function closeH() {
    var d = $("#drawer");
    if (d.hidden || helpClosing) return;
    helpClosing = true;
    d.classList.remove("open");
    var panel = $(".panel", d);
    var finish = function () {
      if (d.hidden) return;
      d.hidden = true;
      helpClosing = false;
      if (lf) lf.focus();
    };
    panel.addEventListener("transitionend", function onEnd(e) {
      if (e.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onEnd);
      finish();
    });
    setTimeout(finish, 420);
  }
  $("#helpOpen").onclick = openH;
  $("#helpClose").onclick = closeH;
  $("#drawer").addEventListener("click", function (e) { if (e.target.id === "drawer") closeH(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#drawer").hidden) closeH(); });

  async function boot() {
    var code = new URLSearchParams(location.search).get("f") || "";
    if (!code) {
      showGate("Admisiones le enviará un enlace. Ese enlace abre el formulario del colegio y de los planes que corresponden a su familia.");
      return;
    }
    var linkRes = await fetch("/api/publico/enlace?f=" + encodeURIComponent(code));
    if (!linkRes.ok) {
      showGate("Este enlace no corresponde a una postulación. Use el enlace que le envió el colegio.");
      return;
    }
    var link = await linkRes.json();
    pick.code = link.code;
    pick.school = link.school;
    pick.variant = link.variant;
    var cfgRes = await fetch("/api/publico/config?school=" + encodeURIComponent(pick.school));
    CFG = cfgRes.ok ? await cfgRes.json() : null;
    if (!CFG) { showGate("No se pudo cargar el formulario de este colegio."); return; }
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { saved = null; }
    if (saved && saved.id && saved.token) {
      var res = await fetch("/api/solicitudes/" + saved.id + "?token=" + encodeURIComponent(saved.token));
      if (res.ok) {
        hold = await res.json();
        hold.token = saved.token;
        if (hold.school !== pick.school || hold.variant !== pick.variant) {
          hold = null;
          localStorage.removeItem(draftKey());
        }
      } else localStorage.removeItem(draftKey());
    }
    render(false);
  }
  $("#dock").hidden = true;
  boot();
})();
