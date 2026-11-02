/**
 * ============================================
 * PANEL DEL AGENTE IA
 * ============================================
 * Va en: src/components/AgentInbox.tsx
 * Backend: /api/agent (carpeta agent/ del backend)
 *
 * - Para aprobar: acciones que propuso el agente y esperan un gerente.
 * - Historial: lo que se ejecutó, aprobó, rechazó o falló.
 * - Corridas: cada vez que el agente analizó un lead y qué concluyó.
 * - Ajustes (owner/director): modo, SLA, horario, tope diario, instrucciones.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, X, RefreshCw, Clock, AlertTriangle, Send, Search, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';

type Modo = 'off' | 'shadow' | 'auto';

type Config = {
  mode: Modo;
  sla_nuevo_min: number;
  estancado_dias: number;
  horario_inicio: number;
  horario_fin: number;
  dias_laborales: number[];
  max_runs_dia: number;
  tools_con_aprobacion: string[];
  whatsapp_automatico: boolean;
  max_acciones_corrida: number;
  instrucciones_extra: string;
};

type Status = {
  config: Config;
  contadores: {
    pendientes: number;
    ejecutadas_hoy: number;
    corridas_hoy: number;
    tokens_in_hoy: number | string;
    tokens_out_hoy: number | string;
    en_cola: number;
    errores_hoy: number;
  };
  api_key: boolean;
  api_key_var?: string;
  proveedor?: string;
  modelo: string;
  en_horario: boolean;
};

type Accion = {
  id: number;
  run_id: number | null;
  lead_id: number | null;
  tool: string;
  args: Record<string, any>;
  reason: string | null;
  status: 'pending' | 'executed' | 'approved' | 'rejected' | 'failed';
  result: any;
  source: 'agent' | 'mcp';
  decidido_por: string | null;
  decision_note: string | null;
  created_at: string;
  executed_at?: string | null;
  lead_nombre: string | null;
  lead_estado: string | null;
  lead_modelo: string | null;
  vendedor_nombre: string | null;
  run_resumen: string | null;
  usuario_destino: string | null;
};

type Corrida = {
  id: number;
  lead_id: number | null;
  lead_nombre: string | null;
  trigger_type: string;
  status: 'running' | 'done' | 'error';
  steps: number;
  input_tokens: number;
  output_tokens: number;
  summary: string | null;
  error: string | null;
  created_at: string;
};

type Props = {
  currentUser: { id: number; role: string; name?: string } | null;
  /** Abre el lead en el CRM (historial). Lo pasa CRM.tsx. */
  onAbrirLead?: (leadId: number) => boolean | void;
};

type Evidencia = {
  accion: Accion;
  lead: { id: number; nombre: string; telefono: string; modelo: string; estado: string; vendedor: string | null } | null;
  evidencia: { tipo: string; encontrado: boolean; detalle: string | null; fecha: string | null }[];
  aviso?: string;
};

const MODOS: { key: Modo; label: string; detalle: string }[] = [
  { key: 'off', label: 'Apagado', detalle: 'No analiza ni propone nada.' },
  { key: 'shadow', label: 'Sombra', detalle: 'Analiza todo y propone. Nada se ejecuta sin aprobación.' },
  { key: 'auto', label: 'Automático', detalle: 'Notas, recordatorios y avisos se hacen solos. Lo marcado abajo pide aprobación.' },
];

const HERRAMIENTAS_ESCRITURA: { key: string; label: string }[] = [
  { key: 'add_nota', label: 'Dejar notas' },
  { key: 'create_recordatorio', label: 'Crear recordatorios' },
  { key: 'notify_user', label: 'Avisar a usuarios' },
  { key: 'update_lead_estado', label: 'Cambiar estado' },
  { key: 'reassign_lead', label: 'Reasignar leads' },
];

