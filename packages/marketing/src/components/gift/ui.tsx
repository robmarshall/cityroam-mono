"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Client-side pieces shared by the gift and redemption pages. */

/**
 * Moves focus to the returned ref whenever `key` changes (not on first
 * render), so a screen reader or keyboard user lands on the new state rather
 * than on a button that has just disappeared.
 */
export function useFocusOnChange<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [key]);
  return ref;
}

/**
 * A copy-to-clipboard button. When the clipboard is refused, it selects the
 * text in the field named by `fallbackInputId` so it can be copied by hand.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  fallbackInputId,
  className = "",
}: {
  text: string;
  label: string;
  copiedLabel: string;
  fallbackInputId?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = fallbackInputId
        ? (document.getElementById(fallbackInputId) as HTMLInputElement | null)
        : null;
      input?.focus();
      input?.select();
    }
  }, [text, fallbackInputId]);

  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-button border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none ${className}`}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

/** A read-only field with a copy button, for a link or a code. */
export function CopyField({
  id,
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-button border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900"
        />
        <CopyButton text={value} label={copyLabel} copiedLabel={copiedLabel} fallbackInputId={id} />
      </div>
    </div>
  );
}
