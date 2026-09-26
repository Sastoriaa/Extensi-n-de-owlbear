export const RANGOS = ["Dormido", "Despierto", "Caído", "Trascendente", "Supremo", "Sagrado", "Divino"];
export const CLASES = ["Bestia", "Monstruo", "Demonio", "Diablo", "Tirano", "Terror", "Titán"];
export const STAT_CAP = [4, 5, 5, 6, 6, 7, 7];
export const MOB_RESIST = [10, 20, 30, 40, 50, 60, 70];
export const CLASE_PV = [15, 28, 52, 90, 160, 260, 420];
export const CLASE_DANO = [3, 5, 9, 15, 24, 36, 55];
export const DANO_BASE_RANGO = [2, 7, 15, 28, 49, 86, 152];
export const PJ_PV_BASE = [19, 29, 44, 69, 104, 164, 258];
export const STAT_KEYS = ["cuerpo", "instinto", "mente", "voluntad"];
export const STAT_LABEL = { cuerpo: "Cuerpo", instinto: "Instinto", mente: "Mente", voluntad: "Voluntad" };
export const MEMORIA_SLOTS = ["Casco", "Pecho", "Piernas", "Pies", "Anillo", "Mano 1", "Mano 2"];
export const ESTADOS = [
  { id: "herido", label: "Herido", desc: "tu pool baja 1 dado" },
  { id: "marcado", label: "Marcado", desc: "el próximo ataque ignora tu Resistencia" },
  { id: "expuesto", label: "Expuesto", desc: "no puedes Esquivar el próximo golpe" },
  { id: "sellado", label: "Sellado", desc: "no puedes usar habilidades" },
  { id: "invisible", label: "Invisible", desc: "los enemigos no pueden elegirte como objetivo; atacar te delata" },
];
export const PERFILES_HABILIDAD = [
  { id: "ligera", label: "Ligera", mult: 1.0, costo: "sin costo", ofensiva: true },
  { id: "estandar", label: "Estándar", mult: 1.5, costo: "sin costo, con límite", ofensiva: true },
  { id: "pesada", label: "Pesada", mult: 2.5, costo: "1 Esencia", ofensiva: true },
  { id: "devastadora", label: "Devastadora", mult: 4.0, costo: "2 Esencia, 1 vez por combate", ofensiva: true },
  { id: "utilidad", label: "Utilidad", mult: 0, costo: "sin costo", ofensiva: false },
  { id: "utilidad_mayor", label: "Utilidad mayor", mult: 0, costo: "1 Esencia", ofensiva: false },
];
export const TIPOS_ARMA = [
  { id: "vacia", label: "Mano vacía", mult: 0.5, manos: 0 },
  { id: "pequena", label: "Pequeña", mult: 1, manos: 1 },
  { id: "grande", label: "Grande", mult: 1.5, manos: 2 },
  { id: "aspecto", label: "Ligada a Aspecto", mult: 1.75, manos: 1 },
];

export const roundUp = (n) => Math.ceil(n - 1e-9);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const uid = () => Math.random().toString(36).slice(2, 10);

export function fichaNueva(nombre) {
  return {
    id: uid(),
    nombre: nombre || "Nuevo personaje",
    rango: 0,
    nivel: 1,
    stats: { cuerpo: 1, instinto: 1, mente: 1, voluntad: 1 },
    aspectoNombre: "",
    aspectoStat: "cuerpo",
    habilidades: [],
    defecto: "",
    arma: { nombre: "", tipo: "pequena", danoBase: 20, rangoArma: 1 },
    memorias: MEMORIA_SLOTS.map((slot) => ({ slot, nombre: "", rangoOrigen: 1, claseOrigen: 1,
      dominioPts: 0, resistenciaPts: 0, hab: memoriaHabNueva() })),
    pv: null,
    esencia: null,
    grieta: 0,
    estados: [],
    caidoFallos: 0,
    formas: [],
    formaActiva: null,
    efectos: [],
    buffs: [],
    rasgos: [],
    reaccionUsada: false,
    accionUsada: false,
    adicionalUsada: false,
    movGastado: 0,
    ecos: [],
    ecoActivo: null,
    atributos: "",
    trasfondo: { delito: "", culpable: "no_seguro", motivaciones: [], otraRazon: "",
                 apariencia: "", personalidad: "", historia: "", imagen: "" },
  };
}

// ---- Qué consume cada cosa en tu turno ----
export const TIPOS_ACCION = [
  { id: "accion",    label: "Acción",            corta: "A" },
  { id: "adicional", label: "Acción adicional",  corta: "+" },
  { id: "gratis",    label: "Gratuita",          corta: "—" },
  { id: "reaccion",  label: "Reacción",          corta: "R" },
];

// ---- Turnos, movimiento y alcance ----
export const ALCANCE_INTERPONER = 1;   // casillas: hay que estar pegado al aliado
export const ALCANCE_EMPUJAR = 3;      // casillas: rango "Cerca"
export const ALCANCE_CUERPO = 1;

// Movimiento por turno: 3 casillas, más una por cada 2 puntos de Instinto.
export function movimientoDe(f) {
  const st = statsEfectivas(f);
  return 3 + Math.floor((st.instinto || 1) / 2);
}

// Tirada de iniciativa: Instinto, desempatando por el valor de la característica.
export function tirarIniciativa(pool) {
  const dados = [];
  for (let i = 0; i < Math.max(1, pool); i++) dados.push(1 + Math.floor(Math.random() * 6));
  return { dados, alto: Math.max(...dados) };
}

export function ordenarIniciativa(lista) {
  return lista.slice().sort((a, b) =>
    (b.alto - a.alto) || (b.instinto - a.instinto) || (b.desempate - a.desempate));
}

