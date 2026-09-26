import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import {
  RANGOS, CLASES, STAT_KEYS, STAT_LABEL, MEMORIA_SLOTS, ESTADOS, PERFILES_HABILIDAD, TIPOS_ARMA,
  fichaNueva, derivar, poolDe, interferencia, tirar, TEXTO_LECTURA, fichaMob, danoContra,
  estadoVivo, clamp, uid, mobInstancia, roundUp, formaNueva, efectoNuevo,
  statsEfectivas, formaActivaDe, TIPOS_EFECTO, efectoHabNuevo, habilidadNueva,
  costoHabilidad, costeDe, COSTO_PCT, PCT_EMPUJE, PCT_ESQUIVA, topeCuracion,
  TIPOS_PASIVA, pasivaNueva, memoriaHabNueva, dadosExtraDe, MODOS_CURACION as _MC,
  mobEfectivo, hojaResumen, CONDICIONES, condicionCumplida, danoBaseArma, ROTURAS_INVIS,
  TAGS, TIPOS_RASGO, rasgoNuevo, efectoRasgoNuevo, bonosDeRasgos, retratoDe, GRUPOS_EFECTO,
  ecoDesdeMob, costeEco, topeEcos,
  movimientoDe, tirarIniciativa, ordenarIniciativa, distanciaCasillas,
  ALCANCE_INTERPONER, ALCANCE_EMPUJAR, TIPOS_ACCION, habilidadMobNueva, movimientoMob,
  multDeHabilidadMob, esOfensivaMob,
  DISPAROS, efectoAplica,
  MODOS_CURACION, curar, ESTADOS as LISTA_ESTADOS,
} from "./sistema.js";

const MOTIVACIONES = [
  "Ver a mis amados otra vez",
  "Escapar del Abismo",
  "Saber por qué la humanidad fue atrapada",
  "Encontrar al emperador que me exilió",
  "Historias más allá de los registros",
  "Salvar el mundo, o destruirlo",
];

const CANAL = "cancion-de-los-caidos/tirada";
const CLAVE_META = "cancion-de-los-caidos/estado";
const CLAVE_MOBS = "cancion-de-los-caidos/mobs";
const CLAVE_ORDENES = "cancion-de-los-caidos/ordenes";
const CLAVE_ATAQUES = "cancion-de-los-caidos/ataques";
const CLAVE_HOJAS = "cancion-de-los-caidos/hojas";
const CLAVE_EDICION = "cancion-de-los-caidos/edicion";
const CLAVE_TURNOS = "cancion-de-los-caidos/turnos";
const LS = "cdlc-ext-ficha";
let idUsuario = null;      // identidad de la cuenta de Owlbear
let bestiario = [];        // plantillas de mobs guardadas (locales del DM)

let ficha = null;         // ficha completa, local
let party = {};           // estado vivo de todos, sincronizado
let mobs = {};            // mobs del encuentro, sincronizados
let miRol = "PLAYER";
let tab = "ficha";
let ultimaTirada = null;
let bestRango = 0, bestClase = 0;
let dentroDeOwlbear = false;
let ordenes = {};          // ajustes que el DM manda a cada ficha
let ataques = {};          // golpes pendientes de reacción
let hojas = {};            // fichas completas resumidas, para el DM
let edicion = {};          // fichas completas cedidas temporalmente al DM
let modoEdicion = null;    // { id, nombre, miFicha } mientras el DM edita a otro
let esperandoFicha = null; // id cuya ficha he pedido
let turnos = null;         // { orden:[...], indice, ronda } o null si no hay combate
let piezas = [];           // fichas del tablero
let dpi = 150;             // píxeles por casilla de la escena
let escalaTexto = "";      // p. ej. "3m"
const META_PIEZA = "cancion-de-los-caidos/pieza";   // datos que guardamos dentro de cada ficha

const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- persistencia local ----------
function claveLocal() {
  return idUsuario ? `${LS}:${idUsuario}` : LS;
}
function claveBestiario() {
  return idUsuario ? `cdlc-ext-bestias:${idUsuario}` : "cdlc-ext-bestias";
}
function cargarBestiario() {
  try {
    const raw = localStorage.getItem(claveBestiario()) || localStorage.getItem("cdlc-ext-bestias");
    bestiario = raw ? JSON.parse(raw) : [];
  } catch (_) { bestiario = []; }
}
function guardarBestiario() {
  try { localStorage.setItem(claveBestiario(), JSON.stringify(bestiario)); } catch (_) {}
}
function guardarPlantilla(m) {
  const base = (m.nombre || "").replace(/\s+\d+$/, "").trim() || "Sin nombre";
  const plantilla = {
    id: uid(), nombre: base, rango: m.rango, clase: m.clase, imagen: m.imagen || "",
    tags: (m.tags || []).slice(),
    pasivas: JSON.parse(JSON.stringify(m.pasivas || [])),
    habilidades: JSON.parse(JSON.stringify(m.habilidades || [])),
  };
  const i = bestiario.findIndex((x) => x.nombre === base);
  if (i >= 0) bestiario[i] = { ...plantilla, id: bestiario[i].id };
  else bestiario.push(plantilla);
  guardarBestiario();
}
async function soltarPlantilla(id, veces) {
  const p = bestiario.find((x) => x.id === id);
  if (!p) return;
  const base = p.nombre;
  let usados = Object.values(mobs)
    .filter((x) => (x.nombre || "").replace(/\s+\d+$/, "").trim() === base).length;
  const sig = { ...mobs };
  for (let i = 0; i < (veces || 1); i++) {
    usados += 1;
    const m = mobInstancia(p.rango, p.clase, `${base} ${usados}`);
    m.pasivas = JSON.parse(JSON.stringify(p.pasivas || []));
    m.habilidades = JSON.parse(JSON.stringify(p.habilidades || []));
    m.tags = (p.tags || []).slice();
    m.imagen = p.imagen || "";
    sig[m.id] = m;
  }
  await guardarMobs(sig);
  anunciar(`Aparecen ${veces || 1} × ${base}`);
}

function cargarFicha() {
  let f = null;
  try {
    // primero la ficha de esta cuenta; si no hay, la antigua del navegador
    const raw = localStorage.getItem(claveLocal()) || localStorage.getItem(LS);
    if (raw) f = JSON.parse(raw);
  } catch (_) {}
  if (!f) f = fichaNueva("Mi personaje");
  // compatibilidad con fichas guardadas antes de las novedades
  (f.memorias || []).forEach((m) => { if (!m.hab) m.hab = memoriaHabNueva(); });
  (f.formas || []).forEach((fm) => {
    if (!fm.habilidades) fm.habilidades = [];
    if (!fm.pasivas) fm.pasivas = [];
  });
  if (!f.buffs) f.buffs = [];
  if (f.invulnerable == null) f.invulnerable = 0;
  return f;
}
// Si una pasiva de transformación automática se dispara, cambia de forma sola.
function revisarAutoForma() {
  const pas = (typeof derivar === "function" ? derivar(ficha).pasivas : []) || [];
  let cambio = false;
  const d = derivar(ficha);

  const autos = pas.filter((p) => p.tipo === "auto_forma" && p.forma);
  for (const p of autos) {
    if (ficha.formaActiva === p.forma) continue;
    if (condicionCumplida(p, d, ficha)) {
      const fm = (ficha.formas || []).find((x) => x.id === p.forma);
      ficha.formaActiva = p.forma;
      const d2 = derivar(ficha);
      if (ficha.pv != null) ficha.pv = clamp(ficha.pv, 0, d2.pvMax);
      anunciar(`${ficha.nombre} se transforma: ${(fm && fm.nombre) || "otra forma"}`);
      cambio = true;
      break;
    }
  }

  // pasivas que aplican un estado solas (p.ej. volverse Invisible al bajar de vida)
  const autosEstado = pas.filter((p) => p.tipo === "auto_estado" && p.estadoAuto);
  for (const p of autosEstado) {
    const est = p.estadoAuto;
    if ((ficha.estados || []).includes(est)) continue;
    if (condicionCumplida(p, d, ficha)) {
      ficha.estados = [...new Set([...(ficha.estados || []), est])];
      if (est === "invisible") ficha.invisModo = ficha.invisModo || "atacar";
      anunciar(`${ficha.nombre} queda ${(ESTADOS.find((x) => x.id === est) || {}).label || est} automáticamente.`);
      cambio = true;
    }
  }
  return cambio;
}

// Lo mismo, pero para una criatura del Bestiario (solo el DM lo dispara).
function revisarAutoEstadoMob(m) {
  const autos = (m.pasivas || []).filter((p) => p.tipo === "auto_estado" && p.estadoAuto);
  if (!autos.length) return null;
  const me = mobEfectivo(m);
  const ctxFicha = { rango: m.rango, grieta: 0, estados: m.estados || [] };
  const ctxDerivado = { pv: m.pv, pvMax: me.pvMax, esencia: 0, esenciaMax: 1 };
  for (const p of autos) {
    const est = p.estadoAuto;
    if ((m.estados || []).includes(est)) continue;
    if (condicionCumplida(p, ctxDerivado, ctxFicha)) {
      const estados = [...new Set([...(m.estados || []), est])];
      return { ...m, estados };
    }
  }
  return null;
}

function guardarFicha() {
  if (modoEdicion) return;   // estoy editando la ficha de otro: no guardo la mía
  try { localStorage.setItem(claveLocal(), JSON.stringify(ficha)); } catch (_) {}
}

function guardarYRevisar() {
  if (revisarAutoForma()) { publicarEstado(); }
  guardarFicha();
}

// ---------- sincronización ----------
let pendiente = null;
async function publicarEstado() {
  if (!dentroDeOwlbear) return;
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    try {
      if (ficha._expulsado || modoEdicion) return;
      const meta = await OBR.room.getMetadata();
      const actual = (meta && meta[CLAVE_META]) || {};
      const actualH = (meta && meta[CLAVE_HOJAS]) || {};
      await OBR.room.setMetadata({
        [CLAVE_META]: { ...actual, [ficha.id]: estadoVivo(ficha) },
        [CLAVE_HOJAS]: { ...actualH, [ficha.id]: hojaResumen(ficha) },
      });
    } catch (e) { console.warn("no se pudo publicar", e); }
  }, 250);
}

async function quitarDeLaSala(id) {
  if (!dentroDeOwlbear) return;
  try {
    const meta = await OBR.room.getMetadata();
    const est = { ...((meta && meta[CLAVE_META]) || {}) };
    const hj = { ...((meta && meta[CLAVE_HOJAS]) || {}) };
    const ord = { ...((meta && meta[CLAVE_ORDENES]) || {}) };
    const nombre = (est[id] || {}).nombre || "un personaje";
    delete est[id];
    delete hj[id];
    // el aviso de expulsión hace que ese navegador deje de publicarse
    const prev = ord[id] || { seq: 0 };
    ord[id] = { expulsar: true, seq: (prev.seq || 0) + 1 };
    await OBR.room.setMetadata({ [CLAVE_META]: est, [CLAVE_HOJAS]: hj, [CLAVE_ORDENES]: ord });
    anunciar(`El DM saca a ${nombre} de la mesa.`);
  } catch (e) { console.warn(e); }
}

// El DM no puede tocar la ficha de otro directamente (vive en su navegador),
// así que deja una orden en la sala y el cliente del jugador la aplica.
function aplicarOrdenes(nuevas) {
  ordenes = nuevas || {};
  const mia = ordenes[ficha.id];
  if (!mia) return false;
  if ((ficha._ordenSeq || 0) >= mia.seq) return false;
  ficha._ordenSeq = mia.seq;
  const d = derivar(ficha);
  if (mia.pv != null) ficha.pv = clamp(mia.pv, 0, d.pvMax);
  if (mia.dPv != null) ficha.pv = clamp(d.pv + mia.dPv, 0, d.pvMax);
  if (mia.esencia != null) ficha.esencia = clamp(mia.esencia, 0, d.esenciaMax);
  if (mia.dEsencia != null) ficha.esencia = clamp(d.esencia + mia.dEsencia, 0, d.esenciaMax);
  if (mia.grieta != null) ficha.grieta = clamp(mia.grieta, 0, 3);
  if (mia.estados) {
    const teníaInvis = (ficha.estados || []).includes("invisible");
    ficha.estados = mia.estados.slice();
    if (!teníaInvis && ficha.estados.includes("invisible") && !ficha.invisModo) {
      ficha.invisModo = "atacar";
    }
  }
  if (mia.recargar) { ficha.pv = d.pvMax; ficha.esencia = d.esenciaMax; ficha.caidoFallos = 0; }
  if (mia.empiezaTurno) {
    ficha.movGastado = 0;
    ficha.reaccionUsada = false;
    ficha.accionUsada = false;
    ficha.adicionalUsada = false;
    ficha._corriendo = false;
    // punto de partida: dónde está tu ficha justo ahora
    const p0 = piezaDe(ficha.id) || piezaPorNombre(ficha.nombre);
    ficha._posTurno = p0 ? { x: p0.position.x, y: p0.position.y } : null;
    // caducan los estados de "próximo turno"
    ficha.estados = (ficha.estados || []).filter((e) => e !== "expuesto" && e !== "sellado");
    guardarFicha(); publicarEstado(); render();
    return true;
  }
  if (mia.nuevaRonda) {
    ficha.reaccionUsada = false;
    guardarFicha(); publicarEstado();
    return true;
  }
  if (mia.nuevoEco) {
    ficha.ecos = ficha.ecos || [];
    if (!ficha.ecos.some((e) => e.id === mia.nuevoEco.id)) ficha.ecos.push(mia.nuevoEco);
    guardarFicha(); publicarEstado(); render();
    return true;
  }
  if (mia.danoEco != null) {
    const e = (ficha.ecos || []).find((x) => x.id === ficha.ecoActivo);
    if (e) {
      e.pv = clamp(e.pv - mia.danoEco, 0, e.pvMax);
      if (e.pv <= 0) {
        ficha.ecos = (ficha.ecos || []).filter((x) => x.id !== e.id);
        ficha.ecoActivo = null;
        anunciar(`El Eco de ${e.nombre} se deshace para siempre.`);
      }
      guardarFicha(); publicarEstado(); render();
    }
    return true;
  }
  if (mia.pedirFicha) { cederFicha(); return true; }
  if (mia.fichaCompleta) {
    const idMio = ficha.id;
    ficha = { ...mia.fichaCompleta, id: idMio };
    (ficha.memorias || []).forEach((m) => { if (!m.hab) m.hab = memoriaHabNueva(); });
    (ficha.formas || []).forEach((fm) => {
      if (!fm.habilidades) fm.habilidades = [];
      if (!fm.pasivas) fm.pasivas = [];
    });
    guardarFicha(); publicarEstado(); render();
    return true;
  }
  if (mia.expulsar) {
    ficha._expulsado = true;
    clearTimeout(pendiente);
    guardarFicha(); render(); return true;
  }
  if (mia.limpiarBuffs) ficha.buffs = [];
  if (mia.finCombate) {
    ficha.buffs = [];
    ficha.estados = [];
    ficha.invulnerable = 0;
    (ficha.habilidades || []).forEach((h) => { h.usos = 0; });
    (ficha.formas || []).forEach((fm) => (fm.habilidades || []).forEach((h) => { h.usos = 0; }));
    (ficha.memorias || []).forEach((m) => { if (m.hab) m.hab.usos = 0; });
    ficha.caidoFallos = 0;
  }
  revisarAutoForma();
  guardarFicha();
  publicarEstado();
  return true;
}

async function mandarOrden(idFicha, cambios) {
  return mandarOrdenes({ [idFicha]: cambios });
}

// Varias órdenes a la vez: una sola escritura, para que no se pisen entre ellas.
async function mandarOrdenes(mapa) {
  if (!dentroDeOwlbear) {
    Object.entries(mapa).forEach(([id, c]) => {
      if (id === ficha.id) {
        ordenes = { ...ordenes, [id]: { ...c, seq: ((ordenes[id] || {}).seq || 0) + 1 } };
      }
    });
    aplicarOrdenes(ordenes);
    render();
    return;
  }
  try {
    const meta = await OBR.room.getMetadata();
    const act = { ...((meta && meta[CLAVE_ORDENES]) || {}) };
    Object.entries(mapa).forEach(([id, cambios]) => {
      const prev = act[id] || { seq: 0 };
      act[id] = { ...cambios, seq: (prev.seq || 0) + 1 };
    });
    await OBR.room.setMetadata({ [CLAVE_ORDENES]: act });
  } catch (e) { console.warn("orden", e); }
}

const CAMPOS_INTERNOS = ["_codigo", "_importando", "_copiado", "_mesaSel", "_mesaIn", "_dmgIn",
  "_objMob", "_habMob", "_mobAbierto", "_fichaSel", "_dmAbierta", "_tirarStat", "_empujes",
  "_tRango", "_tClase", "_objetivo", "_ataque", "_ordenSeq", "_expulsado", "_ocultarN",
  "_ocultarSel", "_ocultarModo"];

function fichaLimpia(f) {
  const c = JSON.parse(JSON.stringify(f));
  CAMPOS_INTERNOS.forEach((k) => delete c[k]);
  return c;
}

// El jugador cede su ficha completa para que el DM la edite.
async function cederFicha() {
  if (!dentroDeOwlbear) return;
  try {
    const meta = await OBR.room.getMetadata();
    const act = { ...((meta && meta[CLAVE_EDICION]) || {}) };
    act[ficha.id] = { ficha: fichaLimpia(ficha), ts: Date.now() };
    await OBR.room.setMetadata({ [CLAVE_EDICION]: act });
  } catch (e) { console.warn("ceder", e); }
}

async function limpiarEdicion(id) {
  if (!dentroDeOwlbear) return;
  try {
    const meta = await OBR.room.getMetadata();
    const act = { ...((meta && meta[CLAVE_EDICION]) || {}) };
    delete act[id];
    await OBR.room.setMetadata({ [CLAVE_EDICION]: act });
  } catch (e) { console.warn(e); }
}

// ---------- el tablero ----------
// Cada ficha del tablero puede llevar dentro a quién representa.
function vinculoDe(p) {
  const m = p.metadata && p.metadata[META_PIEZA];
  return m || null;
}

function piezaDe(id) {
  return piezas.find((p) => { const v = vinculoDe(p); return v && v.ref === id; }) || null;
}

// Si no está vinculada, se intenta por el nombre.
function piezaPorNombre(nombre) {
  if (!nombre) return null;
  const n = String(nombre).trim().toLowerCase();
  return piezas.find((p) => (p.name || "").trim().toLowerCase() === n) || null;
}

function posicionDe(id, nombre) {
  const m = mobs[id];
  if (m && m.pieza) {
    const pz = piezas.find((p) => p.id === m.pieza);
    if (pz) return pz.position;
  }
  const p = piezaDe(id) || piezaPorNombre(nombre);
  return p ? p.position : null;
}

// Qué hay seleccionado ahora mismo en el tablero.
async function seleccionActual() {
  try {
    if (OBR.player.getSelection) {
      const sel = await OBR.player.getSelection();
      return (sel && sel.length) ? sel : null;
    }
  } catch (_) {}
  return null;
}

async function ligarMobAPieza(idMob) {
  const sel = await seleccionActual();
  const m = mobs[idMob];
  if (!m) return;
  if (!sel) {
    anunciar("Selecciona primero la ficha en el tablero y vuelve a pulsar.");
    return;
  }
  const idPieza = sel[0];
  const pz = piezas.find((p) => p.id === idPieza);
  await guardarMobs({ ...mobs, [idMob]: { ...m, pieza: idPieza } });
  await vincularPieza(idPieza, idMob, "mob");
  anunciar(`${m.nombre} queda ligado a la ficha «${(pz && pz.name) || "seleccionada"}».`);
}

function distanciaEntre(idA, nombreA, idB, nombreB) {
  const a = posicionDe(idA, nombreA);
  const b = posicionDe(idB, nombreB);
  if (!a || !b) return null;
  return distanciaCasillas(a, b, dpi);
}

async function vincularPieza(idPieza, ref, tipo) {
  if (!dentroDeOwlbear) return;
  try {
    await OBR.scene.items.updateItems([idPieza], (items) => {
      for (const it of items) {
        it.metadata[META_PIEZA] = { ref, tipo };
      }
    });
  } catch (e) { console.warn("vincular", e); }
}

async function leerTablero() {
  if (!dentroDeOwlbear) return;
  try {
    if (OBR.scene.grid) {
      dpi = (await OBR.scene.grid.getDpi()) || dpi;
      const esc = await OBR.scene.grid.getScale();
      escalaTexto = (esc && (esc.parsed ? esc.parsed.digits + esc.parsed.unit : esc.raw)) || "";
    }
    piezas = await OBR.scene.items.getItems();
  } catch (e) { /* la escena puede no estar lista */ }
}

// Cuánto se ha movido el jugador desde que empezó su turno (recorrido, no línea recta).
function revisarMovimiento() {
  if (!turnos || !esMiTurno()) return false;
  const p = piezaDe(ficha.id) || piezaPorNombre(ficha.nombre);
  if (!p) return false;
  const pos = p.position;
  if (!ficha._posTurno) { ficha._posTurno = { x: pos.x, y: pos.y }; return false; }
  const paso = distanciaCasillas(ficha._posTurno, pos, dpi);
  if (paso >= 1) {                       // media casilla no cuenta: recolocar no gasta
    ficha.movGastado = (ficha.movGastado || 0) + paso;
    ficha._posTurno = { x: pos.x, y: pos.y };
    guardarFicha(); publicarEstado(); render();
    return true;
  }
  return false;
}

// ---------- turnos ----------
function esMiTurno() {
  if (!turnos || !turnos.orden.length) return false;
  const act = turnos.orden[turnos.indice];
  if (!act) return false;
  return act.tipo === "dm" ? miRol === "GM" : act.id === ficha.id;
}

function turnoActual() {
  return turnos && turnos.orden.length ? turnos.orden[turnos.indice] : null;
}

async function guardarTurnos(sig) {
  turnos = sig;
  if (!dentroDeOwlbear) { render(); return; }
  try { await OBR.room.setMetadata({ [CLAVE_TURNOS]: sig }); } catch (e) { console.warn(e); }
}

// El DM tira la iniciativa de todos de golpe; los enemigos comparten un turno.
async function empezarCombate() {
  const lista = [];
  Object.values(party).forEach((p) => {
    const h = hojas[p.id];
    const inst = (h && h.ste && h.ste.instinto) || 1;
    const r = tirarIniciativa(Math.min(inst, 5));
    lista.push({ id: p.id, nombre: p.nombre, tipo: "pj", alto: r.alto,
                 instinto: inst, desempate: Math.random(), dados: r.dados });
  });
  const rd = tirarIniciativa(3);
  lista.push({ id: "__dm__", nombre: "Los enemigos", tipo: "dm", alto: rd.alto,
               instinto: 3, desempate: Math.random(), dados: rd.dados });
  const orden = ordenarIniciativa(lista);
  await guardarTurnos({ orden, indice: 0, ronda: 1 });
  anunciar(`Comienza el combate. Orden: ${orden.map((o) => o.nombre).join(" → ")}`);
  // el primero arranca su turno
  mandarOrdenes(prepararTurno(orden[0]));
}

function prepararTurno(entrada) {
  const ord = {};
  if (entrada && entrada.tipo === "pj") ord[entrada.id] = { empiezaTurno: true };
  return ord;
}

async function siguienteTurno() {
  if (!turnos) return;
  let i = turnos.indice + 1;
  let ronda = turnos.ronda;
  if (i >= turnos.orden.length) { i = 0; ronda += 1; }
  const sig = { ...turnos, indice: i, ronda };
  const entrada = sig.orden[i];
  // una sola escritura: turno nuevo + aviso al que le toca
  if (dentroDeOwlbear) {
    try {
      const meta = await OBR.room.getMetadata();
      const ord = { ...((meta && meta[CLAVE_ORDENES]) || {}) };
      if (entrada && entrada.tipo === "pj") {
        const prev = ord[entrada.id] || { seq: 0 };
        ord[entrada.id] = { empiezaTurno: true, seq: (prev.seq || 0) + 1 };
      }
      // al empezar el turno de los enemigos, recuperan sus acciones
      if (entrada && entrada.tipo === "dm") {
        const sigMobs2 = {};
        Object.values(mobs).forEach((mm) => {
          sigMobs2[mm.id] = { ...mm, accionUsada: false, adicionalUsada: false,
                              reaccionUsada: false, movGastado: 0 };
        });
        mobs = sigMobs2;
      }
      // al cerrar la vuelta, todos recuperan su reacción
      if (i === 0) {
        Object.keys(party).forEach((id) => {
          const prev = ord[id] || { seq: 0 };
          ord[id] = { ...(ord[id] || {}), nuevaRonda: true, seq: (prev.seq || 0) + 1 };
        });
      }
      await OBR.room.setMetadata({ [CLAVE_TURNOS]: sig, [CLAVE_ORDENES]: ord, [CLAVE_MOBS]: mobs });
    } catch (e) { console.warn(e); }
  }
  turnos = sig;
  anunciar(entrada ? `Turno de ${entrada.nombre}${i === 0 ? ` · ronda ${ronda}` : ""}` : "");
  render();
}

async function terminarCombateTurnos() {
  await guardarTurnos(null);
}

async function guardarAtaques(sig) {
  ataques = sig;
  if (!dentroDeOwlbear) { render(); return; }
  try { await OBR.room.setMetadata({ [CLAVE_ATAQUES]: sig }); } catch (e) { console.warn(e); }
}

// El DM (o un mob) lanza un golpe contra un PJ: queda pendiente hasta que reaccione.
async function lanzarGolpe({ deNombre, objetivoId, objetivoNombre, bruto, mobId, estado, verdadero, drenar, contraMob }) {
  const g = {
    id: uid(), deNombre, objetivoId, objetivoNombre, bruto,
    mobId: mobId || null,
    estado: estado || null,
    verdadero: verdadero || 0,
    drenar: drenar || 0,
    contraMob: !!contraMob,
    ts: Date.now(),
  };
  await guardarAtaques({ ...ataques, [g.id]: g });
  anunciar(bruto > 0
    ? `${deNombre} ataca a ${objetivoNombre}: ${bruto} de daño bruto — esperando reacción`
    : `${deNombre} actúa sobre ${objetivoNombre} — esperando reacción`);
}

// Cierra el golpe y aplica de una sola vez los cambios que haya sufrido el enemigo.
async function cerrarGolpeYMobs(id, mobsNuevos) {
  const sigAtaques = { ...ataques };
  delete sigAtaques[id];
  ataques = sigAtaques;
  if (mobsNuevos) mobs = mobsNuevos;
  if (!dentroDeOwlbear) { render(); return; }
  try {
    const cambio = { [CLAVE_ATAQUES]: sigAtaques };
    if (mobsNuevos) cambio[CLAVE_MOBS] = mobsNuevos;
    await OBR.room.setMetadata(cambio);
  } catch (e) { console.warn(e); }
}

async function cerrarGolpe(id) {
  const sig = { ...ataques };
  delete sig[id];
  await guardarAtaques(sig);
}

// Reacciones disponibles según los efectos que tenga la ficha
function misReacciones() {
  const efs = (ficha.habilidades || []).flatMap((h) => (h.efectos || []).map((e) => ({ ...e, hab: h.nombre })));
  return {
    parry: efs.find((e) => e.tipo === "parry"),
    mitad: efs.find((e) => e.tipo === "reducir_mitad"),
    interponer: efs.find((e) => e.tipo === "interponerse"),
    inmune: efs.find((e) => e.tipo === "reaccion_invulnerable"),
    empujar: efs.find((e) => e.tipo === "empujar_aliado"),
  };
}

