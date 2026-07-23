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
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts-for-react';
import { App, Button, Checkbox, DatePicker, Empty, Select, Skeleton, Tooltip, theme as antdTheme } from 'antd';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { useDashboardPosSalesReport, useDashboardProfitLossReport } from '@/hooks/useDashboardReports';
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

echarts.use([GridComponent, LineChart, SVGRenderer, TooltipComponent]);

export const Route = createFileRoute('/')({
  component: Index,
});

type HomeMenuItem = {
  to: string;
  hash?: string;
  label: string;
  icon: typeof ShoppingCartOutlined;
  color: string;
  desc: string;
  tour?: string;
};

type DashboardPeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'custom-month';

type DashboardDateRange = {
  startDate: string;
  endDate: string;
};

const PROFIT_LOSS_WIDGET_IDS = new Set<DashboardWidgetId>(['net-income', 'revenue', 'expense']);

const DASHBOARD_PERIOD_PRESETS: DashboardPeriodPreset[] = [
  'this-month',
  'last-month',
  'this-year',
  'last-year',
  'custom-month',
];

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

const getDashboardPeriodRange = (
  preset: DashboardPeriodPreset,
  customMonth: Dayjs = dayjs.tz(),
): DashboardDateRange => {
  const now = dayjs.tz();

  switch (preset) {
    case 'last-month': {
      const lastMonth = now.subtract(1, 'month');
      return {
        startDate: lastMonth.startOf('month').format('YYYY-MM-DD'),
        endDate: lastMonth.endOf('month').format('YYYY-MM-DD'),
      };
    }
    case 'this-year':
      return {
        startDate: now.startOf('year').format('YYYY-MM-DD'),
        endDate: now.endOf('day').format('YYYY-MM-DD'),
      };
    case 'last-year': {
      const lastYear = now.subtract(1, 'year');
      return {
        startDate: lastYear.startOf('year').format('YYYY-MM-DD'),
        endDate: lastYear.endOf('year').format('YYYY-MM-DD'),
      };
    }
    case 'custom-month':
      return {
        startDate: customMonth.startOf('month').format('YYYY-MM-DD'),
        endDate: customMonth.endOf('month').format('YYYY-MM-DD'),
      };
    case 'this-month':
      return {
        startDate: now.startOf('month').format('YYYY-MM-DD'),
        endDate: now.endOf('day').format('YYYY-MM-DD'),
      };
  }
};

const getDefaultMonthRange = () => ({
  startDate: dayjs.tz().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs.tz().endOf('day').format('YYYY-MM-DD'),
});

const formatRangeLabel = (startDate: string, endDate: string) => (
  `${dayjs.tz(startDate).format('D MMM YYYY')} s/d ${dayjs.tz(endDate).format('D MMM YYYY')}`
);

