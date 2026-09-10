import { AUTH_USER_HEADER } from '../../../app.ts';
import {
  billingPath,
  forwardToBilling,
} from '../_shared/billing-runtime.ts';

type EdgeEnvironment = typeof globalThis & {
  Deno?: { env: { toObject(): Record<string, string> } };
};
type VerifyAuth = (typeof import('@supabase/server/core'))['verifyAuth'];
type SupabaseEnv = NonNullable<Parameters<VerifyAuth>[1]['env']>;

const USER_ROUTES = new Set([
  'POST /v1/registrations',
  'GET /v1/consent',
  'PATCH /v1/consent',
  'POST /v1/recovery',
  'GET /v1/status',
  'POST /v1/checkouts',
]);

export function requiresSupabaseUser(
  request: Pick<Request, 'method' | 'url'>,
) {
  if (request.method.toUpperCase() === 'OPTIONS') return false;
  const pathname = billingPath(request.url, 'billing').split('?', 1)[0];
  return USER_ROUTES.has(`${request.method.toUpperCase()} ${pathname}`);
}

function authErrorHeaders(request: Request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
  });
  const origin = request.headers.get('origin');
  if (!origin) return headers;

  const env = (globalThis as EdgeEnvironment).Deno?.env.toObject() ?? {};
  const allowedOrigins = (env.BILLING_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

export async function authorizeSupabaseUser(
  request: Request,
  env?: Partial<SupabaseEnv>,
): Promise<{ userId: string } | Response> {
  const { verifyAuth } = await import('@supabase/server/core');
  const { data, error } = await verifyAuth(request, {
    auth: 'user',
    ...(env ? { env } : {}),
  });
  if (!error && data.userClaims?.id)
    return { userId: data.userClaims.id };

  if (error && error.status >= 500)
    console.error(`Supabase billing auth misconfigured: ${error.code}`);
  return Response.json(
    {
      error:
        error && error.status >= 500
          ? 'Konfigurasi autentikasi billing belum siap.'
          : 'Sesi Supabase tidak valid atau sudah berakhir.',
      ...(error ? { code: error.code } : {}),
    },
    {
      status: error?.status ?? 401,
      headers: authErrorHeaders(request),
    },
  );
}

async function fetch(request: Request): Promise<Response> {
  if (request.method.toUpperCase() === 'OPTIONS')
    return forwardToBilling(request, 'billing');
  if (!requiresSupabaseUser(request))
    return Response.json(
      { error: 'Route billing tidak ditemukan.' },
      { status: 404 },
    );

  const authorization = await authorizeSupabaseUser(request);
  if (authorization instanceof Response) return authorization;
  return forwardToBilling(request, 'billing', {
    [AUTH_USER_HEADER]: authorization.userId,
  });
}

export default { fetch };
