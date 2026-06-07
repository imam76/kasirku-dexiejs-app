import { Modal, Select, Typography } from 'antd';
import type { SelectProps } from 'antd';
import { useI18n } from '@/hooks/useI18n';

const { Text } = Typography;

interface DocumentDiscountSettingsModalProps {
  open: boolean;
  title: string;
  accountLabel: string;
  accountPlaceholder: string;
  accountValue?: string;
  defaultAccountValue?: string;
  accountOptions: SelectProps['options'];
  onAccountChange: (value?: string) => void;
  onClose: () => void;
}

export function DocumentDiscountSettingsModal({
  open,
  title,
  accountLabel,
  accountPlaceholder,
  accountValue,
  defaultAccountValue,
  accountOptions,
  onAccountChange,
  onClose,
}: DocumentDiscountSettingsModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText={t('scanner.close')}
      cancelButtonProps={{ style: { display: 'none' } }}
      destroyOnClose
    >
      <div className="space-y-2">
        <Text className="text-sm font-medium text-gray-700">{accountLabel}</Text>
        <Select
          className="w-full"
          showSearch={{ optionFilterProp: 'label' }}
          placeholder={accountPlaceholder}
          value={accountValue ?? defaultAccountValue}
          options={accountOptions}
          onChange={onAccountChange}
        />
      </div>
    </Modal>
  );
}
