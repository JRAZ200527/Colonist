/**
 * Jugador automático sencillo para jugar partidas completas en las pruebas.
 * En cada paso se comprueban invariantes que cualquier partida debe cumplir.
 */

import { expect } from 'vitest';
import {
  aplicarAccion,
  aristasValidasBarco,
  aristasValidasCarretera,
  barcosMovibles,
  conNavegantes,
  destinosBarco,
  hexagonosValidosPirata,
  aristasValidasCarreteraInicial,
  cartasJugables,
  COSTES,
  GeneradorAleatorio,
  hexagonosValidosLadron,
  jugadorEnTurno,
  listaDeCartas,
  BARCOS_POR_JUGADOR,
  PIEZAS_POR_JUGADOR,
  RECURSOS,
  tasasComercio,
  tieneRecursos,
  verticesValidosCiudad,
  verticesValidosPoblado,
  CABALLEROS_POR_NIVEL,
  caballerosActivables,
  caballerosAscendibles,
  caballerosJuntoAlLadron,
  caballerosQuePuedenActuar,
  cartasProgresoJugables,
  ciudadesParaMuralla,
  costeMejora,
  COSTES_CYC,
  destinosCaballero,
  LIMITE_CARTAS_PROGRESO,
  LINEAS_MEJORA,
  MERCANCIA_DE_LINEA,
  MERCANCIAS,
  MERCANCIAS_EN_BANCA,
  MURALLAS_POR_JUGADOR,
  opcionesProgreso,
  tasasCyC,
  verticesValidosCaballero,
  type AccionJuego,
  type ConfiguracionPartida,
  type Mercancia,
  type MercanciasParciales,
  type OpcionesProgreso,
  type Recurso,
  type EstadoJuego,
  type EventoJuego,
  type MapaJuego,
  type RecursosParciales,
} from '../src/index.js';
import { nuevaPartida } from './ayudantes.js';

const MAX_ACCIONES = 20_000;

/** Intenta conseguir con la banca lo que falta para `objetivo` usando los recursos sobrantes. */
function comercioHacia(estado: EstadoJuego, objetivo: RecursosParciales): AccionJuego | null {
  const jugador = jugadorEnTurno(estado);
  const mano = jugador.recursos;
  const falta = RECURSOS.find((r) => mano[r] < (objetivo[r] ?? 0) && estado.banca[r] > 0);
  if (!falta) {
    return null;
  }
  const tasas = estado.cyc ? tasasCyC(estado, jugador.id).recursos : tasasComercio(estado, jugador.id);
  const sobrante = RECURSOS.find((r) => r !== falta && mano[r] - (objetivo[r] ?? 0) >= tasas[r]);
  if (!sobrante) {
    return null;
  }
  return {
    tipo: 'comerciarConBanca',
    jugador: jugador.id,
    entrega: { [sobrante]: tasas[sobrante] },
    recibe: { [falta]: 1 },
  };
}

/** Parámetros al azar para una carta de progreso, según lo que pide. */
function parametrosAleatorios(opciones: OpcionesProgreso, rng: GeneradorAleatorio): Record<string, unknown> {
  switch (opciones.necesita) {
    case 'nada':
      return {};
    case 'dados':
      return { dados: [rng.entero(6) + 1, rng.entero(6) + 1] };
    case 'recurso':
    case 'recursoOMercancia':
      return { recurso: rng.elegir(RECURSOS) };
    case 'mercancia':
      return { mercancia: rng.elegir(MERCANCIAS) };
    case 'jugador':
      return { jugadorObjetivo: rng.elegir(opciones.opciones) };
    case 'vertices':
      return { vertices: rng.barajar(opciones.opciones).slice(0, opciones.minimo + rng.entero(opciones.maximo - opciones.minimo + 1)) };
    case 'hexagonos':
      return { hexagonos: rng.barajar(opciones.opciones).slice(0, opciones.minimo + rng.entero(opciones.maximo - opciones.minimo + 1)) };
    case 'arista':
      return { arista: rng.elegir(opciones.opciones) };
  }
}

