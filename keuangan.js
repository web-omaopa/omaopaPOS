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

/* =====================================================================
   SUSUNAN LABA RUGI mengikuti "Profit Loss Report" ESB (PT Ultima Rasa
   Nusantara): urutan, kode & nama akun sama supaya bisa dicocokkan baris
   per baris. Akun yang belum punya sumber data di POS tampil sebagai nol.
========================================================================= */
const AKUN_LR = {
    penjualan: [
        ["4 1 01 01", "Penjualan - Makanan"], ["4 1 01 02", "Penjualan - Minuman"], ["4 1 01 03", "Penjualan - Lainya"],
        ["4 1 01 04", "Sales - Order fee"], ["4 1 01 05", "Penjualan - Konsinyasi"], ["4 1 01 06", "Penjualan - Ogura"],
        ["4 1 01 07", "Penjualan - Malmil"], ["4 1 01 08", "Penjualan - Mini Ogura"], ["4 1 01 09", "Penjualan - Cisfon"],
        ["4 1 01 10", "Penjualan - Snibby"], ["4 1 01 11", "Penjualan - Roti Manis"], ["4 1 02 01", "Penjualan - Transfer"],
        ["4 1 04 01", "Other Revenue/Income"]
    ],
    diskon: [
        ["4 1 03 01", "Bill Discount"], ["4 1 03 02", "Diskon Makanan"], ["4 1 03 03", "Diskon Minuman"],
        ["4 1 03 04", "Diskon Penjualan"], ["4 1 03 05", "Diskon Lainya"]
    ],
    cogs: [
        ["5 1 01 01", "COGS - Makanan"], ["5 1 01 02", "COGS - Minuman"], ["5 1 01 03", "COGS - Lainya"],
        ["5 1 01 04", "COGS - Konsinyasi"], ["5 1 01 05", "COGS - Ogura"], ["5 1 01 06", "COGS - Malmil"],
        ["5 1 01 07", "COGS - Mini Ogura"], ["5 1 01 08", "COGS - Cisfon"], ["5 1 01 09", "COGS - Snibby"],
        ["5 1 01 10", "COGS - Roti Manis"], ["5 1 02 01", "COGS - Penjualan Transfer"], ["5 1 03 01", "COGS Variance"],
        ["5 1 03 02", "COGS Minus Resolve Variance"]
    ],
    operasional: [
        ["6 1 01 01", "Iklan & Promosi"], ["6 1 01 02", "Biaya Potongan Merchant"], ["6 1 01 03", "Entertainment"],
        ["6 1 01 05", "Pengeluaran Produk Dihancurkan"], ["6 1 01 06", "Biaya Marketing"], ["6 1 01 07", "Beban Salah Nota"],
        ["6 1 01 08", "Biaya Operasional"], ["6 1 01 09", "Topping Terbuang"], ["6 1 01 10", "Bumil Promotion"],
        ["6 1 01 11", "Kompensasi"], ["6 1 01 12", "Produk RnD"],
        ["6 1 02 01", "Gaji Kasir"], ["6 1 02 02", "Tabungan untuk THR"], ["6 1 02 03", "Employee Income Tax"],
        ["6 1 02 04", "Casual Labour"], ["6 1 02 05", "BPJS"], ["6 1 02 06", "Biaya Backup Kasir"],
        ["6 1 02 07", "Reward"], ["6 1 02 08", "Gaji Office"], ["6 1 02 09", "Pengembangan Karyawan"],
        ["6 1 02 10", "Dana Upgrading"], ["6 1 02 11", "Dana Darurat"],
        ["6 1 03 01", "Eating House Rental"], ["6 1 03 02", "Utilities"], ["6 1 03 03", "Biaya Listrik"],
        ["6 1 03 04", "Biaya Air PAM"], ["6 1 03 05", "Google Maps Review"], ["6 1 03 06", "Biaya Kebersihan"],
        ["6 1 03 07", "Biaya Sewa Ruko"], ["6 1 03 08", "Pajak Reklame"], ["6 1 03 09", "Biaya Renovasi Outlet"],
        ["6 1 04 01", "Freight Charges"], ["6 1 04 02", "Biaya Pengiriman"], ["6 1 04 03", "Akomodasi"],
        ["6 1 04 04", "Bensin TVS"], ["6 1 04 05", "Biaya Ongkir ke Customer"], ["6 1 04 06", "Ongkir Promo Delivery"],
        ["6 1 04 07", "Biaya Transfer Kue"],
        ["6 1 05 01", "Operasional Snibby"], ["6 1 05 02", "Consultancy Expense"], ["6 1 05 03", "License Expense"],
        ["6 1 05 04", "Technology expenses"],
        ["6 1 06 01", "Perbaikan dan Pemeliharaan"],
        ["6 1 07 01", "Insurance"], ["6 1 07 02", "Office expense"], ["6 1 07 03", "Postage & Stamps"],
        ["6 1 07 04", "Alat Tulis dan Printing"], ["6 1 07 05", "Telekomunikasi"], ["6 1 07 06", "Uniform"],
        ["6 1 07 07", "Kitchenware & Related Cost"], ["6 1 07 08", "Biaya Rumah Tangga"], ["6 1 07 09", "CSR"],
        ["6 1 07 10", "Biaya ESB"], ["6 1 07 11", "Administrasi Bank"], ["6 1 07 14", "Cadangan Kenaikan Sewa"],
        ["6 1 07 15", "Konsumsi Rapat"]
    ],
    lain: [
        ["7 1 01 01", "Asset Sales Gain or Losses/ Asset Revaluation"], ["7 1 01 02", "Foreign Exhange Gain/(Loss)"],
        ["7 1 01 03", "Pendapatan Bunga"], ["7 1 01 04", "Bank Charges"], ["7 1 01 05", "PB 1 Income"],
        ["7 1 01 06", "Tax expenses"], ["7 1 01 07", "Investment income"], ["7 1 01 08", "Service charge income"],
        ["7 1 01 09", "Miscellaneous Income/(Expense)"], ["7 1 01 10", "Rounding/ POS Adjustment"],
        ["7 1 01 11", "Penyesuaian Persediaan"], ["7 1 01 12", "Pendapatan Lain-lain"], ["7 1 01 13", "Denda Penyesuaian"],
        ["7 1 01 14", "Denda Waste"], ["7 1 01 15", "Kompensasi Produk Dihancurkan"], ["7 1 01 16", "Kompensasi Kue Tidak Standar"]
    ],
    depresiasi: [
        ["6 2 01 01", "Depr - Bulding"], ["6 2 01 02", "Depr - Renovation"], ["6 2 01 03", "Depr - Equipment"], ["6 2 01 04", "Depr - Vehicle"]
    ],
    pajak: [
        ["7 1 02 01", "Pajak  PPh Final"], ["7 1 02 02", "Pajak Sewa"]
    ]
};

