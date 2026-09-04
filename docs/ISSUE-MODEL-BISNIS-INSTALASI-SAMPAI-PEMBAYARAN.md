DRAFT:
# Issue: Model Bisnis — Registrasi, Trial, Paket, dan Pembayaran

Tanggal catatan awal: 2026-09-03
Tanggal revisi: 2026-09-04

## Ringkasan

Produk desktop/Android perlu mempunyai jalur mandiri yang jelas: calon
pelanggan dapat mendaftar, memilih paket yang relevan, melakukan setup awal,
menggunakan aplikasi dalam mode trial, lalu meng-upgrade ketika siap membayar.

Untuk tahap awal, aplikasi **tetap menggunakan arsitektur database dan backend
yang ada saat ini**: offline-first dengan Dexie/IndexedDB lokal serta opsi
self-host PostgreSQL/LAN. Data inti tidak dimigrasikan ke Supabase dan tidak
akan dibuat layanan lisensi yang kompleks.

Pengecualian yang disetujui adalah layanan kecil khusus pembayaran Midtrans.
Layanan ini hanya membuat transaksi pembayaran, menerima webhook Midtrans, dan
mengirim hasil aktivasi akses ke aplikasi; layanan ini bukan backend data
transaksi atau migrasi arsitektur utama.

Distribusi Android pada tahap awal dilakukan di luar Google Play, melalui APK
langsung atau kanal distribusi privat yang ditetapkan kemudian. Keputusan ini
memungkinkan checkout Midtrans pada Android dibuka di browser eksternal, tanpa
WebView atau alur pembayaran di dalam aplikasi.

Konsekuensinya, penguncian trial dan status akses dijalankan dari dalam aplikasi
(lokal). Mekanisme ini dapat dibypass oleh pengguna yang sengaja mengakali data
lokal atau aplikasi. Risiko tersebut diterima untuk tahap awal agar alur bisnis
dapat diluncurkan lebih cepat.

Dokumen ini memuat keputusan bisnis dan alur pelanggan yang menjadi acuan.
Rancangan teknis, skema data, dan implementasi tetap dibahas terpisah.

## Keputusan Bisnis

1. Pengguna harus melakukan registrasi sebelum memulai trial. Registrasi juga
   dipakai untuk mengumpulkan data calon pelanggan (*lead*).
2. Saat onboarding, pengguna memilih paket usaha, bukan langsung memilih
   modul satu per satu. Pilihan awalnya adalah POS Ritel/Restoran, Koperasi,
   Produksi, Perdagangan Umum, dan Custom.
3. Pengguna dapat melakukan setup akuntansi, atau melewatinya dan memakai
   konfigurasi akuntansi bawaan yang sudah disiapkan sistem.
4. Syarat dan ketentuan harus ditampilkan dan disetujui; langkah ini tidak
   boleh dilewati.
5. Trial berlaku paling lama 90 hari (3 bulan). Selama trial, pengguna selalu
   dapat meng-upgrade. Ketika masa trial habis, transaksi, perubahan data, dan
   laporan operasional diblokir sampai pembayaran dilakukan dan akses berbayar
   diaktifkan. Layar blokir tetap menyediakan ekspor backup data.
6. Aplikasi menampilkan pengingat setiap hari Rabu mengenai status trial atau
   langganan serta ajakan untuk meng-upgrade bila diperlukan.
7. Model awal adalah langganan bulanan dan pembayaran dilakukan melalui
   checkout Midtrans. Pada desktop checkout dapat dibuka dari aplikasi;
   pada Android checkout dibuka di browser eksternal. Produk beli putus akan
   dibuat sebagai penawaran yang terpisah pada tahap berikutnya.
8. Validasi akses dibuat ringan dan berjalan di sisi aplikasi. Tidak ada
   target anti-abuse tingkat lanjut pada tahap awal.

## Alur Registrasi sampai Pembayaran

