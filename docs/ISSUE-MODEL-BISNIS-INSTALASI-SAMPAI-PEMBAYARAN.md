DRAFT:
# Issue: Model Bisnis — Trial, Migrasi Backend, Pembayaran, dan Paket Bundling

Tanggal catatan: 2026-09-03

## Ringkasan

Saat menyebarkan brosur/iklan aplikasi ini, calon pelanggan tidak bisa dengan
mudah install → coba pakai dulu beberapa bulan → baru bayar. Setelah ditelusuri,
akar masalahnya bukan soal keamanan lisensi, tapi **tidak ada jalur self-serve
trial di build desktop/Android** (produk yang diiklankan lewat brosur).

Dokumen ini mencatat keputusan bisnis awal yang sudah diambil, plus daftar isu
yang masih terbuka untuk tiap keputusan tersebut. **Ini murni keputusan bisnis,
belum masuk ke desain teknis atau implementasi.**

## Status Saat Ini (Konteks Teknis Singkat)

- Build Tauri (desktop/Android) mewajibkan `SetupKeyDrawer` diisi license key
  sebelum modul apa pun bisa dipakai (`AuthGate.tsx`, `setupKeyService.ts`).
  Tidak ada tombol "Coba Gratis" yang terlihat — jalur masuk wizard setup cuma
  lewat gestur tersembunyi (tap logo 10x / Ctrl+Shift+?).
- License key saat ini statis: satu hash SHA-256 di-hardcode di client,
  dicocokkan secara lokal tanpa server, tanpa expiry, tanpa binding per mesin.
- Modul fitur (`enabledModules`) dipilih manual satu per satu lewat wizard
  checklist (`SETUP_MODULE_GROUPS`) — belum ada konsep "paket/bundle".
- Build web (Vercel) sudah punya trial bypass otomatis (`VITE_WEB_TRIAL_MODULE_BYPASS`),
  tapi ini bukan produk yang diiklankan (bukan installer/APK yang persistent).
- Arsitektur saat ini offline-first: Dexie/IndexedDB lokal + opsi self-host
  PostgreSQL via LAN ("Join Existing Host"). Tidak ada backend cloud terpusat,
  tidak ada payment gateway apa pun yang terintegrasi.

## Keputusan Bisnis yang Sudah Diambil

1. **Mode trial maksimal 3 bulan (90 hari)** untuk build desktop/Android, supaya
   calon pelanggan sempat merasakan siklus bulanan penuh (closing, laporan)
   sebelum diminta bayar.
2. **Kemungkinan migrasi database & backend ke Supabase**, supaya tidak perlu
   membangun backend custom dari nol untuk kebutuhan trial/lisensi/pembayaran.
3. **Pembayaran memakai Midtrans.**
4. **Ada tawaran paket bundling**, sebagai alternatif dari model pilih modul
   manual satu per satu, untuk mengakomodir pembeli yang maunya bayar lalu
   langsung "terima beres" tanpa harus paham daftar modul.

Keempat poin di atas **belum punya solusi/desain** untuk masalah turunannya.
Bagian berikut mendaftar isu yang muncul dari tiap keputusan, dengan beberapa
opsi yang bisa dipilih.

## Isu Terbuka & Opsi

### 1. Trial 3 Bulan

**Isu A — Mekanisme anti-abuse (aplikasi offline-first, tidak selalu online)**

- Opsi 1: Trial murni lokal (`trialStartedAt` disimpan di localStorage/Dexie).
  Paling simpel, tapi gampang direset dengan uninstall + hapus data lokal.
- Opsi 2: Trial lokal + validasi awal online sekali saat trial dimulai (butuh
  koneksi internet untuk generate trial token dari backend). Lebih sulit
  diakali, tapi menambah dependensi online di momen pertama install — dan
  baru bisa jalan setelah keputusan #2 (migrasi Supabase) selesai.
