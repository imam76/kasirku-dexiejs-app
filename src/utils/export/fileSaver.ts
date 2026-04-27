import { BaseDirectory, appCacheDir, join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { shareFile } from 'tauri-plugin-share';
import { isTauriMobile, isTauriRuntime } from './platform';

export type ExportFileContent = string | ArrayBuffer | Uint8Array;
export type ExportTarget = 'share' | 'save' | 'auto';

export type SaveExportFileOptions = {
  filename: string;
  mimeType: string;
  content: ExportFileContent;
  target?: ExportTarget;
};

const sanitizeFilename = (filename: string) => filename.replace(/[\\/:*?"<>|]/g, '-');

const toArrayBuffer = (content: ArrayBuffer | Uint8Array) => {
  if (content instanceof ArrayBuffer) return content;

  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
};

const toUint8Array = (content: ArrayBuffer | Uint8Array) => {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);

  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy;
};

const downloadWithBrowser = ({ filename, mimeType, content }: SaveExportFileOptions) => {
  const blobPart = typeof content === 'string' ? content : toArrayBuffer(content);
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

const shareWithTauriMobile = async ({ filename, mimeType, content }: SaveExportFileOptions) => {
  const safeFilename = sanitizeFilename(filename);
  const cachePath = await join(await appCacheDir(), safeFilename);

  if (typeof content === 'string') {
    await writeTextFile(safeFilename, content, { baseDir: BaseDirectory.AppCache });
  } else {
    await writeFile(safeFilename, toUint8Array(content), { baseDir: BaseDirectory.AppCache });
  }

  await shareFile(cachePath, mimeType);
  return true;
};

const saveWithTauriDialog = async ({ filename, content }: SaveExportFileOptions) => {
  const safeFilename = sanitizeFilename(filename);
  const destination = await save({ defaultPath: safeFilename });

  if (!destination) return false;

  if (typeof content === 'string') {
    await writeTextFile(destination, content);
  } else {
    await writeFile(destination, toUint8Array(content));
  }

  return true;
};

export const saveExportFile = async (options: SaveExportFileOptions) => {
  const target = options.target ?? 'auto';

  if ((target === 'share' || target === 'auto') && isTauriMobile()) {
    try {
      await shareWithTauriMobile(options);
      return true;
    } catch (error) {
      console.error('Native mobile export failed:', error);
      throw error;
    }
  }

  if (target === 'save' && isTauriRuntime()) {
    try {
      return await saveWithTauriDialog(options);
    } catch (error) {
      console.error('Native save export failed:', error);
      throw error;
    }
  }

  return downloadWithBrowser(options);
};
