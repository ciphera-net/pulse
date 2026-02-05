'use client'

import { useState } from 'react'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  error?: string | null
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  autoComplete?: string
  minLength?: number
  onFocus?: () => void
  onBlur?: () => void
}

export default function PasswordInput({
  value,
  onChange,
  label = 'Password',
  placeholder = 'Enter password',
  error,
  disabled = false,
  required = false,
  className = '',
  id,
  autoComplete,
  minLength,
  onFocus,
  onBlur
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const inputId = id || 'password-input'
  const errorId = `${inputId}-error`

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          {label}
          {required && <span className="text-brand-orange text-xs ml-1">(Required)</span>}
        </label>
      )}
      <div className="relative group">
        <input
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={minLength}
          onFocus={onFocus}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`w-full pl-11 pr-12 py-3 border rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
            transition-all duration-200 outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:text-white
            ${error 
              ? 'border-red-300 dark:border-red-800 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
              : 'border-neutral-200 dark:border-neutral-800 hover:border-brand-orange/50 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10'
            }`}
        />
        
        {/* Lock Icon (Left) */}
        <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200
          ${error ? 'text-red-400' : 'text-neutral-400 dark:text-neutral-500 group-focus-within:text-brand-orange'}`}>
          <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Toggle Visibility Button (Right) */}
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 dark:text-neutral-500
            hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 focus:outline-none"
        >
          {showPassword ? (
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-500 font-medium ml-1">
          {error}
        </p>
      )}
    </div>
  )
}
