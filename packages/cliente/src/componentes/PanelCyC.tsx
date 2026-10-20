import {
  costeMejora,
  defensaDe,
  fuerzaBarbaros,
  LINEAS_MEJORA,
  MERCANCIA_DE_LINEA,
  NIVEL_MAXIMO_MEJORA,
  NOMBRES_LINEA_MEJORA,
  NOMBRES_MERCANCIA,
  POSICION_ATAQUE_BARBAROS,
  type LineaMejora,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { useAlmacen } from '../estado/almacen';
import { esMiTurno, jugadorDe } from '../estado/derivados';
import { accionesCyC } from '../estado/derivadosCyC';

const COLOR_LINEA: Record<LineaMejora, string> = {
  comercio: 'bg-yellow-400',
  politica: 'bg-blue-500',
  ciencia: 'bg-green-500',
};

const ICONO_EVENTO = { barco: '⛵', comercio: '🟨', politica: '🟦', ciencia: '🟩' } as const;

const BENEFICIO_NIVEL_3: Record<LineaMejora, string> = {
  comercio: 'Casa de Comercio: mercancías 2:1',
  politica: 'Fortaleza: caballeros poderosos',
  ciencia: 'Acueducto: 1 recurso si no produces',
};

/** Bárbaros, dado de evento y mejoras urbanas (Ciudades y Caballeros). */
export function PanelCyC({ vista }: { vista: VistaPartida }) {
  const yo = useAlmacen((s) => s.yo);
  const accion = useAlmacen((s) => s.accion);
  const cyc = vista.cyc;
  if (!cyc) {
    return null;
  }
  const propio = jugadorDe(vista, yo?.idJugador)?.cyc;
  const disponibles = accionesCyC(vista, yo?.idJugador ?? null);
  const defensa = vista.jugadores.reduce((s, j) => s + defensaDe(vista, j.id), 0);
  const fuerza = fuerzaBarbaros(vista);
  const titularMetropolis = (linea: LineaMejora) => {
    const vertice = cyc.metropolis[linea];
    const dueno = vertice ? vista.tablero.edificios[vertice]?.jugador : undefined;
    return dueno ? jugadorDe(vista, dueno)?.nombre : undefined;
  };

  return (
    <div className="w-72 rounded-xl bg-slate-900/85 p-3 text-xs text-slate-100 shadow">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">Bárbaros</span>
        <span title="Último dado de evento">
          Dado de evento: {cyc.ultimoDadoEvento ? ICONO_EVENTO[cyc.ultimoDadoEvento] : '—'}
        </span>
      </div>
      <div className="mb-1 flex gap-0.5" aria-label={`Barco bárbaro en la casilla ${cyc.barbaros} de ${POSICION_ATAQUE_BARBAROS}`}>
        {Array.from({ length: POSICION_ATAQUE_BARBAROS + 1 }, (_, i) => (
          <span
            key={i}
            className={`flex h-5 flex-1 items-center justify-center rounded ${i === POSICION_ATAQUE_BARBAROS ? 'bg-rose-700' : 'bg-slate-700'}`}
          >
            {i === cyc.barbaros ? '⛵' : i === POSICION_ATAQUE_BARBAROS ? '🏰' : ''}
          </span>
        ))}
      </div>
      <p className={`mb-3 ${defensa >= fuerza ? 'text-emerald-300' : 'text-rose-300'}`}>
        Fuerza {fuerza} · Defensa {defensa}
        {cyc.ataques === 0 ? ' · El ladrón espera al primer ataque' : ''}
      </p>

      <p className="mb-1 font-semibold">Mejoras urbanas</p>
      <div className="space-y-1.5">
        {LINEAS_MEJORA.map((linea) => {
          const nivel = propio?.mejoras[linea] ?? 0;
          const coste = costeMejora(nivel, vista.turno.grua === true && esMiTurno(vista, yo?.idJugador));
          const metropolis = titularMetropolis(linea);
          return (
            <div key={linea}>
              <div className="flex items-center gap-2">
                <span className="w-14">{NOMBRES_LINEA_MEJORA[linea]}</span>
                <div className="flex flex-1 gap-0.5" title={nivel >= 3 ? BENEFICIO_NIVEL_3[linea] : `Nivel 3: ${BENEFICIO_NIVEL_3[linea]}`}>
                  {Array.from({ length: NIVEL_MAXIMO_MEJORA }, (_, i) => (
                    <span key={i} className={`h-2.5 flex-1 rounded-sm ${i < nivel ? COLOR_LINEA[linea] : 'bg-slate-700'}`} />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!disponibles?.mejoras[linea]}
                  onClick={() => accion({ tipo: 'mejorarCiudad', linea })}
                  className="rounded bg-amber-500 px-1.5 py-0.5 font-semibold text-slate-900 disabled:opacity-30"
                  title={nivel >= NIVEL_MAXIMO_MEJORA ? 'Nivel máximo' : `Mejorar por ${coste} de ${NOMBRES_MERCANCIA[MERCANCIA_DE_LINEA[linea]]}`}
                >
                  {nivel >= NIVEL_MAXIMO_MEJORA ? 'máx.' : `+${coste}`}
                </button>
              </div>
              {metropolis && <p className="pl-16 text-[10px] text-amber-300">Metrópolis: {metropolis}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