// Distancia en casillas entre dos puntos del tablero (Chebyshev: la diagonal cuesta 1).
export function distanciaCasillas(a, b, dpi) {
  if (!a || !b || !dpi) return null;
  const dx = Math.abs(a.x - b.x) / dpi;
  const dy = Math.abs(a.y - b.y) / dpi;
  return Math.round(Math.max(dx, dy));
}

// ---- Ecos: sombras de criaturas vencidas que quedan ligadas a ti ----
export const ECO_FACTOR = 0.5;     // un Eco vale la mitad que el original
export const ECO_PCT_COSTE = 20;   // invocarlo cuesta este % de tu Esencia máxima

// Cuántos Ecos puedes tener ligados según tu Rango
export function topeEcos(rango) {
  return 1 + Math.floor((rango + 1) / 2);   // Dormido 1 · Caído 2 · Supremo 3 · Divino 4
}

export function ecoDesdeMob(m) {
  const me = mobEfectivo(m);
  return {
    id: uid(),
    nombre: (m.nombre || "Eco").replace(/\s+\d+$/, "").trim(),
    imagen: "",
    rango: m.rango, clase: m.clase,
    tags: (m.tags || []).slice(),
    pvMax: Math.max(1, Math.ceil(me.pvMax * ECO_FACTOR)),
    pv: Math.max(1, Math.ceil(me.pvMax * ECO_FACTOR)),
    dano: Math.max(1, Math.ceil(me.dano * ECO_FACTOR)),
    resistencia: m.resistencia,
    pool: me.pool,
    pasivas: JSON.parse(JSON.stringify(m.pasivas || [])),
    habilidades: JSON.parse(JSON.stringify(m.habilidades || [])),
  };
}

export function costeEco(esenciaMax) {
  return Math.max(1, Math.ceil((esenciaMax * ECO_PCT_COSTE) / 100));
}

// ---- Tags de criatura: contra qué se puede especializar un rasgo ----
export const TAGS = [
  // naturaleza
  "Bestia", "Insecto", "Reptil", "Ave", "Acuático", "Planta", "Enjambre",
  // forma
  "Humanoide", "Gigante", "Colosal", "Volador", "Reptante", "Amorfo",
  // linaje
  "Dragón", "No muerto", "Espíritu", "Demonio", "Constructo", "Aberración",
  // Abismo
  "Sombra", "Corrupto", "Antiguo", "Durmiente", "Devorador", "Titánico",
  // elemento
  "Fuego", "Hielo", "Veneno", "Relámpago", "Piedra", "Sangre",
];

// ---- Rasgos: bonificaciones condicionadas a una tag ----
export const TIPOS_RASGO = [
  { id: "dominio_vs", label: "+X% de daño contra esa tag", unidad: "%", def: 30 },
  { id: "resistencia_vs", label: "−X% de daño recibido de esa tag", unidad: "%", def: 20 },
  { id: "dado_vs", label: "+X dados al atacar a esa tag", unidad: "dados", def: 1 },
  { id: "ignorar_res_vs", label: "Ignoras la Resistencia de esa tag", unidad: "", def: 0 },
  { id: "verdadero_vs", label: "+X% de su vida máxima como daño verdadero", unidad: "%", def: 5 },
  { id: "critico_vs", label: "Contra esa tag, el 4-5 también cuenta como éxito limpio", unidad: "", def: 0 },
  { id: "curar_al_matar_vs", label: "Te curas X PV al matar a esa tag", unidad: "PV", def: 5 },
  { id: "esencia_al_matar_vs", label: "Recuperas X Esencia al matar a esa tag", unidad: "E", def: 1 },
  { id: "interferencia_vs", label: "Reduces en X la Interferencia contra esa tag", unidad: "", def: 1 },
  { id: "inmune_estado_vs", label: "Inmune a los estados que aplique esa tag", unidad: "", def: 0 },
];

export function rasgoNuevo() {
  return { id: uid(), nombre: "", tag: "Bestia", descripcion: "", efectos: [] };
}

export function efectoRasgoNuevo(tipo) {
  const t = TIPOS_RASGO.find((x) => x.id === tipo) || TIPOS_RASGO[0];
  return { id: uid(), tipo: t.id, valor: t.def };
}

// Reúne lo que aportan los rasgos frente a un objetivo con ciertas tags.
export function bonosDeRasgos(f, tagsObjetivo) {
  const tags = (tagsObjetivo || []).map((t) => String(t).toLowerCase());
  const activos = (f.rasgos || []).filter((r) => r.tag && tags.includes(String(r.tag).toLowerCase()));
  const suma = (tipo) => activos.flatMap((r) => r.efectos || [])
    .filter((e) => e.tipo === tipo).reduce((a, e) => a + (Number(e.valor) || 0), 0);
  const tiene = (tipo) => activos.flatMap((r) => r.efectos || []).some((e) => e.tipo === tipo);
  return {
    activos: activos.map((r) => r.nombre || "rasgo"),
    dominio: suma("dominio_vs"),
    resistencia: suma("resistencia_vs"),
    dados: suma("dado_vs"),
    verdadero: suma("verdadero_vs"),
    curarAlMatar: suma("curar_al_matar_vs"),
    esenciaAlMatar: suma("esencia_al_matar_vs"),
    interferencia: suma("interferencia_vs"),
    ignorarRes: tiene("ignorar_res_vs"),
    critico: tiene("critico_vs"),
    inmuneEstado: tiene("inmune_estado_vs"),
  };
}

