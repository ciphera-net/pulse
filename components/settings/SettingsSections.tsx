'use client'

import { useCallback } from 'react'

interface Section {
  id: string
  label: string
}

export default function SettingsSections({ sections }: { sections: Section[] }) {
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="flex flex-wrap gap-1.5 mb-6 pb-4 border-b border-neutral-800/60">
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => scrollTo(section.id)}
          className="px-2.5 py-1 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors ease-apple cursor-pointer"
        >
          {section.label}
        </button>
      ))}
    </div>
  )
}
