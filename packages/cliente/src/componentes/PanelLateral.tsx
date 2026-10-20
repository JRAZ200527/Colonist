import { describirEvento } from '@colonist/motor-compartido';
import { useEffect, useRef, useState } from 'react';
import { useAlmacen } from '../estado/almacen';
import { aCss, COLOR_JUGADOR } from '../tablero/paleta';

/** Registro de la partida y chat, en pestañas. */
export function PanelLateral({ soloChat = false }: { soloChat?: boolean }) {
  const [pestana, setPestana] = useState<'registro' | 'chat'>(soloChat ? 'chat' : 'registro');
  const registro = useAlmacen((s) => s.registro);
  const partida = useAlmacen((s) => s.partida);
  const chat = useAlmacen((s) => s.chat);
  const yo = useAlmacen((s) => s.yo);
  const enviar = useAlmacen((s) => s.enviar);
  const [texto, setTexto] = useState('');
  const final = useRef<HTMLDivElement>(null);
  const [chatSinLeer, setChatSinLeer] = useState(0);
  const chatVisto = useRef(chat.length);

  useEffect(() => {
    final.current?.scrollIntoView({ block: 'end' });
  }, [registro.length, chat.length, pestana]);

  useEffect(() => {
    if (pestana === 'chat') {
      chatVisto.current = chat.length;
      setChatSinLeer(0);
    } else {
      setChatSinLeer(chat.length - chatVisto.current);
    }
  }, [chat.length, pestana]);

  const colorNombre = (id: string | null) => {
    const color = partida?.jugadores.find((j) => j.id === id)?.color;
    return color ? aCss(COLOR_JUGADOR[color]) : undefined;
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-slate-900/80 text-sm text-slate-100">
      {!soloChat && (
        <div className="flex border-b border-white/10">
          {(['registro', 'chat'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`flex-1 px-3 py-2 font-semibold capitalize ${pestana === p ? 'border-b-2 border-amber-400 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {p === 'registro' ? 'Registro' : 'Chat'}
              {p === 'chat' && chatSinLeer > 0 && (
                <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">{chatSinLeer}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {soloChat && <h2 className="border-b border-white/10 px-3 py-2 font-semibold">Chat</h2>}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {pestana === 'registro' && partida
          ? registro.map((evento, i) => (
              <p key={i} className={evento.tipo === 'turnoIniciado' ? 'pt-2 font-semibold text-amber-200' : 'text-slate-200'}>
                {describirEvento(evento, partida, { observador: yo?.idJugador ?? null })}
              </p>
            ))
          : chat.map((m, i) => (
              <p key={i}>
                <span className="font-semibold" style={{ color: colorNombre(m.de) }}>
                  {m.nombre}:
                </span>{' '}
                {m.texto}
              </p>
            ))}
        {pestana === 'chat' && chat.length === 0 && <p className="text-slate-400">Todavía no hay mensajes.</p>}
        <div ref={final} />
      </div>

      {pestana === 'chat' && (
        <form
          className="flex gap-2 border-t border-white/10 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) {
              enviar({ tipo: 'chat', texto: texto.trim() });
              setTexto('');
            }
          }}
        >
          <input
            value={texto}
            maxLength={300}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje…"
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-white outline-none placeholder:text-slate-400"
          />
          <button type="submit" className="rounded-lg bg-amber-500 px-3 font-semibold text-slate-900">
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
