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
    laporan:        { href: "laporan.html",        icon: "📊", title: "Laporan",         desc: "Rekap & download laporan penjualan",         dibangun: true },
    pengaturan:     { href: "pengaturan.html",     icon: "⚙️", title: "Pengaturan",      desc: "Kelola produk, outlet, & user",     dibangun: true },
    // Shift & Kas sengaja paling bawah di menu
    kas:            { href: "kas.html",            icon: "💰", title: "Shift & Kas", desc: "Uang di laci, pengeluaran, akhiri shift & tutup toko", dibangun: true }
};

/* Daftar role dan halaman apa saja yang boleh mereka akses.
   Tinggal tambah/kurangi key di sini untuk ubah hak akses.
   Contoh menambah role baru: cukup tambah baris baru di sini,
   tidak perlu ubah kode di halaman manapun. */
const ROLE_PERMISSIONS = {
    management: ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    admin:      ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    owner:      ["kasir", "stok", "pengaturan", "alokasi", "transfer", "riwayat", "laporan"],
    kasir:      ["kasir", "kas", "alokasi", "stok", "transfer"],
    forecaster: ["stok", "transfer", "laporan"]
};

/* Role yang boleh MEMBUAT perintah transfer antar outlet (di halaman Stok).
   Kasir hanya mengirim / menerima sesuai perintah, tidak bisa membuat
   atau menolak transfer. Dipakai juga di Firestore Rules. */
const ROLE_BUAT_TRANSFER = ["management", "admin", "owner", "forecaster"];

function bolehBuatTransfer(role) {
    return ROLE_BUAT_TRANSFER.indexOf(role) !== -1;
}

/* =====================================================================
   ROLE DARI DATABASE (koleksi "roles", dikelola di Pengaturan > Role)
   Dokumen roles/{namaRole}: { izin: ["kasir","stok",...], buatTransfer: bool }
   - Role di database menimpa/menambah ROLE_PERMISSIONS di atas.
   - "management" selalu bisa semua halaman dan tidak bisa diubah.
   - Kalau database gagal dibaca, tetap memakai daftar bawaan di atas.
========================================================================= */
const ROLE_TERKUNCI = "management";
const SEMUA_HALAMAN = Object.keys(HALAMAN_INFO);

function terapkanDataRole(nama, data) {
    if (nama === ROLE_TERKUNCI || !data) return;
    ROLE_PERMISSIONS[nama] = (data.izin || []).filter(function (k) { return HALAMAN_INFO[k]; });
    const idx = ROLE_BUAT_TRANSFER.indexOf(nama);
    if (data.buatTransfer && idx === -1) ROLE_BUAT_TRANSFER.push(nama);
    if (!data.buatTransfer && idx !== -1) ROLE_BUAT_TRANSFER.splice(idx, 1);
}

/* Muat izin role user dari database, lalu jalankan lanjut().
   Dipanggil setiap halaman setelah data user siap. */
function siapkanRole(role, lanjut) {
    ROLE_PERMISSIONS[ROLE_TERKUNCI] = SEMUA_HALAMAN.slice();
    if (!role || role === ROLE_TERKUNCI) { lanjut(); return; }
    firebase.firestore().collection("roles").doc(role).get()
        .then(function (doc) { if (doc.exists) terapkanDataRole(role, doc.data()); })
        .catch(function (error) { console.warn("Role dari database belum bisa dibaca, pakai bawaan:", error.message); })
        .then(function () { lanjut(); });
}

/* Helper keamanan: escape data dari Firestore sebelum disisipkan ke HTML.
   escapeHtmlAman  -> untuk teks biasa / isi elemen / isi atribut.
   escJsAttr       -> untuk string di dalam handler inline, misalnya
                      onclick="hapus('...')". Semua karakter non-alfanumerik
                      diubah ke \xNN supaya tidak bisa keluar dari string/atribut. */
function escapeHtmlAman(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}
function escJsAttr(t) {
    return String(t == null ? "" : t).replace(/[^a-zA-Z0-9 ._-]/g, function (c) {
        const code = c.charCodeAt(0);
        return code < 256
            ? "\\x" + ("0" + code.toString(16)).slice(-2)
            : "\\u" + ("000" + code.toString(16)).slice(-4);
    });
}

/* Cek apakah sebuah role boleh mengakses halaman tertentu.
   Kalau role tidak dikenali (typo/belum didaftarkan), otomatis
   dianggap tidak punya akses sama sekali (aman by default). */
function cekAksesHalaman(role, halamanKey) {
    const izin = izinEfektif(role);
    if (!izin) return false;
    return izin.indexOf(halamanKey) !== -1;
}

/* Halaman yang hanya untuk role kasir (selalu ada untuk kasir, tidak
   pernah untuk role lain), apa pun isi ROLE_PERMISSIONS / koleksi roles. */
