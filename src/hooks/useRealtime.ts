import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface RealtimeNotification {
  id: string;
  type: 'lead_created' | 'lead_updated' | 'lead_deleted' | 'lead_assigned' | 'lead_reassigned_away' | 'message' | 'alert' | 'warning';
  title: string;
  message: string;
  timestamp: string | Date;
  read: boolean;
  severity?: 'info' | 'warning' | 'error' | 'success';
  leadId?: number;
}

interface UseRealtimeOptions {
  onLeadCreated?: (lead: any) => void;
  onLeadUpdated?: (lead: any) => void;
  onLeadDeleted?: (leadId: number) => void;
  onNotification?: (notification: RealtimeNotification) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const optionsRef = useRef(options);
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    // Socket.io conecta a la raíz del server, no a /api
    const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');
    
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('🔌 Socket conectado');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Socket desconectado');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err: any) => {
      console.error('🔌 Socket error:', err.message);
    });

    newSocket.on('users:online', (userIds: number[]) => {
      setOnlineUsers(userIds);
    });

    newSocket.on('lead:created', (lead: any) => {
      console.log('📥 Lead creado:', lead);
      optionsRef.current.onLeadCreated?.(lead);
    });

    newSocket.on('lead:updated', (lead: any) => {
      console.log('📝 Lead actualizado:', lead);
      optionsRef.current.onLeadUpdated?.(lead);
    });

    newSocket.on('lead:deleted', (leadId: number) => {
      console.log('🗑️ Lead eliminado:', leadId);
      optionsRef.current.onLeadDeleted?.(leadId);
    });

    newSocket.on('notification', (notification: RealtimeNotification) => {
      setNotifications(prev => [notification, ...prev]);
      optionsRef.current.onNotification?.(notification);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const emitLeadCreated = useCallback((lead: any) => {
    socket?.emit('lead:created', lead);
  }, [socket]);

  const emitLeadUpdated = useCallback((lead: any) => {
    socket?.emit('lead:updated', lead);
  }, [socket]);

  const emitLeadDeleted = useCallback((leadId: number) => {
    socket?.emit('lead:deleted', leadId);
  }, [socket]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    socket,
    isConnected,
    onlineUsers,
    notifications,
    emitLeadCreated,
    emitLeadUpdated,
    emitLeadDeleted,
    markNotificationRead,
    clearNotifications,
  };
}