import { Tag } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import type { StockOpnameStatus } from '@/types';

const statusColor: Record<StockOpnameStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  CANCELLED: 'red',
};

const statusLabelKey: Record<StockOpnameStatus, TranslationKey> = {
  DRAFT: 'stockOpname.status.DRAFT',
  POSTED: 'stockOpname.status.POSTED',
  CANCELLED: 'stockOpname.status.CANCELLED',
};

export default function StockOpnameStatusBadge({ status }: { status: StockOpnameStatus }) {
  const { t } = useI18n();

  return (
    <Tag color={statusColor[status]}>
      {t(statusLabelKey[status])}
    </Tag>
  );
}
