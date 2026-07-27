Buat fitur **MVP Human Resources (HR)** sesuai pola aplikasi ERP korporasi dan mengikuti struktur, komponen, coding style, database, serta UI/UX project yang sudah ada.

## Tujuan

Membangun modul HR dasar untuk menyimpan data karyawan, status kepegawaian, struktur organisasi, dan informasi penggajian. Fokus hanya pada fitur inti yang siap digunakan, bukan HRIS kompleks.

## Menu

Tambahkan menu:

**Human Resources**

* Dashboard HR
* Karyawan
* Departemen
* Jabatan
* Kontrak Kerja
* Komponen Gaji

## 1. Dashboard HR

Tampilkan ringkasan:

* Total karyawan aktif
* Karyawan tetap
* Karyawan kontrak
* Karyawan dalam masa percobaan
* Karyawan masuk bulan ini
* Kontrak yang akan berakhir
* Distribusi karyawan per departemen

Gunakan card statistik dan tabel sederhana.

## 2. Data Karyawan

Sediakan halaman list, tambah, detail, edit, aktifkan, dan nonaktifkan karyawan.

### Data Pribadi

* Nomor karyawan, otomatis dan unik
* Nama lengkap
* Nama panggilan
* Foto
* Jenis kelamin
* Tempat lahir
* Tanggal lahir
* Status pernikahan
* Kewarganegaraan
* Nomor telepon
* Email pribadi
* Alamat sesuai identitas
* Alamat domisili
* Kontak darurat
* Hubungan kontak darurat
* Nomor telepon kontak darurat

### Identitas

* NIK
* Nomor KK
* NPWP
* Nomor BPJS Kesehatan
* Nomor BPJS Ketenagakerjaan

Semua nomor identitas harus disimpan sebagai string, bukan angka.

### Data Kepegawaian

* Perusahaan atau unit kerja
* Departemen
* Jabatan
* Atasan langsung
* Lokasi kerja
* Tanggal bergabung
* Status karyawan:

  * Probation
  * Kontrak
  * Tetap
  * Magang
  * Freelance
* Status aktif:

  * Aktif
  * Cuti panjang
  * Nonaktif
  * Resign
  * Diberhentikan
* Jenis jadwal kerja:

  * Full-time
  * Part-time
  * Shift
* Tanggal mulai kontrak
* Tanggal berakhir kontrak
* Tanggal pengangkatan tetap
* Tanggal keluar
* Alasan keluar

### Data Penggajian

* Metode pembayaran:

  * Transfer bank
  * Tunai
* Nama bank
* Nomor rekening
* Nama pemilik rekening
* Gaji pokok
* Mata uang
* Periode penggajian:

  * Bulanan
  * Mingguan
  * Harian
* Status wajib pajak
* PTKP
* Status kepesertaan BPJS
* Komponen tunjangan
* Komponen potongan

Data penggajian hanya dapat dilihat atau diubah oleh pengguna yang memiliki permission HR Payroll.

## 3. Departemen

Field:

* Kode departemen
* Nama departemen
* Kepala departemen
* Parent department
* Deskripsi
* Status aktif

Dukung struktur departemen bertingkat.

## 4. Jabatan

Field:

* Kode jabatan
* Nama jabatan
* Departemen
* Level jabatan
* Atasan jabatan
* Deskripsi
* Status aktif

## 5. Kontrak Kerja

Sediakan riwayat kontrak untuk setiap karyawan.

Field:

* Nomor kontrak
* Karyawan
* Jenis kontrak
* Tanggal mulai
* Tanggal berakhir
* Jabatan
* Departemen
* Gaji pokok
* Status kontrak:

  * Draft
  * Aktif
  * Berakhir
  * Diperpanjang
  * Dihentikan
* Catatan

Kontrak lama tidak boleh ditimpa ketika terjadi perpanjangan. Buat record kontrak baru agar riwayat tetap tersedia.

## 6. Komponen Gaji

Field:

* Kode komponen
* Nama komponen
* Jenis:

  * Pendapatan
  * Potongan
* Perhitungan:

  * Nominal tetap
  * Persentase
* Nilai default
* Status kena pajak
* Status aktif

Contoh komponen:

