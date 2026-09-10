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

export function billingPath(requestUrl: string, functionName: string) {
  const url = new URL(requestUrl);
  const marker = `/functions/v1/${functionName}`;
  const markerIndex = url.pathname.indexOf(marker);
  const pathname =
    markerIndex >= 0
      ? url.pathname.slice(markerIndex + marker.length) || '/'
      : url.pathname;
  return `${pathname}${url.search}`;
}

export async function forwardToBilling(
  request: Request,
  functionName: string,
  trustedHeaders: Record<string, string> = {},
): Promise<Response> {
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
  const requestHeaders = Object.fromEntries(request.headers.entries());
  for (const [name, value] of Object.entries(trustedHeaders))
    requestHeaders[name] = value;
  const response = await app.inject({
    method,
    url: billingPath(request.url, functionName),
    headers: requestHeaders,
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
