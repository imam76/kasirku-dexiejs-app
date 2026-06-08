import { useEffect } from 'react';
import { Alert, App, Button, Card, List, Tag, Typography } from 'antd';
import { Bluetooth, CheckCircle2, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';
import { BluetoothPrinterDevice } from '@/types';

const { Text } = Typography;

export default function PrinterSettingsCard() {
  const { message } = App.useApp();
  const {
    printers,
    selectedPrinter,
    isLoadingPrinters,
    isTesting,
    lastError,
    loadPrinters,
    selectPrinter,
    clearPrinter,
    testPrint,
  } = useBluetoothPrinter();

  useEffect(() => {
    void loadPrinters().catch(() => undefined);
  }, [loadPrinters]);

  const handleRefresh = async () => {
    try {
      await loadPrinters();
      message.success('Daftar printer berhasil diperbarui');
    } catch (error) {
      console.error(error);
      message.warning('Gagal memuat daftar printer Bluetooth');
    }
  };

  const handleSelectPrinter = (printer: BluetoothPrinterDevice) => {
    const selected = selectPrinter({
      name: printer.name,
      address: printer.address,
    });

    if (!selected) {
      message.warning('Alamat Bluetooth printer belum terbaca');
      return;
    }

    message.success(`Printer dipilih: ${printer.name}`);
  };

  const handleTestPrint = async () => {
    try {
      await testPrint();
      message.success('Test print berhasil dikirim');
    } catch (error) {
      console.error(error);
      message.warning('Test print gagal');
    }
  };

  return (
    <Card
      title={
        <div className="flex min-w-0 items-center gap-2">
          <Printer className="w-5 h-5 shrink-0" />
          <span className="min-w-0 truncate">Printer Bluetooth</span>
        </div>
      }
      className="h-full shadow-md hover:shadow-lg transition-shadow"
    >
      <div className="min-w-0 space-y-4">
        <Alert
          type="info"
          showIcon
          title="Auto print receipt menggunakan printer thermal Bluetooth Classic/SPP di aplikasi native Android."
        />

        {lastError && (
          <Alert
            type={lastError.code === 'UNSUPPORTED_PLATFORM' ? 'warning' : 'error'}
            showIcon
            title={lastError.message}
          />
        )}

        {selectedPrinter && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Text strong className="text-green-800">
                  {selectedPrinter.name}
                </Text>
                <p className="text-xs text-green-700 mb-0 font-mono break-all">
                  {selectedPrinter.address}
                </p>
              </div>
              <Tag color="green" className="m-0">
                Dipilih
              </Tag>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={handleRefresh}
            loading={isLoadingPrinters}
            className="min-w-0"
            block
          >
            Muat Perangkat Paired
          </Button>
          <Button
            type="primary"
            icon={<Printer className="w-4 h-4" />}
            onClick={handleTestPrint}
            loading={isTesting}
            disabled={!selectedPrinter}
            className="min-w-0"
            block
          >
            Test Print
          </Button>
          <Button
            danger
            icon={<Trash2 className="w-4 h-4" />}
            onClick={clearPrinter}
            disabled={!selectedPrinter}
            className="min-w-0 sm:col-span-2"
            block
          >
            Hapus Pilihan
          </Button>
        </div>

        <List
          bordered
          loading={isLoadingPrinters}
          dataSource={printers}
          locale={{ emptyText: 'Belum ada paired Bluetooth printer terdeteksi' }}
          renderItem={(printer) => {
            const hasAddress = Boolean(printer.address.trim());
            const isSelected = hasAddress && selectedPrinter?.address === printer.address;

            return (
              <List.Item className="min-w-0">
                <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <List.Item.Meta
                    className="min-w-0"
                    avatar={<Bluetooth className="w-5 h-5 text-blue-600 mt-1" />}
                    title={<span className="block min-w-0 truncate">{printer.name}</span>}
                    description={
                      <span className="block min-w-0 break-all font-mono text-xs text-gray-500">
                        {printer.address}
                      </span>
                    }
                  />
                  <Button
                    type={isSelected ? 'default' : 'primary'}
                    icon={
                      isSelected ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Bluetooth className="w-4 h-4" />
                      )
                    }
                    onClick={() => handleSelectPrinter(printer)}
                    disabled={isSelected || !hasAddress}
                    className="shrink-0"
                  >
                    {isSelected ? 'Dipilih' : hasAddress ? 'Pilih' : 'Alamat kosong'}
                  </Button>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
    </Card>
  );
}
