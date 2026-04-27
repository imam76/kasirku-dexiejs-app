import { saveExportFile } from './fileSaver';
import type { ExportTarget } from './fileSaver';

const JSON_MIME_TYPE = 'application/json';

export const exportJson = async ({
  filename,
  data,
  pretty = true,
  target,
}: {
  filename: string;
  data: unknown;
  pretty?: boolean;
  target?: ExportTarget;
}) => {
  return await saveExportFile({
    filename,
    mimeType: JSON_MIME_TYPE,
    content: JSON.stringify(data, null, pretty ? 2 : 0),
    target,
  });
};
