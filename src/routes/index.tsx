import {
  AccountBookOutlined,
  BankOutlined,
  DollarOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ProductOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  SwapOutlined
} from '@ant-design/icons'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import dayjs from '@/lib/dayjs'
import { formatCurrency } from '@/utils/formatters'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const todaySales = useLiveQuery(
    async () => {
      const startOfToday = dayjs.tz().startOf('day').toISOString()
      const endOfToday = dayjs.tz().endOf('day').toISOString()
      const transactions = await db.transactions
        .where('created_at')
        .between(startOfToday, endOfToday, true, true)
        .toArray()

      return {
        total: transactions.reduce((sum, transaction) => sum + transaction.total_amount, 0),
        count: transactions.length,
      }
    },
    [],
    { total: 0, count: 0 },
  )
  const averageTransaction = todaySales.count > 0 ? todaySales.total / todaySales.count : 0

  const menuItems = [
    { to: '/transaction', label: 'Kasir', icon: ShoppingCartOutlined, color: 'text-blue-600', desc: 'Buat dan kelola transaksi penjualan baru' },
    { to: '/finance', label: 'Keuangan', icon: BankOutlined, color: 'text-red-600', desc: 'Lihat ringkasan keuangan bisnis Anda secara real-time' },
    { to: '/stock', label: 'Stok', icon: ProductOutlined, color: 'text-green-600', desc: 'Tambah, edit, dan kelola inventori produk' },
    { to: '/shopping-note', label: 'Catatan', icon: AccountBookOutlined, color: 'text-yellow-600', desc: 'Kelola catatan belanja harian' },
    { to: '/history', label: 'Riwayat', icon: HistoryOutlined, color: 'text-purple-600', desc: 'Lihat dan analisis semua transaksi sebelumnya' },
    // { to: '/sales-report', label: 'Lap. Jual', icon: FileTextOutlined, color: 'text-orange-600', desc: 'Lihat laporan penjualan dengan filter' },
    // { to: '/purchase-report', label: 'Lap. Beli', icon: FileExcelOutlined, color: 'text-teal-600', desc: 'Lihat laporan pembelian stok' },
    { to: '/units', label: 'Satuan Konversi', icon: SwapOutlined, color: 'text-cyan-600', desc: 'Kelola konversi satuan produk' },
    { to: '/profit', label: 'Keuntungan', icon: DollarOutlined, color: 'text-emerald-600', desc: 'Analisis keuntungan penjualan' },
    { to: '/report', label: 'Laporan', icon: FileTextOutlined, color: 'text-orange-600', desc: 'Lihat laporan penjualan dan pembelian' },
    { to: '/settings', label: 'Pengaturan', icon: SettingOutlined, color: 'text-gray-600', desc: 'Backup dan restore database aplikasi' },
  ]

  return (
    <div
      className="
  py-4 px-3
  sm:py-6 sm:px-5
  lg:py-[38px] lg:px-8
"
    >
      <div className="max-w-[974px] mx-auto">
        {/* Today's Sales Widget */}
        <div
          className="
            mb-5
            sm:mb-7
            lg:mb-9
            lg:max-w-[834px] lg:mx-auto
          "
        >
          <Link
            to="/report/sales-report"
            className="
              group relative block overflow-hidden bg-white border border-gray-100 rounded-[10px]
              px-4 py-4 transition-all duration-200 ease-out
              hover:border-gray-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)]
              hover:-translate-y-[1px]
              sm:rounded-[12px] sm:px-6 sm:py-6
              lg:rounded-[14px] lg:px-7 lg:py-7
            "
          >
            <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-emerald-50/70 sm:h-36 sm:w-36" />
            <div className="pointer-events-none absolute right-5 top-5 hidden h-16 w-16 rounded-full bg-emerald-50/80 sm:block" />

            <div className="relative">
              <div
                className="
                  flex items-start justify-between gap-3
                  pb-4 border-b border-gray-100
                  sm:pb-5
                "
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="
                      flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50
                      sm:h-12 sm:w-12
                      lg:h-[54px] lg:w-[54px]
                    "
                  >
                    <DollarOutlined className="text-[24px] text-emerald-600 sm:text-[26px] lg:text-[30px]" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-[15px] font-medium leading-[1.3] text-gray-900 sm:text-[18px] lg:text-[20px]">
                      Total penjualan hari ini
                    </h2>
                    <p className="mt-1 text-[12px] text-gray-500 leading-[1.4] sm:text-[14px]">
                      {dayjs.tz().format('dddd, D MMMM YYYY')}
                    </p>
                  </div>
                </div>

                <span
                  className="
                    relative z-10 shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700
                    sm:px-4 sm:text-[12px]
                  "
                >
                  {todaySales.count} transaksi
                </span>
              </div>

              <div className="py-5 border-b border-gray-100 sm:py-6 lg:py-7">
                <p className="text-[11px] font-medium uppercase leading-none text-gray-500 sm:text-[12px]">
                  Total
                </p>
                <p
                  className="
                    mt-3 break-words text-[30px] font-semibold leading-[1.08] text-gray-900 tracking-tight
                    sm:text-[42px]
                    lg:text-[48px]
                  "
                >
                  Rp {formatCurrency(todaySales.total)}
                </p>
              </div>

              <div
                className="
                  grid grid-cols-1 gap-3 pt-4
                  sm:grid-cols-2 sm:pt-5
                "
              >
                <div className="min-w-0 rounded-[10px] bg-gray-50 px-4 py-4 sm:rounded-[12px]">
                  <p className="text-[12px] leading-[1.35] text-gray-500 sm:text-[13px]">
                    Rata-rata / transaksi
                  </p>
                  <p className="mt-2 break-words text-[20px] font-medium leading-[1.2] text-gray-900 sm:text-[22px]">
                    Rp {formatCurrency(Math.round(averageTransaction))}
                  </p>
                </div>

                <div className="min-w-0 rounded-[10px] bg-gray-50 px-4 py-4 sm:rounded-[12px]">
                  <p className="text-[12px] leading-[1.35] text-gray-500 sm:text-[13px]">
                    Jumlah transaksi
                  </p>
                  <p className="mt-2 text-[20px] font-medium leading-[1.2] text-gray-900 sm:text-[22px]">
                    {todaySales.count} transaksi
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Grid */}
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
            flex flex-col items-center justify-center
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
            hidden
            sm:block sm:text-[11px] sm:text-gray-400 sm:text-center sm:leading-[1.618] sm:line-clamp-2
            lg:text-[12px]
          "
              >
                {item.desc}
              </p>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
