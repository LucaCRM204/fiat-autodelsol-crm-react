import { useState, useEffect, useRef } from 'react';
import { PhoneOff, Clock, Save } from 'lucide-react';

type Props = {
  lead: { id: number; nombre: string; telefono: string };
  onClose: () => void;
  onCallSaved?: () => void;
  apiUrl: string;
  token: string;
};

export default function CallPanel({ lead, onClose, onCallSaved, apiUrl, token }: Props) {
  const [stage, setStage] = useState<'ready' | 'incall' | 'notes'>('ready');
  const [duration, setDuration] = useState(0);
  const [resultado, setResultado] = useState<string>('contactado');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<any>(null);
  const startRef = useRef<number>(Date.now());

  const cleanPhone = (tel: string) => tel.replace(/\D/g, '');

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const openWhatsApp = () => {
    const phone = cleanPhone(lead.telefono);
    window.open(`https://web.whatsapp.com/send?phone=${phone}`, '_blank');
  };

  const startCall = () => {
    openWhatsApp();
    setStage('incall');
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
  };

  const endCall = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStage('notes');
  };

  const saveCall = async () => {
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      await fetch(`${apiUrl}/api/calls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lead_id: lead.id,
          telefono: cleanPhone(lead.telefono),
          duracion_segundos: duration,
          resultado,
          notas
        })
      });
      onCallSaved?.();
      onClose();
    } catch (err) {
      console.error('Error saving call:', err);
    }
    setSaving(false);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        
        {/* Header */}
        <div className={`px-6 py-5 text-white text-center ${
          stage === 'incall' ? 'bg-green-600' : stage === 'notes' ? 'bg-blue-600' : 'bg-green-700'
        }`}>
          <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">{lead.nombre?.[0]?.toUpperCase() || '?'}</span>
          </div>
          <p className="font-bold text-lg">{lead.nombre}</p>
          <p className="text-sm opacity-80">{lead.telefono}</p>
          
          {stage === 'incall' && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-2xl font-mono">{formatTime(duration)}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {stage === 'ready' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 text-center mb-2">Se abrirá WhatsApp Web — llamá desde ahí</p>
              <button
                onClick={startCall}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.89 3.587"/>
                </svg>
                Abrir WhatsApp e iniciar llamada
              </button>
              <button
                onClick={() => setStage('notes')}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
              >
                <PhoneOff size={18} />
                No atendió
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 text-gray-400 text-sm hover:text-gray-600"
              >
                Cancelar
              </button>
            </div>
          )}

          {stage === 'incall' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 text-center">Llamando desde WhatsApp Web...</p>
              <button
                onClick={endCall}
                className="w-full py-4 bg-red-600 text-white rounded-xl font-bold text-lg hover:bg-red-700 flex items-center justify-center gap-2"
              >
                <PhoneOff size={20} />
                Terminé la llamada — {formatTime(duration)}
              </button>
            </div>
          )}

          {stage === 'notes' && (
            <div className="space-y-4">
              {duration > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={14} />
                  <span>Duración: {formatTime(duration)}</span>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Resultado</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'contactado', label: '✅ Contactado', active: 'border-green-500 bg-green-50 text-green-700' },
                    { key: 'no_atiende', label: '📵 No atiende', active: 'border-orange-500 bg-orange-50 text-orange-700' },
                    { key: 'interesado', label: '🔥 Interesado', active: 'border-blue-500 bg-blue-50 text-blue-700' },
                    { key: 'no_interesado', label: '❌ No interesado', active: 'border-red-500 bg-red-50 text-red-700' },
                    { key: 'callback', label: '🔄 Volver a llamar', active: 'border-purple-500 bg-purple-50 text-purple-700' },
                    { key: 'buzon', label: '📫 Buzón de voz', active: 'border-gray-500 bg-gray-50 text-gray-700' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setResultado(opt.key)}
                      className={`px-3 py-2 text-xs rounded-lg border-2 transition-all ${
                        resultado === opt.key
                          ? `${opt.active} font-semibold`
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Notas</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="¿Qué se habló?"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveCall}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-1"
                >
                  <Save size={14} />
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
