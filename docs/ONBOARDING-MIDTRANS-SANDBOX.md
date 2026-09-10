# Onboarding dan Midtrans Sandbox

Implementasi utama memakai `src/onboarding/` dan layanan terpisah
`services/billing/`. Preview di `/onboarding-preview.html` tetap merupakan
simulasi; onboarding sesungguhnya dibuka di `/` pada instalasi baru.
Staging memakai Supabase khusus billing/lead sesuai
[panduan Supabase billing staging](SUPABASE-BILLING-STAGING.md).

## Menjalankan

```bash
bun install
cp .env.example .env
cp services/billing/supabase/functions/.env.example services/billing/supabase/functions/.env
bun run supabase:start
bun run supabase:billing:serve
# Terminal lain
bun run dev
```

Jangan menimpa `.env` yang sudah berisi konfigurasi. Pada workspace pengembangan
ini kedua env sudah disiapkan, termasuk kredensial merchant sandbox yang diberikan.

- Frontend: `http://localhost:1420`.
- Billing pengguna: `http://127.0.0.1:54321/functions/v1/billing`.
- Callback/health publik:
  `http://127.0.0.1:54321/functions/v1/billing-public/health`.
- Supabase Auth membuat user anonim dan JWT khusus identitas langganan. Akun
  Owner/Kasir aplikasi tetap akun lokal dan tidak berubah menjadi akun Supabase.

Docker daemon tidak tersedia saat implementasi diuji. Sebagai pengganti, cluster
PostgreSQL 16 lokal dibuat di `.billing-postgres.local/data`, port `5544`, dengan
dua database yang sama. Folder ini diabaikan Git. Untuk menjalankannya kembali
di mesin Windows ini, gunakan terminal terpisah:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\postgres.exe' -D '.billing-postgres.local/data' -p 5544 -h 127.0.0.1
```

Jalankan **salah satu** PostgreSQL lokal atau Compose, karena keduanya memakai
port yang sama. Jangan menunjuk layanan billing ke database POS/LAN pengguna.

## Environment

Frontend hanya memerlukan:

```env
VITE_BILLING_API_URL=http://127.0.0.1:54321/functions/v1/billing
VITE_BILLING_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_WEB_TRIAL_MODULE_BYPASS=false
```

Kredensial Midtrans berada hanya di `services/billing/.env`, yang diabaikan Git.
Contoh env tidak memuat kredensial. Server key tidak memakai prefix `VITE_`,
tidak dibaca Tauri, tidak dikirim ke frontend, dan tidak ditanam dalam build.
Client key disimpan di env backend untuk identitas konfigurasi merchant;
checkout redirect Snap tidak membutuhkan Snap.js/client key di aplikasi.

`MIDTRANS_ENVIRONMENT` saat ini hanya menerima `sandbox`. Produksi sengaja belum
tersedia karena dokumen hukum, pajak, operasional, dan domain belum final.
`BILLING_TAX_BPS=0` adalah asumsi **pengujian sandbox**, bukan keputusan pajak
produksi. Nilai 100 berarti 1%; pajak dihitung server dan masuk total checkout.

## Webhook HTTPS publik

URL publik belum tersedia di lingkungan ini. Notifikasi Midtrans tidak dapat
menjangkau `localhost` langsung. **Periksa status tetap dapat mengaktifkan
pembayaran yang berhasil**: backend memeriksa order tertunda melalui GET Status
API Midtrans, lalu memakai validasi merchant, nominal, fraud, dan transaksi
idempoten yang sama dengan webhook. Koneksi keluar dari backend ke Midtrans
cukup untuk alur ini; frontend tidak dapat mengirim status sukses sendiri.

Webhook tetap disarankan agar pembayaran tercatat segera, termasuk ketika
aplikasi pelanggan sedang ditutup. Untuk menyediakan webhook:

1. Deploy kedua Supabase Edge Function. Function `billing` wajib JWT, sedangkan
   `billing-public` hanya menyediakan callback/health yang diizinkan.
2. Isi env backend, misalnya:

   ```env
   MIDTRANS_NOTIFICATION_URL=https://PROJECT_REF.supabase.co/functions/v1/billing-public/v1/midtrans/notifications
   MIDTRANS_FINISH_URL=https://PROJECT_REF.supabase.co/functions/v1/billing-public/payment/finish
   ```

3. Restart billing, lalu **buat checkout baru**. Backend memasang
   `X-Override-Notification` untuk order tersebut. Alternatifnya, atur Payment
   Notification URL merchant di dashboard Midtrans Sandbox. URL finish hanya
   memberi instruksi kembali ke aplikasi; redirect tidak mengaktifkan akses.
4. Selesaikan pembayaran menggunakan simulator/metode uji resmi Midtrans.
5. Kembali ke aplikasi dan klik **Periksa status**. Status juga diperiksa saat
   aplikasi aktif kembali, saat online, serta setiap satu menit selama terbuka.

Endpoint memeriksa signature SHA-512, membaca status terbaru langsung dari
Midtrans, lalu mencocokkan merchant dan nominal tersimpan. Aktivasi menerima
settlement atau capture kartu yang diterima, sesuai
[panduan webhook Midtrans](https://docs.midtrans.com/docs/https-notification-webhooks).
Pembuatan Snap memakai
[parameter transaksi resmi](https://docs.midtrans.com/reference/request-body-json-parameter).

Untuk Android dev melalui USB, reverse port Supabase lokal:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:54321 tcp:54321
```

