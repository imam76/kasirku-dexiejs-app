# PostgreSQL Tauri Persistence Layer

Dokumen ini adalah panduan bertahap untuk menambahkan PostgreSQL sebagai database pusat tanpa menghapus Dexie.js. Target awalnya bukan memindahkan semua business logic ke Rust, tetapi membuat `src-tauri` menjadi bridge/adapter database yang bisa dipanggil dari frontend.

## Kondisi Saat Ini

- Frontend React masih memakai Dexie.js/IndexedDB sebagai local/offline database.
- PostgreSQL berjalan lokal lewat Podman container di `postgres-dev/compose.yml`.
- Connection string disimpan di `.env` Tauri:

```env
DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb
```

- Rust/Tauri saat ini sudah punya entrypoint di `src-tauri/src/lib.rs` dan modul native printer di `src-tauri/src/bluetooth_printer.rs`.
- Dexie.js tidak boleh dihapus karena masih menjadi local/offline storage.

## Tujuan

- Menambahkan layer PostgreSQL di `src-tauri`.
- Frontend mengirim payload data ke Tauri command.
- Tauri command menyimpan, membaca, mengubah, dan menghapus data ke PostgreSQL.
- Dexie.js tetap menjadi storage lokal/offline.
- PostgreSQL menjadi storage pusat/server-side.
- Migrasi dilakukan bertahap per entity, dimulai dari entity yang risikonya kecil.

## Prinsip Implementasi

- Jangan menghapus table, service, hook, atau flow Dexie yang sudah berjalan.
- Jangan memindahkan business logic besar ke Rust pada fase awal.
- Rust hanya menerima DTO dari frontend, melakukan validasi teknis minimal, lalu menjalankan query PostgreSQL.
- Business logic utama, kalkulasi, validasi domain, dan orchestration masih boleh berada di `src/services/*` dan `src/hooks/*`.
- Gunakan command Tauri sebagai persistence adapter, bukan sebagai service bisnis penuh.
- Gunakan migration SQL agar schema PostgreSQL bisa dilacak dan direproduksi.
- Mulai dari satu pilot entity dulu sebelum menyalin pola ke semua fitur.
- Gunakan `DATABASE_URL` dari `src-tauri/.env`, bukan variable `VITE_*`, karena koneksi database tidak boleh diekspos ke frontend web.

## Gambaran Arsitektur

```txt
Frontend React
  |
  | Dexie.js tetap untuk local/offline
  |
  | invoke("@tauri command")
  v
src-tauri Rust
  |
  | DTO + command + repository
  |
  v
PostgreSQL lokal via Podman
```

Pada fase awal, alur write yang disarankan:

```txt
Frontend service
  -> tulis ke Dexie
  -> panggil Tauri PostgreSQL adapter
  -> tandai status sync jika diperlukan
```

Jika PostgreSQL gagal, data lokal tidak hilang karena Dexie tetap menyimpan data.

## Fase 0 - Persiapan PostgreSQL Lokal

1. Pastikan container PostgreSQL berjalan.

```bash
podman compose -f postgres-dev/compose.yml up -d
```

2. Pastikan credential sama dengan `DATABASE_URL`.

```txt
POSTGRES_USER=appuser
POSTGRES_PASSWORD=apppassword
POSTGRES_DB=appdb
POSTGRES_PORT=5432
```

3. Buat file environment khusus Tauri.

```txt
src-tauri/.env
```

Isi:

```env
DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb
```

4. Jangan commit file `.env`. Root `.gitignore` sudah mengabaikan `.env` dan `.env.*`.

5. Tambahkan contoh environment jika ingin didokumentasikan untuk developer lain.

```txt
src-tauri/.env.example
```

Isi:

```env
DATABASE_URL=postgresql://appuser:apppassword@localhost:5432/appdb
```

## Fase 1 - Tambah Dependency Rust

Masuk ke folder `src-tauri`.

```bash
cd src-tauri
```

Tambahkan dependency database.

```bash
cargo add sqlx --features runtime-tokio-rustls,postgres,chrono,uuid,json,migrate,macros
cargo add tokio --features macros,rt-multi-thread
cargo add dotenvy thiserror anyhow
cargo add chrono --features serde
cargo add uuid --features serde,v4
```

