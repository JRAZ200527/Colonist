/**
 * Acciones y tiradas del módulo Ciudades y Caballeros.
 *
 * Simplificaciones respecto al juego de mesa (documentadas en el README):
 * - Cuando un caballero es desplazado, se recoloca solo en el primer vértice libre
 *   de la red de su dueño (si no hay ninguno, vuelve a su reserva).
 * - Las cartas que en el juego elige el rival (Boda, Saboteador) se toman al azar.
 * - Si la Defensa de Catán empata, cada empatado roba una carta de un mazo al azar.
 */

import { CoordenadasCubicas } from '../coordenadas.js';
import { idHexagono, type IdArista, type IdHexagono, type IdVertice } from '../grafo.js';
import { RECURSOS, type Recurso } from '../terreno.js';
import {
  caballerosActivables,
  caballerosAscendibles,
  caballerosDe,
  caballerosJuntoAlLadron,
  caballerosQuePuedenActuar,
  calcularMercancias,
  carreterasAbiertas,
  cartasEnMano,
  ciudadesParaMuralla,
  costeMejora,
  defensaDe,
  destinosCaballero,
  esCartaDePuntos,
  esMercanciaValida,
  fuerzaBarbaros,
  limiteDescarte,
  mercanciasVacias,
  metropolisEn,
  opcionesProgreso,
  rivalesConMasPuntos,
  tasasCyC,
  tieneMercancias,
  totalMercancias,
  verticesValidosCaballero,
} from './ciudadesCaballeros.js';
import {
  cobrarDeBanca,
  emitir,
  exigirConstructor,
  exigirFase,
  exigirTurno,
  fallar,
  jugador,
  pagarABanca,
  actualizarGranRuta,
  terminarConstruccionCarreterasSiProcede,
  validarRecursos,
  type Contexto,
} from './nucleo.js';
import { calcularOro, calcularProduccion, grafoDe } from './reglas.js';
import { soloPositivos, totalCartas } from './recursos.js';
import {
  CARTAS_PROGRESO,
  COSTES_CYC,
  LIMITE_CARTAS_PROGRESO,
  LINEAS_MEJORA,
  MERCANCIA_DE_LINEA,
  MERCANCIAS,
  NIVEL_MAXIMO_MEJORA,
  NIVEL_METROPOLIS,
  NOMBRES_LINEA_MEJORA,
  POSICION_ATAQUE_BARBAROS,
  type AccionJuego,
  type CaraDadoEvento,
  type EstadoCyC,
  type EstadoJugador,
  type EstadoJugadorCyC,
  type IdJugador,
  type LineaMejora,
  type Mercancia,
  type MercanciasParciales,
  type NivelCaballero,
  type RecursosParciales,
  type TipoCartaProgreso,
} from './tipos.js';

export type AccionCyC = Extract<
  AccionJuego,
  {
    tipo:
      | 'construirCaballero'
      | 'activarCaballero'
      | 'ascenderCaballero'
      | 'moverCaballero'
      | 'expulsarLadron'
      | 'construirMuralla'
      | 'mejorarCiudad'
      | 'jugarProgreso';
  }
>;

// ───────────── utilidades ─────────────

export function exigirCyC(ctx: Contexto): EstadoCyC {
  return ctx.estado.cyc ?? fallar('Esta partida no se juega con Ciudades y Caballeros');
}

function datosCyC(j: EstadoJugador): EstadoJugadorCyC {
  return j.cyc ?? fallar('Este jugador no tiene datos de Ciudades y Caballeros');
}

function pagarMercancias(ctx: Contexto, j: EstadoJugador, mercancias: MercanciasParciales): void {
  const datos = datosCyC(j);
  if (!tieneMercancias(datos.mercancias, mercancias)) {
    fallar('No tienes suficientes mercancías');
  }
  for (const m of MERCANCIAS) {
    datos.mercancias[m] -= mercancias[m] ?? 0;
    exigirCyC(ctx).bancaMercancias[m] += mercancias[m] ?? 0;
  }
}

function cobrarMercancias(ctx: Contexto, j: EstadoJugador, mercancias: MercanciasParciales): void {
  const banca = exigirCyC(ctx).bancaMercancias;
  if (!tieneMercancias(banca, mercancias)) {
    fallar('La banca no tiene suficientes mercancías de ese tipo');
  }
  for (const m of MERCANCIAS) {
    banca[m] -= mercancias[m] ?? 0;
    datosCyC(j).mercancias[m] += mercancias[m] ?? 0;
  }
}

