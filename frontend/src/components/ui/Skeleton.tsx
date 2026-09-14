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
              'bg-neutral-800 animate-pulse',
              circle && 'rounded-full',
              !circle && 'rounded-md',
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
            'bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4',
            className
          )}
        >
          <div className="flex justify-between items-start">
            <Skeleton width={48} height={48} className="rounded-xl" />
            <Skeleton width={20} height={20} />
          </div>
          <div className="space-y-2">
            <Skeleton height="0.75rem" width="60%" />
            <Skeleton height="1.75rem" width="80%" />
          </div>
        </div>
      ))}
    </>
  );
};

SkeletonCard.displayName = 'SkeletonCard';

export { Skeleton, SkeletonCard };
