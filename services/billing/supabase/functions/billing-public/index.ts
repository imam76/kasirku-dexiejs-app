import {
  billingPath,
  forwardToBilling,
} from '../_shared/billing-runtime.ts';

const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /payment/finish',
  'POST /v1/midtrans/notifications',
]);

export function isPublicBillingRoute(
  request: Pick<Request, 'method' | 'url'>,
) {
  if (request.method.toUpperCase() === 'OPTIONS') return true;
  const pathname = billingPath(request.url, 'billing-public').split('?', 1)[0];
  return PUBLIC_ROUTES.has(`${request.method.toUpperCase()} ${pathname}`);
}

async function fetch(request: Request): Promise<Response> {
  if (!isPublicBillingRoute(request))
    return Response.json(
      { error: 'Route publik billing tidak ditemukan.' },
      { status: 404 },
    );
  return forwardToBilling(request, 'billing-public');
}

export default { fetch };