/** Jugadas propias de Ciudades y Caballeros para el jugador en turno (o null). */
function accionCyC(estado: EstadoJuego, rng: GeneradorAleatorio): AccionJuego | null {
  const actual = jugadorEnTurno(estado);
  const datos = actual.cyc;
  if (!estado.cyc || !datos) {
    return null;
  }
  const id = actual.id;
  const mano = actual.recursos;

  const jugables = cartasProgresoJugables(estado, id).filter(
    (c) => c !== 'alquimista' && (c !== 'medicina' || tieneRecursos(mano, COSTES_CYC.medicina)),
  );
  if (jugables.length > 0 && rng.siguiente() < 0.5) {
    const carta = rng.elegir(jugables);
    return { tipo: 'jugarProgreso', jugador: id, carta, ...parametrosAleatorios(opcionesProgreso(estado, id, carta)!, rng) } as AccionJuego;
  }
  const tieneCiudad = Object.values(estado.tablero.edificios).some((e) => e.jugador === id && e.tipo === 'ciudad');
  for (const linea of rng.barajar(LINEAS_MEJORA)) {
    const nivel = datos.mejoras[linea];
    if (tieneCiudad && nivel < 5 && datos.mercancias[MERCANCIA_DE_LINEA[linea]] >= costeMejora(nivel, estado.turno.grua === true)) {
      return { tipo: 'mejorarCiudad', jugador: id, linea };
    }
  }
  const activables = caballerosActivables(estado, id);
  if (activables.length > 0 && tieneRecursos(mano, COSTES_CYC.activarCaballero) && rng.siguiente() < 0.6) {
    return { tipo: 'activarCaballero', jugador: id, vertice: rng.elegir(activables) };
  }
  const ascendibles = caballerosAscendibles(estado, id);
  if (ascendibles.length > 0 && tieneRecursos(mano, COSTES_CYC.ascenderCaballero) && rng.siguiente() < 0.3) {
    return { tipo: 'ascenderCaballero', jugador: id, vertice: rng.elegir(ascendibles) };
  }
  const huecos = verticesValidosCaballero(estado, id);
  if (huecos.length > 0 && datos.caballeros[1] > 0 && tieneRecursos(mano, COSTES_CYC.caballero) && rng.siguiente() < 0.5) {
    return { tipo: 'construirCaballero', jugador: id, vertice: rng.elegir(huecos) };
  }
  const ciudades = ciudadesParaMuralla(estado, id);
  if (ciudades.length > 0 && datos.murallas > 0 && tieneRecursos(mano, COSTES_CYC.muralla) && rng.siguiente() < 0.3) {
    return { tipo: 'construirMuralla', jugador: id, vertice: rng.elegir(ciudades) };
  }
  const expulsores = estado.cyc.ataques > 0 ? caballerosJuntoAlLadron(estado, id) : [];
  if (expulsores.length > 0 && rng.siguiente() < 0.3) {
    return { tipo: 'expulsarLadron', jugador: id, vertice: rng.elegir(expulsores) };
  }
  const moviles = caballerosQuePuedenActuar(estado, id);
  if (moviles.length > 0 && rng.siguiente() < 0.15) {
    const desde = rng.elegir(moviles);
    const destinos = destinosCaballero(estado, id, desde);
    if (destinos.length > 0) {
      return { tipo: 'moverCaballero', jugador: id, desde, hasta: rng.elegir(destinos) };
    }
  }
  return null;
}

