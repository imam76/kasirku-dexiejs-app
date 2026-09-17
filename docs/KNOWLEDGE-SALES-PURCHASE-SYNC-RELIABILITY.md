# Knowledge: Keandalan Sync Sales dan Purchase

Tanggal pencatatan: 16 September 2026.

Dokumen ini menyimpan hasil pembahasan mengenai dokumen sales/purchase yang sudah
posting dan terlihat tersinkron, tetapi belum tampil atau belum diperbarui pada
perangkat lain setelah gangguan listrik, koneksi, atau pergantian IP.

Status: hasil audit kode, rekomendasi desain, dan implementasi pemulihan awal
(lihat bagian 7). Penyebab insiden operasional belum
dikonfirmasi menggunakan dokumen terdampak dari perangkat pengirim, PostgreSQL,
dan perangkat penerima. Bagian 1–6 mencatat kondisi audit awal dan rancangan;
tidak semua rekomendasi sudah diimplementasikan.

Dokumen terkait: [Tech Debt Phase 1: Sync Architecture](TECH-DEBT-PHASE-1-SYNC-ARCHITECTURE.md).

## 1. Kesimpulan utama

Pertahankan Dexie sebagai penyimpanan lokal dan PostgreSQL sebagai pusat pertukaran
data. Perkuat tiga jaminan:

1. Setiap perubahan lokal yang tersimpan memiliki catatan pengiriman yang tahan restart.
2. Server mengonfirmasi operasi yang benar-benar diterima dan membedakannya dari konflik.
3. Perangkat penerima dapat mengejar seluruh perubahan yang tertinggal, termasuk
   perubahan yang dibuat offline dan baru tiba di server kemudian.

Status `synced` di perangkat pengirim tidak membuktikan bahwa semua perangkat lain
sudah menerima data. Pisahkan keberhasilan upload, penerimaan server, dan kemajuan pull.

## 2. Temuan audit dan batas kepastiannya

### 2.1. Kandidat terkuat: upload terlambat berada di belakang cursor penerima

Sales dan purchase menggunakan `(updated_at, id)` sebagai cursor pull. Timestamp
`updated_at` berasal dari perangkat pembuat perubahan dan ikut dikirim ke server.

Contoh:

1. Perangkat A posting offline pukul 10:00; dokumen memiliki `updated_at = 10:00`.
2. Perangkat B menarik dokumen lain sampai cursor pukul 10:05.
3. A tersambung pukul 10:10 dan berhasil mengirim dokumen dengan timestamp 10:00.
4. B meminta perubahan setelah cursor 10:05 sehingga dokumen A tidak terambil.

Dalam skenario ini, upload dan status `synced` pengirim bisa benar. Masalah terjadi
pada pull penerima. Refresh berulang dengan cursor yang sama tidak memperbaikinya;
diperlukan perubahan yang melewati cursor atau penarikan ulang/rekonsiliasi.

Referensi kode:

- [salesDocumentReadService.ts](../src/services/salesDocumentReadService.ts): `refreshSalesDocumentsFromPostgres`.
- [purchaseDocumentReadService.ts](../src/services/purchaseDocumentReadService.ts): `refreshPurchaseDocumentsFromPostgres`.
- [sales_document_repository.rs](../src-tauri/src/repositories/sales_document_repository.rs): `list_sales_document_bundles`.
- [purchase_document_repository.rs](../src-tauri/src/repositories/purchase_document_repository.rs): `list_purchase_document_bundles`.

Masalah serupa telah ditangani untuk purchase cost reconciliation menggunakan
timestamp kedatangan server. Lihat
[migration 0081](../src-tauri/migrations/0081_purchase_cost_reconciliation_server_created_at.sql).
Ini menjadi referensi masalah upload terlambat, bukan bukti bahwa timestamp server
saja sudah menyelesaikan seluruh persoalan urutan commit bersamaan.

### 2.2. Konflik dapat terlihat sebagai pengiriman selesai

Repository sales/purchase menolak overwrite yang kalah dalam perbandingan
`version + updated_at`, tetapi kemudian mengembalikan row server yang sudah ada
sebagai hasil sukses. Queue menandai pengiriman selesai tanpa kontrak eksplisit
bahwa perubahan lokal diterima atau ditolak sebagai konflik.

Mengembalikan versi server yang menang dapat merupakan kebijakan konflik. Celahnya
adalah aplikasi belum membedakan perubahan lokal yang diterima dari perubahan
lokal yang kalah. Untuk posting, dampaknya harus ditinjau bersama stok dan jurnal.

