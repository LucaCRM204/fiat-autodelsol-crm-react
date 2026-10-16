import { api } from '../api';

export interface Meta {
  id: number;
  vendedor_id: number;
  mes: string;
  meta_ventas: number;
  meta_leads: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  vendedor_name?: string;
  created_by_name?: string;
}

export interface ProgresoMeta {
  tiene_meta: boolean;
  meta_ventas: number;
  meta_leads: number;
  ventas_reales: number;
  leads_reales: number;
  porcentaje_ventas: number;
  porcentaje_leads: number;
  cumple_meta_ventas?: boolean;
  cumple_meta_leads?: boolean;
}

export const listMetas = async (mes?: string, vendedor_id?: number): Promise<Meta[]> => {
  const params = new URLSearchParams();
  if (mes) params.append('mes', mes);
  if (vendedor_id) params.append('vendedor_id', vendedor_id.toString());
  
  const response = await api.get(`/metas?${params.toString()}`);
  return response.data;
};

export const getMeta = async (id: number): Promise<Meta> => {
  const response = await api.get(`/metas/${id}`);
  return response.data;
};

export const createMeta = async (meta: Omit<Meta, 'id' | 'created_at' | 'updated_at'>): Promise<Meta> => {
  const response = await api.post('/metas', meta);
  return response.data;
};

export const updateMeta = async (id: number, meta: Partial<Meta>): Promise<Meta> => {
  const response = await api.put(`/metas/${id}`, meta);
  return response.data;
};

export const deleteMeta = async (id: number): Promise<void> => {
  await api.delete(`/metas/${id}`);
};

export const getProgresoMeta = async (vendedor_id: number, mes: string): Promise<ProgresoMeta> => {
  const response = await api.get(`/metas/progreso/${vendedor_id}/${mes}`);
  return response.data;
};