Catatan:

- Gunakan `cargo add` agar versi dependency mengikuti resolver Cargo.
- `sqlx` dipakai untuk PostgreSQL pool, query async, dan migration.
- `dotenvy` dipakai untuk membaca `src-tauri/.env`.
- `thiserror` dan `anyhow` membantu error handling agar command Tauri tetap rapi.

## Fase 2 - Struktur Folder Rust

Tambahkan struktur awal berikut di `src-tauri/src`.

```txt
src-tauri/src/
  db/
    mod.rs
    pool.rs
    error.rs
  models/
    mod.rs
  repositories/
    mod.rs
  commands/
    mod.rs
    postgres_health.rs
```

Tambahkan folder migration SQL.

```txt
src-tauri/migrations/
  0001_init.sql
```

Peran folder:

- `db/`: koneksi database, pool, error database umum.
- `models/`: DTO Rust untuk request/response Tauri.
- `repositories/`: query SQL per entity.
- `commands/`: command Tauri yang dipanggil frontend.
- `migrations/`: schema PostgreSQL.

Jangan letakkan query SQL langsung di `lib.rs`. `lib.rs` cukup menjadi tempat wiring plugin, state, dan command handler.

## Fase 3 - Buat Pool PostgreSQL

Contoh isi `src-tauri/src/db/mod.rs`:

```rust
pub mod error;
pub mod pool;

pub use pool::{create_pg_pool, PgPoolState};
```

Contoh isi `src-tauri/src/db/pool.rs`:

```rust
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, path::PathBuf, time::Duration};

pub type PgPoolState = PgPool;

pub async fn create_pg_pool() -> Result<PgPool, sqlx::Error> {
    load_env();

    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set in src-tauri/.env");

    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
}

fn load_env() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest_dir.join(".env"));
}
```

## Fase 4 - Register Pool di Tauri State

Update `src-tauri/src/lib.rs`.

Tambahkan module:

```rust
mod db;
mod commands;
```

Tambahkan pool pada builder:

```rust
.setup(|app| {
    let pool = tauri::async_runtime::block_on(db::create_pg_pool())?;
    tauri::async_runtime::block_on(sqlx::migrate!("./migrations").run(&pool))?;
    app.manage(pool);
    Ok(())
})
```

Contoh posisi akhirnya:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_share::init())
    .plugin(bluetooth_printer::init())
    .setup(|app| {
        let pool = tauri::async_runtime::block_on(db::create_pg_pool())?;
        tauri::async_runtime::block_on(sqlx::migrate!("./migrations").run(&pool))?;
        app.manage(pool);
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        greet,
        commands::postgres_health::postgres_health_check,
        bluetooth_printer::list_bluetooth_printers,
        bluetooth_printer::test_print_bluetooth,
        bluetooth_printer::print_receipt_bluetooth
    ])
```

## Fase 5 - Health Check Command

Buat `src-tauri/src/commands/mod.rs`.

```rust
pub mod postgres_health;
```

Buat `src-tauri/src/commands/postgres_health.rs`.

```rust
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_health_check(pool: State<'_, PgPool>) -> Result<bool, String> {
    let value: i32 = sqlx::query_scalar("SELECT 1")
        .fetch_one(&*pool)
        .await
        .map_err(|error| error.to_string())?;

    Ok(value == 1)
}
```

Tujuan fase ini:

- Membuktikan Tauri bisa membaca `.env`.
- Membuktikan Rust bisa konek ke PostgreSQL.
- Membuktikan frontend bisa memanggil command Tauri.

Jalankan:

```bash
bun run tauri dev
```

Jika gagal konek, cek:

- PostgreSQL container sudah berjalan.
- Port `5432` tidak dipakai service lain.
- `src-tauri/.env` ada dan berisi `DATABASE_URL`.
- User, password, database sama dengan `postgres-dev/compose.yml`.

## Fase 6 - Frontend Adapter untuk Tauri Command

Buat adapter kecil di frontend agar pemanggilan Tauri tidak tersebar di banyak service.

```txt
src/services/postgresAdapter.ts
```

Contoh:

```ts
import { invoke } from '@tauri-apps/api/core';

