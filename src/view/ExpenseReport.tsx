import { Loading } from '@/components/Loading';
import { useExpenseReport } from '@/hooks/useReports';
import dayjs from '@/lib/dayjs';
import { exportPdf, exportXlsx } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Grid, Select, Typography } from 'antd';
import autoTable from 'jspdf-autotable';
import { useState } from 'react';
import DesktopExpenseTable from './expense-report/DesktopExpenseTable';
import MobileExpenseList from './expense-report/MobileExpenseList';

const { Title } = Typography;
const { useBreakpoint } = Grid;

const EXPENSE_CATEGORIES = [
  { value: 'PEMBELIAN_STOK', label: 'Pembelian Stok (Modal Barang)' },
  { value: 'OPERASIONAL', label: 'Operasional (Listrik, Sewa, dll)' },
  { value: 'GAJI', label: 'Gaji Karyawan' },
  { value: 'PERLENGKAPAN', label: 'Perlengkapan Toko' },
  { value: 'MAKAN', label: 'Makan/Minum' },
  { value: 'TRANSPORT', label: 'Transportasi' },
];

export default function ExpenseReport() {
  const { message } = App.useApp();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  const { data, isLoading, refetch } = useExpenseReport(startDate, endDate, selectedCategories);

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper('custom');
    }
    if (dates && dates[0] && dates[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);
    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;

    switch (value) {
      case 'today':
        range = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
        break;
      case 'yesterday':
        range = [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
        break;
      case 'this-week':
        range = [dayjs.tz().startOf('week').add(1, 'day'), dayjs.tz().endOf('day')];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        return;
      default:
        range = null;
    }

    if (range) {
      setDateRange(range);
      setStartDate(range[0].format('YYYY-MM-DD'));
      setEndDate(range[1].format('YYYY-MM-DD'));
    } else {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleReset = () => {
    const todayRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
    setDateRange(todayRange);
    setStartDate(todayRange[0].format('YYYY-MM-DD'));
    setEndDate(todayRange[1].format('YYYY-MM-DD'));
    setSelectedHelper('today');
    setSelectedCategories([]);
  };

  const handleExportPDF = async () => {
    if (!data) return;

    try {
      await exportPdf({
        filename: `laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        build: (doc) => {
          const title = 'Laporan Pengeluaran';
          const period = `Periode: ${startDate || 'Semua'} s/d ${endDate || 'Semua'}`;
          const printDate = `Tanggal Cetak: ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`;

          doc.setFontSize(18);
          doc.text(title, 14, 22);
          doc.setFontSize(11);
          doc.text(period, 14, 30);
          doc.text(printDate, 14, 38);

          const tableData = data.transactions.map((t) => [
            dayjs(t.created_at).tz().format('YYYY-MM-DD HH:mm'),
            t.description || '-',
            EXPENSE_CATEGORIES.find(c => c.value === t.category)?.label || t.category,
            formatCurrency(t.amount),
          ]);

          autoTable(doc, {
            startY: 45,
            head: [['Tanggal & Jam', 'Keterangan/Deskripsi', 'Kategori', 'Nominal']],
            body: tableData,
            foot: [['', '', 'Total Keseluruhan', formatCurrency(data.totalExpense)]],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            footStyles: { fillColor: [241, 241, 241], textColor: 0, fontStyle: 'bold' },
          });
        },
      });
      message.success('Export PDF pengeluaran berhasil.');
    } catch (error) {
      console.error('Failed to export expense PDF:', error);
      message.error('Gagal export PDF pengeluaran.');
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;

    try {
      const header = [
        ['Laporan Pengeluaran'],
        [`Periode: ${startDate || 'Semua'} s/d ${endDate || 'Semua'}`],
        [`Tanggal Cetak: ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
        [],
        ['Tanggal & Jam', 'Keterangan/Deskripsi', 'Kategori', 'Nominal'],
      ];

      const body = data.transactions.map((t) => [
        dayjs(t.created_at).tz().format('YYYY-MM-DD HH:mm'),
        t.description || '-',
        EXPENSE_CATEGORIES.find(c => c.value === t.category)?.label || t.category,
        t.amount,
      ]);

      const footer = [
        [],
        ['', '', 'Total Keseluruhan', data.totalExpense],
      ];

      await exportXlsx({
        filename: `laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        sheets: [
          {
            name: 'Laporan Pengeluaran',
            rows: [...header, ...body, ...footer],
          },
        ],
      });
      message.success('Export Excel pengeluaran berhasil.');
    } catch (error) {
      console.error('Failed to export expense Excel:', error);
      message.error('Gagal export Excel pengeluaran.');
    }
  };

  const screens = useBreakpoint();

  if (isLoading) return <Loading />;

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">Laporan Pengeluaran</Title>
          <p className="text-gray-500 text-xs sm:text-sm">Pantau semua pengeluaran operasional dan pembelian stok</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Button 
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<FilePdfOutlined className="text-[12px]" />} 
            onClick={handleExportPDF} 
            disabled={!data || data.transactions.length === 0}
          >
            PDF
          </Button>
          <Button 
            type="primary" 
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
            icon={<FileExcelOutlined className="text-[12px]" />} 
            onClick={handleExportExcel} 
            disabled={!data || data.transactions.length === 0}
          >
            Excel
          </Button>
        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">PARAMETER LAPORAN</div>
        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">Kategori Pengeluaran</span>
            <Select
              mode="multiple"
              placeholder="Semua kategori"
              className="w-full"
              value={selectedCategories}
              onChange={setSelectedCategories}
              allowClear
              options={EXPENSE_CATEGORIES}
              size="large"
            />
          </div>
          
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">Rentang Waktu</span>
            <div className="flex flex-wrap gap-2">
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'today' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('today')}
              >
                Hari ini
              </Button>
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'yesterday' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('yesterday')}
              >
                Kemarin
              </Button>
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-week' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('this-week')}
              >
                Minggu ini
              </Button>
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'this-month' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('this-month')}
              >
                Bulan ini
              </Button>
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'last-month' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => handleHelperChange('last-month')}
              >
                Bulan lalu
              </Button>
              <Button 
                size={screens.md ? 'middle' : 'small'}
                className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === 'custom' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`} 
                onClick={() => setSelectedHelper('custom')}
              >
                Custom
              </Button>

              {(selectedCategories.length > 0 || selectedHelper !== 'today') && (
                <Button type="link" onClick={handleReset} className="text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <ReloadOutlined className="text-[10px]" /> Reset
                </Button>
              )}
            </div>

            {selectedHelper === 'custom' && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  format="YYYY-MM-DD"
                  placeholder={['Mulai', 'Hingga']}
                  className="w-full sm:w-[320px] rounded-lg"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DATA SECTION */}
      <div>
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">RINCIAN TRANSAKSI</div>
        
        {/* Desktop View (Visible on MD and larger) */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <DesktopExpenseTable 
            transactions={data?.transactions || []} 
            totalExpense={data?.totalExpense || 0}
            expenseCategories={EXPENSE_CATEGORIES}
          />
        </div>

        {/* Mobile View (Visible on screens smaller than MD) */}
        <div className="md:hidden">
          <MobileExpenseList 
            transactions={data?.transactions || []} 
            totalExpense={data?.totalExpense || 0}
            expenseCategories={EXPENSE_CATEGORIES}
          />
        </div>
      </div>
    </div>
  );
}
