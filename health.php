<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

/**
 * Endpoint de diagnostic. Vérifie .env, DB, clé API.
 * Retourne du JSON avec des booléens — utilisé par le frontend pour afficher
 * l'indicateur 🟢 / 🔴 et par toi pour vérifier rapidement l'état du serveur.
 */

$status = [
    'status'      => 'ok',
    'app'         => APP_NAME,
    'version'     => APP_VERSION,
    'env'         => APP_ENV,
    'php_version' => PHP_VERSION,
    'has_api_key' => CLAUDE_API_KEY !== '',
    'db'          => 'unknown',
];

// Test DB
try {
    require_once __DIR__ . '/../db.php';
    $row = db_one('SELECT 1 AS ok');
    $status['db'] = ($row !== null && (int)$row['ok'] === 1) ? 'connected' : 'error';

    // Liste les tables présentes pour confirmer que le SQL a été exécuté
    $tables = db_all('SHOW TABLES');
    $tableNames = array_map(fn($r) => array_values($r)[0], $tables);
    $status['tables'] = $tableNames;
    $status['schema_ready'] = count(array_intersect(
        ['users', 'sessions', 'user_profiles', 'conversation_logs'],
        $tableNames
    )) === 4;
} catch (Throwable $e) {
    $status['db'] = 'error';
    $status['db_error'] = $e->getMessage();
    $status['schema_ready'] = false;
}

json_response($status);
