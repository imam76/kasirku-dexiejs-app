import { Link } from '@tanstack/react-router'
import { Home, ArrowLeft } from 'lucide-react'

export const NotFound = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-3xl font-semibold text-gray-700 mb-2">
            Halaman Tidak Ditemukan
          </h2>
          <p className="text-gray-600 text-lg mb-8">
            Maaf, halaman yang Anda cari tidak ada atau telah dihapus.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            to="/"
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Home size={20} />
            Kembali ke Beranda
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 bg-gray-300 text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors"
          >
            <ArrowLeft size={20} />
            Kembali
          </button>
        </div>
      </div>
    </div>
  )
}
