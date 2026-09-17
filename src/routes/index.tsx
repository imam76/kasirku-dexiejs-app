import {
  BankOutlined,
  BarChartOutlined,
  CheckOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ProductOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShoppingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Responsive, type Layout, type LayoutItem, type ResponsiveLayouts } from 'react-grid-layout';
import { App, Button, Checkbox, DatePicker, Empty, Popover, Select, Skeleton, Tooltip, theme as antdTheme } from 'antd';
import type { Dayjs } from 'dayjs';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import {
  useDashboardCashOutTotal,
  useDashboardPosSalesReports,
  useDashboardProfitLossReports,
} from '@/hooks/useDashboardReports';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMobileHomeData } from '@/hooks/useMobileHomeData';
import {
  MobileOperationalHome,
  type MobileHomeServiceItem,
} from '@/components/home/MobileOperationalHome';
import dayjs from '@/lib/dayjs';
import { formatCurrency } from '@/utils/formatters';
import { useI18n } from '@/hooks/useI18n';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { canAccessPath } from '@/auth/routePermissions';
import { useAuth } from '@/auth/useAuth';
import type {
  DashboardBreakpoint,
  DashboardLayouts,
  DashboardPreference,
  DashboardWidgetId,
  DashboardWidgetLayout,
} from '@/types';
import {
  DASHBOARD_BREAKPOINT_ORDER,
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLUMNS,
  DASHBOARD_WIDGET_IDS,
  getAllowedDashboardWidgetIds,
  getDashboardLayoutsForVisibleWidgets,
  getDefaultDashboardPreference,
  isDashboardWidgetId,
  normalizeDashboardPreference,
} from '@/utils/dashboardPreferences';
import {
  DASHBOARD_PERIOD_PRESETS,
  getDashboardPeriodLabelKey,
  getDashboardPeriodRange,
  getDefaultDashboardDateRange,
  type DashboardDateRange,
  type DashboardPeriodPreset,
} from '@/utils/dashboardDateRanges';

export const Route = createFileRoute('/')({
  component: Index,
});

const SalesTrendChart = lazy(() => import('@/components/dashboard/SalesTrendChart'));

type HomeMenuItem = MobileHomeServiceItem & {
  desc: string;
  tour?: string;
};

const PROFIT_LOSS_WIDGET_IDS = new Set<DashboardWidgetId>(['net-income', 'revenue', 'expense']);
const PROFIT_LOSS_WIDGET_ID_LIST = ['net-income', 'revenue', 'expense'] as const;
const MOBILE_DASHBOARD_QUERY = '(max-width: 767.98px)';

const getMeasuredWidth = (node: HTMLElement) => {
  const measuredWidth = node.getBoundingClientRect().width || node.offsetWidth;
  return Math.max(0, Math.floor(measuredWidth));
};

const useStableContainerWidth = (initialWidth = 1200) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [{ width, mounted }, setMeasurement] = useState({
    width: initialWidth,
    mounted: false,
  });

  const measureWidth = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;

    const nextWidth = getMeasuredWidth(node);
    if (nextWidth <= 0) return;

    setMeasurement((current) => {
      if (current.mounted && current.width === nextWidth) return current;
      return { width: nextWidth, mounted: true };
    });
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const scheduleMeasure = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measureWidth();
      });
    };

    measureWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleMeasure);
      observer.observe(node);

      return () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        observer.disconnect();
      };
    }

    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [measureWidth]);

  return { width, containerRef, mounted };
};

const toLayoutItem = (item: LayoutItem): DashboardWidgetLayout | undefined => {
  if (!isDashboardWidgetId(item.i)) return undefined;

  return {
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH,
  };
};

