// Sandbox review drafts. Replace these versioned texts after legal review before production.
export const TERMS_VERSION = 'sandbox-draft-2026-09-09';
export const PRIVACY_VERSION = 'sandbox-draft-2026-09-09';
export const TERMS_TEXT = `Syarat Layanan Frayukti — draf uji sandbox

Frayukti menyediakan aplikasi pengelolaan usaha untuk satu badan usaha. Paket menentukan modul yang dapat dipakai, tanpa pembatasan outlet, perangkat, atau pengguna pada tahap awal. Akun langganan terpisah dari akun karyawan dan data operasional.

Trial berlangsung maksimal 90 hari sejak persetujuan. Setelah trial atau akses bulanan berakhir, transaksi, perubahan data, dan laporan operasional diblokir. Pembayaran, pemeriksaan/pemulihan akses, dan ekspor backup tetap tersedia.

Langganan dibayar manual setiap bulan melalui Midtrans. Harga paket belum termasuk pajak yang wajib dipungut. Harga peluncuran berlaku 12 bulan pertama pelanggan aktif; perubahan selanjutnya diberitahukan minimal 30 hari sebelumnya. Paket Custom mencakup modul yang dipilih dan biaya setup sekali, bukan pengembangan fitur baru.

Aktivasi mengikuti pembayaran yang diverifikasi layanan billing. Pembayaran tertunda atau kembali dari checkout tidak mengaktifkan akses. Perpanjangan paket sama dimulai dari akhir akses berbayar yang masih aktif. Perubahan paket dilakukan setelah akses berbayar sebelumnya habis. Pembayaran ganda, refund, dan gangguan layanan memerlukan pemeriksaan melalui kanal dukungan resmi yang akan ditetapkan sebelum rilis.

Pemilik bertanggung jawab atas backup data lokal serta penyimpanan kode pemulihan rahasia. Pemulihan langganan tidak memindahkan transaksi atau memberikan role operasional. Akses yang sudah diterima dapat dipakai offline sampai masa berlakunya berakhir.

Ini lingkungan sandbox untuk pengujian, tanpa tagihan uang nyata. Identitas badan hukum penyedia, kontak dukungan, ketentuan tanggung jawab dan pengembalian dana final harus dilengkapi serta ditinjau sebelum layanan produksi diluncurkan.`;
export const PRIVACY_TEXT = `Kebijakan Privasi Frayukti — draf uji sandbox

Layanan memproses nama pemilik, nama usaha, WhatsApp, jenis usaha, serta email dan lokasi jika diberikan, untuk menyediakan trial, identitas langganan, pembayaran, dan pemulihan akses. Persetujuan syarat, versi/hash dokumen, waktu persetujuan, dan status marketing dicatat.

Data lead dan billing disimpan terpisah dari database transaksi usaha. Layanan billing tidak menerima data POS, stok, pelanggan, supplier, atau dokumen keuangan. Nama dan kontak pemilik serta metadata pembayaran diteruskan ke Midtrans untuk checkout. Infrastruktur produksi direncanakan di Dewaweb Jakarta dengan backup di Indonesia.

Lead direncanakan disimpan 12 bulan sejak aktivitas terakhir; metadata billing dan bukti pembayaran disimpan 10 tahun di Indonesia. Akses infrastruktur dibatasi dan backup dienkripsi. Pelaksanaan retensi dan prosedur insiden harus ditetapkan sebelum produksi.

Marketing melalui WhatsApp/email bersifat opsional, tidak dicentang secara bawaan, dan dapat ditarik melalui halaman Langganan. Pemrosesan yang diperlukan untuk layanan tidak bergantung pada consent marketing. Hak akses, koreksi, penghapusan, serta pelaporan insiden dapat diajukan melalui kontak penyedia yang harus dilengkapi sebelum rilis.

Ini naskah sandbox untuk peninjauan. Gunakan data uji selama pengujian.`;
