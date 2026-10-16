import { api } from '../api';

export type Recordatorio = {
  id: number;
  leadId: number;
  fecha: string;
  hora: string;
  descripcion: string;
  completado: boolean;
  createdBy: number;
  creadoPorNombre?: string;
  leadNombre?: string;
  leadTelefono?: string;
  leadModelo?: string;
  createdAt?: string;
  completedAt?: string;
};

export async function listRecordatoriosLead(leadId: number): Promise<Recordatorio[]> {
  const res = await api.get(`/api/recordatorios/leads/${leadId}/recordatorios`);
  return res.data.recordatorios;
}

export async function listRecordatoriosPendientes(): Promise<Recordatorio[]> {
  const res = await api.get('/api/recordatorios/pendientes');
  return res.data.recordatorios;
}

export async function createRecordatorio(data: {
  leadId: number;
  fecha: string;
  hora: string;
  descripcion: string;
}): Promise<Recordatorio> {
  const res = await api.post('/api/recordatorios', data);
  return res.data.recordatorio;
}

export async function updateRecordatorio(id: number, completado: boolean): Promise<Recordatorio> {
  const res = await api.put(`/api/recordatorios/${id}`, { completado });
  return res.data.recordatorio;
}

export async function deleteRecordatorio(id: number): Promise<void> {
  await api.delete(`/api/recordatorios/${id}`);
}

export async function verificarRecordatorios(): Promise<Recordatorio[]> {
  const res = await api.get('/api/recordatorios/verificar');
  return res.data.recordatorios;
}
