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

export default function WelcomeStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-lg mx-auto mb-10">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const isCompleted = step.number < currentStep
          const isCurrent = step.number === currentStep

          const circleClasses = [
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0',
            isCompleted || isCurrent
              ? 'bg-brand-orange text-white'
              : 'bg-neutral-800 border border-neutral-700 text-neutral-400',
          ].join(' ')

          const lineCompleted = i < steps.length - 1 && steps[i + 1].number <= currentStep

          return (
            <Fragment key={step.number}>
              <div className={circleClasses}>
                {isCompleted ? <CheckIcon /> : step.number}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 mx-3 ${lineCompleted ? 'bg-brand-orange' : 'bg-neutral-700'}`} />
              )}
            </Fragment>
          )
        })}
      </div>
      <div className="flex justify-between mt-2.5">
        {steps.map((step) => {
          const isCompleted = step.number < currentStep
          const isCurrent = step.number === currentStep

          const labelColor = isCurrent
            ? 'text-white font-semibold'
            : isCompleted
              ? 'text-neutral-400'
              : 'text-neutral-500'

          return (
            <span key={step.number} className={`text-xs font-medium ${labelColor}`}>
              {step.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
