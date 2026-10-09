import { BUILTIN_MODIFIERS, type ModifierKind } from './effects/types';

/** What a built-in mod is called, its card-art badge and its rules text. The behavior itself is part of the engine.
    In the aura's details a standalone N stands for its amount. */
export type BuiltinModDetails = { name: string; badge: string; text: string };
export type BuiltinModOverrides = { [kind in ModifierKind]?: Partial<BuiltinModDetails> };

export const BUILTIN_MOD_FIELDS = ['name', 'badge', 'text'] as const;
export const BUILTIN_MOD_LIMITS: Record<keyof BuiltinModDetails, number> = { name: 80, badge: 12, text: 600 };

export const DEFAULT_BUILTIN_MODS: Record<ModifierKind, BuiltinModDetails> = {
  doublePrintedEffects: { name: 'Printed effects happen twice', badge: '[x2]', text: 'The card’s own printed reveal and collapse effects happen twice. Effects from other mods are not doubled.' },
  powerAuraAtLocation: { name: '+N Power aura to allies at its Location', badge: '[+N]', text: 'While the card is revealed, every other revealed ally at its Location has +N Power.' },
  movableEachTurn: { name: 'Movable once each turn', badge: '[↔]', text: 'Once each Runtime turn, while the card is revealed, its owner may move it to another open Location for free.' },
};

let active: Record<ModifierKind, BuiltinModDetails> = DEFAULT_BUILTIN_MODS;

/** The details every label, badge and rules text reads from, merged over the defaults. Set when content loads or is edited. */
export function setBuiltinModDetails(overrides: BuiltinModOverrides | undefined) {
  active = Object.fromEntries(BUILTIN_MODIFIERS.map(kind => {
    const custom = overrides?.[kind] ?? {};
    const details = { ...DEFAULT_BUILTIN_MODS[kind] };
    for (const field of BUILTIN_MOD_FIELDS) if (custom[field]?.trim()) details[field] = custom[field]!;
    return [kind, details];
  })) as Record<ModifierKind, BuiltinModDetails>;
}

/** A built-in mod's current details; with an amount, each standalone N is filled in. */
export function builtinMod(kind: ModifierKind, amount?: number): BuiltinModDetails {
  const details = active[kind];
  if (amount === undefined) return details;
  const fill = (value: string) => value.replace(/\bN\b/g, String(amount));
  return { name: fill(details.name), badge: fill(details.badge), text: fill(details.text) };
}
