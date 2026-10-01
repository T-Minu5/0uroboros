import { useEffect, useState } from 'react';

import {
  parsePresentationSpeed,
  SPEED_STORAGE_KEY,
  type PresentationSpeed,
} from './timing';

let current: PresentationSpeed = readStoredSpeed();
const listeners = new Set<() => void>();

function readStoredSpeed(): PresentationSpeed {
  try {
    return parsePresentationSpeed(window.localStorage.getItem(SPEED_STORAGE_KEY));
  } catch {
    return 'normal';
  }
}

export function getPresentationSpeed(): PresentationSpeed {
  return current;
}

export function setPresentationSpeed(speed: PresentationSpeed): void {
  current = speed;
  try {
    window.localStorage.setItem(SPEED_STORAGE_KEY, speed);
  } catch {
    /* ignore quota / private mode */
  }
  for (const listener of listeners) listener();
}

export function usePresentationSpeed(): PresentationSpeed {
  const [speed, setSpeed] = useState(current);
  useEffect(() => {
    const sync = () => setSpeed(current);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return speed;
}
