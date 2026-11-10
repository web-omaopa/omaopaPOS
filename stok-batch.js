/* =====================================================================
   stok-batch.js
   Stok outlet disimpan per "batch" (kue yang masuk bersamaan) supaya
   bisa kedaluwarsa dan sisa yang tidak terjual tercatat sebagai waste.

   Dokumen outlets/{outlet}/stock/{productId}:
     { jumlah,        // stok yang masih berlaku (dibaca semua halaman)
       minStok,
       batch: [ { qty, masukMs, kedaluwarsaMs (null = tidak kedaluwarsa), laporanId } ],
       updatedAt }

   Masa berlaku per produk (koleksi products):
     - resetHarian (bawaan): 24 jam sejak dilaporkan. Saat kasir lapor lagi,
       sisa dari HARI SEBELUMNYA jadi waste; laporan di hari yang sama
       dianggap koreksi (diganti tanpa waste).
     - akumulasi (resetHarian = false): masaTahanHari hari sejak masuk
       (kosong / 0 = tidak kedaluwarsa).

   Waste dicatat di koleksi waste_stok:
     { outlet, productId, nama, qty, alasan: "kedaluwarsa" | "diganti_lapor",
       masukMs, kedaluwarsaMs, tanggal: "yyyy-mm-dd", laporanId,
       status: "aktif" | "batal", olehUid, olehNama, waktu }

   Dokumen stok lama (belum punya field batch) dianggap satu batch yang
   masuk saat pertama kali dibaca; masa berlakunya mulai dihitung saat itu.

   Kalau file ini diubah, naikkan versi ?v=... di halaman yang memuatnya.
========================================================================= */

const SB_SATU_HARI_MS = 24 * 60 * 60 * 1000;

const SB_ALASAN_WASTE = {
    kedaluwarsa: "Lewat masa berlaku",
    diganti_lapor: "Sisa saat lapor stok baru"
};

/* Lama berlaku (ms) untuk produk ini, atau null kalau tidak kedaluwarsa */
function sbMasaBerlakuMs(produk) {
    if (!produk) return null;
    if (produk.resetHarian !== false) return SB_SATU_HARI_MS;
    const hari = Number(produk.masaTahanHari) || 0;
    return hari > 0 ? hari * SB_SATU_HARI_MS : null;
}

function sbKedaluwarsa(produk, masukMs) {
    const lama = sbMasaBerlakuMs(produk);
    return lama ? masukMs + lama : null;
}

