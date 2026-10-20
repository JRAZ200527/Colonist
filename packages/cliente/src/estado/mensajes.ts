/**
 * Cómo cambia el estado del cliente con cada mensaje del servidor.
 * Es una función pura para poder probarla sin navegador ni conexión.
 */

import type {
  EntradaRanking,
  EventoVisible,
  IdJugador,
  MensajeServidor,
  ResumenSala,
  VistaPartida,
  VistaSala,
} from '@colonist/motor-compartido';

export interface MensajeChat {
  de: IdJugador | null;
  nombre: string;
  texto: string;
  hora: number;
}

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'error' | 'info';
}

export interface DatosServidor {
  yo: { idJugador: IdJugador; nombre: string } | null;
  salas: ResumenSala[];
  sala: VistaSala | null;
  partida: VistaPartida | null;
  registro: EventoVisible[];
  chat: MensajeChat[];
  ranking: EntradaRanking[] | null;
  avisos: Aviso[];
  /** Última tirada de dados, con un contador para poder animar tiradas repetidas. */
  ultimaTirada: { dados: [number, number]; jugador: IdJugador; numero: number } | null;
}

export const DATOS_INICIALES: DatosServidor = {
  yo: null,
  salas: [],
  sala: null,
  partida: null,
  registro: [],
  chat: [],
  ranking: null,
  avisos: [],
  ultimaTirada: null,
};

const MAX_REGISTRO = 500;
const MAX_CHAT = 200;
let siguienteAviso = 1;

export function crearAviso(texto: string, tipo: Aviso['tipo'] = 'error'): Aviso {
  return { id: siguienteAviso++, texto, tipo };
}

export function procesarMensaje(datos: DatosServidor, mensaje: MensajeServidor): Partial<DatosServidor> {
  switch (mensaje.tipo) {
    case 'bienvenida':
      return { yo: { idJugador: mensaje.idJugador, nombre: mensaje.nombre } };

    case 'pong':
      return {};

    case 'error':
      return { avisos: [...datos.avisos, crearAviso(mensaje.mensaje)].slice(-4) };

    case 'salas':
      return { salas: mensaje.salas };

    case 'sala': {
      if (mensaje.sala === null) {
        return { sala: null, partida: null, registro: [], chat: [], ultimaTirada: null };
      }
      // Al cambiar de sala se olvida la partida anterior.
      const otraSala = datos.sala?.id !== mensaje.sala.id;
      return otraSala
        ? { sala: mensaje.sala, partida: null, registro: [], chat: [], ultimaTirada: null }
        : { sala: mensaje.sala };
    }

    case 'partida': {
      const registro = mensaje.registroCompleto ? mensaje.eventos : [...datos.registro, ...mensaje.eventos];
      const tirada = [...mensaje.eventos].reverse().find((e) => e.tipo === 'dadosTirados');
      return {
        partida: mensaje.vista,
        registro: registro.slice(-MAX_REGISTRO),
        ultimaTirada:
          tirada && tirada.tipo === 'dadosTirados' && !mensaje.registroCompleto
            ? { dados: tirada.dados, jugador: tirada.jugador, numero: (datos.ultimaTirada?.numero ?? 0) + 1 }
            : mensaje.vista.turno.dados && datos.ultimaTirada === null
              ? { dados: mensaje.vista.turno.dados, jugador: '', numero: 0 }
              : datos.ultimaTirada,
      };
    }

    case 'chat':
      return {
        chat: [...datos.chat, { de: mensaje.de, nombre: mensaje.nombre, texto: mensaje.texto, hora: mensaje.hora }].slice(-MAX_CHAT),
      };

    case 'ranking':
      return { ranking: mensaje.jugadores };
  }
}
