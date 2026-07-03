import dayjs from '@/lib/dayjs';
import { exportHtmlPdf, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import type { CompanyProfileSetting, PaymentMethod, PayrollRun, PayrollRunItem } from '@/types';

interface PayrollSlipPdfInput {
  run: PayrollRun;
  profile?: CompanyProfileSetting;
  target?: ExportTarget;
}

interface PayrollEmployeeSlipPdfInput extends PayrollSlipPdfInput {
  item: PayrollRunItem;
}

interface PayrollRunSlipsPdfInput extends PayrollSlipPdfInput {
  items: PayrollRunItem[];
}

interface PayrollSlipHtmlInput {
  run: PayrollRun;
  items: PayrollRunItem[];
  profile?: CompanyProfileSetting;
  printedAt?: string;
}

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const COMPANY_FALLBACK_NAME = 'Frayukti';

const payrollSlipTheme = {
  ink: '#1A1A1A',
  muted: '#4A4A4A',
  subdued: '#7A7A7A',
  line: '#D9DFE8',
  softLine: '#E8EEF5',
  surface: '#F5F7FA',
  primary: '#1E5BA8',
  primaryTint: '#EEF4FB',
  danger: '#E8453C',
} as const;

const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string | number | null | undefined) => (
  String(value ?? '').replace(/[&<>"']/g, (char) => htmlEntities[char])
);

const cleanText = (value?: string | null) => value?.trim() || '';
const displayText = (value?: string | null) => cleanText(value) || '-';
const money = (value: number) => `Rp ${formatCurrency(Number(value || 0))}`;

const safeFilenameSegment = (value: string) => (
  value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'slip'
);

const formatDateOnly = (value?: string) => (
  value ? dayjs(value).tz().format('DD MMM YYYY') : '-'
);

const formatDateTime = (value?: string) => (
  value ? dayjs(value).tz().format('DD MMM YYYY HH:mm') : '-'
);

const formatPeriod = (run: PayrollRun) => (
  `${formatDateOnly(run.period_start)} s/d ${formatDateOnly(run.period_end)}`
);

const paymentMethodLabel = (value?: PaymentMethod) => {
  if (value === 'NON_TUNAI') return 'Non Tunai';
  if (value === 'TUNAI') return 'Tunai';
  return '-';
};

const assertPayrollCanExportSlip = (run: PayrollRun) => {
  if (run.status !== 'PAID') {
    throw new Error('Slip gaji hanya bisa diterbitkan untuk payroll yang sudah dibayar.');
  }
};

const joinWords = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' ');

const toIndonesianWords = (value: number): string => {
  const number = Math.floor(Math.abs(value));
  const smallNumbers = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas',
  ];

  if (number === 0) return 'nol';
  if (number < 12) return smallNumbers[number];
  if (number < 20) return `${toIndonesianWords(number - 10)} belas`;
  if (number < 100) return joinWords(
    `${toIndonesianWords(Math.floor(number / 10))} puluh`,
    number % 10 ? toIndonesianWords(number % 10) : undefined,
  );
  if (number < 200) return joinWords('seratus', number % 100 ? toIndonesianWords(number % 100) : undefined);
  if (number < 1000) return joinWords(
    `${toIndonesianWords(Math.floor(number / 100))} ratus`,
    number % 100 ? toIndonesianWords(number % 100) : undefined,
  );
  if (number < 2000) return joinWords('seribu', number % 1000 ? toIndonesianWords(number % 1000) : undefined);
  if (number < 1_000_000) return joinWords(
    `${toIndonesianWords(Math.floor(number / 1000))} ribu`,
    number % 1000 ? toIndonesianWords(number % 1000) : undefined,
  );
  if (number < 1_000_000_000) return joinWords(
    `${toIndonesianWords(Math.floor(number / 1_000_000))} juta`,
    number % 1_000_000 ? toIndonesianWords(number % 1_000_000) : undefined,
  );
  if (number < 1_000_000_000_000) return joinWords(
    `${toIndonesianWords(Math.floor(number / 1_000_000_000))} miliar`,
    number % 1_000_000_000 ? toIndonesianWords(number % 1_000_000_000) : undefined,
  );

  return joinWords(
    `${toIndonesianWords(Math.floor(number / 1_000_000_000_000))} triliun`,
    number % 1_000_000_000_000 ? toIndonesianWords(number % 1_000_000_000_000) : undefined,
  );
};

