import { useState } from 'react';
import { App, Button, Form, Input, Typography } from 'antd';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createOwnerUser, normalizeAuthEmail } from '@/auth/authService';
import { useAuth } from '@/auth/useAuth';

const { Text } = Typography;

interface SetupOwnerFormValues {
  name: string;
  email: string;
  pin: string;
  confirmPin: string;
}

interface SetupOwnerProps {
  onComplete?: () => void;
  onBackToLogin?: () => void;
}

export const SetupOwner = ({ onBackToLogin, onComplete }: SetupOwnerProps) => {
  const { message } = App.useApp();
  const { login } = useAuth();
  const [form] = Form.useForm<SetupOwnerFormValues>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: SetupOwnerFormValues) => {
    if (isSubmitting) return;

    if (values.pin !== values.confirmPin) {
      message.error('Konfirmasi PIN tidak sama.');
      return;
    }

    setIsSubmitting(true);
    try {
      const email = normalizeAuthEmail(values.email) ?? '';
      await createOwnerUser({
        name: values.name.trim(),
        email,
        pin: values.pin,
      });
      await login(email, values.pin);
      message.success('Owner berhasil dibuat.');
      onComplete?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal membuat Owner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Register Owner</h1>
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
          <Input size="large" autoFocus placeholder="Contoh: Imam" disabled={isSubmitting} />
        </Form.Item>

        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Email wajib diisi.' },
            { type: 'email', message: 'Format email tidak valid.' },
          ]}
        >
          <Input size="large" placeholder="Contoh: owner@toko.com" disabled={isSubmitting} />
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
          <Input.Password size="large" inputMode="numeric" placeholder="Masukkan PIN" disabled={isSubmitting} />
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
          <Input.Password size="large" inputMode="numeric" placeholder="Ulangi PIN" disabled={isSubmitting} />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting}>
          {isSubmitting ? 'Menyimpan...' : 'Simpan Owner'}
        </Button>

        {onBackToLogin && (
          <Button
            type="link"
            icon={<ArrowLeft size={16} />}
            onClick={onBackToLogin}
            disabled={isSubmitting}
            block
          >
            Kembali ke Login
          </Button>
        )}
      </Form>
    </div>
  );
};