export const postgresAdapter = {
  healthCheck() {
    return invoke<boolean>('postgres_health_check');
  },
};
```

Aturan:

- Komponen React jangan langsung memanggil banyak command PostgreSQL.
- Service JS boleh memanggil `postgresAdapter`.
- Dexie service tetap menjadi alur utama local/offline.
- Jika aplikasi dijalankan sebagai web biasa, adapter harus punya fallback karena Tauri API tidak tersedia di browser.

Contoh fallback sederhana:

```ts
import { invoke } from '@tauri-apps/api/core';

const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const postgresAdapter = {
  async healthCheck() {
    if (!isTauriRuntime) return false;
    return invoke<boolean>('postgres_health_check');
  },
};
```

## Fase 7 - Migration Schema PostgreSQL

Mulai dari table pilot yang sederhana. Pilihan aman:

- `departments`
- `projects`
- `taxes`
- `contacts`

Jangan mulai dari sales invoice, stock mutation, atau finance journal karena risikonya lebih tinggi.

Contoh migration awal untuk pilot `departments`:

```sql
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_departments_name ON departments (name);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments (is_active);
```

Kenapa `id TEXT`:

- Dexie/frontend saat ini banyak memakai ID string.
- Dengan `TEXT`, PostgreSQL bisa menerima ID existing dari Dexie tanpa mapping besar.
- Jika nanti semua entity memakai UUID, migration bisa distandarkan bertahap.

## Fase 8 - Buat Model DTO Rust

Contoh `src-tauri/src/models/mod.rs`:

```rust
pub mod department;
```

Contoh `src-tauri/src/models/department.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DepartmentDto {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}
```

Catatan:

- Untuk fase awal, `String` timestamp masih boleh agar mapping dari frontend ringan.
- Untuk fase lebih matang, gunakan `chrono::DateTime<chrono::Utc>` dan pastikan format payload konsisten.
- DTO Rust tidak harus sama persis dengan tipe Dexie, tetapi field penting harus jelas.

## Fase 9 - Buat Repository Per Entity

Contoh `src-tauri/src/repositories/mod.rs`:

```rust
pub mod department_repository;
```

Contoh `src-tauri/src/repositories/department_repository.rs`:

```rust
use crate::models::department::DepartmentDto;
use sqlx::PgPool;

