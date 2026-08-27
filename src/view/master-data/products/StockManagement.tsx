import { Alert, App, Button, Card, Dropdown, Segmented } from 'antd';
import type { MenuProps } from 'antd';
import { Plus, Upload, Download, MoreVertical, Package } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import { markProductVerified } from '@/services/posQuickItemService';
import type { Product } from '@/types';
import StockTable from '@/components/StockTable';
import { usePurchaseFromProductsActions } from '@/hooks/usePurchaseFromProductsActions';
import StockProductModal from './StockProductModal';
import {
  buildProductCsvImportItems,
  buildProductCsvImportItemsFromRows,
  createProductCsvExportRows,
  createProductCsvTemplateRows,
  createProductImportErrorRows,
  type ProductCsvRowError,
} from '@/utils/productsCsv';
import {
  isSupportedProductImportFile,
  isWorkbookFile,
  readWorkbookRows,
} from '@/utils/productsWorkbook';
import { buildProductMasterImportPlan } from '@/utils/productMasterImport';
import { exportCsv, exportXlsx, type ExportTarget } from '@/utils/export';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { GlobalBreadcrumb } from '@/components/GlobalBreadcrumb';
import { MobileCrudBottomSheet, MobileCrudPageHeader } from '@/components/mobile-crud';

const STOCK_SAVED_EVENT = 'frayukti-workflow-tour-stock-saved';

/**
 * Import sudah menerima .xlsx sejak awal, jadi ekspor yang cuma bisa .csv
 * memaksa pengguna menyimpan ulang dari Excel — dan di situlah pemisah desimal
 * dan koma di dalam sel JSON mulai rusak. Kedua format dipakai lewat satu
 * pembangun baris yang sama supaya isinya tidak pernah berbeda.
 */
type ProductExportFormat = 'xlsx' | 'csv';

const buildFileTimestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
};