function panelReacciones() {
  const pendientes = Object.values(ataques);
  if (!pendientes.length) return "";
  const rx = misReacciones();
  const d = derivar(ficha);
  return pendientes.map((g) => {
    if (g.contraMob) {
      if (miRol !== "GM") return "";
      const m = mobs[g.mobId];
      if (!m) return "";
      const me = mobEfectivo(m);
      const tras = roundUp(g.bruto * (1 - me.resistencia / 100));
      return `<div class="card" style="border-color:var(--carmesi);border-width:2px">
        <div class="banda" style="margin:-8px -8px 8px -8px">LE ATACAN</div>
        <div style="margin-bottom:6px">
          <b>${esc(g.deNombre)}</b> golpea a <b>${esc(m.nombre)}</b> · <b>${g.bruto}</b> de daño
        </div>
        <div class="mini" style="margin-bottom:6px">Con su Resistencia (${me.resistencia}%) recibiría <b>${tras}</b>. Tira ${me.pool}d6 para esquivar.</div>
        <div class="fila">
          <button class="btn fuerte" data-reacmob="recibir|${g.id}">Recibir (${tras})</button>
          <button class="btn" data-reacmob="esquivar|${g.id}">Esquivar</button>
        </div>
      </div>`;
    }
    const paraMi = g.objetivoId === ficha.id;
    const distAliado = paraMi ? 0 : distanciaEntre(ficha.id, ficha.nombre, g.objetivoId, g.objetivoNombre);
    const cerca = distAliado == null || distAliado <= ALCANCE_INTERPONER;
    const puedoInterponer = !paraMi && rx.interponer && cerca;
    if (!paraMi && !puedoInterponer) {
      const lejos = !paraMi && rx.interponer && !cerca;
      return `<div class="card"><div class="mini">${esc(g.deNombre)} ataca a ${esc(g.objetivoNombre)} · ${g.bruto} bruto${
        lejos ? ` · estás a ${distAliado} casillas, necesitas estar pegado para interponerte` : ""}</div></div>`;
    }
    const trasResist = roundUp(g.bruto * (1 - d.resistenciaAplicada / 100));
    return `
      <div class="card" style="border-color:var(--carmesi);border-width:2px">
        <div class="banda" style="margin:-8px -8px 8px -8px">TE ATACAN</div>
        <div style="margin-bottom:6px">
          <b>${esc(g.deNombre)}</b> golpea a <b>${esc(g.objetivoNombre)}</b> · <b>${g.bruto}</b> de daño bruto
        </div>
        ${paraMi ? `<div class="mini" style="margin-bottom:6px">Con tu Resistencia (${d.resistenciaAplicada}%) recibirías <b>${trasResist}</b>.</div>` : ""}
        ${turnos && ficha.reaccionUsada ? `<div class="aviso">Ya gastaste tu reacción esta ronda: solo puedes recibir el golpe.</div>` : ""}
        <div class="fila" style="flex-wrap:wrap;gap:4px">
          ${paraMi ? `<button class="btn fuerte" data-reac="recibir|${g.id}">Recibir (${trasResist})</button>` : ""}
          ${paraMi ? `<button class="btn" data-reac="esquivar|${g.id}">Esquivar (${costeDe(PCT_ESQUIVA, d.esenciaMax)}E)</button>` : ""}
          ${paraMi && rx.parry ? `<button class="btn" data-reac="parry|${g.id}">Parry — ${STAT_LABEL[rx.parry.stat || "instinto"]} (${costeDe(PCT_ESQUIVA, d.esenciaMax)}E)</button>` : ""}
          ${paraMi && rx.mitad ? `<button class="btn" data-reac="mitad|${g.id}">A la mitad (${rx.mitad.valor}E)</button>` : ""}
          ${paraMi && rx.inmune ? `<button class="btn" data-reac="inmune|${g.id}">Invulnerable (${rx.inmune.valor}E)</button>` : ""}
          ${puedoInterponer ? `<button class="btn fuerte" data-reac="interponer|${g.id}">Interponerme${rx.interponer.valor ? ` (${rx.interponer.valor}E)` : ""}</button>` : ""}
          ${miRol === "GM" ? `<button class="btn" data-reac="anular|${g.id}">Anular</button>` : ""}
        </div>
      </div>`;
  }).join("");
}

async function guardarMobs(siguiente) {
  // antes de publicar, cada mob revisa si alguna pasiva automática se dispara
  const conAuto = {};
  Object.values(siguiente).forEach((m) => {
    const cambiado = revisarAutoEstadoMob(m);
    conAuto[m.id] = cambiado || m;
  });
  mobs = conAuto;
  if (!dentroDeOwlbear) { render(); return; }
  try {
    await OBR.room.setMetadata({ [CLAVE_MOBS]: conAuto });
  } catch (e) { console.warn("no se pudieron guardar los mobs", e); }
}

async function agregarMob(rango, clase) {
  const existentes = Object.values(mobs).filter((m) => m.rango === rango && m.clase === clase).length;
  const base = fichaMob(rango, clase).nombre;
  const m = mobInstancia(rango, clase, existentes ? `${base} ${existentes + 1}` : base);
  await guardarMobs({ ...mobs, [m.id]: m });
}

async function danarMob(id, cantidad) {
  const m = mobs[id];
  if (!m) return;
  const pv = clamp(m.pv - cantidad, 0, m.pvMax);
  await guardarMobs({ ...mobs, [id]: { ...m, pv } });
  anunciar(`${m.nombre}: ${cantidad > 0 ? `−${cantidad}` : `+${-cantidad}`} PV → ${pv}/${m.pvMax}${pv === 0 ? " · cae" : ""}`);
}

// Clona un mob con sus pasivas, habilidades y ficha, numerando el nombre.
async function duplicarMob(id, veces) {
  const m = mobs[id];
  if (!m) return;
  const base = (m.nombre || "").replace(/\s+\d+$/, "").trim();
  // cuántos hay ya con ese nombre base
  let usados = Object.values(mobs)
    .filter((x) => (x.nombre || "").replace(/\s+\d+$/, "").trim() === base).length;
  const sig = { ...mobs };
  for (let i = 0; i < (veces || 1); i++) {
    usados += 1;
    const copia = JSON.parse(JSON.stringify(m));
    copia.id = uid();
    copia.nombre = `${base} ${usados}`;
    copia.pv = copia.pvMax;
    copia.estados = [];
    copia.adaptado = 0;
    copia.usadaSegundaVida = false;
    sig[copia.id] = copia;
  }
  // renombrar el original al patrón numerado si aún no lo estaba
  if (!/\s\d+$/.test(m.nombre || "")) {
    sig[m.id] = { ...m, nombre: `${base} 1` };
  }
  await guardarMobs(sig);
  anunciar(`Aparecen ${veces || 1} × ${base}`);
}

async function quitarMob(id) {
  const siguiente = { ...mobs };
  delete siguiente[id];
  await guardarMobs(siguiente);
}

// ---------- helpers de render ----------
function h(html) { return html; }
function campo(lbl, inner) { return `<div><label class="lbl">${esc(lbl)}</label>${inner}</div>`; }

// Guarda dónde estabas antes de redibujar, para no perder el foco ni el scroll.
function fotoDelFoco() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return null;
  const claves = ["f", "a", "m", "mk", "hab", "hk", "hef", "hefk", "hcfg", "hck", "fm", "fk",
                  "fh", "fhk", "fef", "fefk", "mef", "mefk", "mh", "mhk", "pas", "pask",
                  "mpas", "mpask", "mhab", "mhabk", "mhef", "mhefk", "tr", "t", "b",
                  "dmg", "objmob", "habmob", "mesaIn", "bnom", "recibir", "pegar"];
  const attrs = [];
  for (const c of claves) {
    if (el.dataset && el.dataset[c] != null) attrs.push(`[data-${c.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase())}="${el.dataset[c]}"]`);
  }
  if (!attrs.length) return null;
  return {
    sel: attrs.join(""),
    ini: el.selectionStart, fin: el.selectionEnd,
    scroll: window.scrollY || document.documentElement.scrollTop || 0,
  };
}

function restaurarFoco(f) {
  if (!f) return;
  try {
    const el = app.querySelector(f.sel);
    if (el) {
      el.focus({ preventScroll: true });
      if (f.ini != null && el.setSelectionRange && el.type !== "number") {
        try { el.setSelectionRange(f.ini, f.fin); } catch (_) {}
      }
    }
    if (f.scroll) window.scrollTo({ top: f.scroll });
  } catch (_) {}
}

function render() {
  const foco = fotoDelFoco();
  const esDM = miRol === "GM";
  const tabs = [
    ["ficha", "Ficha"],
    ["tirar", "Atacar"],
    ["equipo", "Equipo"],
    ["trasfondo", "Trasfondo"],
    ["grupo", "Grupo"],
  ];
  if (esDM) { tabs.push(["bestiario", "Bestiario"]); tabs.push(["dm", "Mesa"]); tabs.push(["fichas", "Fichas"]); tabs.push(["bestias", "Bestias"]); tabs.push(["guia", "Guía"]); }
  if (!esDM && ["dm","bestiario","guia","fichas","bestias"].includes(tab)) tab = "ficha";
  app.innerHTML = `
    <h1>CANCIÓN DE LOS CAÍDOS</h1>
    <div class="tabs">
      ${tabs.map(([id, l]) => `<button class="tab ${tab === id ? "on" : ""}" data-tab="${id}">${l}</button>`).join("")}
    </div>
    ${ficha._expulsado ? `<div class="card" style="border-color:var(--carmesi);border-width:2px">
      <div class="mini">El DM sacó esta ficha de la mesa. Ya no se comparte con la sala.</div>
      <button class="btn fuerte" data-accion="reunirme" style="margin-top:6px">Volver a unirme</button>
    </div>` : ""}
    ${turnos && turnos.orden.length ? (() => {
      const act = turnoActual();
      const mio = esMiTurno();
      const d0 = derivar(ficha);
      const movMax = movimientoDe(ficha) * (ficha._corriendo ? 2 : 1);
      return `<div class="card" style="${mio ? "border-color:var(--carmesi);border-width:2px" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:'Cinzel',serif;font-size:12px;color:${mio ? "var(--carmesi)" : "var(--tinta)"}">
            ${mio ? "ES TU TURNO" : `TURNO DE ${esc(act ? act.nombre : "")}`}
          </span>
          <span class="mini">ronda ${turnos.ronda}</span>
        </div>
        <div class="mini" style="margin-top:3px">
          ${turnos.orden.map((o, i) => `<span class="chip ${i === turnos.indice ? "on" : ""}">${esc(o.nombre)}</span>`).join("")}
        </div>
        ${mio && act.tipo === "pj" ? `
          <div class="mini" style="margin-top:5px">
            Movimiento <b style="color:${(ficha.movGastado || 0) > movMax ? "var(--carmesi)" : "inherit"}">${ficha.movGastado || 0} / ${movMax}</b> casillas<br>
            Acción: <b style="color:${ficha.accionUsada ? "var(--carmesi)" : "inherit"}">${ficha.accionUsada ? "gastada" : "disponible"}</b>
            · Adicional: <b style="color:${ficha.adicionalUsada ? "var(--carmesi)" : "inherit"}">${ficha.adicionalUsada ? "gastada" : "disponible"}</b>
            · Reacción: <b style="color:${ficha.reaccionUsada ? "var(--carmesi)" : "inherit"}">${ficha.reaccionUsada ? "gastada" : "disponible"}</b>
          </div>
          <div class="fila" style="margin-top:5px">
            <button class="btn fuerte" data-accion="terminar-turno">Terminar mi turno</button>
            <button class="btn" data-accion="correr">Correr (×2, gasta la acción)</button>
            <button class="btn" data-accion="reiniciar-mov">↺</button>
          </div>` : ""}
        ${mio && act.tipo === "dm" ? `
          <div class="fila" style="margin-top:5px">
            <button class="btn fuerte" data-accion="terminar-turno">Terminar el turno de los enemigos</button>
          </div>` : ""}
        ${miRol === "GM" ? `<div class="fila" style="margin-top:5px">
          <button class="btn" data-accion="pasar-turno">Pasar turno</button>
          <button class="btn" data-accion="fin-turnos">Cerrar la iniciativa</button>
        </div>` : ""}
      </div>`;
    })() : (miRol === "GM" && Object.keys(mobs).length ? `<div class="card">
      <button class="btn fuerte" data-accion="iniciativa">Tirar iniciativa y empezar el combate</button>
      <div class="mini" style="margin-top:3px">Se tira Instinto por cada jugador; los enemigos comparten un turno.</div>
    </div>` : "")}
    ${modoEdicion ? `<div class="card" style="border-color:var(--carmesi);border-width:2px">
      <div style="font-family:'Cinzel',serif;font-size:12px;color:var(--carmesi)">
        EDITANDO LA FICHA DE ${esc(modoEdicion.nombre).toUpperCase()}
      </div>
      <div class="mini" style="margin-top:3px">
        Cambia lo que quieras en Ficha, Equipo o Trasfondo. Nada se aplica hasta que guardes.
      </div>
      <div class="fila" style="margin-top:6px">
        <button class="btn fuerte" data-accion="guardar-edicion">Guardar en su ficha</button>
        <button class="btn" data-accion="cancelar-edicion">Cancelar</button>
      </div>
    </div>` : ""}
    ${panelReacciones()}
    ${tab === "ficha" ? vistaFicha() : ""}
    ${tab === "tirar" ? vistaTirar() : ""}
    ${tab === "equipo" ? vistaEquipo() : ""}
    ${tab === "trasfondo" ? vistaTrasfondo() : ""}
    ${tab === "grupo" ? vistaGrupo() : ""}
    ${tab === "bestiario" && esDM ? vistaBestiario() : ""}
    ${tab === "dm" && esDM ? vistaMesa() : ""}
    ${tab === "fichas" && esDM ? vistaFichas() : ""}
    ${tab === "bestias" && esDM ? vistaBestias() : ""}
    ${tab === "guia" && esDM ? vistaDM() : ""}
  `;
  enlazar();
  restaurarFoco(foco);
}

