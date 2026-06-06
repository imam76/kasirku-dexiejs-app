import FeedbackModal from '@/components/FeedbackModal'
// import { AppWorkflowTour } from '@/components/AppWorkflowTour'
import { AuthGate } from '@/auth/AuthGate'
import { canAccessPath, canAccessPermissionRule, getRequiredPermissionForPath } from '@/auth/routePermissions'
import { useAuth } from '@/auth/useAuth'
import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { FEEDBACK_QUESTIONS } from '@/constants/feedback'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useI18n } from '@/hooks/useI18n'
import { useTheme } from '@/hooks/useTheme'
import dayjs from '@/lib/dayjs'
import { db } from '@/lib/db'
import { incrementSessionCount, markFeedbackSubmitted, shouldTriggerWave1, shouldTriggerWave2 } from '@/utils/feedback'
import { setConversionRegistry } from '@/utils/pricing'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Link, Outlet, useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { App, Button, Layout, Menu, Result, notification } from 'antd'
import {
  BadgePercent,
  Banknote,
  BookOpen,
  Box,
  Building2,
  ClipboardList,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  FolderKanban,
  History,
  // HelpCircle,
  Home,
  Languages,
  ListTree,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  ReceiptText,
  Scale,
  Settings,
  SettingsIcon,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Users,
  Warehouse,
  WalletCards,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'

const { Content, Sider } = Layout

const NAVBAR_HEIGHT = 64
const SIDEBAR_WIDTH = 250
const TRIGGER_WIDTH = 36

type FeedbackValues = Record<string, unknown>
type NavLeaf = { to: string; label: string; icon: LucideIcon; key?: string; hash?: string }
type NavGroup = { label: string; icon: LucideIcon; key: string; children: NavLeaf[] }
type NavLink = NavLeaf | NavGroup

const isNavGroup = (link: NavLink): link is NavGroup => 'children' in link
const getNavLeafKey = (link: NavLeaf) => link.key ?? `${link.to}${link.hash ? `#${link.hash}` : ''}`
const escapeTelegramHtml = (value: unknown) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const RootLayout = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useTheme()
  const { locale, t, toggleLocale } = useI18n()
  const { can, currentUser, logout } = useAuth()
  const { modal } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackWave, setFeedbackWave] = useState<1 | 2>(1)
  const isMobile = useIsMobile()
  useEffect(() => {
    // Increment session on mount
    incrementSessionCount()

    const checkFeedback = async () => {
      // Priority: Wave 2 then Wave 1
      if (await shouldTriggerWave2()) {
        setFeedbackWave(2)
        setShowFeedback(true)
      } else if (await shouldTriggerWave1()) {
        setFeedbackWave(1)
        setShowFeedback(true)
      }
    }

    checkFeedback()

    window.addEventListener('check-feedback', checkFeedback)
    return () => window.removeEventListener('check-feedback', checkFeedback)
  }, [location.pathname]) // Re-check on navigation

  const handleFeedbackSubmit = async (values: FeedbackValues) => {
    const questions = FEEDBACK_QUESTIONS.filter(q => q.wave === feedbackWave)
    const valueLines = questions
      .map((q) => {
        const val = values[`q${q.id}`]
        if (val === undefined || val === null) return null
        return `<b>${q.id}. ${escapeTelegramHtml(q.question)}</b>\nJawaban: ${escapeTelegramHtml(val)}`
      })
      .filter(Boolean)
      .join('\n\n')

    const message = `📊 <b>Feedback Wave ${feedbackWave} Baru Diterima</b>\n\n${valueLines}\n\n🕒 <i>Dikirim pada ${dayjs().format('YYYY-MM-DD HH:mm:ss')}</i>`

    console.log(`Feedback Wave ${feedbackWave} submitted:`, values)

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      })

      if (!response.ok) {
        throw new Error(`Feedback API failed with status ${response.status}`)
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
      notification.error({
        message: t('root.feedbackSubmitFailedTitle'),
        description: t('root.feedbackSubmitFailedDescription'),
        placement: 'bottomRight',
      })
      return
    }

    markFeedbackSubmitted(feedbackWave)

    localStorage.setItem(`feedback_wave${feedbackWave}_data`, JSON.stringify({
      values,
      submittedAt: dayjs().toISOString()
    }))

    setShowFeedback(false)
    notification.success({
      message: t('root.feedbackThanksTitle'),
      description: t('root.feedbackThanksDescription'),
      placement: 'bottomRight',
    })
  }

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
    if (isMobile) {
      router.history.back()
    } else {
      navigate({ to: '/' })
    }
  }

  const handleLogoutClick = () => {
    modal.confirm({
      title: t('root.logoutConfirmTitle'),
      content: t('root.logoutConfirmContent', { name: currentUser?.name ?? t('root.currentUserFallback') }),
      okText: t('root.logout'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          navigate({ to: '/' })
          await logout()
        } catch (error) {
          console.error('Logout failed:', error)
          notification.error({
            message: t('root.logoutFailedTitle'),
            description: error instanceof Error ? error.message : t('root.logoutFailedDescription'),
            placement: 'bottomRight',
          })
        }
      },
    })
  }

  const navLinks: NavLink[] = [
    { to: '/', label: t('nav.home'), icon: Home },
    { to: '/transaction', label: t('nav.transaction'), icon: ShoppingCart },
    { to: '/sales', label: t('nav.sales'), icon: FileText },
    { to: '/purchases', label: t('nav.purchases'), icon: ShoppingBag },
    {
      label: t('nav.masterData'),
      icon: Database,
      key: 'master-data-group',
      children: [
        { to: '/master-data/products', label: t('nav.product'), icon: Box },
        { to: '/master-data/promos', label: t('nav.promos'), icon: BadgePercent },
        { to: '/master-data/contacts', label: t('nav.contacts'), icon: Users },
        { to: '/master-data/warehouses', label: t('nav.warehouses'), icon: Warehouse },
        { to: '/master-data/departments', label: t('nav.departments'), icon: Building2 },
        { to: '/master-data/projects', label: t('nav.projects'), icon: FolderKanban },
        { to: '/master-data/taxes', label: t('nav.taxes'), icon: Percent },
        { to: '/master-data/units', label: t('nav.units'), icon: Scale, key: '/master-data/units#conversions', hash: 'conversions' },
        { to: '/master-data/units', label: t('nav.unit'), icon: Scale, key: '/master-data/units#units', hash: 'units' },
      ],
    },
    { to: '/shopping-note', label: t('nav.shoppingNote'), icon: ClipboardList },
    { to: '/history', label: t('nav.history'), icon: History },
    {
      label: t('nav.finance'),
      icon: Banknote,
      key: 'finance-group',
      children: [
        { to: '/finance/cash-flow', label: t('nav.finance.cashFlow'), icon: Banknote },
        { to: '/finance/receivables', label: t('nav.finance.receivables'), icon: ReceiptText },
        { to: '/finance/payables', label: t('nav.finance.payables'), icon: CreditCard },
        { to: '/finance/chart-of-accounts', label: t('nav.finance.chartOfAccounts'), icon: ListTree },
        { to: '/finance/general-ledger', label: t('nav.finance.generalLedger'), icon: BookOpen },
      ],
    },
    {
      label: t('nav.cooperative'),
      icon: Building2,
      key: 'cooperative-group',
      children: [
        { to: '/koperasi', label: t('nav.cooperative.overview'), icon: Home },
        { to: '/koperasi/anggota', label: t('nav.cooperative.members'), icon: Users },
        { to: '/koperasi/simpanan', label: t('nav.cooperative.savings'), icon: WalletCards },
        { to: '/koperasi/pinjaman', label: t('nav.cooperative.loans'), icon: Banknote },
        { to: '/koperasi/angsuran', label: t('nav.cooperative.installments'), icon: ReceiptText },
        { to: '/koperasi/laporan', label: t('nav.cooperative.reports'), icon: FileText },
      ],
    },
    {
      label: t('nav.reports'),
      icon: FileText,
      key: 'reports-group',
      children: [
        { to: '/report/pos-sales-report', label: t('nav.report.posSales'), icon: FileText },
        { to: '/report/transaction-detail-report', label: t('nav.report.transactionDetail'), icon: FileText },
        { to: '/report/purchase-report', label: t('nav.report.purchase'), icon: FileText },
        { to: '/report/expense-report', label: t('nav.report.expense'), icon: FileText },
        { to: '/report/aging-report', label: t('nav.report.aging'), icon: FileText },
        { to: '/profit', label: t('nav.report.profit'), icon: DollarSign },
      ],
    },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ]

  const filteredNavLinks = navLinks.reduce<NavLink[]>((acc, link) => {
    if (isNavGroup(link)) {
      const children = link.children.filter((child) => canAccessPath(currentUser?.role, child.to))
      if (children.length > 0) {
        acc.push({ ...link, children })
      }
      return acc
    }

    if (canAccessPath(currentUser?.role, link.to)) {
      acc.push(link)
    }

    return acc
  }, [])

  const menuItems = filteredNavLinks.map((link) => {
    if (isNavGroup(link)) {
      return {
        key: link.key,
        icon: <link.icon size={16} />,
        label: link.label,
        children: link.children.map((child) => ({
          key: getNavLeafKey(child),
          icon: <child.icon size={16} />,
          label: <Link to={child.to} hash={child.hash}>{child.label}</Link>,
        })),
      }
    }
    return {
      key: getNavLeafKey(link),
      icon: <link.icon size={16} />,
      label: <Link to={link.to} hash={link.hash}>{link.label}</Link>,
    }
  })

  // Determine active menu key from current path
  const allLinks = navLinks.reduce<NavLeaf[]>((acc, link) => {
    if (isNavGroup(link)) {
      return [...acc, ...link.children]
    }
    return [...acc, link]
  }, [])

  const currentHash = location.hash.replace(/^#/, '')
  const selectedLink =
    allLinks
      .slice()
      .reverse()
      .find((link) => {
        const pathMatches = link.to === '/'
          ? location.pathname === '/'
          : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`)

        if (!pathMatches) return false
        if (link.hash) return currentHash === link.hash

        return true
      })
  const selectedKey = (() => {
    if (location.pathname === '/master-data') return 'master-data-group'
    if (location.pathname === '/finance') return 'finance-group'

    return selectedLink ? getNavLeafKey(selectedLink) : '/'
  })()

  const openKeys = filteredNavLinks
    .filter(isNavGroup)
    .filter((link) => link.key === selectedKey || link.children.some((child) => getNavLeafKey(child) === selectedKey))
    .map((link) => link.key)
  const openKeySignature = openKeys.join('|')
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>(openKeys)

  useEffect(() => {
    const activeOpenKeys = openKeySignature ? openKeySignature.split('|') : []
    setOpenMenuKeys((currentKeys) => Array.from(new Set([...currentKeys, ...activeOpenKeys])))
  }, [openKeySignature])

  const requiredPermission = getRequiredPermissionForPath(location.pathname)
  const canOpenCurrentPath = canAccessPermissionRule(currentUser?.role, requiredPermission)

  const safeAreaTop = 'env(safe-area-inset-top, 0px)'
  const topOffset = `calc(${NAVBAR_HEIGHT}px + ${safeAreaTop})`
  const contentHeight = `calc(100dvh - ${topOffset})`

  return (
    <AuthGate>
      <Layout style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* Top Navbar - Logo & Theme Toggle */}
      <nav
        className="fixed top-0 z-40 w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-colors duration-200"
        style={{
          height: topOffset,
          paddingTop: safeAreaTop,
        }}
      >
        <div className="h-full px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Logo */}
            <div
              onClick={handleLogoClick}
              className="text-xl font-bold text-blue-600 dark:text-blue-400 cursor-pointer"
            >
              Kasirku
            </div>
          </div>

          {/* Theme Toggle & Settings */}
          <div className="flex items-center">
            <button
              onClick={toggle}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              aria-label={t('common.toggleTheme')}
            >
              {isDark ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button
              onClick={toggleLocale}
              className="flex items-center gap-1 rounded-full px-2 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none dark:hover:bg-gray-700"
              aria-label={t('common.switchLanguage')}
              title={t('common.switchLanguage')}
            >
              <Languages size={18} />
              <span className="leading-none">{locale === 'id' ? 'EN' : 'ID'}</span>
            </button>
            {/* <AppWorkflowTour>
              {(startTour) => (
                <button
                  onClick={startTour}
                  className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                  aria-label={t('root.startTour')}
                  title={t('root.startTour')}
                >
                  <HelpCircle size={20} />
                </button>
              )}
            </AppWorkflowTour> */}
            {can('SETTINGS_ACCESS') && (
              <button
                onClick={() => navigate({ to: '/settings' })}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
                aria-label={t('root.openSettings')}
                title={t('root.openSettings')}
              >
                <SettingsIcon size={20} />
              </button>
            )}
            <button
              onClick={handleLogoutClick}
              className="p-2 rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none dark:hover:bg-red-950/40 dark:hover:text-red-300"
              aria-label={t('root.logout')}
              title={t('root.logout')}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Body: Sider + Content */}
      <Layout hasSider={!isMobile} style={{ marginTop: topOffset, height: contentHeight }}>
        {/* Side Navigation */}
        {!isMobile && (
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            trigger={null}
            theme={isDark ? 'dark' : 'light'}
            collapsedWidth={0}
            width={SIDEBAR_WIDTH}
            style={
              !isMobile
                ? {
                  position: 'fixed',
                  top: topOffset,
                  bottom: 0,
                  left: 0,
                  height: contentHeight,
                  zIndex: 30,
                }
                : undefined
            }
          >
            {!isMobile && (
              <button
                type="button"
                aria-label={collapsed ? t('root.openSidebar') : t('root.closeSidebar')}
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-9 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-r-md border border-l-0 border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              </button>
            )}
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              openKeys={openMenuKeys}
              onOpenChange={setOpenMenuKeys}
              items={menuItems}
              theme={isDark ? 'dark' : 'light'}
              style={{ height: '100%', borderRight: 0, overflowX: 'hidden', overflowY: 'auto' }}
            />
          </Sider>
        )}

        {/* Main Content */}
        <Layout
          style={{
            height: contentHeight,
            marginLeft: isMobile ? 0 : collapsed ? TRIGGER_WIDTH : SIDEBAR_WIDTH + TRIGGER_WIDTH,
            overflow: 'hidden',
            transition: 'margin-left 0.2s',
          }}
        >
          <Content className="transition-all duration-200" style={{ height: '100%', overflowY: 'auto' }}>
            <div className="p-4">
              {canOpenCurrentPath ? (
                <Outlet />
              ) : (
                <Result
                  status="403"
                  title="Akses tidak tersedia"
                  subTitle="User Anda tidak memiliki izin untuk membuka halaman ini."
                  extra={(
                    <Button type="primary" onClick={() => navigate({ to: '/' })}>
                      Kembali ke Home
                    </Button>
                  )}
                />
              )}
            </div>
          </Content>
        </Layout>
      </Layout>

      <TanStackRouterDevtools />
      <FeedbackModal
        open={showFeedback}
        wave={feedbackWave}
        onFinish={handleFeedbackSubmit}
      />
      </Layout>
    </AuthGate>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: Loading,
  notFoundComponent: NotFound,
})
