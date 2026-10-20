/** Datos derivados de la vista de la partida para la interfaz (funciones puras). */

import {
  aristasValidasBarco,
  aristasValidasBarcoInicial,
  aristasValidasCarretera,
  aristasValidasCarreteraInicial,
  barcosMovibles,
  conNavegantes,
  COSTES,
  destinosBarco,
  hexagonosValidosLadron,
  hexagonosValidosPirata,
  NOMBRES_FASE,
  RECURSOS,
  verticesValidosCiudad,
  verticesValidosPoblado,
  type IdArista,
  type OpcionesProgreso,
  type TipoCartaProgreso,
  type IdHexagono,
  type IdJugador,
  type IdVertice,
  type RecursosParciales,
  type TipoCartaDesarrollo,
  type VistaJugador,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { verticesModoCyC, type ModoCyC } from './derivadosCyC';

/** Lo que el jugador ha elegido construir con la barra de acciones. */
export type ModoConstruccion = 'ninguno' | 'carretera' | 'poblado' | 'ciudad' | 'barco' | 'moverBarco' | ModoCyC | 'progreso';

/** Carta de progreso que espera a que se elijan intersecciones, hexágonos o una carretera en el tablero. */
export interface ProgresoPendiente {
  carta: TipoCartaProgreso;
  opciones: Extract<OpcionesProgreso, { necesita: 'vertices' | 'hexagonos' | 'arista' }>;
  elegidos: string[];
}

/** Lo que se puede señalar en el tablero ahora mismo. */
export type ModoTablero = ModoConstruccion | 'ladron';

export interface Objetivos {
  modo: ModoTablero;
  vertices: ReadonlySet<IdVertice>;
  aristas: ReadonlySet<IdArista>;
  hexagonos: ReadonlySet<IdHexagono>;
}

const VACIO = new Set<string>();

export function jugadorDe(vista: VistaPartida, id: IdJugador | null | undefined): VistaJugador | undefined {
  return vista.jugadores.find((j) => j.id === id);
}

export function jugadorEnTurno(vista: VistaPartida): VistaJugador {
  return vista.jugadores[vista.turno.jugadorActual]!;
}

export function esMiTurno(vista: VistaPartida, yo: IdJugador | null | undefined): boolean {
  return yo !== null && yo !== undefined && jugadorEnTurno(vista).id === yo;
}

/** ¿Puedo construir ahora? En mi fase de acciones o en mi turno de la fase especial (5–6 jugadores). */
export function puedoConstruir(vista: VistaPartida, yo: IdJugador | null | undefined): boolean {
  const fase = vista.fase;
  if (fase.tipo === 'construccionEspecial') {
    return yo != null && fase.pendientes[0] === yo;
  }
  return fase.tipo === 'acciones' && esMiTurno(vista, yo);
}

export function puedoPagar(recursos: RecursosParciales | null | undefined, coste: RecursosParciales): boolean {
  return recursos != null && RECURSOS.every((r) => (recursos[r] ?? 0) >= (coste[r] ?? 0));
}

/** El modo del tablero lo impone la fase si hace falta (colocación, ladrón...); si no, lo elige el jugador. */
export function modoEfectivo(vista: VistaPartida, yo: IdJugador | null, elegido: ModoConstruccion): ModoTablero {
  const fase = vista.fase;
  if (fase.tipo === 'construccionEspecial') {
    const soloEnTurno: ModoConstruccion[] = ['moverBarco', 'moverCaballero', 'expulsarLadron', 'progreso'];
    return puedoConstruir(vista, yo) && !soloEnTurno.includes(elegido) ? elegido : 'ninguno';
  }
  if (!esMiTurno(vista, yo)) {
    return 'ninguno';
  }
  switch (fase.tipo) {
    case 'colocacionInicial':
      return fase.paso;
    case 'moverLadron':
      return 'ladron';
    case 'construccionCarreteras':
      return 'carretera';
    case 'acciones':
      return elegido;
    default:
      return 'ninguno';
  }
}

export function calcularObjetivos(
  vista: VistaPartida,
  yo: IdJugador | null,
  modo: ModoTablero,
  seleccion: string | null = null,
  progreso: ProgresoPendiente | null = null,
): Objetivos {
  const barcoSeleccionado = seleccion;
  const vacio = { modo, vertices: VACIO, aristas: VACIO, hexagonos: VACIO };
  if (!yo || modo === 'ninguno') {
    return vacio;
  }
  const fase = vista.fase;
  switch (modo) {
    case 'poblado':
      return { ...vacio, vertices: new Set(verticesValidosPoblado(vista, yo, fase.tipo === 'colocacionInicial')) };
    case 'carretera':
      if (fase.tipo === 'colocacionInicial' && fase.ultimoPoblado) {
        // Con Navegantes, la pieza inicial también puede ser un barco.
        return {
          ...vacio,
          aristas: new Set([
            ...aristasValidasCarreteraInicial(vista, fase.ultimoPoblado),
            ...aristasValidasBarcoInicial(vista, fase.ultimoPoblado),
          ]),
        };
      }
      if (fase.tipo === 'construccionCarreteras') {
        return { ...vacio, aristas: new Set([...aristasValidasCarretera(vista, yo), ...aristasValidasBarco(vista, yo)]) };
      }
      return { ...vacio, aristas: new Set(aristasValidasCarretera(vista, yo)) };
    case 'barco':
      return { ...vacio, aristas: new Set(aristasValidasBarco(vista, yo)) };
    case 'moverBarco':
      return {
        ...vacio,
        aristas: new Set(barcoSeleccionado ? destinosBarco(vista, yo, barcoSeleccionado) : barcosMovibles(vista, yo)),
      };
    case 'ciudad':
      return { ...vacio, vertices: new Set(verticesValidosCiudad(vista, yo)) };
    case 'ladron':
      return { ...vacio, hexagonos: new Set([...hexagonosValidosLadron(vista), ...hexagonosValidosPirata(vista)]) };
    case 'progreso': {
      if (!progreso) {
        return vacio;
      }
      const restantes = new Set(progreso.opciones.opciones.filter((x) => !progreso.elegidos.includes(x)));
      if (progreso.opciones.necesita === 'vertices') {
        return { ...vacio, vertices: restantes };
      }
      return progreso.opciones.necesita === 'hexagonos' ? { ...vacio, hexagonos: restantes } : { ...vacio, aristas: restantes };
    }
    default:
      return { ...vacio, vertices: new Set(verticesModoCyC(vista, yo, modo, seleccion)) };
  }
}

/** Cartas de desarrollo que se pueden jugar ahora (igual que la regla del motor, con la vista). */
export function cartasJugables(vista: VistaPartida, yo: IdJugador | null): Set<TipoCartaDesarrollo> {
  const propio = jugadorDe(vista, yo);
  const fase = vista.fase.tipo;
  if (!propio?.cartasDesarrollo || !esMiTurno(vista, yo) || vista.turno.haJugadoCartaDesarrollo) {
    return new Set();
  }
  if (fase !== 'tirarDados' && fase !== 'acciones') {
    return new Set();
  }
  return new Set(
    propio.cartasDesarrollo
      .filter((c) => c.tipo !== 'puntoVictoria' && c.turnoCompra < vista.turno.numero)
      .map((c) => c.tipo),
  );
}

export interface AccionesDisponibles {
  tirarDados: boolean;
  carretera: boolean;
  poblado: boolean;
  ciudad: boolean;
  cartaDesarrollo: boolean;
  barco: boolean;
  moverBarco: boolean;
  comerciar: boolean;
  finalizarTurno: boolean;
  /** 5–6 jugadores: terminar mi turno de construcción especial. */
  pasarConstruccion: boolean;
}

export function accionesDisponibles(vista: VistaPartida, yo: IdJugador | null): AccionesDisponibles {
  const propio = jugadorDe(vista, yo);
  const enAcciones = esMiTurno(vista, yo) && vista.fase.tipo === 'acciones';
  const construye = puedoConstruir(vista, yo);
  const recursos = propio?.recursos;
  return {
    tirarDados: esMiTurno(vista, yo) && vista.fase.tipo === 'tirarDados',
    carretera: construye && !!propio && propio.piezas.carreteras > 0 && puedoPagar(recursos, COSTES.carretera),
    poblado: construye && !!propio && propio.piezas.poblados > 0 && puedoPagar(recursos, COSTES.poblado),
    ciudad: construye && !!propio && propio.piezas.ciudades > 0 && puedoPagar(recursos, COSTES.ciudad),
    cartaDesarrollo: construye && vista.cartasEnMazo > 0 && puedoPagar(recursos, COSTES.cartaDesarrollo),
    barco: construye && conNavegantes(vista) && (propio?.piezas.barcos ?? 0) > 0 && puedoPagar(recursos, COSTES.barco),
    moverBarco: enAcciones && !!yo && conNavegantes(vista) && barcosMovibles(vista, yo).length > 0,
    comerciar: enAcciones,
    finalizarTurno: enAcciones,
    pasarConstruccion: construye && vista.fase.tipo === 'construccionEspecial',
  };
}

/** Texto que explica qué hay que hacer ahora. */
export function instruccion(vista: VistaPartida, yo: IdJugador | null): string {
  const fase = vista.fase;
  const enTurno = jugadorEnTurno(vista);
  const mio = esMiTurno(vista, yo);
  switch (fase.tipo) {
    case 'finalizada':
      return `${jugadorDe(vista, fase.ganador)?.nombre ?? 'Alguien'} ha ganado la partida`;
    case 'descartar': {
      const debo = yo ? fase.pendientes[yo] : undefined;
      if (debo !== undefined) {
        return `Ha salido un 7: descarta ${debo} cartas`;
      }
      return 'Ha salido un 7: esperando a que los demás descarten…';
    }
    case 'colocacionInicial':
      if (!mio) {
        return `${enTurno.nombre} está colocando su ${fase.paso === 'poblado' ? 'poblado' : 'carretera'}…`;
      }
      return fase.paso === 'poblado' ? 'Coloca un poblado en una intersección libre' : 'Coloca una carretera junto a tu poblado';
    case 'tirarDados':
      return mio ? 'Tira los dados (Espacio)' : `Esperando a que ${enTurno.nombre} tire los dados…`;
    case 'moverLadron':
      if (!mio) {
        return `${enTurno.nombre} está moviendo el ladrón…`;
      }
      return conNavegantes(vista) ? 'Mueve el ladrón (a tierra) o el barco pirata (al mar)' : 'Mueve el ladrón a otro hexágono';
    case 'robar':
      return mio ? 'Elige a quién robar una carta' : `${enTurno.nombre} está eligiendo a quién robar…`;
    case 'construccionCarreteras':
      return mio
        ? `Construcción de Carreteras: coloca ${fase.restantes} carretera${fase.restantes === 1 ? '' : 's'} gratis`
        : `${enTurno.nombre} está construyendo carreteras…`;
    case 'acciones':
      return mio ? 'Comercia, construye o termina tu turno' : `Turno de ${enTurno.nombre} (${NOMBRES_FASE[fase.tipo]})`;
    case 'construccionEspecial': {
      const constructor = jugadorDe(vista, fase.pendientes[0]);
      return constructor?.id === yo
        ? 'Construcción especial: puedes construir o pasar (Espacio)'
        : `Construcción especial de ${constructor?.nombre ?? '…'}`;
    }
    case 'elegirOro': {
      const debo = yo ? fase.pendientes[yo] : undefined;
      return debo !== undefined ? `Oro: elige ${debo} recurso${debo === 1 ? '' : 's'}` : 'Esperando a que se elijan los recursos del oro…';
    }
  }
}