const DISPAROS: Record<string, string> = {
  'lead.created': 'Lead nuevo',
  'lead.sla_nuevo': 'Sin contactar',
  'lead.no_contesta': 'No contesta',
  'lead.estancado': 'Estancado',
  'lead.respondio': 'Respondió WhatsApp',
  manual: 'Pedido manual',
};

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const ESTADO_ACCION: Record<Accion['status'], { label: string; cls: string }> = {
  pending: { label: 'Para aprobar', cls: 'bg-amber-100 text-amber-800' },
  executed: { label: 'Hecha', cls: 'bg-emerald-100 text-emerald-800' },
  approved: { label: 'Aprobada', cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: 'Rechazada', cls: 'bg-slate-200 text-slate-600' },
  failed: { label: 'Falló', cls: 'bg-red-100 text-red-700' },
};

function describir(a: Accion): string {
  const x = a.args || {};
  switch (a.tool) {
    case 'add_nota':
      return `Nota: “${x.texto ?? ''}”`;
    case 'create_recordatorio':
      return `Recordatorio el ${x.fecha} a las ${x.hora}: ${x.descripcion ?? ''}`;
    case 'notify_user':
      return `Aviso a ${a.usuario_destino ?? `#${x.user_id}`}: ${x.mensaje ?? ''}`;
    case 'update_lead_estado':
      return `Pasar a “${x.estado}”${a.lead_estado ? ` (hoy: ${a.lead_estado})` : ''}. ${x.motivo ?? ''}`;
    case 'reassign_lead':
      return `Reasignar de ${a.vendedor_nombre ?? 'sin vendedor'} a ${a.usuario_destino ?? `#${x.to_user_id}`}. ${x.motivo ?? ''}`;
    case 'send_whatsapp':
      return `WhatsApp al cliente: “${x.mensaje ?? ''}”`;
    default:
      return `${a.tool} ${JSON.stringify(x)}`;
  }
}

