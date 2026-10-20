/**
 * Política basada en reglas para los bots Fácil y Medio (y para las simulaciones
 * del Difícil). El Fácil comete errores a propósito: elige al azar entre opciones
 * aceptables, apenas comercia y mueve el ladrón sin pensar.
 */

import {
  aristasValidasBarco,
  aristasValidasCarretera,
  caballerosActivables,
  caballerosAscendibles,
  caballerosJuntoAlLadron,
  cartasEnMano,
  cartasProgresoJugables,
  ciudadesParaMuralla,
  costeMejora,
  COSTES_CYC,
  defensaDe,
  fuerzaBarbaros,
  LINEAS_MEJORA,
  MERCANCIA_DE_LINEA,
  MERCANCIAS,
  opcionesProgreso,
  verticesValidosCaballero,
  type MercanciasParciales,
  type TipoCartaProgreso,
  aristasValidasCarreteraInicial,
  cartasJugables,
  COSTES,
  grafoDe,
  hexagonosValidosLadron,
  jugadorEnTurno,
  puntosDeVictoria,
  RECURSOS,
  tasasComercio,
  tieneRecursos,
  verticesValidosCiudad,
  verticesValidosPoblado,
  type AccionJuego,
  type EstadoJuego,
  type EstadoJugador,
  type GeneradorAleatorio,
  type IdJugador,
  type NivelBot,
  type OfertaComercio,
  type Recurso,
  type RecursosParciales,
} from '@colonist/motor-compartido';
import {
  COSTE_OBJETIVO,
  faltantes,
  mejorBarcoHaciaPoblado,
  mejorCarreteraHaciaPoblado,
  puntuarLadron,
  puntuarVertice,
  totalFaltante,
  type Objetivo,
} from './heuristicas.js';

type NivelReglas = Exclude<NivelBot, 'dificil'>;

function jugador(estado: EstadoJuego, id: IdJugador): EstadoJugador {
  return estado.jugadores.find((j) => j.id === id)!;
}

/** El mejor elemento según `valor`; el bot Fácil elige al azar entre la mitad superior. */
function elegirMejor<T>(opciones: readonly T[], valor: (o: T) => number, nivel: NivelReglas, rng: GeneradorAleatorio): T {
  const ordenadas = [...opciones].sort((a, b) => valor(b) - valor(a));
  if (nivel === 'facil') {
    return rng.elegir(ordenadas.slice(0, Math.max(1, Math.ceil(ordenadas.length / 2))));
  }
  return ordenadas[0]!;
}

/** Qué conviene construir ahora. */
export function elegirObjetivo(estado: EstadoJuego, id: IdJugador): Objetivo {
  const j = jugador(estado, id);
  if (j.piezas.ciudades > 0 && verticesValidosCiudad(estado, id).length > 0) {
    return 'ciudad';
  }
  if (j.piezas.poblados > 0 && verticesValidosPoblado(estado, id).length > 0) {
    return 'poblado';
  }
  if (j.piezas.poblados > 0 && j.piezas.carreteras > 0 && mejorCarreteraHaciaPoblado(estado, id)) {
    return 'carretera';
  }
  if (j.piezas.poblados > 0 && (j.piezas.barcos ?? 0) > 0 && mejorBarcoHaciaPoblado(estado, id)) {
    return 'barco';
  }
  return estado.mazoDesarrollo.length > 0 ? 'cartaDesarrollo' : 'ciudad';
}

/**
 * Descarta las cartas que menos falta hacen para el objetivo. Con Ciudades y
 * Caballeros, si no bastan los recursos, también mercancías (las más abundantes).
 */
