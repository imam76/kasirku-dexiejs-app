# Supabase khusus billing dan lead

Supabase pada monorepo ini hanya dipakai untuk layanan onboarding billing dan
lead. Database transaksi POS, tabel host/LAN, dan Dexie lokal aplikasi tidak
dipindahkan atau diubah.

## Batas data

Subproject Supabase berada di `services/billing/supabase/`, terpisah dari folder
`supabase/` yang sudah ada pada aplikasi. Migrasinya hanya membuat:

- schema privat `billing_private` untuk usaha, hash token/kode pemulihan, order,
  aktivasi langganan, dan audit webhook/pemulihan;
- schema privat `leads_private` untuk data registrasi lead dan audit consent.

Hak schema dan tabel dicabut dari role `anon` dan `authenticated`. Frontend tidak
mendapat database URL atau service key. Semua akses melewati Edge Function
`billing`, kemudian validasi aplikasi di `services/billing/app.ts`.

## Menjalankan secara lokal

Supabase CLI membutuhkan Docker. Salin contoh secret tanpa memasukkan file hasil
salinan ke Git:

```bash
cp services/billing/supabase/functions/.env.example services/billing/supabase/functions/.env
bun run supabase:start
bun run supabase:billing:serve
```

URL billing lokal melalui Edge Function:

```env
VITE_BILLING_API_URL=http://127.0.0.1:54321/functions/v1/billing
VITE_BILLING_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ambil publishable key lokal dari `supabase status`. Client mengirimkannya pada
header `apikey`; `@supabase/server` memvalidasinya sebelum request aplikasi
diteruskan ke Fastify. Token bearer instalasi tetap divalidasi terpisah untuk
menentukan bisnis dan entitlement.

Fastify lokal dengan dua database pada port 5544 tetap tersedia untuk tes
integrasi melalui `bun run billing:db` dan `bun run billing:dev`.

Pemeriksaan tanpa deploy:

```bash
bun run billing:check
bun run billing:edge:check
bun run test:billing
```

## Membuat staging gratis

Buat satu project Supabase Free khusus staging billing, lalu buat GitHub
Environment bernama `staging`. Isi repository variable
`SUPABASE_BILLING_PROJECT_ID` dengan project ref 20 karakter. Isi secret pada
Environment `staging` berikut:

| Secret | Isi |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Personal access token untuk Supabase CLI |
| `SUPABASE_BILLING_DB_PASSWORD` | Password database project staging |
| `MIDTRANS_SANDBOX_MERCHANT_ID` | Merchant ID sandbox |
| `MIDTRANS_SANDBOX_CLIENT_KEY` | Client key sandbox |
| `MIDTRANS_SANDBOX_SERVER_KEY` | Server key sandbox |
| `BILLING_ALLOWED_ORIGINS` | Daftar origin aplikasi, dipisahkan koma |

Tambahkan repository variable `SUPABASE_BILLING_PUBLISHABLE_KEY` berisi key
`sb_publishable_...` dari project billing. Nilai ini memang aman disertakan pada
aplikasi, tetapi jangan pernah menggantinya dengan `sb_secret_...`.

Variable `BILLING_TAX_BPS` boleh diisi; jika kosong nilainya `0` untuk sandbox.
Jalankan workflow `supabase-billing-staging`. Workflow tersebut hanya membaca
subproject `services/billing`, menerapkan migrasi dua schema privat, memasang
secret Midtrans, men-deploy Edge Function, lalu memanggil endpoint health.

URL hasil deploy adalah:

```text
https://PROJECT_REF.supabase.co/functions/v1/billing
```

Workflow release menyusun `VITE_BILLING_API_URL` dari
`SUPABASE_BILLING_PROJECT_ID`, memasukkan publishable key billing, dan
menghentikan build jika ref, URL, atau format key tidak valid.
Notification URL Midtrans staging diarahkan otomatis ke
`/v1/midtrans/notifications` pada fungsi yang sama.

## Batas Free Plan

Free Plan cukup untuk staging bertrafik rendah, tetapi project dapat dipause
setelah tidak aktif dan tidak menyediakan jaminan uptime atau fitur backup/PITR
yang dibutuhkan untuk billing production. Sebelum production, gunakan project
terpisah, tetapkan backup dan uji restore, pemantauan, retensi log, serta SLA.

Rujukan resmi:

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Environment variable Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Supabase CLI workdir](https://supabase.com/docs/reference/cli/getting-started)
- [Harga dan batas Free Plan](https://supabase.com/pricing)
