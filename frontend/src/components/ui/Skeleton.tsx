import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  count?: number;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ 
    className, 
    width, 
    height = '1rem',
    circle = false,
    count = 1,
    ...props 
  }, ref) => {
    const items = Array.from({ length: count });
    
    return (
      <>
        {items.map((_, i) => (
          <div
            key={i}
            ref={ref}
            className={cn(
              'bg-neutral-200/80 dark:bg-neutral-800/80 animate-pulse',
              circle && 'rounded-full',
              !circle && 'rounded-xl',
              className
            )}
            style={{
              width: typeof width === 'number' ? `${width}px` : width || '100%',
              height: typeof height === 'number' ? `${height}px` : height,
            }}
            {...props}
          />
        ))}
      </>
    );
  }
);

Skeleton.displayName = 'Skeleton';

export interface SkeletonCardProps {
  count?: number;
  className?: string;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ count = 1, className }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i}
          className={cn(
            'bg-labbaik-surface border border-labbaik-border rounded-3xl p-6 space-y-4 shadow-sm',
            className
          )}
        >
          <div className="flex justify-between items-start">
            <Skeleton width={48} height={48} className="rounded-2xl" />
            <Skeleton width={24} height={24} className="rounded-lg" />
          </div>
          <div className="space-y-2.5">
            <Skeleton height="0.875rem" width="50%" className="rounded-md" />
            <Skeleton height="2rem" width="75%" className="rounded-lg" />
          </div>
        </div>
      ))}
    </>
  );
};

SkeletonCard.displayName = 'SkeletonCard';

export { Skeleton, SkeletonCard };
