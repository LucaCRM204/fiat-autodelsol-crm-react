import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api';

type Vendor = {
  id: number;
  name: string;
  lead_percentage: number;
  leads_recibidos: number;
  ventas: number;
  porcentaje_real: number;
  porcentaje_target: number;
};

type Team = {
  supervisorId: number;
  supervisorName: string;
  vendors: Vendor[];
  totalLeads: number;
};

export default function LeadDistribution() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [savedTeam, setSavedTeam] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [localEdits, setLocalEdits] = useState<Map<number, Map<number, number>>>(new Map());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await api.get('/distribution/all');
      setTeams(res.data.teams || []);
    } catch (err) {
      console.error('Error loading distribution:', err);
    }
    setLoading(false);
  };

  const getVendorPct = (teamId: number, vendorId: number, original: number) => {
    return localEdits.get(teamId)?.get(vendorId) ?? original;
  };

  const updatePct = (teamId: number, vendorId: number, pct: number) => {
    setSavedTeam(null);
    setError('');
    setLocalEdits(prev => {
      const next = new Map(prev);
      if (!next.has(teamId)) next.set(teamId, new Map());
      next.get(teamId)!.set(vendorId, Math.max(0, Math.min(100, pct)));
      return next;
    });
  };

  const getTeamTotal = (team: Team) => {
    return team.vendors.reduce((sum, v) => sum + getVendorPct(team.supervisorId, v.id, v.lead_percentage), 0);
  };

  const distributeEvenly = (team: Team) => {
    setSavedTeam(null);
    setError('');
    const count = team.vendors.length;
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    setLocalEdits(prev => {
      const next = new Map(prev);
      const teamEdits = new Map<number, number>();
      team.vendors.forEach((v, i) => {
        teamEdits.set(v.id, base + (i < remainder ? 1 : 0));
      });
      next.set(team.supervisorId, teamEdits);
      return next;
    });
  };

  const handleSave = async (team: Team) => {
    const total = getTeamTotal(team);
    if (total !== 100 && total !== 0) {
      setError(`Equipo ${team.supervisorName}: debe sumar 100% (actual: ${total}%)`);
      return;
    }
    setSaving(team.supervisorId);
    setError('');
    try {
      await api.put('/distribution', {
        distributions: team.vendors.map(v => ({
          userId: v.id,
          percentage: getVendorPct(team.supervisorId, v.id, v.lead_percentage)
        }))
      });
      setSavedTeam(team.supervisorId);
      setTimeout(() => setSavedTeam(null), 3000);
      // Clear local edits for this team
      setLocalEdits(prev => {
        const next = new Map(prev);
        next.delete(team.supervisorId);
        return next;
      });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar');
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    );
  }

  if (teams.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Percent size={20} />
          Distribución de Leads por Equipo
        </h3>
        <p className="text-blue-200 text-sm mt-1">Configurá el % de leads que recibe cada vendedor</p>
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-50 text-red-600 text-sm flex items-center gap-1 border-b">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="divide-y">
        {teams.map(team => {
          const isExpanded = expandedTeam === team.supervisorId;
          const total = getTeamTotal(team);
          const isValid = total === 100 || total === 0;

          return (
            <div key={team.supervisorId}>
              {/* Team header */}
              <button
                onClick={() => setExpandedTeam(isExpanded ? null : team.supervisorId)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">👨‍💼</span>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">{team.supervisorName}</p>
                    <p className="text-xs text-gray-500">{team.vendors.length} vendedores • {team.totalLeads} leads (30d)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {team.vendors.some(v => v.lead_percentage > 0) && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configurado</span>
                  )}
                  {savedTeam === team.supervisorId && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Guardado
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-6 pb-4 bg-gray-50">
                  {/* Actions */}
                  <div className="flex items-center justify-between mb-4 pt-2">
                    <span className={`text-sm font-semibold ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                      Total: {total}%
                      {!isValid && <span className="font-normal text-xs ml-1">(debe ser 100%)</span>}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => distributeEvenly(team)}
                        className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded-lg"
                      >
                        Igualar
                      </button>
                      <button
                        onClick={() => handleSave(team)}
                        disabled={!isValid || saving === team.supervisorId}
                        className={`px-3 py-1 text-xs rounded-lg flex items-center gap-1 ${
                          isValid ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <Save size={12} />
                        {saving === team.supervisorId ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {/* Vendors */}
                  <div className="space-y-3">
                    {team.vendors.map(v => {
                      const pct = getVendorPct(team.supervisorId, v.id, v.lead_percentage);
                      return (
                        <div key={v.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 shadow-sm">
                          <div className="w-32 truncate">
                            <p className="text-sm font-medium text-gray-800">{v.name}</p>
                            <p className="text-[11px] text-gray-400">{v.leads_recibidos} leads • {v.ventas} ventas</p>
                          </div>
                          <div className="flex-1">
                            <input
                              type="range"
                              min={0} max={100} step={5}
                              value={pct}
                              onChange={(e) => updatePct(team.supervisorId, v.id, parseInt(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>
                          <div className="w-20 flex items-center gap-1">
                            <input
                              type="number"
                              min={0} max={100}
                              value={pct}
                              onChange={(e) => updatePct(team.supervisorId, v.id, parseInt(e.target.value) || 0)}
                              className="w-14 px-2 py-1 text-sm border rounded text-center"
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                          {v.porcentaje_target > 0 && (
                            <div className="w-16 text-right">
                              <span className={`text-[11px] ${
                                Math.abs(v.porcentaje_real - v.porcentaje_target) <= 5 ? 'text-green-600' : 'text-orange-500'
                              }`}>
                                {v.porcentaje_real}% real
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
