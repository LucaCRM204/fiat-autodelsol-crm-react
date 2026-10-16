import { api } from "../api";

export type Lead = {
  id: number;
  nombre: string;
  telefono: string;
  modelo: string;
  formaPago?: string;
  infoUsado?: string;
  entrega?: boolean;
  fecha?: string;
  estado?: string;
  vendedor?: number | null;
  notas?: string;
  fuente?: string;
};

export const listLeads = async (): Promise<Lead[]> => {
  const response = await api.get("/leads");
  return response.data.leads || response.data || [];
};

export const createLead = async (p: Partial<Lead>) => {
  const response = await api.post("/leads", p);
  return response.data.lead || response.data;
};

export const updateLead = async (id: number, p: Partial<Lead>) => {
  const response = await api.put(`/leads/${id}`, p);
  return response.data.lead || response.data;
};

export const deleteLead = async (id: number) =>
  (await api.delete(`/leads/${id}`)).data;
