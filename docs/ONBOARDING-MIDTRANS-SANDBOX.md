# Onboarding dan Midtrans Sandbox

Implementasi utama memakai `src/onboarding/` dan layanan terpisah
`services/billing/`. Preview di `/onboarding-preview.html` tetap merupakan
simulasi; onboarding sesungguhnya dibuka di `/` pada instalasi baru.

## Menjalankan

```bash
bun install
cp .env.example .env
cp services/billing/.env.example services/billing/.env
bun run billing:db
bun run billing:dev
# Terminal lain
bun run dev
```

Jangan menimpa `.env` yang sudah berisi konfigurasi. Pada workspace pengembangan
ini kedua env sudah disiapkan, termasuk kredensial merchant sandbox yang diberikan.

- Frontend: `http://localhost:1420`.
- Billing: `http://localhost:8787`; pemeriksaan database: `GET /health`.
- PostgreSQL billing: port `5544`, database `billing` dan `leads`, terpisah dari
  database transaksi aplikasi. Compose hanya mengikat port ke loopback.
- `bun run billing:start` menjalankan Fastify dengan Node 22.18+ (atau Node
  yang mendukung type stripping). Bun dipakai sebagai package manager.

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
VITE_BILLING_API_URL=http://localhost:8787
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

URL publik belum tersedia di lingkungan ini. Pembuatan checkout berhasil, tetapi
notifikasi Midtrans tidak dapat menjangkau `localhost` langsung. Untuk pengujian
pembayaran dan aktivasi otomatis:

1. Jalankan billing pada port 8787 dan sediakan tunnel HTTPS ke port tersebut
   atau deploy layanan sandbox ke host yang dapat diakses melalui HTTPS.
2. Isi env backend, misalnya:

   ```env
   MIDTRANS_NOTIFICATION_URL=https://billing-sandbox.example.com/v1/midtrans/notifications
   MIDTRANS_FINISH_URL=https://billing-sandbox.example.com/payment/finish
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

Untuk Android dev melalui USB:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:8787 tcp:8787
```

Frontend dapat tetap memakai `http://localhost:8787` pada perangkat yang mendapat
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
- Pengingat Rabu sekali per tanggal lokal setelah ditutup. Banner Langganan
  menyediakan upgrade/perpanjangan saat akses masih aktif.
- Akses berbayar tersimpan offline sampai akhir periode. Gangguan billing tidak
  memperpendek periode lokal. Harga dan modul saat checkout ditetapkan server.
- Riwayat menampilkan sampai 50 order terakhir dan status aktivasinya.

Instalasi lama yang sudah mempunyai setup developer mempertahankan jalur
lisensi lama. Setup dari usaha self-service ditandai `subscription:`; perangkat
yang menghubungkan host tersebut tetap perlu memulihkan identitas langganannya.
Instalasi self-service baru memakai onboarding. Menghapus atau
memodifikasi localStorage dapat mengakali pembatasan lokal, sesuai risiko tahap
awal yang diterima dalam issue. Ini bukan sistem proteksi lisensi anti-tamper.

## Pemulihan dan keputusan sandbox

Pemulihan awal memakai kode acak rahasia 256-bit. Kode tampil atas permintaan
pemilik di halaman Langganan; server hanya menyimpan hash. Token API instalasi
juga disimpan sebagai hash di server. Endpoint pemulihan memiliki rate limit,
dan setiap pemulihan dicatat tanpa menyimpan kode mentah.

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

| Endpoint | Akses | Fungsi |
| --- | --- | --- |
| `POST /v1/registrations` | Secret instalasi pada body registrasi | Registrasi idempoten dan sinkronisasi lead |
| `GET /v1/status` | Bearer token instalasi | Identitas, entitlement, riwayat |
| `GET/PATCH /v1/consent` | Bearer token instalasi | Baca/update consent, jejak audit terpisah |
| `POST /v1/recovery` | Kode pemulihan rahasia | Hubungkan token instalasi baru |
| `POST /v1/checkouts` | Bearer token instalasi | Buat/lanjutkan order Snap dengan harga server |
| `POST /v1/midtrans/notifications` | Signature + status API Midtrans | Aktivasi idempoten dan audit status |

Body registrasi/checkout memakai schema ketat; field transaksi bisnis ditolak.
Lead tersimpan di database `leads`; identitas langganan, token hash, order,
entitlement dan audit webhook/pemulihan di `billing`. Kegagalan database lead
setelah identitas tersimpan dapat dicoba ulang tanpa membuat usaha kedua.

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
bun run billing:smoke
```

Hasil checkout lokal disimpan ke `.billing-postgres.local/snap-smoke.json`, tanpa
server key. Pengujian ini tidak menyelesaikan pembayaran atau mengaktifkan akses.

Jika proses mati/timeout setelah Snap membuat order tetapi sebelum URL checkout
tersimpan, order `creating` sengaja tidak dibuat ulang dengan ID berbeda.
Periksa order di dashboard, status API, dan log notifikasi sebelum tindakan
manual. Jangan mengaktifkan akses lewat redirect atau mengubah database agar
tampak sudah membayar. Untuk notifikasi gagal, gunakan fasilitas kirim ulang
notifikasi Midtrans setelah endpoint diperbaiki. Notifikasi sukses yang berulang
aman karena order dikunci dalam transaksi PostgreSQL dan memiliki `activated_at`.

Sebelum produksi: tetapkan kontak/identitas penyedia, tinjauan hukum dan PSE,
domain, pajak, kebijakan refund/perubahan paket, pemulihan kode hilang, kontrak
infrastruktur Jakarta, akun DB terpisah dengan hak minimum, backup terenkripsi
di Indonesia, uji restore, serta job retensi lead/billing. Naskah di
`src/onboarding/legal.ts` merupakan draf sandbox dan belum menggantikan review hukum.
