import { useState } from 'react';
import { App, Card, Segmented, Typography } from 'antd';
import { Printer } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { ReceiptPaperSize } from '@/types';
import {
  getStoredReceiptPaperSize,
  saveStoredReceiptPaperSize,
} from '@/utils/printer/receiptPaperSize';

const { Paragraph, Text } = Typography;

export default function ReceiptPrintSettingsCard() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize>(getStoredReceiptPaperSize);

  const handlePaperSizeChange = (value: string | number) => {
    const nextPaperSize = value as ReceiptPaperSize;
    saveStoredReceiptPaperSize(nextPaperSize);
    setPaperSize(nextPaperSize);
    message.success(t('settings.receiptPrint.paperSizeSaved'));
  };

  return (
    <Card
      title={(
        <div className="flex min-w-0 items-center gap-2">
          <Printer className="h-5 w-5 shrink-0" />
          {t('settings.receiptPrint.title')}
        </div>
      )}
      className="shadow-md"
    >
      <div className="space-y-3">
        <Text className="block font-semibold text-gray-700">
          {t('settings.receiptPrint.paperSize')}
        </Text>
        <Segmented
          block
          value={paperSize}
          onChange={handlePaperSizeChange}
          options={[
            { label: t('settings.receiptPrint.paper58'), value: '58mm' },
            { label: t('settings.receiptPrint.paper80'), value: '80mm' },
          ]}
        />
        <Paragraph className="!mb-0 text-gray-600">
          {t('settings.receiptPrint.paperSizeDescription')}
        </Paragraph>
      </div>
    </Card>
  );
}
