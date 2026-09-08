import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Drawer, Modal, Space, Steps, Tag, Typography } from 'antd';
import { ArrowRight, CheckCircle2, HelpCircle, Landmark, PackageCheck, ReceiptText, WalletCards } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useI18n } from '@/hooks/useI18n';
import {
  OPENING_BALANCE_MODULE_DEFINITIONS,
  getOpeningBalanceBatchId,
  isOpeningBalanceBatchPosted,
} from '@/services/openingBalanceService';
import { formatDateOnly } from '@/utils/formatters';
import type { OpeningBalanceBatch, OpeningBalanceModule } from '@/types';

const { Text } = Typography;

type OpeningBalanceGuidanceWizardProps = {
  batches: OpeningBalanceBatch[];
  cutoffDate?: string;
  onClose: () => void;
  onOpenModule: (route: string) => void;
  open: boolean;
};

const statusKey = (batch?: OpeningBalanceBatch):
  | 'openingBalances.guidance.status.empty'
  | 'openingBalances.guidance.status.posted'
  | 'openingBalances.guidance.status.skipped'
  | 'openingBalances.guidance.status.draft' => {
  if (!batch) return 'openingBalances.guidance.status.empty';
  if (isOpeningBalanceBatchPosted(batch)) return 'openingBalances.guidance.status.posted';
  if (batch.status === 'SKIPPED') return 'openingBalances.guidance.status.skipped';
  return 'openingBalances.guidance.status.draft';
};

const statusColor = (batch?: OpeningBalanceBatch) => {
  if (isOpeningBalanceBatchPosted(batch)) return 'success';
  if (batch?.status === 'SKIPPED') return 'default';
  if (batch) return 'processing';
  return 'warning';
};

const moduleRoute = (module: OpeningBalanceModule) => (
  OPENING_BALANCE_MODULE_DEFINITIONS.find((definition) => definition.module === module)?.route
);