Referensi: fungsi `upsert_sales_document_bundle`, `upsert_purchase_document_bundle`,
dan pemrosesan bundle di [syncQueueService.ts](../src/services/syncQueueService.ts).

### 2.3. Recovery dan indikator belum membuktikan konsistensi antarperangkat

- Full sync otomatis dipicu pada ketersediaan awal atau transisi koneksi dari
  unavailable ke available. Pemeriksaan sehat berulang tidak menjalankan catch-up.
- Listener realtime dapat terputus sementara koneksi pool tetap dianggap sehat.
- Indikator online memakai `navigator.onLine`; label tersimpan berlandaskan status
  antrean lokal, bukan verifikasi kelengkapan data di server atau perangkat lain.
- Identitas host diperiksa dalam flow pergantian host, tetapi binding rutin hanya
  mengisi identity yang belum tersimpan, bukan membandingkan ulang setiap reconnect.

Referensi: [worker](../src/hooks/useSyncQueueWorker.ts),
[connection helper](../src/utils/postgresConnection.ts),
[indikator status](../src/components/SyncStatusIndicator.tsx), dan
[host identity](../src/services/hostIdentityService.ts).

### 2.4. Mati listrik atau pergantian IP belum terbukti membuat sukses palsu

Backend upsert menunggu commit sebelum mengembalikan sukses. Gangguan sebelum
respons diterima normalnya menghasilkan kegagalan atau meninggalkan pekerjaan
processing. Respons juga dapat hilang setelah server berhasil commit; kasus ini
memerlukan retry yang tidak menggandakan dampak operasi.

Gangguan listrik/koneksi lebih masuk akal sebagai pemicu upload terlambat,
recovery yang terlewat, atau koneksi ke database berbeda. Perubahan IP sendiri
bukan perubahan dataset apabila identitas database tetap sama.

Audit menggunakan implementasi aktif `src/services/syncQueueService.ts`. Pada saat
audit, folder `src/services/syncQueue/` yang disebut dalam tab IDE belum tersedia
di worktree. Periksa ulang lokasi implementasi sebelum menjalankan rencana ini.

## 3. Pembuktian dan pemulihan kasus yang sudah terjadi

Sebelum mengubah status sync, kumpulkan untuk beberapa dokumen terdampak:

- ID, nomor dokumen, status bisnis, version, dan updated_at di pengirim dan server.
- Status/payload queue, operation bila tersedia, error, serta waktu percobaan terakhir.
- Record lokal penerima dan cursor entity sales/purchase pada penerima.
- Identitas database yang benar-benar dipakai masing-masing perangkat.

Jika row sudah ada di server tetapi `(updated_at, id)` berada pada atau di belakang
cursor penerima, kasus cursor yang melewatkan perubahan terkonfirmasi. Jika row
server berbeda dari payload, periksa konflik. Jika row server tidak ada meskipun
queue terlihat synced, periksa target database dan kemungkinan restore dataset.

Pemulihan dilakukan setelah backup data terdampak, dengan penarikan ulang terarah
sales/purchase secara bertahap. Pertahankan perubahan lokal pending/failed dan
simpan konflik untuk diperiksa. Reset cursor terarah dapat menjadi langkah
pemulihan, tetapi bukan perbaikan akar masalah.

Jangan menjadikan pengubahan seluruh record menjadi pending lalu upload ulang
sebagai prosedur umum. Data lokal lama dapat menimpa versi server yang lebih baru
atau memicu ulang dampak bisnis jika idempotensi belum lengkap.

## 4. Rancangan sync yang direkomendasikan

### 4.1. Transactional outbox lokal

Simpan dokumen, dampak bisnis lokal, dan catatan pengiriman dalam satu transaksi
Dexie. Saat ini enqueue sales/purchase dilakukan setelah transaksi dokumen selesai;
aplikasi dapat mati di antara kedua tahap tersebut.

Setiap operasi memiliki `operation_id` tetap untuk seluruh retry. Pengiriman ulang
operasi yang sama harus menghasilkan dampak bisnis yang sama tanpa penambahan stok,
pembayaran, atau jurnal kedua kali. Pemindaian record pending yang belum memiliki
queue tetap berguna untuk recovery data legacy.

### 4.2. Konfirmasi server dan konflik eksplisit

| Hasil server | Tindakan perangkat |
| --- | --- |
| `accepted` | Operasi telah commit; tandai revisi lokal terkait selesai. |
| `already_applied` | Operasi identik pernah diterapkan; aman menyelesaikan retry. |
| `conflict` | Simpan versi lokal dan server untuk penyelesaian. |
| Gangguan koneksi | Jadwalkan retry dengan operation_id yang sama. |
| Validasi ditolak | Tampilkan alasan dan tunggu koreksi. |

