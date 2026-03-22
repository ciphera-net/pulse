'use client'

interface ScoreGaugeProps {
  score: number | null
  label: string
  size?: number
}

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function getColor(score: number): string {
  if (score >= 90) return '#0cce6b'
  if (score >= 50) return '#ffa400'
  return '#ff4e42'
}

export default function ScoreGauge({ score, label, size = 120 }: ScoreGaugeProps) {
  const hasScore = score !== null && score !== undefined
  const displayScore = hasScore ? Math.round(score) : null
  const offset = hasScore ? CIRCUMFERENCE * (1 - score / 100) : CIRCUMFERENCE
  const color = hasScore ? getColor(score) : '#6b7280'

  const fontSize = size >= 160 ? 'text-4xl' : 'text-2xl'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Track */}
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            className="text-neutral-200 dark:text-neutral-700"
            strokeWidth="8"
          />
          {/* Filled arc */}
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`${fontSize} font-bold`}
            style={{ color: hasScore ? color : undefined }}
          >
            {displayScore !== null ? displayScore : (
              <span className="text-neutral-400 dark:text-neutral-500">--</span>
            )}
          </span>
        </div>
      </div>
      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </span>
    </div>
  )
}
