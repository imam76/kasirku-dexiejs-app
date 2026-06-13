import { Card, Statistic } from 'antd';
import { ArrowDownCircle, ArrowUpCircle, Boxes, Scale } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { StockOpname } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface StockOpnameSummaryProps {
  opname: Pick<StockOpname, 'total_items' | 'total_adjustment_in' | 'total_adjustment_out' | 'total_variance_value'>;
}

export default function StockOpnameSummary({ opname }: StockOpnameSummaryProps) {
  const { t } = useI18n();

  const items = [
    {
      key: 'items',
      title: t('stockOpname.totalItems'),
      value: opname.total_items,
      icon: Boxes,
      className: 'text-slate-600',
    },
    {
      key: 'in',
      title: t('stockOpname.adjustmentIn'),
      value: opname.total_adjustment_in,
      icon: ArrowUpCircle,
      className: 'text-emerald-600',
    },
    {
      key: 'out',
      title: t('stockOpname.adjustmentOut'),
      value: opname.total_adjustment_out,
      icon: ArrowDownCircle,
      className: 'text-rose-600',
    },
    {
      key: 'value',
      title: t('stockOpname.varianceValue'),
      value: `Rp ${formatCurrency(opname.total_variance_value || 0)}`,
      icon: Scale,
      className: 'text-blue-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.key} size="small" className="rounded-md">
          <div className="flex items-center gap-3">
            <item.icon className={`h-5 w-5 ${item.className}`} />
            <Statistic title={item.title} value={item.value} />
          </div>
        </Card>
      ))}
    </div>
  );
}