const toDashboardLayouts = (
  layouts: ResponsiveLayouts<DashboardBreakpoint>,
  fallback: DashboardLayouts,
): DashboardLayouts => {
  return DASHBOARD_BREAKPOINT_ORDER.reduce((nextLayouts, breakpoint) => {
    const sourceLayout = layouts[breakpoint] ?? fallback[breakpoint] ?? [];
    nextLayouts[breakpoint] = sourceLayout
      .map(toLayoutItem)
      .filter((item): item is DashboardWidgetLayout => Boolean(item));
    return nextLayouts;
  }, {} as DashboardLayouts);
};

const formatRangeLabel = (startDate: string, endDate: string) => (
  `${dayjs.tz(startDate).format('D MMM YYYY')} s/d ${dayjs.tz(endDate).format('D MMM YYYY')}`
);

const getWidgetLabelKey = (widgetId: DashboardWidgetId) => {
  switch (widgetId) {
    case 'net-income':
      return 'dashboard.widget.netIncome';
    case 'revenue':
      return 'dashboard.widget.revenue';
    case 'expense':
      return 'dashboard.widget.expense';
    case 'cash-out':
      return 'dashboard.widget.cashOut';
    case 'sales-chart':
      return 'dashboard.widget.salesChart';
    case 'top-products':
      return 'dashboard.widget.topProducts';
  }
};

function DashboardWidgetShell({
  title,
  subtitle,
  icon,
  iconStyle,
  isEditing,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  iconStyle?: CSSProperties;
  isEditing: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <section className={`dashboard-widget h-full ${isEditing ? 'dashboard-widget--editing' : ''}`}>
      <div className="dashboard-widget__header dashboard-widget-drag-handle">
        <div className="flex min-w-0 items-center gap-2.5">
          <Tooltip title={isEditing ? t('dashboard.dragHandle') : undefined}>
            <span className="dashboard-widget__icon" style={iconStyle}>
              {icon}
            </span>
          </Tooltip>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-tight text-gray-900 sm:text-sm">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && (
          <div className="dashboard-widget-no-drag shrink-0">
            {action}
          </div>
        )}
      </div>
      <div className="dashboard-widget__body dashboard-widget-no-drag">
        {children}
      </div>
    </section>
  );
}

