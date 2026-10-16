/**
 * ============================================
 * PANEL DE DISTRIBUCION DE LEADS
 * ============================================
 * Va en: src/components/DistribucionLeads.tsx
 *
 * ─── LO UNICO QUE TENES QUE AJUSTAR ───────────────────────
 * 1. API_URL (abajo): la variable de entorno de tu proyecto.
 * 2. TOKEN_KEY (abajo): con que nombre guardas el JWT.
 * Todo lo demas anda tal cual.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ⚙️ AJUSTAR 1: la URL del backend.
// Vite  -> import.meta.env.VITE_API_URL
// CRA   -> process.env.REACT_APP_API_URL
const API_URL = import.meta.env.VITE_API_URL ?? '';

// ⚙️ AJUSTAR 2: como se llama el token en localStorage.
// Miralo en DevTools -> Application -> Local Storage.
const TOKEN_KEY = 'token';

// ─────────────────────────────────────────────────────────────

type Vendedor = {
  user_id: number;
  name: string;
  email: string;
  role?: string;
  peso: number;
  peso_previo: number;
  fijo: boolean;
  pausado: boolean;
  asignados_mes: number;
  asignados_total: number;
};

type Equipo = {
  lider_id: number;
  name: string;
  role: string;
  modo: 'plano' | 'cascada';
  nota?: string;
};

const COLORES = [
  '#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c',
  '#16a34a', '#ca8a04', '#4f46e5', '#0d9488', '#be123c',
  '#0284c7', '#9333ea', '#c2410c', '#059669', '#e11d48', '#4338ca',
];

export default function DistribucionLeads() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [equipoId, setEquipoId] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  const [tipo, setTipo] = useState<'vendedores' | 'equipos'>('vendedores');

  const [cargandoEquipos, setCargandoEquipos] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lote, setLote] = useState(100);

  const debounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}`,
    }),
    []
  );

  async function pedir(ruta: string, opciones: RequestInit = {}) {
    const r = await fetch(`${API_URL}/api/distribution${ruta}`, { ...opciones, headers });
    if (r.status === 401 || r.status === 403) {
      throw new Error('Tu sesión venció o no tenés permiso para este equipo.');
    }
    if (!r.ok) {
      const cuerpo = await r.json().catch(() => ({}));
      throw new Error(cuerpo.error || 'No se pudo completar la operación.');
    }
    return r.json();
  }

  // Lista de equipos para el selector
  useEffect(() => {
    (async () => {
      try {
        const data = await pedir('/gestionados');
        const lista: Equipo[] = data.equipos ?? [];
        setEquipos(lista);
        if (lista.length) setEquipoId(lista[0].lider_id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCargandoEquipos(false);
      }
    })();
  }, []);

  const cargar = useCallback(async () => {
    if (!equipoId) return;
    setCargando(true);
    try {
      const data = await pedir(`/${equipoId}/detalle`);
      setVendedores(data.vendedores ?? []);

      setTipo(data.tipo ?? 'vendedores');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [equipoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enReparto = vendedores.filter((v) => !v.pausado);
  const total = enReparto.reduce((s, v) => s + v.peso, 0);

  /** Reparto exacto del lote: la suma siempre da `lote`, no se pierde ninguno. */
  const reparto = useMemo(() => {
    if (!enReparto.length || total <= 0) return {} as Record<number, number>;
    const exactos = enReparto.map((v) => (lote * v.peso) / total);
    const base = exactos.map(Math.floor);
    const resto = lote - base.reduce((s, n) => s + n, 0);
    const orden = enReparto
      .map((_, i) => ({ i, frac: exactos[i] - base[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < resto; k++) base[orden[k % orden.length].i]++;
    return Object.fromEntries(enReparto.map((v, i) => [v.user_id, base[i]]));
  }, [enReparto, total, lote]);

  /** Mueve el slider: reacomoda en pantalla al toque y guarda medio segundo después. */
  function cambiarPorcentaje(userId: number, valor: number) {
    const v = Math.max(0, Math.min(100, valor));

    setVendedores((prev) => {
      const sumaFijos = prev
        .filter((x) => !x.pausado && x.fijo && x.user_id !== userId)
        .reduce((s, x) => s + x.peso, 0);
      const libres = prev.filter((x) => !x.pausado && !x.fijo && x.user_id !== userId);
      const sumaLibres = libres.reduce((s, x) => s + x.peso, 0);
      const disponible = Math.max(0, 100 - v - sumaFijos);

      return prev.map((x) => {
        if (x.user_id === userId) return { ...x, peso: v };
        if (x.pausado || x.fijo) return x;
        const nuevo =
          sumaLibres > 0
            ? (x.peso * disponible) / sumaLibres
            : disponible / Math.max(1, libres.length);
        return { ...x, peso: nuevo };
      });
    });

    clearTimeout(debounce.current[userId]);
    debounce.current[userId] = setTimeout(async () => {
      setGuardando(userId);
      try {
        const data = await pedir(`/${equipoId}/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ porcentaje: v }),
        });
        setVendedores(data.vendedores ?? []);
        setError(null);
      } catch (e: any) {
        setError(e.message);
        cargar();
      } finally {
        setGuardando(null);
      }
    }, 500);
  }

  async function accion(ruta: string, opciones: RequestInit) {
    try {
      const data = await pedir(ruta, opciones);
      setVendedores(data.vendedores ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      cargar();
    }
  }

  const alternarPausa = (v: Vendedor) =>
    accion(`/${equipoId}/${v.user_id}/pausa`, {
      method: 'PUT',
      body: JSON.stringify({ pausado: !v.pausado }),
    });

  const alternarFijo = (v: Vendedor) =>
    accion(`/${equipoId}/${v.user_id}`, {
      method: 'PUT',
      body: JSON.stringify({ porcentaje: v.peso, fijo: !v.fijo }),
    });

  if (cargandoEquipos) {
    return <div className="p-6 text-sm text-slate-500">Cargando equipos…</div>;
  }

  if (!equipos.length) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">
          No hay equipos para administrar.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Distribución de leads</h1>
          <p className="text-sm text-slate-500">
            {tipo === 'equipos'
              ? `De cada ${lote} datos que entran, cuántos recibe cada equipo.`
              : `De cada ${lote} datos que entran al equipo, cuántos recibe cada vendedor.`}
          </p>
        </div>

        <select
          value={equipoId ?? ''}
          onChange={(e) => setEquipoId(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {equipos.map((e) => (
            <option key={e.lider_id} value={e.lider_id}>
              {e.name}{e.modo === 'cascada' ? ' · por equipos' : ''}
            </option>
          ))}
        </select>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">Simular sobre</label>
        <input
          type="number"
          min={1}
          value={lote}
          onChange={(e) => setLote(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => accion(`/${equipoId}/parejo`, { method: 'POST' })}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Repartir parejo
        </button>
        <button
          onClick={() => accion(`/${equipoId}/sincronizar`, { method: 'POST' })}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          title="Realinea la lista con la jerarquía actual del CRM"
        >
          Sincronizar equipo
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {enReparto.map((v, i) => (
          <div
            key={v.user_id}
            title={`${v.name} · ${v.peso.toFixed(1)}%`}
            style={{
              width: `${(v.peso / (total || 1)) * 100}%`,
              background: COLORES[i % COLORES.length],
            }}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">
                {tipo === 'equipos' ? 'Equipo' : 'Vendedor'}
              </th>
              <th className="px-4 py-2.5 font-medium">Porcentaje</th>
              <th className="px-4 py-2.5 font-medium text-right">De cada {lote}</th>
              <th className="px-4 py-2.5 font-medium text-right">Recibidos</th>
              <th className="px-4 py-2.5 font-medium text-right">Estado</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}

            {!cargando && vendedores.map((v, i) => (
              <tr key={v.user_id} className={v.pausado ? 'bg-slate-50/70' : 'hover:bg-slate-50/60'}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: v.pausado ? '#cbd5e1' : COLORES[i % COLORES.length] }}
                    />
                    <div>
                      <div className={`font-medium ${v.pausado ? 'text-slate-400' : 'text-slate-900'}`}>
                        {v.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {tipo === 'equipos' ? v.role : v.email}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  {v.pausado ? (
                    <span className="text-sm text-slate-400">
                      Fuera del reparto
                      {v.peso_previo > 0 && (
                        <span className="ml-1 text-xs">· vuelve con {v.peso_previo.toFixed(1)}%</span>
                      )}
                    </span>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.5}
                        value={v.peso}
                        onChange={(e) => cambiarPorcentaje(v.user_id, Number(e.target.value))}
                        className="w-36 accent-blue-600"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={Number(v.peso.toFixed(1))}
                          onChange={(e) => cambiarPorcentaje(v.user_id, Number(e.target.value))}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                        />
                        <span className="text-slate-400">%</span>
                      </div>
                      {guardando === v.user_id && (
                        <span className="text-xs text-slate-400">guardando…</span>
                      )}
                    </div>
                  )}
                </td>

                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${v.pausado ? 'text-slate-300' : 'text-slate-900'}`}>
                  {v.pausado ? '—' : reparto[v.user_id] ?? 0}
                </td>

                <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                  {v.asignados_mes} <span className="text-xs text-slate-400">este mes</span>
                </td>

                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {tipo === 'equipos' && (
                      <button
                        onClick={() => setEquipoId(v.user_id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        title="Configurar el reparto dentro de este equipo"
                      >
                        Ver equipo
                      </button>
                    )}
                    {!v.pausado && (
                      <button
                        onClick={() => alternarFijo(v)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                          v.fijo
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                        title="Si está fijo, su porcentaje no cambia cuando movés a los demás"
                      >
                        {v.fijo ? 'Fijo' : 'Fijar'}
                      </button>
                    )}
                    <button
                      onClick={() => alternarPausa(v)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        v.pausado
                          ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                          : 'border-slate-300 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                      }`}
                      title={
                        v.pausado
                          ? 'Vuelve a recibir leads con el porcentaje que tenía'
                          : 'Deja de recibir leads y su porcentaje se reparte entre los demás'
                      }
                    >
                      {v.pausado ? 'Reanudar' : 'Pausar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!cargando && !vendedores.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  Este equipo no tiene vendedores activos.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot className="bg-slate-50 text-sm font-medium text-slate-700">
            <tr>
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5">{total.toFixed(1)}%</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {Object.values(reparto).reduce((s, n) => s + n, 0)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        {tipo === 'equipos'
          ? 'Este porcentaje define cuántos leads recibe cada equipo entero. Entrá a cada uno con "Ver equipo" para repartir esos leads entre su gente.'
          : 'Los vendedores entran y salen de esta lista según la jerarquía del CRM. Si desactivás a uno, deja de recibir leads al instante. Usá Pausar para sacarlo del reparto sin darle de baja la cuenta: guarda su porcentaje y lo recupera al reanudar. En todos los casos los demás se reajustan para seguir sumando 100.'}
      </p>
    </div>
  );
}
