import type { Product } from '@/types';
import { normalizeProductUnitMappings } from '@/utils/productUnits';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Baris konversi dulu hanya menyimpan satu angka `ratio`, jadi satuan yang
 * lebih kecil dari satuan utama terpaksa ditulis sebagai pecahan: pcs di bawah
 * satuan utama pack tersimpan sebagai 0.08333333. Angka itu tidak enak dibaca
 * saat form dibuka lagi, dan mengalikannya balik tidak dijamin kembali bulat.
 *
 * Migrasi ini mengisi pasangan `qty`/`base_qty` dari ratio yang sudah ada —
 * ratio 0.08333333 kembali jadi "12 pcs = 1 pack". Nilai `ratio` tetap ditulis
 * sebagai turunan supaya konsumen yang belum membaca pasangan tidak berubah
 * perilakunya.
 */
export function registerMigrationV111(db: KasirkuDB) {
  db.version(111).stores({}).upgrade(async (transaction) => {
    await transaction.table<Product>('products').toCollection().modify((product) => {
      if (!product.unit_mappings || product.unit_mappings.length === 0) return;

      product.unit_mappings = normalizeProductUnitMappings(product);
    });
  });
}
