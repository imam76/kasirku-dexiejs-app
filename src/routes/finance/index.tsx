import { BankOutlined, BookOutlined, FileTextOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Empty } from 'antd'
import { canAccessPath } from '@/auth/routePermissions'
import { useAuth } from '@/auth/useAuth'
import { useI18n } from '@/hooks/useI18n'

export const Route = createFileRoute('/finance/')({
  component: Finance,
})

type FinanceMenuItem = {
  to: string
  label: string
  icon: typeof BankOutlined
  color: string
  desc: string
}

function Finance() {
  const { t } = useI18n()
  const { currentUser, currentRole, permissionSet } = useAuth()
  const menuItems: FinanceMenuItem[] = [
    {
      to: '/finance/cash-flow',
      label: t('nav.finance.cashFlow'),
      icon: BankOutlined,
      color: 'text-red-600',
      desc: t('finance.index.cashFlowDesc'),
    },
    {
      to: '/finance/cash-bank-reconciliation',
      label: 'Rekonsiliasi Cash & Bank',
      icon: BankOutlined,
      color: 'text-cyan-700',
      desc: 'Cocokkan saldo kas/bank dengan statement.',
    },
    {
      to: '/finance/receivables',
      label: t('nav.finance.receivables'),
      icon: FileTextOutlined,
      color: 'text-emerald-600',
      desc: t('finance.index.receivablesDesc'),
    },
    {
      to: '/finance/payables',
      label: t('nav.finance.payables'),
      icon: FileTextOutlined,
      color: 'text-orange-700',
      desc: t('finance.index.payablesDesc'),
    },
    {
      to: '/finance/payroll',
      label: t('nav.finance.payroll'),
      icon: TeamOutlined,
      color: 'text-sky-700',
      desc: t('finance.index.payrollDesc'),
    },
    {
      to: '/finance/chart-of-accounts',
      label: t('nav.finance.chartOfAccounts'),
      icon: BookOutlined,
      color: 'text-indigo-600',
      desc: t('finance.index.chartOfAccountsDesc'),
    },
    {
      to: '/finance/opening-balances',
      label: t('nav.finance.openingBalances'),
      icon: FileTextOutlined,
      color: 'text-teal-700',
      desc: t('finance.index.openingBalancesDesc'),
    },
    {
      to: '/finance/general-ledger',
      label: t('nav.finance.generalLedger'),
      icon: BookOutlined,
      color: 'text-violet-600',
      desc: t('finance.index.generalLedgerDesc'),
    },
    {
      to: '/finance/closing',
      label: t('closing.title'),
      icon: LockOutlined,
      color: 'text-rose-700',
      desc: t('closing.subtitle'),
    },
  ].filter((item) => canAccessPath(currentUser ?? undefined, item.to, { currentRole, permissionSet }))

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
            {t('finance.index.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('finance.index.subtitle')}
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
          <Empty description={t('finance.index.empty')} />
        )}
      </div>
    </div>
  )
}
