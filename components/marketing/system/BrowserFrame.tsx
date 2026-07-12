import type { ReactNode } from 'react'

// Browser-window chrome in the house grammar: the installation page's
// editor-dots recipe (squares on tokens, no traffic-light colors) as a title
// bar. It gives a screenshot the "picture of the running app" affordance —
// the label is the URL where the real thing lives.
export function BrowserFrame({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <div className="flex items-center border-b border-border bg-card px-4 py-3">
        <div aria-hidden="true" className="flex gap-2">
          <div className="h-3 w-3 bg-muted" />
          <div className="h-3 w-3 bg-muted" />
          <div className="h-3 w-3 bg-muted" />
        </div>
        <span className="ml-4 font-mono text-xs text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  )
}