/** Mueve una carta al azar (recurso o mercancía) de un jugador a otro. Devuelve qué fue, o null si no tenía. */
function tomarCartaAlAzar(
  ctx: Contexto,
  de: EstadoJugador,
  a: EstadoJugador,
): { tipo: 'recurso'; recurso: Recurso } | { tipo: 'mercancia'; mercancia: Mercancia } | null {
  const opciones: ({ tipo: 'recurso'; recurso: Recurso } | { tipo: 'mercancia'; mercancia: Mercancia })[] = [
    ...RECURSOS.flatMap((r) => Array.from({ length: de.recursos[r] }, () => ({ tipo: 'recurso' as const, recurso: r }))),
    ...MERCANCIAS.flatMap((m) => Array.from({ length: de.cyc?.mercancias[m] ?? 0 }, () => ({ tipo: 'mercancia' as const, mercancia: m }))),
  ];
  if (opciones.length === 0) {
    return null;
  }
  const carta = ctx.rng.elegir(opciones);
  if (carta.tipo === 'recurso') {
    de.recursos[carta.recurso]--;
    a.recursos[carta.recurso]++;
  } else {
    datosCyC(de).mercancias[carta.mercancia]--;
    datosCyC(a).mercancias[carta.mercancia]++;
  }
  return carta;
}

/** Toma `cantidad` cartas al azar y emite un único evento con el total. */
function tomarCartas(ctx: Contexto, de: EstadoJugador, a: EstadoJugador, cantidad: number): void {
  const recursos: RecursosParciales = {};
  const mercancias: MercanciasParciales = {};
  for (let i = 0; i < cantidad; i++) {
    const carta = tomarCartaAlAzar(ctx, de, a);
    if (!carta) {
      break;
    }
    if (carta.tipo === 'recurso') {
      recursos[carta.recurso] = (recursos[carta.recurso] ?? 0) + 1;
    } else {
      mercancias[carta.mercancia] = (mercancias[carta.mercancia] ?? 0) + 1;
    }
  }
  if (totalCartas(recursos) + totalMercancias(mercancias) > 0) {
    emitir(ctx, { tipo: 'cartasTomadas', jugador: a.id, de: de.id, recursos, mercancias });
  }
}

/** Descarta al azar `cantidad` cartas de la mano de un jugador a la banca. */
function descartarAlAzar(ctx: Contexto, j: EstadoJugador, cantidad: number): void {
  const recursos: RecursosParciales = {};
  const mercancias: MercanciasParciales = {};
  for (let i = 0; i < cantidad; i++) {
    const opciones = [
      ...RECURSOS.filter((r) => j.recursos[r] > (recursos[r] ?? 0)).map((r) => ({ recurso: r })),
      ...MERCANCIAS.filter((m) => (j.cyc?.mercancias[m] ?? 0) > (mercancias[m] ?? 0)).map((m) => ({ mercancia: m })),
    ];
    if (opciones.length === 0) {
      break;
    }
    const carta = ctx.rng.elegir(opciones);
    if ('recurso' in carta) {
      recursos[carta.recurso] = (recursos[carta.recurso] ?? 0) + 1;
    } else {
      mercancias[carta.mercancia] = (mercancias[carta.mercancia] ?? 0) + 1;
    }
  }
  pagarABanca(ctx, j, recursos);
  pagarMercancias(ctx, j, mercancias);
  emitir(ctx, { tipo: 'descarte', jugador: j.id, recursos: soloPositivos(recursos) });
}

/** Roba una carta de progreso del mazo de una línea (las de puntos se juegan al momento). */
function robarProgreso(ctx: Contexto, j: EstadoJugador, linea: LineaMejora): void {
  const mazo = exigirCyC(ctx).mazos[linea];
  const carta = mazo.pop();
  if (!carta) {
    return;
  }
  const datos = datosCyC(j);
  if (esCartaDePuntos(carta)) {
    datos.puntosProgreso++;
    emitir(ctx, { tipo: 'cartaProgresoRobada', jugador: j.id, linea, carta });
    emitir(ctx, { tipo: 'cartaProgresoJugada', jugador: j.id, carta });
    return;
  }
  if (datos.cartasProgreso.length >= LIMITE_CARTAS_PROGRESO) {
    // Mano llena: la carta vuelve al fondo del mazo.
    mazo.unshift(carta);
    return;
  }
  datos.cartasProgreso.push(carta);
  emitir(ctx, { tipo: 'cartaProgresoRobada', jugador: j.id, linea, carta });
}

/** Coloca un caballero rival desplazado en el primer vértice libre de su red, o lo devuelve a su reserva. */
function recolocarDesplazado(ctx: Contexto, vertice: IdVertice): { jugador: IdJugador; a: IdVertice | null } {
  const caballeros = ctx.estado.tablero.caballeros!;
  const desplazado = caballeros[vertice]!;
  delete caballeros[vertice];
  const destino = verticesValidosCaballero(ctx.estado, desplazado.jugador).find((v) => v !== vertice) ?? null;
  if (destino) {
    caballeros[destino] = desplazado;
  } else {
    datosCyC(jugador(ctx, desplazado.jugador)).caballeros[desplazado.nivel]++;
  }
  return { jugador: desplazado.jugador, a: destino };
}

function ascender(ctx: Contexto, j: EstadoJugador, vertice: IdVertice): void {
  const caballero = ctx.estado.tablero.caballeros![vertice]!;
  const siguiente = (caballero.nivel + 1) as NivelCaballero;
  const datos = datosCyC(j);
  datos.caballeros[caballero.nivel]++;
  datos.caballeros[siguiente]--;
  caballero.nivel = siguiente;
  caballero.turnoAscenso = ctx.estado.turno.numero;
  emitir(ctx, { tipo: 'caballeroAscendido', jugador: j.id, vertice, nivel: siguiente });
}

