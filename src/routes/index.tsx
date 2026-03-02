import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Box,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  FileText,
  History,
  ShoppingCart
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const menuItems = [
    { to: '/transaction', label: 'Transaksi', icon: ShoppingCart, color: 'text-blue-600', desc: 'Buat dan kelola transaksi penjualan baru' },
    { to: '/stock', label: 'Stok', icon: Box, color: 'text-green-600', desc: 'Tambah, edit, dan kelola inventori produk' },
    { to: '/shopping-note', label: 'Catatan', icon: ClipboardList, color: 'text-yellow-600', desc: 'Kelola catatan belanja harian' },
    { to: '/history', label: 'Riwayat', icon: History, color: 'text-purple-600', desc: 'Lihat dan analisis semua transaksi sebelumnya' },
    { to: '/sales-report', label: 'Lap. Jual', icon: FileText, color: 'text-orange-600', desc: 'Lihat laporan penjualan dengan filter' },
    { to: '/purchase-report', label: 'Lap. Beli', icon: FileSpreadsheet, color: 'text-teal-600', desc: 'Lihat laporan pembelian stok' },
    { to: '/profit', label: 'Keuntungan', icon: DollarSign, color: 'text-emerald-600', desc: 'Analisis keuntungan penjualan' },
  ]

  return (
    <div className="py-6 px-4 md:py-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-4">
            Selamat Datang di Kasirku
          </h1>
          <p className="text-sm md:text-lg text-gray-600">
            Kelola transaksi, stok produk, dan lihat riwayat penjualan Anda dengan mudah
          </p>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-4 md:flex md:flex-wrap md:justify-center gap-3 md:gap-8">
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center justify-center bg-white rounded-lg shadow-sm md:shadow-lg p-2 md:p-6 hover:shadow-md md:hover:shadow-xl transition-all md:w-[200px] md:h-[200px] border border-gray-100 md:border-none"
            >
              <div className="flex justify-center mb-1 md:mb-4">
                <item.icon className={`w-8 h-8 md:w-12 md:h-12 ${item.color}`} />
              </div>
              <h2 className="text-xs md:text-xl font-medium md:font-bold text-gray-900 text-center">
                {item.label}
              </h2>
              <p className="hidden md:block text-xs text-gray-500 text-center mt-2 line-clamp-2">
                {item.desc}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

