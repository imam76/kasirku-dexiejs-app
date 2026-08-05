import { useCallback, useState } from 'react';
import { Alert, App, Button, Input, Typography } from 'antd';
import { Check, Database, ServerCog } from 'lucide-react';
import { postgresAdapter, type PostgresHealth } from '@/services/postgresAdapter';
import { getStoredHostIdentity, saveHostIdentity } from '@/services/hostIdentityService';
import {
  countUnsyncedQueueItems,
  hasLocalBusinessData,
  resetLocalDatabase,
} from '@/services/localDatabaseResetService';
import { resolveHostSwitchDecision } from '@/utils/hostSwitch';

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

type ModalApi = ReturnType<typeof App.useApp>['modal'];

// Tauri command failures arrive as plain strings, not Error instances.
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return 'Gagal menyimpan host database.';
};

const commitDatabaseUrl = async (
  databaseUrl: string,
  instanceId: string | null,
): Promise<PostgresHealth> => {
  const health = await postgresAdapter.setDatabaseUrl(databaseUrl);
  if (!health.available) {
    throw new Error(health.message ?? 'Koneksi PostgreSQL tidak tersedia.');
  }

  if (instanceId) saveHostIdentity(instanceId);
  return health;
};

const confirmHostSwitchReset = (modal: ModalApi, unsyncedCount: number) => (
  new Promise<boolean>((resolve) => {
    modal.confirm({
      title: 'Host database berbeda terdeteksi',
      width: 560,
      okText: 'Reset data lokal & pindah',
      okButtonProps: { danger: true },
      cancelText: 'Batal',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
      content: (
        <div className="space-y-3 pt-2">
          <p className="!mb-0 text-sm text-gray-600">
            Data di perangkat ini terikat pada host sebelumnya. Melanjutkan tanpa reset akan
            mencampur dua dataset dan menimbulkan dokumen yatim saat sinkronisasi.
          </p>
          <p className="!mb-0 text-sm text-gray-600">
            Database lokal akan dihapus, lalu data ditarik ulang dari host baru. Aplikasi dimuat
            ulang setelah proses selesai.
          </p>
          {unsyncedCount > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${unsyncedCount} data belum tersinkron akan hilang`}
              description="Sinkronkan dulu ke host lama jika data tersebut masih dibutuhkan."
            />
          )}
        </div>
      ),
    });
  })
);

export interface HostDatabaseTarget {
  host: string;
  port: string;
  database: string;
}

interface HostDatabaseSetupProps {
  health: PostgresHealth | null;
  errorMessage?: string | null;
  onConfigured: (health: PostgresHealth, target: HostDatabaseTarget) => void;
  embedded?: boolean;
}

export const HostDatabaseSetup = ({
  health,
  errorMessage,
  onConfigured,
  embedded = false,
}: HostDatabaseSetupProps) => {
  const { message, modal } = App.useApp();
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

    const databaseUrl = buildDatabaseUrl(dbParts);

    setIsSaving(true);
    try {
      const probe = await postgresAdapter.probeDatabaseUrl(databaseUrl);
      if (!probe.health.available) {
        throw new Error(probe.health.message ?? 'Koneksi PostgreSQL tidak tersedia.');
      }

      const decision = resolveHostSwitchDecision({
        storedInstanceId: getStoredHostIdentity(),
        nextInstanceId: probe.instanceId,
        hasLocalData: await hasLocalBusinessData(),
      });

      if (decision === 'requires-local-reset') {
        const isConfirmed = await confirmHostSwitchReset(modal, await countUnsyncedQueueItems());
        if (!isConfirmed) return;

        await commitDatabaseUrl(databaseUrl, probe.instanceId);
        await resetLocalDatabase();
        window.location.reload();
        return;
      }

      const nextHealth = await commitDatabaseUrl(databaseUrl, probe.instanceId);
      message.success('Host database berhasil disimpan.');
      onConfigured(nextHealth, {
        host: dbParts.host.trim(),
        port: dbParts.port.trim() || '5432',
        database: dbParts.name.trim() || 'postgres',
      });
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [dbParts, message, modal, onConfigured]);

  const statusMessage = errorMessage ?? health?.message;

  return (
    <div className={embedded ? '' : 'flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4'}>
      <div className={embedded ? 'w-full' : 'w-full max-w-xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm'}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ServerCog size={24} />
          </div>
          <div>
            <Title level={3} className="!mb-0">
              Setup Host Database
            </Title>
            <Text type="secondary">
              Atur PostgreSQL pusat untuk sinkronisasi data antar perangkat.
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