/* Kategori pengeluaran outlet (kas.js KATEGORI_PENGELUARAN) -> kode akun beban */
const AKUN_PENGELUARAN = {
    "Salah Nota": "6 1 01 07",
    "Kompensasi Customer": "6 1 01 11",
    "Marketing": "6 1 01 06",
    "Biaya Operasional": "6 1 01 08",
    "Biaya Kebersihan": "6 1 03 06",
    "Pengeluaran Reward": "6 1 02 07",
    "Bensin TVS": "6 1 04 04",
    "Upgrading": "6 1 02 10",
    "Biaya Listrik": "6 1 03 03",
    "Biaya Air PAM": "6 1 03 04",
    "Pengiriman dari Pabrik": "6 1 04 02",
    "Biaya Transfer Kue": "6 1 04 07",
    "Perbaikan dan Pemeliharaan": "6 1 06 01",
    "Biaya Alat Tulis": "6 1 07 04",
    "Telekomunikasi": "6 1 07 05",
    "Konsumsi Rapat": "6 1 07 15",
    "Utilitis": "6 1 03 02",
    "Pengiriman Kue ke Customer": "6 1 04 05",
    "Biaya Backup Kasir": "6 1 02 06",
    "Reward Sniby": "6 1 02 07"
};

/* Akun untuk data lain dari POS */
const AKUN_WASTE = "6 1 01 05";          // waste_stok (stok-batch.js), dinilai HPP
const AKUN_SELISIH_KAS = "7 1 01 10";    // selisih kas saat tutup shift (kas.js)

function cariAkunLR(kode) {
    const semua = [].concat(AKUN_LR.penjualan, AKUN_LR.diskon, AKUN_LR.cogs, AKUN_LR.operasional, AKUN_LR.lain, AKUN_LR.depresiasi, AKUN_LR.pajak);
    for (let i = 0; i < semua.length; i++) if (semua[i][0] === kode) return semua[i];
    return null;
}

/* [kode, nama akun] untuk kategori pengeluaran, atau null kalau belum dipetakan */
function cariAkunPengeluaran(kategori) {
    const kode = AKUN_PENGELUARAN[kategori];
    return kode ? cariAkunLR(kode) : null;
}

/* Produk tanpa Detail Kategori dicatat ke kelompok ini di laporan */
const DETAIL_CADANGAN = "Lainnya";