function colocarMuralla(ctx: Contexto, j: EstadoJugador, vertice: IdVertice): void {
  const datos = datosCyC(j);
  if (datos.murallas <= 0) {
    fallar('No te quedan murallas');
  }
  ctx.estado.tablero.murallas![vertice] = j.id;
  datos.murallas--;
  emitir(ctx, { tipo: 'murallaConstruida', jugador: j.id, vertice });
}

/** Al llegar al nivel 4 (o 5) de una línea se gana (o se arrebata) la metrópolis. */
function comprobarMetropolis(ctx: Contexto, j: EstadoJugador, linea: LineaMejora): void {
  const cyc = exigirCyC(ctx);
  const nivel = datosCyC(j).mejoras[linea];
  if (nivel < NIVEL_METROPOLIS) {
    return;
  }
  const actual = cyc.metropolis[linea];
  const titular = actual ? ctx.estado.tablero.edificios[actual]?.jugador ?? null : null;
  if (titular === j.id) {
    return;
  }
  const puedeArrebatar =
    titular !== null && nivel === NIVEL_MAXIMO_MEJORA && datosCyC(jugador(ctx, titular)).mejoras[linea] < NIVEL_MAXIMO_MEJORA;
  if (titular !== null && !puedeArrebatar) {
    return;
  }
  const ciudad = Object.entries(ctx.estado.tablero.edificios).find(
    ([v, e]) => e.jugador === j.id && e.tipo === 'ciudad' && metropolisEn(ctx.estado, v) === null,
  )?.[0];
  if (!ciudad) {
    return;
  }
  cyc.metropolis[linea] = ciudad;
  emitir(ctx, { tipo: 'metropolis', jugador: j.id, linea, vertice: ciudad, anterior: titular });
}

// ───────────── tirada ─────────────

const CARAS_DADO_EVENTO: readonly CaraDadoEvento[] = ['barco', 'barco', 'barco', 'comercio', 'politica', 'ciencia'];

/** Tirada con los dos dados y el dado de evento. Sustituye a la tirada normal. */
export function tiradaCyC(ctx: Contexto, j: EstadoJugador, lanzar: () => [number, number]): void {
  const { estado } = ctx;
  const cyc = exigirCyC(ctx);
  const dados = estado.turno.alquimista ?? lanzar();
  estado.turno.alquimista = null;
  estado.turno.dados = dados;
  emitir(ctx, { tipo: 'dadosTirados', jugador: j.id, dados });

  // 1. Dado de evento: bárbaros o cartas de progreso (con el dado rojo).
  const cara = ctx.rng.elegir(CARAS_DADO_EVENTO);
  cyc.ultimoDadoEvento = cara;
  emitir(ctx, { tipo: 'dadoEvento', cara });
  if (cara === 'barco') {
    cyc.barbaros++;
    emitir(ctx, { tipo: 'barbarosAvanzan', posicion: cyc.barbaros });
    if (cyc.barbaros >= POSICION_ATAQUE_BARBAROS) {
      ataqueBarbaro(ctx);
    }
  } else {
    const rojo = dados[1];
    const n = estado.jugadores.length;
    for (let k = 0; k < n; k++) {
      const otro = estado.jugadores[(estado.turno.jugadorActual + k) % n]!;
      const nivel = otro.cyc?.mejoras[cara] ?? 0;
      if (nivel >= 1 && rojo <= nivel + 1) {
        robarProgreso(ctx, otro, cara);
      }
    }
  }

  // 2. Producción o ladrón.
  const suma = dados[0] + dados[1];
  if (suma !== 7) {
    const pendientes = producirCyC(ctx, suma);
    estado.fase = Object.keys(pendientes).length > 0 ? { tipo: 'elegirOro', pendientes } : { tipo: 'acciones' };
    return;
  }
  const pendientes: Record<IdJugador, number> = {};
  for (const otro of estado.jugadores) {
    const total = cartasEnMano(otro);
    if (total > limiteDescarte(estado, otro.id)) {
      pendientes[otro.id] = Math.floor(total / 2);
    }
  }
  estado.fase =
    Object.keys(pendientes).length > 0
      ? { tipo: 'descartar', pendientes }
      : faseTrasSiete(ctx);
}

/** Tras un 7 (y los descartes): el ladrón no se mueve hasta el primer ataque bárbaro. */
export function faseTrasSiete(ctx: Contexto): { tipo: 'moverLadron'; volverA: 'acciones' } | { tipo: 'acciones' } {
  return (ctx.estado.cyc?.ataques ?? 1) > 0 ? { tipo: 'moverLadron', volverA: 'acciones' } : { tipo: 'acciones' };
}

/**
 * Reparte recursos y mercancías. Devuelve las elecciones pendientes: oro y el
 * Acueducto (Ciencia 3: quien no recibe nada elige 1 recurso).
 */
