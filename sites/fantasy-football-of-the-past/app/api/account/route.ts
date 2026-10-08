import { database } from '@/db';
import { validAvatar } from '@/lib/profile-model';

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function identityName(request: Request): string {
  const encoded = request.headers.get('oai-authenticated-user-full-name');
  if (encoded && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try {
      const name = decodeURIComponent(encoded).trim();
      if (name) return name.slice(0, 80);
    } catch { /* A malformed optional display field does not invalidate identity. */ }
  }
  return 'Manager';
}

/** Opaque cache partition only; authorization continues to use trusted Sites identity. */
async function accountKey(owner: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fantasy-football-account:${owner}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Sites supplies identity; this read does not create an account, profile or save. */
export async function GET(request: Request): Promise<Response> {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) return reply({ authenticated: false, error: 'Sign in with ChatGPT to open your account.' }, 401);
  try {
    const row = await database().prepare('SELECT state FROM user_profiles WHERE owner_id = ?').bind(owner).first<{ state: string }>();
    const profile: unknown = row ? JSON.parse(row.state) : {};
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid saved profile');
    const fields = profile as Record<string, unknown>;
    const displayName = typeof fields.displayName === 'string' ? fields.displayName.trim().slice(0, 50) : '';
    return reply({
      authenticated: true,
      accountKey: await accountKey(owner),
      displayName: displayName || identityName(request),
      avatar: validAvatar(fields.avatar) ? fields.avatar : null,
      reduceMotion: fields.reduceMotion === true,
    });
  } catch {
    return reply({ error: 'Your account could not load. Check your connection and try again.' }, 503);
  }
}
