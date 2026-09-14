import React from 'react';
import { cn } from '@/lib/utils';

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ className, ...props }, ref) => (
    <form
      ref={ref}
      className={cn('w-full space-y-6', className)}
      {...props}
    />
  )
);
Form.displayName = 'Form';

export interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  error?: string;
}

const FormGroup = React.forwardRef<HTMLDivElement, FormGroupProps>(
  ({ className, error, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
);
FormGroup.displayName = 'FormGroup';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  error?: string;
  helpText?: string;
  isRequired?: boolean;
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, error, helpText, isRequired, children, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {label && (
        <label className="block text-sm font-medium text-neutral-300">
          {label}
          {isRequired && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-sm text-error-500">{error}</p>
      )}
      {helpText && !error && (
        <p className="text-sm text-neutral-500">{helpText}</p>
      )}
    </div>
  )
);
FormField.displayName = 'FormField';

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  layout?: 'horizontal' | 'vertical';
}

const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  ({ className, layout = 'horizontal', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex gap-3',
        layout === 'horizontal' && 'justify-end',
        layout === 'vertical' && 'flex-col',
        className
      )}
      {...props}
    />
  )
);
FormActions.displayName = 'FormActions';

export { Form, FormGroup, FormField, FormActions };
