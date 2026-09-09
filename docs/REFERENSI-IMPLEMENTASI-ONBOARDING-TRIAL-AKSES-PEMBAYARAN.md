# Referensi Implementasi: Onboarding, Trial, Akses, dan Pembayaran

Status: DRAFT  
Tanggal: 2026-09-04  
Tanggal revisi: 2026-09-08

Dokumen induk: [Model Bisnis — Registrasi, Trial, Paket, dan Pembayaran](ISSUE-MODEL-BISNIS-INSTALASI-SAMPAI-PEMBAYARAN.md)

## Tujuan

Dokumen ini menjadi acuan lanjutan untuk mengubah keputusan bisnis pada
dokumen induk menjadi pekerjaan desain, data, kode, pembayaran, dan komunikasi
pengguna. Dokumen ini tidak mengubah keputusan harga, paket, masa trial, atau
batasan arsitektur yang telah ditetapkan pada dokumen induk.

## Prinsip yang Tidak Boleh Berubah

- Data transaksi bisnis tetap offline-first pada Dexie/IndexedDB lokal, dengan
  opsi PostgreSQL/LAN yang sudah ada; data tersebut tidak dikirim ke layanan
  lead atau billing.
- Trial maksimal 90 hari dan status akses diperiksa secara lokal pada tahap
  awal. Risiko penghapusan data lokal, instal ulang, atau modifikasi aplikasi
  untuk mengakali trial telah diterima.
- Langganan melekat pada identitas usaha dengan pemilik yang dapat diverifikasi.
  Desktop dan Android dapat mengambil entitlement serta masa akses yang sama;
  akun langganan terpisah dari akun kasir/karyawan dan role lokal.
- Akses berbayar yang telah diterima berlaku offline sampai tanggal berakhir.
  Verifikasi kepemilikan, pemulihan langganan, pembayaran, dan pengambilan
  aktivasi terbaru memerlukan koneksi. Tidak ada validasi server periodik
  sebagai syarat penggunaan selama masa akses lokal masih berlaku.
- Saat akses habis, transaksi baru, perubahan data, dan laporan operasional
  diblokir. Halaman blokir tetap harus memberi akses ke halaman pembayaran dan
  ekspor backup data.
- Paket menentukan entitlement modul. `GENERAL_LEDGER` tidak boleh ikut aktif
  otomatis hanya karena paket memiliki `CASH_FLOW` atau modul bisnis lain.
- Server Key Midtrans hanya berada di layanan pembayaran. Harga, paket, dan
  masa akses selalu ditetapkan ulang oleh layanan tersebut, bukan oleh klien.
- Android tahap awal didistribusikan di luar Google Play. Checkout Midtrans
  dibuka dengan browser eksternal sistem, bukan WebView atau checkout in-app.
- Persetujuan Syarat Layanan dan pemberitahuan Kebijakan Privasi wajib; consent
  follow-up/marketing terpisah, opsional, tidak dicentang secara bawaan, dan
  dapat ditarik kembali.

## 1. Referensi UI/UX Wizard Onboarding

### Prinsip desain per platform

**Desktop dan Android mengikuti alur bisnis yang sama dari registrasi sampai
pembayaran dan aktivasi akses, dengan rancangan UX sesuai masing-masing
platform.** Urutan tahapan, data wajib, paket, persetujuan, trial, dan aturan
akses tetap sama. Tampilan dan perilaku interaksi dirancang untuk masing-masing
platform. Responsivitas hanya memastikan komponen muat
di ukuran layar berbeda; responsivitas tidak menyelesaikan perbedaan cara
pengguna memasukkan data, menavigasi, menemukan aksi utama, atau melanjutkan
pekerjaan.

