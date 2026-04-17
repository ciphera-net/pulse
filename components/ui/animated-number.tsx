'use client'

import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'

interface AnimatedNumberProps {
  value: number
  format: (v: number) => string
  className?: string
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value)
  const spring = useSpring(motionValue, SPRING)
  const display = useTransform(spring, (v) => format(v))
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      // Skip animation on initial render — jump straight to value
      motionValue.jump(value)
      isFirst.current = false
    } else {
      motionValue.set(value)
    }
  }, [value, motionValue])

  return <motion.span className={className}>{display}</motion.span>
}
