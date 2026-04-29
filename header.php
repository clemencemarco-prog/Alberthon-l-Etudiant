<header class="site-header">
    <div class="site-header__inner">
        <a href="<?= url('') ?>" class="site-header__logo" aria-label="L'Etudiant — Accueil">
            <span class="logo-text">l'<strong>Etudiant</strong></span>
        </a>
        <nav class="site-header__actions" aria-label="Actions">
            <div class="connection-status" id="connection-status" data-state="checking" title="État de la connexion au backend">
                <span class="connection-status__dot" aria-hidden="true"></span>
                <span class="connection-status__label">Connexion…</span>
            </div>
            <button type="button" class="header-btn" aria-label="Rechercher">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="7"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </button>
            <button type="button" class="header-btn" aria-label="Menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>
        </nav>
    </div>
</header>
