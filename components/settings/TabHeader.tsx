interface TabHeaderProps {
  title: string
  description: string
  action?: React.ReactNode
}

export default function TabHeader({ title, description, action }: TabHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-neutral-400">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