Frontend dapat tetap memakai `http://127.0.0.1:54321` pada perangkat yang mendapat
ADB reverse. Untuk APK di perangkat lain, build dengan URL billing HTTPS publik
dan tambahkan origin aplikasi ke `BILLING_ALLOWED_ORIGINS`. Android membuka
checkout dengan plugin opener/browser sistem. App link otomatis belum diklaim;
pengguna membuka kembali aplikasi secara manual. Checkout tidak memakai WebView.

## Alur yang terpasang

- Registrasi nama pemilik, usaha, WhatsApp, jenis usaha; email/lokasi opsional.
- Lima paket dan harga sesuai issue; Custom memilih modul jual secara eksplisit.
  Semua paket menyertakan role/izin, Cash & Bank, dan daftar akun. Kedua
  normalisasi setup tidak lagi menambahkan General Ledger secara otomatis.
- Setup akuntansi dapat dilewati dengan konfigurasi bawaan. Akuntansi yang
  sudah ada dipertahankan. Setelah trial aktif, pengguna membuat akun Owner
  lokal dengan PIN; alias `owner@frayukti.local` dapat dipakai tanpa email pribadi.
- Syarat/privasi harus diterima terpisah. Versi, hash SHA-256, dan waktu dicatat.
  Marketing tidak dicentang secara bawaan dan dapat ditarik di Langganan.
- Trial disimpan lokal selama tepat 90 hari. Registrasi/lead dan perubahan
  consent yang belum terkirim dicoba lagi saat tersedia koneksi.
- Akses berakhir menutup UI operasional dan laporan, termasuk navigasi langsung.
  Pembayaran, pemeriksaan/pemulihan akses, dan ekspor backup tetap tersedia.
- Menu profil menampilkan paket, status trial/aktif, tanggal akhir, serta tombol
  Upgrade paket atau Kelola langganan. Tidak ada banner langganan mengambang.
- Pengingat Rabu tampil di bagian atas dashboard dan dapat ditutup untuk hari itu.
  Pembayaran yang baru terverifikasi menyembunyikan pengingat hari tersebut.
  Saat akses tersisa paling lama 7 hari, dashboard menampilkan pengingat
  perpanjangan yang dapat ditutup sekali per tanggal lokal.
- Akses berbayar tersimpan offline sampai akhir periode. Gangguan billing tidak
  memperpendek periode lokal. Harga dan modul saat checkout ditetapkan server.
- Pemeriksaan status merekonsiliasi order tertunda langsung ke Midtrans jika
  webhook belum tiba. Status 404 untuk Snap yang belum memilih metode pembayaran
  diperlakukan sebagai menunggu. Gangguan API Midtrans tetap mengembalikan akses
  tersimpan dan informasi bahwa pemeriksaan pembayaran belum tersedia.