function sbTanggalIso(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

/* Daftar batch dari data dokumen stok (salinan, urut paling lama dulu) */
function sbBatch(data, nowMs) {
    if (!data) return [];
    let daftar;
    if (Array.isArray(data.batch)) {
        daftar = data.batch.map(function (b) {
            return {
                qty: Number(b.qty) || 0,
                masukMs: Number(b.masukMs) || 0,
                kedaluwarsaMs: b.kedaluwarsaMs === null || b.kedaluwarsaMs === undefined ? null : Number(b.kedaluwarsaMs),
                laporanId: b.laporanId || null
            };
        });
    } else {
        // Dokumen lama: seluruh jumlah dianggap satu batch yang baru masuk
        const jumlah = Number(data.jumlah) || 0;
        daftar = jumlah > 0 ? [{ qty: jumlah, masukMs: nowMs || Date.now(), kedaluwarsaMs: null, laporanId: null }] : [];
    }
    return daftar.filter(function (b) { return b.qty > 0; })
        .sort(function (a, b) { return a.masukMs - b.masukMs; });
}

/* Isi kedaluwarsa yang masih kosong sesuai aturan produk saat ini */
function sbNormalkan(batch, produk) {
    return batch.map(function (b) {
        if (b.kedaluwarsaMs !== null) return b;
        return Object.assign({}, b, { kedaluwarsaMs: sbKedaluwarsa(produk, b.masukMs) });
    });
}

/* Pisahkan batch yang masih berlaku dan yang sudah kedaluwarsa */
function sbPisah(batch, nowMs) {
    const aktif = [], basi = [];
    batch.forEach(function (b) {
        if (b.kedaluwarsaMs !== null && b.kedaluwarsaMs <= nowMs) basi.push(b); else aktif.push(b);
    });
    return { aktif: aktif, basi: basi };
}

function sbTotal(batch) {
    return batch.reduce(function (a, b) { return a + (Number(b.qty) || 0); }, 0);
}

/* Stok yang masih bisa dijual dari data dokumen stok (untuk tampilan) */
function sbTersedia(data, nowMs) {
    return sbTotal(sbPisah(sbBatch(data, nowMs), nowMs).aktif);
}

/* Ambil qty dari batch berlaku, paling lama dulu.
   Hasil: { sisa: [batch], diambil: [batch] }. Melempar error kalau kurang. */
function sbAmbil(aktif, qty) {
    if (sbTotal(aktif) < qty) throw new Error("Stok tidak mencukupi.");
    let perlu = qty;
    const sisa = [], diambil = [];
    aktif.forEach(function (b) {
        if (perlu <= 0) { sisa.push(b); return; }
        const ambil = Math.min(b.qty, perlu);
        perlu -= ambil;
        diambil.push(Object.assign({}, b, { qty: ambil }));
        if (b.qty - ambil > 0) sisa.push(Object.assign({}, b, { qty: b.qty - ambil }));
    });
    return { sisa: sisa, diambil: diambil };
}

/* Field dokumen stok dari daftar batch. Batch kedaluwarsa yang belum
   dicatat sebagai waste boleh ikut disimpan (disapu nanti), tapi tidak
   dihitung di jumlah. */
function sbDataStok(batch, nowMs) {
    const bersih = batch.filter(function (b) { return b.qty > 0; })
        .map(function (b) { return { qty: b.qty, masukMs: b.masukMs, kedaluwarsaMs: b.kedaluwarsaMs, laporanId: b.laporanId || null }; });
    return {
        batch: bersih,
        jumlah: sbTotal(sbPisah(bersih, nowMs).aktif),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
}

/* Isi dokumen waste_stok untuk satu batch */
function sbDataWaste(info, b, alasan, nowMs) {
    return {
        outlet: info.outlet, productId: info.productId, nama: info.nama || info.productId,
        qty: b.qty, alasan: alasan,
        masukMs: b.masukMs, kedaluwarsaMs: b.kedaluwarsaMs,
        tanggal: sbTanggalIso(nowMs), laporanId: info.laporanId || null,
        status: "aktif",
        olehUid: info.olehUid || "", olehNama: info.olehNama || "",
        waktu: firebase.firestore.FieldValue.serverTimestamp()
    };
}

/* Sapu satu outlet: batch kedaluwarsa dipindah ke waste_stok, dan batch
   lama tanpa tanggal kedaluwarsa dilengkapi sesuai aturan produk.
   produkMap: { productId: dataProduk }. oleh: { uid, nama }.
   Setiap dokumen diproses dalam transaksi supaya waste tidak tercatat dobel
   kalau dua perangkat menyapu bersamaan. Hasil: jumlah batch yang dibuang. */
function sbSapuOutlet(db, outlet, produkMap, oleh) {
    const nowMs = Date.now();
    const outletRef = db.collection("outlets").doc(outlet);
    return outletRef.collection("stock").get().then(function (snap) {
        const perlu = [];
        snap.forEach(function (doc) {
            const produk = produkMap[doc.id];
            if (!produk || produk.kategori === "Topping") return;
            const data = doc.data();
            const batch = sbNormalkan(sbBatch(data, nowMs), produk);
            const belumBatch = !Array.isArray(data.batch) && (Number(data.jumlah) || 0) > 0;
            const adaKosong = Array.isArray(data.batch) && data.batch.some(function (b) { return b.kedaluwarsaMs == null && sbMasaBerlakuMs(produk); });
            if (belumBatch || adaKosong || sbPisah(batch, nowMs).basi.length > 0) perlu.push(doc.id);
        });
        return perlu.reduce(function (rantai, pid) {
            return rantai.then(function (total) {
                return sbSapuProduk(db, outlet, pid, produkMap[pid], oleh).then(function (n) { return total + n; });
            });
        }, Promise.resolve(0));
    });
}

function sbSapuProduk(db, outlet, productId, produk, oleh) {
    const ref = db.collection("outlets").doc(outlet).collection("stock").doc(productId);
    return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (doc) {
            if (!doc.exists) return 0;
            const nowMs = Date.now();
            const batch = sbNormalkan(sbBatch(doc.data(), nowMs), produk);
            const p = sbPisah(batch, nowMs);
            p.basi.forEach(function (b) {
                tx.set(db.collection("waste_stok").doc(), sbDataWaste({
                    outlet: outlet, productId: productId, nama: produk.nama,
                    olehUid: oleh && oleh.uid, olehNama: oleh && oleh.nama
                }, b, "kedaluwarsa", nowMs));
            });
            tx.set(ref, sbDataStok(p.aktif, nowMs), { merge: true });
            return p.basi.length;
        });
    });
}
