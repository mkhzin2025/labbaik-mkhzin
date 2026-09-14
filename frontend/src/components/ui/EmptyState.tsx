import React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    iconSize: 32,
    titleSize: 'text-base',
    descSize: 'text-sm',
    spacing: 'space-y-2',
    padding: 'p-6',
  },
  md: {
    iconSize: 48,
    titleSize: 'text-lg',
    descSize: 'text-base',
    spacing: 'space-y-3',
    padding: 'p-8',
  },
  lg: {
    iconSize: 64,
    titleSize: 'text-xl',
    descSize: 'text-base',
    spacing: 'space-y-4',
    padding: 'p-12',
  },
};

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      icon: Icon,
      title,
      description,
      action,
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
        {...props}
      >
        {Icon && (
          <div className="text-neutral-600 mb-2">
            <Icon size={config.iconSize} />
          </div>
        )}
        <h3 className={cn('font-semibold text-neutral-300', config.titleSize)}>
          {title}
        </h3>
        {description && (
          <p className={cn('text-neutral-500', config.descSize)}>
            {description}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            aria-label={action.label}
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export { EmptyState };