- Opsi 3: Trial lokal + fingerprint device (ID mesin/Android) disimpan supaya
  reinstall di device yang sama terdeteksi, tanpa perlu server penuh. Jalan
  tengah antara Opsi 1 dan 2.

**Isu B — Perilaku setelah 90 hari habis**

- Opsi 1: Hard lock total — aplikasi tidak bisa dipakai sama sekali sampai
  bayar. Tekanan konversi kuat, tapi risiko keluhan/kehilangan data akses.
- Opsi 2: Soft lock — data & laporan tetap bisa dilihat/diekspor, tapi tidak
  bisa input transaksi baru. Lebih ramah, tapi tekanan bayar lebih lemah.
- Opsi 3: Turun ke modul minimal (mis. cuma POS dasar tanpa akuntansi/laporan)
  sampai bayar. Bisnis tetap jalan, tapi fitur premium terkunci.

**Isu C — Pengumpulan kontak calon pelanggan saat trial dimulai**

- Opsi 1: Trial anonim, tanpa data kontak apa pun. Paling tanpa friksi, tapi
  tidak bisa follow-up manual (WA/telepon) ke calon pelanggan yang trial-nya
  hampir habis.
- Opsi 2: Wajib isi nomor WA/email saat mulai trial. Memungkinkan follow-up
  aktif dan tracking konversi, tapi menambah friksi di awal.
- Opsi 3: Opsional dengan insentif (mis. "isi nomor WA, dapat +7 hari trial").
  Kompromi antara friksi dan data leads.

**Isu D — Jadwal reminder selama 90 hari**

- Opsi 1: Reminder in-app saja (banner countdown), makin sering makin dekat
  H-0 (mis. mulai muncul di H-14).
- Opsi 2: In-app + follow-up manual terjadwal di milestone tertentu (H-30,
  H-60, H-80) — butuh Isu C (Opsi 2/3) supaya ada kontak yang bisa dihubungi.

### 2. Migrasi ke Supabase

**Isu A — Cakupan migrasi**

- Opsi 1: Migrasi penuh — Supabase (Auth, Postgres, Realtime) menggantikan
  seluruhnya, termasuk fitur self-host Postgres yang sudah ada.
- Opsi 2: Hybrid — Dexie lokal tetap jadi sumber data utama (mempertahankan
  nilai jual offline-first), Supabase hanya jadi lapisan cloud khusus untuk
  trial/lisensi/pembayaran/webhook Midtrans.
- Opsi 3: Supabase hanya untuk layanan lisensi & pembayaran (servis terpisah,
  kecil), fitur sync Postgres self-host yang sudah ada dibiarkan apa adanya
  untuk pelanggan yang butuh sync LAN tanpa internet.

**Isu B — Nasib fitur self-host PostgreSQL ("Join Existing Host") yang sudah ada**

- Opsi 1: Dipertahankan sebagai pilihan (mis. untuk pelanggan enterprise/toko
  yang tidak mau data di cloud), berdampingan dengan Supabase.
- Opsi 2: Dipensiunkan bertahap, semua pelanggan baru diarahkan ke Supabase.

**Isu C — Kekhawatiran data residency (khusus data koperasi/keuangan)**

- Opsi 1: Migrasi ke Supabase berlaku untuk semua pelanggan tanpa kecuali.
- Opsi 2: Migrasi ke Supabase opsional per pelanggan — pelanggan yang punya
  concern data sensitif (koperasi, dsb.) boleh tetap pakai self-host.

### 3. Pembayaran Midtrans

**Isu A — Model pembayaran**

- Opsi 1: Sekali bayar per paket (beli putus), pakai selamanya. Simpel dari
  sisi psikologi pembeli & integrasi Midtrans (Snap one-time), tapi kembali ke
  masalah lama: tidak ada recurring revenue, dan tidak ada cara alami untuk
  memaksa upgrade/renewal di masa depan.