const HALAMAN_HANYA_KASIR = ["kas"];

function izinEfektif(role) {
    const izin = ROLE_PERMISSIONS[role];
    if (!izin) return null;
    const tanpaKhusus = izin.filter(function (k) { return HALAMAN_HANYA_KASIR.indexOf(k) === -1; });
    return role === "kasir" ? tanpaKhusus.concat(HALAMAN_HANYA_KASIR) : tanpaKhusus;
}

/* Ambil daftar halaman (yang sudah dibangun) yang boleh diakses role ini.
   Dipakai untuk render menu navigasi & Beranda.
   Urutan selalu mengikuti HALAMAN_INFO (Kasir, Stok, Manajemen Menu,
   Transfer, ...), bukan urutan di daftar izin, supaya menu sama di
   semua role. */
function getHalamanUntukRole(role) {
    const izin = izinEfektif(role) || [];
    return Object.keys(HALAMAN_INFO)
        .filter(function (key) { return izin.indexOf(key) !== -1; })
        .map(function (key) { return Object.assign({ key: key }, HALAMAN_INFO[key]); });
}

/* Render HTML sidebar navigasi, otomatis menyesuaikan role user.
   Dipakai bersama oleh beranda.html, pos.html, stok.html, pengaturan.html
   supaya tampilan & perilaku sidebar konsisten di semua halaman.
   activeKey: "beranda" | "kasir" | "stok" | "pengaturan" | dst */
/* =====================================================================
   SIDEBAR BISA DIBUKA-TUTUP
   Terbuka: logo + nama menu. Tertutup: strip ikon saja (tanpa logo),
   nama menu muncul sebagai tooltip. Pilihan disimpan per perangkat
   (localStorage "omaopa_sidebar") dan berlaku di semua halaman.
   Gaya disisipkan dari sini supaya tidak perlu mengubah CSS tiap halaman.
========================================================================= */
const SIDEBAR_KUNCI = "omaopa_sidebar";

(function pasangGayaSidebar() {
    if (typeof document === "undefined" || document.getElementById("gayaSidebarLipat")) return;
    const css =
        ".sidebar { transition: width .18s ease, padding .18s ease; }" +
        ".sidebar .sb-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 18px; }" +
        ".sidebar .sb-head .sidebar-logo { margin-bottom: 0; min-width: 0; max-width: 118px; }" +
        ".sidebar .sb-toggle { flex-shrink: 0; width: 32px; height: 32px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.10); color: #B8C7E0; font-size: 16px; line-height: 32px; cursor: pointer; padding: 0; }" +
        ".sidebar .sb-toggle:hover { background: rgba(255,255,255,0.20); color: #ffffff; }" +
        ".sidebar .sb-toggle:focus-visible { outline: 2px solid #E8A33D; outline-offset: 2px; }" +
        ".sidebar .nav-item { position: relative; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
        ".sidebar .nav-ikon { display: inline-block; width: 18px; text-align: center; margin-right: 6px; }" +
        ".sidebar .logout-link .nav-ikon { display: none; }" +
        "html.sb-tutup .sidebar { width: 64px; padding-left: 10px; padding-right: 10px; }" +
        "html.sb-tutup .sidebar .sb-head { justify-content: center; }" +
        "html.sb-tutup .sidebar .sidebar-logo, html.sb-tutup .sidebar .nav-teks, html.sb-tutup .sidebar .nav-label," +
        " html.sb-tutup .sidebar .user-name, html.sb-tutup .sidebar .user-role { display: none; }" +
        "html.sb-tutup .sidebar .nav-item { text-align: center; padding-left: 0; padding-right: 0; overflow: visible; }" +
        "html.sb-tutup .sidebar .nav-ikon { margin-right: 0; font-size: 16px; }" +
        "html.sb-tutup .sidebar #badgeTransfer { position: absolute; top: 2px; right: 2px; float: none !important; }" +
        "html.sb-tutup .sidebar .user-block { text-align: center; }" +
        "html.sb-tutup .sidebar .logout-link .nav-ikon { display: inline-block; margin-right: 0; font-size: 16px; }" +
        "@media (prefers-reduced-motion: reduce) { .sidebar { transition: none; } }";
    const el = document.createElement("style");
    el.id = "gayaSidebarLipat";
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
    // Pasang status tersimpan secepatnya supaya tidak berkedip saat halaman dibuka
    if (sidebarTersimpanTutup()) document.documentElement.classList.add("sb-tutup");
})();

function sidebarTersimpanTutup() {
    let v = null;
    try { v = localStorage.getItem(SIDEBAR_KUNCI); } catch (e) { v = null; }
    if (v === "tutup") return true;
    if (v === "buka") return false;
    // Belum pernah dipilih: layar sempit (HP) mulai tertutup
    return typeof window !== "undefined" && window.innerWidth < 700;
}

