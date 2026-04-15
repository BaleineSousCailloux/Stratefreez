// ==========================================
// --- VARIABLES GLOBALES (SÉCURITÉ D'INITIALISATION) ---
// ==========================================
let isHardCascade = false;
let clipboardStints = null;
let currentFileName = "";
let liveTimer = null;
let liveTimerActive = false;
let lastTimerTick = 0;
let animationFrameId = null;
let strategySplits = [];
let pitModalTarget = null;
let undoPitModalTarget = null;
let rowToDelete = null;
let fuelModalTarget = null;
let lastActiveStint = localStorage.getItem('lastActiveStint') || null;
// 🚀 NOUVEAU : Empreinte d'état (Remplace le boolean needsStrategyUpdate)
let lastCalculatedState = null;
let liveStandbyTimeout = null;
let isFirstStrategyBuilt = false;
let isFlashMessageAlive = false; // Permet au chrono de savoir si un message bloque la zone
let cloudFlashLockUntil = 0; // Mémoire du verrou Cloud
// 🚀 NOUVELLES VARIABLES : Poste de Douane (Onglet Technique)
let techInputMemory = null;
let techWatchdogTimer = null;
let pendingTechChange = null;

// ==========================================
// --- NOUVEAU : HORLOGE ATOMIQUE (0 Quota) ---
// ==========================================
let serverOffset = 0; // Le décalage de la carte mère en millisecondes

// 🚀 LE NOUVEAU MAÎTRE DU TEMPS (Version Blindée Firebase)
function calibrateTime() {
    const offsetRef = firebase.database().ref(".info/serverTimeOffset");
    const connectedRef = firebase.database().ref(".info/connected");

    // 1. Le Radar de Temps (S'ajuste silencieusement)
    offsetRef.on("value", (snap) => {
        serverOffset = snap.val() || 0;
    });

    // 2. Le Radar de Connexion (Gère les Logs et la Sécurité Anti-Crash)
    connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
            console.log("🟢 [Horloge] Connecté à Firebase ! Décalage atomique : " + serverOffset + "ms");
        } else {
            serverOffset = 0; // 🛡️ SÉCURITÉ : Retour à l'horloge système brute
            console.warn("🔴 [Horloge] Déconnecté du serveur. Passage sur l'horloge système (Décalage : 0ms).");
        }
    });
}

// La fonction magique qui remplace le "Date.now()" classique
function getUnifiedTime() {
    return Date.now() + serverOffset;
}

// ==========================================
// --- MENU ET ERGONOMIE GLOBALE ---
// ==========================================
function toggleMenu() {
    document.getElementById('nav-links').classList.toggle('show-menu');
}

document.addEventListener('focusin', function (e) {
    if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) {
        e.target.select();
    }

    let tr = e.target.closest('tr[data-stint]');
    if (tr) {
        document.querySelectorAll('.active-stint').forEach(el => el.classList.remove('active-stint'));
        document.querySelectorAll('.active-relay').forEach(el => el.classList.remove('active-relay'));
        tr.classList.add('active-stint');

        let block = tr.closest('.split-block');
        if (block) {
            let relayId = block.getAttribute('data-relay');
            if (relayId) {
                document.querySelectorAll(`.split-block[data-relay="${relayId}"]`).forEach(el => el.classList.add('active-relay'));
            } else {
                block.classList.add('active-relay');
            }
        }

        let stintId = tr.dataset.stint;
        localStorage.setItem('lastActiveStint', stintId);
        lastActiveStint = stintId;
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.target.blur();
    }
});

document.addEventListener('change', function (e) {
    if (e.target.type === 'number') {
        let val = parseFloat(e.target.value);
        if (val < 0) e.target.value = (e.target.id === 'race-laps' || e.target.id === 'total-splits' || e.target.classList.contains('table-input')) ? 1 : 0;
    }
});

document.addEventListener('click', function (e) {
    let tr = e.target.closest('tr[data-stint]');
    if (tr && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        document.querySelectorAll('.active-stint').forEach(el => el.classList.remove('active-stint'));
        document.querySelectorAll('.active-relay').forEach(el => el.classList.remove('active-relay'));
        tr.classList.add('active-stint');

        let block = tr.closest('.split-block');
        if (block) {
            let relayId = block.getAttribute('data-relay');
            if (relayId) {
                document.querySelectorAll(`.split-block[data-relay="${relayId}"]`).forEach(el => el.classList.add('active-relay'));
            } else {
                block.classList.add('active-relay');
            }
        }

        let stintId = tr.dataset.stint;
        localStorage.setItem('lastActiveStint', stintId);
        lastActiveStint = stintId;
    }
});

// ==========================================
// --- SAUVEGARDE & STATUS ---
// ==========================================

function saveFormState() {
    if (window.isInitializingDOM) return;

    const state = {};
    document.querySelectorAll('input:not(#pit-modal-lap):not(#undo-pit-modal-lap):not(#fuel-modal-input):not(#stop-timer-input):not(#save-config-name):not(#import-config-file):not(#quick-save-name), select, textarea:not(#flash-msg-input)').forEach(el => {
        if (el.id && !el.closest('#tab-strategy') && !el.closest('#tab-export')) {
            state[el.id] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });
    localStorage.setItem('stratefreez-form-state', JSON.stringify(state));
    localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));

    // 🚀 L'ANTENNE GLOBALE EST DE RETOUR !
    triggerCloudSync();
}

// 🚀 FINI LE MINUTEUR, on supprime globalSaveTimeout

document.addEventListener('input', (e) => {
    checkRequiredFields();
    // 🚀 L'INTERFACE ESSENCE EN DIRECT
    if (e.target.id === 'fuel-start') {
        if (typeof toggleFuelUI === 'function') toggleFuelUI();
    }
    // 1. On garde uniquement les calculs visuels en direct.
    // 🚀 AUCUNE sauvegarde Cloud ne part pendant qu'on tape !
    if (['stop-timer-input', 'save-config-name', 'import-config-file', 'quick-save-name'].includes(e.target.id)) return;

    if (['race-duration', 'race-duration-hh', 'race-duration-mm', 'race-laps', 'total-splits'].includes(e.target.id)) {
        calculateSplit();
    }
});

document.addEventListener('change', (e) => {
    checkRequiredFields();
    // 2. 🚀 DÉCLENCHEUR ATOMIQUE : Se déclenche quand on "valide" (Entrée, Clic ailleurs, ou choix d'un menu)
    if (['stop-timer-input', 'save-config-name', 'import-config-file', 'quick-save-name'].includes(e.target.id)) return;

    // On enregistre ET ça tire immédiatement sur le Cloud grâce à la Voie Rapide
    saveFormState();

    if (e.target.id === 'enable-pit-window' || e.target.id === 'pit-window-mode-tours' || e.target.id === 'global-req-tire-change') {
        togglePitWindowUI();
    }
});

window.hasGlobalAlert = false;
window.globalAlertText = "";

function updateAlertVisibility() {
    const banner = document.getElementById('global-alert-banner');
    let activeTab = localStorage.getItem('stratefreez-current-tab') || 'tab-params';

    const lockIcons = document.querySelectorAll('.lock-icon');
    const exportBtns = document.querySelectorAll('#btn-export-print, #btn-export-csv, #btn-export-copy, #btn-export-json');
    const btnCheck = document.getElementById('btn-check-rules');

    if (window.hasGlobalAlert) {
        if (activeTab === 'tab-strategy' || activeTab === 'tab-live') {
            document.body.classList.add('global-alert-active');
            banner.classList.remove('hidden');
        } else {
            document.body.classList.remove('global-alert-active');
            banner.classList.add('hidden');
        }
        lockIcons.forEach(icon => icon.classList.remove('hidden'));
        exportBtns.forEach(btn => btn.classList.add('locked-export-btn'));
        if (btnCheck) {
            btnCheck.classList.remove('btn-success');
            btnCheck.classList.add('btn-danger');
        }
    } else {
        document.body.classList.remove('global-alert-active');
        banner.classList.add('hidden');
        lockIcons.forEach(icon => icon.classList.add('hidden'));
        exportBtns.forEach(btn => btn.classList.remove('locked-export-btn'));
        if (btnCheck) {
            btnCheck.classList.remove('btn-danger');
            btnCheck.classList.add('btn-success');
        }
    }
}

function updateLiveStandbyState(isRaceEnd = false) {
    let overlay = document.getElementById('live-standby-overlay');
    if (!overlay) return;

    // Si on n'est pas ingénieur, l'écran de départ n'existe pas
    if (!isEngineerMode) {
        overlay.classList.add('hidden');
        return;
    }

    if (liveTimerActive) {
        // Chrono lancé : On cache l'écran et on annule tout délai
        overlay.classList.add('hidden');
        clearTimeout(liveStandbyTimeout);
    } else {
        // 🚀 FIX 3 : Le Cerveau du Bouton Géant (Online vs IRL)
        let btn = document.getElementById('btn-giant-start');
        let raceType = document.getElementById('race-type')?.value;
        let isOnline = (raceType === 'online');
        let nextSplitIdx = 0;

        if (isOnline) {
            // Cherche le premier relais non terminé
            for (let i = 0; i < strategySplits.length; i++) {
                if (!strategySplits[i].isFinished) {
                    nextSplitIdx = i;
                    break;
                }
            }
            if (btn) {
                btn.innerText = `DÉPART RELAIS ${nextSplitIdx + 1}`;
                btn.onclick = () => startLiveTimer(nextSplitIdx);
            }
        } else {
            if (btn) {
                btn.innerText = `DÉPART DE LA COURSE`;
                btn.onclick = () => startLiveTimer(0);
            }
        }

        // 🚀 FIX 2 : Affichage Immédiat ou Délai de 3 minutes
        if (isRaceEnd) {
            // Fin naturelle (Course ou Relais) : On attend 3 min (180 000 ms)
            clearTimeout(liveStandbyTimeout);
            liveStandbyTimeout = setTimeout(() => {
                if (!liveTimerActive) overlay.classList.remove('hidden');
            }, 180000);
        } else {
            // Arrêt manuel ou navigation : Affichage immédiat
            clearTimeout(liveStandbyTimeout);
            overlay.classList.remove('hidden');
        }
    }
}

function openTab(tabId) {
    // 🚀 LE NETTOYEUR : On détruit le focus fantôme instantanément au changement d'onglet
    // (Baisse le bouclier et force la validation de n'importe quelle case en cours d'édition)
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelector(`button[onclick="openTab('${tabId}')"]`)?.classList.add('active');
    localStorage.setItem('stratefreez-current-tab', tabId);

    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.remove('show-menu');

    updateAlertVisibility();

    const fab = document.getElementById('fab-top');
    if (fab) {
        fab.classList.toggle('hidden', !['tab-params', 'tab-tech', 'tab-strategy'].includes(tabId));
    }

    if (tabId === 'tab-strategy') {
        saveFormState();
        let currentState = localStorage.getItem('stratefreez-form-state');

        if (currentState !== lastCalculatedState) {
            initStrategyData();
            cascadeFixPitWindows();
            renderStrategy();
            lastCalculatedState = currentState;
        }

        setTimeout(() => {
            if (tabId === 'tab-strategy') {
                // 🚀 CIBLAGE INTELLIGENT (Uniquement Onglet 3)
                let targetEl = null;
                let timerStr = localStorage.getItem('stratefreez-timer');
                let timerState = timerStr ? JSON.parse(timerStr) : null;

                if (timerState && timerState.active) {
                    targetEl = document.querySelector('.active-live-stint'); // Focus Chrono (Vert)
                }
                if (!targetEl) {
                    targetEl = document.querySelector('.active-stint'); // Focus Reprise (Bleu)
                }

                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else {
                // 🚀 COMPORTEMENT VIERGE : Tous les autres onglets remontent brutalement à 0,0
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        }, 150);
    }

    if (tabId === 'tab-export') {
        generateIARequest();
    }
    if (tabId === 'tab-live') updateLiveStandbyState();
}

// ==========================================
// --- REINITIALISATIONS ET IMPORT/EXPORT ---
// ==========================================

function openResetTab1Modal() {
    let timerStr = localStorage.getItem('stratefreez-timer');
    if (timerStr && JSON.parse(timerStr).active) {
        return showErrorModal("Impossible de réinitialiser les paramètres pendant qu'une course est en cours.");
    }
    document.getElementById('reset-tab1-modal').classList.remove('hidden');
}
function closeResetTab1Modal() { document.getElementById('reset-tab1-modal').classList.add('hidden'); }
function confirmResetTab1() {
    let currentName = document.getElementById('race-name-input').value; // 🚀 Sauvegarde
    document.getElementById('form-params').reset();
    document.getElementById('race-name-input').value = currentName; // 🚀 Restauration
    document.getElementById('num-drivers').value = 1;
    document.getElementById('num-spotters').value = 1;
    document.getElementById('total-splits').value = 1;
    updateDynamicFields();
    toggleRaceGoal();
    toggleSpotters();
    ['T', 'M', 'D', 'I', 'P'].forEach(t => toggleTireOptions(t));
    saveFormState();
    closeResetTab1Modal();
}

function openResetTab2Modal() {
    let timerStr = localStorage.getItem('stratefreez-timer');
    if (timerStr && JSON.parse(timerStr).active) {
        return showErrorModal("Impossible de réinitialiser la technique pendant qu'une course est en cours.");
    }
    document.getElementById('reset-tab2-modal').classList.remove('hidden');
}
function closeResetTab2Modal() { document.getElementById('reset-tab2-modal').classList.add('hidden'); }
function confirmResetTab2() {
    document.getElementById('form-tech').reset();
    let pt = document.getElementById('personalize-drivers-toggle');
    if (pt) {
        pt.checked = false;
        toggleDriverPersonalization();
    }
    saveFormState();
    closeResetTab2Modal();
}

function syncFileName(val) {
    currentFileName = val;
    let modalInp = document.getElementById('quick-save-name');
    let raceInp = document.getElementById('race-name-input');

    if (modalInp && modalInp.value !== val) modalInp.value = val;
    if (raceInp && raceInp.value !== val) raceInp.value = val;
}

function openQuickSaveModal() {
    let modalInp = document.getElementById('quick-save-name');
    if (modalInp) modalInp.value = currentFileName;
    document.getElementById('quick-save-modal').classList.remove('hidden');
    setTimeout(() => { if (modalInp) modalInp.focus(); }, 50);
}
function closeQuickSaveModal() { document.getElementById('quick-save-modal').classList.add('hidden'); }
function confirmQuickSave() {
    closeQuickSaveModal();
    executeSave();
}

function executeSave() {
    let name = currentFileName.trim();

    if (!name) {
        showErrorModal("Export impossible : la course n'a pas de nom.");
        return;
    }

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');

    let config = {
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : []
    };

    let blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    /*setSaveBadge(true);*/
}

// 🚀 AXE 2 : Fonction de Duplication
function openDuplicateErrorModal() { document.getElementById('duplicate-error-modal').classList.remove('hidden'); }
function closeDuplicateErrorModal() { document.getElementById('duplicate-error-modal').classList.add('hidden'); }

// 🚀 NOUVELLE VERSION : Duplication Cloud (Création de Modèle Vierge) + Videur Strict
async function duplicateRace() {
    let newName = document.getElementById('save-config-name').value.trim();
    let currentName = document.getElementById('race-name-input').value.trim();

    // 1. Validation de base
    if (!newName || newName === currentName) {
        document.getElementById('duplicate-error-modal').classList.remove('hidden');
        return;
    }

    // 2. 🚀 VIDEUR STRICT (Option A)
    let isTaken = await isRaceNameTaken(newName);
    if (isTaken) {
        return showErrorModal("Ce nom de course est déjà utilisé sur le Cloud.<br>Veuillez en choisir un autre.");
    }

    // 3. Préparation des données (Clonage profond)
    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');

    let clonedFormState = stateStr ? JSON.parse(stateStr) : {};
    let clonedStrategy = stratStr ? JSON.parse(stratStr) : [];

    // --- LA PURGE DE LA COPIE ---
    // On s'assure que la nouvelle course est totalement vierge
    clonedFormState['race-name-input'] = newName;

    clonedStrategy.forEach(split => {
        split.isFinished = false;
        split.stints.forEach(stint => {
            stint.isPitted = false;
            stint.lockedTimeSec = null;
            stint.manualFuel = null;
        });
    });

    // 4. Génération des nouveaux IDs
    let newRaceId = 'race_' + Date.now();
    let newPin = Math.floor(1000 + Math.random() * 9000).toString();

    // 5. Envoi à Firebase
    db.collection('races').doc(newRaceId).set({
        id: newRaceId,
        name: newName,
        pin: newPin,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        formState: clonedFormState,
        strategyData: clonedStrategy,
        timerState: null,      // Chrono purgé
        isTimerRunning: false, // Course à l'arrêt
        isActive: true         // Course "Prête"
    }).then(() => {
        // 6. Attribution immédiate des droits d'ingénieur (Passeport)
        localStorage.setItem(`stratefreez-passport-${newRaceId}`, 'true');

        // 7. Affichage du PIN dans la modale
        document.getElementById('duplicate-new-pin').innerText = newPin;
        document.getElementById('duplicate-success-modal').classList.remove('hidden');

        // 8. Nettoyage de l'interface
        document.getElementById('save-config-name').value = '';

    }).catch(err => {
        console.error("Erreur Duplication Cloud :", err);
        showErrorModal("Erreur de connexion au serveur Firebase.");
    });
}

function loadConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    // On stocke juste le nom, limité à 45 caractères, mais on ne l'injecte pas encore dans l'interface
    let fileName = file.name.replace(/\.[^/.]+$/, "").substring(0, 45);

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.formState && data.strategyData) {

                // 🚀 VIDEUR STRICT
                let isTaken = await isRaceNameTaken(fileName);
                if (isTaken) {
                    showErrorModal("Le nom de ce fichier correspond à une course déjà existante sur le Cloud.<br><br>Renommez votre fichier sur votre ordinateur avant de l'importer.");
                    return; // On bloque tout
                }

                // ✅ Le nom est validé : on l'injecte maintenant dans l'interface !
                syncFileName(fileName);

                data.strategyData.forEach(split => {
                    if (split.stints) {
                        split.stints.forEach(stint => {
                            if (stint.fuelStrat === 'normal') stint.fuelStrat = 'push';
                            if (stint.laps === undefined || stint.laps === null) stint.laps = 1;
                        });
                    }
                });

                localStorage.setItem('stratefreez-form-state', JSON.stringify(data.formState));
                localStorage.setItem('stratefreez-data', JSON.stringify(data.strategyData));
                strategySplits = data.strategyData;

                applyFormStateToDOM(data.formState);

                let strTimer = localStorage.getItem('stratefreez-timer');
                let needsCatchup = false;
                if (strTimer) {
                    let timerState = JSON.parse(strTimer);
                    if (timerState && timerState.active) {
                        let elapsed = getUnifiedTime() - timerState.startTimeReal;
                        for (let i = 0; i < strategySplits.length; i++) {
                            if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
                            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                                let stint = strategySplits[i].stints[j];
                                if (!stint.isPitted && stint.endSec !== undefined && elapsed >= (stint.endSec + 180000)) {
                                    stint.isPitted = true;
                                    stint.lockedTimeSec = stint.endSec;
                                    needsCatchup = true;
                                }
                            }
                        }
                    }
                }

                cascadeFixPitWindows();
                if (needsCatchup) cascadeFixPitWindows();

                saveFormState();
                lastCalculatedState = localStorage.getItem('stratefreez-form-state');
                renderStrategy();
                navigateToSmartTab();

            } else {
                showErrorModal("Fichier non valide : structure incorrecte.");
            }
        } catch (err) {
            console.error("Erreur Import:", err);
            showErrorModal("Erreur de lecture du fichier : " + err.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function applyFormStateToDOM(state) {
    if (!state) return;

    window.isInitializingDOM = true;

    // 🚀 TRY-FINALLY : Le bouclier sera levé à la fin quoiqu'il arrive
    try {
        let pitWindowCheckbox = document.getElementById('enable-pit-window');
        if (pitWindowCheckbox && state['enable-pit-window'] !== undefined) {
            pitWindowCheckbox.checked = state['enable-pit-window'];
            let drvs = parseInt(state['num-drivers']) || 1;
            let rt = state['race-type'] || 'irl';
            pitWindowCheckbox.dataset.lastMode = (drvs > 1 && rt !== 'online') ? 'irl-multi' : 'other';
        }

        ['num-drivers', 'total-splits', 'has-spotter', 'num-spotters'].forEach(id => {
            if (state[id] !== undefined) {
                let el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = state[id];
                    else el.value = state[id];
                }
            }
        });

        updateDynamicFields();
        if (state['has-spotter'] !== undefined) toggleSpotters();

        for (const [id, value] of Object.entries(state)) {
            if (id === 'flash-msg-input') continue; // 🚀 FIX : Ignore les vieux fantômes du Cloud
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = value;
                else el.value = value;
            }
        }

        toggleRaceGoal();
        ['T', 'M', 'D', 'I', 'P'].forEach(t => toggleTireOptions(t));

        let pToggle = document.getElementById('personalize-drivers-toggle');
        if (pToggle && pToggle.checked) {
            document.getElementById('drivers-tech-fieldset').classList.remove('hidden');
        } else {
            document.getElementById('drivers-tech-fieldset').classList.add('hidden');
        }

        calculateSplit();

        let numD = parseInt(document.getElementById('num-drivers').value) || 1;
        for (let i = 1; i <= numD; i++) {
            let val = document.getElementById(`driver-name-input-${i}`)?.value;
            const title = document.getElementById(`driver-card-title-${i}`);
            if (title) title.innerText = val || `Pilote ${i}`;
        }
    } finally {
        // Désactivation du bouclier (la page est prête)
        window.isInitializingDOM = false;
    }
    // 🚀 RESTAURATION VISUELLE SILENCIEUSE (Aucun événement réseau déclenché)

    // 1. Unités (Carburant et Secondes)
    document.querySelectorAll('.format-liters').forEach(inp => { let val = inp.value.replace(/[^\d.]/g, ''); if (val !== '' && !isNaN(parseFloat(val))) inp.value = parseFloat(val) + " L"; });
    document.querySelectorAll('.format-lps').forEach(inp => { let val = inp.value.replace(/[^\d.]/g, ''); if (val !== '' && !isNaN(parseFloat(val))) inp.value = parseFloat(val) + " L/s"; });
    document.querySelectorAll('.format-lpt').forEach(inp => { let val = inp.value.replace(/[^\d.]/g, ''); if (val !== '' && !isNaN(parseFloat(val))) inp.value = parseFloat(val) + " L/t"; });
    document.querySelectorAll('.format-sec').forEach(inp => { let val = inp.value.match(/(\d+(\.\d+)?)/); if (val) inp.value = val[0] + " s"; });

    // 2. Formatage Temporel (Heures et Chronos)
    document.querySelectorAll('.format-hhmm').forEach(inp => {
        let val = inp.value.replace(/\D/g, '');
        if (val.length >= 3) {
            let m = val.slice(-2);
            let h = val.slice(0, -2).padStart(2, '0');
            inp.value = `${h}:${m}`;
        } else if (val.length > 0) {
            inp.value = `${val.padStart(2, '0')}:00`;
        }
    });

    document.querySelectorAll('.format-mss000').forEach(inp => {
        let val = inp.value.replace(/\D/g, '');
        if (val.length >= 4) {
            let ms = val.slice(-3);
            let s = val.slice(-5, -3).padStart(2, '0');
            let m = val.slice(0, -5) || '0';
            inp.value = `${m}:${s}.${ms}`;
        }
    });
    if (typeof toggleFuelUI === 'function') toggleFuelUI();
}

// ==========================================
// --- NOUVELLES VARIABLES GLOBALES (AXE 1) ---
// ==========================================
let currentRaceId = localStorage.getItem('stratefreez-current-race-id') || null;
let currentRacePin = localStorage.getItem('stratefreez-current-race-pin') || null;
let isRaceActive = localStorage.getItem('stratefreez-is-race-active') === 'true';
let pendingSwitchRaceId = null;
let unsubscribeCloud = null;

// 🚀 NOUVELLES VARIABLES SÉCURITÉ & RÉSEAU
let isEngineerMode = false; // Sera défini dynamiquement selon la course

function triggerCloudSync() {
    if (!currentRaceId || !isRaceActive || !isEngineerMode || !navigator.onLine) return;

    // 🚀 LE VERROU : On n'envoie RIEN au Cloud tant que le 1er tableau n'est pas généré !
    if (!isFirstStrategyBuilt) return;

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');
    let timerStr = localStorage.getItem('stratefreez-timer');
    let timerState = timerStr ? JSON.parse(timerStr) : null;
    let raceName = document.getElementById('race-name-input')?.value || "Course sans nom";

    // 🚀 MAGIE : set({merge: true}) crée la course sur le Cloud si elle n'existe pas, ou la met à jour !
    db.collection('races').doc(currentRaceId).set({
        id: currentRaceId,
        pin: currentRacePin,
        name: raceName,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : [],
        timerState: timerState,
        isTimerRunning: timerState ? timerState.active : false,
        isActive: true
    }, { merge: true }).catch(err => console.error("Erreur de synchro Cloud :", err));
}

// Nettoie l'envoi Cloud de l'ancienne fonction saveFormState
// (Il faut chercher db.collection('races').doc(currentRaceId).set(...) dans saveFormState et le remplacer par triggerCloudSync();)

function toggleObserverMode(isLocked) {
    // 🚀 PROTECTION ABSOLUE : pas de course, pas d'ingénieur
    if (!currentRaceId) isLocked = true;

    document.body.classList.toggle('observer-locked', isLocked);
    let badge = document.getElementById('save-status-badge');
    if (badge) {
        // 🚀 ACCUEIL : Si aucune course n'est chargée, on force le Rouge (Verrouillé)
        if (!currentRaceId) {
            badge.classList.remove('saved');
            badge.classList.add('unsaved'); // Rouge
            badge.innerHTML = '<span class="material-symbols-outlined icon-navbar">lock</span>'; // Cadenas fermé
            badge.title = "Aucune course - Interface verrouillée";
            return;
        }

        if (isLocked) {
            badge.classList.remove('saved');
            badge.classList.add('unsaved'); // 🔴 Rouge : Verrouillé (Observateur / Serrure fermée)
            badge.innerHTML = '<span class="material-symbols-outlined icon-navbar">lock</span>';
            badge.title = "Mode Observateur - Cliquer pour déverrouiller";
        } else {
            badge.classList.remove('unsaved');
            badge.classList.add('saved'); // 🟢 Vert : Ouvert (Ingénieur / Serrure ouverte)
            badge.innerHTML = '<span class="material-symbols-outlined icon-navbar">lock_open</span>';
            badge.title = "Mode Ingénieur Actif - Cliquer pour verrouiller";
        }
    }
    updatePinDisplay();
    evaluateFlashButtonState(); // 🚀 Affiche/Masque la bulle selon le cadenas

    // 🚀 DYNAMISME : On actualise le scanner visuel au verrouillage/déverrouillage
    if (typeof checkRequiredFields === 'function') checkRequiredFields();
    // 🚀 FIX : On force le tableau à se redessiner pour verrouiller/déverrouiller physiquement les cases
    if (isFirstStrategyBuilt && typeof renderStrategy === 'function') {
        renderStrategy();
    }
}

function handlePadlockClick() {
    if (!currentRaceId) return; // Ne rien faire sur la page d'accueil

    if (isEngineerMode) {
        // 🚀 SERRURE : On se verrouille visuellement (Sans jeter le passeport)
        isEngineerMode = false;
        toggleObserverMode(true);
    } else {
        // 🚀 PASSEPORT : On vérifie si on a déjà la clé en mémoire
        let hasPassport = localStorage.getItem(`stratefreez-passport-${currentRaceId}`) === 'true';
        if (hasPassport) {
            isEngineerMode = true;
            toggleObserverMode(false); // Déverrouillage instantané !
            navigateToSmartTab();
        } else {
            // Pas de passeport ? On demande le code PIN
            document.getElementById('pin-auth-input').value = '';
            document.getElementById('pin-error-msg').classList.add('hidden');
            document.getElementById('pin-auth-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('pin-auth-input').focus(), 50);
        }
    }
    // 🚀 AJOUT : On force la mise à jour de l'écran Start du Live
    updateLiveStandbyState();
}

function closePinAuthModal() { document.getElementById('pin-auth-modal').classList.add('hidden'); }

function confirmPinAuth() {
    let input = document.getElementById('pin-auth-input').value.trim();
    if (input === currentRacePin) {
        isEngineerMode = true;
        // 🚀 PASSEPORT : On mémorise la clé à vie pour cette course !
        localStorage.setItem(`stratefreez-passport-${currentRaceId}`, 'true');
        toggleObserverMode(false);
        closePinAuthModal();
        navigateToSmartTab(); // 🚀 REDIRECTION INTELLIGENTE
    } else {
        document.getElementById('pin-error-msg').classList.remove('hidden');
    }
}

// 🌐 ÉCOUTEURS DE RÉSEAU (AXE 5)
window.addEventListener('offline', () => {
    document.getElementById('save-status-badge').classList.add('padlock-offline');
});
window.addEventListener('online', () => {
    document.getElementById('save-status-badge').classList.remove('padlock-offline');
    if (isEngineerMode) triggerCloudSync(); // Force une synchro au retour de la connexion
});

// ==========================================
// --- INITIALISATION INTELLIGENTE (F5) ---
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    calibrateTime(); // 🚀 ON CALIBRE L'HORLOGE DÈS L'OUVERTURE
    applyMobileNumericKeypad(); // 🚀 APPLICATION DU CLAVIER DÉCIMAL MOBILE
    let timerStr = localStorage.getItem('stratefreez-timer');
    let isTimerRunning = timerStr ? JSON.parse(timerStr).active : false;

    // La course est "en cours" si elle n'a pas été finie OU si le chrono tourne
    let shouldResumeRace = isRaceActive || isTimerRunning;

    if (shouldResumeRace && currentRaceId) {
        // --- CAS A : REPRISE DE COURSE ---
        const stateStr = localStorage.getItem('stratefreez-form-state');
        if (stateStr) {
            let parsedState = JSON.parse(stateStr);
            applyFormStateToDOM(parsedState);
            if (parsedState['race-name-input']) syncFileName(parsedState['race-name-input']);
        }

        const stratData = localStorage.getItem('stratefreez-data');
        if (stratData) strategySplits = JSON.parse(stratData);

        cascadeFixPitWindows();
        loadTimerState();
        updatePinDisplay();
        updateSnapshotDropdown();
        listenToCloudRace(); // 🚀 AJOUT ICI : Relance l'écoute après un F5

        // 🚀 SÉCURITÉ : Même si on a le passeport, on arrive TOUJOURS en spectateur au F5.
        // Cela stabilise la connexion avant d'autoriser l'écriture (Cadenas Rouge).
        let hasPassport = localStorage.getItem(`stratefreez-passport-${currentRaceId}`) === 'true';
        isEngineerMode = false;
        toggleObserverMode(true);

        // Focus intelligent
        navigateToSmartTab();

    } else {
        // --- CAS B : NOUVELLE SESSION (Course vierge ou terminée) ---
        clearCurrentRaceData();
        updateDynamicFields();
        openTab('tab-params');
    }
    // 🚀 INITIALISATION : Si le sas est vide, on verrouille
    if (!currentFileName || currentFileName === "") {
        isEngineerMode = false;
        toggleObserverMode(true);
    }
    // 🚀 ÉCOUTE GLOBALE DES MODIFICATIONS (Onglets 1 & 2)
    document.getElementById('form-params')?.addEventListener('change', processGlobalDataChange);
    // 🚀 LE POSTE DE DOUANE : On débranche la ligne directe pour l'onglet Technique
    document.getElementById('form-tech')?.addEventListener('change', handleTechFormChange);
    document.getElementById('form-tech')?.addEventListener('focusin', handleTechFormFocus);
});

