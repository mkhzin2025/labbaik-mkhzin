import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helpText?: string;
  isRequired?: boolean;
  options?: Array<{ value: string; label: string }>;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helpText,
      isRequired,
      disabled,
      id,
      options = [],
      children,
      ...props
    },
    ref
  ) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2"
          >
            {label}
            {isRequired && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={cn(
              'w-full min-h-12 px-4 py-2.5 text-base bg-labbaik-surface border rounded-xl transition-all duration-200',
              'text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500',
              'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600',
              'focus:outline-none focus:ring-2 focus:ring-labbaik-blue/40 focus:border-labbaik-blue',
              'disabled:opacity-50 disabled:cursor-not-allowed shadow-sm',
              'appearance-none pr-10',
              error && 'border-error-500 focus:ring-error-500/50 focus:border-error-600',
              className
            )}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <ChevronDown
            size={18}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-error-500">{error}</p>
        )}
        {helpText && !error && (
          <p className="mt-2 text-sm text-neutral-500">{helpText}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };
