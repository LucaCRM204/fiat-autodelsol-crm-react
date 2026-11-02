/**
 * ============================================
 * MIS TAREAS
 * ============================================
 * Va en: src/components/MisTareas.tsx
 *
 * Muestra las tareas que arma CRM.tsx (generarTareasAutomaticas + tareas
 * manuales asignadas):
 *   - automáticas por estado del lead (primer contacto, cotizar, seguimiento…):
 *     se cierran solas cuando el lead avanza de estado
 *   - por recordatorio (incluidos los del Agente IA): "Completar" marca el
 *     recordatorio como hecho en la base
 *   - manuales (asignadas por un supervisor/gerente): "Completar"
 * Vendedores ven las suyas; supervisores para arriba, las de su equipo con
 * filtro por vendedor.
 */
import { useMemo, useState } from 'react';
import { Phone, MessageCircle, FileText, Calendar, Check, Clock, User } from 'lucide-react';

type Lead = {
  id: number;
  nombre: string;
  telefono: string;
  modelo?: string;
  estado: string;
  vendedor: number | null;
};

export type TareaVista = {
  id: number;
  leadId: number;
  asignadoA: number;
  tipo: string;
  prioridad: 'alta' | 'media' | 'baja';
  fechaLimite: string;
  descripcion: string;
  completada: boolean;
  lead?: Lead;
  manual?: boolean;
  recordatorioId?: number;
  createdByName?: string;
};

type Props = {
  tareas: TareaVista[];
  currentUser: { id: number; role: string } | null;
  nombreUsuario: (id: number) => string;
  estados: Record<string, { label: string; color: string }>;
  onCompletarManual: (tareaId: number) => void;
  onCompletarRecordatorio: (leadId: number, recordatorioId: number) => void;
  onAbrirNotas: (lead: any) => void;
  onAbrirHistorial: (lead: any) => void;
};

const TIPOS: Record<string, string> = {
  llamar: 'Llamar',
  whatsapp: 'WhatsApp',
  email: 'Email',
  cotizar: 'Cotizar',
  seguimiento: 'Seguimiento',
  recuperar_perdido: 'Recuperar',
  recordatorio: 'Recordatorio',
};

const PAGINA = 40;

function vence(fecha: string): { texto: string; vencida: boolean } {
  const diffMin = Math.round((new Date(fecha).getTime() - Date.now()) / 60000);
  const abs = Math.abs(diffMin);
  const t = abs < 60 ? `${abs} min` : abs < 60 * 24 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return diffMin < 0 ? { texto: `vencida hace ${t}`, vencida: true } : { texto: `vence en ${t}`, vencida: false };
}

function waLink(tel: string) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `549${d}`;
  return `https://wa.me/${d}`;
}

export default function MisTareas({
  tareas,
  currentUser,
  nombreUsuario,
  estados,
  onCompletarManual,
  onCompletarRecordatorio,
  onAbrirNotas,
  onAbrirHistorial,
}: Props) {
  const esVendedor = currentUser?.role === 'vendedor';
  const [prioridad, setPrioridad] = useState<'todas' | 'alta' | 'media'>('todas');
  const [vendedor, setVendedor] = useState<number | 'todos'>('todos');
  const [limite, setLimite] = useState(PAGINA);

  const pendientes = useMemo(
    () => tareas.filter((t) => !t.completada && (!esVendedor || t.asignadoA === currentUser?.id)),
    [tareas, esVendedor, currentUser?.id]
  );

  const porVendedor = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of pendientes) m.set(t.asignadoA, (m.get(t.asignadoA) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pendientes]);

  const visibles = useMemo(
    () =>
      pendientes.filter(
        (t) => (prioridad === 'todas' || t.prioridad === prioridad) && (vendedor === 'todos' || t.asignadoA === vendedor)
      ),
    [pendientes, prioridad, vendedor]
  );

  const altas = pendientes.filter((t) => t.prioridad === 'alta').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">{esVendedor ? 'Mis Tareas' : 'Tareas del equipo'}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {pendientes.length} pendientes · {altas} de prioridad alta. Las automáticas se cierran solas cuando el lead avanza de estado.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(['todas', 'alta', 'media'] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPrioridad(p); setLimite(PAGINA); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${prioridad === p ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {p === 'todas' ? 'Todas' : p === 'alta' ? 'Alta' : 'Media'}
            </button>
          ))}
        </div>
        {!esVendedor && (
          <select
            value={vendedor}
            onChange={(e) => { setVendedor(e.target.value === 'todos' ? 'todos' : Number(e.target.value)); setLimite(PAGINA); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            aria-label="Filtrar por vendedor"
          >
            <option value="todos">Todos los vendedores ({pendientes.length})</option>
            {porVendedor.map(([id, n]) => (
              <option key={id} value={id}>
                {id ? nombreUsuario(id) : 'Sin asignar'} ({n})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg">
        {visibles.length === 0 ? (
          <div className="py-16 text-center">
            <Check size={40} className="mx-auto text-green-500" />
            <p className="mt-3 text-gray-600">No hay tareas pendientes con este filtro.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visibles.slice(0, limite).map((t) => {
              const v = vence(t.fechaLimite);
              const lead = t.lead;
              const estado = lead ? estados[lead.estado] : null;
              const puedeCompletar = t.manual || t.recordatorioId;
              return (
                <li key={`${t.manual ? 'm' : t.recordatorioId ? 'r' : 'a'}-${t.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${t.prioridad === 'alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {t.prioridad === 'alta' ? 'Alta' : t.prioridad === 'media' ? 'Media' : 'Baja'}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                        {t.recordatorioId ? 'Recordatorio' : TIPOS[t.tipo] || t.tipo}
                      </span>
                      {t.manual && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700">
                          Asignada{t.createdByName ? ` por ${t.createdByName}` : ''}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 ${v.vencida ? 'text-red-600' : 'text-gray-500'}`}>
                        <Clock size={12} /> {v.texto}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-gray-900">{t.descripcion}</p>
                    {lead && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
                        <span className="text-gray-700">{lead.nombre}</span>
                        {lead.modelo && <span>· {lead.modelo}</span>}
                        {estado && (
                          <span className={`rounded px-1.5 py-0.5 text-xs text-white ${estado.color}`}>{estado.label}</span>
                        )}
                        {!esVendedor && (
                          <span className="inline-flex items-center gap-1">
                            <User size={12} /> {t.asignadoA ? nombreUsuario(t.asignadoA) : 'Sin asignar'}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {lead?.telefono && (
                      <>
                        <a href={`tel:${lead.telefono}`} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          <Phone size={13} /> Llamar
                        </a>
                        <a href={waLink(lead.telefono)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          <MessageCircle size={13} /> WhatsApp
                        </a>
                      </>
                    )}
                    {lead && (
                      <>
                        <button onClick={() => onAbrirNotas(lead)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          <FileText size={13} /> Notas
                        </button>
                        <button onClick={() => onAbrirHistorial(lead)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          <Calendar size={13} /> Historial
                        </button>
                      </>
                    )}
                    {puedeCompletar && (
                      <button
                        onClick={() =>
                          t.recordatorioId ? onCompletarRecordatorio(t.leadId, t.recordatorioId) : onCompletarManual(t.id)
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                      >
                        <Check size={13} /> Completar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {visibles.length > limite && (
          <div className="border-t border-gray-100 p-4 text-center">
            <button onClick={() => setLimite((l) => l + PAGINA)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
              Ver más ({visibles.length - limite} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