### 1. Registrasi Pengguna dan Pengambilan Lead

Sebelum memakai aplikasi, calon pelanggan mengisi registrasi singkat. Data ini
berfungsi sebagai identitas pengguna dan sumber *lead* untuk tim penjualan.

Data registrasi berikut wajib diisi:

- nama pemilik/pengguna;
- nama usaha;
- nomor WhatsApp; dan
- jenis usaha.

Email dan lokasi usaha bersifat opsional pada tahap awal.

Tujuannya bukan membuat proses masuk serumit sistem enterprise, melainkan
memastikan tim dapat mengenali dan menindaklanjuti pengguna yang sedang trial.
Persetujuan terhadap Syarat Layanan dan Kebijakan Privasi wajib untuk memakai
trial. Persetujuan follow-up atau pemasaran melalui WhatsApp/email harus
ditampilkan terpisah, tidak dicentang secara bawaan, dan tidak menjadi syarat
trial.

Setelah persetujuan yang relevan diberikan, data lead dikirim saat koneksi
tersedia ke layanan lead terpisah yang dipilih pada dokumen ini. Bila perangkat
sementara offline, pengiriman dapat diantrekan sampai koneksi tersedia. Data
transaksi aplikasi tetap berada pada penyimpanan yang ada saat ini.

### 2. Pilih Paket Usaha

Setelah registrasi, pengguna memilih paket yang paling sesuai dengan usahanya.
Paket menjadi cara utama untuk menentukan fitur/modul yang aktif.

| Paket awal | Sasaran |
| --- | --- |
| POS Ritel/Restoran | Toko ritel dan usaha makanan/minuman yang membutuhkan kasir/POS. |
| Koperasi | Koperasi, termasuk kebutuhan simpan-pinjam yang relevan. |
| Produksi | Usaha yang mempunyai proses produksi dan kebutuhan pencatatan terkait. |
| Perdagangan Umum | Usaha dagang umum di luar fokus paket di atas. |
| Custom | Pengguna tingkat lanjut yang perlu memilih modul sendiri. |

Opsi **Custom** sengaja diposisikan sebagai pilihan lanjutan agar mayoritas
pengguna dapat langsung memilih paket tanpa perlu memahami seluruh daftar
modul. Pemetaan setiap paket ke modul yang aktif memakai `enabledModules` yang
sudah ada pada tahap awal.

Harga bersifat flat per paket dan belum membedakan jumlah outlet, perangkat,
atau pengguna dalam satu badan usaha. Harga belum termasuk pajak yang wajib
dipungut. Harga peluncuran berlaku selama 12 bulan pertama pelanggan aktif;
perubahan harga setelahnya wajib diberitahukan paling lambat 30 hari sebelumnya.

### 3. Setup Akuntansi

Pengguna kemudian ditawarkan setup akuntansi. Mereka dapat:

- melakukan konfigurasi akun dan pengaturan akuntansi sejak awal; atau
- melewati langkah ini dan memakai konfigurasi akuntansi default dari sistem.

Opsi lewati harus jelas dan aman dipakai, sehingga pengguna yang hanya ingin
segera bertransaksi tidak tertahan oleh konfigurasi akuntansi.

### 4. Syarat dan Ketentuan

Sebelum trial diaktifkan, pengguna wajib membaca dan menyetujui Syarat Layanan
serta menerima pemberitahuan Kebijakan Privasi. Langkah ini tidak boleh dapat
dilewati. Sistem perlu mencatat versi, hash, dan waktu persetujuan dokumen yang
berlaku.

Persetujuan follow-up atau pemasaran melalui WhatsApp/email ditampilkan
terpisah, bersifat opsional, tidak dicentang secara bawaan, serta dapat ditarik
kembali. Pemrosesan data registrasi yang diperlukan untuk menyediakan trial
tetap dijelaskan di Kebijakan Privasi sebagai pemrosesan layanan, bukan sebagai
persetujuan pemasaran.