| Faktor | Desktop | Android |
| --- | --- | --- |
| Cara berinteraksi | Pointer, keyboard, shortcut, dan layar lebar mendukung perbandingan serta pekerjaan lebih lama. | Sentuhan, keyboard virtual, gestur sistem, dan penggunaan satu tangan mendukung langkah yang ringkas serta mudah dilanjutkan. |
| Navigasi | Sidebar atau stepper dapat selalu terlihat; navigasi antar halaman boleh lebih eksplisit. | Back gesture/tombol sistem harus didukung; navigasi utama memakai pola mobile seperti bottom navigation atau drawer bila memang diperlukan. |
| Aksi utama | Tombol utama ditempatkan dekat konteks form atau area aksi yang tetap terlihat. | Tombol utama ditempatkan pada area bawah yang mudah dijangkau ibu jari, menghormati safe area, dan tidak tertutup keyboard virtual. |
| Informasi padat | Ringkasan, tabel perbandingan, dan detail paket dapat ditampilkan berdampingan. | Informasi diprioritaskan; detail sekunder dibuka melalui halaman atau bottom sheet, bukan dipadatkan menjadi tabel kecil. |
| Gestur | Klik kanan, hover, dan shortcut dapat menjadi percepatan, tetapi bukan satu-satunya cara. | Swipe, pull-to-refresh, dan back gesture dapat dipakai bila memiliki affordance yang jelas; setiap aksi penting wajib punya kontrol yang terlihat. |

Perbedaan ini penting karena onboarding dan pembayaran adalah titik konversi.
Flow yang hanya dipersempit berisiko membuat tombol upgrade sulit dijangkau,
form tidak nyaman diisi, navigasi kembali membingungkan, atau detail penting
tersembunyi di balik gestur yang tidak ditemukan pengguna.

### Jalur awal untuk kedua platform

- **Daftar usaha baru:** menjalankan urutan onboarding di bawah, termasuk
  dukungan registrasi/trial lokal dan antrean lead saat offline.
- **Sudah punya langganan / Hubungkan ke usaha yang sudah terdaftar:**
  memverifikasi kepemilikan secara online, lalu mengambil identitas usaha,
  paket, entitlement, dan tanggal akhir akses dari billing. Berlaku untuk
  perangkat tambahan maupun instal ulang, tanpa pembelian langganan ulang.

Pemulihan akses tidak memulai trial baru, memperpanjang masa langganan, atau
mengaktifkan langganan yang sudah habis. Pemulihan juga tidak memindahkan data
transaksi, menjalankan restore backup, atau memberikan role lokal secara
otomatis. Rancang jalur setup/koneksi data sesuai kondisi instalasi yang ada
tanpa menimpa data pengguna.

### Urutan langkah pengguna baru

1. **Registrasi:** nama pemilik/pengguna, nama usaha, nomor WhatsApp, dan jenis
   usaha wajib diisi. Email serta lokasi usaha opsional.
2. **Pilih paket:** POS Ritel/Restoran, Koperasi, Produksi, Perdagangan Umum,
   atau Custom. Tampilan paket perlu menjelaskan sasaran paket dan ringkasan
   modul, tanpa mengubah harga atau entitlement yang disetujui.
3. **Setup akuntansi:** pengguna dapat menjalankan konfigurasi atau melewati
   langkah ini untuk memakai konfigurasi bawaan sistem.
4. **Syarat dan privasi:** pengguna wajib menyetujui Syarat Layanan dan
   menerima pemberitahuan Kebijakan Privasi. Consent follow-up/marketing harus
   berupa kontrol terpisah yang tidak wajib.
5. **Mulai trial:** tampilkan paket aktif, tanggal mulai, tanggal akhir, dan
   titik masuk yang jelas ke aplikasi.

### Keadaan yang wajib dirancang