- Riwayat menampilkan sampai 50 order terakhir dan status aktivasinya.

Instalasi lama yang sudah mempunyai setup developer mempertahankan jalur
lisensi lama. Setup dari usaha self-service ditandai `subscription:`; perangkat
yang menghubungkan host tersebut tetap perlu memulihkan identitas langganannya.
Instalasi self-service baru memakai onboarding. Menghapus atau
memodifikasi localStorage dapat mengakali pembatasan lokal, sesuai risiko tahap
awal yang diterima dalam issue. Ini bukan sistem proteksi lisensi anti-tamper.

## Pemulihan dan keputusan sandbox

Pemulihan awal memakai kode acak rahasia 256-bit. Kode tampil hanya untuk sesi
Owner aktif di halaman Langganan; server hanya menyimpan hash. Mengganti identitas
langganan pada instalasi yang sudah memiliki Owner juga memerlukan sesi Owner.
Instalasi baru tetap dapat memulihkan sebelum membuat Owner lokal. Ekspor backup
memerlukan izin Pengaturan (`SETTINGS_ACCESS`), termasuk ketika akses habis.
Kasir dapat memakai **Ganti pengguna** agar Owner masuk. Identitas jaringan
berasal dari claim `sub` pada JWT Supabase Auth; token instalasi buatan Frayukti
tidak lagi digunakan. Endpoint pemulihan memiliki rate limit, dan setiap
pemulihan mencatat user Supabase tanpa menyimpan kode mentah.

Nama usaha/WhatsApp tidak digunakan sebagai bukti kepemilikan. Salin kode ke
tempat aman setelah pendaftaran tersinkron; perangkat baru mendapat paket dan
tanggal akhir yang sama, tanpa akun kasir atau data transaksi. Kehilangan kode
di semua instalasi memerlukan proses dukungan/verifikasi manual yang harus
ditetapkan sebelum produksi. Tidak ada pengiriman WhatsApp/email otomatis.

Keputusan implementasi untuk sandbox (perlu keputusan bisnis sebelum produksi):

- Pembayaran pertama langsung memulai satu bulan kalender berbayar.
- Perpanjangan paket/modul yang sama menambah satu bulan dari akhir akses
  berbayar yang masih aktif; jika habis, dimulai dari verifikasi pembayaran.
- Perubahan paket/modul dilakukan setelah akses berbayar lama habis, sehingga
  belum ada prorata, kredit, atau penggantian paket di tengah periode.
- Biaya Custom sekali Rp3.500.000 ditagihkan sampai pembayaran setup pertama
  berhasil. Perpanjangan berikutnya tidak mengulang biaya setup.
- Satu checkout belum selesai per usaha; pengulangan request mengembalikan order
  yang sama. Harga/entitlement order tersimpan dan tidak berubah oleh klien.
- Refund/chargeback setelah aktivasi diberi `review_required`, tanpa otomatis
  memperpanjang atau memperpendek periode. Penanganan refund/kompensasi final
  harus ditetapkan sebelum produksi.

## Kontrak endpoint

Semua endpoint aplikasi pada function `billing` membawa publishable key di
`apikey` dan access token user Supabase di `Authorization: Bearer <JWT>`.
Gateway memakai `verify_jwt=true`; `@supabase/server` mode `auth: 'user'`
memverifikasi JWT dan mengambil `sub`. Health, payment finish, dan webhook berada
di function `billing-public` karena Midtrans tidak mempunyai JWT Supabase.

| Endpoint | Akses | Fungsi |
| --- | --- | --- |
| `POST /v1/registrations` | JWT user Supabase + kode pemulihan pada body | Registrasi idempoten, tautkan user, sinkronisasi lead |
| `GET /v1/status` | JWT user Supabase | Rekonsiliasi order sendiri ke Midtrans, entitlement, riwayat |
| `GET/PATCH /v1/consent` | JWT user Supabase | Baca/update consent, jejak audit terpisah |
| `POST /v1/recovery` | JWT user Supabase + kode pemulihan | Tautkan user baru ke bisnis lama |
| `POST /v1/checkouts` | JWT user Supabase | Buat/lanjutkan order Snap dengan harga server |
| `billing-public: POST /v1/midtrans/notifications` | Signature + status API Midtrans | Aktivasi idempoten dan audit status |