### 5. Mode Trial dan Upgrade

Setelah syarat dan ketentuan disetujui, trial dimulai. Pengguna dapat memakai
paket yang dipilih selama maksimum 90 hari dan dapat meng-upgrade kapan saja.

Status trial harus mudah terlihat di aplikasi, misalnya melalui banner atau
halaman status yang memuat sisa waktu trial dan tombol upgrade.

Ketika 90 hari berakhir, aplikasi memblokir transaksi baru, perubahan data, dan
laporan operasional sampai pengguna melakukan pembayaran dan akses berbayar
diaktifkan. Pengguna perlu dapat menjangkau halaman pembayaran dan ekspor
backup data dari layar blokir tersebut.

Untuk tahap awal, pencatatan mulai trial dan pengecekan masa akses cukup
dilakukan secara lokal di aplikasi. Penghapusan data lokal, instal ulang, atau
modifikasi aplikasi berpotensi mereset/mengelabui trial; hal ini merupakan
risiko yang secara sadar diterima.

### 6. Pengingat Hari Rabu

Setiap awal minggu, pada hari Rabu, aplikasi menampilkan pengingat mengenai
status trial atau langganan bulanan pengguna. Pengingat dapat memuat sisa hari
trial, tanggal/langganan pembayaran berikutnya, dan ajakan untuk meng-upgrade
atau memperpanjang langganan.

Pengingat ini bersifat in-app pada tahap awal. Follow-up melalui WhatsApp atau
email dapat dilakukan oleh tim apabila data registrasi sudah tersedia melalui
mekanisme pengumpulan lead yang dipilih.

### 7. Pembayaran Midtrans

Ketika pengguna memilih upgrade atau memperpanjang langganan, checkout Midtrans
dibuka sesuai platform. Desktop dapat menampilkan checkout dari aplikasi,
sedangkan Android membuka URL checkout di browser eksternal sistem, bukan
WebView atau halaman checkout in-app. Pembayaran yang terverifikasi menjadi
dasar untuk mengaktifkan atau memperpanjang akses paket yang dipilih.

Integrasi ini menggunakan layanan kecil khusus pembayaran untuk membuat
transaksi Midtrans, menerima dan memverifikasi webhook, lalu mengirim hasilnya
ke aplikasi. Server Key Midtrans tidak boleh disimpan dalam aplikasi klien.
Layanan pembayaran ini tidak mengelola data transaksi bisnis pengguna dan tidak
mengubah arsitektur offline-first yang ada.

Harga paket dan masa akses harus ditentukan kembali oleh layanan pembayaran,
bukan dipercaya dari aplikasi klien. Aktivasi hanya terjadi setelah webhook
Midtrans diverifikasi, diproses idempoten berdasarkan `order_id`, dan memenuhi
status transaksi berhasil yang disyaratkan Midtrans.

Setelah pembayaran Android selesai, browser dapat mengarahkan pengguna kembali
ke aplikasi melalui *app link*. Kembalinya pengguna bukan syarat aktivasi:
ketika aplikasi aktif kembali atau dibuka lagi, aplikasi membaca status akses
terbaru dari layanan billing. Status webhook tervalidasi tetap menjadi sumber
kebenaran.

## Batasan Tahap Awal

- Data transaksi dan arsitektur database tetap menggunakan kondisi saat ini:
  Dexie/IndexedDB lokal dan opsi self-host PostgreSQL/LAN.
- Tidak ada migrasi Supabase untuk data inti, autentikasi, atau sinkronisasi
  aplikasi pada tahap ini. Layanan kecil Midtrans adalah pengecualian khusus
  untuk pembayaran otomatis.
- Tidak ada tuntutan *device binding*, validasi server periodik, maupun
  perlindungan lisensi yang sulit dibypass.
- Pengumpulan lead tidak boleh mengubah sifat offline-first dari data transaksi
  pelanggan.