| Keadaan | Perilaku yang diperlukan |
| --- | --- |
| Perangkat offline saat registrasi | Onboarding tetap dapat diselesaikan sesuai aturan aplikasi; pengiriman lead diantrekan sampai koneksi tersedia. |
| Pemulihan saat offline atau verifikasi gagal | Jelaskan bahwa pemulihan memerlukan koneksi dan bukti kepemilikan yang valid; sediakan coba lagi tanpa menghapus akses lokal yang masih berlaku. |
| Pemulihan berhasil | Terapkan paket dan tanggal akhir dari billing; jika sudah habis, tampilkan layar blokir dan perpanjangan. Data transaksi serta role lokal tetap mengikuti mekanisme yang ada. |
| Data wajib belum valid | Pengguna tidak dapat melanjutkan dan menerima pesan validasi per kolom. |
| Syarat belum disetujui | Trial tidak boleh diaktifkan. |
| Trial aktif | Status dan sisa masa trial mudah terlihat serta menyediakan tombol upgrade. |
| Akses berbayar aktif | Paket, masa akses, dan informasi pembayaran berikutnya mudah ditemukan. |
| Trial atau akses berbayar habis | Tampilkan layar blokir yang tetap menyediakan checkout dan ekspor backup. |

### Flow desktop

1. Pengguna masuk ke wizard melalui halaman awal atau CTA **Selesaikan setup**.
   Stepper permanen di sisi kiri atau bagian atas menunjukkan langkah, status,
   dan kemampuan kembali ke langkah yang sudah selesai.
2. Registrasi memakai form yang efisien untuk keyboard: urutan fokus logis,
   tombol Enter tidak boleh tanpa sengaja menyetujui syarat, dan validasi tampil
   dekat kolom yang salah. Ringkasan usaha dapat terlihat di panel samping.
3. Pemilihan paket memakai kartu atau tabel perbandingan lebar, sehingga harga,
   sasaran, dan modul penting dapat dibandingkan tanpa berpindah halaman.
4. Setup akuntansi dan persetujuan dokumen memakai halaman fokus dengan tombol
   **Kembali** dan **Lanjutkan** yang jelas. Consent marketing tidak boleh
   tercampur dengan aksi wajib untuk memulai trial.
5. Setelah trial aktif, pengguna kembali ke dashboard desktop. Banner status
   trial/langganan tetap terlihat, sementara detail dan checkout tersedia dari
   halaman status akses.
6. Saat akses habis, gunakan layar blokir desktop yang jelas. Tombol
   **Bayar sekarang** dan **Ekspor backup** sama-sama mudah ditemukan; jangan
   menyembunyikan ekspor di menu overflow.

### Flow Android

1. Onboarding berjalan satu langkah per layar dan dapat dilanjutkan dari
   langkah terakhir bila aplikasi ditutup. Indikator progres ringkas memberi
   konteks tanpa mengambil banyak ruang.
2. Form registrasi ditata vertikal, memakai jenis keyboard yang sesuai untuk
   nomor WhatsApp dan email. Aksi **Lanjutkan** bersifat sticky di bagian bawah,
   berada dalam safe area serta bergerak atau tetap dapat dijangkau saat
   keyboard virtual tampil.
3. Paket ditampilkan sebagai kartu vertikal yang mudah dipilih dengan satu
   tangan. Ringkasan terlihat langsung; daftar modul dan perbandingan lengkap
   dibuka di halaman detail atau bottom sheet, bukan tabel desktop yang
   diperkecil.
4. Setup akuntansi dan persetujuan dokumen dibuat sebagai layar penuh yang
   mudah di-scroll. Back gesture dan tombol kembali aplikasi harus membawa
   pengguna ke langkah sebelumnya tanpa menghapus isian yang sudah valid.
5. Sesudah trial aktif, status akses tampil sebagai kartu yang dapat disentuh
   dari beranda. Reminder hari Rabu membuka halaman status, bukan dialog yang
   menutupi seluruh aplikasi tanpa jalur keluar.
6. Saat akses habis, layar blokir mobile menempatkan **Bayar sekarang** sebagai
   aksi utama di bawah. **Ekspor backup** tetap tampil sebagai aksi setara dan
   tidak bergantung pada swipe, long-press, atau menu tersembunyi.
