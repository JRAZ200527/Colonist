/**
 * Utilidades internas del reductor (contexto de una acción, pagos, robos, títulos...).
 * Las comparten el reductor base y los módulos de las expansiones.
 */

import type { GrafoTablero, IdArista, IdVertice } from '../grafo.js';
import { NOMBRES_TERRENO, RECURSOS, recursoDeTerreno } from '../terreno.js';
import { GeneradorAleatorio } from './aleatorio.js';
import { barajaDadosCompleta } from './crearPartida.js';
import {
  esCantidadValida,
  esVacia,
  listaDeCartas,
  manoVacia,
  restarA,
  soloPositivos,
  sumarA,
  tieneRecursos,
  totalCartas,
} from './recursos.js';
import {
  aristasValidasBarco,
  aristasValidasBarcoInicial,
  aristasValidasCarretera,
  aristasValidasCarreteraInicial,
  barcosMovibles,
  buscarJugador,
  calcularOro,
  calcularProduccion,
  conNavegantes,
  destinosBarco,
  esAristaValidaBarco,
  calcularTitularGranRuta,
  esAristaValidaCarretera,
  esVerticeValidoPoblado,
  grafoDe,
  hexagonosValidosLadron,
  hexagonosValidosPirata,
  jugadorEnTurno,
  ordenSerpiente,
  puntosDeVictoria,
  tasasComercio,
  victimasPirata,
  victimasRobo,
} from './reglas.js';
import {
  CABALLEROS_MINIMOS_MAYOR_EJERCITO,
  COSTES,
  NOMBRES_CARTA_DESARROLLO,
  NOMBRES_FASE,
  type AccionJuego,
  type EstadoJuego,
  type EstadoJugador,
  type EventoJuego,
  type FaseJuego,
  type FaseRetorno,
  type IdJugador,
  type RecursosParciales,
  type TipoCartaDesarrollo,
  type TipoFase,
} from './tipos.js';

/** Error por una acción que incumple las reglas (no es un fallo del programa). */
export class ErrorRegla extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorRegla';
  }
}


export interface Contexto {
  readonly estado: EstadoJuego;
  readonly grafo: GrafoTablero;
  readonly rng: GeneradorAleatorio;
  readonly eventos: EventoJuego[];
}

export function fallar(mensaje: string): never {
  throw new ErrorRegla(mensaje);
}

/** Copia profunda de datos JSON planos. */
export function clonarProfundo<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map(clonarProfundo) as T;
  }
  if (valor !== null && typeof valor === 'object') {
    const copia: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
      copia[clave] = clonarProfundo(v);
    }
    return copia as T;
  }
  return valor;
}

/** Copia el estado compartiendo la forma del mapa, que nunca cambia (y así el grafo sigue en caché). */
export function clonarEstado(estado: EstadoJuego): EstadoJuego {
  const { hexagonos, puertos, ...resto } = estado.tablero;
  const copia = clonarProfundo({ ...estado, tablero: resto });
  return { ...copia, tablero: { ...copia.tablero, hexagonos, puertos } };
}

// ───────────────────────── utilidades internas ─────────────────────────

export function jugador(ctx: Contexto, id: IdJugador): EstadoJugador {
  return buscarJugador(ctx.estado, id) ?? fallar('Ese jugador no participa en la partida');
}

export function exigirTurno(ctx: Contexto, id: IdJugador): EstadoJugador {
  const actual = jugadorEnTurno(ctx.estado);
  if (actual.id !== id) {
    jugador(ctx, id);
    fallar('No es tu turno');
  }
  return actual;
}

/** Jugador que puede construir ahora: el que está en turno o, en la fase especial, el que le toca. */
export function exigirConstructor(ctx: Contexto, id: IdJugador): EstadoJugador {
  const fase = ctx.estado.fase;
  if (fase.tipo !== 'construccionEspecial') {
    return exigirTurno(ctx, id);
  }
  if (fase.pendientes[0] !== id) {
    jugador(ctx, id);
    fallar('No es tu turno de construcción especial');
  }
  return jugador(ctx, id);
}

/** Pasa el turno al siguiente jugador. */
export function avanzarTurno(ctx: Contexto): void {
  const { estado } = ctx;
  const siguiente = (estado.turno.jugadorActual + 1) % estado.jugadores.length;
  estado.turno = {
    numero: estado.turno.numero + 1,
    jugadorActual: siguiente,
    dados: null,
    haJugadoCartaDesarrollo: false,
    ...(conNavegantes(estado) ? { barcoMovido: false, barcosNuevos: [] } : {}),
  };
  estado.ofertas = [];
  estado.fase = { tipo: 'tirarDados' };
  emitir(ctx, { tipo: 'turnoIniciado', jugador: estado.jugadores[siguiente]!.id, numero: estado.turno.numero });
}