function producirCyC(ctx: Contexto, suma: number): Record<IdJugador, number> {
  const { estado } = ctx;
  const recursos = calcularProduccion(estado, suma);
  const mercancias = calcularMercancias(estado, suma);
  const oro = calcularOro(estado, suma);
  const visible: Record<IdJugador, RecursosParciales> = {};
  const visibleMercancias: Record<IdJugador, MercanciasParciales> = {};
  const pendientes: Record<IdJugador, number> = { ...oro };
  for (const j of estado.jugadores) {
    const r = recursos[j.id]!;
    const m = mercancias[j.id] ?? mercanciasVacias();
    if (totalCartas(r) > 0) {
      cobrarDeBanca(ctx, j, r);
      visible[j.id] = soloPositivos(r);
    }
    if (totalMercancias(m) > 0) {
      cobrarMercancias(ctx, j, m);
      visibleMercancias[j.id] = Object.fromEntries(MERCANCIAS.filter((x) => m[x] > 0).map((x) => [x, m[x]]));
    }
    const nada = totalCartas(r) === 0 && totalMercancias(m) === 0 && (oro[j.id] ?? 0) === 0;
    if (nada && (j.cyc?.mejoras.ciencia ?? 0) >= 3) {
      pendientes[j.id] = (pendientes[j.id] ?? 0) + 1;
    }
  }
  emitir(ctx, { tipo: 'produccion', reparto: visible, mercancias: visibleMercancias });
  return pendientes;
}

/**
 * Ataque bárbaro: fuerza = número de ciudades; defensa = niveles de los caballeros
 * activos. Si Catán gana, el mejor defensor recibe el Defensor de Catán (1 punto);
 * si pierde, quien menos aportó (entre quienes tienen ciudades sin metrópolis)
 * pierde una ciudad. Después todos los caballeros se desactivan.
 */
export function ataqueBarbaro(ctx: Contexto): void {
  const { estado } = ctx;
  const cyc = exigirCyC(ctx);
  const fuerza = fuerzaBarbaros(estado);
  const aportes = new Map(estado.jugadores.map((j) => [j.id, defensaDe(estado, j.id)]));
  const defensa = [...aportes.values()].reduce((s, x) => s + x, 0);
  const defensores: IdJugador[] = [];
  const saqueos: { jugador: IdJugador; vertice: IdVertice }[] = [];

  if (defensa >= fuerza) {
    const maximo = Math.max(...aportes.values());
    if (maximo > 0) {
      defensores.push(...[...aportes].filter(([, a]) => a === maximo).map(([id]) => id));
      if (defensores.length === 1) {
        datosCyC(jugador(ctx, defensores[0]!)).puntosDefensor++;
      } else {
        for (const id of defensores) {
          const lineas = LINEAS_MEJORA.filter((l) => cyc.mazos[l].length > 0);
          if (lineas.length > 0) {
            robarProgreso(ctx, jugador(ctx, id), ctx.rng.elegir(lineas));
          }
        }
      }
    }
  } else {
    const ciudadesSaqueables = (id: IdJugador) =>
      Object.entries(estado.tablero.edificios)
        .filter(([v, e]) => e.jugador === id && e.tipo === 'ciudad' && metropolisEn(estado, v) === null)
        .map(([v]) => v);
    const candidatos = estado.jugadores.filter((j) => ciudadesSaqueables(j.id).length > 0);
    if (candidatos.length > 0) {
      const minimo = Math.min(...candidatos.map((j) => aportes.get(j.id)!));
      for (const j of candidatos.filter((c) => aportes.get(c.id) === minimo)) {
        const vertice = ciudadesSaqueables(j.id)[0]!;
        const edificio = estado.tablero.edificios[vertice]!;
        j.piezas.ciudades++;
        if (j.piezas.poblados > 0) {
          edificio.tipo = 'poblado';
          j.piezas.poblados--;
        } else {
          delete estado.tablero.edificios[vertice];
        }
        if (estado.tablero.murallas?.[vertice]) {
          delete estado.tablero.murallas[vertice];
          datosCyC(j).murallas++;
        }
        saqueos.push({ jugador: j.id, vertice });
      }
    }
  }

  for (const caballero of Object.values(estado.tablero.caballeros ?? {})) {
    caballero.activo = false;
  }
  cyc.barbaros = 0;
  cyc.ataques++;
  emitir(ctx, { tipo: 'ataqueBarbaro', fuerza, defensa, ganador: defensa >= fuerza ? 'catan' : 'barbaros', defensores, saqueos });
}

// ───────────── comercio y descarte ─────────────