// ---- Etiquetas de criatura: lo que un Rasgo puede reconocer ----
// ---- Catálogo de efectos de habilidad ----
export const GRUPOS_EFECTO = ["Daño", "Curación y recursos", "Refuerzos", "Control",
  "Ocultarse", "Reacciones", "Precios"];

export const TIPOS_EFECTO = [
  { id: "dano_verdadero", grupo: "Daño", label: "Daño verdadero (% vida máx. del objetivo)", unidad: "%", def: 5,
    ayuda: "Ignora Resistencia y RD por completo." },
  { id: "curar_pct_objetivo", grupo: "Curación y recursos", label: "Curarte un % de la vida máx. del objetivo", unidad: "%", def: 10,
    tope: true, topeDef: 25,
    ayuda: "Se cura al conectar el golpe." },
  { id: "curar_pct_dano", grupo: "Curación y recursos", label: "Curarte un % del daño que hiciste", unidad: "%", def: 50, ayuda: "" },
  { id: "ignorar_resistencia", grupo: "Daño", label: "Ignorar la Resistencia del objetivo", unidad: "", def: 0,
    ayuda: "Como la Marca del ninja." },
  { id: "ignorar_rd", grupo: "Daño", label: "Ignorar la RD por diferencia de Rango", unidad: "", def: 0, ayuda: "" },
  { id: "parry", grupo: "Reacciones", label: "REACCIÓN · Parry (tirada)", unidad: "", def: 0, param: "stat",
    ayuda: "Al golpearte tiras la característica que elijas. Limpio anula el golpe y contraatacas al punto débil; 4-5 lo reduce a la mitad." },
  { id: "curar_aliado", grupo: "Curación y recursos", label: "Curar a un aliado", unidad: "PV", def: 10, ayuda: "" },
  { id: "buff_dominio", grupo: "Refuerzos", label: "Dominio temporal (a ti o a un aliado)", unidad: "%", def: 10, ayuda: "" },
  { id: "buff_resistencia", grupo: "Refuerzos", label: "Resistencia temporal (a ti o a un aliado)", unidad: "%", def: 10, ayuda: "" },
  { id: "invulnerable", grupo: "Refuerzos", label: "Invulnerable durante X golpes", unidad: "golpes", def: 1,
    ayuda: "Ignoras todo el daño de los próximos golpes." },
  { id: "aplicar_estado", grupo: "Control", label: "Aplicar un estado al objetivo", unidad: "", def: 0,
    param: "estado", ayuda: "Herido, Marcado o Expuesto." },
  { id: "dano_area", grupo: "Daño", label: "Golpea a todos los enemigos en juego", unidad: "%", def: 100,
    ayuda: "El % del daño que reciben los demás enemigos." },
  { id: "robar_esencia", grupo: "Curación y recursos", label: "Robar Esencia al golpear", unidad: "E", def: 1, ayuda: "" },
  { id: "limpiar_estados", grupo: "Refuerzos", label: "Quitarte todos los estados", unidad: "", def: 0, ayuda: "" },
  { id: "volverse_invisible", grupo: "Ocultarse", label: "Te vuelves Invisible", unidad: "", def: 0, param: "invis",
    ayuda: "Elige cuándo se rompe." },
  { id: "invisible_aliados", grupo: "Ocultarse", label: "Vuelve Invisibles a X aliados", unidad: "aliados", def: 2,
    param: "invis", ayuda: "Al usarla eliges a quiénes ocultas." },
  { id: "dano_si_invisible", grupo: "Daño", label: "+X% de daño si atacas estando Invisible", unidad: "%", def: 100,
    ayuda: "El golpe te delata: pierdes la invisibilidad al usarlo." },

  { id: "multigolpe", grupo: "Daño", label: "Golpea X veces seguidas", unidad: "golpes", def: 2,
    ayuda: "Cada golpe aplica el daño completo." },
  { id: "ejecutar", grupo: "Daño", label: "Ejecutar si el objetivo está por debajo de X% de vida", unidad: "%", def: 20,
    ayuda: "Lo mata al instante. Contra jefes conviene bajarlo." },
  { id: "furia", grupo: "Daño", label: "+X% de daño por cada cuarto de TU vida perdido", unidad: "%", def: 25,
    ayuda: "Cuanto peor estás, más fuerte pegas." },
  { id: "carga", grupo: "Daño", label: "Si no atacaste el turno anterior, +X% de daño", unidad: "%", def: 100,
    ayuda: "Recompensa preparar el golpe." },
  { id: "sacrificio", grupo: "Curación y recursos", label: "Puedes pagar el coste con X PV en vez de Esencia", unidad: "PV", def: 5,
    ayuda: "" },
  { id: "drenar_esencia", grupo: "Curación y recursos", label: "Roba X Esencia al objetivo (si es un PJ)", unidad: "E", def: 1, ayuda: "" },
  { id: "sellar", grupo: "Control", label: "El objetivo no puede usar habilidades su próximo turno", unidad: "", def: 0,
    ayuda: "Aplica el estado Sellado." },
  { id: "empujar_objetivo", grupo: "Control", label: "Derriba o desplaza al objetivo", unidad: "", def: 0,
    ayuda: "Efecto narrativo: el DM decide la distancia." },
  // --- el precio: efectos que te perjudican a ti ---
  { id: "coste_pv", grupo: "Precios", label: "PRECIO · Pierdes X PV al usarla", unidad: "PV", def: 5,
    ayuda: "Se paga aunque falles, salvo que le pongas un disparo." },
  { id: "coste_grieta", grupo: "Precios", label: "PRECIO · Sumas X a tu Grieta", unidad: "", def: 1, ayuda: "" },
  { id: "coste_esencia_extra", grupo: "Precios", label: "PRECIO · Gastas X Esencia de más", unidad: "E", def: 1, ayuda: "" },
  { id: "auto_estado", grupo: "Precios", label: "PRECIO · Te aplicas un estado a ti mismo", unidad: "", def: 0,
    param: "estado", ayuda: "Herido, Expuesto, Sellado…" },
  { id: "curar_objetivo", grupo: "Precios", label: "PRECIO · El objetivo se cura X% de su vida máx.", unidad: "%", def: 10,
    ayuda: "Para habilidades arriesgadas que pueden salir al revés." },
  { id: "cambiar_forma", grupo: "Refuerzos", label: "Te transformas en una Forma concreta",
    unidad: "", def: 0, param: "forma", ayuda: "Al usar la habilidad adoptas esa Forma." },
  { id: "perder_forma", grupo: "Precios", label: "PRECIO · Sales de tu Forma actual", unidad: "", def: 0, ayuda: "" },
  // --- reacciones: se ofrecen cuando alguien recibe un golpe ---
  { id: "reducir_mitad", grupo: "Reacciones", label: "REACCIÓN · Reducir a la mitad un golpe recibido", unidad: "E", def: 1,
    ayuda: "Decides después de ver el daño. El valor es lo que cuesta en Esencia." },
  { id: "interponerse", grupo: "Reacciones", label: "REACCIÓN · Interponerte por un aliado", unidad: "E", def: 0,
    ayuda: "Recibes tú el golpe dirigido a otro." },
  { id: "reaccion_invulnerable", grupo: "Reacciones", label: "REACCIÓN · Volverte invulnerable a ese golpe", unidad: "E", def: 2,
    ayuda: "Anulas por completo un golpe concreto. El valor es lo que cuesta en Esencia." },
  { id: "empujar_aliado", grupo: "Reacciones", label: "REACCIÓN · Empujar la tirada de un aliado", unidad: "E", def: 1,
    ayuda: "Gastas tu Esencia y los dados van a TU Grieta." },
];

