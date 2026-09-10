const rawUrl = process.env.VITE_BILLING_API_URL?.trim();
const publishableKey =
  process.env.VITE_BILLING_SUPABASE_PUBLISHABLE_KEY?.trim();
const projectRef = process.env.SUPABASE_BILLING_PROJECT_ID?.trim();

function reject(message) {
  console.error(`Konfigurasi billing rilis tidak valid: ${message}`);
  process.exit(1);
}

if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef))
  reject(
    'SUPABASE_BILLING_PROJECT_ID harus berupa project ref Supabase 20 karakter.',
  );
if (!rawUrl) reject('VITE_BILLING_API_URL wajib diisi.');
if (!publishableKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))
  reject(
    'VITE_BILLING_SUPABASE_PUBLISHABLE_KEY wajib berupa sb_publishable_....',
  );

let url;
try {
  url = new URL(rawUrl);
} catch {
  reject('VITE_BILLING_API_URL bukan URL yang valid.');
}

if (url.protocol !== 'https:') reject('URL harus memakai HTTPS.');
if (url.hostname !== `${projectRef}.supabase.co`)
  reject('host URL tidak cocok dengan project billing Supabase staging.');
if (url.pathname.replace(/\/$/, '') !== '/functions/v1/billing')
  reject('path URL harus /functions/v1/billing.');
if (url.username || url.password || url.search || url.hash)
  reject('URL tidak boleh memuat kredensial, query, atau fragment.');

console.log('Konfigurasi billing Supabase untuk build rilis valid.');
