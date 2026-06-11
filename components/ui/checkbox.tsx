import React from 'react'
import { CheckIcon } from '@ciphera-net/facet'
import { cn } from '@ciphera-net/facet'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  label?: React.ReactNode
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', checked, onCheckedChange, label, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-center gap-2 cursor-pointer select-none group',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <input
            type="checkbox"
            ref={ref}
            className="peer sr-only"
            checked={checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            disabled={disabled}
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 rounded-none border transition-all duration-200 flex items-center justify-center',
              checked
                ? 'bg-brand-orange border-brand-orange text-white'
                : 'bg-card border-input group-hover:border-muted-foreground',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background'
            )}
          >
            <CheckIcon className={cn('w-3.5 h-3.5 transition-transform duration-200', checked ? 'scale-100' : 'scale-0')} />
          </div>
        </div>
        {label && (
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {label}
          </span>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'
