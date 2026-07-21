import type {
  DashboardBreakpoint,
  DashboardLayouts,
  DashboardPreference,
  DashboardWidgetId,
  DashboardWidgetLayout,
  Permission,
} from '@/types';

export const DASHBOARD_WIDGET_IDS: DashboardWidgetId[] = [
  'net-income',
  'revenue',
  'expense',
  'sales-chart',
  'top-products',
];

export const DASHBOARD_WIDGET_PERMISSION: Record<DashboardWidgetId, Permission> = {
  'net-income': 'REPORT_PROFIT_LOSS_VIEW',
  revenue: 'REPORT_PROFIT_LOSS_VIEW',
  expense: 'REPORT_PROFIT_LOSS_VIEW',
  'sales-chart': 'REPORT_POS_SALES_VIEW',
  'top-products': 'REPORT_POS_SALES_VIEW',
};

export const DASHBOARD_BREAKPOINTS: Record<DashboardBreakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0,
};

export const DASHBOARD_COLUMNS: Record<DashboardBreakpoint, number> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2,
};

export const DASHBOARD_BREAKPOINT_ORDER: DashboardBreakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];

const DEFAULT_DASHBOARD_MAX_H = 12;

export const DEFAULT_DASHBOARD_LAYOUTS: Required<DashboardLayouts> = {
  lg: [
    { i: 'net-income', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'revenue', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'expense', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'sales-chart', x: 0, y: 2, w: 8, h: 5, minW: 4, minH: 3 },
    { i: 'top-products', x: 8, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
  ],
  md: [
    { i: 'net-income', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'revenue', x: 4, y: 0, w: 3, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'expense', x: 7, y: 0, w: 3, h: 2, minW: 3, minH: 2, maxH: 2 },
    { i: 'sales-chart', x: 0, y: 2, w: 6, h: 5, minW: 4, minH: 3 },
    { i: 'top-products', x: 6, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
  ],
  sm: [
    { i: 'net-income', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'revenue', x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'expense', x: 4, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'sales-chart', x: 0, y: 2, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'top-products', x: 0, y: 7, w: 6, h: 5, minW: 3, minH: 3 },
  ],
  xs: [
    { i: 'net-income', x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'revenue', x: 0, y: 2, w: 4, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'expense', x: 0, y: 4, w: 4, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'sales-chart', x: 0, y: 6, w: 4, h: 5, minW: 2, minH: 3 },
    { i: 'top-products', x: 0, y: 11, w: 4, h: 5, minW: 2, minH: 3 },
  ],
  xxs: [
    { i: 'net-income', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'revenue', x: 0, y: 2, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'expense', x: 0, y: 4, w: 2, h: 2, minW: 2, minH: 2, maxH: 2 },
    { i: 'sales-chart', x: 0, y: 6, w: 2, h: 5, minW: 2, minH: 3 },
    { i: 'top-products', x: 0, y: 11, w: 2, h: 5, minW: 2, minH: 3 },
  ],
};

const widgetIdSet = new Set(DASHBOARD_WIDGET_IDS);

export const isDashboardWidgetId = (value: unknown): value is DashboardWidgetId => (
  typeof value === 'string' && widgetIdSet.has(value as DashboardWidgetId)
);

const cloneLayoutItem = (item: DashboardWidgetLayout): DashboardWidgetLayout => ({ ...item });

const normalizeNumber = (value: unknown, fallback: number, min = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.round(number)) : fallback;
};

const normalizeOptionalNumber = (
  value: unknown,
  fallback: number | undefined,
  min = 1,
) => {
  const candidates = [value, fallback];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const number = Number(candidate);
    if (Number.isFinite(number)) return Math.max(min, Math.round(number));
  }
  return undefined;
};

