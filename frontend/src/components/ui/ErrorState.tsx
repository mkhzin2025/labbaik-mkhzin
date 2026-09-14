import React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  message: string;
  details?: string;
  retry?: {
    label?: string;
    onClick: () => void;
    loading?: boolean;
  };
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    iconSize: 32,
    titleSize: 'text-base',
    messageSize: 'text-sm',
    spacing: 'space-y-2',
    padding: 'p-6',
  },
  md: {
    iconSize: 48,
    titleSize: 'text-lg',
    messageSize: 'text-base',
    spacing: 'space-y-3',
    padding: 'p-8',
  },
  lg: {
    iconSize: 64,
    titleSize: 'text-xl',
    messageSize: 'text-base',
    spacing: 'space-y-4',
    padding: 'p-12',
  },
};

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      icon: Icon = AlertCircle,
      title,
      message,
      details,
      retry,
      size = 'md',
      ...props
    },
    ref
  ) => {
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          config.padding,
          config.spacing,
          className
        )}
        role="alert"
        {...props}
      >
        <div className="text-error-600 mb-2">
          <Icon size={config.iconSize} />
        </div>
        <h3 className={cn('font-semibold text-neutral-300', config.titleSize)}>
          {title}
        </h3>
        <p className={cn('text-neutral-400', config.messageSize)}>
          {message}
        </p>
        {details && (
          <p className={cn('text-neutral-500 text-xs', config.messageSize)}>
            {details}
          </p>
        )}
        {retry && (
          <button
            onClick={retry.onClick}
            disabled={retry.loading}
            className="mt-4 px-4 py-2 bg-error-600 hover:bg-error-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-error-500/50"
            aria-label={retry.label || 'Retry'}
          >
            {retry.loading ? 'Retrying...' : (retry.label || 'Retry')}
          </button>
        )}
      </div>
    );
  }
);

ErrorState.displayName = 'ErrorState';

export { ErrorState };