export function elegirDescarte(estado: EstadoJuego, id: IdJugador, cantidad: number): { recursos: RecursosParciales; mercancias: MercanciasParciales } {
  const j = jugador(estado, id);
  const totalRecursos = RECURSOS.reduce((s, r) => s + j.recursos[r], 0);
  const mercancias: MercanciasParciales = {};
  const mias = { ...(j.cyc?.mercancias ?? { papel: 0, tela: 0, moneda: 0 }) };
  for (let i = 0; i < cantidad - totalRecursos; i++) {
    const m = [...MERCANCIAS].sort((a, b) => mias[b] - mias[a])[0]!;
    mias[m]--;
    mercancias[m] = (mercancias[m] ?? 0) + 1;
  }
  return { recursos: elegirDescarteRecursos(estado, id, Math.min(cantidad, totalRecursos)), mercancias };
}

function elegirDescarteRecursos(estado: EstadoJuego, id: IdJugador, cantidad: number): RecursosParciales {
  const mano = { ...jugador(estado, id).recursos };
  const coste = COSTE_OBJETIVO[elegirObjetivo(estado, id)];
  const descarte: RecursosParciales = {};
  for (let i = 0; i < cantidad; i++) {
    const r = [...RECURSOS]
      .filter((x) => mano[x] > 0)
      .sort((a, b) => mano[b] - (coste[b] ?? 0) - (mano[a] - (coste[a] ?? 0)) || mano[b] - mano[a])[0]!;
    mano[r]--;
    descarte[r] = (descarte[r] ?? 0) + 1;
  }
  return descarte;
}

/** Un cambio con la banca que acerque al objetivo sin gastar lo que este necesita. */
export function comercioHaciaObjetivo(estado: EstadoJuego, id: IdJugador, objetivo: Objetivo, nivel: NivelReglas): AccionJuego | null {
  const mano = jugador(estado, id).recursos;
  const coste = COSTE_OBJETIVO[objetivo];
  const falta = RECURSOS.filter((r) => mano[r] < (coste[r] ?? 0) && estado.banca[r] > 0);
  if (falta.length === 0) {
    return null;
  }
  const tasas = tasasComercio(estado, id);
  const margen = nivel === 'facil' ? 2 : 0;
  const sobrantes = RECURSOS.filter((r) => !falta.includes(r) && mano[r] - (coste[r] ?? 0) >= tasas[r] + margen).sort(
    (a, b) => tasas[a] - tasas[b] || mano[b] - mano[a],
  );
  const entrega = sobrantes[0];
  if (entrega === undefined) {
    return null;
  }
  return { tipo: 'comerciarConBanca', jugador: id, entrega: { [entrega]: tasas[entrega] }, recibe: { [falta[0]!]: 1 } };
}

/** ¿Me conviene este intercambio? Acepta si acerca al objetivo y no ayuda a quien va a ganar. */
export function convieneIntercambio(
  estado: EstadoJuego,
  id: IdJugador,
  entrego: RecursosParciales,
  recibo: RecursosParciales,
  otro: IdJugador,
): boolean {
  const mano = jugador(estado, id).recursos;
  if (!tieneRecursos(mano, entrego)) {
    return false;
  }
  if (puntosDeVictoria(estado, otro, false) >= estado.configuracion.puntosVictoria - 2) {
    return false;
  }
  const coste = COSTE_OBJETIVO[elegirObjetivo(estado, id)];
  const despues = { ...mano };
  for (const r of RECURSOS) {
    despues[r] += (recibo[r] ?? 0) - (entrego[r] ?? 0);
  }
  const cartasEntrego = RECURSOS.reduce((s, r) => s + (entrego[r] ?? 0), 0);
  const cartasRecibo = RECURSOS.reduce((s, r) => s + (recibo[r] ?? 0), 0);
  const mejora = totalFaltante(mano, coste) - totalFaltante(despues, coste);
  return mejora > 0 && cartasEntrego <= cartasRecibo + 1;
}

/** Respuesta de un bot que no está en turno a las ofertas abiertas. */
function responderOfertas(estado: EstadoJuego, id: IdJugador, nivel: NivelReglas, rng: GeneradorAleatorio): AccionJuego | null {
  const pendiente = estado.ofertas.find(
    (o: OfertaComercio) =>
      o.autor !== id &&
      (o.destinatario === null || o.destinatario === id) &&
      !o.aceptadaPor.includes(id) &&
      !o.rechazadaPor.includes(id),
  );
  if (!pendiente) {
    return null;
  }
  const acepta =
    nivel === 'facil'
      ? tieneRecursos(jugador(estado, id).recursos, pendiente.pide) && rng.siguiente() < 0.4
      : convieneIntercambio(estado, id, pendiente.pide, pendiente.ofrece, pendiente.autor);
  return { tipo: 'responderOferta', jugador: id, idOferta: pendiente.id, acepta };
}

