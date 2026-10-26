<?php
/* Pengaturan bersama untuk upload-foto.php dan foto.php */

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

const FIREBASE_PROJECT_ID = 'omaopa-pos';
const ROLE_BOLEH_UPLOAD = ['management', 'admin', 'owner'];
// Bukti pengeluaran outlet (kas.html) juga boleh diupload kasir
const ROLE_BOLEH_UPLOAD_BUKTI = ['management', 'admin', 'owner', 'kasir'];
const MAKS_UKURAN_UPLOAD = 5 * 1024 * 1024;

// Satu tingkat di atas public_html, supaya tidak ikut terhapus saat deploy ulang
define('FOLDER_FOTO', dirname(__DIR__, 2) . '/foto_produk');

// Bukti pengeluaran disimpan terpisah dari foto produk
define('FOLDER_BUKTI', dirname(__DIR__, 2) . '/bukti_pengeluaran');

function siapkanFolder($folder) {
    if (!is_dir($folder)) {
        @mkdir($folder, 0755, true);
    }
    return is_dir($folder) && is_writable($folder);
}

function siapkanFolderFoto() {
    return siapkanFolder(FOLDER_FOTO);
}
