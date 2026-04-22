'use client'

import { Fragment } from 'react'
import { usePathname } from 'next/navigation'

const steps = [
  { key: 'org', label: 'Create workspace', path: '/setup/org' },
  { key: 'site', label: 'Add site', path: '/setup/site' },
  { key: 'install', label: 'Install script', path: '/setup/install' },
  { key: 'plan', label: 'Choose plan', path: '/setup/plan', optional: true },
  { key: 'done', label: 'Done', path: '/setup/done' },
]

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

interface SetupStepperProps {
  completedSteps: Set<string>
}

export default function SetupStepper({ completedSteps }: SetupStepperProps) {
  const pathname = usePathname()
  const currentIndex = steps.findIndex(s => pathname.startsWith(s.path))

  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.has(step.key)
          const isCurrent = i === currentIndex

          const circleClasses = [
            'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold shrink-0 transition-all ease-apple',
            isCompleted || isCurrent
              ? 'bg-brand-orange text-white'
              : 'bg-neutral-800 border border-neutral-700 text-neutral-400',
          ].join(' ')

          const labelColor = isCurrent
            ? 'text-white font-semibold'
            : isCompleted
              ? 'text-neutral-400'
              : 'text-neutral-500'

          const lineCompleted = isCompleted

          return (
            <Fragment key={step.key}>
              <div className="flex flex-col items-center shrink-0">
                <div className={circleClasses}>
                  {isCompleted ? <CheckIcon /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${labelColor} mt-2.5 whitespace-nowrap`}>
                  {step.label}
                </span>
                <span className={`text-[10px] mt-0.5 ${step.optional ? 'text-neutral-600' : 'invisible'}`}>
                  Optional
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-3 mb-10 ${lineCompleted ? 'bg-brand-orange' : 'bg-neutral-700'}`} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
