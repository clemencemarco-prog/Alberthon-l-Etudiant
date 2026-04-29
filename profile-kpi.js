/**
 * Profile KPI Sidebar — Prototype visuel.
 *
 * Tout ce qui est ici est en DONNÉES MOCKÉES (étudiante fictive "Léa").
 * Aucun appel API. L'objectif est de valider la maquette avant de brancher
 * les vraies sources (user_profiles, dashboard_pistes, conversation_logs).
 *
 * Branchement futur :
 *   - Card 1 (cohérence) : matching profil ↔ pistes côté PHP
 *   - Card 2 (radar)     : agrégation gouts + spécialités + mots-clés chat
 *   - Card 3 (donut)     : auto-tagger des pistes par domaine (Claude API)
 *   - Card 4 (funnel)    : counts directs sur les tables dashboard_*
 *   - Card 5 (progress)  : ratio actions+docs par piste
 *   - Card 6 (vélocité)  : count actions(statut=fait) par semaine
 *   - Card 7 (carto)     : géocoding des pistes (ville → lat/lng)
 */
(function () {
    'use strict';

    // ============================================================
    // 1. Données mockées (étudiante fictive)
    // ============================================================
    const MOCK = {
        coherence: {
            score: 82,
            headline: '3 pistes sur 4 alignées avec tes spécialités scientifiques.',
            factors: [
                { label: 'Spécialités (Maths, SES)',     state: 'ok'   },
                { label: 'Goûts (international, social)', state: 'ok'   },
                { label: 'Contraintes géographiques',     state: 'warn' },
                { label: 'Budget familial',               state: 'miss' },
            ],
        },

        radar: {
            labels: ['Sciences', 'Créatif', 'International', 'Social', 'Business', 'Technique'],
            values: [80, 35, 90, 65, 70, 55],
        },

        domaines: {
            labels: ['Sciences / Ingé', 'Business / Finance', 'Sciences sociales', 'Communication', 'Autre'],
            values: [4, 3, 2, 1, 1],
            colors: ['#4FAFD7', '#e24b4a', '#16a34a', '#f59e0b', '#9ca3af'],
        },

        funnel: [
            { label: 'Pistes explorées',          value: 12 },
            { label: 'Pistes actives',            value: 7  },
            { label: 'Pistes avec actions',       value: 5  },
            { label: 'Pistes avec docs prêts',    value: 2  },
        ],

        progress: [
            { titre: 'Sciences Po Lille',  done: 60, encours: 25, afaire: 15 },
            { titre: 'HEC BBA',            done: 40, encours: 30, afaire: 30 },
            { titre: 'Dauphine L1 Éco',    done: 25, encours: 20, afaire: 55 },
            { titre: 'King\'s College London', done: 10, encours: 15, afaire: 75 },
        ],

        velocity: {
            labels: ['S-7', 'S-6', 'S-5', 'S-4', 'S-3', 'S-2', 'S-1', 'Cette sem.'],
            values: [2, 4, 1, 5, 3, 6, 4, 7],
        },

        // [lat, lng, ville, libellé piste, statut]
        carto: [
            { lat: 50.6292, lng: 3.0573,  ville: 'Lille',    titre: 'Sciences Po Lille',     statut: 'active'      },
            { lat: 48.8566, lng: 2.3522,  ville: 'Paris',    titre: 'Dauphine L1 Éco',       statut: 'active'      },
            { lat: 48.7637, lng: 2.1718,  ville: 'Jouy-en-Josas', titre: 'HEC BBA',          statut: 'active'      },
            { lat: 51.5074, lng: -0.1278, ville: 'Londres',  titre: 'King\'s College London', statut: 'en_suspens' },
            { lat: 45.7640, lng: 4.8357,  ville: 'Lyon',     titre: 'EM Lyon Programme Grande École', statut: 'active' },
        ],
    };

    // ============================================================
    // 2. Helpers Chart.js
    // ============================================================
    const FONT = "'Inter', system-ui, sans-serif";
    const COLOR_TEXT = '#2a2a2a';
    const COLOR_MUTED = '#7a7a7a';
    const COLOR_GRID = 'rgba(0, 0, 0, 0.06)';

    function commonChartDefaults() {
        if (!window.Chart) return;
        Chart.defaults.font.family = FONT;
        Chart.defaults.font.size = 11;
        Chart.defaults.color = COLOR_MUTED;
        Chart.defaults.plugins.legend.labels.boxWidth = 10;
        Chart.defaults.plugins.legend.labels.boxHeight = 10;
        Chart.defaults.plugins.legend.labels.padding = 8;
    }

    // ============================================================
    // 3. Render — Card 1 : Cohérence
    // ============================================================
    function renderCoherence(data) {
        const ring = document.getElementById('kpi-ring');
        const headline = document.getElementById('kpi-coherence-headline');
        const factors = document.getElementById('kpi-coherence-factors');
        if (!ring || !headline || !factors) return;

        ring.style.setProperty('--pct', data.score);
        ring.querySelector('.kpi-ring__value').firstChild.textContent = data.score;
        headline.textContent = data.headline;

        factors.innerHTML = data.factors.map(f =>
            `<li class="kpi-coherence__factor kpi-coherence__factor--${f.state}">${f.label}</li>`
        ).join('');
    }

    // ============================================================
    // 4. Render — Card 2 : Radar centres d'intérêt
    // ============================================================
    function renderRadar(data) {
        const ctx = document.getElementById('kpi-radar');
        if (!ctx || !window.Chart) return;
        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Profil',
                    data: data.values,
                    backgroundColor: 'rgba(79, 175, 215, 0.20)',
                    borderColor: '#4FAFD7',
                    borderWidth: 2,
                    pointBackgroundColor: '#4FAFD7',
                    pointRadius: 3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        suggestedMin: 0,
                        suggestedMax: 100,
                        angleLines: { color: COLOR_GRID },
                        grid: { color: COLOR_GRID },
                        pointLabels: { color: COLOR_TEXT, font: { size: 10.5, weight: '500' } },
                        ticks: { display: false, stepSize: 25 },
                    },
                },
            },
        });
    }

    // ============================================================
    // 5. Render — Card 3 : Donut domaines
    // ============================================================
    function renderDomaines(data) {
        const ctx = document.getElementById('kpi-domaines');
        if (!ctx || !window.Chart) return;
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: data.colors,
                    borderColor: '#fff',
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'right',
                        align: 'center',
                        labels: { boxWidth: 8, boxHeight: 8, padding: 6, font: { size: 10.5 } },
                    },
                },
            },
        });
    }

    // ============================================================
    // 6. Render — Card 4 : Funnel (HTML/CSS pur)
    // ============================================================
    function renderFunnel(steps) {
        const root = document.getElementById('kpi-funnel');
        if (!root) return;
        const max = Math.max(...steps.map(s => s.value)) || 1;
        root.innerHTML = steps.map(s => {
            const widthPct = Math.max(20, Math.round((s.value / max) * 100));
            return `
                <div class="kpi-funnel-step">
                    <div class="kpi-funnel-bar" style="width:${widthPct}%">${s.value}</div>
                    <span class="kpi-funnel-label">${s.label}</span>
                </div>
            `;
        }).join('');
    }

    // ============================================================
    // 7. Render — Card 5 : Avancement par piste
    // ============================================================
    function renderProgress(items) {
        const root = document.getElementById('kpi-progress');
        if (!root) return;
        root.innerHTML = items.map(it => {
            return `
                <div class="kpi-progress-item">
                    <div class="kpi-progress-head">
                        <span class="kpi-progress-title">${escapeHtml(it.titre)}</span>
                        <span class="kpi-progress-pct">${it.done}%</span>
                    </div>
                    <div class="kpi-progress-bar">
                        <div class="kpi-progress-seg kpi-progress-seg--done"    style="width:${it.done}%"></div>
                        <div class="kpi-progress-seg kpi-progress-seg--encours" style="width:${it.encours}%"></div>
                        <div class="kpi-progress-seg kpi-progress-seg--afaire"  style="width:${it.afaire}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================================
    // 8. Render — Card 6 : Vélocité
    // ============================================================
    function renderVelocity(data) {
        const ctx = document.getElementById('kpi-velocity');
        if (!ctx || !window.Chart) return;
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Actions complétées',
                    data: data.values,
                    backgroundColor: 'rgba(226, 75, 74, 0.85)',
                    borderRadius: 4,
                    maxBarThickness: 24,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: COLOR_MUTED, font: { size: 10 } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: COLOR_GRID },
                        ticks: { color: COLOR_MUTED, font: { size: 10 }, stepSize: 2 },
                    },
                },
            },
        });
    }

    // ============================================================
    // 9. Render — Card 7 : Carto géographique (Leaflet)
    // ============================================================
    function renderCarto(points) {
        const el = document.getElementById('kpi-map');
        if (!el || !window.L) return;

        const map = L.map(el, {
            zoomControl: true,
            attributionControl: false,
            scrollWheelZoom: false,
        }).setView([48.85, 2.35], 4);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
            subdomains: 'abcd',
        }).addTo(map);

        // Marker custom : pastille colorée selon statut
        const colorByStatut = {
            active:     '#e24b4a',
            en_suspens: '#f59e0b',
            abandonnee: '#9ca3af',
        };

        const bounds = [];
        points.forEach(p => {
            const color = colorByStatut[p.statut] || '#4FAFD7';
            const icon = L.divIcon({
                className: 'kpi-map-marker',
                html: `<span style="
                    display:block;
                    width:14px;height:14px;border-radius:50%;
                    background:${color};
                    border:2px solid #fff;
                    box-shadow:0 1px 4px rgba(0,0,0,0.3);
                "></span>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7],
            });
            const popup = `
                <div class="kpi-map-popup">
                    <strong>${escapeHtml(p.titre)}</strong>
                    <span>${escapeHtml(p.ville)} — ${statutLabel(p.statut)}</span>
                </div>
            `;
            L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(popup);
            bounds.push([p.lat, p.lng]);
        });

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [24, 24], maxZoom: 6 });
        }

        // Récap sous la carte
        const summary = document.getElementById('kpi-map-summary');
        if (summary) {
            const villes = new Set(points.map(p => p.ville));
            const nbActives = points.filter(p => p.statut === 'active').length;
            summary.innerHTML = `
                <span><strong>${villes.size}</strong> villes</span>
                <span><strong>${nbActives}</strong> piste${nbActives > 1 ? 's' : ''} active${nbActives > 1 ? 's' : ''}</span>
            `;
        }
    }

    // ============================================================
    // Helpers
    // ============================================================
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function statutLabel(s) {
        return ({
            active:     'Active',
            en_suspens: 'En suspens',
            abandonnee: 'Abandonnée',
        })[s] || s;
    }

    // ============================================================
    // Bootstrap
    // ============================================================
    function init() {
        commonChartDefaults();
        renderCoherence(MOCK.coherence);
        renderRadar(MOCK.radar);
        renderDomaines(MOCK.domaines);
        renderFunnel(MOCK.funnel);
        renderProgress(MOCK.progress);
        renderVelocity(MOCK.velocity);
        renderCarto(MOCK.carto);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
