/**
 * First-party icon library. Only high-confidence glyphs are exported for HUD use.
 */

const files = import.meta.glob('../../../assets/Icons/icon-*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function urlOf(stem: string): string {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`${stem}.svg`));
  return hit?.[1] ?? '';
}

export const HIGH_CONFIDENCE_ICONS = [
  'priority',
  'action',
  'crypto',
  'database',
  'deck',
  'discard',
  'hand',
  'power',
] as const;

export type HighConfidenceIcon = (typeof HIGH_CONFIDENCE_ICONS)[number];

export const ICON_URL: Record<HighConfidenceIcon, string> = {
  priority: urlOf('icon-priority'),
  action: urlOf('icon-action'),
  crypto: urlOf('icon-crypto'),
  database: urlOf('icon-database'),
  deck: urlOf('icon-deck'),
  discard: urlOf('icon-discard'),
  hand: urlOf('icon-hand'),
  power: urlOf('icon-power'),
};

export function GameIcon({
  name,
  className = '',
}: {
  name: HighConfidenceIcon;
  className?: string;
}) {
  return (
    <span
      className={`gicon ${className}`.trim()}
      data-icon={name}
      aria-hidden="true"
      style={{
        WebkitMaskImage: `url(${ICON_URL[name]})`,
        maskImage: `url(${ICON_URL[name]})`,
      }}
    />
  );
}

export function IconStat({
  icon,
  value,
  label,
  title,
}: {
  icon: HighConfidenceIcon;
  value?: string | number;
  label?: string;
  title?: string;
}) {
  return (
    <span className="icon-stat" title={title ?? label} data-icon={icon}>
      <GameIcon name={icon} />
      {value !== undefined ? <b>{value}</b> : null}
      {label ? <em>{label}</em> : null}
    </span>
  );
}
