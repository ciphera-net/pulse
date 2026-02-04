'use client'

import UtmBuilder from '@/components/tools/UtmBuilder'

export default function ToolsPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6 text-neutral-900 dark:text-white">Tools</h1>
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <h2 className="text-lg font-semibold mb-4 text-neutral-900 dark:text-white">UTM Campaign Builder</h2>
        <UtmBuilder />
      </div>
    </div>
  )
}
