import { useEffect } from 'react';
import { App, Button, Card, Form, InputNumber, Switch } from 'antd';
import { Save, Star } from 'lucide-react';
import { useMembershipSetting } from '@/hooks/useMembershipSetting';
import type { MembershipSettingInput } from '@/services/membershipService';

export default function MembershipSettingsCard() {
  const { message } = App.useApp();
  const [form] = Form.useForm<MembershipSettingInput>();
  const { setting, isLoading, isSaving, saveSetting } = useMembershipSetting();

  useEffect(() => {
    if (!setting) return;
    form.setFieldsValue({
      earning_amount: setting.earning_amount,
      earning_points: setting.earning_points,
      point_value: setting.point_value,
      redeem_enabled: setting.redeem_enabled,
    });
  }, [form, setting]);

  const handleSubmit = async (values: MembershipSettingInput) => {
    try {
      await saveSetting(values);
      message.success('Pengaturan membership berhasil disimpan.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan membership.');
    }
  };

  return (
    <Card
      title={<div className="flex min-w-0 items-center gap-2"><Star className="h-5 w-5 shrink-0" /> Membership Retail</div>}
      className="shadow-md"
      loading={isLoading}
    >
      <Form<MembershipSettingInput>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          earning_amount: 1000,
          earning_points: 1,
          point_value: 1,
          redeem_enabled: true,
        }}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Form.Item name="redeem_enabled" valuePropName="checked" className="mb-0">
            <Switch checkedChildren="Redeem aktif" unCheckedChildren="Redeem nonaktif" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<Save className="h-4 w-4" />}
            loading={isSaving}
          >
            Simpan Membership
          </Button>
        </div>
      </Form>
    </Card>
  );
}
