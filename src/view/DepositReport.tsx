import { useDepositReport } from '@/hooks/useDepositReport';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type { ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import {
  FilePdfOutlined,
  FileTextOutlined,
  ReloadOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { Button, Card, DatePicker, Empty, Select, Statistic, Typography, Table } from 'antd';
import autoTable from 'jspdf-autotable';
import { useState } from 'react';
import ExportActions from '@/components/ExportActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Loading } from '@/components/Loading';
import type { CashierSession } from '@/types';
import { useDateFilter } from '@/hooks/useDateFilter';
import { useExportCsv, useExportPdf } from '@/hooks/useExport';

const { Title, Text } = Typography;

export default function DepositReport() {
  const { t } = useI18n();
  const isMobile = useIsMobile();

  // Date States & Filter Handlers
  const {
    startDate,
    endDate,
    dateRange,
    selectedHelper,
    handleDateRangeChange,
    handleHelperChange,
    resetDate
  } = useDateFilter('today');

  // Cashier Filter State
  const [selectedCashier, setSelectedCashier] = useState<string | undefined>('SEMUA');

  // Fetch report data
  const { data, isLoading, error, refetch } = useDepositReport(startDate, endDate, selectedCashier);

  const exportPdfHook = useExportPdf();
  const exportCsvHook = useExportCsv();

  const handleExportPDF = async (target: ExportTarget = 'auto') => {
    if (!data || data.sessions.length === 0) return;

    await exportPdfHook({
      filename: `laporan-setoran-kasir-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
      target,
      successMessage: t('report.deposit.exportPdfSuccess'),
      errorMessage: t('report.deposit.exportPdfFailed'),
      errorConsoleMsg: 'Failed to export Cashier Deposit PDF:',
      build: (doc) => {
        const period = `${t('report.period')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
        const printDate = `${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Kasirku', 105, 18, { align: 'center' });
        doc.setFontSize(13);
        doc.text(t('report.deposit.title'), 105, 30, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(period, 105, 41, { align: 'center' });
        doc.setFontSize(9);
        doc.text(printDate, 105, 49, { align: 'center' });

        // Group by cashier
        const sessionsByCashier = data.sessions.reduce((acc, s) => {
          const cashierId = s.cashier_user_id || 'unknown';
          if (!acc[cashierId]) {
            acc[cashierId] = {
              name: s.cashier_user_name || 'Unknown',
              items: []
            };
          }
          acc[cashierId].items.push(s);
          return acc;
        }, {} as Record<string, { name: string; items: CashierSession[] }>);

        let currentY = 58;

        Object.values(sessionsByCashier).forEach((cashier) => {
          // Cashier Header Text
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`${t('report.deposit.cashier')}: ${cashier.name}`, 8, currentY);
          currentY += 4;

          const tableData = cashier.items.map((s) => {
            return [
              dayjs(s.closed_at || s.created_at).tz().format('DD/MM/YYYY HH:mm'),
              formatCurrency(s.opening_cash_amount || 0),
              formatCurrency(s.closing_cash_amount || 0)
            ];
          });

          const totalOpening = cashier.items.reduce((sum, s) => sum + (s.opening_cash_amount || 0), 0);
          const totalClosing = cashier.items.reduce((sum, s) => sum + (s.closing_cash_amount || 0), 0);

          autoTable(doc, {
            startY: currentY,
            head: [[t('report.date'), t('report.deposit.saldoAwal'), t('report.deposit.saldoAkhir')]],
            body: tableData,
            foot: [
              [t('common.total'), formatCurrency(totalOpening), formatCurrency(totalClosing)],
              [`${t('report.deposit.totalSetoran')}:`, '', formatCurrency(totalClosing)]
            ],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [199, 210, 254], textColor: 33, fontStyle: 'normal' },
            footStyles: { fillColor: [241, 245, 249], textColor: 15, fontStyle: 'bold' },
            columnStyles: {
              0: { cellWidth: 80 },
              1: { halign: 'right', cellWidth: 55 },
              2: { halign: 'right', cellWidth: 55 }
            },
            margin: { left: 8, right: 8 }
          });

          currentY = (doc as any).lastAutoTable.finalY + 10;
        });

        // Grand Total section
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${t('report.deposit.totalSetoranAll')}: ${formatCurrency(data.totalDeposit)}`, 8, currentY);
      }
    });
  };

  const handleDownload = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    const csvRows = [
      ['LAPORAN SETORAN KASIR'],
      [`${t('report.period')}: ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`],
      [`${t('report.printDate')}: ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
      [],
      ['Kasir', 'Tanggal', 'Sesi', 'Saldo Awal', 'Saldo Akhir']
    ];

    // Group sessions by cashier to write in structured rows
    const sessionsByCashier = data.sessions.reduce((acc, s) => {
      const cashierId = s.cashier_user_id || 'unknown';
      if (!acc[cashierId]) {
        acc[cashierId] = {
          name: s.cashier_user_name || 'Unknown',
          items: []
        };
      }
      acc[cashierId].items.push(s);
      return acc;
    }, {} as Record<string, { name: string; items: CashierSession[] }>);

    Object.values(sessionsByCashier).forEach((cashier) => {
      cashier.items.forEach((s) => {
        csvRows.push([
          cashier.name,
          dayjs(s.closed_at || s.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
          s.session_number,
          String(s.opening_cash_amount || 0),
          String(s.closing_cash_amount || 0)
        ]);
      });
      
      const totalOpening = cashier.items.reduce((sum, s) => sum + (s.opening_cash_amount || 0), 0);
      const totalClosing = cashier.items.reduce((sum, s) => sum + (s.closing_cash_amount || 0), 0);
      
      csvRows.push([
        `Total ${cashier.name}`,
        '',
        '',
        String(totalOpening),
        String(totalClosing)
      ]);
      csvRows.push([
        `Total Setoran ${cashier.name}`,
        '',
        '',
        '',
        String(totalClosing)
      ]);
      csvRows.push([]); // empty line separator
    });

    csvRows.push(['TOTAL SELURUH SETORAN', '', '', '', String(data.totalDeposit)]);

    await exportCsvHook({
      filename: `laporan-setoran-kasir-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
      rows: csvRows,
      target,
      successMessage: t('report.deposit.exportSuccess'),
      errorMessage: t('report.deposit.exportFailed'),
      errorConsoleMsg: 'Failed to export Cashier Deposit report to CSV:'
    });
  };

  const handleReset = () => {
    resetDate();
    setSelectedCashier('SEMUA');
  };

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Empty
          description={t('report.withDateError', { message: error instanceof Error ? error.message : t('common.unknownError') })}
        />
      </div>
    );
  }

  // Group sessions by cashier for displaying multiple tables
  const sessionsByCashier = data?.sessions.reduce((acc, s) => {
    const cashierId = s.cashier_user_id || 'unknown';
    if (!acc[cashierId]) {
      acc[cashierId] = {
        name: s.cashier_user_name || 'Unknown',
        items: []
      };
    }
    acc[cashierId].items.push(s);
    return acc;
  }, {} as Record<string, { name: string; items: CashierSession[] }>);

  // cashier selection dropdown options
  const cashierOptions = [
    { value: 'SEMUA', label: t('report.allCashier') },
    ...(data?.uniqueCashiers.map(c => ({ value: c.id, label: c.name })) || [])
  ];

  const columns = [
    {
      title: t('report.date'),
      dataIndex: 'closed_at',
      key: 'closed_at',
      render: (val: string, record: CashierSession) => (
        <div>
          <div className="font-medium text-gray-900">{dayjs(val || record.created_at).tz().format('DD/MM/YYYY HH:mm')}</div>
          <div className="text-[10px] text-gray-400">{record.session_number}</div>
        </div>
      )
    },
    {
      title: t('report.deposit.saldoAwal'),
      dataIndex: 'opening_cash_amount',
      key: 'opening_cash_amount',
      align: 'right' as const,
      render: (val: number) => <span className="font-medium">{formatCurrency(val)}</span>
    },
    {
      title: t('report.deposit.saldoAkhir'),
      dataIndex: 'closing_cash_amount',
      key: 'closing_cash_amount',
      align: 'right' as const,
      render: (val: number) => <span className="font-medium">{formatCurrency(val)}</span>
    }
  ];

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.deposit.title')}</Title>
          <p className="text-gray-500 text-xs sm:text-sm">{t('report.deposit.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
            disabled={!data || data.sessions.length === 0}
            formats={[
              {
                key: 'csv',
                label: 'CSV',
                icon: <FileTextOutlined className="text-[12px]" />,
                onExport: handleDownload,
              },
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPDF,
              },
            ]}
          />
        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">{t('report.parameterTitle')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.deposit.cashier')}</span>
            <Select
              placeholder={t('report.allCashier')}
              className="w-full"
              value={selectedCashier}
              onChange={setSelectedCashier}
              options={cashierOptions}
              size="large"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'today', label: t('report.today') },
                { key: 'yesterday', label: t('report.yesterday') },
                { key: 'this-week', label: t('report.thisWeek') },
                { key: 'last-week', label: t('report.lastWeekTitle') },
                { key: 'this-month', label: t('report.thisMonth') },
                { key: 'last-month', label: t('report.lastMonth') },
                { key: 'custom', label: t('report.custom') },
              ].map((helper) => (
                <Button
                  key={helper.key}
                  size={isMobile ? 'small' : 'middle'}
                  className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === helper.key ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(helper.key)}
                >
                  {helper.label}
                </Button>
              ))}

              {(selectedHelper !== 'today' || selectedCashier !== 'SEMUA') && (
                <Button type="link" onClick={handleReset} className="text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <ReloadOutlined className="text-[10px]" /> {t('common.resetAll')}
                </Button>
              )}
            </div>

            {selectedHelper === 'custom' && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  format="YYYY-MM-DD"
                  placeholder={[t('common.from'), t('common.to')]}
                  className="w-full sm:w-[320px] rounded-lg"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GRAND SUMMARY STATISTIC */}
      {data && data.sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="shadow-sm border-none border-l-4 border-l-amber-500 rounded-xl overflow-hidden">
            <Statistic
              title={<Text type="secondary" className="text-[11px] uppercase font-bold tracking-wider">{t('report.deposit.totalSetoranAll')}</Text>}
              value={data.totalDeposit}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#d97706', fontWeight: 'bold', fontSize: isMobile ? '18px' : '22px' }}
            />
          </Card>
        </div>
      )}

      {/* DATA TABLES SECTION */}
      <div className="space-y-8">
        {sessionsByCashier && Object.entries(sessionsByCashier).map(([cashierId, cashier]) => (
          <div key={cashierId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <WalletOutlined className="text-amber-500 text-lg" />
              <div className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                {t('report.deposit.cashier')}: {cashier.name}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <Table
                dataSource={cashier.items}
                columns={columns}
                rowKey="id"
                pagination={false}
                bordered={false}
                className="custom-table"
                summary={(pageData) => {
                  let totalOpening = 0;
                  let totalClosing = 0;

                  pageData.forEach(({ opening_cash_amount, closing_cash_amount }) => {
                    totalOpening += opening_cash_amount || 0;
                    totalClosing += closing_cash_amount || 0;
                  });

                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row className="bg-gray-50/70 font-semibold text-gray-700">
                        <Table.Summary.Cell index={0}>{t('common.total')}</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">{formatCurrency(totalOpening)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">{formatCurrency(totalClosing)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                      <Table.Summary.Row className="bg-amber-50/50 font-bold text-amber-800">
                        <Table.Summary.Cell index={0} colSpan={2}>
                          {t('report.deposit.totalSetoran')}
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right" className="text-amber-700 text-base">
                          {formatCurrency(totalClosing)}
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </div>
          </div>
        ))}

        {data && data.sessions.length === 0 && !isLoading && (
          <div className="bg-white py-16 rounded-xl border border-gray-100 shadow-sm text-center">
            <p className="text-gray-400 italic">{t('report.deposit.noData')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
