import { Alert, App, Button, Card, Select, Tag, Typography, Divider, Tooltip } from 'antd';
import { CheckCircle2, Plug, Printer, RefreshCw, Trash2, Info, AlertCircle } from 'lucide-react';
import { useUsbPrinter } from '@/hooks/useUsbPrinter';
import { UsbSerialPrinterDevice } from '@/types';
import {
  getDisplayPortName,
  getPrinterTransportLabel,
  noPrinterDetectedMessage,
} from '@/utils/printer/usbSerialPrinter';
import { getHostPlatform } from '@/utils/export/platform';

const { Text, Title } = Typography;

const BAUD_RATE_OPTIONS = [
  { label: '9600 baud', value: 9600 },
  { label: '19200 baud', value: 19200 },
  { label: '38400 baud', value: 38400 },
  { label: '57600 baud', value: 57600 },
  { label: '115200 baud', value: 115200 },
];

/**
 * Langkah pemakaian berbeda per OS karena cara printer thermal terlihat oleh OS
 * juga berbeda: di Windows umumnya lewat print spooler (port USB001), di Linux
 * lewat character device /dev/usb/lp*, dan di browser lewat Web Serial API.
 */
const USAGE_STEPS: Record<string, string[]> = {
  windows: [
    'Nyalakan printer dan sambungkan kabel USB, atau pair printer Bluetooth lewat Settings › Bluetooth & devices',
    'Untuk printer USB: pastikan sudah terpasang di Settings › Printers & scanners (driver bawaan atau "Generic / Text Only")',
    'Klik "Muat Port" untuk mendeteksi perangkat',
    'Pilih printer dari daftar — biasanya berlabel Windows Spooler (USB001), Bluetooth SPP (COMx), atau USB Serial (CH340/CP210x)',
    'Klik "Test Print" untuk memverifikasi koneksi',
  ],
  linux: [
    'Hubungkan printer USB thermal (ESC/POS) ke komputer',
    'Pastikan user tergabung di grup lp agar /dev/usb/lp0 bisa ditulis',
    'Klik "Muat Port" untuk mendeteksi perangkat',
    'Pilih printer dari daftar — biasanya berlabel USB Printer (/dev/usb/lp0) atau USB Serial (CH340/CP210x)',
    'Klik "Test Print" untuk memverifikasi koneksi',
  ],
  default: [
    'Hubungkan printer USB thermal (ESC/POS) ke komputer',
    'Klik "Muat Port" untuk mendeteksi perangkat',
    'Pilih printer dari daftar seperti "USB Serial Device", "CH340", atau "CP210x"',
    'Sesuaikan Baud Rate jika diperlukan (default: 9600)',
    'Klik "Test Print" untuk memverifikasi koneksi',
  ],
};

const TECHNICAL_INFO: Record<string, string> = {
  windows:
    'Desktop (Tauri): printer thermal USB dikirim sebagai job RAW lewat Windows print spooler, printer Bluetooth lewat COM port SPP hasil pairing, dan adapter USB-serial (CH340/CP210x/FTDI) lewat COM port biasa.',
  linux:
    'Desktop (Tauri): akses serial native, plus tulis langsung ke /dev/usb/lp* untuk printer USB kelas printer.',
  default:
    'Desktop (Tauri): akses serial native. Browser: Web Serial API (Chrome, Edge, Opera).',
};

