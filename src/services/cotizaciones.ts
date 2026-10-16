import { api } from '../api';

export type CotizacionPlan = {
  cuotas: number;
  valorCuota: number;
  tasaInteres: number;
  totalFinanciado: number;
};

export type Cotizacion = {
  id: number;
  leadId: number;
  vehiculo: string;
  precioContado: number;
  anticipo: number;
  valorUsado: number;
  planes: CotizacionPlan[];
  bonificaciones?: string;
  notas?: string;
  createdAt: string;
  createdBy: number;
  creadoPorNombre?: string;
};

export async function listCotizacionesLead(leadId: number): Promise<Cotizacion[]> {
  const res = await api.get(`/api/cotizaciones/leads/${leadId}/cotizaciones`);
  return res.data.cotizaciones;
}

export async function createCotizacion(data: {
  leadId: number;
  vehiculo: string;
  precioContado: number;
  anticipo?: number;
  valorUsado?: number;
  planes?: CotizacionPlan[];
  bonificaciones?: string;
  notas?: string;
}): Promise<Cotizacion> {
  const res = await api.post('/api/cotizaciones', data);
  return res.data.cotizacion;
}

export async function deleteCotizacion(id: number): Promise<void> {
  await api.delete(`/api/cotizaciones/${id}`);
}

export async function getCotizacionesStats(): Promise<any> {
  const res = await api.get('/api/cotizaciones/stats');
  return res.data.stats;
}
