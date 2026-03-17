import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string | null;
  tone?: ToastTone;
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  pushToast: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let toastSequence = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ tone = "info", duration = 2600, ...toast }: ToastOptions) => {
      const id = toastSequence++;
      setToasts((prev) => [...prev, { id, tone, duration, ...toast }]);
      window.setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.tone ?? "info"}`}
            role="status"
          >
            <div className="toast__title">{toast.title}</div>
            {toast.description ? <div className="toast__description">{toast.description}</div> : null}
            <button
              type="button"
              className="toast__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
};