// ==========================================
// --- AXE 1 : GESTION LOBBY (Nouvelle / Rejoindre Course) ---
// ==========================================
function updatePinDisplay() {
    const pinBlock = document.getElementById('race-pin-display');
    const pinValue = document.getElementById('race-pin-value');

    // 🚀 SÉCURITÉ : On n'affiche le PIN que si l'utilisateur est DÉJÀ Ingénieur
    if (currentRacePin && currentRaceId && isEngineerMode) {
        if (pinValue) pinValue.innerText = currentRacePin;
        if (pinBlock) pinBlock.classList.remove('hidden');
    } else {
        if (pinBlock) pinBlock.classList.add('hidden');
    }
}

// 🚀 LE VIDEUR STRICT (Option A) : Vérifie si le nom existe déjà sur le Cloud
async function isRaceNameTaken(nameToCheck) {
    try {
        const snapshot = await db.collection('races').where('name', '==', nameToCheck).get();
        return !snapshot.empty;
    } catch (error) {
        console.error("Erreur vérification doublon :", error);
        return false;
    }
}

// 🚀 NOUVEAU : Remplaçant universel des alert() natifs
function showErrorModal(msg) {
    let msgEl = document.getElementById('generic-error-msg');
    let modal = document.getElementById('generic-error-modal');
    if (msgEl && modal) {
        msgEl.innerHTML = msg;
        modal.classList.remove('hidden');
    } else {
        alert(msg); // Sécurité de repli
    }
}

function clearCurrentRaceData() {
    // 🚀 ÉTAPE 0 : ON COUPE LA CONNEXION ET ON ACTIVE LE BOUCLIER INGÉNIEUR (Master Lock)
    if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud = null; }
    isEngineerMode = false;
    toggleObserverMode(true);
    // 🚀 ÉTAPE 1 : ON DÉTRUIT LE CHRONO LOCAL EN SILENCE AVANT TOUT
    if (typeof purgeLocalState === 'function') purgeLocalState();
    currentRaceId = null;
    currentRacePin = null;
    isRaceActive = false;
    localStorage.removeItem('stratefreez-current-race-id');
    localStorage.removeItem('stratefreez-current-race-pin');
    localStorage.setItem('stratefreez-is-race-active', 'false');

    // 🚀 AMNÉSIE CIBLÉE : On vide le brouillon de l'ancienne course
    localStorage.removeItem('stratefreez-form-state');
    localStorage.removeItem('stratefreez-data');

    document.getElementById('form-params').reset();
    document.getElementById('form-tech').reset();
    strategySplits = [];

    // 🚀 AMNÉSIE GLOBALE : Réinitialisation des drapeaux
    isFirstStrategyBuilt = false;
    lastCalculatedState = null;

    // 🚀 ÉTAPE 0.5 : ON TUE LE MESSAGE FLASH LOCAL (Empêche le blocage du bouton en changeant de course)
    isFlashMessageAlive = false;
    clearTimeout(window.flashTimeout);
    let flashOverlay = document.getElementById('flash-alert-overlay');
    if (flashOverlay) flashOverlay.classList.add('hidden');

    // 🚀 FERMETURE DES MENUS FANTÔMES (Onglets 1 & 2)
    toggleSpotters();
    togglePitWindowUI();
    let pt = document.getElementById('personalize-drivers-toggle');
    if (pt) pt.checked = false;
    toggleDriverPersonalization();
    ['T', 'M', 'D', 'I', 'P'].forEach(t => toggleTireOptions(t));

    document.getElementById('num-drivers').value = 1;
    document.getElementById('num-spotters').value = 1;
    document.getElementById('total-splits').value = 1;
    // 🚀 VALEURS PAR DÉFAUT (Carburant)
    let fuelStartInp = document.getElementById('fuel-start');
    if (fuelStartInp) fuelStartInp.value = "100 L";
    let fuelSpeedInp = document.getElementById('fuel-speed');
    if (fuelSpeedInp) fuelSpeedInp.value = "3 L/s";
    if (typeof toggleFuelUI === 'function') toggleFuelUI();

    // 🚀 NETTOYAGE VISUEL : Force la destruction des blocs Pilote 2, 3...
    updateDynamicFields();
    // 🚀 AXE 2 : On s'assure de vider le champ de duplication dans l'onglet Data
    let duplicateInput = document.getElementById('save-config-name');
    if (duplicateInput) duplicateInput.value = '';
    updatePinDisplay();
    updateSnapshotDropdown();
    
    // 🚀 SÉCURITÉ : Aucun nom de course = Mode Viewer par défaut
    isEngineerMode = false;
    toggleObserverMode(true);
}

function openNewRaceModal() {
    let input = document.getElementById('new-race-input');
    if (input) input.value = '';
    let errorMsg = document.getElementById('new-race-error');
    if (errorMsg) {
        errorMsg.innerText = '';
        errorMsg.classList.add('hidden');
    }

    document.getElementById('new-race-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-race-input').focus(), 50);
}

function closeNewRaceModal() {
    document.getElementById('new-race-modal').classList.add('hidden');
}

async function confirmNewRace() {
    let raceName = document.getElementById('new-race-input').value.trim();
    let errorEl = document.getElementById('new-race-error');

    if (!raceName) {
        if (errorEl) { errorEl.innerText = "Veuillez saisir un nom."; errorEl.classList.remove('hidden'); }
        return;
    }

    let isTaken = await isRaceNameTaken(raceName);
    if (isTaken) {
        if (errorEl) { errorEl.innerText = "Ce nom existe déjà sur le Cloud."; errorEl.classList.remove('hidden'); }
        return;
    }

    if (errorEl) errorEl.classList.add('hidden');

    clearCurrentRaceData();
    if (typeof purgeLocalState === 'function') purgeLocalState();

    // 🚀 NAISSANCE LOCALE PURE : L'app génère ses IDs mais n'appelle pas Firebase
    currentRaceId = 'race_' + Date.now();
    // 🚀 FIX BANDEAU : On donne le ticket d'or au créateur de la course
    sessionStorage.setItem('justCreatedRace_' + currentRaceId, 'true');
    currentRacePin = Math.floor(1000 + Math.random() * 9000).toString();
    isRaceActive = true;
    isFirstStrategyBuilt = false; // 🚀 VERROU CLOUD FERMÉ

    localStorage.setItem('stratefreez-current-race-id', currentRaceId);
    localStorage.setItem('stratefreez-current-race-pin', currentRacePin);
    localStorage.setItem('stratefreez-is-race-active', 'true');
    localStorage.setItem(`stratefreez-passport-${currentRaceId}`, 'true');

    closeNewRaceModal();
    document.getElementById('race-name-input').value = raceName;
    syncFileName(raceName);

    updateDynamicFields();
    updatePinDisplay();
    saveFormState();

    isEngineerMode = true;
    toggleObserverMode(false);

    if (typeof checkRequiredFields === 'function') checkRequiredFields();
}

function openJoinRaceModal() {
    document.getElementById('join-race-list-modal').classList.remove('hidden');
    populateJoinRaceList();
}

function closeJoinRaceModal() {
    document.getElementById('join-race-list-modal').classList.add('hidden');
}

async function populateJoinRaceList() {
    const container = document.getElementById('join-race-list-content');
    container.innerHTML = '<div class="text-center p-20 text-grey">⏳ Recherche des courses sur le Cloud...</div>';

    try {
        const snapshot = await db.collection('races').get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="text-center p-20 text-grey">Aucune course dans la base.</div>';
            return;
        }

        let enCours = []; let pretes = []; let terminees = [];

        snapshot.forEach(doc => {
            let data = doc.data();
            if (data.id !== currentRaceId) {
                if (!data.isActive) terminees.push(data);
                else if (data.isTimerRunning) enCours.push(data);
                else pretes.push(data);
            }
        });

        const sortByDate = (a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0);
        enCours.sort(sortByDate); pretes.sort(sortByDate); terminees.sort(sortByDate);

        let html = '';

        if (enCours.length > 0) {
            html += '<div class="race-list-category">En cours</div>';
            enCours.forEach(d => html += `<div class="race-list-item" onclick="triggerSwitchRace('${d.id}', '${d.name.replace(/'/g, "\\'")}')"><span class="material-symbols-outlined text-success mr-10">play_arrow</span> ${d.name}</div>`);
        }
        if (pretes.length > 0) {
            html += '<div class="race-list-category">En préparation</div>';
            pretes.forEach(d => html += `<div class="race-list-item" onclick="triggerSwitchRace('${d.id}', '${d.name.replace(/'/g, "\\'")}')"><span class="material-symbols-outlined text-warning mr-10">pause</span> ${d.name}</div>`);
        }
        if (terminees.length > 0) {
            html += '<div class="race-list-category">Terminées</div>';
            terminees.forEach(d => html += `<div class="race-list-item" onclick="triggerSwitchRace('${d.id}', '${d.name.replace(/'/g, "\\'")}')"><span class="material-symbols-outlined text-danger mr-10">stop</span> ${d.name}</div>`);
        }

        if (html === '') html = '<div class="text-center p-20 text-grey">Aucune autre course disponible.</div>';

        container.innerHTML = html;

    } catch (error) {
        console.error("Erreur Firestore :", error);
        container.innerHTML = '<div class="text-center p-20 text-danger">Erreur de connexion au serveur</div>';
    }
}

function triggerSwitchRace(raceId, raceName = "") {
    if (!raceId) return;

    // Ferme la liste des courses pour laisser place à l'alerte
    closeJoinRaceModal();

    pendingSwitchRaceId = raceId;

    let titleEl = document.getElementById('switch-race-modal-title');
    let descEl = document.getElementById('switch-race-modal-desc');
    let btnEl = document.getElementById('btn-confirm-switch');

    // 🚀 AIGUILLAGE DYNAMIQUE
    if (raceId === 'NEW_SESSION') {
        titleEl.innerText = "⚠️ FERMER LA SESSION";
        descEl.innerHTML = "Êtes-vous sûr de vouloir fermer la session actuelle et retourner à l'accueil vierge ?";
        btnEl.innerText = "FERMER SESSION";
        btnEl.className = "action-btn btn-danger"; // Bouton d'action rouge
    } else {
        titleEl.innerText = "⚠️ CHANGEMENT DE COURSE";
        descEl.innerHTML = `Êtes-vous sûr de vouloir quitter la course actuelle pour charger <strong class="text-warning">${raceName}</strong> ?`;
        btnEl.innerText = "REJOINDRE";
        btnEl.className = "action-btn btn-warning"; // Bouton d'action orange
    }

    document.getElementById('switch-race-modal').classList.remove('hidden');
}

function cancelSwitchRace() {
    pendingSwitchRaceId = null;
    document.getElementById('switch-race-modal').classList.add('hidden');
}

async function confirmSwitchRace() {
    if (!pendingSwitchRaceId) return;

    document.getElementById('switch-race-modal').classList.add('hidden');

    // 🚀 CAS 1 : Fermeture de session pure
    if (pendingSwitchRaceId === 'NEW_SESSION') {
        clearCurrentRaceData();
        if (typeof purgeLocalState === 'function') purgeLocalState();
        openTab('tab-params');
        pendingSwitchRaceId = null;
        return; // Fin du processus
    }

    // 🚀 CAS 2 : Changement de course
    clearCurrentRaceData(); // On purge la course locale actuelle (isEngineerMode devient false ici)

    currentRaceId = pendingSwitchRaceId;
    localStorage.setItem('stratefreez-current-race-id', currentRaceId);

    // SÉCURITÉ : Mode spectateur actif au chargement
    isEngineerMode = false;
    toggleObserverMode(true);

    try {
        const doc = await db.collection('races').doc(currentRaceId).get();
        if (doc.exists) {
            const data = doc.data();

            currentRacePin = data.pin;
            isRaceActive = data.isActive;
            localStorage.setItem('stratefreez-current-race-pin', currentRacePin);
            localStorage.setItem('stratefreez-is-race-active', isRaceActive);

            if (data.strategyData && data.strategyData.length > 0) {
                strategySplits = data.strategyData;
                localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));
            } else {
                strategySplits = [];
                initStrategyData();
            }
            if (data.formState) applyFormStateToDOM(data.formState);

            updatePinDisplay();
            renderStrategy();
            listenToCloudRace();
            navigateToSmartTab();
        } else {
            showErrorModal("Cette course n'existe plus sur le serveur.");
            clearCurrentRaceData();
            openTab('tab-params');
        }
    } catch (e) {
        console.error("Erreur de chargement : ", e);
    }

    pendingSwitchRaceId = null;
}

// 🚀 FONCTION D'ÉCOUTE MAGIQUE (Le Multijoueur)
function listenToCloudRace() {
    if (unsubscribeCloud) unsubscribeCloud();
    if (!currentRaceId) return;

    unsubscribeCloud = db.collection('races').doc(currentRaceId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();

            // 🚀 MISE À JOUR DU VERROU (Le Cerveau Unifié prendra la décision)
            cloudFlashLockUntil = data.flashLockUntil || 0;

            // 1. SÉCURITÉ DE SAISIE (Empêche le clavier de se fermer)
            let activeEl = document.activeElement;
            let isTyping = activeEl && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeEl.tagName);
            // 2. SYNCHRO DU CHRONO 🚀
            let localTimerStr = localStorage.getItem('stratefreez-timer');
            let localTimer = localTimerStr ? JSON.parse(localTimerStr) : null;

            if (data.timerState && data.timerState.active) {
                // Le cloud demande au chrono de tourner
                if (!localTimer || !localTimer.active || localTimer.startTimeReal !== data.timerState.startTimeReal) {
                    localStorage.setItem('stratefreez-timer', JSON.stringify(data.timerState));
                    loadTimerState(); // Relance la boucle de chrono visuel locale
                    updateLiveStandbyState(); // 🚀 FIX 1 : On cache l'écran pour les autres ingénieurs
                }
            } else {
                // Le cloud dit que le chrono est arrêté
                if (localTimer && localTimer.active) {
                    // 🚀 ARRÊT SILENCIEUX (Empêche la boucle infinie avec Firebase)
                    stopTimer(false, true);
                    updateLiveStandbyState(); // 🚀 FIX 1 : On cache l'écran pour les autres ingénieurs
                }
            }
            // 🚀 3 RÉCEPTION DU MESSAGE FLASH
            if (data.flashMessage && data.flashMessage.text) {
                const now = getUnifiedTime();

                // 🚀 FIX : Conversion du Timestamp Firebase en millisecondes
                let msgTime = data.flashMessage.timestamp ?
                    (typeof data.flashMessage.timestamp.toMillis === 'function' ? data.flashMessage.timestamp.toMillis() : data.flashMessage.timestamp)
                    : now;

                const msgAge = now - msgTime;
                const remainingTime = 45000 - msgAge;

                if (remainingTime > 0) {
                    isFlashMessageAlive = true;
                    let overlay = document.getElementById('flash-alert-overlay');
                    let textEl = document.getElementById('flash-alert-text');

                    // 🚀 FIX : On utilise le timestamp unique au lieu du texte pour éviter le bug du F5
                    let lastTime = textEl.dataset.msgTime || "0";
                    if (lastTime !== msgTime.toString()) {
                        textEl.innerText = data.flashMessage.text;
                        textEl.dataset.msgTime = msgTime.toString();
                        overlay.classList.remove('hidden');
                    }

                    // ⏱️ AUTO-FERMETURE LOCALE
                    clearTimeout(window.flashTimeout);
                    window.flashTimeout = setTimeout(() => {
                        isFlashMessageAlive = false;
                        document.getElementById('flash-alert-overlay').classList.add('hidden');
                        document.getElementById('flash-alert-text').innerText = "";
                        evaluateFlashButtonState(); // Force le bouton à revenir

                        // Nettoyage Cloud par l'ingénieur
                        if (isEngineerMode) {
                            db.collection('races').doc(currentRaceId).update({
                                flashMessage: firebase.firestore.FieldValue.delete()
                            }).catch(e => { });
                        }
                    }, remainingTime);

                } else {
                    // Message déjà expiré à l'arrivée
                    isFlashMessageAlive = false;
                    document.getElementById('flash-alert-overlay').classList.add('hidden');
                    if (isEngineerMode) {
                        db.collection('races').doc(currentRaceId).update({
                            flashMessage: firebase.firestore.FieldValue.delete()
                        }).catch(e => { });
                    }
                }
            } else {
                isFlashMessageAlive = false;
                document.getElementById('flash-alert-overlay')?.classList.add('hidden');
            }
            // 🚀 FIX 2 : On appelle le Cerveau Unifié MAINTENANT que le verrou ET le message sont mis à jour
            if (typeof evaluateFlashButtonState === 'function') evaluateFlashButtonState();
            // 4. MISE À JOUR STRATÉGIE (Seulement si on ne tape pas)
            if (data.strategyData && !isTyping) {
                strategySplits = data.strategyData;
                localStorage.setItem('stratefreez-data', JSON.stringify(strategySplits));
                renderStrategy();

                // 🚀 L'ÉTINCELLE VISUELLE : Ordre direct au Live Spotter
                // Si une modif de strat/essence ou un Pit arrive, on force le Live à se redessiner
                // à la milliseconde, sans attendre le prochain tour d'horloge local !
                if (liveTimerActive) {
                    timerTick();
                }
            }

            // 5. MISE À JOUR FORMULAIRES (Seulement si on ne tape pas)
            if (data.formState && !isTyping) {
                applyFormStateToDOM(data.formState);
            }
        } else {
            // 🚀 NOUVEAU : DÉTECTEUR DE COURSE FANTÔME
            // Si la course est supprimée de la base pendant qu'on la regarde (ou au démarrage)
            showErrorModal("Cette course a été supprimée du serveur.<br><br>Vous allez être ramené à l'accueil.");
            clearCurrentRaceData();
            if (typeof purgeLocalState === 'function') purgeLocalState();
            openTab('tab-params');
        }
    });
}

// ==========================================
// --- ONGLET 1 & 2 : FONCTIONS MÉTIER ---
// ==========================================

function togglePitWindowUI() {
    const isEnabled = document.getElementById('enable-pit-window')?.checked;
    const settingsArea = document.getElementById('window-settings-area');
    const raceType = document.getElementById('race-type')?.value;
    const numDrivers = parseInt(document.getElementById('num-drivers')?.value) || 1;

    const isSoloOrOnline = (numDrivers <= 1 || raceType === 'online');

    const cbTiresOnly = document.getElementById('pit-tires-only');
    if (cbTiresOnly) cbTiresOnly.closest('div').classList.toggle('hidden', isSoloOrOnline);

    // 🚀 NOUVELLES LOIS DE L'INTERFACE
    const reqPitsInput = document.getElementById('global-req-pit-stops');
    const reqPitsContainer = document.getElementById('req-pits-container');
    const pitWindowCheckbox = document.getElementById('enable-pit-window');

    if (reqPitsContainer && reqPitsInput && pitWindowCheckbox) {
        // Règle 1 : Masquage total des arrêts obligatoires en IRL Multi
        reqPitsContainer.classList.toggle('hidden', !isSoloOrOnline);

        if (isSoloOrOnline) {
            // 🚀 RÈGLE FRONTEND : Changement de gomme obligatoire = 1 arrêt minimum forcé
            let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
            if (reqTireChange) {
                reqPitsInput.min = "1";
                if (!reqPitsInput.value || parseInt(reqPitsInput.value) === 0) reqPitsInput.value = 1;
            } else {
                reqPitsInput.min = "0";
            }

            let reqPitsVal = parseInt(reqPitsInput.value) || 0;

            // Règle 2 : Fenêtre active -> Arrêts max = 1
            if (isEnabled) {
                reqPitsInput.max = "1";
                if (reqPitsVal > 1) {
                    reqPitsInput.value = 1;
                    if (typeof showErrorModal === 'function') {
                        showErrorModal("La fenêtre de stand limite les arrêts obligatoires à 1 maximum.");
                    }
                }
            } else {
                reqPitsInput.max = "5"; // Débridage
            }

            // Règle 3 : Arrêts >= 2 -> Fenêtre grisée/désactivée
            reqPitsVal = parseInt(reqPitsInput.value) || 0; // Re-lecture
            if (reqPitsVal >= 2) {
                pitWindowCheckbox.disabled = true;
                pitWindowCheckbox.checked = false;
                pitWindowCheckbox.closest('label').style.opacity = "0.5";
                if (settingsArea) settingsArea.classList.add('hidden');
            } else {
                pitWindowCheckbox.disabled = false;
                pitWindowCheckbox.closest('label').style.opacity = "1";
            }
        }
    }

    if (settingsArea && pitWindowCheckbox && !pitWindowCheckbox.disabled) {
        settingsArea.classList.toggle('hidden', !pitWindowCheckbox.checked);
    }

    if (pitWindowCheckbox && pitWindowCheckbox.checked && !pitWindowCheckbox.disabled) {
        document.getElementById('ui-solo-window')?.classList.toggle('hidden', !isSoloOrOnline);
        document.getElementById('ui-multi-window')?.classList.toggle('hidden', isSoloOrOnline);
        if (isSoloOrOnline) updateSoloInputs();
    } else if (pitWindowCheckbox && !pitWindowCheckbox.disabled) {
        // On ne vide les champs que si l'utilisateur a manuellement décoché
        document.querySelectorAll('#window-settings-area input[type="text"], #window-settings-area input[type="number"]').forEach(inp => {
            inp.value = '';
        });
        const modeSwitch = document.getElementById('pit-window-mode-tours');
        if (modeSwitch) modeSwitch.checked = false;
        updateSoloInputs();
    }
}

function updateSoloInputs() {
    const isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
    document.getElementById('pit-window-solo-time')?.classList.toggle('hidden', isLapMode);
    document.getElementById('pit-window-solo-laps')?.classList.toggle('hidden', !isLapMode);
}

function toggleRaceGoal() {
    let goalEl = document.getElementById('race-goal');
    if (!goalEl) return;

    let goal = goalEl.value;
    let isTime = (goal === 'time');

    // 🚀 CORRECTION : Utilisation de tes VRAIS IDs HTML ('-block' au lieu de '-inputs')
    let timeBlock = document.getElementById('goal-time-block');
    if (timeBlock) timeBlock.classList.toggle('hidden', !isTime);

    let lapsBlock = document.getElementById('goal-laps-block');
    if (lapsBlock) lapsBlock.classList.toggle('hidden', isTime);

    // --- NETTOYAGE : On vide les champs de l'option masquée ---
    if (isTime) {
        let lapsInput = document.getElementById('race-laps');
        if (lapsInput) lapsInput.value = '';
    } else {
        // Sécurité maximale : on gère à la fois ton champ unique et les éventuels champs hh/mm
        let durInput = document.getElementById('race-duration');
        let hhInput = document.getElementById('race-duration-hh');
        let mmInput = document.getElementById('race-duration-mm');

        if (durInput) durInput.value = '';
        if (hhInput) hhInput.value = '';
        if (mmInput) mmInput.value = '';
    }

    calculateSplit();
}

function toggleSpotters() {
    const isChecked = document.getElementById('has-spotter').checked;
    document.getElementById('spotters-config').classList.toggle('hidden', !isChecked);
    if (isChecked) updateSpotterNames();
}

function updateSpotterNames() {
    const num = parseInt(document.getElementById('num-spotters')?.value) || 1;
    const container = document.getElementById('spotter-names-container');
    while (container.children.length < num) {
        let i = container.children.length + 1;
        // 🚀 LECTURE DU LOCALSTORAGE POUR GARDER LES NOMS
        let stateStr = localStorage.getItem('stratefreez-form-state');
        let savedVal = "";
        if (stateStr) {
            let state = JSON.parse(stateStr);
            savedVal = state[`spotter-name-input-${i}`] || "";
        }
        container.insertAdjacentHTML('beforeend', `<div class="input-cell"><label class="sub-label">Spotter ${i}</label><input type="text" class="spotter-name" id="spotter-name-input-${i}" value="${savedVal}" placeholder="Nom"></div>`);
    }
    while (container.children.length > num) { container.lastElementChild.remove(); }
}

