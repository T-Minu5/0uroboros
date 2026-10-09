/**
 * Client crash reporting: uncaught errors and unhandled rejections are posted to the game server's `POST /errors`,
 * which forwards them to the configured error reporter (Sentry or the log). No third-party SDK ships in the client;
 * the server decides where reports go. Reports are rate limited here and on the server, carry no personal data, and
 * are off under `npm run dev` unless `VITE_REPORT_ERRORS=on`.
 */
import { platform } from './index';
import { httpTwin } from './web';

const MAX_REPORTS = 10;
let sent = 0;
let installed = false;
const recent = new Set<string>();

export type ErrorReport = { message: string; stack?: string; url: string; platform: string; version: string };

export function describe(error: unknown, version: string): ErrorReport {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  return { message: message.slice(0, 500), stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined, url: location.href.slice(0, 300), platform: platform().kind, version };
}

/** Posts one report; duplicates within a session and anything past the budget are dropped. */
export function reportError(error: unknown, options: { serverUrl?: string; version?: string; fetchImpl?: typeof fetch } = {}): boolean {
  const report = describe(error, options.version ?? platform().updates.version);
  const key = `${report.message}\n${report.stack ?? ''}`;
  if (sent >= MAX_REPORTS || recent.has(key)) return false;
  sent++; recent.add(key);
  const url = `${httpTwin(options.serverUrl ?? platform().serverUrl)}/errors`;
  const body = JSON.stringify(report);
  try {
    if (!options.fetchImpl && typeof navigator !== 'undefined' && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })); return true; }
    void (options.fetchImpl ?? fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch { /* reporting must never throw */ }
  return true;
}

/** Hooks window error events; idempotent. */
export function installErrorReporting(enabled = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_REPORT_ERRORS !== 'off') {
  if (installed || !enabled || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', event => { reportError(event.error ?? event.message); });
  window.addEventListener('unhandledrejection', event => { reportError(event.reason); });
}

/** Test seam. */
export function resetErrorReporting() { sent = 0; recent.clear(); installed = false; }
