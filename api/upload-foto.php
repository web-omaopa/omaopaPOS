<?php
/* =========================================================
   UPLOAD FOTO PRODUK & BUKTI PENGELUARAN KE HOSTINGER
   - Foto produk: dari pengaturan.html (Tambah/Edit Produk),
     hanya role management / admin / owner
   - Bukti pengeluaran (POST jenis=bukti): dari kas.html,
     boleh juga role kasir; disimpan di folder bukti_pengeluaran/
   - Foto disimpan DI LUAR public_html (folder foto_produk/)
     supaya tidak terhapus saat deploy ulang dari GitHub,
     lalu ditampilkan lewat api/foto.php
   ========================================================= */

require __DIR__ . '/foto-config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function balas($kode, $data) {
    http_response_code($kode);
    echo json_encode($data);
    exit;
}

// GET = cek kesiapan server (tanpa info rahasia)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    balas(200, [
        'ok' => true,
        'gd' => function_exists('imagecreatefromstring'),
        'folderSiap' => siapkanFolderFoto(),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    balas(405, ['error' => 'Metode tidak diizinkan.']);
}

/* ---------- 1. Cek login (token Firebase) ---------- */

// Token dikirim lewat form (header Authorization kadang dibuang oleh server)
$token = is_string($_POST['token'] ?? null) ? trim($_POST['token']) : '';
if ($token === '') {
    balas(401, ['error' => 'Sesi login tidak ditemukan. Coba login ulang.']);
}

$uid = verifikasiTokenFirebase($token);
if (!$uid) {
    balas(401, ['error' => 'Sesi login tidak valid atau sudah habis. Coba login ulang.']);
}

/* ---------- 2. Cek role dari Firestore ---------- */

$jenisBukti = ($_POST['jenis'] ?? '') === 'bukti';
$folderTujuan = $jenisBukti ? FOLDER_BUKTI : FOLDER_FOTO;

$role = ambilRoleUser($uid, $token);
if (!in_array($role, $jenisBukti ? ROLE_BOLEH_UPLOAD_BUKTI : ROLE_BOLEH_UPLOAD, true)) {
    balas(403, ['error' => $jenisBukti ? 'Role Anda tidak punya izin upload bukti pengeluaran.' : 'Role Anda tidak punya izin upload foto produk.']);
}

/* ---------- 3. Cek file ---------- */

if (empty($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
    balas(400, ['error' => 'File foto tidak terkirim. Coba lagi.']);
}
if ($_FILES['foto']['size'] > MAKS_UKURAN_UPLOAD) {
    balas(413, ['error' => 'File terlalu besar (maks 5 MB).']);
}

$isi = file_get_contents($_FILES['foto']['tmp_name']);
$info = @getimagesizefromstring($isi);
if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
    balas(400, ['error' => 'File bukan gambar JPG, PNG, atau WEBP.']);
}

if (!siapkanFolder($folderTujuan)) {
    balas(500, ['error' => 'Folder penyimpanan foto di Hostinger tidak bisa ditulis.']);
}

/* ---------- 4. Simpan (dibuat ulang jadi JPEG bersih) ---------- */

$namaAsli = preg_replace('/[^a-z0-9-]/', '', strtolower(pathinfo($_FILES['foto']['name'], PATHINFO_FILENAME)));
// Nama bukti lebih acak (16 byte) karena foto.php tidak memeriksa login
$namaFile = $jenisBukti
    ? time() . '_' . bin2hex(random_bytes(16)) . '.jpg'
    : time() . '_' . bin2hex(random_bytes(4)) . ($namaAsli !== '' ? '_' . substr($namaAsli, 0, 40) : '') . '.jpg';
$tujuan = $folderTujuan . '/' . $namaFile;