const clampNumber = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const normalizeLayoutItem = (
  item: Partial<DashboardWidgetLayout> | undefined,
  fallback: DashboardWidgetLayout,
  columns: number,
): DashboardWidgetLayout => {
  const minW = Math.min(columns, normalizeNumber(item?.minW, fallback.minW ?? 1, 1));
  const maxW = normalizeOptionalNumber(item?.maxW, fallback.maxW, minW);
  const boundedMaxW = maxW === undefined ? columns : Math.min(columns, Math.max(minW, maxW));
  const w = clampNumber(normalizeNumber(item?.w, fallback.w, minW), minW, boundedMaxW);
  const minH = normalizeNumber(item?.minH, fallback.minH ?? 1, 1);
  const maxH = normalizeOptionalNumber(item?.maxH, fallback.maxH ?? DEFAULT_DASHBOARD_MAX_H, minH);
  const boundedMaxH = Math.max(minH, maxH ?? DEFAULT_DASHBOARD_MAX_H);
  const h = Math.min(boundedMaxH, normalizeNumber(item?.h, fallback.h, minH));
  const maxX = Math.max(0, columns - w);

  return {
    i: fallback.i,
    x: Math.min(maxX, normalizeNumber(item?.x, fallback.x)),
    y: normalizeNumber(item?.y, fallback.y),
    w,
    h,
    minW,
    minH,
    maxW: boundedMaxW,
    maxH: boundedMaxH,
  };
};

export const normalizeDashboardLayouts = (layouts?: DashboardLayouts): Required<DashboardLayouts> => {
  return DASHBOARD_BREAKPOINT_ORDER.reduce((normalized, breakpoint) => {
    const storedById = new Map(
      (layouts?.[breakpoint] ?? [])
        .filter((item) => isDashboardWidgetId(item.i))
        .map((item) => [item.i, item]),
    );

    normalized[breakpoint] = DEFAULT_DASHBOARD_LAYOUTS[breakpoint].map((fallback) => (
      normalizeLayoutItem(storedById.get(fallback.i), fallback, DASHBOARD_COLUMNS[breakpoint])
    ));

    return normalized;
  }, {} as Required<DashboardLayouts>);
};

export const getDefaultDashboardPreference = (userId: string, now = new Date().toISOString()): DashboardPreference => ({
  id: `dashboard:${userId}`,
  user_id: userId,
  visible_widget_ids: [...DASHBOARD_WIDGET_IDS],
  layouts: normalizeDashboardLayouts(DEFAULT_DASHBOARD_LAYOUTS),
  created_at: now,
  updated_at: now,
});

export const normalizeDashboardPreference = (
  preference: DashboardPreference | undefined,
  userId: string,
  now = new Date().toISOString(),
): DashboardPreference => {
  const defaultPreference = getDefaultDashboardPreference(userId, now);
  if (!preference) return defaultPreference;

  const hasVisibleIds = Array.isArray(preference.visible_widget_ids);
  const visibleWidgetIds = hasVisibleIds
    ? preference.visible_widget_ids.filter(isDashboardWidgetId)
    : defaultPreference.visible_widget_ids;

  return {
    ...defaultPreference,
    ...preference,
    id: defaultPreference.id,
    user_id: userId,
    visible_widget_ids: visibleWidgetIds,
    layouts: normalizeDashboardLayouts(preference.layouts),
    created_at: preference.created_at || defaultPreference.created_at,
    updated_at: preference.updated_at || defaultPreference.updated_at,
  };
};

export const getDashboardLayoutsForVisibleWidgets = (
  layouts: DashboardLayouts,
  visibleWidgetIds: DashboardWidgetId[],
): Required<DashboardLayouts> => {
  const visibleSet = new Set(visibleWidgetIds);
  const normalizedLayouts = normalizeDashboardLayouts(layouts);

  return DASHBOARD_BREAKPOINT_ORDER.reduce((visibleLayouts, breakpoint) => {
    visibleLayouts[breakpoint] = normalizedLayouts[breakpoint]
      .filter((item) => visibleSet.has(item.i))
      .map(cloneLayoutItem);
    return visibleLayouts;
  }, {} as Required<DashboardLayouts>);
};

export const getAllowedDashboardWidgetIds = (
  canAccessPermission: (permission: Permission) => boolean,
): DashboardWidgetId[] => (
  DASHBOARD_WIDGET_IDS.filter((widgetId) => canAccessPermission(DASHBOARD_WIDGET_PERMISSION[widgetId]))
);
