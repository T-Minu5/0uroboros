/**
 * First-party arena lookup.
 *
 * JPEGs in ./art are compressed from Mel's concept PNGs in
 * assets/gameboard concept art. Effect webps in that folder are examples only.
 */

const art = import.meta.glob('./art/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function pick(map: Record<string, string>, needle: string): string | null {
  const hit = Object.entries(map).find(([path]) => path.includes(needle));
  return hit?.[1] ?? null;
}

export const CITY_URL = pick(art, 'arena-city');
export const TABLE_URL = pick(art, 'arena-table');
