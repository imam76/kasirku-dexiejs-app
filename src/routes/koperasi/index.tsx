import { BankOutlined, BellOutlined, BookOutlined, CreditCardOutlined, FileTextOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Empty } from 'antd';
import { canAccessPath } from '@/auth/routePermissions';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/hooks/useI18n';

export const Route = createFileRoute('/koperasi/')({
  component: Cooperative,
});

type CooperativeMenuItem = {
  to: string;
  label: string;
  icon: typeof TeamOutlined;
  color: string;
  desc: string;
};

function Cooperative() {
  const { t } = useI18n();
  const { currentUser, currentRole, permissionSet } = useAuth();
  const menuItems: CooperativeMenuItem[] = [
    {
      to: '/koperasi/anggota',
      label: t('nav.cooperative.members'),
      icon: TeamOutlined,
      color: 'text-emerald-600',
      desc: t('cooperative.index.membersDesc'),
    },
    {
      to: '/koperasi/simpanan',
      label: t('nav.cooperative.savings'),
      icon: WalletOutlined,
      color: 'text-blue-600',
      desc: t('cooperative.index.savingsDesc'),
    },
    {
      to: '/koperasi/pinjaman',
      label: t('nav.cooperative.loans'),
      icon: BankOutlined,
      color: 'text-violet-600',
      desc: t('cooperative.index.loansDesc'),
    },
    {
      to: '/koperasi/angsuran',
      label: t('nav.cooperative.installments'),
      icon: CreditCardOutlined,
      color: 'text-cyan-700',
      desc: t('cooperative.index.installmentsDesc'),
    },
    {
      to: '/koperasi/penagihan',
      label: t('cooperative.billing.title'),
      icon: BellOutlined,
      color: 'text-rose-600',
      desc: t('cooperative.billing.subtitle'),
    },
    {
      to: '/koperasi/kas-petugas',
      label: t('nav.cooperative.fieldCash'),
      icon: WalletOutlined,
      color: 'text-lime-700',
      desc: t('cooperative.index.fieldCashDesc'),
    },
    {
      to: '/koperasi/laporan',
      label: t('nav.cooperative.reports'),
      icon: FileTextOutlined,
      color: 'text-amber-700',
      desc: t('cooperative.index.reportsDesc'),
    },
    {
      to: '/koperasi/laporan-tunai',
      label: t('nav.cooperative.cashReport'),
      icon: BankOutlined,
      color: 'text-emerald-700',
      desc: t('cooperative.index.cashReportDesc'),
    },
    {
      to: '/koperasi/laporan-target-harian',
      label: t('nav.cooperative.dailyTarget'),
      icon: FileTextOutlined,
      color: 'text-slate-700',
      desc: t('cooperative.index.dailyTargetDesc'),
    },
    {
      to: '/koperasi/laporan-storting-harian',
      label: t('nav.cooperative.dailyStorting'),
      icon: FileTextOutlined,
      color: 'text-green-700',
      desc: t('cooperative.index.dailyStortingDesc'),
    },
    {
      to: '/koperasi/laporan-drop-harian',
      label: t('nav.cooperative.dailyDrop'),
      icon: FileTextOutlined,
      color: 'text-orange-700',
      desc: t('cooperative.index.dailyDropDesc'),
    },
    {
      to: '/koperasi/laporan-drop-mingguan',
      label: t('nav.cooperative.weeklyDrop'),
      icon: FileTextOutlined,
      color: 'text-fuchsia-700',
      desc: t('cooperative.index.weeklyDropDesc'),
    },
    {
      to: '/koperasi/laporan-iptw',
      label: t('nav.cooperative.iptwReport'),
      icon: FileTextOutlined,
      color: 'text-emerald-700',
      desc: t('cooperative.index.iptwReportDesc'),
    },
    {
      to: '/koperasi/buku-angsuran',
      label: t('nav.cooperative.installmentBook'),
      icon: BookOutlined,
      color: 'text-rose-700',
      desc: t('cooperative.index.installmentBookDesc'),
    },
    {
      to: '/koperasi/laporan-induk-anggota',
      label: t('nav.cooperative.memberRegister'),
      icon: FileTextOutlined,
      color: 'text-indigo-700',
      desc: t('cooperative.memberRegister.subtitle'),
    },
    {
      to: '/koperasi/arus-kas',
      label: t('cooperative.reports.tabs.cashFlowStatement'),
      icon: BankOutlined,
      color: 'text-teal-700',
      desc: t('cooperative.index.cashFlowDesc'),
    },
    {
      to: '/koperasi/buku-besar',
      label: t('nav.cooperative.ledger'),
      icon: BookOutlined,
      color: 'text-slate-700',
      desc: t('cooperative.index.ledgerDesc'),
    },
  ].filter((item) => canAccessPath(currentUser ?? undefined, item.to, { currentRole, permissionSet }));

  return (
    <div
      className="
        py-4 px-3
        sm:py-6 sm:px-5
        lg:py-[38px] lg:px-8
      "
    >
      <div className="max-w-[974px] mx-auto">
        <div className="mb-7 text-center sm:mb-9 lg:mb-12">
          <h1 className="mb-2 text-[20px] font-medium leading-[1.3] tracking-tight text-gray-900 sm:text-[26px] sm:mb-[10px] lg:text-[34px] lg:leading-[1.2] lg:mb-[14px]">
            {t('cooperative.index.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('cooperative.index.subtitle')}
          </p>
        </div>

        {menuItems.length > 0 ? (
          <div className="grid grid-cols-3 gap-[10px] sm:grid-cols-3 sm:gap-[14px] lg:flex lg:flex-wrap lg:justify-center lg:gap-[22px]">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="
                  app-menu-card flex flex-col items-center justify-center
                  bg-white border border-gray-100 rounded-[10px]
                  transition-all duration-200 ease-out
                  aspect-square p-2
                  sm:aspect-auto sm:rounded-[12px] sm:p-[18px]
                  lg:aspect-auto lg:w-[192px] lg:h-[192px] lg:rounded-[14px] lg:p-[24px]
                  hover:border-gray-200
                  hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)]
                  hover:-translate-y-[1px]
                "
              >
                <div className="app-menu-card__body flex flex-col items-center justify-center">
                  <div className="mb-[6px] sm:mb-[10px] lg:mb-[12px]">
                    <item.icon className={`${item.color} text-[24px] sm:text-[30px] lg:text-[34px]`} />
                  </div>

                  <h2 className="text-center text-[12px] font-medium leading-[1.3] text-gray-800 sm:mb-[6px] sm:text-[14px] lg:mb-[6px] lg:text-[15px]">
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
        ) : (
          <Empty description={t('cooperative.index.empty')} />
        )}
      </div>
    </div>
  );
}
