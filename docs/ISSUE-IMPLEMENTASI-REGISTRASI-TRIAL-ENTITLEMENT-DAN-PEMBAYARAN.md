# Issue Lanjutan: Implementasi Registrasi, Trial, Entitlement, dan Pembayaran

Status: DRAFT  
Tanggal: 2026-09-04  
Dokumen induk: [Model Bisnis — Registrasi, Trial, Paket, dan Pembayaran](ISSUE-MODEL-BISNIS-INSTALASI-SAMPAI-PEMBAYARAN.md)  
Rujukan desain: [Referensi Implementasi Onboarding, Trial, Akses, dan Pembayaran](REFERENSI-IMPLEMENTASI-ONBOARDING-TRIAL-AKSES-PEMBAYARAN.md)

## Tujuan

Issue ini menurunkan empat langkah selanjutnya dari dokumen induk menjadi
pekerjaan yang dapat diimplementasikan, diuji, dan ditutup secara bertahap.
Dokumen ini adalah execution issue: keputusan bisnis tetap mengacu kepada
dokumen induk, sedangkan detail UX dan prinsip teknis mengacu kepada dokumen
referensi.

Hasil akhir yang dituju adalah pengguna baru dapat menyelesaikan onboarding,
mendapat trial maksimal 90 hari sesuai paketnya, melakukan checkout Midtrans,
dan memperoleh akses berbayar setelah webhook terverifikasi. Saat akses habis,
pengguna tetap dapat membayar dan mengekspor backup, tetapi tidak dapat membuat
atau mengubah data operasional.

## Ruang Lingkup

1. Memisahkan entitlement paket dari normalisasi setup, khususnya agar
   GENERAL_LEDGER tidak lagi aktif otomatis.
2. Mendesain dan membangun layanan lead serta billing yang terpisah dari data
   transaksi aplikasi.
3. Menyiapkan naskah Syarat Layanan dan Kebijakan Privasi untuk peninjauan
   hukum, serta menutup kebutuhan PSE sebelum rilis publik.
4. Membangun wizard onboarding, status trial/langganan, layar blokir,
   pengingat hari Rabu, ekspor backup, dan checkout Midtrans sesuai platform.

## Di Luar Ruang Lingkup

- Migrasi data transaksi inti ke Supabase atau layanan cloud lain.
- Layanan autentikasi baru untuk data POS, stok, pelanggan, supplier, dokumen
  bisnis, atau keuangan.
- Perlindungan lisensi tingkat tinggi, device binding, atau validasi server
  periodik sebagai mekanisme anti-pembajakan.
- Penjualan GENERAL_LEDGER, FIXED_ASSET, HRIS lengkap, Marketplace, atau modul
  baru di luar entitlement yang sudah disetujui.
- Produk beli putus. Produk tersebut hanya dapat dipertimbangkan setelah model
  langganan stabil sesuai keputusan pada dokumen induk.

## Keputusan yang Menjadi Kontrak

- Data bisnis tetap offline-first di Dexie/IndexedDB dan opsi PostgreSQL/LAN
  yang sudah ada. Layanan baru hanya menangani lead dan metadata billing.
- Semua paket dasar selalu menyertakan ROLE_PERMISSION, CASH_FLOW, dan
  CHART_OF_ACCOUNTS; GENERAL_LEDGER tidak termasuk paket mana pun.
- Paket tersedia: POS Ritel & Resto, Perdagangan Umum, Produksi, Koperasi, dan
  Custom. Daftar modul serta harga masing-masing mengacu ke dokumen induk.
- Trial maksimum 90 hari. Akses berbayar baru aktif sesudah hasil pembayaran
  diproses dari webhook Midtrans yang tervalidasi dan idempoten.
- Desktop dapat membuka checkout dari aplikasi. Android membuka checkout di
  browser eksternal sistem, bukan WebView.
- Ketika akses habis, pengguna boleh melihat jalur pembayaran dan mengekspor
  backup; pembuatan transaksi, perubahan data, dan laporan operasional diblokir.
- Syarat Layanan dan pemberitahuan Kebijakan Privasi wajib diterima sebelum
  trial. Consent follow-up/marketing terpisah, opsional, tidak dicentang secara
  bawaan, dan dapat ditarik kembali.

