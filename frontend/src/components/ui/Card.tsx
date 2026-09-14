import React from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'elevated' | 'flat' | 'outline' | 'labbaik' | 'labbaik-selected' | 'labbaik-hover';

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-neutral-900 border border-neutral-800',
  elevated: 'bg-neutral-900 border border-neutral-800 shadow-lg',
  flat: 'bg-neutral-800 border-0',
  outline: 'bg-transparent border border-neutral-700',
  labbaik: 'bg-white/2 border border-white/2 hover:border-white/5 transition-colors duration-300',
  'labbaik-selected': 'bg-labbaik-blue/10 border-labbaik-blue/30 shadow-xl',
  'labbaik-hover': 'bg-white/3 border-white/10 shadow-lg',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  isSelected?: boolean;
  interactive?: boolean;
}

const paddingStyles = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  none: 'p-0',
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = 'default',
      padding = 'md',
      isSelected = false,
      interactive = false,
      children,
      ...props
    },
    ref
  ) => {
    // Map Labbaik variant with isSelected state
    let computedVariant = variant;
    if (variant === 'labbaik' && isSelected) {
      computedVariant = 'labbaik-selected';
    }

    return (
      <div
        className={cn(
          'transition-colors duration-200',
          interactive && 'cursor-pointer',
          'rounded-lg',
          variantStyles[computedVariant],
          paddingStyles[padding],
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('pb-4 border-b border-neutral-700', className)}
      ref={ref}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

export type CardBodyProps = React.HTMLAttributes<HTMLDivElement>;

const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('py-4', className)}
      ref={ref}
      {...props}
    />
  )
);
CardBody.displayName = 'CardBody';

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('pt-4 border-t border-neutral-700 flex gap-3 justify-end', className)}
      ref={ref}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardBody, CardFooter };
