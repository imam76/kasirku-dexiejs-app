import FeedbackModal from '@/components/FeedbackModal'
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
import { Layout, Menu, notification } from 'antd'
import {
  Banknote,
  Box,
  ClipboardList,
  DollarSign,
  FileText,
  History,
  Home,
  Languages,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Settings,
  SettingsIcon,
  ShoppingCart,
  Sun,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'

const { Content, Sider } = Layout
const NAVBAR_HEIGHT = 64

type FeedbackValues = Record<string, unknown>
type NavLeaf = { to: string; label: string; icon: LucideIcon }
type NavGroup = { label: string; icon: LucideIcon; key: string; children: NavLeaf[] }
type NavLink = NavLeaf | NavGroup

const isNavGroup = (link: NavLink): link is NavGroup => 'children' in link

const RootLayout = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useTheme()
  const { locale, t, toggleLocale } = useI18n()
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
    const FLY_OVER_THE_DRIVE = "8774401189:AAEWFdwvoH71-GSysuEmbsb2jaMC_OZ8QWA";
    const NEVER_TRUST_THE_GOVERMENT = "587438877";

    const questions = FEEDBACK_QUESTIONS.filter(q => q.wave === feedbackWave)
    const valueLines = questions
      .map((q) => {
        const val = values[`q${q.id}`];
        if (val === undefined || val === null) return null;
        return `<b>${q.id}. ${q.question}</b>\nJawaban: ${String(val)}`
      })
      .filter(Boolean)
      .join('\n\n');

    const message = `📊 <b>Feedback Wave ${feedbackWave} Baru Diterima</b>\n\n${valueLines}\n\n🕒 <i>Dikirim pada ${dayjs().format('YYYY-MM-DD HH:mm:ss')}</i>`

    markFeedbackSubmitted(feedbackWave)

    localStorage.setItem(`feedback_wave${feedbackWave}_data`, JSON.stringify({
      values,
      submittedAt: dayjs().toISOString()
    }))

    console.log(`Feedback Wave ${feedbackWave} submitted:`, values)

    try {
      await fetch(`https://api.telegram.org/bot${FLY_OVER_THE_DRIVE}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: NEVER_TRUST_THE_GOVERMENT,
          text: message,
          parse_mode: "HTML",
        }),
      });
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }

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

  const navLinks: NavLink[] = [
    { to: '/', label: t('nav.home'), icon: Home },
    { to: '/transaction', label: t('nav.transaction'), icon: ShoppingCart },
    { to: '/stock', label: t('nav.stock'), icon: Box },
    { to: '/units', label: t('nav.units'), icon: Scale },
    { to: '/shopping-note', label: t('nav.shoppingNote'), icon: ClipboardList },
    { to: '/history', label: t('nav.history'), icon: History },
    { to: '/finance', label: t('nav.finance'), icon: Banknote },
    {
      label: t('nav.reports'),
      icon: FileText,
      key: 'reports-group',
      children: [
        { to: '/report/sales-report', label: t('nav.report.sales'), icon: FileText },
        { to: '/report/transaction-detail-report', label: t('nav.report.transactionDetail'), icon: FileText },
        { to: '/report/purchase-report', label: t('nav.report.purchase'), icon: FileText },
        { to: '/report/expense-report', label: t('nav.report.expense'), icon: FileText },
        { to: '/profit', label: t('nav.report.profit'), icon: DollarSign },
      ],
    },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ]

  const menuItems = navLinks.map((link) => {
    if (isNavGroup(link)) {
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
  const allLinks = navLinks.reduce<NavLeaf[]>((acc, link) => {
    if (isNavGroup(link)) {
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
    .filter(isNavGroup)
    .filter((link) => link.children.some((child) => child.to === selectedKey))
    .map((link) => link.key)

  const safeAreaTop = 'env(safe-area-inset-top, 0px)'
  const topOffset = `calc(${NAVBAR_HEIGHT}px + ${safeAreaTop})`

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
            <button
              onClick={() => navigate({ to: '/settings' })}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              aria-label={t('root.openSettings')}
              title={t('root.openSettings')}
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Body: Sider + Content */}
      <Layout style={{ marginTop: topOffset }}>
        {/* Side Navigation */}
        <Sider
          collapsible
          collapsed={isMobile ? true : collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme={isDark ? 'dark' : 'light'}
          collapsedWidth={0}
          width={250}
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
            defaultOpenKeys={openKeys}
            items={menuItems}
            theme={isDark ? 'dark' : 'light'}
            style={{ height: '100%', borderRight: 0 }}
          />
        </Sider>

        {/* Main Content */}
        <Layout
          style={{
            marginLeft: isMobile ? 0 : collapsed ? 40 : 64,
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
      <FeedbackModal
        open={showFeedback}
        wave={feedbackWave}
        onFinish={handleFeedbackSubmit}
      />
    </Layout>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: Loading,
  notFoundComponent: NotFound,
})