function updateDynamicFields() {
    const drivers = parseInt(document.getElementById('num-drivers')?.value) || 1;
    const raceType = document.getElementById('race-type')?.value || 'irl';
    let splits = parseInt(document.getElementById('total-splits')?.value) || 1;

    const drvContainer = document.getElementById('driver-names-container');
    while (drvContainer.children.length < drivers) {
        let i = drvContainer.children.length + 1;
        // 🚀 LECTURE DU LOCALSTORAGE POUR GARDER LES NOMS DES PILOTES
        let stateStr = localStorage.getItem('stratefreez-form-state');
        let savedVal = "";
        if (stateStr) {
            let state = JSON.parse(stateStr);
            savedVal = state[`driver-name-input-${i}`] || "";
        }
        drvContainer.insertAdjacentHTML('beforeend', `<div class="input-cell"><label class="sub-label">Pilote ${i}</label><input type="text" class="drv-name" id="driver-name-input-${i}" value="${savedVal}" placeholder="Nom" onchange="syncDriverNameTitle(${i}, this.value)"></div>`);
    }
    while (drvContainer.children.length > drivers) { drvContainer.lastElementChild.remove(); }

    document.getElementById('race-type-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('splits-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('relay-gap-container').classList.toggle('hidden', !(drivers > 1 && raceType === 'online'));

    document.getElementById('driver-rules-block').classList.toggle('hidden', drivers <= 1);
    document.getElementById('max-consecutive-container').classList.toggle('hidden', !(drivers > 1 && raceType === 'irl'));

    document.getElementById('solo-race-block').classList.toggle('hidden', drivers !== 1);
    document.getElementById('calc-split-container').classList.toggle('hidden', drivers <= 1);
    document.getElementById('personalize-drivers-block').classList.toggle('hidden', drivers <= 1);

    if (drivers === 1) {
        let elMandatory = document.getElementById('mandatory-splits'); if (elMandatory) elMandatory.value = '';
        let elMaxCons = document.getElementById('max-consecutive-splits'); if (elMaxCons) elMaxCons.value = '';
        let elGap = document.getElementById('relay-gap'); if (elGap) elGap.value = '';
    } else {
        if (raceType === 'irl') {
            let elGap = document.getElementById('relay-gap'); if (elGap) elGap.value = '';
        } else if (raceType === 'online') {
            let elMaxCons = document.getElementById('max-consecutive-splits'); if (elMaxCons) elMaxCons.value = '';
        }
    }

    let isSolo = (drivers === 1);
    let isOnline = (raceType === 'online');
    // 🚀 LOI N°1 : Verrouillage de l'objectif sur "Temps" pour les courses IRL
    let goalSelect = document.getElementById('race-goal');
    if (goalSelect) {
        let lapsOption = goalSelect.querySelector('option[value="laps"]');
        if (!isSolo && !isOnline) {
            // Course IRL Multi-pilotes : Forcer le temps et désactiver les tours
            if (lapsOption) lapsOption.disabled = true;
            if (goalSelect.value === 'laps') {
                goalSelect.value = 'time';
            }
        } else {
            // Solo ou Online : Laisser le choix
            if (lapsOption) lapsOption.disabled = false;
        }
    }

    let pitWindowCheckbox = document.getElementById('enable-pit-window');
    if (pitWindowCheckbox) {
        let currentMajorMode = (!isSolo && !isOnline) ? 'irl-multi' : 'other';
        if (pitWindowCheckbox.dataset.lastMode !== currentMajorMode) {
            pitWindowCheckbox.checked = (currentMajorMode === 'irl-multi');
            pitWindowCheckbox.dataset.lastMode = currentMajorMode;
        }
    }

    togglePitWindowUI();

    const soloLines = document.querySelectorAll('.hide-on-solo');
    soloLines.forEach(line => line.classList.toggle('hidden', drivers === 1));

    const termPlural = (raceType === 'online') ? 'relais' : 'splits';
    const termPluralCap = (raceType === 'online') ? 'Relais' : 'Splits';

    let lblMandatory = document.getElementById('lbl-mandatory-splits');
    if (lblMandatory) {
        lblMandatory.innerText = `${termPluralCap} obligatoires par pilote`;
    }

    const mandatoryInput = document.getElementById('mandatory-splits');
    if (mandatoryInput && splits > 1 && mandatoryInput.dataset.touched !== 'true') {
        mandatoryInput.value = Math.floor(splits / drivers);
    }

    if (drivers === 1) {
        splits = 1;
        if (document.getElementById('total-splits')) document.getElementById('total-splits').value = 1;
        document.getElementById('drivers-tech-fieldset').classList.add('hidden');
        let pt = document.getElementById('personalize-drivers-toggle');
        if (pt) { pt.checked = false; toggleDriverPersonalization(); }
    } else {
        document.getElementById('label-total-splits').innerText = `En combien de ${termPlural}`;
        document.querySelectorAll('.lbl-tire-full').forEach(el => {
            el.innerText = `Obligation en ${termPlural} complets ?`;
        });
    }

    let termSingle = (raceType === 'online') ? 'relais' : 'split';
    if (document.getElementById('text-split-calc')) {
        document.getElementById('text-split-calc').innerText = termSingle;
    }

    const timeContainer = document.getElementById('start-time-container');
    let neededTimes = (drivers === 1 || raceType === 'irl') ? 1 : splits;
    const term = (raceType === 'online') ? 'Relais' : 'Split';

    while (timeContainer.children.length < neededTimes) {
        let i = timeContainer.children.length + 1;
        let labelText = (neededTimes === 1) ? "Heure de départ prévue" : `Départ ${term} ${i}`;
        timeContainer.insertAdjacentHTML('beforeend', `<div class="time-input-wrapper input-cell"><label>${labelText}</label><input type="text" class="format-hhmm dyn-time base-start-time" id="start-time-${i}" placeholder="HH:MM" onchange="autoFillStartTimes()"></div>`);
    }
    while (timeContainer.children.length > neededTimes) { timeContainer.lastElementChild.remove(); }

    Array.from(timeContainer.children).forEach((child, index) => {
        let label = child.querySelector('label');
        if (label) label.innerText = (neededTimes === 1) ? "Heure de départ prévue" : `Départ ${term} ${index + 1}`;
    });

    // 🚀 FIX : Force la resynchronisation visuelle de l'objectif (Temps vs Tours)
    if (typeof toggleRaceGoal === 'function') toggleRaceGoal();

    // 🚀 AUTO-REMPLISSAGE : Les valeurs par défaut intelligentes (Règles 1 et 2)
    if (!isSolo) {
        let totalSplitsEl = document.getElementById('total-splits');
        let mandatorySplitsEl = document.getElementById('mandatory-splits');
        let currentDrivers = parseInt(document.getElementById('num-drivers')?.value) || 1;

        // Règle 1 : Total de relais par défaut = nombre de pilotes
        if (totalSplitsEl && !totalSplitsEl.dataset.touched) {
            totalSplitsEl.value = currentDrivers;
        }

        // Règle 2 : Relais obligatoires par défaut = Total / Nombre de pilotes
        if (mandatorySplitsEl && !mandatorySplitsEl.dataset.touched) {
            let total = parseInt(totalSplitsEl.value) || currentDrivers;
            mandatorySplitsEl.value = Math.max(1, Math.floor(total / currentDrivers));
        }
    }

    updateTechDrivers(drivers);
    syncTiresVisibility();
    applyFormatters();
    calculateSplit();
}

function autoFillStartTimes() {
    let raceType = document.getElementById('race-type')?.value;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;

    if (raceType !== 'online' || drivers <= 1 || splitsCount <= 1) return;

    let baseSec = timeStringToSeconds(document.getElementById('start-time-1')?.value || "00:00");
    let gapMin = parseInt(document.getElementById('relay-gap')?.value) || 0;
    let gapSec = gapMin * 60000; // 🚀 MS (60 * 1000)
    let splitDurSec = getRaceDurationSeconds() / splitsCount;

    for (let i = 1; i < splitsCount; i++) {
        let s = baseSec + (i * splitDurSec) + (i * gapSec);
        let realSec = Math.round(s / 1000); // 🚀 Affichage
        let h = String(Math.floor(realSec / 3600) % 24).padStart(2, '0');
        let m = String(Math.floor((realSec % 3600) / 60)).padStart(2, '0');
        let el = document.getElementById(`start-time-${i + 1}`);
        if (el) { el.value = `${h}:${m}`; el.dataset.formatted = "true"; }
    }
    renderStrategy();
}

// 🚀 REPARATION DU CRASH SILENCIEUX QUI BLOQUAIT LA RESTAURATION !
function getRaceDurationSeconds() {
    let hhEl = document.getElementById('race-duration-hh');
    let mmEl = document.getElementById('race-duration-mm');

    if (hhEl || mmEl) {
        let hh = parseInt(hhEl?.value) || 0;
        let mm = parseInt(mmEl?.value) || 0;
        if (hh > 0 || mm > 0) {
            return ((hh * 3600) + (mm * 60)) * 1000; // 🚀 MS
        }
    }

    // Au cas où l'ancien champ unique existe encore (Lecture Blindée)
    let val = document.getElementById('race-duration')?.value?.replace(/\D/g, '') || "";
    if (val.length >= 3) {
        let m = parseInt(val.slice(-2)) || 0;
        let h = parseInt(val.slice(0, -2)) || 0;
        return (h * 3600 + m * 60) * 1000; // 🚀 MS
    } else if (val.length > 0) {
        return parseInt(val) * 3600000; // 🚀 MS (3600 * 1000)
    }
    return 0;
}

function calculateSplit() {
    const splits = parseInt(document.getElementById('total-splits')?.value) || 1;
    const goal = document.getElementById('race-goal')?.value;
    const resultSpan = document.getElementById('calc-split-duration');
    if (!resultSpan) return;

    if (goal === 'time') {
        let totalSeconds = getRaceDurationSeconds(); // 🚀 En MS
        if (totalSeconds > 0) {
            let exact = totalSeconds / splits;
            let realSec = Math.round(exact / 1000); // 🚀 Affichage
            let h = String(Math.floor(realSec / 3600)).padStart(2, '0');
            let m = String(Math.floor((realSec % 3600) / 60)).padStart(2, '0');
            let s = String(Math.floor(realSec % 60)).padStart(2, '0');
            if (!Number.isInteger(exact / 1000)) { resultSpan.innerHTML = `${h}:${m}:${s} <span class="alert-text">⚠️ Ne tombe pas juste !</span>`; }
            else { resultSpan.innerText = `${h}:${m}:${s}`; }
        } else { resultSpan.innerText = "..."; }
        autoFillStartTimes();
    } else {
        const laps = parseInt(document.getElementById('race-laps')?.value);
        if (laps > 0) {
            let exact = laps / splits;
            if (!Number.isInteger(exact)) { resultSpan.innerHTML = `${Math.floor(exact)} tours <span class="alert-text">⚠️ Reste ${laps % splits} tour(s) non divisible(s) !</span>`; }
            else { resultSpan.innerText = `${exact} tours`; }
        } else { resultSpan.innerText = "..."; }
    }
}

function syncDriverNameTitle(index, val) {
    const title = document.getElementById(`driver-card-title-${index}`);
    if (title) title.innerText = val || `Pilote ${index}`;
}

function toggleDriverPersonalization() {
    const isChecked = document.getElementById('personalize-drivers-toggle')?.checked;
    const fieldset = document.getElementById('drivers-tech-fieldset');
    if (fieldset) {
        fieldset.classList.toggle('hidden', !isChecked);
        if (isChecked) {
            ['eco', 'push'].forEach(f => {
                let gVal = document.getElementById(`cons-${f}`)?.value;
                if (gVal) { document.querySelectorAll(`.driver-fuel-${f}`).forEach(inp => { if (!inp.value) inp.value = gVal; }); }
            });
            ['T', 'M', 'D', 'I', 'P'].forEach(t => {
                let gPush = document.getElementById(`global-time-push-${t}`)?.value;
                let gEco = document.getElementById(`global-time-eco-${t}`)?.value;
                let gLife = document.getElementById(`global-life-${t}`)?.value;
                if (gPush) { document.querySelectorAll(`.driver-lap-time-push[data-tire="${t}"]`).forEach(inp => { if (!inp.value) { inp.value = gPush; inp.dispatchEvent(new Event('blur')); } }); }
                if (gEco) { document.querySelectorAll(`.driver-lap-time-eco[data-tire="${t}"]`).forEach(inp => { if (!inp.value) { inp.value = gEco; inp.dispatchEvent(new Event('blur')); } }); }
                if (gLife) { document.querySelectorAll(`.driver-tire-life[data-tire="${t}"]`).forEach(inp => { if (!inp.value) inp.value = gLife; }); }
            });
        } else {
            document.querySelectorAll('#drivers-tech-container input').forEach(inp => { inp.value = ''; });
        }
    }
}

function updateTechDrivers(numDrivers) {
    const container = document.getElementById('drivers-tech-container');
    if (!container) return;

    while (container.children.length < numDrivers) {
        let i = container.children.length + 1;
        const name = document.getElementById(`driver-name-input-${i}`)?.value || `Pilote ${i}`;
        container.insertAdjacentHTML('beforeend', generateDriverCardHTML(i, name));
    }
    while (container.children.length > numDrivers) { container.lastElementChild.remove(); }
    applyFormatters();
    applyMobileNumericKeypad(); // 🚀 MET À JOUR LES NOUVEAUX CHAMPS PILOTES
}

function generateDriverCardHTML(index, name) {
    return `
        <div class="driver-tech-card" id="driver-card-${index}">
            <h4 id="driver-card-title-${index}">${name}</h4>
            <div class="multi-input-group tire-row mb-10">
                <div class="tire-label"><strong>Carburant</strong></div>
                <div class="input-cell"><label class="sub-label">Conso Attack</label><input type="text" id="drv-${index}-fuel-push" class="format-lpt sync-driver-fuel driver-fuel-push" data-fuel="push" placeholder="L/t"></div>
                <div class="input-cell"><label class="sub-label">Conso Éco</label><input type="text" id="drv-${index}-fuel-eco" class="format-lpt sync-driver-fuel driver-fuel-eco" data-fuel="eco" placeholder="L/t"></div>
            </div>
            <div class="driver-tires-container">
                <div class="multi-input-group tire-row driver-tire-T hidden"><div class="tire-label"><strong>Tendres (T)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-T" class="format-mss000 driver-lap-time-push" data-tire="T" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-T" class="format-mss000 driver-lap-time-eco" data-tire="T" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-T" class="driver-tire-life" data-tire="T" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-M hidden"><div class="tire-label"><strong>Mediums (M)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-M" class="format-mss000 driver-lap-time-push" data-tire="M" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-M" class="format-mss000 driver-lap-time-eco" data-tire="M" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-M" class="driver-tire-life" data-tire="M" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-D hidden"><div class="tire-label"><strong>Durs (D)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-D" class="format-mss000 driver-lap-time-push" data-tire="D" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-D" class="format-mss000 driver-lap-time-eco" data-tire="D" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-D" class="driver-tire-life" data-tire="D" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-I hidden"><div class="tire-label"><strong>Inter. (I)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-I" class="format-mss000 driver-lap-time-push" data-tire="I" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-I" class="format-mss000 driver-lap-time-eco" data-tire="I" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-I" class="driver-tire-life" data-tire="I" placeholder="Nb Tours"></div></div>
                <div class="multi-input-group tire-row driver-tire-P hidden"><div class="tire-label"><strong>Pluie (P)</strong></div><div class="input-cell"><label class="sub-label">Chrono ATTACK</label><input type="text" id="drv-${index}-time-push-P" class="format-mss000 driver-lap-time-push" data-tire="P" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Chrono ÉCO</label><input type="text" id="drv-${index}-time-eco-P" class="format-mss000 driver-lap-time-eco" data-tire="P" placeholder="MM:SS.000"></div><div class="input-cell"><label class="sub-label">Durée de vie</label><input type="number" id="drv-${index}-life-P" class="driver-tire-life" data-tire="P" placeholder="Nb Tours"></div></div>
            </div>
        </div>
    `;
}

function toggleTireOptions(id) {
    const isChecked = document.getElementById(`use-${id}`)?.checked;
    document.getElementById(`options-${id}`).classList.toggle('hidden', !isChecked);

    if (!isChecked) {
        document.querySelectorAll(`#options-${id} input`).forEach(inp => {
            if (inp.type === 'checkbox') inp.checked = false;
            else { inp.value = ''; handleTireValue(inp); }
        });

        // 🚀 LE NETTOYEUR : Modification à la source
        let availableTires = getAvailableTires();
        let fallbackTire = availableTires.length > 0 ? availableTires[0] : 'T';
        let hasGhostTires = false;

        if (strategySplits && strategySplits.length > 0) {
            strategySplits.forEach(split => {
                split.stints.forEach(stint => {
                    if (stint.tire === id) {
                        stint.tire = fallbackTire;
                        hasGhostTires = true;
                    }
                });
            });

            if (hasGhostTires) {
                cascadeFixPitWindows();
                saveFormState();
                if (!document.getElementById('tab-strategy').classList.contains('hidden')) {
                    renderStrategy();
                }
                triggerCloudSync();
            }
        }
    }
    syncTiresVisibility();
    applyMobileNumericKeypad();
}

// 🚀 SÉCURITÉ ABSOLUE : On vérifie si l'élément parent existe pour ne pas faire crasher le script
function handleTireCondition(cb) {
    if (!cb) return;
    let parent = cb.closest('.tire-condition');
    if (parent) {
        let input = parent.querySelector('.cond-val');
        if (input) {
            if (cb.checked && !input.value) input.value = 1;
            else if (!cb.checked) input.value = '';
        }
    }
}

function handleTireValue(input) {
    if (!input) return;
    let parent = input.closest('.tire-condition');
    if (parent) {
        let cb = parent.querySelector('.cond-check');
        if (cb) cb.checked = (input.value !== '' && parseFloat(input.value) > 0);
    }
}

function syncTiresVisibility() {
    const tires = ['T', 'M', 'D', 'I', 'P'];
    let anyChecked = false;
    tires.forEach(t => {
        const checked = document.getElementById(`use-${t}`)?.checked;
        if (checked) anyChecked = true;
        if (document.getElementById(`global-tire-${t}`)) document.getElementById(`global-tire-${t}`).classList.toggle('hidden', !checked);
        document.querySelectorAll(`.driver-tire-${t}`).forEach(row => row.classList.toggle('hidden', !checked));
    });
    if (document.getElementById('no-tire-warning')) document.getElementById('no-tire-warning').classList.toggle('hidden', anyChecked);
}
// 🚀 NOUVELLE FONCTION : Gestion de l'interface Carburant
function toggleFuelUI() {
    let fuelStartStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    let initialFuel = fuelStartStr ? parseFloat(fuelStartStr) : 0;
    let isFuelEnabled = (initialFuel > 0);

    let speed = document.getElementById('fuel-speed');
    let reserve = document.getElementById('fuel-reserve');
    let consPush = document.getElementById('cons-push');
    let consEco = document.getElementById('cons-eco');
    let drvInputs = Array.from(document.querySelectorAll('.sync-driver-fuel'));

    let targets = [speed, reserve, consPush, consEco, ...drvInputs].filter(el => el !== null);

    targets.forEach(inp => {
        if (!isFuelEnabled) {
            if (!inp.dataset.originalPlaceholder) inp.dataset.originalPlaceholder = inp.placeholder;
            inp.value = '';
            inp.placeholder = "Sans conso";
            inp.disabled = true;
            inp.style.opacity = "0.5";
        } else {
            inp.disabled = false;
            inp.style.opacity = "1";
            if (inp.dataset.originalPlaceholder) inp.placeholder = inp.dataset.originalPlaceholder;
        }
    });
}
function applyFormatters() {
    document.querySelectorAll('.format-hhmm:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(/\D/g, '');
            if (val.length >= 3) {
                let m = val.slice(-2);
                let h = val.slice(0, -2).padStart(2, '0');
                this.value = `${h}:${m}`;
            } else if (val.length > 0) {
                this.value = `${val.padStart(2, '0')}:00`;
            }
        });
        input.addEventListener('focus', function () { this.value = this.value.replace(/:/g, ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-liters:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(/[^\d.]/g, ''); if (val !== '' && !isNaN(parseFloat(val))) this.value = parseFloat(val) + " L"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-lps:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(',', '.'); if (val !== '' && !isNaN(parseFloat(val))) this.value = parseFloat(val) + " L/s"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L/s', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-lpt:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () { let val = this.value.replace(',', '.'); if (val !== '' && !isNaN(parseFloat(val))) this.value = parseFloat(val) + " L/t"; });
        input.addEventListener('focus', function () { this.value = this.value.replace(' L/t', ''); });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-sec:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(',', '.');
            let match = val.match(/(\d+(\.\d+)?)/);
            if (match) {
                this.value = match[0] + " s";
            }
        });
        input.addEventListener('focus', function () {
            this.value = this.value.replace(' s', '');
        });
        input.dataset.formatted = "true";
    });
    document.querySelectorAll('.format-mss000:not([data-formatted])').forEach(input => {
        input.addEventListener('blur', function () {
            let val = this.value.replace(/\D/g, '');
            if (val.length >= 4) {
                let ms = val.slice(-3); let s = val.slice(-5, -3).padStart(2, '0'); let m = val.slice(0, -5) || '0';
                this.value = `${m}:${s}.${ms}`;
            }
        });
        input.addEventListener('focus', function () { this.value = this.value.replace(/[:.]/g, ''); });
        input.dataset.formatted = "true";
    });
}

// ==========================================
// --- LE POSTE DE DOUANE (Smart Threshold Onglet 2) ---
// ==========================================

function handleTechFormFocus(e) {
    let input = e.target;
    if (input.tagName === 'INPUT' && (input.type === 'text' || input.type === 'number')) {
        let isTime = input.classList.contains('format-mss000');
        let isFuel = input.classList.contains('format-lpt') || input.id.includes('fuel-') || input.id.includes('cons-');
        let isLife = input.classList.contains('global-tire-life') || input.classList.contains('driver-tire-life') || input.id.includes('life-');

        techInputMemory = {
            id: input.id,
            rawValue: input.value,
            parsedValue: parseTechValue(input.value, isTime, isFuel, isLife)
        };
    }
}

function handleTechFormChange(e) {
    if (!isEngineerMode) return;

    let input = e.target;
    // On laisse passer tout ce qui n'est pas un champ de saisie direct (ex: les cases à cocher)
    if (input.tagName !== 'INPUT' || input.type === 'checkbox') {
        processGlobalDataChange();
        return;
    }

    // RÈGLE A : Le tableau doit être construit, sinon feu vert direct.
    if (!isFirstStrategyBuilt) {
        applyGlobalTechSync(input);
        processGlobalDataChange();
        return;
    }

    // RÈGLE A (Suite) : L'ancienne valeur doit exister et être > 0 (Pas de punition sur une case vierge)
    if (!techInputMemory || techInputMemory.id !== input.id || techInputMemory.parsedValue === 0) {
        applyGlobalTechSync(input);
        processGlobalDataChange();
        return;
    }

    let isTime = input.classList.contains('format-mss000');
    let isFuel = input.classList.contains('format-lpt') || input.id.includes('fuel-') || input.id.includes('cons-');
    let isLife = input.classList.contains('global-tire-life') || input.classList.contains('driver-tire-life') || input.id.includes('life-');

    let oldVal = techInputMemory.parsedValue;
    let newVal = parseTechValue(input.value, isTime, isFuel, isLife);

    // RÈGLE B : Évaluation du Juge
    let isExceeded = false;
    if (isTime) {
        if (Math.abs(newVal - oldVal) > 5000) isExceeded = true; // Tolérance : +/- 5 secondes (5000 ms)
    } else if (isFuel) {
        if (Math.abs(newVal - oldVal) > 1.0) isExceeded = true; // Tolérance : +/- 1.0 L/t
    } else if (isLife) {
        if (Math.abs(newVal - oldVal) > 2) isExceeded = true; // Tolérance : +/- 2 tours
    }

    if (isExceeded) {
        // 🔴 MISE EN QUARANTAINE
        pendingTechChange = {
            input: input,
            oldRawValue: techInputMemory.rawValue
        };
        openSmartThresholdModal();
    } else {
        // 🟢 FEU VERT INSTANTANÉ
        applyGlobalTechSync(input);
        processGlobalDataChange();
    }
}

function parseTechValue(valStr, isTime, isFuel, isLife) {
    if (!valStr) return 0;
    if (isTime) {
        if (valStr.includes(':')) {
            let parts = valStr.split(':');
            if (parts.length === 2) return (parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
            if (parts.length === 3) return (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])) * 1000;
        }
        let val = valStr.replace(/\D/g, '');
        if (val.length >= 4) {
            let ms = parseInt(val.slice(-3)) || 0;
            let s = parseInt(val.slice(-5, -3)) || 0;
            let m = parseInt(val.slice(0, -5)) || 0;
            return (m * 60 + s) * 1000 + ms;
        }
        return 0;
    }
    if (isFuel) return parseFloat(valStr.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    if (isLife) return parseInt(valStr.replace(/\D/g, '')) || 0;
    return 0;
}

function applyGlobalTechSync(input) {
    let id = input.id;
    let val = input.value;

    ['eco', 'push'].forEach(f => {
        if (id === `cons-${f}`) document.querySelectorAll(`.driver-fuel-${f}`).forEach(drv => { drv.value = val; });
    });
    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        if (id === `global-time-push-${t}`) document.querySelectorAll(`.driver-lap-time-push[data-tire="${t}"]`).forEach(drv => { drv.value = val; });
        if (id === `global-time-eco-${t}`) document.querySelectorAll(`.driver-lap-time-eco[data-tire="${t}"]`).forEach(drv => { drv.value = val; });
        if (id === `global-life-${t}`) document.querySelectorAll(`.driver-tire-life[data-tire="${t}"]`).forEach(drv => { drv.value = val; });
    });
}

function openSmartThresholdModal() {
    let modal = document.getElementById('smart-threshold-modal');
    let countdownEl = document.getElementById('smart-threshold-countdown');
    modal.classList.remove('hidden');

    let timeLeft = 45;
    countdownEl.innerText = `(${timeLeft}s)`;

    clearInterval(techWatchdogTimer);
    techWatchdogTimer = setInterval(() => {
        timeLeft--;
        countdownEl.innerText = `(${timeLeft}s)`;
        if (timeLeft <= 0) {
            cancelSmartThreshold();
        }
    }, 1000);
}

function cancelSmartThreshold() {
    clearInterval(techWatchdogTimer);
    document.getElementById('smart-threshold-modal').classList.add('hidden');

    if (pendingTechChange) {
        pendingTechChange.input.value = pendingTechChange.oldRawValue;

        // 🚀 FIX VISUEL : On simule une sortie de case pour forcer le re-formatage (132000 -> 01:32.000)
        pendingTechChange.input.dispatchEvent(new Event('blur'));

        // 🚀 FIX SÉCURITÉ : On relance le moteur sur l'ancienne valeur pour purger la donnée aberrante de la mémoire
        processGlobalDataChange();

        pendingTechChange = null;
    }
}

function confirmSmartThreshold() {
    clearInterval(techWatchdogTimer);
    document.getElementById('smart-threshold-modal').classList.add('hidden');

    if (pendingTechChange) {
        // 🚀 VOTRE IDÉE (Le Fix Visuel) : On simule la sortie de case pour forcer le formateur à remettre les ":"
        pendingTechChange.input.dispatchEvent(new Event('blur'));
        applyGlobalTechSync(pendingTechChange.input);
        processGlobalDataChange(); // Lancement manuel de la sauvegarde
        // 🚀 MISE À JOUR DE LA MÉMOIRE : On dit au Juge que cette nouvelle valeur extrême est désormais la norme
        // (Pour éviter qu'il ne re-déclenche si on reclique dans la case juste après)
        if (techInputMemory) {
            techInputMemory.rawValue = pendingTechChange.input.value;
            let isTime = pendingTechChange.input.classList.contains('format-mss000');
            let isFuel = pendingTechChange.input.classList.contains('format-lpt') || pendingTechChange.input.id.includes('fuel-') || pendingTechChange.input.id.includes('cons-');
            let isLife = pendingTechChange.input.classList.contains('global-tire-life') || pendingTechChange.input.classList.contains('driver-tire-life') || pendingTechChange.input.id.includes('life-');
            techInputMemory.parsedValue = parseTechValue(pendingTechChange.input.value, isTime, isFuel, isLife);
        }

        pendingTechChange = null;
    }
}

// ==========================================
// --- MOTEUR LIVE TIMING & SPOTTER (requestAnimationFrame) ---
// ==========================================

// ==========================================
// --- MOTEUR LIVE TIMING & SPOTTER (requestAnimationFrame) ---
// ==========================================

function startLiveTimer(splitIdx) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    if (liveTimerActive) return; // 🚀 PROTECTION ANTI DOUBLE-CLIC

    // 🛡️ PRE-FLIGHT CHECK (Vérification vitale avant départ)
    let tires = getAvailableTires();
    let goal = document.getElementById('race-goal')?.value;
    let totalSecRace = getRaceDurationSeconds();
    let hasLaps = document.getElementById('race-laps')?.value;

    if (tires.length === 0) {
        return showErrorModal("DÉPART IMPOSSIBLE : Vous devez déclarer au moins 1 type de gomme dans l'onglet Technique.");
    }
    if (goal === 'time' && totalSecRace <= 0) {
        return showErrorModal("DÉPART IMPOSSIBLE : La durée de la course n'est pas définie ou est à zéro.");
    }
    if (goal === 'laps' && (!hasLaps || parseInt(hasLaps) <= 0)) {
        return showErrorModal("DÉPART IMPOSSIBLE : Le nombre de tours de la course n'est pas défini.");
    }

    let raceType = document.getElementById('race-type')?.value || 'irl';
    let isOnline = (raceType === 'online');

    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let splitDurSec = totalSecRace / splitsCount;

    let targetSec = (goal === 'laps') ? Infinity : (isOnline ? splitDurSec : totalSecRace);

    let now = new Date();
    let h = String(now.getHours()).padStart(2, '0');
    let m = String(now.getMinutes()).padStart(2, '0');

    let idToUpdate = isOnline ? `start-time-${splitIdx + 1}` : `start-time-1`;
    let el = document.getElementById(idToUpdate);
    if (el) {
        el.value = `${h}:${m}`;
        el.dataset.formatted = "true";
    }

    autoFillStartTimes();

    let timerState = {
        active: true,
        type: isOnline ? 'online' : 'irl',
        splitIdx: splitIdx,
        targetSec: targetSec,
        startTimeReal: getUnifiedTime() // 🚀 UTILISATION DE L'HEURE ATOMIQUE
    };
    localStorage.setItem('stratefreez-timer', JSON.stringify(timerState));

    runTimerLoop();             // 1. On allume le moteur en premier (liveTimerActive devient true)
    updateLiveStandbyState();   // 2. Maintenant l'écran voit que ça tourne et se cache !
    saveFormState();
    renderStrategy();

    // 🚀 NOUVEAU : On court-circuite l'attente de 800ms pour envoyer le chrono IMMÉDIATEMENT au Cloud
    // Cela empêche le rafraîchissement local d'écraser le chrono avant qu'il ne soit sauvegardé !
    if (currentRaceId && isRaceActive) {
        db.collection('races').doc(currentRaceId).update({
            timerState: timerState,
            isTimerRunning: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(e => console.error("Erreur synchro chrono :", e));
    }
}

function runTimerLoop() {
    liveTimerActive = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // On retire le "timestamp" capricieux de l'écran
    function loop() {
        if (!liveTimerActive) return;

        // 🚀 On utilise notre propre horloge implacable
        let now = getUnifiedTime();

        if (now - lastTimerTick >= 1000) {
            timerTick();
            // L'astuce magique : On "clipe" (snap) le tic sur la seconde ronde. 
            // Finie la dérive, même si le processeur du mobile s'endort !
            lastTimerTick = now - (now % 1000);
        }
        animationFrameId = requestAnimationFrame(loop);
    }
    animationFrameId = requestAnimationFrame(loop);
}

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && liveTimerActive) {
        timerTick();
    }
});

function timerTick() {
    let str = localStorage.getItem('stratefreez-timer');
    if (!str) return;
    let timerState = JSON.parse(str);
    if (!timerState || !timerState.active) return;

    // 🚀 L'horloge tourne en MILLISECONDES pures !
    let elapsed = getUnifiedTime() - timerState.startTimeReal;
    let targetSec = timerState.targetSec; // 🚀 Déjà en ms
    let isOvertime = Math.round(elapsed / 1000) >= Math.round(targetSec / 1000); // 🚀 Le Juge Arrondi

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        let realElapsed = Math.round(elapsed / 1000); // 🚀 Affichage
        let eh = String(Math.floor(realElapsed / 3600)).padStart(2, '0');
        let em = String(Math.floor((realElapsed % 3600) / 60)).padStart(2, '0');
        let es = String(Math.floor(realElapsed % 60)).padStart(2, '0');
        navTitle.innerText = `${eh}:${em}:${es}`;
        navTitle.className = 'nav-brand chrono-active';
        if (isOvertime) navTitle.classList.add('text-danger');
    }

    // 🚀 3 minutes de marge = 180 000 ms
    if (elapsed >= targetSec + 180000) {
        if (timerState.type === 'online') {
            if (strategySplits[timerState.splitIdx]) strategySplits[timerState.splitIdx].isFinished = true;
        } else {
            strategySplits.forEach(s => s.isFinished = true);
        }
        saveFormState();
        stopTimer(true);
        return;
    }

    let firstUnpitted = null;
    for (let i = 0; i < strategySplits.length; i++) {
        if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpitted = { i, j, stint: strategySplits[i].stints[j] };
                break;
            }
        }
        if (firstUnpitted) break;
    }

    document.querySelectorAll('.active-live-stint').forEach(el => el.classList.remove('active-live-stint'));

    if (firstUnpitted && firstUnpitted.stint.startSec !== undefined) {
        let tr = document.querySelector(`tr[data-stint="${firstUnpitted.i}-${firstUnpitted.j}"]`);
        if (tr) tr.classList.add('active-live-stint');

        // 🚀 Auto Pit (Buffer = 300 000 ms)
        if (elapsed >= firstUnpitted.stint.endSec + 180000 && !isOvertime) {
            strategySplits[firstUnpitted.i].stints[firstUnpitted.j].isPitted = true;
            strategySplits[firstUnpitted.i].stints[firstUnpitted.j].lockedTimeSec = firstUnpitted.stint.endSec;
            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
            return;
        }
    }

    updateLiveSpotter(elapsed, timerState);

    // 🚀 Met à jour l'apparition/disparition du bouton Flash
    evaluateFlashButtonState();
}
function processGlobalDataChange() {
    if (!isEngineerMode) return; // 🚀 CORRECTION : Utilise la vraie variable

    saveFormState(); // A. Sauvegarde Locale

    if (isFirstStrategyBuilt && checkRequiredFields().isValid) {
        if (typeof cascadeFixPitWindows === 'function') cascadeFixPitWindows();
        renderStrategy(); // B. Calcul & Affichage
        triggerCloudSync(); // C. Envoi global propre
    }
}
function updateLiveSpotter(elapsed, timerState) {
    const offlineMsg = document.getElementById('live-offline-msg');
    const dashboard = document.getElementById('live-dashboard');

    if (!timerState || !timerState.active) {
        if (offlineMsg) offlineMsg.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
        return;
    }

    let activeStint = null; let nextStint = null; let nextStintDriver = null;
    let firstUnpittedI = -1; let firstUnpittedJ = -1;

    for (let i = 0; i < strategySplits.length; i++) {
        if (timerState.type === 'online' && i !== timerState.splitIdx) continue;
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpittedI = i; firstUnpittedJ = j; break;
            }
        }
        if (firstUnpittedI !== -1) break;
    }

    let pitBufferStint = null;

    if (firstUnpittedI !== -1) {
        let prevI = firstUnpittedI; let prevJ = firstUnpittedJ - 1;
        if (prevJ < 0) {
            prevI--;
            if (prevI >= 0 && timerState.type !== 'online') prevJ = strategySplits[prevI].stints.length - 1;
        }
        if (prevI >= 0 && prevJ >= 0) {
            let pStint = strategySplits[prevI].stints[prevJ];
            if (pStint.isPitted && pStint.lockedTimeSec !== null && !pStint.pitExitForced) {
                let timeSincePit = elapsed - pStint.lockedTimeSec;
                let pitDuration = pStint.nextPitTime || 0;
                let isVeryLast = (timerState.type === 'online') ?
                    (prevJ === strategySplits[prevI].stints.length - 1) :
                    (prevI === strategySplits.length - 1 && prevJ === strategySplits[prevI].stints.length - 1);

                if (!isVeryLast && timeSincePit < pitDuration + 5000) { // 🚀 5000 ms
                    pitBufferStint = pStint;
                    pitBufferStint.splitIdx = prevI; pitBufferStint.stintIdx = prevJ;
                    pitBufferStint.driverName = strategySplits[prevI].driver;
                    pitBufferStint.timeSincePit = timeSincePit;
                }
            }
        }
    }

    let isPitBufferMode = (pitBufferStint !== null);

    if (isPitBufferMode) {
        activeStint = pitBufferStint;
        nextStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ];
        nextStintDriver = strategySplits[firstUnpittedI].driver;
    } else {
        if (firstUnpittedI !== -1) {
            activeStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ];
            activeStint.splitIdx = firstUnpittedI; activeStint.stintIdx = firstUnpittedJ;
            activeStint.driverName = strategySplits[firstUnpittedI].driver;

            if (firstUnpittedJ + 1 < strategySplits[firstUnpittedI].stints.length) {
                nextStint = strategySplits[firstUnpittedI].stints[firstUnpittedJ + 1];
                nextStint.splitIdx = firstUnpittedI; nextStint.stintIdx = firstUnpittedJ + 1;
                nextStintDriver = strategySplits[firstUnpittedI].driver;
            } else if (firstUnpittedI + 1 < strategySplits.length && timerState.type !== 'online') {
                nextStint = strategySplits[firstUnpittedI + 1].stints[0];
                nextStint.splitIdx = firstUnpittedI + 1; nextStint.stintIdx = 0;
                nextStintDriver = strategySplits[firstUnpittedI + 1].driver;
            }
        }
    }

    if (activeStint && activeStint.startSec !== undefined) {
        if (offlineMsg) offlineMsg.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');

        let driverEl = document.getElementById('live-driver'); if (driverEl) driverEl.innerText = activeStint.driverName;
        let tireEl = document.getElementById('live-tire'); if (tireEl) tireEl.innerHTML = `<span class="tire-circle bg-tire-${activeStint.tire}">${activeStint.tire}</span>`;

        let fStrat = activeStint.fuelStrat.toUpperCase();
        let fuelRate = getDriverFuelRate(activeStint.driverName, activeStint.fuelStrat);

        let fuelPill = document.getElementById('live-fuel-pill'); if (fuelPill) fuelPill.className = `live-fuel-pill ${fStrat === 'PUSH' ? 'bg-fuel-push' : 'bg-fuel-eco'}`;
        let fuelStratEl = document.getElementById('live-fuel-strat');
        if (fuelStratEl) {
            let rawFuelTopStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
            let isFuelEnabledTop = (rawFuelTopStr ? parseFloat(rawFuelTopStr) : 0) > 0;

            if (!isFuelEnabledTop) {
                fuelStratEl.innerText = "-";
                fuelStratEl.className = 'text-warning ml-8 font-weight-bold';
                fuelStratEl.onclick = null;
            } else {
                fuelStratEl.innerText = fuelRate.toFixed(2) + " L/t";
                fuelStratEl.className = fStrat === 'PUSH' ? 'text-push cursor-pointer ml-8' : 'text-eco cursor-pointer ml-8';
                fuelStratEl.onclick = () => toggleStintFuelStrat(activeStint.splitIdx, activeStint.stintIdx);
            }
        }

        let timeInStint = elapsed - activeStint.startSec;
        if (activeStint.lockedTimeSec !== null && activeStint.isPitted) timeInStint = activeStint.lockedTimeSec - activeStint.startSec;
        if (timeInStint < 0) timeInStint = 0;
        let lapSec = activeStint.lapSec || 120000; // 🚀 MS

        let currentEstimatedLap = (activeStint.startLap || 0) + Math.floor(timeInStint / lapSec) + 1;
        let curLapEl = document.getElementById('live-current-lap'); if (curLapEl) curLapEl.innerText = currentEstimatedLap;

        let stintLapsEl = document.getElementById('live-current-stint-laps');
        if (stintLapsEl) { stintLapsEl.innerText = `${activeStint.laps} tours`; stintLapsEl.className = `fs-1-2 font-weight-bold mb-5 ${fStrat === 'PUSH' ? 'text-push' : 'text-eco'}`; }

        let tgtLapEl = document.getElementById('live-target-lap'); if (tgtLapEl) tgtLapEl.innerText = activeStint.endLap || 0;

        let realEnd = Math.round(activeStint.endSec / 1000); // 🚀 Affichage
        let targetH = String(Math.floor(realEnd / 3600)).padStart(2, '0');
        let targetM = String(Math.floor((realEnd % 3600) / 60)).padStart(2, '0');
        let targetS = String(Math.floor(realEnd % 60)).padStart(2, '0');
        let tgtTimeEl = document.getElementById('live-target-time'); if (tgtTimeEl) tgtTimeEl.innerText = `${targetH}:${targetM}:${targetS}`;

        let timeRem = activeStint.endSec - elapsed;
        if (activeStint.isPitted && activeStint.lockedTimeSec !== null) timeRem = 0;
        let sign = timeRem < 0 ? "+" : "-";
        let absRem = Math.round(Math.abs(timeRem) / 1000); // 🚀 Affichage
        let rh = String(Math.floor(absRem / 3600)).padStart(2, '0');
        let rm = String(Math.floor((absRem % 3600) / 60)).padStart(2, '0');
        let rs = String(Math.floor(absRem % 60)).padStart(2, '0');
        let remStr = (rh !== '00' ? `${rh}:` : '') + `${rm}:${rs}`;

        let hourglassIcon = sign === "+" ? "hourglass_bottom" : "hourglass_top";
        let countdownEl = document.getElementById('live-countdown');
        if (countdownEl) {
            countdownEl.innerHTML = `<span class="material-symbols-outlined live-grey-icon mr-15">${hourglassIcon}</span> ${sign} ${remStr}`;
            countdownEl.className = "live-countdown";
            if (sign === "+") countdownEl.classList.add("text-danger");
            else if (absRem <= 120) countdownEl.classList.add("text-warning");
            else countdownEl.classList.add("text-success");
        }

        let isUltimateStint = false;
        if (timerState.type === 'online') isUltimateStint = (activeStint.stintIdx === strategySplits[activeStint.splitIdx].stints.length - 1);
        else isUltimateStint = (activeStint.splitIdx === strategySplits.length - 1 && activeStint.stintIdx === strategySplits[activeStint.splitIdx].stints.length - 1);

        let nextBox = document.getElementById('live-next-box');
        let finishBox = document.getElementById('live-finish-box');
        let pitBtn = document.getElementById('live-btn-pitin');

        if (isUltimateStint && !isPitBufferMode) {
            if (nextBox) nextBox.classList.add('hidden');
            if (finishBox) { finishBox.classList.remove('hidden'); finishBox.querySelector('.live-card-content').innerHTML = '<div class="large-finish-flag">🏁</div>'; }
            if (pitBtn) pitBtn.classList.add('hidden');
        } else {
            if (pitBtn) pitBtn.classList.remove('hidden');
            if (finishBox) finishBox.querySelector('.live-card-content').innerHTML = '<p class="finish-msg">Dernier stint</p>';

            if (nextStint) {
                if (nextBox) nextBox.classList.remove('hidden');
                if (finishBox) finishBox.classList.add('hidden');

                let nextDrvEl = document.getElementById('live-next-driver'); if (nextDrvEl) nextDrvEl.innerText = nextStintDriver;
                let tireContainer = document.getElementById('live-next-tire-container');
                if (tireContainer) {
                    if (nextStint.changeTires) tireContainer.innerHTML = `<span class="tire-circle bg-tire-${nextStint.tire}">${nextStint.tire}</span>`;
                    else tireContainer.innerHTML = `<span class="text-grey font-weight-bold fs-1-2">Conserver ${activeStint.tire}</span>`;
                }

                let rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
                let initialFuel = rawFuelStr ? parseFloat(rawFuelStr) : 0;
                let isFuelEnabled = (initialFuel > 0);

                let targetFuel = nextStint.cachedTargetFuel || initialFuel;
                if (isFuelEnabled && nextStint.manualFuel !== null && nextStint.manualFuel !== undefined) targetFuel = parseFloat(nextStint.manualFuel);
                if (isFuelEnabled && targetFuel > 100) targetFuel = 100;

                let fuelEl = document.getElementById('live-next-fuel');
                let fuelToAdd = activeStint.fuelToAddForNext || 0;
                if (fuelEl) {
                    if (!isFuelEnabled) {
                        fuelEl.innerText = `-`;
                        fuelEl.className = `pit-no-fuel text-warning ml-8 font-weight-bold`;
                        fuelEl.onclick = null;
                    } else {
                        let isManual = (nextStint.manualFuel !== null && nextStint.manualFuel !== undefined);
                        let manualClass = isManual ? "manual-override-text" : "";
                        if (fuelToAdd > 0) { fuelEl.innerText = `${targetFuel.toFixed(1)} L`; fuelEl.className = `fuel-highlight text-warning ml-8 cursor-pointer ${manualClass}`; }
                        else { fuelEl.innerText = `NON`; fuelEl.className = `pit-no-fuel text-success ml-8 cursor-pointer ${manualClass}`; }
                        fuelEl.onclick = () => openFuelModal(nextStint.splitIdx, nextStint.stintIdx, nextStint.cachedTargetFuel);
                    }
                }

                let pitTimeEl = document.getElementById('live-next-pit-time');
                let nextBoxTitle = nextBox.querySelector('.live-card-title');

                if (isPitBufferMode) {
                    if (nextBoxTitle) nextBoxTitle.innerText = "ARRÊT EN COURS";
                    nextBox.classList.add('pit-buffer-active');
                    let timeRemaining = Math.max(0, Math.ceil((activeStint.nextPitTime - activeStint.timeSincePit) / 1000)); // 🚀 MS
                    if (pitTimeEl) pitTimeEl.innerText = `${timeRemaining}s`;
                    if (pitBtn) {
                        pitBtn.innerHTML = `<span class="material-symbols-outlined icon-xl mr-15">sports_score</span> PIT OUT`;
                        pitBtn.className = "live-giant-btn btn-success";
                        pitBtn.onclick = () => { forcePitOut(activeStint.splitIdx, activeStint.stintIdx); };
                    }
                } else {
                    if (nextBoxTitle) nextBoxTitle.innerText = "CONSIGNES PIT";
                    nextBox.classList.remove('pit-buffer-active');
                    if (pitTimeEl) pitTimeEl.innerText = `${Math.ceil((activeStint.nextPitTime || 0) / 1000)}s`; // 🚀 MS
                    if (pitBtn) {
                        pitBtn.innerHTML = `<span class="material-symbols-outlined icon-xl mr-15">flag</span> PIT IN`;
                        pitBtn.className = "live-giant-btn";
                        pitBtn.onclick = () => { openPitModal(activeStint.splitIdx, activeStint.stintIdx); };
                    }
                }
            } else {
                if (nextBox) nextBox.classList.add('hidden');
                if (finishBox) finishBox.classList.remove('hidden');
            }
        }
    } else {
        if (offlineMsg) { offlineMsg.classList.remove('hidden'); offlineMsg.innerHTML = `<span class="material-symbols-outlined icon-huge-grey text-success">sports_score</span><h2 class="text-huge-spaced text-success">COURSE TERMINÉE</h2><p class="help-text fs-1-2">Tous les relais ont été validés.</p>`; }
        if (dashboard) dashboard.classList.add('hidden');
    }
}

// 🚀 NOUVELLE FONCTION : Bypass du Buffer Manuel
function forcePitOut(splitIdx, stintIdx) {
    if (strategySplits[splitIdx] && strategySplits[splitIdx].stints[stintIdx]) {
        strategySplits[splitIdx].stints[stintIdx].pitExitForced = true;
        saveFormState();
        timerTick(); // Force le rafraîchissement visuel immédiat
    }
}

function handleNavClick() {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            let inp = document.getElementById('stop-timer-input');
            if (inp) inp.value = '';
            checkStopTimerInput();
            document.getElementById('stop-timer-modal').classList.remove('hidden');
            setTimeout(() => { if (inp) inp.focus(); }, 50);
        }
    }
}

function checkStopTimerInput() {
    let val = document.getElementById('stop-timer-input')?.value.toLowerCase();
    let btn = document.getElementById('btn-confirm-stop');
    if (btn) {
        if (val === 'stop') {
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
        } else {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        }
    }
}

function closeStopTimerModal() {
    document.getElementById('stop-timer-modal').classList.add('hidden');
}

function confirmStopTimer() {
    closeStopTimerModal();
    stopTimer(false);
}

function stopTimer(isRaceEnd, isSilent = false) {
    liveTimerActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    localStorage.removeItem('stratefreez-timer');

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        navTitle.innerText = "STRATEFREEZ";
        navTitle.classList.remove('chrono-active');
    }
    document.querySelectorAll('.active-live-stint').forEach(el => el.classList.remove('active-live-stint'));

    // 🚀 LE SILENCE RADIO : Si c'est un arrêt purement local
    if (isSilent) {
        renderStrategy();
        updateLiveSpotter(0, null);
        return; // ⛔ Bloque la descente vers Firebase !
    }

    // 🚀 GESTION DU CLOUD
    if (isRaceEnd) {
        let allFinished = strategySplits.every(s => s.isFinished);
        let isOnline = document.getElementById('race-type')?.value === 'online';

        let updatePayload = {
            isTimerRunning: false,
            timerState: null
        };

        // 🚀 PROTECTION EN LIGNE : On ne clotûre définitivement la course que si TOUT est fini (ou IRL)
        if (allFinished || !isOnline) {
            updatePayload.isActive = false;
        }

        if (currentRaceId) {
            db.collection('races').doc(currentRaceId).update(updatePayload).catch(e => console.error(e));
        }

        let banner = document.getElementById('end-race-banner');
        if (banner) {
            banner.classList.remove('hidden');
            setTimeout(() => { banner.classList.add('hidden'); }, 10000);
        }
    } else {
        if (currentRaceId && isRaceActive) {
            db.collection('races').doc(currentRaceId).update({
                isTimerRunning: false,
                timerState: null
            }).catch(e => console.error(e));
        }
    }

    renderStrategy();
    updateLiveSpotter(0, null);
    updateLiveStandbyState(isRaceEnd); // 🚀 FIX 2 : On passe la vraie raison de l'arrêt (True = 3 min, False = Immédiat)
}

function loadTimerState() {
    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            runTimerLoop();
        }
    } else {
        updateLiveSpotter(0, null);
    }
}

// ==========================================
// --- ONGLET 3 : MOTEUR STRATÉGIE VASE COMMUNICANT ---
// ==========================================

function openExcessModal(msg) {
    let msgEl = document.getElementById('excess-stint-msg');
    if (msgEl && msg) msgEl.innerHTML = msg;

    // 🚀 DÉSACTIVÉ TEMPORAIREMENT À TA DEMANDE (S'affiche uniquement en console pour debug)
    console.warn("Alerte Moteur :", msg || "Capacité maximale des gommes atteinte.");

    // document.getElementById('excess-stint-modal').classList.remove('hidden');
}

function closeExcessModal() {
    document.getElementById('excess-stint-modal').classList.add('hidden');
}

// 🚀 NOUVELLE FONCTION : Le Vrai Reset (Relancer la course)
// 🚀 NOUVELLE FONCTION : Le Vrai Reset (Relancer la course)
function openRestartModal() {
    let input = document.getElementById('reset-confirm-input');
    let btn = document.getElementById('btn-confirm-reset');
    if (input) input.value = "";
    if (btn) {
        btn.disabled = true;
        btn.classList.add('btn-disabled'); // 🚀 On force le gris visuel à l'ouverture
    }

    document.getElementById('restart-modal').classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
}

function closeRestartModal() {
    document.getElementById('restart-modal').classList.add('hidden');
}

function checkResetInput() {
    let input = document.getElementById('reset-confirm-input');
    let btn = document.getElementById('btn-confirm-reset');
    if (input && btn) {
        if (input.value.trim().toUpperCase() === "RESET") {
            btn.disabled = false;
            btn.classList.remove('btn-disabled'); // 🚀 On retire le gris si le mot est bon
        } else {
            btn.disabled = true;
            btn.classList.add('btn-disabled'); // 🚀 On remet le gris sinon
        }
    }
}

function confirmRestartRace() {
    if (!currentRaceId) return;

    // 1. Déverrouillage des relais (On garde l'architecture exacte, on nettoie juste les statuts)
    strategySplits.forEach(split => {
        split.isFinished = false; // Retire le statut "Terminé" localement
        split.stints.forEach(stint => {
            stint.isPitted = false;
            stint.lockedTimeSec = null;
            stint.manualFuel = null;
            stint.pitExitForced = false;
            stint.locked = false;
        });
    });

    // 2. Arrêt du Chronomètre Local
    localStorage.removeItem('stratefreez-timer');
    liveTimerActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    let navTitle = document.getElementById('nav-brand-text');
    if (navTitle) {
        navTitle.innerText = "STRATEFREEZ";
        navTitle.classList.remove('chrono-active');
    }

    // 3. Forcer l'état actif localement
    isRaceActive = true;
    localStorage.setItem('stratefreez-is-race-active', 'true');

    // 4. Recalcul et Sauvegarde Locale
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
    updateLiveSpotter(0, null);

    // 5. 🚀 LE CLOUD : On pousse le tableau sans pit validé et on coupe les statuts de fin/chrono
    db.collection('races').doc(currentRaceId).update({
        isActive: true,
        strategyData: strategySplits, // Le tableau avec ses micro-stints intacts
        timerState: null,
        isTimerRunning: false,
        isRaceTerminated: false, // 🚀 C'est ceci qui la classe en "Course Prête"
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        closeRestartModal();
        let banner = document.getElementById('end-race-banner');
        if (banner) banner.classList.add('hidden');
    }).catch(e => {
        console.error("Erreur relance :", e);
        showErrorModal("Erreur de communication avec le serveur lors du Reset.");
    });
}

function openClearModal() { document.getElementById('clear-modal').classList.remove('hidden'); }
function closeClearModal() { document.getElementById('clear-modal').classList.add('hidden'); }
function confirmClearStrategy() {
    strategySplits = [];
    closeClearModal();
    initStrategyData();
    renderStrategy();
}

function openBilanModal() { document.getElementById('bilan-modal').classList.remove('hidden'); }
function closeBilanModal() { document.getElementById('bilan-modal').classList.add('hidden'); }

// 🚀 NOUVELLE FONCTION : Bascule rapide Eco/Attack depuis l'onglet Live
function toggleStintFuelStrat(i, j) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    if (strategySplits[i] && strategySplits[i].stints[j]) {
        let stint = strategySplits[i].stints[j];
        // 🚀 INTERCEPTION ECO LIVE
        if (stint.fuelStrat === 'push') {
            let driver = strategySplits[i].driver;
            if (!hasEcoData(driver, stint.tire)) {
                showErrorModal(`Veuillez revoir les paramètres éco pour les pneus ${stint.tire}.`);
                return; // ⛔ Bloque le clic
            }
        }
        stint.fuelStrat = (stint.fuelStrat === 'push') ? 'eco' : 'push';
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick(); // Rafraîchissement visuel instantané
    }
}
function openFuelModal(i, j, calcValue) {
    let rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    if (!rawFuelStr || parseFloat(rawFuelStr) <= 0) return; // 🚀 BOUCLIER ESSENCE
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR

    // 1. Calcul du Résiduel via la variable 'residualAtEnd' déjà calculée par votre cascade
    let residual = 0;
    if (j > 0) {
        residual = strategySplits[i].stints[j - 1].residualAtEnd || 0;
    } else if (i > 0) {
        let prevSplit = strategySplits[i - 1];
        if (prevSplit.stints && prevSplit.stints.length > 0) {
            residual = prevSplit.stints[prevSplit.stints.length - 1].residualAtEnd || 0;
        }
    }

    fuelModalTarget = { i, j, targetFuel: calcValue, residual: residual };

    let currentManual = strategySplits[i].stints[j].manualFuel;
    let hasManual = (currentManual !== null && currentManual !== undefined);

    // 2. Affichage Ligne 1 (Résiduel) - Masqué uniquement sur le tout premier relais
    let resLine = document.getElementById('fuel-modal-residual');
    if (i === 0 && j === 0) {
        resLine.classList.add('hidden');
    } else {
        resLine.innerText = `Résiduel : ${residual.toFixed(1)} L`;
        resLine.classList.remove('hidden');
    }

    // 3. Affichage Ligne 2 (État Actuel)
    let stateLine = document.getElementById('fuel-modal-state');
    if (hasManual) {
        stateLine.innerHTML = `Modifié : <span class="manual-override-text text-warning">${currentManual.toFixed(1)} L</span>`;
    } else {
        if (calcValue <= residual) {
            stateLine.innerHTML = `Calculé : <span class="text-success">${calcValue.toFixed(1)} L</span>`;
        } else {
            stateLine.innerHTML = `Calculé : <span class="text-warning">${calcValue.toFixed(1)} L</span>`;
        }
    }

    // 4. Initialisation du champ et du bouton
    let input = document.getElementById('fuel-modal-input');
    input.value = ''; // On part sur un champ vide
    document.getElementById('btn-fuel-validate').disabled = true; // Toujours grisé à l'ouverture
    // 🚀 L'état du bouton est dicté par la logique centralisée
    checkFuelInput();

    document.getElementById('fuel-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); }, 50);
}

function closeFuelModal() {
    document.getElementById('fuel-modal').classList.add('hidden');
    fuelModalTarget = null;
}

function confirmFuelOverride() {
    if (fuelModalTarget) {
        let val = parseFloat(document.getElementById('fuel-modal-input').value);
        // Ultime sécurité avant sauvegarde
        if (!isNaN(val) && val > fuelModalTarget.residual && val > fuelModalTarget.targetFuel) {
            strategySplits[fuelModalTarget.i].stints[fuelModalTarget.j].manualFuel = val;
            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
            if (liveTimerActive) timerTick();
            closeFuelModal();
        }
    }
}

function clearFuelOverride() {
    // Fonction exclusive au bouton "Auto"
    if (fuelModalTarget) {
        strategySplits[fuelModalTarget.i].stints[fuelModalTarget.j].manualFuel = null;
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick();
        closeFuelModal();
    }
}

// 🚀 LE GARDE-FOU (Appelé uniquement lors de la frappe dans la modale)
function checkFuelInput() {
    let btnValidate = document.getElementById('btn-fuel-validate');
    let val = parseFloat(document.getElementById('fuel-modal-input').value);

    if (fuelModalTarget) {
        // Règle stricte : > Résiduel ET > Cible calculée
        if (!isNaN(val) && val > fuelModalTarget.residual && val > fuelModalTarget.targetFuel) {
            btnValidate.disabled = false; // Allume le bouton
        } else {
            btnValidate.disabled = true;  // Grise le bouton
        }
    }
}

function getAvailableDrivers() {
    let d = []; document.querySelectorAll('.drv-name').forEach((inp, i) => { if (inp.value) d.push(inp.value); else d.push(`Pilote ${i + 1}`); });
    return d.length ? d : ["Pilote 1"];
}
function getAvailableSpotters() {
    let s = [];
    if (document.getElementById('has-spotter').checked) { document.querySelectorAll('.spotter-name').forEach((inp, i) => { if (inp.value) s.push(inp.value); else s.push(`Spotter ${i + 1}`); }); }
    return s;
}
function getAvailableTires() {
    let t = [];['T', 'M', 'D', 'I', 'P'].forEach(c => { if (document.getElementById(`use-${c}`)?.checked) t.push(c); });
    return t;
}
// 🚀 DÉTECTEUR STRICT : L'utilisateur a-t-il renseigné le mode Éco ?
function hasEcoData(driverName, tire) {
    if (!tire) return false;
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    let isCustom = drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked;

    let fuel = null;
    let time = null;

    if (isCustom) {
        fuel = document.getElementById(`drv-${drvIndex}-fuel-eco`)?.value;
        time = document.getElementById(`drv-${drvIndex}-time-eco-${tire}`)?.value;
    }

    if (!fuel) fuel = document.getElementById('cons-eco')?.value;
    if (!time) time = document.getElementById(`global-time-eco-${tire}`)?.value;

    return !!(fuel && time);
}
function getDriverFuelRate(driverName, strat) {
    if (!strat) strat = 'push';
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        let val = parseFloat(document.getElementById(`drv-${drvIndex}-fuel-${strat}`)?.value?.replace(/[^\d.]/g, ''));
        if (!isNaN(val)) return val;
    }
    return parseFloat(document.getElementById(`cons-${strat}`)?.value?.replace(/[^\d.]/g, '')) || 10.0;
}

function getDriverLapSeconds(driverName, tire, strat) {
    if (!strat) strat = 'push';
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    let timeStr = "";

    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        timeStr = document.getElementById(`drv-${drvIndex}-time-${strat}-${tire}`)?.value;
    }
    if (!timeStr) timeStr = document.getElementById(`global-time-${strat}-${tire}`)?.value;
    if (!timeStr) return 60000;

    // 1. LECTURE CLASSIQUE (Si les deux-points sont présents)
    if (timeStr.includes(':')) {
        let parts = timeStr.split(':');
        if (parts.length === 2) {
            return (parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000; // 🚀 MS
        } else if (parts.length === 3) {
            return (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])) * 1000; // 🚀 MS
        }
    }

    // 2. LECTURE BLINDÉE (En cours de frappe, aucun deux-points)
    let val = timeStr.replace(/\D/g, ''); // On garde uniquement les chiffres purs
    if (val.length >= 4) {
        // Lecture de droite à gauche (ex: 0132000 -> 000ms, 32s, 01m)
        let ms = parseInt(val.slice(-3)) || 0;
        let s = parseInt(val.slice(-5, -3)) || 0;
        let m = parseInt(val.slice(0, -5)) || 0;
        return (m * 60 + s) * 1000 + ms; // 🚀 MS
    }

    return 60000; // 🚀 MS (Sécurité absolue finale)
}

function getDriverTireLife(driverName, tire) {
    let drvIndex = getAvailableDrivers().indexOf(driverName) + 1;
    let drivers = parseInt(document.getElementById('num-drivers').value) || 1;
    if (drivers > 1 && document.getElementById('personalize-drivers-toggle')?.checked) {
        let val = parseInt(document.getElementById(`drv-${drvIndex}-life-${tire}`)?.value);
        if (!isNaN(val) && val > 0) return val;
    }
    // 🚀 LOGIQUE PURE : 0 = Case vide = Usure désactivée
    return parseInt(document.getElementById(`global-life-${tire}`)?.value) || 0;
}

function timeStringToSeconds(str) {
    if (!str) return 0;

    // 1. LECTURE CLASSIQUE (100% identique à votre code initial)
    if (str.includes(':')) {
        let p = str.split(':');
        if (p.length === 3) return (parseInt(p[0] || 0) * 3600 + parseInt(p[1] || 0) * 60 + parseInt(p[2] || 0)) * 1000; // 🚀 MS
        if (p.length === 2) return (parseInt(p[0] || 0) * 3600 + parseInt(p[1] || 0) * 60) * 1000; // 🚀 MS
    }

    // 2. LECTURE BLINDÉE (Le filet de sécurité)
    let val = str.replace(/\D/g, '');

    // Format 6 chiffres (ex: 023000 -> 2h 30m 00s)
    if (val.length === 6) {
        let s = parseInt(val.slice(-2)) || 0;
        let m = parseInt(val.slice(-4, -2)) || 0;
        let h = parseInt(val.slice(0, -4)) || 0; // 🚀 CORRECTION ICI : -4 pour isoler les heures
        return (h * 3600 + m * 60 + s) * 1000; // 🚀 MS
    }

    // Format standard HHMM (ex: 1530 -> 15h 30m)
    if (val.length >= 3) {
        let m = parseInt(val.slice(-2)) || 0;
        let h = parseInt(val.slice(0, -2)) || 0;
        return (h * 3600 + m * 60) * 1000; // 🚀 MS
    } else if (val.length > 0) {
        // Si 1 ou 2 chiffres (ex: "2" -> 2 Heures)
        return parseInt(val) * 3600000; // 🚀 MS
    }

    return 0;
}

