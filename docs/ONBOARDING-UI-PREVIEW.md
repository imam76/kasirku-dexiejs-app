# Preview UI onboarding, trial, langganan, dan pembayaran

Implementasi ini mengikuti keputusan bisnis pada issue dan referensi implementasi,
termasuk harga bulanan, trial maksimal 90 hari, entitlement eksplisit, dan consent
marketing opsional. Ini adalah alur UI yang berfungsi dengan adapter simulasi,
bukan integrasi billing produksi.

## Membuka preview

Jalankan `bun run dev`, lalu buka:

```text
http://localhost:1420/onboarding-preview.html
```

Jika Vite berjalan pada port lain, gunakan port tersebut. Server pemeriksaan sesi
implementasi menggunakan `http://127.0.0.1:5173/onboarding-preview.html`.
Entry HTML ini juga disertakan dalam hasil `bun run build`.

## Penyelarasan referensi layar — 9 September 2026

Empat layar utama mengikuti referensi Frayukti «Langganan, tanpa ribet.»:

- **Pilih paket:** tiga kolom desktop, dua kolom tablet, kartu ringkas yang
  membuka fitur paket terpilih pada ponsel; harga serta lima paket tetap
  mengikuti dokumen bisnis. Periode yang tersedia adalah bulanan.
- **Pembayaran:** QRIS, Virtual Account, dan kartu; ringkasan dua kolom di
  layar lebar, rincian tagihan yang dapat dibuka pada ponsel, serta total dan
  tombol bayar di footer mobile. Pilihan metode bertahan setelah reload.
- **Aktivasi:** tanda centang hijau, paket dan tanggal akhir akses, tombol
  kembali ke aplikasi, dan invoice simulasi.
- **Langganan:** status aktif, harga dan masa akses, perpanjangan manual,
  ubah paket, riwayat transaksi simulasi terakhir, dan bantuan.

Buka **Skenario simulasi** untuk langsung memilih **01 · Pilih paket**,
**02 · Pembayaran**, **Pembayaran & aktivasi berhasil**, atau **Langganan aktif**.
Navigasi menggunakan sidebar desktop dan menu pada mobile/tablet. Tombol
kembali dan history browser menutup invoice atau menu sebelum kembali layar.
Warna referensi dibatasi pada preview; tema operasional tetap memakai token
aplikasi yang ada.

Pilihan paket baru tidak mengubah akses sampai aktivasi simulasi diterima.
Transaksi yang masih menunggu dilanjutkan dengan paket, nominal, dan metode
awalnya; mengganti pilihan tidak mengubah invoice transaksi tersebut. Invoice
jelas ditandai sebagai simulasi, bukan bukti pembayaran atau faktur pajak.

Tambahan berkas utama: `BillingPresentation.tsx` untuk ringkasan paket,
tombol pembayaran, navigasi, dan konten invoice/riwayat/bantuan; serta
`tests/e2e/onboarding-subscription-layout.spec.ts` untuk keempat layar pada
lebar 390, 768, 1024, dan 1440 piksel dalam light/dark mode. Tes regresi preview
juga memeriksa lebar 320 piksel, landscape, overlay, fokus, dan inset keyboard.

Pemeriksaan penyelarasan: build produksi, lint berkas terkait, 424 tes unit
(termasuk 21 tes preview), 17 tes browser preview, dan 6 tes regresi setup/login lulus. Keyboard
serta system Back Android native belum diuji; checkout tetap berupa simulasi.

Tombol **Skenario simulasi** di header membuka pilihan kondisi. **Registrasi baru**
mereset hanya draft preview. Switch **Offline simulasi** tersedia di semua layar.
Perilaku checkout dapat diubah menjadi **Android (browser eksternal)** tanpa
mengubah viewport. Runtime Android terdeteksi lewat helper platform proyek;
layout ditentukan terpisah oleh `useIsMobile`.

