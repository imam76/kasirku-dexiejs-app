# Supabase khusus billing dan lead

Supabase pada monorepo ini dipakai untuk identitas Supabase Auth, Edge Function,
dan PostgreSQL onboarding/billing. Data transaksi POS, host/LAN, dan Dexie lokal
tidak dipindahkan ke project ini.

## Arsitektur dan batas data

Frontend melakukan `signInAnonymously()` menggunakan publishable key project
billing. Supabase menerbitkan access token JWT dan refresh token. Setiap request
aplikasi kemudian mengirim:

```http
apikey: sb_publishable_...
Authorization: Bearer <access-token JWT Supabase Auth>
```

Edge Function `billing` memakai `verify_jwt=true` dan memverifikasi JWT lagi
dengan mode `auth: 'user'` dari `@supabase/server`. Claim `sub` yang sudah
terverifikasi diteruskan ke logika Fastify dan dipetakan melalui
`billing_private.business_users`. Token instalasi 64-hex tidak lagi dipakai.

Endpoint yang memang tidak dapat membawa JWT berada di Edge Function terpisah
`billing-public` dengan `verify_jwt=false`:

- `GET /health`;
- `GET /payment/finish`;
- `POST /v1/midtrans/notifications`.

Function publik hanya menerima tiga route tersebut. Webhook tetap wajib lolos
signature Midtrans, pembacaan status resmi, kecocokan merchant, dan kecocokan
nominal sebelum aktivasi.

Database memakai schema privat:

- `billing_private`: bisnis, relasi user Supabase, kode pemulihan yang di-hash,
  order, entitlement, dan audit webhook/pemulihan;
- `leads_private`: registrasi lead dan audit consent.

Hak schema dan tabel dicabut dari `anon` serta `authenticated`. Frontend tidak
menerima database URL atau secret key; seluruh akses data melewati function.

## Menjalankan secara lokal

Supabase CLI membutuhkan Docker. Salin env function tanpa memasukkan hasilnya ke
Git:

```bash
cp services/billing/supabase/functions/.env.example services/billing/supabase/functions/.env
bun run supabase:start
bun run supabase:billing:serve
```

`services/billing/supabase/config.toml` mengaktifkan Anonymous Sign-Ins lokal.
Ambil publishable key lokal dari `supabase status`, lalu isi frontend:

```env
VITE_BILLING_API_URL=http://127.0.0.1:54321/functions/v1/billing
VITE_BILLING_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Callback lokal Midtrans menggunakan base function publik:

```text
http://127.0.0.1:54321/functions/v1/billing-public
```

Fastify dan PostgreSQL port 5544 tetap dipakai oleh tes integrasi internal.
Jangan mengekspos `bun run billing:dev` sebagai endpoint pengguna karena adapter
tersebut tidak memverifikasi JWT; jalur runtime aplikasi adalah Supabase CLI.

Pemeriksaan tanpa deploy:

```bash
bun run billing:check
bun run billing:edge:check
bun run billing:edge:test
bun run test:billing
```

## Diagnosis checkout berhenti pada `creating`

Health yang berhasil hanya memeriksa koneksi database. Jika checkout gagal,
status pembayaran menjadi `unavailable`, dan webhook juga merespons HTTP 500,
periksa log Edge Function `billing` dan `billing-public`.

Adapter Midtrans wajib mengimpor `Buffer` dari `node:buffer`. Mengandalkan global
Node dapat menghasilkan `ReferenceError: Buffer is not defined` di bundle Edge,
walaupun tes Bun/Node atau Deno CLI yang lebih baru lulus. Tes
`billing:edge:test` menjalankan checkout, status, dan signature tanpa global
tersebut; workflow staging menjalankannya sebelum deploy.

Setelah perbaikan adapter, deploy ulang **kedua** function karena keduanya
menggunakan adapter yang sama. Order `creating` tetap disimpan: pilih
**Lanjutkan checkout** untuk mencoba ulang dengan order ID yang sama.

Kegagalan pengiriman preferensi komunikasi tetap menyimpan `consentPending`
untuk dicoba lagi. Untuk usaha yang sudah terdaftar, antrean ini tidak
menghalangi pembaruan akses berbayar atau pembuatan checkout.

## Membuat staging

Buat satu project Supabase khusus staging billing, lalu GitHub Environment
`staging`. Isi:

| Nama | Jenis | Isi |
| --- | --- | --- |
| `SUPABASE_BILLING_PROJECT_ID` | variable | Project ref 20 karakter |
| `SUPABASE_BILLING_PUBLISHABLE_KEY` | variable | `sb_publishable_...` project billing |
| `SUPABASE_ACCESS_TOKEN` | secret | Personal access token Supabase CLI |
| `SUPABASE_BILLING_DB_PASSWORD` | secret | Password database staging |
| `MIDTRANS_SANDBOX_MERCHANT_ID` | secret | Merchant ID sandbox |
| `MIDTRANS_SANDBOX_CLIENT_KEY` | secret | Client key sandbox |
| `MIDTRANS_SANDBOX_SERVER_KEY` | secret | Server key sandbox |
| `BILLING_ALLOWED_ORIGINS` | secret | Origin aplikasi, dipisahkan koma |

Workflow `supabase-billing-staging` melakukan `supabase config push` agar
Anonymous Sign-Ins aktif, menerapkan migrasi, memasang secret, men-deploy kedua
function, dan memeriksa health publik. URL-nya:

```text
# Request aplikasi dengan JWT
https://PROJECT_REF.supabase.co/functions/v1/billing

# Callback Midtrans dan health saja
https://PROJECT_REF.supabase.co/functions/v1/billing-public
```

Migrasi instalasi lama berlangsung saat sinkronisasi pertama. Aplikasi membuat
sesi Supabase, menerima 401 karena user belum tertaut, lalu membuktikan
kepemilikan dengan kode pemulihan lokal dan menulis relasi `business_users`.
Tabel `access_tokens` dari deployment lama sengaja dipertahankan selama rollout,
tetapi kode baru tidak membaca atau menulisnya. Hapus tabel itu lewat migrasi
retensi setelah seluruh client staging sudah berpindah.

Anonymous user memakai role database `authenticated`, tetapi tetap tidak dapat
mengakses kedua schema privat. Sebelum produksi, aktifkan CAPTCHA/rate limit Auth
yang sesuai dan buat job pembersihan user anonim yatim agar pendaftaran otomatis
tidak menjadi jalur abuse atau pertumbuhan tabel `auth.users` tanpa batas.

## Batas staging

Free Plan cukup untuk staging bertrafik rendah, tetapi tidak menyediakan jaminan
uptime atau kebijakan backup/PITR yang dibutuhkan billing production. Sebelum
production, gunakan project terpisah, tetapkan backup dan uji restore,
pemantauan, retensi log, CAPTCHA, serta SLA.

Rujukan resmi:

- [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Function Configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config)