pub async fn list_departments(pool: &PgPool) -> Result<Vec<DepartmentDto>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentDto>(
        r#"
        SELECT
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        FROM departments
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        "#
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_department(
    pool: &PgPool,
    input: DepartmentDto,
) -> Result<DepartmentDto, sqlx::Error> {
    sqlx::query_as::<_, DepartmentDto>(
        r#"
        INSERT INTO departments (
            id,
            code,
            name,
            description,
            is_active,
            created_at,
            updated_at,
            deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::TIMESTAMPTZ, $7::TIMESTAMPTZ, $8::TIMESTAMPTZ)
        ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        RETURNING
            id,
            code,
            name,
            description,
            is_active,
            created_at::TEXT AS created_at,
            updated_at::TEXT AS updated_at,
            deleted_at::TEXT AS deleted_at
        "#
    )
    .bind(input.id)
    .bind(input.code)
    .bind(input.name)
    .bind(input.description)
    .bind(input.is_active)
    .bind(input.created_at)
    .bind(input.updated_at)
    .bind(input.deleted_at)
    .fetch_one(pool)
    .await
}
```

Catatan penting:

- Repository hanya berisi query database.
- Jangan taruh aturan bisnis seperti kalkulasi stok, invoice, atau profit di repository.
- Untuk operasi multi-table, gunakan transaction SQLx.

## Fase 10 - Buat Command CRUD

Contoh `src-tauri/src/commands/mod.rs`:

```rust
pub mod department_commands;
pub mod postgres_health;
```

Contoh `src-tauri/src/commands/department_commands.rs`:

```rust
use crate::{
    models::department::DepartmentDto,
    repositories::department_repository,
};
use sqlx::PgPool;
use tauri::State;

#[tauri::command]
pub async fn postgres_list_departments(
    pool: State<'_, PgPool>,
) -> Result<Vec<DepartmentDto>, String> {
    department_repository::list_departments(&pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn postgres_upsert_department(
    pool: State<'_, PgPool>,
    input: DepartmentDto,
) -> Result<DepartmentDto, String> {
    department_repository::upsert_department(&pool, input)
        .await
        .map_err(|error| error.to_string())
}
```

Register command di `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    commands::postgres_health::postgres_health_check,
    commands::department_commands::postgres_list_departments,
    commands::department_commands::postgres_upsert_department,
    bluetooth_printer::list_bluetooth_printers,
    bluetooth_printer::test_print_bluetooth,
    bluetooth_printer::print_receipt_bluetooth
])
```

Naming command yang disarankan:

```txt
postgres_health_check
postgres_list_departments
postgres_get_department
postgres_upsert_department
postgres_delete_department
```

## Fase 11 - Integrasi Bertahap dengan Service Frontend

Contoh adapter:

```ts
import { invoke } from '@tauri-apps/api/core';

export interface RemoteDepartmentDto {
  id: string;
  code?: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const departmentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime) return [];
    return invoke<RemoteDepartmentDto[]>('postgres_list_departments');
  },

  async upsert(input: RemoteDepartmentDto) {
    if (!isTauriRuntime) return null;
    return invoke<RemoteDepartmentDto>('postgres_upsert_department', { input });
  },
};
```

Contoh pola di service frontend:

```ts
export async function saveDepartment(input: DepartmentFormInput) {
  const department = buildDepartmentFromInput(input);

  await db.departments.put(department);

  try {
    await departmentPostgresAdapter.upsert(mapDepartmentToRemoteDto(department));
  } catch (error) {
    console.error('Failed to sync department to PostgreSQL', error);
  }

  return department;
}
```

Catatan:

- Dexie tetap ditulis lebih dulu agar offline-first tidak rusak.
- PostgreSQL sync bersifat best effort pada fase awal.
- Jangan membuat UI gagal total hanya karena PostgreSQL belum tersedia, kecuali fitur tersebut memang sudah ditandai online-only.

## Fase 12 - Tambah Sync Metadata

Setelah pilot entity berhasil, tambahkan metadata sync di Dexie untuk entity yang akan dikirim ke PostgreSQL.

Field yang disarankan:

```ts
sync_status?: 'pending' | 'synced' | 'failed';
sync_error?: string;
last_synced_at?: string;
remote_updated_at?: string;
```

Pola write:

```txt
1. Frontend menulis ke Dexie dengan sync_status = "pending".
2. Frontend memanggil Tauri PostgreSQL command.
3. Jika berhasil, update Dexie sync_status = "synced".
4. Jika gagal, update Dexie sync_status = "failed" dan simpan sync_error.
5. Retry bisa dilakukan dari background job/manual button.
```

Jangan menambah field sync ke semua table sekaligus. Tambahkan per entity yang sudah masuk roadmap PostgreSQL.

## Fase 13 - Tambah Queue Sinkronisasi

Jika sync langsung dari service mulai sulit dijaga, buat queue.

Contoh table Dexie:

```txt
syncQueue
```

Contoh field:

```ts
interface SyncQueueItem {
  id: string;
  entity: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  attempts: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}
```

Alur:

```txt
Frontend service
  -> tulis Dexie entity
  -> tambah syncQueue item
  -> worker/hook memproses queue
  -> Tauri command menulis PostgreSQL
  -> queue ditandai synced/failed
```

Keuntungan:

- Write lokal tetap cepat.
- Retry lebih mudah.
- Error PostgreSQL tidak langsung merusak flow input user.
- Bisa dipakai untuk batch sync.

## Fase 14 - Strategi Read Data

Gunakan strategi read bertahap.

Tahap awal:

```txt
UI membaca dari Dexie
PostgreSQL hanya menerima mirror write
```

Tahap berikutnya:

```txt
Saat aplikasi online:
  - fetch dari PostgreSQL
  - merge/update ke Dexie
  - UI tetap membaca dari Dexie