Draft tersimpan di `frayukti:onboarding-preview:v1`. Tema dan bahasa preview memakai
namespace yang sama. Kembali, resize/orientasi, dan reload mempertahankan isian.
Jam fixture ditetapkan pada Rabu, 9 September 2026; hasil dapat diulang tanpa
bergantung pada jam perangkat. Tanggal akhir akses bersifat eksklusif dalam fixture.

## Skenario dan alur

- Registrasi baru, validasi gagal, registrasi/trial offline.
- Paket POS Rp149.000, Perdagangan Umum Rp299.000, Produksi Rp449.000,
  Koperasi Rp699.000, dan Custom Rp999.000 per bulan.
- Custom memilih modul dari katalog yang dapat dijual, ditambah modul dasar;
  biaya setup sekali Rp3.500.000 ditampilkan pada pembayaran awal.
- Setup akuntansi bawaan atau konfigurasi, persetujuan syarat/privasi wajib,
  persetujuan pemasaran terpisah dengan default tidak dicentang dan opsi penarikan.
- Trial aktif, hampir habis, habis; langganan aktif atau habis; pengingat Rabu.
- Checkout menunggu, berhasil, gagal, dibatalkan, dan pembayaran berhasil dengan
  aktivasi belum diterima. Status akses lama bertahan sampai aktivasi diterima.
- Pemulihan berhasil, gagal, offline, atau berhasil mengambil langganan yang
  telah habis. Contoh usaha Toko Sinar memperoleh paket POS dengan akhir akses
  1 Oktober 2026; pemulihan berulang tidak memperpanjangnya.
- Perpindahan menuju browser eksternal Android dan kembali ke aplikasi
  disimulasikan tanpa membuka checkout atau melakukan transaksi sebenarnya.
- Tombol ekspor backup membuka penjelasan bahwa **tidak ada file atau ekspor
  yang dibuat**, dan tidak menampilkan keberhasilan palsu.

Hasil pembayaran dapat dipilih pada layar status. **Periksa status pembayaran**,
kembali dari simulasi browser, dan kembali ke foreground membaca adapter yang
sama. Status pembayaran yang sudah menerima aktivasi tidak mundur saat respons
lama diperiksa lagi. Periode perpanjangan di adapter adalah contoh deterministik,
bukan keputusan baru tentang prorata, upgrade/downgrade, atau kebijakan refund.

## Reuse dan batas isolasi

Audit memeriksa router/AuthGate, SetupOwner, OwnerAccountingSetup/model, i18n,
ThemeProvider/theme, primitive mobile CRUD, safe-area/IME Android, mobileNavigation,
setupModules/setupKeyService, backupRestore, dan pola tes Bun/Playwright.

`AppShell` memasang worker sinkronisasi, sedangkan root operasional memasang
AuthGate serta query data. Karena itu preview memakai entry HTML sendiri dan
tidak memasang shell/auth operasional. Tidak ada impor db, setupKeyService,
backupRestore, atau layanan pembayaran/lead dari entry preview.

Komponen heading dan panel form dari SetupOwner diekstrak menjadi
`src/components/auth/SetupPresentation.tsx` dan dipakai oleh kedua halaman.
Form preview terpusat mengikuti SetupOwner, dengan stepper horizontal desktop,
panel ringkasan, logo proyek, Ant Design Form/Input/Select/DatePicker, ikon Lucide,
dan theme token yang sama. Paket memakai ruang desktop lebih lebar; mobile memakai
kartu vertikal dan indikator satu langkah. Wizard tidak memakai container CRUD.
Bottom sheet hanya dipakai untuk informasi sekunder dan kontrol simulasi.

Model setup akuntansi lama dipakai ulang untuk nilai bawaan dan validasi. Provider
i18n hanya mendapat prop `storageKey` opsional; default aplikasi lama tetap sama.
Satu katalog paket, reducer, formatter, fixture, dan controller dipakai kedua layout.