export default function StockManagement() {
  const { modal, message } = App.useApp();
  const { t } = useI18n();
  const purchaseActions = usePurchaseFromProductsActions();
  const {
    products,
    isLoading,
    editingId,
    control,
    handleSubmit,
    handleEdit,
    handleDelete,
    resetForm,
    errors,
    setValue,
    getValues,
    reset,
    importProductsFromCsv,
    isImporting,
  } = useStockManagement();
  const isMobile = useIsMobile();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false);
  // Di layar kecil tidak ada ruang untuk submenu, jadi formatnya dipilih sekali
  // lalu dipakai oleh ekspor maupun template.
  const [mobileExportFormat, setMobileExportFormat] = useState<ProductExportFormat>('xlsx');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleModalCancel = () => {
    resetForm();
    setIsModalOpen(false);
  };

  const handleAddProduct = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    handleEdit(product);
    setIsModalOpen(true);
  };

  const handleVerifyProduct = async (product: Product) => {
    try {
      const verified = await markProductVerified(product.id);
      message.success(t('stock.verifySuccess', { name: verified.name }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('stock.verifyFailed'));
    }
  };

  /** Satu tabel, dua bungkus. Bedanya cuma cara file-nya ditulis. */
  const writeExportFile = async (
    format: ProductExportFormat,
    baseName: string,
    rows: ReturnType<typeof createProductCsvExportRows>,
    sheetName: string,
    target: ExportTarget,
  ) => (format === 'xlsx'
    ? exportXlsx({ filename: `${baseName}.xlsx`, sheets: [{ name: sheetName, rows }], target })
    : exportCsv({ filename: `${baseName}.csv`, rows, target }));

  const handleExportProducts = async (
    format: ProductExportFormat,
    target: ExportTarget = 'auto',
  ) => {
    if (products.length === 0) {
      message.info(t('stock.noExportData'));
      return;
    }

    try {
      const exported = await writeExportFile(
        format,
        `products_export_${new Date().toISOString().split('T')[0]}`,
        createProductCsvExportRows(products),
        t('stock.title'),
        target,
      );
      if (!exported) return;
      message.success(t('stock.exportSuccess'));
    } catch (error) {
      console.error('Failed to export products:', error);
      message.error(t('stock.exportFailed'));
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Laporan baris bermasalah mengikuti format file yang diunggah: yang diimpor
   * dari Excel dikembalikan sebagai Excel, karena file ini memang untuk
   * diperbaiki lalu diunggah ulang.
   */
  const handleDownloadErrorRows = async (
    headerRow: string[],
    rowErrors: ProductCsvRowError[],
    format: ProductExportFormat,
  ) => {
    try {
      const exported = await writeExportFile(
        format,
        `import-produk-gagal-${buildFileTimestamp()}`,
        createProductImportErrorRows(headerRow, rowErrors),
        t('stock.skippedRowsSheet'),
        'auto',
      );
      if (!exported) return;
      message.success(t('stock.errorRowsDownloaded'));
    } catch (error) {
      console.error('Failed to export failed import rows:', error);
      message.error(t('stock.exportFailed'));
    }
  };

  const handleDownloadWarningRows = async (
    headerRow: string[],
    rowWarnings: ProductCsvRowError[],
    format: ProductExportFormat,
  ) => {
    try {
      const exported = await writeExportFile(
        format,
        `import-produk-peringatan-${buildFileTimestamp()}`,
        createProductImportErrorRows(headerRow, rowWarnings, 'peringatan'),
        t('stock.adjustedRowsSheet'),
        'auto',
      );
      if (!exported) return;
      message.success(t('stock.warningRowsDownloaded'));
    } catch (error) {
      console.error('Failed to export warned import rows:', error);
      message.error(t('stock.exportFailed'));
    }
  };

  const handleImportSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isSupportedProductImportFile(file.name)) {
      message.error(t('stock.unsupportedImportFile'));
      return;
    }

    try {
      const isWorkbook = isWorkbookFile(file.name);
      const reportFormat: ProductExportFormat = isWorkbook ? 'xlsx' : 'csv';
      const parsed = isWorkbook
        ? buildProductCsvImportItemsFromRows(await readWorkbookRows(file))
        : buildProductCsvImportItems(await file.text());
      const { items, fileErrors, headerRow, ignoredOperationalColumns } = parsed;

      if (fileErrors.length > 0) {
        modal.error({
          title: t('stock.importBlockedTitle'),
          content: (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                {t('stock.importBlockedDescription', { count: fileErrors.length })}
              </div>
              <div className="text-xs text-red-600">
                {fileErrors.map((errorText) => (
                  <div key={errorText}>{errorText}</div>
                ))}
              </div>
            </div>
          ),
        });
        return;
      }

      // Preview only. The mutation rebuilds this plan inside its transaction, so
      // what is shown here can never drift into being what actually gets written.
      const previewPlan = buildProductMasterImportPlan({
        items,
        existingProducts: products,
        now: new Date().toISOString(),
      });
      const rowErrors = [...parsed.rowErrors, ...previewPlan.rowErrors]
        .sort((a, b) => a.rowNumber - b.rowNumber);

      if (previewPlan.items.length === 0) {
        modal.error({
          title: t('stock.importBlockedTitle'),
          content: (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">{t('stock.noValidImportData')}</div>
              {rowErrors.length > 0 ? (
                <Button
                  icon={<Download size={16} />}
                  onClick={() => void handleDownloadErrorRows(headerRow, rowErrors, reportFormat)}
                >
                  {t('stock.downloadErrorRows', { count: rowErrors.length })}
                </Button>
              ) : null}
            </div>
          ),
        });
        return;
      }

      const ignoredColumnWarnings = [
        ignoredOperationalColumns.stock
          ? t('stock.stockColumnIgnored', { column: ignoredOperationalColumns.stock })
          : undefined,
        ignoredOperationalColumns.purchase_quantity
          ? t('stock.purchaseQuantityColumnIgnored', {
            column: ignoredOperationalColumns.purchase_quantity,
          })
          : undefined,
      ].filter((warning): warning is string => Boolean(warning));

      modal.confirm({
        title: t('stock.importTitle'),
        content: (
          <div className="space-y-3">
            <Alert
              type="info"
              showIcon
              message={t('stock.masterImportNotice')}
            />
            <div className="text-sm text-gray-700">
              {t('stock.file')}: <span className="font-medium">{file.name}</span>
            </div>
            <div className="text-sm text-gray-700">
              {t('stock.newProducts')}: <span className="font-medium">{previewPlan.createdCount}</span>
            </div>
            <div className="text-sm text-gray-700">
              {t('stock.updatedProducts')}: <span className="font-medium">{previewPlan.updatedCount}</span>
            </div>
            {rowErrors.length > 0 ? (
              <div className="space-y-2">
                <Alert
                  type="warning"
                  showIcon
                  message={t('stock.skippedRows', { count: rowErrors.length })}
                />
                <Button
                  size="small"
                  icon={<Download size={14} />}
                  onClick={() => void handleDownloadErrorRows(headerRow, rowErrors, reportFormat)}
                >
                  {t('stock.downloadErrorRows', { count: rowErrors.length })}
                </Button>
              </div>
            ) : null}
            {/*
              Baris yang tetap masuk tapi ada isinya yang dibuang — satuan tanpa
              konversi, satuan default di luar daftar. Dulu hal ini hilang tanpa
              jejak dan pengguna mengira filenya terpakai utuh.
            */}
            {previewPlan.rowWarnings.length > 0 ? (
              <div className="space-y-2">
                <Alert
                  type="warning"
                  showIcon
                  message={t('stock.adjustedRows', { count: previewPlan.rowWarnings.length })}
                />
                <div className="max-h-32 overflow-y-auto text-xs text-gray-600">
                  {previewPlan.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
                <Button
                  size="small"
                  icon={<Download size={14} />}
                  onClick={() => void handleDownloadWarningRows(headerRow, previewPlan.rowWarnings, reportFormat)}
                >
                  {t('stock.downloadWarningRows', { count: previewPlan.rowWarnings.length })}
                </Button>
              </div>
            ) : null}
            <div className="text-xs text-gray-500">
              {t('stock.supportedColumns')}
            </div>
            {ignoredColumnWarnings.map((warning) => (
              <Alert key={warning} type="warning" showIcon message={warning} />
            ))}
          </div>
        ),
        okText: t('stock.importCsv'),
        cancelText: t('stock.form.cancel'),
        okButtonProps: { disabled: isImporting },
        onOk: async () => {
          try {
            await importProductsFromCsv(items);
          } catch (error) {
            const errorMessage = error instanceof Error
              ? error.message
              : t('stock.importFailed');
            message.error(errorMessage);
            throw error;
          }
        },
      });
    } catch (error) {
      console.error('Failed to import products file:', error);
      message.error(t('stock.readCsvFailed'));
    }
  };

  const handleDownloadTemplate = async (
    format: ProductExportFormat,
    target: ExportTarget = 'auto',
  ) => {
    try {
      const exported = await writeExportFile(
        format,
        'template-import-produk',
        createProductCsvTemplateRows(),
        t('stock.downloadTemplate'),
        target,
      );
      if (!exported) return;
      message.success(t('stock.templateDownloaded'));
    } catch (error) {
      console.error('Failed to export product import template:', error);
      message.error(t('stock.exportFailed'));
    }
  };

  // Template dipakai justru saat daftar produk masih kosong, jadi yang dimatikan
  // hanya entri ekspor datanya — bukan seluruh menu.
  const hasProducts = products.length > 0;

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'xlsx',
      label: t('stock.formatExcel'),
      disabled: !hasProducts,
      children: [
        { key: 'xlsx:share', label: t('stock.share') },
        { key: 'xlsx:save', label: t('stock.saveToFile') },
      ],
    },
    {
      key: 'csv',
      label: t('stock.formatCsv'),
      disabled: !hasProducts,
      children: [
        { key: 'csv:share', label: t('stock.share') },
        { key: 'csv:save', label: t('stock.saveToFile') },
      ],
    },
    { type: 'divider' },
    {
      key: 'template',
      label: t('stock.downloadTemplate'),
      children: [
        { key: 'template:xlsx', label: t('stock.formatExcel') },
        { key: 'template:csv', label: t('stock.formatCsv') },
      ],
    },
  ];

  const handleExportMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    const [scope, value] = key.split(':');

    if (scope === 'template') {
      void handleDownloadTemplate(value as ProductExportFormat);
      return;
    }
    void handleExportProducts(scope as ProductExportFormat, value as ExportTarget);
  };

  const handleMobileExport = (target: ExportTarget) => {
    setIsActionDrawerOpen(false);
    void handleExportProducts(mobileExportFormat, target);
  };

  const handleMobileImportClick = () => {
    setIsActionDrawerOpen(false);
    handleImportClick();
  };

  const handleMobileTemplateDownload = () => {
    setIsActionDrawerOpen(false);
    void handleDownloadTemplate(mobileExportFormat);
  };

  return (
    <>
      {isMobile ? (
        <MobileCrudPageHeader
          testId="mobile-product-page-header"
          title={t('stock.title')}
          icon={<Package aria-hidden className="h-5 w-5 shrink-0" />}
          breadcrumb={<GlobalBreadcrumb pathname="/master-data/products" compact />}
          action={(
            <Button
              aria-label={t('stock.actionMenuAria')}
              icon={<MoreVertical size={18} />}
              onClick={() => setIsActionDrawerOpen(true)}
            />
          )}
        />
      ) : null}

      <Card
      className={isMobile ? '' : 'shadow-md'}
      style={isMobile ? { background: 'transparent', border: 0, boxShadow: 'none' } : undefined}
      styles={isMobile ? {
        body: { padding: 0 },
      } : undefined}
      title={!isMobile ? (
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          {t('stock.title')}
        </div>
      ) : undefined}
      extra={!isMobile ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
              <Button icon={<Download size={16} />}>
                {t('stock.exportCsv')}
              </Button>
            </Dropdown>
            <Button icon={<Upload size={16} />} onClick={handleImportClick} disabled={isImporting}>
              {t('stock.importCsv')}
            </Button>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={handleAddProduct}
              data-tour="stock-add-product"
            >
              {t('stock.add')}
            </Button>
          </div>
        </div>
      ) : undefined}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        onChange={handleImportSelected}
      />

      <MobileCrudBottomSheet
        title={t('stock.actions')}
        open={isActionDrawerOpen}
        onClose={() => setIsActionDrawerOpen(false)}
      >
        <div className="space-y-3 pb-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Download size={18} />
              <span>{t('stock.exportCsv')}</span>
            </div>
            <Segmented<ProductExportFormat>
              block
              className="mb-3"
              value={mobileExportFormat}
              onChange={setMobileExportFormat}
              options={[
                { value: 'xlsx', label: t('stock.formatExcel') },
                { value: 'csv', label: t('stock.formatCsv') },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="large"
                disabled={products.length === 0}
                onClick={() => handleMobileExport('share')}
                className="h-12"
              >
                {t('stock.share')}
              </Button>
              <Button
                size="large"
                disabled={products.length === 0}
                onClick={() => handleMobileExport('save')}
                className="h-12"
              >
                {t('stock.saveToFile')}
              </Button>
            </div>
          </div>

          <Button
            block
            size="large"
            icon={<Upload size={20} />}
            disabled={isImporting}
            onClick={handleMobileImportClick}
            className="flex h-14 items-center justify-start font-semibold"
          >
            {t('stock.importCsv')}
          </Button>

          <Button
            block
            size="large"
            icon={<Download size={20} />}
            onClick={handleMobileTemplateDownload}
            className="flex h-14 items-center justify-start font-semibold"
          >
            {t('stock.downloadTemplate')}
          </Button>
        </div>
      </MobileCrudBottomSheet>

      <StockProductModal
        open={isModalOpen}
        editingId={editingId}
        control={control}
        errors={errors}
        setValue={setValue}
        getValues={getValues}
        reset={reset}
        onCancel={handleModalCancel}
        setIsModalOpen={setIsModalOpen}
        onSave={async () => {
          try {
            const submit = await handleSubmit();
            if (submit) {
              setIsModalOpen(false);
              window.dispatchEvent(new Event(STOCK_SAVED_EVENT));
            }
          } catch (error) {
            console.error('Failed to save product:', error);
          }
        }}
      />

      <StockTable
        products={products}
        onEdit={handleEditProduct}
        onDelete={handleDelete}
        onVerify={handleVerifyProduct}
        onAdd={handleAddProduct}
        loading={isLoading}
        bulkActions={purchaseActions.length
          ? { label: t('purchaseDocuments.addSelectedProducts'), items: purchaseActions }
          : undefined}
      />
      </Card>
    </>
  );
}
