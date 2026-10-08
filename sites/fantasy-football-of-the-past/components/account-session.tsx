'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type AccountStatus = 'loading' | 'authenticated' | 'signed-out' | 'unavailable';
export type AccountSession = {
  /** True when a real session provider owns this workspace's authentication state. */
  provided?: boolean;
  status: AccountStatus;
  accountKey: string | null;
  displayName: string | null;
  avatar: string | null;
  refresh: () => Promise<void>;
  expireSession: () => void;
};
type AccountState = Pick<AccountSession, 'status' | 'accountKey' | 'displayName' | 'avatar'>;
const initialState: AccountState = { status: 'loading', accountKey: null, displayName: null, avatar: null };
const AccountContext = createContext<AccountSession>({ ...initialState, provided: false, refresh: async () => {}, expireSession: () => {} });

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountState>(initialState);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const lastCheck = useRef(0);
  const lastAccountKey = useRef<string | null>(null);

  const invalidateRequests = useCallback(() => {
    sequence.current++;
    request.current?.abort();
  }, []);

  const expireSession = useCallback(() => {
    invalidateRequests();
    // The opaque partition is not authentication. Retain it while an expired
    // profile form is disabled, so unsaved edits survive until the same user returns.
    setAccount({ status: 'signed-out', accountKey: lastAccountKey.current, displayName: null, avatar: null });
    delete document.documentElement.dataset.reduceMotion;
  }, [invalidateRequests]);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastCheck.current = Date.now();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const response = await fetch('/api/account', { cache: 'no-store', signal: controller.signal });
      if (current !== sequence.current) return;
      if (response.status === 401) {
        expireSession();
        return;
      }
      if (!response.ok) throw new Error('Account unavailable');
      const body = await response.json() as { authenticated?: boolean; accountKey?: string; displayName?: string; avatar?: string | null; reduceMotion?: boolean };
      if (current !== sequence.current) return;
      if (body.authenticated !== true || typeof body.accountKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.accountKey) || typeof body.displayName !== 'string' || !(body.avatar === null || typeof body.avatar === 'string')) throw new Error('Invalid account response');
      const accountChanged = lastAccountKey.current !== null && body.accountKey !== lastAccountKey.current;
      lastAccountKey.current = body.accountKey;
      if (accountChanged) {
        invalidateRequests();
        window.dispatchEvent(new Event('fantasy:account-changed'));
      }
      setAccount({ status: 'authenticated', accountKey: body.accountKey, displayName: body.displayName, avatar: body.avatar });
      document.documentElement.dataset.reduceMotion = String(body.reduceMotion === true);
    } catch {
      if ((!controller.signal.aborted || timedOut) && current === sequence.current) setAccount(previous => ({ ...previous, status: 'unavailable' }));
    } finally {
      clearTimeout(timeout);
    }
  }, [expireSession, invalidateRequests]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void refresh(); });
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 15000) void refresh();
    };
    const checkOnline = () => { void refresh(); };
    window.addEventListener('fantasy:session-expired', expireSession);
    window.addEventListener('fantasy:profile-updated', checkOnline);
    window.addEventListener('online', checkOnline);
    window.addEventListener('pageshow', checkWhenVisible);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      mounted = false;
      invalidateRequests();
      window.removeEventListener('fantasy:session-expired', expireSession);
      window.removeEventListener('fantasy:profile-updated', checkOnline);
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('pageshow', checkWhenVisible);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [expireSession, invalidateRequests, refresh]);

  return <AccountContext.Provider value={{ ...account, provided: true, refresh, expireSession }}>{children}</AccountContext.Provider>;
}

export function useAccountSession(): AccountSession {
  return useContext(AccountContext);
}
