'use client';

import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const TOAST_DURATION = 7000;

// The progress bar animation duration comes from --toast-duration, a
// per-toast CSS variable set by the toast caller (see lock toasts below).
// Falls back to TOAST_DURATION for regular success/error toasts so they
// match the sonner auto-dismiss timer.
// Sonner ships unlayered CSS (`[data-sonner-toast] { box-shadow: ... }`),
// which wins over Tailwind's layered `shadow-*` utilities regardless of
// class specificity. Override box-shadow here with !important, scoped by
// sonner's native theme selector so light/dark each get a tuned tint.
const progressCss = `
li[data-sonner-toast] {
  box-shadow:
    0 20px 40px -12px rgba(0, 0, 0, 0.35),
    0 8px 16px -6px rgba(0, 0, 0, 0.2) !important;
}
[data-sonner-toaster][data-sonner-theme='dark'] li[data-sonner-toast] {
  box-shadow:
    0 22px 44px -10px rgba(0, 0, 0, 0.75),
    0 10px 20px -6px rgba(0, 0, 0, 0.55) !important;
}
li[data-sonner-toast]::after {
  display: none !important;
}
li[data-sonner-toast]::before {
  content: '' !important;
  position: absolute !important;
  bottom: 0 !important;
  left: 0 !important;
  top: auto !important;
  right: auto !important;
  width: 100% !important;
  height: 1px !important;
  border-radius: 0 !important;
  background: var(--toast-progress-color, hsl(var(--primary))) !important;
  transform-origin: left !important;
  animation: toast-shrink var(--toast-duration, ${String(TOAST_DURATION)}ms) linear forwards !important;
  pointer-events: none !important;
  z-index: 999 !important;
}
@keyframes toast-shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* --- Close button ---------------------------------------------------
 * Sonner renders a native <button data-close-button> when closeButton
 * is true. We reposition it to top-right (sonner defaults to top-left),
 * hide it by default, and fade it in on hover. Opt-in delayed reveal
 * via the .toast-show-close-delayed class + --close-button-delay CSS
 * var (matches the existing --toast-duration pattern used by the
 * polite-unlock countdown toasts).
 */
li[data-sonner-toast] [data-close-button] {
  left: auto !important;
  right: -6px !important;
  top: -6px !important;
  width: 20px !important;
  height: 20px !important;
  border-radius: 9999px !important;
  background: hsl(var(--card)) !important;
  border: 1px solid hsl(var(--border)) !important;
  color: hsl(var(--muted-foreground)) !important;
  opacity: 0 !important;
  pointer-events: none !important;
  transform: scale(0.92) !important;
  transition:
    opacity 150ms ease,
    transform 150ms ease,
    color 150ms ease,
    background 150ms ease !important;
}
li[data-sonner-toast]:hover [data-close-button] {
  opacity: 0.4 !important;
  pointer-events: auto !important;
  transform: scale(1) !important;
}
li[data-sonner-toast] [data-close-button]:hover {
  opacity: 1 !important;
  color: hsl(var(--foreground)) !important;
  background: hsl(var(--accent)) !important;
  transform: scale(1.05) !important;
}
li[data-sonner-toast] [data-close-button]:focus-visible {
  outline: 2px solid hsl(var(--ring)) !important;
  outline-offset: 2px !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* Opt-in: persistent toasts reveal the close button after a delay
 * (e.g. the 15s "Waiting for <user> to respond..." countdown toast).
 * Caller sets className="toast-show-close-delayed" and
 * style={{ "--close-button-delay": "15000ms" }}. */
li[data-sonner-toast].toast-show-close-delayed [data-close-button] {
  animation: toast-close-reveal 1ms linear forwards;
  animation-delay: var(--close-button-delay, 0ms);
}
@keyframes toast-close-reveal {
  to {
    opacity: 0.4;
    pointer-events: auto;
    transform: scale(1);
  }
}
li[data-sonner-toast].toast-show-close-delayed:hover [data-close-button],
li[data-sonner-toast].toast-show-close-delayed [data-close-button]:hover {
  animation: none;
}

/* --- Entrance / exit animation --------------------------------------
 * Sonner's default is a horizontal slide from the edge. Swap it for a
 * vertical fade: slide down + fade in on enter, slide up + fade out on
 * exit. Scoped to top-positioned toasters so a future reposition to
 * bottom keeps working.
 */
[data-sonner-toaster][data-y-position='top'] li[data-sonner-toast][data-mounted='true'] {
  animation: toast-enter 250ms ease-out !important;
}
[data-sonner-toaster][data-y-position='top'] li[data-sonner-toast][data-removed='true'] {
  animation: toast-exit 200ms ease-in forwards !important;
}
@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes toast-exit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-12px);
  }
}
`;

function Toaster({ ...props }: ToasterProps): React.JSX.Element {
  const { theme } = useTheme();

  const resolvedTheme: 'dark' | 'light' | 'system' =
    theme === 'dark' || theme === 'light' ? theme : 'system';

  return (
    <>
      <style>{progressCss}</style>
      <Sonner
        theme={resolvedTheme}
        position="top-right"
        offset={80}
        duration={TOAST_DURATION}
        className="toaster group"
        // Swap sonner's default dotted loader for a clean Lucide ring
        // spinner. Applied globally so every `toast.loading(...)` inherits
        // the modern look (per-toast `icon` prop hits a sonner bug where
        // it disables the loader instead of replacing it — see
        // `getLoadingIcon` in node_modules/sonner/dist/index.mjs).
        icons={{
          loading: <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />,
        }}
        toastOptions={{
          closeButton: true,
          classNames: {
            toast:
              'group toast group-[.toaster]:rounded-md group-[.toaster]:!bg-card group-[.toaster]:!text-card-foreground group-[.toaster]:border group-[.toaster]:border-l-4 group-[.toaster]:!border-border',
            title:
              'group-[.toast]:text-sm group-[.toast]:font-semibold group-[.toast]:leading-snug',
            description:
              'group-[.toast]:text-xs group-[.toast]:opacity-85 group-[.toast]:leading-relaxed group-[.toast]:mt-0.5',
            actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
            cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
            success:
              'group-[.toaster]:!bg-[rgba(72,187,120,0.08)] group-[.toaster]:!border-[rgba(72,187,120,0.2)] group-[.toaster]:!border-l-[rgba(72,187,120,0.55)] [--toast-progress-color:rgba(72,187,120,0.7)]',
            error:
              'group-[.toaster]:!bg-[rgba(245,101,101,0.08)] group-[.toaster]:!border-[rgba(245,101,101,0.2)] group-[.toaster]:!border-l-[rgba(245,101,101,0.55)] [--toast-progress-color:rgba(245,101,101,0.7)]',
            warning:
              'group-[.toaster]:!bg-[rgba(237,137,54,0.08)] group-[.toaster]:!border-[rgba(237,137,54,0.2)] group-[.toaster]:!border-l-[rgba(237,137,54,0.55)] [--toast-progress-color:rgba(237,137,54,0.7)]',
            info: 'group-[.toaster]:!bg-[rgba(66,153,225,0.08)] group-[.toaster]:!border-[rgba(66,153,225,0.2)] group-[.toaster]:!border-l-[rgba(66,153,225,0.55)] [--toast-progress-color:rgba(66,153,225,0.7)]',
          },
        }}
        {...props}
      />
    </>
  );
}

export { Toaster };
