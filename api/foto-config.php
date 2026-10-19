<?php
/* Pengaturan bersama untuk upload-foto.php dan foto.php */

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

const FIREBASE_PROJECT_ID = 'omaopa-pos';
const ROLE_BOLEH_UPLOAD = ['management', 'admin', 'owner'];
const MAKS_UKURAN_UPLOAD = 5 * 1024 * 1024;

// Satu tingkat di atas public_html, supaya tidak ikut terhapus saat deploy ulang
define('FOLDER_FOTO', dirname(__DIR__, 2) . '/foto_produk');

function siapkanFolderFoto() {
    if (!is_dir(FOLDER_FOTO)) {
        @mkdir(FOLDER_FOTO, 0755, true);
    }
    return is_dir(FOLDER_FOTO) && is_writable(FOLDER_FOTO);
}
