/* =====================================================================
   member-bridge.js
   Jembatan POS -> data member (Firebase proyek "oma-opa-game").

   Fungsi:
   - cari(teks)            : cari member (nama / no HP), maksimal 10 hasil
   - tambahPoin(data)      : tambah poin member setelah transaksi dibayar
                             (logika sama dengan awardPoints di core-omaopa.js:
                              1 poin tiap Rp4.000, dibulatkan ke bawah)
   - tambahPoinAman(data)  : sama, tapi kalau gagal dimasukkan ke antrian
                             (localStorage tablet) dan dicoba lagi nanti
   - kirimAntrian()        : coba kirim ulang poin yang tertunda

   Cara kerja koneksi:
   - POS login ke Firebase member lewat 1 akun jembatan (staff polos).
   - Email & password akun itu TIDAK ditulis di file ini (repo publik).
     Dibaca dari dokumen Firestore POS: integrasi/memberBridge
       { email: "...", password: "...", aktif: true }
   - Login baru dilakukan saat pertama kali dibutuhkan (kasir mulai cari
     member / ada poin yang harus dikirim), bukan saat halaman dibuka.

   Anti-dobel: tiap transaksi POS dicatat di member dengan ID dokumen
   "pos_<noNota>". Kalau dikirim dua kali, yang kedua diabaikan.
========================================================================= */
(function () {
    "use strict";

    var EARN_PER_POINT = 4000;   // Rp per 1 poin (sama dengan core-omaopa.js)
    var REF_REWARD = 25;         // poin pemberi kode referral
    var REF_WELCOME = 25;        // poin welcome pendaftar baru
    var SHEET_URL = "https://script.google.com/macros/s/AKfycbxQ3dpVue_N0sjHzMnwsYe9Rxl3R1JxhnoOGVgwGNfjijm_PNBrJ17P2X9eGMloGZF8/exec";
    var KUNCI_ANTRIAN = "omaopa_poin_antrian";
    var MAKS_HASIL = 10;

    // Konfigurasi web Firebase member (bukan rahasia, sama dengan yang ada di web member)
    var MEMBER_CONFIG = {
        apiKey: "AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg",
        authDomain: "oma-opa-game.firebaseapp.com",
        projectId: "oma-opa-game",
        storageBucket: "oma-opa-game.firebasestorage.app",
        messagingSenderId: "737187594894",
        appId: "1:737187594894:web:07e8fdd4dbb2e5fa903fdf"
    };

    var mAuth = null, mDb = null;
    var siapPromise = null;      // satu proses login dipakai bersama
    var cacheCari = {};          // teks -> hasil (hemat baca)

    /* ---------- util ---------- */
    function normPhone(raw) {
        var s = String(raw || "").replace(/\D/g, "");
        if (!s) return "";
        if (s.indexOf("0") === 0) s = "62" + s.slice(1);
        else if (s.indexOf("62") === 0) { /* ok */ }
        else if (s.indexOf("8") === 0) s = "62" + s;
        else s = "62" + s;
        return s;
    }

    function hitungPoin(nominal) {
        nominal = Math.max(0, Math.floor(Number(nominal) || 0));
        return Math.floor(nominal / EARN_PER_POINT);
    }

    function topengHp(p) {
        var s = String(p || "");
        return s.length > 4 ? "••••" + s.slice(-4) : s;
    }

    function pushToSheet(row) {
        try {
            fetch(SHEET_URL, {
                method: "POST", mode: "no-cors",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(row)
            }).catch(function () {});
        } catch (e) {}
    }

    /* ---------- koneksi (lazy) ---------- */
    function siap() {
        if (siapPromise) return siapPromise;
        siapPromise = (function () {
            if (typeof firebase === "undefined" || typeof db === "undefined") {
                return Promise.reject(new Error("Firebase POS belum siap."));
            }
            // Ambil email/password akun jembatan dari Firestore POS
            return db.collection("integrasi").doc("memberBridge").get().then(function (snap) {
                if (!snap.exists) throw new Error("Integrasi member belum diatur.");
                var c = snap.data() || {};
                if (c.aktif === false) throw new Error("Integrasi member sedang dimatikan.");
                if (!c.email || !c.password) throw new Error("Akun jembatan belum lengkap.");

                var app;
                try { app = firebase.app("member"); }
                catch (e) { app = firebase.initializeApp(MEMBER_CONFIG, "member"); }
                mAuth = app.auth();
                mDb = app.firestore();

                // Sesi hanya di tab ini, tidak disimpan permanen di browser
                return mAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
                    .catch(function () {})
                    .then(function () {
                        if (mAuth.currentUser) return null;
                        return mAuth.signInWithEmailAndPassword(String(c.email).trim(), String(c.password));
                    });
            }).then(function () { return true; });
        })();
        // Kalau gagal, izinkan coba lagi nanti (jangan terkunci pada error lama)
        siapPromise.catch(function () { siapPromise = null; });
        return siapPromise;
    }

    /* ---------- CARI MEMBER ---------- */
    function petaDoc(d) {
        var x = d.data();
        return {
            uid: d.id,
            nama: x.name || "",
            hp: x.phone || "",
            hpTopeng: topengHp(x.phone),
            poin: (typeof x.points === "number") ? x.points : 0
        };
    }

    function cari(teks) {
        teks = String(teks || "").trim();
        var q = teks.toLowerCase();
        var angka = /^[0-9+]/.test(teks);
        // Batas minimal supaya tidak membaca data tanpa perlu
        if (angka ? teks.replace(/\D/g, "").length < 4 : q.length < 2) return Promise.resolve([]);
        if (cacheCari[q]) return Promise.resolve(cacheCari[q]);

        return siap().then(function () {
            var users = mDb.collection("users");
            var hasil = [], terlihat = {};
            function ambil(snap) {
                snap.forEach(function (d) {
                    if (terlihat[d.id] || hasil.length >= MAKS_HASIL) return;
                    terlihat[d.id] = true; hasil.push(petaDoc(d));
                });
            }
            var tugas = [];
            if (angka) {
                // Nomor HP di data member disimpan format 62xxxxxxxxxx.
                // Pencarian prefix: untuk "0812" dicari "62812".
                var awal = normPhone(teks);
                tugas.push(users.where("phone", ">=", awal).where("phone", "<=", awal + "").limit(MAKS_HASIL).get().then(ambil));
            } else {
                tugas.push(users.where("nameLower", ">=", q).where("nameLower", "<=", q + "").limit(MAKS_HASIL).get().then(ambil));
            }
            return Promise.all(tugas).then(function () {
                cacheCari[q] = hasil;
                return hasil;
            });
        });
    }

    /* ---------- TAMBAH POIN ---------- */
    /* data: { uid, nominal, noNota, outlet, kasirNama }
       Hasil: { poin, saldo, nama, dobel } */
    function tambahPoin(data) {
        var uid = String((data && data.uid) || "").trim();
        var nominal = Math.max(0, Math.floor(Number(data && data.nominal) || 0));
        var noNota = String((data && data.noNota) || "").trim();
        if (!uid || !noNota) return Promise.reject(new Error("Data poin tidak lengkap."));
        var pts = hitungPoin(nominal);
        if (pts <= 0) return Promise.resolve({ poin: 0, saldo: null, nama: "", dobel: false });

        return siap().then(function () {
            var fv = firebase.firestore.FieldValue;
            var uref = mDb.collection("users").doc(uid);
            var tref = mDb.collection("transactions").doc("pos_" + noNota);
            var hasil = { poin: pts, saldo: 0, nama: "", dobel: false };

            return mDb.runTransaction(function (tx) {
                return Promise.all([tx.get(tref), tx.get(uref)]).then(function (r) {
                    if (r[0].exists) { hasil.dobel = true; return; }
                    if (!r[1].exists) throw new Error("Member tidak ditemukan.");
                    var d = r[1].data();
                    var cur = (typeof d.points === "number") ? d.points : 0;
                    hasil.nama = d.name || "";
                    hasil.saldo = cur + pts;
                    tx.set(uref, { points: hasil.saldo, lastTxnAt: fv.serverTimestamp(), updatedAt: fv.serverTimestamp() }, { merge: true });
                    tx.set(mDb.collection("leaderboard").doc(uid), { name: hasil.nama, points: hasil.saldo, updatedAt: fv.serverTimestamp() }, { merge: true });
                    tx.set(tref, {
                        uid: uid, name: hasil.nama, nominal: nominal, points: pts,
                        outlet: data.outlet || "", staffUid: mAuth.currentUser ? mAuth.currentUser.uid : "",
                        source: "pos", noNota: noNota, kasirNama: data.kasirNama || "",
                        createdAt: fv.serverTimestamp()
                    });
                });
            }).then(function () {
                if (!hasil.dobel) {
                    pushToSheet({ type: "txn", waktu: new Date().toISOString(), outlet: data.outlet || "", nama: hasil.nama, uid: uid, nominal: nominal, poin: pts });
                    return bayarReferral(uid, data.outlet).catch(function () {}).then(function () { return hasil; });
                }
                return hasil;
            });
        });
    }

    /* Poin referral dibayar sekali, saat belanja pertama pendaftar
       (sama seperti maybePayReferral di core-omaopa.js). */
    function bayarReferral(uid) {
        var fv = firebase.firestore.FieldValue;
        var uref = mDb.collection("users").doc(uid);
        var pemberi = "";
        return mDb.runTransaction(function (tx) {
            return tx.get(uref).then(function (us) {
                pemberi = "";
                if (!us.exists) return;
                var d = us.data(), rb = String(d.referredBy || "").trim();
                if (!rb || d.refRewarded === true || rb === uid) return;
                pemberi = rb;
                tx.set(uref, { refRewarded: true, updatedAt: fv.serverTimestamp() }, { merge: true });
            });
        }).then(function () {
            if (!pemberi) return null;
            return kreditReferral(uid, REF_WELCOME, "Referral (welcome)")
                .then(function () { return kreditReferral(pemberi, REF_REWARD, "Referral"); });
        });
    }

    function kreditReferral(uid, delta, label) {
        var fv = firebase.firestore.FieldValue;
        var uref = mDb.collection("users").doc(uid);
        var nama = "", baru = 0;
        return mDb.runTransaction(function (tx) {
            return tx.get(uref).then(function (us) {
                if (!us.exists) return;
                var d = us.data(), cur = (typeof d.points === "number") ? d.points : 0;
                nama = d.name || "";
                baru = Math.max(0, cur + delta);
                tx.set(uref, { points: baru, updatedAt: fv.serverTimestamp() }, { merge: true });
                tx.set(mDb.collection("leaderboard").doc(uid), { name: nama, points: baru, updatedAt: fv.serverTimestamp() }, { merge: true });
                tx.set(mDb.collection("transactions").doc(), {
                    uid: uid, name: nama, nominal: 0, points: delta, outlet: label, kind: "referral",
                    staffUid: mAuth.currentUser ? mAuth.currentUser.uid : "", createdAt: fv.serverTimestamp()
                });
            });
        }).then(function () {
            pushToSheet({ type: "txn", waktu: new Date().toISOString(), outlet: label, nama: nama, uid: uid, nominal: 0, poin: delta });
        });
    }

    /* ---------- ANTRIAN (kalau server member sedang tidak bisa dijangkau) ---------- */
    function bacaAntrian() {
        try { return JSON.parse(localStorage.getItem(KUNCI_ANTRIAN) || "[]") || []; } catch (e) { return []; }
    }
    function tulisAntrian(arr) {
        try { localStorage.setItem(KUNCI_ANTRIAN, JSON.stringify(arr)); } catch (e) {}
    }
    function masukAntrian(data) {
        var arr = bacaAntrian();
        if (arr.some(function (x) { return x.noNota === data.noNota; })) return;
        arr.push({ uid: data.uid, nominal: data.nominal, noNota: data.noNota, outlet: data.outlet, kasirNama: data.kasirNama, waktu: Date.now() });
        tulisAntrian(arr);
    }

    /* Hasil: { ok:true, poin, saldo, nama } atau { ok:false, tertunda:true, alasan } */
    function tambahPoinAman(data) {
        return tambahPoin(data).then(function (h) {
            return { ok: true, poin: h.poin, saldo: h.saldo, nama: h.nama, dobel: h.dobel };
        }).catch(function (e) {
            var pesan = (e && e.message) || "gagal";
            // Kesalahan permanen (member tidak ada) tidak perlu diulang
            if (pesan === "Member tidak ditemukan.") return { ok: false, tertunda: false, alasan: pesan };
            masukAntrian(data);
            return { ok: false, tertunda: true, alasan: pesan };
        });
    }

    var sedangKirimAntrian = false;
    function kirimAntrian() {
        if (sedangKirimAntrian) return Promise.resolve(0);
        var arr = bacaAntrian();
        if (arr.length === 0) return Promise.resolve(0);
        sedangKirimAntrian = true;
        var sisa = [], berhasil = 0;
        return arr.reduce(function (rantai, item) {
            return rantai.then(function () {
                return tambahPoin(item).then(function () { berhasil++; }).catch(function (e) {
                    var pesan = (e && e.message) || "";
                    // Member hilang / data rusak: buang. Selain itu simpan untuk dicoba lagi.
                    if (pesan !== "Member tidak ditemukan." && pesan !== "Data poin tidak lengkap.") sisa.push(item);
                });
            });
        }, Promise.resolve()).then(function () {
            tulisAntrian(sisa);
            sedangKirimAntrian = false;
            return berhasil;
        }, function () { sedangKirimAntrian = false; return 0; });
    }

    window.MemberBridge = {
        EARN_PER_POINT: EARN_PER_POINT,
        hitungPoin: hitungPoin,
        siap: siap,
        cari: cari,
        tambahPoin: tambahPoin,
        tambahPoinAman: tambahPoinAman,
        kirimAntrian: kirimAntrian,
        jumlahAntrian: function () { return bacaAntrian().length; }
    };
})();