* Gaji pokok
* Tunjangan jabatan
* Tunjangan makan
* Tunjangan transportasi
* Bonus
* Lembur
* Potongan keterlambatan
* BPJS Kesehatan
* BPJS Ketenagakerjaan
* PPh 21

MVP belum perlu menghitung payroll otomatis. Komponen gaji hanya digunakan untuk menyimpan konfigurasi penggajian karyawan.

## Fitur Tabel

Setiap halaman daftar harus memiliki:

* Pencarian
* Filter status
* Filter departemen
* Filter jenis kepegawaian
* Sorting
* Pagination
* Tombol tambah
* Aksi lihat, edit, aktifkan, dan nonaktifkan
* Empty state
* Loading state
* Error state

## Validasi

* Nomor karyawan harus unik.
* NIK harus unik jika diisi.
* Email harus memiliki format valid.
* Tanggal berakhir kontrak tidak boleh lebih awal dari tanggal mulai.
* Tanggal keluar tidak boleh lebih awal dari tanggal bergabung.
* Karyawan nonaktif tidak boleh dipilih sebagai atasan baru.
* Departemen dan jabatan yang nonaktif tidak boleh digunakan pada data baru.
* Gaji tidak boleh bernilai negatif.

## Hak Akses

Buat permission:

* `hr.employee.view`
* `hr.employee.create`
* `hr.employee.update`
* `hr.employee.deactivate`
* `hr.organization.manage`
* `hr.contract.manage`
* `hr.payroll.view`
* `hr.payroll.manage`

Sembunyikan field sensitif jika pengguna tidak memiliki permission yang sesuai.

## Audit Trail

Catat aktivitas berikut:

* Membuat karyawan
* Mengubah data karyawan
* Mengubah status kepegawaian
* Mengubah jabatan atau departemen
* Membuat atau memperpanjang kontrak
* Mengubah data penggajian
* Menonaktifkan karyawan

Simpan pengguna, waktu, aksi, dan perubahan data penting.

## Ketentuan Teknis

* Gunakan komponen form, table, modal, drawer, date picker, select, input currency, upload, badge, dan confirmation dialog yang sudah tersedia.
* Gunakan soft delete atau status nonaktif untuk data master.
* Jangan melakukan hard delete terhadap karyawan yang sudah digunakan pada transaksi.
* Pisahkan data pribadi, kepegawaian, dan penggajian dalam tab atau section.
* Gunakan enum atau master reference untuk status yang sudah ditentukan.
* Buat migration, model/schema, service, API, validation, permission, halaman list, form, dan detail.
* Pastikan desain responsif, konsisten, rapi, dan tidak membuat satu form terlalu panjang.
* Gunakan Bahasa Indonesia pada label UI.
* Jangan menambahkan fitur rekrutmen, absensi, cuti, penilaian kinerja, payroll processing, atau reimbursement pada MVP ini.

---

## Audit Implementasi Saat Ini

Tanggal audit: **26 Juli 2026**

### Kesimpulan

Project belum dapat dianggap sebagai MVP HRIS sesuai requirement pada dokumen ini.

Dari enam menu fitur yang diwajibkan:

* **0 fitur lengkap**
* **2 fitur tersedia sebagian:** Karyawan dan Departemen
* **4 fitur belum tersedia:** Dashboard HR, Jabatan, Kontrak Kerja, dan Komponen Gaji

Implementasi yang tersedia saat ini lebih tepat disebut sebagai **master karyawan operasional, master departemen dasar, dan pemrosesan payroll**, bukan HRIS lengkap.

### Ringkasan Status

