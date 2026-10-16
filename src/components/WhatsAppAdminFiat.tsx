import { useState, useEffect, useCallback } from 'react';

interface WASession {
  supervisorId: number;
  supervisorName: string;
  role: string;
  status: string;
  phone: string | null;
  // El bot Fiat devuelve un mapa { cronos: true, argo: false, ... }.
  videos?: Record<string, boolean>;
  // Compatibilidad con bots viejos que devuelven hasVideo<Modelo>.
  [legacy: string]: unknown;
}

interface Usuario { id: number; name: string; role: string; }

// ===== MODELOS FIAT =====
// El "key" es lo que viaja al bot (ad-mapping y /video/:modelo).
// Para sumar o sacar modelos, tocar solo esta lista.
export const MODELOS_FIAT = [
  { key: 'cronos',   label: 'Cronos' },
  { key: 'argo',     label: 'Argo' },
  { key: 'mobi',     label: 'Mobi' },
  { key: 'pulse',    label: 'Pulse' },
  { key: 'fastback', label: 'Fastback' },
  { key: 'strada',   label: 'Strada' },
  { key: 'toro',     label: 'Toro' },
  { key: 'titano',   label: 'Titano' },
] as const;

type ModeloFiat = typeof MODELOS_FIAT[number]['key'];

const labelModelo = (key: string) =>
  MODELOS_FIAT.find(m => m.key === key)?.label ?? key;

const tieneVideo = (s: WASession, modelo: string): boolean => {
  if (s.videos && typeof s.videos[modelo] === 'boolean') return s.videos[modelo];
  const legacyKey = `hasVideo${modelo.charAt(0).toUpperCase()}${modelo.slice(1)}`;
  return s[legacyKey] === true;
};

const ROL_LABEL: Record<string, string> = { gerente: 'Gerencia', supervisor: 'Supervisión', vendedor: 'Vendedor' };

interface AdMapping {
  id: number;
  source_id: string;
  modelo: ModeloFiat;
  descripcion: string | null;
  created_at: string;
}

interface Props {
  botApiUrl: string;
  title?: string;
}

