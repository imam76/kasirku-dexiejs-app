import { createRootRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Layout, Menu, Switch, Drawer, Button, Grid } from 'antd'
import { ShoppingCartOutlined, AppstoreOutlined, HistoryOutlined, FileTextOutlined, MoonOutlined, SunOutlined, MenuOutlined, CloseOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { useTheme } from '@/hooks/useTheme'

const { Header, Content } = Layout
const { useBreakpoint } = Grid

const RootLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const breakpoints = useBreakpoint()

  const menuItems = [
    {
      key: '/',
      label: 'Home',
      onClick: () => {
        navigate({ to: '/' })
        setMobileMenuOpen(false)
      },
    },
    {
      key: '/stock',
      icon: <AppstoreOutlined />,
      label: 'Stok',
      onClick: () => {
        navigate({ to: '/stock' })
        setMobileMenuOpen(false)
      },
    },
    {
      key: '/transaction',
      icon: <ShoppingCartOutlined />,
      label: 'Transaksi',
      onClick: () => {
        navigate({ to: '/transaction' })
        setMobileMenuOpen(false)
      },
    },
    {
      key: '/history',
      icon: <HistoryOutlined />,
      label: 'Riwayat',
      onClick: () => {
        navigate({ to: '/history' })
        setMobileMenuOpen(false)
      },
    },
    {
      key: '/sales-report',
      icon: <FileTextOutlined />,
      label: 'Laporan Penjualan',
      onClick: () => {
        navigate({ to: '/sales-report' })
        setMobileMenuOpen(false)
      },
    },
    {
      key: '/purchase-report',
      icon: <FileTextOutlined />,
      label: 'Laporan Pembelian',
      onClick: () => {
        navigate({ to: '/purchase-report' })
        setMobileMenuOpen(false)
      },
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'fixed',
          zIndex: 10,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
          padding: '0 16px',
          gap: '16px',
        }}
      >
        <Link to="/">
          <div
            style={{
              color: 'white',
              fontSize: '20px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Kasirku
          </div>
        </Link>

        {/* Desktop & Tablet Menu */}
        {breakpoints.md && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={menuItems}
              style={{ flex: 1, minWidth: 0, border: 'none' }}
            />
            <Switch
              checked={isDark}
              onChange={toggle}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
            />
          </div>
        )}

        {/* Mobile Menu */}
        {!breakpoints.md && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
            <Switch
              checked={isDark}
              onChange={toggle}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
            />
            <Button
              type="text"
              icon={mobileMenuOpen ? <CloseOutlined /> : <MenuOutlined />}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ color: 'white', fontSize: '18px' }}
            />
          </div>
        )}
      </Header>

      {/* Mobile Drawer Menu */}
      {!breakpoints.md && (
        <Drawer
          title="Menu"
          placement="left"
          onClose={() => setMobileMenuOpen(false)}
          open={mobileMenuOpen}
          styles={{ body: { padding: '0' } }}
        >
          <Menu
            theme="light"
            mode="vertical"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{ border: 'none' }}
          />
        </Drawer>
      )}

      <Content style={{ padding: '16px', paddingTop: '80px', maxWidth: '100%' }}>
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
