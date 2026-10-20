import { longitudRutaMasLarga, type VistaPartida } from '@colonist/motor-compartido';
import { useAlmacen } from '../estado/almacen';
import { aCss, COLOR_JUGADOR } from '../tablero/paleta';

export function PanelJugadores({ vista }: { vista: VistaPartida }) {
  const yo = useAlmacen((s) => s.yo);
  const sala = useAlmacen((s) => s.sala);
  const enTurno = vista.jugadores[vista.turno.jugadorActual]?.id;

  return (
    <div className="flex flex-col gap-2">
      {vista.jugadores.map((j) => {
        const asiento = sala?.asientos.find((a) => a.idJugador === j.id);
        const ocultos = j.cartasDesarrollo?.filter((c) => c.tipo === 'puntoVictoria').length ?? 0;
        return (
          <div
            key={j.id}
            className={`rounded-xl bg-slate-900/80 px-3 py-2 text-slate-100 shadow transition ${j.id === enTurno ? 'ring-2 ring-amber-400' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/40" style={{ backgroundColor: aCss(COLOR_JUGADOR[j.color]) }} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {j.nombre}
                {j.id === yo?.idJugador && <span className="ml-1 text-xs text-sky-300">(tú)</span>}
              </span>
              <span className="text-lg font-black tabular-nums" title="Puntos de victoria">
                {j.puntosVisibles}
                {ocultos > 0 && <span className="text-xs text-amber-300" title="Incluyendo tus cartas de Punto de Victoria">+{ocultos}</span>}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
              <span title="Cartas de recurso">🃏 {j.totalRecursos}</span>
              <span title="Cartas de desarrollo">📜 {j.totalCartasDesarrollo}</span>
              <span title="Caballeros jugados">⚔️ {j.caballerosJugados}</span>
              <span title="Carretera más larga">🛣️ {longitudRutaMasLarga(vista, j.id)}</span>
              {vista.titulos.granRuta === j.id && <span className="font-semibold text-amber-300">Gran Ruta</span>}
              {vista.titulos.mayorEjercito === j.id && <span className="font-semibold text-amber-300">Mayor Ejército</span>}
              {asiento && !asiento.conectado && <span className="text-rose-300">desconectado</span>}
              {asiento?.sustituidoPorBot && <span className="text-sky-300">juega un bot</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