// Pasivas: siempre activas mientras lleves la Memoria (o estés en la Forma).
export const TIPOS_PASIVA = [
  { id: "pv_extra", label: "Vida máxima +X", unidad: "PV", def: 10 },
  { id: "dominio_extra", label: "Dominio +X%", unidad: "%", def: 10 },
  { id: "resistencia_extra", label: "Resistencia +X%", unidad: "%", def: 10 },
  { id: "dado_extra", label: "+X dados en una característica", unidad: "dados", def: 1, param: "stat" },
  { id: "regeneracion", label: "Regeneras X PV al empezar tu turno", unidad: "PV", def: 3 },
  { id: "inmune_estado", label: "Inmune a un estado", unidad: "", def: 0, param: "estado" },
  { id: "reflejar", label: "Devuelves X% del daño recibido", unidad: "%", def: 20 },
  { id: "coste_reducido", label: "Tus habilidades cuestan X Esencia menos", unidad: "E", def: 1 },
  { id: "furia_pasiva", label: "+X% de daño por cada cuarto de vida perdido", unidad: "%", def: 20 },
  { id: "segunda_vida", label: "Al caer a 0, revives con X PV (1 vez por combate)", unidad: "PV", def: 10 },
  { id: "aguante", label: "El primer golpe que te mataría te deja en 1 PV", unidad: "", def: 0 },
  { id: "presencia", label: "Los enemigos tiran X dados menos contra ti", unidad: "dados", def: 1 },
  { id: "adaptacion", label: "+X% de Resistencia acumulable cada vez que te golpean", unidad: "%", def: 5 },
  { id: "sed", label: "Te curas X PV cada vez que matas a algo", unidad: "PV", def: 5 },
  { id: "intocable", label: "El primer golpe de cada combate falla", unidad: "", def: 0 },
  { id: "aura", label: "Los aliados cercanos reciben X% menos daño", unidad: "%", def: 10 },
  { id: "auto_forma", label: "Transformarte automáticamente cuando…", unidad: "", def: 0,
    param: "forma" },
];

// Disparadores de la transformación automática
// Cuándo se pierde la invisibilidad
export const ROTURAS_INVIS = [
  { id: "atacar",   label: "al atacar (aciertes o no)" },
  { id: "conectar", label: "solo si el golpe conecta" },
  { id: "recibir",  label: "solo si te golpean" },
  { id: "nunca",    label: "no se rompe sola" },
];

export const CONDICIONES = [
  { id: "pv_bajo",      label: "tu vida baja del X%", unidad: "%", def: 50 },
  { id: "pv_critico",   label: "tu vida baja del X% (crítico)", unidad: "%", def: 25 },
  { id: "grieta",       label: "tu Grieta llega a X", unidad: "", def: 3 },
  { id: "esencia_baja", label: "tu Esencia baja del X%", unidad: "%", def: 30 },
  { id: "caido",        label: "caes a 0 PV", unidad: "", def: 0 },
  { id: "estado",       label: "recibes un estado concreto", unidad: "", def: 0 },
];

export function pasivaNueva(tipo) {
  const t = TIPOS_PASIVA.find((x) => x.id === tipo) || TIPOS_PASIVA[0];
  return { id: uid(), tipo: t.id, valor: t.def, stat: "cuerpo", estado: "herido",
           forma: "", cond: "pv_bajo", umbral: 50 };
}

// ¿Se cumple el disparador de una transformación automática?
export function condicionCumplida(p, d, f) {
  const u = Number(p.umbral) || 0;
  switch (p.cond) {
    case "pv_bajo":
    case "pv_critico":   return d.pvMax > 0 && (d.pv / d.pvMax) * 100 <= u;
    case "grieta":       return (f.grieta || 0) >= u;
    case "esencia_baja": return d.esenciaMax > 0 && (d.esencia / d.esenciaMax) * 100 <= u;
    case "caido":        return d.pv <= 0;
    case "estado":       return (f.estados || []).includes(p.estado || "herido");
    default: return false;
  }
}