export function elegirAccion(estado: EstadoJuego, rng: GeneradorAleatorio, comerciosEsteTurno: number): AccionJuego {
  const fase = estado.fase;
  const actual = jugadorEnTurno(estado);
  const id = actual.id;

  switch (fase.tipo) {
    case 'colocacionInicial':
      return fase.paso === 'poblado'
        ? { tipo: 'colocarPobladoInicial', jugador: id, vertice: rng.elegir(verticesValidosPoblado(estado, id, true)) }
        : {
            tipo: 'colocarCarreteraInicial',
            jugador: id,
            arista: rng.elegir(aristasValidasCarreteraInicial(estado, fase.ultimoPoblado!)),
          };

    case 'tirarDados':
      if (cartasJugables(estado, id).includes('caballero') && rng.siguiente() < 0.5) {
        return { tipo: 'jugarCaballero', jugador: id };
      }
      if (cartasProgresoJugables(estado, id).includes('alquimista') && rng.siguiente() < 0.5) {
        return { tipo: 'jugarProgreso', jugador: id, carta: 'alquimista', dados: [rng.entero(6) + 1, rng.entero(6) + 1] };
      }
      return { tipo: 'tirarDados', jugador: id };

    case 'descartar': {
      const [quien, cantidad] = Object.entries(fase.pendientes)[0]!;
      const jugador = estado.jugadores.find((j) => j.id === quien)!;
      const cartas = rng
        .barajar<string>([
          ...listaDeCartas(jugador.recursos),
          ...MERCANCIAS.flatMap((m) => Array<string>(jugador.cyc?.mercancias[m] ?? 0).fill(m)),
        ])
        .slice(0, cantidad);
      const recursos: RecursosParciales = {};
      const mercancias: MercanciasParciales = {};
      for (const c of cartas) {
        if ((MERCANCIAS as readonly string[]).includes(c)) {
          mercancias[c as Mercancia] = (mercancias[c as Mercancia] ?? 0) + 1;
        } else {
          recursos[c as Recurso] = (recursos[c as Recurso] ?? 0) + 1;
        }
      }
      return { tipo: 'descartar', jugador: quien, recursos, mercancias };
    }

    case 'construccionEspecial': {
      const constructor = estado.jugadores.find((j) => j.id === fase.pendientes[0])!;
      const poblados = verticesValidosPoblado(estado, constructor.id);
      if (poblados.length > 0 && constructor.piezas.poblados > 0 && tieneRecursos(constructor.recursos, COSTES.poblado)) {
        return { tipo: 'construirPoblado', jugador: constructor.id, vertice: rng.elegir(poblados) };
      }
      const ciudades = verticesValidosCiudad(estado, constructor.id);
      if (ciudades.length > 0 && constructor.piezas.ciudades > 0 && tieneRecursos(constructor.recursos, COSTES.ciudad)) {
        return { tipo: 'construirCiudad', jugador: constructor.id, vertice: rng.elegir(ciudades) };
      }
      return { tipo: 'terminarConstruccionEspecial', jugador: constructor.id };
    }

    case 'elegirOro': {
      const [quien, cantidad] = Object.entries(fase.pendientes)[0]!;
      const disponibles = RECURSOS.filter((r) => estado.banca[r] > 0);
      const recursos: RecursosParciales = {};
      for (let i = 0; i < cantidad; i++) {
        const quedan = disponibles.filter((x) => (recursos[x] ?? 0) < estado.banca[x]);
        if (quedan.length === 0) {
          break;
        }
        const r = rng.elegir(quedan);
        recursos[r] = (recursos[r] ?? 0) + 1;
      }
      return { tipo: 'elegirOro', jugador: quien, recursos };
    }

    case 'moverLadron':
      if (conNavegantes(estado) && rng.siguiente() < 0.3) {
        return { tipo: 'moverPirata', jugador: id, hexagono: rng.elegir(hexagonosValidosPirata(estado)) };
      }
      return { tipo: 'moverLadron', jugador: id, hexagono: rng.elegir(hexagonosValidosLadron(estado)) };

    case 'robar':
      return { tipo: 'robar', jugador: id, victima: rng.elegir(fase.victimas) };

    case 'construccionCarreteras': {
      const carreteras = actual.piezas.carreteras > 0 ? aristasValidasCarretera(estado, id) : [];
      if (carreteras.length > 0) {
        return { tipo: 'construirCarretera', jugador: id, arista: rng.elegir(carreteras) };
      }
      return { tipo: 'construirBarco', jugador: id, arista: rng.elegir(aristasValidasBarco(estado, id)) };
    }

    case 'acciones': {
      const jugadaCyC = accionCyC(estado, rng);
      if (jugadaCyC) {
        return jugadaCyC;
      }
      const mano = actual.recursos;
      const jugables = cartasJugables(estado, id);
      if (jugables.length > 0 && rng.siguiente() < 0.5) {
        const carta = rng.elegir(jugables);
        switch (carta) {
          case 'caballero':
            return { tipo: 'jugarCaballero', jugador: id };
          case 'monopolio':
            return { tipo: 'jugarMonopolio', jugador: id, recurso: rng.elegir(RECURSOS) };
          case 'abundancia': {
            const disponibles = RECURSOS.filter((r) => estado.banca[r] >= 2);
            if (disponibles.length > 0) {
              const r = rng.elegir(disponibles);
              return { tipo: 'jugarAbundancia', jugador: id, recursos: [r, r] };
            }
            break;
          }
          case 'construccionCarreteras':
            if (actual.piezas.carreteras > 0 && aristasValidasCarretera(estado, id).length > 0) {
              return { tipo: 'jugarConstruccionCarreteras', jugador: id };
            }
            break;
        }
      }

      const ciudades = verticesValidosCiudad(estado, id);
      if (ciudades.length > 0 && actual.piezas.ciudades > 0 && tieneRecursos(mano, COSTES.ciudad)) {
        return { tipo: 'construirCiudad', jugador: id, vertice: rng.elegir(ciudades) };
      }
      const poblados = verticesValidosPoblado(estado, id);
      if (poblados.length > 0 && actual.piezas.poblados > 0 && tieneRecursos(mano, COSTES.poblado)) {
        return { tipo: 'construirPoblado', jugador: id, vertice: rng.elegir(poblados) };
      }
      const carreteras = aristasValidasCarretera(estado, id);
      if (
        carreteras.length > 0 &&
        actual.piezas.carreteras > 0 &&
        tieneRecursos(mano, COSTES.carretera) &&
        (poblados.length === 0 || rng.siguiente() < 0.3)
      ) {
        return { tipo: 'construirCarretera', jugador: id, arista: rng.elegir(carreteras) };
      }
      if (conNavegantes(estado) && poblados.length === 0 && (actual.piezas.barcos ?? 0) > 0) {
        const movibles = barcosMovibles(estado, id);
        if (movibles.length > 0 && rng.siguiente() < 0.2) {
          const desde = rng.elegir(movibles);
          const destinos = destinosBarco(estado, id, desde);
          if (destinos.length > 0) {
            return { tipo: 'moverBarco', jugador: id, desde, hasta: rng.elegir(destinos) };
          }
        }
        const barcos = aristasValidasBarco(estado, id);
        if (barcos.length > 0 && tieneRecursos(mano, COSTES.barco) && rng.siguiente() < 0.7) {
          return { tipo: 'construirBarco', jugador: id, arista: rng.elegir(barcos) };
        }
      }
      if (estado.mazoDesarrollo.length > 0 && tieneRecursos(mano, COSTES.cartaDesarrollo)) {
        return { tipo: 'comprarCartaDesarrollo', jugador: id };
      }

      if (comerciosEsteTurno < 4) {
        const objetivo: RecursosParciales =
          ciudades.length > 0 && actual.piezas.ciudades > 0
            ? COSTES.ciudad
            : poblados.length > 0
              ? COSTES.poblado
              : carreteras.length > 0 && actual.piezas.carreteras > 0
                ? COSTES.carretera
                : COSTES.cartaDesarrollo;
        const comercio = comercioHacia(estado, objetivo);
        if (comercio) {
          return comercio;
        }
      }
      return { tipo: 'finalizarTurno', jugador: id };
    }

    case 'finalizada':
      throw new Error('La partida ya terminó');
  }
  return { tipo: 'finalizarTurno', jugador: id };
}

