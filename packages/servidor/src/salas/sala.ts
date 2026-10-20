/**
 * Una sala: vestíbulo (asientos, configuración, bots) y, una vez iniciada, la
 * partida autoritativa. El servidor es la única fuente de verdad: cada acción se
 * valida con el motor compartido y cada jugador recibe solo su vista.
 */

import { randomBytes } from 'node:crypto';
import { decidirAccionBot, jugadoresQueDebenActuar, type OpcionesMontecarlo } from '@colonist/bots';
import {
  aplicarAccion,
  crearPartida,
  eventoParaJugador,
  GeneradorAleatorio,
  generarMapa,
  jugadorEnTurno,
  NOMBRES_NIVEL_BOT,
  PLANTILLAS,
  PUNTOS_VICTORIA_CYC,
  puntosDeVictoria,
  vistaParaJugador,
  type AccionCliente,
  type AccionJuego,
  type AsientoSala,
  type ConfiguracionSala,
  type EstadoJuego,
  type EstadoSala,
  type EventoJuego,
  type IdJugador,
  type MensajeServidor,
  type NivelBot,
  type ResumenSala,
  type VistaSala,
} from '@colonist/motor-compartido';
import type { Repositorio } from '../persistencia/repositorio.js';

export interface DependenciasSala {
  enviar(idJugador: IdJugador, mensaje: MensajeServidor): void;
  repositorio: Repositorio;
  /** Pausa antes de cada jugada de un bot (para que se pueda seguir la partida). */
  retardoBotsMs: number;
  /** Tiempo que se guarda el asiento de un jugador desconectado antes de sustituirlo por un bot. */
  graciaReconexionMs: number;
  montecarlo?: Partial<OpcionesMontecarlo>;
  registrarError(mensaje: string, error?: unknown): void;
  alCerrar(sala: Sala): void;
}

export const CONFIGURACION_SALA_POR_DEFECTO: Readonly<ConfiguracionSala> = {
  plantilla: 'clasico',
  modoMapa: 'equilibrado',
  modoDados: 'aleatorio',
  puntosVictoria: 10,
  maxJugadores: 4,
  privada: false,
  ciudadesYCaballeros: false,
};

const NOMBRES_BOTS = ['Alfonso', 'Berta', 'Cristóbal', 'Dolores', 'Esteban', 'Fermina'];

interface Asiento extends AsientoSala {
  temporizador: ReturnType<typeof setTimeout> | null;
}

export class Sala {
  readonly id = randomBytes(4).toString('hex');
  readonly nombre: string;
  anfitrion: IdJugador;
  configuracion: ConfiguracionSala;
  estado: EstadoSala = 'esperando';
  private asientos: Asiento[] = [];
  private juego: EstadoJuego | null = null;
  private registro: EventoJuego[] = [];
  private temporizadorBots: ReturnType<typeof setTimeout> | null = null;
  private cerrada = false;
  private readonly deps: DependenciasSala;

  constructor(
    nombre: string,
    anfitrion: { idJugador: IdJugador; nombre: string },
    configuracion: Partial<ConfiguracionSala>,
    deps: DependenciasSala,
  ) {
    this.nombre = nombre;
    this.anfitrion = anfitrion.idJugador;
    this.deps = deps;
    this.configuracion = { ...CONFIGURACION_SALA_POR_DEFECTO };
    this.aplicarConfiguracion(configuracion);
    this.asientos.push(this.asientoHumano(anfitrion.idJugador, anfitrion.nombre));
  }

  /** Estado de la partida (solo para pruebas y diagnóstico). */
  get partida(): EstadoJuego | null {
    return this.juego;
  }

  vista(): VistaSala {
    return {
      id: this.id,
      nombre: this.nombre,
      anfitrion: this.anfitrion,
      configuracion: { ...this.configuracion },
      estado: this.estado,
      asientos: this.asientos.map(({ temporizador: _t, ...a }) => ({ ...a })),
    };
  }

  resumen(): ResumenSala {
    return {
      id: this.id,
      nombre: this.nombre,
      plantilla: this.configuracion.plantilla,
      jugadores: this.asientos.length,
      maxJugadores: this.configuracion.maxJugadores,
      estado: this.estado,
    };
  }

  tieneJugador(id: IdJugador): boolean {
    return this.asientos.some((a) => a.idJugador === id);
  }

  // ───────────── vestíbulo ─────────────

  /** Entra en la sala, o vuelve a su asiento si ya lo tenía (reconexión). Devuelve un error o null. */
  unir(idJugador: IdJugador, nombre: string): string | null {
    const existente = this.asientos.find((a) => a.idJugador === idJugador);
    if (existente) {
      this.cancelarTemporizador(existente);
      existente.conectado = true;
      existente.sustituidoPorBot = false;
      this.difundirSala();
      this.enviarPartidaCompleta(idJugador);
      return null;
    }
    if (this.estado !== 'esperando') {
      return 'La partida ya ha empezado';
    }
    if (this.asientos.length >= this.configuracion.maxJugadores) {
      return 'La sala está llena';
    }
    this.asientos.push(this.asientoHumano(idJugador, nombre));
    this.difundirSala();
    return null;
  }

