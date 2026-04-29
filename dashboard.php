<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

// Auth check : si pas connecté, redirect vers / avec un flag pour ouvrir la modale login
$cu = current_user();
if ($cu === null) {
    header('Location: /?login=1');
    exit;
}
$user = $cu['user'];

function du($path = '') {
    return APP_BASE_URL . ltrim($path, '/');
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mon tableau de bord — <?= htmlspecialchars(APP_NAME) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= du('css/reset.css') ?>">
    <link rel="stylesheet" href="<?= du('css/main.css') ?>">
    <link rel="stylesheet" href="<?= du('css/save.css') ?>">
    <link rel="stylesheet" href="<?= du('css/comparison.css') ?>">
    <link rel="stylesheet" href="<?= du('css/dashboard.css') ?>">
    <link rel="stylesheet" href="<?= du('css/profile-kpi.css') ?>">
    <!-- Leaflet CSS pour la carto géographique des pistes -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</head>
<body class="dashboard-body">
    <header class="site-header">
        <div class="site-header__inner">
            <a href="<?= du('') ?>" class="site-header__logo" aria-label="L'Etudiant — Accueil">
                <span class="logo-text">l'<strong>Etudiant</strong></span>
            </a>
            <nav class="site-header__actions" aria-label="Actions">
                <a href="<?= du('') ?>" class="dashboard-nav-link">💬 Chat</a>
                <span class="dashboard-user-pill">
                    <span class="dashboard-user-email"><?= htmlspecialchars($user['email']) ?></span>
                    <button type="button" class="dashboard-logout-btn" id="logout-btn" title="Se déconnecter">↪</button>
                </span>
            </nav>
        </div>
    </header>

    <main class="dashboard">
      <div class="dashboard-layout">
        <div class="dashboard-main">
        <!-- Zone 1 : header avec greeting + stats -->
        <section class="dashboard-greeting">
            <h1 class="dashboard-greeting__title">
                👋 Bonjour <?= htmlspecialchars(explode('@', $user['email'])[0]) ?>,
            </h1>
            <p class="dashboard-greeting__subtitle">
                voici où tu en es de ta réflexion d'orientation.
            </p>
            <div class="dashboard-stats" id="dashboard-stats">
                <span class="stat-pill stat-pill--loading">Chargement…</span>
            </div>
        </section>

        <div class="dashboard-grid">
            <!-- Zone 2 : timeline pistes -->
            <section class="zone zone-pistes" aria-labelledby="zone-pistes-title">
                <div class="zone__header">
                    <h2 id="zone-pistes-title" class="zone__title">📍 Mes pistes</h2>
                    <button type="button" class="zone__action-btn" id="add-piste-btn">+ Ajouter</button>
                </div>
                <div id="pistes-list" class="pistes-list">
                    <p class="zone__empty">Chargement…</p>
                </div>
            </section>

            <!-- Zone 3 : deadlines -->
            <aside class="zone zone-deadlines" aria-labelledby="zone-deadlines-title">
                <div class="zone__header">
                    <h2 id="zone-deadlines-title" class="zone__title">📅 Deadlines</h2>
                    <button type="button" class="zone__action-btn" id="add-deadline-btn">+ Ajouter</button>
                </div>
                <div id="deadlines-list" class="deadlines-list">
                    <p class="zone__empty">Chargement…</p>
                </div>
            </aside>
        </div>

        <!-- Zone 4 : documents -->
        <section class="zone zone-documents" aria-labelledby="zone-documents-title">
            <div class="zone__header">
                <h2 id="zone-documents-title" class="zone__title">📂 Documents à préparer</h2>
                <button type="button" class="zone__action-btn" id="add-doc-btn">+ Ajouter</button>
            </div>
            <div id="documents-list" class="documents-list">
                <p class="zone__empty">Chargement…</p>
            </div>
        </section>
        </div><!-- /.dashboard-main -->

        <!-- Sidebar KPI Profil — prototype visuel, données mockées -->
        <aside class="dashboard-sidebar" aria-label="Profil étudiant — KPI">
            <header class="kpi-sidebar-header">
                <p class="kpi-sidebar-header__title">📊 Mon profil — KPI</p>
                <p class="kpi-sidebar-header__subtitle">
                    Ta carrière comme un produit : suivi, profil, vélocité.
                    <span class="kpi-mock-badge" title="Données fictives le temps du prototype">Aperçu</span>
                </p>
            </header>

            <!-- Carte 1 : Cohérence profil ↔ pistes -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Cohérence profil ↔ pistes</h3>
                </div>
                <div class="kpi-coherence">
                    <div class="kpi-ring" id="kpi-ring" role="img" aria-label="Score de cohérence">
                        <span class="kpi-ring__value">82<span class="kpi-ring__unit">%</span></span>
                    </div>
                    <div class="kpi-coherence__body">
                        <p class="kpi-coherence__headline" id="kpi-coherence-headline">…</p>
                        <ul class="kpi-coherence__factors" id="kpi-coherence-factors"></ul>
                    </div>
                </div>
            </article>

            <!-- Carte 2 : Radar centres d'intérêt -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Centres d'intérêt</h3>
                    <span class="kpi-card__hint">profil sur 6 axes</span>
                </div>
                <div class="kpi-canvas-wrap kpi-canvas-wrap--tall">
                    <canvas id="kpi-radar"></canvas>
                </div>
                <p class="kpi-card__caption">Issu de tes goûts, spécialités et thèmes récurrents dans le chat ORI.</p>
            </article>

            <!-- Carte 3 : Donut domaines -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Pistes par domaine</h3>
                    <span class="kpi-card__hint">11 pistes</span>
                </div>
                <div class="kpi-canvas-wrap">
                    <canvas id="kpi-domaines"></canvas>
                </div>
            </article>

            <!-- Carte 4 : Funnel maturité -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Maturité de ta réflexion</h3>
                </div>
                <div class="kpi-funnel" id="kpi-funnel"></div>
                <p class="kpi-card__caption">Du brainstorming à un dossier prêt à envoyer.</p>
            </article>

            <!-- Carte 5 : Avancement par piste -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Avancement par piste</h3>
                </div>
                <div class="kpi-progress-list" id="kpi-progress"></div>
                <div class="kpi-legend">
                    <span><i class="kpi-legend-dot kpi-legend-dot--done"></i>Fait</span>
                    <span><i class="kpi-legend-dot kpi-legend-dot--encours"></i>En cours</span>
                    <span><i class="kpi-legend-dot kpi-legend-dot--afaire"></i>À faire</span>
                </div>
            </article>

            <!-- Carte 6 : Vélocité -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Vélocité hebdo</h3>
                    <span class="kpi-card__hint">8 sem.</span>
                </div>
                <div class="kpi-canvas-wrap kpi-canvas-wrap--small">
                    <canvas id="kpi-velocity"></canvas>
                </div>
                <p class="kpi-card__caption">Actions complétées par semaine. Tendance : ↗</p>
            </article>

            <!-- Carte 7 : Carto géographique -->
            <article class="kpi-card">
                <div class="kpi-card__header">
                    <h3 class="kpi-card__title">Carto de tes pistes</h3>
                    <span class="kpi-card__hint">📍</span>
                </div>
                <div class="kpi-map" id="kpi-map" aria-label="Carte des pistes d'orientation"></div>
                <div class="kpi-map-summary" id="kpi-map-summary"></div>
            </article>
        </aside>
      </div><!-- /.dashboard-layout -->
    </main>

    <a href="<?= du('') ?>" class="back-to-chat" aria-label="Revenir au chat">
        💬 Revenir au chat avec ORI
    </a>

    <!-- Toast de confirmation -->
    <div class="toast" id="toast" hidden></div>

    <!-- Modale réutilisable pour ajout piste / deadline / document
         Réutilise les classes .save-* déjà stylées dans css/save.css. -->
    <div class="save-overlay" id="dashboard-form-overlay">
        <div class="save-modal">
            <button type="button" class="save-close" id="dashboard-form-close" aria-label="Fermer">×</button>
            <h2 class="save-title" id="dashboard-form-title">Ajouter</h2>
            <p class="save-subtitle" id="dashboard-form-subtitle"></p>
            <form id="dashboard-form" novalidate>
                <div id="dashboard-form-fields"></div>
                <div class="save-buttons">
                    <button type="button" class="save-btn save-btn--ghost" id="dashboard-form-cancel">Annuler</button>
                    <button type="submit" class="save-btn save-btn--primary" id="dashboard-form-submit">Sauvegarder</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Comparaison interactive : barre flottante + modale (réutilise comparison.css/.js) -->
    <div class="compare-bar" id="compare-bar" aria-live="polite">
        <div class="compare-bar__inner">
            <span class="compare-bar__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
            </span>
            <span class="compare-bar__count" id="compare-bar-count">0 piste sélectionnée</span>
            <button type="button" class="compare-bar__action" id="compare-bar-action" disabled>Sélectionne au moins 2 pistes</button>
            <button type="button" class="compare-bar__close" id="compare-bar-close" aria-label="Tout désélectionner">×</button>
        </div>
    </div>

    <div class="compare-overlay" id="compare-overlay" aria-hidden="true">
        <div class="compare-modal" id="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-modal-title">
            <button type="button" class="compare-close" id="compare-close" aria-label="Fermer">×</button>
            <div class="compare-header">
                <h2 class="compare-title" id="compare-modal-title">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -4px; margin-right: 6px;">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    Comparaison de tes pistes
                </h2>
                <p class="compare-subtitle">Tableau croisé des pistes sélectionnées + recommandation personnalisée d'ORI.</p>
            </div>
            <div class="compare-body" id="compare-body"></div>
        </div>
    </div>

    <script>
        window.ORI_USER_EMAIL = <?= json_encode($user['email']) ?>;
    </script>
    <script src="<?= du('js/comparison.js') ?>"></script>
    <script src="<?= du('js/dashboard-app.js') ?>"></script>

    <!-- Chart.js + Leaflet pour la sidebar KPI Profil (prototype mocké) -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="<?= du('js/profile-kpi.js') ?>"></script>
</body>
</html>
