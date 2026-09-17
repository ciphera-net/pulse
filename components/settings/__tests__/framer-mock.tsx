// Shared framer-motion test stand-in for jsdom. NOT a test file (no
// `.test.` in the name), so vitest's `include` glob never collects it.
//
// WHY a Map cache: most inline per-file mocks returned a FRESH component
// from every Proxy `get` (`new Proxy({}, { get: () => (props) => <div .../> })`).
// React keys reconciliation on component TYPE, so a fresh function on every
// `motion.div` access is a new type on every render — React tears the whole
// subtree down and remounts it instead of updating in place. On a page with
// a `motion.div`-wrapped panel, that meant every SettingsPanel remounted on
// every keystroke (the Profile builder's note, §9.4). Caching one component
// per tag name fixes it: `motion.div` is the SAME component reference across
// renders, so React reconciles instead of remounting. framer-mock.test.tsx
// pins this with a mount counter.
import { createElement, forwardRef, type ReactNode } from 'react'

// Props that only mean something to real framer-motion — never real DOM
// attributes, and React would console-warn on an unrecognised one reaching a
// host element. Dropped before the element renders. `style` is deliberately
// NOT in this set: it is a normal DOM prop many callers pass through motion
// elements and must keep working.
const FRAMER_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'layout',
  'layoutId',
  'layoutDependency',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'whileDrag',
  'viewport',
  'drag',
  'dragConstraints',
  'onAnimationStart',
  'onAnimationComplete',
  'onViewportEnter',
  'onViewportLeave',
  'custom',
  'inherit',
  'transformTemplate',
])

function stripFramerProps(props: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {}
  for (const key in props) {
    if (!FRAMER_ONLY_PROPS.has(key)) rest[key] = props[key]
  }
  return rest
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MotionComponent = ReturnType<typeof forwardRef<any, any>>

const componentCache = new Map<string, MotionComponent>()

function motionComponent(tag: string): MotionComponent {
  const cached = componentCache.get(tag)
  if (cached) return cached

  const Created: MotionComponent = forwardRef(function MotionStub(props, ref) {
    const { children, ...rest } = props as { children?: ReactNode; [key: string]: unknown }
    return createElement(tag, { ref, ...stripFramerProps(rest) }, children)
  })
  Created.displayName = `motion.${tag}`
  componentCache.set(tag, Created)
  return Created
}

export const motion = new Proxy({} as Record<string, MotionComponent>, {
  get: (_target, tag: string) => motionComponent(tag),
})

export function AnimatePresence({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export function MotionConfig({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export function LayoutGroup({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export function useReducedMotion(): boolean {
  return false
}
