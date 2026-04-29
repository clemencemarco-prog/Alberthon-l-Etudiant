/**
 * OnboardingWizard — questionnaire profil 4 étapes intégré au chat.
 *
 * Affiche les questions comme des "messages ORI" avec des boutons cliquables.
 * À chaque réponse, la bulle se fige (boutons désactivés) et la suivante apparaît.
 * À la fin : synthèse + choix Sauvegarder / Continuer sans compte.
 *
 * Dépendances : ProfileStore, AuthModal, ChatManager (pour appendMessage).
 */
const OnboardingWizard = (() => {
    let chatEl = null;
    let onComplete = null;       // callback appelé quand le wizard est terminé/skippé
    let profile = {};            // state en cours
    let abortFlag = false;       // si true, le wizard est sorti

    // ---------- Catalogue des étapes ----------

    const NIVEAUX = [
        { id: 'college', label: 'Au collège (3e)',         icon: '🎓' },
        { id: 'lycee',   label: 'Au lycée',                icon: '📚' },
        { id: 'sup',     label: 'En études supérieures',   icon: '🏫' },
        { id: 'actif',   label: 'Vie active / reconversion', icon: '💼' },
        { id: 'autre',   label: 'Autre',                   icon: '✏️' },
    ];

    const FILIERES = [
        { id: 'generale', label: 'Générale' },
        { id: 'techno',   label: 'Technologique' },
        { id: 'pro',      label: 'Professionnelle' },
    ];

    const SPECIALITES = [
        'Mathématiques', 'Physique-Chimie', 'SVT', 'NSI',
        'SES', 'HGGSP', 'HLP', 'LLCE', 'Arts',
        'Sciences de l\'ingénieur', 'Autre'
    ];

    const PROJETS = [
        { id: 'precis',         label: 'J\'ai une idée précise',         icon: '🎯' },
        { id: 'explorer',       label: 'Une orientation à explorer',     icon: '🧭' },
        { id: 'flou',           label: 'Encore très flou',                icon: '❓' },
        { id: 'reorientation',  label: 'Je veux me réorienter',          icon: '🔄' },
        { id: 'autre',          label: 'Autre',                           icon: '✏️' },
    ];

    const CONTRAINTES = [
        { id: 'financier',           label: 'Financière',           icon: '💰' },
        { id: 'geographique',        label: 'Géographique',         icon: '🗺️' },
        { id: 'premiere_generation', label: 'Première génération à faire des études supérieures', icon: '👨‍👩‍👧' },
        { id: 'temps',               label: 'Contrainte de temps', icon: '⏱️' },
        { id: 'familiale',           label: 'Contrainte familiale', icon: '🏠' },
        { id: 'aucune',              label: 'Aucune contrainte particulière', icon: '✋' },
    ];

    const GOUTS = [
        { id: 'sciences',     label: 'Sciences et expérimentation', icon: '🔬' },
        { id: 'maths',        label: 'Maths et logique',            icon: '📐' },
        { id: 'numerique',    label: 'Numérique et tech',           icon: '💻' },
        { id: 'arts',         label: 'Arts et création',            icon: '🎨' },
        { id: 'lettres',      label: 'Lettres et langues',          icon: '📚' },
        { id: 'aider',        label: 'Aider les gens',              icon: '🤝' },
        { id: 'justice',      label: 'Justice et société',          icon: '⚖️' },
        { id: 'business',     label: 'Business et management',      icon: '💼' },
        { id: 'environnement', label: 'Environnement et nature',     icon: '🌱' },
        { id: 'manuel',       label: 'Travail manuel et technique', icon: '🛠️' },
    ];

    // ---------- API publique ----------

    function start(options = {}) {
        chatEl = document.getElementById('chat');
        if (!chatEl) return;
        onComplete = options.onComplete || null;
        profile = {};
        abortFlag = false;
        renderIntroChoice();
    }

    function abort() {
        abortFlag = true;
        if (typeof onComplete === 'function') onComplete({ skipped: true, profile: null });
    }

    // ---------- Rendu : intro avec 2 choix ----------

    function renderIntroChoice() {
        const card = appendOriCard(`
            <p class="ob-text">Pour t'accompagner au mieux, j'aimerais te poser quelques questions sur ton parcours.</p>
            <p class="ob-text-secondary">Ça prend 3 minutes et tu peux passer à tout moment.</p>
        `, [
            { id: 'start',   label: '🎯 Faisons connaissance d\'abord', primary: true },
            { id: 'skip',    label: '💬 Je préfère poser ma question directement' },
        ], (choice) => {
            if (choice === 'start') {
                step1();
            } else {
                abort();
            }
        });
    }

    // ---------- Étape 1 : niveau ----------

    function step1() {
        if (abortFlag) return;
        const card = appendOriCard(
            `<div class="ob-step-header">
                <span class="ob-progress">Étape 1/4</span>
                <h3 class="ob-question">Pour bien te conseiller, dis-moi d'abord où tu en es dans ton parcours.</h3>
             </div>`,
            NIVEAUX.map(n => ({ id: n.id, label: `${n.icon} ${n.label}` })),
            (choice) => {
                profile.niveau = choice;
                if (choice === 'lycee') {
                    step1_lycee_filiere();
                } else if (choice === 'sup') {
                    step1_sup_niveau();
                } else if (choice === 'autre') {
                    step1_autre_text();
                } else {
                    step2();
                }
            },
            { allowFreeText: true, onFreeText: (text) => {
                profile.niveau = 'autre';
                profile.niveau_detail = text;
                step2();
            }}
        );
    }

    function step1_lycee_filiere() {
        if (abortFlag) return;
        appendOriCard(
            `<h3 class="ob-question">Et quelle filière ?</h3>`,
            FILIERES.map(f => ({ id: f.id, label: f.label })),
            (choice) => {
                profile.filiere = choice;
                if (choice === 'generale') {
                    step1_lycee_specialites();
                } else {
                    step2();
                }
            }
        );
    }

    function step1_lycee_specialites() {
        if (abortFlag) return;
        appendOriCard(
            `<h3 class="ob-question">Quelles spécialités ?</h3>
             <p class="ob-hint">Tu peux en cocher plusieurs.</p>`,
            null,
            null,
            { multiSelect: SPECIALITES, onValidate: (selected) => {
                profile.specialites = selected;
                step2();
            }}
        );
    }

    function step1_sup_niveau() {
        if (abortFlag) return;
        appendOriCard(
            `<h3 class="ob-question">Quel niveau ?</h3>`,
            ['Bac+1', 'Bac+2', 'Bac+3', 'Bac+4', 'Bac+5'].map(l => ({ id: l, label: l })),
            (choice) => {
                profile.niveau_detail = choice;
                step2();
            }
        );
    }

    function step1_autre_text() {
        if (abortFlag) return;
        appendOriCard(
            `<h3 class="ob-question">Précise ta situation :</h3>`,
            null,
            null,
            { freeText: true, onFreeText: (text) => {
                profile.niveau_detail = text;
                step2();
            }}
        );
    }

    // ---------- Étape 2 : projet ----------

    function step2() {
        if (abortFlag) return;
        appendOriCard(
            `<div class="ob-step-header">
                <span class="ob-progress">Étape 2/4</span>
                <h3 class="ob-question">Et ton projet d'orientation, c'est plutôt :</h3>
             </div>`,
            PROJETS.map(p => ({ id: p.id, label: `${p.icon} ${p.label}` })),
            (choice) => {
                profile.projet_type = choice;
                if (choice === 'precis') {
                    appendOriCard(
                        `<h3 class="ob-question">Vers quoi te projettes-tu ?</h3>`,
                        null, null,
                        { freeText: true, onFreeText: (text) => {
                            profile.projet_focus = text;
                            step3();
                        }}
                    );
                } else if (choice === 'autre') {
                    appendOriCard(
                        `<h3 class="ob-question">Précise :</h3>`,
                        null, null,
                        { freeText: true, onFreeText: (text) => {
                            profile.projet_focus = text;
                            step3();
                        }}
                    );
                } else {
                    step3();
                }
            }
        );
    }

    // ---------- Étape 3 : contraintes (multi-select) ----------

    function step3() {
        if (abortFlag) return;
        appendOriCard(
            `<div class="ob-step-header">
                <span class="ob-progress">Étape 3/4</span>
                <h3 class="ob-question">Y a-t-il des contraintes importantes pour toi ?</h3>
                <p class="ob-hint">Plusieurs choix possibles.</p>
             </div>`,
            null,
            null,
            { multiSelectObjects: CONTRAINTES, onValidate: (selected) => {
                profile.contraintes = selected;
                step4();
            }}
        );
    }

    // ---------- Étape 4 : goûts ----------

    function step4() {
        if (abortFlag) return;
        appendOriCard(
            `<div class="ob-step-header">
                <span class="ob-progress">Étape 4/4</span>
                <h3 class="ob-question">Pour finir, dis-moi ce qui te fait vibrer.</h3>
                <p class="ob-hint">Plusieurs choix possibles.</p>
             </div>`,
            null,
            null,
            { multiSelectObjects: GOUTS, onValidate: (selected) => {
                profile.gouts = selected;
                renderSynthese();
            }}
        );
    }

    // ---------- Synthèse ----------

    function renderSynthese() {
        if (abortFlag) return;
        const lines = [];
        if (profile.niveau) {
            const niv = NIVEAUX.find(n => n.id === profile.niveau);
            let str = niv ? niv.label : profile.niveau;
            if (profile.filiere) {
                const f = FILIERES.find(x => x.id === profile.filiere);
                str += ' · ' + (f ? f.label : profile.filiere);
            }
            if (profile.niveau_detail) str += ' · ' + profile.niveau_detail;
            if (profile.specialites && profile.specialites.length) str += ' · ' + profile.specialites.join(', ');
            lines.push(['Niveau', str]);
        }
        if (profile.projet_type) {
            const pj = PROJETS.find(p => p.id === profile.projet_type);
            let str = pj ? pj.label : profile.projet_type;
            if (profile.projet_focus) str += ' — ' + profile.projet_focus;
            lines.push(['Projet', str]);
        }
        if (profile.contraintes && profile.contraintes.length) {
            const labels = profile.contraintes.map(c => {
                const o = CONTRAINTES.find(x => x.id === c);
                return o ? o.label : c;
            });
            lines.push(['Contraintes', labels.join(', ')]);
        }
        if (profile.gouts && profile.gouts.length) {
            const labels = profile.gouts.map(g => {
                const o = GOUTS.find(x => x.id === g);
                return o ? o.label : g;
            });
            lines.push(['Goûts', labels.join(', ')]);
        }

        const linesHtml = lines.length
            ? lines.map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong> : ${escapeHtml(v)}</li>`).join('')
            : '<li>Tu as choisi de ne rien préciser pour le moment.</li>';

        appendOriCard(
            `<div class="ob-synthese">
                <h3 class="ob-question">✨ Voilà ce que je retiens de toi :</h3>
                <ul class="ob-synthese-list">${linesHtml}</ul>
                <p class="ob-text">Tu veux qu'on garde ce profil pour la prochaine fois ?</p>
             </div>`,
            [
                { id: 'save',     label: '💾 Sauvegarder mon profil', primary: true },
                { id: 'no_save',  label: 'Continuer sans compte' },
                { id: 'edit',     label: 'Modifier mes réponses' },
            ],
            async (choice) => {
                if (choice === 'edit') {
                    profile = {};
                    step1();
                    return;
                }
                if (choice === 'save') {
                    AuthModal.open({
                        mode: 'register',
                        onSuccess: async () => {
                            try { await ProfileStore.saveProfile(profile); } catch (e) { console.warn(e); }
                            finishWizard();
                        }
                    });
                    return;
                }
                // no_save : on stocke en localStorage via ProfileStore
                try { await ProfileStore.saveProfile(profile); } catch (e) { console.warn(e); }
                finishWizard();
            }
        );
    }

    function finishWizard() {
        if (typeof onComplete === 'function') {
            onComplete({ skipped: false, profile: profile });
        }
    }

    // ---------- Helpers DOM ----------

    /**
     * Ajoute une "bulle ORI" avec contenu HTML + (optionnel) boutons / multi-select / texte libre.
     * @param {string} bodyHtml          HTML du corps (h3, p…)
     * @param {Array|null} buttons        liste d'options {id,label,primary} ou null
     * @param {Function|null} onClick    callback(choiceId) si boutons cliqués
     * @param {Object} extras            options supplémentaires :
     *    - allowFreeText / onFreeText : ajoute un input texte EN PLUS des boutons
     *    - freeText: true              : remplace les boutons par un input texte
     *    - multiSelect: [string]       : remplace les boutons par checkbox + valider
     *    - multiSelectObjects: [{id,label,icon}] : pareil mais avec objets
     *    - onValidate(selectedIds)     : callback du multi-select
     */
    function appendOriCard(bodyHtml, buttons, onClick, extras = {}) {
        const msg = document.createElement('div');
        msg.className = 'message message--ori message--ori-card';

        const avatar = document.createElement('span');
        avatar.className = 'message__avatar';
        avatar.textContent = '&';
        msg.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'message__bubble ob-bubble';
        bubble.innerHTML = bodyHtml;

        // Boutons cliquables
        if (Array.isArray(buttons) && buttons.length) {
            const btnGroup = document.createElement('div');
            btnGroup.className = 'ob-buttons';
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ob-btn' + (b.primary ? ' ob-btn--primary' : '');
                btn.textContent = b.label;
                btn.addEventListener('click', () => {
                    btnGroup.querySelectorAll('button').forEach(x => x.disabled = true);
                    btn.classList.add('is-selected');
                    appendUserChoice(b.label);
                    if (onClick) onClick(b.id);
                });
                btnGroup.appendChild(btn);
            });
            bubble.appendChild(btnGroup);
        }

        // Texte libre (optionnel après les boutons)
        if (extras.allowFreeText) {
            const sep = document.createElement('p');
            sep.className = 'ob-or';
            sep.textContent = 'ou écris ta réponse :';
            bubble.appendChild(sep);
            bubble.appendChild(buildFreeTextInput((text) => {
                bubble.querySelectorAll('.ob-btn').forEach(b => b.disabled = true);
                appendUserChoice(text);
                if (extras.onFreeText) extras.onFreeText(text);
            }));
        }

        // Texte libre seul
        if (extras.freeText) {
            bubble.appendChild(buildFreeTextInput((text) => {
                appendUserChoice(text);
                if (extras.onFreeText) extras.onFreeText(text);
            }));
        }

        // Multi-select (strings)
        if (Array.isArray(extras.multiSelect)) {
            bubble.appendChild(buildMultiSelect(
                extras.multiSelect.map(s => ({ id: s, label: s })),
                extras.onValidate
            ));
        }

        // Multi-select (objects {id, label, icon})
        if (Array.isArray(extras.multiSelectObjects)) {
            bubble.appendChild(buildMultiSelect(
                extras.multiSelectObjects.map(o => ({
                    id: o.id,
                    label: (o.icon ? o.icon + ' ' : '') + o.label
                })),
                extras.onValidate
            ));
        }

        msg.appendChild(bubble);
        chatEl.appendChild(msg);
        scrollToBottom();
        return msg;
    }

    function buildFreeTextInput(onSubmit) {
        const wrap = document.createElement('div');
        wrap.className = 'ob-text-input';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ob-input';
        input.placeholder = 'Tape ta réponse…';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ob-btn ob-btn--primary';
        btn.textContent = 'Valider';
        const submit = () => {
            const v = input.value.trim();
            if (!v) return;
            input.disabled = true;
            btn.disabled = true;
            onSubmit(v);
        };
        btn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        wrap.appendChild(input);
        wrap.appendChild(btn);
        setTimeout(() => input.focus(), 100);
        return wrap;
    }

    function buildMultiSelect(items, onValidate) {
        const wrap = document.createElement('div');
        wrap.className = 'ob-multiselect';
        const list = document.createElement('div');
        list.className = 'ob-multiselect-list';
        items.forEach(it => {
            const lbl = document.createElement('label');
            lbl.className = 'ob-checkbox';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = it.id;
            const span = document.createElement('span');
            span.textContent = it.label;
            lbl.appendChild(cb);
            lbl.appendChild(span);
            list.appendChild(lbl);
        });
        wrap.appendChild(list);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ob-btn ob-btn--primary';
        btn.textContent = 'Valider';
        btn.addEventListener('click', () => {
            const selected = Array.from(list.querySelectorAll('input:checked')).map(x => x.value);
            list.querySelectorAll('input').forEach(x => x.disabled = true);
            btn.disabled = true;
            const labels = selected.map(id => {
                const it = items.find(x => x.id === id);
                return it ? it.label : id;
            });
            appendUserChoice(labels.length ? labels.join(', ') : 'Aucun');
            if (onValidate) onValidate(selected);
        });
        wrap.appendChild(btn);
        return wrap;
    }

    function appendUserChoice(text) {
        const msg = document.createElement('div');
        msg.className = 'message message--user';
        const avatar = document.createElement('span');
        avatar.className = 'message__avatar';
        avatar.textContent = 'M';
        const bubble = document.createElement('div');
        bubble.className = 'message__bubble';
        bubble.textContent = text;
        msg.appendChild(avatar);
        msg.appendChild(bubble);
        chatEl.appendChild(msg);
        scrollToBottom();
    }

    function scrollToBottom() {
        if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    return { start, abort };
})();

window.OnboardingWizard = OnboardingWizard;
