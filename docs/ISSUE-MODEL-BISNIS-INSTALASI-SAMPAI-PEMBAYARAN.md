DRAFT:
# Issue: Model Bisnis — Registrasi, Trial, Paket, dan Pembayaran

Tanggal catatan awal: 2026-09-03
Tanggal revisi: 2026-09-08

## Ringkasan

Produk desktop/Android perlu mempunyai jalur mandiri yang jelas: calon
pelanggan dapat mendaftar, memilih paket yang relevan, melakukan setup awal,
menggunakan aplikasi dalam mode trial, lalu meng-upgrade ketika siap membayar.

**Desktop dan Android mengikuti alur bisnis yang sama dari registrasi sampai
pembayaran dan aktivasi akses.** Seluruh tahapan dan aturan pada dokumen ini
berlaku untuk kedua platform. Perbedaannya ada pada tampilan, cara berinteraksi,
navigasi, pembukaan checkout, dan cara melanjutkan aplikasi setelah pembayaran.

Untuk tahap awal, aplikasi **tetap menggunakan arsitektur database dan backend
yang ada saat ini**: offline-first dengan Dexie/IndexedDB lokal serta opsi
self-host PostgreSQL/LAN. Data inti tidak dimigrasikan ke Supabase dan tidak
akan dibuat layanan lisensi yang kompleks.

Pengecualian yang disetujui adalah layanan kecil lead dan billing, termasuk
identitas pemilik/usaha serta verifikasi kepemilikan untuk pemulihan langganan.
Layanan ini membuat transaksi pembayaran Midtrans, menerima webhook, dan
menyediakan hasil aktivasi akses ke aplikasi; layanan ini bukan backend data
transaksi bisnis atau migrasi arsitektur utama.

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
9. Langganan melekat pada identitas usaha dengan pemilik yang dapat diverifikasi.
   Desktop dan Android milik usaha yang sama mengambil paket dan masa akses
   yang sama. Akun langganan terpisah dari akun kasir/karyawan serta role lokal.
10. Pelanggan lama dapat menghubungkan instalasi baru atau memulihkan langganan
    setelah instal ulang melalui verifikasi kepemilikan. Akses berbayar yang
    sudah diterima aplikasi tetap berlaku offline sampai tanggal berakhirnya.

## Keputusan Identitas Usaha dan Pemulihan Langganan

Tanggal keputusan: 2026-09-08.

Mengikuti pembahasan pola akun dan lisensi Adobe/Corel, Kasirku menggunakan
identitas pemilik dan usaha sebagai penghubung antara langganan dan instalasi
aplikasi. Penerapannya tetap sederhana: trial maksimal 90 hari, pembayaran
manual setiap periode melalui Midtrans, serta lisensi perpetual per major
version sebagai penawaran tahap berikutnya sesuai ketentuan di bawah.

Halaman awal desktop dan Android menyediakan dua jalur:

- **Daftar usaha baru:** mengikuti registrasi, pemilihan paket, setup,
  persetujuan, dan trial yang ditetapkan pada dokumen ini.
- **Sudah punya langganan / Hubungkan ke usaha yang sudah terdaftar:**
  memverifikasi kepemilikan, lalu mengambil paket, entitlement, dan tanggal
  akhir akses dari layanan billing. Jalur ini tidak membuat langganan baru
  atau mengharuskan pembelian ulang untuk usaha yang sama.

Contoh: pemilik membeli paket POS dari desktop, lalu memasang aplikasi Android.
Setelah kepemilikan diverifikasi, Android memperoleh paket dan tanggal akhir
yang sama. Pemulihan langganan tidak otomatis memindahkan data transaksi,
memulihkan backup, atau memberikan role kasir/admin lokal. Data dan hak akses
operasional tetap mengikuti mekanisme aplikasi yang sudah ada.

Registrasi dan trial baru tetap dapat dimulai secara lokal saat offline;
pengiriman lead menunggu koneksi. Verifikasi kepemilikan, pemulihan langganan,
pembayaran, dan pengambilan aktivasi terbaru memerlukan koneksi. Akses berbayar
yang sudah tersimpan lokal tidak dihentikan hanya karena internet atau layanan
billing sedang tidak tersedia, selama tanggal akhir akses belum terlewati.
Setelah akses habis, layar blokir tetap menyediakan pembayaran, pemulihan atau
pemeriksaan status akses, dan ekspor backup.

Metode verifikasi kepemilikan dan penanganan kontak pemilik yang hilang/berubah
masih harus dirinci sebelum implementasi pemulihan. Mengetahui nama usaha atau
nomor WhatsApp saja bukan bukti kepemilikan. Keputusan ini tidak menetapkan
email wajib, device binding, atau validasi server periodik.

## Alur Registrasi sampai Pembayaran

Alur pengguna baru berikut berlaku untuk **desktop maupun Android**. Pelanggan
lama memakai jalur pemulihan pada keputusan identitas usaha di atas:

Registrasi → pilih paket usaha → setup akuntansi (boleh dilewati) → persetujuan
syarat dan privasi → trial → upgrade/pembayaran → aktivasi akses berbayar →
perpanjangan bulanan. Upgrade dapat dilakukan kapan saja selama trial, tanpa
menunggu trial berakhir. Pengingat hari Rabu berjalan selama penggunaan aplikasi
dan bukan langkah yang harus dilalui sebelum pembayaran.

### Perilaku per Platform

