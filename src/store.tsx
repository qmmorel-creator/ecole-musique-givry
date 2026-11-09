// Magasin du bureau : session, instantané des données et exécution des actions.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, dataSource, type Session, type Snapshot } from './data/index.ts';
import { can, todayIso, type Capability } from './domain/index.ts';
import { useToast } from './components/ui.tsx';

interface StoreValue {
  session: Session | null;
  ready: boolean;
  snap: Snapshot | null;
  today: string;
  refresh: () => Promise<void>;
  setSession: (s: Session | null) => void;
  /** Exécute une action, rafraîchit les données et affiche le résultat. Renvoie false en cas d'erreur. */
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  can: (cap: Capability) => boolean;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const toast = useToast();
  const api = dataSource.staffApi;

  useEffect(() => {
    let alive = true;
    api.getSession().then((s) => { if (alive) { setSession(s); setReady(true); } }).catch(() => alive && setReady(true));
    return () => { alive = false; };
  }, [api]);

  const refresh = useCallback(async () => {
    try { setSnap(await api.load()); } catch (e) { toast(e instanceof Error ? e.message : 'Erreur de chargement', true); }
  }, [api, toast]);

  useEffect(() => { if (session) void refresh(); else setSnap(null); }, [session, refresh]);

  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      await refresh();
      if (success) toast(success);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError && e.fieldErrors ? `${e.message} ${Object.values(e.fieldErrors).join(' ')}` : e instanceof Error ? e.message : 'Erreur';
      toast(msg, true);
      return false;
    }
  }, [refresh, toast]);

  const value = useMemo<StoreValue>(() => ({
    session, ready, snap, today: todayIso(), refresh, setSession, run,
    can: (cap) => can(session?.staff.role, cap),
  }), [session, ready, snap, refresh, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider manquant');
  return v;
}

/** Instantané garanti (les pages du bureau ne s'affichent qu'une fois les données chargées). */
export function useSnap(): Snapshot {
  const { snap } = useStore();
  if (!snap) throw new Error('Données non chargées');
  return snap;
}