export function comprobarInvariantes(estado: EstadoJuego): void {
  // Ninguna carta de recurso aparece ni desaparece: 19 de cada tipo entre la banca y las manos.
  for (const r of RECURSOS) {
    const enManos = estado.jugadores.reduce((suma, j) => suma + j.recursos[r], 0);
    expect(estado.banca[r] + enManos, `recurso ${r}`).toBe(19);
    expect(estado.banca[r]).toBeGreaterThanOrEqual(0);
  }
  for (const j of estado.jugadores) {
    const edificios = Object.values(estado.tablero.edificios).filter((e) => e.jugador === j.id);
    const poblados = edificios.filter((e) => e.tipo === 'poblado').length;
    const ciudades = edificios.filter((e) => e.tipo === 'ciudad').length;
    const carreteras = Object.values(estado.tablero.carreteras).filter((c) => c === j.id).length;
    expect(poblados + j.piezas.poblados).toBe(PIEZAS_POR_JUGADOR.poblados);
    expect(ciudades + j.piezas.ciudades).toBe(PIEZAS_POR_JUGADOR.ciudades);
    expect(carreteras + j.piezas.carreteras).toBe(PIEZAS_POR_JUGADOR.carreteras);
    if (estado.tablero.barcos) {
      const barcos = Object.values(estado.tablero.barcos).filter((b) => b === j.id).length;
      expect(barcos + (j.piezas.barcos ?? 0)).toBe(BARCOS_POR_JUGADOR);
      // Ninguna arista tiene a la vez carretera y barco.
      for (const arista of Object.keys(estado.tablero.barcos)) {
        expect(estado.tablero.carreteras[arista]).toBeUndefined();
      }
    }
    for (const r of RECURSOS) {
      expect(j.recursos[r]).toBeGreaterThanOrEqual(0);
    }
  }
  if (estado.cyc) {
    for (const m of MERCANCIAS) {
      const enManos = estado.jugadores.reduce((suma, j) => suma + (j.cyc?.mercancias[m] ?? 0), 0);
      expect(estado.cyc.bancaMercancias[m] + enManos, `mercancía ${m}`).toBe(MERCANCIAS_EN_BANCA);
    }
    const enMazos = LINEAS_MEJORA.reduce((s, l) => s + estado.cyc!.mazos[l].length, 0);
    const enManos = estado.jugadores.reduce((s, j) => s + j.cyc!.cartasProgreso.length + j.cyc!.puntosProgreso, 0);
    expect(enMazos + enManos, 'cartas de progreso').toBe(54);
    for (const j of estado.jugadores) {
      expect(j.cyc!.cartasProgreso.length).toBeLessThanOrEqual(LIMITE_CARTAS_PROGRESO + 1);
      for (const nivel of [1, 2, 3] as const) {
        const enTablero = Object.values(estado.tablero.caballeros!).filter((c) => c.jugador === j.id && c.nivel === nivel).length;
        expect(enTablero + j.cyc!.caballeros[nivel], `caballeros de nivel ${nivel}`).toBe(CABALLEROS_POR_NIVEL);
      }
      const murallas = Object.values(estado.tablero.murallas!).filter((x) => x === j.id).length;
      expect(murallas + j.cyc!.murallas).toBe(MURALLAS_POR_JUGADOR);
    }
    for (const [vertice, jugadorMuralla] of Object.entries(estado.tablero.murallas!)) {
      expect(estado.tablero.edificios[vertice]).toEqual({ tipo: 'ciudad', jugador: jugadorMuralla });
    }
    expect(estado.cyc.barbaros).toBeLessThan(7);
  }
  const cartasEnManos = estado.jugadores.reduce((suma, j) => suma + j.cartasDesarrollo.length, 0);
  const caballeros = estado.jugadores.reduce((suma, j) => suma + j.caballerosJugados, 0);
  expect(estado.mazoDesarrollo.length + cartasEnManos + caballeros).toBeLessThanOrEqual(25);
}

