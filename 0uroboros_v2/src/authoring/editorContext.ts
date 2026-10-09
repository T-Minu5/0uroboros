import { createContext, useContext } from 'react';

export type EditorFocus = {
  /**
   * The expanded step's path, such as `onReveal.1` or `onReveal.1.options.0.effects.2`. That step and every step
   * on the way to it are open; every other step shows as a summary row.
   */
  activeStep: string | null;
  setActiveStep: (key: string | null) => void;
  /** `data-field` keys with save-blocking problems on the selected item. */
  invalid: ReadonlySet<string>;
};

export const EditorFocusContext = createContext<EditorFocus>({ activeStep: null, setActiveStep: () => undefined, invalid: new Set() });
export const useEditorFocus = () => useContext(EditorFocusContext);
