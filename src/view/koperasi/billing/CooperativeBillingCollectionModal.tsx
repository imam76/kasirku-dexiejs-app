import { DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeLoanInstallmentCollectionStatus } from '@/types';

const { TextArea } = Input;

export interface CooperativeBillingCollectionFormValues {
  event_id: string;
  collection_status: Exclude<CooperativeLoanInstallmentCollectionStatus, 'NONE'>;
  follow_up_date?: Dayjs;
  collection_notes: string;
}

interface CooperativeBillingCollectionModalProps {
  form: FormInstance<CooperativeBillingCollectionFormValues>;
  open: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CooperativeBillingCollectionFormValues) => void;
}

export default function CooperativeBillingCollectionModal({
  form,
  open,
  isSubmitting,
  onCancel,
  onSubmit,
}: CooperativeBillingCollectionModalProps) {
  const { t } = useI18n();
  const collectionStatus = Form.useWatch('collection_status', form);
  const isFollowUpRequired = collectionStatus !== 'UNABLE_TO_PAY';

  return (
    <Modal
      title={t('cooperative.billing.collection.title')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.billing.collection.save')}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={560}
    >
      <Form<CooperativeBillingCollectionFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item
          name="collection_status"
          label={t('cooperative.billing.collection.status')}
          rules={[{ required: true, message: t('cooperative.billing.collection.validation.statusRequired') }]}
        >
          <Select
            options={[
              { value: 'PROMISED_TO_PAY', label: t('cooperative.billing.collection.status.promisedToPay') },
              { value: 'UNABLE_TO_PAY', label: t('cooperative.billing.collection.status.unableToPay') },
              { value: 'FOLLOW_UP', label: t('cooperative.billing.collection.status.followUp') },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="follow_up_date"
          label={t('cooperative.billing.collection.followUpDate')}
          rules={[
            {
              required: isFollowUpRequired,
              message: t('cooperative.billing.collection.validation.followUpRequired'),
            },
          ]}
        >
          <DatePicker showTime className="w-full" />
        </Form.Item>

        <Form.Item
          name="collection_notes"
          label={t('cooperative.billing.collection.notes')}
          rules={[{ required: true, min: 3, message: t('cooperative.billing.collection.validation.notesRequired') }]}
        >
          <TextArea rows={4} placeholder={t('cooperative.billing.collection.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