function jugarCartaSiConviene(estado: EstadoJuego, id: IdJugador, nivel: NivelReglas, rng: GeneradorAleatorio): AccionJuego | null {
  const jugables = cartasJugables(estado, id);
  if (jugables.length === 0) {
    return null;
  }
  const j = jugador(estado, id);
  if (nivel === 'facil' && rng.siguiente() < 0.6) {
    return null;
  }

  if (jugables.includes('caballero')) {
    const grafo = grafoDe(estado);
    const ladronMePerjudica = grafo
      .hexagono(estado.tablero.ladron)
      .vertices.some((v) => estado.tablero.edificios[v]?.jugador === id);
    const titular = estado.titulos.mayorEjercito;
    const caballerosTitular = titular ? jugador(estado, titular).caballerosJugados : 2;
    const consigueEjercito = titular !== id && j.caballerosJugados + 1 > caballerosTitular;
    if (ladronMePerjudica || consigueEjercito) {
      return { tipo: 'jugarCaballero', jugador: id };
    }
  }
  if (estado.fase.tipo !== 'acciones') {
    return null;
  }
  if (
    jugables.includes('construccionCarreteras') &&
    ((j.piezas.carreteras > 0 && mejorCarreteraHaciaPoblado(estado, id)) || ((j.piezas.barcos ?? 0) > 0 && mejorBarcoHaciaPoblado(estado, id)))
  ) {
    return { tipo: 'jugarConstruccionCarreteras', jugador: id };
  }
  if (jugables.includes('abundancia')) {
    const falta = faltantes(j.recursos, COSTE_OBJETIVO[elegirObjetivo(estado, id)]);
    const pedir = RECURSOS.flatMap((r) => Array<Recurso>(falta[r] ?? 0).fill(r)).filter((r) => estado.banca[r] > 0);
    if (pedir.length > 0) {
      const disponibles = RECURSOS.filter((r) => estado.banca[r] > 0);
      const primero = pedir[0]!;
      const segundo = pedir[1] ?? (estado.banca[primero] >= 2 ? primero : disponibles.find((r) => r !== primero) ?? primero);
      if (estado.banca[primero] >= (segundo === primero ? 2 : 1)) {
        return { tipo: 'jugarAbundancia', jugador: id, recursos: [primero, segundo] };
      }
    }
  }
  if (jugables.includes('monopolio')) {
    // Cartas de cada recurso que no están ni en la banca ni en mi mano: las tienen los rivales.
    const enRivales = (r: Recurso) => 19 - estado.banca[r] - j.recursos[r];
    const mejor = [...RECURSOS].sort((a, b) => enRivales(b) - enRivales(a))[0]!;
    if (enRivales(mejor) >= 4) {
      return { tipo: 'jugarMonopolio', jugador: id, recurso: mejor };
    }
  }
  if (jugables.includes('caballero') && nivel === 'medio' && rng.siguiente() < 0.3) {
    return { tipo: 'jugarCaballero', jugador: id };
  }
  return null;
}

/** Elige los recursos del oro: primero lo que falta para el objetivo y luego lo más abundante en la banca. */
function elegirOro(estado: EstadoJuego, id: IdJugador, cantidad: number): RecursosParciales {
  const falta = faltantes(jugador(estado, id).recursos, COSTE_OBJETIVO[elegirObjetivo(estado, id)]);
  const banca = { ...estado.banca };
  const eleccion: RecursosParciales = {};
  const total = Math.min(cantidad, RECURSOS.reduce((s, r) => s + banca[r], 0));
  for (let i = 0; i < total; i++) {
    const r =
      RECURSOS.find((x) => (falta[x] ?? 0) > (eleccion[x] ?? 0) && banca[x] > 0) ??
      [...RECURSOS].sort((a, b) => banca[b] - banca[a])[0]!;
    eleccion[r] = (eleccion[r] ?? 0) + 1;
    banca[r]--;
  }
  return eleccion;
}

