'use client'

import { useEffect, useState } from 'react'
import {
  PlayIcon,
  PauseIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
} from '@radix-ui/react-icons'

/** Formats milliseconds as mm:ss. */
function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

const SPEED_OPTIONS = [1, 2, 4, 8] as const

export type ReplayPlayerControlsProps = {
  isPlaying: boolean
  onPlayPause: () => void
  currentTimeMs: number
  totalTimeMs: number
  onSeek: (fraction: number) => void
  speed: number
  onSpeedChange: (speed: number) => void
  skipInactive: boolean
  onSkipInactiveChange: () => void
  onFullscreenRequest: () => void
}

/**
 * Custom session replay player controls with Ciphera branding.
 * Matches design: brand orange #FD5E0F, Plus Jakarta Sans, rounded-xl, neutral greys.
 */
export default function ReplayPlayerControls({
  isPlaying,
  onPlayPause,
  currentTimeMs,
  totalTimeMs,
  onSeek,
  speed,
  onSpeedChange,
  skipInactive,
  onSkipInactiveChange,
  onFullscreenRequest,
}: ReplayPlayerControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  const totalSec = totalTimeMs / 1000
  const currentSec = currentTimeMs / 1000
  const fraction = totalSec > 0 ? Math.min(1, Math.max(0, currentSec / totalSec)) : 0
  const displayFraction = isSeeking ? seekValue : fraction

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    const p = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
    setSeekValue(p)
    onSeek(p)
  }
  const handleSeekPointerDown = () => {
    setSeekValue(fraction)
    setIsSeeking(true)
  }
  const handleSeekPointerUp = () => setIsSeeking(false)

  return (
    <div
      className="flex flex-col gap-3 px-4 py-3 bg-neutral-800/95 border-t border-neutral-700/80"
      style={{ fontFamily: 'var(--font-plus-jakarta-sans), system-ui, sans-serif' }}
    >
      {/* * Progress bar / timeline */}
      <div className="flex items-center gap-3">
        <span className="text-neutral-400 text-xs tabular-nums w-10 text-right shrink-0">
          {formatTime(currentTimeMs)}
        </span>
        <div className="flex-1 relative h-2 bg-neutral-600/80 rounded-full overflow-hidden group">
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full bg-brand-orange transition-all duration-150 flex items-center justify-end"
            style={{ width: `${displayFraction * 100}%` }}
          >
            {displayFraction > 0 && displayFraction < 1 && (
              <div className="w-3 h-3 rounded-full bg-white shadow-md border border-neutral-800 -mr-1.5 flex-shrink-0" />
            )}
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={isSeeking ? seekValue : fraction}
            onChange={handleSeekChange}
            onMouseDown={handleSeekPointerDown}
            onMouseUp={handleSeekPointerUp}
            onTouchStart={handleSeekPointerDown}
            onTouchEnd={handleSeekPointerUp}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Seek"
          />
        </div>
        <span className="text-neutral-400 text-xs tabular-nums w-10 shrink-0">
          {formatTime(totalTimeMs)}
        </span>
      </div>

      {/* * Buttons row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {/* * Play / Pause */}
          <button
            type="button"
            onClick={onPlayPause}
            className="w-9 h-9 rounded-lg bg-brand-orange text-white flex items-center justify-center hover:bg-brand-orange/90 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 focus:ring-offset-neutral-800"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <PauseIcon className="w-4 h-4" />
            ) : (
              <PlayIcon className="w-4 h-4 ml-0.5" />
            )}
          </button>

          {/* * Speed pills */}
          <div className="flex items-center rounded-lg overflow-hidden border border-neutral-600/80">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:ring-inset ${
                  speed === s
                    ? 'bg-brand-orange text-white'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-600/60'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* * Skip inactive toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={skipInactive}
            onClick={onSkipInactiveChange}
            className="flex items-center gap-2 ml-2 bg-transparent border-0 cursor-pointer select-none p-0 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 focus:ring-offset-neutral-800 rounded"
          >
            <span className="text-neutral-400 text-xs">Skip inactive</span>
            <span
              className={`relative inline-block w-9 h-5 rounded-full transition-colors duration-200 ${
                skipInactive ? 'bg-brand-orange' : 'bg-neutral-600'
              }`}
            >
              <span
                className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${
                  skipInactive ? 'left-5' : 'left-1'
                }`}
              />
            </span>
          </button>
        </div>

        {/* * Fullscreen */}
        <button
          type="button"
          onClick={onFullscreenRequest}
          className="w-9 h-9 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-600/60 flex items-center justify-center transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 focus:ring-offset-neutral-800"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <ExitFullScreenIcon className="w-4 h-4" />
          ) : (
            <EnterFullScreenIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