Konfirmasi menyebut operation_id, ID dokumen, dan revisi yang diterima. Respons
untuk revisi lama tidak boleh membuat perubahan lokal yang lebih baru ikut synced.
Catatan operasi yang telah diterapkan harus commit bersama perubahan bisnis di server.

Gunakan versi server yang menjadi dasar perubahan untuk mendeteksi konflik. Dua
perangkat yang mengubah versi awal sama tidak boleh diam-diam saling menimpa hanya
berdasarkan jam perangkat. Konflik dokumen posting membutuhkan aturan domain yang
menjaga hubungan dokumen, stok, dan jurnal.

### 4.3. Cursor berdasarkan urutan perubahan server

Gunakan catatan perubahan server dengan `server_revision` terpisah dari timestamp
bisnis dan version dokumen. Perubahan yang baru tiba mendapat revisi pengiriman
baru meskipun dibuat offline beberapa hari sebelumnya.

Urutan revisi wajib aman terhadap transaksi bersamaan. Pilihan awal untuk skala
toko adalah counter transaksional yang dikunci sampai commit. Catatan perubahan
dan perubahan bisnis disimpan dalam transaksi server yang sama, dan semua jalur
penulisan terkait harus mengikuti kontrak tersebut.

`BIGSERIAL` saja tidak menjamin urutan commit: transaksi yang mendapat nomor lebih
kecil dapat commit setelah transaksi bernomor lebih besar. Timestamp server saja
juga belum memberikan jaminan ini. Uji urutan commit secara eksplisit.

Di penerima, simpan hasil pull dan cursor dalam satu transaksi Dexie. Jika row
remote berbenturan dengan perubahan lokal, simpan informasi konfliknya secara
permanen sebelum cursor maju. Jangan sekadar melewati row pending lalu melupakan
perubahan remote tersebut.

Migrasi cursor memerlukan backfill yang dapat dilanjutkan setelah restart dan
transisi yang tidak kehilangan perubahan selama backfill berlangsung.

### 4.4. Worker recovery dan catch-up berkala

Jalankan worker saat startup, reconnect, aplikasi kembali aktif, dan berkala.
Interval 30-60 detik merupakan usulan konfigurasi awal, bukan angka final yang
sudah diuji terhadap beban aplikasi.

Worker memproses antrean, memulihkan pekerjaan yang terhenti, menjadwalkan retry
gangguan sementara dengan jeda meningkat, dan menarik perubahan tertinggal.
Pisahkan konflik/validasi dari retry jaringan dan cegah worker yang tumpang tindih.

Realtime mempercepat pembaruan, sementara catch-up membaca perubahan yang tersimpan
agar notifikasi yang terlewat tidak menyebabkan data hilang dari penerima.

### 4.5. Konsistensi satu operasi posting

Targetnya dokumen, item, stok, dan jurnal yang berasal dari satu posting diterima
dalam satu transaksi server. Seluruh dampak menggunakan identitas operasi yang
konsisten agar retry tetap aman.

Sebelum bundle posting atomik tersedia, lacak kelengkapan kelompok pengiriman dan
tampilkan status tersinkron sebagian. Sukses mengirim header dokumen belum cukup
untuk menyatakan seluruh dampak posting telah diterima.

### 4.6. Rekonsiliasi, identitas host, dan status UI

Sediakan pemeriksaan berkala dan fitur "Periksa & perbaiki sinkronisasi" yang
membandingkan ID, revisi, dan kelengkapan bundle, termasuk record berstatus synced.
Record yang hilang atau berbeda perlu ditentukan penyebabnya sebelum diperbaiki;
jangan otomatis menganggap salinan lokal atau server selalu benar dalam kasus restore.

Periksa identitas database sebelum push/pull dan setelah reconnect. IP boleh
berubah selama database tetap sama. Pergantian dataset dan restore database juga
memerlukan penanganan cursor yang jelas; identity lama saja belum membuktikan
dataset tidak pernah dipulihkan ke keadaan sebelumnya.

Status UI yang disarankan: tersimpan lokal, menunggu kirim, diterima server,
tersinkron sebagian, konflik, dan gagal. Tampilkan pula waktu pull terakhir.
Label diterima server tidak menyatakan bahwa semua perangkat sudah menerima data.

## 5. Prioritas implementasi dan verifikasi

