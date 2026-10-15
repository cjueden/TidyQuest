import { createContext } from 'react';

/** Opens the global search; null where search isn't available (e.g. logged out). */
export const SearchContext = createContext<(() => void) | null>(null);
