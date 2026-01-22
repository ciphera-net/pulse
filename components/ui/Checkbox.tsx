import React from 'react';
import { CheckIcon } from '@radix-ui/react-icons';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', checked, onCheckedChange, label, disabled, ...props }, ref) => {
    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer select-none group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
          <div className={`
            w-5 h-5 rounded-md border transition-all duration-200 flex items-center justify-center
            ${checked 
              ? 'bg-brand-orange border-brand-orange text-white' 
              : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 group-hover:border-brand-orange/50'}
            peer-focus-visible:ring-2 peer-focus-visible:ring-brand-orange/20 peer-focus-visible:ring-offset-2
          `}>
            <CheckIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${checked ? 'scale-100' : 'scale-0'}`} />
          </div>
        </div>
        {label && (
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-200 transition-colors">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