```

Implementasi pilot saat ini:

- `departments`, `projects`, `taxes`, `contacts`, `warehouses`, dan `products` tetap dibaca UI dari Dexie.
- `refreshDepartmentsFromPostgres()`, `refreshProjectsFromPostgres()`, `refreshTaxesFromPostgres()`, `refreshContactsFromPostgres()`, `refreshWarehousesFromPostgres()`, dan `refreshProductsFromPostgres()` mengambil data PostgreSQL lalu merge ke Dexie.
- Data lokal dengan `sync_status = "pending"` atau `"failed"` tidak ditimpa oleh remote read.
- Worker aplikasi memproses sync queue lebih dulu, lalu menjalankan refresh read dari PostgreSQL saat runtime Tauri online.

Tahap lebih matang:

```txt
UI membaca dari source yang dipilih service:
  - Dexie untuk offline
  - PostgreSQL untuk online/server report
```

Jangan langsung mengganti semua query UI dari Dexie ke PostgreSQL karena:

- banyak workflow masih offline-first,
- banyak hook/service sudah bergantung ke Dexie,
- risiko data finance/stok lebih tinggi,
- perlu strategi conflict resolution lebih dulu.

## Fase 15 - Soft Delete

Untuk PostgreSQL, gunakan soft delete lebih dulu.

```sql
ALTER TABLE departments
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
```

Command delete sebaiknya:

```sql
UPDATE departments
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1;
```

Implementasi pilot saat ini:

- Migration awal `departments`, migration `projects`, migration `taxes`, dan migration `contacts`/`warehouses`/`products` sudah memiliki `deleted_at`, jadi database baru langsung memakai soft delete.
- `postgres_delete_department`, `postgres_delete_project`, `postgres_delete_tax`, `postgres_delete_contact`, `postgres_delete_warehouse`, dan `postgres_delete_product` menjalankan `UPDATE ... SET deleted_at = NOW(), updated_at = NOW()`.
- Archive di frontend tetap menandai Dexie sebagai `is_active = false`, lalu mengirim operasi queue `delete` ke PostgreSQL agar remote memakai soft delete.
- Restore mengirim upsert dengan `deleted_at = NULL` sehingga row PostgreSQL bisa aktif kembali jika timestamp lokal menang.
- Untuk `products`, Dexie masih memakai hard delete lokal sesuai workflow stock saat ini; queue tetap membawa snapshot product sebelum delete agar PostgreSQL bisa melakukan soft delete.

Alasan:

- Data historis masih bisa dipulihkan.
- Sinkronisasi delete lebih aman.
- Report lama tidak langsung kehilangan referensi.

Hard delete hanya dipakai untuk data temporary atau data yang benar-benar tidak punya relasi historis.

## Fase 16 - Conflict Resolution

Untuk fase awal, gunakan aturan sederhana:

```txt
Last write wins berdasarkan updated_at
```

Implementasi pilot saat ini:

- `postgres_upsert_department`, `postgres_upsert_project`, `postgres_upsert_tax`, `postgres_upsert_contact`, `postgres_upsert_warehouse`, dan `postgres_upsert_product` hanya menimpa row PostgreSQL jika `EXCLUDED.updated_at >= updated_at` row existing.
- `postgres_upsert_auth_user` mengikuti pola yang sama untuk user master: local update dikirim lewat sync queue, lalu remote terbaru di-merge kembali ke Dexie.
- Jika payload lokal kalah dari row remote yang lebih baru, repository mengembalikan row remote dan frontend me-merge hasilnya kembali ke Dexie.
- Read refresh dari PostgreSQL tetap tidak menimpa data lokal dengan `sync_status = "pending"` atau `"failed"`.
- `stock_mutations` tidak memakai last write wins. Mutasi stok disimpan sebagai event append-only yang idempotent; retry sync dengan `id` yang sama tidak menambah/mengurangi stok dua kali.
- `activity_logs` juga append-only dan idempotent berdasarkan `id`; tidak ada operasi edit/delete activity log.

Namun untuk entity penting seperti stock, finance transaction, journal, sales invoice, dan purchase invoice, jangan hanya mengandalkan last write wins.

Butuh aturan tambahan:

- audit log,
- status dokumen,
- version number,
- actor/user id,
- validasi transisi status,
- transaksi database,
- locking atau optimistic concurrency.

Tambahkan kolom jika mulai masuk entity berisiko tinggi:

```sql
version INTEGER NOT NULL DEFAULT 1;
created_by TEXT;
updated_by TEXT;
```

## Fase 17 - Roadmap Entity

Urutan implementasi yang disarankan:

1. `postgres_health_check`
2. Master data kecil: `departments`
3. Master data kecil: `projects`
4. Master data kecil: `taxes`
5. Master data lebih besar: `contacts`
6. Master data produk: `products`, `stock`, `warehouses`
7. Auth dan activity log jika ingin multi-user
8. Sales documents
9. Purchase documents
10. Finance transactions
11. Journal/general ledger
12. Reports yang butuh agregasi server-side

Implementasi saat ini:

- `departments` sudah menjadi pilot pertama untuk health check, CRUD, queue, read refresh, soft delete, dan conflict resolution awal.
- `projects` menjadi entity Fase 17 pertama setelah departments dengan pola yang sama: migration PostgreSQL, Rust DTO/repository/command, frontend adapter, sync metadata Dexie, sync queue, read refresh, soft delete, dan last-write-wins berdasarkan `updated_at`.
- `taxes` menjadi entity Fase 17 berikutnya dengan pola yang sama, tetap memakai baseline single tax/document fallback yang sudah ada di aplikasi.
- `contacts` sudah masuk sebagai master data lebih besar dengan pola yang sama: migration PostgreSQL, Rust DTO/repository/command, frontend adapter, sync metadata Dexie, sync queue, read refresh, soft delete, dan last-write-wins berdasarkan `updated_at`.
- `warehouses` dan `products` sudah masuk sebagai master data produk/stok. `warehouses` mengikuti pola archive/restore seperti master data lain. `products` menyinkronkan master product dan nilai `stock` yang ada pada record product.
- Mutasi stock dasar sudah mulai masuk sebagai ledger PostgreSQL `stock_mutations`, dengan migration, Rust DTO/repository/command, frontend adapter, dan sync queue.
- `postgres_upsert_stock_mutation` bersifat idempotent: insert event baru akan mengubah `products.stock`, sedangkan retry dengan event yang sama hanya mengembalikan event existing.
- Workflow yang sudah mengirim event mutasi stok: POS checkout, void POS transaction, issue/void Sales Delivery, issue/void Purchase Receipt, issue/void Purchase Return, issue/void Sales Return restock, dan Shopping Note.
- Sales documents sudah mulai masuk sebagai entity transaksi pertama: header `sales_documents` dan line item `sales_document_items` disinkronkan sebagai satu bundle lewat queue, read refresh, `version`, actor metadata, dan optimistic concurrency berdasarkan `version` + `updated_at`.
- Workflow sales document yang sudah mengirim bundle header/item: create draft, update draft, issue, convert, dan void. Side effect stok tetap lewat `stock_mutations`, sedangkan journal dan payment ledger tetap belum dipindahkan ke PostgreSQL.
- Purchase documents secara penuh belum dipindahkan ke PostgreSQL pada fase ini. Yang disinkronkan untuk purchases baru event mutasi stoknya, bukan header/item dokumen, payment, status history, atau journal dokumen.
- `auth_users` dan `activity_logs` sudah masuk untuk persiapan multi-user: migration PostgreSQL, Rust DTO/repository/command, frontend adapter, sync queue, read refresh, dan merge Dexie.
- `auth_sessions` tetap lokal Dexie dan tidak disinkronkan ke PostgreSQL karena session adalah state per device.
- `activity_logs` dikirim sebagai event append-only dan juga direfresh dari PostgreSQL agar Activity Log Viewer dapat melihat log dari device lain saat runtime Tauri online.
- Finance transaction dan journal/general ledger tetap belum dipindahkan ke PostgreSQL. Bagian itu masuk fase berikutnya karena perlu transaction boundary, conflict rule, audit, dan status/version rule yang lebih ketat.

Alasan urutan:

- master data kecil lebih mudah diuji,
- minim side effect stok/finance,
- pola DTO/repository/command bisa distabilkan dulu,
- entity transaksi bisa masuk setelah sync dan conflict handling lebih matang.

## Fase 18 - Testing

Minimal testing per fase:

```bash
cd src-tauri
cargo check
```

Jalankan aplikasi:

```bash
bun run tauri dev
```

Test manual:

- PostgreSQL container hidup.
- `postgres_health_check` mengembalikan `true`.
- Insert/update pilot entity dari frontend berhasil.
- Data tetap ada di Dexie.
- Data masuk ke PostgreSQL.
- Jika PostgreSQL dimatikan, Dexie tetap berjalan.
- Setelah PostgreSQL hidup lagi, retry sync bisa mengirim data yang tertunda.

Query manual dari container:

```bash
podman exec -it postgres-dev psql -U appuser -d appdb
```

Contoh query:

```sql
SELECT * FROM departments ORDER BY name ASC;
SELECT * FROM stock_mutations ORDER BY occurred_at DESC;
SELECT id, name, role, is_active, updated_at FROM auth_users ORDER BY created_at DESC;
SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 200;
SELECT id, document_number, type, status, version, updated_at FROM sales_documents ORDER BY created_at DESC;
SELECT id, document_id, product_name, quantity, total_amount FROM sales_document_items ORDER BY created_at DESC;
```

## Fase 19 - Hal yang Perlu Dihindari

- Jangan menghapus Dexie table saat PostgreSQL baru ditambahkan.
- Jangan expose `DATABASE_URL` ke frontend dengan prefix `VITE_`.
- Jangan menaruh password database di source code.
- Jangan menaruh semua command PostgreSQL di `lib.rs`.
- Jangan membuat query SQL dari string input user tanpa parameter binding.
- Jangan memindahkan kalkulasi finance/stok ke Rust sebelum domain rule stabil.
- Jangan menyamakan mutasi stok transaksi dengan sync master `products.stock` berbasis last write wins. Gunakan event idempotent/append-only agar retry sync tidak menggandakan stok.
- Jangan menyinkronkan `authSessions` ke PostgreSQL. Session login harus tetap lokal per device; yang disinkronkan adalah `auth_users` dan `activity_logs`.
- Jangan memulai dari entity yang punya banyak side effect.
- Jangan menganggap `localhost` selalu benar untuk semua target. Untuk Android/mobile, `localhost` mengarah ke device, bukan host laptop. Gunakan host yang bisa dijangkau device atau tunda fitur PostgreSQL untuk target mobile sampai arsitektur server siap.

## Checklist Implementasi Awal

- [ ] Jalankan PostgreSQL via Podman.
- [ ] Buat `src-tauri/.env` berisi `DATABASE_URL`.
- [ ] Tambahkan dependency Rust: `sqlx`, `tokio`, `dotenvy`, `thiserror`, `anyhow`, `chrono`, `uuid`.
- [ ] Buat folder `db`, `models`, `repositories`, `commands`, dan `migrations`.
- [ ] Buat PostgreSQL pool dari `DATABASE_URL`.
- [ ] Register pool ke Tauri state.
- [ ] Jalankan migration dari `src-tauri/migrations`.
- [ ] Buat `postgres_health_check`.
- [ ] Buat frontend adapter `src/services/postgresAdapter.ts`.
- [ ] Pilih satu pilot entity.
- [ ] Buat migration pilot entity.
- [ ] Buat DTO Rust pilot entity.
- [ ] Buat repository SQL pilot entity.
- [ ] Buat Tauri command CRUD pilot entity.
- [ ] Integrasikan service frontend setelah write Dexie.
- [ ] Tambahkan sync metadata jika pilot sudah stabil.
- [ ] Tambahkan sync queue jika retry mulai dibutuhkan.

## Target Hasil Fase Awal

Setelah fase awal selesai, kondisi idealnya:

- Aplikasi tetap berjalan offline dengan Dexie.
- Tauri bisa konek ke PostgreSQL memakai `DATABASE_URL`.
- Frontend bisa memanggil command Rust.
- Satu entity pilot bisa disimpan ke Dexie dan PostgreSQL.
- Jika PostgreSQL mati, aplikasi tidak kehilangan data lokal.
- Struktur Rust sudah siap dikembangkan untuk entity berikutnya.