function MetricWidget({
  title,
  subtitle,
  amount,
  loading,
  isEditing,
  tone,
  action,
}: {
  title: string;
  subtitle: string;
  amount: number;
  loading: boolean;
  isEditing: boolean;
  tone: 'primary' | 'success' | 'error' | 'warning';
  action?: ReactNode;
}) {
  const { token } = antdTheme.useToken();
  const toneToken = {
    primary: {
      border: token.colorPrimaryBorder,
      color: token.colorPrimary,
      iconColor: token.colorPrimaryTextHover,
    },
    success: {
      border: token.colorSuccessBorder,
      color: token.colorSuccess,
      iconColor: token.colorSuccessTextHover,
    },
    error: {
      border: token.colorErrorBorder,
      color: token.colorError,
      iconColor: token.colorErrorTextHover,
    },
    warning: {
      border: token.colorWarningBorder,
      color: token.colorWarning,
      iconColor: token.colorWarningTextHover,
    },
  }[tone];

  return (
    <DashboardWidgetShell
      title={title}
      subtitle={subtitle}
      icon={<DollarOutlined style={{ color: toneToken.iconColor }} />}
      isEditing={isEditing}
      action={action}
      iconStyle={{
        background: token.colorBgContainer,
        borderColor: toneToken.border,
      }}
    >
      {loading ? (
        <Skeleton active paragraph={false} title={{ width: '70%' }} />
      ) : (
        <div className="flex h-full flex-col justify-end">
          <div
            className="break-words text-[24px] font-bold leading-tight sm:text-[28px]"
            style={{ color: toneToken.color }}
          >
            Rp {formatCurrency(amount)}
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function DeferredDashboardWidget({
  widgetId,
  active,
  onVisible,
  children,
}: {
  widgetId: DashboardWidgetId;
  active: boolean;
  onVisible: (widgetId: DashboardWidgetId) => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (active) return undefined;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      onVisible(widgetId);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      onVisible(widgetId);
      observer.disconnect();
    }, { rootMargin: '320px 0px' });
    observer.observe(node);

    return () => observer.disconnect();
  }, [active, onVisible, widgetId]);

  return (
    <div ref={containerRef} className="h-full">
      {children}
    </div>
  );
}

function TopProductsList({
  products,
  loading,
}: {
  products: { product_id: string; product_name: string; totalQuantity: string; totalRevenue: number }[];
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton active paragraph={{ rows: 5 }} title={false} />;
  }

  if (products.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada produk terjual" />;
  }

  return (
    <div className="space-y-2 overflow-y-auto pr-1">
      {products.map((product, index) => (
        <div key={product.product_id} className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-sky-700">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-900">{product.product_name}</div>
            <div className="text-[11px] text-gray-500">{product.totalQuantity}</div>
          </div>
          <div className="shrink-0 text-right text-xs font-semibold text-gray-900">
            Rp {formatCurrency(product.totalRevenue)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardDateAction({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: DashboardDateRange) => void;
}) {
  const { t } = useI18n();
  const [selectedPreset, setSelectedPreset] = useState<DashboardPeriodPreset>('this-month');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const handlePresetChange = (preset: DashboardPeriodPreset) => {
    setSelectedPreset(preset);
    if (preset === 'custom') {
      setIsCustomOpen(true);
      return;
    }

    setIsCustomOpen(false);
    onChange(getDashboardPeriodRange(preset));
  };

  const handleCustomRangeChange = (value: [Dayjs | null, Dayjs | null] | null) => {
    if (!value?.[0] || !value[1]) return;

    onChange(getDashboardPeriodRange('custom', {
      startDate: value[0].format('YYYY-MM-DD'),
      endDate: value[1].format('YYYY-MM-DD'),
    }));
    setIsCustomOpen(false);
  };

  return (
    <Popover
      trigger="click"
      open={selectedPreset === 'custom' && isCustomOpen}
      onOpenChange={(open) => setIsCustomOpen(open)}
      content={(
        <DatePicker.RangePicker
          value={[dayjs.tz(startDate), dayjs.tz(endDate)]}
          onChange={handleCustomRangeChange}
          getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
          allowClear={false}
          format="DD/MM/YYYY"
          className="w-[240px]"
        />
      )}
    >
      <div>
        <Select<DashboardPeriodPreset>
          size="small"
          value={selectedPreset}
          onChange={handlePresetChange}
          options={DASHBOARD_PERIOD_PRESETS.map((preset) => ({
            value: preset,
            label: t(getDashboardPeriodLabelKey(preset)),
          }))}
          className="w-[116px]"
        />
      </div>
    </Popover>
  );
}

function Index() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery(MOBILE_DASHBOARD_QUERY);
  const { currentUser, currentRole, permissionSet, can } = useAuth();
  const { isRouteEnabled } = useEnabledModules({ currentUser, currentRole });
  const mobileHomeDate = dayjs.tz().format('YYYY-MM-DD');
  const canViewMobileSales = can('REPORT_POS_SALES_VIEW') && isRouteEnabled('/report/pos-sales-report');
  const defaultRange = useMemo(() => getDefaultDashboardDateRange(), []);
  const [widgetRanges, setWidgetRanges] = useState<Record<DashboardWidgetId, DashboardDateRange>>(() => (
    DASHBOARD_WIDGET_IDS.reduce((ranges, widgetId) => {
      ranges[widgetId] = { ...defaultRange };
      return ranges;
    }, {} as Record<DashboardWidgetId, DashboardDateRange>)
  ));
  const [hydratedWidgetIds, setHydratedWidgetIds] = useState<Set<DashboardWidgetId>>(() => new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draftPreference, setDraftPreference] = useState<DashboardPreference>();
  const { preference, isLoading, isSaving, isResetting, savePreference, resetPreference } = useDashboardPreference(currentUser?.id);
  const fallbackPreference = currentUser ? getDefaultDashboardPreference(currentUser.id) : undefined;
  const activePreference = (isEditing ? draftPreference : preference) ?? preference ?? fallbackPreference;
  const allowedWidgetIds = useMemo(() => getAllowedDashboardWidgetIds(can), [can]);
  const allowedWidgetSet = useMemo(() => new Set(allowedWidgetIds), [allowedWidgetIds]);
  const visibleWidgetIds = useMemo(() => (
    activePreference?.visible_widget_ids.filter((widgetId) => allowedWidgetSet.has(widgetId)) ?? []
  ), [activePreference?.visible_widget_ids, allowedWidgetSet]);
  const visibleWidgetSet = useMemo(() => new Set(visibleWidgetIds), [visibleWidgetIds]);
  const hasProfitLossWidget = visibleWidgetIds.some((widgetId) => PROFIT_LOSS_WIDGET_IDS.has(widgetId));
  const isCashOutVisible = visibleWidgetSet.has('cash-out');
  const isSalesChartVisible = visibleWidgetSet.has('sales-chart');
  const isTopProductsVisible = visibleWidgetSet.has('top-products');
  const isWidgetHydrated = (widgetId: DashboardWidgetId) => (
    isEditing || hydratedWidgetIds.has(widgetId)
  );
  const profitLossReports = useDashboardProfitLossReports({
    requests: PROFIT_LOSS_WIDGET_ID_LIST.map((id) => ({
      id,
      ...widgetRanges[id],
      enabled: !isMobileViewport && hasProfitLossWidget && visibleWidgetSet.has(id) && isWidgetHydrated(id),
    })),
    refreshKey,
  });
  const cashOutReport = useDashboardCashOutTotal({
    ...widgetRanges['cash-out'],
    enabled: !isMobileViewport && isCashOutVisible && isWidgetHydrated('cash-out') && can('REPORT_CASH_FLOW_VIEW'),
    refreshKey,
  });
  const posSalesReports = useDashboardPosSalesReports({
    requests: [
      {
        id: 'sales-chart' as const,
        ...widgetRanges['sales-chart'],
        enabled: !isMobileViewport && isSalesChartVisible && isWidgetHydrated('sales-chart') && can('REPORT_POS_SALES_VIEW'),
      },
      {
        id: 'top-products' as const,
        ...widgetRanges['top-products'],
        enabled: !isMobileViewport && isTopProductsVisible && isWidgetHydrated('top-products') && can('REPORT_POS_SALES_VIEW'),
      },
    ],
    refreshKey,
    topProductsRequestId: 'top-products',
    topProductsLimit: 5,
  });
  const mobileHomeData = useMobileHomeData({
    date: mobileHomeDate,
    enabled: isMobileViewport && canViewMobileSales,
    refreshKey,
  });
  const { width, containerRef, mounted } = useStableContainerWidth();
  const dashboardLayouts = useMemo(
    () => getDashboardLayoutsForVisibleWidgets(activePreference?.layouts ?? {}, visibleWidgetIds) as ResponsiveLayouts<DashboardBreakpoint>,
    [activePreference?.layouts, visibleWidgetIds],
  );

  const menuItems: HomeMenuItem[] = [
    { to: '/transaction', label: t('home.menu.cashier'), icon: ShoppingCartOutlined, color: 'text-blue-600', desc: t('home.menu.cashierDesc') },
    { to: '/sales', label: t('nav.sales'), icon: FileTextOutlined, color: 'text-indigo-600', desc: t('home.menu.salesDesc') },
    { to: '/purchases', label: t('nav.purchases'), icon: ShoppingOutlined, color: 'text-teal-600', desc: t('home.menu.purchasesDesc') },
    { to: '/master-data', label: t('nav.masterData'), icon: ProductOutlined, color: 'text-green-600', desc: t('home.masterDataDesc') },
    { to: '/finance', label: t('nav.finance'), icon: BankOutlined, color: 'text-red-600', desc: t('home.menu.financeDesc') },
    { to: '/hr', label: t('nav.hr'), icon: TeamOutlined, color: 'text-sky-600', desc: t('home.menu.hrDesc') },
    { to: '/koperasi', label: t('nav.cooperative'), icon: BankOutlined, color: 'text-emerald-600', desc: t('home.cooperativeDesc') },
    { to: '/history', label: t('nav.history'), icon: HistoryOutlined, color: 'text-purple-600', desc: t('home.historyDesc') },
    { to: '/report', label: t('nav.reports'), icon: FileTextOutlined, color: 'text-orange-600', desc: t('home.reportDesc') },
    { to: '/settings', label: t('nav.settings'), icon: SettingOutlined, color: 'text-gray-600', desc: t('home.settingsDesc') },
  ].filter((item) => canAccessPath(currentUser ?? undefined, item.to, { currentRole, permissionSet }) && isRouteEnabled(item.to));

  const handleStartEdit = () => {
    if (!currentUser || !activePreference) return;
    setDraftPreference(normalizeDashboardPreference(activePreference, currentUser.id));
    setIsEditing(true);
  };

  const handleFinishEdit = async () => {
    if (!currentUser || !draftPreference) return;

    try {
      await savePreference(draftPreference);
      setIsEditing(false);
      message.success(t('dashboard.layoutSaved'));
    } catch (error) {
      console.error('Failed to save dashboard layout:', error);
      message.error(error instanceof Error ? error.message : t('dashboard.layoutSaveFailed'));
    }
  };

  const handleResetLayout = async () => {
    if (!currentUser) return;

    try {
      const resetPreferenceResult = await resetPreference();
      setDraftPreference(resetPreferenceResult);
      message.success(t('dashboard.layoutReset'));
    } catch (error) {
      console.error('Failed to reset dashboard layout:', error);
      message.error(error instanceof Error ? error.message : t('dashboard.layoutResetFailed'));
    }
  };

  const handleToggleWidget = (widgetId: DashboardWidgetId, checked: boolean) => {
    if (!currentUser) return;
    const basePreference = draftPreference ?? activePreference ?? getDefaultDashboardPreference(currentUser.id);
    const visibleSetForDraft = new Set(basePreference.visible_widget_ids);

    if (checked) {
      visibleSetForDraft.add(widgetId);
    } else {
      visibleSetForDraft.delete(widgetId);
    }

    setDraftPreference(normalizeDashboardPreference({
      ...basePreference,
      visible_widget_ids: DASHBOARD_WIDGET_IDS.filter((id) => visibleSetForDraft.has(id)),
    }, currentUser.id));
  };

  const handleWidgetVisible = useCallback((widgetId: DashboardWidgetId) => {
    setHydratedWidgetIds((current) => {
      if (current.has(widgetId)) return current;
      const next = new Set(current);
      next.add(widgetId);
      return next;
    });
  }, []);

  const handleWidgetRangeChange = useCallback((
    widgetId: DashboardWidgetId,
    range: DashboardDateRange,
  ) => {
    setWidgetRanges((current) => ({
      ...current,
      [widgetId]: range,
    }));
  }, []);

  const handleLayoutChange = useCallback((
    _layout: Layout,
    layouts: ResponsiveLayouts<DashboardBreakpoint>,
  ) => {
    if (!currentUser || !isEditing) return;

    setDraftPreference((currentPreference) => {
      const basePreference = currentPreference ?? activePreference ?? getDefaultDashboardPreference(currentUser.id);
      return normalizeDashboardPreference({
        ...basePreference,
        layouts: toDashboardLayouts(layouts, basePreference.layouts),
      }, currentUser.id);
    });
  }, [activePreference, currentUser, isEditing]);

  if (isMobileViewport) {
    return (
      <MobileOperationalHome
        canViewHistory={menuItems.some((item) => item.to === '/history')}
        canViewSales={canViewMobileSales}
        currentUserName={currentUser?.name ?? t('root.currentUserFallback')}
        dataState={mobileHomeData}
        onRefresh={() => setRefreshKey((current) => current + 1)}
        services={menuItems}
      />
    );
  }

  const renderWidget = (widgetId: DashboardWidgetId) => {
    const range = widgetRanges[widgetId];
    const periodSubtitle = formatRangeLabel(range.startDate, range.endDate);
    const isHydrated = isWidgetHydrated(widgetId);
    const dateAction = (
      <DashboardDateAction
        startDate={range.startDate}
        endDate={range.endDate}
        onChange={(nextRange) => handleWidgetRangeChange(widgetId, nextRange)}
      />
    );

    if (widgetId === 'net-income') {
      return (
        <MetricWidget
          title={t('dashboard.widget.netIncome')}
          subtitle={periodSubtitle}
          amount={profitLossReports.data?.[widgetId]?.net_income ?? 0}
          loading={!isHydrated || profitLossReports.isLoading}
          isEditing={isEditing}
          tone="primary"
          action={dateAction}
        />
      );
    }

    if (widgetId === 'revenue') {
      return (
        <MetricWidget
          title={t('dashboard.widget.revenue')}
          subtitle={periodSubtitle}
          amount={profitLossReports.data?.[widgetId]?.revenue ?? 0}
          loading={!isHydrated || profitLossReports.isLoading}
          isEditing={isEditing}
          tone="success"
          action={dateAction}
        />
      );
    }

    if (widgetId === 'expense') {
      return (
        <MetricWidget
          title={t('dashboard.widget.expense')}
          subtitle={periodSubtitle}
          amount={profitLossReports.data?.[widgetId]?.expense ?? 0}
          loading={!isHydrated || profitLossReports.isLoading}
          isEditing={isEditing}
          tone="error"
          action={dateAction}
        />
      );
    }

    if (widgetId === 'cash-out') {
      return (
        <MetricWidget
          title={t('dashboard.widget.cashOut')}
          subtitle={periodSubtitle}
          amount={cashOutReport.data ?? 0}
          loading={!isHydrated || cashOutReport.isLoading}
          isEditing={isEditing}
          tone="warning"
          action={dateAction}
        />
      );
    }

    if (widgetId === 'sales-chart') {
      return (
        <DashboardWidgetShell
          title={t('dashboard.widget.salesChart')}
          subtitle={periodSubtitle}
          icon={<BarChartOutlined />}
          isEditing={isEditing}
          action={dateAction}
        >
          {!isHydrated ? (
            <Skeleton active paragraph={{ rows: 3 }} title={false} />
          ) : (
            <Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} title={false} />}>
              <SalesTrendChart
                buckets={posSalesReports.data?.[widgetId]?.dailySalesBuckets ?? []}
                loading={posSalesReports.isLoading}
              />
            </Suspense>
          )}
        </DashboardWidgetShell>
      );
    }

    return (
      <DashboardWidgetShell
        title={t('dashboard.widget.topProducts')}
        subtitle={periodSubtitle}
        icon={<ProductOutlined />}
        isEditing={isEditing}
        action={dateAction}
      >
        <TopProductsList
          products={posSalesReports.data?.[widgetId]?.topProducts ?? []}
          loading={!isHydrated || posSalesReports.isLoading}
        />
      </DashboardWidgetShell>
    );
  };

  const renderMenuGrid = (items: HomeMenuItem[]) => (
    <div className="app-menu-grid">
      {items.map((item) => (
        <Link
          key={`${item.to}${item.hash ?? ''}`}
          to={item.to}
          hash={item.hash}
          data-tour={item.tour}
          className="app-menu-card"
        >
          <div className="app-menu-card__body flex flex-col items-center justify-center">
            <div className="app-menu-card__icon bg-gray-50">
              <item.icon className={`app-menu-card__icon-svg ${item.color}`} />
            </div>

            <h2 className="app-menu-card__title">
              {item.label}
            </h2>

            <p className="app-menu-card__brief mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400 sm:text-[11px] sm:leading-[1.618] lg:hidden">
              {item.desc}
            </p>
          </div>

          <p className="app-menu-card__detail text-center text-[12px] leading-[1.55] text-gray-500">
            {item.desc}
          </p>
        </Link>
      ))}
    </div>
  );

  if (!isMobileViewport && isLoading && !activePreference) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-4 p-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight text-gray-950 sm:text-2xl">
              {t('dashboard.title')}
            </h1>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              {t('dashboard.subtitle')}
            </p>
          </div>
          {!isMobileViewport && (
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setRefreshKey((current) => current + 1)}
              >
                {t('common.refresh')}
              </Button>
              {isEditing ? (
                <>
                  <Button
                    icon={<UndoOutlined />}
                    onClick={handleResetLayout}
                    loading={isResetting}
                  >
                    {t('dashboard.resetLayout')}
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleFinishEdit}
                    loading={isSaving}
                  >
                    {t('dashboard.finishEdit')}
                  </Button>
                </>
              ) : (
                <Button
                  icon={<EditOutlined />}
                  onClick={handleStartEdit}
                  disabled={!activePreference || allowedWidgetIds.length === 0}
                >
                  {t('dashboard.editLayout')}
                </Button>
              )}
            </div>
          )}
        </header>

        {!isMobileViewport && isEditing && (
          <div className="dashboard-edit-panel mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase text-gray-400">
              {t('dashboard.widgetPicker')}
            </div>
            <div className="flex flex-wrap gap-3">
              {allowedWidgetIds.map((widgetId) => (
                <Checkbox
                  key={widgetId}
                  checked={visibleWidgetSet.has(widgetId)}
                  onChange={(event) => handleToggleWidget(widgetId, event.target.checked)}
                >
                  {t(getWidgetLabelKey(widgetId))}
                </Checkbox>
              ))}
            </div>
          </div>
        )}

        {!isMobileViewport && (
          <div ref={containerRef} className={`dashboard-grid-wrap ${isEditing ? 'dashboard-grid-wrap--editing' : ''}`}>
            {allowedWidgetIds.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-white py-12 text-center">
                <Empty description={t('dashboard.noAllowedWidgets')} />
              </div>
            ) : visibleWidgetIds.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-white py-12 text-center">
                <Empty description={t('dashboard.noVisibleWidgets')} />
              </div>
            ) : mounted ? (
              <Responsive
                layouts={dashboardLayouts}
                breakpoints={DASHBOARD_BREAKPOINTS}
                cols={DASHBOARD_COLUMNS}
                width={width}
                rowHeight={61}
                margin={[14, 14]}
                containerPadding={null}
                dragConfig={{
                  enabled: isEditing,
                  handle: '.dashboard-widget-drag-handle',
                  cancel: '.dashboard-widget-no-drag',
                  threshold: 4,
                }}
                resizeConfig={{ enabled: isEditing, handles: ['se'] }}
                onLayoutChange={handleLayoutChange}
              >
                {visibleWidgetIds.map((widgetId) => (
                  <div key={widgetId}>
                    <DeferredDashboardWidget
                      widgetId={widgetId}
                      active={isWidgetHydrated(widgetId)}
                      onVisible={handleWidgetVisible}
                    >
                      {renderWidget(widgetId)}
                    </DeferredDashboardWidget>
                  </div>
                ))}
              </Responsive>
            ) : (
              <Skeleton active paragraph={{ rows: 8 }} />
            )}
          </div>
        )}

        {menuItems.length > 0 && (
          <section className="border-t border-gray-200 pt-6 sm:mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                {t('home.operationalMenu')}
              </h2>
            </div>
            {renderMenuGrid(menuItems)}
          </section>
        )}
      </div>
    </div>
  );
}
