<?php
declare(strict_types=1);

@set_time_limit(120);
@ini_set('max_execution_time', '120');
ini_set('display_errors', '0');

require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../claude.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('method_not_allowed', 'POST requis.', 405);
}

$body = read_json_body();
$options = $body['options'] ?? null;

if (!is_array($options) || count($options) < 2 || count($options) > 3) {
    json_error('invalid', 'Il faut 2 ou 3 options à comparer.', 400);
}

// Profil : autorité DB si user connecté, sinon ce qui vient du body
$profile = null;
$cu = current_user();
if ($cu !== null && !empty($cu['profile'])) {
    $profile = $cu['profile'];
} elseif (isset($body['profile']) && is_array($body['profile'])) {
    $profile = $body['profile'];
}

try {
    $result = claude_compare($options, $profile);
    json_response([
        'criteria'  => $result['criteria'],
        'synthesis' => $result['synthesis'],
        'options'   => array_map(
            fn($o) => [
                'type'   => $o['type']   ?? null,
                'title'  => $o['title']  ?? '',
                'source' => $o['source'] ?? '',
                'url'    => $o['url']    ?? '',
            ],
            $options
        ),
    ]);
} catch (Throwable $e) {
    error_log('[ORI] compare error: ' . $e->getMessage());
    json_error('compare_error', $e->getMessage(), 500);
}
