import {
  FileExcelOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/report/')({
  component: Laporan,
})

function Laporan() {
  const menuItems = [
    { to: '/report/sales-report', label: 'Lap. Jual', icon: FileTextOutlined, color: 'text-orange-600', desc: 'Lihat laporan penjualan dengan filter' },
    { to: '/report/purchase-report', label: 'Lap. Beli', icon: FileExcelOutlined, color: 'text-teal-600', desc: 'Lihat laporan pembelian stok' },
    { to: '/report/expense-report', label: 'Lap. Pengeeluaran', icon: FileExcelOutlined, color: 'text-red-600', desc: 'Lihat laporan biaya' },
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

        {/* Header */}
        <div className="text-center mb-7 sm:mb-9 lg:mb-12">
          <h1
            className="
        text-[20px] font-medium tracking-tight leading-[1.3] text-gray-900 mb-2
        sm:text-[26px] sm:mb-[10px]
        lg:text-[34px] lg:tracking-[-0.02em] lg:leading-[1.2] lg:mb-[14px]
      "
          >
            Selamat Datang di Kasirku
          </h1>

          <p
            className="
        text-[12px] text-gray-400 leading-[1.618] px-2
        sm:text-sm sm:max-w-[420px] sm:mx-auto sm:px-0
        lg:text-base lg:max-w-[560px] lg:font-light
      "
          >
            Kelola transaksi, stok produk, dan lihat riwayat penjualan Anda dengan
            mudah
          </p>
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

