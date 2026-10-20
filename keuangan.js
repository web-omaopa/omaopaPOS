/* =====================================================================
   keuangan.js
   Daftar Detail Kategori produk dan akun laporan keuangannya.
   Kode & nama akun sama dengan Chart of Account di ESB
   (PT Ultima Rasa Nusantara), supaya Laba Rugi POS bisa dicocokkan.

   - Setiap produk (kecuali topping) memilih satu Detail Kategori.
   - Topping ikut Detail Kategori kuenya.
   - HPP % per Detail Kategori disimpan di Firestore
     (koleksi "detail_kategori", field hppPersen) dan diatur di
     Pengaturan > Pemetaan & HPP.
   - Kalau file ini diubah, naikkan versi ?v=... di semua halaman
     yang memuatnya (CDN Hostinger menyimpan file .js 7 hari).
========================================================================= */

const DETAIL_KATEGORI = [
    { nama: "Malmil",     penjualan: ["4 1 01 07", "Penjualan - Malmil"],     cogs: ["5 1 01 06", "COGS - Malmil"],     diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Ogura",      penjualan: ["4 1 01 06", "Penjualan - Ogura"],      cogs: ["5 1 01 05", "COGS - Ogura"],      diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Mini Ogura", penjualan: ["4 1 01 08", "Penjualan - Mini Ogura"], cogs: ["5 1 01 07", "COGS - Mini Ogura"], diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Cisfon",     penjualan: ["4 1 01 09", "Penjualan - Cisfon"],     cogs: ["5 1 01 08", "COGS - Cisfon"],     diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Snibby",     penjualan: ["4 1 01 10", "Penjualan - Snibby"],     cogs: ["5 1 01 09", "COGS - Snibby"],     diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Roti Manis", penjualan: ["4 1 01 11", "Penjualan - Roti Manis"], cogs: ["5 1 01 10", "COGS - Roti Manis"], diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Makanan",    penjualan: ["4 1 01 01", "Penjualan - Makanan"],    cogs: ["5 1 01 01", "COGS - Makanan"],    diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Minuman",    penjualan: ["4 1 01 02", "Penjualan - Minuman"],    cogs: ["5 1 01 02", "COGS - Minuman"],    diskon: ["4 1 03 03", "Diskon Minuman"] },
    { nama: "Konsinyasi", penjualan: ["4 1 01 05", "Penjualan - Konsinyasi"], cogs: ["5 1 01 04", "COGS - Konsinyasi"], diskon: ["4 1 03 02", "Diskon Makanan"] },
    { nama: "Lainnya",    penjualan: ["4 1 01 03", "Penjualan - Lainya"],     cogs: ["5 1 01 03", "COGS - Lainya"],     diskon: ["4 1 03 05", "Diskon Lainya"] }
];

/* Produk tanpa Detail Kategori dicatat ke kelompok ini di laporan */
const DETAIL_CADANGAN = "Lainnya";

function cariDetailKategori(nama) {
    for (let i = 0; i < DETAIL_KATEGORI.length; i++) {
        if (DETAIL_KATEGORI[i].nama === nama) return DETAIL_KATEGORI[i];
    }
    return null;
}