// ---------- FICHA ----------
function vistaFicha() {
  const d = derivar(ficha);
  return `
    <div class="card">
      <div class="grid2" style="margin-bottom:6px">
        ${campo("Nombre", `<input data-f="nombre" value="${esc(ficha.nombre)}">`)}
        ${campo("Rango", `<select data-f="rango">${RANGOS.map((r, i) => `<option value="${i}" ${ficha.rango === i ? "selected" : ""}>${r}</option>`).join("")}</select>`)}
      </div>
      <div class="grid2">
        ${campo("Nivel", `<select data-f="nivel">${[1,2,3,4,5,6,7].map((n) => `<option value="${n}" ${ficha.nivel === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}
        ${campo("Aspecto rige con", `<select data-f="aspectoStat">${STAT_KEYS.map((k) => `<option value="${k}" ${ficha.aspectoStat === k ? "selected" : ""}>${STAT_LABEL[k]}</option>`).join("")}</select>`)}
      </div>
    </div>

    <div class="banda">CARACTERÍSTICAS · tope ${d.statCap}${d.forma ? ` <span class="forma-activa">${esc(d.forma.nombre || "forma")}</span>` : ""}</div>
    <div class="card grid4">
      ${STAT_KEYS.map((k) => {
        const ef = d.stats[k];
        const cambiada = ef !== ficha.stats[k];
        const p = poolDe(ef, ficha.estados, dadosExtraDe(ficha, k));
        return `<div class="stat">
          <div class="lbl">${STAT_LABEL[k]}</div>
          <div class="val" style="${cambiada ? "color:var(--carmesi)" : ""}">${ef}${cambiada ? `<span style="font-size:10px"> (${ficha.stats[k]})</span>` : ""}</div>
          <div style="display:flex;gap:3px;justify-content:center;margin:2px 0">
            <button class="btn" data-stat="${k}" data-delta="-1" style="padding:1px 6px">−</button>
            <button class="btn" data-stat="${k}" data-delta="1" style="padding:1px 6px">+</button>
          </div>
          <div class="pool">${p.pool}d6${p.repeticiones ? ` · ${p.repeticiones}r` : ""}</div>
        </div>`;
      }).join("")}
    </div>

    <div class="banda">RECURSOS</div>
    <div class="card">
      <div class="grid2">
        ${campo(`PV / ${d.pvMax}`, `<div class="fila"><button class="btn" data-rec="pv" data-delta="-1">−</button><input class="num" data-f="pv" type="number" min="0" max="${d.pvMax}" value="${d.pv}"><button class="btn" data-rec="pv" data-delta="1">+</button></div>`)}
        ${campo(`Esencia / ${d.esenciaMax}`, `<div class="fila"><button class="btn" data-rec="esencia" data-delta="-1">−</button><input class="num" data-f="esencia" type="number" min="0" max="${d.esenciaMax}" value="${d.esencia}"><button class="btn" data-rec="esencia" data-delta="1">+</button></div>`)}
      </div>
      <div style="margin-top:6px">
        <label class="lbl">Grieta (3 = se dispara)</label>
        ${[0,1,2].map((i) => `<button class="pip ${ficha.grieta > i ? "on" : ""}" data-grieta="${i}"></button>`).join(" ")}
        <button class="btn" data-accion="reset-grieta" style="margin-left:8px;padding:2px 6px">reiniciar</button>
      </div>
      <div style="margin-top:6px">
        <label class="lbl">Estados</label>
        ${ESTADOS.map((e) => `<button class="chip ${(ficha.estados || []).includes(e.id) ? "on" : ""}" data-estado="${e.id}" title="${esc(e.desc)}">${e.label}</button>`).join("")}
      </div>
      ${(ficha.invulnerable || 0) > 0 ? `<div class="aviso">Invulnerable: ignoras los próximos ${ficha.invulnerable} golpe(s).</div>` : ""}
      ${(ficha.estados || []).includes("invisible") ? `<div class="aviso">Invisible: los enemigos no pueden elegirte. Atacar te delata, salvo que tu habilidad diga lo contrario.</div>` : ""}
      ${d.regeneracion ? `<div class="fila" style="margin-top:6px"><button class="btn" data-accion="regenerar">Regenerar ${d.regeneracion} PV</button></div>` : ""}
      ${(d.pasivas || []).length ? `<div style="margin-top:6px"><label class="lbl">Pasivas en juego</label><div>${d.pasivas.map((p) => {
        const tp = TIPOS_PASIVA.find((t) => t.id === p.tipo) || {};
        return `<span class="chip on">${esc(String(tp.label || "").replace("X", p.valor))}${tp.param === "stat" ? ` (${STAT_LABEL[p.stat] || ""})` : ""}${tp.param === "estado" ? ` (${(ESTADOS.find((e) => e.id === p.estado) || {}).label || ""})` : ""}</span>`;
      }).join("")}</div></div>` : ""}
      ${d.pv <= 0 ? `<div class="aviso">Caído — tira Voluntad al inicio de tu turno. Fallos: ${ficha.caidoFallos}/3
        <div style="margin-top:4px"><button class="btn" data-accion="tirar-caida">Tirar Voluntad</button>
        <button class="btn" data-accion="estabilizar">Estabilizar (1 PV)</button></div></div>` : ""}
      ${miRol === "GM" ? `<div style="margin-top:6px">
        ${campo("Recuperar al cerrar aventura", `<button class="btn fuerte" data-accion="recargar">Recargar PV y Esencia</button>`)}
      </div>` : `<div class="mini" style="margin-top:6px">Solo el DM puede recargar PV y Esencia.</div>`}
    </div>

    <div class="banda">ECOS${(ficha.ecos || []).length ? ` · ${ficha.ecos.length}/${topeEcos(ficha.rango)}` : ""}</div>
    <div class="card">
      ${!(ficha.ecos || []).length ? `<div class="mini">Ninguno todavía. El DM te liga la sombra de una criatura que hayas vencido.</div>` : ""}
      ${(ficha.ecos || []).map((e, i) => {
        const activo = ficha.ecoActivo === e.id;
        return `<div class="card" style="padding:6px;margin-top:5px;${activo ? "border-color:var(--carmesi);border-width:2px" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <b>${esc(e.nombre)}</b>
            <span class="mini">${e.pv}/${e.pvMax} PV · pega ${e.dano}${activo ? " · invocado" : ""}</span>
          </div>
          <div class="barra"><i style="width:${clamp((e.pv / e.pvMax) * 100, 0, 100)}%"></i></div>
          ${(e.tags || []).length ? `<div class="mini">${e.tags.map(esc).join(" · ")}</div>` : ""}
          ${e.imagen ? `<img src="${esc(e.imagen)}" alt="" style="width:100%;max-height:130px;object-fit:cover;border-radius:5px;margin-top:4px" onerror="this.style.display='none'">` : ""}
          <input data-eco="${i}" data-ecok="imagen" value="${esc(e.imagen || "")}" placeholder="Enlace a su imagen" style="margin-top:4px">
          <div class="fila" style="margin-top:4px">
            ${activo
              ? `<button class="btn" data-eco-guardar="${e.id}">Guardar la sombra</button>`
              : `<button class="btn fuerte" data-eco-invocar="${e.id}" ${d.esencia < costeEco(d.esenciaMax) || ficha.ecoActivo ? "disabled" : ""}>Invocar (${costeEco(d.esenciaMax)}E)</button>`}
            <button class="btn" data-eco-atacar="${e.id}" ${activo ? "" : "disabled"}>Atacar con él</button>
            <button class="btn" data-eco-quitar="${i}" style="flex:0 0 auto">×</button>
          </div>
        </div>`;
      }).join("")}
      ${ficha.ecoActivo ? `<div class="mini" style="margin-top:5px">Solo puedes tener uno invocado. Si cae a 0, se pierde para siempre.</div>` : ""}
    </div>

    <div class="banda">RASGOS</div>
    <div class="card">
      <div class="mini">Bonificaciones que solo valen contra cierto tipo de criatura. Marca las tags de los enemigos en el Bestiario.</div>
      ${(ficha.rasgos || []).map((ra, i) => `
        <div class="card" style="padding:6px;margin-top:5px">
          <div class="fila">
            <input data-ra="${i}" data-rak="nombre" value="${esc(ra.nombre || "")}" placeholder="Ej. Asesino de dragones">
            <select data-ra="${i}" data-rak="tag" style="max-width:120px">
              ${TAGS.map((t) => `<option value="${t}" ${ra.tag === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <button class="btn" data-quitar-ra="${i}" style="flex:0 0 auto;padding:2px 6px">×</button>
          </div>
          ${(ra.efectos || []).map((ef, j) => {
            const tr = TIPOS_RASGO.find((t) => t.id === ef.tipo) || TIPOS_RASGO[0];
            return `<div class="fila" style="margin:4px 0 0 10px">
              <select data-raef="${i}|${j}" data-raefk="tipo">
                ${TIPOS_RASGO.map((t) => `<option value="${t.id}" ${ef.tipo === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
              </select>
              ${tr.unidad ? `<input class="num" data-raef="${i}|${j}" data-raefk="valor" type="number" value="${ef.valor}" style="max-width:62px">` : ""}
              <button class="btn" data-quitar-raef="${i}|${j}" style="flex:0 0 auto;padding:2px 6px">×</button>
            </div>`;
          }).join("")}
          <button class="btn" data-add-raef="${i}" style="margin:4px 0 0 10px;padding:2px 8px">+ efecto</button>
          <input data-ra="${i}" data-rak="descripcion" value="${esc(ra.descripcion || "")}" placeholder="De dónde viene" style="margin-top:4px">
        </div>`).join("")}
      <button class="btn" data-accion="add-rasgo" style="margin-top:5px">+ rasgo</button>
    </div>

    <div class="banda">FORMAS Y EFECTOS</div>
    <div class="card">
      <label class="lbl">Forma activa</label>
      <div style="margin-bottom:6px">
        <button class="chip ${!ficha.formaActiva ? "on" : ""}" data-forma="">Base</button>
        ${(ficha.formas || []).map((fm) => `<button class="chip ${ficha.formaActiva === fm.id ? "on" : ""}" data-forma="${fm.id}">${esc(fm.nombre || "sin nombre")}</button>`).join("")}
      </div>
      ${d.forma ? `<div class="mini" style="margin-bottom:6px">
        En <b>${esc(d.forma.nombre || "sin nombre")}</b>: ${d.forma.sube && d.forma.sube !== "ninguna" ? `${STAT_LABEL[d.forma.sube]} +${d.forma.subeCant != null ? d.forma.subeCant : 2}` : "sin subida"}${d.forma.baja && d.forma.baja !== "ninguna" ? ` · ${STAT_LABEL[d.forma.baja]} −${d.forma.bajaCant != null ? d.forma.bajaCant : 1}` : ""}${d.forma.dominio ? ` · Dominio ${d.forma.dominio > 0 ? "+" : ""}${d.forma.dominio}%` : ""}${d.forma.resistencia ? ` · Resist. ${d.forma.resistencia > 0 ? "+" : ""}${d.forma.resistencia}%` : ""}${d.curacion !== "normal" ? ` · ${esc((MODOS_CURACION.find((c) => c.id === d.curacion) || {}).label || "")}` : ""}${d.forma.nota ? ` · ${esc(d.forma.nota)}` : ""}
      </div>` : `<div class="mini" style="margin-bottom:6px">Sin forma activa: usas tus stats base.</div>`}

      ${(ficha.formas || []).map((fm, i) => `
        <div class="card" style="padding:6px;margin-bottom:5px">
          <div class="fila">
            <input data-fm="${i}" data-fk="nombre" value="${esc(fm.nombre)}" placeholder="Nombre de la forma">
            <button class="btn" data-quitar-fm="${i}" style="flex:0 0 auto;padding:2px 6px">×</button>
          </div>
          <div class="fila" style="margin-top:4px">
            <div>${campo("Sube", `<select data-fm="${i}" data-fk="sube"><option value="ninguna" ${fm.sube === "ninguna" ? "selected" : ""}>— ninguna —</option>${STAT_KEYS.map((k) => `<option value="${k}" ${fm.sube === k ? "selected" : ""}>${STAT_LABEL[k]}</option>`).join("")}</select>`)}</div>
            <div>${campo("+", `<input class="num" data-fm="${i}" data-fk="subeCant" type="number" value="${fm.subeCant != null ? fm.subeCant : 2}">`)}</div>
            <div>${campo("Baja", `<select data-fm="${i}" data-fk="baja"><option value="ninguna" ${fm.baja === "ninguna" ? "selected" : ""}>— ninguna —</option>${STAT_KEYS.map((k) => `<option value="${k}" ${fm.baja === k ? "selected" : ""}>${STAT_LABEL[k]}</option>`).join("")}</select>`)}</div>
            <div>${campo("−", `<input class="num" data-fm="${i}" data-fk="bajaCant" type="number" value="${fm.bajaCant != null ? fm.bajaCant : 1}">`)}</div>
          </div>
          <div class="fila" style="margin-top:4px">
            <div>${campo("Dominio %", `<input class="num" data-fm="${i}" data-fk="dominio" type="number" value="${fm.dominio || 0}">`)}</div>
            <div>${campo("Resistencia %", `<input class="num" data-fm="${i}" data-fk="resistencia" type="number" value="${fm.resistencia || 0}">`)}</div>
            <div>${campo("Curación", `<select data-fm="${i}" data-fk="curacion">${MODOS_CURACION.map((c) => `<option value="${c.id}" ${(fm.curacion || "normal") === c.id ? "selected" : ""}>${c.label}</option>`).join("")}</select>`)}</div>
          </div>
          <input data-fm="${i}" data-fk="nota" value="${esc(fm.nota || "")}" placeholder="Qué más cambia" style="margin-top:4px">
          <input data-fm="${i}" data-fk="imagen" value="${esc(fm.imagen || "")}" placeholder="Enlace a la imagen de esta forma" style="margin-top:4px">
          ${fm.imagen ? `<img src="${esc(fm.imagen)}" alt="" style="width:100%;max-height:140px;object-fit:cover;border-radius:5px;margin-top:4px;border:1px solid var(--borde)" onerror="this.style.display='none'">` : ""}

          <div style="margin-top:6px;border-top:1px solid var(--borde);padding-top:5px">
            <label class="lbl">Habilidades solo de esta forma</label>
            ${(fm.habilidades || []).map((fh, j) => `
              <div class="fila" style="margin-top:4px">
                <input data-fh="${i}|${j}" data-fhk="nombre" value="${esc(fh.nombre || "")}" placeholder="Nombre">
                <select data-fh="${i}|${j}" data-fhk="perfil" style="max-width:118px">
                  ${PERFILES_HABILIDAD.map((pp) => `<option value="${pp.id}" ${fh.perfil === pp.id ? "selected" : ""}>${pp.label}</option>`).join("")}
                </select>
                <button class="btn" data-quitar-fh="${i}|${j}" style="flex:0 0 auto;padding:2px 6px">×</button>
              </div>
              ${(fh.efectos || []).map((ef, k) => {
                const te = TIPOS_EFECTO.find((t) => t.id === ef.tipo) || TIPOS_EFECTO[0];
                return `<div class="fila" style="margin-top:3px;margin-left:10px">
                  <select data-fef="${i}|${j}|${k}" data-fefk="tipo">${opcionesEfecto(ef.tipo)}</select>
                  ${te.unidad ? `<input class="num" data-fef="${i}|${j}|${k}" data-fefk="valor" type="number" value="${ef.valor}" style="max-width:62px">` : ""}
                  ${extrasEfecto(ef, te, `data-fef="${i}|${j}|${k}"`, "fefk")}
${te.param === "invis" ? `<select data-fef="${i}|${j}|${k}" data-fefk="rompe" style="max-width:150px">${ROTURAS_INVIS.map((rr) => `<option value="${rr.id}" ${(ef.rompe || "atacar") === rr.id ? "selected" : ""}>${rr.label}</option>`).join("")}</select>` : ""}
                  ${te.tope ? `<input class="num" data-fef="${i}|${j}|${k}" data-fefk="tope" type="number" value="${ef.tope != null ? ef.tope : 25}" style="max-width:52px" title="tope % de tu vida">` : ""}
                  <button class="btn" data-quitar-fef="${i}|${j}|${k}" style="flex:0 0 auto;padding:2px 6px">×</button>
                </div>
                  <div class="fila" style="margin:3px 0 0 10px">
                  <select data-fef="${i}|${j}|${k}" data-fefk="disparo" style="max-width:180px">
                    ${DISPAROS.map((dd) => `<option value="${dd.id}" ${(ef.disparo || "siempre") === dd.id ? "selected" : ""}>${dd.label}</option>`).join("")}
                  </select>
                  ${(DISPAROS.find((dd) => dd.id === (ef.disparo || "siempre")) || {}).unidad
                    ? `<input class="num" data-fef="${i}|${j}|${k}" data-fefk="umbralDisparo" type="number" value="${ef.umbralDisparo != null ? ef.umbralDisparo : 50}" style="max-width:56px">` : ""}
                  ${(ef.disparo === "estado_yo") ? `<select data-fef="${i}|${j}|${k}" data-fefk="estadoDisparo" style="max-width:96px">${ESTADOS.map((e2) => `<option value="${e2.id}" ${(ef.estadoDisparo || "herido") === e2.id ? "selected" : ""}>${e2.label}</option>`).join("")}</select>` : ""}
                </div>`;
              }).join("")}
              <button class="btn" data-add-fef="${i}|${j}" style="margin:3px 0 0 10px;padding:2px 8px">+ efecto</button>
            `).join("")}
            <button class="btn" data-add-fh="${i}" style="margin-top:4px;padding:2px 8px">+ habilidad de forma</button>
          </div>

          <div style="margin-top:6px;border-top:1px solid var(--borde);padding-top:5px">
            <label class="lbl">Pasivas de esta forma</label>
            ${editorPasivas(fm.pasivas, `forma|${i}`)}
          </div>
        </div>`).join("")}
      <button class="btn" data-accion="add-forma">+ forma</button>

      ${(() => {
        const usadas = [
          ...(ficha.habilidades || []),
          ...((d.forma && d.forma.habilidades) || []),
          ...(ficha.memorias || []).map((m) => m.hab).filter(Boolean),
        ].filter((h) => h && h.usos);
        if (!usadas.length) return "";
        return `<div style="margin-top:10px">
          <label class="lbl">Usadas este combate</label>
          <div>${usadas.map((h) => `<span class="chip on">${esc(h.nombre || "habilidad")} ×${h.usos}</span>`).join("")}</div>
          <button class="btn" data-accion="reiniciar-usos" style="margin-top:4px;padding:2px 8px">reiniciar usos</button>
        </div>`;
      })()}

      ${(ficha.buffs || []).length ? `<div style="margin-top:8px">
        <label class="lbl">Buffs en curso</label>
        ${ficha.buffs.map((b) => `<span class="chip on">${esc(b.nombre)}${b.dominio ? ` +${b.dominio}%D` : ""}${b.resistencia ? ` +${b.resistencia}%R` : ""}</span>`).join("")}
        <button class="btn" data-accion="limpiar-buffs" style="margin-left:4px;padding:2px 8px">fin del combate</button>
      </div>` : ""}

      <div style="margin-top:8px">
        ${campo("Atributos ganados en Pesadillas", `<textarea data-f="atributos" rows="2" placeholder="Rasgos menores">${esc(ficha.atributos || "")}</textarea>`)}
      </div>
    </div>

    <div class="banda">ASPECTO Y DEFECTO</div>
    <div class="card">
      ${campo("Nombre del Aspecto", `<input data-f="aspectoNombre" value="${esc(ficha.aspectoNombre)}">`)}
      <div style="margin-top:6px">
        <label class="lbl">Habilidades</label>
        ${(ficha.habilidades || []).map((hab, i) => {
          const perf = PERFILES_HABILIDAD.find((p) => p.id === hab.perfil) || PERFILES_HABILIDAD[0];
          const d2 = derivar(ficha);
          const danoHab = perf.ofensiva ? roundUp((d2.arma.base * perf.mult + d2.mod * 2 * d2.rangoNum) * (1 + d2.dominio / 100)) : null;
          return `
          <div class="card" style="padding:6px;margin-bottom:5px">
            <div class="fila">
              <input data-hab="${i}" data-hk="nombre" value="${esc(hab.nombre)}" placeholder="Nombre">
              <select data-hab="${i}" data-hk="perfil" style="max-width:120px">
                ${PERFILES_HABILIDAD.map((p) => `<option value="${p.id}" ${hab.perfil === p.id ? "selected" : ""}>${p.label}${p.ofensiva ? ` ×${p.mult}` : ""}</option>`).join("")}
              </select>
              <button class="btn" data-quitar-hab="${i}" style="flex:0 0 auto;padding:2px 6px">×</button>
            </div>
            <textarea data-hab="${i}" data-hk="descripcion" rows="2" placeholder="Qué hace" style="margin-top:4px">${esc(hab.descripcion || "")}</textarea>
            <div class="mini" style="margin-top:3px">${esc(perf.costo)}${danoHab != null ? ` · daño ${danoHab}` : " · sin daño"}</div>
            ${(hab.efectos || []).map((ef, j) => {
              const te = TIPOS_EFECTO.find((t) => t.id === ef.tipo) || TIPOS_EFECTO[0];
              return `<div class="fila" style="margin-top:4px">
                <select data-hef="${i}|${j}" data-hefk="tipo">${opcionesEfecto(ef.tipo)}</select>
                ${te.unidad ? `<input class="num" data-hef="${i}|${j}" data-hefk="valor" type="number" value="${ef.valor}" style="max-width:64px">` : ""}
                ${extrasEfecto(ef, te, `data-hef="${i}|${j}"`, "hefk")}
${te.param === "invis" ? `<select data-hef="${i}|${j}" data-hefk="rompe" style="max-width:150px">${ROTURAS_INVIS.map((rr) => `<option value="${rr.id}" ${(ef.rompe || "atacar") === rr.id ? "selected" : ""}>${rr.label}</option>`).join("")}</select>` : ""}
                ${te.tope ? `<label class="mini" style="display:flex;align-items:center;gap:3px;white-space:nowrap">tope <input class="num" data-hef="${i}|${j}" data-hefk="tope" type="number" value="${ef.tope != null ? ef.tope : 25}" style="max-width:52px">% de tu vida</label>` : ""}
                <button class="btn" data-quitar-hef="${i}|${j}" style="flex:0 0 auto;padding:2px 6px">×</button>
              </div>
              <div class="fila" style="margin:3px 0 0 10px">
                  <select data-hef="${i}|${j}" data-hefk="disparo" style="max-width:180px">
                    ${DISPAROS.map((dd) => `<option value="${dd.id}" ${(ef.disparo || "siempre") === dd.id ? "selected" : ""}>${dd.label}</option>`).join("")}
                  </select>
                  ${(DISPAROS.find((dd) => dd.id === (ef.disparo || "siempre")) || {}).unidad
                    ? `<input class="num" data-hef="${i}|${j}" data-hefk="umbralDisparo" type="number" value="${ef.umbralDisparo != null ? ef.umbralDisparo : 50}" style="max-width:56px">` : ""}
                  ${(ef.disparo === "estado_yo") ? `<select data-hef="${i}|${j}" data-hefk="estadoDisparo" style="max-width:96px">${ESTADOS.map((e2) => `<option value="${e2.id}" ${(ef.estadoDisparo || "herido") === e2.id ? "selected" : ""}>${e2.label}</option>`).join("")}</select>` : ""}
                </div>`;
            }).join("")}
            <div class="fila" style="margin-top:5px">
              <label class="mini" style="display:flex;align-items:center;gap:4px">
                <input type="checkbox" data-hcfg="${i}" data-hck="costoExtraRepetir" ${hab.costoExtraRepetir ? "checked" : ""}>
                +1E al repetir
              </label>
              <div>${campo("Usos/combate (0 = libre)", `<input class="num" data-hcfg="${i}" data-hck="usosMax" type="number" min="0" value="${hab.usosMax || 0}">`)}</div>
              <div>${campo("Alcance (casillas)", `<input class="num" data-hcfg="${i}" data-hck="alcance" type="number" min="0" value="${hab.alcance != null ? hab.alcance : 1}">`)}</div>
              <div>${campo("Consume", `<select data-hcfg="${i}" data-hck="accion">${TIPOS_ACCION.filter((t) => t.id !== "reaccion").map((t) => `<option value="${t.id}" ${(hab.accion || "accion") === t.id ? "selected" : ""}>${t.label}</option>`).join("")}</select>`)}</div>
            </div>
            <button class="btn" data-add-hef="${i}" style="margin-top:4px;padding:2px 8px">+ efecto</button>
            <div style="margin-top:5px;border-top:1px dashed var(--borde);padding-top:5px">
              <label class="lbl">Pasivas de esta habilidad</label>
              ${editorPasivas(hab.pasivas, `hab|${i}`)}
            </div>
          </div>`;
        }).join("")}
        <button class="btn" data-accion="add-hab">+ habilidad</button>
      </div>
      <div style="margin-top:6px">
        ${campo("Defecto", `<textarea data-f="defecto" rows="2">${esc(ficha.defecto)}</textarea>`)}
      </div>
    </div>
  `;
}

// ---------- TIRAR ----------
function ataquesDisponibles() {
  const d = derivar(ficha);
  const lista = [{
    id: "arma",
    label: ficha.arma.nombre || "Arma equipada",
    dano: d.danoArma,
    costo: 0,
    ofensiva: true,
    desc: "",
    efectos: [],
    alcance: 1,
    accion: "accion",
    idx: -1,
  }];
  (ficha.habilidades || []).forEach((hab, i) => {
    const p = PERFILES_HABILIDAD.find((x) => x.id === hab.perfil) || PERFILES_HABILIDAD[0];
    const costo = costoHabilidad(hab, d.esenciaMax, d.costeReducido);
    lista.push({
      id: "hab" + i,
      label: hab.nombre || `Habilidad ${i + 1}`,
      dano: p.ofensiva ? roundUp((d.arma.base * p.mult + d.mod * 2 * d.rangoNum) * (1 + d.dominio / 100)) : null,
      costo,
      ofensiva: p.ofensiva,
      desc: hab.descripcion || "",
      perfil: p.label,
      efectos: hab.efectos || [],
      alcance: hab.alcance != null ? hab.alcance : 1,
      accion: hab.accion || "accion",
      idx: i,
      usos: hab.usos || 0,
      usosMax: hab.usosMax || 0,
      repite: !!hab.costoExtraRepetir,
      agotada: (hab.usosMax || 0) > 0 && (hab.usos || 0) >= hab.usosMax,
    });
  });
  // habilidades propias de la Forma activa
  const fm = d.forma;
  if (fm) {
    (fm.habilidades || []).forEach((hab, i) => {
      const p = PERFILES_HABILIDAD.find((x) => x.id === hab.perfil) || PERFILES_HABILIDAD[0];
      lista.push({
        id: "forma" + i,
        label: `${hab.nombre || "Habilidad de forma"} · ${fm.nombre || "forma"}`,
        dano: p.ofensiva ? roundUp((d.arma.base * p.mult + d.mod * 2 * d.rangoNum) * (1 + d.dominio / 100)) : null,
        costo: costoHabilidad(hab, d.esenciaMax, d.costeReducido),
        ofensiva: p.ofensiva,
        desc: hab.descripcion || "",
        efectos: hab.efectos || [],
        idx: -1, formaIdx: i,
        usos: hab.usos || 0, usosMax: hab.usosMax || 0,
        repite: !!hab.costoExtraRepetir,
        agotada: (hab.usosMax || 0) > 0 && (hab.usos || 0) >= hab.usosMax,
      });
    });
  }
  // habilidades activas de las Memorias equipadas
  (ficha.memorias || []).forEach((m, i) => {
    const h = m.hab;
    if (!h || h.modo !== "activa") return;
    const p = PERFILES_HABILIDAD.find((x) => x.id === h.perfil) || PERFILES_HABILIDAD[0];
    lista.push({
      id: "mem" + i,
      label: `${h.nombre || m.nombre || MEMORIA_SLOTS[i]} · ${MEMORIA_SLOTS[i]}`,
      dano: p.ofensiva ? roundUp((d.arma.base * p.mult + d.mod * 2 * d.rangoNum) * (1 + d.dominio / 100)) : null,
      costo: costoHabilidad(h, d.esenciaMax, d.costeReducido),
      ofensiva: p.ofensiva,
      desc: h.descripcion || "",
      efectos: h.efectos || [],
      idx: -1, memIdx: i,
      usos: h.usos || 0, usosMax: h.usosMax || 0,
      repite: !!h.costoExtraRepetir,
      agotada: (h.usosMax || 0) > 0 && (h.usos || 0) >= h.usosMax,
    });
  });
  return lista;
}

function vistaTirar() {
  const d = derivar(ficha);
  const lista = Object.values(mobs);
  const objetivoId = ficha._objetivo && mobs[ficha._objetivo] ? ficha._objetivo : (lista[0] ? lista[0].id : "");
  const obj = mobs[objetivoId] || null;
  const ataques = ataquesDisponibles();
  const ataqueId = ficha._ataque || "arma";
  const atq = ataques.find((a) => a.id === ataqueId) || ataques[0];
  const empujes = ficha._empujes || 0;

  const rangoObj = obj ? obj.rango : (ficha._tRango ?? ficha.rango);
  const claseObj = obj ? obj.clase : (ficha._tClase ?? 0);
  const interf = interferencia((rangoObj + 1) - (ficha.rango + 1), (claseObj + 1) - ficha.nivel);
  const statSel = ficha._tirarStat || ficha.aspectoStat;
  const p = poolDe(statsEfectivas(ficha)[statSel], ficha.estados, dadosExtraDe(ficha, statSel));
  const dc = atq.ofensiva
    ? danoContra(atq.dano, obj ? obj.resistencia : MOB_RESIST_LOCAL(rangoObj), (rangoObj + 1) - (ficha.rango + 1), ficha.arma.rangoArma, ficha.rango + 1, rangoObj + 1)
    : null;
  const costeEmpuje = costeDe(PCT_EMPUJE, d.esenciaMax);
  const costoTotal = (atq.costo || 0) + empujes * costeEmpuje;

  return `
    <div class="card">
      ${campo("Objetivo", lista.length
        ? `<select data-t="objetivo">${lista.map((m) => `<option value="${m.id}" ${objetivoId === m.id ? "selected" : ""}>${esc(m.nombre)} — ${m.pv}/${m.pvMax} PV</option>`).join("")}</select>`
        : `<div class="mini">No hay enemigos en el encuentro. Añádelos en Bestiario, o elige Rango y Clase abajo para una tirada suelta.</div>`)}
      ${!lista.length ? `<div class="grid2" style="margin-top:6px">
        ${campo("Rango rival", `<select data-t="rango">${RANGOS.map((r, i) => `<option value="${i}" ${rangoObj === i ? "selected" : ""}>${r}</option>`).join("")}</select>`)}
        ${campo("Clase rival", `<select data-t="clase">${CLASES.map((c, i) => `<option value="${i}" ${claseObj === i ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
      </div>` : ""}
    </div>

    <div class="card">
      ${campo("Ataque", `<select data-t="ataque">${ataques.map((a) => `<option value="${a.id}" ${ataqueId === a.id ? "selected" : ""}>${esc(a.label)}${a.ofensiva ? ` · ${a.dano}` : " · utilidad"}${a.costo ? ` · ${a.costo}E` : ""}${a.usosMax ? ` · ${a.usos}/${a.usosMax}` : ""}${a.accion && a.accion !== "accion" ? ` · ${(TIPOS_ACCION.find((t) => t.id === a.accion) || {}).corta || ""}` : ""}${a.agotada ? " · AGOTADA" : ""}</option>`).join("")}</select>`)}
      ${atq.desc ? `<div class="mini" style="margin-top:4px">${esc(atq.desc)}</div>` : ""}
      ${(() => {
        if (!obj) return "";
        const dist = distanciaEntre(ficha.id, ficha.nombre, obj.id, obj.nombre);
        if (dist == null) return `<div class="mini">Sin fichas vinculadas en el tablero: el alcance no se comprueba.</div>`;
        const alc = atq.alcance != null ? atq.alcance : 1;
        const corriendo = ficha._corriendo ? " · estás corriendo" : "";
        if (!alc) return `<div class="mini">${esc(obj.nombre)} está a <b>${dist}</b> casillas · esta habilidad no tiene límite${corriendo}</div>`;
        return dist <= alc
          ? `<div class="mini">${esc(obj.nombre)} está a <b>${dist}</b> casillas · llegas (alcance ${alc})${corriendo}</div>`
          : `<div class="aviso">${esc(obj.nombre)} está a <b>${dist}</b> casillas y esta habilidad llega a <b>${alc}</b>. Te faltan ${dist - alc}: muévete o usa otra cosa.</div>`;
      })()}
      ${atq.repite && atq.usos ? `<div class="mini" style="color:var(--carmesi)">Ya la usaste ${atq.usos} ${atq.usos === 1 ? "vez" : "veces"} este combate: cuesta ${atq.costo}E.</div>` : ""}
      ${atq.agotada ? `<div class="aviso">Agotada este combate (${atq.usos}/${atq.usosMax}).</div>` : ""}
      ${(ficha.estados || []).includes("sellado") && atq.id !== "arma" ? `<div class="aviso">Estás Sellado: solo puedes atacar con el arma.</div>` : ""}
      ${turnos ? (() => {
        if (!esMiTurno()) return `<div class="aviso">No es tu turno.</div>`;
        const t = TIPOS_ACCION.find((x) => x.id === (atq.accion || "accion"));
        if (atq.accion === "accion" && ficha.accionUsada) return `<div class="aviso">Ya gastaste tu acción este turno.</div>`;
        if (atq.accion === "adicional" && ficha.adicionalUsada) return `<div class="aviso">Ya gastaste tu acción adicional.</div>`;
        return `<div class="mini">Consume: <b>${t ? t.label : "Acción"}</b></div>`;
      })() : ""}
      <div class="grid2" style="margin-top:6px">
        ${campo("Característica", `<select data-t="stat">${STAT_KEYS.map((k) => `<option value="${k}" ${statSel === k ? "selected" : ""}>${STAT_LABEL[k]}</option>`).join("")}</select>`)}
        ${campo(`Empujes (${costeEmpuje}E c/u)`, `<div class="fila"><button class="btn" data-empuje="-1">−</button><input class="num" data-t="empujes" type="number" min="0" value="${empujes}"><button class="btn" data-empuje="1">+</button></div>`)}
      </div>
      <div class="mini" style="margin-top:6px">
        Pool ${p.pool}d6${empujes ? ` + ${empujes}` : ""}${(ficha.estados || []).includes("herido") ? " (Herido −1)" : ""} ·
        Interferencia ${interf > 0 ? `−${interf}` : "0"} ·
        ${costoTotal ? `cuesta ${costoTotal} Esencia (tienes ${d.esencia})` : "sin costo"}
      </div>
      ${dc && dc.rd > 0 ? `<div class="aviso">RD ${dc.rd}%. ${dc.anulada ? "Anulada por tu arma." : "Necesitas un arma de Rango " + RANGOS[rangoObj] + "."}</div>` : ""}
      ${costoTotal > d.esencia ? `<div class="aviso">No te alcanza la Esencia.</div>` : ""}
      <div class="fila" style="margin-top:8px">
        ${(() => {
          const dist = obj ? distanciaEntre(ficha.id, ficha.nombre, obj.id, obj.nombre) : null;
          const alc = atq.alcance != null ? atq.alcance : 1;
          const lejos = dist != null && alc > 0 && dist > alc;
          const sinAccion = turnos && (
            (!esMiTurno()) ||
            (atq.accion === "accion" && ficha.accionUsada) ||
            (atq.accion === "adicional" && ficha.adicionalUsada));
          return `<button class="btn ${lejos ? "" : "fuerte"}" data-accion="atacar"
            style="${lejos ? "border-color:var(--carmesi);color:var(--carmesi)" : ""}"
            ${costoTotal > d.esencia || sinAccion ? "disabled" : ""}>
            ${lejos ? "Atacar igualmente" : "Atacar"}${dc ? ` (${dc.final} si conecta)` : ""}
          </button>`;
        })()}
        <button class="btn" data-accion="esquivar">Esquivar (1E)</button>
      </div>
    </div>

    ${(() => {
      const emp = (ficha.habilidades || []).flatMap((h) => h.efectos || []).find((e) => e.tipo === "empujar_aliado");
      if (!emp) return "";
      const otros = Object.values(party).filter((p) => p.id !== ficha.id);
      if (!otros.length) return "";
      return `<div class="card">
        <label class="lbl">Empujar la tirada de un aliado (${ALCANCE_EMPUJAR} casillas)</label>
        <div>${otros.map((p) => {
          const dd = distanciaEntre(ficha.id, ficha.nombre, p.id, p.nombre);
          const lejos = dd != null && dd > ALCANCE_EMPUJAR;
          return `<button class="chip" data-empujar-a="${p.id}" ${lejos ? "disabled style=\"opacity:.4\"" : ""}>${esc(p.nombre)}${dd != null ? ` · ${dd}` : ""}</button>`;
        }).join("")}</div>
        <div class="mini" style="margin-top:3px">Los dados van a TU Grieta.</div>
      </div>`;
    })()}
    ${ficha._ocultarN ? `
      <div class="card" style="border-color:var(--carmesi)">
        <label class="lbl">Elige a quién ocultas (${ficha._ocultarN})</label>
        <div>
          ${Object.values(party).filter((p) => p.id !== ficha.id).map((p) =>
            `<button class="chip ${(ficha._ocultarSel || []).includes(p.id) ? "on" : ""}" data-ocultar="${p.id}">${esc(p.nombre)}</button>`).join("")
            || '<span class="mini">No hay aliados conectados.</span>'}
        </div>
        <div class="fila" style="margin-top:6px">
          <button class="btn fuerte" data-accion="confirmar-ocultar">Ocultarlos</button>
          <button class="btn" data-accion="cancelar-ocultar">Cancelar</button>
        </div>
      </div>` : ""}
    ${ultimaTirada ? `
      <div class="card">
        <div class="zona-dados">${ultimaTirada.dados.map((v, i) => `<span class="dado ${ultimaTirada.animando ? "rodando" : (v === ultimaTirada.alto ? "alto asentado" : "asentado")}" data-dado="${i}">${ultimaTirada.animando ? 1 + Math.floor(Math.random() * 6) : v}</span>`).join("")}</div>
        ${ultimaTirada.animando
          ? `<div class="lectura" style="opacity:.5">…</div>`
          : `<div class="lectura">${TEXTO_LECTURA[ultimaTirada.lectura]}${ultimaTirada.interf ? ` · ${ultimaTirada.alto} − ${ultimaTirada.interf} = ${ultimaTirada.efectivo}` : ""}</div>
             ${ultimaTirada.resumen ? `<div class="mini" style="margin-top:4px">${esc(ultimaTirada.resumen)}</div>` : ""}`}
      </div>` : ""}
  `;
}

function MOB_RESIST_LOCAL(rango) {
  return [10, 20, 30, 40, 50, 60, 70][rango];
}

// ---------- EQUIPO ----------
// Desplegable de efectos ordenado por grupos.
function opcionesEfecto(sel) {
  return GRUPOS_EFECTO.map((g) => {
    const dentro = TIPOS_EFECTO.filter((t) => t.grupo === g);
    if (!dentro.length) return "";
    return `<optgroup label="${g}">` +
      dentro.map((t) => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${t.label.replace(/^(REACCIÓN|PRECIO) · /, "")}</option>`).join("") +
      `</optgroup>`;
  }).join("");
}

// Campos extra según el parámetro que pida el efecto.
function extrasEfecto(ef, te, attr, key) {
  let h = "";
  if (te.param === "estado") {
    h += `<select ${attr} data-${key}="estado" style="max-width:96px">${ESTADOS.map((e) => `<option value="${e.id}" ${(ef.estado || "herido") === e.id ? "selected" : ""}>${e.label}</option>`).join("")}</select>`;
  }
  if (te.param === "stat") {
    h += `<select ${attr} data-${key}="stat" style="max-width:110px">${STAT_KEYS.map((k) => `<option value="${k}" ${(ef.stat || "instinto") === k ? "selected" : ""}>${STAT_LABEL[k]}</option>`).join("")}</select>`;
  }
  if (te.param === "forma") {
    h += `<select ${attr} data-${key}="forma" style="max-width:130px"><option value="">— elige forma —</option>${(ficha.formas || []).map((fm) => `<option value="${fm.id}" ${ef.forma === fm.id ? "selected" : ""}>${esc(fm.nombre || "sin nombre")}</option>`).join("")}</select>`;
  }
  if (te.param === "invis") {
    h += `<select ${attr} data-${key}="rompe" style="max-width:150px">${ROTURAS_INVIS.map((rr) => `<option value="${rr.id}" ${(ef.rompe || "atacar") === rr.id ? "selected" : ""}>${rr.label}</option>`).join("")}</select>`;
  }
  return h;
}

function editorPasivas(pasivas, prefijo) {
  return `
    ${(pasivas || []).map((p, k) => {
      const tp = TIPOS_PASIVA.find((t) => t.id === p.tipo) || TIPOS_PASIVA[0];
      return `<div class="fila" style="margin-top:4px">
        <select data-pas="${prefijo}|${k}" data-pask="tipo">
          ${TIPOS_PASIVA.map((t) => `<option value="${t.id}" ${p.tipo === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
        </select>
        ${tp.unidad ? `<input class="num" data-pas="${prefijo}|${k}" data-pask="valor" type="number" value="${p.valor}" style="max-width:62px">` : ""}
        ${tp.param === "stat" ? `<select data-pas="${prefijo}|${k}" data-pask="stat" style="max-width:96px">${STAT_KEYS.map((x) => `<option value="${x}" ${p.stat === x ? "selected" : ""}>${STAT_LABEL[x]}</option>`).join("")}</select>` : ""}
        ${tp.param === "estado" ? `<select data-pas="${prefijo}|${k}" data-pask="estado" style="max-width:96px">${ESTADOS.map((e) => `<option value="${e.id}" ${p.estado === e.id ? "selected" : ""}>${e.label}</option>`).join("")}</select>` : ""}
        <button class="btn" data-quitar-pas="${prefijo}|${k}" style="flex:0 0 auto;padding:2px 6px">×</button>
      </div>
      ${(tp.param === "forma" || tp.param === "auto_estado") ? `<div class="fila" style="margin:3px 0 0 10px">
        ${tp.param === "forma" ? `<select data-pas="${prefijo}|${k}" data-pask="forma" style="max-width:130px">
          <option value="">— elige forma —</option>
          ${(ficha.formas || []).map((fm) => `<option value="${fm.id}" ${p.forma === fm.id ? "selected" : ""}>${esc(fm.nombre || "sin nombre")}</option>`).join("")}
        </select>` : ""}
        ${tp.param === "auto_estado" ? `<select data-pas="${prefijo}|${k}" data-pask="estadoAuto" style="max-width:110px">
          ${ESTADOS.map((e) => `<option value="${e.id}" ${(p.estadoAuto || "invisible") === e.id ? "selected" : ""}>${e.label}</option>`).join("")}
        </select>` : ""}
        <select data-pas="${prefijo}|${k}" data-pask="cond">
          ${CONDICIONES.map((c) => `<option value="${c.id}" ${(p.cond || "pv_bajo") === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
        </select>
        ${(CONDICIONES.find((c) => c.id === (p.cond || "pv_bajo")) || {}).unidad
          ? `<input class="num" data-pas="${prefijo}|${k}" data-pask="umbral" type="number" value="${p.umbral != null ? p.umbral : 50}" style="max-width:58px">` : ""}
        ${(p.cond === "estado") ? `<select data-pas="${prefijo}|${k}" data-pask="estado" style="max-width:96px">${ESTADOS.map((e) => `<option value="${e.id}" ${p.estado === e.id ? "selected" : ""}>${e.label}</option>`).join("")}</select>` : ""}
      </div>` : ""}`;
    }).join("")}
    <button class="btn" data-add-pas="${prefijo}" style="margin-top:4px;padding:2px 8px">+ pasiva</button>`;
}

function vistaEquipo() {
  const d = derivar(ficha);
  return `
    <div class="card grid3">
      <div class="kpi"><div class="k">Dominio</div><div class="v">${d.dominio}%</div></div>
      <div class="kpi"><div class="k">Resistencia</div><div class="v">${d.resistenciaAplicada}%</div></div>
      <div class="kpi"><div class="k">Daño arma</div><div class="v">${d.danoArma}</div></div>
    </div>
    ${d.resistencia > 50 ? `<div class="aviso">Suma ${d.resistencia}%, pero el tope es 50%.</div>` : ""}
    ${d.avisos.length ? `<div class="aviso">${d.avisos.map(esc).join("<br>")}</div>` : ""}

    <div class="banda">ARMA</div>
    <div class="card">
      <div class="grid2">
        ${campo("Nombre", `<input data-a="nombre" value="${esc(ficha.arma.nombre)}">`)}
        ${campo("Tipo", `<select data-a="tipo">${TIPOS_ARMA.map((t) => `<option value="${t.id}" ${ficha.arma.tipo === t.id ? "selected" : ""}>${t.label} (${t.manos}m)</option>`).join("")}</select>`)}
      </div>
      <div class="grid2" style="margin-top:6px">
        ${campo("Daño base (automático)", `<div class="${"num"}" style="padding:4px 6px;background:var(--pergamino);border:1px solid var(--borde);border-radius:3px">${d.arma.base}${d.arma.mult !== 1 ? ` ×${d.arma.mult} = ${d.arma.total}` : ""}</div>`)}
        ${campo("Rango de Arma", `<select data-a="rangoArma">${RANGOS.map((r, i) => `<option value="${i + 1}" ${ficha.arma.rangoArma === i + 1 ? "selected" : ""}>${r}</option>`).join("")}</select>`)}
      </div>
      <div class="mini" style="margin-top:5px">
        El daño base es el de tu Rango (${RANGOS[ficha.rango]}), salvo que el arma sea de un Rango mayor — ahora usa ${RANGOS[d.arma.rangoUsado - 1]}.<br>
        Daño = (${d.arma.total} + ${d.mod * 2 * d.rangoNum}) × ${(1 + d.dominio / 100).toFixed(2)} = <b>${d.danoArma}</b>
      </div>
    </div>

    <div class="banda">MEMORIAS</div>
    ${ficha.memorias.map((m, i) => {
      const bloqueada = d.bloqueaMano2 && i === 6;
      const max = m.rangoOrigen * 2 + m.claseOrigen + 1;
      const usado = (m.dominioPts || 0) + (m.resistenciaPts || 0);
      return `<div class="card" style="${bloqueada ? "opacity:.5" : ""}">
        ${bloqueada ? `<div class="mini" style="color:var(--carmesi);margin-bottom:4px">Ocupada por tu arma a dos manos.</div>` : ""}
        <div class="fila">
          <div style="flex:1.4">${campo(MEMORIA_SLOTS[i], `<input data-m="${i}" data-mk="nombre" value="${esc(m.nombre)}" placeholder="—">`)}</div>
          <div>${campo("Rango", `<select data-m="${i}" data-mk="rangoOrigen">${RANGOS.map((r, j) => `<option value="${j + 1}" ${m.rangoOrigen === j + 1 ? "selected" : ""}>${r.slice(0, 4)}</option>`).join("")}</select>`)}</div>
          <div>${campo("Clase", `<select data-m="${i}" data-mk="claseOrigen">${CLASES.map((c, j) => `<option value="${j + 1}" ${m.claseOrigen === j + 1 ? "selected" : ""}>${c.slice(0, 4)}</option>`).join("")}</select>`)}</div>
        </div>
        <div class="fila" style="margin-top:4px">
          <div>${campo("Dominio", `<input class="num" data-m="${i}" data-mk="dominioPts" type="number" value="${m.dominioPts}">`)}</div>
          <div>${campo("Resist.", `<input class="num" data-m="${i}" data-mk="resistenciaPts" type="number" value="${m.resistenciaPts}">`)}</div>
          <div style="text-align:center"><span class="mini">${usado}/${max}</span></div>
        </div>
        ${(() => {
          const h = m.hab || { modo: "ninguna" };
          return `
          <div style="margin-top:6px;border-top:1px solid var(--borde);padding-top:5px">
            <div class="fila">
              <div>${campo("Habilidad de la Memoria", `<select data-mh="${i}" data-mhk="modo">
                <option value="ninguna" ${h.modo === "ninguna" ? "selected" : ""}>— ninguna —</option>
                <option value="pasiva" ${h.modo === "pasiva" ? "selected" : ""}>Pasiva</option>
                <option value="activa" ${h.modo === "activa" ? "selected" : ""}>Activa</option>
              </select>`)}</div>
              ${h.modo !== "ninguna" ? `<div>${campo("Nombre", `<input data-mh="${i}" data-mhk="nombre" value="${esc(h.nombre || "")}">`)}</div>` : ""}
            </div>
            ${h.modo === "activa" ? `
              <div class="fila" style="margin-top:4px">
                <div>${campo("Perfil", `<select data-mh="${i}" data-mhk="perfil">${PERFILES_HABILIDAD.map((pp) => `<option value="${pp.id}" ${h.perfil === pp.id ? "selected" : ""}>${pp.label}</option>`).join("")}</select>`)}</div>
                <div>${campo("Usos/combate", `<input class="num" data-mh="${i}" data-mhk="usosMax" type="number" min="0" value="${h.usosMax || 0}">`)}</div>
              </div>
              ${(h.efectos || []).map((ef, j) => {
                const te = TIPOS_EFECTO.find((t) => t.id === ef.tipo) || TIPOS_EFECTO[0];
                return `<div class="fila" style="margin-top:4px">
                  <select data-mef="${i}|${j}" data-mefk="tipo">${opcionesEfecto(ef.tipo)}</select>
                  ${te.unidad ? `<input class="num" data-mef="${i}|${j}" data-mefk="valor" type="number" value="${ef.valor}" style="max-width:62px">` : ""}
                  ${extrasEfecto(ef, te, `data-mef="${i}|${j}"`, "mefk")}
${te.param === "invis" ? `<select data-mef="${i}|${j}" data-mefk="rompe" style="max-width:150px">${ROTURAS_INVIS.map((rr) => `<option value="${rr.id}" ${(ef.rompe || "atacar") === rr.id ? "selected" : ""}>${rr.label}</option>`).join("")}</select>` : ""}
                  ${te.tope ? `<input class="num" data-mef="${i}|${j}" data-mefk="tope" type="number" value="${ef.tope != null ? ef.tope : 25}" style="max-width:52px" title="tope % de tu vida">` : ""}
                  <button class="btn" data-quitar-mef="${i}|${j}" style="flex:0 0 auto;padding:2px 6px">×</button>
                </div>`;
              }).join("")}
              <button class="btn" data-add-mef="${i}" style="margin-top:4px;padding:2px 8px">+ efecto</button>
            ` : ""}
            ${h.modo === "pasiva" ? editorPasivas(h.pasivas, `mem|${i}`) : ""}
            ${h.modo !== "ninguna" ? `<input data-mh="${i}" data-mhk="descripcion" value="${esc(h.descripcion || "")}" placeholder="Qué hace" style="margin-top:4px">` : ""}
          </div>`;
        })()}
      </div>`;
    }).join("")}
  `;
}

// ---------- GRUPO ----------
function vistaGrupo() {
  const lista = Object.values(party);
  if (!dentroDeOwlbear) {
    return `<div class="card mini">El grupo se sincroniza solo dentro de una sala de Owlbear Rodeo.</div>`;
  }
  if (!lista.length) return `<div class="card mini">Nadie ha publicado su ficha todavía.</div>`;
  return `
    <div class="card">
      ${lista.map((p) => `
        <div class="fila-pj">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <b>${esc(p.nombre)}</b>
            <span class="mini">${RANGOS[p.rango] || ""}</span>
          </div>
          <div class="mini">PV ${p.pv}/${p.pvMax} · Esencia ${p.esencia}/${p.esenciaMax} · Grieta ${p.grieta}/3</div>
          <div class="barra"><i style="width:${clamp((p.pv / p.pvMax) * 100, 0, 100)}%"></i></div>
          <div class="barra ese"><i style="width:${clamp((p.esencia / p.esenciaMax) * 100, 0, 100)}%"></i></div>
          ${p.forma ? `<div class="mini">Forma: <b>${esc(p.forma)}</b></div>` : ""}
          ${(p.efectos || []).length ? `<div class="mini">Efectos: ${p.efectos.map(esc).join(" · ")}</div>` : ""}
          ${p.pv <= 0 ? `<div class="mini" style="color:var(--carmesi)">Caído · fallos ${p.caidoFallos}/3</div>` : ""}
          ${(p.estados || []).length ? `<div style="margin-top:2px">${p.estados.map((e) => `<span class="chip on">${esc((ESTADOS.find((x) => x.id === e) || {}).label || e)}</span>`).join("")}</div>` : ""}
        </div>`).join("")}
    </div>
    ${miRol === "GM" ? `<div class="card">
      <label class="lbl">Como DM</label>
      <button class="btn fuerte" data-accion="recargar-grupo">Recargar Esencia de todos</button>
      <div class="mini" style="margin-top:4px">Al superar una Pesadilla o un descubrimiento importante.</div>
    </div>` : ""}
  `;
}

// ---------- BESTIARIO ----------
function vistaTrasfondo() {
  const t = ficha.trasfondo || {};
  const d0 = derivar(ficha);
  return `
    <div class="banda">RETRATO</div>
    <div class="card">
      <div class="fila">
        <div style="flex:1">${campo("Enlace a la imagen", `<input data-tr="imagen" value="${esc(t.imagen || "")}" placeholder="https://.../imagen.png">`)}</div>
        <button class="btn" data-accion="ver-retrato" style="flex:0 0 auto">Ver</button>
      </div>
      ${retratoDe(ficha) ? `<div id="zona-retrato" style="margin-top:6px">
          ${(d0 && d0.forma && d0.forma.imagen)
            ? `<div class="mini" style="margin-bottom:3px">Se muestra la imagen de tu forma <b>${esc(d0.forma.nombre || "activa")}</b>.</div>` : ""}
          <img src="${esc(retratoDe(ficha))}" alt=""
            style="width:100%;max-height:280px;object-fit:cover;border-radius:6px;border:1px solid var(--borde)"
            onload="var a=document.getElementById('fallo-retrato'); if(a) a.style.display='none';"
            onerror="this.style.display='none'; var a=document.getElementById('fallo-retrato'); if(a) a.style.display='block';">
          <div id="fallo-retrato" class="aviso" style="display:none">
            No se pudo cargar esa imagen. Comprueba que el enlace termine en .png, .jpg o .webp
            y que sea el enlace directo al archivo, no el de una página.
          </div>
        </div>` : ""}
      <div class="mini" style="margin-top:5px">
        <b>Qué enlaces sirven:</b> los que terminan en <b>.png .jpg .jpeg .gif .webp</b>.<br>
        · <b>Discord</b>: sube la imagen a un chat, botón derecho sobre ella → «Copiar enlace de la imagen».<br>
        · <b>Imgur</b>: sube y usa el enlace directo (i.imgur.com/...).<br>
        · <b>No sirven</b>: Google Drive, Google Fotos, ni el enlace de una página que contiene la imagen.
      </div>
    </div>

    <div class="banda">EL DELITO</div>
    <div class="card">
      ${campo("¿Por qué te exiliaron al Abismo?", `<textarea data-tr="delito" rows="3">${esc(t.delito || "")}</textarea>`)}
      <div style="margin-top:6px">
        <label class="lbl">¿Eres culpable?</label>
        ${[["si", "Sí, y lo sé"], ["no", "No, pagué por otro"], ["no_seguro", "Ya no lo sé"]].map((o) =>
          `<button class="chip ${(t.culpable || "no_seguro") === o[0] ? "on" : ""}" data-culpable="${o[0]}">${o[1]}</button>`).join("")}
      </div>
    </div>

    <div class="banda">QUÉ TE MANTIENE CON VIDA</div>
    <div class="card">
      ${MOTIVACIONES.map((mv, i) => `<button class="chip ${(t.motivaciones || [])[i] ? "on" : ""}" data-motiv="${i}">${esc(mv)}</button>`).join("")}
      <div style="margin-top:6px">
        ${campo("Otra razón", `<input data-tr="otra" value="${esc(t.otra || "")}">`)}
      </div>
    </div>

    <div class="banda">QUIÉN ERES</div>
    <div class="card">
      ${campo("Apariencia", `<textarea data-tr="apariencia" rows="3">${esc(t.apariencia || "")}</textarea>`)}
      <div style="margin-top:6px">
        ${campo("Historia, personalidad y vínculos", `<textarea data-tr="personalidad" rows="8">${esc(t.personalidad || "")}</textarea>`)}
      </div>
    </div>

    <div class="banda">COPIA DE SEGURIDAD</div>
    <div class="card">
      <div class="fila">
        <button class="btn" data-accion="exportar">Copiar mi ficha</button>
        <button class="btn" data-accion="importar">Pegar una ficha</button>
      </div>
      ${ficha._codigo ? `<textarea rows="3" style="margin-top:4px" readonly>${esc(ficha._codigo)}</textarea>
        <div class="mini">${ficha._copiado === true
          ? "Copiado al portapapeles. Pégalo en el otro dispositivo."
          : "Selecciona todo el texto de arriba y cópialo a mano (el portapapeles está bloqueado dentro de Owlbear)."}</div>` : ""}
      ${ficha._importando ? `<textarea rows="3" style="margin-top:4px" data-pegar placeholder="Pega aquí el texto de tu ficha"></textarea>
        <button class="btn fuerte" data-accion="confirmar-importar" style="margin-top:4px">Cargar</button>` : ""}
      <div class="mini" style="margin-top:3px">Tu ficha se guarda por cuenta de Owlbear. Usa esto para llevarla a otro dispositivo.</div>
    </div>
  `;
}

function vistaBestias() {
  return `
    <div class="card">
      <div class="mini">Tus criaturas guardadas. Se quedan aquí entre sesiones y las sueltas en el encuentro con un toque.</div>
    </div>
    ${!bestiario.length ? `<div class="card mini">Todavía no has guardado ninguna. Configura una en el Bestiario (pasivas, habilidades) y pulsa <b>Guardar</b>.</div>` : ""}
    ${bestiario.map((p) => {
      const f = fichaMob(p.rango, p.clase);
      return `<div class="card">
        ${p.imagen ? `<img src="${esc(p.imagen)}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:5px;margin-bottom:5px" onerror="this.style.display='none'">` : ""}
        <div class="fila">
          <input data-bnom="${p.id}" value="${esc(p.nombre)}">
          <button class="btn" data-bborrar="${p.id}" style="flex:0 0 auto;padding:2px 8px">×</button>
        </div>
        <div class="mini" style="margin-top:3px">
          ${CLASES[p.clase]} ${RANGOS[p.rango]} · ${f.pv} PV · ${f.resistencia}% · pega ${f.dano}
          ${(p.pasivas || []).length ? ` · ${p.pasivas.length} pasiva(s)` : ""}
          ${(p.habilidades || []).length ? ` · ${p.habilidades.map((h) => esc(h.nombre || "habilidad")).join(", ")}` : ""}
        </div>
        <div class="fila" style="margin-top:5px">
          <button class="btn fuerte" data-bsoltar="${p.id}|1">Añadir</button>
          <button class="btn" data-bsoltar="${p.id}|3">×3</button>
          <button class="btn" data-bsoltar="${p.id}|5">×5</button>
        </div>
      </div>`;
    }).join("")}
  `;
}

function vistaFichas() {
  const lista = Object.values(hojas);
  const sel = ficha._fichaSel || (lista[0] ? lista[0].id : null);
  const h = hojas[sel];
  const nom = { cuerpo: "Cuerpo", instinto: "Instinto", mente: "Mente", voluntad: "Voluntad" };
  return `
    <div class="card">
      <div class="mini">Fichas completas de todos. Se actualizan solas.</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
        ${lista.map((x) => `
          <button data-fichasel="${x.id}" style="display:flex;flex-direction:column;align-items:center;gap:3px;
            width:74px;padding:5px 3px;border-radius:6px;cursor:pointer;font:inherit;
            background:${sel === x.id ? "var(--carmesi)" : "var(--crema)"};
            color:${sel === x.id ? "var(--crema)" : "var(--tinta)"};
            border:1px solid ${sel === x.id ? "var(--carmesi)" : "var(--borde)"}">
            ${x.img
              ? `<img src="${esc(x.img)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:50%;border:2px solid var(--oro)" onerror="this.replaceWith(document.createTextNode(''))">`
              : `<span style="width:52px;height:52px;border-radius:50%;border:2px dashed var(--borde);display:flex;align-items:center;justify-content:center;font-size:20px">${esc((x.n || "?").slice(0, 1))}</span>`}
            <span style="font-size:10px;line-height:1.1;text-align:center">${esc(x.n)}</span>
          </button>`).join("") || '<span class="mini">Nadie conectado.</span>'}
      </div>
    </div>
    ${esperandoFicha ? `<div class="card mini">Pidiendo la ficha… debe tener la extensión abierta.</div>` : ""}
    ${!h ? "" : `
    <div class="banda">${esc(h.n).toUpperCase()} · ${RANGOS[h.r] || ""} · nivel ${h.nv}</div>
    ${h.img ? `<div class="card" style="padding:6px">
      <img src="${esc(h.img)}" alt="" style="width:100%;max-height:300px;object-fit:cover;border-radius:6px"
        onerror="this.parentElement.style.display='none'">
    </div>` : ""}
    <div class="card">
      <div class="grid4">
        ${STAT_KEYS.map((k) => `<div class="kpi"><div class="k">${nom[k]}</div><div class="v">${h.ste[k]}${h.ste[k] !== h.st[k] ? `<span style="font-size:10px"> (${h.st[k]})</span>` : ""}</div></div>`).join("")}
      </div>
      <div class="grid4" style="margin-top:6px">
        <div class="kpi"><div class="k">PV</div><div class="v">${h.pv}/${h.pvM}</div></div>
        <div class="kpi"><div class="k">Esencia</div><div class="v">${h.es}/${h.esM}</div></div>
        <div class="kpi"><div class="k">Grieta</div><div class="v">${h.gr}/3</div></div>
        <div class="kpi"><div class="k">Daño</div><div class="v">${h.dano}</div></div>
      </div>
      <div class="mini" style="margin-top:6px">
        Dominio <b>${h.dom}%</b> · Resistencia <b>${h.resA}%</b>${h.res !== h.resA ? ` (suma ${h.res}%)` : ""} ·
        Arma: ${esc(h.arma.n || "sin nombre")} (base ${h.arma.db}, Rango ${RANGOS[h.arma.ra - 1] || h.arma.ra})
      </div>
      ${(h.est || []).length ? `<div style="margin-top:5px">${h.est.map((e) => `<span class="chip on">${esc((ESTADOS.find((x) => x.id === e) || {}).label || e)}</span>`).join("")}</div>` : ""}
    </div>

    <div class="banda">ASPECTO</div>
    <div class="card">
      <div><b>${esc(h.asp || "sin nombre")}</b> <span class="mini">rige con ${nom[h.aspSt] || h.aspSt}</span></div>
      ${h.def ? `<div class="mini" style="margin-top:4px"><b>Defecto:</b> ${esc(h.def)}</div>` : ""}
      ${h.hab.length ? h.hab.map((x) => `
        <div style="margin-top:6px;border-top:1px dashed var(--borde);padding-top:5px">
          <b>${esc(x.n || "sin nombre")}</b>
          <span class="mini">· ${x.p}${x.c ? ` · ${x.c}E` : ""}${x.m ? ` · ${x.u}/${x.m} usos` : x.u ? ` · usada ×${x.u}` : ""}</span>
          ${x.e.length ? `<div class="mini">${x.e.map(esc).join(" · ")}</div>` : ""}
        </div>`).join("") : '<div class="mini" style="margin-top:4px">Sin habilidades.</div>'}
    </div>

    ${h.pas.length ? `<div class="banda">PASIVAS EN JUEGO</div>
    <div class="card">${h.pas.map((p) => `<span class="chip on">${esc(p)}</span>`).join("")}</div>` : ""}

    ${h.fm.length ? `<div class="banda">FORMAS</div>
    <div class="card">
      ${h.fm.map((f2) => `<div style="margin-bottom:5px">
        <b>${esc(f2.n || "sin nombre")}</b>${f2.act ? ' <span class="forma-activa">activa</span>' : ""}
        <div class="mini">${f2.s && f2.s !== "ninguna" ? `${nom[f2.s]} +${f2.sc}` : "sin subida"}${f2.b && f2.b !== "ninguna" ? ` · ${nom[f2.b]} −${f2.bc}` : ""}${f2.d ? ` · Dominio ${f2.d > 0 ? "+" : ""}${f2.d}%` : ""}${f2.r ? ` · Resist. ${f2.r > 0 ? "+" : ""}${f2.r}%` : ""}${f2.c && f2.c !== "normal" ? ` · curación ${f2.c}` : ""}</div>
        ${f2.h.length ? `<div class="mini">Habilidades: ${f2.h.map(esc).join(" · ")}</div>` : ""}
      </div>`).join("")}
    </div>` : ""}

    ${h.mem.length ? `<div class="banda">MEMORIAS</div>
    <div class="card">
      ${h.mem.map((m2) => `<div class="fila-pj">
        <div style="display:flex;justify-content:space-between">
          <b>${esc(m2.n || "—")}</b><span class="mini">${m2.s}</span>
        </div>
        <div class="mini">Dominio ${m2.d} · Resist. ${m2.r} · de ${CLASES[m2.co - 1] || ""} ${RANGOS[m2.ro - 1] || ""}${m2.h ? ` · ${esc(m2.h)}` : ""}</div>
      </div>`).join("")}
    </div>` : ""}

    ${h.atr ? `<div class="banda">ATRIBUTOS</div><div class="card mini">${esc(h.atr)}</div>` : ""}

    ${(h.tr && (h.tr.del || h.tr.hist || h.tr.ap)) ? `<div class="banda">TRASFONDO</div>
    <div class="card">
      ${h.tr.del ? `<div><b>Delito:</b> <span class="mini">${esc(h.tr.del)}</span></div>` : ""}
      ${h.tr.cul ? `<div class="mini">Culpable: ${h.tr.cul === "si" ? "sí, y lo sabe" : h.tr.cul === "no" ? "no, pagó por otro" : "ya no lo sabe"}</div>` : ""}
      ${(h.tr.mot || []).some((x) => x) ? `<div style="margin-top:4px">${(h.tr.mot || []).map((x, i) => x ? `<span class="chip on">${esc(MOTIVACIONES[i] || "")}</span>` : "").join("")}</div>` : ""}
      ${h.tr.ap ? `<div class="mini" style="margin-top:4px"><b>Apariencia:</b> ${esc(h.tr.ap)}</div>` : ""}
      ${h.tr.hist ? `<div class="mini" style="margin-top:4px"><b>Historia:</b> ${esc(h.tr.hist)}</div>` : ""}
    </div>` : ""}

    <div class="card">
      <button class="btn fuerte" data-pedir="${h.id}">Editar esta ficha</button>
      <button class="btn" data-expulsar="${h.id}">Sacar a ${esc(h.n)} de la mesa</button>
      <div class="mini" style="margin-top:4px">
        <b>Editar</b> te trae su ficha completa: podrás tocar habilidades, efectos, formas, Memorias y
        trasfondo con la misma interfaz de siempre, y al guardar se aplica en su dispositivo.<br>
        <b>Sacar de la mesa</b> es para quitar fichas fantasma (pestañas de incógnito, pruebas…).
      </div>
    </div>`}
  `;
}

function vistaMesa() {
  const lista = Object.values(party);
  const mobsL = Object.values(mobs);
  const sel = ficha._mesaSel || (lista[0] ? lista[0].id : null);
  const p = party[sel];
  return `
    <div class="card">
      <div class="mini">Controlas PV, Esencia, Grieta y estados de cualquiera. Los cambios llegan a su ficha.</div>
      <div style="margin-top:6px">
        ${lista.map((x) => `<button class="chip ${sel === x.id ? "on" : ""}" data-mesa="${x.id}">${esc(x.nombre)}</button>`).join("") || '<span class="mini">Nadie ha abierto la extensión todavía.</span>'}
      </div>
    </div>

    ${p ? `
    <div class="banda">${esc(p.nombre).toUpperCase()} · ${RANGOS[p.rango] || ""}</div>
    <div class="card">
      <div class="grid3" style="margin-bottom:8px">
        <div class="kpi"><div class="k">PV</div><div class="v">${p.pv}/${p.pvMax}</div></div>
        <div class="kpi"><div class="k">Esencia</div><div class="v">${p.esencia}/${p.esenciaMax}</div></div>
        <div class="kpi"><div class="k">Grieta</div><div class="v">${p.grieta}/3</div></div>
      </div>
      ${p.forma ? `<div class="mini">Forma: <b>${esc(p.forma)}</b>${p.curacion && p.curacion !== "normal" ? ` · curación ${esc(p.curacion)}` : ""}</div>` : ""}
      ${(p.efectos || []).length ? `<div class="mini">Efectos: ${p.efectos.map(esc).join(" · ")}</div>` : ""}
      ${p.pv <= 0 ? `<div class="aviso">Caído · fallos ${p.caidoFallos}/3</div>` : ""}

      <label class="lbl" style="margin-top:8px">Vida</label>
      <div class="fila">
        <input class="num" data-mesa-in="dPv" type="number" placeholder="cantidad" style="max-width:80px" value="${ficha._mesaIn && ficha._mesaIn.dPv != null ? ficha._mesaIn.dPv : ""}">
        <button class="btn fuerte" data-mesa-acc="danar">Quitar PV</button>
        <button class="btn" data-mesa-acc="curar">Curar</button>
      </div>

      <label class="lbl" style="margin-top:8px">Esencia</label>
      <div class="fila">
        <input class="num" data-mesa-in="dEsencia" type="number" placeholder="cantidad" style="max-width:80px" value="${ficha._mesaIn && ficha._mesaIn.dEsencia != null ? ficha._mesaIn.dEsencia : ""}">
        <button class="btn" data-mesa-acc="quitarEsencia">Quitar</button>
        <button class="btn" data-mesa-acc="darEsencia">Dar</button>
      </div>

      <label class="lbl" style="margin-top:8px">Grieta</label>
      <div style="margin-bottom:6px">
        ${[0, 1, 2, 3].map((n) => `<button class="chip ${p.grieta === n ? "on" : ""}" data-mesa-grieta="${n}">${n}</button>`).join("")}
      </div>

      <label class="lbl">Estados</label>
      <div>
        ${LISTA_ESTADOS.map((e) => `<button class="chip ${(p.estados || []).includes(e.id) ? "on" : ""}" data-mesa-estado="${e.id}" title="${esc(e.desc)}">${e.label}</button>`).join("")}
      </div>

      <div class="fila" style="margin-top:10px">
        <button class="btn fuerte" data-mesa-acc="recargar">Recargar todo</button>
        <button class="btn" data-mesa-acc="limpiarBuffs">Quitar buffs</button>
        <button class="btn" data-expulsar="${p.id}">Sacar de la mesa</button>
      </div>
    </div>` : ""}

    ${Object.values(party).some((x) => x.eco) ? `
    <div class="banda">ECOS INVOCADOS</div>
    <div class="card">
      ${Object.values(party).filter((x) => x.eco).map((x) => `
        <div class="fila-pj">
          <div style="display:flex;justify-content:space-between">
            <b>${esc(x.eco.nombre)}</b>
            <span class="mini">de ${esc(x.nombre)} · ${x.eco.pv}/${x.eco.pvMax} · pega ${x.eco.dano}</span>
          </div>
          <div class="barra"><i style="width:${clamp((x.eco.pv / x.eco.pvMax) * 100, 0, 100)}%"></i></div>
          <div class="fila" style="margin-top:4px">
            <input class="num" data-ecodmg="${x.id}" type="number" placeholder="daño" style="max-width:76px"
                   value="${(ficha._ecoDmg || {})[x.id] || ""}">
            <button class="btn fuerte" data-golpear-eco="${x.id}">Golpear al Eco</button>
          </div>
        </div>`).join("")}
      <div class="mini" style="margin-top:4px">Si llega a 0, la sombra se deshace para siempre.</div>
    </div>` : ""}

    <div class="banda">TODO EL GRUPO</div>
    <div class="card">
      <div class="fila" style="margin-bottom:8px">
        <button class="btn fuerte" data-accion="recargar-grupo">Recargar Esencia de todos</button>
        <button class="btn" data-accion="recargar-grupo-todo">Recargar todo</button>
      </div>
      <div class="fila" style="margin-bottom:8px">
        <button class="btn" data-accion="vaciar-mesa">Vaciar la mesa</button>
      </div>
      <div class="mini" style="margin-bottom:8px">
        Borra todas las fichas de la sala. Quien siga conectado reaparece solo en un instante;
        las fichas fantasma de pestañas cerradas desaparecen para siempre.
      </div>
      ${lista.map((x) => `
        <div class="fila-pj">
          <div style="display:flex;justify-content:space-between">
            <b>${esc(x.nombre)}</b>
            <span class="mini">${x.pv}/${x.pvMax} PV · ${x.esencia}/${x.esenciaMax} E · G${x.grieta}</span>
          </div>
          <div class="barra"><i style="width:${clamp((x.pv / x.pvMax) * 100, 0, 100)}%"></i></div>
          ${(x.estados || []).length ? `<div class="mini">${x.estados.map((e) => esc((LISTA_ESTADOS.find((y) => y.id === e) || {}).label || e)).join(" · ")}</div>` : ""}
        </div>`).join("")}
    </div>

    ${mobsL.length ? `
    <div class="banda">ENEMIGOS EN JUEGO</div>
    <div class="card">
      ${mobsL.map((m) => `
        <div class="fila-pj">
          <div style="display:flex;justify-content:space-between">
            <b>${esc(m.nombre)}</b><span class="mini">${m.pv}/${m.pvMax}</span>
          </div>
          <div class="barra"><i style="width:${clamp((m.pv / m.pvMax) * 100, 0, 100)}%"></i></div>
          <div style="margin-top:4px">
            ${LISTA_ESTADOS.map((e) => `<button class="chip ${(m.estados || []).includes(e.id) ? "on" : ""}" data-mob-estado="${m.id}|${e.id}">${e.label}</button>`).join("")}
          </div>
        </div>`).join("")}
    </div>` : ""}
  `;
}

const SECCIONES_DM = [
  {
    id: "tiradas",
    titulo: "Tiradas y recursos",
    cuerpo: `
      <b>El motor</b><br>
      Tira tantos d6 como la característica (tope 5 dados). Te quedas con el más alto:
      <b>6</b> limpio · <b>4-5</b> con costo · <b>1-3</b> fallo · <b>dos 6</b> crítico.
      El crítico <b>dobla el daño</b>, tanto de PJ como de mob.<br>
      Cada 2 puntos de stat por encima de 5 dan 1 <b>Repetición</b> por escena.<br><br>
      <b>Características</b><br>
      Cuerpo (combate, aguante) · Instinto (reflejos, sigilo, Esquivar) ·
      Mente (investigar, descifrar Pesadillas) · Voluntad (resistir tu Defecto, Caída).
      Lo social se reparte entre Mente (leer, engañar) y Voluntad (imponerte).<br><br>
      <b>Tope de stat por Rango</b>: 4 · 5 · 5 · 6 · 6 · 7 · 7.<br><br>
      <b>Esencia</b> = 3 + Rango×2. Los costes son un % de tu reserva, así que pesan igual siempre:
      Empuje y Esquiva 10% · Pesada 20% · Utilidad mayor 15% · Devastadora 40%.
      Solo se recupera cuando tú lo decides.<br><br>
      <b>PV</b> = Base(Rango) + Cuerpo × 4, más lo que den las pasivas.<br><br>
      <b>Grieta</b>: cada Empuje o Esquiva suma un dado. Al llegar a 3 eliges: se activa su Defecto,
      aparece una Criatura, o pasa algo malo. Luego vuelve a 0.
    `,
  },
  {
    id: "combate",
    titulo: "Combate y reacciones",
    cuerpo: `
      <b>Cuando un mob ataca</b>, el golpe queda pendiente y el objetivo elige reacción:
      Recibir · Esquivar (Instinto) · Parry (Instinto, y al éxito limpio contraataca al punto débil) ·
      A la mitad · Invulnerable. Un aliado con la pasiva puede <b>interponerse</b> y comérselo él.<br><br>
      <b>Estados</b>: Herido (−1 dado) · Marcado (el próximo ataque ignora su Resistencia) ·
      Expuesto (no puede Esquivar) · Sellado (no puede usar habilidades).
      Duran hasta el fin del combate.<br><br>
      <b>Caída</b>: a 0 PV, tira Voluntad al inicio de tu turno. 6 te estabiliza con 1 PV,
      4-5 aguantas, 1-3 es un fallo. Tres fallos y muere. Un aliado te estabiliza con 1 Esencia.<br><br>
      <b>Daño</b> = (base del arma + Modificador × 2 × Rango) × (1 + Dominio%).
      La base del arma es la de tu Rango, salvo que el arma sea de un Rango mayor.
      Un arma a dos manos ocupa la Mano 2 y pierdes esa Memoria.<br><br>
      Al terminar, usa <b>Terminar combate</b>: limpia enemigos, buffs, estados y usos de habilidad de todos.
    `,
  },
  {
    id: "poder",
    titulo: "Diferencia de poder",
    cuerpo: `
      <b>Interferencia</b> — se resta al dado más alto: 2 por Rango de diferencia,
      0.5 por escalón de Clase. Se redondea hacia arriba solo si pasa de 1, así que
      media diferencia de Clase no estorba. La sufre siempre el de abajo.<br><br>
      <b>Reducción de Daño</b> — contra Rango superior, 50% menos por Rango (tope 100%).
      Solo se anula con un arma de ese Rango o alcanzándolo.<br><br>
      Ojo: un personaje de Nivel bajo no puede acertar a una Clase muy alta —
      la Interferencia hace imposible llegar a 4. Es intencionado.
    `,
  },
  {
    id: "encuentros",
    titulo: "Armar encuentros",
    cuerpo: `
      Para 5 jugadores, mobs de su Rango: <b>Fácil</b> 2-3 · <b>Moderado</b> 4 ·
      <b>Difícil</b> 5-6 · <b>Mortal</b> 7+ o un Jefe. El protagonista es comodín, no cuenta.<br><br>
      <b>Jefes</b>: la vida total de la manada equivalente y 2-3 acciones por ronda.<br><br>
      <b>Sensación por Clase</b> con un PJ bien equipado: Bestia y Monstruo caen en 2-3 golpes ·
      Demonio da pelea (≈5) · Diablo cuesta (≈8) · Tirano es a muerte (≈14, y él te mata en 2-3).<br><br>
      <b>Mob</b> = Clase (PV y daño) × Rango (PV) + Resistencia% por Rango.
      Los mobs admiten pasivas y habilidades propias, y puedes duplicarlos o
      guardarlos en la pestaña Bestias para soltarlos en un toque.
    `,
  },
  {
    id: "esencia",
    titulo: "Cuándo devolver Esencia",
    cuerpo: `
      · Al superar una Pesadilla (recarga completa).<br>
      · Al descubrir algo importante: un secreto, un Eco, una verdad del mundo.<br>
      · Al vencer algo muy por encima de su nivel.<br>
      · Un descanso real en un lugar seguro.<br><br>
      Es lo que ata la curiosidad a la supervivencia. Pero si recargas demasiado seguido,
      Empujar y Esquivar dejan de ser decisiones difíciles.<br><br>
      Ojo con el Support: si empuja por todo el grupo, su Grieta se llena mucho más rápido.
    `,
  },
  {
    id: "exploracion",
    titulo: "Pesadillas y recompensas",
    cuerpo: `
      Arma cada Pesadilla como nodos conectados. Investigar un nodo se tira con <b>Mente</b>:
      6 descubre lo oculto (un Eco, un atajo, una debilidad), 4-5 encuentra algo pero llama la
      atención, 1-3 nada y el tiempo corre.<br><br>
      Si descubren la <b>debilidad</b> de una criatura, ignoran su Resistencia ese combate.<br><br>
      <b>Memorias</b>: puntos = Rango del origen × 2 + índice de Clase + 1, repartidos entre
      Dominio y Resistencia. Solo las armas llevan Rango de Arma, lo único que anula la RD.
      Una Memoria puede además traer una habilidad pasiva o activa.<br><br>
      <b>Atributos</b>: rasgos menores que ganan al completar Pesadillas. No se compran.
    `,
  },
  {
    id: "aspectos",
    titulo: "Aspectos, Formas y pasivas",
    cuerpo: `
      Cada Aspecto son 2-3 habilidades base que <b>se fortalecen</b> con el Rango, más un
      Defecto obligatorio proporcional a su poder.<br><br>
      <b>Formas</b>: alteran stats (sube y baja lo que quieras, o nada), Dominio, Resistencia y
      el modo de curación. Pueden tener habilidades y pasivas propias, y una pasiva puede
      <b>transformar automáticamente</b> al cumplirse una condición (vida baja, Grieta llena,
      un estado, caer a 0…).<br><br>
      <b>El grupo</b><br>
      Cambiaformas: sus formas cambian stats, cambiar cuesta Esencia y acción.<br>
      Support: empuja por otros (los dados van a SU Grieta), cura estados, estabiliza.<br>
      Ninja: su Marca ignora la Resistencia si el objetivo está desprevenido.<br>
      Tanque: no esquiva, pero reduce a la mitad e se interpone por aliados.<br>
      Mago: repetir la misma habilidad cuesta más Esencia.
    `,
  },
  {
    id: "recordatorios",
    titulo: "Recordatorios de tono",
    cuerpo: `
      · Todo poder tiene precio. Si un Aspecto se siente cómodo, su Defecto no trabaja.<br>
      · El Defecto debería activarse varias veces por sesión, no una vez por campaña.<br>
      · La primera Pesadilla: pocos nodos, Clase Bestia o Monstruo, un solo encuentro duro.<br>
      · Nunca mates por un error de calibración tuyo. La Caída te da tres rondas para arreglarlo
      desde la ficción.<br>
      · Pelean de madrugada y a oscuras: las bestias aparecen encima sin aviso, y quien tenga
      visión nocturna vale su peso en oro.
    `,
  },
];

function vistaDM() {
  const abierta = ficha._dmAbierta || "mesa";
  const lista = Object.values(mobs);
  const pjs = Object.values(party);
  const nPJ = Math.max(1, pjs.length);
  const rangoRef = pjs.length ? Math.round(pjs.reduce((s, p) => s + p.rango, 0) / pjs.length) : ficha.rango;
  const nivelesDif = [
    ["Fácil", Math.max(1, Math.round(nPJ * 0.5))],
    ["Moderado", Math.max(1, Math.round(nPJ * 0.8))],
    ["Difícil", Math.max(2, Math.round(nPJ * 1.1))],
    ["Mortal", Math.max(3, Math.round(nPJ * 1.5))],
  ];
  return `
    <div class="card">
      <div class="mini" style="margin-bottom:6px">Solo tú ves esta pestaña.</div>
      <div class="grid3">
        <div class="kpi"><div class="k">jugadores</div><div class="v">${pjs.length || "—"}</div></div>
        <div class="kpi"><div class="k">rango medio</div><div class="v">${(RANGOS[rangoRef] || "—").slice(0, 5)}</div></div>
        <div class="kpi"><div class="k">en juego</div><div class="v">${lista.length}</div></div>
      </div>
      <div class="mini" style="margin-top:6px">
        Para este grupo: ${nivelesDif.map(([l, n]) => `<b>${l}</b> ${n}`).join(" · ")} mobs de su Rango.
      </div>
    </div>
    ${SECCIONES_DM.map((s) => `
      <div class="banda" data-dm="${s.id}" style="cursor:pointer;display:flex;justify-content:space-between">
        <span>${esc(s.titulo).toUpperCase()}</span><span>${abierta === s.id ? "−" : "+"}</span>
      </div>
      ${abierta === s.id ? `<div class="card" style="line-height:1.5">${s.cuerpo}</div>` : ""}
    `).join("")}
  `;
}

function vistaBestiario() {
  const mob = fichaMob(bestRango, bestClase);
  const lista = Object.values(mobs);
  const pjs = Object.values(party);
  const d = derivar(ficha);
  return `
    <div class="banda">AÑADIR ENEMIGOS</div>
    <div class="card">
      <div class="grid2">
        ${campo("Rango", `<select data-b="rango">${RANGOS.map((r, i) => `<option value="${i}" ${bestRango === i ? "selected" : ""}>${r}</option>`).join("")}</select>`)}
        ${campo("Clase", `<select data-b="clase">${CLASES.map((c, i) => `<option value="${i}" ${bestClase === i ? "selected" : ""}>${c}</option>`).join("")}</select>`)}
      </div>
      <div class="grid4" style="margin-top:8px">
        <div class="kpi"><div class="k">PV</div><div class="v">${mob.pv}</div></div>
        <div class="kpi"><div class="k">Resist.</div><div class="v">${mob.resistencia}%</div></div>
        <div class="kpi"><div class="k">Daño</div><div class="v">${mob.dano}</div></div>
        <div class="kpi"><div class="k">Pool</div><div class="v">${mob.pool}d6</div></div>
      </div>
      <div class="fila" style="margin-top:8px">
        <button class="btn fuerte" data-accion="add-mob">Añadir 1</button>
        <button class="btn" data-accion="add-mob-3">Añadir 3</button>
        <button class="btn" data-accion="add-mob-5">Añadir 5</button>
      </div>
    </div>

    <div class="banda">ENCUENTRO${lista.length ? ` · ${lista.length} en juego` : ""}</div>
    ${!lista.length ? `<div class="card mini">Sin enemigos. Añade arriba — todos en la sala los verán.</div>` : ""}

    ${lista.map((m) => {
      const vivo = m.pv > 0;
      const me = mobEfectivo(m);
      const objSel = (ficha._objMob || {})[m.id] || (pjs[0] ? pjs[0].id : "");
      const abierto = ficha._mobAbierto === m.id;
      const habSel = (ficha._habMob || {})[m.id] || "";
      return `
      <div class="card" style="padding:8px;${vivo ? "" : "opacity:.5"}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
            ${m.imagen ? `<img src="${esc(m.imagen)}" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:50%;border:1px solid var(--oro);flex:0 0 auto" onerror="this.style.display='none'">` : ""}
            <input data-mnom="${m.id}" value="${esc(m.nombre)}" style="font-weight:600;border:none;background:transparent;padding:2px 0;min-width:0">
          </div>
          <span class="mini" style="flex:0 0 auto">${m.pv}/${m.pvMax}${vivo ? "" : " · caído"}</span>
        </div>
        <div class="barra"><i style="width:${clamp((m.pv / m.pvMax) * 100, 0, 100)}%"></i></div>
        <div class="mini" style="margin-top:3px">
          Resist. ${me.resistencia}%${me.resistencia !== m.resistencia ? ` (base ${m.resistencia}%)` : ""} ·
          pega ${me.dano}${me.dano !== m.dano ? ` (base ${m.dano})` : ""} · ${me.pool}d6
          ${(m.pasivas || []).length ? ` · ${m.pasivas.length} pasiva(s)` : ""}
          ${(m.tags || []).length ? `<br>${m.tags.map(esc).join(" · ")}` : ""}
          ${turnos ? `<br>Acción: <b style="color:${m.accionUsada ? "var(--carmesi)" : "inherit"}">${m.accionUsada ? "gastada" : "libre"}</b>
            · Adicional: <b style="color:${m.adicionalUsada ? "var(--carmesi)" : "inherit"}">${m.adicionalUsada ? "gastada" : "libre"}</b>
            · alcance ${me.alcance}` : ` · alcance ${me.alcance}`}
        </div>

        <label class="lbl" style="margin-top:6px">Estados</label>
        <div>
          ${ESTADOS.map((e) => `<button class="chip ${(m.estados || []).includes(e.id) ? "on" : ""}" data-mob-estado="${m.id}|${e.id}" title="${esc(e.desc)}">${e.label}</button>`).join("")}
        </div>

        <label class="lbl" style="margin-top:6px">Que ataque a</label>
        <div class="fila">
          ${(() => {
            const visibles = pjs.filter((p) => !(p.estados || []).includes("invisible"));
            const conDist = visibles.map((p) => ({
              p, d: distanciaEntre(m.id, m.nombre, p.id, p.nombre),
            }));
            const ocultos = pjs.length - visibles.length;
            const sel2 = visibles.some((p) => p.id === objSel) ? objSel : (visibles[0] ? visibles[0].id : "");
            return `<select data-objmob="${m.id}">
              ${visibles.length
                ? conDist.map(({ p, d: dd }) => `<option value="${p.id}" ${sel2 === p.id ? "selected" : ""}>${esc(p.nombre)} — ${p.pv}/${p.pvMax}${dd != null ? ` · ${dd} cas.` : ""}</option>`).join("")
                : `<option value="">${pjs.length ? "todos ocultos" : "nadie conectado"}</option>`}
            </select>`;
          })()}
          ${(() => {
            const habSel2 = (ficha._habMob || {})[m.id];
            const hh = (habSel2 !== "" && habSel2 != null) ? (m.habilidades || [])[Number(habSel2)] : null;
            const ta = hh ? (hh.accion || "accion") : "accion";
            const sinAcc = turnos && ((ta === "accion" && m.accionUsada) || (ta === "adicional" && m.adicionalUsada));
            const hayObj = pjs.filter((p) => !(p.estados || []).includes("invisible")).length;
            return `<button class="btn fuerte" data-mob-atacar="${m.id}"
              ${!hayObj || !vivo || sinAcc ? "disabled" : ""}>${sinAcc ? "Sin acción" : "Atacar"}</button>`;
          })()}
        </div>
        ${(() => {
          const sel3 = (ficha._objMob || {})[m.id];
          const p3 = party[sel3] || pjs.filter((p) => !(p.estados || []).includes("invisible"))[0];
          if (!p3) return "";
          const dd = distanciaEntre(m.id, m.nombre, p3.id, p3.nombre);
          if (dd == null) return "";
          const habSel3 = (ficha._habMob || {})[m.id];
          const hh3 = (habSel3 !== "" && habSel3 != null) ? (m.habilidades || [])[Number(habSel3)] : null;
          const alc3 = hh3 ? (hh3.alcance != null ? hh3.alcance : 1) : (m.alcance != null ? m.alcance : 1);
          if (!alc3) return `<div class="mini">${esc(p3.nombre)} a ${dd} casillas · sin límite de alcance</div>`;
          return dd <= alc3
            ? `<div class="mini">${esc(p3.nombre)} a ${dd} casillas · llega (alcance ${alc3})</div>`
            : `<div class="aviso">${esc(p3.nombre)} está a ${dd} casillas y solo llega a ${alc3}. Acércalo ${dd - alc3} casillas (se mueve ${me.movMax}).</div>`;
        })()}
        ${pjs.some((p) => (p.estados || []).includes("invisible"))
          ? `<div class="mini" style="color:var(--carmesi)">${pjs.filter((p) => (p.estados || []).includes("invisible")).map((p) => esc(p.nombre)).join(", ")}: Invisible, no puede ser elegido.</div>` : ""}
        ${(m.habilidades || []).length ? `<div class="fila" style="margin-top:4px">
          <select data-habmob="${m.id}">
            <option value="">Ataque normal (${me.dano})</option>
            ${m.habilidades.map((hh, j) => {
              const agot = (hh.usosMax || 0) > 0 && (hh.usos || 0) >= hh.usosMax;
              const ta = TIPOS_ACCION.find((t) => t.id === (hh.accion || "accion"));
              return `<option value="${j}" ${habSel === String(j) ? "selected" : ""} ${agot ? "disabled" : ""}>${esc(hh.nombre || "Habilidad " + (j + 1))} · ${esOfensivaMob(hh) ? `${Math.ceil(me.dano * multDeHabilidadMob(hh))} · ` : ""}alc ${hh.alcance != null ? hh.alcance : 1}${hh.usosMax ? ` · ${hh.usos || 0}/${hh.usosMax}` : ""}${hh.accion && hh.accion !== "accion" ? ` · ${ta ? ta.corta : ""}` : ""}${agot ? " · AGOTADA" : ""}</option>`;
            }).join("")}
          </select>
        </div>` : ""}

        <div style="margin-top:6px">
          <button class="btn" data-mob-abrir="${m.id}" style="padding:2px 8px">
            ${abierto ? "− ocultar" : "+ pasivas y habilidades"}
          </button>
        </div>
        ${abierto ? `
          <div style="margin-top:5px;border-top:1px solid var(--borde);padding-top:5px">
            <label class="mini" style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
              <input type="checkbox" data-mesq="${m.id}" ${m.esquiva ? "checked" : ""}>
              Puede esquivar cuando le atacan (una vez por turno)
            </label>
            <div class="fila" style="margin-bottom:6px">
              <div>${campo("Alcance de su ataque", `<input class="num" data-malc="${m.id}" type="number" min="0" value="${m.alcance != null ? m.alcance : 1}">`)}</div>
              <div>${campo("Movimiento", `<div class="num" style="padding:4px 6px;background:var(--pergamino);border:1px solid var(--borde);border-radius:3px">${me.movMax} casillas</div>`)}</div>
            </div>

            <label class="lbl">Retrato</label>
            <input data-mimg="${m.id}" value="${esc(m.imagen || "")}" placeholder="Enlace a su imagen" style="margin-bottom:6px">
            ${m.imagen ? `<img src="${esc(m.imagen)}" alt="" style="width:100%;max-height:160px;object-fit:cover;border-radius:5px;margin-bottom:6px;border:1px solid var(--borde)" onerror="this.style.display='none'">` : ""}

            <label class="lbl">Etiquetas</label>
            <div style="margin-bottom:6px">
              ${TAGS.map((t) => `<button class="chip ${(m.tags || []).includes(t) ? "on" : ""}" data-mtag="${m.id}|${t}">${t}</button>`).join("")}
            </div>

            <label class="lbl">Pasivas</label>
            ${(m.pasivas || []).map((p, k) => {
              const tp = TIPOS_PASIVA.find((t) => t.id === p.tipo) || TIPOS_PASIVA[0];
              return `<div class="fila" style="margin-top:4px">
                <select data-mpas="${m.id}|${k}" data-mpask="tipo">
                  ${TIPOS_PASIVA.map((t) => `<option value="${t.id}" ${p.tipo === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
                </select>
                ${tp.unidad ? `<input class="num" data-mpas="${m.id}|${k}" data-mpask="valor" type="number" value="${p.valor}" style="max-width:60px">` : ""}
                ${tp.param === "estado" ? `<select data-mpas="${m.id}|${k}" data-mpask="estado" style="max-width:92px">${ESTADOS.map((e) => `<option value="${e.id}" ${p.estado === e.id ? "selected" : ""}>${e.label}</option>`).join("")}</select>` : ""}
                <button class="btn" data-quitar-mpas="${m.id}|${k}" style="flex:0 0 auto;padding:2px 6px">×</button>
              </div>
              ${tp.param === "auto_estado" ? `<div class="fila" style="margin:3px 0 0 10px">
                <select data-mpas="${m.id}|${k}" data-mpask="estadoAuto" style="max-width:110px">
                  ${ESTADOS.map((e) => `<option value="${e.id}" ${(p.estadoAuto || "invisible") === e.id ? "selected" : ""}>${e.label}</option>`).join("")}
                </select>
                <select data-mpas="${m.id}|${k}" data-mpask="cond">
                  ${CONDICIONES.map((c) => `<option value="${c.id}" ${(p.cond || "pv_bajo") === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
                </select>
                ${(CONDICIONES.find((c) => c.id === (p.cond || "pv_bajo")) || {}).unidad
                  ? `<input class="num" data-mpas="${m.id}|${k}" data-mpask="umbral" type="number" value="${p.umbral != null ? p.umbral : 50}" style="max-width:58px">` : ""}
              </div>` : ""}`;
            }).join("")}
            <button class="btn" data-add-mpas="${m.id}" style="margin-top:4px;padding:2px 8px">+ pasiva</button>

            <label class="lbl" style="margin-top:8px">Habilidades</label>
            ${(m.habilidades || []).map((hh, j) => `
              <div class="fila" style="margin-top:4px">
                <input data-mhab="${m.id}|${j}" data-mhabk="nombre" value="${esc(hh.nombre || "")}" placeholder="Nombre">
                <select data-mhab="${m.id}|${j}" data-mhabk="perfil" style="max-width:118px">
                  ${PERFILES_HABILIDAD.map((p) => `<option value="${p.id}" ${(hh.perfil || "estandar") === p.id ? "selected" : ""}>${p.label}</option>`).join("")}
                  <option value="personalizado" ${hh.perfil === "personalizado" ? "selected" : ""}>Personalizado</option>
                </select>
                ${hh.perfil === "personalizado" ? `<label class="mini" style="display:flex;align-items:center;gap:3px;white-space:nowrap">×<input class="num" data-mhab="${m.id}|${j}" data-mhabk="mult" type="number" step="0.5" value="${hh.mult || 1}" style="max-width:48px"></label>` : ""}
                <label class="mini" style="display:flex;align-items:center;gap:3px;white-space:nowrap">usos<input class="num" data-mhab="${m.id}|${j}" data-mhabk="usosMax" type="number" min="0" value="${hh.usosMax || 0}" style="max-width:48px"></label>
                <label class="mini" style="display:flex;align-items:center;gap:3px;white-space:nowrap">alc<input class="num" data-mhab="${m.id}|${j}" data-mhabk="alcance" type="number" min="0" value="${hh.alcance != null ? hh.alcance : 1}" style="max-width:44px"></label>
                <select data-mhab="${m.id}|${j}" data-mhabk="accion" style="max-width:112px">
                  ${TIPOS_ACCION.filter((t) => t.id !== "reaccion").map((t) => `<option value="${t.id}" ${(hh.accion || "accion") === t.id ? "selected" : ""}>${t.label}</option>`).join("")}
                </select>
                <button class="btn" data-quitar-mhab="${m.id}|${j}" style="flex:0 0 auto;padding:2px 6px">×</button>
              </div>
              <div class="mini" style="margin-left:10px">
                ${esOfensivaMob(hh) ? `pega <b>${Math.ceil(me.dano * multDeHabilidadMob(hh))}</b> bruto` : `<b>Utilidad</b> — no hace daño directo`}${hh.usosMax ? ` · ${hh.usos || 0}/${hh.usosMax} usos` : " · sin límite"}
              </div>
              ${(hh.efectos || []).map((ef, k) => {
                const te = TIPOS_EFECTO.find((t) => t.id === ef.tipo) || TIPOS_EFECTO[0];
                return `<div class="fila" style="margin:3px 0 0 10px">
                  <select data-mhef="${m.id}|${j}|${k}" data-mhefk="tipo">${opcionesEfecto(ef.tipo)}</select>
                  ${te.unidad ? `<input class="num" data-mhef="${m.id}|${j}|${k}" data-mhefk="valor" type="number" value="${ef.valor}" style="max-width:58px">` : ""}
                  ${extrasEfecto(ef, te, `data-mhef="${m.id}|${j}|${k}"`, "mhefk")}
                  <button class="btn" data-quitar-mhef="${m.id}|${j}|${k}" style="flex:0 0 auto;padding:2px 6px">×</button>
                </div>
                  <div class="fila" style="margin:3px 0 0 10px">
                  <select data-mhef="${m.id}|${j}|${k}" data-mhefk="disparo" style="max-width:180px">
                    ${DISPAROS.map((dd) => `<option value="${dd.id}" ${(ef.disparo || "siempre") === dd.id ? "selected" : ""}>${dd.label}</option>`).join("")}
                  </select>
                  ${(DISPAROS.find((dd) => dd.id === (ef.disparo || "siempre")) || {}).unidad
                    ? `<input class="num" data-mhef="${m.id}|${j}|${k}" data-mhefk="umbralDisparo" type="number" value="${ef.umbralDisparo != null ? ef.umbralDisparo : 50}" style="max-width:56px">` : ""}
                  ${(ef.disparo === "estado_yo") ? `<select data-mhef="${m.id}|${j}|${k}" data-mhefk="estadoDisparo" style="max-width:96px">${ESTADOS.map((e2) => `<option value="${e2.id}" ${(ef.estadoDisparo || "herido") === e2.id ? "selected" : ""}>${e2.label}</option>`).join("")}</select>` : ""}
                </div>`;
              }).join("")}
              <button class="btn" data-add-mhef="${m.id}|${j}" style="margin:3px 0 0 10px;padding:2px 8px">+ efecto</button>
            `).join("")}
            <button class="btn" data-add-mhab="${m.id}" style="margin-top:4px;padding:2px 8px">+ habilidad</button>
          </div>` : ""}

        <label class="lbl" style="margin-top:6px">Su vida</label>
        <div class="fila">
          <input class="num" data-dmg="${m.id}" type="number" placeholder="daño" style="max-width:72px"
                 value="${(ficha._dmgIn || {})[m.id] || ""}">
          <button class="btn" data-aplicar="${m.id}">Quitar</button>
          <button class="btn" data-curar-mob="${m.id}" style="flex:0 0 auto">+</button>
          <button class="btn" data-quitar-mob="${m.id}" style="flex:0 0 auto">×</button>
        </div>
        ${!vivo ? `<div class="fila" style="margin-top:4px">
          <select data-ecopara="${m.id}">
            ${pjs.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("") || `<option value="">nadie</option>`}
          </select>
          <button class="btn fuerte" data-dar-eco="${m.id}" ${pjs.length ? "" : "disabled"}>Dejar su Eco</button>
        </div>
        <div class="mini">Su sombra queda ligada: mitad de vida y daño, con sus pasivas y habilidades.</div>` : ""}
        <div class="fila" style="margin-top:4px">
          <button class="btn" data-ligar-mob="${m.id}">${m.pieza ? "Reasignar ficha" : "Ligar a ficha"}</button>
          ${m.pieza ? `<button class="btn" data-desligar-mob="${m.id}" style="flex:0 0 auto">×</button>` : ""}
        </div>
        <div class="mini">${(() => {
          const pz = m.pieza ? piezas.find((p) => p.id === m.pieza) : null;
          if (pz) return `En el tablero: «${esc(pz.name || "sin nombre")}»`;
          const porNombre = piezaPorNombre(m.nombre);
          if (porNombre) return `Reconocida por el nombre: «${esc(porNombre.name)}»`;
          return "Sin ficha en el tablero. Selecciónala y pulsa «Ligar a ficha».";
        })()}</div>
        <div class="fila" style="margin-top:4px">
          <button class="btn" data-guardar-mob="${m.id}">Guardar</button>
          <button class="btn" data-dup="${m.id}|1">Duplicar</button>
          <button class="btn" data-dup="${m.id}|3">×3</button>
          <button class="btn" data-dup="${m.id}|5">×5</button>
        </div>
        <div class="mini" style="margin-top:2px">Las copias heredan sus pasivas y habilidades.</div>
      </div>`;
    }).join("")}

    ${lista.length ? `<div class="card">
      <div class="fila">
        <button class="btn fuerte" data-accion="fin-combate">Terminar combate</button>
        <button class="btn" data-accion="limpiar-caidos">Quitar caídos</button>
      </div>
      <div class="mini" style="margin-top:4px">Terminar combate borra los enemigos, los buffs y los usos de habilidad de todos.</div>
    </div>` : ""}
  `;
}

// ---------- eventos ----------
function enlazar() {
  app.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });

  app.querySelectorAll("[data-f]").forEach((el) => {
    el.onchange = () => render();
    el.oninput = () => {
      const k = el.dataset.f;
      let v = el.value;
      if (["rango", "nivel", "pv", "esencia"].includes(k)) v = Number(v);
      if (k === "rango") {
        ficha.rango = v;
        const cap = [4, 5, 5, 6, 6, 7, 7][v];
        STAT_KEYS.forEach((s) => ficha.stats[s] = Math.min(ficha.stats[s], cap));
      } else if (k === "pv" || k === "esencia") {
        const d = derivar(ficha);
        const max = k === "pv" ? d.pvMax : d.esenciaMax;
        const limitado = clamp(v, 0, max);
        ficha[k] = limitado;
        if (limitado !== v) el.value = limitado;
      } else ficha[k] = v;
      guardarYRevisar(); publicarEstado();
      if (k === "rango") render();
    };
  });

  app.querySelectorAll("[data-stat]").forEach((b) => b.onclick = () => {
    const k = b.dataset.stat;
    const cap = [4, 5, 5, 6, 6, 7, 7][ficha.rango];
    ficha.stats[k] = clamp(ficha.stats[k] + Number(b.dataset.delta), 1, cap);
    guardarFicha(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-rec]").forEach((b) => b.onclick = () => {
    const k = b.dataset.rec;
    const d = derivar(ficha);
    const max = k === "pv" ? d.pvMax : d.esenciaMax;
    const actual = k === "pv" ? d.pv : d.esencia;
    ficha[k] = clamp(actual + Number(b.dataset.delta), 0, max);
    guardarYRevisar(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-grieta]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.grieta);
    ficha.grieta = ficha.grieta === i + 1 ? i : i + 1;
    guardarYRevisar(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-estado]").forEach((b) => b.onclick = () => {
    const id = b.dataset.estado;
    if ((derivar(ficha).inmunidades || []).includes(id) && !(ficha.estados || []).includes(id)) return;
    ficha.estados = ficha.estados || [];
    ficha.estados = ficha.estados.includes(id) ? ficha.estados.filter((x) => x !== id) : [...ficha.estados, id];
    guardarYRevisar(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-hab]").forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.hab);
    ficha.habilidades[i][el.dataset.hk] = el.value;
    guardarFicha(); publicarEstado();
    if (el.dataset.hk === "perfil") render();   // solo el perfil cambia los números
  });
  // --- pasivas (memoria o forma) ---
  const rutaPasivas = (pref) => {
    const [tipo, i] = pref.split("|");
    if (tipo === "hab") {
      const h = ficha.habilidades[Number(i)];
      h.pasivas = h.pasivas || [];
      return h.pasivas;
    }
    if (tipo === "mem") {
      const h = ficha.memorias[Number(i)].hab;
      h.pasivas = h.pasivas || [];
      return h.pasivas;
    }
    const fm = ficha.formas[Number(i)];
    fm.pasivas = fm.pasivas || [];
    return fm.pasivas;
  };
  app.querySelectorAll("[data-pas]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const partes = el.dataset.pas.split("|");
    const pref = partes.slice(0, 2).join("|");
    const k = Number(partes[2]);
    const arr = rutaPasivas(pref);
    const campoK = el.dataset.pask;
    arr[k][campoK] = ["valor", "umbral"].includes(campoK) ? (Number(el.value) || 0) : el.value;
    if (campoK === "tipo") {
      const t = TIPOS_PASIVA.find((x) => x.id === el.value);
      if (t) arr[k].valor = t.def;
    }
    guardarFicha(); publicarEstado();
    if (campoK === "tipo" || campoK === "cond") render();
  }; });
  app.querySelectorAll("[data-add-pas]").forEach((b) => b.onclick = () => {
    rutaPasivas(b.dataset.addPas).push(pasivaNueva("pv_extra"));
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-quitar-pas]").forEach((b) => b.onclick = () => {
    const parts = b.dataset.quitarPas.split("|");
    rutaPasivas(parts.slice(0, 2).join("|")).splice(Number(parts[2]), 1);
    guardarFicha(); publicarEstado(); render();
  });

  // --- habilidad de la Memoria ---
  app.querySelectorAll("[data-mh]").forEach((el) => el.oninput = () => {
    const i = Number(el.dataset.mh);
    const k = el.dataset.mhk;
    const m = ficha.memorias[i];
    m.hab = m.hab || memoriaHabNueva();
    m.hab[k] = k === "usosMax" ? (Number(el.value) || 0) : el.value;
    if (k === "modo") { m.hab.efectos = m.hab.efectos || []; m.hab.pasivas = m.hab.pasivas || []; m.hab.perfil = m.hab.perfil || "ligera"; }
    guardarFicha(); publicarEstado();
    if (k === "modo" || k === "perfil") render();
  });
  app.querySelectorAll("[data-mef]").forEach((el) => el.oninput = () => {
    const [i, j] = el.dataset.mef.split("|").map(Number);
    const k = el.dataset.mefk;
    const efs = ficha.memorias[i].hab.efectos;
    efs[j][k] = (["valor","tope","umbralDisparo"].includes(k)) ? (Number(el.value) || 0) : el.value;
    if (k === "tipo") { const t = TIPOS_EFECTO.find((x) => x.id === el.value); if (t) efs[j].valor = t.def; }
    guardarFicha();
    if (k === "tipo" || k === "disparo") render();
  });
  app.querySelectorAll("[data-add-mef]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.addMef);
    const h = ficha.memorias[i].hab;
    h.efectos = h.efectos || [];
    h.efectos.push(efectoHabNuevo("dano_verdadero"));
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-quitar-mef]").forEach((b) => b.onclick = () => {
    const [i, j] = b.dataset.quitarMef.split("|").map(Number);
    ficha.memorias[i].hab.efectos.splice(j, 1);
    guardarFicha(); render();
  });

  // --- habilidades de la Forma ---
  app.querySelectorAll("[data-fh]").forEach((el) => el.oninput = () => {
    const [i, j] = el.dataset.fh.split("|").map(Number);
    ficha.formas[i].habilidades[j][el.dataset.fhk] = el.value;
    guardarFicha();
    if (el.dataset.fhk === "perfil") render();
  });
  app.querySelectorAll("[data-add-fh]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.addFh);
    ficha.formas[i].habilidades = ficha.formas[i].habilidades || [];
    ficha.formas[i].habilidades.push(habilidadNueva());
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-quitar-fh]").forEach((b) => b.onclick = () => {
    const [i, j] = b.dataset.quitarFh.split("|").map(Number);
    ficha.formas[i].habilidades.splice(j, 1);
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-fef]").forEach((el) => el.oninput = () => {
    const [i, j, k] = el.dataset.fef.split("|").map(Number);
    const kk = el.dataset.fefk;
    const efs = ficha.formas[i].habilidades[j].efectos;
    efs[k][kk] = (["valor","tope","umbralDisparo"].includes(kk)) ? (Number(el.value) || 0) : el.value;
    if (kk === "tipo") { const t = TIPOS_EFECTO.find((x) => x.id === el.value); if (t) efs[k].valor = t.def; }
    guardarFicha();
    if (kk === "tipo" || kk === "disparo") render();
  });
  app.querySelectorAll("[data-add-fef]").forEach((b) => b.onclick = () => {
    const [i, j] = b.dataset.addFef.split("|").map(Number);
    const h = ficha.formas[i].habilidades[j];
    h.efectos = h.efectos || [];
    h.efectos.push(efectoHabNuevo("dano_verdadero"));
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-quitar-fef]").forEach((b) => b.onclick = () => {
    const [i, j, k] = b.dataset.quitarFef.split("|").map(Number);
    ficha.formas[i].habilidades[j].efectos.splice(k, 1);
    guardarFicha(); render();
  });

  app.querySelectorAll("[data-hcfg]").forEach((el) => {
    const ev = el.type === "checkbox" ? "onchange" : "oninput";
    el[ev] = () => {
      const i = Number(el.dataset.hcfg);
      const k = el.dataset.hck;
      ficha.habilidades[i][k] = el.type === "checkbox" ? el.checked
        : (k === "accion" ? el.value : (Number(el.value) || 0));
      guardarFicha(); publicarEstado();
      if (el.type === "checkbox") render();
    };
  });
  app.querySelectorAll("[data-hef]").forEach((el) => el.oninput = () => {
    const [i, j] = el.dataset.hef.split("|").map(Number);
    const k = el.dataset.hefk;
    ficha.habilidades[i].efectos[j][k] = (["valor","tope","umbralDisparo"].includes(k)) ? Number(el.value) : el.value;
    publicarEstado();
    if (k === "tipo") {
      const t = TIPOS_EFECTO.find((x) => x.id === el.value);
      if (t) ficha.habilidades[i].efectos[j].valor = t.def;
    }
    guardarFicha();
    if (k === "tipo" || k === "disparo") render();
  });
  app.querySelectorAll("[data-quitar-hef]").forEach((b) => b.onclick = () => {
    const [i, j] = b.dataset.quitarHef.split("|").map(Number);
    ficha.habilidades[i].efectos.splice(j, 1);
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-add-hef]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.addHef);
    const h = ficha.habilidades[i];
    h.efectos = h.efectos || [];
    h.efectos.push(efectoHabNuevo("dano_verdadero"));
    guardarFicha(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-quitar-hab]").forEach((b) => b.onclick = () => {
    ficha.habilidades.splice(Number(b.dataset.quitarHab), 1);
    guardarFicha(); render();
  });

  app.querySelectorAll("[data-a]").forEach((el) => el.oninput = () => {
    const k = el.dataset.a;
    ficha.arma[k] = (k === "danoBase" || k === "rangoArma") ? Number(el.value) : el.value;
    guardarFicha(); publicarEstado();
    if (k !== "nombre") render();
  });

  app.querySelectorAll("[data-m]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const i = Number(el.dataset.m);
    const k = el.dataset.mk;
    ficha.memorias[i][k] = k === "nombre" ? el.value : Number(el.value);
    guardarFicha(); publicarEstado();
  }; });

  app.querySelectorAll("[data-t]").forEach((el) => el.oninput = () => {
    const k = el.dataset.t;
    if (k === "stat") ficha._tirarStat = el.value;
    if (k === "empujes") ficha._empujes = Math.max(0, Number(el.value));
    if (k === "rango") ficha._tRango = Number(el.value);
    if (k === "clase") ficha._tClase = Number(el.value);
    if (k === "objetivo") ficha._objetivo = el.value;
    if (k === "ataque") ficha._ataque = el.value;
    render();
  });
  app.querySelectorAll("[data-empuje]").forEach((b) => b.onclick = () => {
    ficha._empujes = Math.max(0, (ficha._empujes || 0) + Number(b.dataset.empuje));
    render();
  });

  app.querySelectorAll("[data-b]").forEach((el) => el.oninput = () => {
    if (el.dataset.b === "rango") bestRango = Number(el.value);
    else bestClase = Number(el.value);
    render();
  });

  app.querySelectorAll("[data-aplicar]").forEach((b) => b.onclick = () => {
    const id = b.dataset.aplicar;
    const input = app.querySelector(`[data-dmg="${id}"]`);
    const n = Number(input && input.value);
    if (!n) return;
    danarMob(id, n);
  });
  app.querySelectorAll("[data-dmg]").forEach((el) => el.oninput = () => {
    ficha._dmgIn = ficha._dmgIn || {};
    ficha._dmgIn[el.dataset.dmg] = el.value;
  });
  app.querySelectorAll("[data-objmob]").forEach((el) => el.oninput = () => {
    ficha._objMob = ficha._objMob || {};
    ficha._objMob[el.dataset.objmob] = el.value;
    render();   // cambia la distancia al objetivo
  });
  app.querySelectorAll("[data-mob-abrir]").forEach((b) => b.onclick = () => {
    ficha._mobAbierto = ficha._mobAbierto === b.dataset.mobAbrir ? null : b.dataset.mobAbrir;
    render();
  });
  app.querySelectorAll("[data-habmob]").forEach((el) => el.oninput = () => {
    ficha._habMob = ficha._habMob || {};
    ficha._habMob[el.dataset.habmob] = el.value;
    render();   // cambian el alcance mostrado y si puede atacar
  });
  // pasivas del mob
  app.querySelectorAll("[data-mesq]").forEach((el) => el.onchange = () => {
    const mo = mobs[el.dataset.mesq];
    if (mo) guardarMobs({ ...mobs, [mo.id]: { ...mo, esquiva: el.checked } });
  });
  app.querySelectorAll("[data-mnom]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const mo = mobs[el.dataset.mnom];
    if (mo) guardarMobs({ ...mobs, [mo.id]: { ...mo, nombre: el.value } });
  }; });
  app.querySelectorAll("[data-malc]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const mo = mobs[el.dataset.malc];
    if (mo) guardarMobs({ ...mobs, [mo.id]: { ...mo, alcance: Number(el.value) || 0 } });
  }; });
  app.querySelectorAll("[data-mimg]").forEach((el) => {
    el.onchange = () => render();
    el.oninput = () => {
      const mo = mobs[el.dataset.mimg];
      if (mo) guardarMobs({ ...mobs, [mo.id]: { ...mo, imagen: el.value } });
    };
  });
  app.querySelectorAll("[data-mtag]").forEach((b) => b.onclick = () => {
    const [mid, t] = b.dataset.mtag.split("|");
    const m = mobs[mid]; if (!m) return;
    const act = (m.tags || []).includes(t) ? (m.tags || []).filter((x) => x !== t) : [...(m.tags || []), t];
    guardarMobs({ ...mobs, [mid]: { ...m, tags: act } });
  });
  app.querySelectorAll("[data-mpas]").forEach((el) => el.oninput = () => {
    const [mid, k] = el.dataset.mpas.split("|");
    const m = mobs[mid]; if (!m) return;
    const arr = (m.pasivas || []).slice();
    const kk = el.dataset.mpask;
    arr[Number(k)] = { ...arr[Number(k)], [kk]: kk === "valor" ? (Number(el.value) || 0) : el.value };
    if (kk === "tipo") {
      const t = TIPOS_PASIVA.find((x) => x.id === el.value);
      if (t) arr[Number(k)].valor = t.def;
    }
    guardarMobs({ ...mobs, [mid]: { ...m, pasivas: arr } });
    if (kk === "tipo" || kk === "cond") render();
  });
  app.querySelectorAll("[data-add-mpas]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.addMpas]; if (!m) return;
    guardarMobs({ ...mobs, [m.id]: { ...m, pasivas: [...(m.pasivas || []), pasivaNueva("pv_extra")] } });
  });
  app.querySelectorAll("[data-quitar-mpas]").forEach((b) => b.onclick = () => {
    const [mid, k] = b.dataset.quitarMpas.split("|");
    const m = mobs[mid]; if (!m) return;
    const arr = (m.pasivas || []).slice(); arr.splice(Number(k), 1);
    guardarMobs({ ...mobs, [mid]: { ...m, pasivas: arr } });
  });
  // habilidades del mob
  app.querySelectorAll("[data-mhab]").forEach((el) => el.oninput = () => {
    const [mid, j] = el.dataset.mhab.split("|");
    const m = mobs[mid]; if (!m) return;
    const arr = (m.habilidades || []).slice();
    const kk = el.dataset.mhabk;
    arr[Number(j)] = { ...arr[Number(j)],
      [kk]: kk === "mult" ? (Number(el.value) || 1)
        : (kk === "usosMax" || kk === "alcance") ? (Number(el.value) || 0)
        : el.value };
    guardarMobs({ ...mobs, [mid]: { ...m, habilidades: arr } });
  });
  app.querySelectorAll("[data-add-mhab]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.addMhab]; if (!m) return;
    const nueva = habilidadMobNueva();
    guardarMobs({ ...mobs, [m.id]: { ...m, habilidades: [...(m.habilidades || []), nueva] } });
  });
  app.querySelectorAll("[data-quitar-mhab]").forEach((b) => b.onclick = () => {
    const [mid, j] = b.dataset.quitarMhab.split("|");
    const m = mobs[mid]; if (!m) return;
    const arr = (m.habilidades || []).slice(); arr.splice(Number(j), 1);
    guardarMobs({ ...mobs, [mid]: { ...m, habilidades: arr } });
  });
  app.querySelectorAll("[data-mhef]").forEach((el) => el.oninput = () => {
    const [mid, j, k] = el.dataset.mhef.split("|");
    const m = mobs[mid]; if (!m) return;
    const habs = (m.habilidades || []).slice();
    const efs = (habs[Number(j)].efectos || []).slice();
    const kk = el.dataset.mhefk;
    efs[Number(k)] = { ...efs[Number(k)], [kk]: kk === "valor" ? (Number(el.value) || 0) : el.value };
    if (kk === "tipo") {
      const t = TIPOS_EFECTO.find((x) => x.id === el.value);
      if (t) efs[Number(k)].valor = t.def;
    }
    habs[Number(j)] = { ...habs[Number(j)], efectos: efs };
    guardarMobs({ ...mobs, [mid]: { ...m, habilidades: habs } });
  });
  app.querySelectorAll("[data-add-mhef]").forEach((b) => b.onclick = () => {
    const [mid, j] = b.dataset.addMhef.split("|");
    const m = mobs[mid]; if (!m) return;
    const habs = (m.habilidades || []).slice();
    habs[Number(j)] = { ...habs[Number(j)], efectos: [...(habs[Number(j)].efectos || []), efectoHabNuevo("aplicar_estado")] };
    guardarMobs({ ...mobs, [mid]: { ...m, habilidades: habs } });
  });
  app.querySelectorAll("[data-quitar-mhef]").forEach((b) => b.onclick = () => {
    const [mid, j, k] = b.dataset.quitarMhef.split("|");
    const m = mobs[mid]; if (!m) return;
    const habs = (m.habilidades || []).slice();
    const efs = (habs[Number(j)].efectos || []).slice(); efs.splice(Number(k), 1);
    habs[Number(j)] = { ...habs[Number(j)], efectos: efs };
    guardarMobs({ ...mobs, [mid]: { ...m, habilidades: habs } });
  });

  app.querySelectorAll("[data-mob-atacar]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.mobAtacar];
    if (!m) return;
    let sel = (ficha._objMob || {})[m.id] || Object.keys(party)[0];
    if (party[sel] && (party[sel].estados || []).includes("invisible")) sel = null;
    if (!sel) {
      const libre = Object.values(party).find((x) => !(x.estados || []).includes("invisible"));
      sel = libre ? libre.id : null;
    }
    const p = sel ? party[sel] : null;
    if (!p) return;
    const me = mobEfectivo(m);
    const jSel = (ficha._habMob || {})[m.id];
    const hab = (jSel !== "" && jSel != null) ? (m.habilidades || [])[Number(jSel)] : null;
    if (hab && (hab.usosMax || 0) > 0 && (hab.usos || 0) >= hab.usosMax) return;
    const esUtilidad = hab && !esOfensivaMob(hab);
    // economía de acciones de la criatura, igual que la de un personaje
    const tipoAcc = hab ? (hab.accion || "accion") : "accion";
    if (turnos) {
      if (tipoAcc === "accion" && m.accionUsada) return;
      if (tipoAcc === "adicional" && m.adicionalUsada) return;
    }

    const interf = interferencia((p.rango + 1) - (m.rango + 1), 0);
    const r = tirar(me.pool, interf, 0);
    ultimaTirada = { ...r, interf, animando: true, resumen: "" };
    const etiqueta = hab ? `${m.nombre} · ${hab.nombre || "habilidad"}` : m.nombre;

    if (r.lectura === "fallo") {
      ultimaTirada.resumen = `${etiqueta} falla contra ${p.nombre}`;
      anunciar(ultimaTirada.resumen);
    } else {
      const habOfensiva = hab ? esOfensivaMob(hab) : true;
      const mult = hab ? multDeHabilidadMob(hab) : 1;
      let bruto = habOfensiva ? roundUp(me.dano * mult) * (r.lectura === "critico" ? 2 : 1) : 0;
      const efs = hab ? (hab.efectos || []) : [];
      const tieneM = (t) => efs.find((e) => e.tipo === t);
      const extras = [];

      const mg = tieneM("multigolpe");
      if (mg) { bruto *= Number(mg.valor) || 1; extras.push(`×${mg.valor} golpes`); }

      const est = tieneM("aplicar_estado");
      const estadoAplicar = est ? (est.estado || "herido") : null;
      if (est) extras.push((ESTADOS.find((x) => x.id === estadoAplicar) || {}).label || estadoAplicar);

      const dv = tieneM("dano_verdadero");
      const verdadero = dv ? roundUp(p.pvMax * (Number(dv.valor) / 100)) : 0;
      if (dv) extras.push(`${verdadero} verdadero`);

      const dr = tieneM("drenar_esencia");
      if (dr) extras.push(`drena ${dr.valor}E`);

      ultimaTirada.resumen = esUtilidad
        ? `${etiqueta} actúa sobre ${p.nombre}` + (extras.length ? " · " + extras.join(" · ") : "")
        : `${etiqueta} conecta en ${p.nombre}: ${bruto} bruto` +
          (r.lectura === "critico" ? " · CRÍTICO ×2" : r.lectura === "costo" ? " (con costo)" : "") +
          (extras.length ? " · " + extras.join(" · ") : "");

      // registrar uso y gasto de acción en una sola escritura
      const cambios = { ...m };
      if (hab) {
        const habs = (m.habilidades || []).slice();
        habs[Number(jSel)] = { ...hab, usos: (hab.usos || 0) + 1 };
        cambios.habilidades = habs;
      }
      if (turnos) {
        if (tipoAcc === "accion") cambios.accionUsada = true;
        if (tipoAcc === "adicional") cambios.adicionalUsada = true;
      }
      guardarMobs({ ...mobs, [m.id]: cambios });
      lanzarGolpe({
        deNombre: etiqueta, objetivoId: p.id, objetivoNombre: p.nombre,
        bruto, mobId: m.id,
        estado: estadoAplicar, verdadero, drenar: dr ? Number(dr.valor) : 0,
      });
    }
    render(); animarDados(); return;
  });
  app.querySelectorAll("[data-curar-mob]").forEach((b) => b.onclick = () => danarMob(b.dataset.curarMob, -5));
  app.querySelectorAll("[data-quitar-mob]").forEach((b) => b.onclick = () => quitarMob(b.dataset.quitarMob));
  app.querySelectorAll("[data-ecopara]").forEach((el) => el.oninput = () => {
    ficha._ecoPara = ficha._ecoPara || {};
    ficha._ecoPara[el.dataset.ecopara] = el.value;
  });
  app.querySelectorAll("[data-dar-eco]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.darEco];
    if (!m) return;
    const sel = (ficha._ecoPara || {})[m.id] || Object.keys(party)[0];
    if (!sel) return;
    const eco = ecoDesdeMob(m);
    mandarOrden(sel, { nuevoEco: eco });
    anunciar(`La sombra de ${eco.nombre} queda ligada a ${(party[sel] || {}).nombre || "alguien"}.`);
  });
  app.querySelectorAll("[data-ligar-mob]").forEach((b) => b.onclick = () => {
    ligarMobAPieza(b.dataset.ligarMob);
  });
  app.querySelectorAll("[data-desligar-mob]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.desligarMob];
    if (!m) return;
    guardarMobs({ ...mobs, [m.id]: { ...m, pieza: null } });
  });
  app.querySelectorAll("[data-guardar-mob]").forEach((b) => b.onclick = () => {
    const m = mobs[b.dataset.guardarMob];
    if (!m) return;
    guardarPlantilla(m);
    anunciar(`Guardado en tus Bestias: ${(m.nombre || "").replace(/\s+\d+$/, "")}`);
    tab = "bestias"; render();
  });
  app.querySelectorAll("[data-bsoltar]").forEach((b) => b.onclick = () => {
    const [id, n] = b.dataset.bsoltar.split("|");
    soltarPlantilla(id, Number(n));
  });
  app.querySelectorAll("[data-bborrar]").forEach((b) => b.onclick = () => {
    bestiario = bestiario.filter((x) => x.id !== b.dataset.bborrar);
    guardarBestiario(); render();
  });
  app.querySelectorAll("[data-bnom]").forEach((el) => el.oninput = () => {
    const p = bestiario.find((x) => x.id === el.dataset.bnom);
    if (p) { p.nombre = el.value; guardarBestiario(); }
  });
  app.querySelectorAll("[data-dup]").forEach((b) => b.onclick = () => {
    const [id, n] = b.dataset.dup.split("|");
    duplicarMob(id, Number(n));
  });

  // ---- reacciones ----
  app.querySelectorAll("[data-empujar-a]").forEach((b) => b.onclick = () => {
    const id = b.dataset.empujarA;
    const p = party[id];
    if (!p) return;
    const dist = distanciaEntre(ficha.id, ficha.nombre, p.id, p.nombre);
    if (dist != null && dist > ALCANCE_EMPUJAR) return;
    const d2 = derivar(ficha);
    const coste = costeDe(PCT_EMPUJE, d2.esenciaMax);
    if (coste > d2.esencia) return;
    ficha.esencia = d2.esencia - coste;
    ficha.grieta = Math.min(3, (ficha.grieta || 0) + 1);
    guardarFicha(); publicarEstado();
    anunciar(`${ficha.nombre} empuja la tirada de ${p.nombre}: +1 dado, y el dado va a su propia Grieta.`);
    render();
  });
  app.querySelectorAll("[data-ocultar]").forEach((b) => b.onclick = () => {
    const id = b.dataset.ocultar;
    const sel = (ficha._ocultarSel || []).slice();
    const i = sel.indexOf(id);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length < (ficha._ocultarN || 1)) sel.push(id);
    ficha._ocultarSel = sel;
    render();
  });
  app.querySelectorAll("[data-reacmob]").forEach((b) => b.onclick = () => {
    const [acc, id] = b.dataset.reacmob.split("|");
    resolverReaccionMob(acc, id);
  });
  app.querySelectorAll("[data-reac]").forEach((b) => b.onclick = () => {
    const [acc, id] = b.dataset.reac.split("|");
    resolverReaccion(acc, id);
  });

  // ---- panel de Mesa (DM) ----
  app.querySelectorAll("[data-ecodmg]").forEach((el) => el.oninput = () => {
    ficha._ecoDmg = ficha._ecoDmg || {};
    ficha._ecoDmg[el.dataset.ecodmg] = el.value;
  });
  app.querySelectorAll("[data-golpear-eco]").forEach((b) => b.onclick = () => {
    const id = b.dataset.golpearEco;
    const el = app.querySelector(`[data-ecodmg="${id}"]`);
    const v = (el && el.value !== "") ? el.value : ((ficha._ecoDmg || {})[id]);
    const n = Math.abs(Number(v) || 0);
    if (!n) return;
    mandarOrden(id, { danoEco: n });
  });
  app.querySelectorAll("[data-mesa-in]").forEach((el) => el.oninput = () => {
    ficha._mesaIn = ficha._mesaIn || {};
    ficha._mesaIn[el.dataset.mesaIn] = el.value;
  });
  app.querySelectorAll("[data-fichasel]").forEach((b) => b.onclick = () => {
    ficha._fichaSel = b.dataset.fichasel; render();
  });
  app.querySelectorAll("[data-pedir]").forEach((b) => b.onclick = () => {
    const id = b.dataset.pedir;
    esperandoFicha = id;
    mandarOrden(id, { pedirFicha: true });
    anunciar(`El DM abre la ficha de ${(party[id] || {}).nombre || "un personaje"}.`);
    render();
  });
  app.querySelectorAll("[data-expulsar]").forEach((b) => b.onclick = () => {
    quitarDeLaSala(b.dataset.expulsar);
  });
  app.querySelectorAll("[data-mesa]").forEach((b) => b.onclick = () => {
    ficha._mesaSel = b.dataset.mesa; render();
  });
  app.querySelectorAll("[data-mesa-grieta]").forEach((b) => b.onclick = () => {
    const sel = ficha._mesaSel || Object.keys(party)[0];
    if (sel) mandarOrden(sel, { grieta: Number(b.dataset.mesaGrieta) });
  });
  app.querySelectorAll("[data-mesa-estado]").forEach((b) => b.onclick = () => {
    const sel = ficha._mesaSel || Object.keys(party)[0];
    const p = party[sel];
    if (!p) return;
    const id = b.dataset.mesaEstado;
    const act = (p.estados || []).includes(id)
      ? (p.estados || []).filter((x) => x !== id)
      : [...(p.estados || []), id];
    mandarOrden(sel, { estados: act });
  });
  app.querySelectorAll("[data-mesa-acc]").forEach((b) => b.onclick = () => {
    const sel = ficha._mesaSel || Object.keys(party)[0];
    if (!sel) return;
    const acc = b.dataset.mesaAcc;
    const leer = (k) => {
      const el = app.querySelector(`[data-mesa-in="${k}"]`);
      const v = (el && el.value !== "") ? el.value : ((ficha._mesaIn || {})[k]);
      return Math.abs(Number(v) || 0);
    };
    if (acc === "danar") { const n = leer("dPv"); if (n) mandarOrden(sel, { dPv: -n }); }
    if (acc === "curar") { const n = leer("dPv"); if (n) mandarOrden(sel, { dPv: n }); }
    if (acc === "quitarEsencia") { const n = leer("dEsencia"); if (n) mandarOrden(sel, { dEsencia: -n }); }
    if (acc === "darEsencia") { const n = leer("dEsencia"); if (n) mandarOrden(sel, { dEsencia: n }); }
    if (acc === "recargar") mandarOrden(sel, { recargar: true });
    if (acc === "limpiarBuffs") mandarOrden(sel, { limpiarBuffs: true });
  });
  app.querySelectorAll("[data-mob-estado]").forEach((b) => b.onclick = () => {
    const [mid, eid] = b.dataset.mobEstado.split("|");
    const m = mobs[mid];
    if (!m) return;
    const act = (m.estados || []).includes(eid)
      ? (m.estados || []).filter((x) => x !== eid)
      : [...(m.estados || []), eid];
    guardarMobs({ ...mobs, [mid]: { ...m, estados: act } });
  });

  app.querySelectorAll("[data-tr]").forEach((el) => {
    el.onchange = () => render();
    el.oninput = () => {
      ficha.trasfondo = ficha.trasfondo || {};
      ficha.trasfondo[el.dataset.tr] = el.value;
      guardarFicha(); publicarEstado();
      // el retrato se refresca solo poco después de dejar de escribir
      if (el.dataset.tr === "imagen") {
        clearTimeout(temporizadorRetrato);
        temporizadorRetrato = setTimeout(() => render(), 700);
      }
    };
  });
  app.querySelectorAll("[data-culpable]").forEach((b) => b.onclick = () => {
    ficha.trasfondo = ficha.trasfondo || {};
    ficha.trasfondo.culpable = b.dataset.culpable;
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-motiv]").forEach((b) => b.onclick = () => {
    ficha.trasfondo = ficha.trasfondo || {};
    const mv = (ficha.trasfondo.motivaciones || []).slice();
    const i = Number(b.dataset.motiv);
    mv[i] = !mv[i];
    ficha.trasfondo.motivaciones = mv;
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-eco]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const i = Number(el.dataset.eco);
    ficha.ecos[i][el.dataset.ecok] = el.value;
    guardarFicha(); publicarEstado();
  }; });
  app.querySelectorAll("[data-eco-invocar]").forEach((b) => b.onclick = () => {
    const d2 = derivar(ficha);
    const coste = costeEco(d2.esenciaMax);
    if (d2.esencia < coste || ficha.ecoActivo) return;
    ficha.esencia = d2.esencia - coste;
    ficha.ecoActivo = b.dataset.ecoInvocar;
    const e = (ficha.ecos || []).find((x) => x.id === ficha.ecoActivo);
    guardarFicha(); publicarEstado();
    anunciar(`${ficha.nombre} invoca el Eco de ${e ? e.nombre : "una sombra"}.`);
    render();
  });
  app.querySelectorAll("[data-eco-guardar]").forEach((b) => b.onclick = () => {
    ficha.ecoActivo = null;
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-eco-quitar]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.ecoQuitar);
    if (ficha.ecos[i] && ficha.ecos[i].id === ficha.ecoActivo) ficha.ecoActivo = null;
    ficha.ecos.splice(i, 1);
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-eco-atacar]").forEach((b) => b.onclick = () => {
    const e = (ficha.ecos || []).find((x) => x.id === b.dataset.ecoAtacar);
    if (!e || ficha.ecoActivo !== e.id) return;
    const lista = Object.values(mobs).filter((m) => m.pv > 0);
    const obj = lista.find((m) => m.id === ficha._objetivo) || lista[0];
    const interf = interferencia((obj ? obj.rango : e.rango) - e.rango, 0);
    const r = tirar(e.pool, interf, 0);
    ultimaTirada = { ...r, interf, animando: true, resumen: "" };
    if (r.lectura === "fallo") {
      ultimaTirada.resumen = `El Eco de ${e.nombre} falla`;
    } else if (obj) {
      const bruto = e.dano * (r.lectura === "critico" ? 2 : 1);
      const real = roundUp(bruto * (1 - obj.resistencia / 100));
      const pvNuevo = clamp(obj.pv - real, 0, obj.pvMax);
      guardarMobs({ ...mobs, [obj.id]: { ...obj, pv: pvNuevo } });
      ultimaTirada.resumen = `El Eco de ${e.nombre} hace ${real} a ${obj.nombre} → ${pvNuevo}/${obj.pvMax}`;
    } else {
      ultimaTirada.resumen = `El Eco de ${e.nombre} ataca, pero no hay enemigos`;
    }
    anunciar(ultimaTirada.resumen);
    tab = "tirar"; render(); animarDados();
  });

  app.querySelectorAll("[data-ra]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const i = Number(el.dataset.ra);
    ficha.rasgos[i][el.dataset.rak] = el.value;
    guardarFicha(); publicarEstado();
  }; });
  app.querySelectorAll("[data-quitar-ra]").forEach((b) => b.onclick = () => {
    ficha.rasgos.splice(Number(b.dataset.quitarRa), 1);
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-raef]").forEach((el) => el.oninput = () => {
    const [i, j] = el.dataset.raef.split("|").map(Number);
    const k = el.dataset.raefk;
    ficha.rasgos[i].efectos[j][k] = k === "valor" ? (Number(el.value) || 0) : el.value;
    if (k === "tipo") {
      const t = TIPOS_RASGO.find((x) => x.id === el.value);
      if (t) ficha.rasgos[i].efectos[j].valor = t.def;
    }
    guardarFicha(); publicarEstado();
    if (k === "tipo") render();
  });
  app.querySelectorAll("[data-add-raef]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.addRaef);
    ficha.rasgos[i].efectos = ficha.rasgos[i].efectos || [];
    ficha.rasgos[i].efectos.push(efectoRasgoNuevo("dominio_vs"));
    guardarFicha(); render();
  });
  app.querySelectorAll("[data-quitar-raef]").forEach((b) => b.onclick = () => {
    const [i, j] = b.dataset.quitarRaef.split("|").map(Number);
    ficha.rasgos[i].efectos.splice(j, 1);
    guardarFicha(); render();
  });

  app.querySelectorAll("[data-forma]").forEach((b) => b.onclick = () => {
    const id = b.dataset.forma || null;
    ficha.formaActiva = (ficha.formaActiva === id) ? null : id;
    // al cambiar de forma, el PV máximo puede moverse: recórtalo si se pasa
    const dd = derivar(ficha);
    if (ficha.pv != null) ficha.pv = clamp(ficha.pv, 0, dd.pvMax);
    guardarFicha(); publicarEstado(); render();
  });
  app.querySelectorAll("[data-fm]").forEach((el) => { el.onchange = () => render(); el.oninput = () => {
    const i = Number(el.dataset.fm);
    const k = el.dataset.fk;
    ficha.formas[i][k] = ["dominio", "resistencia", "subeCant", "bajaCant"].includes(k)
      ? (Number(el.value) || 0) : el.value;
    guardarFicha(); publicarEstado();
    if (["sube", "baja", "curacion"].includes(k)) render();
  }; });
  app.querySelectorAll("[data-quitar-fm]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.quitarFm);
    if (ficha.formas[i].id === ficha.formaActiva) ficha.formaActiva = null;
    ficha.formas.splice(i, 1);
    guardarFicha(); publicarEstado(); render();
  });

  app.querySelectorAll("[data-dm]").forEach((b) => b.onclick = () => {
    const id = b.dataset.dm;
    ficha._dmAbierta = ficha._dmAbierta === id ? null : id;
    render();
  });

  app.querySelectorAll("[data-accion]").forEach((b) => b.onclick = () => accion(b.dataset.accion));
}