if (function_exists('imagecreatefromstring')) {
    $img = @imagecreatefromstring($isi);
    if (!$img) {
        balas(400, ['error' => 'Gambar gagal dibaca. Coba gambar lain.']);
    }
    // Latar putih untuk PNG transparan
    $w = imagesx($img);
    $h = imagesy($img);
    $kanvas = imagecreatetruecolor($w, $h);
    imagefill($kanvas, 0, 0, imagecolorallocate($kanvas, 255, 255, 255));
    imagecopy($kanvas, $img, 0, 0, 0, 0, $w, $h);
    $berhasil = imagejpeg($kanvas, $tujuan, 85);
    imagedestroy($img);
    imagedestroy($kanvas);
} else {
    if ($info[2] !== IMAGETYPE_JPEG) {
        balas(500, ['error' => 'Server belum bisa memproses PNG/WEBP. Gunakan foto JPG.']);
    }
    $berhasil = file_put_contents($tujuan, $isi) !== false;
}

if (!$berhasil) {
    balas(500, ['error' => 'Gagal menyimpan foto di Hostinger.']);
}

balas(200, ['url' => 'api/foto.php?' . ($jenisBukti ? 'b=' : 'f=') . $namaFile]);


/* =========================================================
   FUNGSI BANTU
   ========================================================= */

function b64url_decode($s) {
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

function ambilUrl($url, $headers = []) {
    $ctx = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", $headers),
        'timeout' => 10,
        'ignore_errors' => true,
    ]]);
    $hasil = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $mm)) {
        $status = (int) $mm[1];
    }
    return [$status, $hasil];
}

// Sertifikat publik Google untuk token Firebase, disimpan sementara 1 jam
function ambilSertifikatGoogle() {
    siapkanFolderFoto();
    $cache = FOLDER_FOTO . '/.sertifikat-google.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600) {
        $data = json_decode(file_get_contents($cache), true);
        if (is_array($data)) return $data;
    }
    [$status, $isi] = ambilUrl('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    $data = $status === 200 ? json_decode($isi, true) : null;
    if (is_array($data)) {
        @file_put_contents($cache, $isi);
        return $data;
    }
    return [];
}

// Mengembalikan uid kalau token sah, atau null
function verifikasiTokenFirebase($token) {
    $bagian = explode('.', $token);
    if (count($bagian) !== 3) return null;

    $header = json_decode(b64url_decode($bagian[0]), true);
    $payload = json_decode(b64url_decode($bagian[1]), true);
    $tanda = b64url_decode($bagian[2]);
    if (!$header || !$payload || ($header['alg'] ?? '') !== 'RS256') return null;

    $sertifikat = ambilSertifikatGoogle()[$header['kid'] ?? ''] ?? null;
    if (!$sertifikat) return null;

    $kunci = openssl_pkey_get_public($sertifikat);
    if (!$kunci || openssl_verify($bagian[0] . '.' . $bagian[1], $tanda, $kunci, OPENSSL_ALGO_SHA256) !== 1) {
        return null;
    }

    $sekarang = time();
    if (($payload['aud'] ?? '') !== FIREBASE_PROJECT_ID) return null;
    if (($payload['iss'] ?? '') !== 'https://securetoken.google.com/' . FIREBASE_PROJECT_ID) return null;
    if (($payload['exp'] ?? 0) < $sekarang) return null;
    if (($payload['iat'] ?? PHP_INT_MAX) > $sekarang + 300) return null;
    if (empty($payload['sub']) || !is_string($payload['sub'])) return null;

    return $payload['sub'];
}

// Baca role user dari Firestore memakai token user itu sendiri
function ambilRoleUser($uid, $token) {
    $url = 'https://firestore.googleapis.com/v1/projects/' . FIREBASE_PROJECT_ID .
        '/databases/(default)/documents/users/' . rawurlencode($uid);
    [$status, $isi] = ambilUrl($url, ['Authorization: Bearer ' . $token]);
    if ($status !== 200) return null;
    $doc = json_decode($isi, true);
    return $doc['fields']['role']['stringValue'] ?? null;
}
