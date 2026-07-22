import { useEffect } from 'react';
import { App } from 'antd';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { isTauriDesktop } from '@/utils/export/platform';

let updateCheckStarted = false;

const UPDATE_MESSAGE_KEY = 'frayukti-auto-updater';

const shouldCheckForUpdates = () =>
  isTauriDesktop() &&
  (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_UPDATER_IN_DEV === 'true');

const progressMessage = (event: DownloadEvent, downloadedBytes: number) => {
  if (event.event === 'Started') {
    return 'Mengunduh update...';
  }

  if (event.event === 'Finished') {
    return 'Memasang update...';
  }

  return `Mengunduh update (${Math.max(1, Math.round(downloadedBytes / 1024 / 1024))} MB)...`;
};

export function AutoUpdater() {
  const { modal, message } = App.useApp();

  useEffect(() => {
    if (updateCheckStarted || !shouldCheckForUpdates()) {
      return;
    }

    updateCheckStarted = true;

    const installUpdate = async (update: Update) => {
      let downloadedBytes = 0;

      message.open({
        key: UPDATE_MESSAGE_KEY,
        type: 'loading',
        content: 'Mengunduh update...',
        duration: 0,
      });

      try {
        await update.downloadAndInstall((event) => {
          if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
          }

          message.open({
            key: UPDATE_MESSAGE_KEY,
            type: 'loading',
            content: progressMessage(event, downloadedBytes),
            duration: 0,
          });
        });

        message.open({
          key: UPDATE_MESSAGE_KEY,
          type: 'success',
          content: 'Update selesai. Aplikasi akan dibuka ulang...',
          duration: 1,
        });

        await relaunch();
      } catch (error) {
        console.error('Failed to install update:', error);
        message.open({
          key: UPDATE_MESSAGE_KEY,
          type: 'error',
          content: 'Gagal memasang update. Coba lagi nanti.',
          duration: 5,
        });
      }
    };

    const runUpdateCheck = async () => {
      try {
        const update = await check({ timeout: 15_000 });
        if (!update) {
          return;
        }

        modal.confirm({
          title: `Update frayukti ${update.version} tersedia`,
          content: (
            <div>
              <p>Versi saat ini: {update.currentVersion}</p>
              <p>Data setup, koneksi database, dan cache lokal tetap disimpan setelah update.</p>
            </div>
          ),
          okText: 'Update sekarang',
          cancelText: 'Nanti',
          onOk: () => installUpdate(update),
          onCancel: () => {
            void update.close();
          },
        });
      } catch (error) {
        console.warn('Unable to check for updates:', error);
      }
    };

    void runUpdateCheck();
  }, [message, modal]);

  return null;
}
