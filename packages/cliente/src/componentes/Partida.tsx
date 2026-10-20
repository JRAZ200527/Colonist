import {
  aristasValidasCarreteraInicial,
  conNavegantes,
  COSTES,
  describirRecursos,
  esAristaValidaCarretera,
  hexagonosValidosPirata,
  NOMBRES_CARTA_PROGRESO,
  type TipoCartaDesarrollo,
  type TipoCartaProgreso,
  type VistaPartida,
} from '@colonist/motor-compartido';
import { accionesCyC, opcionesProgresoVista, type ModoCyC } from '../estado/derivadosCyC';
import { DialogoProgreso } from './DialogosCyC';
import { PanelCyC } from './PanelCyC';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import {
  accionesDisponibles,
  calcularObjetivos,
  instruccion,
  modoEfectivo,
  puedoConstruir,
  type ModoConstruccion,
  type ProgresoPendiente,
} from '../estado/derivados';
import type { Seleccion } from '../tablero/renderizador';
import { Tablero } from '../tablero/Tablero';
import { ModalComercio, PanelOfertas, type PropuestaInicial } from './Comercio';
import { Boton } from './comunes';
import { Dados } from './Dados';
import { DialogoAbundancia, DialogoDescarte, DialogoMonopolio, DialogoOro, DialogoRobo, FinPartida } from './Dialogos';
import { Mano } from './Mano';
import { PanelJugadores } from './PanelJugadores';
import { PanelLateral } from './PanelLateral';

type Dialogo =
  | { tipo: 'comercio'; inicial?: PropuestaInicial }
  | { tipo: 'abundancia' }
  | { tipo: 'monopolio' }
  | { tipo: 'progreso'; carta: TipoCartaProgreso; opciones: Parameters<typeof DialogoProgreso>[0]['opciones'] }
  | null;

const ETIQUETAS_CYC: Record<ModoCyC, { texto: string; coste: string }> = {
  caballero: { texto: 'Caballero', coste: '1 Oveja, 1 Mineral' },
  activarCaballero: { texto: 'Activar', coste: '1 Trigo' },
  ascenderCaballero: { texto: 'Ascender', coste: '1 Oveja, 1 Mineral' },
  moverCaballero: { texto: 'Mover caballero', coste: 'nada (el caballero se desactiva)' },
  expulsarLadron: { texto: 'Expulsar ladrón', coste: 'nada (el caballero se desactiva)' },
  muralla: { texto: 'Muralla', coste: '2 Arcilla' },
};

function BotonConstruir({
  activo,
  disponible,
  atajo,
  coste,
  children,
  onClick,
}: {
  activo: boolean;
  disponible: boolean;
  atajo: string;
  coste: string;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!disponible && !activo}
      onClick={onClick}
      title={`${children} (${atajo}) · Cuesta ${coste}`}
      className={`rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 max-lg:px-2 max-lg:py-1 max-lg:text-xs ${activo ? 'bg-amber-400 text-slate-900' : 'bg-white/90 text-slate-800 hover:bg-white'}`}
    >
      {children} <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">{atajo}</kbd>
    </button>
  );
}