let animTimer = null, animFin = null, temporizadorRetrato = null;
function animarDados(alFinal) {
  clearInterval(animTimer); clearTimeout(animFin);
  animTimer = setInterval(() => {
    app.querySelectorAll(".dado.rodando").forEach((el) => {
      el.textContent = 1 + Math.floor(Math.random() * 6);
    });
  }, 70);
  animFin = setTimeout(() => {
    clearInterval(animTimer);
    if (ultimaTirada) ultimaTirada.animando = false;
    if (typeof alFinal === "function") alFinal();
    render();
  }, 750);
}

async function anunciar(texto) {
  if (!dentroDeOwlbear) return;
  try {
    await OBR.broadcast.sendMessage(CANAL, { texto }, { destination: "ALL" });
  } catch (e) { console.warn(e); }
}

function accion(a) {
  const d = derivar(ficha);
  if (a === "add-rasgo") {
    ficha.rasgos = ficha.rasgos || [];
    ficha.rasgos.push(rasgoNuevo());
    guardarFicha(); render(); return;
  }
  if (a === "add-forma") {
    ficha.formas = ficha.formas || [];
    ficha.formas.push(formaNueva());
    guardarFicha(); render(); return;
  }
  if (a === "regenerar") {
    const res = curar(ficha, d.regeneracion);
    ficha.pv = res.nuevo;
    guardarFicha(); publicarEstado();
    anunciar(`${ficha.nombre} regenera ${res.aplicado} PV`);
    render(); return;
  }
  if (a === "exportar") {
    const copia = { ...ficha };
    ["_codigo", "_importando", "_mesaSel", "_mesaIn", "_dmgIn", "_objMob", "_habMob",
     "_mobAbierto", "_fichaSel", "_dmAbierta", "_tirarStat", "_empujes", "_tRango",
     "_tClase", "_objetivo", "_ataque", "_ordenSeq", "_expulsado"].forEach((k) => delete copia[k]);
    ficha._codigo = JSON.stringify(copia);
    ficha._importando = false;
    ficha._copiado = null;
    render();
    // el portapapeles puede estar bloqueado dentro de Owlbear: probamos y avisamos
    setTimeout(() => {
      const ta = app.querySelector("textarea[readonly]");
      if (ta) { ta.focus(); ta.select(); }
      const ok = () => { ficha._copiado = true; render(); };
      const no = () => { ficha._copiado = false; render(); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ficha._codigo).then(ok).catch(() => {
            try { document.execCommand("copy") ? ok() : no(); } catch (_) { no(); }
          });
        } else {
          try { document.execCommand("copy") ? ok() : no(); } catch (_) { no(); }
        }
      } catch (_) { no(); }
    }, 60);
    return;
  }
  if (a === "importar") {
    ficha._importando = !ficha._importando;
    ficha._codigo = null;
    render(); return;
  }
  if (a === "confirmar-importar") {
    const ta = app.querySelector("[data-pegar]");
    if (!ta || !ta.value.trim()) return;
    try {
      const nueva = JSON.parse(ta.value.trim());
      if (!nueva || !nueva.stats) throw new Error("formato");
      const idActual = ficha.id;
      ficha = { ...nueva, id: idActual };   // conserva tu identidad en la sala
      (ficha.memorias || []).forEach((m) => { if (!m.hab) m.hab = memoriaHabNueva(); });
      (ficha.formas || []).forEach((fm) => {
        if (!fm.habilidades) fm.habilidades = [];
        if (!fm.pasivas) fm.pasivas = [];
      });
      ficha._importando = false;
      ficha._codigo = null;
      guardarFicha(); publicarEstado(); render();
    } catch (e) {
      ficha._codigo = null;
      ficha._importando = true;
      render();
    }
    return;
  }
  if (a === "confirmar-ocultar") {
    const sel = ficha._ocultarSel || [];
    if (sel.length) {
      const ordenes2 = {};
      sel.forEach((id) => {
        const p = party[id];
        if (!p) return;
        ordenes2[id] = { estados: [...new Set([...(p.estados || []), "invisible"])] };
      });
      mandarOrdenes(ordenes2);
      anunciar(`${ficha.nombre} oculta a ${sel.map((id) => (party[id] || {}).nombre).join(", ")}`);
    }
    ficha._ocultarN = 0; ficha._ocultarSel = [];
    guardarFicha(); render(); return;
  }
  if (a === "cancelar-ocultar") {
    ficha._ocultarN = 0; ficha._ocultarSel = [];
    render(); return;
  }
  if (a === "ver-retrato") { render(); return; }
  if (a === "guardar-edicion") {
    if (!modoEdicion) return;
    const destino = modoEdicion.id;
    const editada = fichaLimpia(ficha);
    // una sola escritura: la orden y el borrado de la ficha cedida
    (async () => {
      try {
        if (dentroDeOwlbear) {
          const meta = await OBR.room.getMetadata();
          const ord = { ...((meta && meta[CLAVE_ORDENES]) || {}) };
          const ed = { ...((meta && meta[CLAVE_EDICION]) || {}) };
          const prev = ord[destino] || { seq: 0 };
          ord[destino] = { fichaCompleta: editada, seq: (prev.seq || 0) + 1 };
          delete ed[destino];
          await OBR.room.setMetadata({ [CLAVE_ORDENES]: ord, [CLAVE_EDICION]: ed });
        }
      } catch (e) { console.warn("guardar edición", e); }
    })();
    anunciar(`El DM actualiza la ficha de ${modoEdicion.nombre}.`);
    ficha = modoEdicion.miFicha;
    modoEdicion = null;
    tab = "fichas";
    guardarFicha(); publicarEstado(); render();
    return;
  }
  if (a === "cancelar-edicion") {
    if (!modoEdicion) return;
    limpiarEdicion(modoEdicion.id);
    ficha = modoEdicion.miFicha;
    modoEdicion = null;
    tab = "fichas";
    render();
    return;
  }
  if (a === "iniciativa") { empezarCombate(); return; }
  if (a === "terminar-turno" || a === "pasar-turno") { siguienteTurno(); return; }
  if (a === "fin-turnos") { terminarCombateTurnos(); return; }
  if (a === "correr") {
    if (!ficha._corriendo) {
      if (turnos && ficha.accionUsada) return;
      ficha._corriendo = true;
      if (turnos) ficha.accionUsada = true;
      anunciar(`${ficha.nombre} corre: dobla su movimiento y pierde la acción.`);
    } else {
      ficha._corriendo = false;
      if (turnos) ficha.accionUsada = false;
    }
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "reiniciar-mov") {
    ficha.movGastado = 0;
    ficha._posTurno = null;
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "reunirme") {
    ficha._expulsado = false;
    ficha._ordenSeq = 0;
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "reiniciar-usos") {
    (ficha.habilidades || []).forEach((h) => { h.usos = 0; });
    (ficha.formas || []).forEach((fm) => (fm.habilidades || []).forEach((h) => { h.usos = 0; }));
    (ficha.memorias || []).forEach((m) => { if (m.hab) m.hab.usos = 0; });
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "limpiar-buffs") {
    ficha.buffs = [];
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "add-hab") {
    ficha.habilidades = ficha.habilidades || [];
    ficha.habilidades.push(habilidadNueva());
    guardarFicha(); render(); return;
  }
  if (a === "reset-grieta") { ficha.grieta = 0; guardarFicha(); publicarEstado(); render(); return; }
  if (a === "recargar") {
    ficha.pv = d.pvMax; ficha.esencia = d.esenciaMax; ficha.caidoFallos = 0;
    guardarFicha(); publicarEstado(); render(); return;
  }
  if (a === "atacar") {
    const lista = Object.values(mobs);
    const objetivoId = ficha._objetivo && mobs[ficha._objetivo] ? ficha._objetivo : (lista[0] ? lista[0].id : "");
    const obj = mobs[objetivoId] || null;
    const ataques = ataquesDisponibles();
    const atq = ataques.find((x) => x.id === (ficha._ataque || "arma")) || ataques[0];
    const statSel = ficha._tirarStat || ficha.aspectoStat;
    const empujes = ficha._empujes || 0;
    const costeEmpuje = costeDe(PCT_EMPUJE, d.esenciaMax);
    const costoTotal = (atq.costo || 0) + empujes * costeEmpuje;
    if (costoTotal > d.esencia) return;
    if (atq.agotada) return;
    // economía de acciones
    if (turnos) {
      if (!esMiTurno()) return;
      if (atq.accion === "accion" && ficha.accionUsada) return;
      if (atq.accion === "adicional" && ficha.adicionalUsada) return;
      if (atq.accion === "accion") ficha.accionUsada = true;
      if (atq.accion === "adicional") ficha.adicionalUsada = true;
    }
    if ((ficha.estados || []).includes("sellado") && atq.id !== "arma") return;

    const rangoObj = obj ? obj.rango : (ficha._tRango ?? ficha.rango);
    const claseObj = obj ? obj.clase : (ficha._tClase ?? 0);
    const interf = interferencia((rangoObj + 1) - (ficha.rango + 1), (claseObj + 1) - ficha.nivel);
    const p = poolDe(statsEfectivas(ficha)[statSel], ficha.estados, dadosExtraDe(ficha, statSel));
    const r = tirar(p.pool, interf, empujes);

    // registrar el uso de la habilidad (para coste por repetir y usos por combate)
    if (atq.idx != null && atq.idx >= 0 && ficha.habilidades[atq.idx]) {
      ficha.habilidades[atq.idx].usos = (ficha.habilidades[atq.idx].usos || 0) + 1;
    } else if (atq.formaIdx != null && d.forma) {
      const h = (d.forma.habilidades || [])[atq.formaIdx];
      if (h) h.usos = (h.usos || 0) + 1;
    } else if (atq.memIdx != null) {
      const h = ficha.memorias[atq.memIdx].hab;
      if (h) h.usos = (h.usos || 0) + 1;
    }
    // cobrar Esencia y subir Grieta por los empujes
    if (costoTotal > 0) ficha.esencia = Math.max(0, d.esencia - costoTotal);
    if (empujes > 0) ficha.grieta = Math.min(3, (ficha.grieta || 0) + empujes);
    ficha._empujes = 0;

    let resumen = "";
    const conecta = r.lectura !== "fallo";
    const todosEfs = atq.efectos || [];
    // el contexto decide qué efectos se disparan en esta tirada concreta
    const ctx = {
      conecta, lectura: r.lectura,
      pvPct: d.pvMax ? (d.pv / d.pvMax) * 100 : null,
      objPvPct: obj && obj.pvMax ? (obj.pv / obj.pvMax) * 100 : null,
      grieta: ficha.grieta || 0,
      invisible: (ficha.estados || []).includes("invisible"),
      estados: ficha.estados || [],
    };
    const efs = todosEfs.filter((e) => efectoAplica(e, ctx));
    const tiene = (t) => efs.find((e) => e.tipo === t);

    // los precios y los efectos con disparo "al fallar" se aplican aunque no conectes
    const precios = () => {
      const p2 = [];
      const cpv = tiene("coste_pv");
      if (cpv) { ficha.pv = clamp(d.pv - Number(cpv.valor), 0, d.pvMax); p2.push(`te cuesta ${cpv.valor} PV`); }
      const cg = tiene("coste_grieta");
      if (cg) { ficha.grieta = Math.min(3, (ficha.grieta || 0) + Number(cg.valor)); p2.push(`+${cg.valor} Grieta`); }
      const ce = tiene("coste_esencia_extra");
      if (ce) {
        ficha.esencia = Math.max(0, (ficha.esencia == null ? d.esenciaMax : ficha.esencia) - Number(ce.valor));
        p2.push(`−${ce.valor}E extra`);
      }
      const ae = tiene("auto_estado");
      if (ae) {
        const e2 = ae.estado || "herido";
        ficha.estados = [...new Set([...(ficha.estados || []), e2])];
        p2.push(`te quedas ${(ESTADOS.find((x) => x.id === e2) || {}).label || e2}`);
      }
      const pf = tiene("perder_forma");
      if (pf && ficha.formaActiva) { ficha.formaActiva = null; p2.push("sales de tu Forma"); }
      const co = tiene("curar_objetivo");
      if (co && obj) {
        const cur = roundUp(obj.pvMax * (Number(co.valor) / 100));
        sigMobs[obj.id] = { ...sigMobs[obj.id], pv: clamp((sigMobs[obj.id] || obj).pv + cur, 0, obj.pvMax) };
        p2.push(`el objetivo se cura ${cur}`);
      }
      return p2;
    };

    if (conecta && (atq.ofensiva || tiene("dano_verdadero") || tiene("curar_aliado") ||
                    tiene("buff_dominio") || tiene("buff_resistencia") || tiene("curar_pct_objetivo"))) {
      let sigMobs = { ...mobs };   // se acumula aquí y se escribe una sola vez al final
      const resistObj = obj ? obj.resistencia : MOB_RESIST_LOCAL(rangoObj);
      const marcado = obj && (obj.estados || []).includes("marcado");
      const rasgos = bonosDeRasgos(ficha, (obj && obj.tags) || []);
      const ignoraRes = !!tiene("ignorar_resistencia") || marcado || rasgos.ignorarRes;
      const ignoraRD = !!tiene("ignorar_rd");
      const partes = [];

      const critico = r.lectura === "critico";
      const eraInvisible = (ficha.estados || []).includes("invisible");
      const bonusInv = eraInvisible ? tiene("dano_si_invisible") : null;
      let total = 0;
      if (atq.ofensiva) {
        const dc = danoContra(atq.dano, ignoraRes ? 0 : resistObj,
                              ignoraRD ? 0 : (rangoObj + 1) - (ficha.rango + 1),
                              ficha.arma.rangoArma, ficha.rango + 1, rangoObj + 1);
        let golpe = critico ? dc.final * 2 : dc.final;
        if (rasgos.dominio) {
          golpe = roundUp(golpe * (1 + rasgos.dominio / 100));
          partes.push(`${rasgos.activos.join(", ")} +${rasgos.dominio}%`);
        }
        if (bonusInv) {
          golpe = roundUp(golpe * (1 + Number(bonusInv.valor) / 100));
          partes.push(`desde las sombras +${bonusInv.valor}%`);
        }
        total += golpe;
        if (critico) partes.push("CRÍTICO ×2");
        if (ignoraRes) partes.push("ignora Resistencia");
        if (ignoraRD && dc.rd === 0) partes.push("ignora RD");
      }

      // daño verdadero por % de vida máxima
      if (rasgos.verdadero && obj) {
        const extra = roundUp(obj.pvMax * (rasgos.verdadero / 100));
        total += extra;
        partes.push(`${extra} verdadero por rasgo`);
      }
      const dv = tiene("dano_verdadero");
      let danoVerdadero = 0;
      if (dv && obj) {
        danoVerdadero = roundUp(obj.pvMax * (dv.valor / 100)) * (critico ? 2 : 1);
        total += danoVerdadero;
        partes.push(`${danoVerdadero} verdadero`);
      }

      // si la criatura puede reaccionar, el golpe queda pendiente para el DM
      if (obj && total > 0 && obj.esquiva && !obj.reaccionUsada) {
        lanzarGolpe({
          deNombre: `${ficha.nombre} · ${atq.label}`,
          objetivoId: obj.id, objetivoNombre: obj.nombre,
          bruto: total, contraMob: true, mobId: obj.id,
        });
        resumen = `${total} de daño a ${obj.nombre} — esperando su reacción`;
        if (partes.length) resumen += " · " + partes.join(" · ");
        anunciar(`${ficha.nombre} · ${atq.label} [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]} · ${resumen}`);
        ultimaTirada = { ...r, interf, resumen, animando: true };
        guardarFicha(); publicarEstado();
        tab = "tirar"; render(); animarDados(); return;
      }
      if (obj && total > 0) {
        const pvNuevo = clamp(obj.pv - total, 0, obj.pvMax);
        if (pvNuevo === 0 && obj.pv > 0) {
          if (rasgos.curarAlMatar) {
            const res = curar(ficha, rasgos.curarAlMatar);
            ficha.pv = res.nuevo;
            partes.push(`te curas ${res.aplicado} al matarlo`);
          }
          if (rasgos.esenciaAlMatar) {
            ficha.esencia = clamp((ficha.esencia == null ? d.esenciaMax : ficha.esencia) + rasgos.esenciaAlMatar, 0, d.esenciaMax);
            partes.push(`+${rasgos.esenciaAlMatar}E al matarlo`);
          }
        }
        sigMobs[obj.id] = { ...sigMobs[obj.id], pv: pvNuevo };
        resumen = `${total} de daño a ${obj.nombre} → ${pvNuevo}/${obj.pvMax}${pvNuevo === 0 ? " · cae" : ""}`;
      } else if (total > 0) {
        resumen = `${total} de daño (sin objetivo en el encuentro)`;
      }

      // curaciones
      let curado = 0;
      let topado = false;
      const cpo = tiene("curar_pct_objetivo");
      if (cpo && obj) {
        const bruto = roundUp(obj.pvMax * (cpo.valor / 100));
        const tope = topeCuracion(cpo, d.pvMax);
        if (bruto > tope) topado = true;
        curado += Math.min(bruto, tope);
      }
      const cpd = tiene("curar_pct_dano");
      if (cpd) curado += roundUp(total * (cpd.valor / 100));
      if (curado > 0) {
        const res = curar(ficha, curado);
        ficha.pv = res.nuevo;
        partes.push(res.bloqueada
          ? "curación anulada por tu forma"
          : `te curas ${res.aplicado}${topado ? " (al tope)" : ""}`);
      }

      // buffs temporales
      const bd = tiene("buff_dominio");
      const br = tiene("buff_resistencia");
      if (bd || br) {
        ficha.buffs = ficha.buffs || [];
        ficha.buffs.push({ id: uid(), nombre: atq.label,
                           dominio: bd ? bd.valor : 0, resistencia: br ? br.valor : 0 });
        partes.push(`${bd ? `+${bd.valor}% Dominio` : ""}${bd && br ? " y " : ""}${br ? `+${br.valor}% Resist.` : ""}`);
      }

      const ca = tiene("curar_aliado");
      if (ca) partes.push(`cura ${ca.valor} PV a un aliado (aplícalo en su ficha)`);

      // aplicar un estado al objetivo
      const ae = tiene("aplicar_estado");
      if (ae && obj) {
        const est = ae.estado || "herido";
        const base = sigMobs[obj.id] || {};
        const act = (base.estados || []).includes(est) ? base.estados : [...(base.estados || []), est];
        sigMobs[obj.id] = { ...base, estados: act };
        partes.push(`${(ESTADOS.find((x) => x.id === est) || {}).label || est} al objetivo`);
      }

      // daño en área al resto de enemigos
      const da = tiene("dano_area");
      if (da && total > 0) {
        const pct = Number(da.valor) / 100;
        let tocados = 0;
        Object.values(sigMobs).forEach((m2) => {
          if (obj && m2.id === obj.id) return;
          if (m2.pv <= 0) return;
          const g2 = roundUp(total * pct * (1 - m2.resistencia / 100));
          sigMobs[m2.id] = { ...m2, pv: clamp(m2.pv - g2, 0, m2.pvMax) };
          tocados++;
        });
        if (tocados) partes.push(`alcanza a ${tocados} enemigo${tocados > 1 ? "s" : ""} más`);
      }

      // robar Esencia
      const re = tiene("robar_esencia");
      if (re) {
        ficha.esencia = clamp((ficha.esencia == null ? d.esenciaMax : ficha.esencia) + Number(re.valor), 0, d.esenciaMax);
        partes.push(`robas ${re.valor}E`);
      }

      // invulnerabilidad
      const inv = tiene("invulnerable");
      if (inv) {
        ficha.invulnerable = (ficha.invulnerable || 0) + Number(inv.valor);
        partes.push(`invulnerable ${inv.valor} golpe${Number(inv.valor) > 1 ? "s" : ""}`);
      }

      // limpiarte los estados
      if (tiene("limpiar_estados")) { ficha.estados = []; partes.push("te quitas los estados"); }

      // cambiar de Forma
      const cf = tiene("cambiar_forma");
      if (cf && cf.forma) {
        const fm = (ficha.formas || []).find((x) => x.id === cf.forma);
        if (fm && ficha.formaActiva !== cf.forma) {
          ficha.formaActiva = cf.forma;
          const dNueva = derivar(ficha);
          if (ficha.pv != null) ficha.pv = clamp(ficha.pv, 0, dNueva.pvMax);
          partes.push(`te transformas en ${fm.nombre || "otra forma"}`);
        }
      }

      // volverse invisible
      const vi = tiene("volverse_invisible");
      if (vi) {
        ficha.estados = [...new Set([...(ficha.estados || []), "invisible"])];
        ficha.invisModo = vi.rompe || "atacar";
        partes.push(`te vuelves Invisible (${(ROTURAS_INVIS.find((x) => x.id === ficha.invisModo) || {}).label || ""})`);
      } else if (eraInvisible) {
        const modo = ficha.invisModo || "atacar";
        const rompe = modo === "atacar" || (modo === "conectar" && conecta);
        if (rompe) {
          ficha.estados = (ficha.estados || []).filter((x) => x !== "invisible");
          partes.push("pierdes la invisibilidad");
        } else {
          partes.push("sigues oculto");
        }
      }

      // ocultar aliados
      const ia = tiene("invisible_aliados");
      if (ia) {
        ficha._ocultarN = Number(ia.valor) || 1;
        ficha._ocultarModo = ia.rompe || "atacar";
        partes.push(`puedes ocultar a ${ficha._ocultarN} aliado(s)`);
      }

      partes.push(...precios());
      guardarMobs(sigMobs);   // única escritura de todo el ataque
      if (partes.length) resumen = (resumen ? resumen + " · " : "") + partes.join(" · ");
      if (r.lectura === "costo") resumen += " · el DM añade una complicación o un estado";
      anunciar(`${ficha.nombre} · ${atq.label} [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]}${resumen ? " · " + resumen : ""}`);
    } else if (!atq.ofensiva) {
      const extras = precios();
      resumen = (conecta ? "Habilidad de utilidad: describe el efecto" : "No sale como esperabas")
        + (extras.length ? " · " + extras.join(" · ") : "");
      anunciar(`${ficha.nombre} · ${atq.label} [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]}`);
    } else {
      const extras = precios();
      // efectos que se disparan justo al fallar
      const dvF = tiene("dano_verdadero");
      if (dvF && obj) {
        const g2 = roundUp(obj.pvMax * (Number(dvF.valor) / 100));
        guardarMobs({ ...mobs, [obj.id]: { ...obj, pv: clamp(obj.pv - g2, 0, obj.pvMax) } });
        extras.push(`aun así ${g2} verdadero a ${obj.nombre}`);
      }
      if (tiene("volverse_invisible")) {
        ficha.estados = [...new Set([...(ficha.estados || []), "invisible"])];
        extras.push("te vuelves Invisible");
      }
      resumen = extras.length ? extras.join(" · ") : "Sin daño";
      anunciar(`${ficha.nombre} · ${atq.label} [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]}${extras.length ? " · " + extras.join(" · ") : ""}`);
    }

    ultimaTirada = { ...r, interf, resumen, animando: true };
    guardarFicha(); publicarEstado();
    tab = "tirar"; render(); animarDados(); return;
  }
  if (a === "esquivar") {
    const p = poolDe(statsEfectivas(ficha).instinto, ficha.estados, dadosExtraDe(ficha, 'instinto'));
    const r = tirar(p.pool, 0, 0);
    ficha.esencia = Math.max(0, d.esencia - 1);
    ficha.grieta = Math.min(3, (ficha.grieta || 0) + 1);
    const efecto = r.lectura === "limpio" || r.lectura === "critico"
      ? "Niegas el golpe por completo"
      : r.lectura === "costo" ? "Bajas el ataque un escalón" : "No logras evitarlo";
    ultimaTirada = { ...r, interf: 0, resumen: efecto, animando: true };
    guardarFicha(); publicarEstado();
    anunciar(`${ficha.nombre} · Esquiva [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]} · ${efecto}`);
    tab = "tirar"; render(); animarDados(); return;
  }
  if (a === "tirar-caida") {
    const p = poolDe(statsEfectivas(ficha).voluntad, ficha.estados, dadosExtraDe(ficha, 'voluntad'));
    const r = tirar(p.pool, 0, 0);
    ultimaTirada = { ...r, interf: 0, animando: true };
    if (r.lectura === "limpio" || r.lectura === "critico") { ficha.pv = 1; ficha.caidoFallos = 0; }
    else if (r.lectura === "fallo") ficha.caidoFallos = (ficha.caidoFallos || 0) + 1;
    guardarFicha(); publicarEstado();
    anunciar(`${ficha.nombre} — Voluntad estando Caído [${r.dados.join(", ")}] → ${TEXTO_LECTURA[r.lectura]}${ficha.caidoFallos >= 3 ? " · TERCER FALLO" : ""}`);
    render(); animarDados(); return;
  }
  if (a === "estabilizar") { ficha.pv = 1; ficha.caidoFallos = 0; guardarFicha(); publicarEstado(); render(); return; }
  if (a === "add-mob") { agregarMob(bestRango, bestClase); return; }
  if (a === "add-mob-3") { (async () => { for (let i = 0; i < 3; i++) await agregarMob(bestRango, bestClase); })(); return; }
  if (a === "add-mob-5") { (async () => { for (let i = 0; i < 5; i++) await agregarMob(bestRango, bestClase); })(); return; }
  if (a === "limpiar-caidos") {
    const sig = {};
    Object.values(mobs).forEach((m) => { if (m.pv > 0) sig[m.id] = m; });
    guardarMobs(sig); return;
  }
  if (a === "fin-combate") {
    // Una sola escritura: tres seguidas se pisan o se descartan en Owlbear.
    (async () => {
      mobs = {};
      ataques = {};
      try {
        if (dentroDeOwlbear) {
          const meta = await OBR.room.getMetadata();
          const ord = { ...((meta && meta[CLAVE_ORDENES]) || {}) };
          const ids = new Set([...Object.keys(party), ficha.id]);
          ids.forEach((id) => {
            const prev = ord[id] || { seq: 0 };
            ord[id] = { finCombate: true, seq: (prev.seq || 0) + 1 };
          });
          await OBR.room.setMetadata({
            [CLAVE_MOBS]: {},
            [CLAVE_ATAQUES]: {},
            [CLAVE_ORDENES]: ord,
          });
        }
      } catch (e) { console.warn("fin de combate", e); }
      render();
    })();
    ficha.buffs = [];
    ficha.invulnerable = 0;
    (ficha.habilidades || []).forEach((h) => { h.usos = 0; });
    (ficha.formas || []).forEach((fm) => (fm.habilidades || []).forEach((h) => { h.usos = 0; }));
    (ficha.memorias || []).forEach((m) => { if (m.hab) m.hab.usos = 0; });
    ficha.estados = [];
    guardarFicha(); publicarEstado();
    anunciar("Fin del combate: se limpian buffs, estados y usos de habilidad.");
    render(); return;
  }
  if (a === "recargar-grupo") { recargarGrupo(); return; }
  if (a === "vaciar-mesa") {
    (async () => {
      try {
        if (dentroDeOwlbear) {
          await OBR.room.setMetadata({ [CLAVE_META]: {}, [CLAVE_HOJAS]: {}, [CLAVE_ORDENES]: {} });
        }
        ficha._ordenSeq = 0;
        ficha._expulsado = false;
        guardarFicha();
        publicarEstado();
        anunciar("El DM vacía la mesa: los conectados vuelven a aparecer.");
        render();
      } catch (e) { console.warn(e); }
    })();
    return;
  }
  if (a === "recargar-grupo-todo") {
    const todas = {};
    Object.keys(party).forEach((id) => { todas[id] = { recargar: true }; });
    mandarOrdenes(todas);
    anunciar("El DM restaura al grupo por completo.");
    return;
  }
}

