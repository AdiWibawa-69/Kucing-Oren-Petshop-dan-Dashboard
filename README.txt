KUCING OREN POS - VERSI ONLINE
==============================

Isi folder
  server.js     server (tanpa instalasi library, cukup Node.js 18 ke atas)
  index.html    aplikasi POS
  sync-lib.js   pustaka sinkronisasi (wajib ada di folder yang sama)
  data/         dibuat otomatis, berisi state.json = SELURUH data toko

Cara menjalankan (di komputer toko)
  1. Pasang Node.js dari https://nodejs.org (versi LTS).
  2. Buka terminal / Command Prompt di folder ini, lalu ketik:  node server.js
  3. Server menampilkan alamat, misalnya:
       Di komputer ini : http://localhost:3000
       Dari HP/komputer lain: http://192.168.1.20:3000
  4. Buka alamat itu di dua browser (atau dua perangkat di Wi-Fi yang sama).
  5. Pertama kali: layar "Setup awal" meminta Anda membuat akun MANAJER.
     Setelah itu manajer menambah akun KASIR di Pengaturan > Pengguna & PIN.

Alur retur online
  Kasir ajukan retur -> langsung muncul di browser manajer (notifikasi + lencana
  merah di tombol Kasir) -> manajer klik Setujui/Tolak -> hasilnya langsung tampil
  di browser kasir, stok dan kas ikut berubah otomatis.

Agar manajer bisa menyetujui dari luar toko (internet)
  Server harus bisa diakses dari internet. Pilihan paling mudah:
  - Sewa VPS kecil (sekitar Rp60-80 ribu/bulan), salin folder ini, jalankan
    "node server.js" (pakai pm2 atau systemd agar jalan terus), lalu pasang HTTPS
    (misalnya Caddy atau Cloudflare Tunnel). HTTPS WAJIB bila lewat internet
    karena PIN dikirim ke server.
  - Atau layanan seperti Railway / Fly.io dengan "volume" (penyimpanan permanen)
    dan set  DATA_DIR  ke folder volume tersebut. Hindari hosting gratis yang
    menghapus file saat restart, karena data tersimpan di data/state.json.
  Pengaturan opsional (environment variable): PORT, HOST, DATA_DIR.


Fitur Pelanggan & Grooming (menu "Pelanggan")
  - Pelanggan & Kucing : data pemilik (nama, WhatsApp), kucing (ras, warna, berat,
                         catatan kesehatan), riwayat grooming per kucing.
  - Papan Grooming     : antrian Menunggu -> Dikerjakan -> Selesai -> Diambil,
                         dipakai bersama semua perangkat. Tombol "Simpan & ke Kasir"
                         memasukkan layanan ke keranjang; nama pelanggan terisi otomatis
                         dan antrian tertaut ke transaksi (status Lunas / Belum lunas).
  - Pengingat          : daftar kucing yang sudah waktunya grooming lagi (default 30 hari,
                         bisa diatur) dengan tombol kirim WhatsApp.
  Kasir boleh menambah/mengubah data ini, tetapi hanya manajer yang boleh menghapus
  pelanggan atau kucing.

Peran, shift, dan groomer
  - Hanya ada dua jenis akun: MANAJER dan KASIR (dibuat di Pengaturan > Pengguna & PIN).
  - Saat kasir membuka shift, nama kasir dipilih dari daftar akun kasir (bukan diketik).
  - Manajer tidak membuka/menutup shift. Di panel Shift, manajer melihat riwayat dengan tiga
    tampilan: Terbaru, Minggu (siapa jaga tiap hari), dan Bulan (kalender, ketuk tanggal untuk
    detail) beserta rekap per kasir. Kasir yang lupa menutup shift bisa ditutup paksa oleh manajer.
  - GROOMER bukan akun. Namanya ditambahkan manajer di Pengaturan > Groomer dan hanya dipakai
    sebagai pilihan di Papan Grooming. Groomer tidak memakai aplikasi POS.

Backup
  Salin file data/state.json secara berkala (atau pakai Pengaturan > Unduh Backup).
  Memulihkan backup lewat Pengaturan akan menggantikan data untuk semua perangkat.

Catatan keamanan
  - PIN disimpan terenkripsi (scrypt) di server dan diperiksa oleh server.
  - Server menolak kasir yang mencoba memalsukan retur, mengubah pengguna, atau
    mengubah data master/harga. Namun ini bukan sistem keamanan tingkat bank:
    gunakan HTTPS, PIN yang tidak mudah ditebak, dan jangan bagikan PIN manajer.
  - Bila PIN manajer lupa dan tidak ada manajer lain, hapus akun di
    data/state.json (bagian "users") saat server mati; layar setup akan muncul lagi.

Membuka index.html langsung (tanpa server)
  Tetap bisa, tetapi berjalan MODE OFFLINE satu perangkat (data di browser itu saja,
  persetujuan retur lewat kode WhatsApp).