Riwayat navigasi memakai `createHashHistory` dari TanStack yang sudah terpasang.
Overlay dokumen, detail, serta picker form memiliki entry history sehingga Back
menutup overlay dahulu. Tidak ada listener native Back kedua. CSS menggunakan
`--app-vh`, safe-area, dan `--app-keyboard-inset-bottom` dari implementasi Android
yang ada. Overlay dialog membuat konten bawah inert; hanya layout aktif dipasang.

Normalisasi setup produksi masih menambahkan modul di luar entitlement baru.
Preview sengaja tidak memanggilnya dan tidak mengubah normalisasi pengguna lama.
Tidak ada owner baru, perubahan enabledModules, consent nyata, perubahan skema
database, aktivasi langganan pengguna, pengiriman lead, atau blokir operasional.

## Berkas utama

| Berkas | Tanggung jawab |
| --- | --- |
| `onboarding-preview.html`, `main.tsx`, `vite.config.ts` | Entry preview terpisah yang ikut build |
| `model.ts`, `catalog.ts` | State, validasi, batas akses, harga, entitlement |
| `simulation.ts` | Kontrak dan respons billing/pemulihan simulasi; tanpa jaringan |
| `useOnboardingPreview.ts`, `navigation.ts`, `persistence.ts` | Controller, history, penyimpanan preview |
| `OnboardingPreview.tsx`, `WizardSteps.tsx`, `AccessSteps.tsx`, `preview.css` | Presentasi adaptif |
| `src/i18n/onboardingMessages.ts` | Copy Indonesia/Inggris |
| `tests/unit/onboarding-preview.test.ts` | Validasi, consent, paket, transisi, navigasi, isolasi |
| `tests/e2e/onboarding-preview.spec.ts` | Alur penuh, desktop/mobile, light/dark, fokus, overlay, overflow, footer |

Berkas tanpa awalan direktori pada tabel berada di `src/preview/onboarding`.

## Pemeriksaan implementasi

- Seluruh suite unit: **424 lulus, 0 gagal** (66 berkas), termasuk 21 tes preview.
- TypeScript dan lint berkas yang diubah: lulus setelah penyelarasan desain.
- Build produksi: lulus setelah penyelarasan desain.
  Peringatan aset beep dan chunk besar sudah terdapat pada aplikasi.
- Lint seluruh proyek memiliki dua error `any` lama pada
  `tests/e2e/zz-diagnose-qty1.spec.ts`, serta dua warning React Compiler lama.
- Browser: **23 tes lulus** — 17 preview serta 6 regresi setup/login lama.
  Matriks preview mencakup desktop/mobile, light/dark, lebar 320px, landscape,
  resize saat overlay terbuka, Back pada picker, Tab/Shift+Tab, Escape, footer
  dengan inset IME simulasi, serta isolasi IndexedDB/localStorage.
- Screenshot desktop/mobile diperiksa. Footer mobile mempertahankan aksi utama,
  dan layar akses habis menampilkan pembayaran serta ekspor backup langsung di
  footer. Konten tidak memiliki overflow horizontal pada viewport yang diuji.
- Perbaikan yang ditemukan oleh tes mencakup fokus Shift+Tab pada bottom sheet:
  handler Tab lokal menahan fokus sebelum browser memindahkannya ke address bar.
  Tidak ada listener Back atau keyboard global tambahan.
- Keyboard dan system Back **Android native belum diuji**. Emulasi viewport
  serta injeksi CSS IME hanya memeriksa layout, bukan bukti perilaku perangkat.

Perintah pemeriksaan:

```text
bun run build
bun run lint
bun run test:unit
bun run test:e2e:chromium -- tests/e2e/onboarding-preview.spec.ts tests/e2e/onboarding-subscription-layout.spec.ts tests/e2e/owner-accounting-navigation.spec.ts tests/e2e/setup-owner.spec.ts
```

Integrasi tersisa: metode bukti kepemilikan, layanan identitas/lead/billing,
Midtrans/webhook, aktivasi nyata, app link/browser native, dokumen hukum final,
entitlement produksi, penguncian operasional, dan ekspor dari layar akses habis.
Semua berada di luar tahap UI ini.
