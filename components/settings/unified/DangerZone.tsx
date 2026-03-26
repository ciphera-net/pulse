'use client'

import { Button } from '@ciphera-net/ui'

interface DangerZoneItem {
  title: string
  description: string
  buttonLabel: string
  /** 'outline' = bordered button (Reset Data style), 'solid' = red filled button (Delete style) */
  variant: 'outline' | 'solid'
  onClick: () => void
  disabled?: boolean
}

interface DangerZoneProps {
  items: DangerZoneItem[]
  children?: React.ReactNode
}

export function DangerZone({ items, children }: DangerZoneProps) {
  return (
    <div className="space-y-4 pt-6 border-t border-neutral-800">
      <div>
        <h3 className="text-base font-semibold text-red-500 mb-1">Danger Zone</h3>
        <p className="text-xs text-neutral-500">Irreversible actions.</p>
      </div>

      {items.map((item) => (
        <div key={item.title} className="rounded-xl border border-red-900/30 bg-red-900/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="text-xs text-neutral-400">{item.description}</p>
            </div>
            {item.variant === 'outline' ? (
              <Button
                variant="secondary"
                className="text-sm text-red-400 border-red-900 hover:bg-red-900/20"
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.buttonLabel}
              </Button>
            ) : (
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.buttonLabel}
              </button>
            )}
          </div>
        </div>
      ))}

      {children}
    </div>
  )
}
