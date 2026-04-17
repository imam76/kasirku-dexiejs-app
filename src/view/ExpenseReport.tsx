import { Loading } from '@/components/Loading';
import { useExpenseReport } from '@/hooks/useReports';
import dayjs from '@/lib/dayjs';
import { formatCurrency } from '@/utils/formatters';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select, Space, Typography } from 'antd';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState } from 'react';
import * as XLSX from 'xlsx';

const { Title } = Typography;

const EXPENSE_CATEGORIES = [
  { value: 'PEMBELIAN_STOK', label: 'Pembelian Stok (Modal Barang)' },
  { value: 'OPERASIONAL', label: 'Operasional (Listrik, Sewa, dll)' },
  { value: 'GAJI', label: 'Gaji Karyawan' },
  { value: 'PERLENGKAPAN', label: 'Perlengkapan Toko' },
  { value: 'MAKAN', label: 'Makan/Minum' },
  { value: 'TRANSPORT', label: 'Transportasi' },
];

export default function ExpenseReport() {
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

  const handleExportPDF = () => {
    if (!data) return;

    const doc = new jsPDF();
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

    doc.save(`laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.pdf`);
  };

  const handleExportExcel = () => {
    if (!data) return;

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

    const worksheet = XLSX.utils.aoa_to_sheet([...header, ...body, ...footer]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Pengeluaran');

    XLSX.writeFile(workbook, `laporan-pengeluaran-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`);
  };

  if (isLoading) return <Loading />;

  return (
    <div className="p-4 sm:p-6 bg-white min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <Title level={4} className="!mb-0 !font-normal text-gray-800">Laporan pengeluaran</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPDF} disabled={!data || data.transactions.length === 0}>PDF</Button>
          <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExportExcel} disabled={!data || data.transactions.length === 0}>Excel</Button>
        </Space>
      </div>

      {/* FILTER SECTION */}
      <div className="mb-8">
        <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-3 uppercase">FILTER</div>
        <div className="space-y-4">
          <Select
            mode="multiple"
            placeholder="Semua kategori"
            className="w-full"
            value={selectedCategories}
            onChange={setSelectedCategories}
            allowClear
            options={EXPENSE_CATEGORIES}
          />
          <div className="flex flex-wrap gap-2">
            <Button className={selectedHelper === 'today' ? 'bg-white border-gray-400' : ''} onClick={() => handleHelperChange('today')}>Hari ini</Button>
            <Button className={selectedHelper === 'yesterday' ? 'bg-white border-gray-400' : ''} onClick={() => handleHelperChange('yesterday')}>Kemarin</Button>
            <Button className={selectedHelper === 'this-week' ? 'bg-white border-gray-400' : ''} onClick={() => handleHelperChange('this-week')}>Minggu ini</Button>
            <Button className={selectedHelper === 'this-month' ? 'bg-white border-gray-400' : ''} onClick={() => handleHelperChange('this-month')}>Bulan ini</Button>
            <Button className={selectedHelper === 'last-month' ? 'bg-white border-gray-400' : ''} onClick={() => handleHelperChange('last-month')}>Bulan lalu</Button>
            <Button className={selectedHelper === 'custom' ? 'bg-white border-gray-400' : ''} onClick={() => setSelectedHelper('custom')}>Custom</Button>

            {selectedHelper === 'custom' && (
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                format="YYYY-MM-DD"
                placeholder={['Mulai', 'Hingga']}
              />
            )}

            {(selectedCategories.length > 0 || selectedHelper !== 'today') && (
              <Button type="link" onClick={handleReset} className="text-gray-500">Reset</Button>
            )}
          </div>
        </div>
      </div>

      {/* RINGKASAN SECTION */}
      {/* <div className="mb-10">
        <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-3 uppercase">RINGKASAN</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {data && Object.entries(data.breakdown).length > 0 ? (
            Object.entries(data.breakdown).map(([category, amount]) => {
              const categoryLabel = EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category;
              return (
                <div key={category} className="bg-[#F8F7F2] p-4 rounded-lg border border-transparent">
                  <div className="text-gray-500 text-xs mb-1">{categoryLabel}</div>
                  <div className="text-lg font-medium text-gray-900">{formatCurrency(amount)}</div>
                </div>
              );
            })
          ) : (
            <div className="bg-[#F8F7F2] p-4 rounded-lg text-gray-400 text-sm">Belum ada ringkasan</div>
          )}
        </div>
      </div> */}

      {/* TABLE SECTION */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="text-gray-500 font-normal">
              <th className="py-3 px-2 font-normal border-b border-gray-100 w-[180px]">Tanggal & jam</th>
              <th className="py-3 px-2 font-normal border-b border-gray-100">Keterangan</th>
              <th className="py-3 px-2 font-normal border-b border-gray-100 w-[250px]">Kategori</th>
              <th className="py-3 px-2 font-normal border-b border-gray-100 text-right w-[150px]">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {data && data.transactions.length > 0 ? (
              <>
                {data.transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-2 border-b border-gray-50 text-gray-600">
                      {dayjs(t.created_at).tz().format('DD MMM YYYY, HH:mm')}
                    </td>
                    <td className="py-4 px-2 border-b border-gray-50 text-gray-800">
                      {t.description || '-'}
                    </td>
                    <td className="py-4 px-2 border-b border-gray-50">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${t.category === 'Pembelian stok' || t.category === 'PEMBELIAN_STOK'
                          ? 'bg-[#EBF5FF] text-[#2563EB]'
                          : 'bg-[#FEF3E7] text-[#D97706]'
                        }`}>
                        {EXPENSE_CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                      </span>
                    </td>
                    <td className="py-4 px-2 border-b border-gray-50 text-right text-gray-900 font-medium">
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold text-gray-900">
                  <td colSpan={3} className="py-6 px-2 text-base">Total pengeluaran</td>
                  <td className="py-6 px-2 text-right text-base">{formatCurrency(data.totalExpense)}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={4} className="py-12 text-center text-gray-400 italic">
                  Tidak ada data pengeluaran untuk periode ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