- Distribusi Android tahap awal tidak melalui Google Play. Kanal APK langsung
  atau privat wajib memiliki paket rilis yang ditandatangani, sumber unduhan
  resmi melalui HTTPS, mekanisme pembaruan yang jelas, dan panduan instalasi.

## Keputusan Operasional yang Sudah Ditetapkan

| Area | Keputusan |
| --- | --- |
| Registrasi & lead | Nama pengguna, nama usaha, nomor WhatsApp, dan jenis usaha wajib diisi. Lead dikirim saat koneksi tersedia ke penyimpanan terpisah. Persetujuan marketing/follow-up bersifat opsional. |
| Trial berakhir | Blokir transaksi, perubahan data, dan laporan operasional sampai pembayaran berhasil; ekspor backup data tetap tersedia. |
| Model komersial awal | Langganan bulanan dengan pembayaran manual tiap periode. Produk beli putus menjadi penawaran terpisah setelah langganan stabil. |
| Harga skala usaha | Harga flat per paket untuk satu badan usaha; belum ada pembeda outlet, perangkat, atau pengguna. |
| Pembayaran | Checkout Midtrans melalui layanan pembayaran kecil khusus token dan webhook tervalidasi. Desktop dapat membuka checkout dari aplikasi; Android membukanya di browser eksternal. |
| Distribusi Android | Di luar Google Play, melalui APK langsung atau kanal privat. |
| T&C & privasi | Syarat Layanan dan pemberitahuan Kebijakan Privasi wajib diterima. Consent marketing terpisah dan opsional. |
| Data layanan | Layanan lead dan pembayaran hanya menyimpan data lead dan metadata billing; tidak pernah menyimpan data transaksi bisnis pelanggan. |

## Keputusan Paket, Harga, dan Modul

Semua paket berikut selalu mengaktifkan `ROLE_PERMISSION`, `CASH_FLOW`, dan
`CHART_OF_ACCOUNTS`. `GENERAL_LEDGER` tidak termasuk paket mana pun sampai
readiness produksi yang terpisah selesai. `FIXED_ASSET`, HRIS lengkap, dan
Marketplace juga belum boleh dijual sebagai entitlement paket.

| Paket | Harga/bulan | Modul tambahan yang aktif |
| --- | ---: | --- |
| POS Ritel & Resto | Rp149.000 | `POS_TRANSACTION`, `POS_RESTAURANT`, `PRODUCT`, `STOCK_OPNAME`, `CONTACT`, `WAREHOUSE`, `PAYMENT_METHOD`, `UNIT`, `REPORT_POS_SALES`, `REPORT_DEPOSIT`, `REPORT_TRANSACTION_DETAIL`, `REPORT_STOCK_CARD`, `REPORT_INCOME`, `REPORT_EXPENSE`, `REPORT_CASH_FLOW`, `REPORT_PROFIT` |
| Perdagangan Umum | Rp299.000 | Semua modul POS Ritel & Resto, ditambah `SALES_QUOTATION`, `SALES_ORDER`, `SALES_DELIVERY`, `SALES_INVOICE`, `SALES_RETURN`, `PURCHASE_REQUEST`, `PURCHASE_RFQ`, `PURCHASE_ORDER`, `PURCHASE_RECEIPT`, `PURCHASE_INVOICE`, `PURCHASE_RETURN`, `RECEIVABLES`, `PAYABLES`, `TAX`, `REPORT_PURCHASE`, dan `REPORT_AGING` |
| Produksi | Rp449.000 | Semua modul Perdagangan Umum, ditambah `PRODUCTION` |
| Koperasi | Rp699.000 | `KOPERASI_ANGGOTA`, `KOPERASI_SIMPANAN_POKOK`, `KOPERASI_SIMPANAN_WAJIB`, `KOPERASI_SIMPANAN_SUKARELA`, `KOPERASI_PINJAMAN`, `KOPERASI_ANGSURAN`, `KOPERASI_PENAGIHAN`, `KOPERASI_KAS_PETUGAS`, `KOPERASI_SHU`, `KOPERASI_REPORT_CASH`, `KOPERASI_REPORT_DAILY_TARGET`, `KOPERASI_REPORT_DAILY_FIELD_CASH`, `KOPERASI_REPORT_DAILY_STORTING`, `KOPERASI_REPORT_DAILY_DROP`, `KOPERASI_REPORT_WEEKLY_DROP`, `KOPERASI_REPORT_RESORT_DEVELOPMENT`, `KOPERASI_REPORT_IPTW`, `KOPERASI_REPORT_MEMBER_REGISTER`, `KOPERASI_REPORT_INSTALLMENT_BOOK`, `KOPERASI_REPORT_CASH_FLOW`, `EMPLOYEE`, `AREA`, dan `REPORT_CASH_FLOW` |
| Custom | Rp999.000 | Hanya gabungan modul yang sudah dapat dijual dari katalog empat paket di atas, dicatat secara eksplisit pada penawaran dan entitlement pelanggan. Bukan pengembangan fitur baru. Biaya setup konfigurasi satu kali Rp3.500.000. |

