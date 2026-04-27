import { useEffect } from 'react';

/**
 * One-time mount effect for external system synchronization.
 * This is the ONLY allowed effect hook per USE-EFFECT-POLICY.md.
 *
 * Use for: DOM integration, browser API subscriptions, third-party widgets.
 * Do NOT use for: derived state, fetching, event-driven actions.
 *
 * Policy: primitive — Rule 4 (one-time external system sync on mount).
 */
export function useMountEffect(effect: () => (() => void) | undefined): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
