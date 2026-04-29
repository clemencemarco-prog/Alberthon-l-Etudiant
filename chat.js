/**
 * Gestion du chat ORI : envoi de message, loader "ORI réfléchit",
 * effet machine à écrire, déclenchement des pop-ups.
 *
 * Mode hybride :
 *  - Par défaut : appel POST vers BACKEND_URL/api/chat (Claude via FastAPI)
 *  - Fallback silencieux vers fake-responses.js si le backend ne répond pas
 *    (timeout, erreur réseau, status != 200, JSON malformé, CORS bloqué...)
 *
 * Pop-ups :
 *  - Mode "live" (backend OK) : pas de pop-ups (le backend ne les renvoie pas encore)
 *  - Mode "demo" (fallback)   : pop-ups du scénario comme avant
 */

// Backend PHP servi sur le même domaine que le frontend (Bookmyname).
// Chemins relatifs → fonctionne aussi bien en local (`php -S localhost:8000 -t .`)
// qu'en prod sur https://letudiant.marco84.fr.
const BACKEND_URL = '';
const BACKEND_CHAT_ENDPOINT = '/api/chat.php';
const BACKEND_HEALTH_ENDPOINT = '/api/health.php';
const BACKEND_TIMEOUT_MS = 120000;   // appel chat : 2 min, large marge pour web search
const HEALTHCHECK_TIMEOUT_MS = 2500; // ping initial au chargement