export function memoriaHabNueva() {
  return { modo: "ninguna", nombre: "", descripcion: "", perfil: "ligera", efectos: [], pasivas: [], usos: 0, usosMax: 0 };
}

// Los costes son un % de tu Esencia máxima: pesan igual en Dormido que en Divino.
export const COSTO_PCT = {
  ligera: 0, estandar: 0, utilidad: 0,
  utilidad_mayor: 15, pesada: 20, devastadora: 40,
};
export const PCT_EMPUJE = 10;   // Empujar una tirada
export const PCT_ESQUIVA = 10;  // Esquivar o parry

export function costeDe(pct, esenciaMax) {
  if (!pct) return 0;
  return Math.max(1, Math.ceil((esenciaMax * pct) / 100));
}

export function costoHabilidad(hab, esenciaMax, descuento) {
  const base = costeDe(COSTO_PCT[hab.perfil] || 0, esenciaMax);
  const extra = hab.costoExtraRepetir ? (hab.usos || 0) * costeDe(PCT_EMPUJE, esenciaMax) : 0;
  const total = base + extra - (Number(descuento) || 0);
  return Math.max(base > 0 ? 1 : 0, total);
}

// Cuándo se dispara un efecto. Permite riesgo-recompensa y efectos al azar.
export const DISPAROS = [
  { id: "siempre",   label: "siempre" },
  { id: "conecta",   label: "solo si el golpe conecta" },
  { id: "falla",     label: "solo si FALLAS la tirada", unidad: "" },
  { id: "critico",   label: "solo con crítico" },
  { id: "costo",     label: "solo con éxito con costo (4-5)" },
  { id: "azar",      label: "al azar, X% de probabilidad", unidad: "%", def: 50 },
  { id: "yo_bajo",   label: "si TU vida está por debajo del X%", unidad: "%", def: 30 },
  { id: "yo_alto",   label: "si TU vida está por encima del X%", unidad: "%", def: 70 },
  { id: "obj_bajo",  label: "si la vida del objetivo está por debajo del X%", unidad: "%", def: 30 },
  { id: "grieta",    label: "si tu Grieta llega a X", unidad: "", def: 2 },
  { id: "invisible", label: "si estás Invisible" },
  { id: "estado_yo", label: "si tienes un estado concreto", param: "estado" },
];

// ¿se dispara este efecto en esta tirada?
export function efectoAplica(ef, ctx) {
  const d = ef.disparo || "siempre";
  const v = Number(ef.umbralDisparo != null ? ef.umbralDisparo : 50);
  switch (d) {
    case "siempre":   return true;
    case "conecta":   return !!ctx.conecta;
    case "falla":     return !ctx.conecta;
    case "critico":   return ctx.lectura === "critico";
    case "costo":     return ctx.lectura === "costo";
    case "azar":      return Math.random() * 100 < v;
    case "yo_bajo":   return ctx.pvPct != null && ctx.pvPct <= v;
    case "yo_alto":   return ctx.pvPct != null && ctx.pvPct >= v;
    case "obj_bajo":  return ctx.objPvPct != null && ctx.objPvPct <= v;
    case "grieta":    return (ctx.grieta || 0) >= v;
    case "invisible": return !!ctx.invisible;
    case "estado_yo": return (ctx.estados || []).includes(ef.estadoDisparo || "herido");
    default: return true;
  }
}

export function efectoHabNuevo(tipo) {
  const t = TIPOS_EFECTO.find((x) => x.id === tipo) || TIPOS_EFECTO[0];
  const e = { id: uid(), tipo: t.id, valor: t.def };
  if (t.tope) e.tope = t.topeDef;
  if (t.param === "invis") e.rompe = "atacar";
  if (t.param === "stat") e.stat = "instinto";
  if (t.param === "forma") e.forma = null;
  e.disparo = "siempre";
  e.umbralDisparo = 50;
  e.estadoDisparo = "herido";
  return e;
}

// Cuánto puedes absorber de golpe: un % de TU vida máxima.
export function topeCuracion(ef, pvMax) {
  const pct = ef && ef.tope != null ? Number(ef.tope) : 25;
  if (!pct) return Infinity;
  return Math.max(1, Math.ceil((pvMax * pct) / 100));
}

export function habilidadNueva() {
  return { id: uid(), nombre: "", perfil: "ligera", descripcion: "", efectos: [], pasivas: [],
           usos: 0, costoExtraRepetir: false, usosMax: 0, alcance: 1, accion: "accion" };
}

// ---- Formas y efectos activos ----
// Una Forma altera stats mientras está activa (Cambiaformas, posturas, transformaciones).
export const MODOS_CURACION = [
  { id: "normal", label: "Curación normal" },
  { id: "nula", label: "No puedes ser curado" },
  { id: "doble", label: "Curación doble" },
  { id: "mitad", label: "Curación a la mitad" },
];

export function formaNueva() {
  return {
    id: uid(), nombre: "", sube: "cuerpo", subeCant: 2, baja: "instinto", bajaCant: 1, nota: "",
    dominio: 0, resistencia: 0, curacion: "normal", habilidades: [], pasivas: [], imagen: "",
  };
}

export function formaActivaDe(f) {
  return (f.formas || []).find((x) => x.id === f.formaActiva) || null;
}

