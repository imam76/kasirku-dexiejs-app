import FeedbackModal from '@/components/FeedbackModal'
import { Loading } from '@/components/Loading'
import { NotFound } from '@/components/NotFound'
import { FEEDBACK_QUESTIONS } from '@/constants/feedback'
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
  FileDown,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  Moon,
  Scale,
  Settings,
  SettingsIcon,
  ShoppingCart,
  Sun
} from 'lucide-react'
import { useEffect, useState } from 'react'

const { Content, Sider } = Layout

const RootLayout = () => {
  const router = useRouter()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackWave, setFeedbackWave] = useState<1 | 2>(1)

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

  const handleFeedbackSubmit = async (values: any) => {
    const BOT_TOKEN = import.meta.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = import.meta.env.TELEGRAM_CHAT_ID;
    
    const questions = FEEDBACK_QUESTIONS.filter(q => q.wave === feedbackWave)
    const valueLines = questions
      .map((q) => {
        const val = values[`q${q.id}`];
        if (val === undefined || val === null) return null;
        return `<b>${q.id}. ${q.question}</b>\nJawaban: ${val}`
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
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      });
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }

    setShowFeedback(false)
    notification.success({
      message: 'Terima Kasih!',
      description: 'Feedback Anda sangat berharga bagi kami.',
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
        { to: '/report/sales-report', label: 'Penjualan', icon: FileText },
        { to: '/report/purchase-report', label: 'Pembelian', icon: FileSpreadsheet },
        { to: '/report/expense-report', label: 'Pengeluaran', icon: FileDown },
        { to: '/report/profit', label: 'Keuntungan', icon: DollarSign },
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