const ChatManager = (() => {
    const WELCOME = "Bonjour, c'est ORI, votre assistant en orientation enrichi par l'expertise des journalistes de l'Etudiant ! Comment puis-je vous aider ?";

    let chatEl, formEl, inputEl;
    let isBusy = false;
    // Mémoire de la conversation : envoyée au backend à chaque tour pour que
    // Claude se souvienne des échanges précédents et personnalise ses réponses.
    // Format Anthropic : [{role: 'user'|'assistant', content: string}]
    let conversationHistory = [];
    // ID de la conversation persistée dans localStorage (null = pas encore créée)
    let currentConversationId = null;

    function init() {
        chatEl = document.getElementById('chat');
        formEl = document.getElementById('composer');
        inputEl = document.getElementById('user-input');

        formEl.addEventListener('submit', onSubmit);
        reset();
        // Affiche l'historique persistant dans la sidebar dès l'ouverture
        if (window.SidebarUI) SidebarUI.refresh(currentConversationId);
    }

    function reset() {
        chatEl.innerHTML = '';
        if (window.PopupManager) PopupManager.clear();
        // Replie le panneau latéral : le chat repasse en plein écran
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) chatArea.classList.remove('has-popups');
        renderWelcome();
        inputEl.value = '';
        inputEl.focus();
        isBusy = false;
        conversationHistory = [];
        currentConversationId = null;
        if (window.SidebarUI) SidebarUI.refresh(currentConversationId);
    }

    /**
     * Affiche le message d'accueil. Si l'utilisateur n'a pas encore de profil,
     * propose le wizard d'onboarding ; sinon, message "content de te revoir".
     */
    function renderWelcome() {
        const store = window.ProfileStore;
        const isLogged = store && store.isLoggedIn();
        const hasProfile = store && store.hasProfile();

        if (isLogged && hasProfile) {
            const user = store.getUser();
            const greeting = "Bonjour " + (user.email.split('@')[0]) +
                ", content de te revoir 👋 Pose-moi ta question, j'adapte mes réponses à ton profil.";
            appendMessage('ori', greeting);
            return;
        }

        if (hasProfile) {
            // Profil anonyme déjà rempli en localStorage
            appendMessage('ori',
                "Bonjour ! Je me souviens de ton profil de ta dernière visite. Pose-moi ta question quand tu veux.");
            return;
        }

        // Pas de profil : on affiche le wizard
        appendMessage('ori', WELCOME);
        if (window.OnboardingWizard) {
            // Léger délai pour que l'utilisateur lise d'abord le greeting
            setTimeout(() => {
                OnboardingWizard.start({
                    onComplete: () => {
                        // Après onboarding, on rafraîchit la mini-card et on
                        // affiche un message de confirmation court.
                        if (window.ProfileCard) ProfileCard.refresh();
                        appendMessage('ori', "C'est noté ! Pose-moi ta question quand tu veux.");
                    }
                });
            }, 400);
        }
    }

    /**
     * Charge une conversation passée depuis le store et la rejoue dans le chat.
     * Pas de pop-ups (elles ne sont pas persistées) : seulement les messages.
     */
    function load(conversationId) {
        const conv = window.ConversationStore && ConversationStore.get(conversationId);
        if (!conv) return;
        chatEl.innerHTML = '';
        if (window.PopupManager) PopupManager.clear();
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) chatArea.classList.remove('has-popups');
        appendMessage('ori', WELCOME);
        conv.messages.forEach(m => {
            appendMessage(m.role === 'user' ? 'user' : 'ori', m.content);
        });
        conversationHistory = conv.messages.map(m => ({ role: m.role, content: m.content }));
        currentConversationId = conv.id;
        isBusy = false;
        inputEl.focus();
        if (window.SidebarUI) SidebarUI.refresh(currentConversationId);
    }

    /**
     * Hook appelé par SidebarUI quand une conversation est supprimée.
     * Si c'est celle qu'on est en train d'afficher, on reset le chat.
     */
    function onConversationDeleted(deletedId) {
        if (deletedId === currentConversationId) reset();
    }

    // Déploie le panneau latéral. Une fois ouvert il reste visible pendant
    // toute la conversation (les pop-ups précédentes restent consultables
    // même quand un tour conversationnel n'en génère pas de nouvelles).
    function openSidePanel() {
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) chatArea.classList.add('has-popups');
    }

    function onSubmit(e) {
        e.preventDefault();
        if (isBusy) return;
        const question = inputEl.value.trim();
        if (!question) return;

        appendMessage('user', question);
        inputEl.value = '';
        handleAnswer(question);
    }

    // Mapping des 6 types backend vers le format attendu par popups.js.
    // Nouveaux types : "formation" (cursus/école) et "livre" (conseil lecture).
    const BACKEND_TYPE_MAP = {
        fiche_metier: { type: 'job',       kind: 'Fiche Métier',        icon: '📊', cta: 'En savoir plus' },
        salon:        { type: 'event',     kind: "Salon de l'Étudiant", icon: '📅', cta: 'En savoir plus' },
        video_pro:    { type: 'video',     kind: 'Vidéo de Pro',        icon: null, cta: 'Regarder la vidéo' },
        article:      { type: 'article',   kind: 'Article',             icon: '📄', cta: "Lire l'article" },
        formation:    { type: 'formation', kind: 'Formation',           icon: '🎓', cta: 'Voir la formation' },
        livre:        { type: 'livre',     kind: 'Conseil lecture',     icon: '📖', cta: 'Découvrir le livre' }
    };

    function normalizeBackendPopups(rawPopups) {
        if (!Array.isArray(rawPopups)) return [];
        return rawPopups
            .filter(p => p && BACKEND_TYPE_MAP[p.type])
            .map(p => {
                const meta = BACKEND_TYPE_MAP[p.type];
                return {
                    type: meta.type,
                    kind: meta.kind,
                    icon: meta.icon,
                    title: p.title || '',
                    bullets: Array.isArray(p.content) ? p.content : [],
                    cta: meta.cta,
                    positive: p.is_biais_positif === true,
                    badge: p.label || null,
                    url: typeof p.url === 'string' ? p.url : null,
                    source: typeof p.source === 'string' ? p.source : null,
                    // Recoupement journalistique : "verifie" ou "source_unique"
                    crossCheck: p.cross_check === 'verifie' ? 'verifie' : 'source_unique'
                };
            });
    }

    /**
     * Tente d'appeler le backend Python avec l'historique conversationnel.
     * Renvoie {answer, popups} si OK, lance sinon (attrapé par handleAnswer).
     * @param {Array<{role:string,content:string}>} messages historique complet
     */
    async function callBackend(messages) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT_MS);
        try {
            // On envoie le profil seulement si l'utilisateur n'est PAS connecté.
            // Si connecté, le backend lit le profil en DB depuis le cookie.
            const body = { messages };
            if (window.ProfileStore && !ProfileStore.isLoggedIn()) {
                const profile = ProfileStore.getProfileForChat();
                if (profile) body.profile = profile;
            }
            const res = await fetch(BACKEND_CHAT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
                signal: ctrl.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || typeof data.answer !== 'string' || !data.answer.trim()) {
                throw new Error('Réponse backend invalide');
            }
            return {
                answer: data.answer,
                popups: normalizeBackendPopups(data.popups)
            };
        } finally {
            clearTimeout(timer);
        }
    }

    async function handleAnswer(question) {
        isBusy = true;
        if (window.PopupManager) PopupManager.clear();

        // Crée une nouvelle conversation persistée si on n'en a pas encore.
        if (!currentConversationId && window.ConversationStore) {
            const conv = ConversationStore.create();
            currentConversationId = conv.id;
        }

        // Pousse le tour utilisateur dans la mémoire AVANT l'appel.
        // Le backend recevra l'historique complet (question incluse).
        conversationHistory.push({ role: 'user', content: question });

        // Loader "ORI réfléchit..."
        const loaderBubble = appendLoader();
        const start = Date.now();

        let backendResult = null;
        try {
            backendResult = await callBackend(conversationHistory);
        } catch (err) {
            // fallback silencieux : pas de message d'erreur visible utilisateur
            console.warn(
                '[ORI] Backend indisponible, fallback fausses réponses :',
                err.name + ': ' + err.message,
                err
            );
            backendResult = null;
        }

        // Garde une "épaisseur" minimale au loader pour que ça paraisse naturel
        // (utile surtout quand le fallback échoue immédiatement, ex: connexion refusée)
        const elapsed = Date.now() - start;
        const padDelay = Math.max(0, 800 - elapsed);

        setTimeout(() => {
            const bubble = replaceLoaderWithBubble(loaderBubble);

            let assistantText;
            const isLiveMode = !!backendResult;
            if (isLiveMode) {
                // === Mode LIVE : réponse Claude + pop-ups générées par Claude ===
                if (window.ConnectionStatus) ConnectionStatus.set('live');
                if (backendResult.popups.length) {
                    openSidePanel();
                    PopupManager.show(backendResult.popups, 500, 420);
                }
                assistantText = backendResult.answer;
                typeWriter(bubble, assistantText, 14, () => {
                    appendSaveButtonForLastOri(assistantText);
                    finish();
                });
            } else {
                // === Mode DEMO : scénario fake + pop-ups ===
                if (window.ConnectionStatus) ConnectionStatus.set('demo');
                const scenario = window.pickScenario(question);
                if (scenario.popups && scenario.popups.length) {
                    openSidePanel();
                    PopupManager.show(scenario.popups, 500, 420);
                }
                assistantText = scenario.reply;
                typeWriter(bubble, assistantText, 18, finish);
            }
            // Mémorise la réponse pour le prochain tour (live ou demo confondus)
            conversationHistory.push({ role: 'assistant', content: assistantText });

            // Persiste dans localStorage et rafraîchit la sidebar
            if (currentConversationId && window.ConversationStore) {
                ConversationStore.update(currentConversationId, conversationHistory);
                if (window.SidebarUI) SidebarUI.refresh(currentConversationId);
            }
        }, padDelay);

        function finish() {
            isBusy = false;
            inputEl.focus();
        }
    }

    /* ============ Helpers DOM ============ */

    function appendMessage(role, text) {
        const msg = document.createElement('div');
        msg.className = 'message message--' + role;

        const avatar = document.createElement('span');
        avatar.className = 'message__avatar';
        avatar.textContent = role === 'ori' ? '&' : 'M';
        msg.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'message__bubble';
        bubble.textContent = text;
        msg.appendChild(bubble);

        chatEl.appendChild(msg);
        scrollToBottom();
        return bubble;
    }

    /**
     * Ajoute un bouton "📌 Sauvegarder dans mon tableau de bord" SOUS la
     * dernière bulle ORI affichée. Visible uniquement si user connecté.
     */
    function appendSaveButtonForLastOri(assistantText) {
        if (!window.ProfileStore || !ProfileStore.isLoggedIn()) return;
        if (!window.SaveModal) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'message-save-wrapper';
        wrapper.innerHTML = `
            <button type="button" class="msg-save-btn">📌 Sauvegarder dans mon tableau de bord</button>
        `;
        const btn = wrapper.querySelector('.msg-save-btn');
        btn.addEventListener('click', () => {
            SaveModal.open({
                lastAssistantMessage: assistantText,
                conversationHistory: conversationHistory.slice(),
                conversationId: currentConversationId,
            });
        });
        chatEl.appendChild(wrapper);
        scrollToBottom();
    }

    function appendLoader() {
        const msg = document.createElement('div');
        msg.className = 'message message--ori';
        msg.dataset.role = 'loader';

        const avatar = document.createElement('span');
        avatar.className = 'message__avatar';
        avatar.textContent = '&';
        msg.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'message__bubble';
        bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
        msg.appendChild(bubble);

        chatEl.appendChild(msg);
        scrollToBottom();
        return msg;
    }

    function replaceLoaderWithBubble(loaderEl) {
        const bubble = loaderEl.querySelector('.message__bubble');
        bubble.innerHTML = '';
        bubble.classList.add('typing-caret');
        return bubble;
    }

    function typeWriter(el, text, speed = 18, done) {
        let i = 0;
        function step() {
            if (i >= text.length) {
                el.classList.remove('typing-caret');
                if (typeof done === 'function') done();
                return;
            }
            el.textContent += text.charAt(i++);
            scrollToBottom();
            setTimeout(step, speed);
        }
        step();
    }

    function scrollToBottom() {
        chatEl.scrollTop = chatEl.scrollHeight;
    }

    return { init, reset, load, onConversationDeleted };
})();