export function statsEfectivas(f) {
  const base = { ...f.stats };
  const forma = formaActivaDe(f);
  if (forma) {
    const sub = Number(forma.subeCant != null ? forma.subeCant : 2) || 0;
    const baj = Number(forma.bajaCant != null ? forma.bajaCant : 1) || 0;
    if (forma.sube && forma.sube !== "ninguna" && base[forma.sube] != null) base[forma.sube] += sub;
    if (forma.baja && forma.baja !== "ninguna" && base[forma.baja] != null) {
      base[forma.baja] = Math.max(1, base[forma.baja] - baj);
    }
  }
  return base;
}

export function efectoNuevo(nombre) {
  return { id: uid(), nombre: nombre || "", nota: "" };
}

// Reúne todas las pasivas activas: Memorias equipadas + Forma activa.
export function pasivasDe(f) {
  const out = [];
  // pasivas de las habilidades de tu Aspecto: siempre activas
  (f.habilidades || []).forEach((h) => (h.pasivas || []).forEach((p) => out.push(p)));
  const dosManos = f.arma && f.arma.tipo === "grande";
  (f.memorias || []).forEach((m, i) => {
    if (dosManos && i === 6) return;
    if (m.hab && m.hab.modo === "pasiva") (m.hab.pasivas || []).forEach((p) => out.push(p));
  });
  const forma = formaActivaDe(f);
  if (forma) {
    (forma.pasivas || []).forEach((p) => out.push(p));
    (forma.habilidades || []).forEach((h) => (h.pasivas || []).forEach((p) => out.push(p)));
  }
  return out;
}

export function sumaPasiva(f, tipo) {
  return pasivasDe(f).filter((p) => p.tipo === tipo).reduce((a, p) => a + (Number(p.valor) || 0), 0);
}

// El arma pega según tu Rango, salvo que la propia arma sea de un Rango mayor.
export function danoBaseArma(f) {
  const rPJ = (f.rango || 0) + 1;
  const rArma = Number((f.arma || {}).rangoArma) || 1;
  const usar = Math.max(rPJ, rArma);
  const base = DANO_BASE_RANGO[clamp(usar, 1, 7) - 1];
  const tipo = TIPOS_ARMA.find((t) => t.id === (f.arma || {}).tipo) || TIPOS_ARMA[1];
  return { base, mult: tipo.mult, manos: tipo.manos, total: Math.ceil(base * tipo.mult), rangoUsado: usar };
}

export function derivar(f) {
  const rangoNum = f.rango + 1;
  const stats = statsEfectivas(f);
  const pvMax = PJ_PV_BASE[f.rango] + stats.cuerpo * 4 + sumaPasiva(f, "pv_extra");
  const esenciaMax = 3 + rangoNum * 2;
  let dominio = 0;
  let resistencia = 0;
  const avisos = [];
  const dosManos = f.arma && f.arma.tipo === "grande";
  f.memorias.forEach((m, i) => {
    if (dosManos && i === 6) return;          // Mano 2 ocupada por el arma
    const max = m.rangoOrigen * 2 + m.claseOrigen + 1;
    const usado = (m.dominioPts || 0) + (m.resistenciaPts || 0);
    if (usado > max) avisos.push(`${MEMORIA_SLOTS[i]}: ${usado} pts usados, máximo ${max}`);
    dominio += m.dominioPts || 0;
    resistencia += m.resistenciaPts || 0;
  });
  // modificadores de la forma activa y de los buffs temporales
  const forma = formaActivaDe(f);
  const num = (v) => Number(v) || 0;
  const buffDom = (f.buffs || []).reduce((a, b) => a + num(b.dominio), 0);
  const buffRes = (f.buffs || []).reduce((a, b) => a + num(b.resistencia), 0);
  dominio = num(dominio) + (forma ? num(forma.dominio) : 0) + buffDom + sumaPasiva(f, "dominio_extra");
  resistencia = num(resistencia) + (forma ? num(forma.resistencia) : 0) + buffRes + sumaPasiva(f, "resistencia_extra");

  const topeRes = 50;
  const resistenciaAplicada = Math.max(0, Math.min(topeRes, resistencia));
  const mod = stats[f.aspectoStat] || 0;
  // el daño base nunca baja del que corresponde a tu Rango
  const arma = danoBaseArma(f);
  const danoArma = roundUp((arma.total + mod * 2 * rangoNum) * (1 + dominio / 100));
  return {
    rangoNum, pvMax, esenciaMax, dominio, resistencia, resistenciaAplicada, mod, danoArma, avisos,
    stats,
    forma,
    curacion: forma ? (forma.curacion || "normal") : "normal",
    dosManos,
    baseArma: arma.total,
    arma, bloqueaMano2: dosManos,
    pasivas: pasivasDe(f),
    regeneracion: sumaPasiva(f, "regeneracion"),
    reflejar: sumaPasiva(f, "reflejar"),
    costeReducido: sumaPasiva(f, "coste_reducido"),
    inmunidades: pasivasDe(f).filter((p) => p.tipo === "inmune_estado").map((p) => p.estado),
    statCap: STAT_CAP[f.rango],
    pv: f.pv == null ? pvMax : f.pv,
    esencia: f.esencia == null ? esenciaMax : f.esencia,
  };
}

export function poolDe(valorStat, estados, dadosExtra) {
  let pool = Math.min(valorStat, 5) + (Number(dadosExtra) || 0);
  if (estados && estados.includes("herido")) pool = Math.max(1, pool - 1);
  pool = Math.max(1, pool);
  const repeticiones = valorStat > 5 ? Math.floor((valorStat - 5) / 2) : 0;
  return { pool, repeticiones };
}