  /** Abandona la sala. En plena partida, un bot ocupa su asiento hasta el final. */
  salir(idJugador: IdJugador): void {
    const asiento = this.asientos.find((a) => a.idJugador === idJugador);
    if (!asiento) {
      return;
    }
    this.cancelarTemporizador(asiento);
    if (this.estado === 'jugando') {
      asiento.conectado = false;
      asiento.sustituidoPorBot = true;
    } else {
      this.asientos = this.asientos.filter((a) => a !== asiento);
    }
    this.reasignarAnfitrion();
    if (!this.cerrarSiVacia()) {
      this.difundirSala();
      this.programarBots();
    }
  }

  anadirBot(solicitante: IdJugador, nivel: NivelBot): string | null {
    const error = this.exigirAnfitrionEnEspera(solicitante);
    if (error) {
      return error;
    }
    if (this.asientos.length >= this.configuracion.maxJugadores) {
      return 'La sala está llena';
    }
    const usados = new Set(this.asientos.map((a) => a.nombre));
    const nombre = NOMBRES_BOTS.map((n) => `${n} (bot ${NOMBRES_NIVEL_BOT[nivel]})`).find((n) => !usados.has(n)) ?? 'Bot';
    this.asientos.push({
      idJugador: `bot_${randomBytes(4).toString('hex')}`,
      nombre,
      tipo: 'bot',
      nivelBot: nivel,
      conectado: true,
      sustituidoPorBot: false,
      temporizador: null,
    });
    this.difundirSala();
    return null;
  }

  quitarAsiento(solicitante: IdJugador, idJugador: IdJugador): string | null {
    const error = this.exigirAnfitrionEnEspera(solicitante);
    if (error) {
      return error;
    }
    if (idJugador === solicitante) {
      return 'Para irte, sal de la sala';
    }
    const asiento = this.asientos.find((a) => a.idJugador === idJugador);
    if (!asiento) {
      return 'Ese jugador no está en la sala';
    }
    this.cancelarTemporizador(asiento);
    this.asientos = this.asientos.filter((a) => a !== asiento);
    this.deps.enviar(idJugador, { tipo: 'sala', sala: null });
    this.difundirSala();
    return null;
  }

  configurar(solicitante: IdJugador, cambios: Partial<ConfiguracionSala>): string | null {
    const error = this.exigirAnfitrionEnEspera(solicitante);
    if (error) {
      return error;
    }
    if (cambios.maxJugadores !== undefined && cambios.maxJugadores < this.asientos.length) {
      return 'Ya hay más jugadores en la sala';
    }
    this.aplicarConfiguracion(cambios);
    this.difundirSala();
    return null;
  }

  iniciar(solicitante: IdJugador, semilla = Math.floor(Math.random() * 2 ** 32)): string | null {
    const error = this.exigirAnfitrionEnEspera(solicitante);
    if (error) {
      return error;
    }
    const plantilla = PLANTILLAS[this.configuracion.plantilla];
    const n = this.asientos.length;
    if (n < plantilla.jugadores.minimo || n > plantilla.jugadores.maximo) {
      return `El mapa ${plantilla.nombre} es para ${plantilla.jugadores.minimo}–${plantilla.jugadores.maximo} jugadores`;
    }
    const rng = new GeneradorAleatorio(semilla);
    // El orden de turno se sortea.
    this.asientos = rng.barajar(this.asientos);
    this.juego = crearPartida({
      jugadores: this.asientos.map((a) => ({ id: a.idJugador, nombre: a.nombre })),
      semilla: rng.entero(2 ** 31),
      // La fase especial de construcción se activa sola con 5 o 6 jugadores; Navegantes depende del mapa.
      configuracion: {
        puntosVictoria: this.configuracion.puntosVictoria,
        modoDados: this.configuracion.modoDados,
        navegantes: plantilla.navegantes ?? false,
        ciudadesYCaballeros: this.configuracion.ciudadesYCaballeros,
      },
      mapa: generarMapa({ plantilla: this.configuracion.plantilla, modo: this.configuracion.modoMapa, semilla: rng.entero(2 ** 31) }),
    });
    this.registro = [];
    this.estado = 'jugando';
    this.difundirSala();
    for (const a of this.asientos) {
      this.enviarPartidaCompleta(a.idJugador);
    }
    this.programarBots();
    return null;
  }

  // ───────────── partida ─────────────

