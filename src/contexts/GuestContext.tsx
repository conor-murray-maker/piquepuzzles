import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

interface GuestState {
  isGuest: boolean;
  gamesPlayed: number;
  provisionalIQ: number;
  shouldPromptSignIn: boolean;
  shouldShowModal: boolean;
}

interface GuestContextType extends GuestState {
  incrementGuestGames: () => void;
  updateProvisionalIQ: (delta: number) => void;
  dismissPrompt: () => void;
  dismissModal: () => void;
  clearGuestState: () => void;
  getGuestIQForMigration: () => number;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

const STORAGE_KEY = 'pique-guest-state';

function loadGuestState(): GuestState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isGuest: parsed.isGuest ?? false,
        gamesPlayed: parsed.gamesPlayed ?? 0,
        provisionalIQ: parsed.provisionalIQ ?? 1000,
        shouldPromptSignIn: false,
        shouldShowModal: false,
      };
    }
  } catch {}
  return {
    isGuest: localStorage.getItem('pique-guest-mode') === 'true',
    gamesPlayed: 0,
    provisionalIQ: 1000,
    shouldPromptSignIn: false,
    shouldShowModal: false,
  };
}

function saveGuestState(state: GuestState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      isGuest: state.isGuest,
      gamesPlayed: state.gamesPlayed,
      provisionalIQ: state.provisionalIQ,
    }));
  } catch {}
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuestState>(loadGuestState);

  useEffect(() => {
    saveGuestState(state);
  }, [state]);

  const incrementGuestGames = useCallback(() => {
    setState(s => {
      const newCount = s.gamesPlayed + 1;
      return {
        ...s,
        gamesPlayed: newCount,
        shouldPromptSignIn: newCount === 1,
        shouldShowModal: newCount >= 3 && newCount % 3 === 0,
      };
    });
  }, []);

  const updateProvisionalIQ = useCallback((delta: number) => {
    setState(s => ({
      ...s,
      provisionalIQ: Math.max(800, s.provisionalIQ + delta),
    }));
  }, []);

  const dismissPrompt = useCallback(() => {
    setState(s => ({ ...s, shouldPromptSignIn: false }));
  }, []);

  const dismissModal = useCallback(() => {
    setState(s => ({ ...s, shouldShowModal: false }));
  }, []);

  const clearGuestState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('pique-guest-mode');
    setState({
      isGuest: false,
      gamesPlayed: 0,
      provisionalIQ: 1000,
      shouldPromptSignIn: false,
      shouldShowModal: false,
    });
  }, []);

  const getGuestIQForMigration = useCallback(() => {
    return state.provisionalIQ > 1000 ? state.provisionalIQ : 1000;
  }, [state.provisionalIQ]);

  return (
    <GuestContext.Provider value={{
      ...state,
      incrementGuestGames,
      updateProvisionalIQ,
      dismissPrompt,
      dismissModal,
      clearGuestState,
      getGuestIQForMigration,
    }}>
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error('useGuest must be used within GuestProvider');
  return ctx;
}