7. Saat pengguna memilih **Bayar sekarang**, aplikasi meminta URL checkout dari
   layanan billing lalu membukanya di browser eksternal sistem. Jangan memakai
   WebView. Halaman sebelum keluar harus menjelaskan bahwa pembayaran akan
   dilanjutkan di browser.
8. Browser dapat kembali ke aplikasi melalui *app link* setelah pembayaran.
   Namun aplikasi juga harus mengambil ulang status akses saat kembali ke
   foreground atau dibuka kembali, karena pengguna dapat menutup browser atau
   tidak kembali melalui tautan tersebut.

Untuk kedua platform, jangan mengunci pengguna dalam onboarding apabila data
yang sudah valid dapat disimpan lokal dan dilanjutkan kemudian. Rancang juga
mode offline, perubahan orientasi atau ukuran jendela, pembaca layar, dan
status pemrosesan pembayaran secara khusus pada masing-masing flow.

## 2. Referensi Data dan Kode Status Trial, Paket, Consent, dan Akses

### Data lokal minimum

Rancangan skema perlu memisahkan data berikut agar perubahan satu area tidak
menghilangkan jejak area lain:

| Area | Data yang perlu dicatat |
| --- | --- |
| Profil registrasi | Nama pengguna, nama usaha, WhatsApp, jenis usaha, serta email/lokasi bila diisi. |
| Identitas langganan | Pengenal pemilik/usaha dari layanan billing dan keterkaitannya dengan akses lokal; terpisah dari pengenal kasir/karyawan. |
| Pengiriman lead | Status antrean, waktu percobaan, hasil terakhir, dan pengenal idempoten. Tidak memuat data transaksi bisnis. |
| Persetujuan dokumen | Jenis dokumen, versi, hash, waktu persetujuan, serta status dan waktu penarikan consent marketing bila ada. |
| Paket dan entitlement | Kode paket, daftar modul aktif eksplisit, harga yang ditampilkan sebagai informasi, dan waktu perubahan paket. |
| Trial dan akses | Waktu mulai, waktu berakhir, sumber aktivasi, status akses saat ini, serta waktu pemeriksaan terakhir. |
| Bukti aktivasi | Referensi order/aktivasi dan metadata minimum yang diperlukan untuk menerapkan akses; jangan menyimpan Server Key atau token checkout rahasia. |

Status dan timestamp harus menggunakan format yang konsisten serta diuji untuk
perubahan zona waktu dan jam perangkat yang tidak akurat. Karena validasi tahap
awal lokal, UI perlu menyampaikan status akses tanpa menjanjikan perlindungan
lisensi yang tidak disediakan.

### Batasan kode

- Buat satu sumber kebenaran untuk keputusan akses, lalu gunakan pada menu,
  tombol aksi, penyimpanan perubahan, dan pembuatan laporan.
- Pisahkan pemeriksaan **boleh melihat** dari **boleh membuat/mengubah** agar
  layar blokir, pembayaran, dan ekspor backup tetap dapat berfungsi.
- Pemetaan paket ke `enabledModules` harus eksplisit dan diuji untuk setiap
  paket, terutama agar `GENERAL_LEDGER` tidak tersisip melalui normalisasi.
- Simpan perubahan status secara atomik dan siapkan migrasi data lokal untuk
  pengguna yang sudah memasang aplikasi sebelum fitur ini dirilis.
- Kontrak identitas harus mengatur pengaitan registrasi offline ke identitas
  usaha di server, otorisasi pengambilan akses, dan pemulihan pada instalasi
  lain. Nama usaha atau nomor WhatsApp yang dimasukkan saja tidak cukup untuk
  membuktikan kepemilikan. Metode verifikasi dan pemulihan kontak masih perlu
  ditetapkan sebelum implementasi fitur tersebut.
- Tambahkan pengujian untuk trial baru, sisa satu hari, trial habis, aktivasi
  sukses, paket Custom, pembatalan consent marketing, dan kegagalan antrean
  lead saat offline.

### Transisi status yang perlu diuji

