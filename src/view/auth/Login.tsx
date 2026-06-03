import { App, Button, Form, Input, Typography } from 'antd';
import { LockKeyhole } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { ROLE_LABEL } from '@/auth/permissions';
import { useAuth } from '@/auth/useAuth';

const { Text } = Typography;

interface LoginFormValues {
  pin: string;
}

interface LoginProps {
  registrationAvailable?: boolean;
  onRegister?: () => void;
}

export const Login = ({ registrationAvailable = false, onRegister }: LoginProps) => {
  const { message } = App.useApp();
  const { login } = useAuth();
  const [form] = Form.useForm<LoginFormValues>();
  const activeUsers = useLiveQuery(
    () => db.authUsers.toArray(),
    [],
    [],
  ).filter((user) => user.is_active);

  const handleSubmit = async (values: LoginFormValues) => {
    try {
      await login(values.pin);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Login gagal.');
    }
  };
  const canLogin = activeUsers.length > 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <LockKeyhole size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Masuk Kasirku</h1>
          <Text type="secondary">Gunakan PIN user aktif.</Text>
        </div>
      </div>

      {canLogin ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
          <Text type="secondary" className="block text-xs uppercase">
            User aktif
          </Text>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeUsers.map((user) => (
              <span key={user.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                {user.name} - {ROLE_LABEL[user.role]}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <Text strong className="block text-sm text-amber-900">
            Belum ada user aktif.
          </Text>
          <Text className="mt-1 block text-sm text-amber-800">
            Buat Owner pertama lewat halaman register sebelum masuk ke aplikasi.
          </Text>
        </div>
      )}

      {canLogin && (
        <Form<LoginFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
        >
          <Form.Item
            label="PIN"
            name="pin"
            rules={[
              { required: true, message: 'PIN wajib diisi.' },
              { min: 4, message: 'PIN minimal 4 digit.' },
              { pattern: /^\d+$/, message: 'PIN hanya boleh angka.' },
            ]}
          >
            <Input.Password size="large" inputMode="numeric" autoFocus placeholder="Masukkan PIN" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block>
            Masuk
          </Button>
        </Form>
      )}

      {registrationAvailable && (
        <Button type={canLogin ? 'default' : 'primary'} size="large" block className={canLogin ? 'mt-3' : ''} onClick={onRegister}>
          Register Owner Pertama
        </Button>
      )}
    </div>
  );
};
