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
