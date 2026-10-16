/**
 * ActivityReportPanel - Leads por Gerencia y Proveedor
 */

import { useMemo, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';

// ===== Tipos =====
interface LeadLite {
  id: number;
  vendedor: number | null;
  fuente: string;
  created_at?: string;
  equipo?: number | null;
  fecha?: string;
}

interface UserLite {
  id: number;
  name: string;
  role: string;
  reportsTo: number | null;
  active?: boolean;
}

interface FuenteDef {
  label: string;
  color?: string;
  icon?: string;
}

interface ActivityReportPanelProps {
  // Pasados desde el CRM
  leads?: LeadLite[];
  users?: UserLite[];
  userById?: Map<number, UserLite>;
  fuentes?: Record<string, FuenteDef>;
}

// ===== Helpers =====
function findGerenciaId(userId: number | null | undefined, userById?: Map<number, UserLite>): number | null {
  if (!userId || !userById) return null;
  let u = userById.get(userId);
  let safety = 0;
  while (u && safety < 10) {
    if (u.role === 'gerente') return u.id;
    if (!u.reportsTo) return null;
    u = userById.get(u.reportsTo);
    safety++;
  }
  return null;
}

function getDateRange(period: 'day' | 'week' | 'month', dateStr: string): [Date, Date] {
  const base = new Date(dateStr + 'T00:00:00');
  if (period === 'day') {
    const to = new Date(base);
    to.setHours(23, 59, 59, 999);
    return [base, to];
  }
  if (period === 'week') {
    const dow = (base.getDay() + 6) % 7;
    const from = new Date(base);
    from.setDate(base.getDate() - dow);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return [from, to];
  }
  const from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  return [from, to];
}

export function ActivityReportPanel(props: ActivityReportPanelProps = {}) {
  const { leads, users, userById, fuentes } = props;

  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const report = useMemo(() => {
    if (!leads || !users || !userById) return null;

    const [from, to] = getDateRange(period, date);
    const fromMs = from.getTime();
    const toMs = to.getTime();

    const gerentesVisibles = users.filter((u) => u.role === 'gerente');

    const leadsEnRango = leads.filter((l) => {
      const d = l.created_at || l.fecha;
      if (!d) return false;
      const t = new Date(d).getTime();
      return !isNaN(t) && t >= fromMs && t <= toMs;
    });

    const acc = new Map<number, { total: number; porFuente: Record<string, number> }>();
    const sinGer = { total: 0, porFuente: {} as Record<string, number> };
    const fuentesUsadas = new Set<string>();

    for (const lead of leadsEnRango) {
      let gid: number | null = null;
      if (lead.equipo) {
        const u = userById.get(lead.equipo);
        if (u?.role === 'gerente') gid = u.id;
        else gid = findGerenciaId(lead.equipo, userById);
      }
      if (!gid && lead.vendedor) gid = findGerenciaId(lead.vendedor, userById);

      const fuente = lead.fuente || 'otro';
      fuentesUsadas.add(fuente);

      if (gid && gerentesVisibles.some((g) => g.id === gid)) {
        if (!acc.has(gid)) acc.set(gid, { total: 0, porFuente: {} });
        const row = acc.get(gid)!;
        row.total++;
        row.porFuente[fuente] = (row.porFuente[fuente] || 0) + 1;
      } else {
        sinGer.total++;
        sinGer.porFuente[fuente] = (sinGer.porFuente[fuente] || 0) + 1;
      }
    }

    const fuentesArr = Array.from(fuentesUsadas);
    const totalPorFuente: Record<string, number> = {};
    for (const f of fuentesArr) {
      let s = 0;
      acc.forEach((r) => (s += r.porFuente[f] || 0));
      s += sinGer.porFuente[f] || 0;
      totalPorFuente[f] = s;
    }
    fuentesArr.sort((a, b) => (totalPorFuente[b] || 0) - (totalPorFuente[a] || 0));

    const filas = gerentesVisibles
      .map((g) => ({
        id: g.id,
        name: g.name,
        active: g.active !== false,
        total: acc.get(g.id)?.total || 0,
        porFuente: acc.get(g.id)?.porFuente || {},
      }))
      .sort((a, b) => b.total - a.total);

    const showSinGer = sinGer.total > 0;
    const totalGeneral = filas.reduce((s, f) => s + f.total, 0) + (showSinGer ? sinGer.total : 0);

    return { from, to, filas, sinGer: showSinGer ? sinGer : null, fuentes: fuentesArr, totalPorFuente, totalGeneral };
  }, [leads, users, userById, period, date]);

  const exportCSV = () => {
    if (!report) return;
    const { filas, sinGer, fuentes: fuentesArr, totalPorFuente, totalGeneral } = report;
    const headers = ['Gerencia', 'Total', ...fuentesArr.map((f) => fuentes?.[f]?.label || f)];
    const rows: string[][] = [];
    for (const fila of filas) {
      rows.push([fila.name, String(fila.total), ...fuentesArr.map((f) => String(fila.porFuente[f] || 0))]);
    }
    if (sinGer) {
      rows.push(['Sin gerencia', String(sinGer.total), ...fuentesArr.map((f) => String(sinGer.porFuente[f] || 0))]);
    }
    rows.push(['TOTAL', String(totalGeneral), ...fuentesArr.map((f) => String(totalPorFuente[f] || 0))]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_gerencia_proveedor_${period}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dataAvailable = !!(leads && users && userById);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-800">Reportes</h2>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">
              Leads por Gerencia y Proveedor
            </h3>
            <p className="text-sm text-gray-500">
              Cuántos leads entró cada gerencia, desglosado por fuente
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {([
                { v: 'day', label: 'Hoy' },
                { v: 'week', label: 'Semana' },
                { v: 'month', label: 'Mes' },
              ] as const).map((p) => (
                <button
                  key={p.v}
                  onClick={() => setPeriod(p.v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    period === p.v
                      ? 'bg-white text-indigo-700 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {!dataAvailable ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
            <p className="text-sm text-yellow-800 font-medium">
              Este reporte necesita acceso a los leads. Pasale <code>leads</code>, <code>users</code>, <code>userById</code> y <code>fuentes</code> como props al componente desde el CRM.
            </p>
          </div>
        ) : !report || report.totalGeneral === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-500">No hay leads en el período seleccionado.</p>
            <p className="text-xs text-gray-400 mt-1">
              {report?.from.toLocaleDateString('es-AR')} – {report?.to.toLocaleDateString('es-AR')}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-gray-600">
                Período: <strong>{report.from.toLocaleDateString('es-AR')}</strong> – <strong>{report.to.toLocaleDateString('es-AR')}</strong>
                <span className="ml-3 text-indigo-600 font-bold">{report.totalGeneral} leads totales</span>
              </span>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
              >
                <Download size={16} />
                Exportar CSV
              </button>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase sticky left-0 bg-gray-50 z-10">
                      Gerencia
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Total
                    </th>
                    {report.fuentes.map((f) => (
                      <th
                        key={f}
                        className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap"
                        title={fuentes?.[f]?.label || f}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-base">{fuentes?.[f]?.icon || '❓'}</span>
                          <span className="text-[10px] leading-tight max-w-[90px] truncate">
                            {fuentes?.[f]?.label || f}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.filas.map((fila) => (
                    <tr key={fila.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 sticky left-0 bg-white hover:bg-gray-50 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center font-bold text-white text-sm">
                            {fila.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{fila.name}</p>
                            {!fila.active && <span className="text-[10px] text-gray-400">inactivo</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-bold">
                          {fila.total}
                        </span>
                      </td>
                      {report.fuentes.map((f) => {
                        const n = fila.porFuente[f] || 0;
                        return (
                          <td key={f} className="px-3 py-3 text-center">
                            {n > 0 ? (
                              <span className="font-semibold text-gray-700">{n}</span>
                            ) : (
                              <span className="text-gray-300">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {report.sinGer && (
                    <tr className="bg-orange-50 hover:bg-orange-100">
                      <td className="px-4 py-3 sticky left-0 bg-orange-50 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-orange-300 flex items-center justify-center text-white font-bold">
                            !
                          </div>
                          <div>
                            <p className="font-medium text-orange-800">Sin gerencia</p>
                            <span className="text-[10px] text-orange-600">leads no asignados</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1 bg-orange-200 text-orange-800 rounded-full font-bold">
                          {report.sinGer.total}
                        </span>
                      </td>
                      {report.fuentes.map((f) => {
                        const n = report.sinGer!.porFuente[f] || 0;
                        return (
                          <td key={f} className="px-3 py-3 text-center">
                            {n > 0 ? (
                              <span className="font-semibold text-orange-700">{n}</span>
                            ) : (
                              <span className="text-orange-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-4 py-3 sticky left-0 bg-gray-100 z-10 text-gray-800">TOTAL</td>
                    <td className="px-4 py-3 text-center text-indigo-700">{report.totalGeneral}</td>
                    {report.fuentes.map((f) => (
                      <td key={f} className="px-3 py-3 text-center text-gray-700">
                        {report.totalPorFuente[f] || 0}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ActivityReportPanel;