function hace(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

const errorDe = (e: any, fallback: string) => e?.response?.data?.error || fallback;

export default function AgentInbox({ currentUser, onAbrirLead }: Props) {
  const puedeConfigurar = ['owner', 'director'].includes(currentUser?.role ?? '');

  const [tab, setTab] = useState<'pendientes' | 'historial' | 'corridas' | 'ajustes'>('pendientes');
  const [status, setStatus] = useState<Status | null>(null);
  const [pendientes, setPendientes] = useState<Accion[]>([]);
  const [historial, setHistorial] = useState<Accion[]>([]);
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState<number | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [s, p, h, c] = await Promise.all([
        api.get('/agent/status'),
        api.get('/agent/actions', { params: { status: 'pending', limit: 100 } }),
        api.get('/agent/actions', { params: { limit: 100 } }),
        api.get('/agent/runs', { params: { limit: 50 } }),
      ]);
      setStatus(s.data);
      setPendientes(p.data.actions);
      setHistorial(h.data.actions.filter((a: Accion) => a.status !== 'pending'));
      setCorridas(c.data.runs);
      setError(null);
    } catch (e: any) {
      setError(errorDe(e, 'No se pudo cargar el agente. Revisá que el backend esté actualizado.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(() => cargar(true), 20000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const decidir = async (a: Accion, accion: 'approve' | 'reject') => {
    let motivo: string | null = null;
    if (accion === 'reject') {
      motivo = window.prompt('¿Por qué la rechazás? (opcional, ayuda a ajustar el agente)') ?? null;
    }
    setTrabajando(a.id);
    try {
      await api.post(`/agent/actions/${a.id}/${accion}`, motivo ? { motivo } : {});
      setPendientes((xs) => xs.filter((x) => x.id !== a.id));
      setAviso(accion === 'approve' ? 'Acción aprobada y ejecutada' : 'Acción rechazada');
      cargar(true);
    } catch (e: any) {
      setAviso(errorDe(e, 'No se pudo resolver la acción'));
      cargar(true);
    } finally {
      setTrabajando(null);
    }
  };

  const tokensHoy = useMemo(() => {
    if (!status) return '0';
    const t = Number(status.contadores.tokens_in_hoy) + Number(status.contadores.tokens_out_hoy);
    return t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1)} M` : t >= 1000 ? `${Math.round(t / 1000)} k` : String(t);
  }, [status]);

  if (cargando && !status) {
    return <div className="bg-white rounded-xl shadow-lg p-6 text-sm text-slate-500">Cargando agente…</div>;
  }

  if (error && !status) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => cargar()} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Reintentar
        </button>
      </div>
    );
  }

  const modoActual = MODOS.find((m) => m.key === status?.config.mode);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2.5 ${status?.config.mode === 'off' ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white'}`}>
              <Bot size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Agente IA</h1>
              <p className="text-sm text-slate-500">
                Modo {modoActual?.label.toLowerCase()}. {modoActual?.detalle}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} />
                  {status?.en_horario ? 'En horario comercial' : 'Fuera de horario: solo procesa leads nuevos y cambios de estado'}
                </span>
                {status?.modelo && <span>{status.proveedor === 'anthropic' ? 'Anthropic' : 'OpenAI'} · {status.modelo}</span>}
                {!status?.api_key && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <AlertTriangle size={12} />
                    Falta {status?.api_key_var ?? 'la API key'} en Railway
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => cargar()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { k: 'Para aprobar', v: status?.contadores.pendientes ?? 0, destacado: (status?.contadores.pendientes ?? 0) > 0 },
            { k: 'Acciones hoy', v: status?.contadores.ejecutadas_hoy ?? 0 },
            { k: 'Análisis hoy', v: `${status?.contadores.corridas_hoy ?? 0} / ${status?.config.max_runs_dia ?? 0}` },
            { k: 'En cola', v: status?.contadores.en_cola ?? 0 },
            { k: 'Tokens hoy', v: tokensHoy },
          ].map((s) => (
            <div key={s.k} className={`rounded-lg border px-3 py-2 ${s.destacado ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
              <dt className="text-xs text-slate-500">{s.k}</dt>
              <dd className="text-lg font-semibold text-slate-900">{s.v}</dd>
            </div>
          ))}
        </dl>
        {(status?.contadores.errores_hoy ?? 0) > 0 && (
          <p className="mt-3 text-sm text-red-600">
            {status?.contadores.errores_hoy} eventos fallaron hoy después de 3 intentos. Revisá los logs de Railway.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
          {[
            { key: 'pendientes', label: 'Para aprobar', badge: pendientes.length },
            { key: 'historial', label: 'Historial' },
            { key: 'corridas', label: 'Análisis' },
            ...(puedeConfigurar ? [{ key: 'ajustes', label: 'Ajustes' }] : []),
          ].map((t: any) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {t.badge > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{t.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 sm:p-6">
          {tab === 'pendientes' && (
            <Pendientes acciones={pendientes} trabajando={trabajando} onDecidir={decidir} />
          )}
          {tab === 'historial' && <Historial acciones={historial} onComprobar={setComprobando} />}
          {tab === 'corridas' && (
            <Corridas
              corridas={corridas}
              acciones={[...pendientes, ...historial]}
              onComprobar={setComprobando}
              onPedido={() => { setAviso('Revisión en cola: aparece en Análisis en unos segundos'); cargar(true); }}
              modoOff={status?.config.mode === 'off'}
            />
          )}
          {tab === 'ajustes' && puedeConfigurar && status && (
            <Ajustes config={status.config} onGuardado={(msg) => { setAviso(msg); cargar(true); }} />
          )}
        </div>
      </div>

      {comprobando !== null && (
        <ModalEvidencia
          accionId={comprobando}
          onCerrar={() => setComprobando(null)}
          onAbrirLead={onAbrirLead ? (id) => {
            const ok = onAbrirLead(id);
            if (ok === false) setAviso('Ese lead no está en tu lista cargada. Buscalo por nombre en Leads.');
            else setComprobando(null);
          } : undefined}
        />
      )}

      {aviso && (
        <div role="status" className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          {aviso}
        </div>
      )}
    </div>
  );
}

function Pendientes({
  acciones,
  trabajando,
  onDecidir,
}: {
  acciones: Accion[];
  trabajando: number | null;
  onDecidir: (a: Accion, d: 'approve' | 'reject') => void;
}) {
  if (!acciones.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No hay nada para aprobar. Cuando el agente proponga algo, aparece acá.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {acciones.map((a) => (
        <li key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-medium text-slate-900">{a.lead_nombre ?? 'Lead eliminado'}</span>
              {a.lead_id && <span className="text-slate-400">#{a.lead_id}</span>}
              {a.lead_modelo && <span className="text-slate-500">{a.lead_modelo}</span>}
              {a.vendedor_nombre && <span className="text-slate-500">· {a.vendedor_nombre}</span>}
            </div>
            <p className="mt-1 text-sm text-slate-800">{describir(a)}</p>
            {a.run_resumen && <p className="mt-1 text-xs text-slate-500">Por qué: {a.run_resumen}</p>}
            <p className="mt-1 text-xs text-slate-400">
              {hace(a.created_at)}
              {a.source === 'mcp' && ' · pedido por un agente externo (MCP)'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              disabled={trabajando === a.id}
              onClick={() => onDecidir(a, 'approve')}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={14} /> Aprobar
            </button>
            <button
              disabled={trabajando === a.id}
              onClick={() => onDecidir(a, 'reject')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <X size={14} /> Rechazar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Historial({ acciones, onComprobar }: { acciones: Accion[]; onComprobar: (id: number) => void }) {
  if (!acciones.length) {
    return <p className="py-10 text-center text-sm text-slate-400">Todavía no hay acciones resueltas.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {acciones.map((a) => {
        const e = ESTADO_ACCION[a.status];
        const err = a.status === 'failed' ? a.result?.error : null;
        return (
          <li key={a.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>{e.label}</span>
              <span className="font-medium text-slate-900">{a.lead_nombre ?? 'Lead eliminado'}</span>
              <span className="text-xs text-slate-400">{hace(a.created_at)}</span>
              {(a.status === 'executed' || a.status === 'approved') && (
                <button
                  onClick={() => onComprobar(a.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Search size={12} /> Comprobar
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-700">{describir(a)}</p>
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
            {a.decidido_por && (
              <p className="mt-1 text-xs text-slate-400">
                {a.status === 'rejected' ? 'Rechazó' : 'Aprobó'} {a.decidido_por}
                {a.decision_note ? `: ${a.decision_note}` : ''}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Corridas({
  corridas,
  acciones,
  onComprobar,
  onPedido,
  modoOff,
}: {
  corridas: Corrida[];
  acciones: Accion[];
  onComprobar: (id: number) => void;
  onPedido: () => void;
  modoOff: boolean;
}) {
  const [leadId, setLeadId] = useState('');
  const [instruccion, setInstruccion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pedir = async () => {
    const id = parseInt(leadId);
    if (!id) { setErr('Poné el número de lead'); return; }
    setEnviando(true);
    setErr(null);
    try {
      await api.post('/agent/run', { lead_id: id, instruccion: instruccion.trim() || undefined });
      setLeadId('');
      setInstruccion('');
      onPedido();
    } catch (e: any) {
      setErr(errorDe(e, 'No se pudo pedir la revisión'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Pedir revisión de un lead</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value.replace(/\D/g, ''))}
            placeholder="N.º de lead"
            inputMode="numeric"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-32"
          />
          <input
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            placeholder="Instrucción opcional, ej.: fijate si conviene pasarlo a otro vendedor"
            maxLength={500}
            className="w-full flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={pedir}
            disabled={enviando || modoOff}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send size={14} /> Revisar
          </button>
        </div>
        {modoOff && <p className="mt-2 text-xs text-slate-500">El agente está apagado. Prendelo en Ajustes.</p>}
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </div>

      {!corridas.length ? (
        <p className="py-6 text-center text-sm text-slate-400">El agente todavía no analizó ningún lead.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {corridas.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{DISPAROS[c.trigger_type] ?? c.trigger_type}</span>
                <span className="font-medium text-slate-900">{c.lead_nombre ?? `Lead #${c.lead_id}`}</span>
                <span className="text-xs text-slate-400">{hace(c.created_at)}</span>
                <span className="text-xs text-slate-400">
                  {c.steps} pasos · {Math.round((c.input_tokens + c.output_tokens) / 100) / 10} k tokens
                </span>
              </div>
              {c.status === 'error' ? (
                <p className="mt-1 text-sm text-red-600">{c.error}</p>
              ) : c.status === 'running' ? (
                <p className="mt-1 text-sm text-slate-500">Analizando…</p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{c.summary}</p>
              )}
              {acciones.filter((a) => a.run_id === c.id).map((a) => {
                const e = ESTADO_ACCION[a.status];
                const hecha = a.status === 'executed' || a.status === 'approved';
                return (
                  <div key={a.id} className="mt-2 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>{e.label}</span>
                    <span className="min-w-0 flex-1 text-slate-700">{describir(a)}</span>
                    {hecha && (
                      <button
                        onClick={() => onComprobar(a.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Search size={12} /> Comprobar
                      </button>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Ajustes({ config, onGuardado }: { config: Config; onGuardado: (msg: string) => void }) {
  const [f, setF] = useState<Config>(config);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setF(config), [config]);

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleDia = (d: number) =>
    set('dias_laborales', f.dias_laborales.includes(d) ? f.dias_laborales.filter((x) => x !== d) : [...f.dias_laborales, d].sort());
  const toggleTool = (t: string) =>
    set('tools_con_aprobacion', f.tools_con_aprobacion.includes(t) ? f.tools_con_aprobacion.filter((x) => x !== t) : [...f.tools_con_aprobacion, t]);

  const guardar = async () => {
    if (!f.dias_laborales.length) { setErr('Elegí al menos un día laboral'); return; }
    if (f.horario_fin <= f.horario_inicio) { setErr('La hora de cierre tiene que ser posterior a la de apertura'); return; }
    setGuardando(true);
    setErr(null);
    try {
      await api.put('/agent/config', {
        ...f,
        dias_laborales: f.dias_laborales.join(','),
        tools_con_aprobacion: f.tools_con_aprobacion.join(','),
      });
      onGuardado('Ajustes guardados');
    } catch (e: any) {
      const errores = e?.response?.data?.errors;
      setErr(errores ? `Revisá: ${Object.keys(errores).join(', ')}` : errorDe(e, 'No se pudieron guardar los ajustes'));
    } finally {
      setGuardando(false);
    }
  };

  const num = (k: keyof Config, label: string, ayuda: string, min: number, max: number) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={f[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as any)}
        className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-7">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Modo</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODOS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => set('mode', m.key)}
              className={`rounded-lg border p-3 text-left ${f.mode === m.key ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <span className="block text-sm font-medium text-slate-900">{m.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{m.detalle}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">En modo automático, pedir aprobación para</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {HERRAMIENTAS_ESCRITURA.map((t) => (
            <label key={t.key} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
              <input type="checkbox" checked={f.tools_con_aprobacion.includes(t.key)} onChange={() => toggleTool(t.key)} className="accent-blue-600" />
              {t.label}
            </label>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-3 text-sm">
          <input
            type="checkbox"
            checked={f.whatsapp_automatico}
            onChange={(e) => set('whatsapp_automatico', e.target.checked)}
            className="mt-0.5 accent-blue-600"
          />
          <span>
            <span className="font-medium text-slate-900">Mandar WhatsApp a clientes sin aprobación</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Solo en modo automático. Igual respeta: horario comercial, solo clientes que ya chatearon y uno cada 48 h por cliente.
              Activalo cuando hayas aprobado varios y te gusten cómo salen.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        {num('sla_nuevo_min', 'Minutos para avisar un lead sin contactar', 'Si sigue igual el doble de tiempo después del aviso, propone reasignar.', 5, 1440)}
        {num('estancado_dias', 'Días sin movimiento para marcar estancado', 'Aplica a contactado, interesado, negociación y rellamado.', 1, 30)}
        {num('max_acciones_corrida', 'Acciones máximas por análisis', 'Con 1 o 2 evita que proponga varias cosas parecidas sobre el mismo lead.', 1, 5)}
        {num('max_runs_dia', 'Tope de análisis por día', 'Controla el gasto de la API. Cada análisis suele usar entre 5 k y 20 k tokens.', 0, 5000)}
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Horario comercial (Argentina)</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>De</span>
          <input type="number" min={0} max={23} value={f.horario_inicio} onChange={(e) => set('horario_inicio', Number(e.target.value))} className="w-16 rounded-md border border-slate-300 px-2 py-1.5" />
          <span>a</span>
          <input type="number" min={1} max={24} value={f.horario_fin} onChange={(e) => set('horario_fin', Number(e.target.value))} className="w-16 rounded-md border border-slate-300 px-2 py-1.5" />
          <span>h</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIAS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDia(i)}
              aria-pressed={f.dias_laborales.includes(i)}
              className={`rounded-md px-2.5 py-1 text-sm ${f.dias_laborales.includes(i) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Fuera de horario no avisa por SLA ni estancados, y nunca agenda recordatorios ahí.</p>
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold text-slate-900">Instrucciones para el agente</span>
        <textarea
          value={f.instrucciones_extra}
          onChange={(e) => set('instrucciones_extra', e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Ej.: los leads de Fast Lead son de menor calidad, priorizá los de Emanuel. Nunca reasignes leads de Vend Ana."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="block text-right text-xs text-slate-400">{f.instrucciones_extra.length}/2000</span>
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        onClick={guardar}
        disabled={guardando}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </div>
  );
}

function ModalEvidencia({
  accionId,
  onCerrar,
  onAbrirLead,
}: {
  accionId: number;
  onCerrar: () => void;
  onAbrirLead?: (leadId: number) => void;
}) {
  const [data, setData] = useState<Evidencia | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/agent/actions/${accionId}/evidencia`)
      .then((r) => vivo && setData(r.data))
      .catch((e) => vivo && setErr(errorDe(e, 'No se pudo verificar la acción')));
    return () => { vivo = false; };
  }, [accionId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const fecha = (f: string | null) =>
    f ? new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidencia-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="evidencia-titulo" className="text-lg font-semibold text-slate-900">Qué quedó registrado</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        {!data && !err && <p className="mt-4 text-sm text-slate-500">Buscando en el CRM…</p>}
        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        {data && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-800">{describir(data.accion)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {data.accion.executed_at ? `Ejecutada ${fecha(data.accion.executed_at)}` : `Propuesta ${fecha(data.accion.created_at)}`}
                {data.accion.decidido_por ? ` · aprobó ${data.accion.decidido_por}` : ' · automática'}
              </p>
            </div>

            {data.aviso ? (
              <p className="text-sm text-amber-700">{data.aviso}</p>
            ) : (
              <ul className="space-y-2">
                {data.evidencia.map((ev, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    {ev.encontrado
                      ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                      : <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{ev.tipo}</p>
                      <p className="break-words text-slate-600">
                        {ev.encontrado ? ev.detalle : ev.detalle || 'No se encontró en la base'}
                      </p>
                      {ev.fecha && <p className="text-xs text-slate-400">{fecha(ev.fecha)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data.lead && (
              <div className="border-t border-slate-200 pt-4 text-sm">
                <p className="text-slate-500">Cómo está el lead ahora</p>
                <p className="mt-1 text-slate-900">
                  <span className="font-medium">{data.lead.nombre}</span> #{data.lead.id} · {data.lead.modelo || 'sin modelo'}
                </p>
                <p className="text-slate-600">Estado: {data.lead.estado} · Vendedor: {data.lead.vendedor || 'sin asignar'}</p>
                {onAbrirLead && (
                  <button
                    onClick={() => onAbrirLead(data.lead!.id)}
                    className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Abrir historial del lead
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