  accion(idJugador: IdJugador, accion: AccionCliente): string | null {
    if (!this.juego || this.estado !== 'jugando') {
      return 'La partida no ha empezado';
    }
    const asiento = this.asientos.find((a) => a.idJugador === idJugador);
    if (!asiento || asiento.sustituidoPorBot) {
      return 'No participas en esta partida';
    }
    return this.aplicar({ ...accion, jugador: idJugador } as AccionJuego);
  }

  chat(idJugador: IdJugador, texto: string): void {
    const asiento = this.asientos.find((a) => a.idJugador === idJugador);
    if (!asiento) {
      return;
    }
    this.difundir({ tipo: 'chat', de: idJugador, nombre: asiento.nombre, texto, hora: Date.now() });
  }

  /** El jugador perdió la conexión: se guarda su asiento un tiempo y después juega un bot por él. */
  marcarDesconectado(idJugador: IdJugador): void {
    const asiento = this.asientos.find((a) => a.idJugador === idJugador);
    if (!asiento || asiento.tipo === 'bot') {
      return;
    }
    asiento.conectado = false;
    this.cancelarTemporizador(asiento);
    asiento.temporizador = setTimeout(() => {
      asiento.temporizador = null;
      if (this.estado === 'jugando') {
        asiento.sustituidoPorBot = true;
        this.difundirSala();
        this.programarBots();
      } else {
        this.salir(idJugador);
      }
    }, this.deps.graciaReconexionMs);
    this.difundirSala();
  }

  cerrar(): void {
    if (this.cerrada) {
      return;
    }
    this.cerrada = true;
    if (this.temporizadorBots) {
      clearTimeout(this.temporizadorBots);
    }
    this.asientos.forEach((a) => this.cancelarTemporizador(a));
    this.deps.alCerrar(this);
  }

  private aplicar(accion: AccionJuego): string | null {
    let resultado: ReturnType<typeof aplicarAccion>;
    try {
      resultado = aplicarAccion(this.juego!, accion);
    } catch (error) {
      this.deps.registrarError(`Error al aplicar ${accion.tipo}`, error);
      return 'Acción inválida';
    }
    if (!resultado.ok) {
      return resultado.error;
    }
    this.juego = resultado.estado;
    this.registro.push(...resultado.eventos);
    this.difundirPartida(resultado.eventos);
    if (this.juego.fase.tipo === 'finalizada') {
      this.terminar();
    } else {
      this.programarBots();
    }
    return null;
  }

  private terminar(): void {
    const juego = this.juego!;
    if (juego.fase.tipo !== 'finalizada') {
      return;
    }
    const ganador = juego.fase.ganador;
    this.estado = 'terminada';
    this.difundirSala();
    const resultado = {
      plantilla: this.configuracion.plantilla,
      turnos: juego.turno.numero,
      jugadores: this.asientos.map((a) => ({
        nombre: a.nombre,
        esBot: a.tipo === 'bot',
        puntos: puntosDeVictoria(juego, a.idJugador),
        ganador: a.idJugador === ganador,
      })),
    };
    this.deps.repositorio.registrarPartida(resultado).catch((error) => {
      this.deps.registrarError('No se pudo guardar el resultado de la partida', error);
    });
    // Si ya no queda nadie mirando, la sala no sirve para nada más.
    if (!this.asientos.some((a) => a.tipo === 'humano' && a.conectado)) {
      this.cerrar();
    }
  }

  // ───────────── bots ─────────────

  private controladoPorBot(asiento: Asiento): boolean {
    return asiento.tipo === 'bot' || asiento.sustituidoPorBot;
  }

  /** Bot que debe actuar ahora: el que está en turno, uno que deba descartar o uno con ofertas sin responder. */
  private botQueDebeActuar(): Asiento | null {
    const juego = this.juego;
    if (!juego || juego.fase.tipo === 'finalizada') {
      return null;
    }
    const bots = this.asientos.filter((a) => this.controladoPorBot(a));
    const obligados = new Set(jugadoresQueDebenActuar(juego));
    const obligado = bots.find((a) => obligados.has(a.idJugador));
    if (obligado) {
      return obligado;
    }
    if (juego.fase.tipo !== 'acciones') {
      return null;
    }
    const enTurno = jugadorEnTurno(juego).id;
    return (
      bots.find(
        (a) =>
          a.idJugador !== enTurno &&
          juego.ofertas.some(
            (o) =>
              o.autor !== a.idJugador &&
              (o.destinatario === null || o.destinatario === a.idJugador) &&
              !o.aceptadaPor.includes(a.idJugador) &&
              !o.rechazadaPor.includes(a.idJugador),
          ),
      ) ?? null
    );
  }

  private programarBots(): void {
    if (this.cerrada || this.temporizadorBots || this.estado !== 'jugando' || !this.botQueDebeActuar()) {
      return;
    }
    this.temporizadorBots = setTimeout(() => {
      this.temporizadorBots = null;
      this.jugarBot();
    }, this.deps.retardoBotsMs);
  }

