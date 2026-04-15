import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { useTheme } from '@/hooks/useTheme'
import { createRootRoute, Link, Outlet, useNavigate, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Layout } from 'antd'
import {
  Banknote,
  Box,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  Moon,
  Settings,
  SettingsIcon,
  ShoppingCart,
  Sun
} from 'lucide-react'

const { Content } = Layout

const RootLayout = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  const handleLogoClick = () => {
    // Check if desktop (xl breakpoint - 1280px)
    if (window.matchMedia('(min-width: 1280px)').matches) {
      navigate({ to: '/' })
    } else {
      router.history.back()
    }
  }

  const navLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/stock', label: 'Stok', icon: Box },
    { to: '/shopping-note', label: 'Catatan Belanja', icon: ClipboardList },
    { to: '/transaction', label: 'Transaksi', icon: ShoppingCart },
    { to: '/history', label: 'Riwayat', icon: History },
    { to: '/sales-report', label: 'Laporan Penjualan', icon: FileText },
    { to: '/purchase-report', label: 'Laporan Pembelian', icon: FileSpreadsheet },
    { to: '/finance', label: 'Keuangan', icon: Banknote },
    { to: '/profit', label: 'Keuntungan', icon: DollarSign },
    { to: '/settings', label: 'Pengaturan', icon: Settings },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Navbar (Top Bar) - Always visible for Logo & Theme Toggle */}
      <nav className="fixed top-0 z-40 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm h-16 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex justify-between items-center h-full">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-6">
              <div onClick={handleLogoClick} className="text-xl font-bold text-blue-600 dark:text-blue-400 cursor-pointer">
                Kasirku
              </div>

              {/* Desktop Menu - Scrollable */}
              <div className="hidden xl:flex xl:items-center xl:space-x-1 overflow-x-auto no-scrollbar mask-linear-fade">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap flex-shrink-0"
                    activeProps={{
                      className: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-gray-700'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <link.icon size={16} />
                      <span>{link.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center">
              <button
                onClick={toggle}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                aria-label="Toggle theme"
              >
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button
                onClick={() => navigate({ to: '/settings' })}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              >
                <SettingsIcon size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <Content className="pt-16 pb-4 w-full max-w-full min-h-screen transition-all duration-200">
        <div className="p-4">
          <Outlet />
        </div>
      </Content>

      <TanStackRouterDevtools />
    </Layout>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: Loading,
  notFoundComponent: NotFound,
})
