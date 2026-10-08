import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const shared = globalThis as typeof globalThis & { __accountDB?: ReturnType<typeof memoryDatabase> };
registerHooks({ resolve(id, context, next) {
  if (id === '@/db') return { url: `data:text/javascript,${encodeURIComponent('export function database(){if(!globalThis.__accountDB)throw Error("DB unavailable");return globalThis.__accountDB;}')}`, shortCircuit: true };
  if (id.startsWith('@/')) return next(new URL(`${id.slice(2)}.ts`, root).href, context);
  return next(id, context);
} });
const api = await import('../app/api/account/route.ts');

function memoryDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('drizzle/0004_amazing_quicksilver.sql', root), 'utf8'));
  const queries: string[] = [];
  return { sql, queries, prepare(query: string) {
    queries.push(query);
    assert.match(query, /^SELECT /i, 'Account reads never prepare a write');
    let args: SQLInputValue[] = [];
    return { bind(...values: unknown[]) { args = values as SQLInputValue[]; return this; }, async first() { return sql.prepare(query).get(...args) || null; } };
  } };
}
function request(user = 'owner', extra: Record<string, string> = {}) {
  return new Request('https://site.test/api/account', { headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...extra } });
}
async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}
function seed(owner: string, profile: unknown) {
  shared.__accountDB!.sql.prepare('INSERT INTO user_profiles(owner_id,state,revision,updated_at) VALUES(?,?,?,?)').run(owner, JSON.stringify(profile), 7, 'fixture-date');
}
const expectedKey = (owner: string) => createHash('sha256').update(`fantasy-football-account:${owner}`).digest('hex');

test('account requires trusted Sites identity, exposes only safe display fields and never creates or changes profiles', async () => {
  shared.__accountDB = memoryDatabase();
  seed('owner', { displayName: ' Jonathan ', avatar: null, reduceMotion: true, email: 'private@fixture.test', userId: 'private-owner', username: 'private-handle', about: 'private-about', revision: 7 });
  seed('other', { displayName: 'Other manager', avatar: 'https://outside.example/photo.jpg', reduceMotion: false });
  const before = JSON.stringify(shared.__accountDB.sql.prepare('SELECT * FROM user_profiles ORDER BY owner_id').all());
  const unauthenticated = await api.GET(request(''));
  assert.equal(unauthenticated.status, 401);
  assert.equal(shared.__accountDB.queries.length, 0);
  const owner = await api.GET(request());
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get('Cache-Control'), 'private, no-store');
  const ownerBody = await body(owner);
  assert.deepEqual(ownerBody, { authenticated: true, accountKey: expectedKey('owner'), displayName: 'Jonathan', avatar: null, reduceMotion: true });
  const otherBody = await body(await api.GET(request('other')));
  assert.deepEqual(otherBody, { authenticated: true, accountKey: expectedKey('other'), displayName: 'Other manager', avatar: null, reduceMotion: false });
  assert.notEqual(ownerBody.accountKey, otherBody.accountKey, 'Private progress has a distinct cache partition per identity');
  assert.equal((await body(await api.GET(request()))).accountKey, ownerBody.accountKey, 'Cache identity is stable across repeated reads');
  assert.match(String(ownerBody.accountKey), /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(ownerBody).includes('private-owner'), false);
  assert.equal(JSON.stringify(ownerBody).includes('private@fixture.test'), false);
  assert.deepEqual(await (await api.GET(request('new-owner', { 'oai-authenticated-user-email': 'never-exposed@fixture.test' }))).json(), { authenticated: true, accountKey: expectedKey('new-owner'), displayName: 'Manager', avatar: null, reduceMotion: false });
  assert.equal(JSON.stringify(shared.__accountDB.sql.prepare('SELECT * FROM user_profiles ORDER BY owner_id').all()), before);
  assert.equal(shared.__accountDB.queries.length, 4);
  shared.__accountDB.sql.close();
});

test('optional Sites name safely decodes UTF-8; unavailable storage does not claim signed out', async () => {
  shared.__accountDB = memoryDatabase();
  const fullName = 'Luis Hernández';
  const named = await api.GET(request('new-owner', { 'oai-authenticated-user-full-name': encodeURIComponent(fullName), 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' }));
  assert.equal((await body(named)).displayName, fullName);
  const malformed = await api.GET(request('new-owner', { 'oai-authenticated-user-full-name': '%invalid', 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8' }));
  assert.equal((await body(malformed)).displayName, 'Manager');
  shared.__accountDB.sql.prepare('INSERT INTO user_profiles(owner_id,state,revision,updated_at) VALUES(?,?,?,?)').run('broken', 'not-json', 3, 'fixture-date');
  const corrupt = await api.GET(request('broken'));
  assert.equal(corrupt.status, 503);
  assert.equal('authenticated' in await body(corrupt), false);
  shared.__accountDB.sql.close();
  delete shared.__accountDB;
  assert.equal((await api.GET(request(''))).status, 401);
  const unavailable = await api.GET(request());
  assert.equal(unavailable.status, 503);
  assert.equal('authenticated' in await body(unavailable), false);
});
