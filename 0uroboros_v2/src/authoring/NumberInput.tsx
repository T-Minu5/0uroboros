import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
};

/** Keeps the typed text while focused so an empty field or a lone "-" is not snapped back to the stored number. */
export function NumberInput({ value, onChange, onFocus, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input
    {...rest}
    type="number"
    value={draft ?? value ?? ''}
    onFocus={event => { event.target.select(); onFocus?.(event); }}
    onChange={event => {
      const text = event.target.value;
      setDraft(text);
      const parsed = Number(text);
      onChange(text === '' || !Number.isFinite(parsed) ? undefined : parsed);
    }}
    onBlur={event => { setDraft(null); onBlur?.(event); }}
  />;
}