| Area | Status | Hasil Audit |
| --- | --- | --- |
| Menu Human Resources | Ada tetapi kurang | Route `/hr` dan menu utama sudah tersedia, tetapi hanya menampilkan Area, Karyawan, dan Payroll. Departemen belum masuk menu HR, sedangkan Jabatan, Kontrak Kerja, dan Komponen Gaji belum tersedia. |
| Dashboard HR | Belum ada | Halaman `/hr` hanya menjadi landing menu. Belum ada card statistik, kontrak berakhir, karyawan baru, atau distribusi karyawan per departemen. |
| Data Karyawan | Ada tetapi kurang | Sudah ada list, tambah, edit, nonaktifkan/arsipkan, aktifkan kembali, pencarian, filter aktif, pagination, dan empty state. Belum ada halaman atau drawer detail karyawan. |
| Data Pribadi Karyawan | Ada tetapi sangat terbatas | Model saat ini hanya menyimpan nama, telepon, email, satu alamat, jabatan teks bebas, catatan, area kerja, akun kas petugas, login, dan status aktif boolean. |
| Identitas Karyawan | Belum ada | Nomor karyawan, NIK, nomor KK, NPWP, BPJS Kesehatan, dan BPJS Ketenagakerjaan belum tersedia. |
| Data Kepegawaian | Belum memadai | Belum ada perusahaan/unit kerja, relasi departemen, master jabatan, atasan langsung, lokasi kerja, tanggal bergabung, status kepegawaian, jenis jadwal kerja, tanggal pengangkatan, dan data keluar. |
| Data Penggajian Karyawan | Belum ada | Belum ada rekening bank, gaji pokok tersimpan pada master karyawan, mata uang, periode gaji, PTKP, status pajak, status BPJS, serta assignment tunjangan dan potongan. |
| Departemen | Ada tetapi kurang | CRUD, kode, nama, deskripsi, status aktif, pencarian, pagination, arsip, dan pemulihan sudah tersedia. |
| Struktur Departemen | Belum ada | Kepala departemen, parent department, dan struktur departemen bertingkat belum tersedia. |
| Jabatan | Belum ada | Hanya ada field `position` berupa teks bebas pada karyawan. Belum ada master jabatan, kode, level, departemen, atasan jabatan, dan status aktif. |
| Kontrak Kerja | Belum ada | Belum ditemukan model, tabel, migration, service, route, halaman, form, atau riwayat kontrak dan perpanjangan. |
| Komponen Gaji | Belum ada | Belum ada master komponen pendapatan/potongan, tipe perhitungan, nilai default, status kena pajak, maupun assignment komponen ke karyawan. |
| Payroll Run | Sudah ada, tetapi berbeda scope | Sudah ada draft, edit, approve, bayar, void, gaji pokok, tunjangan, bonus/lembur, potongan, kasbon, slip PDF, dan posting ke Cash & Bank/General Ledger. Fitur ini tidak menggantikan master Komponen Gaji yang diminta oleh MVP. |
| Fitur Tabel | Ada tetapi kurang | Pencarian, filter status, pagination, tombol tambah, edit, aktif/nonaktif, dan empty state tersedia pada Karyawan/Departemen. Filter departemen, filter jenis kepegawaian, sorting, aksi lihat, initial loading state, dan query error state belum tersedia. |
| Validasi | Ada tetapi kurang | Validasi format email dan nominal payroll non-negatif sudah tersedia. Validasi nomor karyawan/NIK unik, tanggal kontrak, tanggal keluar, atasan aktif, dan referensi departemen/jabatan aktif belum tersedia. |
| Hak Akses | Infrastruktur ada, permission HR belum ada | Sistem RBAC dan route guard sudah tersedia, tetapi masih menggunakan permission luas `EMPLOYEE_MANAGE`, `DEPARTMENT_MANAGE`, `FINANCE_ACCESS`, dan `REPORT_PAYROLL_VIEW`. Delapan permission `hr.*` pada requirement belum tersedia. |
| Proteksi Data Payroll | Ada tetapi kurang | Halaman payroll dilindungi `FINANCE_ACCESS`, tetapi belum ada pemisahan `hr.payroll.view` dan `hr.payroll.manage`, serta belum ada penyembunyian field payroll secara granular pada detail karyawan. |
| Audit Trail | Ada tetapi kurang | Create, update, archive, dan restore karyawan; perubahan departemen; serta lifecycle payroll sudah dicatat. Belum ada log spesifik untuk status kepegawaian, jabatan/departemen karyawan, kontrak, dan konfigurasi gaji. Log juga belum menyimpan nilai sebelum dan sesudah perubahan. |
| Persistence dan Sync | Fondasi tersedia | Employee, department, payroll run, dan payroll item sudah memiliki tabel Dexie, PostgreSQL adapter, serta sync queue. Entitas HR baru tetap membutuhkan schema dan migration baru di kedua persistence layer. |
| Automated Test | Ada tetapi kurang | Test navigasi dan breadcrumb HR tersedia, serta ada E2E untuk slip payroll. Belum ada unit/E2E test khusus CRUD karyawan, departemen, permission HR granular, kontrak, jabatan, dan komponen gaji. |

