/**
 * Point d'entrée. Initialise le chat, l'indicateur de connexion,
 * et branche les actions globales (nouvelle conversation, sélection sidebar).
 */

const ConnectionStatus = (() => {
    const LABELS = {
        live:     'Connecté au backend',
        demo:     'Mode démo',
        checking: 'Connexion…'
    };
    let el = null;
    let labelEl = null;

    function init() {
        el = document.getElementById('connection-status');
        if (!el) return;
        labelEl = el.querySelector('.connection-status__label');
    }

    function set(state) {
        if (!el) return;
        el.dataset.state = state;
        if (labelEl) labelEl.textContent = LABELS[state] || state;
    }

    return { init, set };
})();

/**
 * Health check au chargement : si le backend est joignable (n'importe quelle
 * réponse HTTP, même 404), on passe en "live". Sinon "demo".
 * Volontairement permissif : seul un échec réseau bascule en démo.
 */
async function probeBackend() {
    const ctrl = new AbortController();
    const timeout = window.HEALTHCHECK_TIMEOUT_MS || 2500;
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const url = (window.BACKEND_URL || '') + (window.BACKEND_HEALTH_ENDPOINT || '/api/health.php');
    try {
        const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
        // 2xx = backend OK et clé API configurée. 5xx = backend joignable
        // mais mal configuré → on considère quand même comme "live" pour
        // que l'utilisateur voie le statut, le vrai message d'erreur arrivera
        // au premier appel chat.
        return res.ok;
    } catch (err) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

// =============================================================================
// SidebarUI — affichage de l'historique des conversations dans la sidebar.
// Lit ConversationStore (localStorage), groupe par date, gère clic + suppression.
// =============================================================================
const SidebarUI = (() => {
    let listEl = null;

    function init() {
        listEl = document.getElementById('conversations-list');
    }

    function dateLabel(timestamp) {
        const dt = new Date(timestamp);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const weekAgo = today - 7 * 86400000;
        if (dt.getTime() >= today) return "Aujourd'hui";
        if (dt.getTime() >= yesterday) return "Hier";
        if (dt.getTime() >= weekAgo) return "7 derniers jours";
        return "Plus ancien";
    }

    function buildItem(conv, currentId) {
        const li = document.createElement('li');
        li.className = 'conversation-item-row';

        const a = document.createElement('a');
        a.href = '#';
        a.className = 'conversation-item';
        if (conv.id === currentId) a.classList.add('active');
        a.textContent = conv.title;
        a.title = conv.title;
        a.dataset.id = conv.id;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.ChatManager && typeof ChatManager.load === 'function') {
                ChatManager.load(conv.id);
            }
        });

        const del = document.createElement('button');
        del.className = 'conversation-item__delete';
        del.type = 'button';
        del.setAttribute('aria-label', 'Supprimer cette conversation');
        del.title = 'Supprimer';
        del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
        del.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ConversationStore.remove(conv.id);
            if (window.ChatManager && typeof ChatManager.onConversationDeleted === 'function') {
                ChatManager.onConversationDeleted(conv.id);
            }
            refresh();
        });

        li.appendChild(a);
        li.appendChild(del);
        return li;
    }

    function refresh(currentId = null) {
        if (!listEl) init();
        if (!listEl) return;
        listEl.innerHTML = '';

        const all = ConversationStore.list();
        if (!all.length) {
            const empty = document.createElement('p');
            empty.className = 'conversations__empty';
            empty.textContent = "Tes conversations apparaîtront ici. Pose ta première question pour commencer.";
            listEl.appendChild(empty);
            return;
        }

        // Groupage par tranche de date
        const groups = new Map();
        all.forEach(conv => {
            const label = dateLabel(conv.updatedAt);
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(conv);
        });

        // Ordre d'affichage des sections
        ["Aujourd'hui", "Hier", "7 derniers jours", "Plus ancien"].forEach(label => {
            const convs = groups.get(label);
            if (!convs || !convs.length) return;
            const groupEl = document.createElement('div');
            groupEl.className = 'conversations__group';
            const h3 = document.createElement('h3');
            h3.className = 'conversations__date';
            h3.textContent = label;
            groupEl.appendChild(h3);
            const ul = document.createElement('ul');
            convs.forEach(conv => ul.appendChild(buildItem(conv, currentId)));
            groupEl.appendChild(ul);
            listEl.appendChild(groupEl);
        });
    }

    return { init, refresh };
})();

window.SidebarUI = SidebarUI;


