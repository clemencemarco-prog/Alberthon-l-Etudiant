<?php
require_once __DIR__ . '/config.php';

function url($path = '') {
    return APP_BASE_URL . ltrim($path, '/');
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars(APP_NAME) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= url('css/reset.css') ?>">
    <link rel="stylesheet" href="<?= url('css/main.css') ?>">
    <link rel="stylesheet" href="<?= url('css/sidebar.css') ?>">
    <link rel="stylesheet" href="<?= url('css/chat.css') ?>">
    <link rel="stylesheet" href="<?= url('css/popups.css') ?>">
    <link rel="stylesheet" href="<?= url('css/onboarding.css') ?>">
    <link rel="stylesheet" href="<?= url('css/save.css') ?>">
    <link rel="stylesheet" href="<?= url('css/comparison.css') ?>">
</head>
<body>
    <?php include __DIR__ . '/includes/header.php'; ?>
    <main class="app">
        <?php include __DIR__ . '/includes/sidebar.php'; ?>
        <?php include __DIR__ . '/includes/chat.php'; ?>
    </main>
    <?php include __DIR__ . '/includes/footer.php'; ?>
</body>
</html>
