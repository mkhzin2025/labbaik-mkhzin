import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeButton?: boolean;
  closeOnBackdropClick?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      size = 'md',
      closeButton = true,
      closeOnBackdropClick = true,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const handleBackdropClick = (e: React.MouseEvent) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        onClose();
      }
    };

    if (!isOpen) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div
          ref={ref}
          className={cn(
            'w-full bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl',
            'max-h-[90vh] overflow-y-auto',
            sizeStyles[size],
            className
          )}
          {...props}
        >
          {(title || closeButton) && (
            <div className="flex items-center justify-between p-6 border-b border-neutral-800">
              {title && (
                <h2 className="text-xl font-bold text-neutral-100">{title}</h2>
              )}
              {!title && <div />}
              {closeButton && (
                <button
                  onClick={onClose}
                  className="text-neutral-500 hover:text-neutral-300 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 rounded-lg p-1"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }
);
Modal.displayName = 'Modal';

export interface ModalBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalBody = React.forwardRef<HTMLDivElement, ModalBodyProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6', className)}
      {...props}
    />
  )
);
ModalBody.displayName = 'ModalBody';

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'p-6 border-t border-neutral-800 flex gap-3 justify-end',
        className
      )}
      {...props}
    />
  )
);
ModalFooter.displayName = 'ModalFooter';

export { Modal, ModalBody, ModalFooter };
