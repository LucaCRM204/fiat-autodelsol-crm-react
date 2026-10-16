import { api } from '../api';

export type NotaInterna = {
  id: number;
  leadId: number;
  texto: string;
  usuario: string;
  userId: number;
  timestamp: string;
};

export async function listNotasLead(leadId: number): Promise<NotaInterna[]> {
  const res = await api.get(`/api/notas/leads/${leadId}/notas`);
  return res.data.notas;
}

export async function createNota(leadId: number, texto: string): Promise<NotaInterna> {
  const res = await api.post(`/api/notas/leads/${leadId}/notas`, { texto });
  return res.data.nota;
}

export async function deleteNota(id: number): Promise<void> {
  await api.delete(`/api/notas/${id}`);
}
