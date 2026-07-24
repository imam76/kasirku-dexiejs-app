import { DollarOutlined, EnvironmentOutlined, TeamOutlined } from '@ant-design/icons'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Empty } from 'antd'
import { canAccessPath } from '@/auth/routePermissions'
import { useAuth } from '@/auth/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useEnabledModules } from '@/hooks/useEnabledModules'

export const Route = createFileRoute('/hr/')({
  component: HumanResources,
})

type HumanResourcesMenuItem = {
  to: '/master-data/areas' | '/master-data/employees' | '/finance/payroll'
  label: string
  icon: typeof TeamOutlined
  color: string
  desc: string
}

function HumanResources() {
  const { t } = useI18n()
  const { currentUser, currentRole, permissionSet } = useAuth()
  const { isRouteEnabled } = useEnabledModules({ currentUser, currentRole })
  const availableMenuItems: HumanResourcesMenuItem[] = [
    {
      to: '/master-data/areas',
      label: t('nav.areas'),
      icon: EnvironmentOutlined,
      color: 'text-lime-600',
      desc: t('home.areasDesc'),
    },
    {
      to: '/master-data/employees',
      label: t('nav.employees'),
      icon: TeamOutlined,
      color: 'text-blue-600',
      desc: t('home.employeesDesc'),
    },
    {
      to: '/finance/payroll',
      label: t('nav.finance.payroll'),
      icon: DollarOutlined,
      color: 'text-sky-700',
      desc: t('finance.index.payrollDesc'),
    },
  ]
  const menuItems = availableMenuItems.filter((item) => (
    canAccessPath(currentUser ?? undefined, item.to, { currentRole, permissionSet }) &&
    isRouteEnabled(item.to)
  ))

  return (
    <div className="px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-[38px]">
      <div className="mx-auto max-w-[974px]">
        <div className="mb-7 text-center sm:mb-9 lg:mb-12">
          <h1 className="mb-2 text-[20px] font-medium leading-[1.3] tracking-tight text-gray-900 sm:mb-[10px] sm:text-[26px] lg:mb-[14px] lg:text-[34px] lg:leading-[1.2]">
            {t('hr.index.title')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('hr.index.subtitle')}
          </p>
        </div>

        {menuItems.length > 0 ? (
          <div className="app-menu-grid">
            {menuItems.map((item) => (
              <Link key={item.to} to={item.to} className="app-menu-card">
                <div className="app-menu-card__body flex flex-col items-center justify-center">
                  <div className="app-menu-card__icon bg-gray-50">
                    <item.icon className={`app-menu-card__icon-svg ${item.color}`} />
                  </div>

                  <h2 className="app-menu-card__title">{item.label}</h2>

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
          <Empty description={t('hr.index.empty')} />
        )}
      </div>
    </div>
  )
}
