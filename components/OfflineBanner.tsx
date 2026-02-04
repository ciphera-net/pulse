'use client';

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { FiWifiOff } from 'react-icons/fi';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-600 px-4 py-2 text-sm flex items-center justify-center gap-2 font-medium z-50 relative">
      <FiWifiOff className="w-4 h-4" />
      <span>You are currently offline. Changes may not be saved.</span>
    </div>
  );
}
