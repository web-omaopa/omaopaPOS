/* =====================================================================
   member.js
   Pencarian member untuk Kasir (pos.html).

   Data member nantinya diambil dari API web member. Selama API belum
   tersambung (MEMBER_API_URL kosong):
     - di situs asli: pencarian menjawab "Data member belum tersambung";
     - saat uji coba (localhost / 127.0.0.1, atau alamat halaman diberi
       ?member=contoh): memakai MEMBER_CONTOH di bawah.

   Bentuk data member yang dipakai POS: { id, nama, hp }.
   Kontrak API yang diharapkan (bisa disesuaikan di memberDariApi):
     GET MEMBER_API_URL?q=<nama>  ->  [{ id, nama, hp }, ...]
                                  atau { data: [{ id, nama, hp }, ...] }

   Transaksi menyimpan member: { id, nama, hp } (lihat pos.html).
   Kalau file ini diubah, naikkan versi ?v=... di pos.html.
========================================================================= */

const MEMBER_API_URL = "";   // contoh nanti: "https://member.omaopa.store/api/member"

/* Data contoh hanya untuk uji coba. Dua nama "Siti Rahma" sengaja sama
   supaya alur konfirmasi no HP bisa dicoba. */
const MEMBER_CONTOH = [
    { id: "contoh-1", nama: "Siti Rahma", hp: "081234565678" },
    { id: "contoh-2", nama: "Siti Rahma", hp: "085712349012" },
    { id: "contoh-3", nama: "Budi Santoso", hp: "081398761234" },
    { id: "contoh-4", nama: "Dewi Lestari", hp: "087822223333" },
    { id: "contoh-5", nama: "Andi Wijaya", hp: "081155557777" }
];

function memberModeContoh() {
    if (typeof location === "undefined") return false;
    return location.hostname === "localhost" || location.hostname === "127.0.0.1" ||
        /[?&]member=contoh\b/.test(location.search || "");
}

function memberTersambung() { return !!MEMBER_API_URL || memberModeContoh(); }

/* Rapikan satu data member dari sumber mana pun */
function memberRapikan(m) {
    if (!m) return null;
    const nama = String(m.nama || m.name || "").trim();
    const hp = String(m.hp || m.noHp || m.phone || "").replace(/[^\d+]/g, "");
    const id = String(m.id || m.memberId || hp || "").trim();
    return nama && id ? { id: id, nama: nama, hp: hp } : null;
}

function memberDariApi(teks) {
    const url = MEMBER_API_URL + (MEMBER_API_URL.indexOf("?") === -1 ? "?" : "&") + "q=" + encodeURIComponent(teks);
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
        if (!res.ok) throw new Error("Server member menjawab " + res.status);
        return res.json();
    }).then(function (json) {
        const daftar = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
        return daftar.map(memberRapikan).filter(Boolean);
    });
}

/* Cari member berdasarkan nama (minimal 2 huruf).
   Hasil Promise: { status: "ok", data: [...] } atau { status: "belum_tersambung" }.
   Melempar error kalau API gagal. */
function memberCari(teks) {
    const q = String(teks || "").trim();
    if (q.length < 2) return Promise.resolve({ status: "ok", data: [] });
    if (MEMBER_API_URL) {
        return memberDariApi(q).then(function (data) { return { status: "ok", data: data.slice(0, 20) }; });
    }
    if (memberModeContoh()) {
        const kecil = q.toLowerCase();
        const data = MEMBER_CONTOH.filter(function (m) { return m.nama.toLowerCase().indexOf(kecil) !== -1; })
            .map(memberRapikan);
        return new Promise(function (ok) { setTimeout(function () { ok({ status: "ok", data: data }); }, 150); });
    }
    return Promise.resolve({ status: "belum_tersambung" });
}

/* No HP disamarkan, 4 digit terakhir tetap terlihat: 0812****5678 */
function memberSamarkanHp(hp) {
    const d = String(hp || "").replace(/\D/g, "");
    if (d.length < 8) return d ? d.replace(/\d(?=\d{2})/g, "*") : "-";
    return d.slice(0, 4) + "****" + d.slice(-4);
}