## Kondisi Awal yang Perlu Dijaga

| Area | Kondisi saat ini | Konsekuensi pekerjaan |
| --- | --- | --- |
| Konfigurasi modul | normalizeSetupConfig menambahkan CHART_OF_ACCOUNTS dan GENERAL_LEDGER jika modul memicu baseline akuntansi. | Normalisasi harus berhenti menambahkan GENERAL_LEDGER tanpa menghapus entitas GENERAL_LEDGER yang sudah eksplisit pada instalasi lama. |
| Katalog modul | Katalog setup dan gate rute sudah menggunakan kode enabledModules. | Entitlement paket perlu memakai kode yang sama, tetapi sumber keputusan paket tidak boleh tersebar pada komponen UI. |
| Penyimpanan setup | Setup dapat disimpan lokal dan disinkronkan ke PostgreSQL/LAN bila tersedia. | Status paket/trial harus mempunyai model lokal dan migrasi yang tidak merusak setup atau sinkronisasi yang ada. |
| Backup | Fitur backup sudah tersedia dari halaman Pengaturan. | Layar blokir harus memberi jalur langsung ke ekspor yang sama, bukan membuat format backup baru. |
| Layanan eksternal | Belum ada layanan lead/billing atau integrasi Midtrans dalam aplikasi. | Kontrak API, identitas klien, keamanan, operasi, dan kegagalan harus diputuskan sebelum integrasi UI produksi. |

## Urutan dan Ketergantungan

~~~
Entitlement paket dan kontrak status lokal
  -> wizard onboarding dan gate akses
  -> kontrak checkout aplikasi

Kontrak lead/billing + keputusan identitas akses
  -> layanan checkout dan webhook Midtrans
  -> sinkronisasi aktivasi akses

Naskah hukum + PSE
  -> persetujuan dokumen pada onboarding dan gerbang rilis publik

Semua workstream
  -> uji end-to-end, runbook operasional, dan keputusan go/no-go
~~~

Workstream entitlement dapat dimulai lebih dahulu. Desain UX dan layanan dapat
berjalan paralel setelah kontrak status lokal, identitas akses, dan API minimum
sudah disepakati. Rilis publik tidak boleh melewati gerbang legal/PSE maupun
verifikasi alur pembayaran end-to-end.

## Workstream 1 — Entitlement Paket dan Normalisasi Setup

### Masalah yang Diselesaikan

Saat ini fungsi withAccountingBaselineDependencies pada
src/services/setupKeyService.ts menambahkan CHART_OF_ACCOUNTS dan
GENERAL_LEDGER untuk setiap setup yang mempunyai modul pemicu baseline
akuntansi, termasuk CASH_FLOW. Perilaku itu bertentangan dengan paket komersial
yang secara eksplisit belum menjual GENERAL_LEDGER.

### Pekerjaan

1. Ubah normalisasi baseline akuntansi agar hanya menambahkan dependensi yang
   benar-benar wajib untuk paket yang dijual, yaitu CHART_OF_ACCOUNTS, dan
   tidak pernah menyisipkan GENERAL_LEDGER.
2. Naikkan versi katalog modul untuk menandai perubahan aturan normalisasi.
   Migrasi harus bersifat additive: modul GENERAL_LEDGER yang sudah tersimpan
   pada konfigurasi pelanggan lama tetap dipertahankan dan tidak dicabut
   otomatis.
3. Buat satu katalog entitlement paket di domain aplikasi. Katalog itu memuat
   paling sedikit packageCode, nama tampilan, harga bulanan informatif, dan
   daftar kode modul eksplisit. Kode paket bukan turunan dari label UI.
4. Tambahkan resolver yang menghasilkan set modul efektif dari entitlement
   paket. Resolver adalah satu-satunya jalur baru untuk menerapkan paket ke
   enabledModules; komponen onboarding, halaman status, dan checkout tidak
   boleh merakit daftar modul sendiri.
5. Definisikan perlakuan paket Custom: daftar modul hasil penawaran harus
   tersimpan eksplisit bersama kode/versi penawaran. Jangan membuka seluruh
   katalog dan jangan mengizinkan modul di luar empat paket jual.