export function dadosExtraDe(f, stat) {
  return pasivasDe(f)
    .filter((p) => p.tipo === "dado_extra" && p.stat === stat)
    .reduce((a, p) => a + (Number(p.valor) || 0), 0);
}

export function interferencia(rangoDif, claseDif) {
  const r = Math.max(0, rangoDif);
  const c = Math.max(0, claseDif);
  const bruto = 2 * r + 0.5 * c;
  if (bruto <= 1) return Math.floor(bruto);   // media diferencia de Clase no estorba
  return roundUp(bruto);
}

export function tirar(pool, interf, empujes) {
  const total = pool + (empujes || 0);
  const dados = [];
  for (let i = 0; i < total; i++) dados.push(1 + Math.floor(Math.random() * 6));
  const alto = Math.max(...dados);
  const seises = dados.filter((d) => d === 6).length;
  const efectivo = alto - (interf || 0);
  let lectura;
  if (seises >= 2 && efectivo >= 6) lectura = "critico";
  else if (efectivo >= 6) lectura = "limpio";
  else if (efectivo >= 4) lectura = "costo";
  else lectura = "fallo";
  return { dados, alto, efectivo, lectura, seises };
}

export const TEXTO_LECTURA = {
  critico: "Crítico — dos seises",
  limpio: "Éxito limpio",
  costo: "Éxito con costo",
  fallo: "Fallo",
};

export function fichaMob(rango, clase) {
  const rangoNum = rango + 1;
  return {
    nombre: `${CLASES[clase]} ${RANGOS[rango]}`,
    pv: CLASE_PV[clase] * rangoNum,
    resistencia: MOB_RESIST[rango],
    dano: CLASE_DANO[clase],
    pool: Math.min(1 + rangoNum, 5),
  };
}

export function danoContra(danoBase, mobResistPct, rangoDif, rangoArma, rangoPJ, rangoNumMob) {
  const trasResist = danoBase * (1 - mobResistPct / 100);
  const rdBruta = rangoDif > 0 ? Math.min(100, 50 * rangoDif) : 0;
  const anulada = rangoArma >= rangoNumMob || rangoPJ >= rangoNumMob;
  const rd = anulada ? 0 : rdBruta;
  const final = roundUp(trasResist * (1 - rd / 100));
  return { final: final === 0 ? 0 : final, rd, anulada };
}

export function mobInstancia(rango, clase, etiqueta) {
  const m = fichaMob(rango, clase);
  return {
    id: uid(),
    nombre: etiqueta || m.nombre,
    rango, clase,
    pv: m.pv,
    pvMax: m.pv,
    resistencia: m.resistencia,
    dano: m.dano,
    pool: m.pool,
    estados: [],
    pasivas: [],
    habilidades: [],
    tags: [],
    imagen: "",
    pieza: null,
    alcance: 1,          // alcance de su ataque normal, en casillas
    esquiva: false,      // si reacciona cuando le atacan
    accionUsada: false,
    adicionalUsada: false,
    reaccionUsada: false,
    movGastado: 0,
    adaptado: 0,
    usadaSegundaVida: false,
  };
}

// Aplica las pasivas de un mob a su ficha efectiva.
// Movimiento de una criatura: como el de un PJ, pero su "Instinto" es su pool.
export function movimientoMob(m) {
  return 3 + Math.floor(((m.pool || 2)) / 2);
}

export function habilidadMobNueva() {
  return { id: uid(), nombre: "", descripcion: "", mult: 1.5, efectos: [],
           usos: 0, usosMax: 0, alcance: 1, accion: "accion" };
}

export function mobEfectivo(m) {
  const suma = (t) => (m.pasivas || []).filter((p) => p.tipo === t)
    .reduce((a, p) => a + (Number(p.valor) || 0), 0);
  const pvExtra = suma("pv_extra");
  const resExtra = suma("resistencia_extra") + (m.adaptado || 0);
  const domExtra = suma("dominio_extra");
  const perdida = m.pvMax > 0 ? 1 - (m.pv / (m.pvMax + pvExtra)) : 0;
  const furia = suma("furia_pasiva") * Math.floor(perdida * 4);
  return {
    pvMax: m.pvMax + pvExtra,
    resistencia: Math.min(90, m.resistencia + resExtra),
    dano: roundUp(m.dano * (1 + (domExtra + furia) / 100)),
    pool: Math.max(1, m.pool),
    regeneracion: suma("regeneracion"),
    reflejar: suma("reflejar"),
    presencia: suma("presencia"),
    inmunidades: (m.pasivas || []).filter((p) => p.tipo === "inmune_estado").map((p) => p.estado),
    movMax: movimientoMob(m),
    alcance: m.alcance != null ? m.alcance : 1,
    segundaVida: suma("segunda_vida"),
    aguante: (m.pasivas || []).some((p) => p.tipo === "aguante"),
    intocable: (m.pasivas || []).some((p) => p.tipo === "intocable"),
    adaptacion: suma("adaptacion"),
  };
}

export function curar(f, cantidad) {
  const d = derivar(f);
  let real = cantidad;
  if (d.curacion === "nula") real = 0;
  else if (d.curacion === "doble") real = cantidad * 2;
  else if (d.curacion === "mitad") real = Math.floor(cantidad / 2);
  const antes = d.pv;
  const nuevo = clamp(antes + real, 0, d.pvMax);
  return { nuevo, aplicado: nuevo - antes, bloqueada: d.curacion === "nula" };
}

// Versión resumida de la ficha para que el DM pueda consultarla.
// Se comprime a propósito: la metadata de la sala tiene tope de 16 kB.
// El retrato que se enseña: el de la Forma activa si tiene, si no el del Trasfondo.
export function retratoDe(f) {
  const fm = formaActivaDe(f);
  if (fm && fm.imagen) return fm.imagen;
  return (f.trasfondo || {}).imagen || "";
}