export function jugarPartida(
  numeroJugadores: number,
  semilla: number,
  opciones: { mapa?: MapaJuego; configuracion?: Partial<ConfiguracionPartida> } = {},
) {
  const rng = new GeneradorAleatorio(semilla * 7919);
  let estado = nuevaPartida(numeroJugadores, semilla, opciones.configuracion, opciones.mapa);
  const eventos: EventoJuego[] = [];
  let acciones = 0;
  let comercios = 0;
  let turno = estado.turno.numero;

  while (estado.fase.tipo !== 'finalizada') {
    if (acciones++ > MAX_ACCIONES) {
      throw new Error(`La partida con semilla ${semilla} no terminó en ${MAX_ACCIONES} acciones`);
    }
    if (estado.turno.numero !== turno) {
      turno = estado.turno.numero;
      comercios = 0;
    }
    const accion = elegirAccion(estado, rng, comercios);
    if (accion.tipo === 'comerciarConBanca') {
      comercios++;
    }
    const resultado = aplicarAccion(estado, accion);
    if (!resultado.ok) {
      throw new Error(`Acción legal rechazada (${accion.tipo}): ${resultado.error}`);
    }
    estado = resultado.estado;
    eventos.push(...resultado.eventos);
    comprobarInvariantes(estado);
  }
  return { estado, eventos, acciones };
}

