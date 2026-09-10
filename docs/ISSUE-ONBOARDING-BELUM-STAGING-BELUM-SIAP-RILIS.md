# onboarding belum staging belum siap rilis

Status: OPEN — belum lolos staging dan belum siap rilis  
Tanggal: 2026-09-10  
Rujukan: [Onboarding dan Midtrans Sandbox](ONBOARDING-MIDTRANS-SANDBOX.md)

## Ringkasan

Audit onboarding menemukan kebocoran akses backup/kode pemulihan, checkout yang
bisa macet setelah kegagalan Snap, serta pekerjaan konfigurasi dan operasional
yang masih menghalangi rilis. Perbaikan nomor 1 dan 4 dikerjakan terlebih dahulu.
Kelulusan tes lokal tidak sama dengan kelulusan staging atau pengujian native.

## 1. Hak akses backup dan identitas langganan

Status: SELESAI — implementasi dan pengujian lokal lulus.

Sebelumnya akun KASIR bisa membuka kode pemulihan dan mengunduh backup lengkap
melalui halaman Langganan, baik ketika trial aktif maupun setelah akses habis.

Perbaikan:

- Backup memerlukan izin `SETTINGS_ACCESS`, diperiksa pada UI dan pada fungsi
  `backupDatabase` sebelum data dibaca. Owner serta Admin yang memiliki izin
  Pengaturan tetap dapat mengekspor backup saat langganan habis.
- Kode pemulihan dan penggantian identitas langganan pada instalasi yang sudah
  memiliki Owner memerlukan sesi Owner aktif. Fungsi aksinya memeriksa ulang
  sesi, sehingga pembatasan tidak hanya bergantung pada tombol tersembunyi.
- Instalasi baru tetap dapat memulihkan langganan sebelum membuat Owner lokal.
- Preferensi marketing hanya ditampilkan untuk Owner.
- Tombol **Ganti pengguna** tersedia pada layar langganan yang habis agar kasir
  bisa keluar dan Owner masuk. Kode yang pernah ditampilkan tidak dibawa ke sesi
  pengguna berikutnya.

File: `src/onboarding/SubscriptionGate.tsx`, `src/onboarding/billingClient.ts`,
`src/onboarding/ownerAccess.ts`, `src/utils/backupRestore.ts`.

Batasan: ini pembatasan hak akses aplikasi. Penyimpanan langganan lokal belum
memiliki proteksi anti-tamper; manipulasi localStorage/devtools bukan bagian
dari perbaikan ini.

## 2. Midtrans production belum didukung

- [ ] Backend mendukung pemilihan environment sandbox/production secara eksplisit.
- [ ] Endpoint dan validasi URL checkout mengikuti environment yang dipilih.
- [ ] Kredensial production disediakan melalui konfigurasi server yang aman.
- [ ] Build tidak salah menghubungkan environment frontend dan backend.

Saat ini konfigurasi hanya menerima `sandbox`, dan URL Midtrans masih khusus
sandbox. Tidak ada perubahan pada area ini dalam perbaikan nomor 1 dan 4.

## 3. Konfigurasi rilis dan staging belum lengkap

- [x] Workflow release mengisi `VITE_BILLING_API_URL` dari project ref Supabase billing.
- [x] Build rilis menyertakan publishable key billing dan menolak project
  ref/URL/key yang kosong atau tidak valid.
- [ ] Layanan billing staging dan webhook HTTPS publik tersedia dan teruji.
- [ ] Origin desktop/Android dan alur kembali dari browser eksternal diuji.

Keputusan staging: gunakan satu project Supabase Free khusus billing dan lead.
Data ditempatkan pada schema privat `billing_private` dan `leads_private` melalui
subproject `services/billing/supabase`; migrasi Supabase/tabel POS utama tidak
ikut dalam workflow ini. Edge Function memakai logika yang sama dengan server
Fastify dan menyediakan endpoint HTTPS serta webhook publik. Workflow deploy,
migration, secret Midtrans sandbox, dan health check sudah ditambahkan. Project
cloud dan GitHub secret belum disediakan, jadi item staging nyata tetap terbuka.
Lihat [panduan Supabase billing staging](SUPABASE-BILLING-STAGING.md).

## 4. Checkout gagal meninggalkan order creating

Status: SELESAI — implementasi dan pengujian lokal lulus.

Sebelumnya order disimpan sebelum request Snap. Jika request gagal, timeout,
atau proses berhenti sebelum URL tersimpan, request berikutnya ditolak dan
usaha tidak bisa melanjutkan checkout tanpa tindakan manual.