6. Audit gate rute, menu, tombol aksi, dan service yang mengasumsikan
   GENERAL_LEDGER aktif. Alur non-GL dari paket dasar harus tidak memanggil
   operasi buku besar, tutup buku, jurnal, atau saldo awal GL secara implisit.
7. Tentukan migrasi data untuk pengguna yang sudah memiliki setup. Migrasi ini
   tidak boleh mengubah paket atau menurunkan akses tanpa tindakan eksplisit
   pengguna/administrator.

### Kontrak Entitlement Minimum

~~~ts
type PackageCode =
  | 'POS_RETAIL_RESTAURANT'
  | 'GENERAL_TRADE'
  | 'PRODUCTION'
  | 'COOPERATIVE'
  | 'CUSTOM';

interface PackageEntitlement {
  packageCode: PackageCode;
  catalogVersion: number;
  enabledModuleCodes: string[]; // eksplisit, sudah termasuk baseline paket
  source: 'package' | 'custom-offer' | 'legacy-setup';
  appliedAt: string;
}
~~~

Model akhir boleh berbeda nama, tetapi harus menyimpan semantik di atas.
enabledModules tetap menjadi daftar efektif yang digunakan gate aplikasi;
entitlement menyimpan alasan bisnis mengapa modul tersebut aktif.

### Kriteria Penerimaan

- Setup baru dengan CASH_FLOW, penjualan, pembelian, laporan, atau koperasi
  tidak memperoleh GENERAL_LEDGER kecuali kode itu diberikan secara eksplisit.
- CHART_OF_ACCOUNTS tetap tersedia pada paket yang menurut kontrak memerlukan
  baseline akuntansi.
- Konfigurasi lama yang telah menyimpan GENERAL_LEDGER tetap dapat dibuka dan
  disinkronkan tanpa kehilangan modul tersebut.
- Masing-masing lima paket menghasilkan daftar modul persis seperti keputusan
  paket pada dokumen induk; tidak ada modul terlarang yang tersisip.
- UI dan gate rute menyembunyikan permukaan GENERAL_LEDGER ketika modul itu
  tidak aktif, tanpa merusak POS, stok, penjualan, pembelian, koperasi, atau
  laporan yang menjadi entitlement paket.
- Tes unit mencakup normalisasi versi lama dan baru, setiap entitlement paket,
  paket Custom, serta kasus negatif CASH_FLOW tanpa GENERAL_LEDGER.
- Tes regresi setup/sinkronisasi yang sebelumnya mengharapkan GL hanya karena
  baseline akuntansi diperbarui agar menyatakan perilaku baru secara eksplisit.

## Workstream 2 — Layanan Lead dan Billing

### Batas Layanan

Layanan berjalan di Dewaweb Cloud VPS fully managed pusat data Jakarta dengan
aplikasi kecil Node/Fastify dan PostgreSQL. Dua database/logical database
terpisah digunakan untuk leads dan billing. Tidak ada endpoint, tabel, antrian,
log aplikasi, atau backup layanan ini yang menerima data transaksi bisnis dari
aplikasi.

| Komponen | Tanggung jawab | Tidak boleh menangani |
| --- | --- | --- |
| leads | Registrasi, status pengiriman, consent marketing, versi dokumen, dan waktu persetujuan. | POS, stok, pelanggan, supplier, dokumen, atau catatan keuangan bisnis. |
| billing | Katalog harga server, order, status Midtrans, masa akses, jejak webhook, dan hasil aktivasi. | Server Key di klien, keputusan harga dari klien, atau data operasional bisnis. |
| Aplikasi | Menyimpan status akses lokal, mengantre lead saat offline, membuka checkout, dan menerapkan aktivasi yang diterima. | Memverifikasi pembayaran, membuat harga otoritatif, atau menyimpan Server Key. |

### Keputusan yang Harus Ditutup Sebelum Kode Produksi

1. **Identitas akses:** tetapkan pengenal stabil yang menghubungkan lead,
   checkout, dan pembacaan status akses. Pengenal tersebut harus berupa ID
   acak/opaque, bukan nomor WhatsApp sebagai kredensial. Penggunaannya tidak
   boleh berubah menjadi device binding tanpa keputusan baru.
