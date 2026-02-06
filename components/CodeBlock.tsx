'use client'

/**
 * @file Reusable code block component for integration guide pages.
 *
 * Renders a VS-Code-style code block with a filename tab header.
 */

interface CodeBlockProps {
  /** Filename displayed in the tab header */
  filename: string
  /** The code string to render inside the block */
  children: string
}

/**
 * Renders a dark-themed code snippet with a filename tab.
 */
export function CodeBlock({ filename, children }: CodeBlockProps) {
  return (
    <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
      <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
        <span className="text-xs text-neutral-400 font-mono">{filename}</span>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-neutral-300">{children}</pre>
      </div>
    </div>
  )
}
