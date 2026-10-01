import { createContext, useContext } from 'react';

export type EditorFocus = {
  /** The one expanded recipe step, keyed `${recipeField}.${index}`; every other step shows as a summary row. */
  activeStep: string | null;
  setActiveStep: (key: string | null) => void;
  /** `data-field` keys with save-blocking problems on the selected item. */
  invalid: ReadonlySet<string>;
};

export const EditorFocusContext = createContext<EditorFocus>({ activeStep: null, setActiveStep: () => undefined, invalid: new Set() });
export const useEditorFocus = () => useContext(EditorFocusContext);
