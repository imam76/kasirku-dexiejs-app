import { create } from 'zustand';

export type SyncActivityPhase = 'idle' | 'uploading' | 'refreshing' | 'error';

interface SyncActivityState {
  phase: SyncActivityPhase;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  setPhase: (phase: SyncActivityPhase, errorMessage?: string) => void;
}

export const useSyncActivityStore = create<SyncActivityState>((set) => ({
  phase: 'idle',
  setPhase: (phase, errorMessage) => {
    const now = new Date().toISOString();

    set({
      phase,
      startedAt: phase === 'idle' ? undefined : now,
      finishedAt: phase === 'idle' ? now : undefined,
      errorMessage,
    });
  },
}));
