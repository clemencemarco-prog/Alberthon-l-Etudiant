    <!-- Barre flottante "X options sélectionnées" — visible uniquement quand 1+ checkboxes Comparer cochées -->
    <div class="compare-bar" id="compare-bar" aria-live="polite">
        <div class="compare-bar__inner">
            <span class="compare-bar__icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
            </span>
            <span class="compare-bar__count" id="compare-bar-count">0 option sélectionnée</span>
            <button type="button" class="compare-bar__action" id="compare-bar-action" disabled>Sélectionne au moins 2 options</button>
            <button type="button" class="compare-bar__close" id="compare-bar-close" aria-label="Tout désélectionner">×</button>
        </div>
    </div>

    <!-- Modale comparaison (tableau côte-à-côte + synthèse ORI) -->
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
                    Comparaison
                </h2>
                <p class="compare-subtitle">Tableau croisé des options sélectionnées + recommandation personnalisée d'ORI.</p>
            </div>
            <div class="compare-body" id="compare-body">
                <!-- Rempli par comparison.js : loader → table+synthesis ou error -->
            </div>
        </div>
    </div>

    <script src="<?= url('js/fake-responses.js') ?>"></script>
    <script src="<?= url('js/comparison.js') ?>"></script>
    <script src="<?= url('js/popups.js') ?>"></script>
    <script src="<?= url('js/conversations.js') ?>"></script>
    <script src="<?= url('js/profile.js') ?>"></script>
    <script src="<?= url('js/auth.js') ?>"></script>
    <script src="<?= url('js/onboarding.js') ?>"></script>
    <script src="<?= url('js/save-modal.js') ?>"></script>
    <script src="<?= url('js/chat.js') ?>"></script>
    <script src="<?= url('js/main.js') ?>"></script>
