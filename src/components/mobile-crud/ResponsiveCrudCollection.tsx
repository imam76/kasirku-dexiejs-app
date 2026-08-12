import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import MobileCrudBottomSheet, { type MobileCrudBottomSheetProps } from './MobileCrudBottomSheet';
import MobileCrudFilterSheet, { type MobileCrudFilterSheetProps } from './MobileCrudFilterSheet';
import MobileCrudFloatingActions, {
  type MobileCrudFloatingActionsProps,
} from './MobileCrudFloatingActions';
import MobileCrudList, { type MobileCrudListProps } from './MobileCrudList';

export type ResponsiveCrudCollectionProps<T> = {
  desktop: ReactNode;
  mobileList: MobileCrudListProps<T>;
  mobileFilter?: MobileCrudFilterSheetProps;
  mobileDetail?: MobileCrudBottomSheetProps;
  mobileFloatingActions?: MobileCrudFloatingActionsProps;
};

/**
 * Satu entry point untuk collection CRUD responsif. Domain tetap memiliki data,
 * filter, card, detail, dan mutasi; komponen ini memilih shell desktop/mobile.
 */
export default function ResponsiveCrudCollection<T>({
  desktop,
  mobileList,
  mobileFilter,
  mobileDetail,
  mobileFloatingActions,
}: ResponsiveCrudCollectionProps<T>) {
  const isMobile = useIsMobile();

  if (!isMobile) return <>{desktop}</>;

  return (
    <>
      <MobileCrudList {...mobileList} />
      {mobileFilter ? <MobileCrudFilterSheet {...mobileFilter} /> : null}
      {mobileDetail ? <MobileCrudBottomSheet {...mobileDetail} /> : null}
      {mobileFloatingActions ? <MobileCrudFloatingActions {...mobileFloatingActions} /> : null}
    </>
  );
}