// La criatura reacciona al golpe que le acaba de llegar.
async function resolverReaccionMob(acc, id) {
  const g = ataques[id];
  if (!g || !g.contraMob) return;
  const m = mobs[g.mobId];
  if (!m) return;
  const me = mobEfectivo(m);
  let real = roundUp(g.bruto * (1 - me.resistencia / 100));
  let nota = `${g.bruto} bruto − ${me.resistencia}% Resist.`;
  const cambios = { ...m };

  if (acc === "esquivar") {
    if (m.reaccionUsada) return;
    const r = tirar(me.pool, 0, 0);
    ultimaTirada = { ...r, interf: 0, animando: true, resumen: "" };
    if (r.lectura === "limpio" || r.lectura === "critico") { real = 0; nota = "Esquiva limpia · sin daño"; }
    else if (r.lectura === "costo") { real = roundUp(real / 2); nota += " · esquiva parcial, mitad"; }
    else nota += " · esquiva fallida";
    ultimaTirada.resumen = `${m.nombre}: ${nota}`;
    cambios.reaccionUsada = true;
  }

  cambios.pv = clamp(m.pv - real, 0, m.pvMax);
  const sig = { ...mobs, [m.id]: cambios };
  anunciar(`${m.nombre} recibe ${real} · ${nota}${cambios.pv === 0 ? " · cae" : ""}`);
  await cerrarGolpeYMobs(id, sig);
  if (acc === "esquivar") { render(); animarDados(); } else render();
}

