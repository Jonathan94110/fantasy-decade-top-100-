'use client';

import { ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { accountSignInPath, safeRelativeReturnTo } from '@/lib/account-navigation';
import { GameHeader } from './game-header';
import { useAccountSession } from './account-session';

export function AccountEntry({ returnTo = '/', expired = false }: { returnTo?: string; expired?: boolean }) {
  const account = useAccountSession();
  const destination = safeRelativeReturnTo(returnTo);
  return <div className="site-shell fantasy-app account-entry-app">
    <GameHeader active="login" />
    <main className="account-entry-main" id="main-content" tabIndex={-1}>
      <section className="account-entry-story" aria-labelledby="account-entry-title">
        <span className="sports-kicker">YOUR CLUBHOUSE. YOUR HISTORY.</span>
        <h1 id="account-entry-title">The past is<br /><em>in play.</em></h1>
        <p>Draft football legends together. Build your team, play the season, and return to the progress you saved.</p>
        <ul className="account-entry-benefits">
          <li><Trophy size={20} aria-hidden="true" /><span><strong>One roster. A full season.</strong><small>Draft once and guide your team through 17 weeks.</small></span></li>
          <li><CheckCircle2 size={20} aria-hidden="true" /><span><strong>Pick up where you left off.</strong><small>Your season, lineup and completed results stay with your account.</small></span></li>
          <li><ShieldCheck size={20} aria-hidden="true" /><span><strong>A private clubhouse.</strong><small>Sign-in and permission to access this Site are separate.</small></span></li>
        </ul>
      </section>
      <section className="account-entry-card" aria-labelledby="account-entry-heading">
        <span className="account-entry-badge"><UserRound size={24} aria-hidden="true" /></span>
        <span className="sports-kicker">MANAGER ENTRANCE</span>
        <h2 id="account-entry-heading">{account.status === 'authenticated' ? 'Welcome back.' : 'Welcome to the clubhouse.'}</h2>
        {account.status === 'loading' && <div className="account-entry-status" role="status"><span className="account-loading-dot" aria-hidden="true" />Checking your account…</div>}
        {account.status === 'authenticated' && <>
          <p className="account-entry-name">Signed in as <strong>{account.displayName}</strong>.</p>
          <p>Open your saved progress and choose your next play.</p>
          <a className="primary-button account-entry-primary" href={destination}>Continue <ArrowRight size={18} aria-hidden="true" /></a>
          <a className="account-entry-secondary" href="/profile">Profile &amp; settings</a>
        </>}
        {account.status === 'signed-out' && <>
          {expired && <p className="account-entry-expired" role="status">Your sign-in expired. Sign in again to continue from your last saved progress.</p>}
          <p>Use your ChatGPT account to open your saved season and leagues.</p>
          <a className="primary-button account-entry-primary" href={accountSignInPath(destination)} target="_top">Sign in with ChatGPT <ArrowRight size={18} aria-hidden="true" /></a>
          <p className="account-entry-note">You’ll continue to ChatGPT to sign in, then return here. This Site uses the same account; there is no separate football password.</p>
        </>}
        {account.status === 'unavailable' && <>
          <div className="account-entry-unavailable" role="status"><strong>We couldn’t check your account.</strong><p>Check your connection and try again. This does not mean you’ve been signed out.</p></div>
          <button className="primary-button account-entry-primary" onClick={() => void account.refresh()}><RefreshCw size={18} aria-hidden="true" />Retry account check</button>
        </>}
        <div className="account-entry-access"><ShieldCheck size={17} aria-hidden="true" /><p>Private Site · Access is limited to authorized visitors. A league invitation doesn’t grant Site access.</p></div>
        <a className="account-entry-help" href="https://help.openai.com/en/articles/4936828-resetting-or-changing-your-chatgpt-password" target="_blank" rel="noreferrer">Help with your ChatGPT account<span className="sr-only"> (opens in a new tab)</span></a>
      </section>
    </main>
    <footer className="account-entry-footer">Fantasy Football of the Past <span>THE PAST IS IN PLAY</span></footer>
  </div>;
}
