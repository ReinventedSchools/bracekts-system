export const DEFAULT_INCOME = [
  { id: "dep", label: "Relación de dependencia", hint: "Sueldo, décimos, bonos y utilidades del empleo." },
  { id: "hon", label: "Honorarios profesionales", hint: "Servicios profesionales facturados." },
  { id: "reg", label: "Regalías o utilidades", hint: "Utilidades de empresa propia, participaciones, regalías." },
  { id: "otr", label: "Otras fuentes", hint: "Arriendos, pensión alimenticia recibida, jubilación, inversiones, aportes de familiares." }
];

export const DEFAULT_EXPENSE = [
  { id: "ali", label: "Alimentación", hint: "Supermercado, restaurantes, pensiones alimenticias pagadas." },
  { id: "deu", label: "Créditos y deudas", hint: "Solo cuotas a pagar en los próximos 12 meses, no el saldo total. Ejemplo: hipoteca de $200.000 con cuota de $1.500 mensuales." },
  { id: "viv", label: "Vivienda", hint: "Arriendo, alícuotas, servicios básicos, impuesto predial." },
  { id: "sal", label: "Salud", hint: "Seguros, medicinas, consultas." },
  { id: "vhc", label: "Vehículos", hint: "Matrícula, seguro, combustible, mantenimiento." },
  { id: "ves", label: "Vestimenta", hint: "Ropa y calzado." },
  { id: "ent", label: "Entretenimiento y viajes", hint: "Viajes, salidas, deporte." },
  { id: "otg", label: "Otros gastos", hint: "Pensión de otro hijo en otra institución, universidad u otros." }
];

export const DEFAULT_DOCS = [
  { id: "iess", t: "Mecanizado del IESS", p: "Últimos 12 meses", h: "Se descarga del portal del IESS.", cond: "dep", full: 0 },
  { id: "renta", t: "Declaración de impuesto a la renta", p: "Último año fiscal", h: "Se descarga de SRI en línea.", cond: "all", full: 0 },
  { id: "iva", t: "Declaraciones de IVA del RUC personal", p: "Últimos 12 meses", h: "Se descargan de SRI en línea.", cond: "rucp", full: 0 },
  { id: "ivae", t: "Declaraciones de IVA de la empresa propia", p: "Últimos 12 meses", h: "Se descargan de SRI en línea con el RUC de la empresa.", cond: "ruce", full: 0 },
  { id: "banco", t: "Estados de cuenta bancarios", p: "Últimos 3 meses", h: "De todas las cuentas.", cond: "all", full: 1, fileRequired: 1 },
  { id: "tc", t: "Estados de cuenta de tarjetas de crédito", p: "Últimos 3 meses", h: "De todas las tarjetas.", cond: "all", full: 1 },
  { id: "buro", t: "Certificado crediticio", p: "A la fecha", h: "Equifax u otra central de riesgo.", cond: "all", full: 1, fileRequired: 1 },
  { id: "veh", t: "Matrícula vehicular", p: "Vigente", h: "Una por cada vehículo propio.", cond: "veh", full: 0 }
];

export const STAGES = ["Nest", "Prekínder", "Kínder", "Regular"];

export const GRADES = [
  ["Nest", "Nest"],
  ["Prekínder", "Prekínder"],
  ["Kínder", "Kínder"],
  ["1.º grado", "Regular"],
  ["2.º grado", "Regular"],
  ["3.º grado", "Regular"],
  ["4.º grado", "Regular"],
  ["5.º grado", "Regular"],
  ["6.º grado", "Regular"],
  ["7.º grado", "Regular"],
  ["8.º grado", "Regular"],
  ["9.º grado", "Regular"],
  ["10.º grado", "Regular"],
  ["11.º grado", "Regular"],
  ["12.º grado", "Regular"]
];

export const PLANS = [
  { code: "A", name: "Plan A", sort: 1, variant: "none" },
  { code: "B", name: "Plan B", sort: 2, variant: "short" },
  { code: "C", name: "Plan C", sort: 3, variant: "full" },
  { code: "D", name: "Plan D", sort: 4, variant: "full" },
  { code: "E", name: "Plan E", sort: 5, variant: "full" }
];

export const PRICE_TABLE = {
  Nest: { A: 450, B: 405, C: 360, D: 315, E: 270 },
  Prekínder: { A: 530, B: 477, C: 424, D: 371, E: 318 },
  Kínder: { A: 590, B: 531, C: 472, D: 413, E: 354 },
  Regular: { A: 660, B: 594, C: 528, D: 462, E: 396 }
};

export const EXAMPLE_METRICS = [
  { plan: "E", min: 0, max: 1800 },
  { plan: "D", min: 1801, max: 2800 },
  { plan: "C", min: 2801, max: 4200 },
  { plan: "B", min: 4201, max: 8000 },
  { plan: "A", min: 8001, max: null }
];

export const RELATIONSHIPS = ["Madre", "Padre", "Representante legal"];

export const STATUSES = [
  ["borrador", "Borrador"],
  ["enviada", "Enviada"],
  ["en_revision", "En revisión"],
  ["incompleta", "Incompleta"],
  ["en_comite", "En comité"],
  ["asignada", "Plan asignado"],
  ["aceptada", "Aceptada"],
  ["no_admitida", "No admitida"],
  ["caducada", "Caducada"],
  ["reconsideracion", "Reconsideración"]
];

export function statusLabel(code) {
  return (STATUSES.find((s) => s[0] === code) || [code, code])[1];
}
