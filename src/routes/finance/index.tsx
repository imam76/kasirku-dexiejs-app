import { BankOutlined, BookOutlined, FileTextOutlined } from '@ant-design/icons'
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
  const { currentUser } = useAuth()
  const menuItems: FinanceMenuItem[] = [
    {
      to: '/finance/cash-flow',
      label: t('nav.finance.cashFlow'),
      icon: BankOutlined,
      color: 'text-red-600',
      desc: t('finance.index.cashFlowDesc'),
    },
    {
      to: '/finance/chart-of-accounts',
      label: t('nav.finance.chartOfAccounts'),
      icon: BookOutlined,
      color: 'text-indigo-600',
      desc: t('finance.index.chartOfAccountsDesc'),
    },
    {
      to: '/finance/general-ledger',
      label: t('nav.finance.generalLedger'),
      icon: BookOutlined,
      color: 'text-violet-600',
      desc: t('finance.index.generalLedgerDesc'),
    },
    {
      to: '/finance/sales',
      label: t('nav.finance.sales'),
      icon: FileTextOutlined,
      color: 'text-blue-600',
      desc: t('finance.index.salesDesc'),
    },
  ].filter((item) => canAccessPath(currentUser?.role, item.to))

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
          <div className="grid grid-cols-3 gap-[10px] sm:grid-cols-3 sm:gap-[14px] lg:flex lg:flex-wrap lg:justify-center lg:gap-[22px]">
            {menuItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="
                  flex flex-col items-center justify-center
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
                <div className="mb-[6px] sm:mb-[10px] lg:mb-[12px]">
                  <item.icon className={`${item.color} text-[24px] sm:text-[30px] lg:text-[34px]`} />
                </div>

                <h2 className="text-center text-[12px] font-medium leading-[1.3] text-gray-800 sm:mb-[6px] sm:text-[14px] lg:mb-[6px] lg:text-[15px]">
                  {item.label}
                </h2>

                <p className="hidden sm:block sm:text-center sm:text-[11px] sm:leading-[1.618] sm:text-gray-400 sm:line-clamp-2 lg:text-[12px]">
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
