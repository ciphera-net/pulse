import type { Theme } from '@/lib/theme'

/**
 * A miniature of the dashboard in one theme: rail, KPI column, chart line, two
 * list cards. Used by the Theme picker in Settings (owner pick A, 24-09-2026).
 *
 * 🔴 FIXED COLOURS, NOT THEME TOKENS (design D8). The Dark card must stay dark on
 * a light page and the Light card light on a dark one, so these colours are
 * literal and never read `--background` / `neutral-*`. Values are the two
 * palettes' own (Facet dark `:root`; the Canvas light palette).
 */
const PALETTE = {
  dark: { page: '#0a0a0a', card: '#101010', line: '#222222', fg: '#d9d9d9', muted: '#4d4d4d', wash: 'rgba(253,94,15,.24)', area: 'rgba(253,94,15,.16)' },
  light: { page: '#f4f4f4', card: '#ffffff', line: '#e2e2e2', fg: '#262626', muted: '#c4c4c4', wash: 'rgba(253,94,15,.16)', area: 'rgba(253,94,15,.10)' },
} as const
const ORANGE = '#fd5e0f'

type Resolved = keyof typeof PALETTE

function Bar({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: color }} />
}

function Rows({ x, y, w, c }: { x: number; y: number; w: number; c: (typeof PALETTE)[Resolved] }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <Bar x={x} y={y + i * 7.5} w={w * (0.82 - i * 0.24)} h={5} color={c.wash} />
          <Bar x={x + w * 0.9} y={y + i * 7.5 + 1.2} w={w * 0.08} h={2.6} color={c.fg} />
        </div>
      ))}
    </>
  )
}

function Mini({ theme }: { theme: Resolved }) {
  const c = PALETTE[theme]
  const box = (style: React.CSSProperties) => <div style={{ position: 'absolute', ...style }} />
  return (
    <div data-preview={theme} style={{ position: 'absolute', inset: 0, background: c.page, overflow: 'hidden' }}>
      {box({ left: 0, top: 0, bottom: 0, width: '7%', borderRight: `1px solid ${c.line}` })}
      <Bar x={1.8} y={6} w={3.4} h={5} color={ORANGE} />
      {[22, 32, 42].map((y) => <Bar key={y} x={1.8} y={y} w={3.4} h={4} color={c.muted} />)}
      {box({ left: '7%', right: 0, top: 0, height: '10%', borderBottom: `1px solid ${c.line}` })}
      <Bar x={10} y={3.8} w={14} h={2.6} color={c.muted} />
      {box({ left: '12%', right: '4%', top: '16%', height: '36%', background: c.card, border: `1px solid ${c.line}` })}
      {box({ left: '12%', width: '19%', top: '16%', height: '36%', borderRight: `1px solid ${c.line}` })}
      <Bar x={14.5} y={21} w={9} h={3} color={c.muted} />
      <Bar x={14.5} y={26.5} w={7} h={5} color={c.fg} />
      <Bar x={14.5} y={37} w={9} h={3} color={c.muted} />
      <Bar x={14.5} y={42.5} w={6} h={5} color={c.fg} />
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', left: '34%', top: '26%', width: '61%', height: '22%', overflow: 'visible' }}>
        <path d="M0,30 L10,24 L20,27 L30,12 L40,22 L50,6 L60,18 L70,20 L80,15 L90,19 L100,14 L100,40 L0,40Z" fill={c.area} />
        <polyline points="0,30 10,24 20,27 30,12 40,22 50,6 60,18 70,20 80,15 90,19 100,14" fill="none" stroke={ORANGE} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      {box({ left: '12%', width: '40%', top: '58%', bottom: '6%', background: c.card, border: `1px solid ${c.line}` })}
      {box({ left: '54%', right: '4%', top: '58%', bottom: '6%', background: c.card, border: `1px solid ${c.line}` })}
      <Rows x={14.5} y={66} w={35} c={c} />
      <Rows x={56.5} y={66} w={37} c={c} />
    </div>
  )
}

/** Match system is drawn split on the diagonal: dark top-left, light bottom-right. */
export default function ThemePreview({ theme }: { theme: Theme }) {
  if (theme !== 'system') return <Mini theme={theme} />
  return (
    <div data-preview="system" style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0,100% 0,0 100%)' }}><Mini theme="dark" /></div>
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0,100% 100%,0 100%)' }}><Mini theme="light" /></div>
    </div>
  )
}