/** Tras el poblado y la carretera (o barco) iniciales, pasa al siguiente en el orden en serpiente. */
export function trasColocacionInicial(ctx: Contexto, indiceActual: number): void {
  const { estado } = ctx;
  const indice = indiceActual + 1;
  const total = estado.jugadores.length;
  if (indice >= 2 * total) {
    estado.turno = {
      numero: 1,
      jugadorActual: 0,
      dados: null,
      haJugadoCartaDesarrollo: false,
      ...(conNavegantes(estado) ? { barcoMovido: false, barcosNuevos: [] } : {}),
    };
    estado.fase = { tipo: 'tirarDados' };
    emitir(ctx, { tipo: 'turnoIniciado', jugador: estado.jugadores[0]!.id, numero: 1 });
  } else {
    estado.turno.jugadorActual = ordenSerpiente(indice, total);
    estado.fase = { tipo: 'colocacionInicial', paso: 'poblado', indice, ultimoPoblado: null };
  }
}

export function colocarBarco(ctx: Contexto, j: EstadoJugador, arista: IdArista, gratis: boolean): void {
  if ((j.piezas.barcos ?? 0) <= 0) {
    fallar('No te quedan barcos');
  }
  ctx.estado.tablero.barcos![arista] = j.id;
  j.piezas.barcos = (j.piezas.barcos ?? 0) - 1;
  ctx.estado.turno.barcosNuevos = [...(ctx.estado.turno.barcosNuevos ?? []), arista];
  emitir(ctx, { tipo: 'barcoConstruido', jugador: j.id, arista, gratis });
  actualizarGranRuta(ctx);
}

export function exigirNavegantes(ctx: Contexto): void {
  if (!conNavegantes(ctx.estado)) {
    fallar('Esta partida no se juega con el módulo Navegantes');
  }
}

export function exigirFase<T extends TipoFase>(ctx: Contexto, ...tipos: T[]): Extract<FaseJuego, { tipo: T }> {
  const fase = ctx.estado.fase;
  if (!(tipos as TipoFase[]).includes(fase.tipo)) {
    fallar(`No se puede hacer eso durante la fase de ${NOMBRES_FASE[fase.tipo]}`);
  }
  return fase as Extract<FaseJuego, { tipo: T }>;
}

export function emitir(ctx: Contexto, evento: EventoJuego): void {
  ctx.eventos.push(evento);
}

export function validarRecursos(recursos: RecursosParciales, descripcion: string): void {
  if (!esCantidadValida(recursos)) {
    fallar(`Cantidades de recursos inválidas en ${descripcion}`);
  }
}

export function pagarABanca(ctx: Contexto, j: EstadoJugador, coste: RecursosParciales): void {
  if (!tieneRecursos(j.recursos, coste)) {
    fallar('No tienes suficientes recursos');
  }
  restarA(j.recursos, coste);
  sumarA(ctx.estado.banca, coste);
}

export function cobrarDeBanca(ctx: Contexto, j: EstadoJugador, recursos: RecursosParciales): void {
  if (!tieneRecursos(ctx.estado.banca, recursos)) {
    fallar('La banca no tiene suficientes cartas de ese recurso');
  }
  restarA(ctx.estado.banca, recursos);
  sumarA(j.recursos, recursos);
}

export function sinRecursosRepetidos(a: RecursosParciales, b: RecursosParciales): boolean {
  return RECURSOS.every((r) => (a[r] ?? 0) === 0 || (b[r] ?? 0) === 0);
}

export function actualizarGranRuta(ctx: Contexto): void {
  const anterior = ctx.estado.titulos.granRuta;
  const nuevo = calcularTitularGranRuta(ctx.estado);
  if (nuevo !== anterior) {
    ctx.estado.titulos.granRuta = nuevo;
    emitir(ctx, { tipo: 'tituloCambiado', titulo: 'granRuta', jugador: nuevo, anterior });
  }
}

export function actualizarMayorEjercito(ctx: Contexto, j: EstadoJugador): void {
  const anterior = ctx.estado.titulos.mayorEjercito;
  if (anterior === j.id || j.caballerosJugados < CABALLEROS_MINIMOS_MAYOR_EJERCITO) {
    return;
  }
  const caballerosTitular = anterior === null ? 0 : jugador(ctx, anterior).caballerosJugados;
  if (j.caballerosJugados > caballerosTitular) {
    ctx.estado.titulos.mayorEjercito = j.id;
    emitir(ctx, { tipo: 'tituloCambiado', titulo: 'mayorEjercito', jugador: j.id, anterior });
  }
}

/** Solo gana el jugador en turno, al llegar a los puntos necesarios durante su turno. */
export function comprobarVictoria(ctx: Contexto): void {
  const { estado } = ctx;
  if (estado.fase.tipo === 'finalizada' || estado.fase.tipo === 'colocacionInicial') {
    return;
  }
  const actual = jugadorEnTurno(estado);
  const puntos = puntosDeVictoria(estado, actual.id);
  if (puntos >= estado.configuracion.puntosVictoria) {
    estado.fase = { tipo: 'finalizada', ganador: actual.id };
    estado.ofertas = [];
    emitir(ctx, { tipo: 'victoria', jugador: actual.id, puntos });
  }
}