### Fitur yang Sudah Ada dan Dapat Digunakan Kembali

#### 1. Navigasi HR

* Menu HR tersedia dari halaman utama.
* Route `/hr` sudah memiliki pemeriksaan permission dan module setup.
* Breadcrumb Karyawan dan Payroll sudah ditempatkan di bawah hierarki HR.
* Referensi:
  * `src/routes/hr/index.tsx`
  * `src/routes/index.tsx`
  * `src/navigation/breadcrumbs.ts`
  * `src/auth/routePermissions.ts`
  * `src/auth/moduleAccess.ts`

#### 2. Master Karyawan Dasar

Fitur yang sudah tersedia:

* List karyawan
* Tambah karyawan
* Edit karyawan
* Arsip/nonaktifkan karyawan
* Pulihkan/aktifkan kembali karyawan
* Pencarian
* Filter status aktif
* Pagination dan empty state
* Validasi nama dan email
* Penugasan area operasional
* Jadwal penagihan per area
* Relasi akun kas petugas
* Login karyawan opsional
* Audit log dan sinkronisasi PostgreSQL

Referensi:

* `src/view/master-data/employees/EmployeeManagement.tsx`
* `src/view/master-data/employees/EmployeeFormModal.tsx`
* `src/view/master-data/employees/EmployeeTable.tsx`
* `src/hooks/useEmployees.tsx`
* `src/services/employeeService.ts`
* `src/lib/validations/employee.ts`
* `src/services/employeeReadService.ts`

#### 3. Master Departemen Dasar

Fitur yang sudah tersedia:

* List, tambah, dan edit departemen
* Arsip dan pemulihan departemen
* Kode, nama, deskripsi, dan status aktif
* Pencarian, filter status, pagination, dan empty state
* Validasi kode maksimal 20 karakter
* Pemeriksaan kode departemen aktif agar tidak duplikat
* Audit log dan sinkronisasi PostgreSQL

Kekurangan penting:

* Belum ada kepala departemen
* Belum ada parent department
* Belum mendukung hierarki
* Belum direlasikan ke data karyawan
* Pemeriksaan kode unik saat ini hanya terhadap departemen aktif

Referensi:

* `src/view/master-data/departments/DepartmentManagement.tsx`
* `src/view/master-data/departments/DepartmentFormModal.tsx`
* `src/view/master-data/departments/DepartmentTable.tsx`
* `src/services/departmentService.ts`
* `src/lib/validations/department.ts`

#### 4. Payroll Run

Fitur payroll yang sudah tersedia:

* Pembuatan nomor payroll otomatis
* Periode payroll
* Draft dan edit draft
* Approve
* Pembayaran
* Void sebelum dibayar
* Input manual gaji pokok, tunjangan, bonus/lembur, dan potongan
* Integrasi kasbon karyawan
* Perhitungan gross, total potongan, dan net
* Posting ke Cash & Bank dan General Ledger
* Slip gaji per karyawan dan gabungan dalam PDF
* Pencarian, filter status, pagination, dan empty state
* Audit log dan sinkronisasi PostgreSQL

Payroll Run tersebut berada di luar kebutuhan utama Komponen Gaji pada MVP ini. Komponen Gaji tetap harus dibuat sebagai master konfigurasi terpisah dan dapat digunakan sebagai sumber default ketika payroll processing dikembangkan lebih lanjut.

Referensi:

* `src/view/finance/payroll/PayrollManagement.tsx`
* `src/hooks/usePayroll.tsx`
* `src/services/payrollService.ts`
* `src/lib/validations/payroll.ts`
* `src/services/payrollReadService.ts`

#### 5. Infrastruktur Pendukung

Fondasi yang dapat digunakan kembali:

