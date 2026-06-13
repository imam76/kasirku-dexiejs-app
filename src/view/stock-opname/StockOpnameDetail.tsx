import { Button, Card, Empty, Space, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
import StockOpnameHeader from '@/components/stock-opname/StockOpnameHeader';
import StockOpnameItemTable from '@/components/stock-opname/StockOpnameItemTable';
import StockOpnameSummary from '@/components/stock-opname/StockOpnameSummary';
import { Loading } from '@/components/Loading';
import { useI18n } from '@/hooks/useI18n';
import { useStockOpnames } from '@/hooks/useStockOpnames';

const { Title } = Typography;

interface StockOpnameDetailProps {
  opnameId: string;
  onBack: () => void;
}

export default function StockOpnameDetail({ opnameId, onBack }: StockOpnameDetailProps) {
  const { t } = useI18n();
  const { detail, isLoadingDetail } = useStockOpnames({ detailId: opnameId });

  if (isLoadingDetail) {
    return <Loading />;
  }

  if (!detail) {
    return <Empty description={t('stockOpname.notFound')} />;
  }

  return (
    <div className="space-y-4">
      <Space>
        <Button icon={<ArrowLeft size={16} />} onClick={onBack}>
          {t('common.back')}
        </Button>
        <Title level={4} className="!mb-0">
          {t('stockOpname.detailTitle')}
        </Title>
      </Space>

      <StockOpnameHeader
        opname={detail.opname}
        countedAt={detail.opname.counted_at}
        notes={detail.opname.notes}
      />
      <StockOpnameSummary opname={detail.opname} />
      <Card className="rounded-md">
        <StockOpnameItemTable items={detail.items} />
      </Card>
    </div>
  );
}
