import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Bumped when the same message is shown again, so its timer restarts instead of stacking a duplicate. */
  version: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_VISIBLE = 3;
// Errors usually need reading and acting on, so they stay up longer than confirmations.
const DURATION: Record<ToastType, number> = { success: 4000, info: 5000, error: 8000 };

const STYLE: Record<ToastType, { icon: ReactNode; tile: string; bar: string; label: string }> = {
  success: {
    icon: <CheckCircle2 size={18} />,
    tile: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    label: 'تم',
  },
  error: {
    icon: <AlertTriangle size={18} />,
    tile: 'bg-red-500/15 text-red-700 dark:text-red-300',
    bar: 'bg-red-500',
    label: 'خطأ',
  },
  info: {
    icon: <Info size={18} />,
    tile: 'bg-labbaik-blue/12 text-labbaik-blue dark:text-purple-300',
    bar: 'bg-labbaik-blue dark:bg-purple-300',
    label: 'تنبيه',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts((prev) => {
      const existing = prev.find((t) => t.message === message && t.type === type);
      if (existing) return prev.map((t) => (t.id === existing.id ? { ...t, version: t.version + 1 } : t));
      const toast: Toast = { id: Math.random().toString(36).slice(2, 11), message, type, version: 0 };
      return [...prev, toast].slice(-MAX_VISIBLE);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div
        className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:left-6 z-[2000] flex flex-col gap-2 sm:w-96 pointer-events-none"
        dir="rtl"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>

      <style>{`
        @keyframes toast-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes toast-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        .toast-in { animation: toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .toast-countdown { animation-name: toast-countdown; animation-timing-function: linear; animation-fill-mode: forwards; transform-origin: right; }
        @media (prefers-reduced-motion: reduce) { .toast-in { animation: none; } }
      `}</style>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = STYLE[toast.type];
  const duration = DURATION[toast.type];
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // A repeated message restarts the full countdown.
  useEffect(() => { remaining.current = duration; }, [toast.version, duration]);

  // Count down only while not hovered/focused, so a user reading an error doesn't lose it.
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, toast.version, onDismiss]);

  const isError = toast.type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="toast-in pointer-events-auto relative overflow-hidden rounded-xl border border-labbaik-border bg-labbaik-surface shadow-[0_12px_32px_-12px_rgba(15,10,30,0.35)]"
    >
      <div className="flex items-start gap-3 p-3 pe-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${style.tile}`} aria-hidden="true">{style.icon}</span>
        <p className="flex-1 min-w-0 pt-1.5 text-sm font-bold leading-relaxed text-neutral-900 dark:text-white">
          <span className="sr-only">{style.label}: </span>
          {toast.message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق الإشعار"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-labbaik-text-muted hover:text-neutral-900 dark:hover:text-white hover:bg-labbaik-page transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>
      <span
        key={toast.version}
        aria-hidden="true"
        className={`toast-countdown absolute bottom-0 inset-x-0 h-0.5 opacity-60 ${style.bar}`}
        style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
