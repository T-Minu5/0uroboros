/**
 * Single-owner lock so two autonomous runners cannot patch the same repo.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function deliveryLockPath(root: string): string {
  return join(root, 'tools/agent-harness/delivery/delivery.lock');
}

export interface DeliveryLock {
  pid: number;
  started_at: string;
  mode: string;
}

export function readDeliveryLock(root: string): DeliveryLock | null {
  const path = deliveryLockPath(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DeliveryLock;
  } catch {
    return null;
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireDeliveryLock(root: string, mode: string): DeliveryLock {
  mkdirSync(dirname(deliveryLockPath(root)), { recursive: true });
  const existing = readDeliveryLock(root);
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    throw new Error(
      `Delivery lock held by pid ${existing.pid} (mode ${existing.mode}, started ${existing.started_at}).`,
    );
  }
  const lock: DeliveryLock = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    mode,
  };
  writeFileSync(deliveryLockPath(root), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

export function releaseDeliveryLock(root: string): void {
  const path = deliveryLockPath(root);
  const existing = readDeliveryLock(root);
  if (!existing || existing.pid !== process.pid) return;
  if (existsSync(path)) unlinkSync(path);
}
