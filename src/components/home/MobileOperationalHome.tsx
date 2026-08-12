import { Link } from '@tanstack/react-router';
import { theme as antdTheme } from 'antd';
import { AlertCircle, ArrowRight, CheckCircle2, CloudOff, Clock3, MoreHorizontal, RefreshCw } from 'lucide-react';
import type { ComponentType } from 'react';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import dayjs from '@/lib/dayjs';
import { openMobileNavigation } from '@/navigation/mobileNavigation';
import type { MobileHomeData } from '@/services/mobileHomeService';
import { getMobileHomeServiceSelection, getUserInitials } from '@/utils/mobileHome';

export type MobileHomeServiceItem = {
  to: string;
  hash?: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
};

type MobileHomeDataState = {
  data?: MobileHomeData;
  error?: string;
  loadedAt?: string;
  isError: boolean;
  isLoading: boolean;
};

interface MobileOperationalHomeProps {
  canViewHistory: boolean;
  canViewSales: boolean;
  currentUserName: string;
  dataState: MobileHomeDataState;
  onRefresh: () => void;
  services: MobileHomeServiceItem[];
}

const MobileSectionHeading = ({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
    <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
      {title}
    </h2>
    {action}
  </div>
);

const LoadingLine = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-full bg-white/25 ${className}`} />
);

const MobileHomeHero = ({
  canViewSales,
  dataState,
  firstService,
  onRefresh,
}: {
  canViewSales: boolean;
  dataState: MobileHomeDataState;
  firstService?: MobileHomeServiceItem;
  onRefresh: () => void;
}) => {
  const { locale, t } = useI18n();
  const { token } = antdTheme.useToken();
  const transactionCount = dataState.data?.transactions.length ?? 0;
  const totalRevenue = dataState.data?.totalRevenue ?? 0;
  const averageTransaction = dataState.data?.averageTransaction ?? 0;
  const heroStyle = {
    background: `linear-gradient(135deg, ${token.colorPrimaryActive} 0%, ${token.colorPrimary} 58%, ${token.colorPrimaryHover} 100%)`,
    boxShadow: token.boxShadowSecondary,
  };

  if (!canViewSales) {
    const content = (
      <div className="relative overflow-hidden rounded-2xl p-5 text-white" style={heroStyle}>
        <div aria-hidden className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-16 h-32 w-32 rounded-full border border-white/10" />
        <CheckCircle2 size={28} className="mb-8 text-white/85" />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/85">
          {t('home.mobile.workspace')}
        </p>
        <h2 className="mt-2 text-2xl font-bold leading-tight">
          {t('home.mobile.readyTitle')}
        </h2>
        <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-white/85">
          {t('home.mobile.readyDescription')}
        </p>
        {firstService && (
          <div className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
            {t('home.mobile.openService', { service: firstService.label })}
            <ArrowRight size={16} aria-hidden />
          </div>
        )}
      </div>
    );

    return firstService ? (
      <Link to={firstService.to} hash={firstService.hash} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        {content}
      </Link>
    ) : content;
  }

  const cardContent = (
    <div className="relative overflow-hidden rounded-2xl p-5 text-white" style={heroStyle}>
      <div aria-hidden className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-20 right-12 h-36 w-36 rounded-full border border-white/10" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/85">
            {t('home.mobile.salesToday')}
          </p>
          <p className="mt-1 text-xs text-white/70">
            {dayjs.tz().locale(locale).format('D MMMM YYYY')}
          </p>
        </div>
        <ArrowRight size={20} className="mt-0.5 text-white/85" aria-hidden />
      </div>

      {dataState.isLoading ? (
        <div className="relative mt-8 space-y-3" aria-label={t('home.mobile.loadingSummary')}>
          <LoadingLine className="h-9 w-3/4" />
          <LoadingLine className="h-4 w-1/2" />
        </div>
      ) : dataState.isError ? (
        <div className="relative mt-7 rounded-xl border border-white/20 bg-black/10 p-3 backdrop-blur-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={19} className="mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('home.mobile.loadFailed')}</p>
              <p className="mt-1 line-clamp-2 text-xs text-white/75">{dataState.error}</p>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRefresh();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t('home.mobile.retry')}
            >
              <RefreshCw size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mt-7">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-semibold text-white/85">Rp</span>
            <strong className="min-w-0 break-words text-[clamp(1.75rem,8vw,2.4rem)] font-bold leading-none tracking-tight">
              {formatCurrency(totalRevenue)}
            </strong>
          </div>

          <div className="mt-6 grid grid-cols-2 divide-x divide-white/20 rounded-xl bg-black/10 px-1 py-3 backdrop-blur-sm">
            <div className="px-3">
              <p className="text-[11px] text-white/70">{t('home.mobile.transactions')}</p>
              <p className="mt-1 text-sm font-bold">
                {t('home.mobile.transactionValue', { count: transactionCount })}
              </p>
            </div>
            <div className="px-3">
              <p className="text-[11px] text-white/70">{t('home.averagePerTransaction')}</p>
              <p className="mt-1 truncate text-sm font-bold">Rp {formatCurrency(averageTransaction)}</p>
            </div>
          </div>
        </div>
      )}

      {dataState.loadedAt && !dataState.isLoading && (
        <p className="relative mt-3 text-[11px] text-white/65">
          {t('home.mobile.updatedAt', { time: dayjs(dataState.loadedAt).format('HH:mm') })}
        </p>
      )}
    </div>
  );

  return (
    <Link
      to="/report/pos-sales-report"
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      aria-label={t('home.mobile.openSalesReport')}
    >
      {cardContent}
    </Link>
  );
};

const SyncAttention = () => {
  const { t } = useI18n();
  const syncStatus = useSyncStatus();

  const config = (() => {
    if (!syncStatus.isOnline) {
      return {
        icon: CloudOff,
        title: t('home.mobile.offlineTitle'),
        description: t('home.mobile.offlineDescription'),
        tone: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200',
        iconTone: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100',
      };
    }

    if (syncStatus.hasFailed) {
      return {
        icon: AlertCircle,
        title: t('home.mobile.syncFailedTitle'),
        description: t('home.mobile.syncFailedDescription', { count: syncStatus.counts.failed }),
        tone: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200',
        iconTone: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200',
      };
    }

    if (syncStatus.hasPending || syncStatus.isBusy) {
      return {
        icon: Clock3,
        title: t('home.mobile.syncPendingTitle'),
        description: t('home.mobile.syncPendingDescription', { count: syncStatus.counts.pending }),
        tone: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100',
        iconTone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-100',
      };
    }

    return undefined;
  })();

  if (!config) return null;

  const Icon = config.icon;
  return (
    <section className={`rounded-2xl border p-4 ${config.tone}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.iconTone}`}>
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-sm font-bold">{config.title}</h2>
          <p className="mt-1 text-xs leading-relaxed opacity-80">{config.description}</p>
        </div>
      </div>
    </section>
  );
};

export const MobileOperationalHome = ({
  canViewHistory,
  canViewSales,
  currentUserName,
  dataState,
  onRefresh,
  services,
}: MobileOperationalHomeProps) => {
  const { t } = useI18n();
  const serviceSelection = getMobileHomeServiceSelection(services);
  const recentTransactions = dataState.data?.transactions.slice(0, 5) ?? [];
  const firstService = serviceSelection.items[0];

  return (
    <main className="mx-auto w-full max-w-lg pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-sm font-bold text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-100 dark:ring-blue-900">
            {getUserInitials(currentUserName)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('home.mobile.greeting')}
            </p>
            <h1 className="truncate text-lg font-bold leading-tight text-gray-950 dark:text-gray-50">
              {currentUserName}
            </h1>
          </div>
        </div>
        {canViewSales && (
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
            aria-label={t('home.mobile.refresh')}
          >
            <RefreshCw size={19} aria-hidden />
          </button>
        )}
      </header>

      <div className="space-y-6">
        <MobileHomeHero
          canViewSales={canViewSales}
          dataState={dataState}
          firstService={firstService}
          onRefresh={onRefresh}
        />

        <SyncAttention />

        {services.length > 0 && (
          <section aria-label={t('home.mobile.mainServices')}>
            <MobileSectionHeading title={t('home.mobile.mainServices')} />
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {serviceSelection.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={`${item.to}${item.hash ?? ''}`}
                    to={item.to}
                    hash={item.hash}
                    className="group flex min-h-[92px] min-w-0 flex-col items-center justify-start rounded-2xl border border-gray-100 bg-white px-1.5 py-3 text-center shadow-sm transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900"
                    aria-label={item.label}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 transition-colors group-hover:bg-blue-50 dark:bg-gray-800 dark:group-hover:bg-blue-950/50">
                      <Icon className={`text-[20px] ${item.color}`} />
                    </span>
                    <span className="mt-2 line-clamp-2 w-full break-words text-[10px] font-semibold leading-tight text-gray-700 dark:text-gray-200 min-[370px]:text-[11px]">
                      {item.label}
                    </span>
                  </Link>
                );
              })}

              {serviceSelection.hasMore && (
                <button
                  type="button"
                  onClick={openMobileNavigation}
                  className="group flex min-h-[92px] min-w-0 flex-col items-center justify-start rounded-2xl border border-gray-100 bg-white px-1.5 py-3 text-center shadow-sm transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900"
                  aria-label={t('home.mobile.moreServices', { count: serviceSelection.hiddenCount })}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-blue-700 transition-colors group-hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-300 dark:group-hover:bg-blue-950/50">
                    <MoreHorizontal size={21} aria-hidden />
                  </span>
                  <span className="mt-2 text-[10px] font-semibold leading-tight text-gray-700 dark:text-gray-200 min-[370px]:text-[11px]">
                    {t('home.mobile.more')}
                  </span>
                </button>
              )}
            </div>
          </section>
        )}

        {canViewSales && (
          <section aria-label={t('home.mobile.recentTransactions')}>
            <MobileSectionHeading
              title={t('home.mobile.recentTransactions')}
              action={canViewHistory ? (
                <Link
                  to="/history"
                  className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/40"
                >
                  {t('home.mobile.viewAll')}
                  <ArrowRight size={15} aria-hidden />
                </Link>
              ) : undefined}
            />

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {dataState.isLoading ? (
                <div className="space-y-4 p-4" aria-label={t('home.mobile.loadingTransactions')}>
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="flex animate-pulse items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
                        <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : dataState.isError ? (
                <div className="px-5 py-8 text-center">
                  <AlertCircle size={28} className="mx-auto text-red-400" aria-hidden />
                  <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {t('home.mobile.loadFailed')}
                  </p>
                </div>
              ) : recentTransactions.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Clock3 size={28} className="mx-auto text-gray-300 dark:text-gray-600" aria-hidden />
                  <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {t('home.mobile.noRecentTransactions')}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('home.mobile.noRecentTransactionsDescription')}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentTransactions.map((transaction) => {
                    const paymentLabel = transaction.payment_method_name
                      ?? transaction.payment_method_code
                      ?? transaction.payment_method;
                    const row = (
                      <div className="flex min-h-[68px] items-center gap-3 px-4 py-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                          {transaction.transaction_number.slice(-2).toLocaleUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {transaction.transaction_number}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                            {paymentLabel} · {dayjs(transaction.created_at).format('HH:mm')}
                          </p>
                        </div>
                        <p className="shrink-0 text-right text-xs font-bold text-gray-900 dark:text-gray-100 min-[370px]:text-sm">
                          Rp {formatCurrency(transaction.total_amount)}
                        </p>
                      </div>
                    );

                    return canViewHistory ? (
                      <Link
                        key={transaction.id}
                        to="/history"
                        className="block transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-gray-800/60"
                        aria-label={t('home.mobile.openTransaction', { number: transaction.transaction_number })}
                      >
                        {row}
                      </Link>
                    ) : (
                      <div key={transaction.id}>{row}</div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
};
