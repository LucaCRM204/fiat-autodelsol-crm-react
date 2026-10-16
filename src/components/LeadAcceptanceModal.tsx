/**
 * ============================================
 * LeadAcceptanceModal.tsx
 * ============================================
 * Componente para mostrar la notificación de nuevo lead
 * y permitir aceptar o rechazar.
 * 
 * Agregar este componente al CRM.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, X, Clock } from 'lucide-react';

interface LeadOffer {
  leadId: number;
  expiresAt: string;
  timeoutMinutes: number;
  message: string;
}

interface LeadAcceptanceModalProps {
  socket: any; // Socket.io socket
  onAccepted: (leadId: number) => void;
  onRejected: (leadId: number) => void;
}

export function LeadAcceptanceModal({ socket, onAccepted, onRejected }: LeadAcceptanceModalProps) {
  const [offer, setOffer] = useState<LeadOffer | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  // Escuchar ofertas de leads
  useEffect(() => {
    if (!socket) return;

    const handleOffer = (data: LeadOffer) => {
      console.log('📥 Oferta de lead recibida:', data);
      setOffer(data);
      
      // Calcular tiempo restante
      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      setTimeLeft(Math.max(0, Math.floor((expiresAt - now) / 1000)));

      // Reproducir sonido de notificación
      playNotificationSound();
      
      // Mostrar notificación del navegador
      showBrowserNotification();
    };

    const handleOfferExpired = (data: { leadId: number; message: string }) => {
      console.log('⏰ Oferta expirada:', data);
      if (offer && offer.leadId === data.leadId) {
        setOffer(null);
      }
    };

    const handleAcceptedSuccess = (data: { leadId: number; message: string }) => {
      console.log('✅ Lead aceptado:', data);
      setOffer(null);
      onAccepted(data.leadId);
    };

    socket.on('lead:offer', handleOffer);
    socket.on('lead:offer_expired', handleOfferExpired);
    socket.on('lead:accepted_success', handleAcceptedSuccess);

    return () => {
      socket.off('lead:offer', handleOffer);
      socket.off('lead:offer_expired', handleOfferExpired);
      socket.off('lead:accepted_success', handleAcceptedSuccess);
    };
  }, [socket, offer, onAccepted]);

  // Countdown timer
  useEffect(() => {
    if (!offer || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setOffer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offer]);

  // Reproducir sonido
  const playNotificationSound = () => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleZpSX3+G/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignorar errores de audio
    }
  };

  // Notificación del navegador
  const showBrowserNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 NUEVO LEAD DISPONIBLE', {
        body: 'Tenés 10 minutos para aceptar',
        icon: '/favicon.ico',
        tag: 'lead-offer',
        requireInteraction: true
      });
    }
  };

  // Aceptar lead
  const handleAccept = useCallback(async () => {
    if (!offer) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leads/${offer.leadId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Lead aceptado:', data);
        setOffer(null);
        onAccepted(offer.leadId);
      } else {
        const error = await response.json();
        alert(error.error || 'Error al aceptar');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  }, [offer, onAccepted]);

  // Rechazar lead
  const handleReject = useCallback(async () => {
    if (!offer) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leads/${offer.leadId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        console.log('❌ Lead rechazado');
        setOffer(null);
        onRejected(offer.leadId);
      } else {
        const error = await response.json();
        alert(error.error || 'Error al rechazar');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [offer, onRejected]);

  // Formatear tiempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!offer) return null;

  const isUrgent = timeLeft <= 60; // Menos de 1 minuto

  return (
    <>
      {/* Overlay oscuro */}
      <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
        {/* Modal */}
        <div className={`
          bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4
          transform transition-all duration-300
          ${isUrgent ? 'animate-pulse ring-4 ring-red-500' : ''}
        `}>
          {/* Icono animado */}
          <div className="flex justify-center mb-6">
            <div className={`
              w-20 h-20 rounded-full flex items-center justify-center
              ${isUrgent ? 'bg-red-100' : 'bg-blue-100'}
              animate-bounce
            `}>
              <Bell className={`w-10 h-10 ${isUrgent ? 'text-red-600' : 'text-blue-600'}`} />
            </div>
          </div>

          {/* Título */}
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
            🔔 NUEVO LEAD DISPONIBLE
          </h2>

          {/* Subtítulo */}
          <p className="text-center text-gray-600 mb-6">
            Tenés un nuevo lead esperando. ¿Querés aceptarlo?
          </p>

          {/* Timer */}
          <div className={`
            flex items-center justify-center space-x-2 mb-6 p-4 rounded-xl
            ${isUrgent ? 'bg-red-100' : 'bg-gray-100'}
          `}>
            <Clock className={`w-6 h-6 ${isUrgent ? 'text-red-600' : 'text-gray-600'}`} />
            <span className={`
              text-3xl font-mono font-bold
              ${isUrgent ? 'text-red-600' : 'text-gray-800'}
            `}>
              {formatTime(timeLeft)}
            </span>
            <span className="text-gray-500">restantes</span>
          </div>

          {/* Advertencia si es urgente */}
          {isUrgent && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-700 text-center font-medium">
                ⚠️ ¡Apurate! Si no aceptás, el lead pasará al siguiente vendedor.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex space-x-4">
            <button
              onClick={handleReject}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
              <span className="font-semibold">Rechazar</span>
            </button>

            <button
              onClick={handleAccept}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 shadow-lg"
            >
              <Check className="w-5 h-5" />
              <span className="font-semibold">
                {isLoading ? 'Aceptando...' : 'Aceptar'}
              </span>
            </button>
          </div>

          {/* Nota */}
          <p className="text-xs text-gray-400 text-center mt-4">
            Al aceptar, podrás ver los datos del cliente
          </p>
        </div>
      </div>
    </>
  );
}

// ============================================
// Hook para pedir permisos de notificación
// ============================================
export function useNotificationPermission() {
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
}

// ============================================
// Componente para el badge de ofertas pendientes
// ============================================
export function PendingOffersBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-40">
      <div className="bg-red-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse flex items-center space-x-2">
        <Bell className="w-5 h-5" />
        <span className="font-bold">{count} lead{count > 1 ? 's' : ''} pendiente{count > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