2. **Pemulihan akses:** tentukan jalur saat instal ulang atau pindah perangkat.
   Pilih dan dokumentasikan apakah pemulihan dilakukan melalui verifikasi kontak
   + bantuan, kode aktivasi, atau mekanisme lain yang disetujui.
3. **Siklus langganan:** tetapkan kapan masa akses dimulai, aturan pembayaran
   tertunda/ganda, refund, chargeback, kegagalan webhook, serta siapa yang boleh
   melakukan koreksi manual. Jangan mengisi aturan ini secara tersirat di kode.
4. **Autentikasi endpoint aplikasi:** pilih mekanisme untuk mengikat setiap
   permintaan ke identitas akses tanpa menaruh secret server di klien. Kontrak
   ini harus mencakup rotasi, kedaluwarsa, dan penanganan kebocoran token.

### Kontrak API Minimum yang Dirancang

Nama URI dapat berubah, tetapi batas tanggung jawab berikut wajib dipertahankan.

| Endpoint | Pelaku | Hasil | Kontrol utama |
| --- | --- | --- | --- |
| POST /v1/leads | Aplikasi | Pencatatan/upsert lead dan referensi opaque. | Validasi input, idempotency key, rate limit, minimisasi data, dan audit log. |
| POST /v1/checkout-sessions | Aplikasi teridentifikasi | orderId, URL/token checkout berumur pendek, dan status awal. | Paket/harga/masa akses dihitung ulang di server; idempotent per permintaan bisnis. |
| GET /v1/access | Aplikasi teridentifikasi | Status akses, paket efektif, dan masa berlaku. | Tidak mengembalikan data lead atau metadata pembayaran yang tidak diperlukan. |
| POST /v1/webhooks/midtrans | Midtrans | Penerimaan notifikasi pembayaran. | Verifikasi signature/status di server, raw-body handling bila dibutuhkan, idempotensi order_id, dan audit event. |

Kontrak request/response harus divalidasi dengan schema di server dan klien.
Respons API tidak boleh memuat Server Key, token aktivasi mentah, nomor
WhatsApp lengkap di log, atau data bisnis lokal.

### Data dan Status Minimum

| Area | Data minimum |
| --- | --- |
| Lead | ID opaque, nama, nama usaha, WhatsApp, jenis usaha, email/lokasi bila ada, consent marketing, versi/hash/waktu persetujuan, status pengiriman. |
| Order | order_id unik, ID akses, paket, harga server, mata uang, waktu dibuat/kedaluwarsa, dan status bisnis. |
| Webhook | ID event/jejak payload yang diminimalkan, hasil verifikasi, waktu diterima/diproses, order_id, dan kegagalan proses. |
| Aktivasi | Referensi order, entitlement yang diterbitkan, mulai/akhir akses, waktu terbit, serta hash token/bukti yang diperlukan. |

Status pembayaran dan akses harus dipisahkan. pembayaran_menunggu bukan
akses_berbayar_aktif; aktivasi hanya boleh dilakukan oleh transisi server
setelah webhook berhasil diverifikasi.

### Keamanan, Backup, dan Operasi

- Simpan Server Key Midtrans dan secret lain di penyimpanan secret server;
  jangan masukkan ke repository, .env klien, bundle Vite, log, atau pesan error
  aplikasi.
- Terapkan TLS, pembatasan akses operator, least privilege pada database,
  audit akses administratif, rate limit, validasi payload, dan redaksi data
  pribadi pada log.
- Enkripsi backup, simpan di Indonesia sesuai keputusan induk, tetapkan retensi,
  lakukan backup terjadwal, serta uji restore secara berkala dengan bukti hasil.
- Siapkan alert untuk webhook gagal, order menunggu terlalu lama, error
  pembuatan checkout, kegagalan backup, dan kapasitas/akses tidak wajar.
- Buat runbook untuk pembayaran ganda, order kedaluwarsa, refund/chargeback,
  webhook duplikat/tidak berurutan, serta pembayaran sukses yang belum muncul
  pada aplikasi.

