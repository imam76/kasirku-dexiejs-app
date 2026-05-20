import { App, Button, Form, Input, Typography } from 'antd';
import { ShieldCheck } from 'lucide-react';
import { createOwnerUser } from '@/auth/authService';
import { useAuth } from '@/auth/useAuth';

const { Text } = Typography;

interface SetupOwnerFormValues {
  name: string;
  pin: string;
  confirmPin: string;
}

interface SetupOwnerProps {
  onComplete?: () => void;
}

export const SetupOwner = ({ onComplete }: SetupOwnerProps) => {
  const { message } = App.useApp();
  const { login } = useAuth();
  const [form] = Form.useForm<SetupOwnerFormValues>();

  const handleSubmit = async (values: SetupOwnerFormValues) => {
    if (values.pin !== values.confirmPin) {
      message.error('Konfirmasi PIN tidak sama.');
      return;
    }

    try {
      await createOwnerUser({
        name: values.name.trim(),
        pin: values.pin,
      });
      await login(values.pin);
      message.success('Owner berhasil dibuat.');
      onComplete?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuat Owner.');
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Setup Owner</h1>
          <Text type="secondary">Buat akses utama untuk toko ini.</Text>
        </div>
      </div>

      <Form<SetupOwnerFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Form.Item
          label="Nama Owner"
          name="name"
          rules={[
            { required: true, message: 'Nama Owner wajib diisi.' },
            { min: 2, message: 'Nama minimal 2 karakter.' },
          ]}
        >
          <Input size="large" autoFocus placeholder="Contoh: Imam" />
        </Form.Item>

        <Form.Item
          label="PIN"
          name="pin"
          rules={[
            { required: true, message: 'PIN wajib diisi.' },
            { min: 4, message: 'PIN minimal 4 digit.' },
            { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
          ]}
        >
          <Input.Password size="large" inputMode="numeric" placeholder="Masukkan PIN" />
        </Form.Item>

        <Form.Item
          label="Konfirmasi PIN"
          name="confirmPin"
          rules={[
            { required: true, message: 'Konfirmasi PIN wajib diisi.' },
            { min: 4, message: 'PIN minimal 4 digit.' },
            { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
          ]}
        >
          <Input.Password size="large" inputMode="numeric" placeholder="Ulangi PIN" />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block>
          Simpan Owner
        </Button>
      </Form>
    </div>
  );
};