export function colocarCarretera(ctx: Contexto, j: EstadoJugador, arista: IdArista, gratis: boolean): void {
  if (j.piezas.carreteras <= 0) {
    fallar('No te quedan carreteras');
  }
  ctx.estado.tablero.carreteras[arista] = j.id;
  j.piezas.carreteras--;
  emitir(ctx, { tipo: 'carreteraConstruida', jugador: j.id, arista, gratis });
  actualizarGranRuta(ctx);
}

export function colocarPoblado(ctx: Contexto, j: EstadoJugador, vertice: IdVertice, inicial: boolean): void {
  if (j.piezas.poblados <= 0) {
    fallar('No te quedan poblados');
  }
  ctx.estado.tablero.edificios[vertice] = { tipo: 'poblado', jugador: j.id };
  j.piezas.poblados--;
  emitir(ctx, { tipo: 'pobladoColocado', jugador: j.id, vertice, inicial });
}

export function realizarRobo(ctx: Contexto, ladron: EstadoJugador, victima: EstadoJugador): void {
  const recurso = ctx.rng.elegir(listaDeCartas(victima.recursos));
  victima.recursos[recurso]--;
  ladron.recursos[recurso]++;
  emitir(ctx, { tipo: 'robo', jugador: ladron.id, victima: victima.id, recurso });
}

export function lanzarDados(ctx: Contexto): [number, number] {
  const { estado, rng } = ctx;
  if (estado.configuracion.modoDados === 'aleatorio') {
    return [rng.entero(6) + 1, rng.entero(6) + 1];
  }
  // Dados equilibrados: se roba de una baraja con las 36 combinaciones y se
  // vuelve a barajar cuando quedan pocas cartas, para que no sea predecible.
  if (estado.barajaDados.length <= 5) {
    estado.barajaDados = rng.barajar(barajaDadosCompleta());
  }
  return estado.barajaDados.pop()!;
}

export function producir(ctx: Contexto, suma: number): void {
  const reparto = calcularProduccion(ctx.estado, suma);
  const visible: Record<IdJugador, RecursosParciales> = {};
  for (const [id, recursos] of Object.entries(reparto)) {
    if (totalCartas(recursos) > 0) {
      cobrarDeBanca(ctx, jugador(ctx, id), recursos);
      visible[id] = soloPositivos(recursos);
    }
  }
  emitir(ctx, { tipo: 'produccion', reparto: visible });
}

export function iniciarRoboOVolver(ctx: Contexto, ladron: EstadoJugador, volverA: FaseRetorno, victimas: IdJugador[]): void {
  if (victimas.length === 1) {
    realizarRobo(ctx, ladron, jugador(ctx, victimas[0]!));
  }
  ctx.estado.fase = victimas.length > 1 ? { tipo: 'robar', victimas, volverA } : { tipo: volverA };
}

export function terminarConstruccionCarreterasSiProcede(ctx: Contexto, j: EstadoJugador): void {
  const fase = ctx.estado.fase;
  if (fase.tipo !== 'construccionCarreteras') {
    return;
  }
  const quedanCarreteras = j.piezas.carreteras > 0 && aristasValidasCarretera(ctx.estado, j.id).length > 0;
  const quedanBarcos = (j.piezas.barcos ?? 0) > 0 && aristasValidasBarco(ctx.estado, j.id).length > 0;
  if (fase.restantes <= 0 || (!quedanCarreteras && !quedanBarcos)) {
    ctx.estado.fase = { tipo: fase.volverA };
  }
}

export function jugarCarta(ctx: Contexto, id: IdJugador, tipo: TipoCartaDesarrollo): { j: EstadoJugador; volverA: FaseRetorno } {
  const j = exigirTurno(ctx, id);
  const fase = exigirFase(ctx, 'tirarDados', 'acciones');
  if (ctx.estado.turno.haJugadoCartaDesarrollo) {
    fallar('Solo puedes jugar una carta de desarrollo por turno');
  }
  const indice = j.cartasDesarrollo.findIndex((c) => c.tipo === tipo && c.turnoCompra < ctx.estado.turno.numero);
  if (indice === -1) {
    fallar(
      j.cartasDesarrollo.some((c) => c.tipo === tipo)
        ? 'No puedes jugar una carta de desarrollo el mismo turno en que la compras'
        : `No tienes ninguna carta de ${NOMBRES_CARTA_DESARROLLO[tipo]}`,
    );
  }
  j.cartasDesarrollo.splice(indice, 1);
  ctx.estado.turno.haJugadoCartaDesarrollo = true;
  emitir(ctx, { tipo: 'cartaDesarrolloJugada', jugador: j.id, carta: tipo });
  return { j, volverA: fase.tipo };
}
