'use client';

import { useSyncExternalStore } from 'react';

interface PageHeaderInfo {
  icon: string;
  title: string;
  detail: string;
  visible: boolean;
}

let snapshot: PageHeaderInfo = { icon: '', title: '', detail: '', visible: true };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    fn();
  });
}

function set(icon: string, title: string): void {
  snapshot = { ...snapshot, icon, title };
  notify();
}

function setDetail(detail: string): void {
  if (snapshot.detail === detail) {
    return;
  }
  snapshot = { ...snapshot, detail };
  notify();
}

function setVisible(visible: boolean): void {
  if (snapshot.visible === visible) {
    return;
  }
  snapshot = { ...snapshot, visible };
  notify();
}

function clear(): void {
  snapshot = { icon: '', title: '', detail: '', visible: true };
  notify();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): PageHeaderInfo {
  return snapshot;
}

const pageHeaderRegistry = { set, setDetail, setVisible, clear };

function usePageHeaderInfo(): PageHeaderInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export { pageHeaderRegistry, usePageHeaderInfo };
