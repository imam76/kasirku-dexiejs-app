import { BankOutlined, BellOutlined, CreditCardOutlined, DatabaseOutlined, FileTextOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
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
      to: '/koperasi/migrasi-simpanan',
      label: t('nav.cooperative.savingMigration'),
      icon: DatabaseOutlined,
      color: 'text-sky-700',
      desc: t('cooperative.index.savingMigrationDesc'),
    },
    {
      to: '/koperasi/pinjaman',
      label: t('nav.cooperative.loans'),
      icon: BankOutlined,
      color: 'text-violet-600',
      desc: t('cooperative.index.loansDesc'),
    },
    {
      to: '/koperasi/migrasi-pinjaman',
      label: t('nav.cooperative.loanMigration'),
      icon: DatabaseOutlined,
      color: 'text-indigo-700',
      desc: t('cooperative.index.loanMigrationDesc'),
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
          <div className="app-menu-grid">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
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
        ) : (
          <Empty description={t('cooperative.index.empty')} />
        )}
      </div>
    </div>
  );
}
