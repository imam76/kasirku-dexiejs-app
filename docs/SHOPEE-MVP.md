# Integrasi Shopee MVP

Integrasi ini hanya aktif pada Frayukti Desktop (Tauri). Frontend web tetap dapat
dibangun, tetapi halaman Marketplace menampilkan bahwa fitur tidak tersedia.
Token dan partner key tidak pernah dikirim ke JavaScript atau disimpan di Dexie.

## Konfigurasi

Salin `src-tauri/.env.example` menjadi `src-tauri/.env`, lalu isi:

```env
SHOPEE_PARTNER_ID=123456
SHOPEE_PARTNER_KEY=partner-key-dari-shopee
SHOPEE_ENVIRONMENT=sandbox
SHOPEE_TOKEN_ENCRYPTION_KEY=base64-dari-32-byte
SHOPEE_REDIRECT_URI=http://127.0.0.1:17654/marketplace/shopee/callback
```

Buat encryption key dengan `openssl rand -base64 32`. Semua desktop yang memakai
database PostgreSQL yang sama harus memakai partner key dan encryption key yang
sama. Jangan memasukkan nilai tersebut ke environment Vite (`VITE_*`) atau bundle
frontend.

Daftarkan redirect URI yang sama pada Shopee Partner Console. OAuth MVP ini hanya
mendukung seller/shop account, bukan main account. Jika Shopee tidak menerima
loopback `127.0.0.1`, flow ini perlu dipindahkan ke callback HTTPS yang di-host.

## Operasional

1. Aktifkan module `MARKETPLACE` melalui Developer Setup untuk instalasi lama.
2. Berikan `MARKETPLACE_VIEW` dan, bila diperlukan, `MARKETPLACE_MANAGE` pada role.
   Owner dan Admin mendapat keduanya secara default.
3. Buka **Marketplace > Shopee**, lalu pilih **Hubungkan Toko Shopee**.
4. Setelah otorisasi selesai, jalankan **Sinkronkan Pesanan** secara manual.

Sinkronisasi pertama mengambil 15 hari terakhir. Sinkronisasi selanjutnya memakai
`update_time` sejak `last_synced_at` dengan overlap lima menit. Order di-upsert
berdasarkan account dan `order_sn`; item order diganti atomik dan
`last_synced_at` hanya maju setelah semua detail berhasil disimpan.

## Pengujian

```bash
bun run build
bun run test:unit
cd src-tauri
cargo fmt --all --check
cargo test --lib
cargo clippy --lib --all-targets
```

Tes integrasi PostgreSQL menggunakan database disposable bila `TEST_DATABASE_URL`
tersedia:

```bash
TEST_DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/frayukti_test \
  cargo test postgres_upsert_replaces_items_and_rolls_back_failed_sync -- --nocapture
```

Sebelum production, validasi manual di Shopee Sandbox: connect, sync 15 hari,
sync ulang, buka detail, dan uji refresh token. Ulangi smoke test setelah partner
app dipindahkan ke production.
