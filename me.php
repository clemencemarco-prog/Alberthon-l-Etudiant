<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';

$cu = current_user();
if ($cu === null) {
    json_error('not_authenticated', 'Non connecté.', 401);
}
json_response($cu);
