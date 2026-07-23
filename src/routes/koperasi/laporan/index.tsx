import {
  BankOutlined,
  BookOutlined,
  DownOutlined,
  FileTextOutlined,
  RightOutlined,
  TeamOutlined,
  UpOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Empty } from 'antd';
import { useState, type ComponentType } from 'react';
import { canAccessPath } from '@/auth/routePermissions';
import { useAuth } from '@/auth/useAuth';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { useI18n } from '@/hooks/useI18n';

export const Route = createFileRoute('/koperasi/laporan/')({
  component: CooperativeReportIndex,
});

type ReportMenuItem = {
  id: string;
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  iconBackground: string;
};

type ReportMenuGroup = {
  id: string;
  label: string;
  items: ReportMenuItem[];
};

const DEFAULT_EXPANDED_GROUPS = [
  'summary-finance',
  'savings',
  'loans-installments',
  'field-operations',
  'membership',
];

const REPORT_COLUMNS = [
  { id: 'operations', groupIds: ['field-operations'] },
  { id: 'savings', groupIds: ['savings'] },
  { id: 'loans', groupIds: ['loans-installments'] },
  { id: 'overview', groupIds: ['summary-finance', 'membership'] },
];

function CooperativeReportIndex() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const { isRouteEnabled } = useEnabledModules({ currentUser, currentRole });
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(DEFAULT_EXPANDED_GROUPS));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const reportGroups: ReportMenuGroup[] = [
    {
      id: 'summary-finance',
      label: t('cooperative.reportIndex.categories.summaryFinance'),
      items: [
        {
          id: 'summary',
          to: '/koperasi/laporan/ringkasan',
          label: t('nav.cooperative.reportsOverview'),
          description: t('cooperative.index.reportsDesc'),
          icon: FileTextOutlined,
          color: 'text-amber-700',
          iconBackground: 'bg-amber-50',
        },
        {
          id: 'cash-flow',
          to: '/koperasi/laporan/arus-kas',
          label: t('cooperative.reports.tabs.cashFlowStatement'),
          description: t('cooperative.index.cashFlowDesc'),
          icon: BankOutlined,
          color: 'text-teal-700',
          iconBackground: 'bg-teal-50',
        },
      ],
    },
    {
      id: 'savings',
      label: t('cooperative.reportIndex.categories.savings'),
      items: [
        {
          id: 'voluntary-savings',
          to: '/koperasi/laporan/simpanan-sukarela',
          label: t('nav.cooperative.voluntarySavingsReport'),
          description: t('cooperative.index.voluntarySavingsReportDesc'),
          icon: WalletOutlined,
          color: 'text-emerald-700',
          iconBackground: 'bg-emerald-50',
        },
        {
          id: 'savings-in',
          to: '/koperasi/laporan/tabungan-masuk',
          label: t('nav.cooperative.savingInReport'),
          description: t('cooperative.index.savingInReportDesc'),
          icon: WalletOutlined,
          color: 'text-green-700',
          iconBackground: 'bg-green-50',
        },
        {
          id: 'savings-out',
          to: '/koperasi/laporan/tabungan-keluar',
          label: t('nav.cooperative.savingOutReport'),
          description: t('cooperative.index.savingOutReportDesc'),
          icon: WalletOutlined,
          color: 'text-red-700',
          iconBackground: 'bg-red-50',
        },
      ],
    },
    {
      id: 'loans-installments',
      label: t('cooperative.reportIndex.categories.loansInstallments'),
      items: [
        {
          id: 'installment-book',
          to: '/koperasi/laporan/buku-angsuran',
          label: t('nav.cooperative.installmentBook'),
          description: t('cooperative.index.installmentBookDesc'),
          icon: BookOutlined,
          color: 'text-rose-700',
          iconBackground: 'bg-rose-50',
        },
        {
          id: 'iptw',
          to: '/koperasi/laporan/iptw',
          label: t('nav.cooperative.iptwReport'),
          description: t('cooperative.index.iptwReportDesc'),
          icon: FileTextOutlined,
          color: 'text-emerald-700',
          iconBackground: 'bg-emerald-50',
        },
      ],
    },
    {
      id: 'field-operations',
      label: t('cooperative.reportIndex.categories.fieldOperations'),
      items: [
        {
          id: 'cash',
          to: '/koperasi/laporan/tunai',
          label: t('nav.cooperative.cashReport'),
          description: t('cooperative.index.cashReportDesc'),
          icon: BankOutlined,
          color: 'text-emerald-700',
          iconBackground: 'bg-emerald-50',
        },
        {
          id: 'daily-target',
          to: '/koperasi/laporan/target-harian',
          label: t('nav.cooperative.dailyTarget'),
          description: t('cooperative.index.dailyTargetDesc'),
          icon: FileTextOutlined,
          color: 'text-slate-700',
          iconBackground: 'bg-slate-100',
        },
        {
          id: 'daily-field-cash',
          to: '/koperasi/laporan/kas-harian-pdl',
          label: t('cooperative.reportIndex.items.dailyFieldCash'),
          description: t('cooperative.reports.dailyFieldCash.subtitle'),
          icon: FileTextOutlined,
          color: 'text-blue-700',
          iconBackground: 'bg-blue-50',
        },
        {
          id: 'daily-storting',
          to: '/koperasi/laporan/storting-harian',
          label: t('nav.cooperative.dailyStorting'),
          description: t('cooperative.index.dailyStortingDesc'),
          icon: FileTextOutlined,
          color: 'text-green-700',
          iconBackground: 'bg-green-50',
        },
        {
          id: 'daily-drop',
          to: '/koperasi/laporan/drop-harian',
          label: t('nav.cooperative.dailyDrop'),
          description: t('cooperative.index.dailyDropDesc'),
          icon: FileTextOutlined,
          color: 'text-orange-700',
          iconBackground: 'bg-orange-50',
        },
        {
          id: 'weekly-drop',
          to: '/koperasi/laporan/drop-mingguan',
          label: t('nav.cooperative.weeklyDrop'),
          description: t('cooperative.index.weeklyDropDesc'),
          icon: FileTextOutlined,
          color: 'text-fuchsia-700',
          iconBackground: 'bg-fuchsia-50',
        },
        {
          id: 'resort-development',
          to: '/koperasi/laporan/perkembangan-resort',
          label: t('nav.cooperative.resortDevelopment'),
          description: t('cooperative.index.resortDevelopmentDesc'),
          icon: FileTextOutlined,
          color: 'text-cyan-700',
          iconBackground: 'bg-cyan-50',
        },
      ],
    },
    {
      id: 'membership',
      label: t('cooperative.reportIndex.categories.membership'),
      items: [
        {
          id: 'member-register',
          to: '/koperasi/laporan/induk-anggota',
          label: t('nav.cooperative.memberRegister'),
          description: t('cooperative.memberRegister.subtitle'),
          icon: TeamOutlined,
          color: 'text-indigo-700',
          iconBackground: 'bg-indigo-50',
        },
      ],
    },
  ];

  const visibleGroups = reportGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        canAccessPath(currentUser ?? undefined, item.to, { currentRole, permissionSet }) &&
        isRouteEnabled(item.to)
      )),
    }))
    .filter((group) => group.items.length > 0);
  const visibleGroupById = new Map(visibleGroups.map((group) => [group.id, group]));
  const visibleColumns = REPORT_COLUMNS
    .map((column) => ({
      ...column,
      groups: column.groupIds
        .map((groupId) => visibleGroupById.get(groupId))
        .filter((group): group is ReportMenuGroup => Boolean(group)),
    }))
    .filter((column) => column.groups.length > 0);

  return (
    <div className="px-0 py-4 sm:px-1 sm:py-5 lg:px-2 lg:py-6">
      <div className="w-full max-w-none">
        <div className="mb-6 text-center sm:mb-7 lg:mb-8">
          <h1 className="mb-2 text-[20px] font-medium leading-[1.3] tracking-tight text-gray-900 sm:mb-[10px] sm:text-[26px] lg:mb-[14px] lg:text-[34px] lg:leading-[1.2]">
            {t('cooperative.reportIndex.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[520px] sm:px-0 sm:text-sm lg:max-w-[640px] lg:text-base lg:font-light">
            {t('cooperative.reportIndex.subtitle')}
          </p>
        </div>

        {visibleColumns.length > 0 ? (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleColumns.map((column) => (
              <div
                key={column.id}
                data-testid={`cooperative-report-column-${column.id}`}
                className="flex min-w-0 flex-col gap-3"
              >
                {column.groups.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  const contentId = `cooperative-report-content-${group.id}`;
                  const toggleLabel = t(isExpanded
                    ? 'cooperative.reportIndex.showLess'
                    : 'cooperative.reportIndex.showMore');

                  return (
                    <section
                      key={group.id}
                      data-testid={`cooperative-report-category-${group.id}`}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <h2 className="bg-gray-50/80 text-sm font-semibold text-gray-800">
                        <button
                          type="button"
                          data-testid={`cooperative-report-toggle-${group.id}`}
                          aria-controls={contentId}
                          aria-expanded={isExpanded}
                          aria-label={`${group.label}: ${toggleLabel}`}
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                        >
                          <span className="min-w-0 leading-5">{group.label}</span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-gray-500">
                            {t('cooperative.reportIndex.reportCount', { count: group.items.length })}
                            {isExpanded ? <UpOutlined aria-hidden /> : <DownOutlined aria-hidden />}
                          </span>
                        </button>
                      </h2>
                      {isExpanded && (
                        <div id={contentId} className="divide-y divide-gray-100 border-t border-gray-100">
                          {group.items.map((item) => (
                            <Link
                              key={item.id}
                              to={item.to}
                              data-testid={`cooperative-report-link-${item.id}`}
                              className="group flex items-center gap-2.5 px-3 py-3 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.iconBackground}`}>
                                <item.icon className={`text-base ${item.color}`} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium leading-5 text-gray-900">
                                  {item.label}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-gray-500">
                                  {item.description}
                                </span>
                              </span>
                              <RightOutlined className="shrink-0 text-[10px] text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <Empty description={t('cooperative.reportIndex.empty')} />
        )}
      </div>
    </div>
  );
}