/** Cambio con la banca que puede incluir mercancías. */
export function comercioBancaCyC(
  ctx: Contexto,
  j: EstadoJugador,
  accion: Extract<AccionJuego, { tipo: 'comerciarConBanca' }>,
): void {
  const entregaM = accion.entregaMercancias ?? {};
  const recibeM = accion.recibeMercancias ?? {};
  validarRecursos(accion.entrega, 'lo que entregas');
  validarRecursos(accion.recibe, 'lo que recibes');
  if (!esMercanciaValida(entregaM) || !esMercanciaValida(recibeM)) {
    fallar('Cantidades de mercancías inválidas');
  }
  const repetido =
    RECURSOS.some((r) => (accion.entrega[r] ?? 0) > 0 && (accion.recibe[r] ?? 0) > 0) ||
    MERCANCIAS.some((m) => (entregaM[m] ?? 0) > 0 && (recibeM[m] ?? 0) > 0);
  if (repetido) {
    fallar('No puedes entregar y recibir lo mismo');
  }
  const tasas = tasasCyC(ctx.estado, j.id);
  let creditos = 0;
  for (const r of RECURSOS) {
    const cantidad = accion.entrega[r] ?? 0;
    if (cantidad % tasas.recursos[r] !== 0) {
      fallar(`Ese recurso se cambia a ${tasas.recursos[r]}:1`);
    }
    creditos += cantidad / tasas.recursos[r];
  }
  for (const m of MERCANCIAS) {
    const cantidad = entregaM[m] ?? 0;
    if (cantidad % tasas.mercancias[m] !== 0) {
      fallar(`Esa mercancía se cambia a ${tasas.mercancias[m]}:1`);
    }
    creditos += cantidad / tasas.mercancias[m];
  }
  const recibidas = totalCartas(accion.recibe) + totalMercancias(recibeM);
  if (recibidas === 0 || recibidas !== creditos) {
    fallar('La cantidad recibida no corresponde a lo entregado');
  }
  pagarABanca(ctx, j, accion.entrega);
  pagarMercancias(ctx, j, entregaM);
  cobrarDeBanca(ctx, j, accion.recibe);
  cobrarMercancias(ctx, j, recibeM);
  emitir(ctx, { tipo: 'comercioBanca', jugador: j.id, entrega: soloPositivos(accion.entrega), recibe: soloPositivos(accion.recibe) });
}

/** Descarte por un 7, que puede incluir mercancías. */
export function descartarCyC(ctx: Contexto, j: EstadoJugador, debe: number, recursos: RecursosParciales, mercancias: MercanciasParciales): void {
  validarRecursos(recursos, 'el descarte');
  if (!esMercanciaValida(mercancias)) {
    fallar('Cantidades de mercancías inválidas en el descarte');
  }
  if (totalCartas(recursos) + totalMercancias(mercancias) !== debe) {
    fallar(`Debes descartar exactamente ${debe} cartas`);
  }
  pagarABanca(ctx, j, recursos);
  pagarMercancias(ctx, j, mercancias);
  emitir(ctx, { tipo: 'descarte', jugador: j.id, recursos: soloPositivos(recursos) });
}

// ───────────── acciones ─────────────

