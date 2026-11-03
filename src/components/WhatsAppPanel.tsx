/**
 * ============================================
 * CHAT DE WHATSAPP DE UN LEAD
 * ============================================
 * Lee la charla desde el backend del CRM (/api/whatsapp/leads/:id), que la
 * busca en la base por lead_id o por teléfono, con el login del CRM.
 * Los mensajes salen por el bot desde el número del vendedor. Si el bot
 * todavía estaba atendiendo, al escribir el vendedor toma la charla.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, Phone, X, RefreshCw, CheckCheck, MessageCircle, PhoneCall, Paperclip } from 'lucide-react';
import { api } from '../api';

type Message = {
  id: number;
  phone: string;
  session_id: string;
  direction: 'in' | 'out';
  sent_by?: 'cliente' | 'bot' | 'vendedor' | 'agente' | null;
  message: string;
  media_type?: string | null;
  media_url?: string | null;
  timestamp: number;
  created_at: string;
};

type Conversation = {
  phone: string;
  nombre: string | null;
  modelo: string | null;
  step: string | null;
  origen: string | null;
  vendorTakeover: boolean;
};

type Props = {
  lead: { id: number; nombre: string; telefono: string; modelo?: string };
  onClose: () => void;
  /** Ya no se usa: el chat va por el backend del CRM. Se deja para no romper llamadas existentes. */
  waApiUrl?: string;
};

const AUTOR: Record<string, string> = {
  bot: '🤖 Bot',
  vendedor: '👤 Vendedor',
  agente: '🤖 Agente IA',
};

const errorDe = (e: any, fallback: string) => e?.response?.data?.error || fallback;

function hora(m: Message) {
  const d = m.timestamp ? new Date(Number(m.timestamp)) : new Date(m.created_at);
  if (isNaN(d.getTime())) return '';
  const hoy = new Date().toDateString() === d.toDateString();
  return hoy
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppPanel({ lead, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef(0);

  const cleanPhone = (tel: string) => tel.replace(/\D/g, '');

  const loadChat = useCallback(async () => {
    try {
      const res = await api.get(`/whatsapp/leads/${lead.id}`);
      setConversation(res.data.conversation || null);
      const msgs: Message[] = res.data.messages || [];
      setMessages(msgs);
      setError(null);
      if (msgs.length !== cantidadRef.current) {
        cantidadRef.current = msgs.length;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      setError(errorDe(e, 'No se pudo cargar la charla'));
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    cantidadRef.current = 0;
    setLoading(true);
    loadChat();
    const t = setInterval(loadChat, 8000);
    return () => clearInterval(t);
  }, [loadChat]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [lead.id]);

  const handleSend = async () => {
    const msg = newMessage.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/leads/${lead.id}/send`, { message: msg });
      setNewMessage('');
      await loadChat();
    } catch (e) {
      alert(errorDe(e, 'No se pudo enviar el mensaje'));
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { alert('La imagen pesa más de 8 MB'); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { alert('Solo JPG, PNG o WEBP'); return; }
    setSending(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('No se pudo leer la imagen'));
        r.readAsDataURL(file);
      });
      await api.post(`/whatsapp/leads/${lead.id}/send-image`, {
        base64,
        mimetype: file.type,
        caption: newMessage.trim() || undefined,
      });
      setNewMessage('');
      await loadChat();
    } catch (e) {
      alert(errorDe(e, 'No se pudo enviar la imagen'));
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendImage(file);
    e.target.value = '';
  };

  const takeover = async (vendedor: boolean) => {
    try {
      await api.post(`/whatsapp/leads/${lead.id}/takeover`, { vendedor });
      await loadChat();
    } catch (e) {
      alert(errorDe(e, 'No se pudo cambiar quién atiende la charla'));
    }
  };

  const renderMessage = (msg: Message) => {
    const isOut = msg.direction === 'out';
    const autor = isOut ? AUTOR[msg.sent_by || 'bot'] || '👤 Enviado' : null;
    return (
      <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] px-3 py-2 rounded-lg shadow-sm ${
          isOut ? 'bg-green-100 text-gray-800 rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'
        }`}>
          {autor && <p className="text-[10px] font-semibold mb-0.5 text-green-700">{autor}</p>}
          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-gray-400">{hora(msg)}</span>
            {isOut && <CheckCheck size={12} className="text-blue-400" />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white flex flex-col h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
              {lead.nombre?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{lead.nombre}</p>
              <p className="text-green-200 text-xs flex items-center gap-1">
                <Phone size={10} /> {lead.telefono}
                {lead.modelo && <span className="ml-1">• 🚗 {lead.modelo}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadChat} className="p-2 hover:bg-green-500 rounded-lg transition-colors" title="Actualizar">
              <RefreshCw size={18} />
            </button>
            <a href={`tel:${cleanPhone(lead.telefono)}`} className="p-2 hover:bg-green-500 rounded-lg transition-colors" title="Llamar">
              <PhoneCall size={20} />
            </a>
            <button onClick={onClose} className="p-2 hover:bg-green-500 rounded-lg transition-colors" aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Quién atiende */}
        {conversation && (
          <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              {conversation.vendorTakeover
                ? <><User size={12} className="text-green-600" /> Vendedor en control</>
                : <><Bot size={12} className="text-blue-500" /> Bot atendiendo</>}
              {conversation.origen && <span className="ml-2 text-gray-400">• Origen: {conversation.origen}</span>}
            </span>
            {!conversation.vendorTakeover ? (
              <button onClick={() => takeover(true)} className="text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700">Tomar chat</button>
            ) : (
              <button onClick={() => takeover(false)} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200">🤖 Devolver al bot</button>
            )}
          </div>
        )}

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#e5ddd5' }}>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-gray-400" size={24} /></div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-center px-6">
              <MessageCircle size={48} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">Todavía no hay mensajes con este cliente</p>
              <p className="text-xs mt-1">Si le escribís acá, sale desde el WhatsApp del vendedor asignado.</p>
            </div>
          ) : messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>

        {/* Escribir */}
        <div className="bg-white border-t p-3">
          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} disabled={sending}
              className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50" title="Enviar imagen (lo que escribas va como texto de la foto)">
              <Paperclip size={18} />
            </button>
            <input ref={inputRef} type="text" placeholder="Escribí un mensaje..."
              value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              className="flex-1 px-4 py-2.5 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              disabled={sending} />
            <button onClick={handleSend} disabled={sending || !newMessage.trim()}
              className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50" aria-label="Enviar">
              {sending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
