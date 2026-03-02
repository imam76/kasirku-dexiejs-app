import { Link, createFileRoute } from '@tanstack/react-router'
import { Package, ShoppingCart, History, BarChart3 } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="py-12 px-4">
      <div className="max-w-6xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Selamat Datang di Kasirku
        </h1>
        <p className="text-lg text-gray-600 mb-12">
          Kelola transaksi, stok produk, dan lihat riwayat penjualan Anda dengan mudah
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            to="/transaction"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow hover:bg-blue-50"
          >
            <div className="flex justify-center mb-4">
              <ShoppingCart size={48} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Transaksi</h2>
            <p className="text-gray-600 mb-4">
              Buat dan kelola transaksi penjualan baru
            </p>
            <span className="text-blue-600 font-semibold">Buka →</span>
          </Link>

          <Link
            to="/stock"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow hover:bg-blue-50"
          >
            <div className="flex justify-center mb-4">
              <Package size={48} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Manajemen Stok</h2>
            <p className="text-gray-600 mb-4">
              Tambah, edit, dan kelola inventori produk
            </p>
            <span className="text-blue-600 font-semibold">Buka →</span>
          </Link>

          <Link
            to="/history"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow hover:bg-blue-50"
          >
            <div className="flex justify-center mb-4">
              <History size={48} className="text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Riwayat</h2>
            <p className="text-gray-600 mb-4">
              Lihat dan analisis semua transaksi sebelumnya
            </p>
            <span className="text-blue-600 font-semibold">Buka →</span>
          </Link>

          <Link
            to="/sales-report"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow hover:bg-blue-50"
          >
            <div className="flex justify-center mb-4">
              <BarChart3 size={48} className="text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Laporan</h2>
            <p className="text-gray-600 mb-4">
              Lihat laporan penjualan dan pembelian dengan filter tanggal
            </p>
            <span className="text-blue-600 font-semibold">Buka →</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