export function Partida({ vista }: { vista: VistaPartida }) {
  const yo = useAlmacen((s) => s.yo);
  const sala = useAlmacen((s) => s.sala);
  const modoElegido = useAlmacen((s) => s.modo);
  const elegirModo = useAlmacen((s) => s.elegirModo);
  const accion = useAlmacen((s) => s.accion);
  const enviar = useAlmacen((s) => s.enviar);
  const ultimaTirada = useAlmacen((s) => s.ultimaTirada);
  const silencio = useAlmacen((s) => s.silencio);
  const alternarSilencio = useAlmacen((s) => s.alternarSilencio);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  // En pantallas estrechas el registro empieza oculto para no tapar el tablero.
  const [panelVisible, setPanelVisible] = useState(() => globalThis.matchMedia?.('(min-width: 1024px)').matches ?? true);

  const id = yo?.idJugador ?? null;
  const modo = modoEfectivo(vista, id, modoElegido);
  // Para mover un barco o un caballero se elige primero cuál y después adónde.
  const [barcoSeleccionado, setBarcoSeleccionado] = useState<string | null>(null);
  // Carta de progreso que espera a que se elijan sus objetivos en el tablero.
  const [progreso, setProgreso] = useState<ProgresoPendiente | null>(null);
  useEffect(() => {
    if (modo !== 'moverBarco' && modo !== 'moverCaballero') {
      setBarcoSeleccionado(null);
    }
    if (modo !== 'progreso') {
      setProgreso(null);
    }
  }, [modo]);
  const objetivos = useMemo(
    () => calcularObjetivos(vista, id, modo, barcoSeleccionado, progreso),
    [vista, id, modo, barcoSeleccionado, progreso],
  );
  const disponiblesCyC = accionesCyC(vista, id);

  const lanzarProgreso = useCallback(
    (pendiente: ProgresoPendiente) => {
      const clave = pendiente.opciones.necesita === 'arista' ? 'arista' : pendiente.opciones.necesita;
      accion({
        tipo: 'jugarProgreso',
        carta: pendiente.carta,
        ...(clave === 'arista' ? { arista: pendiente.elegidos[0] } : { [clave]: pendiente.elegidos }),
      });
      setProgreso(null);
    },
    [accion],
  );
  const disponibles = accionesDisponibles(vista, id);
  const fase = vista.fase;
  const navegantes = conNavegantes(vista);

  const alSeleccionar = useCallback(
    (seleccion: Seleccion) => {
      const inicial = fase.tipo === 'colocacionInicial';
      if (seleccion.tipo === 'vertice' && modo === 'poblado') {
        accion(inicial ? { tipo: 'colocarPobladoInicial', vertice: seleccion.id } : { tipo: 'construirPoblado', vertice: seleccion.id });
      } else if (seleccion.tipo === 'vertice' && modo === 'ciudad') {
        accion({ tipo: 'construirCiudad', vertice: seleccion.id });
      } else if (seleccion.tipo === 'arista' && modo === 'carretera') {
        // En la colocación inicial y con Construcción de Carreteras, una arista de solo mar es un barco.
        const esCarretera = id !== null && (inicial
          ? fase.ultimoPoblado !== null && aristasValidasCarreteraInicial(vista, fase.ultimoPoblado).includes(seleccion.id)
          : esAristaValidaCarretera(vista, id, seleccion.id));
        if (inicial) {
          accion(esCarretera ? { tipo: 'colocarCarreteraInicial', arista: seleccion.id } : { tipo: 'colocarBarcoInicial', arista: seleccion.id });
        } else {
          accion(esCarretera ? { tipo: 'construirCarretera', arista: seleccion.id } : { tipo: 'construirBarco', arista: seleccion.id });
        }
      } else if (seleccion.tipo === 'arista' && modo === 'barco') {
        accion({ tipo: 'construirBarco', arista: seleccion.id });
      } else if (seleccion.tipo === 'arista' && modo === 'moverBarco') {
        if (barcoSeleccionado === null) {
          setBarcoSeleccionado(seleccion.id);
        } else {
          accion({ tipo: 'moverBarco', desde: barcoSeleccionado, hasta: seleccion.id });
          setBarcoSeleccionado(null);
        }
      } else if (seleccion.tipo === 'hexagono' && modo === 'ladron') {
        const esMar = hexagonosValidosPirata(vista).includes(seleccion.id);
        accion(esMar ? { tipo: 'moverPirata', hexagono: seleccion.id } : { tipo: 'moverLadron', hexagono: seleccion.id });
      } else if (modo === 'progreso' && progreso) {
        const pendiente = { ...progreso, elegidos: [...progreso.elegidos, seleccion.id] };
        const maximo = pendiente.opciones.necesita === 'arista' ? 1 : pendiente.opciones.maximo;
        if (pendiente.elegidos.length >= maximo) {
          lanzarProgreso(pendiente);
        } else {
          setProgreso(pendiente);
        }
      } else if (seleccion.tipo === 'vertice') {
        const vertice = seleccion.id;
        switch (modo) {
          case 'caballero':
            accion({ tipo: 'construirCaballero', vertice });
            break;
          case 'activarCaballero':
            accion({ tipo: 'activarCaballero', vertice });
            break;
          case 'ascenderCaballero':
            accion({ tipo: 'ascenderCaballero', vertice });
            break;
          case 'muralla':
            accion({ tipo: 'construirMuralla', vertice });
            break;
          case 'expulsarLadron':
            accion({ tipo: 'expulsarLadron', vertice });
            break;
          case 'moverCaballero':
            if (barcoSeleccionado === null) {
              setBarcoSeleccionado(vertice);
            } else {
              accion({ tipo: 'moverCaballero', desde: barcoSeleccionado, hasta: vertice });
              setBarcoSeleccionado(null);
            }
            break;
        }
      }
    },
    [accion, modo, fase, vista, id, barcoSeleccionado, progreso, lanzarProgreso],
  );

  const jugarProgreso = useCallback(
    (carta: TipoCartaProgreso) => {
      if (!id) {
        return;
      }
      const opciones = opcionesProgresoVista(vista, id, carta);
      if (!opciones) {
        return;
      }
      if (opciones.necesita === 'vertices' || opciones.necesita === 'hexagonos' || opciones.necesita === 'arista') {
        elegirModo('progreso');
        setProgreso({ carta, opciones, elegidos: [] });
      } else {
        setDialogo({ tipo: 'progreso', carta, opciones });
      }
    },
    [vista, id, elegirModo],
  );

  const jugarCarta = useCallback(
    (tipo: TipoCartaDesarrollo) => {
      if (tipo === 'caballero') {
        accion({ tipo: 'jugarCaballero' });
      } else if (tipo === 'construccionCarreteras') {
        accion({ tipo: 'jugarConstruccionCarreteras' });
      } else if (tipo === 'abundancia') {
        setDialogo({ tipo: 'abundancia' });
      } else if (tipo === 'monopolio') {
        setDialogo({ tipo: 'monopolio' });
      }
    },
    [accion],
  );

  // Atajos de teclado: R carretera, S poblado, C ciudad, D carta, Espacio dados / fin de turno.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (dialogo || destino?.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const atajos: Record<string, () => void> = {
        r: () => disponibles.carretera && elegirModo('carretera'),
        s: () => disponibles.poblado && elegirModo('poblado'),
        c: () => disponibles.ciudad && elegirModo('ciudad'),
        d: () => disponibles.cartaDesarrollo && accion({ tipo: 'comprarCartaDesarrollo' }),
        b: () => disponibles.barco && elegirModo('barco'),
        k: () => disponiblesCyC?.caballero && elegirModo('caballero'),
        m: () => disponibles.moverBarco && elegirModo('moverBarco'),
        ' ': () => {
          if (disponibles.tirarDados) {
            accion({ tipo: 'tirarDados' });
          } else if (disponibles.finalizarTurno) {
            accion({ tipo: 'finalizarTurno' });
          } else if (disponibles.pasarConstruccion) {
            accion({ tipo: 'terminarConstruccionEspecial' });
          }
        },
        escape: () => elegirModo('ninguno'),
      };
      const accionTecla = atajos[e.key.toLowerCase()];
      if (accionTecla) {
        e.preventDefault();
        accionTecla();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [disponibles, dialogo, accion, elegirModo]);

  const descartePendiente = fase.tipo === 'descartar' && id ? fase.pendientes[id] : undefined;
  const oroPendiente = fase.tipo === 'elegirOro' && id ? fase.pendientes[id] : undefined;
  const construir = (m: ModoConstruccion) => elegirModo(m);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2f7fc0] text-white">
      <Tablero vista={vista} objetivos={objetivos} alSeleccionar={alSeleccionar} />

      {/* Barra superior */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto rounded-xl bg-slate-900/80 px-3 py-2 text-sm">
          <p className="font-bold">{sala?.nombre}</p>
          <p className="text-xs text-slate-300">
            Turno {vista.turno.numero} · {vista.configuracion.puntosVictoria} PV para ganar
            {vista.cyc ? '' : ` · Mazo: ${vista.cartasEnMazo}`}
          </p>
        </div>
        <p className="pointer-events-auto max-w-md rounded-full bg-slate-900/85 px-4 py-2 text-center text-sm font-semibold shadow-lg" role="status">
          {instruccion(vista, id)}
        </p>
        <div className="pointer-events-auto flex gap-2">
          <Boton variante="secundario" onClick={alternarSilencio} title={silencio ? 'Activar sonido' : 'Silenciar'} aria-label={silencio ? 'Activar sonido' : 'Silenciar'}>
            {silencio ? '🔇' : '🔊'}
          </Boton>
          <Boton variante="secundario" className="lg:hidden" onClick={() => setPanelVisible((v) => !v)}>
            {panelVisible ? 'Ocultar registro' : 'Registro'}
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              if (fase.tipo === 'finalizada' || window.confirm('¿Seguro que quieres abandonar la partida? Un bot jugará por ti.')) {
                enviar({ tipo: 'salirSala' });
              }
            }}
          >
            Salir
          </Boton>
        </div>
      </header>

      {/* Jugadores */}
      <aside className="absolute left-3 top-28 flex max-h-[calc(100vh-17rem)] w-60 max-w-[40vw] origin-top-left flex-col gap-2 overflow-y-auto overflow-x-hidden max-lg:scale-[0.8]">
        <PanelJugadores vista={vista} />
        <PanelCyC vista={vista} />
      </aside>

      {/* Registro y chat */}
      {panelVisible && (
        <aside className="absolute bottom-40 right-3 top-24 w-80 max-w-[calc(100vw-1.5rem)]">
          <PanelLateral />
        </aside>
      )}

      {/* Ofertas de comercio */}
      <div className="absolute bottom-40 left-3">
        <PanelOfertas vista={vista} alContraofertar={(inicial) => setDialogo({ tipo: 'comercio', inicial })} />
      </div>

      {/* Mano y acciones */}
      <footer className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-slate-950/80 to-transparent p-3 pt-8">
        <div className="flex flex-col gap-2">
          {progreso && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 text-sm">
              <span>
                {NOMBRES_CARTA_PROGRESO[progreso.carta]}: elige en el tablero ({progreso.elegidos.length}/
                {progreso.opciones.necesita === 'arista' ? 1 : progreso.opciones.maximo})
              </span>
              {progreso.opciones.necesita !== 'arista' && progreso.elegidos.length >= progreso.opciones.minimo && (
                <Boton variante="primario" onClick={() => lanzarProgreso(progreso)}>
                  Jugar
                </Boton>
              )}
              <Boton variante="fantasma" onClick={() => elegirModo('ninguno')}>
                Cancelar
              </Boton>
            </div>
          )}
          <Mano vista={vista} alJugarCarta={jugarCarta} alJugarProgreso={jugarProgreso} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Dados dados={ultimaTirada?.dados ?? vista.turno.dados} numero={ultimaTirada?.numero ?? 0} />
          {disponibles.tirarDados ? (
            <Boton variante="primario" className="px-5" onClick={() => accion({ tipo: 'tirarDados' })}>
              Tirar dados <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">Espacio</kbd>
            </Boton>
          ) : !id || !puedoConstruir(vista, id) ? null : (
            <>
              <BotonConstruir activo={modo === 'carretera' && fase.tipo === 'acciones'} disponible={disponibles.carretera} atajo="R" coste={describirRecursos(COSTES.carretera)} onClick={() => construir('carretera')}>
                Carretera
              </BotonConstruir>
              <BotonConstruir activo={modo === 'poblado' && fase.tipo === 'acciones'} disponible={disponibles.poblado} atajo="S" coste={describirRecursos(COSTES.poblado)} onClick={() => construir('poblado')}>
                Poblado
              </BotonConstruir>
              <BotonConstruir activo={modo === 'ciudad'} disponible={disponibles.ciudad} atajo="C" coste={describirRecursos(COSTES.ciudad)} onClick={() => construir('ciudad')}>
                Ciudad
              </BotonConstruir>
              {!vista.cyc && (
                <BotonConstruir activo={false} disponible={disponibles.cartaDesarrollo} atajo="D" coste={describirRecursos(COSTES.cartaDesarrollo)} onClick={() => accion({ tipo: 'comprarCartaDesarrollo' })}>
                  Carta
                </BotonConstruir>
              )}
              {disponiblesCyC &&
                (Object.keys(ETIQUETAS_CYC) as ModoCyC[]).map((m) => (
                  <BotonConstruir
                    key={m}
                    activo={modo === m}
                    disponible={disponiblesCyC[m]}
                    atajo={m === 'caballero' ? 'K' : '·'}
                    coste={ETIQUETAS_CYC[m].coste}
                    onClick={() => construir(m)}
                  >
                    {m === 'moverCaballero' && barcoSeleccionado ? 'Elige destino' : ETIQUETAS_CYC[m].texto}
                  </BotonConstruir>
                ))}
              {navegantes && (
                <>
                  <BotonConstruir activo={modo === 'barco'} disponible={disponibles.barco} atajo="B" coste={describirRecursos(COSTES.barco)} onClick={() => construir('barco')}>
                    Barco
                  </BotonConstruir>
                  <BotonConstruir activo={modo === 'moverBarco'} disponible={disponibles.moverBarco} atajo="M" coste="nada (1 por turno)" onClick={() => construir('moverBarco')}>
                    {barcoSeleccionado ? 'Elige destino' : 'Mover barco'}
                  </BotonConstruir>
                </>
              )}
              {disponibles.pasarConstruccion ? (
                <Boton variante="primario" onClick={() => accion({ tipo: 'terminarConstruccionEspecial' })}>
                  Pasar <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">Espacio</kbd>
                </Boton>
              ) : (
                <>
                  <Boton disabled={vista.fase.tipo !== 'acciones'} onClick={() => setDialogo({ tipo: 'comercio' })}>
                    Comerciar
                  </Boton>
                  <Boton variante="primario" disabled={!disponibles.finalizarTurno} onClick={() => accion({ tipo: 'finalizarTurno' })}>
                    Terminar turno <kbd className="ml-1 rounded bg-black/10 px-1 text-xs">Espacio</kbd>
                  </Boton>
                </>
              )}
            </>
          )}
        </div>
      </footer>

      {/* Diálogos */}
      {descartePendiente !== undefined && <DialogoDescarte key={descartePendiente} vista={vista} cantidad={descartePendiente} />}
      {oroPendiente !== undefined && <DialogoOro key={`oro-${oroPendiente}`} vista={vista} cantidad={oroPendiente} />}
      {fase.tipo === 'robar' && vista.jugadores[vista.turno.jugadorActual]?.id === id && <DialogoRobo vista={vista} victimas={fase.victimas} />}
      {dialogo?.tipo === 'comercio' && <ModalComercio vista={vista} inicial={dialogo.inicial} alCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'abundancia' && <DialogoAbundancia vista={vista} alCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'monopolio' && <DialogoMonopolio alCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'progreso' && (
        <DialogoProgreso vista={vista} carta={dialogo.carta} opciones={dialogo.opciones} alCerrar={() => setDialogo(null)} />
      )}
      <FinPartida vista={vista} />
    </div>
  );
}
