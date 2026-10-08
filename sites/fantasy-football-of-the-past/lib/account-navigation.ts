/** Client-safe counterparts of the Sites sign-in helper's return-path rules. */
export function safeRelativeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    if (url.origin !== 'https://app.local') return '/';
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    if (pathname.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(pathname)) return '/';
    if (['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback', '/login'].includes(pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function accountSignInPath(returnTo: unknown): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeRelativeReturnTo(returnTo))}`;
}

export function accountEntryPath(returnTo: unknown): string {
  return `/login?return_to=${encodeURIComponent(safeRelativeReturnTo(returnTo))}`;
}