Sebelum paket diterapkan, ubah aturan normalisasi setup agar tidak otomatis
menambahkan `GENERAL_LEDGER` untuk paket yang mengandung `CASH_FLOW` atau modul
bisnis lain. Jika tidak diubah, entitlement produk di atas tidak dapat
diterapkan secara benar.

## Keputusan Produk Beli Putus

Produk beli putus belum dirilis bersama versi langganan pertama. Produk ini
baru boleh ditawarkan setelah alur pembayaran, aktivasi, dukungan, dan backup
sudah stabil minimal enam bulan.

Bentuk produknya adalah **Lisensi Perpetual per major version**, bukan lisensi
dengan pembaruan seumur hidup:

- Harga satu kali sebesar 18 kali harga langganan bulanan paket, dibulatkan
  menjadi Rp2.700.000 (POS), Rp5.400.000 (Perdagangan Umum), Rp8.100.000
  (Produksi), Rp12.600.000 (Koperasi), dan mulai Rp18.000.000 (Custom).
- Mencakup modul paket pada tanggal pembelian, pembaruan, serta dukungan standar
  selama 12 bulan.
- Setelah 12 bulan, aplikasi pada versi terakhir tetap dapat dipakai. Pembaruan
  dan dukungan dilanjutkan melalui maintenance tahunan sebesar 25% harga lisensi.
- Major version baru, fitur baru, integrasi pihak ketiga baru, migrasi, dan
  layanan implementasi tidak otomatis termasuk.
- Lisensi tetap berlaku bagi satu badan usaha dan tidak membatasi outlet,
  perangkat, atau pengguna pada tahap awal.

## Keputusan Syarat Layanan dan Kebijakan Privasi

Sebelum dipublikasikan, naskah final wajib ditinjau pengacara Indonesia yang
memahami perlindungan data pribadi, perlindungan konsumen, kontrak perangkat
lunak, perpajakan, dan pembayaran. Dokumen publik dipisah menjadi **Syarat
Layanan** dan **Kebijakan Privasi**.

Syarat Layanan minimal harus menetapkan identitas dan kontak penyedia, ruang
lingkup lisensi, trial 90 hari, harga, pembayaran manual bulanan, aturan
upgrade/downgrade, kebijakan pembayaran ganda atau kegagalan layanan, batas
dukungan, tanggung jawab backup data lokal, serta hak ekspor data pada layar
blokir. Pembayaran yang tercatat berhasil hanya yang diverifikasi dari Midtrans.

