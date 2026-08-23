import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const flash = useCallback((message) => {
    setToast(message);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <ToastContext.Provider value={flash}>
      {children}
      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 18,
            zIndex: 80,
            background: 'var(--color-accent-2-800)',
            color: 'var(--color-accent-2-100)',
            padding: '10px 20px',
            borderRadius: 999,
            fontSize: 13,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
