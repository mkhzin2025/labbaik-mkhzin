import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

const typeConfig: Record<AlertType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-success-900/20',
    border: 'border-success-800',
    text: 'text-success-600',
    icon: <CheckCircle size={20} />,
  },
  error: {
    bg: 'bg-error-900/20',
    border: 'border-error-800',
    text: 'text-error-600',
    icon: <AlertCircle size={20} />,
  },
  warning: {
    bg: 'bg-warning-900/20',
    border: 'border-warning-800',
    text: 'text-warning-600',
    icon: <AlertTriangle size={20} />,
  },
  info: {
    bg: 'bg-primary-900/20',
    border: 'border-primary-800',
    text: 'text-primary-700',
    icon: <Info size={20} />,
  },
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: AlertType;
  title?: string;
  message?: string;
  closeable?: boolean;
  onClose?: () => void;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      type = 'info',
      title,
      message,
      closeable = false,
      onClose,
      children,
      ...props
    },
    ref
  ) => {
    const config = typeConfig[type];

    return (
      <div
        ref={ref}
        className={cn(
          'flex gap-3 rounded-lg border p-4',
          config.bg,
          config.border,
          className
        )}
        role="alert"
        {...props}
      >
        <div className={cn('flex-shrink-0 mt-0.5', config.text)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={cn('font-semibold', config.text)}>
              {title}
            </h3>
          )}
          {message && (
            <p className="text-neutral-400 text-sm mt-1">
              {message}
            </p>
          )}
          {children && (
            <div className="text-neutral-400 text-sm mt-2">
              {children}
            </div>
          )}
        </div>
        {closeable && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-neutral-500 hover:text-neutral-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 rounded-lg p-1"
            aria-label="Close alert"
          >
            <X size={18} />
          </button>
        )}
      </div>
    );
  }
);
Alert.displayName = 'Alert';

export interface ToastProps extends AlertProps {
  duration?: number;
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ duration = 4000, onClose, ...props }, ref) => {
    React.useEffect(() => {
      if (duration && onClose) {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
      }
    }, [duration, onClose]);

    return <Alert ref={ref} closeable onClose={onClose} {...props} />;
  }
);
Toast.displayName = 'Toast';

export { Alert, Toast };