const formatCompactCurrency = (value: number) => {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  }

  if (absoluteValue >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }

  if (absoluteValue >= 1_000) {
    return `${(value / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  }

  return formatCurrency(value);
};

const getDashboardPeriodLabelKey = (preset: DashboardPeriodPreset) => {
  switch (preset) {
    case 'this-month':
      return 'dashboard.period.thisMonth';
    case 'last-month':
      return 'dashboard.period.lastMonth';
    case 'this-year':
      return 'dashboard.period.thisYear';
    case 'last-year':
      return 'dashboard.period.lastYear';
    case 'custom-month':
      return 'dashboard.period.customMonth';
  }
};

const getWidgetLabelKey = (widgetId: DashboardWidgetId) => {
  switch (widgetId) {
    case 'net-income':
      return 'dashboard.widget.netIncome';
    case 'revenue':
      return 'dashboard.widget.revenue';
    case 'expense':
      return 'dashboard.widget.expense';
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
}: {
  title: string;
  subtitle: string;
  amount: number;
  loading: boolean;
  isEditing: boolean;
  tone: 'primary' | 'success' | 'error';
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
  }[tone];

  return (
    <DashboardWidgetShell
      title={title}
      subtitle={subtitle}
      icon={<DollarOutlined style={{ color: toneToken.iconColor }} />}
      isEditing={isEditing}
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

function SalesTrendChart({
  buckets,
  loading,
}: {
  buckets: { date: string; label: string; totalRevenue: number; transactionCount: number }[];
  loading: boolean;
}) {
  const { token } = antdTheme.useToken();
  const hasSales = buckets.some((bucket) => bucket.totalRevenue > 0);
  const chartOption = useMemo<EChartsOption>(() => ({
    animationDuration: 350,
    backgroundColor: 'transparent',
    color: [token.colorPrimary],
    grid: {
      bottom: 26,
      containLabel: true,
      left: 8,
      right: 12,
      top: 18,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: token.colorBgElevated,
      borderColor: token.colorBorderSecondary,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: 12,
      },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: token.colorPrimary,
          opacity: 0.32,
          width: 1,
        },
      },
      formatter: (params: Array<{
        axisValueLabel?: string;
        data?: { transactionCount?: number; value?: number };
        marker?: string;
        name?: string;
      }> | {
        axisValueLabel?: string;
        data?: { transactionCount?: number; value?: number };
        marker?: string;
        name?: string;
      }) => {
        const item = Array.isArray(params) ? params[0] : params;
        const revenue = Number(item.data?.value ?? 0);
        const transactionCount = Number(item.data?.transactionCount ?? 0);
        const label = item.axisValueLabel ?? item.name ?? '';

        return [
          `<div style="font-weight:600;margin-bottom:4px;">${label}</div>`,
          `<div>${item.marker ?? ''}Rp ${formatCurrency(revenue)}</div>`,
          `<div style="color:${token.colorTextSecondary};font-size:12px;margin-top:2px;">${transactionCount} transaksi</div>`,
        ].join('');
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: buckets.map((bucket) => bucket.label),
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: token.colorBorderSecondary,
        },
      },
      axisLabel: {
        color: token.colorTextTertiary,
        fontFamily: token.fontFamily,
        fontSize: 10,
        hideOverlap: true,
        margin: 10,
        showMaxLabel: true,
        showMinLabel: true,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 3,
      axisLabel: {
        color: token.colorTextTertiary,
        fontFamily: token.fontFamily,
        fontSize: 10,
        formatter: (value: number) => `Rp ${formatCompactCurrency(value)}`,
      },
      splitLine: {
        lineStyle: {
          color: token.colorBorderSecondary,
          opacity: 0.9,
        },
      },
    },
    series: [
      {
        name: 'Penjualan',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: token.colorPrimary,
          width: 3,
        },
        itemStyle: {
          borderColor: token.colorBgContainer,
          borderWidth: 2,
          color: token.colorPrimary,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: token.colorPrimary },
              { offset: 1, color: token.colorBgContainer },
            ],
          },
          opacity: 0.18,
        },
        emphasis: {
          focus: 'series',
        },
        data: buckets.map((bucket) => ({
          transactionCount: bucket.transactionCount,
          value: bucket.totalRevenue,
        })),
      },
    ],
  }), [
    buckets,
    token.colorBgContainer,
    token.colorBgElevated,
    token.colorBorderSecondary,
    token.colorPrimary,
    token.colorText,
    token.colorTextSecondary,
    token.colorTextTertiary,
    token.fontFamily,
  ]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  }

  return (
    <div className="flex h-full min-h-[180px] items-stretch">
      {!hasSales ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada penjualan" />
        </div>
      ) : (
        <ReactEChartsCore
          echarts={echarts}
          option={chartOption}
          className="min-h-[180px] flex-1"
          style={{ height: '100%', minHeight: 180, width: '100%' }}
          notMerge
          lazyUpdate
          opts={{ renderer: 'svg' }}
        />
      )}
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
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: DashboardDateRange) => void;
}) {
  const { t } = useI18n();
  const [selectedPreset, setSelectedPreset] = useState<DashboardPeriodPreset>('this-month');
  const [customMonth, setCustomMonth] = useState(() => dayjs.tz(startDate).startOf('month'));

  const handlePresetChange = (preset: DashboardPeriodPreset) => {
    setSelectedPreset(preset);
    onChange(getDashboardPeriodRange(preset, customMonth));
  };

  const handleCustomMonthChange = (value: Dayjs | null) => {
    const nextMonth = value?.startOf('month') ?? dayjs.tz().startOf('month');
    setCustomMonth(nextMonth);
    setSelectedPreset('custom-month');
    onChange(getDashboardPeriodRange('custom-month', nextMonth));
  };

  return (
    <div className="flex max-w-[292px] flex-wrap items-center justify-end gap-1.5">
      <Select<DashboardPeriodPreset>
        size="small"
        value={selectedPreset}
        onChange={handlePresetChange}
        options={DASHBOARD_PERIOD_PRESETS.map((preset) => ({
          value: preset,
          label: t(getDashboardPeriodLabelKey(preset)),
        }))}
        className="w-[138px]"
      />
      {selectedPreset === 'custom-month' && (
        <DatePicker
          size="small"
          picker="month"
          value={customMonth}
          onChange={handleCustomMonthChange}
          format="MMMM YYYY"
          allowClear={false}
          className="w-[146px]"
        />
      )}
    </div>
  );
}

function Index() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet, can } = useAuth();
  const { isRouteEnabled } = useEnabledModules({ currentUser, currentRole });
  const defaultRange = useMemo(() => getDefaultMonthRange(), []);
  const [profitRange] = useState(defaultRange);
  const [salesChartRange, setSalesChartRange] = useState(defaultRange);
  const [topProductsRange, setTopProductsRange] = useState(defaultRange);
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
  const canViewProfitLoss = allowedWidgetIds.some((widgetId) => PROFIT_LOSS_WIDGET_IDS.has(widgetId));
  const isSalesChartVisible = visibleWidgetSet.has('sales-chart');
  const isTopProductsVisible = visibleWidgetSet.has('top-products');
  const profitLossReport = useDashboardProfitLossReport({
    startDate: profitRange.startDate,
    endDate: profitRange.endDate,
    enabled: hasProfitLossWidget && canViewProfitLoss,
    refreshKey,
  });
  const salesChartReport = useDashboardPosSalesReport({
    startDate: salesChartRange.startDate,
    endDate: salesChartRange.endDate,
    enabled: isSalesChartVisible && can('REPORT_POS_SALES_VIEW'),
    refreshKey,
  });
  const topProductsReport = useDashboardPosSalesReport({
    startDate: topProductsRange.startDate,
    endDate: topProductsRange.endDate,
    enabled: isTopProductsVisible && can('REPORT_POS_SALES_VIEW'),
    refreshKey,
    topProductsLimit: 5,
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
    { to: '/profit', label: t('nav.report.profit'), icon: DollarOutlined, color: 'text-emerald-600', desc: t('home.profitDesc') },
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

  const renderWidget = (widgetId: DashboardWidgetId) => {
    const periodSubtitle = formatRangeLabel(profitRange.startDate, profitRange.endDate);

    if (widgetId === 'net-income') {
      return (
        <MetricWidget
          title={t('dashboard.widget.netIncome')}
          subtitle={periodSubtitle}
          amount={profitLossReport.data?.net_income ?? 0}
          loading={profitLossReport.isLoading}
          isEditing={isEditing}
          tone="primary"
        />
      );
    }

    if (widgetId === 'revenue') {
      return (
        <MetricWidget
          title={t('dashboard.widget.revenue')}
          subtitle={periodSubtitle}
          amount={profitLossReport.data?.revenue ?? 0}
          loading={profitLossReport.isLoading}
          isEditing={isEditing}
          tone="success"
        />
      );
    }

    if (widgetId === 'expense') {
      return (
        <MetricWidget
          title={t('dashboard.widget.expense')}
          subtitle={periodSubtitle}
          amount={profitLossReport.data?.expense ?? 0}
          loading={profitLossReport.isLoading}
          isEditing={isEditing}
          tone="error"
        />
      );
    }

    if (widgetId === 'sales-chart') {
      return (
        <DashboardWidgetShell
          title={t('dashboard.widget.salesChart')}
          subtitle={formatRangeLabel(salesChartRange.startDate, salesChartRange.endDate)}
          icon={<BarChartOutlined />}
          isEditing={isEditing}
          action={(
            <DashboardDateAction
              startDate={salesChartRange.startDate}
              endDate={salesChartRange.endDate}
              onChange={setSalesChartRange}
            />
          )}
        >
          <SalesTrendChart
            buckets={salesChartReport.data?.dailySalesBuckets ?? []}
            loading={salesChartReport.isLoading}
          />
        </DashboardWidgetShell>
      );
    }

    return (
      <DashboardWidgetShell
        title={t('dashboard.widget.topProducts')}
        subtitle={formatRangeLabel(topProductsRange.startDate, topProductsRange.endDate)}
        icon={<ProductOutlined />}
        isEditing={isEditing}
        action={(
          <DashboardDateAction
            startDate={topProductsRange.startDate}
            endDate={topProductsRange.endDate}
            onChange={setTopProductsRange}
          />
        )}
      >
        <TopProductsList
          products={topProductsReport.data?.topProducts ?? []}
          loading={topProductsReport.isLoading}
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

  if (isLoading && !activePreference) {
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
        </header>

        {isEditing && (
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
                  {renderWidget(widgetId)}
                </div>
              ))}
            </Responsive>
          ) : (
            <Skeleton active paragraph={{ rows: 8 }} />
          )}
        </div>

        {menuItems.length > 0 && (
          <section className="mt-8 border-t border-gray-200 pt-6">
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
