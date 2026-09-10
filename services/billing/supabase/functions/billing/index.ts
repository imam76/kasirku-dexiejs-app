import {
  createSupabaseContext,
  type SupabaseEnv,
} from '@supabase/server';
import { buildApp } from '../../../app.ts';
import { readConfig } from '../../../config.ts';
import { createDatabases } from '../../../db.ts';
import { createMidtrans } from '../../../midtrans.ts';

type EdgeEnvironment = typeof globalThis & {
  Deno?: { env: { toObject(): Record<string, string> } };
};

type BillingApp = ReturnType<typeof buildApp>;
let app: BillingApp | undefined;
let runtimeReady: PromiseLike<void> | undefined;

const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /payment/finish',
  'POST /v1/midtrans/notifications',
]);

async function getRuntime() {
  if (!app) {
    const env = (globalThis as EdgeEnvironment).Deno?.env.toObject() ?? {};
    const config = readConfig(env);
    const db = createDatabases(config);
    app = buildApp(config, db, createMidtrans(config));
    runtimeReady = app.ready();
  }
  await runtimeReady;
  return app;
}

function billingPath(requestUrl: string) {
  const url = new URL(requestUrl);
  const marker = '/functions/v1/billing';
  const markerIndex = url.pathname.indexOf(marker);
  const pathname =
    markerIndex >= 0
      ? url.pathname.slice(markerIndex + marker.length) || '/'
      : url.pathname;
  return `${pathname}${url.search}`;
}

export function requiresSupabaseApiKey(
  request: Pick<Request, 'method' | 'url'>,
) {
  if (request.method.toUpperCase() === 'OPTIONS') return false;
  const pathname = billingPath(request.url).split('?', 1)[0];
  return !PUBLIC_ROUTES.has(`${request.method.toUpperCase()} ${pathname}`);
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

export async function authorizeSupabaseClient(
  request: Request,
  env?: Partial<SupabaseEnv>,
): Promise<Response | null> {
  const { error } = await createSupabaseContext(request, {
    auth: 'publishable',
    ...(env ? { env } : {}),
  });
  if (!error) return null;

  if (error.status >= 500)
    console.error(`Supabase billing auth misconfigured: ${error.code}`);
  return Response.json(
    {
      error:
        error.status >= 500
          ? 'Konfigurasi autentikasi billing belum siap.'
          : 'Akses API billing tidak valid.',
      code: error.code,
    },
    { status: error.status, headers: authErrorHeaders(request) },
  );
}

async function handle(request: Request): Promise<Response> {
  const app = await getRuntime();
  const method = request.method.toUpperCase() as
    | 'GET'
    | 'HEAD'
    | 'POST'
    | 'PATCH'
    | 'OPTIONS';
  const payload = ['GET', 'HEAD'].includes(method)
    ? undefined
    : await request.text();
  const response = await app.inject({
    method,
    url: billingPath(request.url),
    headers: Object.fromEntries(request.headers.entries()),
    ...(payload === undefined ? {} : { payload }),
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined || name === 'content-length') continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, String(item));
    } else {
      headers.set(name, String(value));
    }
  }
  return new Response(response.body, {
    status: response.statusCode,
    headers,
  });
}

async function fetch(request: Request): Promise<Response> {
  if (requiresSupabaseApiKey(request)) {
    const authFailure = await authorizeSupabaseClient(request);
    if (authFailure) return authFailure;
  }
  return handle(request);
}

export default { fetch };
