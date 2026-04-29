<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * Couche d'accès MariaDB : PDO singleton + helpers requêtes préparées.
 * 100% PHP natif (aucune lib externe).
 */

/** Renvoie l'instance PDO singleton. Lance RuntimeException si connexion KO. */
function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    if (DB_NAME === '' || DB_USER === '') {
        throw new RuntimeException('DB credentials manquants — vérifie .env');
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT, DB_NAME
    );
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_general_ci",
    ];
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    return $pdo;
}

/** SELECT 1 ligne ou null. */
function db_one(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** SELECT toutes les lignes. */
function db_all(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/** INSERT / UPDATE / DELETE — renvoie le nombre de lignes affectées. */
function db_run(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/** Renvoie le dernier id auto-incrémenté inséré. */
function db_last_id(): int
{
    return (int) db()->lastInsertId();
}
