import { ChefHat, CircleDollarSign, ClipboardList, Coffee, ConciergeBell, MonitorCheck, ScanLine, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FlowStep {
  icon: LucideIcon;
  title: string;
  description: string;
  role: string;
}

const FLOWS: Array<{ title: string; badge: string; description: string; steps: FlowStep[] }> = [
  {
    title: 'Counter service · bayar di awal', badge: 'Kafe / QSR', description: 'Pelanggan memesan dan membayar di counter, lalu mengambil pesanan atau duduk.',
    steps: [
      { icon: ScanLine, title: 'Catat pesanan', description: 'Pilih dine-in atau takeaway, menu, modifier, dan nomor antrean.', role: 'Kasir' },
      { icon: CircleDollarSign, title: 'Terima pembayaran', description: 'Tunai, QRIS, kartu, atau kombinasi metode pembayaran.', role: 'Kasir' },
      { icon: MonitorCheck, title: 'Kirim ke produksi', description: 'Tiket otomatis dipisah ke dapur, bar, atau dessert.', role: 'Sistem' },
      { icon: ConciergeBell, title: 'Serahkan pesanan', description: 'Panggil nomor antrean atau antar ke meja.', role: 'Runner' },
    ],
  },
  {
    title: 'Table service · bayar di akhir', badge: 'Restoran', description: 'Pesanan melekat pada meja dan dapat ditambah berkali-kali sebelum tagihan ditutup.',
    steps: [
      { icon: Users, title: 'Buka meja', description: 'Pilih area, meja, jumlah tamu, dan waiter penanggung jawab.', role: 'Host / waiter' },
      { icon: ClipboardList, title: 'Ambil pesanan', description: 'Tambahkan menu dan catatan, lalu kirim hanya item baru ke dapur.', role: 'Waiter' },
      { icon: ChefHat, title: 'Proses di KDS', description: 'Dapur mengubah status baru, dibuat, lalu siap diantar.', role: 'Dapur / bar' },
      { icon: CircleDollarSign, title: 'Tutup tagihan', description: 'Cetak bill, split bila perlu, terima pembayaran, lalu bersihkan meja.', role: 'Kasir' },
    ],
  },
  {
    title: 'Hybrid · bayar dulu, antar ke meja', badge: 'Kafe modern', description: 'Kecepatan counter service dengan nomor meja untuk memudahkan pengantaran.',
    steps: [
      { icon: Coffee, title: 'Pilih menu', description: 'Pelanggan menyebutkan menu dan nomor meja di counter.', role: 'Pelanggan / kasir' },
      { icon: CircleDollarSign, title: 'Bayar langsung', description: 'Transaksi selesai sebelum pesanan mulai dibuat.', role: 'Kasir' },
      { icon: MonitorCheck, title: 'Pantau produksi', description: 'KDS menampilkan nomor meja dan detail item.', role: 'Dapur / bar' },
      { icon: Sparkles, title: 'Antar ke meja', description: 'Runner mengantar dan menandai tiket selesai.', role: 'Runner' },
    ],
  },
];

export function RestaurantFlowGuide() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white p-5 dark:border-orange-900/70 dark:from-orange-950/40 dark:via-amber-950/20 dark:to-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">Peta pengalaman</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Tiga pola POS resto yang umum</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Pilih alur sesuai model layanan. Fitur meja dan open bill tidak wajib untuk kafe yang selalu menerima pembayaran di awal.</p>
      </div>

      {FLOWS.map((flow) => (
        <section key={flow.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
            <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-slate-900 dark:text-white">{flow.title}</h3><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">{flow.badge}</span></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{flow.description}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4">
            {flow.steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="relative border-b border-slate-100 p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 dark:border-slate-800">
                  <div className="flex items-start gap-3 md:block">
                    <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900"><Icon size={20} /><span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-900">{index + 1}</span></div>
                    <div className="md:mt-4"><p className="text-xs font-bold uppercase tracking-wider text-orange-500">{step.role}</p><h4 className="mt-1 font-black text-slate-800 dark:text-slate-100">{step.title}</h4><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.description}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
