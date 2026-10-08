import assert from 'node:assert/strict';
import test from 'node:test';
import { accountEntryPath, accountSignInPath, safeRelativeReturnTo } from '../lib/account-navigation.ts';

test('account entry preserves same-origin resume path, query and section', () => {
  const target = '/league?id=league-1&tab=replay#week-4';
  assert.equal(safeRelativeReturnTo(target), target);
  assert.equal(accountSignInPath(target), `/signin-with-chatgpt?return_to=${encodeURIComponent(target)}`);
  assert.equal(accountEntryPath(target), `/login?return_to=${encodeURIComponent(target)}`);
  assert.equal(safeRelativeReturnTo('/demo?tab=roster'), '/demo?tab=roster');
  assert.equal(safeRelativeReturnTo('/demo/../profile'), '/profile');
});

test('account entry rejects external, malformed and authentication-loop destinations', () => {
  for (const target of [undefined, null, [], ['/', '/demo'], 5, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\n/demo', '/%2F%2Fevil.example', '/%5Cevil.example', '/%0A/demo', 'javascript:alert(1)', '/signin-with-chatgpt?return_to=/demo', '/signout-with-chatgpt', '/callback/', '/login?return_to=/demo', '/%63allback', '/%zz', '/' + 'x'.repeat(4096)]) {
    assert.equal(safeRelativeReturnTo(target), '/', String(target));
    assert.equal(accountSignInPath(target), '/signin-with-chatgpt?return_to=%2F', String(target));
  }
});