export function ejecutarCyC(ctx: Contexto, accion: AccionCyC): void {
  const { estado } = ctx;
  const cyc = exigirCyC(ctx);
  const turno = estado.turno.numero;

  switch (accion.tipo) {
    case 'construirCaballero': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!verticesValidosCaballero(estado, j.id).includes(accion.vertice)) {
        fallar('El caballero debe ir en una intersección libre junto a una carretera tuya');
      }
      const datos = datosCyC(j);
      if (datos.caballeros[1] <= 0) {
        fallar('No te quedan caballeros básicos');
      }
      pagarABanca(ctx, j, COSTES_CYC.caballero);
      estado.tablero.caballeros![accion.vertice] = {
        jugador: j.id,
        nivel: 1,
        activo: false,
        turnoActivado: null,
        turnoAccion: null,
        turnoAscenso: null,
      };
      datos.caballeros[1]--;
      emitir(ctx, { tipo: 'caballeroConstruido', jugador: j.id, vertice: accion.vertice });
      // Un caballero puede cortar la carretera de un rival.
      actualizarGranRuta(ctx);
      return;
    }

    case 'activarCaballero': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!caballerosActivables(estado, j.id).includes(accion.vertice)) {
        fallar('Solo puedes activar uno de tus caballeros inactivos');
      }
      pagarABanca(ctx, j, COSTES_CYC.activarCaballero);
      const caballero = estado.tablero.caballeros![accion.vertice]!;
      caballero.activo = true;
      caballero.turnoActivado = turno;
      emitir(ctx, { tipo: 'caballeroActivado', jugador: j.id, vertice: accion.vertice });
      return;
    }

    case 'ascenderCaballero': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!caballerosAscendibles(estado, j.id).includes(accion.vertice)) {
        fallar('Ese caballero no puede ascender: un ascenso por turno, quedan piezas del nivel siguiente y para el nivel 3 hace falta la Fortaleza (Política 3)');
      }
      pagarABanca(ctx, j, COSTES_CYC.ascenderCaballero);
      ascender(ctx, j, accion.vertice);
      return;
    }

    case 'moverCaballero': {
      const j = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      if (!caballerosQuePuedenActuar(estado, j.id).includes(accion.desde)) {
        fallar('El caballero debe estar activo y no haber actuado ni haberse activado este turno');
      }
      if (!destinosCaballero(estado, j.id, accion.desde).includes(accion.hasta)) {
        fallar('El caballero solo puede ir por tus carreteras a una intersección libre o con un caballero rival más débil');
      }
      const caballero = estado.tablero.caballeros![accion.desde]!;
      const desplazado = estado.tablero.caballeros![accion.hasta] ? recolocarDesplazado(ctx, accion.hasta) : null;
      delete estado.tablero.caballeros![accion.desde];
      estado.tablero.caballeros![accion.hasta] = { ...caballero, activo: false, turnoAccion: turno };
      emitir(ctx, { tipo: 'caballeroMovido', jugador: j.id, desde: accion.desde, hasta: accion.hasta, desplazado });
      actualizarGranRuta(ctx);
      return;
    }

    case 'expulsarLadron': {
      const j = exigirTurno(ctx, accion.jugador);
      exigirFase(ctx, 'acciones');
      if (cyc.ataques === 0) {
        fallar('El ladrón no se puede mover hasta el primer ataque de los bárbaros');
      }
      if (!caballerosJuntoAlLadron(estado, j.id).includes(accion.vertice)) {
        fallar('Hace falta un caballero activo junto al ladrón que no haya actuado este turno');
      }
      const caballero = estado.tablero.caballeros![accion.vertice]!;
      caballero.activo = false;
      caballero.turnoAccion = turno;
      estado.fase = { tipo: 'moverLadron', volverA: 'acciones' };
      return;
    }

    case 'construirMuralla': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!ciudadesParaMuralla(estado, j.id).includes(accion.vertice)) {
        fallar('La muralla debe ir en una de tus ciudades que aún no tenga');
      }
      if (datosCyC(j).murallas <= 0) {
        fallar('No te quedan murallas');
      }
      pagarABanca(ctx, j, COSTES_CYC.muralla);
      colocarMuralla(ctx, j, accion.vertice);
      return;
    }

    case 'mejorarCiudad': {
      exigirFase(ctx, 'acciones', 'construccionEspecial');
      const j = exigirConstructor(ctx, accion.jugador);
      if (!LINEAS_MEJORA.includes(accion.linea)) {
        fallar('Línea de mejora desconocida');
      }
      const datos = datosCyC(j);
      const nivel = datos.mejoras[accion.linea];
      if (nivel >= NIVEL_MAXIMO_MEJORA) {
        fallar(`Ya tienes el nivel máximo de ${NOMBRES_LINEA_MEJORA[accion.linea]}`);
      }
      if (!Object.values(estado.tablero.edificios).some((e) => e.jugador === j.id && e.tipo === 'ciudad')) {
        fallar('Necesitas al menos una ciudad para mejorarla');
      }
      const usaGrua = estado.turno.grua === true && estado.jugadores[estado.turno.jugadorActual]?.id === j.id;
      pagarMercancias(ctx, j, { [MERCANCIA_DE_LINEA[accion.linea]]: costeMejora(nivel, usaGrua) });
      if (usaGrua) {
        estado.turno.grua = false;
      }
      datos.mejoras[accion.linea] = nivel + 1;
      emitir(ctx, { tipo: 'ciudadMejorada', jugador: j.id, linea: accion.linea, nivel: nivel + 1 });
      comprobarMetropolis(ctx, j, accion.linea);
      return;
    }

    case 'jugarProgreso':
      jugarProgreso(ctx, accion);
      return;
  }
}