// =============================================================================
// ProfileCard — mini-card affichée au-dessus du chat quand un profil existe.
// =============================================================================
const ProfileCard = (() => {
    let cardEl = null;

    const NIVEAU_LABELS = {
        college: 'Collège', lycee: 'Lycée', sup: 'Études sup',
        actif: 'Vie active', autre: 'Autre',
    };
    const PROJET_LABELS = {
        precis: 'Projet précis', explorer: 'Exploration', flou: 'En réflexion',
        reorientation: 'Réorientation', autre: 'Autre',
    };

    function summarize(profile) {
        if (!profile) return '';
        const parts = [];
        if (profile.niveau) {
            let n = NIVEAU_LABELS[profile.niveau] || profile.niveau;
            if (profile.niveau_detail) n += ' (' + profile.niveau_detail + ')';
            parts.push(n);
        }
        if (profile.projet_type) {
            parts.push(PROJET_LABELS[profile.projet_type] || profile.projet_type);
        }
        if (Array.isArray(profile.contraintes) && profile.contraintes.length) {
            const filtered = profile.contraintes.filter(c => c !== 'aucune');
            if (filtered.length) parts.push(filtered.length + ' contrainte(s)');
        }
        if (Array.isArray(profile.gouts) && profile.gouts.length) {
            parts.push(profile.gouts.length + ' centre(s) d\'intérêt');
        }
        return parts.join(' · ');
    }

    function ensureMounted() {
        if (cardEl) return;
        const wrapper = document.querySelector('.chat-wrapper');
        if (!wrapper) return;
        cardEl = document.createElement('div');
        cardEl.className = 'profile-card';
        cardEl.style.display = 'none';
        cardEl.innerHTML = `
            <span class="profile-card__icon">📋</span>
            <span class="profile-card__summary"></span>
            <span class="profile-card__actions">
                <button type="button" class="profile-card__btn" data-action="edit">Modifier</button>
                <button type="button" class="profile-card__btn" data-action="account">Mon compte</button>
            </span>
        `;
        wrapper.insertBefore(cardEl, wrapper.firstChild);

        cardEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            if (action === 'edit') {
                if (window.OnboardingWizard && window.ChatManager) {
                    ChatManager.reset();
                    OnboardingWizard.start({
                        onComplete: () => {
                            refresh();
                            if (window.ChatManager) {
                                // Petit message de confirmation
                                document.dispatchEvent(new CustomEvent('ori:profile-updated'));
                            }
                        }
                    });
                }
            } else if (action === 'account') {
                if (window.ProfileStore && ProfileStore.isLoggedIn()) {
                    if (confirm('Te déconnecter ?')) {
                        ProfileStore.logout().then(() => {
                            location.reload();
                        });
                    }
                } else if (window.AuthModal) {
                    AuthModal.open({
                        mode: 'register',
                        onSuccess: () => refresh()
                    });
                }
            }
        });
    }

    function refresh() {
        ensureMounted();
        if (!cardEl) return;
        const store = window.ProfileStore;
        const profile = store ? store.getProfile() : null;
        const isLogged = store && store.isLoggedIn();

        if (!profile) {
            cardEl.style.display = 'none';
            return;
        }
        cardEl.querySelector('.profile-card__summary').innerHTML =
            '<strong>Mon profil :</strong> ' + (summarize(profile) || 'défini');
        const accountBtn = cardEl.querySelector('button[data-action="account"]');
        accountBtn.textContent = isLogged ? 'Déconnexion' : 'Créer un compte';
        cardEl.style.display = 'flex';
    }

    return { refresh };
})();
window.ProfileCard = ProfileCard;


document.addEventListener('DOMContentLoaded', async () => {
    ConnectionStatus.init();
    SidebarUI.init();

    // 1. Charge l'état du profil (auto-login via cookie + localStorage anonyme)
    if (window.ProfileStore) {
        await ProfileStore.init();
        ProfileStore.onChange(() => {
            if (window.ProfileCard) ProfileCard.refresh();
            if (window.ChatBanner) ChatBanner.refresh();
        });
    }

    // 2. Initialise le chat (qui lui-même affichera l'onboarding si pas de profil)
    if (window.ChatManager) ChatManager.init();

    // 3. Initialise la mini-card profil si un profil existe
    if (window.ProfileCard) ProfileCard.refresh();

    // 3bis. Banner pistes actives (si user connecté avec dashboard non vide)
    if (window.ChatBanner) ChatBanner.refresh();

    // 3ter. Lien "Mon dashboard" dans le header (uniquement si connecté)
    if (window.ProfileStore && ProfileStore.isLoggedIn()) {
        const headerActions = document.querySelector('.site-header__actions');
        if (headerActions && !document.getElementById('dashboard-link')) {
            const link = document.createElement('a');
            link.id = 'dashboard-link';
            link.href = '/dashboard.php';
            link.className = 'header-dashboard-link';
            link.innerHTML = '📊 Mon espace';
            headerActions.insertBefore(link, headerActions.firstChild);
        }
    }

    const newConvBtn = document.getElementById('new-conversation');
    if (newConvBtn) {
        newConvBtn.addEventListener('click', () => {
            if (window.ChatManager) ChatManager.reset();
        });
    }

    // 4. Ping backend : indicateur 🟢 / 🔴
    const reachable = await probeBackend();
    ConnectionStatus.set(reachable ? 'live' : 'demo');
});

window.ConnectionStatus = ConnectionStatus;
