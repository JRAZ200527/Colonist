/** Validación con zod de los mensajes que llegan de los clientes. */

import {
  IDS_PLANTILLA,
  LINEAS_MEJORA,
  MERCANCIAS,
  NOMBRES_CARTA_PROGRESO,
  type TipoCartaProgreso,
  MAX_JUGADORES,
  MIN_JUGADORES,
  NIVELES_BOT,
  RECURSOS,
  type MensajeCliente,
} from '@colonist/motor-compartido';
import { z } from 'zod';

const cantidad = z.number().int().min(0).max(100).optional();
const recursos = z.strictObject({
  madera: cantidad,
  arcilla: cantidad,
  trigo: cantidad,
  oveja: cantidad,
  mineral: cantidad,
});
const recurso = z.enum(RECURSOS);
const mercancias = z.strictObject({ papel: cantidad, tela: cantidad, moneda: cantidad });
const id = z.string().min(1).max(200);

const accion = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('colocarPobladoInicial'), vertice: id }),
  z.object({ tipo: z.literal('colocarCarreteraInicial'), arista: id }),
  z.object({ tipo: z.literal('tirarDados') }),
  z.object({ tipo: z.literal('descartar'), recursos, mercancias: mercancias.optional() }),
  z.object({ tipo: z.literal('moverLadron'), hexagono: id }),
  z.object({ tipo: z.literal('robar'), victima: id }),
  z.object({ tipo: z.literal('construirCarretera'), arista: id }),
  z.object({ tipo: z.literal('construirPoblado'), vertice: id }),
  z.object({ tipo: z.literal('construirCiudad'), vertice: id }),
  z.object({ tipo: z.literal('comprarCartaDesarrollo') }),
  z.object({ tipo: z.literal('jugarCaballero') }),
  z.object({ tipo: z.literal('jugarConstruccionCarreteras') }),
  z.object({ tipo: z.literal('jugarAbundancia'), recursos: z.tuple([recurso, recurso]) }),
  z.object({ tipo: z.literal('jugarMonopolio'), recurso }),
  z.object({
    tipo: z.literal('comerciarConBanca'),
    entrega: recursos,
    recibe: recursos,
    entregaMercancias: mercancias.optional(),
    recibeMercancias: mercancias.optional(),
  }),
  z.object({ tipo: z.literal('proponerOferta'), ofrece: recursos, pide: recursos }),
  z.object({ tipo: z.literal('responderOferta'), idOferta: z.number().int(), acepta: z.boolean() }),
  z.object({ tipo: z.literal('confirmarOferta'), idOferta: z.number().int(), con: id }),
  z.object({ tipo: z.literal('retirarOferta'), idOferta: z.number().int() }),
  z.object({ tipo: z.literal('finalizarTurno') }),
  z.object({ tipo: z.literal('terminarConstruccionEspecial') }),
  z.object({ tipo: z.literal('colocarBarcoInicial'), arista: id }),
  z.object({ tipo: z.literal('construirBarco'), arista: id }),
  z.object({ tipo: z.literal('moverBarco'), desde: id, hasta: id }),
  z.object({ tipo: z.literal('moverPirata'), hexagono: id }),
  z.object({ tipo: z.literal('elegirOro'), recursos }),
  z.object({ tipo: z.literal('construirCaballero'), vertice: id }),
  z.object({ tipo: z.literal('activarCaballero'), vertice: id }),
  z.object({ tipo: z.literal('ascenderCaballero'), vertice: id }),
  z.object({ tipo: z.literal('moverCaballero'), desde: id, hasta: id }),
  z.object({ tipo: z.literal('expulsarLadron'), vertice: id }),
  z.object({ tipo: z.literal('construirMuralla'), vertice: id }),
  z.object({ tipo: z.literal('mejorarCiudad'), linea: z.enum(LINEAS_MEJORA) }),
  z.object({
    tipo: z.literal('jugarProgreso'),
    carta: z.enum(Object.keys(NOMBRES_CARTA_PROGRESO) as [TipoCartaProgreso, ...TipoCartaProgreso[]]),
    recurso: recurso.optional(),
    mercancia: z.enum(MERCANCIAS).optional(),
    jugadorObjetivo: id.optional(),
    vertices: z.array(id).max(2).optional(),
    hexagonos: z.array(id).max(2).optional(),
    arista: id.optional(),
    dados: z.tuple([z.number().int(), z.number().int()]).optional(),
  }),
]);

const configuracionSala = z
  .object({
    plantilla: z.enum(IDS_PLANTILLA),
    modoMapa: z.enum(['equilibrado', 'aleatorio']),
    modoDados: z.enum(['aleatorio', 'equilibrado']),
    puntosVictoria: z.number().int().min(3).max(25),
    maxJugadores: z.number().int().min(MIN_JUGADORES).max(MAX_JUGADORES),
    privada: z.boolean(),
    ciudadesYCaballeros: z.boolean(),
  })
  .partial();

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre no puede estar vacío')
  .max(24, 'El nombre puede tener como máximo 24 caracteres');

const mensaje = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('hola'), nombre, token: z.string().max(200).optional() }),
  z.object({ tipo: z.literal('ping'), t: z.number() }),
  z.object({ tipo: z.literal('listarSalas') }),
  z.object({ tipo: z.literal('crearSala'), nombre: z.string().trim().min(1).max(40), configuracion: configuracionSala.optional() }),
  z.object({ tipo: z.literal('unirseSala'), idSala: id }),
  z.object({ tipo: z.literal('salirSala') }),
  z.object({ tipo: z.literal('anadirBot'), nivel: z.enum(NIVELES_BOT) }),
  z.object({ tipo: z.literal('quitarAsiento'), idJugador: id }),
  z.object({ tipo: z.literal('cambiarConfiguracion'), configuracion: configuracionSala }),
  z.object({ tipo: z.literal('iniciarPartida') }),
  z.object({ tipo: z.literal('accion'), accion }),
  z.object({ tipo: z.literal('chat'), texto: z.string().trim().min(1).max(300) }),
  z.object({ tipo: z.literal('pedirRanking') }),
]);

export type ResultadoLectura = { ok: true; mensaje: MensajeCliente } | { ok: false; error: string };

/** Interpreta un mensaje de texto del WebSocket. */
export function leerMensaje(texto: string): ResultadoLectura {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'Mensaje con formato inválido' };
  }
  const resultado = mensaje.safeParse(datos);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    return { ok: false, error: problema?.message.startsWith('El nombre') ? problema.message : 'Mensaje no válido' };
  }
  return { ok: true, mensaje: resultado.data as MensajeCliente };
}
