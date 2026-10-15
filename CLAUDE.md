# Oma Opa POS

Sistem kasir (POS) multi-outlet untuk Oma Opa. Situs: https://pos.omaopa.store (GitHub Pages, lihat `CNAME`).

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
- `roles.js` : sumber tunggal hak akses per role (`ROLE_PERMISSIONS`, `HALAMAN_INFO`)
- Halaman terencana tapi belum ada: `riwayat.html`, `laporan.html`

## Koleksi Firestore yang dipakai
users, outlets, products, stock, transfer_stok, promo, mode_penjualan,
laporan_stok, kategori_produk, transactions, alokasi_log

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

## Cara menjalankan lokal
Jalankan server statis di folder ini, misalnya `npx serve .` lalu buka `http://localhost:3000`.