/** 5–6 jugadores: construir lo que se pueda pagar fuera del propio turno, o pasar. */
function accionConstruccionEspecial(estado: EstadoJuego, id: IdJugador, nivel: NivelReglas, rng: GeneradorAleatorio): AccionJuego {
  const j = jugador(estado, id);
  const mano = j.recursos;
  const ciudades = verticesValidosCiudad(estado, id);
  if (j.piezas.ciudades > 0 && ciudades.length > 0 && tieneRecursos(mano, COSTES.ciudad)) {
    return { tipo: 'construirCiudad', jugador: id, vertice: elegirMejor(ciudades, (v) => puntuarVertice(estado, id, v), nivel, rng) };
  }
  const poblados = verticesValidosPoblado(estado, id);
  if (j.piezas.poblados > 0 && poblados.length > 0 && tieneRecursos(mano, COSTES.poblado)) {
    return { tipo: 'construirPoblado', jugador: id, vertice: elegirMejor(poblados, (v) => puntuarVertice(estado, id, v), nivel, rng) };
  }
  const objetivo = elegirObjetivo(estado, id);
  if (objetivo === 'carretera' && j.piezas.carreteras > 0 && tieneRecursos(mano, COSTES.carretera)) {
    const camino = mejorCarreteraHaciaPoblado(estado, id);
    if (camino) {
      return { tipo: 'construirCarretera', jugador: id, arista: camino.arista };
    }
  }
  if (objetivo === 'barco' && (j.piezas.barcos ?? 0) > 0 && tieneRecursos(mano, COSTES.barco)) {
    const ruta = mejorBarcoHaciaPoblado(estado, id);
    if (ruta) {
      return { tipo: 'construirBarco', jugador: id, arista: ruta.arista };
    }
  }
  if (objetivo === 'cartaDesarrollo' && estado.mazoDesarrollo.length > 0 && tieneRecursos(mano, COSTES.cartaDesarrollo)) {
    return { tipo: 'comprarCartaDesarrollo', jugador: id };
  }
  return { tipo: 'terminarConstruccionEspecial', jugador: id };
}

/** Parámetros razonables para una carta de progreso. */
function parametrosProgreso(estado: EstadoJuego, id: IdJugador, carta: TipoCartaProgreso, rng: GeneradorAleatorio): Record<string, unknown> | null {
  const opciones = opcionesProgreso(estado, id, carta);
  if (!opciones) {
    return null;
  }
  const j = jugador(estado, id);
  const falta = faltantes(j.recursos, COSTE_OBJETIVO[elegirObjetivo(estado, id)]);
  const recursoQueFalta = RECURSOS.find((r) => (falta[r] ?? 0) > 0) ?? rng.elegir(RECURSOS);
  const recursoQueSobra = [...RECURSOS].sort((a, b) => j.recursos[b] - j.recursos[a])[0]!;
  switch (opciones.necesita) {
    case 'nada':
      return {};
    case 'dados':
      return null;
    case 'recurso':
      return { recurso: carta === 'puertoComercial' ? recursoQueSobra : recursoQueFalta };
    case 'recursoOMercancia':
      return j.recursos[recursoQueSobra] >= 2 ? { recurso: recursoQueSobra } : null;
    case 'mercancia': {
      const cyc = j.cyc!;
      const linea = [...LINEAS_MEJORA].sort((a, b) => cyc.mejoras[b] - cyc.mejoras[a])[0]!;
      return { mercancia: MERCANCIA_DE_LINEA[linea] };
    }
    case 'jugador':
      return { jugadorObjetivo: elegirMejor(opciones.opciones, (r) => puntosDeVictoria(estado, r, false), 'medio', rng) };
    case 'vertices':
      return { vertices: opciones.opciones.slice(0, opciones.maximo) };
    case 'hexagonos':
      if (carta === 'obispo') {
        return { hexagonos: [elegirMejor(opciones.opciones, (h) => puntuarLadron(estado, id, h), 'medio', rng)] };
      }
      return { hexagonos: rng.barajar(opciones.opciones).slice(0, opciones.maximo) };
    case 'arista': {
      const ajena = opciones.opciones.filter((a) => estado.tablero.carreteras[a] !== id);
      return ajena.length > 0 ? { arista: rng.elegir(ajena) } : null;
    }
  }
}