```text
belum_onboarding
  -> onboarding_berjalan
  -> trial_aktif
  -> pembayaran_menunggu
  -> akses_berbayar_aktif
  -> akses_habis

trial_aktif atau akses_habis -> pembayaran_menunggu -> akses_berbayar_aktif
```

`pembayaran_menunggu` tidak boleh langsung mengaktifkan akses. Aktivasi hanya
terjadi setelah layanan pembayaran memperoleh hasil pembayaran yang telah
diverifikasi melalui webhook Midtrans.

## 3. Referensi Implementasi Midtrans

### Alur minimum

```text
Aplikasi meminta checkout
  -> Layanan billing memvalidasi paket dan harga
  -> Layanan billing membuat order Midtrans dan token checkout
  -> Desktop membuka checkout dari aplikasi / Android membuka browser eksternal
  -> Midtrans mengirim webhook ke layanan billing
  -> Layanan memverifikasi webhook dan memproses order secara idempoten
  -> Layanan menerbitkan hasil aktivasi akses
  -> Aplikasi mengambil atau menerima hasil aktivasi lalu memperbarui akses lokal
```

### Kontrol implementasi

- `order_id` harus unik dan menjadi kunci idempotensi pemrosesan webhook.
- Verifikasi signature dan status transaksi harus dilakukan di server sebelum
  akses diaktifkan. Redirect/hasil yang tampil di aplikasi hanya bersifat
  informasi, bukan bukti pembayaran.
- Pada Android, gunakan browser eksternal sistem dan *app link* HTTPS yang
  terverifikasi untuk kembali ke aplikasi bila tersedia; jangan menggunakan
  WebView. URL checkout harus berumur pendek dan tidak memuat data pribadi,
  token rahasia, harga yang dipercaya dari klien, atau data transaksi bisnis.
- Aktivasi tetap harus dapat disinkronkan ketika pengguna tidak kembali dari
  browser. Saat aplikasi kembali ke foreground atau dibuka ulang, baca status
  akses dari layanan billing dan perbarui status lokal bila ada aktivasi baru.
- Rekonsiliasi atau pemrosesan ulang webhook harus aman bila notifikasi yang
  sama diterima lebih dari sekali atau tiba tidak berurutan.
- Layanan billing menyimpan metadata billing seperlunya: order, paket, nominal,
  status Midtrans, masa akses, jejak webhook, dan hash token aktivasi, serta
  identitas pemilik/usaha dan metadata verifikasi/pemulihan langganan. Layanan
  ini tidak menerima data POS, stok, pelanggan, supplier, atau dokumen bisnis,
  dan tidak mengelola akun kasir/karyawan.
- Endpoint publik dibatasi pada pengiriman lead, pendaftaran identitas
  langganan, verifikasi kepemilikan dan pemulihan langganan, pembuatan checkout,
  pembacaan status akses, dan webhook. Terapkan autentikasi/otorisasi yang sesuai
  pada endpoint selain webhook, pencatatan audit, pembatasan laju, serta penyimpanan
  secret melalui mekanisme secret server.
- Buat prosedur operasional untuk pembayaran tertunda, pembayaran ganda,
  pengembalian dana, webhook gagal, dan aktivasi yang belum tersinkron ke
  aplikasi. Keputusan bisnis untuk kasus tersebut harus dikonfirmasi sebelum
  kode produksi dibuat.

