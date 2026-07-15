# Frayukti ERP App

Aplikasi kasir/ERP berbasis React, TypeScript, Vite, Tauri 2, dan PostgreSQL.
Project ini memakai Bun sebagai package manager utama.

## Prasyarat

Pastikan sudah terpasang:

- Bun
- Rust stable dan Cargo
- Docker atau Docker Desktop untuk PostgreSQL lokal
- Dependency sistem Tauri sesuai OS yang dipakai
- Android Studio, Android SDK/NDK, dan JDK jika ingin build Android

## Setup Awal

Clone repo, masuk ke folder project, lalu install dependency dengan Bun:

```bash
bun install
```

Siapkan environment untuk Tauri/Rust:

```bash
cp src-tauri/.env.example src-tauri/.env
```

Jalankan PostgreSQL lokal:

```bash
docker compose -f postgres-dev/compose.yml up -d
```

Default koneksi database lokal:

```env
DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb
```

Migration database akan dijalankan otomatis saat aplikasi Tauri start.

## Menjalankan Project

Untuk menjalankan frontend Vite saja:

```bash
bun run dev
```

Frontend akan berjalan di:

```text
http://localhost:1420
```

Untuk menjalankan aplikasi desktop Tauri:

```bash
bun run tauri dev
```

## Clean Data Lokal Dexie

Gunakan langkah ini saat data lokal Dexie/IndexedDB masih nyangkut di mode dev.
Tutup aplikasi Tauri/Vite dulu, lalu jalankan dari root project:

```bash
bun run clean:dexie
```

Setelah itu jalankan ulang:

```bash
bun run tauri dev
```

Atau reset Dexie lalu langsung jalankan Tauri dev:

```bash
bun run tauri:dev:fresh
```

Command yang sama dapat digunakan di Linux, Windows (PowerShell/CMD), dan macOS.
Skrip akan mendeteksi sistem operasi dan memilih lokasi storage yang sesuai.

Catatan: command ini membersihkan storage lokal Tauri/WebView dan origin dev
`http://localhost:1420`. PostgreSQL lokal tidak ikut di-reset; untuk reset
PostgreSQL gunakan `docker compose -f postgres-dev/compose.yml down -v`.

## Script Penting

```bash
bun run dev
bun run build
bun run lint
bun run preview
bun run tauri dev
bun run tauri build
```

## Auto Update Desktop

Updater Tauri memakai GitHub Releases terbaru:

```text
https://github.com/imam76/kasirku-dexiejs-app/releases/latest/download/latest.json
```

Private signing key lokal dibuat di luar repo:

```bash
~/.tauri/frayukti-updater.key
~/.tauri/frayukti-updater.key.password
```

Build installer yang menghasilkan artifact updater harus memakai isi key tersebut:

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/frayukti-updater.key" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$HOME/.tauri/frayukti-updater.key.password")" \
bun run tauri build
```

Untuk GitHub Actions, isi secret `TAURI_SIGNING_PRIVATE_KEY_B64` dengan private
key yang sudah di-base64 satu baris:

```bash
base64 -w0 "$HOME/.tauri/frayukti-updater.key"
```

Pakai file private `.key`, bukan `.key.pub`, dan jangan decode isi `.key` secara
manual sebelum dimasukkan ke secret.

Isi juga `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:

```bash
cat "$HOME/.tauri/frayukti-updater.key.password"
```

Secret lama `TAURI_SIGNING_PRIVATE_KEY` masih didukung sebagai fallback, tapi
format base64 lebih aman karena workflow akan decode ke file sementara dan
mengirim path file tersebut ke Tauri. Workflow saat ini membuat draft release;
publish draft tersebut agar updater aplikasi bisa membaca `latest.json`.

## Testing

Install browser Playwright sekali saja di mesin baru:

```bash
bunx playwright install
```

Jalankan end-to-end test:

```bash
bun run test:e2e
```

Pilihan lain:

```bash
bun run test:e2e:chromium
bun run test:e2e:headed
bun run test:e2e:ui
bun run test:e2e:report
```

## Build

Build frontend:

```bash
bun run build
```

Build aplikasi desktop:

```bash
bun run tauri build
```

Build APK Android untuk semua arsitektur:

```bash
bun run tauri android build --apk --split-per-abi
```

Build Windows:
```bash
bun run tauri build --target x86_64-pc-windows-gnu
bun run tauri build --target i686-pc-windows-gnu
```

Build Linux:
```bash
bun run tauri build --target x86_64-unknown-linux-gnu
bun run tauri build --target aarch64-unknown-linux-gnu
```

Untuk testing Android yang terhubung ke PostgreSQL di laptop/PC lewat LAN,
pakai IP host database, bukan `localhost`:

```bash
KASIRKU_DATABASE_URL=postgresql://appuser:apppassword@192.168.1.8:5432/appdb bun run tauri android build --apk --split-per-abi
```

Ganti `192.168.1.8` dengan IP mesin yang menjalankan PostgreSQL.

## PostgreSQL Dev

Start database:

```bash
docker compose -f postgres-dev/compose.yml up -d
podman-compose -f compose.yml down -v
```

Stop database:

```bash
docker compose -f postgres-dev/compose.yml down
```

Reset database lokal beserta volumenya:

```bash
docker compose -f postgres-dev/compose.yml down -v
```

## Troubleshooting

- Jika muncul `DATABASE_URL is not configured`, pastikan `src-tauri/.env` sudah dibuat dari `src-tauri/.env.example`.
- Jika PostgreSQL tidak bisa diakses, pastikan container `postgres-dev` sudah berjalan.
- Jika port `1420` sedang dipakai, hentikan proses lain yang memakai port tersebut sebelum menjalankan `bun run dev` atau `bun run tauri dev`.
- Untuk Android, `localhost` mengarah ke device/emulator, bukan laptop/PC. Pakai IP LAN host PostgreSQL lewat `KASIRKU_DATABASE_URL`.