export default function WhatsAppAdminFiat({ botApiUrl, title = 'WhatsApp Admin — Fiat' }: Props) {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginErr, setLoginErr] = useState(false);
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [qrs, setQrs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pollingIds, setPollingIds] = useState<Set<number>>(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [selUser, setSelUser] = useState<string>('');

  const [uploadingVideo, setUploadingVideo] = useState<Record<string, boolean>>({});

  const [showAdMapping, setShowAdMapping] = useState(false);
  const [adMapping, setAdMapping] = useState<AdMapping[]>([]);
  const [newSourceId, setNewSourceId] = useState('');
  const [newModelo, setNewModelo] = useState<ModeloFiat>(MODELOS_FIAT[0].key);
  const [newDescripcion, setNewDescripcion] = useState('');

  const hdrs = useCallback(() => ({ 'Content-Type': 'application/json', 'x-admin-password': pw }), [pw]);

  const doLogin = async () => {
    try {
      const res = await fetch(`${botApiUrl}/api/sessions`, { headers: { 'x-admin-password': pw } });
      if (res.ok) { setAuthed(true); setLoginErr(false); }
      else setLoginErr(true);
    } catch { setLoginErr(true); }
  };

  const load = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await fetch(`${botApiUrl}/api/sessions`, { headers: hdrs() });
      if (!res.ok) { setError('Error conectando'); return; }
      const data = await res.json();
      setSessions(data.sessions || []);
      setError('');
      for (const s of (data.sessions || [])) {
        if (s.status === 'qr_ready') loadQR(s.supervisorId);
      }
    } catch { setError('No se pudo conectar al servidor del bot'); }
    finally { setLoading(false); }
  }, [authed, botApiUrl, pw]);

  const loadUsuarios = useCallback(async () => {
    try {
      const res = await fetch(`${botApiUrl}/api/usuarios`, { headers: hdrs() });
      const data = await res.json();
      setUsuarios(data.usuarios || []);
    } catch { /* silencioso, no es crítico */ }
  }, [botApiUrl, pw]);

  const loadAdMapping = useCallback(async () => {
    try {
      const res = await fetch(`${botApiUrl}/api/ad-mapping`, { headers: hdrs() });
      const data = await res.json();
      setAdMapping(data.mapeo || []);
    } catch { /* silencioso */ }
  }, [botApiUrl, pw]);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    load();
    loadUsuarios();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [authed, load, loadUsuarios]);

  const loadQR = async (id: number) => {
    try {
      // El QR es sensible, la ruta pide password igual que el resto —
      // ver la nota en admin.js del bot.
      const res = await fetch(`${botApiUrl}/api/sessions/${id}/qr`, { headers: hdrs() });
      const data = await res.json();
      if (data.status === 'qr_ready' && data.qr) setQrs(p => ({ ...p, [id]: data.qr }));
      else if (data.status === 'connected') { setQrs(p => { const n = { ...p }; delete n[id]; return n; }); load(); }
    } catch { /* silencioso */ }
  };

  const pollForQR = (id: number) => {
    setPollingIds(p => new Set(p).add(id));
    let a = 0;
    const interval = setInterval(async () => {
      a++;
      if (a > 60) { clearInterval(interval); setPollingIds(p => { const n = new Set(p); n.delete(id); return n; }); return; }
      try {
        const res = await fetch(`${botApiUrl}/api/sessions/${id}/qr`, { headers: hdrs() });
        const data = await res.json();
        if (data.status === 'connected') {
          clearInterval(interval);
          setPollingIds(p => { const n = new Set(p); n.delete(id); return n; });
          setQrs(p => { const n = { ...p }; delete n[id]; return n; });
          load();
        } else if (data.status === 'qr_ready' && data.qr) {
          setQrs(p => ({ ...p, [id]: data.qr }));
        }
      } catch { /* silencioso */ }
    }, 3000);
  };

  const startSession = async (id: number, name: string) => {
    await fetch(`${botApiUrl}/api/sessions/${id}/start`, {
      method: 'POST', headers: hdrs(), body: JSON.stringify({ name })
    });
    pollForQR(id);
    setTimeout(load, 1500);
  };

  const conectarNuevo = async () => {
    const id = parseInt(selUser);
    if (!id) return;
    const u = usuarios.find(x => x.id === id);
    await startSession(id, u?.name || `Usuario ${id}`);
    setShowAdd(false);
    setSelUser('');
  };

  const stopSession = async (id: number) => {
    await fetch(`${botApiUrl}/api/sessions/${id}/stop`, { method: 'POST', headers: hdrs() });
    setTimeout(load, 1000);
  };

  const logoutSession = async (id: number) => {
    if (!confirm('¿Cerrar sesión de WhatsApp? Vas a tener que escanear el QR de nuevo.')) return;
    await fetch(`${botApiUrl}/api/sessions/${id}/logout`, { method: 'POST', headers: hdrs() });
    setQrs(p => { const n = { ...p }; delete n[id]; return n; });
    setTimeout(load, 1000);
  };

  const eliminarSesion = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar por completo el bot de ${nombre}? Esto borra la sesión de WhatsApp y los videos configurados.`)) return;
    await fetch(`${botApiUrl}/api/sessions/${id}`, { method: 'DELETE', headers: hdrs() });
    setTimeout(load, 1000);
  };

  const subirVideo = async (id: number, modelo: ModeloFiat, file: File) => {
    const key = `${id}_${modelo}`;
    setUploadingVideo(p => ({ ...p, [key]: true }));
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetch(`${botApiUrl}/api/sessions/${id}/video/${modelo}`, {
        method: 'POST',
        headers: { 'x-admin-password': pw }, // sin Content-Type: el browser lo arma solo con el boundary de FormData
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) alert('❌ ' + (data.error || 'No se pudo subir el video'));
    } catch {
      alert('❌ Error de conexión subiendo el video');
    } finally {
      setUploadingVideo(p => ({ ...p, [key]: false }));
      setTimeout(load, 500);
    }
  };

  const agregarAdMapping = async () => {
    if (!newSourceId.trim()) { alert('Falta el Source ID del anuncio'); return; }
    try {
      const res = await fetch(`${botApiUrl}/api/ad-mapping`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ sourceId: newSourceId.trim(), modelo: newModelo, descripcion: newDescripcion.trim() })
      });
      const data = await res.json();
      if (!data.ok) { alert('❌ ' + (data.error || 'No se pudo guardar')); return; }
      setNewSourceId('');
      setNewDescripcion('');
      loadAdMapping();
    } catch {
      alert('❌ Error de conexión');
    }
  };

  const eliminarAdMapping = async (id: number) => {
    await fetch(`${botApiUrl}/api/ad-mapping/${id}`, { method: 'DELETE', headers: hdrs() });
    loadAdMapping();
  };

  const usuariosSinSesion = usuarios.filter(u => !sessions.some(s => s.supervisorId === u.id));

  // ===== LOGIN =====
  if (!authed) {
    return (
      <div className="max-w-sm mx-auto mt-12">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-bold mb-1 text-center">🔒 {title}</h2>
          <p className="text-sm text-gray-500 text-center mb-6">Ingresá la contraseña de administrador</p>
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setLoginErr(false); }}
            onKeyDown={e => e.key === 'Enter' && doLogin()}
            placeholder="Contraseña"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={doLogin}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700 transition-colors"
          >
            Entrar
          </button>
          {loginErr && <p className="text-red-500 text-sm mt-3 text-center">Contraseña incorrecta o el bot no está disponible</p>}
        </div>
      </div>
    );
  }

  // ===== PANEL PRINCIPAL =====
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">📱 {title}</h2>
          <span className="text-sm text-gray-400">Un WhatsApp por vendedor · atiende con IA y la grilla Fiat, manda el video si está cargado y entrega el lead calificado al CRM</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAdMapping(v => !v); if (!adMapping.length) loadAdMapping(); }}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors whitespace-nowrap"
          >
            🎯 Anuncios de Meta
          </button>
          <button
            onClick={() => { setShowAdd(v => !v); if (!usuarios.length) loadUsuarios(); }}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            ➕ Agregar número
          </button>
        </div>
      </div>

      {showAdMapping && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 p-5 space-y-4">
          <div>
            <h3 className="font-bold text-gray-800 mb-1">Anuncios de Meta → Modelo</h3>
            <p className="text-xs text-gray-500">
              Cuando un cliente clickea un anuncio de Meta y le escribe al vendedor, el bot intenta detectar de qué
              anuncio vino (Source ID) para saber qué modelo le interesa y mandar ese video. Si el anuncio no está acá
              mapeado —o WhatsApp no manda el dato, puede pasar— el bot directamente le pregunta al cliente qué
              modelo le interesa, así nunca se traba.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 rounded-lg">
            <input
              type="text"
              value={newSourceId}
              onChange={e => setNewSourceId(e.target.value)}
              placeholder="Source ID del anuncio (Meta Ads Manager)"
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 flex-1 min-w-[220px]"
            />
            <select
              value={newModelo}
              onChange={e => setNewModelo(e.target.value as ModeloFiat)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              {MODELOS_FIAT.map(m => (
                <option key={m.key} value={m.key}>Fiat {m.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newDescripcion}
              onChange={e => setNewDescripcion(e.target.value)}
              placeholder="Nota (opcional, ej: campaña agosto)"
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 flex-1 min-w-[180px]"
            />
            <button
              onClick={agregarAdMapping}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              Guardar
            </button>
          </div>

          {adMapping.length > 0 ? (
            <div className="divide-y">
              {adMapping.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{m.source_id}</span>
                    <span className="mx-2">→</span>
                    <span className="font-medium">Fiat {labelModelo(m.modelo)}</span>
                    {m.descripcion && <span className="text-gray-400 ml-2">({m.descripcion})</span>}
                  </div>
                  <button
                    onClick={() => eliminarAdMapping(m.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Todavía no hay anuncios mapeados. Sin esto configurado, el bot le pregunta el modelo a cada cliente —
              funciona igual, solo que con un paso extra.
            </p>
          )}
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-green-200 p-5">
          <h3 className="font-bold text-gray-800 mb-3">Conectar un WhatsApp</h3>
          <p className="text-xs text-gray-500 mb-1"><strong>Vendedor:</strong> los leads de ese número son suyos. <strong>Gerencia / supervisión:</strong> los leads se reparten entre los vendedores de su equipo.</p>
          <p className="text-xs text-gray-500 mb-3">Con escanear el QR ya queda andando. Los videos por modelo son opcionales: si los subís, el bot los manda cuando el cliente pregunta por ese modelo.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selUser}
              onChange={e => setSelUser(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2.5 bg-white flex-1 min-w-[220px] max-w-md"
            >
              <option value="">— Elegí un usuario —</option>
              {usuariosSinSesion.map(u => <option key={u.id} value={u.id}>{u.name} · {ROL_LABEL[u.role] || u.role}</option>)}
            </select>
            <button
              onClick={conectarNuevo}
              disabled={!selUser}
              className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Conectar y generar QR
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-2.5 bg-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          ⚠️ {error} — Verificá que el bot esté corriendo en <code className="bg-red-100 px-1 rounded text-xs">{botApiUrl}</code>
        </div>
      )}

      {loading && sessions.length === 0 && (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
          <span className="ml-3 text-gray-500">Conectando...</span>
        </div>
      )}

      {!loading && sessions.length === 0 && !error && (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          Todavía no hay ningún número conectado. Arrancá con <strong>➕ Agregar número</strong>.
        </div>
      )}

      {sessions.map(s => (
        <div key={s.supervisorId} className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-lg text-gray-800">
                {s.supervisorName}
                {s.role && s.role !== 'vendedor' && (
                  <span className="ml-2 align-middle text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {ROL_LABEL[s.role] || s.role} · reparte entre su equipo
                  </span>
                )}
              </h3>
              <div className="mt-1">
                {s.status === 'connected' ? (
                  <span className="text-green-600 text-sm font-medium">🟢 Conectado{s.phone ? ` — +${s.phone}` : ''}</span>
                ) : s.status === 'qr_ready' ? (
                  <span className="text-yellow-600 text-sm font-medium">🟡 Esperando escaneo del QR</span>
                ) : s.status === 'connecting' ? (
                  <span className="text-blue-600 text-sm font-medium animate-pulse">🔄 Conectando...</span>
                ) : (
                  <span className="text-red-500 text-sm font-medium">🔴 Desconectado</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(s.status === 'disconnected' || !s.status) && (
                <button onClick={() => startSession(s.supervisorId, s.supervisorName)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                  Conectar
                </button>
              )}
              {s.status === 'connected' && (
                <button onClick={() => stopSession(s.supervisorId)}
                  className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors">
                  Desconectar
                </button>
              )}
              {(s.status === 'connected' || s.status === 'qr_ready') && (
                <button onClick={() => logoutSession(s.supervisorId)}
                  className="px-3 py-2 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600 transition-colors">
                  Cerrar sesión
                </button>
              )}
              <button onClick={() => eliminarSesion(s.supervisorId, s.supervisorName)}
                className="px-3 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                Eliminar
              </button>
            </div>
          </div>

          {/* Videos por modelo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {MODELOS_FIAT.map(({ key: modelo, label }) => {
              const tiene = tieneVideo(s, modelo);
              const key = `${s.supervisorId}_${modelo}`;
              const subiendo = uploadingVideo[key];
              return (
                <div key={modelo} className={`p-3 rounded-lg border ${tiene ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">🎬 Video Fiat {label} <span className="text-gray-400 font-normal">(opcional)</span></span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tiene ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {tiene ? '✅ Cargado' : '⚠️ Falta'}
                    </span>
                  </div>
                  <label className="block">
                    <input
                      type="file"
                      accept="video/mp4"
                      disabled={subiendo}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) subirVideo(s.supervisorId, modelo, file);
                        e.target.value = '';
                      }}
                      className="text-xs w-full file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-white file:text-gray-700 file:cursor-pointer hover:file:bg-gray-50"
                    />
                  </label>
                  {subiendo && <p className="text-xs text-gray-400 mt-1 animate-pulse">Subiendo...</p>}
                </div>
              );
            })}
          </div>

          {qrs[s.supervisorId] && (
            <div className="text-center p-4 bg-gray-50 rounded-lg mt-3">
              <p className="text-sm text-gray-600 mb-3">Escaneá con el celular de {s.supervisorName}</p>
              <img src={qrs[s.supervisorId]} alt="QR" className="mx-auto w-64 h-64" />
              <p className="text-xs text-gray-400 mt-2 animate-pulse">Esperando escaneo...</p>
            </div>
          )}

          {pollingIds.has(s.supervisorId) && !qrs[s.supervisorId] && s.status !== 'connected' && (
            <div className="text-center p-4 bg-gray-50 rounded-lg mt-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto"></div>
              <p className="text-xs text-gray-400 mt-2">Generando QR...</p>
            </div>
          )}
        </div>
      ))}

      <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500 space-y-1">
        <p>• <strong>Flujo del bot:</strong> el cliente escribe → la IA averigua el modelo (o lo toma del anuncio), le pasa los valores de la grilla, pregunta forma de compra, anticipo/usado/cuota y nombre → entrega el lead al CRM con todo en las notas → a partir de ahí sigue el vendedor a mano</p>
        <p>• <strong>Sin respuesta:</strong> si el cliente deja de contestar, a los 20 minutos el lead se entrega igual con lo que haya</p>
        <p>• <strong>Videos:</strong> se mandan como video normal de WhatsApp, no como link — el cliente los ve reproducibles en el chat</p>
        <p>• <strong>Cerrar sesión:</strong> desvincula el WhatsApp por completo, hay que escanear el QR de nuevo</p>
        <p>• <strong>Eliminar:</strong> borra todo — la sesión y los videos configurados de ese vendedor</p>
      </div>
    </div>
  );
}