async function resolverReaccion(acc, id) {
  const g = ataques[id];
  if (!g) return;
  // recibir el golpe sin más no consume tu reacción
  const consume = acc !== "recibir" && acc !== "anular";
  if (consume && turnos && ficha.reaccionUsada) return;
  let mobsPend = null;   // cambios en enemigos durante la reacción, en una sola escritura
  const d = derivar(ficha);
  const rx = misReacciones();

  if (acc === "anular") { cerrarGolpe(id); return; }

  if (acc === "interponer") {
    const coste = rx.interponer ? Number(rx.interponer.valor) || 0 : 0;
    if (coste > d.esencia) return;
    if (coste) ficha.esencia = d.esencia - coste;
    const real = roundUp(g.bruto * (1 - d.resistenciaAplicada / 100));
    ficha.pv = clamp(d.pv - real, 0, d.pvMax);
    guardarFicha(); publicarEstado();
    if (turnos) ficha.reaccionUsada = true;
    anunciar(`${ficha.nombre} se interpone por ${g.objetivoNombre} y recibe ${real}`);
    await cerrarGolpe(id);
    render(); return;
  }

  let real = roundUp(g.bruto * (1 - d.resistenciaAplicada / 100));
  let nota = `${g.bruto} bruto − ${d.resistenciaAplicada}% Resist.`;
  if ((ficha.invulnerable || 0) > 0) {
    ficha.invulnerable -= 1;
    real = 0;
    nota = `Invulnerable · golpe ignorado (quedan ${ficha.invulnerable})`;
  }

  if (acc === "esquivar") {
    const coste = costeDe(PCT_ESQUIVA, d.esenciaMax);
    if (coste > d.esencia) return;
    ficha.esencia = d.esencia - coste;
    ficha.grieta = Math.min(3, (ficha.grieta || 0) + 1);
    const p = poolDe(statsEfectivas(ficha).instinto, ficha.estados, dadosExtraDe(ficha, 'instinto'));
    const r = tirar(p.pool, 0, 0);
    ultimaTirada = { ...r, interf: 0, animando: true, resumen: "" };
    if (r.lectura === "limpio" || r.lectura === "critico") { real = 0; nota = "Esquiva limpia · sin daño"; }
    else if (r.lectura === "costo") { real = roundUp(real / 2); nota += " · esquiva parcial, mitad"; }
    else { nota += " · esquiva fallida"; }
    ultimaTirada.resumen = nota;
  }

  if (acc === "parry") {
    if (!rx.parry) return;
    const coste = costeDe(PCT_ESQUIVA, d.esenciaMax);
    if (coste > d.esencia) return;
    ficha.esencia = d.esencia - coste;
    ficha.grieta = Math.min(3, (ficha.grieta || 0) + 1);
    const st = rx.parry.stat || "instinto";
    const p = poolDe(statsEfectivas(ficha)[st], ficha.estados, dadosExtraDe(ficha, st));
    const r = tirar(p.pool, 0, 0);
    ultimaTirada = { ...r, interf: 0, animando: true, resumen: "" };
    if (r.lectura === "limpio" || r.lectura === "critico") {
      real = 0;
      nota = `Parry limpio con ${STAT_LABEL[st]} · golpe anulado`;
      // contraataque al punto débil del atacante
      const pd = (ficha.habilidades || []).flatMap((h) => h.efectos || [])
        .find((e) => e.tipo === "dano_verdadero");
      const m = g.mobId ? mobs[g.mobId] : null;
      if (pd && m) {
        const golpe = roundUp(m.pvMax * (Number(pd.valor) / 100));
        const pvNuevo = clamp(m.pv - golpe, 0, m.pvMax);
        mobsPend = { ...(mobsPend || mobs), [m.id]: { ...m, pv: pvNuevo } };
        nota += ` · contra al punto débil: ${golpe} verdadero a ${m.nombre} → ${pvNuevo}/${m.pvMax}`;
      }
    } else if (r.lectura === "costo") {
      real = roundUp(real / 2);
      nota += " · parry parcial, mitad";
    } else {
      nota += " · parry fallido";
    }
    ultimaTirada.resumen = nota;
  }

  if (acc === "inmune") {
    const coste = rx.inmune ? Number(rx.inmune.valor) || 0 : 0;
    if (coste > d.esencia) return;
    if (coste) ficha.esencia = d.esencia - coste;
    real = 0;
    nota = "Invulnerable a este golpe";
  }
  if (acc === "mitad") {
    const coste = rx.mitad ? Number(rx.mitad.valor) || 0 : 0;
    if (coste > d.esencia) return;
    if (coste) ficha.esencia = d.esencia - coste;
    real = roundUp(real / 2);
    nota += " · reducido a la mitad";
  }

  // extras que trae el golpe (habilidades del mob)
  if (g.verdadero) { real += g.verdadero; nota += ` · +${g.verdadero} verdadero`; }
  if (g.estado && !(d.inmunidades || []).includes(g.estado)) {
    ficha.estados = [...new Set([...(ficha.estados || []), g.estado])];
    nota += ` · ${(ESTADOS.find((x) => x.id === g.estado) || {}).label || g.estado}`;
  }
  if (g.drenar) {
    ficha.esencia = clamp((ficha.esencia == null ? d.esenciaMax : ficha.esencia) - g.drenar, 0, d.esenciaMax);
    nota += ` · −${g.drenar}E`;
  }

  ficha.pv = clamp(d.pv - real, 0, d.pvMax);
  if (real > 0 && (ficha.estados || []).includes("invisible") &&
      (ficha.invisModo || "atacar") === "recibir") {
    ficha.estados = (ficha.estados || []).filter((x) => x !== "invisible");
    nota += " · te delatas";
  }
  revisarAutoForma();
  if (d.reflejar && real > 0 && g.mobId && mobs[g.mobId]) {
    const m = mobs[g.mobId];
    const dev = roundUp(real * (d.reflejar / 100));
    const base = (mobsPend || mobs)[m.id] || m;
    mobsPend = { ...(mobsPend || mobs), [m.id]: { ...base, pv: clamp(base.pv - dev, 0, m.pvMax) } };
    nota += ` · devuelves ${dev}`;
  }
  if (consume && turnos) ficha.reaccionUsada = true;
  guardarFicha(); publicarEstado();
  anunciar(`${ficha.nombre} recibe ${real} · ${nota}`);
  await cerrarGolpeYMobs(id, mobsPend);
  if (acc === "esquivar" || acc === "parry") { tab = "tirar"; render(); animarDados(); return; }
  render();
}