const formatTerbilang = (value: number) => {
  const rounded = Math.round(Number(value || 0));
  const words = rounded < 0
    ? `minus ${toIndonesianWords(rounded)}`
    : toIndonesianWords(rounded);

  return `${words
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')} Rupiah`;
};

const payrollSlipStyles = `
  <style>
    .payroll-slip-export-root {
      position: fixed;
      left: -12000px;
      top: 0;
      width: ${A4_WIDTH_PX}px;
      background: #ffffff;
      color: ${payrollSlipTheme.ink};
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      line-height: 1.5;
      z-index: -1;
    }

    .payroll-slip-export-root * {
      box-sizing: border-box;
    }

    .payroll-slip-page {
      width: ${A4_WIDTH_PX}px;
      height: ${A4_HEIGHT_PX}px;
      display: flex;
      flex-direction: column;
      padding: 48px 56px 36px;
      background: #ffffff;
      overflow: hidden;
    }

    /* ---------- Header ---------- */

    .payroll-slip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 28px;
      border-bottom: 1px solid ${payrollSlipTheme.primary};
      padding-bottom: 20px;
    }

    .payroll-slip-company {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      align-items: center;
      gap: 14px;
    }

    .payroll-slip-logo,
    .payroll-slip-logo-fallback {
      width: 54px;
      height: 54px;
      flex: 0 0 54px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid ${payrollSlipTheme.line};
    }

    .payroll-slip-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .payroll-slip-logo-fallback {
      background: ${payrollSlipTheme.primary};
      border-color: ${payrollSlipTheme.primary};
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
    }

    .payroll-slip-company-name {
      margin: 0;
      color: ${payrollSlipTheme.ink};
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.2px;
      overflow-wrap: anywhere;
    }

    .payroll-slip-company-subtitle {
      margin: 3px 0 0;
      color: ${payrollSlipTheme.muted};
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }

    .payroll-slip-title-panel {
      display: flex;
      flex: 0 0 220px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .payroll-slip-title {
      margin: 0;
      color: ${payrollSlipTheme.primary};
      width: 190px;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 1.8px;
      line-height: 1.15;
      text-transform: uppercase;
    }

    .payroll-slip-number {
      display: block;
      width: 190px;
      margin: 10px 0 0;
      padding: 5px 12px 9px;
      border: 1px solid ${payrollSlipTheme.softLine};
      border-radius: 16px;
      background: ${payrollSlipTheme.primaryTint};
      color: ${payrollSlipTheme.primary};
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
      line-height: normal;
      text-align: center;
    }

    /* ---------- Panel informasi ---------- */

    .payroll-slip-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: stretch;
      margin-top: 22px;
    }

    .payroll-slip-panel {
      border: 1px solid ${payrollSlipTheme.softLine};
      border-radius: 10px;
      background: #ffffff;
      padding: 16px 18px 12px;
      min-height: 148px;
      height: 100%;
    }

    .payroll-slip-panel-title {
      margin: 0 0 10px;
      color: ${payrollSlipTheme.primary};
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }

    .payroll-slip-field {
      display: grid;
      grid-template-columns: 118px 1fr;
      gap: 10px;
      padding: 6px 0;
      border-top: 1px solid ${payrollSlipTheme.softLine};
      font-size: 13px;
    }

    .payroll-slip-field:first-of-type {
      border-top: 0;
    }

    .payroll-slip-field-label {
      color: ${payrollSlipTheme.muted};
      font-weight: 500;
    }

    .payroll-slip-field-value {
      color: ${payrollSlipTheme.ink};
      font-weight: 600;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    /* ---------- Rincian gaji ---------- */

    .payroll-slip-detail-section {
      margin-top: 20px;
    }

    .payroll-slip-table-card {
      border: 1px solid ${payrollSlipTheme.line};
      border-radius: 10px;
      overflow: hidden;
    }

    .payroll-slip-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      table-layout: fixed;
    }

    .payroll-slip-table th {
      background: ${payrollSlipTheme.surface};
      border-bottom: 1px solid ${payrollSlipTheme.softLine};
      color: ${payrollSlipTheme.muted};
      padding: 10px 16px;
      text-align: left;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }

    .payroll-slip-table th:last-child {
      text-align: right;
    }

    .payroll-slip-table td {
      border-top: 1px solid ${payrollSlipTheme.softLine};
      color: ${payrollSlipTheme.ink};
      padding: 8px 16px;
      vertical-align: top;
    }

    .payroll-slip-table tbody tr:first-child td {
      border-top: 0;
    }

    .payroll-slip-table .payroll-slip-number-cell {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    .payroll-slip-section-row td {
      background: #ffffff;
      border-top: 1px solid ${payrollSlipTheme.line};
      color: ${payrollSlipTheme.primary};
      padding-top: 11px;
      padding-bottom: 5px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
    }

    .payroll-slip-deduction-cell {
      color: ${payrollSlipTheme.danger};
    }

    .payroll-slip-total-row td {
      border-top: 1px solid ${payrollSlipTheme.line};
      background: ${payrollSlipTheme.surface};
      font-weight: 700;
    }

    .payroll-slip-net-row td {
      background: ${payrollSlipTheme.primaryTint};
      border-top: 1px solid ${payrollSlipTheme.primary};
      color: ${payrollSlipTheme.primary};
      padding-top: 12px;
      padding-bottom: 12px;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
    }

    .payroll-slip-terbilang {
      margin-top: 12px;
      border: 1px solid ${payrollSlipTheme.line};
      border-radius: 10px;
      background: ${payrollSlipTheme.surface};
      padding: 10px 16px;
      color: ${payrollSlipTheme.muted};
      font-size: 12.5px;
      font-style: italic;
      line-height: 1.5;
    }

    .payroll-slip-terbilang strong {
      color: ${payrollSlipTheme.ink};
      font-style: normal;
    }

    .payroll-slip-note {
      margin-top: 18px;
      border: 1px solid ${payrollSlipTheme.line};
      border-left: 3px solid ${payrollSlipTheme.primary};
      border-radius: 8px;
      background: ${payrollSlipTheme.surface};
      padding: 10px 14px;
      color: ${payrollSlipTheme.muted};
      font-size: 12px;
      max-height: 72px;
      overflow: hidden;
      overflow-wrap: anywhere;
    }

    .payroll-slip-note strong {
      color: ${payrollSlipTheme.ink};
    }

    /* ---------- Tanda tangan & footer ---------- */

    .payroll-slip-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 96px;
      margin-top: 40px;
      padding: 0 24px;
      color: ${payrollSlipTheme.muted};
      font-size: 13px;
      text-align: center;
    }

    .payroll-slip-signature-line {
      height: 60px;
      border-bottom: 1px solid ${payrollSlipTheme.line};
      margin-bottom: 8px;
    }

    .payroll-slip-signatures strong {
      color: ${payrollSlipTheme.ink};
      font-weight: 700;
    }

    .payroll-slip-footer {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-top: auto;
      border-top: 1px solid ${payrollSlipTheme.softLine};
      padding-top: 12px;
      color: ${payrollSlipTheme.subdued};
      font-size: 11px;
      letter-spacing: 0.3px;
    }
  </style>
`;

