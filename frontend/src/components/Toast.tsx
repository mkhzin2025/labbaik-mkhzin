import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Container - Positioned at Bottom Left */}
      <div className="fixed bottom-10 left-10 z-[2000] flex flex-col gap-4 w-full max-w-sm pointer-events-none" dir="rtl">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-4 p-5 rounded-2xl shadow-2xl border animate-slide-in-left
              ${toast.type === 'success' ? 'bg-labbaik-deep border-green-500/30 text-green-400' : ''}
              ${toast.type === 'error' ? 'bg-labbaik-deep border-red-500/30 text-red-400' : ''}
              ${toast.type === 'info' ? 'bg-labbaik-deep border-labbaik-blue/30 text-labbaik-blue' : ''}
            `}
          >
            <div className="shrink-0">
              {toast.type === 'success' && <CheckCircle2 size={24} />}
              {toast.type === 'error' && <AlertCircle size={24} />}
              {toast.type === 'info' && <Info size={24} />}
            </div>
            <p className="text-sm font-black flex-1 leading-relaxed">{toast.message}</p>
            <button 
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-white/5 rounded-lg text-gray-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

