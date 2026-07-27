import {
  ApartmentOutlined,
  BankOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DollarCircleOutlined,
  FileProtectOutlined,
  IdcardOutlined,
  TeamOutlined,
} from '@ant-design/icons'
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
  to:
    | '/hr/dashboard'
    | '/hr/employees'
    | '/hr/departments'
    | '/hr/positions'
    | '/hr/contracts'
    | '/hr/salary-components'
    | '/hr/work-schedules'
    | '/hr/leave'
    | '/finance/payroll'
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
      to: '/hr/dashboard',
      label: 'Dashboard HR',
      icon: DashboardOutlined,
      color: 'text-indigo-600',
      desc: 'Ringkasan karyawan aktif, kontrak, karyawan baru, dan distribusi departemen.',
    },
    {
      to: '/hr/employees',
      label: t('nav.employees'),
      icon: TeamOutlined,
      color: 'text-blue-600',
      desc: 'Data pribadi, identitas, kepegawaian, status, dan konfigurasi gaji karyawan.',
    },
    {
      to: '/hr/departments',
      label: 'Departemen',
      icon: ApartmentOutlined,
      color: 'text-lime-700',
      desc: 'Struktur departemen bertingkat, kepala departemen, dan status aktif.',
    },
    {
      to: '/hr/positions',
      label: 'Jabatan',
      icon: IdcardOutlined,
      color: 'text-cyan-700',
      desc: 'Master jabatan, level, departemen, dan garis pelaporan jabatan.',
    },
    {
      to: '/hr/contracts',
      label: 'Kontrak Kerja',
      icon: FileProtectOutlined,
      color: 'text-amber-700',
      desc: 'Riwayat kontrak immutable serta alur perpanjangan dengan record baru.',
    },
    {
      to: '/hr/work-schedules',
      label: 'Jadwal Kerja',
      icon: CalendarOutlined,
      color: 'text-sky-700',
      desc: 'Template jam kerja, assignment efektif, hari libur, dan hari kerja khusus.',
    },
    {
      to: '/hr/leave',
      label: 'Cuti & Ketersediaan',
      icon: CalendarOutlined,
      color: 'text-orange-700',
      desc: 'Pengajuan cuti, approval berjenjang, saldo, dan dampak ketersediaan.',
    },
    {
      to: '/hr/salary-components',
      label: 'Komponen Gaji',
      icon: BankOutlined,
      color: 'text-rose-700',
      desc: 'Master komponen pendapatan dan potongan untuk konfigurasi gaji karyawan.',
    },
    {
      to: '/finance/payroll',
      label: 'Payroll',
      icon: DollarCircleOutlined,
      color: 'text-emerald-700',
      desc: 'Proses payroll karyawan, persetujuan, pembayaran, posting, dan slip gaji.',
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
