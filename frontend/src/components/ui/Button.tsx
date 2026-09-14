import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-700 text-neutral-0 hover:bg-primary-800 focus-visible:ring-primary-500',
  secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 focus-visible:ring-neutral-400 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600',
  tertiary: 'bg-transparent text-primary-700 border border-primary-700 hover:bg-primary-50 focus-visible:ring-primary-500 dark:text-primary-300 dark:border-primary-300 dark:hover:bg-primary-900',
  ghost: 'bg-transparent text-neutral-900 hover:bg-neutral-100 focus-visible:ring-neutral-400 dark:text-neutral-100 dark:hover:bg-neutral-800',
  danger: 'bg-error-600 text-neutral-0 hover:bg-error-700 focus-visible:ring-error-500',
  success: 'bg-success-600 text-neutral-0 hover:bg-success-700 focus-visible:ring-success-500',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-8 px-3 text-xs',
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-5 text-base',
  lg: 'h-12 px-6 text-lg',
  xl: 'h-14 px-8 text-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isFullWidth = false,
      isLoading = false,
      loadingText = 'Loading...',
      children,
      disabled,
      ...props
    },
    ref
  ) => (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-h-10',
        variantStyles[variant],
        sizeStyles[size],
        isFullWidth && 'w-full',
        className
      )}
      ref={ref}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{loadingText}</> : children}
    </button>
  )
);
Button.displayName = 'Button';

export { Button };
