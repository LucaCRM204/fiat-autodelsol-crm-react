import { useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';

interface UserPresencePanelProps {
  onlineUsers: number[];
  allUsers: any[];
  currentUserRole?: string;
}

export function UserPresencePanel({ onlineUsers, allUsers, currentUserRole }: UserPresencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Solo mostrar para roles superiores
  if (!['owner', 'director', 'gerente'].includes(currentUserRole || '')) {
    return null;
  }

  const onlineUsersList = allUsers.filter(u => onlineUsers.includes(u.id));
  const offlineUsersList = allUsers.filter(u => !onlineUsers.includes(u.id) && u.role === 'vendedor');

  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-sm text-gray-300 hover:text-white"
      >
        <div className="flex items-center gap-2">
          <Users size={16} />
          <span>Usuarios Online</span>
          <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
            {onlineUsers.length}
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {/* Online */}
          <div>
            <p className="text-xs text-gray-500 mb-1">En línea</p>
            {onlineUsersList.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Nadie conectado</p>
            ) : (
              <div className="space-y-1">
                {onlineUsersList.map(user => (
                  <div key={user.id} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-gray-300">{user.name}</span>
                    <span className="text-xs text-gray-500">({user.role})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Offline vendedores */}
          {offlineUsersList.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <p className="text-xs text-gray-500 mb-1">Vendedores desconectados</p>
              <div className="space-y-1">
                {offlineUsersList.slice(0, 5).map(user => (
                  <div key={user.id} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-gray-500 rounded-full" />
                    <span className="text-gray-400">{user.name}</span>
                  </div>
                ))}
                {offlineUsersList.length > 5 && (
                  <p className="text-xs text-gray-500">
                    +{offlineUsersList.length - 5} más
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}