| Area | Desktop | Android |
| --- | --- | --- |
| Registrasi sampai persetujuan | Form dan navigasi dioptimalkan untuk keyboard, mouse, dan layar lebar. | Form dan navigasi dioptimalkan untuk sentuhan, keyboard virtual, dan tombol/gestur kembali. |
| Pilihan paket dan setup | Ringkasan serta perbandingan dapat ditampilkan berdampingan. | Informasi ditampilkan bertahap agar mudah dibaca dan dipilih pada layar kecil. |
| Trial, pengingat, dan layar blokir | Status akses, pengingat Rabu, tombol pembayaran, dan ekspor backup tersedia dalam tampilan desktop. | Status akses, pengingat Rabu, tombol pembayaran, dan ekspor backup tersedia dalam tampilan mobile. |
| Checkout Midtrans | Checkout dapat dibuka dari aplikasi sesuai rancangan desktop. | Checkout dibuka di browser eksternal sistem. |
| Melanjutkan setelah pembayaran | Aplikasi membaca status akses terbaru setelah checkout, saat kembali aktif, atau saat dibuka lagi. | Pengguna dapat kembali melalui app link atau membuka aplikasi secara manual; aplikasi membaca status akses saat kembali aktif atau dibuka lagi. |

Data registrasi wajib, pilihan paket, harga, entitlement modul, persetujuan,
masa trial, aturan blokir, serta dasar aktivasi pembayaran tetap sama pada kedua
platform. Detail UX masing-masing platform dirancang dalam dokumen implementasi.

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

Pada desktop maupun Android, aplikasi membaca status akses terbaru dari layanan
billing setelah checkout, ketika aktif kembali, atau ketika dibuka lagi saat
koneksi tersedia. Pada Android, browser dapat mengarahkan pengguna kembali ke
aplikasi melalui *app link*; pengguna juga dapat membuka aplikasi secara manual.
Kembalinya pengguna atau tertutupnya checkout bukan bukti pembayaran maupun
syarat aktivasi. Status webhook tervalidasi tetap menjadi sumber kebenaran bagi
kedua platform.

## Batasan Tahap Awal

- Data transaksi dan arsitektur database tetap menggunakan kondisi saat ini:
  Dexie/IndexedDB lokal dan opsi self-host PostgreSQL/LAN.
- Tidak ada migrasi Supabase untuk data inti, autentikasi, atau sinkronisasi
  aplikasi pada tahap ini. Layanan kecil lead/billing adalah pengecualian untuk
  pembayaran otomatis serta identitas dan pemulihan langganan; autentikasi
  kasir/karyawan tetap mengikuti sistem aplikasi yang ada.
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
| Cakupan platform | Desktop dan Android mengikuti alur registrasi, pemilihan paket, setup, persetujuan, trial, pembayaran, aktivasi, dan perpanjangan yang sama. Perilaku UI, navigasi, dan checkout disesuaikan dengan platform. |
| Registrasi & lead | Nama pengguna, nama usaha, nomor WhatsApp, dan jenis usaha wajib diisi. Lead dikirim saat koneksi tersedia ke penyimpanan terpisah. Persetujuan marketing/follow-up bersifat opsional. |
| Identitas & pemulihan | Langganan melekat pada usaha dengan pemilik terverifikasi; instalasi desktop/Android dapat mengambil akses yang sama. Pemulihan lisensi terpisah dari pemulihan data dan role lokal. |
| Akses offline | Akses berbayar yang sudah diterima disimpan lokal sampai tanggal berakhir; koneksi diperlukan untuk pembayaran, verifikasi kepemilikan, pemulihan, dan aktivasi terbaru. |
| Trial berakhir | Blokir transaksi, perubahan data, dan laporan operasional sampai pembayaran berhasil; ekspor backup data tetap tersedia. |
| Model komersial awal | Langganan bulanan dengan pembayaran manual tiap periode. Produk beli putus menjadi penawaran terpisah setelah langganan stabil. |
| Harga skala usaha | Harga flat per paket untuk satu badan usaha; belum ada pembeda outlet, perangkat, atau pengguna. |
| Pembayaran | Checkout Midtrans melalui layanan pembayaran kecil khusus token dan webhook tervalidasi. Desktop dapat membuka checkout dari aplikasi; Android membukanya di browser eksternal. |
| Distribusi Android | Di luar Google Play, melalui APK langsung atau kanal privat. |
| T&C & privasi | Syarat Layanan dan pemberitahuan Kebijakan Privasi wajib diterima. Consent marketing terpisah dan opsional. |
| Data layanan | Layanan lead/billing hanya menyimpan data lead, identitas pemilik/usaha, metadata verifikasi/pemulihan, dan metadata billing; tidak pernah menyimpan data transaksi bisnis pelanggan. |

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
- `billing`: identitas pemilik/usaha yang terkait dengan langganan, metadata
  verifikasi/pemulihan akses, `order_id`, paket, nominal, status Midtrans, masa
  akses, jejak webhook, dan hash token aktivasi.

Endpoint publik dibatasi pada pengiriman lead, pendaftaran identitas langganan,
verifikasi kepemilikan dan pemulihan langganan, pembuatan checkout, pembacaan
status akses, dan webhook Midtrans. Perluasan identitas ini khusus untuk
langganan, bukan pengelolaan akun kasir/karyawan. Layanan tidak boleh menerima
atau menyimpan
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
   keamanan secret, backup, dan webhook yang telah ditetapkan, termasuk
   identitas usaha, verifikasi kepemilikan, serta pemulihan langganan.
3. Menyusun naskah Syarat Layanan dan Kebijakan Privasi untuk peninjauan hukum,
   serta menyelesaikan pendaftaran PSE Lingkup Privat sebelum peluncuran.
4. Merancang wizard onboarding, layar blokir dengan ekspor backup, dan checkout
   Midtrans untuk desktop maupun Android dengan alur bisnis yang sama dan
   perilaku interaksi sesuai platform.
