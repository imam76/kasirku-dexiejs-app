import {
  FileExcelOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  LineChartOutlined,
  ReconciliationOutlined
} from '@ant-design/icons'
import { useI18n } from '@/hooks/useI18n'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Empty } from 'antd'
import { canAccessPath } from '@/auth/routePermissions'
import { useAuth } from '@/auth/useAuth'

export const Route = createFileRoute('/report/')({
  component: Laporan,
})

function Laporan() {
  const { t } = useI18n()
  const { currentUser, currentRole, permissionSet } = useAuth()
  const menuItems = [
    { to: '/report/pos-sales-report', label: t('report.index.posSalesShort'), icon: FileTextOutlined, color: 'text-orange-600', desc: t('report.index.posSalesDesc') },
    { to: '/report/deposit-report', label: t('report.index.depositShort'), icon: ReconciliationOutlined, color: 'text-amber-600', desc: t('report.index.depositDesc') },
    { to: '/report/transaction-detail-report', label: t('report.index.detailShort'), icon: FileSearchOutlined, color: 'text-blue-600', desc: t('report.index.detailDesc') },
    { to: '/report/purchase-report', label: t('report.index.purchaseShort'), icon: FileExcelOutlined, color: 'text-teal-600', desc: t('report.index.purchaseDesc') },
    { to: '/report/income-report', label: t('report.index.incomeShort'), icon: FileExcelOutlined, color: 'text-green-600', desc: t('report.index.incomeDesc') },
    { to: '/report/expense-report', label: t('report.index.expenseShort'), icon: FileExcelOutlined, color: 'text-red-600', desc: t('report.index.expenseDesc') },
    { to: '/report/payroll-report', label: t('report.index.payrollShort'), icon: FileExcelOutlined, color: 'text-zinc-700', desc: t('report.index.payrollDesc') },
    { to: '/report/profit-loss-report', label: t('report.index.profitLossShort'), icon: LineChartOutlined, color: 'text-indigo-600', desc: t('report.index.profitLossDesc') },
    { to: '/report/aging-report', label: t('report.index.agingShort'), icon: ReconciliationOutlined, color: 'text-emerald-600', desc: t('report.index.agingDesc') },
    { to: '/report/stock-card', label: 'Kartu Stok', icon: FileSearchOutlined, color: 'text-cyan-700', desc: 'Lihat mutasi dan saldo stok per produk' },
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

        {/* Header */}
        <div className="text-center mb-7 sm:mb-9 lg:mb-12">
          <h1
            className="
        text-[20px] font-medium tracking-tight leading-[1.3] text-gray-900 mb-2
        sm:text-[26px] sm:mb-[10px]
        lg:text-[34px] lg:tracking-[-0.02em] lg:leading-[1.2] lg:mb-[14px]
      "
          >
            {t('report.index.welcome')}
          </h1>

          <p
            className="
        text-[12px] text-gray-400 leading-[1.618] px-2
        sm:text-sm sm:max-w-[420px] sm:mx-auto sm:px-0
        lg:text-base lg:max-w-[560px] lg:font-light
      "
          >
            {t('report.index.subtitle')}
          </p>
        </div>

        {/* Grid */}
        {menuItems.length > 0 ? (
          <div
            className="
      grid grid-cols-3 gap-[10px]
      sm:grid-cols-3 sm:gap-[14px]
      lg:flex lg:flex-wrap lg:justify-center lg:gap-[22px]
    "
          >
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
                  {/* Icon */}
                  <div
                    className="
            mb-[6px]
            sm:mb-[10px]
            lg:mb-[12px]
          "
                  >
                    <item.icon
                      className={`
                ${item.color}
                text-[24px]
                sm:text-[30px]
                lg:text-[34px]
              `}
                    />
                  </div>

                  {/* Label */}
                  <h2
                    className="
            text-[12px] font-medium text-gray-800 text-center leading-[1.3]
            sm:text-[14px] sm:mb-[6px]
            lg:text-[15px] lg:mb-[6px]
          "
                  >
                    {item.label}
                  </h2>

                  {/* Desc */}
                  <p
                    className="
            app-menu-card__brief
            mt-1 line-clamp-2 text-center text-[10px] leading-[1.45] text-gray-400
            sm:text-[11px] sm:leading-[1.618]
            lg:hidden
          "
                  >
                    {item.desc}
                  </p>
                </div>

                <p
                  className="
            app-menu-card__detail
            text-center text-[12px] leading-[1.55] text-gray-500
          "
                >
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <Empty description="Tidak ada laporan yang tersedia untuk role ini." />
        )}

      </div>
    </div>
  )
}
