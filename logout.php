<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}

logout();
json_response(['ok' => true]);
