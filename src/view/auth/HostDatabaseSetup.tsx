import { useCallback, useState } from 'react';
import { Alert, App, Button, Input, Typography } from 'antd';
import { Check, Database, ServerCog } from 'lucide-react';
import { postgresAdapter, type PostgresHealth } from '@/services/postgresAdapter';

const { Text, Title } = Typography;

interface DatabaseParts {
  host: string;
  port: string;
  name: string;
  user: string;
  password: string;
}

const DEFAULT_DB_PARTS: DatabaseParts = {
  host: '',
  port: '5432',
  name: 'postgres',
  user: 'postgres',
  password: '',
};

const buildDatabaseUrl = (parts: DatabaseParts): string => {
  const host = parts.host.trim();
  const port = parts.port.trim() || '5432';
  const name = parts.name.trim() || 'postgres';
  const user = parts.user.trim();
  const auth = user
    ? `${encodeURIComponent(user)}${parts.password ? `:${encodeURIComponent(parts.password)}` : ''}@`
    : '';

  return `postgresql://${auth}${host}:${port}/${name}`;
};

interface HostDatabaseSetupProps {
  health: PostgresHealth | null;
  errorMessage?: string | null;
  onConfigured: (health: PostgresHealth) => void;
}

export const HostDatabaseSetup = ({
  health,
  errorMessage,
  onConfigured,
}: HostDatabaseSetupProps) => {
  const { message } = App.useApp();
  const [dbParts, setDbParts] = useState<DatabaseParts>(DEFAULT_DB_PARTS);
  const [isSaving, setIsSaving] = useState(false);

  const updateDbPart = useCallback(
    (key: keyof DatabaseParts, value: string) =>
      setDbParts((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const handleSave = useCallback(async () => {
    if (!dbParts.host.trim()) {
      message.warning('Host database wajib diisi.');
      return;
    }

    setIsSaving(true);
    try {
      const nextHealth = await postgresAdapter.setDatabaseUrl(buildDatabaseUrl(dbParts));
      if (!nextHealth.available) {
        throw new Error(nextHealth.message ?? 'Koneksi PostgreSQL tidak tersedia.');
      }

      message.success('Host database berhasil disimpan.');
      onConfigured(nextHealth);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan host database.');
    } finally {
      setIsSaving(false);
    }
  }, [dbParts, message, onConfigured]);

  const statusMessage = errorMessage ?? health?.message;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ServerCog size={24} />
          </div>
          <div>
            <Title level={3} className="!mb-0">
              Setup Host Database
            </Title>
            <Text type="secondary">
              Hubungkan aplikasi ke PostgreSQL pusat sebelum setup fitur.
            </Text>
          </div>
        </div>

        {statusMessage && (
          <Alert
            className="mb-4"
            type={health?.status === 'migration_failed' ? 'error' : 'warning'}
            showIcon
            message={health?.status === 'migration_failed' ? 'Migration gagal' : 'Database belum siap'}
            description={statusMessage}
          />
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Host / IP
            </label>
            <Input
              size="large"
              value={dbParts.host}
              onChange={(event) => updateDbPart('host', event.target.value)}
              placeholder="192.168.1.8 atau db.contoh.com"
              prefix={<Database size={14} className="text-gray-400" />}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Port
              </label>
              <Input
                size="large"
                value={dbParts.port}
                onChange={(event) => updateDbPart('port', event.target.value)}
                placeholder="5432"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Nama Database
              </label>
              <Input
                size="large"
                value={dbParts.name}
                onChange={(event) => updateDbPart('name', event.target.value)}
                placeholder="postgres"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                User
              </label>
              <Input
                size="large"
                value={dbParts.user}
                onChange={(event) => updateDbPart('user', event.target.value)}
                placeholder="postgres"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Password
              </label>
              <Input.Password
                size="large"
                value={dbParts.password}
                onChange={(event) => updateDbPart('password', event.target.value)}
                placeholder="Password database"
                onPressEnter={handleSave}
              />
            </div>
          </div>
        </div>

        <Button
          type="primary"
          size="large"
          block
          className="!mt-5 !h-11"
          loading={isSaving}
          onClick={handleSave}
          icon={<Check size={16} />}
        >
          Simpan Host Database
        </Button>
      </div>
    </div>
  );
};
