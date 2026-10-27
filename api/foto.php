<?php
/* Menampilkan foto produk (?f=) dan bukti pengeluaran (?b=)
   yang disimpan oleh upload-foto.php */

require __DIR__ . '/foto-config.php';

if (isset($_GET['b'])) {
    $nama = is_string($_GET['b']) ? $_GET['b'] : '';
    $path = FOLDER_BUKTI . '/' . $nama;
    $cocok = preg_match('/^\d{10}_[a-f0-9]{32}\.jpg$/', $nama);
    $cache = 'private, max-age=86400';
} else {
    $nama = is_string($_GET['f'] ?? null) ? $_GET['f'] : '';
    $path = FOLDER_FOTO . '/' . $nama;
    $cocok = preg_match('/^\d{10}_[a-f0-9]{8}(_[a-z0-9-]{1,40})?\.jpg$/', $nama);
    $cache = 'public, max-age=31536000, immutable';
}

if (!$cocok || !is_file($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
header('Cache-Control: ' . $cache);
header('X-Content-Type-Options: nosniff');
readfile($path);
