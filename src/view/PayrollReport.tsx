import { Fragment, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { Alert, App, Button, DatePicker, Empty, Select, Typography } from 'antd';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import autoTable from 'jspdf-autotable';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import dayjs from '@/lib/dayjs';
import {
  getPayrollReport,
  type PayrollReport,
  type PayrollReportAmountSummary,
  type PayrollReportStatusFilter,
} from '@/services/payrollReportService';
import { exportPdf, exportXlsx, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import { useQuery } from '@tanstack/react-query';
import type { PaymentMethod, PayrollRunStatus } from '@/types';

const { Text, Title } = Typography;

const tableHeaderClass = 'border border-gray-300 bg-gray-100 px-2 py-2 text-center text-[11px] font-semibold text-gray-900';
const tableTextClass = 'border border-gray-300 px-2 py-1.5 text-[12px] text-gray-900';
const tableNumberClass = `${tableTextClass} whitespace-nowrap text-right tabular-nums`;

const payrollStatusOrder: PayrollReportStatusFilter[] = ['PAID', 'APPROVED', 'DRAFT', 'VOIDED', 'ALL'];

const buildEmptyReport = (): PayrollReport => ({
  filters: {},
  groups: [],
  rows: [],
  summary: {
    run_count: 0,
    employee_count: 0,
    base_salary: 0,
    allowance_amount: 0,
    bonus_amount: 0,
    gross_amount: 0,
    other_deduction_amount: 0,
    cash_advance_deduction_amount: 0,
    deduction_amount: 0,
    net_amount: 0,
  },
});

const money = (value: number) => formatCurrency(value || 0);
const moneyWithPrefix = (value: number) => `Rp ${money(value)}`;

const formatDateOnly = (value?: string) => (
  value ? dayjs(value).tz().format('DD MMM YYYY') : '-'
);

const formatPeriod = (start?: string, end?: string) => (
  `${formatDateOnly(start)} s/d ${formatDateOnly(end)}`
);

const paymentMethodLabel = (value?: PaymentMethod) => {
  if (value === 'NON_TUNAI') return 'Non Tunai';
  if (value === 'TUNAI') return 'Tunai';
  return '-';
};

export default function PayrollReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { profile } = useCompanyProfileSetting();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().endOf('month').format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([
    dayjs.tz().startOf('month'),
    dayjs.tz().endOf('month'),
  ]);
  const [selectedHelper, setSelectedHelper] = useState<string>('this-month');
  const [statusFilter, setStatusFilter] = useState<PayrollReportStatusFilter>('PAID');

  const statusLabels = useMemo<Record<PayrollReportStatusFilter, string>>(() => ({
    DRAFT: t('report.payroll.statusDraft'),
    APPROVED: t('report.payroll.statusApproved'),
    PAID: t('report.payroll.statusPaid'),
    VOIDED: t('report.payroll.statusVoided'),
    ALL: t('report.payroll.allStatuses'),
  }), [t]);

  const filters = useMemo(() => ({
    startDate,
    endDate,
    status: statusFilter,
  }), [endDate, startDate, statusFilter]);

  const reportQuery = useQuery({
    queryKey: ['payrollReport', filters.startDate, filters.endDate, filters.status],
    queryFn: async () => {
      await requireUserPermission(await getCurrentSessionUser(), 'REPORT_PAYROLL_VIEW');
      return getPayrollReport(filters);
    },
  });

  const report = reportQuery.data ?? buildEmptyReport();
  const companyName = profile?.company_name || 'Frayukti';
  const printDateText = dayjs().tz().format('DD MMM YYYY HH:mm');
  const periodText = `${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`;
  const selectedStatusText = statusLabels[statusFilter];

  const statusOptions = payrollStatusOrder.map((status) => ({
    value: status,
    label: statusLabels[status],
  }));

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setDateRange(dates);
    setSelectedHelper('custom');
    if (dates?.[0] && dates?.[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
      return;
    }
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);

    if (value === 'all') {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
      return;
    }

    if (value === 'custom') return;

    const rangeByKey: Record<string, [Dayjs, Dayjs]> = {
      'this-month': [dayjs.tz().startOf('month'), dayjs.tz().endOf('month')],
      'last-month': [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')],
      'this-year': [dayjs.tz().startOf('year'), dayjs.tz().endOf('year')],
    };
    const range = rangeByKey[value];

    if (!range) return;
    setDateRange(range);
    setStartDate(range[0].format('YYYY-MM-DD'));
    setEndDate(range[1].format('YYYY-MM-DD'));
  };

  const handleReset = () => {
    const range: [Dayjs, Dayjs] = [dayjs.tz().startOf('month'), dayjs.tz().endOf('month')];
    setDateRange(range);
    setStartDate(range[0].format('YYYY-MM-DD'));
    setEndDate(range[1].format('YYYY-MM-DD'));
    setSelectedHelper('this-month');
    setStatusFilter('PAID');
  };

  const amountCells = (summary: PayrollReportAmountSummary) => [
    summary.base_salary,
    summary.allowance_amount,
    summary.bonus_amount,
    summary.gross_amount,
    summary.other_deduction_amount,
    summary.cash_advance_deduction_amount,
    summary.deduction_amount,
    summary.net_amount,
  ];

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (report.rows.length === 0) return;

    try {
      type PdfRow = { kind: 'group' | 'detail' | 'subtotal'; cells: string[] };
      const pdfRows: PdfRow[] = [];
      report.groups.forEach((group) => {
        pdfRows.push({
          kind: 'group',
          cells: [
            `${group.payroll_number} | ${formatPeriod(group.period_start, group.period_end)} | ${statusLabels[group.status]}`,
            '', '', '', '', '', '', '', '', '', '', '', '', '',
          ],
        });
        group.rows.forEach((row, index) => {
          pdfRows.push({
            kind: 'detail',
            cells: [
              String(index + 1),
              row.payroll_number,
              formatPeriod(row.period_start, row.period_end),
              row.employee_name,
              money(row.base_salary),
              money(row.allowance_amount),
              money(row.bonus_amount),
              money(row.gross_amount),
              money(row.other_deduction_amount),
              money(row.cash_advance_deduction_amount),
              money(row.deduction_amount),
              money(row.net_amount),
              statusLabels[row.status],
              formatDateOnly(row.paid_at),
            ],
          });
        });
        pdfRows.push({
          kind: 'subtotal',
          cells: [
            '',
            `Subtotal ${group.payroll_number}`,
            '',
            `${group.summary.employee_count} ${t('report.payroll.employeeCountSuffix')}`,
            ...amountCells(group.summary).map(money),
            '',
            '',
          ],
        });
      });

      const exported = await exportPdf({
        filename: `laporan-penggajian-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        orientation: 'landscape',
        build: (doc) => {
          doc.setFontSize(14);
          doc.text(companyName, 14, 14);
          doc.setFontSize(12);
          doc.text(t('report.payroll.title'), 14, 21);
          doc.setFontSize(9);
          doc.text(`${t('report.periodWithColon')} ${periodText}`, 14, 28);
          doc.text(`${t('report.payroll.status')}: ${selectedStatusText}`, 14, 34);
          doc.text(`${t('report.printDate')} ${printDateText}`, 14, 40);

          autoTable(doc, {
            startY: 46,
            head: [[
              'No',
              t('report.payroll.payrollNumber'),
              t('report.payroll.period'),
              t('report.payroll.employee'),
              t('report.payroll.baseSalary'),
              t('report.payroll.allowance'),
              t('report.payroll.bonus'),
              t('report.payroll.gross'),
              t('report.payroll.otherDeduction'),
              t('report.payroll.cashAdvanceDeduction'),
              t('report.payroll.totalDeduction'),
              t('report.payroll.netSalary'),
              t('report.payroll.status'),
              t('report.payroll.paidAt'),
            ]],
            body: pdfRows.map((row) => row.cells),
            foot: [[
              '',
              t('report.payroll.grandTotal'),
              '',
              `${report.summary.employee_count} ${t('report.payroll.employeeCountSuffix')}`,
              ...amountCells(report.summary).map(money),
              '',
              '',
            ]],
            theme: 'grid',
            styles: { fontSize: 6.6, cellPadding: 1.2 },
            headStyles: { fillColor: [31, 41, 55], textColor: 255, halign: 'center' },
            footStyles: { fillColor: [229, 231, 235], textColor: 17, fontStyle: 'bold' },
            columnStyles: {
              0: { halign: 'center', cellWidth: 8 },
              4: { halign: 'right' },
              5: { halign: 'right' },
              6: { halign: 'right' },
              7: { halign: 'right' },
              8: { halign: 'right' },
              9: { halign: 'right' },
              10: { halign: 'right' },
              11: { halign: 'right' },
            },
            didParseCell: (data) => {
              const row = pdfRows[data.row.index];
              if (data.section !== 'body' || !row) return;
              if (row.kind === 'group') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [243, 244, 246];
              }
              if (row.kind === 'subtotal') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [249, 250, 251];
              }
            },
          });
        },
      });

      if (!exported) return;
      message.success(t('report.payroll.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export payroll PDF:', error);
      message.error(t('report.payroll.exportPdfFailed'));
    }
  };

  const handleExportExcel = async (target: ExportTarget = 'auto') => {
    if (report.rows.length === 0) return;

    try {
      const rows = [
        [companyName],
        [t('report.payroll.title')],
        [`${t('report.periodWithColon')} ${periodText}`],
        [`${t('report.payroll.status')}: ${selectedStatusText}`],
        [`${t('report.printDate')} ${printDateText}`],
        [],
        [
          'No',
          t('report.payroll.payrollNumber'),
          t('report.payroll.period'),
          t('report.payroll.employee'),
          t('report.payroll.position'),
          t('report.payroll.baseSalary'),
          t('report.payroll.allowance'),
          t('report.payroll.bonus'),
          t('report.payroll.gross'),
          t('report.payroll.otherDeduction'),
          t('report.payroll.cashAdvanceDeduction'),
          t('report.payroll.totalDeduction'),
          t('report.payroll.netSalary'),
          t('report.payroll.status'),
          t('report.payroll.paidAt'),
          t('report.payroll.paymentMethod'),
          t('report.payroll.cashAccount'),
          t('report.payroll.notes'),
        ],
        ...report.groups.flatMap((group) => [
          [`${group.payroll_number} | ${formatPeriod(group.period_start, group.period_end)} | ${statusLabels[group.status]}`],
          ...group.rows.map((row, index) => [
            index + 1,
            row.payroll_number,
            formatPeriod(row.period_start, row.period_end),
            row.employee_name,
            row.employee_position || '-',
            row.base_salary,
            row.allowance_amount,
            row.bonus_amount,
            row.gross_amount,
            row.other_deduction_amount,
            row.cash_advance_deduction_amount,
            row.deduction_amount,
            row.net_amount,
            statusLabels[row.status],
            formatDateOnly(row.paid_at),
            paymentMethodLabel(row.payment_method),
            [row.cash_account_code, row.cash_account_name].filter(Boolean).join(' - ') || '-',
            row.notes || '-',
          ]),
          [
            '',
            `Subtotal ${group.payroll_number}`,
            '',
            `${group.summary.employee_count} ${t('report.payroll.employeeCountSuffix')}`,
            '',
            ...amountCells(group.summary),
          ],
          [],
        ]),
        [
          '',
          t('report.payroll.grandTotal'),
          '',
          `${report.summary.employee_count} ${t('report.payroll.employeeCountSuffix')}`,
          '',
          ...amountCells(report.summary),
        ],
      ];

      const exported = await exportXlsx({
        filename: `laporan-penggajian-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        target,
        sheets: [
          {
            name: t('report.payroll.title'),
            rows,
          },
        ],
      });

      if (!exported) return;
      message.success(t('report.payroll.exportExcelSuccess'));
    } catch (error) {
      console.error('Failed to export payroll Excel:', error);
      message.error(t('report.payroll.exportExcelFailed'));
    }
  };

  if (reportQuery.isLoading) return <Loading />;

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.payroll.title')}</Title>
          <p className="text-xs text-gray-500 sm:text-sm">{t('report.payroll.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            className="flex-1 items-center justify-center gap-1.5 sm:flex-none"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => reportQuery.refetch()}
            loading={reportQuery.isFetching}
          >
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            disabled={report.rows.length === 0}
            formats={[
              {
                key: 'pdf',
                label: 'PDF',
                icon: <FilePdfOutlined className="text-[12px]" />,
                onExport: handleExportPdf,
              },
              {
                key: 'excel',
                label: 'Excel',
                icon: <FileExcelOutlined className="text-[12px]" />,
                onExport: handleExportExcel,
              },
            ]}
          />
        </div>
      </div>

      <section className="mb-5 border-y border-gray-200 bg-white py-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(280px,420px)_1fr]">
            <div>
              <Text className="mb-1 block text-[13px] font-medium text-gray-700">{t('report.payroll.status')}</Text>
              <Select<PayrollReportStatusFilter>
                className="w-full"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
              />
            </div>
            <div>
              <Text className="mb-1 block text-[13px] font-medium text-gray-700">{t('report.dateRange')}</Text>
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                className="w-full"
                format="YYYY-MM-DD"
                placeholder={[t('common.from'), t('common.to')]}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {[
                ['this-month', t('report.thisMonth')],
                ['last-month', t('report.lastMonth')],
                ['this-year', t('report.payroll.thisYear')],
                ['all', t('report.allPeriod')],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  size={isMobile ? 'small' : 'middle'}
                  onClick={() => handleHelperChange(key)}
                  className={selectedHelper === key ? 'border-gray-900 bg-gray-900 text-white hover:!border-gray-900 hover:!bg-gray-900 hover:!text-white' : ''}
                >
                  {label}
                </Button>
              ))}
              <Button onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </div>
        </div>
      </section>

      <main className="border border-gray-300 bg-white text-gray-900">
        <header className="flex flex-col gap-4 border-b-2 border-gray-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {profile?.logo_data_url ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border border-gray-300">
                <img src={profile.logo_data_url} alt={companyName} className="h-full w-full object-contain" />
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 className="m-0 text-[18px] font-bold leading-snug text-gray-950">{companyName}</h2>
              <p className="m-0 text-[13px] font-semibold uppercase text-gray-900">{t('report.payroll.title')}</p>
            </div>
          </div>
          <div className="text-left text-[12px] leading-6 text-gray-700 sm:text-right">
            <div>{t('report.periodWithColon')} {periodText}</div>
            <div>{t('report.payroll.status')}: {selectedStatusText}</div>
            <div>{t('report.printDate')} {printDateText}</div>
          </div>
        </header>

        {reportQuery.error ? (
          <div className="p-5">
            <Alert
              type="error"
              showIcon
              message={t('report.withDateError', {
                message: reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError'),
              })}
            />
          </div>
        ) : report.rows.length === 0 ? (
          <div className="p-10">
            <Empty description={t('report.payroll.noData')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1760px] border-collapse">
              <thead>
                <tr>
                  <th className={tableHeaderClass}>No</th>
                  <th className={tableHeaderClass}>{t('report.payroll.employee')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.position')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.baseSalary')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.allowance')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.bonus')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.gross')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.otherDeduction')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.cashAdvanceDeduction')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.totalDeduction')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.netSalary')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.status')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.paidAt')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.paymentMethod')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.cashAccount')}</th>
                  <th className={tableHeaderClass}>{t('report.payroll.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((group) => (
                  <Fragment key={group.payroll_run_id}>
                    <tr>
                      <td colSpan={16} className="border border-gray-300 bg-gray-100 px-3 py-2 text-[12px] font-semibold text-gray-950">
                        {group.payroll_number} | {formatPeriod(group.period_start, group.period_end)} | {statusLabels[group.status]}
                        {group.paid_at ? ` | ${t('report.payroll.paidAt')}: ${formatDateOnly(group.paid_at)}` : ''}
                      </td>
                    </tr>
                    {group.rows.map((row, index) => (
                      <tr key={row.id}>
                        <td className={`${tableTextClass} text-center`}>{index + 1}</td>
                        <td className={tableTextClass}>{row.employee_name}</td>
                        <td className={tableTextClass}>{row.employee_position || '-'}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.base_salary)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.allowance_amount)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.bonus_amount)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.gross_amount)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.other_deduction_amount)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.cash_advance_deduction_amount)}</td>
                        <td className={tableNumberClass}>{moneyWithPrefix(row.deduction_amount)}</td>
                        <td className={`${tableNumberClass} font-semibold`}>{moneyWithPrefix(row.net_amount)}</td>
                        <td className={tableTextClass}>{statusLabels[row.status as PayrollRunStatus]}</td>
                        <td className={tableTextClass}>{formatDateOnly(row.paid_at)}</td>
                        <td className={tableTextClass}>{paymentMethodLabel(row.payment_method)}</td>
                        <td className={tableTextClass}>{[row.cash_account_code, row.cash_account_name].filter(Boolean).join(' - ') || '-'}</td>
                        <td className={tableTextClass}>{row.notes || '-'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} className="border border-gray-300 bg-gray-50 px-2 py-2 text-[12px] font-semibold text-gray-950">
                        Subtotal {group.payroll_number} ({group.summary.employee_count} {t('report.payroll.employeeCountSuffix')})
                      </td>
                      {amountCells(group.summary).map((value, index) => (
                        <td key={`${group.payroll_run_id}-subtotal-${index}`} className="border border-gray-300 bg-gray-50 px-2 py-2 text-right text-[12px] font-semibold tabular-nums">
                          {moneyWithPrefix(value)}
                        </td>
                      ))}
                      <td colSpan={5} className="border border-gray-300 bg-gray-50" />
                    </tr>
                  </Fragment>
                ))}
                <tr>
                  <td colSpan={3} className="border border-gray-400 bg-gray-200 px-2 py-2 text-[12px] font-bold text-gray-950">
                    {t('report.payroll.grandTotal')} ({report.summary.run_count} payroll, {report.summary.employee_count} {t('report.payroll.employeeCountSuffix')})
                  </td>
                  {amountCells(report.summary).map((value, index) => (
                    <td key={`grand-total-${index}`} className="border border-gray-400 bg-gray-200 px-2 py-2 text-right text-[12px] font-bold tabular-nums">
                      {moneyWithPrefix(value)}
                    </td>
                  ))}
                  <td colSpan={5} className="border border-gray-400 bg-gray-200" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
