import {
  describirRecursos,
  NOMBRES_TERRENO,
  RECURSOS,
  tasasComercio,
  totalCartas,
  MERCANCIAS,
  NOMBRES_MERCANCIA,
  tasasCyC,
  type EstadoJuego,
  type Mercancia,
  type OfertaComercio,
  type Recurso,
  type RecursosParciales,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { esMiTurno, jugadorDe } from '../estado/derivados';
import { ICONO_RECURSO } from '../tablero/paleta';
import { Boton, CartaRecurso, Modal, SelectorRecursos } from './comunes';

type Carta = Recurso | Mercancia;

const ICONO_MERCANCIA: Record<Mercancia, string> = { papel: '📜', tela: '🧵', moneda: '🪙' };

export interface PropuestaInicial {
  ofrece: RecursosParciales;
  pide: RecursosParciales;
}

/** Comercio con la banca (4:1, 3:1, 2:1) y ofertas a los demás jugadores. */
export function ModalComercio({
  vista,
  inicial,
  alCerrar,
}: {
  vista: VistaPartida;
  inicial?: PropuestaInicial;
  alCerrar: () => void;
}) {
  const yo = useAlmacen((s) => s.yo);
  const accion = useAlmacen((s) => s.accion);
  const propio = jugadorDe(vista, yo?.idJugador);
  const miTurno = esMiTurno(vista, yo?.idJugador);
  const [pestana, setPestana] = useState<'banca' | 'jugadores'>(miTurno && !inicial ? 'banca' : 'jugadores');
  const [ofrece, setOfrece] = useState<RecursosParciales>(inicial?.ofrece ?? {});
  const [pide, setPide] = useState<RecursosParciales>(inicial?.pide ?? {});
  const [entrega, setEntrega] = useState<Carta | null>(null);
  const [recibe, setRecibe] = useState<Carta | null>(null);
  const [cantidad, setCantidad] = useState(1);

  if (!propio?.recursos || !yo) {
    return null;
  }
  const mano = propio.recursos;
  // Con Ciudades y Caballeros también se cambian mercancías.
  const mercancias = propio.cyc?.mercancias ?? null;
  const tasasCompletas = vista.cyc
    ? tasasCyC(vista as unknown as EstadoJuego, yo.idJugador)
    : { recursos: tasasComercio(vista, yo.idJugador), mercancias: null };
  const cartas: Carta[] = [...RECURSOS, ...(mercancias ? MERCANCIAS : [])];
  const esMercancia = (c: Carta): c is Mercancia => (MERCANCIAS as readonly string[]).includes(c);
  const tengo = (c: Carta) => (esMercancia(c) ? (mercancias?.[c] ?? 0) : mano[c]);
  const tasa = (c: Carta) => (esMercancia(c) ? (tasasCompletas.mercancias?.[c] ?? 4) : tasasCompletas.recursos[c]);
  const nombre = (c: Carta) => (esMercancia(c) ? NOMBRES_MERCANCIA[c] : NOMBRES_TERRENO[c]);
  const ficha = (c: Carta, conCantidad: boolean) =>
    esMercancia(c) ? (
      <span className="flex h-10 w-8 items-center justify-center rounded-md border-2 border-black/20 bg-amber-100 text-lg" title={NOMBRES_MERCANCIA[c]}>
        {ICONO_MERCANCIA[c]}
        {conCantidad && <sup className="text-[10px] font-bold">{tengo(c)}</sup>}
      </span>
    ) : (
      <CartaRecurso recurso={c} cantidad={conCantidad ? mano[c] : undefined} pequena />
    );
  const maximoBanca = entrega ? Math.floor(tengo(entrega) / tasa(entrega)) : 0;
  const repetidos = RECURSOS.some((r) => (ofrece[r] ?? 0) > 0 && (pide[r] ?? 0) > 0);

  return (
    <Modal titulo="Comerciar" alCerrar={alCerrar}>
      {miTurno && (
        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          {(['banca', 'jugadores'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`flex-1 rounded-md py-1.5 ${pestana === p ? 'bg-white shadow' : 'text-slate-500'}`}
              onClick={() => setPestana(p)}
            >
              {p === 'banca' ? 'Con la banca' : 'Con jugadores'}
            </button>
          ))}
        </div>
      )}

      {pestana === 'banca' ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold">Entregas</p>
            <div className="flex flex-wrap gap-2">
              {cartas.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={tengo(r) < tasa(r)}
                  onClick={() => {
                    setEntrega(r);
                    setCantidad(1);
                    if (recibe === r) {
                      setRecibe(null);
                    }
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg p-1 disabled:opacity-30 ${entrega === r ? 'ring-2 ring-amber-500' : ''}`}
                >
                  {ficha(r, true)}
                  <span className="text-xs font-bold">{tasa(r)}:1</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Recibes</p>
            <div className="flex flex-wrap gap-2">
              {cartas.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={r === entrega}
                  onClick={() => setRecibe(r)}
                  className={`rounded-lg p-1 disabled:opacity-30 ${recibe === r ? 'ring-2 ring-amber-500' : ''}`}
                >
                  {ficha(r, false)}
                </button>
              ))}
            </div>
          </div>
          {entrega && maximoBanca > 1 && (
            <label className="flex items-center gap-2 text-sm">
              Cartas a recibir:
              <input
                type="number"
                min={1}
                max={maximoBanca}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Math.min(maximoBanca, Number(e.target.value) || 1)))}
                className="w-16 rounded border px-2 py-1"
              />
            </label>
          )}
          <Boton
            variante="primario"
            className="w-full"
            disabled={!entrega || !recibe || maximoBanca < 1}
            onClick={() => {
              const entregado = { [entrega!]: tasa(entrega!) * cantidad };
              const recibido = { [recibe!]: cantidad };
              accion({
                tipo: 'comerciarConBanca',
                entrega: esMercancia(entrega!) ? {} : entregado,
                recibe: esMercancia(recibe!) ? {} : recibido,
                ...(esMercancia(entrega!) ? { entregaMercancias: entregado } : {}),
                ...(esMercancia(recibe!) ? { recibeMercancias: recibido } : {}),
              });
              alCerrar();
            }}
          >
            {entrega && recibe
              ? `Cambiar ${tasa(entrega) * cantidad} ${nombre(entrega)} por ${cantidad} ${nombre(recibe)}`
              : 'Elige qué entregas y qué recibes'}
          </Boton>
        </div>
      ) : (
        <div className="space-y-4">
          {!miTurno && (
            <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900">
              Tu oferta irá dirigida a {jugadorDe(vista, vista.jugadores[vista.turno.jugadorActual]?.id)?.nombre}, que tiene el turno.
            </p>
          )}
          <div>
            <p className="mb-2 text-center text-sm font-semibold">Ofreces</p>
            <SelectorRecursos valor={ofrece} alCambiar={setOfrece} maximos={mano} />
          </div>
          <div>
            <p className="mb-2 text-center text-sm font-semibold">Pides</p>
            <SelectorRecursos valor={pide} alCambiar={setPide} />
          </div>
          {repetidos && <p className="text-center text-sm text-rose-600">No puedes ofrecer y pedir el mismo recurso.</p>}
          <Boton
            variante="primario"
            className="w-full"
            disabled={totalCartas(ofrece) === 0 || totalCartas(pide) === 0 || repetidos}
            onClick={() => {
              accion({ tipo: 'proponerOferta', ofrece, pide });
              alCerrar();
            }}
          >
            Proponer intercambio
          </Boton>
        </div>
      )}
    </Modal>
  );
}

function ResumenRecursos({ recursos }: { recursos: RecursosParciales }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {RECURSOS.filter((r) => (recursos[r] ?? 0) > 0).map((r) => (
        <span key={r} className="whitespace-nowrap" title={NOMBRES_TERRENO[r]}>
          {recursos[r]}
          {ICONO_RECURSO[r]}
        </span>
      ))}
    </span>
  );
}

/** Ofertas abiertas entre jugadores, con los botones que tocan a cada uno. */
export function PanelOfertas({
  vista,
  alContraofertar,
}: {
  vista: VistaPartida;
  alContraofertar: (propuesta: PropuestaInicial) => void;
}) {
  const yo = useAlmacen((s) => s.yo);
  const accion = useAlmacen((s) => s.accion);
  if (!yo || vista.ofertas.length === 0 || vista.fase.tipo !== 'acciones') {
    return null;
  }
  const miTurno = esMiTurno(vista, yo.idJugador);
  const nombre = (id: string) => jugadorDe(vista, id)?.nombre ?? id;
  const mano = jugadorDe(vista, yo.idJugador)?.recursos;
  const puedoDar = (r: RecursosParciales) => !!mano && RECURSOS.every((x) => mano[x] >= (r[x] ?? 0));

  return (
    <div className="flex w-80 max-w-full flex-col gap-2">
      {vista.ofertas.map((o: OfertaComercio) => {
        const mia = o.autor === yo.idJugador;
        const paraMi = !mia && (o.destinatario === null || o.destinatario === yo.idJugador);
        const respondida = o.aceptadaPor.includes(yo.idJugador) ? 'aceptada' : o.rechazadaPor.includes(yo.idJugador) ? 'rechazada' : null;
        return (
          <div key={o.id} className="rounded-xl bg-white/95 p-3 text-sm text-slate-800 shadow-lg">
            <p className="mb-2" title={`${describirRecursos(o.ofrece)} por ${describirRecursos(o.pide)}`}>
              <strong>{mia ? 'Tu oferta' : nombre(o.autor)}</strong>
              {o.destinatario && !mia ? ' (contraoferta)' : ''}: da <ResumenRecursos recursos={o.ofrece} /> por{' '}
              <ResumenRecursos recursos={o.pide} />
            </p>
            {mia && (
              <div className="flex flex-wrap gap-2">
                {miTurno &&
                  o.aceptadaPor.map((id) => (
                    <Boton key={id} variante="primario" onClick={() => accion({ tipo: 'confirmarOferta', idOferta: o.id, con: id })}>
                      Cambiar con {nombre(id)}
                    </Boton>
                  ))}
                {o.aceptadaPor.length === 0 && <span className="self-center text-slate-500">Esperando respuestas…</span>}
                {o.rechazadaPor.length > 0 && (
                  <span className="self-center text-xs text-slate-500">Rechazan: {o.rechazadaPor.map(nombre).join(', ')}</span>
                )}
                <Boton variante="fantasma" className="text-slate-600" onClick={() => accion({ tipo: 'retirarOferta', idOferta: o.id })}>
                  Retirar
                </Boton>
              </div>
            )}
            {paraMi && miTurno && o.destinatario === yo.idJugador && (
              <div className="flex gap-2">
                <Boton variante="primario" disabled={!puedoDar(o.pide)} onClick={() => accion({ tipo: 'confirmarOferta', idOferta: o.id, con: o.autor })}>
                  Aceptar
                </Boton>
                <Boton onClick={() => accion({ tipo: 'responderOferta', idOferta: o.id, acepta: false })}>Rechazar</Boton>
              </div>
            )}
            {paraMi && !miTurno && (
              <div className="flex flex-wrap items-center gap-2">
                {respondida ? (
                  <span className="text-slate-500">Has {respondida} la oferta.</span>
                ) : (
                  <>
                    <Boton variante="primario" disabled={!puedoDar(o.pide)} onClick={() => accion({ tipo: 'responderOferta', idOferta: o.id, acepta: true })}>
                      Aceptar
                    </Boton>
                    <Boton onClick={() => accion({ tipo: 'responderOferta', idOferta: o.id, acepta: false })}>Rechazar</Boton>
                  </>
                )}
                <Boton variante="fantasma" className="text-slate-600" onClick={() => alContraofertar({ ofrece: o.pide, pide: o.ofrece })}>
                  Contraoferta
                </Boton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