function formatTime(seconds) {
    let realSec = Math.round(seconds / 1000); // 🚀 Repassage en secondes pour l'affichage
    let h = String(Math.floor(realSec / 3600)).padStart(2, '0');
    let m = String(Math.floor((realSec % 3600) / 60)).padStart(2, '0');
    let s = String(Math.floor(realSec % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ==========================================
// --- LE CERVEAU : OPTIMISATION DES RELAIS ---
// ==========================================
function optimizeStrategyFilling() {
    let tires = getAvailableTires();
    if (tires.length === 0) return;

    let goal = document.getElementById('race-goal')?.value;
    let safetyRes = parseFloat(document.getElementById('fuel-reserve')?.value.replace(/[^\d.]/g, '')) || 0;
    let raceType = document.getElementById('race-type')?.value;
    let isOnline = (raceType === 'online');
    let isSolo = (parseInt(document.getElementById('num-drivers')?.value) === 1);
    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;

    // 🛠️ HELPER : Le Plafond Physique (Entonnoir à l'Infini)
    const getCeiling = (driver, tire) => {
        let tLife = getDriverTireLife(driver, tire);
        let hasTireLimit = tLife > 0;

        let rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
        let isFuelEnabledLocal = (rawFuelStr ? parseFloat(rawFuelStr) : 0) > 0;

        // Voie D : Mode Arcade (Aucune limite)
        if (!hasTireLimit && !isFuelEnabledLocal) return Infinity;

        // Voie C : Pneus seuls (Pas de conso d'essence)
        if (!isFuelEnabledLocal) return tLife;

        let fRate = getDriverFuelRate(driver, 'push');
        let fLife = Math.floor((100 - safetyRes) / fRate);

        // Voie B : Essence seule (Pneus inusables)
        if (!hasTireLimit) return Math.max(1, fLife);

        // Voie A : Simulation Totale (Le plus strict des deux)
        return Math.max(1, Math.min(tLife, fLife));
    };

    // 🎯 1. Calcul de la Cible (En Tours)
    let targetLaps = 0;
    if (goal === 'laps') {
        targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
    } else {
        let totalSec = getRaceDurationSeconds();

        // 🚀 CALCULATEUR THÉORIQUE (Plafond de verre inatteignable)
        let allDrivers = getAvailableDrivers();
        let allTires = getAvailableTires();
        let absoluteFastestLapSec = Infinity;

        for (let d of allDrivers) {
            for (let t of allTires) {
                let lapTime = getDriverLapSeconds(d, t, 'push');
                if (lapTime > 0 && lapTime < absoluteFastestLapSec) {
                    absoluteFastestLapSec = lapTime;
                }
            }
        }
        if (absoluteFastestLapSec === Infinity) absoluteFastestLapSec = 60000;

        targetLaps = Math.ceil(totalSec / absoluteFastestLapSec); // Plafond physique absolu
    }

    let countCurrentLaps = () => strategySplits.reduce((sum, split) => sum + split.stints.reduce((s, stint) => s + stint.laps, 0), 0);

    // 🌊 2. LE REMPLISSAGE
    if (hasPitWindow && (isSolo || isOnline)) {
        // 🔒 Cas Spécial : Verrouillage Spatial sur Fenêtre
        let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
        let targetStint1Laps = 1;

        if (isLapMode) {
            let winC = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
            targetStint1Laps = winC > 0 ? winC : 1;
        } else {
            let winC_time = document.getElementById('time-pit-window-close')?.value || "";
            let secC = timeStringToSeconds(winC_time);
            let avgLap = getDriverLapSeconds(strategySplits[0].driver, strategySplits[0].stints[0].tire, 'push');
            targetStint1Laps = secC > 0 ? Math.floor(secC / avgLap) : 1;
        }

        // On remplit le Relais 1 jusqu'à la fin de la fenêtre (ou son plafond)
        let ceil1 = getCeiling(strategySplits[0].driver, strategySplits[0].stints[0].tire);
        strategySplits[0].stints[0].laps = Math.max(1, Math.min(targetStint1Laps, ceil1));

        // On verse le reste dans le Relais 2 (si présent)
        if (strategySplits[0].stints.length > 1) {
            let remLaps = targetLaps - strategySplits[0].stints[0].laps;
            if (remLaps > 0) {
                let ceil2 = getCeiling(strategySplits[0].driver, strategySplits[0].stints[1].tire);
                strategySplits[0].stints[1].laps = Math.min(remLaps, ceil2);
            }
        }
    } else {
        // 🏺 Règle Générale : Vases Communicants (Des Rapides vers les Lents)
        tires.forEach(tireType => {
            let stintsOfThisTire = [];
            strategySplits.forEach((split) => {
                split.stints.forEach((stint) => {
                    if (stint.tire === tireType && !stint.isPitted) stintsOfThisTire.push({ split, stint });
                });
            });

            let addedThisRound = true;
            while (addedThisRound && countCurrentLaps() < targetLaps) {
                addedThisRound = false;
                for (let item of stintsOfThisTire) {
                    if (countCurrentLaps() >= targetLaps) break;
                    let ceil = getCeiling(item.split.driver, item.stint.tire);
                    if (item.stint.laps < ceil) {
                        item.stint.laps++;
                        addedThisRound = true;
                    }
                }
            }
        });
    }

    // 🔗 3. L'ÉTIREMENT (Le Cerveau de Survie)

    // 🚀 LOI N°1 : Le Coupe-Circuit IRL (On désactive l'usine si ce n'est ni Solo ni Online)
    if (isSolo || isOnline) {
        let safetyStretches = 150;
        let totalSecRace = getRaceDurationSeconds();

        while (safetyStretches-- > 0) {
            let lastSplit = strategySplits[strategySplits.length - 1];
            if (!lastSplit || lastSplit.stints.length === 0) break;

            // 🚀 LOI N°2 : Le Détecteur d'Objectif (On évalue si on doit s'arrêter)
            if (goal === 'time') {
                let currentTotalSec = 0;
                lastSplit.stints.forEach((s, idx) => {
                    let lapTime = getDriverLapSeconds(lastSplit.driver, s.tire, s.fuelStrat);
                    let pitTime = (idx === 0) ? 0 : 41000; // Estimation 35s Pit + 6s Pneus
                    currentTotalSec += (s.laps * lapTime) + pitTime;
                });
                if (currentTotalSec >= totalSecRace) break; // Ligne d'arrivée franchie, l'Usine s'éteint
            } else {
                if (countCurrentLaps() >= targetLaps) break; // Objectif de tours atteint, l'Usine s'éteint
            }

            // 🚀 LOI N°3 : L'Intervention sous contraintes (Bouclier A - Fenêtres)
            if (hasPitWindow) {
                let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
                let isOutOfWindow = false;
                let currentTotalLaps = lastSplit.stints.reduce((sum, s) => sum + s.laps, 0);

                let currentTotalSec = 0;
                lastSplit.stints.forEach((s, idx) => {
                    let lapTime = getDriverLapSeconds(lastSplit.driver, s.tire, s.fuelStrat);
                    let pitTime = (idx === 0) ? 0 : 41000;
                    currentTotalSec += (s.laps * lapTime) + pitTime;
                });

                if (isLapMode) {
                    let winO = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                    let winC = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
                    if ((winO > 0 || winC > 0) && (currentTotalLaps < winO || currentTotalLaps > winC)) {
                        isOutOfWindow = true;
                    }
                } else {
                    let winO_str = document.getElementById('time-pit-window-open')?.value || "";
                    let winC_str = document.getElementById('time-pit-window-close')?.value || "";
                    if (winO_str !== "" && winC_str !== "") {
                        let secO = timeStringToSeconds(winO_str);
                        let secC = timeStringToSeconds(winC_str);
                        if (currentTotalSec < secO || currentTotalSec > secC) isOutOfWindow = true;
                    }
                }

                if (isOutOfWindow) break; // Arrêt immédiat : impossible de résoudre légalement
            }

            // 🚀 Bouclier B : Quotas et Pneus Secs Strictement
            let dryTires = ['T', 'M', 'D'].filter(t => tires.includes(t));
            if (dryTires.length === 0) break; // Sécurité extrême anti-crash

            const countTireUsage = (tireToCheck) => {
                let count = 0;
                strategySplits.forEach((split, i) => {
                    split.stints.forEach((stint, j) => {
                        let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                        if ((stint.changeTires || isAbsFirst) && stint.tire === tireToCheck) count++;
                    });
                });
                return count;
            };

            let selectedTire = null;
            for (let testTire of dryTires) {
                let maxQuota = parseInt(document.getElementById(`val-${testTire}-3`)?.value) || 999;
                let hasMax = document.getElementById(`cb-${testTire}-3`)?.checked;
                let currentUsage = countTireUsage(testTire);

                if (!hasMax || (currentUsage + 1 <= maxQuota)) {
                    selectedTire = testTire;
                    break; // Voie libre pour ce pneu !
                }
            }

            if (!selectedTire) selectedTire = dryTires[dryTires.length - 1]; // Survie absolue

            let newStint = {
                tire: selectedTire, fuelStrat: 'push', laps: 1, changeTires: true,
                isPitted: false, lockedTimeSec: null, manualFuel: null
            };
            lastSplit.stints.push(newStint);

            let currentDryIndex = dryTires.indexOf(selectedTire);
            let objectiveMet = false;

            while (!objectiveMet) {
                if (goal === 'time') {
                    let currentTotalSec = 0;
                    lastSplit.stints.forEach((s, idx) => {
                        let lapTime = getDriverLapSeconds(lastSplit.driver, s.tire, s.fuelStrat);
                        let pitTime = (idx === 0) ? 0 : 41000;
                        currentTotalSec += (s.laps * lapTime) + pitTime;
                    });
                    if (currentTotalSec >= totalSecRace) objectiveMet = true;
                } else {
                    if (countCurrentLaps() >= targetLaps) objectiveMet = true;
                }

                if (objectiveMet) break;

                let ceil = getCeiling(lastSplit.driver, newStint.tire);
                if (newStint.laps < ceil) {
                    newStint.laps++;
                } else {
                    // MUE : Le pneu est plein. On essaie de muter, TOUJOURS avec Bouclier B
                    let mutated = false;
                    while (currentDryIndex + 1 < dryTires.length) {
                        currentDryIndex++;
                        let mutTire = dryTires[currentDryIndex];
                        let maxQuota = parseInt(document.getElementById(`val-${mutTire}-3`)?.value) || 999;
                        let hasMax = document.getElementById(`cb-${mutTire}-3`)?.checked;
                        let currentUsage = countTireUsage(mutTire);

                        if (!hasMax || (currentUsage + 1 <= maxQuota)) {
                            newStint.tire = mutTire; // Mutation autorisée !
                            mutated = true;
                            break;
                        }
                    }
                    if (!mutated) break; // Impossible de muter légalement, on force l'arrêt aux stands
                }
            }
        }
    }

    // ✂️ 4. L'ÉCRÊTAGE (Optimisation Chrono : Retrait des tours lents en trop)
    let excessLaps = countCurrentLaps() - targetLaps;
    if (excessLaps > 0) {
        let reverseTires = [...tires].reverse(); // Des Lents vers les Rapides
        reverseTires.forEach(tireType => {
            let stintsOfThisTire = [];
            strategySplits.forEach(split => {
                split.stints.forEach(stint => {
                    if (stint.tire === tireType && !stint.isPitted) stintsOfThisTire.push(stint);
                });
            });

            let removedThisRound = true;
            while (excessLaps > 0 && removedThisRound) {
                removedThisRound = false;
                for (let stint of stintsOfThisTire) {
                    if (excessLaps <= 0) break;
                    if (stint.laps > 1) { // On ne vide jamais totalement un vase
                        stint.laps--;
                        excessLaps--;
                        removedThisRound = true;
                    }
                }
            }
        });
    }
}

function initStrategyData() {
    // 🚀 LE MUSÈLEMENT DU BÂTISSEUR : Il n'intervient QUE si le tableau est totalement vide !
    if (strategySplits.length > 0) return;

    let maxConsecutive = Math.max(1, parseInt(document.getElementById('max-consecutive-splits')?.value) || 1);
    const numSplits = parseInt(document.getElementById('total-splits')?.value) || 1;
    if (strategySplits.length === numSplits) return; // Sécurité de non-destruction

    let drivers = getAvailableDrivers();
    let spotters = getAvailableSpotters();
    let tires = getAvailableTires();

    let raceType = document.getElementById('race-type')?.value || 'irl';
    let isOnline = (raceType === 'online');
    let isSolo = (drivers.length === 1);

    if (isOnline || isSolo) maxConsecutive = 1;

    // 🏗️ ÉTAPE 1 : LE BÂTISSEUR (Squelette minimum légal)
    let reqPits = (isSolo || isOnline) ? (parseInt(document.getElementById('global-req-pit-stops')?.value) || 0) : 0;
    let initialStintsCount = Math.max(1, reqPits + 1);

    let newSplits = [];
    for (let i = 0; i < numSplits; i++) {
        if (strategySplits[i]) {
            newSplits.push(strategySplits[i]);
        } else {
            let drvIndex = Math.floor(i / maxConsecutive) % drivers.length;
            let drv = drivers[drvIndex];
            let availableSpotters = spotters.filter(s => s !== drv);
            let sptIndex = Math.floor(i / maxConsecutive) % Math.max(1, availableSpotters.length);
            let spt = availableSpotters.length > 0 ? availableSpotters[sptIndex] : "";

            let generatedStints = [];
            for (let k = 0; k < initialStintsCount; k++) {
                generatedStints.push({
                    tire: tires[0], // Nait avec la gomme la plus rapide
                    fuelStrat: "push",
                    laps: 1, // Minimum syndical (Le Cerveau remplira plus tard)
                    changeTires: true,
                    isPitted: false,
                    lockedTimeSec: null,
                    manualFuel: null
                });
            }

            newSplits.push({
                driver: drv,
                spotter: spt,
                stints: generatedStints
            });
        }
    }
    strategySplits = newSplits;
    isHardCascade = true;

    // ⚖️ ÉTAPE 2 : LE JURISTE (Gommes obligatoires & Robin des Bois)
    applyRegulatoryTires();

    // 🧠 ÉTAPE 3 : LE CERVEAU (Remplissage optimisé)
    optimizeStrategyFilling();

    // 🛡️ SÉCURITÉ : Anti-fusion des arrêts obligatoires
    strategySplits.forEach(split => {
        let rPits = (isSolo || isOnline) ? (parseInt(document.getElementById('global-req-pit-stops')?.value) || 0) : 0;
        let minStints = rPits + 1;

        for (let j = split.stints.length - 2; j >= 0; j--) {
            let current = split.stints[j];
            let next = split.stints[j + 1];
            let preventMerge = (isSolo || isOnline) && (split.stints.length <= minStints);

            if (!preventMerge && !current.isPitted && !next.isPitted && current.tire === next.tire && current.fuelStrat === next.fuelStrat) {
                current.laps += next.laps;
                split.stints.splice(j + 1, 1);
            }
        }
    });

    // ⚙️ ÉTAPE 4 : LE PHYSICIEN (Validation chronométrique & fenêtres)
    cascadeFixPitWindows();

    isHardCascade = false;
    saveFormState();
}
function updateSplitData(splitIdx, field, val) {
    strategySplits[splitIdx][field] = val;
    if (field === 'driver') {
        isHardCascade = true;
        cascadeFixPitWindows();
        isHardCascade = false;
    }
    saveFormState();
    renderStrategy();
}

function updateStintData(splitIdx, stintIdx, field, val) {
    strategySplits[splitIdx].userDeniedAutoStint = false;
    let isLapIncrease = false;

    let oldLaps = strategySplits[splitIdx].stints[stintIdx].laps || 1;
    let oldTarget = strategySplits[splitIdx].windowTarget;

    if (field === 'changeTires') val = (val === true);
    // 🚀 INTERCEPTION ECO : Vérification stricte des données
    if (field === 'fuelStrat' && val === 'eco') {
        let tire = strategySplits[splitIdx].stints[stintIdx].tire;
        let driver = strategySplits[splitIdx].driver;
        if (!hasEcoData(driver, tire)) {
            showErrorModal(`Revoir les paramètres éco pour les pneus ${tire}.`);
            renderStrategy(); // Force la case à revenir sur Attack
            return; // ⛔ Bloque la modification
        }
    }

    // 🚀 INTERCEPTION PNEUS : On interdit de décocher si on dépasse la gomme
    if (field === 'changeTires' && val === false && stintIdx > 0) {
        let split = strategySplits[splitIdx];
        let currentStint = split.stints[stintIdx];
        let prevStint = split.stints[stintIdx - 1];
        let targetTire = prevStint.tire;

        let maxTireLife = getDriverTireLife(split.driver, targetTire);

        let usedLaps = 0;
        for (let k = stintIdx - 1; k >= 0; k--) {
            usedLaps += split.stints[k].laps;
            if (split.stints[k].changeTires || k === 0) break;
        }
        usedLaps += currentStint.laps;

        if (usedLaps > maxTireLife) {
            openExcessModal(`Impossible de conserver ces gommes (${targetTire}).<br>Elles auraient ${usedLaps} tours cumulés (Max: ${maxTireLife}).`);
            renderStrategy(); // Force le DOM à recocher la case visuellement
            return; // ⛔ On stoppe tout, pas de cascade.
        }
    }

    if (field === 'laps') {
        val = Math.max(1, parseInt(val) || 1);
        isLapIncrease = (val > oldLaps);

        // 🚀 CORRECTION A : On ne décoche la cible QUE si on modifie le TOUT DERNIER stint du split
        if (stintIdx === strategySplits[splitIdx].stints.length - 1) {
            if (strategySplits[splitIdx].windowTarget) {
                strategySplits[splitIdx].windowTarget = null;
            }
        }
    }

    if (field === 'manualFuel') {
        strategySplits[splitIdx].stints[stintIdx].manualFuel = (val === '' || isNaN(val)) ? null : parseFloat(val);
    } else {
        strategySplits[splitIdx].stints[stintIdx][field] = val;
    }

    if (field === 'changeTires' && val === false) {
        let nextStint = strategySplits[splitIdx].stints[stintIdx + 1];
        if (nextStint) {
            nextStint.tire = strategySplits[splitIdx].stints[stintIdx].tire;
        }
    }

    // Le moteur s'exécute et nous bloque si nécessaire
    cascadeFixPitWindows(isLapIncrease, splitIdx, stintIdx);

    // 🚀 LOGIQUE INTELLIGENTE : Évaluation post-cascade
    if (field === 'laps' && stintIdx === strategySplits[splitIdx].stints.length - 1 && oldTarget) {
        let newLaps = parseInt(strategySplits[splitIdx].stints[stintIdx].laps);
        if (newLaps !== parseInt(oldLaps)) {
            // Le moteur a AUTORISÉ le changement (tu as navigué dans la marge).
            // Tu abandonnes donc la ligne de sécurité stricte = la case se décoche.
            strategySplits[splitIdx].windowTarget = null;
        } else {
            // Le moteur a ANNULÉ le changement (tu t'es écrasé sur le mur absolu).
            // La cible est toujours active = la case reste cochée.
            strategySplits[splitIdx].windowTarget = oldTarget;
        }
    }

    saveFormState();
    renderStrategy();
}

// 🚀 NOUVELLE FONCTION : Cible de fenêtre
function setWindowTarget(splitIdx, target) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR AJOUTÉ
    strategySplits[splitIdx].windowTarget = target;
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
}

function addStintRow(splitIdx) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    strategySplits[splitIdx].userDeniedAutoStint = false;
    let tires = getAvailableTires();
    let stints = strategySplits[splitIdx].stints;
    let lastStintIdx = stints.length - 1;
    let lastStint = stints[lastStintIdx];

    // 1. Recherche du stint actuellement en piste (premier non validé globalement)
    let firstUnpittedI = -1;
    let firstUnpittedJ = -1;
    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            if (!strategySplits[i].stints[j].isPitted) {
                firstUnpittedI = i;
                firstUnpittedJ = j;
                break;
            }
        }
        if (firstUnpittedI !== -1) break;
    }

    // 2. Le dernier stint de CE split est-il le stint actuellement en piste ?
    let isLastStintActive = (firstUnpittedI === splitIdx && firstUnpittedJ === lastStintIdx);

    // 3. Transfert mathématique : on lui retire 1 tour (s'il en a au moins 2)
    if (lastStint.laps > 1) {
        lastStint.laps -= 1;
    }

    // 4. Création du relais d'urgence (1 tour)
    let newStint = {
        tire: lastStint.tire || tires[0],
        fuelStrat: "push",
        laps: 1,
        changeTires: true,
        isPitted: false,
        lockedTimeSec: null,
        manualFuel: null
    };

    // 5. L'Insertion Intelligente
    if (isLastStintActive) {
        // Cas A : Le pilote est déjà dans son dernier relais. On ajoute la péripétie APRÈS.
        stints.push(newStint);
    } else {
        // Cas B : Le relais est dans le futur. On ajoute la péripétie AVANT ce dernier relais.
        // L'ancien dernier relais reste donc le "dernier", il subira les corrections de la cascade.
        stints.splice(lastStintIdx, 0, newStint);
    }

    // 6. On lance la Cascade vierge : le Cerveau recalcule tout et réajuste
    // le dernier relais par rapport à tes cibles sans croire à un forçage manuel !
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();
}

function openDeleteModal(splitIdx, stintIdx) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    rowToDelete = { splitIdx, stintIdx };
    document.getElementById('delete-modal').classList.remove('hidden');
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.add('hidden'); rowToDelete = null; }

function confirmDeleteRow() {
    if (rowToDelete) {
        strategySplits[rowToDelete.splitIdx].stints.splice(rowToDelete.stintIdx, 1);
        if (strategySplits[rowToDelete.splitIdx].stints.length === 0) {
            let tires = getAvailableTires();
            strategySplits[rowToDelete.splitIdx].stints.push({ tire: tires[0], fuelStrat: "push", laps: 1, changeTires: true, isPitted: false, lockedTimeSec: null, manualFuel: null });
        }

        // 🚀 CORRECTION : Appel vierge pour laisser le moteur appliquer ses cibles !
        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        closeDeleteModal();
    }
}

function openPitModal(i, j) {
    if (!isEngineerMode) return;
    let stint = strategySplits[i].stints[j];
    pitModalTarget = { splitIdx: i, stintIdx: j, startLap: stint.startLap };

    let estimatedLap = stint.endLap;
    let isOvertime = false;

    let str = localStorage.getItem('stratefreez-timer');
    if (str) {
        let timerState = JSON.parse(str);
        if (timerState && timerState.active) {
            let elapsed = getUnifiedTime() - timerState.startTimeReal; // 🚀 MS purs
            let timeInStint = elapsed - stint.startSec;
            if (timeInStint < 0) timeInStint = 0;
            let lapSec = stint.lapSec || 120000; // 🚀 MS
            let calcLap = (stint.startLap || 0) + Math.floor(timeInStint / lapSec) + 1;
            estimatedLap = Math.min(calcLap, stint.endLap);
            if (elapsed >= stint.endSec) isOvertime = true;
        }
    }

    const input = document.getElementById('pit-modal-lap');
    input.value = estimatedLap || '';
    const forceBtn = document.getElementById('modal-btn-force-pit');
    const forceText = document.getElementById('modal-force-pit-text');
    if (forceBtn) forceBtn.classList.toggle('hidden', !isOvertime);
    if (forceText) forceText.classList.toggle('hidden', !isOvertime);

    document.getElementById('pit-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

// 🚀 NOUVELLE FONCTION : Remplace l'ancienne forceAutoPit globale
function confirmForceAutoPit() {
    if (pitModalTarget) {
        let sIdx = pitModalTarget.splitIdx;
        let stIdx = pitModalTarget.stintIdx;
        let stint = strategySplits[sIdx].stints[stIdx];

        // On cale le relais rigoureusement sur sa théorie
        stint.isPitted = true;
        stint.lockedTimeSec = stint.endSec;

        cascadeFixPitWindows();
        saveFormState();
        renderStrategy();
        if (liveTimerActive) timerTick();
        closePitModal();
    }
}

function closePitModal() {
    document.getElementById('pit-modal').classList.add('hidden');
    pitModalTarget = null;
}

function confirmPitIn() {
    if (pitModalTarget) {
        let inputLap = parseInt(document.getElementById('pit-modal-lap').value);
        let errorEl = document.getElementById('pit-error-msg');

        if (inputLap && inputLap > pitModalTarget.startLap) {
            if (errorEl) errorEl.classList.add('hidden');

            let realLaps = inputLap - pitModalTarget.startLap;
            let sIdx = pitModalTarget.splitIdx;
            let stIdx = pitModalTarget.stintIdx;

            strategySplits[sIdx].stints[stIdx].laps = realLaps;
            strategySplits[sIdx].stints[stIdx].isPitted = true;

            let str = localStorage.getItem('stratefreez-timer');
            if (str) {
                let timerState = JSON.parse(str);
                if (timerState && timerState.active) {
                    let elapsed = getUnifiedTime() - timerState.startTimeReal;
                    strategySplits[sIdx].stints[stIdx].lockedTimeSec = elapsed;
                } else {
                    strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;
                }
            } else {
                strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;
            }

            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
            closePitModal();
        } else {
            // 🚀 ERREUR IN-MODAL au lieu de l'alert()
            if (errorEl) {
                errorEl.innerText = "Le tour doit être strictement supérieur au départ du relais.";
                errorEl.classList.remove('hidden');
            }
        }
    }
}

function openUndoPitModal(i, j, currentLaps) {
    if (!isEngineerMode) return; // 🚀 BOUCLIER SPECTATEUR
    undoPitModalTarget = { splitIdx: i, stintIdx: j };
    const input = document.getElementById('undo-pit-modal-lap');
    input.value = currentLaps || '';
    document.getElementById('undo-pit-modal').classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeUndoPitModal() {
    document.getElementById('undo-pit-modal').classList.add('hidden');
    undoPitModalTarget = null;
}

function confirmUndoPit() {
    if (undoPitModalTarget) {
        let inputLaps = parseInt(document.getElementById('undo-pit-modal-lap').value);
        if (inputLaps && inputLaps > 0) {
            let sIdx = undoPitModalTarget.splitIdx;
            let stIdx = undoPitModalTarget.stintIdx;

            strategySplits[sIdx].stints[stIdx].laps = inputLaps;
            strategySplits[sIdx].stints[stIdx].isPitted = false;
            strategySplits[sIdx].stints[stIdx].lockedTimeSec = null;

            cascadeFixPitWindows();
            saveFormState();
            renderStrategy();
        }
        closeUndoPitModal();
    }
}

function copySplit(idx) {
    clipboardStints = JSON.parse(JSON.stringify(strategySplits[idx].stints));
    clipboardStints.forEach(s => { s.isPitted = false; s.lockedTimeSec = null; });
    renderStrategy();
}

function pasteSplit(idx) {
    if (clipboardStints) {
        strategySplits[idx].stints = JSON.parse(JSON.stringify(clipboardStints));
        isHardCascade = true;
        cascadeFixPitWindows();
        isHardCascade = false;
        saveFormState();
        renderStrategy();
    }
}

function applyRegulatoryTires() {
    let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
    let tires = getAvailableTires();
    if (tires.length < 2) return;

    // 🚀 CORRECTION : La règle de type de gomme s'applique à la course entière pour tous les modes !
    if (reqTireChange && strategySplits.length > 0) {
        let lastSplit = strategySplits[strategySplits.length - 1];
        if (lastSplit.stints.length > 0) {
            if (!lastSplit.stints[lastSplit.stints.length - 1].isPitted) {
                let startTire = strategySplits[0].stints[0].tire;
                let diffTire = tires.find(t => t !== startTire) || tires[1];
                lastSplit.stints[lastSplit.stints.length - 1].tire = diffTire;
                lastSplit.stints[lastSplit.stints.length - 1].changeTires = true;
            }
        }
    }

    tires.forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {

            // 1. Règle des SPLITS COMPLETS obligatoires
            let reqFull = parseInt(document.getElementById(`val-${t}-1`)?.value) || 0;
            let hasFull = document.getElementById(`cb-${t}-1`)?.checked;
            if (hasFull && reqFull > 0) {
                let applied = 0;
                for (let i = 0; i < strategySplits.length && applied < reqFull; i++) {
                    let isDedicated = strategySplits[i].stints.every(s => s.tire !== tires[0]);
                    if (!isDedicated) {
                        strategySplits[i].stints.forEach(s => { if (!s.isPitted) { s.tire = t; s.changeTires = true; } });
                        applied++;
                    }
                }
            }

            // 2. Règle du MINIMUM de trains
            let reqMin = parseInt(document.getElementById(`val-${t}-2`)?.value) || 0;
            let hasMin = document.getElementById(`cb-${t}-2`)?.checked;
            if (hasMin && reqMin > 0) {
                let applied = 0;
                for (let i = strategySplits.length - 1; i >= 0 && applied < reqMin; i--) {
                    for (let j = strategySplits[i].stints.length - 1; j >= 0 && applied < reqMin; j--) {
                        if (strategySplits[i].stints[j].tire === tires[0] && !strategySplits[i].stints[j].isPitted) {
                            strategySplits[i].stints[j].tire = t;
                            strategySplits[i].stints[j].changeTires = true;
                            applied++;
                        }
                    }
                }
            }

            // 🚀 3. NOUVELLE LOGIQUE : Application globale du MAXIMUM de trains (Écrêtage Équitable)
            let reqMax = parseInt(document.getElementById(`val-${t}-3`)?.value) || 0;
            let hasMax = document.getElementById(`cb-${t}-3`)?.checked;

            if (hasMax && reqMax > 0) {
                let currentUsage = 0;

                let raceType = document.getElementById('race-type')?.value;
                let isOnline = (raceType === 'online');
                let isSolo = (parseInt(document.getElementById('num-drivers')?.value) === 1);

                // A. Comptage global pour savoir si on est en excédent
                for (let i = 0; i < strategySplits.length; i++) {
                    for (let j = 0; j < strategySplits[i].stints.length; j++) {
                        let stint = strategySplits[i].stints[j];
                        let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                        if ((stint.changeTires || isAbsFirst) && stint.tire === t) {
                            currentUsage++;
                        }
                    }
                }

                // B. Si on dépasse le quota, on active l'algorithme "Robin des Bois"
                if (currentUsage > reqMax) {
                    let excess = currentUsage - reqMax;
                    let currentIndex = tires.indexOf(t);

                    // Gomme de secours (T -> M -> D...)
                    let fallbackTire = tires[currentIndex + 1] || tires[0];
                    if (fallbackTire === t) fallbackTire = tires.find(other => other !== t) || t;

                    let safetyLoop = 1000; // Anti-boucle infinie

                    // Tant qu'il y a un excédent à taxer
                    while (excess > 0 && safetyLoop-- > 0) {

                        let splitWealth = [];
                        let globalMaxWealth = 0;

                        // 1. Calcul de la richesse de chaque relais (en gommes cibles MODIFIABLES)
                        for (let i = 0; i < strategySplits.length; i++) {
                            let changeableCount = 0;
                            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                                let stint = strategySplits[i].stints[j];
                                let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                                if (!stint.isPitted && (stint.changeTires || isAbsFirst) && stint.tire === t) {
                                    changeableCount++;
                                }
                            }
                            splitWealth.push(changeableCount);
                            if (changeableCount > globalMaxWealth) {
                                globalMaxWealth = changeableCount;
                            }
                        }

                        // Si plus aucun pneu n'est modifiable (ex: ils sont tous validés en piste), on arrête tout
                        if (globalMaxWealth === 0) break;

                        // 2. Trouver le relais le plus riche (On part de la FIN pour privilégier le départ en cas d'égalité)
                        let targetSplitIdx = -1;
                        for (let i = strategySplits.length - 1; i >= 0; i--) {
                            if (splitWealth[i] === globalMaxWealth) {
                                targetSplitIdx = i;
                                break;
                            }
                        }

                        // 3. Taxer ce relais (On transforme sa DERNIÈRE gomme cible en gomme de secours)
                        if (targetSplitIdx !== -1) {
                            for (let j = strategySplits[targetSplitIdx].stints.length - 1; j >= 0; j--) {
                                let stint = strategySplits[targetSplitIdx].stints[j];
                                let isAbsFirst = (targetSplitIdx === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

                                if (!stint.isPitted && (stint.changeTires || isAbsFirst) && stint.tire === t) {
                                    stint.tire = fallbackTire;
                                    excess--;
                                    break; // Relais taxé, on quitte cette boucle pour relancer un scan complet
                                }
                            }
                        }
                    }
                }
            }

        }
    });
}

function cascadeFixPitWindows(isLapIncrease = false, manualSplitIdx = -1, manualStintIdx = -1) {
    window.pendingExcessData = null;

    let raceType = document.getElementById('race-type')?.value;
    let isOnline = (raceType === 'online');
    let isSolo = (parseInt(document.getElementById('num-drivers')?.value) === 1);
    let goal = document.getElementById('race-goal')?.value;

    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;

    let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
    let winC_lap = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
    let winC_time_str = document.getElementById('time-pit-window-close')?.value || "";
    let secC = winC_time_str !== "" ? timeStringToSeconds(winC_time_str) : 0; // 🚀 MS

    let totalSecRace = getRaceDurationSeconds(); // 🚀 MS
    let targetLapsRace = parseInt(document.getElementById('race-laps')?.value) || 0;
    let splitsCount = parseInt(document.getElementById('total-splits')?.value) || 1;
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0; // 🚀 MS
    let targetPerRelayLaps = splitsCount > 0 ? Math.floor(targetLapsRace / splitsCount) : 0;

    let rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    let initialFuel = rawFuelStr ? parseFloat(rawFuelStr) : 0;
    let isFuelEnabled = (initialFuel > 0); // 🚀 LE DRAPEAU
    let fillSpeed = parseFloat(document.getElementById('fuel-speed')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 5;

    // 🚀 LES BASES EN MS
    let pitLossBase = (parseFloat(document.getElementById('pit-loss-time')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 35) * 1000;
    let pitTireBase = (parseFloat(document.getElementById('pit-tire-time')?.value.replace(',', '.').replace(/[^\d.]/g, '')) || 6) * 1000;
    let safetyRes = parseFloat(document.getElementById('fuel-reserve')?.value.replace(/[^\d.]/g, '')) || 0;

    if (goal === 'time' && totalSecRace <= 0) return;
    if (goal === 'laps' && targetLapsRace <= 0) return;

    const perfCache = {};
    const getCachedPerf = (driver, tire, strat) => {
        const key = `${driver}-${tire}-${strat}`;
        if (!perfCache[key]) {
            perfCache[key] = {
                tireLife: getDriverTireLife(driver, tire),
                fuelRate: getDriverFuelRate(driver, strat),
                lapSec: Math.max(10, getDriverLapSeconds(driver, tire, strat)) // 🚀 MS avec sécurité 10ms
            };
        }
        return perfCache[key];
    };

    const updateTimeline = () => {
        for (let i = 0; i < strategySplits.length; i++) {
            let globalSecLoop = 0; let globalLapsLoop = 0; let residualTankLoop = initialFuel;

            if (!isOnline && !isSolo && i > 0) {
                let prevSplit = strategySplits[i - 1];
                let prevStint = prevSplit.stints[prevSplit.stints.length - 1];
                globalSecLoop = prevStint.endSec; globalLapsLoop = prevStint.endLap; residualTankLoop = prevStint.residualAtEnd;
            }

            for (let j = 0; j < strategySplits[i].stints.length; j++) {
                let stint = strategySplits[i].stints[j];
                let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
                let laps = parseInt(stint.laps) || 0;

                let perf = getCachedPerf(strategySplits[i].driver, stint.tire, stint.fuelStrat);
                let fuelRate = perf.fuelRate;
                let requiredFuel = laps * fuelRate;
                let targetFuel = isFuelEnabled ? requiredFuel + safetyRes : 0;
                if (isFuelEnabled && stint.manualFuel !== null && stint.manualFuel !== undefined) targetFuel = parseFloat(stint.manualFuel);
                if (isFuelEnabled && targetFuel > 100) targetFuel = 100; // Sécurité plafond

                let pitTime = 0;
                if (isAbsFirst) {
                    residualTankLoop = initialFuel; stint.fuelAddedAtStart = 0;
                } else {
                    pitTime = pitLossBase;
                    if (stint.changeTires) pitTime += pitTireBase;
                    let fuelToAdd = isFuelEnabled ? Math.max(0, targetFuel - residualTankLoop) : 0;
                    stint.fuelAddedAtStart = fuelToAdd;
                    if (fuelToAdd > 0 && fillSpeed > 0) pitTime += (fuelToAdd / fillSpeed) * 1000;
                    residualTankLoop += fuelToAdd;
                    globalSecLoop += pitTime;
                }

                stint.startSec = globalSecLoop; stint.startLap = globalLapsLoop; stint.pitTime = pitTime;
                stint.cachedTargetFuel = targetFuel; stint.fuelRate = fuelRate; stint.lapSec = perf.lapSec;
                residualTankLoop -= requiredFuel;

                if (stint.isPitted && stint.lockedTimeSec !== null) globalSecLoop = stint.lockedTimeSec;
                else globalSecLoop += (laps * stint.lapSec);

                globalLapsLoop += laps; stint.endSec = globalSecLoop; stint.endLap = globalLapsLoop; stint.residualAtEnd = residualTankLoop;

                let nextStint = null, nextDriver = null;
                if (j + 1 < strategySplits[i].stints.length) {
                    nextStint = strategySplits[i].stints[j + 1]; nextDriver = strategySplits[i].driver;
                } else if (i + 1 < strategySplits.length && !isOnline && !isSolo) {
                    nextStint = strategySplits[i + 1].stints[0]; nextDriver = strategySplits[i + 1].driver;
                }

                let fuelToAddForNext = 0, nextPitTime = 0;
                if (nextStint) {
                    let nLaps = parseInt(nextStint.laps) || 0;
                    let nPerf = getCachedPerf(nextDriver, nextStint.tire, nextStint.fuelStrat);
                    let nTargetFuel = isFuelEnabled ? (nLaps * nPerf.fuelRate) + safetyRes : 0;
                    if (isFuelEnabled && nextStint.manualFuel !== null && nextStint.manualFuel !== undefined) nTargetFuel = parseFloat(nextStint.manualFuel);
                    if (isFuelEnabled && nTargetFuel > 100) nTargetFuel = 100;

                    fuelToAddForNext = isFuelEnabled ? Math.max(0, nTargetFuel - residualTankLoop) : 0;
                    nextPitTime = pitLossBase;
                    if (nextStint.changeTires) nextPitTime += pitTireBase;
                    if (fuelToAddForNext > 0 && fillSpeed > 0) nextPitTime += (fuelToAddForNext / fillSpeed) * 1000;
                }
                stint.fuelToAddForNext = fuelToAddForNext; stint.nextPitTime = nextPitTime;
            }
        }
    };

    // 🚀 DÉCISION : forceStrat permet d'exiger la capacité d'un mode spécifique (push ou eco)
    const getStintCapacity = (sIdx, stIdx, forceStrat = null) => {
        let split = strategySplits[sIdx]; let stint = split.stints[stIdx]; let driver = split.driver;

        // 1. Capteur Usure
        let tireLife = getDriverTireLife(driver, stint.tire);
        let hasTireLimit = tireLife > 0;

        let fuelStrat = (forceStrat === 'push' || forceStrat === 'eco') ? forceStrat : stint.fuelStrat;
        let fuelRate = getDriverFuelRate(driver, fuelStrat);

        // Calcul usure
        let tireRem = Infinity;
        if (hasTireLimit) {
            let usedTireLaps = 0;
            if (!stint.changeTires && !(sIdx === 0 && stIdx === 0)) {
                let currS = sIdx, currSt = stIdx - 1;
                while (currS >= 0) {
                    if (currSt < 0) { currS--; if (currS >= 0) currSt = strategySplits[currS].stints.length - 1; else break; }
                    let checkStint = strategySplits[currS].stints[currSt];
                    usedTireLaps += checkStint.laps;
                    if (checkStint.changeTires || (currS === 0 && currSt === 0)) break;
                    currSt--;
                }
            }
            let fS = sIdx, fSt = stIdx + 1;
            while (fS < strategySplits.length) {
                if (fSt >= strategySplits[fS].stints.length) { fS++; fSt = 0; if (fS >= strategySplits.length) break; }
                let checkStint = strategySplits[fS].stints[fSt];
                if (checkStint.changeTires) break;
                usedTireLaps += checkStint.laps;
                fSt++;
            }
            tireRem = Math.max(0, tireLife - usedTireLaps);
        }

        // 2. L'Entonnoir (Voies D et C)
        if (!hasTireLimit && !isFuelEnabled) return Infinity;
        if (!isFuelEnabled) return Math.max(1, tireRem);

        // Calcul Essence (Voies B et A)
        let isAbsFirst = (sIdx === 0 && stIdx === 0) || ((isOnline || isSolo) && stIdx === 0);
        let tankCap = 100;
        if (isAbsFirst) {
            tankCap = initialFuel;
        } else if (stint.manualFuel !== null && stint.manualFuel !== undefined) {
            tankCap = parseFloat(stint.manualFuel);
        }

        let fuelRem = Math.floor((tankCap - safetyRes) / fuelRate);

        if (!hasTireLimit) return Math.max(1, fuelRem); // Voie B
        return Math.max(1, Math.min(tireRem, fuelRem)); // Voie A
    };

    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            strategySplits[i].stints[j].laps = parseInt(strategySplits[i].stints[j].laps) || 1;
            if (strategySplits[i].stints[j].fuelStrat === 'normal') strategySplits[i].stints[j].fuelStrat = 'push';
        }
    }
    updateTimeline();

    // 🚀 L'intelligence de clamping (Fini la boucle infinie Attack/Eco)
    for (let i = 0; i < strategySplits.length; i++) {
        for (let j = 0; j < strategySplits[i].stints.length; j++) {
            let stint = strategySplits[i].stints[j];
            if (stint.isPitted) continue;

            let currentCap = getStintCapacity(i, j); // Capacité dans son mode ACTUEL

            // Si currentCap est Infinity, on n'entre jamais ici. Parfait !
            if (stint.laps > currentCap) {
                let canUseEco = hasEcoData(strategySplits[i].driver, stint.tire);
                let pushCap = getStintCapacity(i, j, 'push');
                let ecoCap = canUseEco ? getStintCapacity(i, j, 'eco') : 0;

                if (stint.fuelStrat === 'push' && canUseEco && ecoCap >= stint.laps) {
                    stint.fuelStrat = 'eco';
                } else if (stint.fuelStrat === 'push' && canUseEco && ecoCap > pushCap) {
                    stint.fuelStrat = 'eco';
                    stint.laps = ecoCap;
                } else {
                    stint.laps = currentCap; // Blocage strict
                }
            }
        }
    }

    let cascadeHalted = false; let haltedAtSplit = -1;

    for (let i = 0; i < strategySplits.length; i++) {
        if (cascadeHalted) break;
        let split = strategySplits[i]; split.targetFailed = false;
        let isLastSplit = (i === strategySplits.length - 1);

        let relayStartIdx = i;
        while (relayStartIdx > 0 && strategySplits[relayStartIdx - 1].driver === split.driver && !isOnline && !isSolo) relayStartIdx--;

        let regOpenSec = 0, regCloseSec = 0, secOpenSec = 0, secCloseSec = 0;
        if (!isOnline && !isSolo && hasPitWindow && splitDurSec > 0) {
            regOpenSec = (i + 1) * splitDurSec - (winOpen * 60000); // 🚀 MS
            regCloseSec = (i + 1) * splitDurSec + (winClose * 60000); // 🚀 MS
            secOpenSec = regOpenSec + 5000; // 🚀 MS
            secCloseSec = regCloseSec - 30000; // 🚀 MS
        }

        let isRelayEnd = false; let tireChanged = false;
        let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;

        if (!isLastSplit && !isOnline && !isSolo) {
            let nextSplit = strategySplits[i + 1];
            isRelayEnd = (split.driver !== nextSplit.driver);
            tireChanged = (split.stints[split.stints.length - 1].tire !== nextSplit.stints[0].tire);
        }

        let isWindowMandatory = isRelayEnd || (reqTireOnWindow && tireChanged && !isSolo && !isOnline);
        let isStartTarget = (split.windowTarget === 'start');
        let isEndTarget = (split.windowTarget === 'end') || (isHardCascade && hasPitWindow && !isOnline && !isSolo);
        let isIntermediateFree = (!isLastSplit && !isStartTarget && !isEndTarget && !isWindowMandatory);

        const adjustLaps = () => {
            let safetyLimit = 500;
            while (safetyLimit-- > 0) {
                updateTimeline();
                let currentSec = split.stints[split.stints.length - 1].endSec;
                let currentLap = split.stints[split.stints.length - 1].endLap;
                let lsTime = split.stints[split.stints.length - 1].lapSec;
                let action = 'none';

                if (isOnline || isSolo) {
                    let relativeSec = currentSec - split.stints[0].startSec;
                    let relativeLap = currentLap - split.stints[0].startLap;
                    if ((isLastSplit || isOnline) && goal === 'time') {
                        // 🚀 LE JUGE ARRONDI : On compare des secondes entières
                        let rSec = Math.round(relativeSec / 1000);
                        let tSec = Math.round((totalSecRace / splitsCount) / 1000);
                        let lsSec = Math.round(lsTime / 1000);
                        if (rSec < tSec) action = 'add';
                        else if (rSec - lsSec >= tSec) action = 'remove';
                    } else if ((isLastSplit || isOnline) && goal === 'laps') {
                        if (relativeLap < targetPerRelayLaps) action = 'add';
                        else if (relativeLap - 1 >= targetPerRelayLaps) action = 'remove';
                    } else if (hasPitWindow) {
                        if (isLapMode && winC_lap > 0) {
                            if (relativeLap < winC_lap) action = 'add';
                            if (relativeLap > winC_lap) action = 'remove';
                        } else if (!isLapMode && secC > 0) {
                            if (relativeSec + lsTime <= secC) action = 'add';
                            if (relativeSec > secC) action = 'remove';
                        }
                    } else if (isHardCascade) {
                        if (goal === 'time' && Math.round(relativeSec / 1000) < Math.round((totalSecRace / splitsCount) / 1000)) action = 'add';
                        else if (goal === 'laps' && relativeLap < targetPerRelayLaps) action = 'add';
                    }
                } else {
                    if (isLastSplit && goal === 'time') {
                        // 🚀 LE JUGE ARRONDI
                        let cSec = Math.round(currentSec / 1000);
                        let tSec = Math.round(totalSecRace / 1000);
                        let lsSec = Math.round(lsTime / 1000);
                        if (cSec < tSec) action = 'add';
                        else if (cSec - lsSec >= tSec) action = 'remove';
                    } else if (isLastSplit && goal === 'laps') {
                        if (currentLap < targetLapsRace) action = 'add';
                        else if (currentLap - 1 >= targetLapsRace) action = 'remove';
                    } else if (isStartTarget) {
                        if (currentSec < secOpenSec) action = 'add';
                        else if (currentSec > secOpenSec + lsTime) action = 'remove';
                    } else if (isEndTarget) {
                        if (currentSec + lsTime <= secCloseSec) action = 'add';
                        else if (currentSec > secCloseSec) action = 'remove';
                    } else if (isWindowMandatory) {
                        if (currentSec < secOpenSec) action = 'add';
                        else if (currentSec > secCloseSec) action = 'remove';
                    } else if (isIntermediateFree && hasPitWindow) {
                        if (i === manualSplitIdx) action = 'none';
                        else {
                            if (currentSec < secOpenSec) action = 'add';
                            else if (currentSec > secCloseSec) action = 'remove';
                        }
                    }
                }

                if (action === 'none') break;

                let modified = false;
                if (action === 'add') {
                    for (let s = i; s >= relayStartIdx; s--) {
                        if (s < i && hasPitWindow && !isOnline && !isSolo) {
                            let sCloseSec = ((s + 1) * splitDurSec) + (winClose * 60000) - 30000; // 🚀 MS
                            let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                            let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                            if (sCurrentEnd + sLapSec > sCloseSec) continue;
                        }
                        for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                            if (s === manualSplitIdx && st === manualStintIdx) continue;
                            let stint = strategySplits[s].stints[st];
                            if (stint.isPitted) continue;
                            if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                let futureEndSec = stint.endSec + stint.lapSec;
                                let futureEndLap = stint.endLap + 1;
                                if (isLapMode && winC_lap > 0 && futureEndLap > winC_lap) continue;
                                if (!isLapMode && secC > 0 && futureEndSec > secC) continue;
                            }
                            if (stint.laps < getStintCapacity(s, st)) { stint.laps++; modified = true; break; }
                        }
                        if (modified) break;
                    }
                    if (!modified) {
                        for (let s = i; s >= relayStartIdx; s--) {
                            if (s < i && hasPitWindow && !isOnline && !isSolo) {
                                let sCloseSec = ((s + 1) * splitDurSec) + (winClose * 60000) - 30000;
                                let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                                let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                                if (sCurrentEnd + sLapSec > sCloseSec) continue;
                            }
                            for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                                if (s === manualSplitIdx && st === manualStintIdx) continue;
                                let stint = strategySplits[s].stints[st];
                                if (stint.isPitted) continue;
                                if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                    let futureEndSec = stint.endSec + stint.lapSec;
                                    let futureEndLap = stint.endLap + 1;
                                    if (isLapMode && winC_lap > 0 && futureEndLap > winC_lap) continue;
                                    if (!isLapMode && secC > 0 && futureEndSec > secC) continue;
                                }
                                if (stint.fuelStrat !== 'eco') {
                                    let canUseEco = hasEcoData(strategySplits[s].driver, stint.tire);
                                    if (canUseEco) {
                                        let pushCap = getStintCapacity(s, st, 'push');
                                        let ecoCap = getStintCapacity(s, st, 'eco');
                                        if (ecoCap > pushCap && stint.laps < ecoCap) { stint.fuelStrat = 'eco'; stint.laps++; modified = true; break; }
                                    }
                                }
                            }
                            if (modified) break;
                        }
                    }
                } else if (action === 'remove') {
                    for (let s = i; s >= relayStartIdx; s--) {
                        if (s < i && hasPitWindow && !isOnline && !isSolo) {
                            let sOpenSec = ((s + 1) * splitDurSec) - (winOpen * 60000) + 5000;
                            let sCurrentEnd = strategySplits[s].stints[strategySplits[s].stints.length - 1].endSec;
                            let sLapSec = strategySplits[s].stints[strategySplits[s].stints.length - 1].lapSec;
                            if (sCurrentEnd - sLapSec < sOpenSec) continue;
                        }
                        for (let st = strategySplits[s].stints.length - 1; st >= 0; st--) {
                            if (s === manualSplitIdx && st === manualStintIdx) continue;
                            let stint = strategySplits[s].stints[st];
                            if ((isSolo || isOnline) && hasPitWindow && st < strategySplits[s].stints.length - 1) {
                                let futureEndSec = stint.endSec - stint.lapSec;
                                let futureEndLap = stint.endLap - 1;
                                let winO_lap = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                                let secO = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || "");
                                if (isLapMode && winO_lap > 0 && futureEndLap < winO_lap) continue;
                                if (!isLapMode && secO > 0 && futureEndSec < secO) continue;
                            }
                            if (!stint.isPitted && stint.laps > 1) { stint.laps--; modified = true; break; }
                        }
                        if (modified) break;
                    }
                }
                if (!modified) break;
            }
        };

        adjustLaps();

        let canCreateStint = (i === manualSplitIdx) || isHardCascade;
        let mustReachWall = (isLastSplit || isOnline || isStartTarget || isEndTarget || isWindowMandatory);

        if (canCreateStint && mustReachWall) {
            updateTimeline();
            let fSec = split.stints[split.stints.length - 1].endSec;
            let fLap = split.stints[split.stints.length - 1].endLap;
            let lsTime = split.stints[split.stints.length - 1].lapSec;
            let missingSec = 0; let missingLaps = 0;

            if (isOnline || isSolo) {
                let relativeSec = fSec - split.stints[0].startSec;
                let relativeLap = fLap - split.stints[0].startLap;
                let rSecRound = Math.round(relativeSec / 1000);
                let tSecRound = Math.round((totalSecRace / splitsCount) / 1000);

                if ((isLastSplit || isOnline) && goal === 'time') {
                    if (rSecRound < tSecRound) missingSec = (totalSecRace / splitsCount) - relativeSec;
                } else if ((isLastSplit || isOnline) && goal === 'laps') {
                    if (relativeLap < targetPerRelayLaps) missingLaps = targetPerRelayLaps - relativeLap;
                } else if (hasPitWindow) {
                    if (isLapMode && winC_lap > 0) {
                        if (relativeLap < winC_lap) missingLaps = winC_lap - relativeLap;
                    } else if (!isLapMode && secC > 0) {
                        if (relativeSec + lsTime <= secC) missingSec = secC - relativeSec;
                    }
                } else if (isHardCascade) {
                    if (goal === 'time' && rSecRound < tSecRound) missingSec = (totalSecRace / splitsCount) - relativeSec;
                    else if (goal === 'laps' && relativeLap < targetPerRelayLaps) missingLaps = targetPerRelayLaps - relativeLap;
                }
            } else {
                if (isLastSplit && goal === 'time') {
                    if (Math.round(fSec / 1000) < Math.round(totalSecRace / 1000)) missingSec = totalSecRace - fSec;
                } else if (isLastSplit && goal === 'laps') {
                    if (fLap < targetLapsRace) missingLaps = targetLapsRace - fLap;
                } else if (isStartTarget) {
                    if (fSec < secOpenSec) missingSec = secOpenSec - fSec;
                } else if (isEndTarget) {
                    if (fSec < secCloseSec - lsTime) missingSec = secCloseSec - fSec;
                } else if (isWindowMandatory && fSec < regOpenSec) {
                    missingSec = secOpenSec - fSec;
                }
            }

            let lapsToAdd = missingLaps > 0 ? missingLaps : (missingSec > 0 ? Math.ceil(missingSec / lsTime) : 0);
            let lastStint = split.stints[split.stints.length - 1];

            // 🚀 LE FIX : On demande la permission au détecteur avant d'imaginer une capacité Éco !
            let canUseEcoExt = hasEcoData(split.driver, lastStint.tire);
            let pushCap = getStintCapacity(i, split.stints.length - 1, 'push');
            let ecoCap = canUseEcoExt ? getStintCapacity(i, split.stints.length - 1, 'eco') : 0;

            let maxPhysicalCap = Math.max(pushCap, ecoCap);
            let safetyLoop = 150; let hasAddedStints = false;

            while (lapsToAdd > 0 && lastStint.laps >= maxPhysicalCap && safetyLoop-- > 0) {
                hasAddedStints = true;
                split.stints.push({ tire: lastStint.tire, fuelStrat: 'push', laps: 1, changeTires: true, isPitted: false, lockedTimeSec: null, manualFuel: null });
                let newStintIdx = split.stints.length - 1;

                let newPushCap = getStintCapacity(i, newStintIdx, 'push');
                let newEcoCap = canUseEcoExt ? getStintCapacity(i, newStintIdx, 'eco') : 0;

                let newMaxCap = Math.max(newPushCap, newEcoCap);

                let lapsForThisStint = Math.min(lapsToAdd, newMaxCap);

                // 🚀 LE FIX : Si les tours injectés dépassent la capacité Attack, 
                // on corrige l'étiquette en Éco dès la naissance du relais !
                if (canUseEcoExt && lapsForThisStint > newPushCap) {
                    split.stints[newStintIdx].fuelStrat = 'eco';
                }

                split.stints[newStintIdx].laps = lapsForThisStint;

                lapsToAdd -= lapsForThisStint;
                lastStint = split.stints[newStintIdx];
                maxPhysicalCap = newMaxCap;
                updateTimeline();
            }
            if (hasAddedStints) adjustLaps();
        }

        updateTimeline();
        let finalSec = split.stints[split.stints.length - 1].endSec;
        let finalLap = split.stints[split.stints.length - 1].endLap;
        let lsTime = split.stints[split.stints.length - 1].lapSec;
        let haltMsg = "";

        if (!isOnline && !isSolo) {
            if (isLastSplit) {
                // 🚀 LE JUGE ARRONDI
                if (goal === 'time' && Math.round(finalSec / 1000) < Math.round(totalSecRace / 1000)) {
                    split.targetFailed = true; haltMsg = `Capacité insuffisante pour atteindre la fin de course (Relais ${i + 1}).`;
                } else if (goal === 'laps' && finalLap < targetLapsRace) {
                    split.targetFailed = true; haltMsg = `Capacité insuffisante pour atteindre le tour cible (Relais ${i + 1}).`;
                }
            } else if (isStartTarget && finalSec < secOpenSec) {
                split.targetFailed = true; haltMsg = `Cible "Début" inatteignable (Relais ${i + 1}).`;
            } else if (isEndTarget && finalSec < secCloseSec - lsTime && !isHardCascade) {
                split.targetFailed = true; haltMsg = `Cible "Fin" inatteignable (Relais ${i + 1}).`;
            } else if (isWindowMandatory && hasPitWindow && splitDurSec > 0) {
                if (finalSec < regOpenSec || finalSec > regCloseSec) {
                    split.targetFailed = true; haltMsg = `Le Relais ${i + 1} rate sa fenêtre obligatoire (Mur Absolu).`;
                }
            }
        }

        if (split.targetFailed) {
            cascadeHalted = true; haltedAtSplit = i;
            if (!window.pendingExcessMsg && !isHardCascade) {
                window.pendingExcessMsg = `🚨 PARE-FEU : ${haltMsg} Cascade bloquée.`;
                setTimeout(() => openExcessModal(window.pendingExcessMsg), 100);
            }
            break;
        }
    }
    window.pendingExcessMsg = null;
}

function checkGlobalRules() {
    let rulesErrors = [];
    let splitCount = {};
    let tireTrains = { T: 0, M: 0, D: 0, I: 0, P: 0 };
    let tireFullSplits = { T: 0, M: 0, D: 0, I: 0, P: 0 };
    let currentTrainTire = null;

    let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
    let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;
    let reqPits = parseInt(document.getElementById('global-req-pit-stops')?.value) || 0;

    let raceType = document.getElementById('race-type')?.value;
    let isOnline = raceType === 'online';
    let isSolo = parseInt(document.getElementById('num-drivers').value) === 1;

    let hasPitWindow = document.getElementById('enable-pit-window')?.checked;
    let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;

    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
    let winO_time = timeStringToSeconds(document.getElementById('time-pit-window-open')?.value || ""); // 🚀 MS
    let winC_time = timeStringToSeconds(document.getElementById('time-pit-window-close')?.value || ""); // 🚀 MS
    let winO_lap = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
    let winC_lap = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;

    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let totalSecRace = getRaceDurationSeconds(); // 🚀 MS
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0; // 🚀 MS

    let goal = document.getElementById('race-goal')?.value;
    let targetLapsRace = parseInt(document.getElementById('race-laps')?.value) || 0;
    let isGlobalObjectiveMet = true;

    // 🚀 1. VÉRIFICATION DE L'OBJECTIF GLOBAL
    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];
        let isLastSplit = (i === strategySplits.length - 1);
        let splitEndSec = split.stints[split.stints.length - 1].endSec || 0;
        let splitLaps = (split.stints[split.stints.length - 1].endLap || 0) - (split.stints[0].startLap || 0);

        if (isOnline || isSolo) {
            if (goal === 'time') {
                if (Math.round(splitEndSec / 1000) < Math.round(splitDurSec / 1000)) isGlobalObjectiveMet = false;
            } else {
                let targetPerRelay = Math.floor(targetLapsRace / splitsCount);
                if (isLastSplit) targetPerRelay = targetLapsRace - (i * targetPerRelay);
                if (splitLaps < targetPerRelay) isGlobalObjectiveMet = false;
            }
        } else {
            if (isLastSplit) {
                if (goal === 'time') {
                    if (Math.round(splitEndSec / 1000) < Math.round(totalSecRace / 1000)) isGlobalObjectiveMet = false;
                } else {
                    if (split.stints[split.stints.length - 1].endLap < targetLapsRace) isGlobalObjectiveMet = false;
                }
            }
        }
    }

    let bilanHTML = "<ul class='list-unstyled'>";

    // 🚀 INJECTION DANS LA MODALE
    if (!isGlobalObjectiveMet) {
        rulesErrors.push("L'objectif final (temps/tours) n'est pas couvert par la stratégie");
        bilanHTML += `<li class="mb-10 pb-10 border-bottom-dashed"><strong class="text-danger">⚠️ Objectif global (temps / tours) non atteint</strong></li>`;
    } else {
        bilanHTML += `<li class="mb-10 pb-10 border-bottom-dashed"><strong class="text-success">🏁 Objectif global (temps / tours) atteint</strong></li>`;
    }

    let tireFails = { T: [], M: [], D: [], I: [], P: [] };
    let lastTireUsed = null;

    function isPitInWindow(pitSec, pitLap, relayStartSec, relayStartLap) {
        if (!hasPitWindow) return true;
        if (isSolo || isOnline) {
            let relativeLap = pitLap - relayStartLap;
            let relativeSec = pitSec - relayStartSec;
            if (isLapMode) {
                if (winO_lap === 0 && winC_lap === 0) return true;
                return (relativeLap >= winO_lap && relativeLap <= winC_lap);
            } else {
                if (winO_time === 0 && winC_time === 0) return true;
                return (relativeSec >= winO_time && relativeSec <= winC_time);
            }
        } else {
            let winOpenSec = winOpen * 60000;
            let winCloseSec = winClose * 60000;
            for (let k = 0; k < splitsCount; k++) {
                let targetSec = (k + 1) * splitDurSec;
                if (pitSec >= targetSec - winOpenSec && pitSec <= targetSec + winCloseSec) return true;
            }
            return false;
        }
    }

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];
        splitCount[split.driver] = (splitCount[split.driver] || 0) + 1;
        let splitTires = new Set();
        let pitsInSplit = split.stints.length - 1;

        if (isOnline && !isSolo) {
            if (reqPits > 0) {
                let ok = pitsInSplit >= reqPits;
                let colClass = ok ? 'text-success' : 'text-danger';
                bilanHTML += `<li>Relais ${i + 1} - Arrêts : <span class="${colClass}">${pitsInSplit} / ${reqPits}</span></li>`;
                if (!ok) rulesErrors.push(`Relais ${i + 1}: ${reqPits} arrêt(s) requis.`);
            }
        }

        for (let j = 0; j < split.stints.length; j++) {
            let stint = split.stints[j];
            let isAbsFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

            let actualTire = stint.tire;
            if (!stint.changeTires && !isAbsFirst && currentTrainTire) actualTire = currentTrainTire;

            if (!isOnline || isSolo) splitTires.add(actualTire);

            if (stint.changeTires || isAbsFirst) {
                if (actualTire) tireTrains[actualTire]++;
                currentTrainTire = actualTire;
            }

            let isPit = !isAbsFirst;
            if (isPit && hasPitWindow) {
                let prevStint = (j > 0) ? split.stints[j - 1] : strategySplits[i - 1].stints[strategySplits[i - 1].stints.length - 1];
                let relayStartSec = split.stints[0].startSec;
                let relayStartLap = split.stints[0].startLap;

                let pitInWindow = isPitInWindow(prevStint.endSec, prevStint.endLap, relayStartSec, relayStartLap);
                let termLabel = (raceType === 'online') ? 'Relais' : 'Split';

                if (isSolo || isOnline) {
                    if (!pitInWindow) {
                        let msg = `Arrêt aux stands hors fenêtre`;
                        rulesErrors.push(`${termLabel} ${i + 1} : ${msg}`);
                        bilanHTML += `<li>${termLabel} ${i + 1} : <span class="text-danger">${msg}</span></li>`;
                    }
                } else {
                    if (!pitInWindow) {
                        let isInterSplit = (j === 0 && i > 0);
                        let isDriverChange = isInterSplit && (strategySplits[i - 1].driver !== split.driver);
                        let isTireChange = (reqTireOnWindow && lastTireUsed && actualTire !== lastTireUsed);

                        let culpritSplit = isInterSplit ? i : i + 1;

                        if (isDriverChange) {
                            let msg = `Changement de pilote hors fenêtre`;
                            rulesErrors.unshift(`${termLabel} ${culpritSplit} : ${msg}`);
                            bilanHTML += `<li>${termLabel} ${culpritSplit} : <span class="text-danger font-weight-bold">${msg}</span></li>`;
                        } else if (isTireChange) {
                            let msg = `Gomme changée hors fenêtre (${lastTireUsed} ➔ ${actualTire})`;
                            rulesErrors.push(`${termLabel} ${culpritSplit} : ${msg}`);
                            bilanHTML += `<li>${termLabel} ${culpritSplit} : <span class="text-danger">${msg}</span></li>`;
                        }
                    }
                }
            }
            lastTireUsed = actualTire;
        }

        let startedLate = false;
        let endedEarly = false;

        if (hasPitWindow && (!isSolo && !isOnline)) {
            let pitEntryAtStart = split.stints[0].startSec;
            if (i > 0) {
                let prevSplit = strategySplits[i - 1];
                pitEntryAtStart = prevSplit.stints[prevSplit.stints.length - 1].endSec;
            }

            let endSec = split.stints[split.stints.length - 1].endSec;

            if (splitDurSec > 0) {
                let winOpenSec = winOpen * 60000;
                let winCloseSec = winClose * 60000;

                if (i > 0) {
                    let startTheo = i * splitDurSec;
                    if (pitEntryAtStart > startTheo + winCloseSec) {
                        startedLate = true;
                    }
                }

                if (i < strategySplits.length - 1) {
                    let endTheo = (i + 1) * splitDurSec;
                    if (endSec < endTheo - winOpenSec) {
                        endedEarly = true;
                    }
                }
            }
        }

        if (splitTires.size === 1) {
            let t = Array.from(splitTires)[0];
            if (t) {
                let finalValidity = true;
                let failDetail = [];

                if (startedLate) {
                    let prevHasSameTire = false;
                    if (i > 0) {
                        let prevStints = strategySplits[i - 1].stints;
                        if (prevStints[prevStints.length - 1].tire === t) prevHasSameTire = true;
                    }
                    if (!prevHasSameTire) {
                        finalValidity = false;
                        failDetail.push("Démarré trop tard");
                    }
                }

                if (endedEarly) {
                    let nextHasSameTire = false;
                    if (i < strategySplits.length - 1) {
                        if (strategySplits[i + 1].stints[0].tire === t) nextHasSameTire = true;
                    }
                    if (!nextHasSameTire) {
                        finalValidity = false;
                        failDetail.push("Terminé trop tôt");
                    }
                }

                if (finalValidity) {
                    tireFullSplits[t]++;
                } else {
                    let termLabel = (raceType === 'online') ? 'Relais' : 'Split';
                    tireFails[t].push(`${termLabel} ${i + 1} (${failDetail.join(' et ')})`);
                }
            }
        }
    }

    let raceTires = new Set();
    let totalPits = 0;
    strategySplits.forEach(sp => {
        sp.stints.forEach(s => raceTires.add(s.tire));
        totalPits += sp.stints.length;
    });
    totalPits -= strategySplits.length;

    if (reqTireChange) {
        let ok = raceTires.size >= 2;
        let colClass = ok ? 'text-success' : 'text-danger';
        bilanHTML += `<li>Gommes (Course) : <span class="${colClass}">${raceTires.size} / 2 types</span></li>`;
        if (!ok) rulesErrors.push(`Course: 2 types de gommes requis.`);
    }

    if (reqPits > 0 && (!isOnline || isSolo)) {
        let ok = totalPits >= reqPits;
        let colClass = ok ? 'text-success' : 'text-danger';
        bilanHTML += `<li>Arrêts (Course) : <span class="${colClass}">${totalPits} / ${reqPits}</span></li>`;
        if (!ok) rulesErrors.push(`Course: ${reqPits} arrêt(s) requis.`);
    }

    let reqSplits = parseInt(document.getElementById('mandatory-splits')?.value) || 0;
    if (reqSplits > 0 && !isSolo) {
        let termName = (raceType === 'online') ? 'relais' : 'splits';
        getAvailableDrivers().forEach(d => {
            let count = splitCount[d] || 0;
            let ok = count >= reqSplits;
            let colClass = ok ? 'text-success' : 'text-danger';
            bilanHTML += `<li>Pilote ${d} : <span class="${colClass}">${count} / ${reqSplits} ${termName}</span></li>`;
            if (!ok) rulesErrors.push(`Pilote ${d} : ${count}/${reqSplits} ${termName}.`);
        });
    }

    bilanHTML += "</ul><div class='mt-15 pt-10 border-top-dashed'><ul class='list-unstyled'>";

    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {
            let reqFull = parseInt(document.getElementById(`val-${t}-1`)?.value);
            let reqMin = parseInt(document.getElementById(`val-${t}-2`)?.value);
            let reqMax = parseInt(document.getElementById(`val-${t}-3`)?.value);
            let hasFull = document.getElementById(`cb-${t}-1`)?.checked && reqFull > 0;
            let hasMin = document.getElementById(`cb-${t}-2`)?.checked && reqMin > 0;
            let hasMax = document.getElementById(`cb-${t}-3`)?.checked && reqMax > 0;

            let term = (raceType === 'online') ? 'Relais' : 'Split';
            bilanHTML += `<li class="mb-5"><strong>Gomme ${t} :</strong><br>`;

            if (!hasFull && !hasMin && !hasMax) {
                bilanHTML += `<span class="text-success">Libre (${tireTrains[t]} train(s) utilisé(s))</span><br>`;
            } else {
                if (hasFull) {
                    let ok = tireFullSplits[t] >= reqFull;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">${term} complets : ${tireFullSplits[t]} / ${reqFull}</span><br>`;
                    if (!ok) {
                        rulesErrors.push(`Gomme ${t} : ${reqFull} ${term} complets requis.`);
                        if (tireFails[t] && tireFails[t].length > 0) {
                            bilanHTML += `<div class="text-warning fs-085 ml-15 mt-5">⚠️ Refusé(s) : ${tireFails[t].join(', ')}</div>`;
                        }
                    }
                }
                if (hasMin) {
                    let ok = tireTrains[t] >= reqMin;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">Trains utilisés : ${tireTrains[t]} / ${reqMin}</span><br>`;
                    if (!ok) rulesErrors.push(`Gomme ${t} : Minimum ${reqMin} trains.`);
                }
                if (hasMax) {
                    let ok = tireTrains[t] <= reqMax;
                    let colClass = ok ? 'text-success' : 'text-danger';
                    bilanHTML += `<span class="${colClass}">Trains limités : ${tireTrains[t]} / ${reqMax}</span><br>`;
                    if (!ok) rulesErrors.push(`Gomme ${t} : Maximum ${reqMax} trains.`);
                }
            }
            bilanHTML += `</li>`;
        }
    });

    bilanHTML += "</ul></div>";
    document.getElementById('bilan-content').innerHTML = bilanHTML;

    window.hasGlobalAlert = (rulesErrors.length > 0);
    window.globalAlertText = rulesErrors.join(" | ");
}

function renderStrategy() {
    const container = document.getElementById('strategy-blocks-container');
    const errorScreen = document.getElementById('strategy-insufficient-data');
    let scan = checkRequiredFields();

    // 🚀 LE BOUCLIER : Si données manquantes, on bloque les calculs et on affiche l'écran
    if (!scan.isValid) {
        container.innerHTML = '';
        container.classList.add('hidden');
        if (errorScreen) errorScreen.classList.remove('hidden');

        let teamValidation = document.getElementById('global-team-validation');
        if (teamValidation) teamValidation.classList.add('hidden');

        updateAlertVisibility();
        return; // STOP. On ne calcule pas le tableau fantôme.
    }
    // 🚀 LA PREMIÈRE GÉNÉRATION EST VALIDÉE
    let wasFirstBuild = !isFirstStrategyBuilt;
    isFirstStrategyBuilt = true;

    if (wasFirstBuild) {
        triggerCloudSync(); // 🚀 Envoie instantanément la coquille parfaite au Cloud !

        // 🚀 NOTIFICATION VISUELLE SÉCURISÉE (Uniquement pour le vrai créateur)
        let isCreator = sessionStorage.getItem('justCreatedRace_' + currentRaceId);

        if (isCreator === 'true') {
            sessionStorage.removeItem('justCreatedRace_' + currentRaceId); // 🚀 On déchire le ticket (anti-F5)

            let banner = document.getElementById('end-race-banner');
            let inputVal = document.getElementById('race-name-input')?.value?.trim();
            // Utilisation des backticks (Alt Gr + 7 sur un clavier Windows)
            let raceName = inputVal ? `Course "${inputVal}"` : "Course";
            if (banner) {
                let oldText = banner.innerText;
                let oldBg = banner.style.background;
                banner.innerText = `✅ ${raceName} générée et partagée`;
                banner.style.background = "#2196F3";
                banner.classList.remove('hidden');
                setTimeout(() => {
                    banner.classList.add('hidden');
                    banner.style.background = oldBg;
                    banner.innerText = oldText;
                }, 4000);
            }
        }
    }

    // Feu vert : On cache l'erreur et on génère le tableau
    container.classList.remove('hidden');
    if (errorScreen) errorScreen.classList.add('hidden');
    container.innerHTML = '';
    const raceType = document.getElementById('race-type')?.value || 'irl';
    const goal = document.getElementById('race-goal')?.value;
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);

    let drvOptsArr = getAvailableDrivers();
    let sptOptsArr = getAvailableSpotters();
    let tireOptsArr = getAvailableTires();
    let rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    let initialFuel = rawFuelStr ? parseFloat(rawFuelStr) : 0;
    let isFuelEnabled = (initialFuel > 0);

    let grandTotalLaps = 0;
    let totalSecRace = getRaceDurationSeconds(); // 🚀 MS
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0; // 🚀 MS
    let relayIndexTracker = 0;

    let strTimer = localStorage.getItem('stratefreez-timer');
    let timerState = strTimer ? JSON.parse(strTimer) : null;
    let isGlobalObjectiveMet = true;

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];
        let isLastSplit = (i === strategySplits.length - 1);
        let isRelayEnd = isLastSplit || (isOnline ? true : (split.driver !== strategySplits[i + 1].driver));
        let isRelayStart = (i === 0) || (isOnline ? true : (split.driver !== strategySplits[i - 1].driver));

        if (isRelayStart) relayIndexTracker++;

        let relayClass = "";
        if (!isOnline && !isSolo) {
            let prevSame = (i > 0 && split.driver === strategySplits[i - 1].driver);
            let nextSame = (i < strategySplits.length - 1 && split.driver === strategySplits[i + 1].driver);
            if (prevSame || nextSame) {
                if (!prevSame && nextSame) relayClass = "relay-start multi-relay";
                else if (prevSame && nextSame) relayClass = "relay-middle multi-relay";
                else if (prevSame && !nextSame) relayClass = "relay-end multi-relay";
            }
        }

        let splitTitle = "SPLIT " + (i + 1);
        if (isOnline || isSolo) {
            splitTitle = drvOptsArr.length > 1 ? "RELAIS " + (i + 1) : "COURSE";
        }

        let realStartSec = 0;
        if (isOnline || isSolo) {
            realStartSec = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
        } else {
            realStartSec = timeStringToSeconds(document.getElementById(`start-time-1`)?.value || "00:00") + (i * splitDurSec);
        }

        // 🚀 AFFICHAGE : Conversion ms -> sec -> heures
        let displayStartSec = Math.round(realStartSec / 1000);
        let rsH = String(Math.floor(displayStartSec / 3600) % 24).padStart(2, '0');
        let rsM = String(Math.floor((displayStartSec % 3600) / 60)).padStart(2, '0');

        let drvOpts = drvOptsArr.map(d => `<option value="${d}" ${d === split.driver ? 'selected' : ''}>${d}</option>`).join('');

        let validSpotters = sptOptsArr.filter(s => s !== split.driver);
        let sptOpts = validSpotters.map(s => `<option value="${s}" ${s === split.spotter ? 'selected' : ''}>${s}</option>`).join('');
        let sptSelectHTML = validSpotters.length ? `<select class="header-spotter" onchange="updateSplitData(${i}, 'spotter', this.value)"><option value="">Sans Spotter</option>${sptOpts}</select>` : '';

        let copyBtn = `<span class="material-symbols-outlined icon-action" title="Copier ce split" onclick="copySplit(${i})">content_copy</span>`;
        let pasteBtn = clipboardStints ? `<span class="material-symbols-outlined icon-action paste-active" title="Coller la stratégie" onclick="pasteSplit(${i})">content_paste</span>` : '';

        let startBtn = '';
        let isFinished = split.isFinished;

        if (!isFinished) {
            if ((!isOnline && i === 0) || isOnline) {
                let isRunning = timerState && timerState.active && ((!isOnline) || (isOnline && timerState.splitIdx === i));
                if (!isRunning) {
                    startBtn = `<button class="action-btn start-btn" onclick="startLiveTimer(${i})"><span class="material-symbols-outlined icon-sm">play_arrow</span> START</button>`;
                }
            }
        }

        let tableRowsHTML = '';
        for (let j = 0; j < split.stints.length; j++) {
            let stint = split.stints[j];
            let isAbsoluteFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);
            let isFinalStintOfBlock = (j === split.stints.length - 1);
            let isHistorical = stint.isPitted;
            let disabledAttr = isHistorical ? 'disabled' : '';

            let isLockedStint = false;
            if (!isHistorical) {
                isLockedStint = (isOnline || isSolo) ? isFinalStintOfBlock : (isLastSplit && isFinalStintOfBlock);
            }

            let lockedTire = (!isAbsoluteFirst && !stint.changeTires && !isHistorical) ?
                ((j > 0) ? split.stints[j - 1].tire : strategySplits[i - 1].stints[strategySplits[i - 1].stints.length - 1].tire) : null;

            let targetFuelForStint = (stint.manualFuel !== null && stint.manualFuel !== undefined) ? parseFloat(stint.manualFuel) : (stint.cachedTargetFuel || initialFuel);

            // 🚀 AFFICHAGE : Conversion du pit time en ms vers secondes
            let pitStr = isAbsoluteFirst ? "Départ" : (stint.pitTime ? Math.ceil(stint.pitTime / 1000) + "s" : "-");

            let cbPneusHTML = isAbsoluteFirst ? `<input type="checkbox" disabled checked title="Départ">` : `<input type="checkbox" ${stint.changeTires ? 'checked' : ''} ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'changeTires', this.checked)">`;

            let noFuelFlag = !isAbsoluteFirst && (stint.fuelAddedAtStart === 0);
            let pitDisplay = (!isAbsoluteFirst && noFuelFlag) ? `<span class="pit-no-fuel text-success" title="PIT sans essence">${pitStr}</span>` : pitStr;

            let tOpts = tireOptsArr.map(t => `<option value="${t}" class="bg-tire-${t}" ${t === stint.tire ? 'selected' : ''}>${t}</option>`).join('');
            let tClass = stint.tire ? `bg-tire-${stint.tire}` : '';
            let lockIconText = `<span class="material-symbols-outlined icon-sm ml-5 icon-align-middle">lock</span>`;
            let tireSelectHTML = (lockedTire && !isAbsoluteFirst) ? `<div class="table-select locked-sim flex-center">${lockedTire} ${lockIconText}</div>` : `<select class="table-select ${tClass}" ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'tire', this.value)">${tOpts}</select>`;

            // 🚀 AFFICHAGE : Conversion du endSec
            let displayEnd = Math.round((stint.endSec || 0) / 1000);
            let endH = String(Math.floor(displayEnd / 3600)).padStart(2, '0');
            let endM = String(Math.floor((displayEnd % 3600) / 60)).padStart(2, '0');
            let endS = String(Math.floor(displayEnd % 60)).padStart(2, '0');
            let timeStr = `${endH}:${endM}:${endS}`;

            let trClass = lastActiveStint === `${i}-${j}` ? 'active-stint' : '';
            if (isHistorical) trClass += ' is-historical';

            let fuelClass = `bg-fuel-${stint.fuelStrat}`;
            let fuelRateDisplay = (stint.fuelRate || 0).toFixed(2) + " L/t";
            let manualFuelClass = stint.manualFuel !== null ? 'manual-override-text' : '';

            let fuelCellHTML = "";
            if (!isFuelEnabled) {
                fuelCellHTML = `<span class="inline-block px-5 py-2 text-warning font-weight-bold">-</span>`;
            } else {
                fuelCellHTML = isAbsoluteFirst ? `<span class="px-5 py-2">${initialFuel.toFixed(1)}<span class="unite"> L</span></span>` :
                    (isHistorical ? `<span class="inline-block px-5 py-2">${targetFuelForStint.toFixed(1)}<span class="unite"> L</span></span>` :
                        `<span class="inline-block cursor-pointer px-5 py-2 border-radius-4 ${manualFuelClass}" onclick="openFuelModal(${i}, ${j}, ${stint.cachedTargetFuel})">${targetFuelForStint.toFixed(1)}<span class="unite"> L</span></span>`);
            }

            let lapsInputHTML = (isLockedStint || isHistorical) ?
                `<input type="text" class="table-input" value="${stint.laps}" disabled title="Verrouillé">` :
                `<input type="number" inputmode="decimal" class="table-input" value="${stint.laps}" onchange="updateStintData(${i}, ${j}, 'laps', this.value)">`;

            let isUltimateStint = isOnline ? (j === split.stints.length - 1) : (isLastSplit && j === split.stints.length - 1);
            let actionBtnHTML = "";

            if (isUltimateStint) {
                actionBtnHTML = `<button class="action-btn pit-btn finish-line-placeholder" title="Ligne d'arrivée">PIT<span class="hide-on-mobile"> IN</span></button>`;
            } else {
                actionBtnHTML = isHistorical ?
                    `<button class="action-btn btn-invisible" onclick="openUndoPitModal(${i}, ${j}, ${stint.laps})" title="Annuler le PIT IN">✅</button>` :
                    `<button class="action-btn magic-btn pit-btn" onclick="openPitModal(${i}, ${j}, ${stint.startLap}, ${stint.endLap})">PIT<span class="hide-on-mobile"> IN</span></button>`;
            }

            let timeClass = isFinalStintOfBlock ? "last-stint-highlight" : "time-cell";

            tableRowsHTML += `
            <tr data-stint="${i}-${j}" data-split-idx="${i}" data-start-sec="${stint.startSec}" data-end-sec="${stint.endSec}" class="${trClass}">
                <td class="zone-pit">${cbPneusHTML}</td>
                <td class="zone-pit fuel-cell">${fuelCellHTML}</td>
                <td class="zone-pit zone-border">${pitDisplay}</td>
                <td class="zone-config"><div class="input-cell">${tireSelectHTML}</div></td>
                <td class="zone-config">
                    <div class="flex-center gap-10">
                        <select class="table-select ${fuelClass} w-100px" ${disabledAttr} onchange="updateStintData(${i}, ${j}, 'fuelStrat', this.value)">
                            <option value="push" class="bg-fuel-push" ${stint.fuelStrat === 'push' ? 'selected' : ''}>Attack</option>
                            <option value="eco" class="bg-fuel-eco" ${stint.fuelStrat === 'eco' ? 'selected' : ''}>Éco</option>
                        </select>
                        <span class="fuel-rate-display ${fuelClass}">${fuelRateDisplay}</span>
                    </div>
                </td>
                <td class="zone-config zone-border"><div class="input-cell">${lapsInputHTML}</div></td>
                <td class="zone-end">${actionBtnHTML}</td>
                <td class="zone-end zone-border fin-stint-cell">
                    <div class="fin-stint-wrapper">
                        <div class="tour-block">
                            <span class="blue-arrow-bg"><span class="material-symbols-outlined">arrow_forward</span></span>
                            <span class="tour-number">${stint.endLap}</span>
                        </div>
                        <div class="time-block">
                            <span class="${timeClass}">${timeStr}</span>
                        </div>
                    </div>
                </td>
                <td class="delete-cell">
                    ${isHistorical ? `<span class="material-symbols-outlined text-grey fs-20" title="Verrouillé">lock</span>` : `<button class="btn-delete" title="Supprimer ce stint" onclick="openDeleteModal(${i}, ${j})"><span class="material-symbols-outlined fs-20">delete</span></button>`}
                </td>
            </tr>
            `;

            if (i === strategySplits.length - 1 && j === split.stints.length - 1) {
                grandTotalLaps = stint.endLap;
            }
        }

        let goalHTML = "";
        let windowHTML = "";

        let splitEndSec = split.stints[split.stints.length - 1].endSec || 0;
        let splitLaps = (split.stints[split.stints.length - 1].endLap || 0) - (split.stints[0].startLap || 0);

        if (isOnline || isSolo) {
            if (goal === 'time') {
                let targetSec = totalSecRace / splitsCount;
                let isMet = Math.round(splitEndSec / 1000) >= Math.round(targetSec / 1000); // 🚀 LE JUGE ARRONDI
                if (!isMet) isGlobalObjectiveMet = false;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif atteint : ${splitLaps} tours en ${formatTime(splitEndSec)}` : `⚠️ Objectif non atteint (Cible: ${formatTime(targetSec)})`;
                goalHTML = `<strong class="${colClass}">${msg}</strong>`;
            } else {
                let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                let targetPerRelay = Math.floor(targetLaps / splitsCount);
                if (isLastSplit) targetPerRelay = targetLaps - (i * targetPerRelay);
                let isMet = splitLaps >= targetPerRelay;
                if (!isMet) isGlobalObjectiveMet = false;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif atteint : ${splitLaps} / ${targetPerRelay} tours` : `⚠️ Objectif non atteint : ${splitLaps} / ${targetPerRelay} tours`;
                goalHTML = `<strong class="${colClass}">${msg}</strong>`;
            }
        } else {
            if (isLastSplit) {
                if (goal === 'time') {
                    let isMet = Math.round(splitEndSec / 1000) >= Math.round(totalSecRace / 1000); // 🚀 LE JUGE ARRONDI
                    if (!isMet) isGlobalObjectiveMet = false;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Fin de course : ${formatTime(splitEndSec)} (Cible: ${formatTime(totalSecRace)})`;
                    goalHTML = `<strong class="${colClass} goal-line-text">${msg}</strong>`;
                } else {
                    let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                    let isMet = split.stints[split.stints.length - 1].endLap >= targetLaps;
                    if (!isMet) isGlobalObjectiveMet = false;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Objectif de course : ${split.stints[split.stints.length - 1].endLap} / ${targetLaps} tours`;
                    goalHTML = `<strong class="${colClass} goal-line-text">${msg}</strong>`;
                }
            }
        }

        let hasPitWindow = document.getElementById('enable-pit-window')?.checked;

        if (hasPitWindow && (!isLastSplit || isSolo || isOnline)) {
            if (isSolo || isOnline) {
                let isLapMode = document.getElementById('pit-window-mode-tours')?.checked;
                if (isLapMode) {
                    let winO = parseInt(document.getElementById('lap-pit-window-open')?.value) || 0;
                    let winC = parseInt(document.getElementById('lap-pit-window-close')?.value) || 0;
                    if (winO > 0 || winC > 0) {
                        if (split.stints.length > 1) {
                            let allValid = true;
                            let invalidCount = 0;
                            let pitDetails = [];
                            for (let k = 1; k < split.stints.length; k++) {
                                let pitLap = split.stints[k - 1].endLap - split.stints[0].startLap;
                                let isValid = (pitLap >= winO && pitLap <= winC);
                                if (!isValid) { allValid = false; invalidCount++; }
                                let colorClass = isValid ? "text-success" : "text-danger";
                                pitDetails.push(`<span class="${colorClass} font-weight-bold">T${pitLap}</span>`);
                            }
                            let statusClass = allValid ? "text-success" : "text-danger";
                            let statusText = allValid ? "Dans la fenêtre" : `⚠️ ${invalidCount} arrêt${invalidCount > 1 ? 's' : ''} hors fenêtre`;
                            windowHTML = `<span>Fenêtre de stand (Tours ${winO} à ${winC}) : <strong class="${statusClass}">${statusText}</strong> (Pits: ${pitDetails.join(', ')})</span>`;
                        } else {
                            windowHTML = `<span>Fenêtre de stand (Tours ${winO} à ${winC}) : <strong class="text-warning">Aucun arrêt</strong></span>`;
                        }
                    }
                } else {
                    let winO = document.getElementById('time-pit-window-open')?.value || "";
                    let winC = document.getElementById('time-pit-window-close')?.value || "";
                    if (winO !== "" && winC !== "") {
                        let secO = timeStringToSeconds(winO);
                        let secC = timeStringToSeconds(winC);
                        if (split.stints.length > 1) {
                            let allValid = true;
                            let invalidCount = 0;
                            let pitDetails = [];
                            for (let k = 1; k < split.stints.length; k++) {
                                let pitSec = split.stints[k - 1].endSec - split.stints[0].startSec; // MS
                                let isValid = (pitSec >= secO && pitSec <= secC);
                                if (!isValid) { allValid = false; invalidCount++; }
                                let colorClass = isValid ? "text-success" : "text-danger";
                                pitDetails.push(`<span class="${colorClass} font-weight-bold">${formatTime(pitSec)}</span>`);
                            }
                            let statusClass = allValid ? "text-success" : "text-danger";
                            let statusText = allValid ? "Dans la fenêtre" : `⚠️ ${invalidCount} arrêt${invalidCount > 1 ? 's' : ''} hors fenêtre`;
                            windowHTML = `<span>Fenêtre de stand (${winO} à ${winC}) : <strong class="${statusClass}">${statusText}</strong> (Pits: ${pitDetails.join(', ')})</span>`;
                        } else {
                            windowHTML = `<span>Fenêtre de stand (${winO} à ${winC}) : <strong class="text-warning">Aucun arrêt effectué</strong></span>`;
                        }
                    }
                }
            } else if (splitDurSec > 0) {
                let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
                let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
                let regOpenSec = (i + 1) * splitDurSec - (winOpen * 60000); // 🚀 MS
                let regCloseSec = (i + 1) * splitDurSec + (winClose * 60000); // 🚀 MS
                let secOpenSec = regOpenSec + 5000;
                let secCloseSec = regCloseSec - 30000;

                let lastStint = split.stints[split.stints.length - 1];
                let avgLapSec = lastStint?.lapSec || 120000; // 🚀 MS

                let diffOpen = secOpenSec - splitEndSec;
                let minLap = (lastStint?.endLap || 0) + Math.ceil(diffOpen / avgLapSec);
                let diffClose = secCloseSec - splitEndSec;
                let maxLap = (lastStint?.endLap || 0) + Math.floor(diffClose / avgLapSec);

                let isSecured = (splitEndSec >= secOpenSec && splitEndSec <= secCloseSec);
                let isRegulatory = (splitEndSec >= regOpenSec && splitEndSec <= regCloseSec);

                let reqTireOnWindow = document.getElementById('pit-tires-only')?.checked;
                let tireChanged = false;
                if (i < strategySplits.length - 1) {
                    let nextTire = strategySplits[i + 1].stints[0].tire;
                    let currentTire = split.stints[split.stints.length - 1].tire;
                    if (nextTire !== currentTire) tireChanged = true;
                }

                let startIsTarget = split.windowTarget === 'start';
                let endIsTarget = split.windowTarget === 'end';
                let targetSet = (startIsTarget || endIsTarget);

                let startLabelClass = (startIsTarget && split.targetFailed) ? 'text-danger font-weight-bold' : (endIsTarget ? 'text-grey font-weight-bold' : 'font-weight-bold');
                let endLabelClass = (endIsTarget && split.targetFailed) ? 'text-danger font-weight-bold' : (startIsTarget ? 'text-grey font-weight-bold' : 'font-weight-bold');

                // 🚀 VERROUILLAGE VISUEL POUR LES SPECTATEURS
                let spectatorLock = !isEngineerMode ? 'disabled' : '';

                let cbStartInput = endIsTarget ? `` : `<input type="checkbox" class="mr-5" onchange="setWindowTarget(${i}, this.checked ? 'start' : null)" ${startIsTarget ? 'checked' : ''} ${spectatorLock}>`;
                let cbEndInput = startIsTarget ? `` : `<input type="checkbox" class="mr-5" onchange="setWindowTarget(${i}, this.checked ? 'end' : null)" ${endIsTarget ? 'checked' : ''} ${spectatorLock}>`;

                let cbStart = `<label class="inline-checkbox-label m-0 ${startLabelClass}">${cbStartInput} Tour ${minLap}</label>`;
                let cbEnd = `<label class="inline-checkbox-label m-0 ${endLabelClass}">${cbEndInput} Tour ${maxLap}</label>`;

                let arrowClass = (startIsTarget || endIsTarget) ? 'text-grey' : '';
                let arrowHTML = `<span class="mx-5 ${arrowClass}">➔</span>`;

                let prefix = !isRelayEnd ? "Fenêtre de stand" : "Changement pilote";
                let respectWord = !isRelayEnd ? "Respectée" : "Respecté";
                let nonRespectWord = !isRelayEnd ? "Non respectée" : "Non respecté";
                let statusHTML = "";

                if (split.windowTarget === 'start' || split.windowTarget === 'end') {
                    let cibleText = split.windowTarget === 'start' ? 'début' : 'fin';
                    if (isSecured) {
                        statusHTML = `🟢 <strong>Cible ${cibleText} de fenêtre</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>Cible ${cibleText} (hors sécurité)</strong>`;
                    } else {
                        statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                    }
                } else if (!isRelayEnd) {
                    if (isSecured) {
                        statusHTML = `🟢 <strong>${respectWord}</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>${respectWord} sans sécurité</strong>`;
                    } else {
                        if (reqTireOnWindow && tireChanged) {
                            statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                        } else {
                            statusHTML = `🟠 <strong>Hors fenêtre par choix</strong>`;
                        }
                    }
                } else {
                    if (isSecured) {
                        statusHTML = `🟢 <strong>${respectWord}</strong>`;
                    } else if (isRegulatory) {
                        statusHTML = `🟠 <strong>${respectWord} sans sécurité</strong>`;
                    } else {
                        statusHTML = `🔴 <strong>${nonRespectWord}</strong>`;
                    }
                }

                windowHTML = `<span class="flex-inline-center"><span class="mr-5 unite">${prefix}<span class="unite"> :</span></span> ${cbStart} ${arrowHTML} ${cbEnd} &nbsp;&nbsp;|&nbsp;&nbsp; ${statusHTML}</span>`;
            }
        }

        let footerHTML = "";
        if (windowHTML !== "") {
            footerHTML += windowHTML;
        }
        if (goalHTML !== "") {
            footerHTML += footerHTML ? `<br>${goalHTML}` : goalHTML;
        }

        let isSplitActive = lastActiveStint && lastActiveStint.startsWith(`${i}-`);
        let blockHTML = `
        <div class="split-block ${isSplitActive ? 'active-split' : ''} ${relayClass}" data-relay="${relayIndexTracker}">
            <div class="split-header">
                <div class="split-header-left">
                    <span class="split-title">${splitTitle}</span>
                    <select class="header-driver" onchange="updateSplitData(${i}, 'driver', this.value)">${drvOpts}</select>
                    ${sptSelectHTML}
                </div>
                <div class="split-header-right d-flex align-center">
                    <span class="mr-15 depart-irl-txt">Départ IRL : <strong>${rsH}:${rsM}</strong></span>
                    ${copyBtn} ${pasteBtn} ${startBtn}
                </div>
            </div>
            <table class="stint-table">
                <thead>
                    <tr>
                        <th class="zone-pit">Pneus</th>
                        <th class="zone-pit">Fuel</th>
                        <th class="zone-pit zone-border">PIT</th>
                        <th class="zone-config">Gomme</th>
                        <th class="zone-config">Strat</th>
                        <th class="zone-config zone-border">Tours</th>
                        <th class="zone-end">Action</th>
                        <th class="zone-end">FIN DE STINT</th>
                        <th class="delete-cell"></th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                </tbody>
            </table>
            <div class="split-footer">
                <div class="pit-window-info">${footerHTML}</div>
                <button class="action-btn fs-08" onclick="addStintRow(${i})">+ Ajouter un Stint</button>
            </div>
            ${isLastSplit ? `<div class="checkered-flag"></div>` : ''}
        </div>`;

        container.insertAdjacentHTML('beforeend', blockHTML);
    }

    if (isOnline && goal === 'laps' && !isSolo) {
        let valBlock = document.getElementById('global-team-validation');
        let valText = document.getElementById('global-team-text');
        valBlock.classList.remove('hidden');

        let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;

        if (grandTotalLaps >= targetLaps) {
            valBlock.classList.remove('border-danger');
            valBlock.classList.add('border-success');
            valText.innerHTML = `🏁 Objectif d'équipe atteint : ${grandTotalLaps} / ${targetLaps} tours.`;
            valText.className = "validation-text text-success";
        } else {
            valBlock.classList.remove('border-success');
            valBlock.classList.add('border-danger');
            valText.innerHTML = `⚠️ Objectif d'équipe non atteint : Manque ${targetLaps - grandTotalLaps} tours !`;
            valText.className = "validation-text text-danger";
        }
    } else {
        document.getElementById('global-team-validation').classList.add('hidden');
    }

    // 🚀 GESTION DES BOUTONS DE RESET
    let btnClear = document.getElementById('btn-clear-strategy');
    let btnRestart = document.getElementById('btn-restart-race');
    let hasLockedStints = strategySplits.some(split => split.stints.some(stint => stint.isPitted));

    if (liveTimerActive) {
        if (btnClear) btnClear.classList.add('hidden');
        if (btnRestart) btnRestart.classList.add('hidden');
    } else {
        if (btnClear) btnClear.classList.remove('hidden');
        if (btnRestart) btnRestart.classList.toggle('hidden', !hasLockedStints);
    }

    // 1. On lance le check global (Règles + Objectif de course combinés)
    checkGlobalRules();

    // 2. On met à jour l'interface visuelle (Fond rouge, cadenas d'export)
    updateAlertVisibility();

    if (strTimer && JSON.parse(strTimer).active && liveTimerActive) {
        timerTick();
    }

    if (window.pendingExcessData) {
        openExcessModal();
    }

    let localSaveInput = document.getElementById('local-save-name');
    if (localSaveInput) {
        let raceNameInput = document.getElementById('race-name-input');
        localSaveInput.value = (currentRaceId && raceNameInput) ? raceNameInput.value : "";
    }
}

function checkExportSecurity() {
    if (window.hasGlobalAlert) {
        document.getElementById('export-error-modal').classList.remove('hidden');
        return false;
    }
    return true;
}

function closeExportErrorModal() {
    document.getElementById('export-error-modal').classList.add('hidden');
}

function generateIARequest() {
    // 🚀 LECTURE INTELLIGENTE : Si 1 seul pilote, on force le type à "Solo"
    let numDrivers = parseInt(document.getElementById('num-drivers')?.value) || 1;
    let raceTypeValue = document.getElementById('race-type')?.value?.toLowerCase();
    let raceType = "";
    if (numDrivers === 1) {
        raceType = "Course normale, en solo";
    } else if (raceTypeValue === 'online') {
        raceType = "Enchaînement de plusieurs relais online, chaque relais est traité comme une course individuelle, seules les règles de pneus s'appliquent sur l'ensemble des relais, les autres règles s'applique à chaque relais";
    } else if (raceTypeValue === 'irl') {
        raceType = "Une seule course multi-pilotes divisée en splits. Un enchaînement éventuel de splits par un même pilote sera nommé un relais.";
    }

    let goal = document.getElementById('race-goal')?.value;

    // Récupération de la variable du fichier prompt.js (ou fallback si introuvable)
    let promptIntro = typeof PROMPT_IA_BASE !== 'undefined' ? PROMPT_IA_BASE : "Analyse ces données de course :";

    let rules = {
        "Epreuve": document.getElementById('race-name-input')?.value || "Non précisé",
        "Voiture": document.getElementById('race-car-input')?.value || "Non précisée",
        "Circuit": document.getElementById('race-track-input')?.value || "Non précisé",
        "Type_de_Course": raceType,
        "Duree_ou_Tours": goal === 'time' ? document.getElementById('race-duration')?.value : document.getElementById('race-laps')?.value,
        "Decoupage": {
            "Nombre_de_Relais": document.getElementById('total-splits')?.value,
            "Changement_Type_Gomme_Uniquement_Sur_Fenetre": document.getElementById('pit-tires-only')?.checked,
            "Changement_Gomme_Obligatoire": document.getElementById('global-req-tire-change')?.checked,
            "Arrets_Stands_Obligatoires": document.getElementById('global-req-pit-stops')?.value
        },
        "Gommes_Regles_Quotas": {},
        "Stands": {
            "Capacite_Reservoir_L": 100,
            "Carburant_Depart_L": document.getElementById('fuel-start')?.value,
            "Vitesse_Remplissage_L_sec": document.getElementById('fuel-speed')?.value,
            "Reserve_Securite_L": document.getElementById('fuel-reserve')?.value,
            "Temps_Perdu_Stand_Base_sec": document.getElementById('pit-loss-time')?.value,
            "Temps_Changement_Pneus_sec": document.getElementById('pit-tire-time')?.value
        },
        "Performances_Moyennes": {
            "Carburant": {
                "Eco": document.getElementById('cons-eco')?.value,
                "Attack": document.getElementById('cons-push')?.value
            },
            "Pneus": {}
        }
    };

    ['T', 'M', 'D', 'I', 'P'].forEach(t => {
        if (document.getElementById(`use-${t}`)?.checked) {
            rules.Gommes_Regles_Quotas[t] = {
                "Obligatoire_sur_relais_complets": document.getElementById(`cb-${t}-1`)?.checked ? document.getElementById(`val-${t}-1`)?.value : 0,
                "Minimum_trains_obligatoires": document.getElementById(`cb-${t}-2`)?.checked ? document.getElementById(`val-${t}-2`)?.value : 0,
                "Maximum_trains_autorises": document.getElementById(`cb-${t}-3`)?.checked ? document.getElementById(`val-${t}-3`)?.value : 99
            };
            rules.Performances_Moyennes.Pneus[t] = {
                "Chrono_Moyen_ATTACK": document.getElementById(`global-time-push-${t}`)?.value,
                "Chrono_Moyen_ECO": document.getElementById(`global-time-eco-${t}`)?.value,
                "Duree_de_vie_Max_Tours": document.getElementById(`global-life-${t}`)?.value
            };
        }
    });

    let finalOutput = promptIntro + "\n\n" + JSON.stringify(rules, null, 4);
    document.getElementById('ia-prompt-preview').value = finalOutput;
}

function copyIARequest() {
    if (!checkExportSecurity()) return;
    let text = document.getElementById('ia-prompt-preview').value;
    navigator.clipboard.writeText(text).then(() => {
        let btn = document.getElementById('btn-export-copy');
        let oldHTML = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-outlined icon-sm icon-align-middle">check</span> Copié`;
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.innerHTML = oldHTML;
            btn.classList.remove('btn-success');
        }, 2000);
    });
}

