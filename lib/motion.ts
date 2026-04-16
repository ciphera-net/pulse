// Shared motion tokens — all framer-motion consumers must import from here.
// Keeps the whole app on one easing curve, one duration scale, one spring.

export const EASE_APPLE = [0.32, 0.72, 0, 1] as const

export const DURATION_FAST = 0.15
export const DURATION_BASE = 0.25
export const DURATION_SLOW = 0.4
export const DURATION_GENTLE = 0.6

// Underdamped spring (~3% overshoot) — makes things feel physical, not timed.
export const SPRING = { type: 'spring' as const, stiffness: 400, damping: 35 }

// Default tween for opacity and color shifts.
export const TIMING = { duration: DURATION_BASE, ease: EASE_APPLE } as const