function jugarProgreso(ctx: Contexto, accion: Extract<AccionJuego, { tipo: 'jugarProgreso' }>): void {
  const { estado } = ctx;
  const j = exigirTurno(ctx, accion.jugador);
  exigirFase(ctx, ...(accion.carta === 'alquimista' ? (['tirarDados'] as const) : (['acciones'] as const)));
  const datos = datosCyC(j);
  const indice = datos.cartasProgreso.indexOf(accion.carta);
  if (indice === -1) {
    fallar('No tienes esa carta de progreso');
  }
  const opciones = opcionesProgreso(estado, j.id, accion.carta) ?? fallar('Ahora esa carta no tendría ningún efecto');
  const vertices = accion.vertices ?? [];
  const hexagonos = accion.hexagonos ?? [];
  // Validación genérica de los parámetros según lo que pide la carta.
  switch (opciones.necesita) {
    case 'dados':
      if (!accion.dados || accion.dados.length !== 2 || accion.dados.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) {
        fallar('Elige el valor de los dos dados (de 1 a 6)');
      }
      break;
    case 'recurso':
      if (!accion.recurso || !RECURSOS.includes(accion.recurso)) {
        fallar('Elige un recurso');
      }
      break;
    case 'mercancia':
      if (!accion.mercancia || !MERCANCIAS.includes(accion.mercancia)) {
        fallar('Elige una mercancía');
      }
      break;
    case 'recursoOMercancia':
      if (!(accion.recurso && RECURSOS.includes(accion.recurso)) && !(accion.mercancia && MERCANCIAS.includes(accion.mercancia))) {
        fallar('Elige un recurso o una mercancía');
      }
      break;
    case 'jugador':
      if (!accion.jugadorObjetivo || !opciones.opciones.includes(accion.jugadorObjetivo)) {
        fallar('Elige un jugador válido');
      }
      break;
    case 'vertices':
      if (
        vertices.length < opciones.minimo ||
        vertices.length > opciones.maximo ||
        new Set(vertices).size !== vertices.length ||
        vertices.some((v) => !opciones.opciones.includes(v))
      ) {
        fallar('Elige intersecciones válidas para la carta');
      }
      break;
    case 'hexagonos':
      if (
        hexagonos.length < opciones.minimo ||
        hexagonos.length > opciones.maximo ||
        new Set(hexagonos).size !== hexagonos.length ||
        hexagonos.some((h) => !opciones.opciones.includes(h))
      ) {
        fallar('Elige hexágonos válidos para la carta');
      }
      break;
    case 'arista':
      if (!accion.arista || !opciones.opciones.includes(accion.arista)) {
        fallar('Elige una carretera abierta');
      }
      break;
    case 'nada':
      break;
  }

  datos.cartasProgreso.splice(indice, 1);
  // La carta vuelve al fondo de su mazo.
  estado.cyc!.mazos[lineaDeCarta(accion.carta)].unshift(accion.carta);
  emitir(ctx, { tipo: 'cartaProgresoJugada', jugador: j.id, carta: accion.carta });
  const rivales = estado.jugadores.filter((x) => x.id !== j.id);

  switch (accion.carta) {
    case 'alquimista':
      estado.turno.alquimista = [accion.dados![0], accion.dados![1]];
      return;

    case 'inventor': {
      const [a, b] = hexagonos as [IdHexagono, IdHexagono];
      const nuevos = estado.tablero.hexagonos.map((h) => ({ ...h }));
      const ha = nuevos.find((h) => claveDe(h) === a)!;
      const hb = nuevos.find((h) => claveDe(h) === b)!;
      [ha.ficha, hb.ficha] = [hb.ficha ?? null, ha.ficha ?? null];
      // La forma del mapa es de solo lectura: se sustituye entera (el grafo se reconstruye solo).
      Object.assign(estado.tablero, { hexagonos: nuevos });
      emitir(ctx, { tipo: 'fichasIntercambiadas', jugador: j.id, hexagonos: [a, b] });
      return;
    }

    case 'ingeniero':
      colocarMuralla(ctx, j, vertices[0]!);
      return;

    case 'herreria':
      for (const v of vertices) {
        if (caballerosAscendibles(estado, j.id).includes(v)) {
          ascender(ctx, j, v);
        }
      }
      return;

    case 'carreteras':
      estado.fase = { tipo: 'construccionCarreteras', restantes: Math.min(2, j.piezas.carreteras + (j.piezas.barcos ?? 0)), volverA: 'acciones' };
      terminarConstruccionCarreterasSiProcede(ctx, j);
      return;

    case 'riego':
    case 'mineria': {
      const terreno = accion.carta === 'riego' ? 'trigo' : 'mineral';
      const grafo = grafoDe(estado);
      const hexagonosPropios = [...grafo.hexagonos.values()].filter(
        (h) => h.terreno === terreno && h.vertices.some((v) => estado.tablero.edificios[v]?.jugador === j.id),
      );
      const cantidad = Math.min(2 * hexagonosPropios.length, estado.banca[terreno]);
      if (cantidad > 0) {
        cobrarDeBanca(ctx, j, { [terreno]: cantidad });
        emitir(ctx, { tipo: 'abundancia', jugador: j.id, recursos: { [terreno]: cantidad } });
      }
      return;
    }

    case 'medicina': {
      const vertice = vertices[0]!;
      pagarABanca(ctx, j, COSTES_CYC.medicina);
      estado.tablero.edificios[vertice]!.tipo = 'ciudad';
      j.piezas.ciudades--;
      j.piezas.poblados++;
      emitir(ctx, { tipo: 'ciudadConstruida', jugador: j.id, vertice });
      return;
    }

    case 'grua':
      estado.turno.grua = true;
      return;

    case 'puertoComercial': {
      const recurso = accion.recurso!;
      for (const rival of rivales) {
        const suyas = rival.cyc?.mercancias;
        if (!suyas || totalMercancias(suyas) === 0 || j.recursos[recurso] === 0) {
          continue;
        }
        const mercancia = [...MERCANCIAS].sort((x, y) => suyas[y] - suyas[x])[0]!;
        j.recursos[recurso]--;
        rival.recursos[recurso]++;
        suyas[mercancia]--;
        datos.mercancias[mercancia]++;
        emitir(ctx, { tipo: 'cartasTomadas', jugador: j.id, de: rival.id, recursos: {}, mercancias: { [mercancia]: 1 } });
      }
      return;
    }

    case 'mercader': {
      estado.cyc!.mercader = { hexagono: hexagonos[0]!, jugador: j.id };
      emitir(ctx, { tipo: 'mercaderColocado', jugador: j.id, hexagono: hexagonos[0]! });
      return;
    }

    case 'flotaComercial':
      estado.turno.flota = accion.recurso ?? accion.mercancia ?? null;
      return;

    case 'monopolioRecursos': {
      const recurso = accion.recurso!;
      for (const rival of rivales) {
        const cantidad = Math.min(2, rival.recursos[recurso]);
        if (cantidad > 0) {
          rival.recursos[recurso] -= cantidad;
          j.recursos[recurso] += cantidad;
          emitir(ctx, { tipo: 'cartasTomadas', jugador: j.id, de: rival.id, recursos: { [recurso]: cantidad }, mercancias: {} });
        }
      }
      return;
    }

    case 'monopolioMercancias': {
      const mercancia = accion.mercancia!;
      for (const rival of rivales) {
        if ((rival.cyc?.mercancias[mercancia] ?? 0) > 0) {
          rival.cyc!.mercancias[mercancia]--;
          datos.mercancias[mercancia]++;
          emitir(ctx, { tipo: 'cartasTomadas', jugador: j.id, de: rival.id, recursos: {}, mercancias: { [mercancia]: 1 } });
        }
      }
      return;
    }

    case 'comercianteMaestro':
      tomarCartas(ctx, jugador(ctx, accion.jugadorObjetivo!), j, 2);
      return;

    case 'obispo': {
      const hexagono = hexagonos[0]!;
      estado.tablero.ladron = hexagono;
      emitir(ctx, { tipo: 'ladronMovido', jugador: j.id, hexagono });
      const afectados = new Set(
        grafoDe(estado)
          .hexagono(hexagono)
          .vertices.map((v) => estado.tablero.edificios[v]?.jugador)
          .filter((x): x is IdJugador => x !== undefined && x !== j.id),
      );
      for (const id of afectados) {
        tomarCartas(ctx, jugador(ctx, id), j, 1);
      }
      return;
    }

    case 'desertor': {
      const rival = jugador(ctx, accion.jugadorObjetivo!);
      const [vertice, caballero] = caballerosDe(estado, rival.id).sort(([, x], [, y]) => x.nivel - y.nivel)[0]!;
      delete estado.tablero.caballeros![vertice];
      datosCyC(rival).caballeros[caballero.nivel]++;
      emitir(ctx, { tipo: 'caballeroRetirado', jugador: rival.id, vertice });
      const destino = verticesValidosCaballero(estado, j.id)[0];
      if (destino && datos.caballeros[caballero.nivel] > 0) {
        estado.tablero.caballeros![destino] = {
          jugador: j.id,
          nivel: caballero.nivel,
          activo: false,
          turnoActivado: null,
          turnoAccion: null,
          turnoAscenso: null,
        };
        datos.caballeros[caballero.nivel]--;
        emitir(ctx, { tipo: 'caballeroConstruido', jugador: j.id, vertice: destino });
      }
      actualizarGranRuta(ctx);
      return;
    }

    case 'diplomatico': {
      const arista = accion.arista! as IdArista;
      const dueno = estado.tablero.carreteras[arista]!;
      delete estado.tablero.carreteras[arista];
      jugador(ctx, dueno).piezas.carreteras++;
      emitir(ctx, { tipo: 'carreteraRetirada', jugador: dueno, arista });
      actualizarGranRuta(ctx);
      return;
    }

    case 'intriga': {
      const vertice = vertices[0]!;
      const desplazado = recolocarDesplazado(ctx, vertice);
      emitir(ctx, { tipo: 'caballeroMovido', jugador: desplazado.jugador, desde: vertice, hasta: desplazado.a ?? vertice, desplazado });
      actualizarGranRuta(ctx);
      return;
    }

    case 'saboteador':
      for (const id of rivalesConMasPuntos(estado, j.id, true)) {
        const rival = jugador(ctx, id);
        descartarAlAzar(ctx, rival, Math.floor(cartasEnMano(rival) / 2));
      }
      return;

    case 'espia': {
      const rival = jugador(ctx, accion.jugadorObjetivo!);
      const suyas = datosCyC(rival).cartasProgreso;
      const carta = suyas.splice(ctx.rng.entero(suyas.length), 1)[0]!;
      datos.cartasProgreso.push(carta);
      emitir(ctx, { tipo: 'cartaProgresoPerdida', jugador: j.id, victima: rival.id, carta });
      return;
    }

    case 'senorDeLaGuerra':
      for (const [vertice, caballero] of caballerosDe(estado, j.id)) {
        if (!caballero.activo) {
          caballero.activo = true;
          caballero.turnoActivado = estado.turno.numero;
          emitir(ctx, { tipo: 'caballeroActivado', jugador: j.id, vertice });
        }
      }
      return;

    case 'boda':
      for (const id of rivalesConMasPuntos(estado, j.id)) {
        tomarCartas(ctx, jugador(ctx, id), j, 2);
      }
      return;

    case 'imprenta':
    case 'constitucion':
      // Se juegan solas al robarlas (opcionesProgreso devuelve null).
      return;
  }
}

function claveDe(h: { coordenadas: { q: number; r: number } }): IdHexagono {
  return idHexagono(CoordenadasCubicas.desdeAxiales(h.coordenadas.q, h.coordenadas.r));
}

/** Mazo (línea de mejoras) al que pertenece cada carta de progreso. */
function lineaDeCarta(carta: TipoCartaProgreso): LineaMejora {
  return LINEAS_MEJORA.find((l) => (CARTAS_PROGRESO[l] as readonly string[]).includes(carta))!;
}