const GuidanceCard = ({
  action,
  children,
  icon,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex gap-3">
      <div className="mt-0.5 text-blue-600">{icon}</div>
      <div className="min-w-0 flex-1">
        <Text strong>{title}</Text>
        <div className="mt-1 text-sm leading-relaxed text-slate-600">{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  </div>
);

export default function OpeningBalanceGuidanceWizard({
  batches,
  cutoffDate,
  onClose,
  onOpenModule,
  open,
}: OpeningBalanceGuidanceWizardProps) {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [cashBankAlreadyRecorded, setCashBankAlreadyRecorded] = useState(true);
  const [hasExistingStockActivity, setHasExistingStockActivity] = useState(true);
  const [knowsReceivableDetails, setKnowsReceivableDetails] = useState(false);
  const [knowsPayableDetails, setKnowsPayableDetails] = useState(false);
  const sheetGestureStartY = useRef<number | undefined>(undefined);
  const isMobile = useIsMobile();

  const batchByModule = useMemo(() => {
    const result = new Map<OpeningBalanceModule, OpeningBalanceBatch | undefined>();
    for (const definition of OPENING_BALANCE_MODULE_DEFINITIONS) {
      const batchId = cutoffDate
        ? getOpeningBalanceBatchId(definition.module, cutoffDate)
        : undefined;
      result.set(
        definition.module,
        batchId ? batches.find((batch) => batch.id === batchId) : undefined,
      );
    }
    return result;
  }, [batches, cutoffDate]);

  const openModule = (module: OpeningBalanceModule) => {
    const route = moduleRoute(module);
    if (!route) return;
    onClose();
    onOpenModule(route);
  };

  const resetAndClose = () => {
    setCurrentStep(0);
    onClose();
  };

  const handleSheetGestureStart = (event: React.TouchEvent<HTMLDivElement>) => {
    sheetGestureStartY.current = event.touches[0]?.clientY;
  };

  const handleSheetGestureEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = sheetGestureStartY.current;
    const endY = event.changedTouches[0]?.clientY;
    sheetGestureStartY.current = undefined;

    // Gesture hanya hidup pada handle agar tidak mengganggu scroll konten wizard.
    if (startY !== undefined && endY !== undefined && endY - startY >= 64) {
      resetAndClose();
    }
  };

  const accountBatch = batchByModule.get('ACCOUNT');
  const inventoryBatch = batchByModule.get('INVENTORY');
  const receivableBatch = batchByModule.get('RECEIVABLE');
  const payableBatch = batchByModule.get('PAYABLE');
  const statusLabel = (batch?: OpeningBalanceBatch) => t(statusKey(batch));

  const navigationFooter = isMobile ? (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <Button size="large" className="h-12" onClick={resetAndClose}>{t('openingBalances.guidance.action.laterShort')}</Button>
      {currentStep < 2 ? (
        <Button size="large" className="h-12" type="primary" onClick={() => setCurrentStep((step) => step + 1)}>
          {t('openingBalances.guidance.action.continue')} <ArrowRight size={17} />
        </Button>
      ) : (
        <Button size="large" className="h-12" type="primary" onClick={resetAndClose}>{t('openingBalances.guidance.action.understood')}</Button>
      )}
      {currentStep > 0 && (
        <Button size="large" className="col-span-2 h-12" onClick={() => setCurrentStep((step) => step - 1)}>
          {t('openingBalances.guidance.action.backPrevious')}
        </Button>
      )}
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <Button onClick={resetAndClose}>{t('openingBalances.guidance.action.later')}</Button>
      <Space>
        {currentStep > 0 && (
          <Button onClick={() => setCurrentStep((step) => step - 1)}>{t('openingBalances.guidance.action.back')}</Button>
        )}
        {currentStep < 2 ? (
          <Button type="primary" onClick={() => setCurrentStep((step) => step + 1)}>
            {t('openingBalances.guidance.action.continue')} <ArrowRight size={15} />
          </Button>
        ) : (
          <Button type="primary" onClick={resetAndClose}>{t('openingBalances.guidance.action.understood')}</Button>
        )}
      </Space>
    </div>
  );

  const content = (
    <>
      <Steps
        className="mb-6"
        current={currentStep}
        responsive={false}
        size="small"
        items={[
          { title: t('openingBalances.guidance.step.facts') },
          { title: t('openingBalances.guidance.step.safe') },
          { title: t('openingBalances.guidance.step.progress') },
        ]}
      />

      {currentStep === 0 && (
        <div className="space-y-4">
          <Alert
            showIcon
            type="info"
            title={t('openingBalances.guidance.minimumTitle')}
            description={t('openingBalances.guidance.minimumDescription', {
              date: cutoffDate ? formatDateOnly(cutoffDate) : t('openingBalances.guidance.cutoffFallback'),
            })}
          />
          <Text type="secondary">
            {t('openingBalances.guidance.factsDescription')}
          </Text>
          <div className="space-y-2">
            <Checkbox className="flex min-h-12 items-center rounded-lg px-2 text-sm hover:bg-slate-50" checked={cashBankAlreadyRecorded} onChange={(event) => setCashBankAlreadyRecorded(event.target.checked)}>
              {t('openingBalances.guidance.fact.cashBankRecorded')}
            </Checkbox>
            <Checkbox className="flex min-h-12 items-center rounded-lg px-2 text-sm hover:bg-slate-50" checked={hasExistingStockActivity} onChange={(event) => setHasExistingStockActivity(event.target.checked)}>
              {t('openingBalances.guidance.fact.stockActivity')}
            </Checkbox>
            <Checkbox className="flex min-h-12 items-center rounded-lg px-2 text-sm hover:bg-slate-50" checked={knowsReceivableDetails} onChange={(event) => setKnowsReceivableDetails(event.target.checked)}>
              {t('openingBalances.guidance.fact.receivableKnown')}
            </Checkbox>
            <Checkbox className="flex min-h-12 items-center rounded-lg px-2 text-sm hover:bg-slate-50" checked={knowsPayableDetails} onChange={(event) => setKnowsPayableDetails(event.target.checked)}>
              {t('openingBalances.guidance.fact.payableKnown')}
            </Checkbox>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="space-y-3">
          <Text type="secondary">
            {t('openingBalances.guidance.safeDescription')}
          </Text>
          <GuidanceCard
            icon={<WalletCards size={20} />}
            title={t('openingBalances.guidance.cashBank.title')}
            action={(
              <Tag color={statusColor(accountBatch)}>{statusLabel(accountBatch)}</Tag>
            )}
          >
            {cashBankAlreadyRecorded
              ? t('openingBalances.guidance.cashBank.recorded')
              : t('openingBalances.guidance.cashBank.notRecorded')}
          </GuidanceCard>
          <GuidanceCard
            icon={<PackageCheck size={20} />}
            title={t('openingBalances.guidance.inventory.title')}
            action={(
              <Space wrap className={isMobile ? 'w-full' : undefined}>
                <Tag color={statusColor(inventoryBatch)}>{statusLabel(inventoryBatch)}</Tag>
                {!isOpeningBalanceBatchPosted(inventoryBatch) && inventoryBatch?.status !== 'SKIPPED' && (
                  <Button size={isMobile ? 'middle' : 'small'} className={isMobile ? 'min-h-11 flex-1' : undefined} onClick={() => openModule('INVENTORY')}>{t('openingBalances.guidance.inventory.open')}</Button>
                )}
              </Space>
            )}
          >
            {hasExistingStockActivity
              ? t('openingBalances.guidance.inventory.hasActivity')
              : t('openingBalances.guidance.inventory.noActivity')}
          </GuidanceCard>
          <GuidanceCard
            icon={<ReceiptText size={20} />}
            title={t('openingBalances.guidance.trade.title')}
            action={(
              <Space wrap className={isMobile ? 'w-full' : undefined}>
                <Tag color={statusColor(receivableBatch)}>{t('openingBalances.guidance.trade.receivableStatus', { status: statusLabel(receivableBatch) })}</Tag>
                <Tag color={statusColor(payableBatch)}>{t('openingBalances.guidance.trade.payableStatus', { status: statusLabel(payableBatch) })}</Tag>
                {knowsReceivableDetails && !isOpeningBalanceBatchPosted(receivableBatch) && receivableBatch?.status !== 'SKIPPED' && (
                  <Button size={isMobile ? 'middle' : 'small'} className={isMobile ? 'min-h-11 flex-1' : undefined} onClick={() => openModule('RECEIVABLE')}>{t('openingBalances.guidance.trade.openReceivable')}</Button>
                )}
                {knowsPayableDetails && !isOpeningBalanceBatchPosted(payableBatch) && payableBatch?.status !== 'SKIPPED' && (
                  <Button size={isMobile ? 'middle' : 'small'} className={isMobile ? 'min-h-11 flex-1' : undefined} onClick={() => openModule('PAYABLE')}>{t('openingBalances.guidance.trade.openPayable')}</Button>
                )}
              </Space>
            )}
          >
            {knowsReceivableDetails || knowsPayableDetails
              ? t('openingBalances.guidance.trade.known')
              : t('openingBalances.guidance.trade.unknown')}
          </GuidanceCard>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <Alert
            type="success"
            showIcon
            title={t('openingBalances.guidance.progressTitle')}
            description={t('openingBalances.guidance.progressDescription')}
          />
          <GuidanceCard
            icon={<Landmark size={20} />}
            title={t('openingBalances.guidance.accounts.title')}
            action={(
              !isOpeningBalanceBatchPosted(accountBatch) && accountBatch?.status !== 'SKIPPED'
                ? <Button size={isMobile ? 'middle' : 'small'} className={isMobile ? 'min-h-11 w-full' : undefined} type="primary" onClick={() => openModule('ACCOUNT')}>{t('openingBalances.guidance.accounts.open')}</Button>
                : undefined
            )}
          >
            {t('openingBalances.guidance.accounts.description')}
          </GuidanceCard>
          <GuidanceCard icon={<HelpCircle size={20} />} title={t('openingBalances.guidance.unknown.title')}>
            {t('openingBalances.guidance.unknown.description')}
          </GuidanceCard>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            {t('openingBalances.guidance.operationalNotice')}
          </div>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        title={t('openingBalances.guidance.mobileTitle')}
        placement="bottom"
        open={open}
        height="82dvh"
        footer={navigationFooter}
        rootClassName="mobile-bottom-drawer opening-balance-guidance-sheet"
        onClose={resetAndClose}
        styles={{
          body: { padding: 0, overflow: 'hidden' },
          header: { padding: '14px 16px 8px' },
          footer: {
            padding: '12px 16px',
            paddingBottom: 'calc(12px + var(--app-safe-area-inset-bottom, 0px))',
          },
        }}
      >
        <div
          aria-hidden="true"
          className="flex h-7 touch-pan-y items-center justify-center"
          onTouchEnd={handleSheetGestureEnd}
          onTouchStart={handleSheetGestureStart}
        >
          <span className="h-1.5 w-11 rounded-full bg-slate-300" />
        </div>
        <div className="h-[calc(100%-1.75rem)] overflow-y-auto overscroll-contain px-4 pb-4">
          {content}
        </div>
      </Drawer>
    );
  }

  return (
    <Modal
      open={open}
      title={t('openingBalances.guidance.title')}
      width={760}
      footer={navigationFooter}
      onCancel={resetAndClose}
    >
      {content}
    </Modal>
  );
}