Kebijakan Privasi minimal harus menetapkan data lead yang diproses, tujuan dan
dasar pemrosesan, penyedia infrastruktur dan Midtrans sebagai penerima yang
relevan, masa simpan lead 12 bulan sejak aktivitas terakhir, hak akses/koreksi/
penghapusan/penarikan consent, serta prosedur penanganan insiden. Metadata
billing dan bukti pembayaran yang menjadi dasar pembukuan disimpan selama 10
tahun di Indonesia. Persetujuan marketing dipisahkan dari pemrosesan yang
diperlukan untuk menyediakan layanan.

Pendaftaran PSE Lingkup Privat melalui OSS harus selesai sebelum peluncuran.
Kebijakan dan prosedur insiden juga harus memenuhi kewajiban pemberitahuan
kegagalan pelindungan data pribadi yang berlaku.

Referensi kepatuhan awal:

- [UU Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi](https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/undangundang%2Bnomor%2B27%2Btahun%2B2022)
- [Pendaftaran PSE Lingkup Privat Komdigi](https://pse.komdigi.go.id/home)
- [UU KUP konsolidasi dari Direktorat Jenderal Pajak](https://www.pajak.go.id/sites/default/files/2021-11/SDSN%20UU%20KUP%20stdtd%20UU%20HPP.pdf)

## Keputusan Layanan Lead dan Pembayaran

Layanan yang dipilih adalah **Dewaweb Cloud VPS fully managed di pusat data
Jakarta**, menjalankan aplikasi kecil Node/Fastify dan PostgreSQL. Sebelum
provisioning, pastikan kontrak pemrosesan data dengan penyedia, lokasi backup di
Indonesia, serta akses operasional yang dibatasi dan tercatat.

Layanan ini memakai dua database PostgreSQL terpisah:

- `leads`: data registrasi, status follow-up, consent marketing, versi
  kebijakan, dan waktu persetujuan;
- `billing`: `order_id`, paket, nominal, status Midtrans, masa akses, jejak
  webhook, dan hash token aktivasi.

Endpoint publik dibatasi pada pengiriman lead, pembuatan checkout, pembacaan
status akses, dan webhook Midtrans. Layanan tidak boleh menerima atau menyimpan
data POS, stok, pelanggan, supplier, dokumen penjualan/pembelian, keuangan,
atau data transaksi bisnis lain dari aplikasi. Server Key Midtrans disimpan
sebagai secret di server, bukan dalam aplikasi klien. Backup harus terenkripsi,
disimpan di Indonesia, dan diuji pemulihannya secara berkala.

Referensi teknis:

- [Dewaweb Cloud VPS](https://www.dewaweb.com/cloud-vps)
- [Panduan HTTP(S) webhook Midtrans](https://docs.midtrans.com/docs/https-notification-webhooks)

## Di Luar Cakupan Dokumen Ini

Rujukan untuk menurunkan empat area berikut menjadi rancangan implementasi ada
di [Referensi Implementasi Onboarding, Trial, Akses, dan Pembayaran](REFERENSI-IMPLEMENTASI-ONBOARDING-TRIAL-AKSES-PEMBAYARAN.md).

- Desain UI/UX wizard onboarding.
- Skema data dan kode untuk status trial, paket, persetujuan syarat, dan akses.
- Detail implementasi Midtrans, termasuk token checkout, webhook, dan
  otomatisasi aktivasi.
- Copywriting reminder dan materi follow-up.

## Langkah Selanjutnya

1. Mengubah normalisasi setup agar paket tidak otomatis mengaktifkan
   `GENERAL_LEDGER`, lalu menambahkan entitlement paket di aplikasi.
2. Menyusun desain teknis layanan lead dan billing sesuai database, endpoint,
   keamanan secret, backup, dan webhook yang telah ditetapkan.
3. Menyusun naskah Syarat Layanan dan Kebijakan Privasi untuk peninjauan hukum,
   serta menyelesaikan pendaftaran PSE Lingkup Privat sebelum peluncuran.
4. Merancang wizard onboarding, layar blokir dengan ekspor backup, dan checkout
   Midtrans sesuai keputusan tersebut.