### Kriteria Penerimaan

- VPS, domain HTTPS, database terpisah, akses operator, secret, backup, dan
  pemulihan telah diprovision dan didokumentasikan tanpa secret di repository.
- API lead dapat diulang aman ketika aplikasi kembali online; duplikasi tidak
  menghasilkan lead atau consent baru yang tidak sah.
- Server menolak paket, harga, dan masa akses yang hanya berasal dari klien;
  nilai otoritatif selalu berasal dari katalog billing server.
- Webhook valid dapat mengaktifkan/memperpanjang akses satu kali; webhook yang
  sama, terlambat, tidak valid, atau urutannya salah tidak menggandakan akses.
- Aplikasi bisa mengambil ulang aktivasi saat kembali ke foreground atau dibuka
  ulang, termasuk bila pengguna tidak kembali melalui app link.
- Uji integrasi sandbox dan skenario kegagalan di atas lulus sebelum kredensial
  produksi digunakan.
- Runbook dan hasil uji restore disetujui oleh pemilik operasional layanan.

## Workstream 3 — Syarat Layanan, Kebijakan Privasi, dan PSE

### Deliverable

1. Draf **Syarat Layanan** terpisah yang mencakup identitas/kontak penyedia,
   ruang lingkup lisensi, trial, langganan, harga/pajak, pembayaran, upgrade dan
   downgrade, dukungan, tanggung jawab backup lokal, batasan layanan, ekspor
   data, serta mekanisme penanganan kasus pembayaran.
2. Draf **Kebijakan Privasi** terpisah yang memetakan data lead dan metadata
   billing, tujuan pemrosesan, penerima/pengolah yang relevan, retensi, hak
   subjek data, penarikan consent marketing, kanal permintaan, dan prosedur
   insiden.
3. Inventaris data dan catatan keputusan yang memetakan setiap field aplikasi
   dan layanan ke tujuan, dasar pemrosesan, retensi, akses, serta lokasi simpan.
4. Paket peninjauan hukum Indonesia, revisi berdasarkan hasil peninjauan, versi
   final, hash, tanggal berlaku, serta proses publikasi dan arsip versi lama.
5. Pendaftaran PSE Lingkup Privat dan folder bukti yang diperlukan sebelum
   rilis publik.

### Implementasi Produk yang Bergantung pada Legal

- Onboarding memuat versi dan hash Syarat Layanan/Kebijakan Privasi yang
  berlaku, waktu persetujuan, serta bukti bahwa trial tidak dapat dimulai tanpa
  langkah wajib tersebut.
- Consent marketing adalah field dan kontrol terpisah; nilai defaultnya false.
  Penarikan consent mengubah status untuk follow-up berikutnya tanpa menghapus
  catatan persetujuan sebelumnya.
- Halaman publik, saluran bantuan, dan proses internal harus memakai naskah
  final yang sama; jangan menampilkan draf hukum sebagai dokumen yang mengikat.
- Rilis publik diblokir sampai peninjauan hukum dan status PSE dinyatakan
  selesai oleh pemilik yang berwenang.

### Kriteria Penerimaan

- Naskah final telah ditinjau dan disetujui pihak hukum yang ditunjuk pemilik
  produk; dokumen ini bukan pengganti peninjauan hukum tersebut.
- Produk hanya menyimpan persetujuan terhadap versi dokumen final yang berlaku
  dan dapat menampilkan bukti versinya kembali.
- Marketing tidak dikirim bila consent tidak ada, ditarik, atau tidak valid.
- Pendaftaran PSE dan bukti/nomor yang relevan telah disimpan oleh pemilik
  operasional sebelum peluncuran publik.
- Checklist rilis legal memiliki pemilik, tanggal verifikasi, dan bukti yang
  dapat diaudit.

## Workstream 4 — Wizard, Gate Akses, Backup, dan Checkout

### Alur Produk yang Dibangun

~~~
Registrasi lokal
  -> pilih paket
  -> setup akuntansi atau lewati
  -> setujui dokumen wajib (+ consent marketing opsional)
  -> trial aktif dan antrean lead bila offline
  -> status trial/langganan + reminder Rabu
  -> checkout saat upgrade/perpanjangan
  -> webhook tervalidasi
  -> aplikasi menyegarkan status akses lokal
