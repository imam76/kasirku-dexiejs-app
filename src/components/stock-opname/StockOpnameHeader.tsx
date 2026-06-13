import { DatePicker, Descriptions, Input } from 'antd';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { StockOpname } from '@/types';
import StockOpnameStatusBadge from './StockOpnameStatusBadge';

interface StockOpnameHeaderProps {
  opname: StockOpname;
  countedAt: string;
  notes?: string;
  editable?: boolean;
  onCountedAtChange?: (value: string) => void;
  onNotesChange?: (value: string) => void;
}

export default function StockOpnameHeader({
  opname,
  countedAt,
  notes,
  editable = false,
  onCountedAtChange,
  onNotesChange,
}: StockOpnameHeaderProps) {
  const { t } = useI18n();

  return (
    <Descriptions
      bordered
      size="small"
      column={{ xs: 1, sm: 2, lg: 3 }}
      className="bg-white"
    >
      <Descriptions.Item label={t('stockOpname.number')}>
        <span className="font-semibold">{opname.opname_number}</span>
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.status')}>
        <StockOpnameStatusBadge status={opname.status} />
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.countedAt')}>
        {editable ? (
          <DatePicker
            showTime
            value={dayjs(countedAt)}
            format="DD MMM YYYY HH:mm"
            className="w-full"
            onChange={(value) => {
              if (value) onCountedAtChange?.(value.toISOString());
            }}
          />
        ) : (
          dayjs(countedAt).tz().format('DD MMM YYYY HH:mm')
        )}
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.warehouse')}>
        {opname.warehouse_name || opname.warehouse_code || '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.createdBy')}>
        {opname.created_by_name || '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.postedBy')}>
        {opname.posted_by_name || '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('stockOpname.notes')} span={3}>
        {editable ? (
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={notes}
            onChange={(event) => onNotesChange?.(event.target.value)}
          />
        ) : (
          notes || opname.cancel_reason || '-'
        )}
      </Descriptions.Item>
    </Descriptions>
  );
}