function downloadIAJson() {
    if (!checkExportSecurity()) return;
    let text = document.getElementById('ia-prompt-preview').value;
    let blob = new Blob([text], { type: "text/plain" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "STRATEFREEZ_IA_Request.txt";
    a.click();
}

function printStrategy() {
    if (!checkExportSecurity()) return;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `<h2 class="print-title">STRATEFREEZ - SUIVI DE COURSE</h2>`;

    const raceType = document.getElementById('race-type')?.value || 'irl';
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);
    const goal = document.getElementById('race-goal')?.value;

    // 🚀 LECTURE EN MS
    const totalSecRace = getRaceDurationSeconds();
    const splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    const splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;
    const targetLapsRace = parseInt(document.getElementById('race-laps')?.value) || 0;
    const rawFuelStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    const initialFuel = rawFuelStr ? parseFloat(rawFuelStr) : 0;
    const isFuelEnabled = (initialFuel > 0);

    strategySplits.forEach((split, i) => {
        let isLastSplit = (i === strategySplits.length - 1);
        let isRelayEnd = isLastSplit || (isOnline ? true : (split.driver !== strategySplits[i + 1].driver));
        let isRelayStart = (i === 0) || (isOnline ? true : (split.driver !== strategySplits[i - 1].driver));

        let relayClass = "";
        if (!isOnline && !isSolo) {
            if (isRelayStart && !isRelayEnd) relayClass = "relay-start";
            else if (!isRelayStart && !isRelayEnd) relayClass = "relay-middle";
            else if (!isRelayStart && isRelayEnd) relayClass = "relay-end";
        }

        let title = (isOnline || isSolo) ? (getAvailableDrivers().length > 1 ? `RELAIS ${i + 1}` : `COURSE`) : `SPLIT ${i + 1}`;
        let drv = split.driver;
        let spt = split.spotter || 'Aucun';

        let rsH = "00"; let rsM = "00";
        if (split.stints.length > 0) {
            let startSec = split.stints[0].startSec || 0; // Déjà en MS
            let baseStartSecIRL = timeStringToSeconds(document.getElementById('start-time-1')?.value || "00:00"); // MS
            if (isOnline || isSolo) {
                baseStartSecIRL = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
                startSec = 0;
            } else {
                startSec = (i * splitDurSec);
            }
            let realTime = baseStartSecIRL + startSec;

            // 🚀 AFFICHAGE : Arrondi propre en secondes pour l'heure de départ
            let displayRealTime = Math.round(realTime / 1000);
            rsH = String(Math.floor(displayRealTime / 3600) % 24).padStart(2, '0');
            rsM = String(Math.floor((displayRealTime % 3600) / 60)).padStart(2, '0');
        }

        let html = `
        <div class="print-split ${relayClass}">
            <div class="print-split-header">
                <span>[ ${title} ] - Départ IRL : ${rsH}:${rsM}</span>
                <span><strong class="fs-1-25">Pilote : ${drv}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; <span class="fs-08">Spotter : ${spt}</span></span>
            </div>
            <table class="print-table">
                <colgroup>
                    <col style="width: 8%;">
                    <col style="width: 15%;">
                    <col style="width: 12%;">
                    <col style="width: 20%;">
                    <col style="width: 10%;">
                    <col style="width: 35%;">
                </colgroup>
                <thead>
                    <tr>
                        <th>STINT</th>
                        <th>PNEUS</th>
                        <th>CARBURANT</th>
                        <th>STRAT.</th>
                        <th>TOURS</th>
                        <th>FIN DE STINT</th>
                    </tr>
                </thead>
                <tbody>
        `;

        split.stints.forEach((stint, j) => {
            let isAbsoluteFirst = (i === 0 && j === 0) || ((isOnline || isSolo) && j === 0);

            let targetFuelForStint = stint.cachedTargetFuel || initialFuel;
            if (isAbsoluteFirst) targetFuelForStint = initialFuel;
            else if (stint.manualFuel !== null && stint.manualFuel !== undefined) {
                targetFuelForStint = parseFloat(stint.manualFuel);
            }

            let targetFuelText = isFuelEnabled ? (targetFuelForStint.toFixed(1) + " L") : "-";

            // 🚀 AFFICHAGE : Arrondi en secondes pour l'heure de fin de relais
            let displayEnd = Math.round((stint.endSec || 0) / 1000);
            let endH = String(Math.floor(displayEnd / 3600)).padStart(2, '0');
            let endM = String(Math.floor((displayEnd % 3600) / 60)).padStart(2, '0');
            let endS = String(Math.floor(displayEnd % 60)).padStart(2, '0');
            let timeStr = `${endH}:${endM}:${endS}`;

            let tireText = stint.tire || '?';
            if (!stint.changeTires && !isAbsoluteFirst) tireText = `↳ ${tireText}`;

            let fuelName = stint.fuelStrat === 'eco' ? "ÉCO" : "ATTACK";
            let fuelStratText = `${fuelName} (${(stint.fuelRate || 0).toFixed(2)} L/t)`;

            html += `
                <tr>
                    <td class="p-bold">${i + 1}.${j + 1}</td>
                    <td class="p-bold">${tireText}</td>
                    <td class="p-bold">${targetFuelText}</td>
                    <td class="text-grey-dark fs-09">${fuelStratText}</td>
                    <td class="p-bold">${stint.laps}</td>
                    <td class="p-tour">➡️ ${stint.endLap || 0} &nbsp;&nbsp;|&nbsp;&nbsp; ${timeStr}</td>
                </tr>
            `;
        });

        let footerHTML = "";
        let splitEndSec = split.stints[split.stints.length - 1]?.endSec || 0; // MS
        let splitLaps = (split.stints[split.stints.length - 1]?.endLap || 0) - (split.stints[0]?.startLap || 0);

        if (isOnline || isSolo) {
            if (goal === 'time') {
                let targetSec = totalSecRace / splitsCount;
                let isMet = splitEndSec >= targetSec - 10; // 🚀 TOLÉRANCE -10ms
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif atteint : ${splitLaps} tours en ${formatTime(splitEndSec)}` : `⚠️ Objectif non atteint (Cible: ${formatTime(targetSec)})`;
                footerHTML = `<span class="${colClass}">${msg}</span>`;
            } else {
                let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                let targetPerRelay = Math.floor(targetLaps / splitsCount);
                if (i === strategySplits.length - 1) targetPerRelay = targetLaps - (i * targetPerRelay);
                let isMet = splitLaps >= targetPerRelay;
                let colClass = isMet ? 'text-success' : 'text-danger';
                let msg = isMet ? `🏁 Objectif ${isSolo ? 'atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours` : `⚠️ Objectif ${isSolo ? 'non atteint' : 'relais'} : ${splitLaps} / ${targetPerRelay} tours`;
                footerHTML = `<span class="${colClass}">${msg}</span>`;
            }
        } else {
            if (isLastSplit) {
                if (goal === 'time') {
                    let isMet = splitEndSec >= totalSecRace - 10; // 🚀 TOLÉRANCE -10ms
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Fin de course : ${formatTime(splitEndSec)} (Cible: ${formatTime(totalSecRace)})`;
                    footerHTML = `<span class="${colClass}">${msg}</span>`;
                } else {
                    let targetLaps = parseInt(document.getElementById('race-laps')?.value) || 0;
                    let isMet = split.stints[split.stints.length - 1].endLap >= targetLaps;
                    let colClass = isMet ? 'text-success' : 'text-danger';
                    let msg = `🏁 Objectif de course : ${split.stints[split.stints.length - 1].endLap} / ${targetLaps} tours`;
                    footerHTML = `<span class="${colClass}">${msg}</span>`;
                }
            } else if (!document.getElementById('pit-window-block')?.classList.contains('hidden') || !document.getElementById('time-pit-window-block')?.classList.contains('hidden')) {

                let isTimeBasedWindow = (isSolo || isOnline);
                let regOpenSec = 0;
                let regCloseSec = 0;

                if (isTimeBasedWindow) {
                    let winO = document.getElementById('time-pit-window-open')?.value || "";
                    let winC = document.getElementById('time-pit-window-close')?.value || "";
                    if (winO !== "" && winC !== "") {
                        regOpenSec = timeStringToSeconds(winO);
                        regCloseSec = timeStringToSeconds(winC);
                    }
                } else if (splitDurSec > 0) {
                    let winOpen = parseInt(document.getElementById('pit-window-open')?.value) || 0;
                    let winClose = parseInt(document.getElementById('pit-window-close')?.value) || 0;
                    regOpenSec = (i + 1) * splitDurSec - (winOpen * 60000); // 🚀 CONVERSION MINUTES -> MS
                    regCloseSec = (i + 1) * splitDurSec + (winClose * 60000); // 🚀 CONVERSION MINUTES -> MS
                }

                if (regOpenSec > 0 || regCloseSec > 0) {
                    let secOpenSec = regOpenSec + 5000;   // 🚀 5 secondes -> 5000 ms
                    let secCloseSec = regCloseSec - 30000; // 🚀 30 secondes -> 30000 ms

                    let lastStint = split.stints[split.stints.length - 1];
                    let avgLapSec = lastStint?.lapSec || 120000; // 🚀 120s -> 120000 ms

                    let diffOpen = secOpenSec - splitEndSec;
                    let minLap = (lastStint?.endLap || 0) + Math.ceil(diffOpen / avgLapSec);
                    let diffClose = secCloseSec - splitEndSec;
                    let maxLap = (lastStint?.endLap || 0) + Math.floor(diffClose / avgLapSec);

                    let isSecured = (splitEndSec >= secOpenSec && splitEndSec <= secCloseSec);
                    let isRegulatory = (splitEndSec >= regOpenSec && splitEndSec <= regCloseSec);

                    if (!isRelayEnd) {
                        if (isSecured || isRegulatory) {
                            footerHTML = `<span>Fenêtre intermédiaire : <strong class="text-success">Dans la fenêtre</strong> (Cible: T ${minLap} à ${maxLap})</span>`;
                        } else {
                            footerHTML = `<span>Fenêtre intermédiaire : <strong class="text-warning">Hors fenêtre</strong> (Cible: T ${minLap} à ${maxLap})</span>`;
                        }
                    } else {
                        if (isSecured) {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-success">Dans la fenêtre</strong></span>`;
                        } else if (isRegulatory) {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-warning">Dans la fenêtre réglementaire</strong></span>`;
                        } else {
                            footerHTML = `<span>Changement Pilote (Estimé) : Tour ${minLap} à ${maxLap} <strong class="text-danger">⚠️ HORS FENÊTRE !</strong></span>`;
                        }
                    }
                }
            }
        }

        html += `</tbody></table>`;
        if (footerHTML) {
            html += `<div class="print-split-footer">${footerHTML}</div>`;
        }
        html += `</div>`;

        if (isLastSplit) {
            html += `<div class="print-checkered-flag"></div>`;
        }

        printArea.innerHTML += html;
    });

    window.print();
    setTimeout(() => { printArea.innerHTML = ''; }, 1000);
}

function downloadPlanningCSV() {
    if (!checkExportSecurity()) return;

    let drivers = getAvailableDrivers();
    let spotters = getAvailableSpotters();
    let pureSpotters = spotters.filter(s => !drivers.includes(s));
    let teamColumns = [...drivers, ...pureSpotters];

    const raceType = document.getElementById('race-type')?.value || 'irl';
    const isOnline = (raceType === 'online');
    const isSolo = (parseInt(document.getElementById('num-drivers').value) === 1);

    let col1Title = isOnline ? "Relais" : "Split";

    let csv = `${col1Title};Heure IRL de début;Heure IRL de fin;`;
    teamColumns.forEach(m => csv += `${m};`);
    csv += "\n";

    // 🚀 LECTURE EN MS
    let baseStartSecIRL = timeStringToSeconds(document.getElementById('start-time-1')?.value || "15:00");
    let totalSecRace = getRaceDurationSeconds();
    let splitsCount = parseInt(document.getElementById('total-splits').value) || 1;
    let splitDurSec = splitsCount > 0 ? totalSecRace / splitsCount : 0;

    for (let i = 0; i < strategySplits.length; i++) {
        let split = strategySplits[i];

        let splitStartIRLSec = 0;
        let splitEndIRLSec = 0;

        if (isOnline || isSolo) {
            splitStartIRLSec = timeStringToSeconds(document.getElementById(`start-time-${i + 1}`)?.value || "00:00");
            let relayDuration = split.stints[split.stints.length - 1].endSec || splitDurSec;
            splitEndIRLSec = splitStartIRLSec + relayDuration;
        } else {
            splitStartIRLSec = baseStartSecIRL + (i * splitDurSec);
            splitEndIRLSec = baseStartSecIRL + ((i + 1) * splitDurSec);
        }

        // 🚀 AFFICHAGE : Conversion vers des secondes pures avant de diviser par 3600
        let displayStart = Math.round(splitStartIRLSec / 1000);
        let sh = String(Math.floor(displayStart / 3600) % 24).padStart(2, '0');
        let sm = String(Math.floor((displayStart % 3600) / 60)).padStart(2, '0');

        let displayEnd = Math.round(splitEndIRLSec / 1000);
        let eh = String(Math.floor(displayEnd / 3600) % 24).padStart(2, '0');
        let em = String(Math.floor((displayEnd % 3600) / 60)).padStart(2, '0');

        let splitDrv = split.driver;
        let splitSpt = split.spotter;

        csv += `${i + 1};${sh}:${sm};${eh}:${em};`;

        teamColumns.forEach(m => {
            if (m === splitDrv) {
                csv += "En piste;";
            } else if (m === splitSpt) {
                csv += "Spotter;";
            } else {
                csv += ";";
            }
        });
        csv += "\n";
    }

    let blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "STRATEFREEZ_Planning_Equipe.csv";
    a.click();
}

// ==========================================
// --- AXE 2 : SUPPRESSION DÉFINITIVE ---
// ==========================================
function openDeleteRaceModal() {
    let input = document.getElementById('delete-race-input');
    if (input) input.value = '';
    checkDeleteRaceInput();
    document.getElementById('delete-race-modal').classList.remove('hidden');
    setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeDeleteRaceModal() {
    document.getElementById('delete-race-modal').classList.add('hidden');
}

function checkDeleteRaceInput() {
    let val = document.getElementById('delete-race-input')?.value.toUpperCase();
    let btn = document.getElementById('btn-confirm-delete-race');
    if (btn) {
        if (val === 'SUPPRIMER') {
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
        } else {
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        }
    }
}

function confirmDeleteRace() {
    closeDeleteRaceModal();
    // 1. On supprime les snapshots locaux et le PIn de la course
    if (currentRaceId) {
        localStorage.removeItem(`stratefreez-snapshots-${currentRaceId}`);
        localStorage.removeItem(`stratefreez-passport-${currentRaceId}`);
        // 🚀 AXE 4 : Destruction physique dans Firebase
        db.collection('races').doc(currentRaceId).delete().catch(e => console.error("Erreur suppression DB", e));
    }

    // 2. On vide tout et on renvoie à l'accueil
    clearCurrentRaceData();
    openTab('tab-params');
}

// ==========================================
// --- AXE 4 : SNAPSHOTS (INSTANTANÉS) ---
// ==========================================
function loadSnapshotsFromStorage() {
    if (!currentRaceId) return [];
    let snaps = localStorage.getItem(`stratefreez-snapshots-${currentRaceId}`);
    return snaps ? JSON.parse(snaps) : [];
}

function saveSnapshotsToStorage(snaps) {
    if (!currentRaceId) return;
    localStorage.setItem(`stratefreez-snapshots-${currentRaceId}`, JSON.stringify(snaps));
}

function updateSnapshotDropdown() {
    let select = document.getElementById('snapshot-select');
    let msg = document.getElementById('no-snapshot-msg');
    if (!select || !msg) return;

    let snaps = loadSnapshotsFromStorage();
    if (snaps.length > 0) {
        select.classList.remove('hidden');
        msg.classList.add('hidden');
        select.innerHTML = '<option value="">-- Charger un instantané --</option>';
        snaps.forEach((snap, idx) => {
            let d = new Date(snap.timestamp);
            let timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            let label = `📸 ${timeStr} - ${snap.name}`;
            select.insertAdjacentHTML('beforeend', `<option value="${idx}">${label}</option>`);
        });
    } else {
        select.classList.add('hidden');
        msg.classList.remove('hidden');
        select.innerHTML = '<option value="">-- Charger un instantané --</option>';
    }
}

function takeSnapshot() {
    if (!currentRaceId) return alert("Aucune course active.");

    let stateStr = localStorage.getItem('stratefreez-form-state');
    let stratStr = localStorage.getItem('stratefreez-data');
    let raceName = document.getElementById('race-name-input')?.value || 'État sans nom';

    let snap = {
        timestamp: Date.now(),
        name: raceName,
        formState: stateStr ? JSON.parse(stateStr) : {},
        strategyData: stratStr ? JSON.parse(stratStr) : []
    };

    let snaps = loadSnapshotsFromStorage();
    snaps.push(snap);
    saveSnapshotsToStorage(snaps);
    updateSnapshotDropdown();

    // Feedback visuel sur le bouton
    let btn = document.querySelector('#tab-export .btn-import');
    if (btn) {
        let oldHTML = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> Capturé !`;
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.innerHTML = oldHTML;
            btn.classList.remove('btn-success');
        }, 2000);
    }
}

function restoreSnapshot(idx) {
    if (idx === "") return;
    let snaps = loadSnapshotsFromStorage();
    let snap = snaps[idx];
    if (!snap) return;

    localStorage.setItem('stratefreez-form-state', JSON.stringify(snap.formState));
    localStorage.setItem('stratefreez-data', JSON.stringify(snap.strategyData));
    strategySplits = snap.strategyData;

    applyFormStateToDOM(snap.formState);
    cascadeFixPitWindows();
    saveFormState();
    renderStrategy();

    document.getElementById('snapshot-select').value = ""; // Reset du select
    navigateToSmartTab();
}

// ==========================================
// --- SAS DE DÉCONTAMINATION LOCALE ---
// ==========================================
function purgeLocalState() {
    // 🚀 L'ASSASSINAT LOCAL : On tue le chrono en silence absolu
    stopTimer(false, true);
}

// ==========================================
// --- SAUVEGARDE LOCALE (.JSON) ---
// ==========================================
// 🚀 LA CORRECTION (Remplacez toute la fonction executeLocalSave)
function executeLocalSave() {
    if (!checkExportSecurity()) return;

    let raceName = document.getElementById('local-save-name').value.trim();
    if (!raceName) {
        // Remplaçant de l'ancien alert() si vous utilisez la modale
        if (typeof showErrorModal === 'function') {
            showErrorModal("Export impossible : la course n'a pas de nom.");
        } else {
            alert("Export impossible : la course n'a pas de nom.");
        }
        return;
    }

    // Exportation
    saveFormState();

    // 🚀 LE FIX : On récupère proprement l'état dans la mémoire locale
    let stateStr = localStorage.getItem('stratefreez-form-state');

    let exportData = {
        formState: stateStr ? JSON.parse(stateStr) : {}, // Remplace l'appel à la variable globale inexistante
        strategyData: strategySplits
    };

    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 4));
    let downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", raceName + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
function handleLocalFileSelect(event) {
    let file = event.target.files[0];
    if (!file) return;

    let reader = new FileReader();
    // 🚀 AJOUT DE 'async' ICI
    reader.onload = async function (e) {
        try {
            let importedData = JSON.parse(e.target.result);

            if (importedData.formState && importedData.strategyData) {
                let newName = file.name.replace(/\.[^/.]+$/, "");

                // 🚀 LE VIDEUR STRICT EST MAINTENANT ACTIF ICI AUSSI !
                let isTaken = await isRaceNameTaken(newName);
                if (isTaken) {
                    showErrorModal("Le nom de ce fichier correspond à une course déjà existante sur le Cloud.<br><br>Renommez votre fichier sur votre ordinateur avant de l'importer.");
                    return;
                }

                importedData.formState['race-name-input'] = newName;

                // Création des nouveaux IDs
                purgeLocalState();
                let newRaceId = 'race_' + Date.now();
                let newPin = Math.floor(1000 + Math.random() * 9000).toString();

                let newRaceData = {
                    id: newRaceId,
                    name: newName,
                    pin: newPin,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    formState: importedData.formState,
                    strategyData: importedData.strategyData,
                    timerState: null,
                    isTimerRunning: false,
                    isActive: true
                };

                // Envoi Firebase
                db.collection('races').doc(newRaceId).set(newRaceData)
                    .then(() => {
                        // Bascule de l'interface sur la nouvelle course
                        currentRaceId = newRaceId;
                        currentRacePin = newPin;
                        isRaceActive = true;
                        isEngineerMode = true;

                        localStorage.setItem('stratefreez-current-race-id', currentRaceId);
                        localStorage.setItem('stratefreez-current-race-pin', currentRacePin);
                        localStorage.setItem('stratefreez-is-race-active', 'true');
                        localStorage.setItem(`stratefreez-passport-${currentRaceId}`, 'true');

                        // 🚀 SAUVEGARDE LOCALE PROPRE (Au lieu de forcer une variable fantôme)
                        localStorage.setItem('stratefreez-form-state', JSON.stringify(importedData.formState));
                        localStorage.setItem('stratefreez-data', JSON.stringify(importedData.strategyData));
                        strategySplits = importedData.strategyData;

                        let navBrandText = document.getElementById('nav-brand-text');
                        if (navBrandText) {
                            navBrandText.classList.remove('chrono-active');
                            navBrandText.innerText = "STRATEFREEZ";
                        }

                        // Injection dans le DOM
                        applyFormStateToDOM(importedData.formState);
                        renderStrategy();
                        toggleObserverMode(false);

                        // On relance le radar réseau sur la nouvelle course
                        listenToCloudRace();
                        // 🚀 CRÉATION : Le créateur devient automatiquement Ingénieur
                        isEngineerMode = true;
                        toggleObserverMode(false);

                        navigateToSmartTab();

                        // Message de succès
                        let banner = document.getElementById('end-race-banner');
                        if (banner) {
                            let oldText = banner.innerText;
                            let oldBg = banner.style.background;
                            banner.innerText = "Course chargée avec succès sur le Cloud !";
                            banner.style.background = "#2196F3";
                            banner.classList.remove('hidden');
                            setTimeout(() => {
                                banner.classList.add('hidden');
                                banner.style.background = oldBg;
                                banner.innerText = oldText;
                            }, 4000);
                        }
                    })
                    .catch(error => {
                        console.error("Erreur création Cloud :", error);
                        showErrorModal("Erreur de connexion au serveur Firebase.");
                    });
            } else {
                showErrorModal("Le fichier JSON n'est pas un export valide de Stratefreez.");
            }
        } catch (err) {
            showErrorModal("Erreur de lecture du fichier JSON.");
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

// 🚀 FORCE LE CLAVIER DÉCIMAL UNIVERSEL (Nombres purs + Champs de temps formatés)
function applyMobileNumericKeypad() {
    // On cible les type="number" existants ET toutes vos classes de formatage textuel
    let cibles = 'input[type="number"], .format-hhmm, .format-mss000, .format-sec, .format-liters, .format-lps, .format-lpt';

    document.querySelectorAll(cibles).forEach(input => {
        input.setAttribute('inputmode', 'decimal');

        // Nettoie les anciens patterns si jamais il en reste
        if (input.hasAttribute('pattern')) {
            input.removeAttribute('pattern');
        }
    });
}
// ==========================================
// --- AXE 6 : MESSAGE FLASH D'URGENCE ---
// ==========================================

function openFlashInput() {
    if (!currentRaceId || !isEngineerMode) return;

    document.getElementById('flash-input-modal').classList.remove('hidden');
    document.getElementById('flash-msg-input').value = ""; // Remise à zéro propre

    // 🚀 VERROU A : Bloque le bouton chez tous les ingénieurs pendant 45s
    let lockExpiry = Date.now() + (typeof serverOffset !== 'undefined' ? serverOffset : 0) + 45000;

    db.collection('races').doc(currentRaceId).set({
        flashLockUntil: lockExpiry
    }, { merge: true }).catch(err => console.error("Erreur Verrou Flash:", err));
}

function closeFlashInput() {
    document.getElementById('flash-input-modal').classList.add('hidden');

    if (!currentRaceId || !isEngineerMode) return;

    // 🚀 VERROU B1 : Annule le blocage instantanément (Timer à 0)
    db.collection('races').doc(currentRaceId).set({
        flashLockUntil: 0
    }, { merge: true }).catch(err => console.error("Erreur Déverrouillage Flash:", err));
}

function sendFlashMessage() {
    let inputEl = document.getElementById('flash-msg-input');
    let msg = inputEl ? inputEl.value.trim() : "";

    if (!msg || !currentRaceId || !isEngineerMode) return;

    // 🚀 FIX 1 : On ferme la modale visuellement SANS envoyer de verrou '0' au Cloud
    document.getElementById('flash-input-modal').classList.add('hidden');

    // VERROU B2 & ENVOI CIBLÉ : Écrit UNIQUEMENT dans la course en cours + Relance 45s
    let lockExpiry = Date.now() + (typeof serverOffset !== 'undefined' ? serverOffset : 0) + 45000;

    db.collection('races').doc(currentRaceId).set({
        flashLockUntil: lockExpiry,
        flashMessage: {
            text: msg,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true }).catch(err => console.error("Erreur Envoi Flash:", err));

    if (inputEl) inputEl.value = ""; // Nettoyage
}

function dismissFlashLocal() {
    document.getElementById('flash-alert-overlay').classList.add('hidden');
}

// 🚀 LE RADAR DE SILENCE RADIO (Évalue si la bulle a le droit de s'afficher)
function evaluateFlashButtonState() {
    let flashBtn = document.getElementById('btn-flash-msg');
    if (!flashBtn) return;

    // Règle 1 : Seuls les ingénieurs ont le droit de voir le bouton
    if (typeof isEngineerMode === 'undefined' || !isEngineerMode) {
        flashBtn.classList.add('hidden');
        return;
    }

    // Calcul de l'heure exacte synchronisée avec le serveur
    let now = Date.now() + (typeof serverOffset !== 'undefined' ? serverOffset : 0);
    let isLocked = cloudFlashLockUntil > now;

    // Règle 2 : Le bouton disparait SI un message est à l'écran OU SI le verrou est actif (modale ouverte)
    if (isFlashMessageAlive || isLocked) {
        flashBtn.classList.add('hidden');

        // Filet de sécurité : Si seul le verrou bloque, on programme le retour automatique du bouton à l'expiration (les fameuses 45s de sécurité)
        if (isLocked && !isFlashMessageAlive) {
            clearTimeout(window.flashLockTimeout);
            window.flashLockTimeout = setTimeout(() => {
                evaluateFlashButtonState(); // On se ré-évalue à la fin du chrono
            }, cloudFlashLockUntil - now + 100); // (+100ms de marge de sécurité)
        }
    } else {
        // Règle 3 : Pas de message ET pas de verrou = La voie est libre, on affiche le bouton !
        flashBtn.classList.remove('hidden');
    }
}

// ==========================================
// --- LE SCANNER SILENCIEUX (Aiguillage) ---
// ==========================================
function checkRequiredFields() {
    let result = { isValid: true, firstMissingId: null, tabId: null };

    // 1. Nettoyage initial (Visuel) - S'exécute toujours pour effacer le rouge
    document.querySelectorAll('.mandatory-missing').forEach(el => el.classList.remove('mandatory-missing'));
    let tireWarn = document.getElementById('tire-warning-text');
    if (tireWarn) tireWarn.classList.add('hidden');

    // 🚀 SÉCURITÉ : Si on est sur l'écran d'accueil vide, on s'arrête là (pas de rouge)
    // MAIS on déclare formellement que les données sont invalides pour bloquer l'onglet 3
    let currentRaceName = document.getElementById('race-name-input')?.value;
    if (!currentRaceName || currentRaceName === "Aucune course active") {
        result.isValid = false;
        return result;
    }

    const setMissing = (id, tab) => {
        if (!result.firstMissingId) {
            result.firstMissingId = id;
            result.tabId = tab;
            result.isValid = false; // 🚀 Le cerveau enregistre toujours le manque
        }
        // 🚀 BOUCLIER VIEWER : On met en rouge UNIQUEMENT si on est Ingénieur
        if (isEngineerMode) {
            let el = document.getElementById(id);
            if (el) el.classList.add('mandatory-missing');
        }
    };

    // 2. ONGLET 1 : Les Fondations
    let goal = document.getElementById('race-goal')?.value;
    if (goal === 'time') {
        if (getRaceDurationSeconds() <= 0) setMissing('race-duration', 'tab-params');
    } else {
        let laps = parseInt(document.getElementById('race-laps')?.value) || 0;
        if (laps <= 0) setMissing('race-laps', 'tab-params');
    }

    let numDrivers = parseInt(document.getElementById('num-drivers')?.value) || 1;
    let raceType = document.getElementById('race-type')?.value;
    let isOnline = (raceType === 'online');
    let isSolo = (numDrivers === 1);

    if (!isSolo) {
        let totalSplits = parseInt(document.getElementById('total-splits')?.value) || 0;
        if (totalSplits <= 0) setMissing('total-splits', 'tab-params');

        let manSplitsStr = document.getElementById('mandatory-splits')?.value;
        if (manSplitsStr === "" || isNaN(parseInt(manSplitsStr))) setMissing('mandatory-splits', 'tab-params');

        if (!isOnline) {
            let maxConsStr = document.getElementById('max-consecutive-splits')?.value;
            if (maxConsStr === "" || isNaN(parseInt(maxConsStr))) setMissing('max-consecutive-splits', 'tab-params');
        }
    }

    // 3. ONGLET 1 : Contact au sol (Gommes)
    let tires = ['T', 'M', 'D', 'I', 'P'];
    let checkedTires = tires.filter(t => document.getElementById(`use-${t}`)?.checked);
    let reqTireChange = document.getElementById('global-req-tire-change')?.checked;
    let minTires = reqTireChange ? 2 : 1;

    if (checkedTires.length < minTires) {
        // 🚀 BOUCLIER VIEWER : Pas de message texte d'erreur pour les spectateurs
        if (tireWarn && isEngineerMode) {
            tireWarn.innerText = `Cocher ${minTires} type(s) de gomme à minima`;
            tireWarn.classList.remove('hidden');
        }
        let firstUnchecked = tires.find(t => !document.getElementById(`use-${t}`)?.checked);
        setMissing(checkedTires.length === 0 ? 'use-T' : `use-${firstUnchecked}`, 'tab-params');
    }

    let customDrivers = document.getElementById('personalize-drivers-toggle')?.checked && !isSolo;

    // 4. ONGLET 2 : Vitesse (Chronos)
    checkedTires.forEach(t => {
        if (customDrivers) {
            for (let i = 1; i <= numDrivers; i++) {
                if (!document.getElementById(`drv-${i}-time-push-${t}`)?.value) setMissing(`drv-${i}-time-push-${t}`, 'tab-tech');
            }
        } else {
            if (!document.getElementById(`global-time-push-${t}`)?.value) setMissing(`global-time-push-${t}`, 'tab-tech');
        }
    });

    // 5. ONGLET 1 & 2 : Carburant
    let fuelStartStr = document.getElementById('fuel-start')?.value.replace(/[^\d.]/g, '');
    let fuelStart = fuelStartStr ? parseFloat(fuelStartStr) : 0;

    if (fuelStart > 0) {
        if (!document.getElementById('fuel-speed')?.value) setMissing('fuel-speed', 'tab-params');

        if (customDrivers) {
            for (let i = 1; i <= numDrivers; i++) {
                if (!document.getElementById(`drv-${i}-fuel-push`)?.value) setMissing(`drv-${i}-fuel-push`, 'tab-tech');
            }
        } else {
            if (!document.getElementById('cons-push')?.value) setMissing('cons-push', 'tab-tech');
        }
    }

    return result;
}

function navigateToSmartTab() {
    let scan = checkRequiredFields();

    if (scan.isValid) {
        openTab('tab-strategy');
    } else {
        // 🚀 SÉCURITÉ UX : Un spectateur ne doit pas être "aspiré" vers les cases vides
        if (!isEngineerMode) {
            openTab('tab-strategy'); // Il verra simplement l'écran central "Paramètres insuffisants"
        } else {
            // L'Ingénieur est guidé vers son erreur
            openTab(scan.tabId);
            setTimeout(() => {
                let el = document.getElementById(scan.firstMissingId);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.focus();
                }
            }, 150);
        }
    }
}
