import type { UnitDefinition } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Master satuan dulu mengunci dua hal: kemasan tidak boleh jadi satuan dasar,
 * dan satuan hitungan tidak boleh jadi satuan konversi. Keduanya berangkat dari
 * asumsi satuan dasar selalu satuan terkecil, sehingga kasus nyata "satuan utama
 * box, jual per pcs" tidak bisa disusun sama sekali.
 *
 * Migrasi ini membuka kuncian itu pada satuan bawaan. Yang dibalik hanya nilai
 * `false` yang persis mengikuti aturan lama — kemasan pada `canBeBaseUnit` dan
 * satuan hitungan pada `canBeConversionUnit` — jadi satuan buatan pengguna dan
 * pilihan lain yang pernah dimatikan sendiri tetap apa adanya.
 */
export function registerMigrationV112(db: KasirkuDB) {
  db.version(112).stores({}).upgrade(async (transaction) => {
    await transaction.table<UnitDefinition>('units').toCollection().modify((unit) => {
      if (!unit.isPreset) return;

      if (unit.type === 'package' && unit.canBeBaseUnit === false) {
        unit.canBeBaseUnit = true;
      }

      if (unit.type === 'count' && unit.canBeConversionUnit === false) {
        unit.canBeConversionUnit = true;
      }
    });
  });
}