function cariDetailKategori(nama) {
    for (let i = 0; i < DETAIL_KATEGORI.length; i++) {
        if (DETAIL_KATEGORI[i].nama === nama) return DETAIL_KATEGORI[i];
    }
    return null;
}

/* =====================================================================
   DARI TRANSAKSI KE AKUN
   Dipakai Kasir (menulis ringkasan harian), halaman Laporan (Laba Rugi)
   dan tombol "Hitung ulang ringkasan". Satu rumus supaya angkanya sama.
========================================================================= */

/* Bagi `nilai` sebanding `bobot` (dibulatkan ke rupiah); sisa pembulatan
   ke bobot terbesar supaya jumlahnya tepat sama dengan `nilai`. */
function keuBagiProporsional(nilai, bobot) {
    const hasil = bobot.map(function () { return 0; });
    if (bobot.length === 0) return hasil;
    let totalBobot = 0, idxBesar = 0;
    bobot.forEach(function (b, i) { totalBobot += b; if (b > bobot[idxBesar]) idxBesar = i; });
    if (totalBobot <= 0) { hasil[0] = nilai; return hasil; }
    let terpakai = 0;
    bobot.forEach(function (b, i) {
        if (i === idxBesar) return;
        hasil[i] = Math.round(nilai * b / totalBobot);
        terpakai += hasil[i];
    });
    hasil[idxBesar] = nilai - terpakai;
    return hasil;
}

/* Diskon nota dibagi ke item: item gratis promo dapat diskon penuh,
   sisanya sebanding harga x qty item lain. */
function keuDiskonPerItem(items, diskonPromo) {
    items = items || [];
    const diskon = Number(diskonPromo) || 0;
    const nilai = items.map(function (it) { return (Number(it.harga) || 0) * (Number(it.qty) || 0); });
    const hasil = items.map(function () { return 0; });
    const idxGratis = [], idxLain = [];
    let totalGratis = 0;
    items.forEach(function (it, i) {
        if (it.isPromoGratis) { idxGratis.push(i); totalGratis += nilai[i]; } else idxLain.push(i);
    });
    if (diskon >= totalGratis) {
        idxGratis.forEach(function (i) { hasil[i] = nilai[i]; });
        const sisa = diskon - totalGratis;
        if (sisa !== 0 && items.length > 0) {
            let target = idxLain;
            if (idxLain.reduce(function (a, i) { return a + nilai[i]; }, 0) <= 0) target = items.map(function (_, i) { return i; });
            const bagian = keuBagiProporsional(sisa, target.map(function (i) { return nilai[i]; }));
            target.forEach(function (i, k) { hasil[i] += bagian[k]; });
        }
    } else {
        const bagian = keuBagiProporsional(diskon, idxGratis.map(function (i) { return nilai[i]; }));
        idxGratis.forEach(function (i, k) { hasil[i] = bagian[k]; });
    }
    return hasil;
}

/* Detail kategori sebuah item transaksi.
   detailProduk(productId) -> detail produk saat ini (untuk transaksi lama). */
function keuDetailItem(item, detailProduk) {
    let d = item.detailKategori || "";
    if (!d && detailProduk) d = detailProduk(item.productId) || "";
    if (!d) {
        // Topping yang dijual sendiri pada transaksi lama: "Keju · Malmil"
        const m = /·\s*(.+)$/.exec(item.nama || "");
        if (m) d = m[1].trim();
    }
    return cariDetailKategori(d) ? d : DETAIL_CADANGAN;
}

/* Ringkas satu transaksi: { penjualan: {detail: Rp}, diskon: {detail: Rp}, qty: {detail: pcs} }.
   Penjualan = harga x qty (topping yang ikut kue masuk ke detail kuenya). */
function keuRingkasTransaksi(t, detailProduk) {
    const hasil = { penjualan: {}, diskon: {}, qty: {} };
    const items = t.items || [];
    const diskon = keuDiskonPerItem(items, t.diskonPromo);
    items.forEach(function (it, i) {
        const d = keuDetailItem(it, detailProduk);
        const nilai = (Number(it.harga) || 0) * (Number(it.qty) || 0);
        hasil.penjualan[d] = (hasil.penjualan[d] || 0) + nilai;
        if (diskon[i]) hasil.diskon[d] = (hasil.diskon[d] || 0) + diskon[i];
        hasil.qty[d] = (hasil.qty[d] || 0) + (Number(it.qty) || 0);
    });
    return hasil;
}

/* Id dokumen ringkasan_harian: "<outlet>__<yyyy-mm-dd>" */
function keuIdRingkasan(outlet, tanggalIso) {
    return String(outlet || "-").replace(/\//g, "-") + "__" + tanggalIso;
}
function keuTanggalIso(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
