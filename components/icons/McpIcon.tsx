import { forwardRef } from 'react'
import type { Icon, IconProps } from '@phosphor-icons/react'

/**
 * The Model Context Protocol mark, for the Settings → MCP nav item (owner, 24-09-2026:
 * "it should say MCP & use the MCP icon"). The path is simple-icons' `modelcontextprotocol`
 * (CC0 on the SVG), a single 24×24 glyph drawn in currentColor. It reads at 16 px.
 *
 * Shaped as a Phosphor icon (`size`, `color`, `weight`, `mirrored` plus every SVG prop) because
 * `NavTab.icon` is typed to Phosphor's `Icon`, and the rail passes `weight` to every icon.
 * There is one weight, so `weight` is accepted and ignored.
 */
const McpIconBase = forwardRef<SVGSVGElement, IconProps>(function McpIcon(
  { size = '1em', color = 'currentColor', weight, mirrored, alt, children, style, ...props },
  ref,
) {
  // * Taken out of props so it never reaches the <svg> as an attribute; the mark has one weight.
  void weight
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill={color}
      viewBox="0 0 24 24"
      style={mirrored ? { transform: 'scale(-1, 1)', ...style } : style}
      {...props}
    >
      {alt ? <title>{alt}</title> : null}
      {children}
      <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
    </svg>
  )
})

export const McpIcon = McpIconBase as unknown as Icon