Perbaikan:

- Order tetap disimpan untuk menjaga identitas, nominal, dan paket pembayaran.
- Retry tanpa URL memeriksa status Midtrans terlebih dahulu. Jika status API
  tidak tersedia, order dipertahankan dan pengguna dapat mencoba lagi nanti.
- Jika status belum tersedia (404), request Snap diulang dengan **order ID yang
  sama** dan harga/paket dari order tersimpan. Tidak dibuat order ID baru.
- Jika status pembayaran sudah ada, backend merekonsiliasikannya melalui
  validasi merchant, nominal, fraud, dan aktivasi idempoten yang sama.
- Row lock PostgreSQL menyerialisasi pembuatan URL, termasuk request dari proses
  layanan berbeda. Lock dilepas saat transaksi gagal atau koneksi proses putus.
- UI memperbarui status meskipun request checkout gagal dan menyediakan aksi
  **Lanjutkan checkout**. Timeout request checkout memberi ruang untuk status
  API dan pembuatan Snap yang berurutan.

Dasar retry: Midtrans mendukung pembuatan ulang token dengan order ID yang sama
sebelum metode pembayaran dipilih; token lama diganti. Order ID yang sudah
digunakan ditolak oleh Midtrans.
[Dokumentasi resmi Midtrans](https://docs.midtrans.com/docs/snap-advanced-feature).

File: `services/billing/app.ts`, `src/onboarding/billingClient.ts`,
`src/onboarding/SubscriptionGate.tsx`.

Jika Midtrans sudah memiliki pembayaran pending tetapi URL lokal hilang, backend
mempertahankan dan memeriksa pembayaran tersebut. Backend tidak membuat tagihan
baru untuk melewati status yang belum selesai. Jika layanan provider masih
gagal, pengguna mencoba kembali setelah koneksi pulih.

## 5. Dokumen dan operasional sebelum rilis

- [ ] Finalisasi identitas/kontak penyedia serta Syarat Layanan dan Privasi.
- [ ] Finalisasi kebijakan pajak, refund, perubahan paket, dan kode pemulihan hilang.
- [ ] Verifikasi backup terenkripsi, uji restore, retensi, pemantauan, dan prosedur insiden.
- [ ] Uji pembayaran sandbox sampai selesai melalui webhook publik, termasuk
  notifikasi ulang dan gangguan jaringan.
- [ ] Uji aplikasi desktop dan Android native, lalu catat keputusan go/no-go.

## Validasi perbaikan nomor 1 dan 4

- [x] Type-check frontend dan billing lulus.
- [x] Tes integrasi PostgreSQL billing lulus, termasuk retry gagal, restart,
  request bersamaan, harga tetap, provider tidak tersedia, dan aktivasi idempoten.
- [x] Tes browser Owner/Admin/Kasir, akses habis, dan pemulihan instalasi baru lulus.
- [x] Build frontend lulus.

Hasil 2026-09-10:

| Pemeriksaan | Hasil |
| --- | --- |
| `bun run billing:check` | Lulus |
| `bun run test:billing` | 19 tes lulus; termasuk satu database, pembatasan schema public, dan migrasi Supabase |
| Deno check + health adapter Edge Function | Lulus; entrypoint memanggil Fastify melalui runtime Deno dan PostgreSQL lokal |
| `bun run test:unit` | 432 tes lulus |
| Playwright Chromium: `onboarding-live.spec.ts` dan `onboarding-permissions.spec.ts` | 7 tes lulus |
| ESLint pada file onboarding/billing dan tes baru yang diubah | Lulus |
| `bun run build` | Lulus; warning aset beep dan ukuran chunk masih ada |

Pengujian browser mencakup retry checkout setelah respons gagal dengan request ID
tetap, trial yang tidak berubah menjadi berbayar, penolakan aksi langsung oleh
kasir, serta pergantian dari kasir ke Owner ketika akses habis. Pengujian ini
belum menjalankan APK/native atau pembayaran ke Midtrans sesungguhnya.

Issue tetap terbuka sampai pekerjaan nomor 2, 3, dan 5 serta verifikasi staging
selesai. Tidak ada pembayaran production atau deployment dalam pekerjaan ini.

Catatan infrastruktur: Supabase Free dipakai untuk staging awal. Tier ini belum
memenuhi kebutuhan backup otomatis/PITR, retensi log, dan SLA billing production;
keputusan upgrade atau penyedia production lain tetap bagian dari go/no-go.
