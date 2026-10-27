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
         kasSeharusnya, selisih, catatan, waktuTutup, ditutupUid, ditutupNama,
         jenisTutup: "shift" (Akhiri Shift, serah terima kasir) | "toko" (Tutup Toko, akhir hari),
         rincianPecahan: { "100000": lembar, ... } (kalau dihitung per pecahan) }
   - pengeluaran/{auto} satu dokumen per pengeluaran
       { outlet, tanggal, kategori, nominal, keterangan,
         dariLaci: bool (true = uang diambil dari laci kas, mengurangi kas seharusnya),
         sesiKasId (kalau dariLaci), status: "aktif" | "dihapus",
         dibuatUid, dibuatNama, waktu, dihapusNama, waktuHapus }

   Kalau file ini diubah, naikkan versi ?v=... di halaman yang memuatnya
   (CDN Hostinger menyimpan file .js 7 hari).
========================================================================= */

/* Sama dengan kategori pengeluaran outlet di ESB */
const KATEGORI_PENGELUARAN = [
    "Salah Nota",
    "Kompensasi Customer",
    "Marketing",
    "Biaya Operasional",
    "Biaya Kebersihan",
    "Pengeluaran Reward",
    "Bensin TVS",
    "Upgrading",
    "Biaya Listrik",
    "Biaya Air PAM",
    "Pengiriman dari Pabrik",
    "Biaya Transfer Kue",
    "Perbaikan dan Pemeliharaan",
    "Biaya Alat Tulis",
    "Telekomunikasi",
    "Konsumsi Rapat",
    "Utilitis",
    "Pengiriman Kue ke Customer",
    "Biaya Backup Kasir",
    "Reward Sniby"
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
        return { perMetode: per, jumlahTrx: Number(sesi.data.jumlahTrx) || 0, sumber: "catatan", transaksi: null };
    };
    if (!buka) return Promise.resolve(dariCatatan());

    let q = db.collection("transactions").where("waktu", ">=", firebase.firestore.Timestamp.fromDate(buka));
    if (tutup) q = q.where("waktu", "<=", firebase.firestore.Timestamp.fromDate(tutup));
    return q.get().then(function (snap) {
        const per = {};
        const daftar = [];
        snap.forEach(function (doc) {
            const t = doc.data({ serverTimestamps: "estimate" });
            if (t.outlet !== sesi.data.outlet || t.status === "batal") return;
            const m = t.metodeBayar || "Tunai";
            per[m] = (per[m] || 0) + (Number(t.total) || 0);
            t._id = doc.id;
            t._waktu = kasToDate(t.waktu) || new Date(0);
            daftar.push(t);
        });
        daftar.sort(function (a, b) { return b._waktu - a._waktu; });
        return { perMetode: per, jumlahTrx: daftar.length, sumber: "transaksi", transaksi: daftar };
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
            transaksi: jual.transaksi,     // null kalau transaksi tidak bisa dibaca
            penjualanTunai: tunai,
            penjualanNonTunai: nonTunai,
            pengeluaran: pengeluaran,
            totalPengeluaran: totalPengeluaran,
            kasSeharusnya: kasAwal + tunai - totalPengeluaran
        };
    });
}

/* =====================================================================
   BUKTI / LAMPIRAN PENGELUARAN
   Foto diperkecil di browser (maks 1200px, JPEG), lalu diupload ke
   api/upload-foto.php dengan jenis "bukti" (disimpan terpisah dari
   foto produk). Hasil: URL "api/foto.php?b=...".
========================================================================= */
function kasKecilkanGambar(file) {
    return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            const MAKS = 1200;
            const skala = Math.min(1, MAKS / Math.max(img.width, img.height));
            const w = Math.round(img.width * skala), h = Math.round(img.height * skala);
            const cv = document.createElement("canvas");
            cv.width = w; cv.height = h;
            const ctx = cv.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            cv.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("Gambar gagal diproses. Coba gambar lain.")); }, "image/jpeg", 0.82);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("File itu bukan gambar yang bisa dibaca. Pilih JPG, PNG, atau WEBP.")); };
        img.src = url;
    });
}

