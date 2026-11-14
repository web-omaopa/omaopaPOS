# Oma Opa POS

Sistem kasir (POS) multi-outlet untuk Oma Opa. Situs: https://pos.omaopa.store (Hostinger, deploy otomatis dari branch `main`).

## Teknologi
- Frontend: HTML statis + JavaScript di tiap halaman (tanpa build step, tanpa framework).
- Backend: Firebase (Auth email/password + Firestore), memakai SDK compat 10.13.0 dari CDN gstatic.
- Firebase project: `omaopa-pos`.
- Login memakai "username" yang dipetakan ke email Firebase Auth (lihat `index.html`).

## Struktur file
- `index.html` : login
- `beranda.html` : menu utama sesuai role
- `pos.html` : kasir (file terbesar, ~1900 baris)
- `stok.html`, `alokasi.html` (Manajemen Menu), `transfer.html` : stok antar outlet
- `pengaturan.html`, `produk.html`, `user.html` : pengelolaan produk, outlet, user
- `api/upload-foto.php`, `api/foto.php` : upload & tampil foto produk (`?f=`) dan bukti pengeluaran (`jenis=bukti`, `?b=`) di Hostinger (PHP). Disimpan di `foto_produk/` dan `bukti_pengeluaran/` di luar `public_html` supaya tidak hilang saat deploy ulang.
- `roles.js` : sumber tunggal hak akses per role (`ROLE_PERMISSIONS`, `HALAMAN_INFO`)
- `stok-batch.js` : stok outlet per batch (masa berlaku kue reset 24 jam / akumulasi `masaTahanHari`), jual paling lama dulu, sisa & kedaluwarsa dicatat ke `waste_stok`. Dipakai `pos.html`, `alokasi.html`, `transfer.html`, `stok.html`
- `kas.html` + `kas.js` : "Shift & Kas": buka toko / mulai shift dengan kas awal di `pos.html`, dasbor uang di laci (realtime), pengeluaran outlet, Akhiri Shift / Tutup Toko 3 langkah (hitung per pecahan, cek selisih, cetak), Rekap Shift + unduh CSV
- `laporan.html` : daftar laporan + Rekap penjualan, Penjualan per produk, Laba Rugi (termasuk beban pengeluaran outlet & selisih kas), Kas & Pengeluaran, Waste (filter, download Excel/PDF)
- `keuangan.js` : akun penjualan/COGS/diskon per detail kategori (bawaan + tambahan dari Pengaturan › Pemetaan & HPP, koleksi `detail_kategori`; halaman memanggil `keuDengarDetailKategori`/`keuMuatDetailKategori`), `AKUN_LR` (susunan Laba Rugi = Profit Loss Report ESB), `AKUN_PENGELUARAN` (kategori pengeluaran -> akun beban), akun waste & selisih kas
- `member.js` : pencarian member di Kasir (nama -> nama + no HP disamarkan). Data dari API web member (`MEMBER_API_URL`, belum diisi); sebelum tersambung pakai data contoh hanya di localhost / `?member=contoh`. Transaksi menyimpan `member: {id, nama, hp}` atau null
- Halaman terencana tapi belum ada: `riwayat.html`

## Koleksi Firestore yang dipakai
users, outlets, products, stock, transfer_stok, promo, mode_penjualan,
laporan_stok, kategori_produk, transactions, alokasi_log,
ringkasan_harian (penjualan/diskon/qty/cogs per detail kategori), detail_kategori (akun detail tambahan, lihat `keuangan.js`),
products.hpp = HPP Rp per pcs (COGS & nilai waste di Laba Rugi; item transaksi menyimpan `hpp` saat dijual),
sesi_kas, pengeluaran (skema di komentar atas `kas.js`),
waste_stok (skema di komentar atas `stok-batch.js`)

## Role
management, admin, owner, kasir (forecaster disebut untuk pembuatan transfer).
Hak akses diubah di `roles.js`, bukan di tiap halaman.

## Aturan kerja untuk Claude
- Kerja di branch baru (`claude/<topik>`), jangan commit langsung ke `main`.
- Repo ini publik: jangan pernah commit password, service account, atau token.
- Jangan ubah skema/nama koleksi Firestore atau Firestore Rules tanpa bertanya dulu.
- Uji hanya di project Firebase staging atau emulator, bukan data transaksi produksi.
- Perubahan di `pos.html` (transaksi, diskon, total) harus dijelaskan dan ditinjau dengan teliti.
- Gambar produk sangat besar (`logo.png` 14 MB); jangan menambah gambar tanpa dikompres.
- Pertahankan gaya kode dan bahasa UI (Indonesia) yang sudah ada.
- CDN Hostinger menyimpan file .js selama 7 hari. Setiap kali `roles.js` diubah, naikkan versi di `<script src="roles.js?v=...">` di SEMUA halaman, kalau tidak browser memakai roles.js lama dan halaman bisa blank.

## Cara menjalankan lokal
Jalankan server statis di folder ini, misalnya `npx serve .` lalu buka `http://localhost:3000`.
