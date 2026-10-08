'use client';
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { useSyncExternalStore } from 'react';
import { ArrowUpRight, RefreshCw, Shield, UserCircle } from 'lucide-react';
import { accountEntryPath } from '@/lib/account-navigation';
import { useAccountSession } from './account-session';

type HeaderPage = 'dashboard' | 'season' | 'online' | 'quick' | 'profile' | 'legends' | 'depth' | 'login';

function watchLocation(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener('hashchange', onChange);
  };
}
const currentLocation = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const serverLocation = () => '/';

export function GameHeader({ active }: { active: HeaderPage }) {
  const account = useAccountSession();
  const returnTo = useSyncExternalStore(watchLocation, currentLocation, serverLocation);

  return <header className="ff-header broadcast-header account-header">
    <a className="account-skip-link" href="#main-content">Skip to main content</a>
    <div className="ff-header-inner">
      <a className="ff-brand" href="/" aria-label="Fantasy Football of the Past dashboard">
        <span className="ff-brand-icon"><Shield size={26} aria-hidden="true" /><span aria-hidden="true">F</span></span>
        <span className="ff-brand-wordmark">FANTASY FOOTBALL <b>OF THE PAST</b><small>THE PAST IS IN PLAY</small></span>
      </a>
      <nav className="ff-mode-nav" aria-label="Main navigation">
        <a href="/" aria-current={active === 'dashboard' ? 'page' : undefined}>Dashboard</a>
        <a href="/demo" aria-current={active === 'season' ? 'page' : undefined}>My season</a>
        <a href="/league" aria-current={active === 'online' ? 'page' : undefined}>Online leagues</a>
        <a href="/matchup" aria-current={active === 'quick' ? 'page' : undefined}>Quick matchup</a>
        <a href="/depth-chart" aria-current={active === 'depth' ? 'page' : undefined}>Depth chart</a>
      </nav>
      <div className="account-header-status" aria-label="Your account">
        {account.status === 'loading' && <span className="account-header-loading" role="status">Checking account…</span>}
        {account.status === 'authenticated' && <a className="account-header-profile" href="/profile" aria-current={active === 'profile' ? 'page' : undefined}>
          {account.avatar ? <img className="header-avatar" src={account.avatar} alt="" /> : <UserCircle size={23} aria-hidden="true" />}
          <span><strong>{account.displayName}</strong><small>Profile &amp; settings</small></span><ArrowUpRight size={14} aria-hidden="true" />
        </a>}
        {account.status === 'signed-out' && <a className="account-header-signin" href={accountEntryPath(returnTo)}><UserCircle size={18} aria-hidden="true" />Sign in</a>}
        {account.status === 'unavailable' && <button className="account-header-retry" onClick={() => void account.refresh()}><RefreshCw size={16} aria-hidden="true" /><span>Retry account</span></button>}
      </div>
    </div>
  </header>;
}