const renderCompanyLogo = (profile: CompanyProfileSetting | undefined, companyName: string) => {
  if (profile?.logo_data_url) {
    return `
      <div class="payroll-slip-logo">
        <img src="${escapeHtml(profile.logo_data_url)}" alt="${escapeHtml(companyName)}" />
      </div>
    `;
  }

  return `<div class="payroll-slip-logo-fallback">${escapeHtml(companyName.charAt(0).toUpperCase() || 'F')}</div>`;
};

const renderField = (label: string, value: string | number | undefined | null) => `
  <div class="payroll-slip-field">
    <div class="payroll-slip-field-label">${escapeHtml(label)}</div>
    <div class="payroll-slip-field-value">${escapeHtml(displayText(String(value ?? '')))}</div>
  </div>
`;

const renderAmountRows = (rows: Array<[string, number]>) => (
  rows.map(([label, value]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td class="payroll-slip-number-cell">${escapeHtml(money(value))}</td>
    </tr>
  `).join('')
);

const moneyDeduction = (value: number) => {
  const amount = Number(value || 0);
  return amount > 0 ? `(${money(amount)})` : money(0);
};

const renderDeductionRows = (rows: Array<[string, number]>) => (
  rows.map(([label, value]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td class="payroll-slip-number-cell${Number(value || 0) > 0 ? ' payroll-slip-deduction-cell' : ''}">${escapeHtml(moneyDeduction(value))}</td>
    </tr>
  `).join('')
);

const renderPayrollSlipPage = ({
  run,
  item,
  profile,
  printedAt,
  pageIndex,
  pageCount,
}: {
  run: PayrollRun;
  item: PayrollRunItem;
  profile?: CompanyProfileSetting;
  printedAt: string;
  pageIndex: number;
  pageCount: number;
}) => {
  const companyName = cleanText(profile?.company_name) || COMPANY_FALLBACK_NAME;
  const earnings: Array<[string, number]> = [
    ['Gaji Pokok', item.base_salary],
    ['Tunjangan', item.allowance_amount],
    ['Bonus/Lembur', item.bonus_amount],
  ];
  const deductions: Array<[string, number]> = [
    ['Potongan Lain', item.other_deduction_amount || 0],
    ['Potongan Kasbon', item.cash_advance_deduction_amount || 0],
  ];
  const employeeNote = cleanText(item.notes);

  return `
    <section class="payroll-slip-page">
      <header class="payroll-slip-header">
        <div class="payroll-slip-company">
          ${renderCompanyLogo(profile, companyName)}
          <div>
            <h1 class="payroll-slip-company-name">${escapeHtml(companyName)}</h1>
            <p class="payroll-slip-company-subtitle">Dokumen Penggajian Karyawan</p>
          </div>
        </div>
        <div class="payroll-slip-title-panel">
          <h2 class="payroll-slip-title">Slip Gaji</h2>
          <div class="payroll-slip-number">No. ${escapeHtml(run.payroll_number)}</div>
        </div>
      </header>

      <section class="payroll-slip-info-grid">
        <div class="payroll-slip-panel">
          <h3 class="payroll-slip-panel-title">Data Karyawan</h3>
          ${renderField('Nama', item.employee_name)}
          ${renderField('Jabatan', item.employee_position)}
          ${renderField('Periode Gaji', formatPeriod(run))}
        </div>

        <div class="payroll-slip-panel">
          <h3 class="payroll-slip-panel-title">Informasi Pembayaran</h3>
          ${renderField('Tanggal Bayar', formatDateTime(run.paid_at))}
          ${renderField('Metode Bayar', paymentMethodLabel(run.payment_method))}
          ${renderField('Status', 'Dibayar')}
        </div>
      </section>

      ${employeeNote ? `<section class="payroll-slip-note"><strong>Catatan:</strong> ${escapeHtml(employeeNote)}</section>` : ''}

      <section class="payroll-slip-detail-section">
        <div class="payroll-slip-table-card">
          <table class="payroll-slip-table">
            <colgroup>
              <col style="width: 65%;" />
              <col style="width: 35%;" />
            </colgroup>
            <thead>
              <tr>
                <th>Keterangan</th>
                <th>Jumlah (Rp)</th>
              </tr>
            </thead>
            <tbody>
              <tr class="payroll-slip-section-row">
                <td colspan="2">Pendapatan</td>
              </tr>
              ${renderAmountRows(earnings)}
              <tr class="payroll-slip-total-row">
                <td>Total Pendapatan</td>
                <td class="payroll-slip-number-cell">${escapeHtml(money(item.gross_amount))}</td>
              </tr>
              <tr class="payroll-slip-section-row">
                <td colspan="2">Potongan</td>
              </tr>
              ${renderDeductionRows(deductions)}
              <tr class="payroll-slip-total-row">
                <td>Total Potongan</td>
                <td class="payroll-slip-number-cell${Number(item.deduction_amount || 0) > 0 ? ' payroll-slip-deduction-cell' : ''}">${escapeHtml(moneyDeduction(item.deduction_amount))}</td>
              </tr>
              <tr class="payroll-slip-net-row">
                <td>Gaji Neto Diterima</td>
                <td class="payroll-slip-number-cell">${escapeHtml(money(item.net_amount))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="payroll-slip-terbilang"><strong>Terbilang:</strong> ${escapeHtml(formatTerbilang(item.net_amount))}</div>

      <section class="payroll-slip-signatures">
        <div>
          <div>Diterima oleh,</div>
          <div class="payroll-slip-signature-line"></div>
          <strong>${escapeHtml(item.employee_name)}</strong>
        </div>
        <div>
          <div>Disetujui,</div>
          <div class="payroll-slip-signature-line"></div>
          <strong>Finance / HRD</strong>
        </div>
      </section>

      <footer class="payroll-slip-footer">
        <span>Dicetak: ${escapeHtml(formatDateTime(printedAt))}</span>
        <span>Halaman ${pageIndex + 1} dari ${pageCount}</span>
      </footer>
    </section>
  `;
};

export const buildPayrollSlipHtml = ({
  run,
  items,
  profile,
  printedAt = new Date().toISOString(),
}: PayrollSlipHtmlInput) => (
  [
    payrollSlipStyles,
    ...items.map((item, index) => renderPayrollSlipPage({
      run,
      item,
      profile,
      printedAt,
      pageIndex: index,
      pageCount: items.length,
    })),
  ].join('')
);

const createPayrollSlipElement = (input: PayrollSlipHtmlInput) => {
  if (typeof document === 'undefined') {
    throw new Error('Slip gaji hanya bisa diekspor dari browser.');
  }

  const element = document.createElement('div');
  element.className = 'payroll-slip-export-root';
  element.setAttribute('data-payroll-slip-export-root', 'true');
  element.innerHTML = buildPayrollSlipHtml(input);
  document.body.appendChild(element);

  return element;
};

const exportPayrollSlipHtmlPdf = async ({
  filename,
  run,
  items,
  profile,
  target,
}: {
  filename: string;
  run: PayrollRun;
  items: PayrollRunItem[];
  profile?: CompanyProfileSetting;
  target?: ExportTarget;
}) => {
  const element = createPayrollSlipElement({ run, items, profile });

  try {
    return await exportHtmlPdf({
      filename,
      element,
      target,
      orientation: 'portrait',
      pageMargin: 0,
      scale: 2,
    });
  } finally {
    element.remove();
  }
};

export const exportPayrollEmployeeSlipPdf = async ({
  run,
  item,
  profile,
  target = 'auto',
}: PayrollEmployeeSlipPdfInput) => {
  assertPayrollCanExportSlip(run);

  return exportPayrollSlipHtmlPdf({
    filename: `slip-gaji-${safeFilenameSegment(run.payroll_number)}-${safeFilenameSegment(item.employee_name)}.pdf`,
    run,
    items: [item],
    profile,
    target,
  });
};

export const exportPayrollRunSlipsPdf = async ({
  run,
  items,
  profile,
  target = 'auto',
}: PayrollRunSlipsPdfInput) => {
  assertPayrollCanExportSlip(run);

  if (items.length === 0) {
    throw new Error('Payroll belum memiliki item slip karyawan.');
  }

  return exportPayrollSlipHtmlPdf({
    filename: `slip-gaji-${safeFilenameSegment(run.payroll_number)}.pdf`,
    run,
    items,
    profile,
    target,
  });
};