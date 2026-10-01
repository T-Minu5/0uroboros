import { useSyncExternalStore } from 'react';
import bundled from '../../assets/card_art/depth/manifest.json';

export type DepthEntry = { sha: string; v: number; color: string; depth: string; width: number; height: number; focus: number };
export type DepthJobStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type DepthJob = { status: DepthJobStatus; error?: string };

let entries: Record<string, DepthEntry> = { ...(bundled as { entries: Record<string, DepthEntry> }).entries };
let jobs: Record<string, DepthJob> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function depthEntry(src: string | undefined): DepthEntry | null {
  return src ? entries[src] ?? null : null;
}

/** The file players are served: the WebP colour image once one exists, otherwise the source art. */
export function servedArtPath(src: string): string {
  return entries[src]?.color ?? src;
}

export function useDepthEntry(src: string | undefined): DepthEntry | null {
  return useSyncExternalStore(subscribe, () => depthEntry(src), () => depthEntry(src));
}

export function useDepthJob(src: string | undefined): DepthJob | undefined {
  return useSyncExternalStore(subscribe, () => (src ? jobs[src] : undefined), () => undefined);
}

let polling: ReturnType<typeof setTimeout> | undefined;

/**
 * Pull the latest manifest and job states from the local dev server. Keeps polling while
 * any job is still running, so a card saved in the studio picks up its depth when ready.
 */
export async function refreshDepthStatus(): Promise<void> {
  if (!import.meta.env.DEV) return;
  clearTimeout(polling);
  try {
    const response = await fetch('/api/depth/status', { cache: 'no-store' });
    if (!response.ok) return;
    const status = await response.json() as { entries: Record<string, DepthEntry>; jobs: Record<string, DepthJob> };
    entries = status.entries; jobs = status.jobs; emit();
    if (Object.values(jobs).some(job => job.status === 'queued' || job.status === 'processing')) polling = setTimeout(() => void refreshDepthStatus(), 1500);
  } catch { /* the static manifest stays in use */ }
}

export async function regenerateDepth(src: string): Promise<void> {
  const response = await fetch('/api/depth/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ art: src }) });
  if (!response.ok) throw new Error('Could not queue depth regeneration.');
  await refreshDepthStatus();
}

if (import.meta.env.DEV && typeof window !== 'undefined') void refreshDepthStatus();
