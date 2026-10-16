import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, Phone, X, RefreshCw, CheckCheck, MessageCircle, Mic, PhoneCall, Paperclip } from 'lucide-react';

type Message = {
  id: number;
  phone: string;
  session_id: string;
  direction: 'in' | 'out';
  message: string;
  media_type?: string | null;
  media_url?: string | null;
  timestamp: number;
  created_at: string;
  lead_id?: number | null;
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
  waApiUrl?: string;
};

export default function WhatsAppPanel({ lead, onClose, waApiUrl }: Props) {
  // waApiUrl es requerido en la práctica: pasarlo desde el punto de uso
  // (ver ejemplo en CRM.tsx). Sin URL no hay a dónde pegarle.
  if (!waApiUrl) {
    console.warn('WhatsAppPanel: falta la prop waApiUrl, el panel no va a poder conectar al bot.');
  }
  const baseUrl = waApiUrl || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [noChat, setNoChat] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanPhone = (tel: string) => tel.replace(/\D/g, '');

  // ============================================
  // LOAD CHAT - uses bot's actual endpoints
  // ============================================
  const loadChat = useCallback(async () => {
    try {
      const phone = cleanPhone(lead.telefono);

      // Get conversation info via /api/convo/:phone
      const convoRes = await fetch(`${baseUrl}/api/convo/${phone}`);
      const convoData = await convoRes.json();

      if (!convoData.ok) {
        setNoChat(true);
        setLoading(false);
        return;
      }

      setConversation({
        phone: phone,
        nombre: convoData.nombre || null,
        modelo: convoData.modelo || null,
        step: convoData.step || null,
        origen: convoData.origen || null,
        vendorTakeover: convoData.vendorTakeover || convoData.vendor_takeover || false,
      });
      if (convoData.session_id) sessionIdRef.current = convoData.session_id;
      setNoChat(false);

      // Get messages via /api/messages/:phone
      const msgsRes = await fetch(`${baseUrl}/api/messages/${phone}`);
      const msgsData = await msgsRes.json();

      if (msgsData.ok && msgsData.messages) {
        setMessages(msgsData.messages);
        // Extract session_id from latest message for sending
        const lastMsg = msgsData.messages[msgsData.messages.length - 1];
        if (lastMsg?.session_id) sessionIdRef.current = lastMsg.session_id;
      }

      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Error loading chat:', err);
      setNoChat(true);
      setLoading(false);
    }
  }, [lead.telefono, baseUrl]);

  useEffect(() => {
    loadChat();
    // Poll every 10s for new messages
    pollRef.current = setInterval(loadChat, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [lead.id, loadChat]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [conversation]);

  // ============================================
  // SEND TEXT via /api/send
  // ============================================
  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const msg = newMessage.trim();
    setNewMessage('');
    setSending(true);
    try {
      const phone = cleanPhone(lead.telefono);
      await fetch(`${baseUrl}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: msg, sessionId: sessionIdRef.current })
      });
      // Reload after a short delay to get the sent message
      setTimeout(loadChat, 1000);
    } catch (err) {
      console.error('Error sending:', err);
      setNewMessage(msg);
    }
    setSending(false);
  };

  // ============================================
  // AUDIO RECORDING
  // ============================================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        if (blob.size < 1000) return;
        await sendAudio(blob);
      };
      mediaRecorder.start(100);
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Error mic:', err);
      alert('No se pudo acceder al micrófono.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const cancelRecording = () => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecording(false);
    setRecordingTime(0);
  };

  const sendAudio = async (blob: Blob) => {
    setSending(true);
    try {
      const phone = cleanPhone(lead.telefono);
      const buffer = await blob.arrayBuffer();
      await fetch(
        `${baseUrl}/api/send-audio?phone=${phone}&sessionId=${sessionIdRef.current || ''}`,
        { method: 'POST', body: buffer }
      );
      setTimeout(loadChat, 1000);
    } catch (err) { console.error('Error sending audio:', err); }
    setSending(false);
  };

  const sendImage = async (file: File) => {
    setSending(true);
    try {
      const phone = cleanPhone(lead.telefono);
      const buffer = await file.arrayBuffer();
      await fetch(
        `${baseUrl}/api/send-image?phone=${phone}&sessionId=${sessionIdRef.current || ''}`,
        { method: 'POST', body: buffer }
      );
      setTimeout(loadChat, 1000);
    } catch (err) { console.error('Error sending image:', err); }
    setSending(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      sendImage(file);
    }
    e.target.value = '';
  };

  const formatRecTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ============================================
  // TAKEOVER via /api/convo/:phone/takeover|bot-on
  // ============================================
  const takeover = async (action: 'take' | 'release') => {
    const phone = cleanPhone(lead.telefono);
    const endpoint = action === 'take' ? 'takeover' : 'bot-on';
    await fetch(`${baseUrl}/api/convo/${phone}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    setTimeout(loadChat, 500);
  };

  // ============================================
  // RENDER MESSAGE
  // ============================================
  const renderMessage = (msg: Message) => {
    const isOut = msg.direction === 'out';
    const isAudio = msg.media_type === 'audio' && msg.media_url;
    const isImage = msg.media_type === 'image' && msg.media_url;
    const mediaFullUrl = msg.media_url ? `${baseUrl}${msg.media_url}` : null;
    return (
      <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] px-3 py-2 rounded-lg shadow-sm ${
          isOut ? 'bg-green-100 text-gray-800 rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none'
        }`}>
          {isOut && (
            <p className="text-[10px] font-semibold mb-0.5 text-green-700">
              👤 Enviado
            </p>
          )}
          {isAudio ? (
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="text-lg">🎤</span>
              <audio controls preload="none" className="h-8 max-w-[220px]" style={{ minWidth: '180px' }}>
                <source src={mediaFullUrl!} type="audio/ogg" />
              </audio>
            </div>
          ) : isImage ? (
            <div>
              <img src={mediaFullUrl!} alt="Imagen" className="max-w-[250px] rounded-lg cursor-pointer"
                onClick={() => window.open(mediaFullUrl!, '_blank')} />
              {msg.message && msg.message !== '[Imagen]' && <p className="text-sm mt-1">{msg.message}</p>}
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-gray-400">
              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            {isOut && <CheckCheck size={12} className="text-blue-400" />}
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-50">
      <div className="w-full max-w-lg bg-white flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {lead.nombre?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-semibold">{lead.nombre}</p>
              <p className="text-green-200 text-xs flex items-center gap-1">
                <Phone size={10} /> {lead.telefono}
                {lead.modelo && <span className="ml-1">• 🚗 {lead.modelo}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`tel:${cleanPhone(lead.telefono)}`} className="p-2 hover:bg-green-500 rounded-lg transition-colors" title="Llamar">
              <PhoneCall size={20} />
            </a>
            <button onClick={onClose} className="p-2 hover:bg-green-500 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Status */}
        {conversation && (
          <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              {conversation.vendorTakeover
                ? <><User size={12} className="text-green-600" /> Vendedor en control</>
                : <><Bot size={12} className="text-blue-500" /> Bot atendiendo</>
              }
              {conversation.origen && <span className="ml-2 text-gray-400">• Origen: {conversation.origen}</span>}
            </span>
            {!conversation.vendorTakeover ? (
              <button onClick={() => takeover('take')} className="text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700">Tomar chat</button>
            ) : (
              <button onClick={() => takeover('release')} className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200">🤖 Devolver al bot</button>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#e5ddd5', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c5bfb5\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-gray-400" size={24} /></div>
          ) : noChat ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <MessageCircle size={48} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay conversación de WhatsApp</p>
              <p className="text-xs mt-1">Este lead no tiene chat activo todavía</p>
            </div>
          ) : messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t p-3">
          {recording ? (
            <div className="flex items-center gap-3">
              <button onClick={cancelRecording} className="p-2.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200" title="Cancelar"><X size={18} /></button>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-red-600">Grabando... {formatRecTime(recordingTime)}</span>
              </div>
              <button onClick={stopRecording} className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700" title="Enviar audio"><Send size={18} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} disabled={sending}
                className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100" title="Enviar imagen">
                <Paperclip size={18} />
              </button>
              <input ref={inputRef} type="text" placeholder="Escribí un mensaje..."
                value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="flex-1 px-4 py-2.5 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                disabled={sending} />
              {newMessage.trim() ? (
                <button onClick={handleSend} disabled={sending} className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700"><Send size={18} /></button>
              ) : (
                <button onClick={startRecording} disabled={sending} className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700" title="Grabar audio"><Mic size={18} /></button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
