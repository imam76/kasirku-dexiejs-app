import { useEffect } from 'react';
import { App, Form, InputNumber, Modal, Switch } from 'antd';
import { Star } from 'lucide-react';
import { useMembershipSetting } from '@/hooks/useMembershipSetting';
import type { MembershipSettingInput } from '@/services/membershipService';

interface MembershipSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function MembershipSettingsModal({
  open,
  onClose,
}: MembershipSettingsModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MembershipSettingInput>();
  const { setting, isLoading, isSaving, saveSetting } = useMembershipSetting();

  useEffect(() => {
    if (!open) return;

    form.resetFields();
    if (setting) {
      form.setFieldsValue({
        earning_amount: setting.earning_amount,
        earning_points: setting.earning_points,
        point_value: setting.point_value,
        redeem_enabled: setting.redeem_enabled,
      });
    }
  }, [form, open, setting]);

  const handleSubmit = async (values: MembershipSettingInput) => {
    try {
      await saveSetting(values);
      message.success('Pengaturan membership berhasil disimpan.');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan membership.');
    }
  };

  return (
    <Modal
      title={(
        <div className="flex min-w-0 items-center gap-2">
          <Star className="h-5 w-5 shrink-0" />
          Membership Retail
        </div>
      )}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Simpan Membership"
      cancelText="Batal"
      confirmLoading={isSaving}
      okButtonProps={{ disabled: isLoading }}
      loading={isLoading}
      destroyOnHidden
      forceRender
      width={720}
    >
      <Form<MembershipSettingInput>
        form={form}
        layout="vertical"
        requiredMark={false}
        className="mt-4"
        initialValues={{
          earning_amount: 1000,
          earning_points: 1,
          point_value: 1,
          redeem_enabled: true,
        }}
        onFinish={handleSubmit}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="earning_amount"
            label="Belanja bersih"
            rules={[{ required: true, message: 'Nominal belanja wajib diisi.' }]}
          >
            <InputNumber<number> min={1} prefix="Rp" className="w-full" />
          </Form.Item>
          <Form.Item
            name="earning_points"
            label="Poin didapat"
            rules={[{ required: true, message: 'Poin wajib diisi.' }]}
          >
            <InputNumber<number> min={1} className="w-full" />
          </Form.Item>
          <Form.Item
            name="point_value"
            label="Nilai per poin"
            rules={[{ required: true, message: 'Nilai poin wajib diisi.' }]}
          >
            <InputNumber<number> min={1} prefix="Rp" className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="redeem_enabled" valuePropName="checked" className="mb-0">
          <Switch checkedChildren="Redeem aktif" unCheckedChildren="Redeem nonaktif" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