/** Jugadas propias de Ciudades y Caballeros: cartas de progreso, mejoras, caballeros contra los bárbaros y murallas. */
function accionCiudadesYCaballeros(estado: EstadoJuego, id: IdJugador, nivel: NivelReglas, rng: GeneradorAleatorio): AccionJuego | null {
  const j = jugador(estado, id);
  const cyc = j.cyc;
  if (!estado.cyc || !cyc) {
    return null;
  }
  const mano = j.recursos;

  // Cartas de progreso (el Fácil juega menos).
  for (const carta of cartasProgresoJugables(estado, id)) {
    if (carta === 'alquimista' || (carta === 'medicina' && !tieneRecursos(mano, COSTES_CYC.medicina)) || (nivel === 'facil' && rng.siguiente() < 0.5)) {
      continue;
    }
    const parametros = parametrosProgreso(estado, id, carta, rng);
    if (parametros) {
      return { tipo: 'jugarProgreso', jugador: id, carta, ...parametros } as AccionJuego;
    }
  }

  // Mejoras urbanas: la línea más avanzada que se pueda pagar.
  const tieneCiudad = Object.values(estado.tablero.edificios).some((e) => e.jugador === id && e.tipo === 'ciudad');
  if (tieneCiudad) {
    const pagables = LINEAS_MEJORA.filter(
      (l) => cyc.mejoras[l] < 5 && cyc.mercancias[MERCANCIA_DE_LINEA[l]] >= costeMejora(cyc.mejoras[l], estado.turno.grua === true),
    );
    if (pagables.length > 0) {
      const linea = [...pagables].sort((a, b) => cyc.mejoras[b] - cyc.mejoras[a])[0]!;
      return { tipo: 'mejorarCiudad', jugador: id, linea };
    }
  }

  // Defensa ante los bárbaros cuando se acercan.
  const peligro = estado.cyc.barbaros >= (nivel === 'facil' ? 5 : 3);
  if (peligro && defensaDe(estado, id) < Math.max(1, fuerzaBarbaros(estado) / estado.jugadores.length)) {
    const activables = caballerosActivables(estado, id);
    if (activables.length > 0 && tieneRecursos(mano, COSTES_CYC.activarCaballero)) {
      return { tipo: 'activarCaballero', jugador: id, vertice: activables[0]! };
    }
    const huecos = verticesValidosCaballero(estado, id);
    if (huecos.length > 0 && cyc.caballeros[1] > 0 && tieneRecursos(mano, COSTES_CYC.caballero)) {
      return { tipo: 'construirCaballero', jugador: id, vertice: elegirMejor(huecos, (v) => puntuarVertice(estado, id, v), nivel, rng) };
    }
    const ascendibles = caballerosAscendibles(estado, id);
    if (ascendibles.length > 0 && tieneRecursos(mano, COSTES_CYC.ascenderCaballero)) {
      return { tipo: 'ascenderCaballero', jugador: id, vertice: ascendibles[0]! };
    }
  }

  // Echar al ladrón de mis hexágonos.
  const ladronMePerjudica = grafoDe(estado)
    .hexagono(estado.tablero.ladron)
    .vertices.some((v) => estado.tablero.edificios[v]?.jugador === id);
  const expulsores = estado.cyc.ataques > 0 && ladronMePerjudica ? caballerosJuntoAlLadron(estado, id) : [];
  if (expulsores.length > 0) {
    return { tipo: 'expulsarLadron', jugador: id, vertice: expulsores[0]! };
  }

  // Murallas si la mano es grande.
  const ciudades = ciudadesParaMuralla(estado, id);
  if (ciudades.length > 0 && cyc.murallas > 0 && cartasEnMano(j) > 9 && tieneRecursos(mano, COSTES_CYC.muralla)) {
    return { tipo: 'construirMuralla', jugador: id, vertice: ciudades[0]! };
  }
  return null;
}

