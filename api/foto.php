<?php
/* Menampilkan foto produk yang disimpan oleh upload-foto.php */

require __DIR__ . '/foto-config.php';

$nama = $_GET['f'] ?? '';
$path = FOLDER_FOTO . '/' . $nama;

if (!preg_match('/^\d{10}_[a-f0-9]{8}(_[a-z0-9-]{1,40})?\.jpg$/', $nama) || !is_file($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
header('Cache-Control: public, max-age=31536000, immutable');
header('X-Content-Type-Options: nosniff');
readfile($path);
