/**
 * ConversationStore — persistance des conversations ORI dans localStorage.
 *
 * Chaque conversation : { id, title, messages, createdAt, updatedAt }.
 * Les messages suivent le format Anthropic : { role: 'user'|'assistant', content }.
 *
 * Pas de backend : tout reste dans le navigateur de l'utilisateur. Pas de
 * synchronisation cross-device pour l'instant — c'est un choix simple et
 * respectueux de la vie privée pour le hackathon.
 */

const ConversationStore = (() => {
    const STORAGE_KEY = 'ori_conversations_v1';
    const MAX_CONVERSATIONS = 50; // garde-fou contre saturation localStorage

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[ORI] localStorage corrompu, reset', e);
            return [];
        }
    }

    function persist(list) {
        // Cap à MAX_CONVERSATIONS, on garde les plus récentes (updatedAt desc)
        if (list.length > MAX_CONVERSATIONS) {
            list.sort((a, b) => b.updatedAt - a.updatedAt);
            list.length = MAX_CONVERSATIONS;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('[ORI] localStorage saturé', e);
        }
    }

    function newId() {
        return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    function generateTitle(messages) {
        const firstUser = messages.find(m => m.role === 'user');
        if (!firstUser || !firstUser.content) return 'Nouvelle conversation';
        const txt = String(firstUser.content).trim().replace(/\s+/g, ' ');
        if (txt.length <= 50) return txt;
        return txt.slice(0, 50).trim() + '…';
    }

    return {
        /** Liste triée par dernière activité (plus récent en premier). */
        list() {
            return load().sort((a, b) => b.updatedAt - a.updatedAt);
        },

        get(id) {
            return load().find(c => c.id === id) || null;
        },

        /** Crée une nouvelle conversation vide et la persiste. */
        create() {
            const conv = {
                id: newId(),
                title: 'Nouvelle conversation',
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            const all = load();
            all.unshift(conv);
            persist(all);
            return conv;
        },

        /**
         * Met à jour les messages d'une conversation existante.
         * Auto-rename si le titre est encore le défaut "Nouvelle conversation".
         */
        update(id, messages) {
            const all = load();
            const idx = all.findIndex(c => c.id === id);
            if (idx < 0) return null;
            all[idx].messages = messages.map(m => ({
                role: m.role,
                content: String(m.content || ''),
            }));
            all[idx].updatedAt = Date.now();
            if (all[idx].title === 'Nouvelle conversation' && messages.length) {
                all[idx].title = generateTitle(messages);
            }
            persist(all);
            return all[idx];
        },

        /** Renomme manuellement une conversation. */
        rename(id, newTitle) {
            const all = load();
            const idx = all.findIndex(c => c.id === id);
            if (idx < 0) return null;
            const t = String(newTitle || '').trim();
            if (t) all[idx].title = t;
            persist(all);
            return all[idx];
        },

        remove(id) {
            persist(load().filter(c => c.id !== id));
        },

        clearAll() {
            persist([]);
        },
    };
})();

window.ConversationStore = ConversationStore;
