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
    kasir:      { href: "kasir.html",      icon: "🧾", title: "Kasir",           desc: "Buat transaksi penjualan",        dibangun: true },
    stok:       { href: "stok.html",       icon: "📦", title: "Stok",            desc: "Lihat & pantau stok outlet",      dibangun: true },
    alokasi:    { href: "alokasi.html",    icon: "📋", title: "Alokasi Stok",    desc: "Bagi stok harian per outlet",     dibangun: true },
    master:     { href: "master.html",     icon: "🗂️", title: "Data Master",     desc: "Kelola outlet, produk, & user",   dibangun: true },
    produk:     { href: "produk.html",     icon: "🥐", title: "Produk",          desc: "Kelola daftar & harga produk",    dibangun: true, hub: true },
    outlet:     { href: "outlet.html",     icon: "🏬", title: "Kelola Outlet",   desc: "Kelola 28 outlet & pembagian area", dibangun: true, hub: true },
    user:       { href: "user.html",       icon: "👤", title: "Kelola User",     desc: "Tambah & atur akun pengguna",     dibangun: true, hub: true },
    transfer:   { href: "transfer.html",   icon: "🚚", title: "Transfer Outlet", desc: "Pindahkan stok antar outlet",     dibangun: false },
    riwayat:    { href: "riwayat.html",    icon: "🕘", title: "Riwayat",         desc: "Riwayat transaksi & transfer",    dibangun: false },
    laporan:    { href: "laporan.html",    icon: "📊", title: "Laporan",         desc: "Analisis penjualan & stok",       dibangun: false },
    pengaturan: { href: "pengaturan.html", icon: "⚙️", title: "Pengaturan",      desc: "Kelola outlet, user, & sistem",   dibangun: false }
};

/* Daftar role dan halaman apa saja yang boleh mereka akses.
   Tinggal tambah/kurangi key di sini untuk ubah hak akses.
   Contoh menambah role baru: cukup tambah baris baru di sini,
   tidak perlu ubah kode di halaman manapun. */
const ROLE_PERMISSIONS = {
    management: ["kasir", "stok", "produk", "outlet", "user", "alokasi", "transfer", "riwayat", "laporan", "pengaturan"],
    admin:      ["kasir", "stok", "produk", "outlet", "user", "alokasi", "transfer", "riwayat", "laporan", "pengaturan"],
    owner:      ["kasir", "stok", "produk", "outlet", "user", "alokasi", "transfer", "riwayat", "laporan", "pengaturan"],
    kasir:      ["kasir", "stok", "transfer"],
    forecaster: ["stok", "alokasi", "transfer", "laporan"]
};

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
   Dipakai bersama oleh beranda.html, kasir.html, stok.html, produk.html
   supaya tampilan & perilaku sidebar konsisten di semua halaman.
   activeKey: "beranda" | "kasir" | "stok" | "produk" | dst */
function renderSidebar(currentUser, activeKey) {
    const halamanDiizinkan = getHalamanUntukRole(currentUser.role);

    // Halaman "hub" (outlet, produk, user) tidak tampil satu-satu di sidebar,
    // tapi digabung jadi satu menu "Data Master" yang mengarah ke master.html
    const sudahDibangun = halamanDiizinkan.filter(function (h) { return h.dibangun && !h.hub; });
    const belumDibangun = halamanDiizinkan.filter(function (h) { return !h.dibangun; });
    const adaAksesHub = halamanDiizinkan.some(function (h) { return h.hub && h.dibangun; });

    // Kunci halaman yang dianggap "masih di dalam" Data Master,
    // supaya menu tetap ter-highlight aktif walau sedang di outlet.html/produk.html/user.html
    const hubActiveKeys = ["master", "outlet", "produk", "user"];

    let html = '<div class="brand">🥯 Oma Opa</div>';

    html += '<a href="beranda.html" class="nav-item' + (activeKey === "beranda" ? " active" : "") + '">🏠  Beranda</a>';
    html += '<div class="nav-divider"></div>';

    sudahDibangun.forEach(function (h) {
        const activeClass = h.key === activeKey ? " active" : "";
        html += '<a href="' + h.href + '" class="nav-item' + activeClass + '">' + h.icon + '  ' + h.title + '</a>';
    });

    if (adaAksesHub) {
        const isActive = hubActiveKeys.indexOf(activeKey) !== -1;
        html += '<a href="master.html" class="nav-item' + (isActive ? " active" : "") + '">🗂️  Data Master</a>';
    }

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

    return html;
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