window.ChatManager = ChatManager;
window.BACKEND_URL = BACKEND_URL;
window.BACKEND_HEALTH_ENDPOINT = BACKEND_HEALTH_ENDPOINT;
window.HEALTHCHECK_TIMEOUT_MS = HEALTHCHECK_TIMEOUT_MS;


// =============================================================================
// ChatBanner — bandeau "Tu as X pistes actives" en haut du chat,
// affiché uniquement quand l'utilisateur est connecté et a un dashboard non vide.
// =============================================================================
const ChatBanner = (() => {
    let bannerEl = null;

    function ensureMounted() {
        if (bannerEl) return;
        const wrapper = document.querySelector('.chat-wrapper');
        if (!wrapper) return;
        bannerEl = document.createElement('div');
        bannerEl.className = 'chat-banner';
        bannerEl.style.display = 'none';
        wrapper.insertBefore(bannerEl, wrapper.firstChild);
    }

    async function refresh() {
        if (!window.ProfileStore || !ProfileStore.isLoggedIn()) {
            if (bannerEl) bannerEl.style.display = 'none';
            return;
        }
        ensureMounted();
        if (!bannerEl) return;
        try {
            const res = await fetch('/api/dashboard/list.php', { credentials: 'include' });
            if (!res.ok) { bannerEl.style.display = 'none'; return; }
            // Garde-fou : si Bookmyname renvoie du HTML (404, page d'erreur),
            // on n'essaie pas de parser pour éviter la SyntaxError en console.
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                bannerEl.style.display = 'none';
                return;
            }
            const data = await res.json();
            const s = data.stats || {};
            const total = (data.pistes || []).length;
            if (total === 0) {
                bannerEl.style.display = 'none';
                return;
            }
            const parts = [];
            if (s.nb_pistes_actives) parts.push(`<strong>${s.nb_pistes_actives}</strong> piste${s.nb_pistes_actives > 1 ? 's' : ''} active${s.nb_pistes_actives > 1 ? 's' : ''}`);
            if (s.nb_overdue) parts.push(`<strong class="chat-banner__urgent">${s.nb_overdue}</strong> en retard`);
            if (s.nb_deadlines_7d) parts.push(`<strong>${s.nb_deadlines_7d}</strong> deadline${s.nb_deadlines_7d > 1 ? 's' : ''} dans 7 jours`);
            const text = parts.length ? parts.join(' · ') : `${total} piste${total > 1 ? 's' : ''} sauvegardée${total > 1 ? 's' : ''}`;
            bannerEl.innerHTML = `
                <span class="chat-banner__icon">📊</span>
                <span class="chat-banner__text">${text}</span>
                <a href="/dashboard.php" class="chat-banner__btn">Voir mon tableau de bord →</a>
            `;
            bannerEl.style.display = 'flex';
        } catch (e) {
            console.warn('[ORI] banner refresh failed', e);
            bannerEl.style.display = 'none';
        }
    }

    return { refresh };
})();
window.ChatBanner = ChatBanner;
