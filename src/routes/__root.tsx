import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { useTheme } from '@/hooks/useTheme'
import { createRootRoute, Link, Outlet, useNavigate, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Layout, Menu } from 'antd'
import {
  Banknote,
  Box,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FileDown,
  History,
  Home,
  Moon,
  Scale,
  Settings,
  SettingsIcon,
  ShoppingCart,
  Sun
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { db } from '@/lib/db'
import { setConversionRegistry } from '@/utils/pricing'
import { useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'

const { Content, Sider } = Layout

const RootLayout = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  // Load unit conversions globally
  const { data: conversions } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: async () => {
      const data = await db.unitConversions.toArray()
      setConversionRegistry(data)
      return data
    },
  })

  useEffect(() => {
    if (conversions) {
      setConversionRegistry(conversions)
    }
  }, [conversions])

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
    {
      label: 'Laporan',
      icon: FileText,
      key: 'reports-group',
      children: [
        { to: '/sales-report', label: 'Penjualan', icon: FileText },
        { to: '/purchase-report', label: 'Pembelian', icon: FileSpreadsheet },
        { to: '/expense-report', label: 'Pengeluaran', icon: FileDown },
        { to: '/profit', label: 'Keuntungan', icon: DollarSign },
      ],
    },
    { to: '/finance', label: 'Keuangan', icon: Banknote },
    { to: '/units', label: 'Satuan & Konversi', icon: Scale },
    { to: '/settings', label: 'Pengaturan', icon: Settings },
  ]

  const menuItems = navLinks.map((link) => {
    if ('children' in link && link.children) {
      return {
        key: link.key,
        icon: <link.icon size={16} />,
        label: link.label,
        children: link.children.map((child) => ({
          key: child.to,
          icon: <child.icon size={16} />,
          label: <Link to={child.to}>{child.label}</Link>,
        })),
      }
    }
    return {
      key: link.to,
      icon: <link.icon size={16} />,
      label: <Link to={link.to}>{link.label}</Link>,
    }
  })

  // Determine active menu key from current path
  const allLinks = navLinks.reduce((acc: any[], link) => {
    if ('children' in link && link.children) {
      return [...acc, ...link.children]
    }
    return [...acc, link]
  }, [])

  const selectedKey =
    allLinks
      .slice()
      .reverse()
      .find((link) => location.pathname.startsWith(link.to === '/' ? '/' : link.to))?.to ?? '/'

  const openKeys = navLinks
    .filter((link) => 'children' in link && link.children?.some((child) => child.to === selectedKey))
    .map((link: any) => link.key)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Top Navbar - Logo & Theme Toggle */}
      <nav className="fixed top-0 z-40 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm h-16 transition-colors duration-200">
        <div className="h-full px-4 flex justify-between items-center">
          {/* Logo */}
          <div
            onClick={handleLogoClick}
            className="text-xl font-bold text-blue-600 dark:text-blue-400 cursor-pointer"
          >
            Kasirku
          </div>

          {/* Theme Toggle & Settings */}
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
      </nav>

      {/* Body: Sider + Content */}
      <Layout style={{ marginTop: 64 }}>
        {/* Side Navigation */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme={isDark ? 'dark' : 'light'}
          style={{
            position: 'fixed',
            left: 0,
            top: 64,
            bottom: 0,
            overflow: 'auto',
            zIndex: 30,
          }}
          breakpoint="lg"
          collapsedWidth={0}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={openKeys}
            items={menuItems}
            theme={isDark ? 'dark' : 'light'}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>

        {/* Main Content */}
        <Layout
          style={{
            marginLeft: collapsed ? 0 : 200,
            transition: 'margin-left 0.2s',
          }}
        >
          <Content className="min-h-screen transition-all duration-200">
            <div className="p-4">
              <Outlet />
            </div>
          </Content>
        </Layout>
      </Layout>

      <TanStackRouterDevtools />
    </Layout>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: Loading,
  notFoundComponent: NotFound,
})