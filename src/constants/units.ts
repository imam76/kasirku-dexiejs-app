import { UnitConversion } from '@/types';

export const DEFAULT_CONVERSIONS: UnitConversion[] = [
  { id: 'kg-gram', fromUnit: 'kg', toUnit: 'gram', ratio: 1000, isPreset: true, label: '1 kg = 1000 gram' },
  { id: 'gram-kg', fromUnit: 'gram', toUnit: 'kg', ratio: 0.001, isPreset: true, label: '1 gram = 0.001 kg' },
  { id: 'ons-gram', fromUnit: 'ons', toUnit: 'gram', ratio: 100, isPreset: true, label: '1 ons = 100 gram' },
  { id: 'gram-ons', fromUnit: 'gram', toUnit: 'ons', ratio: 0.01, isPreset: true, label: '1 gram = 0.01 ons' },
  { id: 'kg-ons', fromUnit: 'kg', toUnit: 'ons', ratio: 10, isPreset: true, label: '1 kg = 10 ons' },
  { id: 'lusin-pcs', fromUnit: 'lusin', toUnit: 'pcs', ratio: 12, isPreset: true, label: '1 lusin = 12 pcs' },
  { id: 'kodi-pcs', fromUnit: 'kodi', toUnit: 'pcs', ratio: 20, isPreset: true, label: '1 kodi = 20 pcs' },
  { id: 'gros-pcs', fromUnit: 'gros', toUnit: 'pcs', ratio: 144, isPreset: true, label: '1 gros = 144 pcs' },
  { id: 'dus-pcs', fromUnit: 'dus', toUnit: 'pcs', ratio: 24, isPreset: true, label: '1 dus = 24 pcs' },
  { id: 'ikat-pcs', fromUnit: 'ikat', toUnit: 'pcs', ratio: 10, isPreset: true, label: '1 ikat = 10 pcs' },
  { id: 'jam-menit', fromUnit: 'jam', toUnit: 'menit', ratio: 60, isPreset: true, label: '1 jam = 60 menit' },
  { id: 'menit-detik', fromUnit: 'menit', toUnit: 'detik', ratio: 60, isPreset: true, label: '1 menit = 60 detik' },
  { id: 'jam-detik', fromUnit: 'jam', toUnit: 'detik', ratio: 3600, isPreset: true, label: '1 jam = 3600 detik' },
];