/** Label satu baris untuk dropdown pilihan port. */
const describeDevice = (device: UsbSerialPrinterDevice): string => {
  const port = getDisplayPortName(device.portName);
  const transport = getPrinterTransportLabel(device.transport);
  const status = device.isAvailable ? '' : ' — belum terhubung';
  return `${device.name} · ${transport} (${port})${status}`;
};

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
      message.success(`Printer dipilih: ${printer.name}`);
    } catch {
      message.warning('Gagal memilih printer.');
    }
  };

  const handleLoadPrinters = async () => {
    try {
      const devices = await loadPrinters();
      if (devices.length === 0) {
        message.warning('Tidak ada printer terdeteksi');
        return;
      }
      message.success(`Ditemukan ${devices.length} perangkat printer`);
    } catch {
      message.warning('Gagal memuat daftar printer');
    }
  };

  const handleSelectListedPrinter = async (portName: string) => {
    const device = printers.find((item) => item.portName === portName);
    if (!device) return;

    try {
      const printer = await selectPrinter(device);
      message.success(`Printer dipilih: ${printer.name}`);
    } catch {
      message.warning('Gagal memilih printer.');
    }
  };

  const handleTestPrint = async () => {
    try {
      await testPrint();
      message.success('Test print berhasil dikirim');
    } catch {
      message.warning('Test print gagal');
    }
  };

  const platform = getHostPlatform();
  const usageSteps = USAGE_STEPS[platform] ?? USAGE_STEPS.default;
  const technicalInfo = TECHNICAL_INFO[platform] ?? TECHNICAL_INFO.default;
  const printerOptions = printers.map((printer) => ({
    value: printer.portName,
    label: describeDevice(printer),
  }));

  // Baud rate hanya relevan untuk koneksi serial; job RAW ke print spooler
  // Windows tidak melewati UART sama sekali.
  const showBaudRate = selectedPrinter?.transport !== 'spooler';
  const selectedIdLabel =
    selectedPrinter?.transport === 'spooler'
      ? 'Port Windows'
      : selectedPrinter?.transport === 'bluetooth'
        ? 'COM Port'
        : 'USB ID';

  return (
    <Card
      title={
        <div className="flex min-w-0 items-center gap-2">
          <Plug className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <Title level={5} className="!mb-0 !text-base">
              Printer Struk
            </Title>
            <Text type="secondary" className="block truncate text-xs">
              Thermal ESC/POS via USB, serial, atau Bluetooth
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
            message="Cetak Langsung Tidak Tersedia di Browser Ini"
            description="Browser ini tidak mendukung Web Serial API. Gunakan aplikasi desktop Frayukti, atau buka lewat browser berbasis Chromium terbaru (Chrome, Edge, Opera)."
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
                  <Tag color="green" className="m-0 shrink-0 text-xs">
                    {getPrinterTransportLabel(selectedPrinter.transport)}
                  </Tag>
                </div>
                <p className="mb-3 break-all font-mono text-xs text-green-700">
                  {selectedIdLabel}: {selectedPrinter.usbId}
                </p>

                <div className="space-y-3">
                  {showBaudRate && (
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
                  )}

                  {selectedPrinter.portName && (
                    <p className="mb-0 break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-green-700">
                      Port:{' '}
                      <span className="font-semibold">
                        {getDisplayPortName(selectedPrinter.portName)}
                      </span>
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
            <Text type="secondary" className="mt-1 block text-xs text-gray-500">
              {printers.length > 0
                ? 'Pilih printer dari daftar di bawah untuk memulai'
                : noPrinterDetectedMessage()}
            </Text>
          </div>
        )}

        {/* Available Ports Section */}
        {printers.length > 0 && !selectedPrinter && (
          <>
            <Divider className="my-2" />
            <div className="min-w-0 space-y-2">
              <Text strong className="text-sm text-gray-700">
                Printer Terdeteksi
              </Text>
              <Select
                value={undefined}
                placeholder="Pilih printer untuk terhubung"
                onChange={handleSelectListedPrinter}
                options={printerOptions}
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
                Printer Lainnya
              </Text>
              <Select
                value={selectedPrinter?.portName}
                placeholder="Pilih printer"
                onChange={handleSelectListedPrinter}
                options={printerOptions}
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
              title={!isSupported ? 'Cetak langsung tidak didukung di browser ini' : ''}
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
              title={!isSupported ? 'Cetak langsung tidak didukung di browser ini' : ''}
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
                    ? 'Cetak langsung tidak didukung di browser ini'
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
              {usageSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          }
          showIcon
        />

        {/* Technical Info */}
        <Alert
          type="info"
          icon={<Info className="w-4 h-4" />}
          message="Informasi Teknis"
          description={<Text className="text-xs text-gray-600">{technicalInfo}</Text>}
          showIcon
        />
      </div>
    </Card>
  );
}