- Opsi 2: Langganan berkala (bulanan/tahunan) lewat fitur recurring Midtrans.
  Recurring revenue lebih sehat, tapi menambah kompleksitas (dunning saat
  pembayaran gagal, perlu cek status langganan berkala → butuh online check-in
  yang tadi juga muncul di Isu Trial A).
- Opsi 3: Hybrid — biaya aktivasi sekali di awal + biaya maintenance/dukungan
  tahunan. Pola yang familiar untuk pembeli software SMB Indonesia.

**Isu B — Titik pemicu pembayaran**

- Opsi 1: Checkout Midtrans Snap terintegrasi langsung di dalam aplikasi
  (paling mulus, tapi butuh backend untuk membuat transaksi & terima webhook).
- Opsi 2: Link pembayaran dikirim manual (mis. via WA) oleh tim, lisensi
  diaktifkan manual setelah bayar. Effort awal lebih kecil, tapi tidak
  otomatis/scalable.

**Isu C — Kebutuhan endpoint webhook**

Midtrans butuh endpoint server untuk notifikasi status pembayaran. Ini
membuat keputusan #3 **bergantung** pada keputusan #2 — webhook ini realistis
diletakkan sebagai Supabase Edge Function. Perlu dipastikan opsi migrasi
Supabase yang dipilih (Isu A di atas) mencakup kebutuhan ini.

### 4. Paket Bundling

**Isu A — Struktur tier paket**

- Opsi 1: Beberapa paket generik tetap (mis. Basic / Pro / Enterprise). Paling
  gampang dipasarkan & dibuat UI-nya, tapi kurang fleksibel untuk kasus khusus.
- Opsi 2: Bundle per jenis usaha (Retail, F&B, Koperasi Simpan Pinjam, Grosir,
  Manufaktur — selaras dengan arah aplikasi jangka panjang di
  `ide-arah-aplikasi-kedepannya.md`). Lebih relevan secara marketing, tapi
  jumlah paket yang perlu dirawat lebih banyak.
- Opsi 3: Kombinasi — beberapa paket generik untuk 90% pembeli, plus opsi
  "Custom" (pilih modul manual seperti sekarang) yang disembunyikan di balik
  tombol "Lanjutan" untuk kasus khusus.

**Isu B — Model harga**

- Opsi 1: Harga flat per paket, berapa pun jumlah kasir/outlet. Simpel, tapi
  berisiko under-charge pelanggan besar multi-outlet.
- Opsi 2: Harga bertingkat berdasarkan jumlah outlet/device/user. Lebih adil
  untuk skala besar, tapi lebih rumit dijelaskan & ditagih.

**Isu C — Pemetaan bundle ke entitlement modul yang sudah ada**

- Opsi 1: Bundle = daftar preset kode modul (`enabledModules`) yang sudah ada
  sekarang, tanpa konsep baru. Perubahan data minimal.
- Opsi 2: Bundle jadi konsep baru (`packageId`/`plan`) di skema lisensi,
  terpisah dari daftar modul mentah. Lebih fleksibel untuk upsell/downsell ke
  depan, tapi perubahan skema lebih besar.

## Ketergantungan Antar Keputusan

- Isu Trial-A (Opsi 2) dan Isu Pembayaran-A (Opsi 2) sama-sama butuh backend
  online — keduanya baru masuk akal setelah cakupan migrasi Supabase (Isu
  Migrasi-A) diputuskan.
- Isu Pembayaran-C (webhook) baru bisa didesain setelah cakupan migrasi
  Supabase jelas.

## Belum Dibahas / Di Luar Cakupan Dokumen Ini

- Desain skema database, arsitektur teknis detail, dan kode implementasi.
- Harga nominal tiap paket/bundle.
- Copywriting reminder & materi follow-up.

## Langkah Selanjutnya

1. Pilih satu opsi untuk tiap isu di atas.
2. Setelah semua opsi terpilih, lanjut ke desain teknis (arsitektur trial,
   skema lisensi, integrasi Supabase, dan integrasi Midtrans) di sesi terpisah.
