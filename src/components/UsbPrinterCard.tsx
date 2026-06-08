import { Alert, App, Button, Card, Select, Tag, Typography, Divider, Tooltip } from 'antd';
import { CheckCircle2, Plug, Printer, RefreshCw, Trash2, Info, AlertCircle } from 'lucide-react';
import { useUsbPrinter } from '@/hooks/useUsbPrinter';

const { Text, Title } = Typography;

const BAUD_RATE_OPTIONS = [
  { label: '9600 baud', value: 9600 },
  { label: '19200 baud', value: 19200 },
  { label: '38400 baud', value: 38400 },
  { label: '57600 baud', value: 57600 },
  { label: '115200 baud', value: 115200 },
];

export default function UsbPrinterCard() {
  const { message } = App.useApp();
  const {
    printers,
    isSupported,
    selectedPrinter,
    isLoadingPrinters,
    isSelecting,
    isTesting,
    lastError,
    loadPrinters,
    selectPrinter,
    clearPrinter,
    updateBaudRate,
    testPrint,
  } = useUsbPrinter();

  const handleSelect = async () => {
    try {
      const printer = await selectPrinter();
      message.success(`Printer USB dipilih: ${printer.name}`);
    } catch {
      message.warning('Gagal memilih printer USB.');
    }
  };

  const handleLoadPrinters = async () => {
    try {
      const devices = await loadPrinters();
      if (devices.length === 0) {
        message.warning('Tidak ada port serial USB terdeteksi');
        return;
      }
      message.success(`Ditemukan ${devices.length} port serial`);
    } catch {
      message.warning('Gagal memuat daftar port serial USB');
    }
  };

  const handleSelectListedPrinter = async (portName: string) => {
    const device = printers.find((item) => item.portName === portName);
    if (!device) return;

    try {
      const printer = await selectPrinter(device);
      message.success(`Printer USB dipilih: ${printer.name}`);
    } catch {
      message.warning('Gagal memilih printer USB.');
    }
  };

  const handleTestPrint = async () => {
    try {
      await testPrint();
      message.success('Test print USB berhasil dikirim');
    } catch {
      message.warning('Test print USB gagal');
    }
  };

  return (
    <Card
      title={
        <div className="flex min-w-0 items-center gap-2">
          <Plug className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <Title level={5} className="!mb-0 !text-base">
              Printer USB Serial
            </Title>
            <Text type="secondary" className="block truncate text-xs">
              Koneksi thermal printer via USB
            </Text>
          </div>
        </div>
      }
      className="h-full shadow-md hover:shadow-lg transition-shadow"
      styles={{ body: { padding: 16 } }}
    >
      <div className="min-w-0 space-y-4">
        {/* Platform Support Alert */}
        {!isSupported && (
          <Alert
            type="warning"
            icon={<AlertCircle className="w-4 h-4" />}
            message="Web Serial API Tidak Tersedia"
            description="Browser/WebView Anda tidak mendukung Web Serial API. Silakan update WebView atau gunakan browser Chromium terbaru."
            showIcon
          />
        )}

        {/* Error Alert */}
        {lastError && (
          <Alert
            type={lastError.code === 'UNSUPPORTED_PLATFORM' ? 'warning' : 'error'}
            icon={<AlertCircle className="w-4 h-4" />}
            message={lastError.message}
            showIcon
          />
        )}

        {/* Connected Printer Status */}
        {selectedPrinter && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <div className="h-2 w-2 shrink-0 rounded-full bg-green-500"></div>
                  <Text strong className="min-w-0 text-green-900">
                    {selectedPrinter.name}
                  </Text>
                </div>
                <p className="mb-3 break-all font-mono text-xs text-green-700">
                  USB ID: {selectedPrinter.usbId}
                </p>

                <div className="space-y-3">
                  <div className="flex min-w-0 flex-col gap-2 rounded-md bg-white p-3 sm:flex-row sm:items-center">
                    <Text className="shrink-0 text-xs font-medium text-gray-600 sm:w-20">
                      Baud Rate
                    </Text>
                    <Select
                      value={selectedPrinter.baudRate}
                      options={BAUD_RATE_OPTIONS}
                      size="small"
                      onChange={updateBaudRate}
                      className="w-full min-w-0 sm:max-w-36"
                    />
                  </div>

                  {selectedPrinter.portName && (
                    <p className="mb-0 break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-green-700">
                      Port: <span className="font-semibold">{selectedPrinter.portName}</span>
                    </p>
                  )}
                </div>
              </div>

              <Tag
                color="green"
                className="m-0 flex h-fit shrink-0 items-center gap-1 whitespace-nowrap"
              >
                <CheckCircle2 className="w-3 h-3" />
                Terhubung
              </Tag>
            </div>
          </div>
        )}

        {/* Not Connected State */}
        {!selectedPrinter && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <div className="mb-3 flex justify-center">
              <Plug className="w-8 h-8 text-gray-400" />
            </div>
            <Text type="secondary" className="block text-sm">
              Belum ada printer yang terhubung
            </Text>
            <Text type="secondary" className="block text-xs text-gray-500 mt-1">
              Pilih printer untuk memulai
            </Text>
          </div>
        )}

        {/* Available Ports Section */}
        {printers.length > 0 && !selectedPrinter && (
          <>
            <Divider className="my-2" />
            <div className="min-w-0 space-y-2">
              <Text strong className="text-sm text-gray-700">
                Port Serial Tersedia
              </Text>
              <Select
                value={undefined}
                placeholder="Pilih port serial USB untuk terhubung"
                onChange={handleSelectListedPrinter}
                options={printers.map((printer) => ({
                  value: printer.portName,
                  label: `${printer.name} (${printer.portName})`,
                }))}
                className="w-full min-w-0"
                size="large"
              />
            </div>
          </>
        )}

        {printers.length > 0 && selectedPrinter && (
          <>
            <Divider className="my-2" />
            <div className="min-w-0 space-y-2">
              <Text strong className="text-sm text-gray-700">
                Port Serial Lainnya
              </Text>
              <Select
                value={selectedPrinter?.portName}
                placeholder="Pilih port serial USB"
                onChange={handleSelectListedPrinter}
                options={printers.map((printer) => ({
                  value: printer.portName,
                  label: `${printer.name} (${printer.portName})`,
                }))}
                className="w-full min-w-0"
              />
            </div>
          </>
        )}

        {/* Actions Section */}
        <Divider className="my-2" />

        <div className="space-y-3">
          <Text strong className="text-sm text-gray-700 block">
            Aksi Cepat
          </Text>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Tooltip
              title={!isSupported ? 'Web Serial API tidak didukung' : ''}
            >
              <Button
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={handleLoadPrinters}
                loading={isLoadingPrinters}
                disabled={!isSupported}
                size="large"
                className="w-full min-w-0"
              >
                Muat Port
              </Button>
            </Tooltip>

            <Tooltip
              title={!isSupported ? 'Web Serial API tidak didukung' : ''}
            >
              <Button
                icon={<Plug className="w-4 h-4" />}
                onClick={handleSelect}
                loading={isSelecting}
                disabled={!isSupported}
                size="large"
                className="w-full min-w-0"
              >
                {selectedPrinter ? 'Ganti Printer' : 'Pilih Printer'}
              </Button>
            </Tooltip>

            <Tooltip
              title={
                !selectedPrinter
                  ? 'Pilih printer terlebih dahulu'
                  : !isSupported
                    ? 'Web Serial API tidak didukung'
                    : ''
              }
            >
              <Button
                type="primary"
                icon={<Printer className="w-4 h-4" />}
                onClick={handleTestPrint}
                loading={isTesting}
                disabled={!selectedPrinter || !isSupported}
                size="large"
                className="w-full min-w-0"
              >
                Test Print
              </Button>
            </Tooltip>

            <Button
              danger
              icon={<Trash2 className="w-4 h-4" />}
              onClick={clearPrinter}
              disabled={!selectedPrinter}
              size="large"
              className="w-full min-w-0"
            >
              Hapus
            </Button>
          </div>
        </div>

        {/* Help Section */}
        <Alert
          type="info"
          icon={<Info className="w-4 h-4" />}
          message="Panduan Penggunaan"
          description={
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Hubungkan printer USB thermal (ESC/POS) ke komputer</li>
              <li>Klik "Muat Port" untuk mendeteksi perangkat</li>
              <li>Pilih printer dari daftar seperti "USB Serial Device", "CH340", atau "CP210x"</li>
              <li>Sesuaikan Baud Rate jika diperlukan (default: 9600)</li>
              <li>Klik "Test Print" untuk memverifikasi koneksi</li>
            </ol>
          }
          showIcon
        />

        {/* Technical Info */}
        <Alert
          type="info"
          icon={<Info className="w-4 h-4" />}
          message="Informasi Teknis"
          description={
            <Text className="text-xs text-gray-600">
              Desktop (Tauri): Native serial access. Browser: Web Serial API (Chrome, Edge, Opera).
            </Text>
          }
          showIcon
        />
      </div>
    </Card>
  );
}
