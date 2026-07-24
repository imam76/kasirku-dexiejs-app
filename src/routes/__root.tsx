import FeedbackModal from '@/components/FeedbackModal'
// import { AppWorkflowTour } from '@/components/AppWorkflowTour'
import { AuthGate } from '@/auth/AuthGate'
import { canAccessPath, canAccessPermissionRule, getRequiredPermissionForPath } from '@/auth/routePermissions'
import LoginProfile from '@/components/auth/LoginProfile'
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator'
import { useAuth } from '@/auth/useAuth'
import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { FEEDBACK_QUESTIONS } from '@/constants/feedback'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useI18n } from '@/hooks/useI18n'
import { useTheme } from '@/hooks/useTheme'
import { useEnabledModules } from '@/hooks/useEnabledModules'
import dayjs from '@/lib/dayjs'
import { db } from '@/lib/db'
import { incrementSessionCount, markFeedbackSubmitted, shouldTriggerWave1, shouldTriggerWave2 } from '@/utils/feedback'
import { setConversionRegistry } from '@/utils/pricing'
import { useQuery } from '@tanstack/react-query'
import { createRootRoute, Link, Outlet, useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { App, Button, Drawer, Layout, Menu, Result, notification } from 'antd'
import type { MenuProps } from 'antd'
import {
  Banknote,
  Building2,
  Database,
  FileText,
  History,
  // HelpCircle,
  Home,
  Languages,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  SettingsIcon,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  Users,
  UtensilsCrossed,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'

const { Content, Sider } = Layout

const NAVBAR_HEIGHT = 64
const SIDEBAR_WIDTH = 250

type FeedbackValues = Record<string, unknown>
type NavLeaf = {
  to: string
  label: string
  icon: LucideIcon
  key?: string
  hash?: string
  activePaths?: string[]
}
type NavGroup = { label: string; icon: LucideIcon; key: string; children: NavLink[] }
type NavLink = NavLeaf | NavGroup

const isNavGroup = (link: NavLink): link is NavGroup => 'children' in link
const getNavLeafKey = (link: NavLeaf) => link.key ?? `${link.to}${link.hash ? `#${link.hash}` : ''}`
const flattenNavLeaves = (links: NavLink[]): NavLeaf[] => links.flatMap((link) => (
  isNavGroup(link) ? flattenNavLeaves(link.children) : [link]
))
const getOpenKeysForSelected = (links: NavLink[], selectedKey: string): string[] => links.flatMap((link) => {
  if (!isNavGroup(link)) return []

  const childOpenKeys = getOpenKeysForSelected(link.children, selectedKey)
  const hasSelectedChild = link.children.some((child) => (
    isNavGroup(child)
      ? child.key === selectedKey || childOpenKeys.includes(child.key)
      : getNavLeafKey(child) === selectedKey
  ))

  return link.key === selectedKey || hasSelectedChild ? [link.key, ...childOpenKeys] : []
})
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
  const { can, currentUser, currentRole, permissionSet, logout } = useAuth()
  const { isRouteEnabled } = useEnabledModules({ currentUser, currentRole })
  const { modal } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackWave, setFeedbackWave] = useState<1 | 2>(1)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false)
  }, [isMobile])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, location.hash])
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
    { to: '/pos-resto', label: t('nav.posRestaurant'), icon: UtensilsCrossed },
    { to: '/sales', label: t('nav.sales'), icon: FileText },
    { to: '/purchases', label: t('nav.purchases'), icon: ShoppingBag },
    { to: '/master-data', label: t('nav.masterData'), icon: Database },
    { to: '/history', label: t('nav.history'), icon: History },
    { to: '/finance', label: t('nav.finance'), icon: Banknote },
    {
      to: '/hr',
      label: t('nav.hr'),
      icon: Users,
      activePaths: ['/master-data/areas', '/master-data/employees', '/finance/payroll'],
    },
    { to: '/koperasi', label: t('nav.cooperative'), icon: Building2 },
    {
      key: 'marketplace',
      label: t('nav.marketplace'),
      icon: Store,
      children: [
        { to: '/marketplace/shopee', label: t('nav.marketplace.shopee'), icon: ShoppingBag },
      ],
    },
    { to: '/report', label: t('nav.reports'), icon: FileText },
    { to: '/sync-db', label: t('nav.syncDb'), icon: RefreshCw },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ]

  const filterNavLinks = (links: NavLink[]): NavLink[] => links.reduce<NavLink[]>((acc, link) => {
    if (isNavGroup(link)) {
      const children = filterNavLinks(link.children)
      if (children.length > 0) {
        acc.push({ ...link, children })
      }
      return acc
    }

    if (canAccessPath(currentUser ?? undefined, link.to, { currentRole, permissionSet }) && isRouteEnabled(link.to)) {
      acc.push(link)
    }

    return acc
  }, [])

  const filteredNavLinks = filterNavLinks(navLinks)

  const buildMenuItem = (link: NavLink): NonNullable<MenuProps['items']>[number] => {
    if (isNavGroup(link)) {
      return {
        key: link.key,
        icon: <link.icon size={16} />,
        label: link.label,
        children: link.children.map(buildMenuItem),
      }
    }

    return {
      key: getNavLeafKey(link),
      icon: <link.icon size={16} />,
      label: <Link to={link.to} hash={link.hash}>{link.label}</Link>,
    }
  }

  const menuItems = filteredNavLinks.map(buildMenuItem)

  // Determine active menu key from current path
  const allLinks = flattenNavLeaves(navLinks)

  const currentHash = location.hash.replace(/^#/, '')
  const selectedLink =
    allLinks
      .slice()
      .reverse()
      .find((link) => {
        const matchPaths = [link.to, ...(link.activePaths ?? [])]
        const pathMatches = matchPaths.some((path) => (
          path === '/'
            ? location.pathname === '/'
            : location.pathname === path || location.pathname.startsWith(`${path}/`)
        ))

        if (!pathMatches) return false
        if (link.hash) return currentHash === link.hash

        return true
      })
  const selectedKey = selectedLink ? getNavLeafKey(selectedLink) : '/'

  const openKeys = getOpenKeysForSelected(filteredNavLinks, selectedKey)
  const openKeySignature = openKeys.join('|')
  const [openMenuKeys, setOpenMenuKeys] = useState<string[]>(openKeys)

  useEffect(() => {
    const activeOpenKeys = openKeySignature ? openKeySignature.split('|') : []
    setOpenMenuKeys((currentKeys) => Array.from(new Set([...currentKeys, ...activeOpenKeys])))
  }, [openKeySignature])

  const requiredPermission = getRequiredPermissionForPath(location.pathname)
  const canOpenCurrentPath = canAccessPermissionRule(currentUser ?? undefined, requiredPermission, { currentRole, permissionSet })
  const isModuleActive = isRouteEnabled(location.pathname)
  const useFixedPosWorkspace = location.pathname === '/transaction'

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
              <button
                type="button"
                data-testid="sidebar-toggle"
                aria-label={isMobile
                  ? (mobileNavOpen ? t('root.closeSidebar') : t('root.openSidebar'))
                  : (collapsed ? t('root.openSidebar') : t('root.closeSidebar'))}
                title={isMobile
                  ? (mobileNavOpen ? t('root.closeSidebar') : t('root.openSidebar'))
                  : (collapsed ? t('root.openSidebar') : t('root.closeSidebar'))}
                aria-expanded={isMobile ? mobileNavOpen : !collapsed}
                onClick={() => {
                  if (isMobile) setMobileNavOpen((current) => !current)
                  else setCollapsed((current) => !current)
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-95 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-gray-700 dark:hover:text-blue-300"
              >
                {(isMobile ? mobileNavOpen : !collapsed)
                  ? <PanelLeftClose size={22} />
                  : <PanelLeftOpen size={22} />}
              </button>
              {/* Logo */}
              <img
                src="/frayukti-f.svg"
                alt="Frayukti"
                onClick={handleLogoClick}
                className="h-8 w-auto cursor-pointer lg:hidden"
              />
              <img
                src="/frayukti-box-f-logo-transparant.png"
                alt="Frayukti"
                onClick={handleLogoClick}
                className="hidden h-8 w-auto cursor-pointer lg:block"
              />
            </div>

            {/* Theme Toggle & Settings */}
            <div className="flex items-center gap-1">
              <SyncStatusIndicator />
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
              <LoginProfile
                currentUser={currentUser}
                currentRole={currentRole}
                onLogout={handleLogoutClick}
              />
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
              marginLeft: isMobile ? 0 : collapsed ? 0 : SIDEBAR_WIDTH,
              overflow: 'hidden',
              transition: 'margin-left 0.2s',
            }}
          >
            <Content className="transition-all duration-200" style={{ height: '100%', overflowY: useFixedPosWorkspace ? 'hidden' : 'auto' }}>
              <div className={useFixedPosWorkspace ? 'h-full p-4 min-[1024px]:p-0' : 'p-4'}>
                {!isModuleActive ? (
                  <Result
                    status="info"
                    title="Module tidak aktif"
                    subTitle="Module ini belum diaktifkan pada konfigurasi setup. Hubungi developer untuk mengaktifkan."
                    extra={(
                      <Button type="primary" onClick={() => navigate({ to: '/' })}>
                        Kembali ke Home
                      </Button>
                    )}
                  />
                ) : canOpenCurrentPath ? (
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

          <Drawer
            title={(
              <div className="flex items-center gap-2">
                <img src="/frayukti-f.svg" alt="" className="h-7 w-auto" />
                <span>{t('root.navigation')}</span>
              </div>
            )}
            placement="left"
            width={320}
            open={isMobile && mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            destroyOnHidden
            rootClassName="tablet-navigation-drawer"
            styles={{
              body: { padding: 0, overflow: 'hidden' },
              header: { padding: '14px 16px' },
            }}
          >
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              openKeys={openMenuKeys}
              onOpenChange={setOpenMenuKeys}
              onClick={() => setMobileNavOpen(false)}
              items={menuItems}
              theme={isDark ? 'dark' : 'light'}
              style={{ height: '100%', borderRight: 0, overflowX: 'hidden', overflowY: 'auto', paddingTop: 8 }}
            />
          </Drawer>

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
