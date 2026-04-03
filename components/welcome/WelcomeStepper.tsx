'use client'

import { Fragment } from 'react'

const steps = [
  { number: 1, label: 'Set up workspace' },
  { number: 2, label: 'Add your site' },
  { number: 3, label: 'Install script' },
]

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

interface WelcomeStepperProps {
  currentStep: number
  onStepClick?: (step: number) => void
}

export default function WelcomeStepper({ currentStep, onStepClick }: WelcomeStepperProps) {
  return (
    <div className="w-full max-w-lg mx-auto mb-10">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isCompleted = step.number < currentStep
          const isCurrent = step.number === currentStep
          const isClickable = isCompleted && onStepClick

          const circleClasses = [
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-all',
            isCompleted || isCurrent
              ? 'bg-brand-orange text-white'
              : 'bg-neutral-800 border border-neutral-700 text-neutral-400',
            isClickable ? 'cursor-pointer hover:bg-brand-orange/80' : '',
          ].join(' ')

          const labelColor = isCurrent
            ? 'text-white font-semibold'
            : isCompleted
              ? 'text-neutral-400'
              : 'text-neutral-500'

          const lineCompleted = i < steps.length - 1 && steps[i + 1].number <= currentStep

          return (
            <Fragment key={step.number}>
              <div className="flex flex-col items-center shrink-0">
                <button
                  type="button"
                  className={circleClasses}
                  onClick={isClickable ? () => onStepClick(step.number) : undefined}
                  disabled={!isClickable}
                  aria-label={isClickable ? `Go back to ${step.label}` : undefined}
                >
                  {isCompleted ? <CheckIcon /> : step.number}
                </button>
                <span className={`text-xs font-medium ${labelColor} mt-2.5 whitespace-nowrap ${isClickable ? 'cursor-pointer' : ''}`}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-3 mb-7 ${lineCompleted ? 'bg-brand-orange' : 'bg-neutral-700'}`} />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