Body registrasi/checkout memakai schema ketat; field transaksi bisnis ditolak.
Pada pengembangan lokal, lead tersimpan di database `leads`; identitas
langganan, token hash, order, entitlement dan audit webhook/pemulihan di
`billing`. Pada Supabase staging, pemisahan yang sama memakai schema privat
`leads_private` dan `billing_private` dalam satu project khusus billing. Tabel
transaksi POS tidak masuk project ini. Kegagalan penyimpanan lead setelah
identitas tersimpan dapat dicoba ulang tanpa membuat usaha kedua. User Supabase
dipetakan ke bisnis lewat `billing_private.business_users`; schema tetap tidak
dapat diakses langsung oleh role `anon` maupun `authenticated`.

## Operasional dan pengujian

```bash
bun run billing:check
bun run test:unit
bun run test:billing
bunx playwright test tests/e2e/onboarding-live.spec.ts --project=chromium
bun run build
```

Uji integrasi memerlukan dua database dari env dan membuat schema unik sementara;
schema uji dibuang setelah tes. Midtrans dimock pada uji integrasi agar dapat
memeriksa duplikasi/out-of-order webhook, nominal salah, fraud, refund, dan
pemulihan secara deterministik. Browser tests menguji viewport desktop/mobile,
bukan menjalankan APK native.

Smoke test berikut membuat **order sandbox belum dibayar** dengan identitas
sintetis melalui layanan billing dan API Midtrans sesungguhnya:

```bash
BILLING_SMOKE_URL=https://PROJECT_REF.supabase.co/functions/v1/billing \
BILLING_SMOKE_PUBLISHABLE_KEY=sb_publishable_... bun run billing:smoke
```

Hasil checkout lokal disimpan ke `.billing-postgres.local/snap-smoke.json`, tanpa
server key. Pengujian ini tidak menyelesaikan pembayaran atau mengaktifkan akses.

Untuk memeriksa satu order dari terminal backend tanpa sesi Supabase, tersedia
perintah operator berikut. Perintah ini tetap meminta status ke Midtrans dan
memvalidasi merchant/nominal; akses tidak dapat dipaksakan lewat argumen:

```bash
bun run billing:reconcile "FRY-<uuid-order>"
```

Jika proses mati/timeout setelah Snap membuat order tetapi sebelum URL checkout
tersimpan, pilih **Lanjutkan checkout**. Backend memeriksa status Midtrans dan,
jika belum ada status pembayaran, mengulang pembuatan Snap memakai order ID dan
nominal tersimpan yang sama. Row lock menyerialisasi retry lintas proses. Status
API yang gagal tidak menghapus order; coba lagi setelah koneksi pulih. Pembayaran
yang sudah ada direkonsiliasi tanpa membuat order ID lain. Perilaku ini mengikuti
[pembuatan ulang token Snap](https://docs.midtrans.com/docs/snap-advanced-feature).
Jangan mengaktifkan akses lewat redirect atau mengubah database agar
tampak sudah membayar. Untuk notifikasi gagal, gunakan fasilitas kirim ulang
notifikasi Midtrans setelah endpoint diperbaiki. Notifikasi sukses yang berulang
aman karena order dikunci dalam transaksi PostgreSQL dan memiliki `activated_at`.

Supabase Free hanya dipakai staging; sebelum production diperlukan project dan
kebijakan backup/SLA yang sesuai. Sebelum produksi: tetapkan kontak/identitas penyedia, tinjauan hukum dan PSE,
domain, pajak, kebijakan refund/perubahan paket, pemulihan kode hilang, kontrak
infrastruktur Jakarta, akun DB terpisah dengan hak minimum, backup terenkripsi
di Indonesia, uji restore, serta job retensi lead/billing. Naskah di
`src/onboarding/legal.ts` merupakan draf sandbox dan belum menggantikan review hukum.
