/** Diálogos de Ciudades y Caballeros: parámetros de cartas de progreso. */

import {
  DESCRIPCION_CARTA_PROGRESO,
  MERCANCIAS,
  NOMBRES_CARTA_PROGRESO,
  NOMBRES_MERCANCIA,
  NOMBRES_TERRENO,
  RECURSOS,
  type OpcionesProgreso,
  type TipoCartaProgreso,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { jugadorDe } from '../estado/derivados';
import { Boton, CartaRecurso, Modal } from './comunes';

const ICONO_MERCANCIA = { papel: '📜', tela: '🧵', moneda: '🪙' } as const;

export function FichaMercancia({ mercancia, cantidad }: { mercancia: (typeof MERCANCIAS)[number]; cantidad: number }) {
  return (
    <div
      className="relative flex h-16 w-12 flex-col items-center justify-center rounded-md border-2 border-black/20 bg-amber-100 text-xl font-bold text-slate-900 shadow"
      title={NOMBRES_MERCANCIA[mercancia]}
    >
      <span>{ICONO_MERCANCIA[mercancia]}</span>
      <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white">
        {cantidad}
      </span>
    </div>
  );
}

/** Parámetros de una carta que no se eligen en el tablero (dados, recurso, mercancía o rival). */
export function DialogoProgreso({
  vista,
  carta,
  opciones,
  alCerrar,
}: {
  vista: VistaPartida;
  carta: TipoCartaProgreso;
  opciones: Extract<OpcionesProgreso, { necesita: 'dados' | 'recurso' | 'mercancia' | 'recursoOMercancia' | 'jugador' | 'nada' }>;
  alCerrar: () => void;
}) {
  const accion = useAlmacen((s) => s.accion);
  const [dados, setDados] = useState<[number, number]>([3, 4]);
  const jugar = (parametros: object) => {
    accion({ tipo: 'jugarProgreso', carta, ...parametros });
    alCerrar();
  };

  return (
    <Modal titulo={NOMBRES_CARTA_PROGRESO[carta]} alCerrar={alCerrar}>
      <p className="mb-4 text-sm text-slate-600">{DESCRIPCION_CARTA_PROGRESO[carta]}</p>
      {opciones.necesita === 'nada' && (
        <Boton variante="primario" className="w-full" onClick={() => jugar({})}>
          Jugar la carta
        </Boton>
      )}
      {opciones.necesita === 'dados' && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            {[0, 1].map((i) => (
              <label key={i} className="text-sm">
                {i === 0 ? 'Dado amarillo' : 'Dado rojo'}
                <select
                  className="ml-2 rounded border px-2 py-1"
                  value={dados[i]}
                  onChange={(e) => {
                    const nuevos: [number, number] = [...dados];
                    nuevos[i] = Number(e.target.value);
                    setDados(nuevos);
                  }}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Boton variante="primario" className="w-full" onClick={() => jugar({ dados })}>
            Fijar {dados[0] + dados[1]} y tirar después
          </Boton>
        </div>
      )}
      {(opciones.necesita === 'recurso' || opciones.necesita === 'recursoOMercancia') && (
        <div className="flex flex-wrap justify-center gap-3">
          {RECURSOS.map((r) => (
            <button key={r} type="button" className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100" onClick={() => jugar({ recurso: r })}>
              <CartaRecurso recurso={r} />
              <span className="text-xs font-semibold">{NOMBRES_TERRENO[r]}</span>
            </button>
          ))}
        </div>
      )}
      {(opciones.necesita === 'mercancia' || opciones.necesita === 'recursoOMercancia') && (
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          {MERCANCIAS.map((m) => (
            <button key={m} type="button" className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100" onClick={() => jugar({ mercancia: m })}>
              <span className="text-3xl">{ICONO_MERCANCIA[m]}</span>
              <span className="text-xs font-semibold">{NOMBRES_MERCANCIA[m]}</span>
            </button>
          ))}
        </div>
      )}
      {opciones.necesita === 'jugador' && (
        <div className="flex flex-col gap-2">
          {opciones.opciones.map((id) => (
            <Boton key={id} onClick={() => jugar({ jugadorObjetivo: id })}>
              {jugadorDe(vista, id)?.nombre ?? id}
            </Boton>
          ))}
        </div>
      )}
    </Modal>
  );
}
