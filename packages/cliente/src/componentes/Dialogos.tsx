/** Diálogos que la partida abre cuando hace falta decidir algo. */

import {
  MERCANCIAS,
  NOMBRES_MERCANCIA,
  NOMBRES_TERRENO,
  RECURSOS,
  type MercanciasParciales,
  totalCartas,
  type Recurso,
  type RecursosParciales,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { jugadorDe } from '../estado/derivados';
import { aCss, COLOR_JUGADOR } from '../tablero/paleta';
import { Boton, CartaRecurso, Modal, SelectorRecursos } from './comunes';

export function DialogoDescarte({ vista, cantidad }: { vista: VistaPartida; cantidad: number }) {
  const yo = useAlmacen((s) => s.yo);
  const accion = useAlmacen((s) => s.accion);
  const [seleccion, setSeleccion] = useState<RecursosParciales>({});
  const [mercancias, setMercancias] = useState<MercanciasParciales>({});
  const propio = jugadorDe(vista, yo?.idJugador);
  const mano = propio?.recursos ?? undefined;
  const mias = propio?.cyc?.mercancias ?? null;
  const elegidas = totalCartas(seleccion) + MERCANCIAS.reduce((s, m) => s + (mercancias[m] ?? 0), 0);
  return (
    <Modal titulo={`Ha salido un 7: descarta ${cantidad} cartas`}>
      <p className="mb-4 text-sm text-slate-600">Tienes demasiadas cartas, así que debes devolver la mitad a la banca.</p>
      <SelectorRecursos valor={seleccion} alCambiar={setSeleccion} maximos={mano} />
      {mias && (
        <div className="mt-3 flex justify-center gap-4">
          {MERCANCIAS.map((m) => (
            <label key={m} className="flex flex-col items-center text-xs">
              {NOMBRES_MERCANCIA[m]}
              <input
                type="number"
                min={0}
                max={mias[m]}
                value={mercancias[m] ?? 0}
                onChange={(e) => setMercancias({ ...mercancias, [m]: Math.max(0, Math.min(mias[m], Number(e.target.value) || 0)) })}
                className="w-14 rounded border px-1 py-0.5 text-center"
              />
            </label>
          ))}
        </div>
      )}
      <Boton
        variante="primario"
        className="mt-4 w-full"
        disabled={elegidas !== cantidad}
        onClick={() => accion({ tipo: 'descartar', recursos: seleccion, ...(mias ? { mercancias } : {}) })}
      >
        Descartar ({elegidas}/{cantidad})
      </Boton>
    </Modal>
  );
}

/** Navegantes: elegir los recursos que da un campo de oro. */
export function DialogoOro({ vista, cantidad }: { vista: VistaPartida; cantidad: number }) {
  const accion = useAlmacen((s) => s.accion);
  const [seleccion, setSeleccion] = useState<RecursosParciales>({});
  const elegibles = Math.min(cantidad, totalCartas(vista.banca));
  const elegidas = totalCartas(seleccion);
  const maximos = Object.fromEntries(RECURSOS.map((r) => [r, Math.min(vista.banca[r], (seleccion[r] ?? 0) + elegibles - elegidas)]));
  return (
    <Modal titulo={`Campo de oro: elige ${elegibles} recurso${elegibles === 1 ? '' : 's'}`}>
      <p className="mb-4 text-sm text-slate-600">El oro te deja elegir cualquier recurso de la banca.</p>
      <SelectorRecursos valor={seleccion} alCambiar={setSeleccion} maximos={maximos} />
      <Boton variante="primario" className="mt-4 w-full" disabled={elegidas !== elegibles} onClick={() => accion({ tipo: 'elegirOro', recursos: seleccion })}>
        Tomar ({elegidas}/{elegibles})
      </Boton>
    </Modal>
  );
}

export function DialogoRobo({ vista, victimas }: { vista: VistaPartida; victimas: string[] }) {
  const accion = useAlmacen((s) => s.accion);
  return (
    <Modal titulo="¿A quién robas una carta?">
      <div className="flex flex-col gap-2">
        {victimas.map((id) => {
          const j = jugadorDe(vista, id)!;
          return (
            <Boton key={id} className="flex items-center justify-between" onClick={() => accion({ tipo: 'robar', victima: id })}>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-black/30" style={{ backgroundColor: aCss(COLOR_JUGADOR[j.color]) }} />
                {j.nombre}
              </span>
              <span className="text-slate-500">{j.totalRecursos} cartas</span>
            </Boton>
          );
        })}
      </div>
    </Modal>
  );
}

export function DialogoAbundancia({ vista, alCerrar }: { vista: VistaPartida; alCerrar: () => void }) {
  const accion = useAlmacen((s) => s.accion);
  const [seleccion, setSeleccion] = useState<RecursosParciales>({});
  const elegidas = RECURSOS.flatMap((r) => Array<Recurso>(seleccion[r] ?? 0).fill(r));
  // Se pueden elegir 2 cartas en total (también 2 iguales), siempre que la banca las tenga.
  const maximos = Object.fromEntries(
    RECURSOS.map((r) => [r, Math.min(2 - elegidas.length + (seleccion[r] ?? 0), vista.banca[r])]),
  );
  return (
    <Modal titulo="Abundancia: elige 2 recursos" alCerrar={alCerrar}>
      <SelectorRecursos valor={seleccion} alCambiar={setSeleccion} maximos={maximos} />
      <Boton
        variante="primario"
        className="mt-4 w-full"
        disabled={elegidas.length !== 2}
        onClick={() => {
          accion({ tipo: 'jugarAbundancia', recursos: [elegidas[0]!, elegidas[1]!] });
          alCerrar();
        }}
      >
        Tomar de la banca
      </Boton>
    </Modal>
  );
}

export function DialogoMonopolio({ alCerrar }: { alCerrar: () => void }) {
  const accion = useAlmacen((s) => s.accion);
  return (
    <Modal titulo="Monopolio: ¿qué recurso reclamas?" alCerrar={alCerrar}>
      <p className="mb-4 text-sm text-slate-600">Todos los demás jugadores te darán todas sus cartas de ese recurso.</p>
      <div className="flex flex-wrap justify-center gap-3">
        {RECURSOS.map((r) => (
          <button
            key={r}
            type="button"
            className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100"
            onClick={() => {
              accion({ tipo: 'jugarMonopolio', recurso: r });
              alCerrar();
            }}
          >
            <CartaRecurso recurso={r} />
            <span className="text-xs font-semibold">{NOMBRES_TERRENO[r]}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function FinPartida({ vista }: { vista: VistaPartida }) {
  const enviar = useAlmacen((s) => s.enviar);
  const registro = useAlmacen((s) => s.registro);
  if (vista.fase.tipo !== 'finalizada') {
    return null;
  }
  // Los puntos del ganador incluyen sus cartas de Punto de Victoria, que el resto no ve.
  const victoria = registro.findLast((e) => e.tipo === 'victoria');
  const puntosGanador = victoria?.tipo === 'victoria' ? victoria.puntos : vista.configuracion.puntosVictoria;
  const idGanador = vista.fase.ganador;
  const ganador = jugadorDe(vista, idGanador);
  const clasificacion = [...vista.jugadores].sort((a, b) => b.puntosVisibles - a.puntosVisibles);
  return (
    <Modal titulo="¡Fin de la partida!">
      <p className="mb-4 text-center text-2xl font-black">🏆 {ganador?.nombre} gana</p>
      <ol className="mb-4 space-y-1">
        {clasificacion.map((j, i) => (
          <li key={j.id} className="flex justify-between rounded-lg bg-slate-100 px-3 py-1.5">
            <span className="flex items-center gap-2">
              {i + 1}.
              <span className="h-3 w-3 rounded-full border border-black/30" style={{ backgroundColor: aCss(COLOR_JUGADOR[j.color]) }} />
              {j.nombre}
            </span>
            <span className="font-bold tabular-nums">
              {j.id === idGanador ? puntosGanador : j.puntosVisibles} PV
            </span>
          </li>
        ))}
      </ol>
      <Boton variante="primario" className="w-full" onClick={() => enviar({ tipo: 'salirSala' })}>
        Volver al vestíbulo
      </Boton>
    </Modal>
  );
}
