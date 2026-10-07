/* =====================================================================
   roles.js
   File pusat pengaturan hak akses per role.

   Cara pakai:
   - Tambahkan halaman baru cukup di HALAMAN_INFO
   - Atur siapa boleh akses apa cukup di ROLE_PERMISSIONS
   - Semua halaman (beranda, kasir, stok, dll) otomatis mengikuti
     aturan di file ini tanpa perlu diubah satu-satu
========================================================================= */

/* Daftar semua halaman yang ada/direncanakan di sistem.
   "dibangun: false" berarti halaman belum ada filenya,
   akan tampil sebagai "Segera hadir" di Beranda. */
const HALAMAN_INFO = {
    kasir:          { href: "pos.html",            icon: "🧾", title: "Kasir",           desc: "Buat transaksi penjualan",          dibangun: true },
    stok:           { href: "stok.html",           icon: "📦", title: "Stok",            desc: "Lihat & pantau stok outlet",        dibangun: true },
    alokasi:        { href: "alokasi.html",        icon: "📋", title: "Manajemen Menu", desc: "Rencana, lapor & approval stok", dibangun: true },
    transfer:       { href: "transfer.html",       icon: "🚚", title: "Transfer",        desc: "Kirim & terima stok antar outlet",  dibangun: true },
    riwayat:        { href: "riwayat.html",        icon: "🕘", title: "Riwayat",         desc: "Riwayat transaksi & transfer",      dibangun: false },
    laporan:        { href: "laporan.html",        icon: "📊", title: "Laporan",         desc: "Analisis penjualan & stok",         dibangun: false },
    pengaturan:     { href: "pengaturan.html",     icon: "⚙️", title: "Pengaturan",      desc: "Kelola produk, outlet, & user",     dibangun: true }
};

/* Daftar role dan halaman apa saja yang boleh mereka akses.
   Tinggal tambah/kurangi key di sini untuk ubah hak akses.
   Contoh menambah role baru: cukup tambah baris baru di sini,
   tidak perlu ubah kode di halaman manapun. */
const ROLE_PERMISSIONS = {
    management: ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    admin:      ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    owner:      ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    kasir:      ["kasir", "alokasi", "stok", "transfer"]
};

/* Role yang boleh MEMBUAT perintah transfer antar outlet (di halaman Stok).
   Kasir hanya mengirim / menerima sesuai perintah, tidak bisa membuat
   atau menolak transfer. Dipakai juga di Firestore Rules. */
const ROLE_BUAT_TRANSFER = ["management", "admin", "owner", "forecaster"];

function bolehBuatTransfer(role) {
    return ROLE_BUAT_TRANSFER.indexOf(role) !== -1;
}

/* Cek apakah sebuah role boleh mengakses halaman tertentu.
   Kalau role tidak dikenali (typo/belum didaftarkan), otomatis
   dianggap tidak punya akses sama sekali (aman by default). */
function cekAksesHalaman(role, halamanKey) {
    const izin = ROLE_PERMISSIONS[role];
    if (!izin) return false;
    return izin.indexOf(halamanKey) !== -1;
}

/* Ambil daftar halaman (yang sudah dibangun) yang boleh diakses role ini.
   Dipakai untuk render menu navigasi & Beranda. */
function getHalamanUntukRole(role) {
    const izin = ROLE_PERMISSIONS[role] || [];
    return izin.map(function (key) {
        return Object.assign({ key: key }, HALAMAN_INFO[key]);
    });
}

/* Render HTML sidebar navigasi, otomatis menyesuaikan role user.
   Dipakai bersama oleh beranda.html, pos.html, stok.html, pengaturan.html
   supaya tampilan & perilaku sidebar konsisten di semua halaman.
   activeKey: "beranda" | "kasir" | "stok" | "pengaturan" | dst */
