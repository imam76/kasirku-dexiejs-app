import { App, Button, Card, Drawer, Dropdown, InputNumber, Modal } from 'antd';
import type { MenuProps } from 'antd';
import { Plus, Upload, Download, MoreVertical, Package } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import type { Product } from '@/types';
import StockTable from '@/components/StockTable';
import StockProductModal from './StockProductModal';
import {
  buildProductCsvImportItems,
  createProductCsvExportRows,
} from '@/utils/productsCsv';
import { exportCsv, type ExportTarget } from '@/utils/export';
import { useI18n } from '@/hooks/useI18n';

const STOCK_SAVED_EVENT = 'frayukti-workflow-tour-stock-saved';

export default function StockManagement() {
  const { modal, message } = App.useApp();
  const { t } = useI18n();
  const {
    products,
    editingId,
    control,
    handleSubmit,
    handleEdit,
    handleDelete,
    recordOpeningStock,
    isRecordingOpeningStock,
    resetForm,
    errors,
    setValue,
    importProductsFromCsv,
    isImporting,
  } = useStockManagement();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false);
  const [openingStockProduct, setOpeningStockProduct] = useState<Product | null>(null);
  const [openingStockQuantity, setOpeningStockQuantity] = useState<number | null>(null);
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

  const handleOpeningStockClick = (product: Product) => {
    setOpeningStockProduct(product);
    setOpeningStockQuantity(null);
  };

  const handleOpeningStockCancel = () => {
    setOpeningStockProduct(null);
    setOpeningStockQuantity(null);
  };

  const handleOpeningStockSubmit = async () => {
    if (!openingStockProduct || !openingStockQuantity || openingStockQuantity <= 0) {
      message.error(t('stock.openingStockInvalid'));
      return;
    }

    await recordOpeningStock({
      productId: openingStockProduct.id,
      quantity: openingStockQuantity,
    });
    handleOpeningStockCancel();
  };

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (products.length === 0) {
      message.info(t('stock.noExportData'));
      return;
    }

    try {
      const exported = await exportCsv({
        filename: `products_export_${new Date().toISOString().split('T')[0]}.csv`,
        rows: createProductCsvExportRows(products),
        target,
      });
      if (!exported) return;
      message.success(t('stock.exportSuccess'));
    } catch (error) {
      console.error('Failed to export products CSV:', error);
      message.error(t('stock.exportFailed'));
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      message.error(t('stock.csvOnly'));
      return;
    }

    try {
      const text = await file.text();
      const { items, errors: parseErrors } = buildProductCsvImportItems(text);

      if (items.length === 0) {
        message.error(parseErrors[0] ?? t('stock.noValidImportData'));
        return;
      }

      modal.confirm({
        title: t('stock.importTitle'),
        content: (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">
              {t('stock.file')}: <span className="font-medium">{file.name}</span>
            </div>
            <div className="text-sm text-gray-700">
              {t('stock.validRows')}: <span className="font-medium">{items.length}</span>
              {parseErrors.length > 0 ? (
                <>
                  {' '}
                  • {t('stock.errorCount')}: <span className="font-medium">{parseErrors.length}</span>
                </>
              ) : null}
            </div>
            <div className="text-xs text-gray-500">
              {t('stock.supportedColumns')}
            </div>
            {parseErrors.length > 0 ? (
              <div className="text-xs text-red-600">
                {parseErrors.slice(0, 5).map((errorText) => (
                  <div key={errorText}>{errorText}</div>
                ))}
                {parseErrors.length > 5 ? <div>{t('stock.moreErrors', { count: parseErrors.length - 5 })}</div> : null}
              </div>
            ) : null}
          </div>
        ),
        okText: t('stock.importCsv'),
        cancelText: t('stock.form.cancel'),
        okButtonProps: { disabled: isImporting },
        onOk: async () => {
          await importProductsFromCsv(items);
        },
      });
    } catch (error) {
      console.error('Failed to import CSV:', error);
      message.error(t('stock.readCsvFailed'));
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    { key: 'share', label: t('stock.share') },
    { key: 'save', label: t('stock.saveToFile') },
  ];

  const handleExportMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    void handleExportCsv(key as ExportTarget);
  };

  const handleMobileExport = (target: ExportTarget) => {
    setIsActionDrawerOpen(false);
    void handleExportCsv(target);
  };

  const handleMobileImportClick = () => {
    setIsActionDrawerOpen(false);
    handleImportClick();
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          {t('stock.title')}
        </div>
      )}
      extra={(
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={handleAddProduct}
              data-tour="stock-add-product"
            >
              {t('stock.add')}
            </Button>
            <Button
              aria-label={t('stock.actionMenuAria')}
              icon={<MoreVertical size={18} />}
              onClick={() => setIsActionDrawerOpen(true)}
            />
          </div>
          <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
            <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
              <Button icon={<Download size={16} />} disabled={products.length === 0}>
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
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportSelected}
      />

      <Drawer
        title={t('stock.actions')}
        placement="bottom"
        open={isActionDrawerOpen}
        onClose={() => setIsActionDrawerOpen(false)}
        size="auto"
        className="sm:hidden"
        styles={{
          body: { padding: 16 },
          header: { padding: '16px 20px' },
        }}
      >
        <div className="space-y-3 pb-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Download size={18} />
              <span>{t('stock.exportCsv')}</span>
            </div>
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
        </div>
      </Drawer>

      <StockProductModal
        open={isModalOpen}
        editingId={editingId}
        control={control}
        errors={errors}
        setValue={setValue}
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
        onOpeningStock={handleOpeningStockClick}
      />

      <Modal
        title={t('stock.openingStockTitle')}
        open={Boolean(openingStockProduct)}
        onCancel={handleOpeningStockCancel}
        onOk={handleOpeningStockSubmit}
        okText={t('stock.openingStockAction')}
        cancelText={t('stock.form.cancel')}
        confirmLoading={isRecordingOpeningStock}
        okButtonProps={{ disabled: !openingStockQuantity || openingStockQuantity <= 0 }}
        destroyOnHidden
      >
        {openingStockProduct ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">{openingStockProduct.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                {t('stock.openingStockCurrent', {
                  stock: openingStockProduct.stock,
                  unit: openingStockProduct.purchase_unit,
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('stock.openingStockQuantity')}
              </label>
              <InputNumber
                inputMode="decimal"
                min={0}
                step={1}
                value={openingStockQuantity}
                onChange={(value) => setOpeningStockQuantity(value === null ? null : Number(value))}
                placeholder={t('stock.openingStockPlaceholder')}
                className="w-full"
                addonAfter={openingStockProduct.purchase_unit}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
