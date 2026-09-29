import React, { useEffect, useState } from 'react';
import { socketService } from '../../lib/socket';
import { WifiOff, RefreshCw } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [status, setStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');

  useEffect(() => {
    return socketService.onStatusChange((s) => setStatus(s));
  }, []);

  if (status === 'connected') return null;

  return (
    <div
      className={`w-full py-2 px-4 text-xs font-medium flex items-center justify-center gap-2 transition-colors z-40 ${
        status === 'reconnecting'
          ? 'bg-amber-500/20 text-amber-300 border-b border-amber-500/30'
          : 'bg-rose-500/20 text-rose-300 border-b border-rose-500/30'
      }`}
    >
      {status === 'reconnecting' ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Real-time connection interrupted. Reconnecting to Pulse server...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>Disconnected from real-time events. Check your network connection.</span>
        </>
      )}
    </div>
  );
};
