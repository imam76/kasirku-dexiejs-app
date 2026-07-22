import {
  ApartmentOutlined,
  ContactsOutlined,
  CreditCardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  PercentageOutlined,
  ProductOutlined,
  ProjectOutlined,
  SettingOutlined,
  MoneyCollectOutlined,
  ExperimentOutlined,
  SwapOutlined,
  ShopOutlined,
  TeamOutlined,
  BankOutlined,
} from '@ant-design/icons'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Empty } from 'antd'
import { canAccessPath } from '@/auth/routePermissions'
import { useAuth } from '@/auth/useAuth'
import { useI18n } from '@/hooks/useI18n'

export const Route = createFileRoute('/master-data/')({
  component: MasterData,
})

type MasterDataMenuItem = {
  to: string
  hash?: string
  label: string
  icon: typeof ProductOutlined
  color: string
  desc: string
  tour?: string
}

function MasterData() {
  const { t } = useI18n()
  const { currentUser, currentRole, permissionSet } = useAuth()
  const menuItems: MasterDataMenuItem[] = [
    { to: '/master-data/products', label: t('nav.product'), icon: ProductOutlined, color: 'text-green-600', desc: t('home.menu.stockDesc'), tour: 'dashboard-stock' },
    { to: '/master-data/production', label: t('nav.production'), icon: ExperimentOutlined, color: 'text-purple-600', desc: t('home.productionDesc') },
    { to: '/master-data/stock-opname', label: t('nav.stockOpname'), icon: ProductOutlined, color: 'text-blue-600', desc: t('home.stockOpnameDesc') },
    { to: '/master-data/promos', label: t('nav.promos'), icon: DollarOutlined, color: 'text-rose-600', desc: t('home.promosDesc') },
    { to: '/master-data/contacts', label: t('nav.contacts'), icon: ContactsOutlined, color: 'text-amber-600', desc: t('home.contactsDesc') },
    { to: '/master-data/warehouses', label: t('nav.warehouses'), icon: ShopOutlined, color: 'text-teal-600', desc: t('home.warehousesDesc') },
    { to: '/master-data/payment-methods', label: t('nav.paymentMethods'), icon: CreditCardOutlined, color: 'text-blue-600', desc: t('home.paymentMethodsDesc') },
    { to: '/master-data/currencies', label: t('nav.currencies'), icon: MoneyCollectOutlined, color: 'text-emerald-600', desc: t('home.currenciesDesc') },
    { to: '/master-data/areas', label: t('nav.areas'), icon: EnvironmentOutlined, color: 'text-lime-600', desc: t('home.areasDesc') },
    { to: '/master-data/employees', label: t('nav.employees'), icon: TeamOutlined, color: 'text-blue-600', desc: t('home.employeesDesc') },
    { to: '/master-data/roles', label: t('nav.roles'), icon: TeamOutlined, color: 'text-fuchsia-600', desc: t('home.rolesDesc') },
    { to: '/master-data/departments', label: t('nav.departments'), icon: ApartmentOutlined, color: 'text-sky-600', desc: t('home.departmentsDesc') },
    { to: '/master-data/projects', label: t('nav.projects'), icon: ProjectOutlined, color: 'text-violet-600', desc: t('home.projectsDesc') },
    { to: '/master-data/fixed-assets', label: t('nav.fixedAssets'), icon: BankOutlined, color: 'text-slate-600', desc: t('home.fixedAssetsDesc') },
    { to: '/master-data/taxes', label: t('nav.taxes'), icon: PercentageOutlined, color: 'text-orange-600', desc: t('home.taxesDesc') },
    { to: '/master-data/units', hash: 'conversions', label: t('nav.units'), icon: SwapOutlined, color: 'text-cyan-600', desc: t('home.unitConversionDesc') },
    { to: '/master-data/units', hash: 'units', label: t('nav.unit'), icon: SettingOutlined, color: 'text-indigo-600', desc: t('home.unitDesc') },
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
            {t('nav.masterData')}
          </h1>
          <p className="px-2 text-[12px] leading-[1.618] text-gray-400 sm:mx-auto sm:max-w-[420px] sm:px-0 sm:text-sm lg:max-w-[560px] lg:text-base lg:font-light">
            {t('home.masterDataDesc')}
          </p>
        </div>

        {menuItems.length > 0 ? (
          <div className="app-menu-grid">
            {menuItems.map((item) => (
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
        ) : (
          <Empty description="Tidak ada master data yang tersedia untuk role ini." />
        )}
      </div>
    </div>
  )
}
