/**
 * ============================================
 * Activity Service - API de Reportes
 * ============================================
 */

import { api } from '../api';

// Tipos
export interface UserActivityReport {
  user_id: number;
  name: string;
  role: string;
  session_count: number;
  total_minutes: number;
  total_hours: number;
  first_login: string | null;
  last_logout: string | null;
}

export interface SessionDetail {
  id: number;
  date: string;
  session_start: string;
  session_end: string | null;
  duration_minutes: number | null;
}

export interface UserReportSummary {
  totalHours: number;
  totalMinutes: number;
  sessionCount: number;
  avgSessionMinutes: number;
}

export interface UserReport {
  user: {
    id: number;
    name: string;
    role: string;
  };
  period: 'day' | 'week' | 'month';
  dateRange: {
    from: string;
    to: string;
  };
  summary: UserReportSummary;
  sessions: SessionDetail[];
  dailyBreakdown: Array<{
    date: string;
    sessions: number;
    total_minutes: number;
    first_login: string;
    last_logout: string;
  }>;
}

export interface TeamReportSummary {
  totalTeamHours: number;
  activeUsers: number;
  totalUsers: number;
}

export interface TeamReport {
  period: 'day' | 'week' | 'month';
  dateRange: {
    from: string;
    to: string;
  };
  summary: TeamReportSummary;
  users: UserActivityReport[];
}

export interface ResponseTimeData {
  user_id: number;
  name: string;
  leads_received: number;
  leads_accepted: number;
  avg_response_minutes: number | null;
  pending_leads: number;
  acceptance_rate: number;
  reassignments: number;
}

export interface Reassignment {
  id: number;
  lead_id: number;
  from_user_id: number;
  to_user_id: number;
  reason: string;
  created_at: string;
  lead_nombre: string;
  lead_telefono: string;
  from_user_name: string;
  to_user_name: string;
}

// ===== FUNCIONES =====

/**
 * Obtener usuarios actualmente online
 */
export async function getOnlineUsers(): Promise<{ users: any[]; count: number }> {
  const response = await api.get('/api/activity/online');
  return response.data;
}

/**
 * Obtener reporte de actividad de un usuario
 */
export async function getUserReport(
  userId: number,
  period: 'day' | 'week' | 'month' = 'day',
  date?: string
): Promise<UserReport> {
  const params: any = { period };
  if (date) params.date = date;
  
  const response = await api.get(`/api/activity/report/${userId}`, { params });
  return response.data.report;
}

/**
 * Obtener reporte del equipo completo
 */
export async function getTeamReport(
  period: 'day' | 'week' | 'month' = 'day',
  date?: string
): Promise<TeamReport> {
  const params: any = { period };
  if (date) params.date = date;
  
  const response = await api.get('/api/activity/team-report', { params });
  return response.data.report;
}

/**
 * Obtener tiempos de respuesta a leads por vendedor
 */
export async function getLeadResponseTimes(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<ResponseTimeData[]> {
  const response = await api.get('/api/activity/lead-response-times', { 
    params: { period } 
  });
  return response.data.data;
}

/**
 * Obtener historial de reasignaciones
 */
export async function getReassignments(limit: number = 50): Promise<Reassignment[]> {
  const response = await api.get('/api/activity/reassignments', { 
    params: { limit } 
  });
  return response.data.reassignments;
}

/**
 * Formatear duración en minutos a texto legible
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1m';
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Obtener color según tiempo de respuesta
 */
export function getResponseTimeColor(minutes: number | null): string {
  if (minutes === null) return 'text-gray-400';
  if (minutes <= 2) return 'text-green-600';
  if (minutes <= 5) return 'text-green-500';
  if (minutes <= 10) return 'text-yellow-600';
  if (minutes <= 15) return 'text-orange-500';
  return 'text-red-600';
}

/**
 * Obtener etiqueta según tiempo de respuesta
 */
export function getResponseTimeLabel(minutes: number | null): string {
  if (minutes === null) return 'Sin datos';
  if (minutes <= 2) return 'Excelente';
  if (minutes <= 5) return 'Muy bueno';
  if (minutes <= 10) return 'Bueno';
  if (minutes <= 15) return 'Regular';
  return 'Necesita mejorar';
}

export default {
  getOnlineUsers,
  getUserReport,
  getTeamReport,
  getLeadResponseTimes,
  getReassignments,
  formatDuration,
  getResponseTimeColor,
  getResponseTimeLabel,
};