~~~

Ketika masa akses habis, alur menjadi:

~~~
akses_habis
  -> layar blokir
      -> Bayar sekarang -> checkout -> sinkronisasi aktivasi
      -> Ekspor backup -> fungsi backup yang sudah ada
~~~

### Pekerjaan UI dan State

1. Buat model status lokal untuk onboarding, profil registrasi, antrean lead,
   persetujuan dokumen, entitlement paket, trial, status akses, checkout
   menunggu, dan aktivasi terakhir. Sertakan migrasi Dexie dan backup/restore
   bila data tersebut perlu dipertahankan di backup pengguna.
2. Buat satu access-policy service/hook yang membedakan hak **melihat**,
   **membuat/mengubah**, **menjalankan laporan operasional**, **membayar**, dan
   **mengekspor backup**. Semua rute dan aksi mutasi memakai policy ini; jangan
   hanya menyembunyikan tombol.
3. Bangun wizard desktop dan Android sebagai dua flow yang disesuaikan dengan
   platform, mengikuti urutan serta keadaan offline pada dokumen referensi.
   Pengguna harus dapat menutup aplikasi dan melanjutkan dari langkah terakhir
   tanpa kehilangan isian valid.
4. Buat halaman status akses yang menunjukkan paket efektif, sisa trial/masa
   akses, status pembayaran yang masih diproses, serta CTA sesuai kondisi.
5. Buat reminder in-app setiap Rabu. Reminder hanya informatif dan harus
   mengarahkan pengguna ke halaman status; jangan menyatakan pembayaran sukses
   sebelum status akses dari billing telah diterima.
6. Buat layar blokir global yang tidak dapat dilewati lewat deep link atau aksi
   service. Layar ini menampilkan **Bayar sekarang** dan **Ekspor backup**
   sebagai aksi yang terlihat jelas.
7. Gunakan fungsi backup yang ada untuk ekspor dari layar blokir. Jika ekspor
   membutuhkan izin file/platform, tampilkan status gagal yang dapat dipahami
   dan jangan membuka mutasi data sebagai jalan keluar.
8. Integrasikan checkout: desktop membuka surface yang disetujui aplikasi;
   Android menggunakan browser eksternal melalui API platform. App link hanya
   mempercepat kembali ke aplikasi; refresh status saat foreground tetap wajib.

### Matriks Hak Minimum

| Status akses | Lihat data | Buat/ubah data | Laporan operasional | Checkout | Ekspor backup |
| --- | --- | --- | --- | --- | --- |
| Onboarding belum selesai | Terbatas pada wizard | Hanya data onboarding | Tidak | Tidak | Tidak diperlukan |
| Trial aktif | Ya | Ya | Ya | Ya | Ya |
| Pembayaran menunggu | Ya | Sesuai akses yang belum berakhir | Sesuai akses yang belum berakhir | Lihat/periksa status | Ya |
| Akses berbayar aktif | Ya | Ya | Ya | Ya | Ya |
| Akses habis | Sesuai layar blokir/status | Tidak | Tidak | Ya | Ya |

Detail mengenai data historis yang masih boleh dilihat pada akses_habis harus
ditetapkan pada desain UX sebelum gate global diimplementasikan. Keputusan itu
harus konsisten pada desktop, Android, ekspor, dan deep link.

### Kriteria Penerimaan

- Pengguna baru tidak dapat masuk ke penggunaan operasional sebelum registrasi,
  paket, dan persetujuan dokumen wajib selesai.
- Registrasi dapat disimpan lokal ketika offline dan dikirim kembali secara
  idempoten saat koneksi tersedia.
- Trial dihitung maksimal 90 hari dan statusnya konsisten pada restart,
  perubahan zona waktu, serta jam perangkat yang tidak wajar sesuai kebijakan
  lokal tahap awal.
- Tidak satu pun jalur mutasi, laporan operasional, deep link, shortcut, atau
  pemanggilan service dapat melewati blokir akses habis.
