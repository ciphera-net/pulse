'use client';

import { WifiSlash } from '@phosphor-icons/react';

export function OfflineBanner({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] rounded-b-xl bg-yellow-500/25 border-b border-yellow-500/40 text-yellow-300 px-4 sm:px-8 py-2.5 text-sm flex items-center justify-center gap-2 font-medium shadow-md transition-shadow duration-slow ease-apple">
      <WifiSlash className="w-4 h-4 shrink-0" />
      <span>You are currently offline. Changes may not be saved.</span>
    </div>
  );
}