Referensi eksternal utama: [Panduan HTTP(S) webhook Midtrans](https://docs.midtrans.com/docs/https-notification-webhooks).

## 4. Referensi Copywriting Reminder dan Follow-up

### Reminder in-app setiap Rabu

Copy harus menyesuaikan status pengguna dan selalu menyebut tindakan yang
tersedia. Hindari klaim bahwa pembayaran telah berhasil sebelum aktivasi dari
layanan billing diterima.

| Kondisi | Pesan inti | CTA |
| --- | --- | --- |
| Trial masih berjalan | Sisa masa trial dan manfaat melanjutkan paket. | Lihat paket / Upgrade sekarang |
| Trial hampir habis | Tanggal akhir dan dampak blokir operasional. | Upgrade sekarang / Ekspor backup |
| Akses berbayar aktif | Paket aktif dan tanggal pembayaran berikutnya. | Perpanjang langganan |
| Akses habis | Aksi operasional diblokir, tetapi data tetap tersedia untuk backup. | Bayar sekarang / Ekspor backup |
| Pembayaran diproses | Pembayaran belum dapat dipastikan sampai verifikasi selesai. | Periksa status pembayaran |

### Materi follow-up WhatsApp atau email

- Kirim hanya kepada pengguna yang memberikan consent follow-up/marketing yang
  masih aktif, sesuai kebijakan dan naskah hukum yang telah disetujui.
- Sertakan identitas pengirim, tujuan pesan, cara berhenti menerima follow-up,
  dan kanal bantuan.
- Pisahkan materi berdasarkan tahap: registrasi belum selesai, trial aktif,
  trial mendekati habis, pembayaran menunggu, serta pelanggan aktif.
- Jangan memasukkan data sensitif, token checkout, Server Key, atau rincian
  transaksi bisnis pengguna ke dalam pesan.

## Deliverable Sebelum Pengembangan Dimulai

- Dua set wireframe dan alur interaksi end-to-end yang terpisah: satu untuk
  desktop dan satu untuk Android. Keduanya mencakup wizard, status trial,
  layar blokir, dan checkout; bukan variasi ukuran dari wireframe yang sama.
- Matriks keputusan UX per platform untuk navigasi, tombol utama, input,
  keyboard/gestur, drawer atau sidebar, safe area, dan keadaan offline.
- Rencana distribusi Android non-Google-Play: APK rilis yang ditandatangani,
  domain unduhan HTTPS resmi, mekanisme pembaruan, panduan instalasi, serta
  jalur dukungan pengguna.
- Kontrak data lokal, migrasi, dan matriks akses per status.
- Pemetaan entitlement paket ke modul beserta pengujian regresi normalisasi.
- Kontrak API layanan lead/billing, skema database terpisah, daftar secret,
  strategi webhook, dan prosedur rekonsiliasi, termasuk identitas pemilik/usaha,
  metode verifikasi kepemilikan, pengaitan registrasi offline, dan pemulihan.
- Naskah reminder in-app dan template follow-up yang telah ditinjau terhadap
  Syarat Layanan serta Kebijakan Privasi.
- Skenario uji end-to-end dari registrasi offline sampai aktivasi pembayaran dan
  ekspor backup ketika akses habis, diuji terpisah pada desktop dan Android.
- Skenario pemulihan langganan setelah instal ulang dan pengambilan akses usaha
  yang sama pada desktop/Android, termasuk verifikasi gagal, koneksi putus,
  langganan habis, serta akses lokal yang masih berlaku saat billing gagal.

## Pertanyaan yang Harus Diputuskan Sebelum Rilis

1. Apa kebijakan operasional untuk pembayaran ganda, refund, chargeback, dan
   pembayaran yang sukses tetapi aplikasi belum menerima aktivasi?
2. Metode verifikasi kepemilikan apa yang digunakan pada jalur pemulihan
   langganan yang sudah disepakati, dan bagaimana menangani kontak pemilik yang
   hilang/berubah? Detail ini harus diputuskan sebelum implementasi pemulihan.
3. Kanal dan frekuensi follow-up apa yang disetujui setelah consent marketing
   diperoleh, termasuk pemisahan pesan layanan dari pesan pemasaran?
4. Bagaimana proses dukungan untuk koreksi data registrasi, penarikan consent,
   dan permintaan penghapusan data lead?
5. Kanal distribusi Android mana yang dipakai lebih dahulu: unduhan APK dari
   situs resmi, kanal privat pelanggan, atau MDM untuk perangkat terkelola?
