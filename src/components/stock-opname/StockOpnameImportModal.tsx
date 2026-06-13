import { Alert, Button, Modal, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { Upload as UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import {
  parseStockOpnameCsv,
  type StockOpnameCsvImportRow,
} from '@/utils/stockOpname/stockOpnameCsv';

const { Text } = Typography;

interface StockOpnameImportModalProps {
  open: boolean;
  onCancel: () => void;
  onImport: (rows: StockOpnameCsvImportRow[]) => void;
}

const readFileAsText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

export default function StockOpnameImportModal({
  open,
  onCancel,
  onImport,
}: StockOpnameImportModalProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<StockOpnameCsvImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const reset = () => {
    setRows([]);
    setErrors([]);
    setFileName('');
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const uploadProps: UploadProps = {
    accept: '.csv,text/csv',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file) => {
      const content = await readFileAsText(file);
      const result = parseStockOpnameCsv(content);
      setRows(result.rows);
      setErrors(result.errors);
      setFileName(file.name);
      return false;
    },
  };

  return (
    <Modal
      open={open}
      title={t('stockOpname.importCsv')}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="import"
          type="primary"
          disabled={rows.length === 0 || errors.length > 0}
          onClick={() => {
            onImport(rows);
            handleCancel();
          }}
        >
          {t('stockOpname.importApply')}
        </Button>,
      ]}
    >
      <Space direction="vertical" className="w-full" size="middle">
        <Upload {...uploadProps}>
          <Button icon={<UploadIcon size={16} />}>
            {t('stockOpname.chooseCsv')}
          </Button>
        </Upload>
        {fileName && <Text type="secondary">{fileName}</Text>}
        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            message={t('stockOpname.importError')}
            description={(
              <ul className="m-0 pl-4">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          />
        )}
        {rows.length > 0 && errors.length === 0 && (
          <Alert
            type="success"
            showIcon
            message={t('stockOpname.importReady', { count: rows.length })}
          />
        )}
      </Space>
    </Modal>
  );
}