* Dexie sebagai local database/offline-first
* PostgreSQL persistence melalui Tauri
* Sync queue untuk data lokal dan remote
* Zod untuk validasi
* TanStack Router dan route permission
* Role dan permission catalog
* Activity log dan Activity Log Viewer
* Ant Design form, modal, table, drawer, date picker, select, currency input, badge, dan confirmation

### Gap Data Karyawan

Field karyawan yang tersedia saat ini:

* Nama
* Nomor telepon
* Email
* Satu alamat
* Jabatan sebagai teks bebas
* Catatan
* Status aktif boolean
* Area operasional
* Jadwal penagihan
* Akun kas petugas
* Login dan role opsional

Field yang masih harus ditambahkan:

* Nomor karyawan otomatis dan unik
* Nama panggilan
* Foto
* Jenis kelamin
* Tempat dan tanggal lahir
* Status pernikahan
* Kewarganegaraan
* Email pribadi yang dipisahkan dari akun login
* Alamat identitas dan alamat domisili
* Kontak darurat, hubungan, dan nomor telepon
* NIK, nomor KK, NPWP, BPJS Kesehatan, dan BPJS Ketenagakerjaan
* Perusahaan/unit kerja
* Departemen
* Jabatan master
* Atasan langsung
* Lokasi kerja
* Tanggal bergabung
* Status karyawan dan status aktif yang lengkap
* Jenis jadwal kerja
* Tanggal kontrak, pengangkatan tetap, dan keluar
* Alasan keluar
* Data bank, rekening, gaji, mata uang, periode gaji, pajak, PTKP, dan BPJS
* Assignment komponen tunjangan dan potongan

Semua nomor identitas tersebut harus menggunakan tipe `string` pada TypeScript, Dexie, DTO PostgreSQL, dan kolom database.

### Gap Hak Akses

Permission saat ini terlalu luas:

* `EMPLOYEE_MANAGE` menggabungkan view, create, update, activate, dan deactivate.
* `DEPARTMENT_MANAGE` menggabungkan seluruh pengelolaan organisasi.
* `FINANCE_ACCESS` memberikan akses luas ke payroll dan modul keuangan.
* `REPORT_PAYROLL_VIEW` hanya mengatur laporan payroll.

Permission berikut masih harus ditambahkan ke type, catalog, role seed, route guard, service guard, dan UI guard:

* `hr.employee.view`
* `hr.employee.create`
* `hr.employee.update`
* `hr.employee.deactivate`
* `hr.organization.manage`
* `hr.contract.manage`
* `hr.payroll.view`
* `hr.payroll.manage`

Perlu ditetapkan strategi naming karena permission project saat ini menggunakan format uppercase seperti `EMPLOYEE_MANAGE`. Pilih salah satu:

* Mengikuti requirement secara literal dengan format `hr.*`; atau
* Mengikuti konvensi project, misalnya `HR_EMPLOYEE_VIEW`, `HR_EMPLOYEE_CREATE`, dan seterusnya.

Jangan mencampur kedua format tanpa normalisasi atau migration yang jelas.

### Gap Audit Trail

Aktivitas yang sudah dicatat:

* Membuat karyawan
* Mengubah karyawan
* Mengarsipkan karyawan
* Memulihkan karyawan
* Membuat, mengubah, mengarsipkan, dan memulihkan departemen
* Membuat, mengubah, approve, membayar, dan void payroll run

Aktivitas yang belum dapat dicatat karena fiturnya belum tersedia:

* Mengubah status kepegawaian
* Mengubah jabatan atau departemen karyawan
* Membuat dan memperpanjang kontrak
* Mengubah konfigurasi penggajian karyawan
* Mengubah assignment komponen gaji

Model Activity Log saat ini hanya menyimpan deskripsi teks. Untuk perubahan data sensitif, pertimbangkan menambahkan metadata terstruktur berisi field yang berubah, nilai sebelum, dan nilai sesudah. Nilai sensitif seperti NIK, rekening, NPWP, dan gaji harus dimasking sesuai permission pengguna.

### Gap Fitur Tabel

Fitur yang sudah tersedia pada beberapa halaman:

* Pencarian
* Filter status
* Pagination
* Tombol tambah
* Edit
* Arsip/nonaktifkan
* Pulihkan/aktifkan
* Empty state

