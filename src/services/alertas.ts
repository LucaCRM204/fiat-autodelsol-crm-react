import { api } from '../api';

export type Alerta = {
  id: number;
  userId: number;
  type: 'lead_assigned' | 'ranking_change' | 'recordatorio' | 'tarea' | 'meta' | 'cotizacion';
  message: string;
  timestamp: string;
  isRead: boolean;
  leadId?: number;
  relatedId?: number;
  leadNombre?: string;
  leadTelefono?: string;
};

export type AlertasResponse = {
  alertas: Alerta[];
  unreadCount: number;
};

export async function listAlertas(limit: number = 50, unreadOnly: boolean = false): Promise<AlertasResponse> {
  const res = await api.get('/api/alertas', {
    params: { limit, unreadOnly: unreadOnly ? 'true' : 'false' }
  });
  return {
    alertas: res.data.alertas,
    unreadCount: res.data.unreadCount
  };
}

export async function getAlertasCount(): Promise<number> {
  const res = await api.get('/api/alertas/count');
  return res.data.unreadCount;
}

export async function createAlerta(data: {
  userId: number;
  type: string;
  message: string;
  leadId?: number;
  relatedId?: number;
}): Promise<Alerta> {
  const res = await api.post('/api/alertas', data);
  return res.data.alerta;
}

export async function marcarAlertaLeida(id: number): Promise<void> {
  await api.put(`/api/alertas/${id}/leer`);
}

export async function marcarTodasLeidas(): Promise<void> {
  await api.put('/api/alertas/leer-todas');
}

export async function deleteAlerta(id: number): Promise<void> {
  await api.delete(`/api/alertas/${id}`);
}

export async function limpiarAlertasLeidas(): Promise<void> {
  await api.delete('/api/alertas/limpiar-leidas');
}
