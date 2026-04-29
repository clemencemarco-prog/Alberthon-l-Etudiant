/**
 * Gestion des cards de suggestion proactive.
 * - Apparition séquentielle (300-500ms)
 * - Slide depuis la droite + fade in
 * - Fermables individuellement
 * - Badge orange "biais positif" si applicable
 */

const PopupManager = (() => {
    // Cible la liste dynamique uniquement, pour préserver le header explicatif
    // (#popups contient #popups-list + un <header> qu'on ne veut pas effacer).
    const container = () => document.getElementById('popups-list');
    let timers = [];

    function clear() {
        timers.forEach(t => clearTimeout(t));
        timers = [];
        const el = container();
        if (el) el.innerHTML = '';
    }

    /**
     * Affiche une liste de pop-ups séquentiellement.
     * @param {Array} popups
     * @param {number} startDelay  délai initial avant la 1re carte
     * @param {number} stepDelay   intervalle entre chaque carte
     */
    function show(popups, startDelay = 600, stepDelay = 420) {
        clear();
        if (!popups || !popups.length) return;
        const el = container();

        popups.forEach((data, i) => {
            const t = setTimeout(() => {
                const card = render(data);
                el.appendChild(card);
                // Force reflow pour déclencher l'animation
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => card.classList.add('is-visible'));
                });
            }, startDelay + i * stepDelay);
            timers.push(t);
        });
    }

    function render(data) {
        const card = document.createElement('article');
        const typeClass = data.type ? ' popup--' + data.type : '';
        card.className = 'popup' + typeClass + (data.positive ? ' popup--positive' : '');

        // Bouton fermeture
        const close = document.createElement('button');
        close.className = 'popup__close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Fermer');
        close.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        close.addEventListener('click', () => {
            card.style.transition = 'opacity 0.2s ease, transform 0.2s ease, max-height 0.25s ease, margin 0.25s ease';
            card.style.maxHeight = card.offsetHeight + 'px';
            requestAnimationFrame(() => {
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                card.style.maxHeight = '0';
                card.style.margin = '0';
                card.style.padding = '0';
            });
            setTimeout(() => card.remove(), 260);
        });
        card.appendChild(close);

        // Badge biais positif
        if (data.positive && data.badge) {
            const badge = document.createElement('span');
            badge.className = 'popup__badge';
            badge.textContent = data.badge;
            card.appendChild(badge);
        }

        // Badge recoupement journalistique
        if (data.crossCheck) {
            const cc = document.createElement('span');
            cc.className = 'popup__crosscheck popup__crosscheck--' + data.crossCheck;
            cc.title = data.crossCheck === 'verifie'
                ? 'Information recoupée sur plusieurs sources de confiance'
                : 'Information issue d\'une seule source';
            cc.innerHTML = data.crossCheck === 'verifie'
                ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Vérifié'
                : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Source unique';
            card.appendChild(cc);
        }

        // Selon le type
        if (data.type === 'video') {
            const video = document.createElement('div');
            video.className = 'popup__video';
            video.innerHTML = '<span class="popup__play"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></span>';
            card.appendChild(video);

            if (data.kind) {
                const kind = document.createElement('div');
                kind.className = 'popup__kind';
                kind.textContent = data.kind;
                card.appendChild(kind);
            }

            const title = document.createElement('h4');
            title.className = 'popup__title';
            title.textContent = data.title;
            card.appendChild(title);
        } else {
            // job / event / article : icône + kind + titre
            const header = document.createElement('div');
            header.className = 'popup__header';
            if (data.icon) {
                const icon = document.createElement('span');
                icon.className = 'popup__icon';
                icon.textContent = data.icon;
                header.appendChild(icon);
            }
            if (data.kind) {
                const kind = document.createElement('span');
                kind.className = 'popup__kind';
                kind.textContent = data.kind;
                header.appendChild(kind);
            }
            card.appendChild(header);

            const title = document.createElement('h4');
            title.className = 'popup__title';
            title.textContent = data.title;
            card.appendChild(title);

            if (Array.isArray(data.bullets) && data.bullets.length) {
                const ul = document.createElement('ul');
                ul.className = 'popup__list';
                data.bullets.forEach(b => {
                    const li = document.createElement('li');
                    li.textContent = b;
                    ul.appendChild(li);
                });
                card.appendChild(ul);
            }
        }

        // Mention de la source (sourcing visible sur chaque carte)
        if (data.source) {
            const src = document.createElement('p');
            src.className = 'popup__source';
            src.textContent = 'Source : ' + data.source;
            card.appendChild(src);
        }

        // Checkbox "Comparer" — uniquement sur les types comparables.
        // Articles et vidéos ne sont pas comparables (peu de critères structurés).
        const COMPARABLE_TYPES = ['formation', 'fiche_metier', 'job', 'salon', 'event', 'livre'];
        if (COMPARABLE_TYPES.includes(data.type) && window.ComparisonManager) {
            const compareLabel = document.createElement('label');
            compareLabel.className = 'popup__compare';
            compareLabel.title = 'Sélectionner pour comparer cette option avec d\'autres';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'popup__compare-checkbox';
            const optionId = `${data.type}::${data.url || data.title}`;
            checkbox.dataset.optionId = optionId;
            // Reflète l'état si déjà sélectionnée
            if (window.ComparisonManager.has(optionId)) {
                checkbox.checked = true;
                card.classList.add('popup--selected-compare');
            }
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const ok = window.ComparisonManager.add({
                        id:     optionId,
                        type:   data.type,
                        title:  data.title,
                        url:    data.url || '',
                        source: data.source || '',
                    });
                    if (!ok) {
                        // Limite de 3 atteinte
                        e.target.checked = false;
                        return;
                    }
                    card.classList.add('popup--selected-compare');
                } else {
                    window.ComparisonManager.remove(optionId);
                    card.classList.remove('popup--selected-compare');
                }
            });

            const text = document.createElement('span');
            text.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>Comparer';

            compareLabel.appendChild(checkbox);
            compareLabel.appendChild(text);
            card.appendChild(compareLabel);
        }

        // CTA — lien réel si url fournie, sinon bouton démo
        let cta;
        if (data.url) {
            cta = document.createElement('a');
            cta.className = 'popup__btn';
            cta.href = data.url;
            cta.target = '_blank';
            cta.rel = 'noopener noreferrer';
            cta.textContent = data.cta || 'En savoir plus';
        } else {
            cta = document.createElement('button');
            cta.className = 'popup__btn';
            cta.type = 'button';
            cta.textContent = data.cta || 'En savoir plus';
            cta.addEventListener('click', (e) => {
                e.preventDefault();
                cta.textContent = '✓ Bientôt disponible';
                cta.disabled = true;
                setTimeout(() => {
                    cta.textContent = data.cta || 'En savoir plus';
                    cta.disabled = false;
                }, 1500);
            });
        }
        card.appendChild(cta);

        return card;
    }

    return { show, clear };
})();

window.PopupManager = PopupManager;
