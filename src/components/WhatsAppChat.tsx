import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, MessageCircle, RefreshCw, User } from 'lucide-react';

type Chat = {
  phone: string;
  message: string;
  direction: 'in' | 'out';
  timestamp: number;
  lead_id: number | null;
  session_id?: string;
  lead_nombre: string | null;
  lead_modelo: string | null;
  lead_estado: string | null;
};

type Message = {
  id: number;
  phone: string;
  session_id: string;
  direction: 'in' | 'out';
  message: string;
  media_type?: string | null;
  media_url?: string | null;
  timestamp: number;
};

type Props = {
  currentUser: any;
  users: any[];
  /** URL base del bot de WhatsApp (servidor Baileys), sin barra final. */
  botApiUrl: string;
};

const ESTADO_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-yellow-100 text-yellow-700',
  interesado: 'bg-purple-100 text-purple-700',
  vendido: 'bg-green-100 text-green-700',
  perdido: 'bg-gray-100 text-gray-500',
};

function fmtTime(ts: number) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  return esHoy
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppChat({ currentUser, botApiUrl: BOT_URL }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [botActivo, setBotActivo] = useState<boolean | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`${BOT_URL}/api/chats/${currentUser.id}`);
      const data = await res.json();
      setChats(data.chats || []);
    } catch {}
    finally { setLoadingChats(false); }
  }, [currentUser?.id]);

  const loadMessages = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`${BOT_URL}/api/messages/${phone}`);
      const data = await res.json();
      const msgs: Message[] = data.messages || [];
      setMessages(msgs);
      const last = msgs[msgs.length - 1];
      if (last?.session_id) sessionIdRef.current = last.session_id;
    } catch {}
    try {
      const res = await fetch(`${BOT_URL}/api/convo/${phone}`);
      const data = await res.json();
      if (data.ok !== undefined) setBotActivo(data.vendorTakeover === undefined ? null : !data.vendorTakeover);
    } catch {}
  }, []);

  // Poll lista de chats
  useEffect(() => {
    loadChats();
    const i = setInterval(loadChats, 10000);
    return () => clearInterval(i);
  }, [loadChats]);

  // Poll mensajes del chat abierto
  useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    const i = setInterval(() => loadMessages(selected), 5000);
    return () => clearInterval(i);
  }, [selected, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const enviar = async () => {
    const msg = newMessage.trim();
    if (!msg || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${BOT_URL}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected, message: msg, sessionId: sessionIdRef.current })
      });
      const data = await res.json();
      if (data.ok) {
        setNewMessage('');
        await loadMessages(selected);
      } else {
        alert(data.error || 'No se pudo enviar');
      }
    } catch { alert('Error de conexión con el servidor de WhatsApp'); }
    finally { setSending(false); }
  };

  const toggleBot = async () => {
    if (!selected || botActivo === null) return;
    const endpoint = botActivo ? 'takeover' : 'bot-on';
    try {
      await fetch(`${BOT_URL}/api/convo/${selected}/${endpoint}`, { method: 'POST' });
      setBotActivo(!botActivo);
    } catch {}
  };

  const chatSel = chats.find(c => c.phone === selected);
  const chatsFiltrados = chats.filter(c => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (c.lead_nombre || '').toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || '___');
  });

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border overflow-hidden">
      {/* Lista de chats */}
      <div className="w-80 border-r flex flex-col bg-gray-50">
        <div className="p-4 border-b bg-white">
          <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" /> WhatsApp
          </h2>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="mt-2 w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingChats && chats.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" /> Cargando chats...
            </div>
          )}
          {!loadingChats && chatsFiltrados.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              No hay conversaciones todavía.
              <p className="text-xs mt-1">Cuando entren mensajes a los números conectados van a aparecer acá.</p>
            </div>
          )}
          {chatsFiltrados.map(c => (
            <button
              key={c.phone}
              onClick={() => { setSelected(c.phone); setMessages([]); }}
              className={`w-full text-left p-3 border-b hover:bg-white transition-colors ${selected === c.phone ? 'bg-white border-l-4 border-l-green-500' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-800 truncate">
                  {c.lead_nombre || `+${c.phone}`}
                </span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{fmtTime(c.timestamp)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-gray-500 truncate">
                  {c.direction === 'out' ? '↪ ' : ''}{c.message}
                </span>
                {c.lead_estado && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ml-2 ${ESTADO_COLORS[c.lead_estado] || 'bg-gray-100 text-gray-500'}`}>
                    {c.lead_estado}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversación */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Elegí una conversación de la lista</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{chatSel?.lead_nombre || `+${selected}`}</h3>
                  <p className="text-xs text-gray-500">
                    +{selected}{chatSel?.lead_modelo ? ` · ${chatSel.lead_modelo}` : ''}
                  </p>
                </div>
              </div>
              {botActivo !== null && (
                <button
                  onClick={toggleBot}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${botActivo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  <Bot className="w-4 h-4" /> {botActivo ? 'Bot respondiendo' : 'Bot pausado (manual)'}
                </button>
              )}
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efeae2]">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === 'out' ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                    {m.media_type === 'image' && m.media_url && (
                      <img src={`${BOT_URL}${m.media_url}`} alt="imagen" className="rounded mb-1 max-w-full max-h-64" />
                    )}
                    {m.media_type === 'audio' && m.media_url && (
                      <audio controls src={`${BOT_URL}${m.media_url}`} className="mb-1 max-w-full" />
                    )}
                    {m.message && m.message !== '[Audio]' && m.message !== '[Imagen]' && (
                      <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    )}
                    <p className="text-[10px] text-gray-400 text-right mt-0.5">{fmtTime(m.timestamp)}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t bg-white flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                placeholder="Escribí un mensaje..."
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={enviar}
                disabled={sending || !newMessage.trim()}
                className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}