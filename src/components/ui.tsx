import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { dataSource, isDemo } from '../data/index.ts';

export function NoteMark({ size = 34 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M9.6 16.8a2.6 2.6 0 1 1-1.6-2.4V5.4l9-1.8v10.2a2.6 2.6 0 1 1-1.6-2.4V7.1L9.6 8.2z" fill="#fff" /></svg>
    </span>
  );
}

export function DemoBanner() {
  if (!isDemo) return null;
  const reset = () => {
    if (!confirm('Réinitialiser la démonstration ? Toutes les saisies faites dans ce navigateur seront effacées et le jeu d’essai fictif rechargé.')) return;
    dataSource.resetDemo?.();
    location.reload();
  };
  return (
    <div className="demo-banner" role="region" aria-label="Avertissement">
      <b>Données de démonstration</b>
      <span>Toutes les personnes et tous les montants sont fictifs. Aucun mail réel n’est envoyé.</span>
      <button type="button" onClick={reset}>Réinitialiser la démonstration</button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <Link to="/donnees-personnelles">Données personnelles</Link> · Réalisé par QME
    </footer>
  );
}

export type Tone = 'ok' | 'warn' | 'late' | 'info' | 'idle';
export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`b ${tone}`}>{children}</span>;

export function Kpi({ label, value, detail, bar, alert }: { label: string; value: ReactNode; detail?: ReactNode; bar?: number; alert?: boolean }) {
  return (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <div className="l">{label}</div>
      <div className="v tnum">{value}</div>
      {bar != null && <span className="bar" role="img" aria-label={`${Math.round(bar)} %`}><i style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} /></span>}
      {detail && <div className="d">{detail}</div>}
    </div>
  );
}

export function Bar({ value, max, full }: { value: number; max: number; full?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return <span className={`bar${full ? ' full' : ''}`} role="img" aria-label={`${value} sur ${max}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></span>;
}

export function InstrumentTag({ abbr, color, name }: { abbr: string; color: string; name: string }) {
  return <span className="inst"><i style={{ background: color }} aria-hidden="true">{abbr}</i>{name}</span>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.x)');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <header><h2 id={id}>{title}</h2><button type="button" className="btn sm x" onClick={onClose}>Fermer</button></header>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, full }: { label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode; full?: boolean }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {error && <span className="err" id={errId} role="alert">{error}</span>}
    </div>
  );
}

interface ToastState { text: string; error?: boolean }
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, error?: boolean) => {
    setT({ text, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT(null), error ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">{t && <div className={`toast${t.error ? ' err' : ''}`}>{t.text}</div>}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Loading({ text = 'Chargement…' }: { text?: string }) {
  return <div className="empty" role="status">{text}</div>;
}

export const initials = (s: string) => s.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