Rilis awal diprioritaskan untuk pemulihan data lama, cursor server yang aman,
outbox atomik, konfirmasi operasi, dan worker recovery. Kelengkapan posting,
rekonsiliasi berkala, serta pemeriksaan host harus masuk rencana keandalan yang sama.

| Skenario uji | Hasil yang diwajibkan |
| --- | --- |
| Mati saat menyimpan dokumen/outbox | Keduanya tersimpan bersama atau keduanya batal. |
| Mati sebelum commit server | Retry melanjutkan operasi tanpa kehilangan perubahan. |
| Commit berhasil, respons hilang | Retry dikenali; dampak bisnis tidak ganda. |
| Upload offline datang setelah cursor maju | Penerima tetap mendapatkan perubahan. |
| Jam perangkat berbeda atau mundur | Pengiriman tidak terlewat karena waktu perangkat. |
| Transaksi server commit dalam urutan berbeda | Cursor tidak melewati perubahan yang baru terlihat kemudian. |
| Dua perangkat mengubah versi awal yang sama | Konflik terdeteksi dan dapat ditelusuri. |
| Lokal berubah saat respons operasi lama tiba | Revisi lokal terbaru tetap menunggu pengiriman. |
| Restart saat pull/backfill | Data dan cursor konsisten; pekerjaan dapat dilanjutkan. |
| Listener realtime terputus | Catch-up berkala menemukan perubahan tertinggal. |
| Satu bagian posting gagal | Tidak ditampilkan sebagai posting tersinkron lengkap. |
| IP berubah, database sama | Sync dapat dilanjutkan dengan identity yang sama. |
| Database berbeda atau dipulihkan dari backup | Mismatch ditangani tanpa mencampur dataset atau memakai cursor usang. |

Pada audit awal, 11 unit test dari `offline-postgres.test.ts`, `sync-cursor.test.ts`,
dan `host-switch.test.ts` lolos. Test tersebut belum membuktikan skenario upload
terlambat atau penyebab insiden pengguna. Matriks di atas adalah kebutuhan
verifikasi untuk implementasi berikutnya, bukan daftar pengujian yang sudah selesai.

## 6. Referensi PostgreSQL

- [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html): notifikasi
  dikirim kepada listener yang terdaftar dan baru disampaikan setelah transaksi
  pengirim commit; catch-up tetap memerlukan data yang tersimpan.
