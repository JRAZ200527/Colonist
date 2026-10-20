import {
  DESCRIPCION_CARTA_PROGRESO,
  MERCANCIAS,
  NOMBRES_CARTA_DESARROLLO,
  NOMBRES_CARTA_PROGRESO,
  RECURSOS,
  type TipoCartaDesarrollo,
  type TipoCartaProgreso,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { cartasProgresoJugablesVista } from '../estado/derivadosCyC';
import { FichaMercancia } from './DialogosCyC';
import { useAlmacen } from '../estado/almacen';
import { cartasJugables, jugadorDe } from '../estado/derivados';
import { CartaRecurso } from './comunes';

const ICONO_CARTA: Record<TipoCartaDesarrollo, string> = {
  caballero: '⚔️',
  puntoVictoria: '🏆',
  construccionCarreteras: '🛣️',
  abundancia: '🎁',
  monopolio: '💰',
};

/** Mis cartas de recurso y de desarrollo. Las de desarrollo se juegan pulsándolas. */
export function Mano({
  vista,
  alJugarCarta,
  alJugarProgreso,
}: {
  vista: VistaPartida;
  alJugarCarta: (tipo: TipoCartaDesarrollo) => void;
  alJugarProgreso: (carta: TipoCartaProgreso) => void;
}) {
  const yo = useAlmacen((s) => s.yo);
  const propio = jugadorDe(vista, yo?.idJugador);
  if (!propio?.recursos) {
    return null;
  }
  const jugables = cartasJugables(vista, yo?.idJugador ?? null);
  const progresoJugables = cartasProgresoJugablesVista(vista, yo?.idJugador ?? null);
  const cyc = propio.cyc;
  const agrupadas = new Map<TipoCartaDesarrollo, { total: number; nuevas: number }>();
  for (const carta of propio.cartasDesarrollo ?? []) {
    const datos = agrupadas.get(carta.tipo) ?? { total: 0, nuevas: 0 };
    datos.total++;
    if (carta.turnoCompra >= vista.turno.numero) {
      datos.nuevas++;
    }
    agrupadas.set(carta.tipo, datos);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-2">
        {RECURSOS.map((r) => (
          <CartaRecurso key={r} recurso={r} cantidad={propio.recursos![r]} />
        ))}
        {cyc?.mercancias && MERCANCIAS.map((m) => <FichaMercancia key={m} mercancia={m} cantidad={cyc.mercancias![m]} />)}
      </div>
      {cyc?.cartasProgreso && cyc.cartasProgreso.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cyc.cartasProgreso.map((carta, i) => {
            const jugable = progresoJugables.has(carta);
            return (
              <button
                key={`${carta}-${i}`}
                type="button"
                disabled={!jugable}
                onClick={() => alJugarProgreso(carta)}
                title={`${NOMBRES_CARTA_PROGRESO[carta]}: ${DESCRIPCION_CARTA_PROGRESO[carta]}`}
                className={`flex h-16 w-16 flex-col items-center justify-center rounded-md border-2 bg-teal-100 px-0.5 text-center text-[10px] font-semibold leading-tight text-teal-950 shadow transition ${jugable ? 'border-amber-400 hover:-translate-y-1' : 'border-teal-400 opacity-80'}`}
              >
                <span className="text-lg">📘</span>
                {NOMBRES_CARTA_PROGRESO[carta]}
              </button>
            );
          })}
        </div>
      )}
      {agrupadas.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...agrupadas].map(([tipo, { total, nuevas }]) => {
            const jugable = jugables.has(tipo);
            return (
              <button
                key={tipo}
                type="button"
                disabled={!jugable}
                onClick={() => alJugarCarta(tipo)}
                title={
                  tipo === 'puntoVictoria'
                    ? 'Cuenta automáticamente para la victoria'
                    : jugable
                      ? `Jugar ${NOMBRES_CARTA_DESARROLLO[tipo]}`
                      : nuevas === total
                        ? 'Comprada este turno: podrás jugarla en el siguiente'
                        : 'Ahora no se puede jugar'
                }
                className={`relative flex h-16 w-14 flex-col items-center justify-center rounded-md border-2 bg-violet-200 text-xs font-semibold text-violet-950 shadow ${jugable ? 'border-amber-400 hover:-translate-y-1 hover:bg-violet-100' : 'border-violet-400 opacity-80'} transition`}
              >
                <span className="text-xl">{ICONO_CARTA[tipo]}</span>
                <span className="px-0.5 text-center leading-tight">{NOMBRES_CARTA_DESARROLLO[tipo].split(' ')[0]}</span>
                {total > 1 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white">
                    {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
