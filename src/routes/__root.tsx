import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useState } from 'react'
import { Layout } from 'antd'
import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { useTheme } from '@/hooks/useTheme'
import {
  Home,
  Box,
  ClipboardList,
  ShoppingCart,
  History,
  FileText,
  FileSpreadsheet,
  DollarSign,
  Menu,
  X,
  Moon,
  Sun
} from 'lucide-react'

const { Content } = Layout

const RootLayout = () => {
  const { isDark, toggle } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  })
  const isRoot = pathname === "/"

  const navLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/stock', label: 'Stok', icon: Box },
    { to: '/shopping-note', label: 'Catatan Belanja', icon: ClipboardList },
    { to: '/transaction', label: 'Transaksi', icon: ShoppingCart },
    { to: '/history', label: 'Riwayat', icon: History },
    { to: '/sales-report', label: 'Laporan Penjualan', icon: FileText },
    { to: '/purchase-report', label: 'Laporan Pembelian', icon: FileSpreadsheet },
    { to: '/profit', label: 'Keuntungan', icon: DollarSign },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Navbar */}
      <nav className="fixed top-0 z-50 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200 pt-8 xl:pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo & Desktop Nav */}
            <div className="flex items-center flex-1 overflow-hidden">
              <div className="flex-shrink-0 flex items-center mr-6">
                <Link to="/" replace={true} className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  Kasirku
                </Link>
              </div>

              {/* Desktop Menu - Scrollable */}
              <div className="hidden xl:flex xl:items-center xl:space-x-1 overflow-x-auto no-scrollbar flex-1 mask-linear-fade">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    replace={link.to === '/'}
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

            {/* Right Side: Theme Toggle & Mobile Button */}
            <div className="flex items-center gap-4 flex-shrink-0 bg-white dark:bg-gray-800 pl-4">
              <button
                onClick={toggle}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                aria-label="Toggle theme"
              >
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              {/* Mobile Menu Button */}
              <div className="flex xl:hidden">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                >
                  <span className="sr-only">Open main menu</span>
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        <div
          className={`fixed inset-0 z-50 xl:hidden transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-gray-600 bg-opacity-75 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div
            className={`fixed inset-y-0 left-0 max-w-xs w-full bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="px-2 pt-2 pb-3 space-y-1 overflow-y-auto h-[calc(100%-4rem)]">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  replace={!isRoot}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  activeProps={{
                    className: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-gray-700'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <link.icon size={18} />
                    <span>{link.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <Content className="p-4 pt-[112px] xl:pt-[80px] w-full max-w-full">
        <Outlet />
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
