import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, icon, ...props }, ref) => {
    return (
      <div className="relative">
        <input
          ref={ref}
          className={`
            w-full py-3 border rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 transition-all duration-200 outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:text-white
            ${icon ? 'pl-11 pr-4' : 'px-4'}
            ${error
              ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
              : 'border-neutral-200 dark:border-neutral-800 hover:border-blue-500/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}
            ${className}
          `}
          {...props}
        />
        {icon && (
          <div className={`
            absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200
            ${error ? 'text-red-400' : 'text-neutral-400 dark:text-neutral-500'}
          `}>
            {icon}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