/** Acción del jugador en turno durante la fase de comercio y construcción. */
function accionEnTurno(estado: EstadoJuego, id: IdJugador, nivel: NivelReglas, rng: GeneradorAleatorio): AccionJuego {
  const j = jugador(estado, id);

  // Contraofertas dirigidas a mí.
  const contraoferta = estado.ofertas.find((o) => o.destinatario === id && !o.rechazadaPor.includes(id));
  if (contraoferta) {
    return convieneIntercambio(estado, id, contraoferta.pide, contraoferta.ofrece, contraoferta.autor)
      ? { tipo: 'confirmarOferta', jugador: id, idOferta: contraoferta.id, con: contraoferta.autor }
      : { tipo: 'responderOferta', jugador: id, idOferta: contraoferta.id, acepta: false };
  }

  const carta = jugarCartaSiConviene(estado, id, nivel, rng);
  if (carta) {
    return carta;
  }

  const jugadaCyC = accionCiudadesYCaballeros(estado, id, nivel, rng);
  if (jugadaCyC) {
    return jugadaCyC;
  }

  const mano = j.recursos;
  const ciudades = verticesValidosCiudad(estado, id);
  if (j.piezas.ciudades > 0 && ciudades.length > 0 && tieneRecursos(mano, COSTES.ciudad)) {
    const vertice = elegirMejor(ciudades, (v) => puntuarVertice(estado, id, v), nivel, rng);
    return { tipo: 'construirCiudad', jugador: id, vertice };
  }
  const poblados = verticesValidosPoblado(estado, id);
  if (j.piezas.poblados > 0 && poblados.length > 0 && tieneRecursos(mano, COSTES.poblado)) {
    const vertice = elegirMejor(poblados, (v) => puntuarVertice(estado, id, v), nivel, rng);
    return { tipo: 'construirPoblado', jugador: id, vertice };
  }
  const objetivo = elegirObjetivo(estado, id);
  if (j.piezas.carreteras > 0 && tieneRecursos(mano, COSTES.carretera) && (objetivo === 'carretera' || poblados.length === 0)) {
    const camino = mejorCarreteraHaciaPoblado(estado, id);
    if (camino) {
      return { tipo: 'construirCarretera', jugador: id, arista: camino.arista };
    }
  }
  if (objetivo === 'barco' && (j.piezas.barcos ?? 0) > 0 && tieneRecursos(mano, COSTES.barco)) {
    const camino = mejorBarcoHaciaPoblado(estado, id);
    if (camino) {
      return { tipo: 'construirBarco', jugador: id, arista: camino.arista };
    }
  }
  if (
    estado.mazoDesarrollo.length > 0 &&
    tieneRecursos(mano, COSTES.cartaDesarrollo) &&
    (objetivo === 'cartaDesarrollo' || totalFaltante(mano, COSTE_OBJETIVO[objetivo]) >= 3)
  ) {
    return { tipo: 'comprarCartaDesarrollo', jugador: id };
  }
  const comercio = comercioHaciaObjetivo(estado, id, objetivo, nivel);
  if (comercio && (nivel === 'medio' || rng.siguiente() < 0.5)) {
    return comercio;
  }
  return { tipo: 'finalizarTurno', jugador: id };
}

/**
 * Decide la siguiente acción de un bot, o null si ahora no le toca hacer nada.
 * Sirve tanto para el jugador en turno como para descartes y respuestas a ofertas.
 */