export function hojaResumen(f) {
  const d = derivar(f);
  const corta = (t, n) => (t || "").toString().slice(0, n);
  const efTexto = (efs) => (efs || []).slice(0, 4).map((e) => {
    const t = TIPOS_EFECTO.find((x) => x.id === e.tipo);
    let s = (t ? t.label : e.tipo).replace(/^REACCIÓN · /, "").slice(0, 42);
    if (t && t.unidad) s += ` ${e.valor}${t.unidad}`;
    if (e.estado) s += ` (${e.estado})`;
    return s;
  });
  const pasTexto = (d.pasivas || []).slice(0, 8).map((p) => {
    const t = TIPOS_PASIVA.find((x) => x.id === p.tipo);
    let s = (t ? t.label : p.tipo).replace("X", p.valor).slice(0, 46);
    if (p.stat && t && t.param === "stat") s += ` (${p.stat})`;
    if (p.estado && t && t.param === "estado") s += ` (${p.estado})`;
    return s;
  });
  const habs = (f.habilidades || []).slice(0, 6).map((h) => ({
    n: corta(h.nombre, 28), p: h.perfil,
    c: costoHabilidad(h, d.esenciaMax, d.costeReducido),
    u: h.usos || 0, m: h.usosMax || 0,
    e: efTexto(h.efectos),
  }));
  const mems = (f.memorias || []).map((m, i) => ({
    s: MEMORIA_SLOTS[i], n: corta(m.nombre, 24),
    d: m.dominioPts || 0, r: m.resistenciaPts || 0,
    ro: m.rangoOrigen, co: m.claseOrigen,
    h: m.hab && m.hab.modo !== "ninguna" ? `${m.hab.modo}: ${corta(m.hab.nombre, 22)}` : "",
  })).filter((m) => m.n || m.d || m.r || m.h);
  const formas = (f.formas || []).slice(0, 5).map((fm) => ({
    n: corta(fm.nombre, 22),
    s: fm.sube, sc: fm.subeCant, b: fm.baja, bc: fm.bajaCant,
    d: fm.dominio || 0, r: fm.resistencia || 0, c: fm.curacion,
    act: f.formaActiva === fm.id,
    h: (fm.habilidades || []).slice(0, 4).map((h) => corta(h.nombre, 22)),
  }));
  const res = {
    id: f.id, n: corta(f.nombre, 28), r: f.rango, nv: f.nivel,
    st: f.stats, ste: d.stats,
    pv: d.pv, pvM: d.pvMax, es: d.esencia, esM: d.esenciaMax, gr: f.grieta || 0,
    asp: corta(f.aspectoNombre, 34), aspSt: f.aspectoStat,
    def: corta(f.defecto, 180),
    arma: { n: corta(f.arma.nombre, 24), t: f.arma.tipo, db: f.arma.danoBase, ra: f.arma.rangoArma },
    dom: d.dominio, res: d.resistencia, resA: d.resistenciaAplicada, dano: d.danoArma,
    hab: habs, mem: mems, fm: formas, pas: pasTexto,
    est: f.estados || [], atr: corta(f.atributos, 160),
    img: corta(retratoDe(f), 500),   // los enlaces firmados de Discord son largos
    tr: {
      del: corta((f.trasfondo || {}).delito, 170),
      cul: (f.trasfondo || {}).culpable || "",
      mot: ((f.trasfondo || {}).motivaciones || []).map((x) => (x ? 1 : 0)),
      ap: corta((f.trasfondo || {}).apariencia, 150),
      hist: corta((f.trasfondo || {}).personalidad, 320),
    },
  };
  // La sala tiene 16 kB para todo: si una ficha se pasa, se recorta sola.
  const TOPE = 1900;
  const tam = () => JSON.stringify(res).length;
  if (tam() > TOPE) res.tr.hist = res.tr.hist.slice(0, 140);
  if (tam() > TOPE) res.tr.ap = "";
  if (tam() > TOPE) res.tr.del = res.tr.del.slice(0, 90);
  if (tam() > TOPE) res.def = res.def.slice(0, 110);
  if (tam() > TOPE) res.mem = res.mem.slice(0, 4);
  if (tam() > TOPE) res.tr.del = "";
  if (tam() > TOPE) res.hab = res.hab.slice(0, 4);
  return res;
}

// Solo esto viaja por la red — el resto vive en el navegador de cada quien.
export function estadoVivo(f) {
  const d = derivar(f);
  const forma = formaActivaDe(f);
  return {
    id: f.id,
    nombre: f.nombre,
    rango: f.rango,
    forma: forma ? (forma.nombre || "sin nombre") : null,
    efectos: (f.efectos || []).map((e) => e.nombre).filter(Boolean).slice(0, 4),
    curacion: (formaActivaDe(f) || {}).curacion || "normal",
    mov: f.movGastado || 0,
    movMax: movimientoDe(f),
    reac: !f.reaccionUsada,
    acc: !f.accionUsada,
    adic: !f.adicionalUsada,
    eco: (() => {
      const e = (f.ecos || []).find((x) => x.id === f.ecoActivo);
      return e ? { id: e.id, nombre: e.nombre, pv: e.pv, pvMax: e.pvMax, dano: e.dano, img: e.imagen || "" } : null;
    })(),
    pv: d.pv,
    pvMax: d.pvMax,
    esencia: d.esencia,
    esenciaMax: d.esenciaMax,
    grieta: f.grieta || 0,
    estados: f.estados || [],
    caidoFallos: f.caidoFallos || 0,
  };
}
