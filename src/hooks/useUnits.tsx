import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { DEFAULT_UNITS } from '@/constants/units';
import { useMemo } from 'react';

export const useUnits = () => {
  const liveUnits = useLiveQuery(
    async () => {
      const stored = await db.units.toArray();
      return stored.length > 0 ? stored : DEFAULT_UNITS;
    },
    [],
    []
  );

  const units = useMemo(() => liveUnits || DEFAULT_UNITS, [liveUnits]);
  const unitOptions = useMemo(() => 
    units.map((u) => ({ value: u.id, label: u.name })),
    [units]
  );

  return {
    units,
    unitOptions,
    isLoading: liveUnits === undefined,
  };
};
