import React, { useId } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  isRequired?: boolean;
  variant?: 'default' | 'filled';
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helpText,
      isRequired,
      variant = 'default',
      type = 'text',
      disabled,
      id,
      icon,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || `input-${generatedId}`;
    const variantClass = variant === 'filled' ? 'bg-neutral-800' : 'bg-neutral-900';

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-neutral-300 mb-2"
          >
            {label}
            {isRequired && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-neutral-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            className={cn(
              'w-full min-h-12 px-4 py-2 text-base bg-neutral-900 border rounded-lg transition-colors duration-200',
              'text-neutral-100 placeholder-neutral-500',
              'border-neutral-700 hover:border-neutral-600',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-error-500 focus:ring-error-500/50 focus:border-error-600',
              icon && 'pr-10',
              variantClass,
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-error-600">{error}</p>
        )}
        {helpText && !error && (
          <p className="mt-2 text-sm text-neutral-500">{helpText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