// Recargar la Esencia de todos: se manda como orden a cada ficha,
// porque tocar solo la copia de la sala se revierte en cuanto el jugador publique.
async function recargarGrupo() {
  const todas = {};
  Object.values(party).forEach((p) => { todas[p.id] = { esencia: p.esenciaMax }; });
  const d = derivar(ficha);
  todas[ficha.id] = { esencia: d.esenciaMax };
  await mandarOrdenes(todas);
  anunciar("El DM recarga la Esencia del grupo.");
  render();
}

// ---------- arranque ----------
ficha = cargarFicha();
cargarBestiario();

if (OBR.isAvailable) {
  OBR.onReady(async () => {
    dentroDeOwlbear = true;
    try {
      miRol = await OBR.player.getRole();
      // ID de usuario: el mismo aunque entres desde otro navegador o pestaña
      try {
        idUsuario = (OBR.player.getId ? await OBR.player.getId() : null) || OBR.player.id || null;
      } catch (_) { idUsuario = OBR.player.id || null; }
      if (idUsuario) {
        cargarBestiario();
        const guardada = localStorage.getItem(claveLocal());
        if (guardada) {
          try { ficha = JSON.parse(guardada); } catch (_) {}
          (ficha.memorias || []).forEach((m) => { if (!m.hab) m.hab = memoriaHabNueva(); });
          (ficha.formas || []).forEach((fm) => {
            if (!fm.habilidades) fm.habilidades = [];
            if (!fm.pasivas) fm.pasivas = [];
          });
        }
        // la ficha se identifica por la cuenta: nada de duplicados por navegador
        ficha.id = idUsuario;
        ficha._expulsado = false;
        guardarFicha();
      }
      const meta = await OBR.room.getMetadata();
      party = (meta && meta[CLAVE_META]) || {};
      mobs = (meta && meta[CLAVE_MOBS]) || {};
      ordenes = (meta && meta[CLAVE_ORDENES]) || {};
      ataques = (meta && meta[CLAVE_ATAQUES]) || {};
      hojas = (meta && meta[CLAVE_HOJAS]) || {};
      edicion = (meta && meta[CLAVE_EDICION]) || {};
      turnos = (meta && meta[CLAVE_TURNOS]) || null;
      aplicarOrdenes(ordenes);
      OBR.room.onMetadataChange((m) => {
        party = (m && m[CLAVE_META]) || {};
        mobs = (m && m[CLAVE_MOBS]) || {};
        // si mi ficha desapareció de la sala y no estoy expulsado, me repongo
        const estadoSala = (m && m[CLAVE_META]) || {};
        if (!ficha._expulsado && ficha.id && !estadoSala[ficha.id]) {
          clearTimeout(pendiente);
          pendiente = setTimeout(() => publicarEstado(), 120);
        }
        const antesAtaques = Object.keys(ataques).length;
        ataques = (m && m[CLAVE_ATAQUES]) || {};
        hojas = (m && m[CLAVE_HOJAS]) || {};
        edicion = (m && m[CLAVE_EDICION]) || {};
        const turnosAntes = turnos;
        turnos = (m && m[CLAVE_TURNOS]) || null;
        if (esperandoFicha && edicion[esperandoFicha] && !modoEdicion) {
          modoEdicion = { id: esperandoFicha,
                          nombre: (party[esperandoFicha] || {}).nombre || "ese personaje",
                          miFicha: ficha };
          ficha = edicion[esperandoFicha].ficha;
          esperandoFicha = null;
          tab = "ficha";
          render();
        }
        const cambio = aplicarOrdenes((m && m[CLAVE_ORDENES]) || {}) ||
                       Object.keys(ataques).length !== antesAtaques;
        const turnoCambio = JSON.stringify(turnos) !== JSON.stringify(turnosAntes);
        if (cambio || turnoCambio || ["grupo","bestiario","tirar","dm","fichas"].includes(tab)) render();
      });
      OBR.broadcast.onMessage(CANAL, (ev) => {
        if (ev.data && ev.data.texto) {
          OBR.notification.show(ev.data.texto, "DEFAULT").catch(() => {});
        }
      });
      await leerTablero();
      try {
        OBR.scene.items.onChange((its) => {
          piezas = its;
          const movio = revisarMovimiento();
          // las distancias cambian: alcances, interponerse y objetivos
          if (!movio && (Object.keys(ataques).length || tab === "tirar" || tab === "bestiario")) render();
        });
        if (OBR.scene.grid) OBR.scene.grid.onChange(() => { leerTablero(); });
      } catch (_) {}
      try {
        if (miRol === "GM") {
          OBR.contextMenu.create({
            id: "cdlc/vincular-mob",
            icons: [{ icon: "/Extensi-n-de-owlbear/icon.svg", label: "Ligar al enemigo seleccionado en el Bestiario",
                      filter: { every: [{ key: "type", value: "IMAGE" }] } }],
            onClick(ctx) {
              const it = ctx.items[0];
              const idMob = ficha._mobAbierto || Object.keys(mobs)[0];
              const m = mobs[idMob];
              if (it && m) {
                guardarMobs({ ...mobs, [idMob]: { ...m, pieza: it.id } });
                vincularPieza(it.id, idMob, "mob");
                anunciar(`${m.nombre} queda ligado a «${it.name || "una ficha"}».`);
              }
            },
          });
        }
        OBR.contextMenu.create({
          id: "cdlc/vincular",
          icons: [{ icon: "/Extensi-n-de-owlbear/icon.svg", label: "Vincular a mi personaje", filter: { every: [{ key: "type", value: "IMAGE" }] } }],
          onClick(ctx) {
            const it = ctx.items[0];
            if (it) {
              vincularPieza(it.id, ficha.id, "pj");
              anunciar(`${ficha.nombre} usa la ficha «${it.name || "sin nombre"}» en el tablero.`);
            }
          },
        });
      } catch (_) {}
      await publicarEstado();
    } catch (e) { console.warn("SDK", e); }
    render();
  });
} else {
  render();
}