  private jugarBot(): void {
    const asiento = this.botQueDebeActuar();
    if (!asiento || !this.juego) {
      return;
    }
    const nivel = asiento.nivelBot ?? 'medio';
    let accion: AccionJuego | null = null;
    try {
      accion = decidirAccionBot(this.juego, asiento.idJugador, nivel, { montecarlo: this.deps.montecarlo });
    } catch (error) {
      this.deps.registrarError(`El bot ${asiento.nombre} falló al decidir`, error);
    }
    if (!accion) {
      return;
    }
    const error = this.aplicar(accion);
    if (error) {
      this.deps.registrarError(`El bot ${asiento.nombre} intentó una acción no válida (${accion.tipo}): ${error}`);
      // Para no bloquear la partida, el bot termina su turno si puede.
      if (this.juego.fase.tipo === 'acciones' && jugadorEnTurno(this.juego).id === asiento.idJugador) {
        this.aplicar({ tipo: 'finalizarTurno', jugador: asiento.idJugador });
      }
    }
  }

  // ───────────── utilidades ─────────────

  private asientoHumano(idJugador: IdJugador, nombre: string): Asiento {
    return { idJugador, nombre, tipo: 'humano', nivelBot: null, conectado: true, sustituidoPorBot: false, temporizador: null };
  }

  private aplicarConfiguracion(cambios: Partial<ConfiguracionSala>): void {
    const nueva = { ...this.configuracion, ...cambios };
    const plantilla = PLANTILLAS[nueva.plantilla];
    // Ciudades y Caballeros se juega a 13 puntos (salvo que se elija otro número a la vez).
    if (cambios.ciudadesYCaballeros !== undefined && cambios.ciudadesYCaballeros !== this.configuracion.ciudadesYCaballeros && cambios.puntosVictoria === undefined) {
      nueva.puntosVictoria = cambios.ciudadesYCaballeros ? PUNTOS_VICTORIA_CYC : plantilla.puntosVictoria;
    }
    // Al cambiar de mapa se ajustan los valores recomendados.
    if (cambios.plantilla && cambios.plantilla !== this.configuracion.plantilla) {
      if (cambios.puntosVictoria === undefined) {
        nueva.puntosVictoria = plantilla.puntosVictoria;
      }
      if (cambios.maxJugadores === undefined) {
        nueva.maxJugadores = Math.max(plantilla.jugadores.maximo, this.asientos.length);
      }
    }
    this.configuracion = nueva;
  }

  private exigirAnfitrionEnEspera(solicitante: IdJugador): string | null {
    if (solicitante !== this.anfitrion) {
      return 'Solo el anfitrión puede hacer eso';
    }
    return this.estado === 'esperando' ? null : 'La partida ya ha empezado';
  }

  private reasignarAnfitrion(): void {
    const humanos = this.asientos.filter((a) => a.tipo === 'humano' && !a.sustituidoPorBot);
    if (!humanos.some((a) => a.idJugador === this.anfitrion) && humanos[0]) {
      this.anfitrion = humanos[0].idJugador;
    }
  }

  /** Cierra la sala si no queda ningún humano. */
  private cerrarSiVacia(): boolean {
    if (this.asientos.some((a) => a.tipo === 'humano' && !a.sustituidoPorBot)) {
      return false;
    }
    this.cerrar();
    return true;
  }

  private cancelarTemporizador(asiento: Asiento): void {
    if (asiento.temporizador) {
      clearTimeout(asiento.temporizador);
      asiento.temporizador = null;
    }
  }

  private humanos(): Asiento[] {
    return this.asientos.filter((a) => a.tipo === 'humano');
  }

  private difundir(mensaje: MensajeServidor): void {
    for (const a of this.humanos()) {
      this.deps.enviar(a.idJugador, mensaje);
    }
  }

  private difundirSala(): void {
    this.difundir({ tipo: 'sala', sala: this.vista() });
  }

  private difundirPartida(eventos: readonly EventoJuego[]): void {
    for (const a of this.humanos()) {
      this.deps.enviar(a.idJugador, {
        tipo: 'partida',
        vista: vistaParaJugador(this.juego!, a.idJugador),
        eventos: eventos.map((e) => eventoParaJugador(e, a.idJugador)),
        registroCompleto: false,
      });
    }
  }

  private enviarPartidaCompleta(idJugador: IdJugador): void {
    this.deps.enviar(idJugador, { tipo: 'sala', sala: this.vista() });
    if (this.juego) {
      this.deps.enviar(idJugador, {
        tipo: 'partida',
        vista: vistaParaJugador(this.juego, idJugador),
        eventos: this.registro.map((e) => eventoParaJugador(e, idJugador)),
        registroCompleto: true,
      });
    }
  }
}
