import type { ProductUnit, UnitConversion, UnitDefinition, UnitDefinitionType } from '@/types';

export const WEIGHT_BASE_UNIT: ProductUnit = 'gram';
export type UnitCategory = 'count' | 'package' | 'weight' | 'volume' | 'length' | 'time' | 'measurement';

export const WEIGHT_UNIT_ALIASES: Record<string, ProductUnit> = {
  g: 'gram',
  gr: 'gram',
  gram: 'gram',
  grams: 'gram',
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kilo: 'kg',
  ons: 'ons',
};

export const normalizeUnitKey = (unit?: string) => (unit || '').trim().toLowerCase();

export const normalizeWeightUnit = (unit?: ProductUnit): ProductUnit | undefined => {
  return WEIGHT_UNIT_ALIASES[normalizeUnitKey(unit)];
};

export const PACKAGE_UNITS = [
  'pcs',
  'pack',
  'dus',
  'box',
  'renteng',
  'lusin',
  'kodi',
  'gros',
  'ikat',
  'bundle',
] as const;

export const TIME_UNITS = ['jam', 'menit', 'detik'] as const;
export const VOLUME_UNITS = ['liter', 'l', 'ml', 'milliliter', 'mililiter'] as const;
export const LENGTH_UNITS = ['meter', 'm', 'cm', 'centimeter', 'sentimeter', 'mm', 'millimeter', 'milimeter'] as const;

export const isCountUnit = (unit?: ProductUnit) => {
  return normalizeUnitKey(unit) === 'pcs';
};

export const LEGACY_GLOBAL_PACKAGE_CONVERSION_IDS = [
  'lusin-pcs',
  'kodi-pcs',
  'gros-pcs',
  'dus-pcs',
  'ikat-pcs',
] as const;

export const isPackageUnit = (unit?: ProductUnit) => {
  return PACKAGE_UNITS.includes(normalizeUnitKey(unit) as typeof PACKAGE_UNITS[number]);
};

export const isTimeUnit = (unit?: ProductUnit) => {
  return TIME_UNITS.includes(normalizeUnitKey(unit) as typeof TIME_UNITS[number]);
};

export const isVolumeUnit = (unit?: ProductUnit) => {
  return VOLUME_UNITS.includes(normalizeUnitKey(unit) as typeof VOLUME_UNITS[number]);
};

export const isLengthUnit = (unit?: ProductUnit) => {
  return LENGTH_UNITS.includes(normalizeUnitKey(unit) as typeof LENGTH_UNITS[number]);
};

export const inferUnitCategory = (unit?: ProductUnit): UnitCategory => {
  if (isCountUnit(unit)) return 'count';
  if (isPackageUnit(unit)) return 'package';
  if (isTimeUnit(unit)) return 'time';
  if (normalizeWeightUnit(unit)) return 'weight';
  if (isVolumeUnit(unit)) return 'volume';
  if (isLengthUnit(unit)) return 'length';
  return 'measurement';
};

export const areUnitsInSameCategory = (a?: ProductUnit, b?: ProductUnit) => {
  return inferUnitCategory(a) === inferUnitCategory(b);
};

export const inferUnitDefinitionType = (unit?: ProductUnit): UnitDefinitionType => {
  if (isCountUnit(unit)) return 'count';
  if (isPackageUnit(unit)) return 'package';
  if (isTimeUnit(unit)) return 'time';
  return 'measurement';
};

export const isGlobalConvertibleUnitType = (type?: UnitDefinitionType) => {
  return type === 'measurement' || type === 'time';
};

export const createUnitDefinition = (
  unit: ProductUnit,
  overrides: Partial<Omit<UnitDefinition, 'id' | 'name'>> = {},
): UnitDefinition => {
  const id = normalizeUnitKey(unit);
  const type = overrides.type ?? inferUnitDefinitionType(id);

  return {
    id,
    name: id,
    type,
    canBeBaseUnit: overrides.canBeBaseUnit ?? type !== 'package',
    canBeConversionUnit: overrides.canBeConversionUnit ?? type !== 'count',
    isPreset: overrides.isPreset ?? false,
    created_at: overrides.created_at,
    updated_at: overrides.updated_at,
  };
};

