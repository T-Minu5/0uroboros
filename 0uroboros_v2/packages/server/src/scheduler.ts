/** Time as the server sees it. Rooms never call Date.now or setTimeout directly, so tests can drive the clock by hand. */
export type Scheduler = {
  now(): number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  after(ms: number, fn: () => void): () => void;
};

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  after: (ms, fn) => { const handle = setTimeout(fn, Math.max(0, ms)); return () => clearTimeout(handle); },
};

/** A clock that only moves when told to; due callbacks run in order as `advance` passes them. */
export class ManualScheduler implements Scheduler {
  private time: number;
  private serial = 0;
  private pending: { at: number; serial: number; fn: () => void }[] = [];
  constructor(start = 1_700_000_000_000) { this.time = start; }
  now() { return this.time; }
  after(ms: number, fn: () => void) {
    const entry = { at: this.time + Math.max(0, ms), serial: ++this.serial, fn };
    this.pending.push(entry);
    return () => { this.pending = this.pending.filter(item => item !== entry); };
  }
  /** Moves the clock forward by `ms`, firing everything that falls due on the way. */
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const due = this.pending.filter(item => item.at <= target).sort((a, b) => a.at - b.at || a.serial - b.serial)[0];
      if (!due) break;
      this.pending = this.pending.filter(item => item !== due);
      this.time = Math.max(this.time, due.at);
      due.fn();
    }
    this.time = target;
  }
  get pendingCount() { return this.pending.length; }
}