function kasUploadBukti(file) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error("Bukti harus berupa foto (JPG, PNG, WEBP)."));
    if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error("Foto terlalu besar (maks 15 MB)."));
    return Promise.all([kasKecilkanGambar(file), firebase.auth().currentUser.getIdToken()]).then(function (h) {
        const form = new FormData();
        form.append("token", h[1]);
        form.append("jenis", "bukti");
        form.append("foto", h[0], "bukti.jpg");
        return fetch("api/upload-foto.php", { method: "POST", body: form });
    }).then(function (res) {
        return res.json().catch(function () {
            throw new Error("Server tidak merespons dengan benar (kode " + res.status + ").");
        }).then(function (data) {
            if (!res.ok || !data.url) throw new Error(data.error || ("kode " + res.status));
            return data.url;
        });
    }).catch(function (e) {
        if (e && e.message === "Failed to fetch") throw new Error("Koneksi terputus saat upload. Coba lagi.");
        throw e;
    });
}

/* =====================================================================
   KALKULATOR PECAHAN UANG
   Dipakai saat buka toko / mulai shift (pos.html) dan saat menghitung
   kas akhir (kas.html). Kasir mengisi jumlah lembar/koin, total dihitung
   otomatis. Gaya dipasang sekali lewat kasPasangGayaPecahan().
========================================================================= */
const PECAHAN_UANG = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];

function kasPasangGayaPecahan() {
    if (document.getElementById("gayaPecahan")) return;
    const st = document.createElement("style");
    st.id = "gayaPecahan";
    st.textContent =
        ".pch-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}" +
        "@media(max-width:520px){.pch-grid{grid-template-columns:1fr}}" +
        ".pch-row{display:flex;align-items:center;gap:8px;background:#F4F6FA;border-radius:10px;padding:6px 8px}" +
        ".pch-nom{flex:1;font-size:12.5px;font-weight:800;color:#12305C}" +
        ".pch-nom small{display:block;font-size:9.5px;font-weight:600;color:#8A95A5}" +
        ".pch-btn{width:30px;height:30px;border-radius:8px;border:1px solid #d1d9e6;background:#fff;font-size:16px;font-weight:700;color:#12305C;cursor:pointer;line-height:1;font-family:inherit}" +
        ".pch-btn:active{background:#E8EEF9}" +
        ".pch-in{width:46px;height:30px;border:1px solid #d1d9e6;border-radius:8px;text-align:center;font-size:13px;font-weight:700;font-family:inherit}" +
        ".pch-sub{width:78px;text-align:right;font-size:11px;color:#52606d}";
    document.head.appendChild(st);
}

/* HTML kalkulator. id = awalan id elemen; onUbah = nama fungsi global
   yang dipanggil setiap jumlah berubah. */
function kasHtmlPecahan(id, onUbah) {
    kasPasangGayaPecahan();
    return '<div class="pch-grid">' + PECAHAN_UANG.map(function (n) {
        const koin = n < 1000;
        return '<div class="pch-row">' +
            '<div class="pch-nom">' + n.toLocaleString("id-ID") + '<small>' + (koin ? "koin" : "lembar") + '</small></div>' +
            '<button type="button" class="pch-btn" onclick="kasUbahPecahan(\'' + id + '\',' + n + ',-1,\'' + onUbah + '\')">−</button>' +
            '<input type="text" inputmode="numeric" class="pch-in" id="' + id + '_' + n + '" value="0" oninput="this.value=this.value.replace(/[^0-9]/g,\'\'); kasUbahPecahan(\'' + id + '\',' + n + ',0,\'' + onUbah + '\')">' +
            '<button type="button" class="pch-btn" onclick="kasUbahPecahan(\'' + id + '\',' + n + ',1,\'' + onUbah + '\')">+</button>' +
            '<div class="pch-sub" id="' + id + '_' + n + '_sub">0</div>' +
        '</div>';
    }).join("") + '</div>';
}

function kasUbahPecahan(id, nominal, delta, onUbah) {
    const el = document.getElementById(id + "_" + nominal);
    if (!el) return;
    const jumlah = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
    if (delta !== 0 || el.value !== "") el.value = jumlah;
    document.getElementById(id + "_" + nominal + "_sub").textContent = (jumlah * nominal).toLocaleString("id-ID");
    if (onUbah && typeof window[onUbah] === "function") window[onUbah](kasTotalPecahan(id));
}

/* { total, rincian: { "100000": 3, ... } } (hanya pecahan yang terisi) */
function kasTotalPecahan(id) {
    let total = 0;
    const rincian = {};
    PECAHAN_UANG.forEach(function (n) {
        const el = document.getElementById(id + "_" + n);
        const j = el ? (parseInt(el.value, 10) || 0) : 0;
        if (j > 0) { rincian[String(n)] = j; total += j * n; }
    });
    return { total: total, rincian: rincian };
}
