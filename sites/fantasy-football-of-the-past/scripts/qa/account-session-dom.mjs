/** Isolated account UI regression. DOM_HARNESS_MODULE points to an existing happy-dom install. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({
 resolve(id, context, next) {
  if (id.startsWith('@/')) id = pathToFileURL(root + id.slice(2)).href;
  try { return next(id, context); } catch (error) {
   for (const extension of ['.ts', '.tsx']) { try { return next(id + extension, context); } catch {} }
   throw error;
  }
 },
 load(url, context, next) {
  if (url.startsWith('file:') && /\.(ts|tsx)$/.test(url) && !url.includes('/node_modules/')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText };
  return next(url, context);
 },
});
const { Window } = await import(process.env.DOM_HARNESS_MODULE || 'happy-dom');
const window = new Window({ url: 'http://fixture.local/demo?tab=roster#week-4' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'MutationObserver']) Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { AccountSessionProvider, useAccountSession } = await import(pathToFileURL(root + 'components/account-session.tsx').href);
const { AccountEntry } = await import(pathToFileURL(root + 'components/account-entry.tsx').href);
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timeouts = new Map();
globalThis.setTimeout = (callback, delay, ...args) => {
 if (delay !== 15000) return originalSetTimeout(callback, delay, ...args);
 const token = {}; timeouts.set(token, () => callback(...args)); return token;
};
globalThis.clearTimeout = token => { if (!timeouts.delete(token)) originalClearTimeout(token); };

const requests = [];
const owner = { authenticated: true, accountKey: 'a'.repeat(64), displayName: 'Jonathan', avatar: null, reduceMotion: true };
const accountChanges = [];
const changed = event => accountChanges.push(event);
window.addEventListener('fantasy:account-changed', changed);
let nextResponse = () => Promise.resolve(Response.json(owner));
globalThis.fetch = (url, options = {}) => {
 requests.push({ url, method: options.method || 'GET' });
 assert.equal(url, '/api/account');
 return nextResponse(options);
};
let account;
function Probe() { account = useAccountSession(); return null; }
document.body.innerHTML = '<div id="root"></div>';
const app = createRoot(document.getElementById('root'));
const act = async fn => React.act(async () => { await fn(); await new Promise(resolve => originalSetTimeout(resolve, 20)); });
const q = selector => document.querySelector(selector);
async function refresh() { await act(() => { void account.refresh(); }); }
function delayed(ignoreAbort = false) {
 let resolve, reject;
 const response = new Promise((yes, no) => { resolve = yes; reject = no; });
 nextResponse = ({ signal }) => {
  if (!ignoreAbort) signal.addEventListener('abort', () => reject(new Error('Controlled abort')), { once: true });
  return response;
 };
 return { resolve: (body, status = 200) => resolve(Response.json(body, { status })), reject };
}

try {
 await act(() => app.render(React.createElement(Probe)));
 assert.equal(account.provided, false, 'Standalone legacy fixtures do not imply a real session gate');
 assert.equal(account.status, 'loading');
 const initial = delayed();
 await act(() => app.render(React.createElement(AccountSessionProvider, null, React.createElement(AccountEntry, { returnTo: '/demo?tab=roster#week-4', expired: true }), React.createElement(Probe))));
 assert.equal(account.status, 'loading');
 assert.equal(account.provided, true, 'Real workspaces always expose the shared session gate, including initial loading');
 assert.equal(account.accountKey, null, 'A never-authenticated session starts without a cache identity');
 assert.equal(account.displayName, null);
 await act(() => initial.resolve(owner));
 nextResponse = () => Promise.resolve(Response.json(owner));
 assert.equal(account.status, 'authenticated');
 assert.equal(account.accountKey, owner.accountKey);
 assert.equal(accountChanges.length, 0, 'The first account read is not an identity change');
 assert.match(q('.account-header-profile').textContent, /Jonathan/);
 assert.equal(q('.account-entry-primary').getAttribute('href'), '/demo?tab=roster#week-4');
 assert.equal(document.documentElement.dataset.reduceMotion, 'true');
 assert.equal(q('nav a[aria-current=page]'), null, 'Login does not mark a game mode active');

 // Profile saves update the header without changing its account cache partition.
 nextResponse = () => Promise.resolve(Response.json({ ...owner, displayName: 'Updated manager profile' }));
 await act(() => window.dispatchEvent(new window.Event('fantasy:profile-updated')));
 assert.match(q('.account-header-profile').textContent, /Updated manager profile/);
 assert.equal(account.accountKey, owner.accountKey);
 assert.equal(accountChanges.length, 0);
 nextResponse = () => Promise.resolve(Response.json(owner));
 await refresh();

 for (const status of [404, 503]) {
  nextResponse = () => Promise.resolve(Response.json({ error: 'Controlled unavailable account' }, { status }));
  await refresh();
  assert.equal(account.status, 'unavailable');
  assert.equal(account.displayName, 'Jonathan', 'Transport availability does not invent a sign-out');
  assert.equal(account.accountKey, owner.accountKey);
  assert.ok(q('.account-header-retry'));
  assert.match(q('.account-entry-unavailable').textContent, /does not mean you’ve been signed out/);
  assert.equal(q('a[href^="/signin-with-chatgpt"]'), null);
  nextResponse = () => Promise.resolve(Response.json(owner));
  await act(() => q('button.account-entry-primary').click());
  assert.equal(account.status, 'authenticated');
 }
 nextResponse = () => Promise.reject(new Error('Controlled network interruption'));
 await refresh();
 assert.equal(account.status, 'unavailable');
 assert.equal(q('.account-header-signin'), null);

 // An earlier success is ignored once another API has reported an expired session.
 const oldResponse = delayed(true);
 await refresh();
 await act(() => window.dispatchEvent(new window.Event('fantasy:session-expired')));
 assert.equal(account.status, 'signed-out');
 assert.equal(account.displayName, null);
 assert.equal(account.avatar, null);
 assert.equal(account.accountKey, owner.accountKey, 'Expired identity retains only its opaque cache partition so disabled unsaved forms are not remounted');
 assert.equal(document.documentElement.dataset.reduceMotion, undefined);
 assert.match(q('.account-entry-expired').textContent, /last saved progress/);
 await act(() => oldResponse.resolve(owner));
 assert.equal(account.status, 'signed-out');
 const signIn = q('a.account-entry-primary');
 assert.equal(signIn.getAttribute('href'), '/signin-with-chatgpt?return_to=%2Fdemo%3Ftab%3Droster%23week-4');
 assert.equal(signIn.getAttribute('target'), '_top');
 assert.equal(q('.account-header-signin').getAttribute('href'), '/login?return_to=%2Fdemo%3Ftab%3Droster%23week-4');
 assert.equal(q('input[type=password]'), null);

 nextResponse = () => Promise.resolve(Response.json({ authenticated: true, accountKey: 'b'.repeat(64), displayName: 'Different manager', avatar: null, reduceMotion: false }));
 await refresh();
 assert.equal(account.status, 'authenticated');
 assert.equal(account.displayName, 'Different manager');
 assert.equal(account.accountKey, 'b'.repeat(64));
 assert.equal(accountChanges.length, 1, 'A new identity invalidates cached progress even after expiry');
 assert.equal(accountChanges[0].detail, undefined, 'Account change notifications do not carry identity details');
 assert.equal(document.documentElement.dataset.reduceMotion, 'false');

 // A direct authenticated A→B switch emits another change without relying on a 401 first.
 nextResponse = () => Promise.resolve(Response.json(owner));
 await refresh();
 assert.equal(account.accountKey, owner.accountKey);
 assert.equal(accountChanges.length, 2);

 // Malformed/missing cache identity is unavailable, never treated as a valid session.
 for (const invalidKey of [undefined, '', 'opaque-but-not-hashed', 'g'.repeat(64)]) {
  nextResponse = () => Promise.resolve(Response.json({ ...owner, accountKey: invalidKey }));
  await refresh();
  assert.equal(account.status, 'unavailable');
  assert.equal(account.accountKey, owner.accountKey);
  assert.equal(accountChanges.length, 2);
 }
 nextResponse = () => Promise.resolve(Response.json({ authenticated: false }, { status: 401 }));
 await refresh();
 assert.equal(account.status, 'signed-out');

 // A pending account check has a bounded timeout, then exposes a retry rather than trapping entry.
 const pending = delayed();
 await refresh();
 assert.equal(timeouts.size, 1);
 await act(() => [...timeouts.values()][0]());
 assert.equal(account.status, 'unavailable');
 assert.equal(timeouts.size, 0);
 assert.ok(q('button.account-entry-primary'));
 void pending;

 // A fresh mount cannot inherit any identity metadata from the previous provider.
 await act(() => app.render(null));
 nextResponse = () => Promise.resolve(Response.json({ authenticated: false }, { status: 401 }));
 await act(() => app.render(React.createElement(AccountSessionProvider, null, React.createElement(AccountEntry), React.createElement(Probe))));
 assert.equal(account.status, 'signed-out');
 assert.equal(account.accountKey, null);
 assert.equal(account.displayName, null);
 assert.ok(requests.length > 5);
 assert.ok(requests.every(request => request.method === 'GET'), 'Account entry and retries perform only reads');
 console.log('PASS: authenticated entry and named header; profile-updated refresh keeps cache identity; 404/503/network errors remain unavailable; successful retry; expired-session event suppresses stale identity; same-origin top-level sign-in return path; identity switches emit detail-free cache invalidation with new key and motion preference; malformed keys unavailable; 401 requires sign-in; bounded 15s timeout; no password fields or writes. Mounted DOM only.');
} finally {
 await act(() => app.unmount());
 assert.equal(timeouts.size, 0, 'Account request timers are cleaned up');
 globalThis.setTimeout = originalSetTimeout;
 globalThis.clearTimeout = originalClearTimeout;
 window.removeEventListener('fantasy:account-changed', changed);
 window.happyDOM.abort();
}
