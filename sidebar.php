<aside class="sidebar" aria-label="Historique des conversations">
    <button type="button" class="sidebar__new" id="new-conversation">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <span>Nouvelle conversation</span>
    </button>

    <div class="sidebar__section">
        <div class="sidebar__section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            <span class="sidebar__section-title">Historique</span>
        </div>
        <p class="sidebar__section-desc">Accédez à l'historique complet de vos échanges avec ORI.</p>
    </div>

    <nav class="conversations" id="conversations-list" aria-label="Conversations">
        <!-- Rempli dynamiquement par main.js depuis ConversationStore -->
    </nav>
</aside>