- [Sequence manipulation functions](https://www.postgresql.org/docs/current/functions-sequence.html):
  alokasi sequence terjadi sebelum transaksi selesai dan tidak dibatalkan bersama
  rollback; sequence unik tidak dengan sendirinya membuktikan urutan commit.

## 7. Implementasi pemulihan awal — 16 September 2026

### Cara menggunakan

Pada perangkat yang kehilangan transaksi, buka **Sync DB → Kelengkapan dokumen
sales & purchase → Periksa & perbaiki dokumen**. Fitur memerlukan aplikasi Tauri
dan koneksi PostgreSQL yang sehat. Tidak perlu menghapus data lokal atau cursor.

Pemeriksaan membaca ulang seluruh dokumen sales/purchase, 100 bundle per halaman,
tanpa menggunakan atau mengubah cursor delta. Dengan demikian dokumen yang datang
terlambat dan berada di belakang cursor tetap dapat ditemukan. Dokumen yang belum
ada di lokal dan item lokal yang hilang dipulihkan dari server. Item hilang hanya
dipulihkan otomatis bila header dan seluruh item lokal yang masih ada cocok.
Versi server yang lebih baru diterapkan mengikuti urutan version/updated_at yang
sudah digunakan aplikasi. Pemeriksaan isi menggunakan field yang tercakup mapper
sync saat ini, bukan semua field lokal yang belum mempunyai kontrak PostgreSQL.

Hasil menampilkan jumlah diperiksa, dipulihkan, dan perlu ditinjau. Tombol
**Ekspor hasil pemeriksaan** menghasilkan JSON berisi laporan dan snapshot
perbandingan lokal/server. Snapshot lokal sebelum penggantian serta perbedaan
yang belum diselesaikan disimpan di Dexie, terpisah dari antrean upload. Ekspor
dapat mengandung rincian transaksi; simpan bersama bukti insiden internal.

### Tindakan untuk setiap hasil

| Kondisi | Perilaku |
| --- | --- |
| Ada di server, tidak ada di perangkat | Tarik header dan item otomatis. |
| Item lokal hilang, header/item lain cocok | Pulihkan bundle server otomatis. |
| Server lebih baru, lokal tidak pending | Simpan snapshot lokal lalu terapkan bundle server. |
| Lokal pending/failed atau ada queue aktif | Pertahankan lokal; tampilkan belum selesai dikirim. Gunakan Sync sekarang/Retry lalu periksa ulang. |
| Lokal synced, server tidak punya ID tersebut | Konfirmasi dengan get-by-ID lalu catat `missing_remote`; tidak upload ulang secara buta. |
| Lokal lebih baru atau isi berbeda pada revisi sama | Simpan kedua salinan untuk ditinjau; tidak memilih pemenang otomatis. |
| Identitas database berbeda | Hentikan pemeriksaan; periksa pengaturan host. |
| Koneksi putus di tengah pemeriksaan | Tandai gagal, pertahankan hasil halaman yang sudah commit, ulang dari awal pada percobaan berikutnya. |

Data yang hilang di **server** masih memerlukan penentuan salinan yang benar
(termasuk kemungkinan restore database), beserta pemeriksaan stok/jurnal terkait.
Fitur ini belum menyediakan pemulihan server atau penyelesaian konflik posting
otomatis. Ekspor dari kedua perangkat membantu membandingkan kasus tersebut.

### Otomatisasi dan penjagaan

- Worker melakukan catch-up normal paling sering setiap 60 detik setelah health
  check sukses, termasuk ketika realtime kehilangan notifikasi. Health check tetap
  berjalan setiap 10 detik. Satu worker tidak menjalankan recovery tumpang tindih.
- Rekonsiliasi penuh berjalan pada startup/koneksi pulih dan setiap 15 menit
  selama aplikasi aktif. Kembali ke aplikasi menjalankan pemeriksaan koneksi;
  interval tetap membatasi frekuensi pekerjaan. Pemanggilan manual/otomatis yang
  bersamaan menunggu promise pemeriksaan yang sama.
- Revisi lokal, queue aktif, penyimpanan snapshot dan penerapan bundle diperiksa
  dalam transaksi Dexie yang sama. Edit lokal selama request jaringan dilindungi.
- Pull normal/realtime juga mempertahankan queue aktif dan konflik terbuka yang
  sudah tercatat. Konflik dapat ditutup ketika pemeriksaan berikutnya membuktikan
  data cocok; snapshot terakhir tetap tersedia.
- Identitas host dibandingkan sebelum drain queue, full refresh, dan selama
  rekonsiliasi. Ini bukan jaminan deteksi restore yang mempertahankan instance ID,
  ataupun pengikatan atomik seluruh request ke satu generasi koneksi backend.
- Upload sales/purchase memeriksa ID/status/version/updated_at pada respons.
  Respons dengan revisi berbeda menghasilkan error `CONFLICT`, mempertahankan
  payload queue dan tidak membuat revisi lokal menjadi synced. Ini belum kontrak
  `operation_id`, belum mendeteksi seluruh konflik dengan revisi sama, dan belum
  membuat posting beserta efek stok/jurnal atomik.

Implementasi utama:

- [documentSyncReconciliationService.ts](../src/services/documentSyncReconciliationService.ts)
- [documentSyncComparison.ts](../src/services/shared/documentSyncComparison.ts)
- [DocumentSyncReconciliationPanel.tsx](../src/components/DocumentSyncReconciliationPanel.tsx)
- [migrasi Dexie v139](../src/lib/database/migrations/versions/v139.ts)

Ini adalah rekonsiliasi berkala yang memulihkan celah cursor lama, **belum migrasi
ke server_revision**. Perubahan yang commit di belakang halaman selama scan bisa
baru ditemukan pada scan berikutnya. Biaya scan tumbuh mengikuti jumlah dokumen;
interval 15 menit dan ukuran halaman 100 belum diuji terhadap beban produksi.
Verifikasi kelengkapan stok, pembayaran, jurnal, transactional outbox, receipt
operasi server, dan resolusi konflik domain tetap merupakan pekerjaan lanjutan.

### Verifikasi implementasi

- Unit test menguji klasifikasi perbedaan, perlindungan pending, normalisasi waktu,
  item duplikat, dan penolakan acknowledgement revisi berbeda.
- Integrasi Playwright menggunakan IndexedDB asli dan transport Tauri yang
  disimulasikan: upload terlambat di belakang cursor, lebih dari satu halaman,
  item hilang, konflik bertahan setelah refresh, pemeriksaan idempoten, laporan
  bertahan setelah database dibuka ulang, koneksi terputus pada halaman kedua,
  retry, host berbeda, serta upload konflik yang tetap failed.
- Pengujian transport simulasi bukan pembuktian insiden produksi atau pengujian
  commit bersamaan pada PostgreSQL sesungguhnya.
