import { Card, Descriptions, Typography } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { SalesReturnResolution } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface SalesReturnSummaryProps {
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  restockQuantity: number;
  resolution: SalesReturnResolution;
}

export const SalesReturnSummary = ({
  subtotalAmount,
  discountAmount,
  taxAmount,
  totalAmount,
  restockQuantity,
  resolution,
}: SalesReturnSummaryProps) => {
  const { t } = useI18n();
  const financeAmount = resolution === 'REFUND' || resolution === 'CREDIT_NOTE' ? totalAmount : 0;

  return (
    <Card size="small">
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
        <Descriptions.Item label={t('salesReturns.field.subtotal')}>
          Rp {formatCurrency(subtotalAmount)}
        </Descriptions.Item>
        <Descriptions.Item label={t('salesReturns.field.discount')}>
          Rp {formatCurrency(discountAmount)}
        </Descriptions.Item>
        <Descriptions.Item label={t('salesReturns.field.tax')}>
          Rp {formatCurrency(taxAmount)}
        </Descriptions.Item>
        <Descriptions.Item label={t('salesReturns.field.total')}>
          <Text strong>Rp {formatCurrency(totalAmount)}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('salesReturns.field.restockQuantity')}>
          {formatCurrency(restockQuantity)}
        </Descriptions.Item>
        <Descriptions.Item label={t('salesReturns.field.financeEffect')}>
          {resolution === 'NO_FINANCE' ? '-' : `Rp ${formatCurrency(financeAmount)}`}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};