function sidebarToggle() {
    const tutup = !document.documentElement.classList.contains("sb-tutup");
    document.documentElement.classList.toggle("sb-tutup", tutup);
    try { localStorage.setItem(SIDEBAR_KUNCI, tutup ? "tutup" : "buka"); } catch (e) { /* abaikan */ }
    const btn = document.getElementById("sbToggle");
    if (btn) {
        btn.setAttribute("aria-expanded", tutup ? "false" : "true");
        btn.title = tutup ? "Buka menu" : "Tutup menu";
    }
}

function itemSidebarHtml(ikon, judul) {
    return '<span class="nav-ikon" aria-hidden="true">' + ikon + '</span><span class="nav-teks">' + escapeHtmlAman(judul) + '</span>';
}

function renderSidebar(currentUser, activeKey) {
    const halamanDiizinkan = getHalamanUntukRole(currentUser.role);
    // Urutan mengikuti HALAMAN_INFO (Pengaturan, lalu Shift & Kas paling bawah)
    const sudahDibangun = halamanDiizinkan.filter(function (h) { return h.dibangun; });
    const belumDibangun = halamanDiizinkan.filter(function (h) { return !h.dibangun; });

    const tutup = document.documentElement.classList.contains("sb-tutup");
    let html = '<div class="sb-head">' +
        '<button type="button" class="sb-toggle" id="sbToggle" onclick="sidebarToggle()" aria-label="Buka/tutup menu" aria-expanded="' + (tutup ? "false" : "true") + '" title="' + (tutup ? "Buka menu" : "Tutup menu") + '">☰</button>' +
        '<img src="logo.png" alt="Oma Opa" class="sidebar-logo">' +
        '</div>';

    // Kasir langsung kerja di halaman utamanya (pos.html), tidak perlu
    // menu Beranda terpisah. Role lain (admin/owner/forecaster/dst)
    // tetap punya Beranda sebagai halaman ringkasan/navigasi awal.
    if (currentUser.role !== "kasir") {
        html += '<a href="beranda.html" class="nav-item' + (activeKey === "beranda" ? " active" : "") + '" title="Beranda">' + itemSidebarHtml("🏠", "Beranda") + '</a>';
        html += '<div class="nav-divider"></div>';
    }

    sudahDibangun.forEach(function (h) {
        const activeClass = h.key === activeKey ? " active" : "";
        let badge = "";
        if (h.key === "transfer") {
            badge = '<span id="badgeTransfer" style="display:none; float:right; background:#E8A33D; color:#ffffff; font-size:10px; font-weight:800; min-width:16px; height:16px; line-height:16px; text-align:center; border-radius:8px; padding:0 4px;"></span>';
        }
        html += '<a href="' + h.href + '" class="nav-item' + activeClass + '" title="' + escapeHtmlAman(h.title) + '">' + itemSidebarHtml(h.icon, h.title) + badge + '</a>';
    });

    if (belumDibangun.length > 0) {
        html += '<div class="nav-divider"></div>';
        html += '<div class="nav-label">Segera hadir</div>';
        belumDibangun.forEach(function (h) {
            html += '<span class="nav-item disabled" title="' + escapeHtmlAman(h.title) + ' (segera hadir)">' + itemSidebarHtml(h.icon, h.title) + '</span>';
        });
    }

    html += '<div class="user-block">';
    html += '<div class="user-name">' + escapeHtmlAman(currentUser.nama) + '</div>';
    html += '<div class="user-role">' + escapeHtmlAman(currentUser.role) + (String(currentUser.outlet || "").trim() ? ' · ' + escapeHtmlAman(currentUser.outlet) : '') + '</div>';
    html += '<button class="logout-link" onclick="logout()" title="Keluar">' + itemSidebarHtml("⏻", "Keluar") + '</button>';
    html += '</div>';

    // Badge angka di menu Transfer (tugas yang menunggu aksi).
    // Dijalankan setelah sidebar dipasang ke halaman.
    setTimeout(function () { muatBadgeTransfer(currentUser); }, 50);

    return html;
}

/* Hitung transfer yang menunggu aksi user ini lalu tampilkan di badge menu:
   - Kasir: perlu dikirim (outlet asal) + perlu diterima (outlet tujuan)
   - Forecaster/admin: transfer dengan selisih yang belum dicek
     + permintaan transfer dari kasir yang menunggu ACC */
function muatBadgeTransfer(currentUser) {
    const el = document.getElementById("badgeTransfer");
    if (!el) return;
    if (typeof firebase === "undefined" || !firebase.apps || firebase.apps.length === 0) return;

    const dbBadge = firebase.firestore();
    const col = dbBadge.collection("transfer_stok");
    let queries;

    if (bolehBuatTransfer(currentUser.role)) {
        queries = [
            col.where("selisih", "==", true).where("selisihDicek", "==", false),
            col.where("status", "==", "menunggu_acc")
        ];
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
