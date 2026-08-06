import { useCallback, useState } from 'react';
import { App, Modal } from 'antd';
import { Server } from 'lucide-react';
import { getRemoteSetupConfig, saveSetupConfigForRuntime } from '@/services/setupKeyService';
import { setPostgresConnectionHealth } from '@/store/postgresConnectionStore';
import type { PostgresHealth } from '@/services/postgresAdapter';
import { HostDatabaseSetup, type HostDatabaseTarget } from '@/view/auth/HostDatabaseSetup';

interface JoinExistingHostModalProps {
  open: boolean;
  onClose: () => void;
  onJoined: () => void;
}

export const JoinExistingHostModal = ({ open, onClose, onJoined }: JoinExistingHostModalProps) => {
  const { message } = App.useApp();
  const [isChecking, setIsChecking] = useState(false);

  const handleConfigured = useCallback(
    async (health: PostgresHealth, _target: HostDatabaseTarget) => {
      setPostgresConnectionHealth(health);
      setIsChecking(true);
      try {
        const remoteConfig = await getRemoteSetupConfig();
        if (!remoteConfig) {
          message.warning(
            'Host terhubung, tapi belum pernah di-setup. Minta admin/developer melakukan Developer Setup di host ini terlebih dahulu.',
          );
          return;
        }

        await saveSetupConfigForRuntime(remoteConfig);
        message.success('Terhubung ke host. Konfigurasi dimuat otomatis dari host.');
        onJoined();
        onClose();
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Gagal memuat konfigurasi dari host.');
      } finally {
        setIsChecking(false);
      }
    },
    [message, onClose, onJoined],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
      title={
        <div className="flex items-center gap-2">
          <Server size={18} className="text-blue-600" />
          <span>Hubungkan ke Host yang Sudah Disetup</span>
        </div>
      }
    >
      <p className="mb-4 text-sm text-gray-500">
        Masukkan alamat database host yang sudah dipakai perangkat lain di toko ini. Module dan
        konfigurasi akan otomatis mengikuti host — tidak perlu license key lagi di perangkat ini.
      </p>
      <HostDatabaseSetup embedded health={null} onConfigured={handleConfigured} />
      {isChecking && (
        <p className="mt-3 text-xs text-gray-400">Memeriksa konfigurasi di host...</p>
      )}
    </Modal>
  );
};