- Layar blokir desktop maupun Android menyediakan checkout dan ekspor backup;
  ekspor menghasilkan backup aplikasi yang dapat dipulihkan dalam pengujian.
- Checkout Android tidak memakai WebView. Pembayaran yang selesai tetapi tidak
  kembali melalui app link tetap tersinkron setelah aplikasi dibuka kembali.
- Pengingat hari Rabu hanya muncul sekali pada periode yang ditetapkan dan
  memakai CTA yang sesuai status akses.
- Flow dapat diakses dengan keyboard/pembaca layar di desktop serta mendukung
  safe area, keyboard virtual, dan tombol/gestur kembali di Android.

## Pengujian End-to-End Wajib

| Skenario | Bukti lulus |
| --- | --- |
| Paket POS baru | CASH_FLOW dan CHART_OF_ACCOUNTS aktif, GENERAL_LEDGER tidak aktif, dan rute non-GL tetap berfungsi. |
| Konfigurasi lama | Setup dengan GL eksplisit tidak kehilangan akses setelah migrasi katalog dan sinkronisasi. |
| Onboarding offline | Data registrasi dan persetujuan tersimpan lokal, kemudian lead terkirim sekali setelah perangkat online. |
| Trial | Mulai, sisa satu hari, habis, dan pengingat Rabu menghasilkan status/CTA yang tepat. |
| Akses habis | Mutasi dan laporan operasional tertolak di UI maupun service; checkout dan backup tetap tersedia. |
| Pembayaran | Order dibuat dari harga server, webhook valid mengaktifkan akses sekali, dan webhook duplikat/tidak valid tidak mengaktifkan akses. |
| Android | Checkout dibuka di browser eksternal; status dapat pulih jika pengguna menutup browser tanpa app link. |
| Backup | Backup dari layar blokir berhasil diekspor dan dipulihkan pada lingkungan uji. |

Pengujian harus mencakup desktop dan Android secara terpisah. Skenario Midtrans
awalnya dijalankan di sandbox, lalu diverifikasi kembali dengan konfigurasi
produksi secara terkendali sebelum rilis.

## Gerbang Rilis

Rilis publik hanya boleh disetujui bila seluruh kondisi berikut terpenuhi:

- Entitlement paket dan normalisasi GL lulus tes regresi serta review kode.
- Katalog harga server, checkout, webhook tervalidasi, idempotensi, dan refresh
  akses telah lulus uji sandbox serta uji produksi terkendali.
- Secret, backup terenkripsi, uji restore, monitoring, dan runbook operasional
  tersedia dan memiliki pemilik.
- Syarat Layanan dan Kebijakan Privasi versi final telah ditinjau hukum dan
  sudah terpaut ke persetujuan onboarding.
- PSE Lingkup Privat telah diselesaikan dan bukti administrasinya tersedia.
- Wizard, layar blokir, backup, dan checkout telah lulus pengujian end-to-end
  pada desktop serta Android.
- Pemilik produk menyetujui keputusan yang masih terbuka pada workstream 2 dan
  kebijakan visibilitas data ketika akses habis.

## Pembagian Sub-Issue yang Disarankan

1. **F1 — Normalisasi Setup dan Katalog Entitlement Paket**
2. **F2 — Kontrak API, Database, dan Operasi Layanan Lead/Billing**
3. **F3 — Provisioning VPS, Secret, Backup, Monitoring, dan Webhook Midtrans**
4. **F4 — Naskah Legal, Inventaris Data, dan Pendaftaran PSE**
5. **F5 — Model Status Lokal, Trial, Consent, dan Gate Akses**
6. **F6 — Wizard Onboarding Desktop dan Android**
7. **F7 — Status Langganan, Layar Blokir, Reminder, dan Ekspor Backup**
8. **F8 — Integrasi Checkout dan Aktivasi Midtrans End-to-End**
9. **F9 — QA Rilis, Runbook, dan Go/No-Go**

Setiap sub-issue harus menyebut dependensi, perubahan skema/migrasi, skenario
tes, serta pemilik keputusan operasional yang terkait. F4 dan F9 adalah gerbang
peluncuran; keduanya tidak dapat dianggap selesai hanya dengan perubahan kode.

