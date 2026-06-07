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
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Printer Bluetooth
        </div>
      }
      className="shadow-md hover:shadow-lg transition-shadow"
    >
      <div className="space-y-4">
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
              <div>
                <Text strong className="text-green-800">
                  {selectedPrinter.name}
                </Text>
                <p className="text-xs text-green-700 mb-0 font-mono">
                  {selectedPrinter.address}
                </p>
              </div>
              <Tag color="green" className="m-0">
                Dipilih
              </Tag>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={handleRefresh}
            loading={isLoadingPrinters}
          >
            Muat Perangkat Paired
          </Button>
          <Button
            type="primary"
            icon={<Printer className="w-4 h-4" />}
            onClick={handleTestPrint}
            loading={isTesting}
            disabled={!selectedPrinter}
          >
            Test Print
          </Button>
          <Button
            danger
            icon={<Trash2 className="w-4 h-4" />}
            onClick={clearPrinter}
            disabled={!selectedPrinter}
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
              <List.Item
                actions={[
                  <Button
                    key="select"
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
                  >
                    {isSelected ? 'Dipilih' : hasAddress ? 'Pilih' : 'Alamat kosong'}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Bluetooth className="w-5 h-5 text-blue-600 mt-1" />}
                  title={printer.name}
                  description={
                    <span className="font-mono text-xs text-gray-500">
                      {printer.address}
                    </span>
                  }
                />
              </List.Item>
            );
          }}
        />
      </div>
    </Card>
  );
}
