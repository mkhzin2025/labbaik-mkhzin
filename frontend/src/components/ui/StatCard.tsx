import React from 'react';
import { cn, toEnglishDigits } from '@/lib/utils';
import { Card, CardBody } from './Card';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  iconBgColor?: string;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({
    icon,
    label,
    value,
    iconBgColor = 'bg-primary-500/10',
    iconColor = 'text-primary-500',
    trend = 'neutral',
    subtitle,
    className,
    ...props
  }, ref) => {
    return (
      <Card variant="default" ref={ref} className={cn('rounded-3xl hover:border-labbaik-blue/40 transition-all duration-200 shadow-sm', className)} {...props}>
        <CardBody className="space-y-4">
          <div className="flex justify-between items-start">
            <div className={cn('p-3 rounded-2xl flex items-center justify-center', iconBgColor)}>
              <div className={cn('flex items-center justify-center', iconColor)}>
                {icon}
              </div>
            </div>
            {trend === 'up' && (
              <div className="text-success-500 p-1 bg-success-500/10 rounded-lg">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414-1.414L13.586 7H12z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            {trend === 'down' && (
              <div className="text-error-500 p-1 bg-error-500/10 rounded-lg">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 13a1 1 0 110 2H7a1 1 0 01-1-1V9a1 1 0 112 0v3.586l4.293-4.293a1 1 0 011.414 1.414L9.414 13H12z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase tracking-wider">{label}</h3>
            <p className="text-2xl font-black text-neutral-900 dark:text-white tabular-nums">
              {typeof value === 'number' ? value.toLocaleString('en-US') : toEnglishDigits(value)}
            </p>
            {subtitle && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">{subtitle}</p>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }
);

StatCard.displayName = 'StatCard';

export { StatCard };
