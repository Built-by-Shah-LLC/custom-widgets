'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/* ------------------------------------------------------------------ */
/* Shared control metrics used by PhoneInput to match Input exactly.  */
/* Do not re-author these values.                                     */
/* ------------------------------------------------------------------ */

export type InputSize = 'sm' | 'md' | 'lg';

export const sizeStyles: Record<InputSize, string> = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-11 text-base',
};

export function controlPad(
  size: InputSize,
  opts: { iconLeft?: boolean; iconRight?: boolean } = {}
): string {
  const { iconLeft = false, iconRight = false } = opts;
  const horizontalPad = size === 'sm' ? '10px' : size === 'lg' ? '16px' : '14px';
  const iconPad = size === 'sm' ? '30px' : '34px';
  return `0 ${iconRight ? iconPad : horizontalPad} 0 ${iconLeft ? iconPad : horizontalPad}`;
}

/* ------------------------------- */
/* Combobox option model + filter  */
/* ------------------------------- */

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Case-insensitive substring filter on the option label and description. */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      o.description?.toLowerCase().includes(q)
  );
}

/* ------------------------------------------------------------------ */
/* useCombobox — open state, wrap-around active index, ARIA wiring,   */
/* click-outside close. Keyboard contract (APG combobox pattern):     */
/* ArrowDown/Up move the active row (wraps), Enter selects, Escape    */
/* closes, Tab closes without selecting. Home/End keep native caret   */
/* behavior (arrows only navigate options).                           */
/* ------------------------------------------------------------------ */

interface UseComboboxArgs {
  /** Filtered (visible) options the listbox is currently showing. */
  options: ComboboxOption[];
  /** Value of the selected option — used to position the active row on open. */
  selectedValue?: string;
  /** Fired on Enter or option click; the component decides what happens next. */
  onSelect?: (option: ComboboxOption) => void;
  /** Extra cleanup when the popup closes (e.g. clear the filter query). */
  onClose?: () => void;
  /** Close after a successful Enter-select. Default true. */
  closeOnSelect?: boolean;
}

export interface UseComboboxResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  activeIndex: number;
  /** `{listboxId}-option-{index}` when open with an active row, else undefined. */
  activeOptionId: string | undefined;
  listboxId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  handleKeyDown: (e: KeyboardEvent) => void;
}

export function useCombobox({
  options,
  selectedValue,
  onSelect,
  onClose,
  closeOnSelect = true,
}: UseComboboxArgs): UseComboboxResult {
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndexState, setActiveIndex] = useState(-1);

  const listboxId = `${baseId}-listbox`;

  /* Clamp the active row when filtering shrinks the list (derived during
     render — no effect needed). */
  const activeIndex =
    options.length === 0 ? -1 : Math.min(Math.max(activeIndexState, 0), options.length - 1);

  const activeOptionId =
    isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  /* Keep the active row visible while keyboard-navigating a scrolled list.
     block:'nearest' is instant, so no reduced-motion gating is needed. */
  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  /* On open: active row = selected option (or first). On close: clear it. */
  const open = useCallback(() => {
    setIsOpen(true);
    if (options.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const idx = options.findIndex((o) => o.value === selectedValue);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [options, selectedValue]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
    onClose?.();
  }, [onClose]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((prev) => {
        if (options.length === 0) return -1;
        if (prev < 0) return dir > 0 ? 0 : options.length - 1;
        return (prev + dir + options.length) % options.length;
      });
    },
    [options.length]
  );

  /* Click-outside closes the popup. */
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, close]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          open();
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveActive(-1);
          break;
        case 'Enter': {
          e.preventDefault();
          const active = options[activeIndex];
          if (active && !active.disabled) {
            onSelect?.(active);
            if (closeOnSelect) close();
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Tab':
          close();
          break;
        default:
          break;
      }
    },
    [isOpen, options, activeIndex, onSelect, closeOnSelect, open, close, moveActive]
  );

  return {
    isOpen,
    open,
    close,
    activeIndex,
    activeOptionId,
    listboxId,
    containerRef,
    handleKeyDown,
  };
}

/* ------------------------------------------------------------------ */
/* DropdownPanel — absolute popup below the trigger, transform/opacity */
/* enter/exit, reduced-motion gated. `header` and `footer` render      */
/* outside role=listbox (ARIA-clean: the listbox contains only rows).  */
/* ------------------------------------------------------------------ */

interface DropdownPanelProps {
  isOpen: boolean;
  listboxId: string;
  multiselectable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DropdownPanel({
  isOpen,
  listboxId,
  multiselectable = false,
  header,
  footer,
  children,
}: DropdownPanelProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scaleY: 0.96, y: -4 }}
          animate={{ opacity: 1, scaleY: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.96, y: -4 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
          className="ui-listbox"
        >
          {header}
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable={multiselectable || undefined}
            className="max-h-60 overflow-y-auto"
          >
            {children}
          </div>
          {footer}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* OptionRow — role=option row with active/disabled states, icon,      */
/* truncating label + optional description, and two selection         */
/* visuals: 'check' (trailing check icon, single select) or           */
/* 'checkbox' (leading square indicator, multi select).               */
/* ------------------------------------------------------------------ */

interface OptionRowProps {
  id: string;
  option: ComboboxOption;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  /** 'check' = trailing check icon; 'checkbox' = leading square indicator. */
  selection?: 'check' | 'checkbox';
}

export function OptionRow({
  id,
  option,
  active,
  selected,
  onSelect,
  selection = 'check',
}: OptionRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      data-active={active || undefined}
      onMouseDown={(e) => {
        // Keep focus in the combobox input while selecting.
        e.preventDefault();
        if (!option.disabled) onSelect();
      }}
      className="ui-option"
    >
      {selection === 'checkbox' && (
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-[border-color,background-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)]',
            selected
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] shadow-[var(--shadow-glow)]'
              : 'border-[var(--color-border)]'
          )}
        >
          <svg
            className={cn(
              'h-2.5 w-2.5 text-[var(--color-bg-primary)] opacity-0',
              selected && 'opacity-100 animate-[ui-pop_var(--duration-base)_var(--ease-spring)_both]'
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
      {option.icon && (
        <span aria-hidden className="shrink-0 text-[var(--color-text-secondary)]">
          {option.icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.description && (
          <span className="block truncate text-xs text-[var(--color-text-muted)]">
            {option.description}
          </span>
        )}
      </span>
      {selection === 'check' && selected && (
        <Check aria-hidden className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
      )}
    </div>
  );
}