export const inferConversionUnitType = (
  fromUnit?: ProductUnit,
  toUnit?: ProductUnit,
): NonNullable<UnitConversion['unitType']> => {
  if (isPackageUnit(fromUnit) || isPackageUnit(toUnit)) return 'package';
  if (isTimeUnit(fromUnit) && isTimeUnit(toUnit)) return 'time';
  return 'measurement';
};

export const isLegacyGlobalPackageConversion = (conversion: Pick<UnitConversion, 'id' | 'fromUnit' | 'toUnit'>) => {
  return (
    LEGACY_GLOBAL_PACKAGE_CONVERSION_IDS.includes(conversion.id as typeof LEGACY_GLOBAL_PACKAGE_CONVERSION_IDS[number]) ||
    inferConversionUnitType(conversion.fromUnit, conversion.toUnit) === 'package'
  );
};

export const DEFAULT_CONVERSIONS: UnitConversion[] = [
  { id: 'kg-gram', fromUnit: 'kg', toUnit: 'gram', ratio: 1000, isPreset: true, label: '1 kg = 1000 gram', unitType: 'measurement', scope: 'global', allowPriceFallback: true },
  { id: 'gram-kg', fromUnit: 'gram', toUnit: 'kg', ratio: 0.001, isPreset: true, label: '1 gram = 0.001 kg', unitType: 'measurement', scope: 'global', allowPriceFallback: true },
  { id: 'ons-gram', fromUnit: 'ons', toUnit: 'gram', ratio: 100, isPreset: true, label: '1 ons = 100 gram', unitType: 'measurement', scope: 'global', allowPriceFallback: true },
  { id: 'gram-ons', fromUnit: 'gram', toUnit: 'ons', ratio: 0.01, isPreset: true, label: '1 gram = 0.01 ons', unitType: 'measurement', scope: 'global', allowPriceFallback: true },
  { id: 'kg-ons', fromUnit: 'kg', toUnit: 'ons', ratio: 10, isPreset: true, label: '1 kg = 10 ons', unitType: 'measurement', scope: 'global', allowPriceFallback: true },
  { id: 'jam-menit', fromUnit: 'jam', toUnit: 'menit', ratio: 60, isPreset: true, label: '1 jam = 60 menit', unitType: 'time', scope: 'global', allowPriceFallback: false },
  { id: 'menit-detik', fromUnit: 'menit', toUnit: 'detik', ratio: 60, isPreset: true, label: '1 menit = 60 detik', unitType: 'time', scope: 'global', allowPriceFallback: false },
  { id: 'jam-detik', fromUnit: 'jam', toUnit: 'detik', ratio: 3600, isPreset: true, label: '1 jam = 3600 detik', unitType: 'time', scope: 'global', allowPriceFallback: false },
];

export const DEFAULT_UNITS: UnitDefinition[] = [
  createUnitDefinition('pcs', { type: 'count', canBeBaseUnit: true, canBeConversionUnit: false, isPreset: true }),
  createUnitDefinition('gram', { type: 'measurement', isPreset: true }),
  createUnitDefinition('kg', { type: 'measurement', isPreset: true }),
  createUnitDefinition('ons', { type: 'measurement', isPreset: true }),
  createUnitDefinition('liter', { type: 'measurement', isPreset: true }),
  createUnitDefinition('ml', { type: 'measurement', isPreset: true }),
  createUnitDefinition('meter', { type: 'measurement', isPreset: true }),
  createUnitDefinition('jam', { type: 'time', isPreset: true }),
  createUnitDefinition('menit', { type: 'time', isPreset: true }),
  createUnitDefinition('detik', { type: 'time', isPreset: true }),
  createUnitDefinition('pack', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('dus', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('box', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('renteng', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('lusin', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('kodi', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('gros', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('ikat', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('bundle', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
  createUnitDefinition('roll', { type: 'package', canBeBaseUnit: false, canBeConversionUnit: true, isPreset: true }),
];
