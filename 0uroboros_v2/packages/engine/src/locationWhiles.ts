import type { Deployment, PlayerId } from './game';
import type { EffectStep } from './effects/types';

/** Continuous Location rules that hold while a board formula is true. */
export type LocationWhileKind = 'soloCard';

export type LocationWhile = {
  /** Stable id for authoring. */
  id: string;
  kind: LocationWhileKind;
  /**
   * Live Power added to the qualifying card(s) while the while holds.
   * soloCard: each seat's lone revealed card at this Node (per seat, not Node-total).
   */
  powerBonus?: number;
  /**
   * Effects that resolve with Location Ongoing cadence while the while holds.
   * Beneficiary = that seat (soloCard: owner of their lone card).
   */
  effects?: EffectStep[];
};

export const LOCATION_WHILE_KINDS: readonly LocationWhileKind[] = ['soloCard'];

export const WHILE_KIND_LABELS: Record<LocationWhileKind, string> = {
  soloCard: 'You have only 1 card here',
};

/** Revealed placements currently on the Node (both seats). */
export function revealedAtNode(placements: readonly Deployment[]): Deployment[] {
  return placements.filter(placement => placement.revealed);
}

/** Revealed cards at the Node belonging to one seat. */
export function revealedForOwner(revealed: readonly Deployment[], owner: PlayerId): Deployment[] {
  return revealed.filter(placement => placement.owner === owner);
}

/** Does this while currently hold for one seat's revealed cards at the Node? */
export function meetsLocationWhile(entry: LocationWhile, revealed: readonly Deployment[], owner: PlayerId): boolean {
  switch (entry.kind) {
    case 'soloCard':
      return revealedForOwner(revealed, owner).length === 1;
  }
}

/** Live Power bonus for a placement from matching whiles on this Node (per-seat solo). */
export function whilePowerBonus(
  whiles: readonly LocationWhile[] | undefined,
  revealed: readonly Deployment[],
  placement: Deployment,
): number {
  if (!whiles?.length || !placement.revealed) return 0;
  let bonus = 0;
  for (const entry of whiles) {
    if (!entry.powerBonus || !meetsLocationWhile(entry, revealed, placement.owner)) continue;
    if (entry.kind === 'soloCard') {
      const mine = revealedForOwner(revealed, placement.owner);
      if (mine.length === 1 && mine[0]!.card.id === placement.card.id) bonus += entry.powerBonus;
    }
  }
  return bonus;
}

/** Printed While: predicate (without reward / bonus text). */
export function describeWhilePredicate(entry: LocationWhile): string {
  switch (entry.kind) {
    case 'soloCard':
      return 'While you have only 1 card here';
  }
}

/** Autotext body after the While: prefix (predicate + optional Power bonus). */
export function describeWhileBody(entry: LocationWhile): string {
  const predicate = describeWhilePredicate(entry);
  if (entry.powerBonus) return `${predicate}, +${entry.powerBonus} Power`;
  return predicate;
}

/** Validation errors for one while (empty when valid). */
export function validateLocationWhile(entry: LocationWhile, path: string): string[] {
  const errors: string[] = [];
  if (!entry.id || typeof entry.id !== 'string') errors.push(`${path}.id: expected a non-empty id`);
  if (!LOCATION_WHILE_KINDS.includes(entry.kind)) errors.push(`${path}.kind: expected a known while kind`);
  if (entry.effects !== undefined && !Array.isArray(entry.effects)) {
    errors.push(`${path}.effects: expected an effect list`);
  }
  if (entry.powerBonus !== undefined) {
    if (typeof entry.powerBonus !== 'number' || !Number.isInteger(entry.powerBonus) || entry.powerBonus < 1 || entry.powerBonus > 20) {
      errors.push(`${path}.powerBonus: expected integer from 1 to 20`);
    }
  }
  const hasEffects = Array.isArray(entry.effects) && entry.effects.length > 0;
  if (!entry.powerBonus && !hasEffects) {
    errors.push(`${path}: set a Power bonus and/or at least one effect`);
  }
  return errors;
}

/** Fresh while with a unique id for the authoring UI. */
export function createLocationWhile(kind: LocationWhileKind = 'soloCard'): LocationWhile {
  const id = `while-${Math.random().toString(36).slice(2, 10)}`;
  switch (kind) {
    case 'soloCard':
      return { id, kind, powerBonus: 5, effects: [] };
  }
}