function renderSidebar(currentUser, activeKey) {
    const halamanDiizinkan = getHalamanUntukRole(currentUser.role);
    const sudahDibangun = halamanDiizinkan.filter(function (h) { return h.dibangun; });
    const belumDibangun = halamanDiizinkan.filter(function (h) { return !h.dibangun; });

    let html = '<img src="logo.png" alt="Oma Opa" class="sidebar-logo">';

    // Kasir langsung kerja di halaman utamanya (pos.html), tidak perlu
    // menu Beranda terpisah. Role lain (admin/owner/forecaster/dst)
    // tetap punya Beranda sebagai halaman ringkasan/navigasi awal.
    if (currentUser.role !== "kasir") {
        html += '<a href="beranda.html" class="nav-item' + (activeKey === "beranda" ? " active" : "") + '">🏠  Beranda</a>';
        html += '<div class="nav-divider"></div>';
    }

    sudahDibangun.forEach(function (h) {
        const activeClass = h.key === activeKey ? " active" : "";
        let badge = "";
        if (h.key === "transfer") {
            badge = '<span id="badgeTransfer" style="display:none; float:right; background:#E8A33D; color:#ffffff; font-size:10px; font-weight:800; min-width:16px; height:16px; line-height:16px; text-align:center; border-radius:8px; padding:0 4px;"></span>';
        }
        html += '<a href="' + h.href + '" class="nav-item' + activeClass + '">' + h.icon + '  ' + h.title + badge + '</a>';
    });

    if (belumDibangun.length > 0) {
        html += '<div class="nav-divider"></div>';
        html += '<div class="nav-label">Segera hadir</div>';
        belumDibangun.forEach(function (h) {
            html += '<span class="nav-item disabled">' + h.icon + '  ' + h.title + '</span>';
        });
    }

    html += '<div class="user-block">';
    html += '<div class="user-name">' + currentUser.nama + '</div>';
    html += '<div class="user-role">' + currentUser.role + ' · ' + currentUser.outlet + '</div>';
    html += '<button class="logout-link" onclick="logout()">Keluar</button>';
    html += '</div>';

    // Badge angka di menu Transfer (tugas yang menunggu aksi).
    // Dijalankan setelah sidebar dipasang ke halaman.
    setTimeout(function () { muatBadgeTransfer(currentUser); }, 50);

    return html;
}

/* Hitung transfer yang menunggu aksi user ini lalu tampilkan di badge menu:
   - Kasir: perlu dikirim (outlet asal) + perlu diterima (outlet tujuan)
   - Forecaster/admin: transfer dengan selisih yang belum dicek */
function muatBadgeTransfer(currentUser) {
    const el = document.getElementById("badgeTransfer");
    if (!el) return;
    if (typeof firebase === "undefined" || !firebase.apps || firebase.apps.length === 0) return;

    const dbBadge = firebase.firestore();
    const col = dbBadge.collection("transfer_stok");
    let queries;

    if (bolehBuatTransfer(currentUser.role)) {
        queries = [col.where("selisih", "==", true).where("selisihDicek", "==", false)];
    } else if (currentUser.role === "kasir") {
        queries = [
            col.where("dari", "==", currentUser.outlet).where("status", "==", "menunggu_kirim"),
            col.where("ke", "==", currentUser.outlet).where("status", "==", "dikirim")
        ];
    } else {
        return;
    }

    Promise.all(queries.map(function (q) { return q.get(); })).then(function (hasil) {
        const total = hasil.reduce(function (a, snap) { return a + snap.size; }, 0);
        if (total > 0) {
            el.textContent = total;
            el.style.display = "inline-block";
        } else {
            el.style.display = "none";
        }
    }).catch(function () { /* badge hanya pelengkap, abaikan error */ });
}

/* Proteksi halaman: panggil di awal tiap halaman (setelah currentUser
   didapat) untuk otomatis tolak akses & redirect kalau tidak berhak.
   Kalau ditolak, isi elemen dengan id "mainContent" (kalau ada)
   dengan pesan penolakan; kalau tidak ada, langsung redirect ke beranda. */
function jagaAksesHalaman(role, halamanKey) {
    if (cekAksesHalaman(role, halamanKey)) return true;

    const target = document.getElementById("mainContent");
    if (target) {
        target.innerHTML =
            '<div style="text-align:center; color:#8a796e; font-size:12px; padding:40px 0;">' +
            'Anda tidak memiliki akses ke halaman ini.<br>' +
            '<a href="beranda.html" style="color:#e87913;">Kembali ke Beranda</a></div>';
    } else {
        window.location.href = "beranda.html";
    }
    return false;
}
