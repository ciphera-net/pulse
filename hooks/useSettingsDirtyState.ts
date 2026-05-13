import { useState, useEffect, useRef, useCallback } from 'react'

interface UseSettingsDirtyStateOptions<T> {
  onDirtyChange?: (dirty: boolean) => void
  onRegisterSave?: (fn: () => Promise<void>) => void
  isEqual?: (a: T, b: T) => boolean
}

interface UseSettingsDirtyStateReturn<T> {
  isDirty: boolean
  snapshot: T | null
  setSnapshot: (value: T) => void
  handleDiscard: () => T | null
  registerSave: (saveFn: () => Promise<void>) => void
}

export function useSettingsDirtyState<T>(
  current: T,
  options: UseSettingsDirtyStateOptions<T> = {},
): UseSettingsDirtyStateReturn<T> {
  const { onDirtyChange, onRegisterSave, isEqual } = options
  const snapshotRef = useRef<T | null>(null)
  const [, forceRender] = useState(0)

  const isDirty = snapshotRef.current !== null
    ? isEqual
      ? !isEqual(current, snapshotRef.current)
      : JSON.stringify(current) !== JSON.stringify(snapshotRef.current)
    : false

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const setSnapshot = useCallback((value: T) => {
    snapshotRef.current = value
    forceRender(n => n + 1)
  }, [])

  const handleDiscard = useCallback((): T | null => {
    return snapshotRef.current
  }, [])

  const registerSave = useCallback(
    (saveFn: () => Promise<void>) => {
      onRegisterSave?.(saveFn)
    },
    [onRegisterSave],
  )

  return { isDirty, snapshot: snapshotRef.current, setSnapshot, handleDiscard, registerSave }
}