export function decidirConReglas(
  estado: EstadoJuego,
  id: IdJugador,
  nivel: NivelReglas,
  rng: GeneradorAleatorio,
): AccionJuego | null {
  const fase = estado.fase;
  if (fase.tipo === 'finalizada') {
    return null;
  }
  if (fase.tipo === 'descartar') {
    const cantidad = fase.pendientes[id];
    return cantidad === undefined ? null : { tipo: 'descartar', jugador: id, ...elegirDescarte(estado, id, cantidad) };
  }
  if (fase.tipo === 'elegirOro') {
    const cantidad = fase.pendientes[id];
    return cantidad === undefined ? null : { tipo: 'elegirOro', jugador: id, recursos: elegirOro(estado, id, cantidad) };
  }
  if (fase.tipo === 'construccionEspecial') {
    return fase.pendientes[0] === id ? accionConstruccionEspecial(estado, id, nivel, rng) : null;
  }
  if (jugadorEnTurno(estado).id !== id) {
    return fase.tipo === 'acciones' ? responderOfertas(estado, id, nivel, rng) : null;
  }

  switch (fase.tipo) {
    case 'colocacionInicial': {
      if (fase.paso === 'poblado') {
        const vertice = elegirMejor(verticesValidosPoblado(estado, id, true), (v) => puntuarVertice(estado, id, v), nivel, rng);
        return { tipo: 'colocarPobladoInicial', jugador: id, vertice };
      }
      // La carretera apunta hacia el mejor vértice libre a dos pasos.
      const grafo = grafoDe(estado);
      const ocupado = (v: string) => estado.tablero.edificios[v] !== undefined;
      const valorArista = (a: string) => {
        const [x, y] = grafo.arista(a).vertices;
        const destino = x === fase.ultimoPoblado ? y : x;
        const siguientes = grafo.verticesAdyacentes(destino).filter((v) => v !== fase.ultimoPoblado && !ocupado(v) && grafo.cumpleReglaDistancia(v, ocupado));
        return Math.max(0, ...siguientes.map((v) => puntuarVertice(estado, id, v)));
      };
      const arista = elegirMejor(aristasValidasCarreteraInicial(estado, fase.ultimoPoblado!), valorArista, nivel, rng);
      return { tipo: 'colocarCarreteraInicial', jugador: id, arista };
    }

    case 'tirarDados':
      return jugarCartaSiConviene(estado, id, nivel, rng) ?? { tipo: 'tirarDados', jugador: id };

    case 'moverLadron': {
      const opciones = hexagonosValidosLadron(estado);
      const hexagono = nivel === 'facil' ? rng.elegir(opciones) : elegirMejor(opciones, (h) => puntuarLadron(estado, id, h), nivel, rng);
      return { tipo: 'moverLadron', jugador: id, hexagono };
    }

    case 'robar': {
      const victima = elegirMejor(
        fase.victimas,
        (v) => 10 * puntosDeVictoria(estado, v, false) + RECURSOS.reduce((s, r) => s + jugador(estado, v).recursos[r], 0),
        nivel,
        rng,
      );
      return { tipo: 'robar', jugador: id, victima };
    }

    case 'construccionCarreteras': {
      const j = jugador(estado, id);
      const camino = j.piezas.carreteras > 0 ? mejorCarreteraHaciaPoblado(estado, id) : null;
      if (camino) {
        return { tipo: 'construirCarretera', jugador: id, arista: camino.arista };
      }
      const ruta = (j.piezas.barcos ?? 0) > 0 ? mejorBarcoHaciaPoblado(estado, id) : null;
      if (ruta) {
        return { tipo: 'construirBarco', jugador: id, arista: ruta.arista };
      }
      const carreteras = j.piezas.carreteras > 0 ? aristasValidasCarretera(estado, id) : [];
      return carreteras.length > 0
        ? { tipo: 'construirCarretera', jugador: id, arista: rng.elegir(carreteras) }
        : { tipo: 'construirBarco', jugador: id, arista: rng.elegir(aristasValidasBarco(estado, id)) };
    }

    case 'acciones':
      return accionEnTurno(estado, id, nivel, rng);
  }
}