Fitur yang masih harus ditambahkan:

* Filter departemen
* Filter jenis kepegawaian
* Sorting per kolom
* Aksi lihat/detail
* Initial loading state pada tabel
* Error state untuk kegagalan query/read model
* Konsistensi pagination dan page-size selector
* Pengosongan halaman pagination ketika hasil filter berubah

Loading pada tombol mutation yang sudah ada tidak dianggap sebagai loading state tabel.

### Gap Automated Test

Test yang sudah tersedia:

* Unit test akses navigasi HR
* Unit test breadcrumb HR
* E2E export slip payroll

Test yang masih dibutuhkan:

* Migration dan backfill data karyawan lama
* Nomor karyawan otomatis dan unik
* NIK unik jika diisi
* CRUD dan detail karyawan
* Activate/deactivate karyawan
* Hierarki departemen
* CRUD jabatan
* Validasi referensi departemen/jabatan aktif
* Atasan harus karyawan aktif
* Riwayat dan perpanjangan kontrak
* Validasi rentang tanggal kontrak dan tanggal keluar
* CRUD komponen gaji
* Permission view/create/update/deactivate yang terpisah
* Penyembunyian field payroll
* Audit trail perubahan data sensitif
* Dashboard HR dan distribusi departemen
* Loading, error, empty, filter, sorting, dan pagination

### Prioritas Implementasi

#### P0 — Model, Migration, dan Hak Akses

* Perluas model Employee tanpa merusak data karyawan lama.
* Buat model Jabatan, Kontrak Kerja, Komponen Gaji, dan assignment komponen karyawan.
* Perluas model Departemen dengan kepala dan parent department.
* Buat migration Dexie dan PostgreSQL.
* Perbarui DTO, repository, adapter, read service, sync queue, dan type guard.
* Tambahkan permission HR granular.
* Tentukan masking field sensitif.

#### P1 — Organisasi dan Karyawan

* Implementasikan hierarki departemen.
* Implementasikan master jabatan.
* Tambahkan relasi departemen, jabatan, atasan, perusahaan/unit, dan lokasi kerja.
* Lengkapi field pribadi, identitas, kepegawaian, dan status karyawan.
* Buat halaman/detail drawer karyawan.
* Tambahkan nomor karyawan otomatis dan validasi unik.
* Tambahkan validasi NIK dan seluruh aturan lintas entitas.

#### P2 — Kontrak dan Konfigurasi Gaji

* Buat riwayat kontrak immutable.
* Implementasikan perpanjangan dengan record kontrak baru.
* Buat master komponen gaji.
* Buat assignment tunjangan dan potongan per karyawan.
* Tambahkan data rekening, pajak, PTKP, BPJS, mata uang, dan periode penggajian.
* Terapkan permission payroll view/manage pada service dan UI.

#### P3 — Dashboard, Table UX, Audit, dan Test

* Implementasikan Dashboard HR.
* Lengkapi filter, sorting, loading, error, dan detail action.
* Tambahkan audit before/after untuk perubahan penting.
* Lengkapi unit test dan E2E test seluruh acceptance criteria HR.

### Acceptance Audit Saat Ini

Status implementasi saat audit dilakukan:

* [x] Menu utama HR tersedia
* [ ] Dashboard HR tersedia
* [x] CRUD dasar karyawan tersedia
* [ ] Detail karyawan tersedia
* [ ] Seluruh field pribadi dan identitas tersedia
* [ ] Seluruh data kepegawaian tersedia
* [ ] Konfigurasi penggajian per karyawan tersedia
* [x] CRUD dasar departemen tersedia
* [ ] Hierarki departemen tersedia
* [ ] Master jabatan tersedia
* [ ] Riwayat kontrak tersedia
* [ ] Master komponen gaji tersedia
* [x] Payroll run tersedia sebagai fitur terpisah
* [ ] Seluruh fitur tabel tersedia
* [ ] Seluruh validasi tersedia
* [ ] Seluruh permission HR granular tersedia
* [ ] Penyembunyian field sensitif tersedia
* [ ] Seluruh audit trail HR tersedia
* [ ] Automated test HR mencakup acceptance criteria
