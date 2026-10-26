/* =====================================================================
   kas.js
   Sesi kas outlet (buka toko dengan kas awal, tutup toko dengan kas
   akhir) dan pengeluaran outlet. Dipakai pos.html dan kas.html.

   Koleksi Firestore:
   - sesi_kas/{auto}   satu dokumen per buka-tutup toko per outlet
       { outlet, tanggal: "yyyy-mm-dd", status: "buka" | "tutup",
         kasAwal, waktuBuka, dibukaUid, dibukaNama,
         jumlahTrx, penjualanPerMetode: { Tunai: Rp, QRIS: Rp, ... }   (ditambah POS tiap transaksi)
         -- diisi saat tutup --
         kasAkhir, penjualanTunai, penjualanNonTunai, totalPengeluaran,
         kasSeharusnya, selisih, catatan, waktuTutup, ditutupUid, ditutupNama }
   - pengeluaran/{auto} satu dokumen per pengeluaran
       { outlet, tanggal, kategori, nominal, keterangan,
         dariLaci: bool (true = uang diambil dari laci kas, mengurangi kas seharusnya),
         sesiKasId (kalau dariLaci), status: "aktif" | "dihapus",
         dibuatUid, dibuatNama, waktu, dihapusNama, waktuHapus }

   Kalau file ini diubah, naikkan versi ?v=... di halaman yang memuatnya
   (CDN Hostinger menyimpan file .js 7 hari).
========================================================================= */

const KATEGORI_PENGELUARAN = [
    "Bahan baku",
    "Kemasan & perlengkapan",
    "Air galon / es batu",
    "Gas / listrik / pulsa",
    "Transport / parkir / ojek",
    "Kebersihan",
    "Konsumsi karyawan",
    "Lain-lain"
];

/* Nominal cepat di form kas awal / kas akhir */
const NOMINAL_CEPAT_KAS = [100000, 200000, 300000, 500000];

/* Angka dari input teks yang boleh berisi titik ribuan: "1.250.000" -> 1250000 */
function kasParseAngka(teks) {
    const bersih = String(teks == null ? "" : teks).replace(/[^0-9]/g, "");
    return bersih ? Number(bersih) : 0;
}

/* Pasang format ribuan otomatis saat mengetik di input teks */
function kasFormatInput(el) {
    const n = kasParseAngka(el.value);
    el.value = n ? n.toLocaleString("id-ID") : "";
}

function kasTanggalHariIni() {
    const d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function kasToDate(ts) {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    return null;
}

/* Sesi kas yang sedang buka di outlet ini (paling baru), atau null.
   Hasil: { id, data } */
function kasCariSesiAktif(db, outlet) {
    return db.collection("sesi_kas")
        .where("outlet", "==", outlet)
        .where("status", "==", "buka")
        .get()
        .then(function (snap) {
            let pilih = null;
            snap.forEach(function (doc) {
                const d = doc.data({ serverTimestamps: "estimate" });
                const w = kasToDate(d.waktuBuka) || new Date(0);
                if (!pilih || w > pilih._w) pilih = { id: doc.id, data: d, _w: w };
            });
            return pilih ? { id: pilih.id, data: pilih.data } : null;
        });
}

/* Sesi terakhir yang sudah ditutup di outlet ini (untuk saran kas awal). */
function kasCariSesiTerakhirTutup(db, outlet) {
    return db.collection("sesi_kas")
        .where("outlet", "==", outlet)
        .where("status", "==", "tutup")
        .get()
        .then(function (snap) {
            let pilih = null;
            snap.forEach(function (doc) {
                const d = doc.data();
                const w = kasToDate(d.waktuTutup) || new Date(0);
                if (!pilih || w > pilih._w) pilih = { id: doc.id, data: d, _w: w };
            });
            return pilih ? { id: pilih.id, data: pilih.data } : null;
        });
}

/* Pengeluaran dari laci untuk satu sesi (yang tidak dihapus) */
function kasMuatPengeluaranSesi(db, sesiId) {
    return db.collection("pengeluaran").where("sesiKasId", "==", sesiId).get().then(function (snap) {
        const daftar = [];
        snap.forEach(function (doc) {
            const d = doc.data({ serverTimestamps: "estimate" });
            if (d.status === "dihapus") return;
            d._id = doc.id;
            d._waktu = kasToDate(d.waktu) || new Date(0);
            daftar.push(d);
        });
        daftar.sort(function (a, b) { return b._waktu - a._waktu; });
        return daftar;
    });
}

/* Penjualan per metode bayar selama sesi.
   Dihitung dari koleksi transactions (waktu >= waktuBuka, outlet sama,
   bukan batal). Kalau transaksi tidak bisa dibaca (mis. aturan Firestore
   untuk kasir), pakai catatan penjualanPerMetode di dokumen sesi yang
   ditambah POS setiap transaksi. */
function kasHitungPenjualanSesi(db, sesi) {
    const buka = kasToDate(sesi.data.waktuBuka);
    const tutup = kasToDate(sesi.data.waktuTutup);
    const dariCatatan = function () {
        const per = Object.assign({}, sesi.data.penjualanPerMetode || {});
        return { perMetode: per, jumlahTrx: Number(sesi.data.jumlahTrx) || 0, sumber: "catatan" };
    };
    if (!buka) return Promise.resolve(dariCatatan());

    let q = db.collection("transactions").where("waktu", ">=", firebase.firestore.Timestamp.fromDate(buka));
    if (tutup) q = q.where("waktu", "<=", firebase.firestore.Timestamp.fromDate(tutup));
    return q.get().then(function (snap) {
        const per = {};
        let jumlah = 0;
        snap.forEach(function (doc) {
            const t = doc.data();
            if (t.outlet !== sesi.data.outlet || t.status === "batal") return;
            const m = t.metodeBayar || "Tunai";
            per[m] = (per[m] || 0) + (Number(t.total) || 0);
            jumlah++;
        });
        return { perMetode: per, jumlahTrx: jumlah, sumber: "transaksi" };
    }).catch(function (e) {
        console.warn("Transaksi sesi tidak bisa dibaca, pakai catatan sesi:", e.message);
        return dariCatatan();
    });
}

/* Ringkasan lengkap sebuah sesi untuk layar tutup toko */
function kasRingkasanSesi(db, sesi) {
    return Promise.all([kasHitungPenjualanSesi(db, sesi), kasMuatPengeluaranSesi(db, sesi.id)]).then(function (h) {
        const jual = h[0], pengeluaran = h[1];
        const tunai = Number(jual.perMetode.Tunai) || 0;
        let nonTunai = 0;
        Object.keys(jual.perMetode).forEach(function (m) { if (m !== "Tunai") nonTunai += Number(jual.perMetode[m]) || 0; });
        const totalPengeluaran = pengeluaran.reduce(function (a, p) { return a + (Number(p.nominal) || 0); }, 0);
        const kasAwal = Number(sesi.data.kasAwal) || 0;
        return {
            kasAwal: kasAwal,
            perMetode: jual.perMetode,
            jumlahTrx: jual.jumlahTrx,
            sumberPenjualan: jual.sumber,
            penjualanTunai: tunai,
            penjualanNonTunai: nonTunai,
            pengeluaran: pengeluaran,
            totalPengeluaran: totalPengeluaran,
            kasSeharusnya: kasAwal + tunai - totalPengeluaran
        };
    });
}
