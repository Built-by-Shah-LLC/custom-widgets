'use client';

import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from 'framer-motion';
import { liveCacheWarningOf } from '@/lib/live-cache-warning';
import { cn } from '@/lib/utils/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastProps) {
  const shouldReduceMotion = useReducedMotion();
  const durationMs = toast.duration ?? 3000;

  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, durationMs);

    return () => clearTimeout(timer);
  }, [toast.id, durationMs, onRemove]);

  const typeClasses: Record<ToastType, string> = {
    success: 'bg-[var(--color-accent)] text-[var(--color-bg-primary)]',
    error: 'bg-[var(--color-danger)] text-[var(--color-bg-primary)]',
    warning: 'bg-[var(--color-warning)] text-[var(--color-bg-primary)]',
    info: 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]',
  };

  const transition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 400, damping: 34 };

  return (
    <motion.div
      layout
      initial={shouldReduceMotion ? false : { opacity: 0, x: 40, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.97 }}
      transition={transition}
      className="relative overflow-hidden rounded-[var(--radius-md)]"
    >
      <div
        className={cn(
          'px-4 py-3 rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] text-sm font-medium min-w-[240px] max-w-[400px]',
          typeClasses[toast.type]
        )}
        role="status"
      >
        {toast.message}
      </div>
      {!shouldReduceMotion && durationMs > 0 && (
        <motion.div
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full origin-left bg-[var(--color-bg-primary)]/40 rounded-b-[var(--radius-md)]"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: durationMs / 1000, ease: 'linear' }}
          aria-hidden
        />
      )}
    </motion.div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<Toast, 'id'>>).detail;
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { ...detail, id }]);
    };

    window.addEventListener('show-toast', handleToast);
    return () => {
      window.removeEventListener('show-toast', handleToast);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-[10001] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function showSaveResult(value: unknown, successMessage: string) {
  const warning = liveCacheWarningOf(value);
  showToast(
    warning ? `${successMessage.replace(/\.?$/, '.')} ${warning}` : successMessage,
    warning ? 'warning' : 'success',
    warning ? 8000 : undefined
  );
}

export function showToast(message: string, type: ToastType = 'info', duration?: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('show-toast', {
      detail: { message, type, duration },
    })
  );
}
