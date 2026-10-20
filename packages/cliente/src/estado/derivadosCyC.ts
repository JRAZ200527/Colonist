/** Datos derivados de Ciudades y Caballeros para la interfaz (funciones puras). */

import {
  caballerosActivables,
  caballerosAscendibles,
  caballerosJuntoAlLadron,
  caballerosQuePuedenActuar,
  ciudadesParaMuralla,
  conCaballeros,
  costeMejora,
  COSTES_CYC,
  destinosCaballero,
  LINEAS_MEJORA,
  MERCANCIA_DE_LINEA,
  NIVEL_MAXIMO_MEJORA,
  opcionesProgreso,
  verticesValidosCaballero,
  type EstadoJuego,
  type IdJugador,
  type IdVertice,
  type LineaMejora,
  type OpcionesProgreso,
  type TipoCartaProgreso,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { esMiTurno, jugadorDe, puedoConstruir, puedoPagar } from './derivados';

/** Acciones de Ciudades y Caballeros que se eligen en el tablero. */
export type ModoCyC = 'caballero' | 'activarCaballero' | 'ascenderCaballero' | 'moverCaballero' | 'expulsarLadron' | 'muralla';

export function verticesModoCyC(vista: VistaPartida, yo: IdJugador, modo: ModoCyC, origen: IdVertice | null): IdVertice[] {
  switch (modo) {
    case 'caballero':
      return verticesValidosCaballero(vista, yo);
    case 'activarCaballero':
      return caballerosActivables(vista, yo);
    case 'ascenderCaballero':
      return caballerosAscendibles(vista, yo);
    case 'moverCaballero':
      return origen ? destinosCaballero(vista, yo, origen) : caballerosQuePuedenActuar(vista, yo);
    case 'expulsarLadron':
      return (vista.cyc?.ataques ?? 0) > 0 ? caballerosJuntoAlLadron(vista, yo) : [];
    case 'muralla':
      return ciudadesParaMuralla(vista, yo);
  }
}

export interface AccionesCyC {
  caballero: boolean;
  activarCaballero: boolean;
  ascenderCaballero: boolean;
  moverCaballero: boolean;
  expulsarLadron: boolean;
  muralla: boolean;
  /** Mejoras que se pueden pagar ahora. */
  mejoras: Record<LineaMejora, boolean>;
}

export function accionesCyC(vista: VistaPartida, yo: IdJugador | null): AccionesCyC | null {
  const propio = jugadorDe(vista, yo);
  if (!conCaballeros(vista) || !yo || !propio?.cyc) {
    return null;
  }
  const cyc = propio.cyc;
  const construye = puedoConstruir(vista, yo);
  const enAcciones = esMiTurno(vista, yo) && vista.fase.tipo === 'acciones';
  const tieneCiudad = Object.values(vista.tablero.edificios).some((e) => e.jugador === yo && e.tipo === 'ciudad');
  const mejoras = Object.fromEntries(
    LINEAS_MEJORA.map((linea) => {
      const nivel = cyc.mejoras[linea];
      const coste = costeMejora(nivel, vista.turno.grua === true && esMiTurno(vista, yo));
      return [linea, construye && tieneCiudad && nivel < NIVEL_MAXIMO_MEJORA && (cyc.mercancias?.[MERCANCIA_DE_LINEA[linea]] ?? 0) >= coste];
    }),
  ) as Record<LineaMejora, boolean>;
  const hay = (modo: ModoCyC) => verticesModoCyC(vista, yo, modo, null).length > 0;
  return {
    caballero: construye && cyc.caballeros[1] > 0 && puedoPagar(propio.recursos, COSTES_CYC.caballero) && hay('caballero'),
    activarCaballero: construye && puedoPagar(propio.recursos, COSTES_CYC.activarCaballero) && hay('activarCaballero'),
    ascenderCaballero: construye && puedoPagar(propio.recursos, COSTES_CYC.ascenderCaballero) && hay('ascenderCaballero'),
    moverCaballero: enAcciones && hay('moverCaballero'),
    expulsarLadron: enAcciones && hay('expulsarLadron'),
    muralla: construye && cyc.murallas > 0 && puedoPagar(propio.recursos, COSTES_CYC.muralla) && hay('muralla'),
    mejoras,
  };
}

/**
 * Opciones de una carta de progreso vistas desde el cliente. Las cartas que eligen
 * rival se resuelven con los datos públicos de la vista; las demás solo miran el
 * tablero y los datos propios, así que se calculan con la misma regla del motor.
 */
export function opcionesProgresoVista(vista: VistaPartida, yo: IdJugador, carta: TipoCartaProgreso): OpcionesProgreso | null {
  const rivales = vista.jugadores.filter((j) => j.id !== yo);
  const mios = jugadorDe(vista, yo)?.puntosVisibles ?? 0;
  switch (carta) {
    case 'comercianteMaestro': {
      const opciones = rivales
        .filter((r) => r.puntosVisibles > mios && r.totalRecursos + (r.cyc?.totalMercancias ?? 0) > 0)
        .map((r) => r.id);
      return opciones.length > 0 ? { necesita: 'jugador', opciones } : null;
    }
    case 'espia': {
      const opciones = rivales.filter((r) => (r.cyc?.totalCartasProgreso ?? 0) > 0).map((r) => r.id);
      return opciones.length > 0 ? { necesita: 'jugador', opciones } : null;
    }
    case 'desertor': {
      const conCaballeros = new Set(Object.values(vista.tablero.caballeros ?? {}).map((c) => c.jugador));
      const opciones = rivales.filter((r) => conCaballeros.has(r.id)).map((r) => r.id);
      return opciones.length > 0 ? { necesita: 'jugador', opciones } : null;
    }
    default:
      // El resto de cartas no consulta información oculta de los rivales.
      return opcionesProgreso(vista as unknown as EstadoJuego, yo, carta);
  }
}

export function cartasProgresoJugablesVista(vista: VistaPartida, yo: IdJugador | null): Set<TipoCartaProgreso> {
  const propio = jugadorDe(vista, yo);
  if (!yo || !propio?.cyc?.cartasProgreso || !esMiTurno(vista, yo)) {
    return new Set();
  }
  const fase = vista.fase.tipo;
  return new Set(
    propio.cyc.cartasProgreso.filter((c) =>
      c === 'alquimista' ? fase === 'tirarDados' : fase === 'acciones' && opcionesProgresoVista(vista, yo, c) !== null,
    ),
  );
}
