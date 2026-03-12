// ==========================================
// 1. FIREBASE BAŞLATMA
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCYoOAJshvUBvJhLW5PQTvz-bDfIobCwi8",
    authDomain: "kelimelik-5x5.firebaseapp.com",
    projectId: "kelimelik-5x5",
    storageBucket: "kelimelik-5x5.firebasestorage.app",
    messagingSenderId: "292210549026",
    appId: "1:292210549026:web:21f376ea9d0ee86555057b"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==========================================
// 2. SÖZLÜK (kelime.json'dan yüklenir)
// ==========================================
const SCORE_RULES = { 2: 2, 3: 5, 4: 9, 5: 15 };
let DICTIONARY = new Set();

fetch('kelime.json')
    .then(res => res.json())
    .then(words => {
        DICTIONARY = new Set(words.map(w => w.toLocaleUpperCase('tr-TR')));
    })
    .catch(err => console.error('Kelime listesi yüklenemedi:', err));

function isValidWord(word) {
    if (word.length < 2 || word.length > 5) return false;
    return DICTIONARY.has(word.toLocaleUpperCase('tr-TR'));
}

// ==========================================
// 3. HARF HAVUZU VE YARDIMCI SABİTLER
// ==========================================
const VOWELS = ['A', 'E', 'I', 'İ', 'O', 'Ö', 'U', 'Ü'];
const ALL_VOWELS = "AEIİOÖUÜ";

const LETTER_POOL_CONFIG = {
    'A': 5, 'E': 5, 'İ': 5, 'K': 6, 'L': 5, 'R': 6, 'N': 4, 'T': 4,
    'I': 3, 'M': 4, 'U': 4, 'Y': 3, 'S': 4, 'D': 3, 'O': 3, 'B': 3,
    'Ü': 3, 'Ş': 3, 'Z': 3, 'G': 1, 'H': 3, 'Ç': 3, 'P': 3, 'C': 2,
    'V': 2, 'Ö': 2, 'F': 2, 'J': 1, 'Ğ': 1
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ==========================================
// 4. OYUN DEĞİŞKENLERİ
// ==========================================
let currentGameId = null;
let myPlayerId = null;
let placementMode = false;
let myFinalLetter = null;
let unsubscribe = null;
let selectedDraftIndex = -1;
let myGridData = [];
let selectedClassicLetter = null;

// ==========================================
// 5. KULLANICI KİMLİĞİ VE İSTATİSTİKLER
// ==========================================
function getMyStatsId() {
    let id = localStorage.getItem('kelimelik_user_id');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('kelimelik_user_id', id);
    }
    return id;
}

function getLocalRandomStats() {
    const raw = localStorage.getItem('kelimelik_random_history');
    if (!raw) return { allScores: [] };
    return JSON.parse(raw);
}

function updateRandomStats(score) {
    let data = getLocalRandomStats();
    data.allScores.push(score);
    localStorage.setItem('kelimelik_random_history', JSON.stringify(data));
    saveMonthlyStatsToFirebase(data.allScores);
}

function saveMonthlyStatsToFirebase(allScores) {
    const userId = getMyStatsId();
    const date = new Date();
    const monthKey = `stats_${date.getFullYear()}_${date.getMonth() + 1}`;
    const userRef = db.collection('users').doc(userId);

    db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        let userData = doc.exists ? doc.data() : {};
        let monthData = userData[monthKey] || { count: 0, totalScore: 0, avg: 0 };

        const lastScore = allScores[allScores.length - 1];
        monthData.count += 1;
        monthData.totalScore += lastScore;
        monthData.avg = Math.round(monthData.totalScore / monthData.count);

        transaction.set(userRef, {
            [monthKey]: monthData,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

window.openStatsModal = function () {
    const modal = document.getElementById("statsModal");
    if (!modal) return;

    const data = getLocalRandomStats();
    const scores = data.allScores || [];

    let lifeTimeAvg = "-";
    let last10Avg = "-";

    if (scores.length > 0) {
        lifeTimeAvg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
        const last10 = scores.slice(-10);
        last10Avg = (last10.reduce((a, b) => a + b, 0) / last10.length).toFixed(1);
    }

    const elAvg = document.getElementById('statLifeTimeAvg');
    const elLast10 = document.getElementById('statLast10Avg');
    if (elAvg) elAvg.textContent = lifeTimeAvg;
    if (elLast10) elLast10.textContent = last10Avg;

    modal.classList.remove("hidden");
};

window.closeStatsModal = function () {
    const modal = document.getElementById("statsModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
};

// ==========================================
// 6. MODAL YÖNETİMİ (NASIL OYNANIR + İSTATİSTİK)
// ==========================================
window.openInfoModal = function () {
    const modal = document.getElementById("howToPlayModal");
    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }
};

window.closeInfoModal = function () {
    const modal = document.getElementById("howToPlayModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
};

// ==========================================
// 7. DARK MODE
// ==========================================
function toggleDarkMode() {
    const body = document.body;
    const btn = document.getElementById('darkModeBtn');
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// ==========================================
// 8. HARF DİZİSİ ÜRETME FONKSİYONLARI
// ==========================================
function generateGameSequence() {
    let vowelPool = [];
    let consonantPool = [];

    for (let [letter, count] of Object.entries(LETTER_POOL_CONFIG)) {
        for (let i = 0; i < count; i++) {
            VOWELS.includes(letter) ? vowelPool.push(letter) : consonantPool.push(letter);
        }
    }

    shuffleArray(vowelPool);
    shuffleArray(consonantPool);

    let finalSequence = [
        ...vowelPool.slice(0, 12),
        ...consonantPool.slice(0, 12)
    ];
    shuffleArray(finalSequence);

    if (finalSequence.length !== 24) {
        console.warn(`UYARI: Yalnızca ${finalSequence.length} harf üretildi.`);
    }

    return finalSequence;
}

// Tohumlu RNG (Günlük Challenge için)
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function generateDailySequence() {
    const now = new Date();
    const seed = (now.getFullYear() * 10000) + ((now.getMonth() + 1) * 100) + now.getDate();
    const randomFunc = mulberry32(seed);

    let vowelPool = [];
    let consonantPool = [];

    for (let [letter, count] of Object.entries(LETTER_POOL_CONFIG)) {
        for (let i = 0; i < count; i++) {
            VOWELS.includes(letter) ? vowelPool.push(letter) : consonantPool.push(letter);
        }
    }

    const shuffleDaily = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(randomFunc() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    };

    shuffleDaily(vowelPool);
    shuffleDaily(consonantPool);

    let finalSequence = [
        ...vowelPool.slice(0, 12),
        ...consonantPool.slice(0, 12)
    ];
    shuffleDaily(finalSequence);

    return finalSequence;
}

function getChallengeNumber() {
    const startDate = new Date("2026-01-05");
    const now = new Date();
    const utc1 = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const utc2 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(1, Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1);
}

// ==========================================
// 9. OYUN KURMA VE KATILMA
// ==========================================
async function createNewGame(mode) {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const userId = getMyStatsId();
    const selectedMode = (mode || 'CLASSIC').toUpperCase();

    myPlayerId = 'PlayerA';
    currentGameId = code;
    document.getElementById('lobbyStatus').textContent = `${selectedMode} oyun kuruluyor...`;

    let sequence = null;
    let initialLetter = null;

    if (selectedMode === 'RANDOM' || selectedMode === 'PUZZLE') {
        try {
            sequence = generateGameSequence();
            if (!sequence || sequence.length < 24) throw new Error("Harf dizisi üretilemedi.");
            initialLetter = sequence[0];
        } catch (e) {
            document.getElementById('lobbyStatus').textContent = `HATA: ${e.message}`;
            currentGameId = null;
            return;
        }
    }

    try {
        await db.collection('games').doc(code).set({
            status: 'waiting',
            turnOwner: 'PlayerA',
            moveNumber: 1,
            isSinglePlayer: false,
            gameMode: selectedMode,
            letterSequence: sequence,
            currentLetter: initialLetter,
            gridA: Array(25).fill(''),
            gridB: Array(25).fill(''),
            playerA_id: userId,
            playerB_id: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setupGameUI(code, true);
        listenToGame();

    } catch (error) {
        document.getElementById('lobbyStatus').textContent = "Oyun kurulamadı!";
        console.error("Firebase Yazma Hatası:", error);
        currentGameId = null;
    }
}

async function joinGame() {
    const gameCodeInput = document.getElementById('gameCodeInput');
    const code = gameCodeInput ? gameCodeInput.value.trim().toUpperCase() : '';
    const userId = getMyStatsId();

    if (!code || code.length !== 4) {
        document.getElementById('lobbyStatus').textContent = "HATA: Lütfen 4 haneli geçerli bir oda kodu girin.";
        return;
    }

    const gameRef = db.collection('games').doc(code);
    document.getElementById('lobbyStatus').textContent = "Oyuna bağlanılıyor...";

    try {
        const doc = await gameRef.get();

        if (!doc.exists) {
            document.getElementById('lobbyStatus').textContent = "HATA: Bu kodda aktif/bekleyen bir oyun bulunamadı.";
            return;
        }

        const data = doc.data();

        if (data.playerA_id === userId) {
            myPlayerId = 'PlayerA';
            currentGameId = code;
            document.getElementById('lobbyStatus').textContent = "Kaldığınız yerden devam ediliyor...";
        } else if (data.playerB_id === userId) {
            myPlayerId = 'PlayerB';
            currentGameId = code;
            document.getElementById('lobbyStatus').textContent = "Kaldığınız yerden devam ediliyor...";
        } else if (data.status === 'waiting' && !data.playerB_id) {
            myPlayerId = 'PlayerB';
            currentGameId = code;
            await gameRef.update({ status: 'active', playerB_id: userId });
            document.getElementById('lobbyStatus').textContent = "Oyuna başarıyla katıldınız!";
        } else {
            document.getElementById('lobbyStatus').textContent = "HATA: Oyun zaten başladı veya oda dolu.";
            return;
        }

        setupGameUI(code, true);
        listenToGame();

    } catch (error) {
        document.getElementById('lobbyStatus').textContent = "Oyuna katılırken bir hata oluştu.";
        console.error("Oyuna Katılma Hatası:", error);
        currentGameId = null;
    }
}

async function startSinglePlayerGame() {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    myPlayerId = 'PlayerA';
    currentGameId = code;

    document.getElementById('lobbyStatus').textContent = "Tek kişilik oyun hazırlanıyor...";

    try {
        const sequence = generateGameSequence();

        await db.collection('games').doc(code).set({
            status: 'active',
            isSinglePlayer: true,
            turnOwner: 'PlayerA',
            moveNumber: 1,
            gameMode: 'RANDOM',
            letterSequence: sequence,
            currentLetter: sequence[0],
            gridA: Array(25).fill(''),
            gridB: Array(25).fill(''),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setupGameUI(code);
        listenToGame();

    } catch (error) {
        console.error("Tek kişilik oyun hatası:", error);
        document.getElementById('lobbyStatus').textContent = "Oyun başlatılamadı.";
    }
}

async function startDailyGame() {
    const now = new Date();
    const dateString = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    const todayKey = now.toISOString().split('T')[0];

    let userId = getMyStatsId();
    const fixedDailyCode = `DAILY-${todayKey}-${userId}`;

    document.getElementById('lobbyStatus').textContent = "Kontrol ediliyor...";

    try {
        const gameRef = db.collection('games').doc(fixedDailyCode);
        const doc = await gameRef.get();

        if (doc.exists) {
            const data = doc.data();
            if (data.status === 'finished') {
                myPlayerId = 'PlayerA';
                showResults(data);
                return;
            }
            currentGameId = fixedDailyCode;
            myPlayerId = 'PlayerA';
            setupGameUI(fixedDailyCode);
            prepareDailyUI(dateString);
            listenToGame();
            return;
        }

        const sequence = generateDailySequence();

        await gameRef.set({
            status: 'active',
            isSinglePlayer: true,
            isDailyChallenge: true,
            gameMode: 'RANDOM',
            letterSequence: sequence,
            currentLetter: sequence[0],
            moveNumber: 1,
            gridA: Array(25).fill(''),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            userId: userId
        });

        currentGameId = fixedDailyCode;
        myPlayerId = 'PlayerA';
        setupGameUI(fixedDailyCode);
        prepareDailyUI(dateString);
        listenToGame();

    } catch (error) {
        console.error("Daily game error:", error);
        document.getElementById('lobbyStatus').textContent = "Günlük oyun başlatılamadı.";
    }
}

function prepareDailyUI(dateString) {
    const footer = document.getElementById('dailyFooterInfo');
    const numSpan = document.getElementById('dailyGameNumDisplay');
    const dateSpan = document.getElementById('dailyDateDisplay');

    if (footer && numSpan && dateSpan) {
        numSpan.textContent = `Challenge #${getChallengeNumber()}`;
        dateSpan.textContent = dateString;
        footer.classList.remove('hidden');
    }

    const opponentSection = document.getElementById('opponentSection');
    if (opponentSection) opponentSection.style.display = 'none';
}

// ==========================================
// 10. ARAYÜZ HAZIRLAMA
// ==========================================
function setupGameUI(gameId, isMultiplayer = false) {
    document.getElementById('lobbyPanel').classList.add('hidden');
    document.getElementById('gameOverPanel').classList.add('hidden');
    document.getElementById('gamePanel').classList.remove('hidden');

    const displayCode = document.getElementById('gameCodeDisplay');
    if (displayCode) displayCode.textContent = gameId;

    const roomInfoDiv = document.querySelector('.room-info');
    if (roomInfoDiv) roomInfoDiv.style.display = isMultiplayer ? 'block' : 'none';

    const dailyFooter = document.getElementById('dailyFooterInfo');
    if (dailyFooter) dailyFooter.classList.add('hidden');
}

// ==========================================
// 11. OYUNU DİNLEME (FIREBASE SNAPSHOT)
// ==========================================
function listenToGame() {
    if (unsubscribe) unsubscribe();

    unsubscribe = db.collection('games').doc(currentGameId)
        .onSnapshot((doc) => {
            if (!doc.exists) {
                alert("Oyun sonlandırıldı veya bulunamadı.");
                window.location.reload();
                return;
            }

            const data = doc.data();

            // Kalan Harf İstatistiği
            if (data.gameMode === 'RANDOM' || data.gameMode === 'PUZZLE') {
                const infoArea = document.getElementById('randomGameInfoArea');
                if (infoArea) infoArea.classList.remove('hidden');
                updateLetterStats(data.letterSequence, data.moveNumber);
            } else {
                const infoArea = document.getElementById('randomGameInfoArea');
                if (infoArea) infoArea.classList.add('hidden');
            }

            // Grid Verileri
            myGridData = (myPlayerId === 'PlayerA') ? data.gridA : data.gridB;
            const oppGridData = (myPlayerId === 'PlayerA') ? data.gridB : data.gridA;

            renderGrid(myGridData, 'myGrid');
            renderGrid(oppGridData, 'opponentGrid');

            const classicArea = document.getElementById('classicLetterSelectionArea');
            const randomDisplay = document.getElementById('randomLetterDisplay');
            const myGridEl = document.getElementById('myGrid');
            const turnBadge = document.getElementById('turnStatusBadge');

            if (classicArea) classicArea.classList.add('hidden');
            if (randomDisplay) randomDisplay.classList.add('hidden');

            // UI Durum Güncelleyici
            const updateUIState = (text, badgeColor, isInteractive) => {
                if (turnBadge) {
                    turnBadge.textContent = text;
                    turnBadge.className = `status-badge ${badgeColor}`;
                    turnBadge.classList.remove('hidden');
                    turnBadge.style.display = 'block';
                }

                placementMode = isInteractive;

                if (myGridEl) {
                    if (isInteractive) {
                        myGridEl.classList.remove('waiting-turn');
                        myGridEl.classList.add('active-turn');
                        myGridEl.style.opacity = "1";
                        myGridEl.style.pointerEvents = "auto";
                    } else {
                        myGridEl.classList.add('waiting-turn');
                        myGridEl.classList.remove('active-turn');
                        myGridEl.style.opacity = "0.6";
                        myGridEl.style.pointerEvents = "none";
                    }
                }
                renderGrid(myGridData, 'myGrid');
            };

            if (data.status === 'active') {
                document.getElementById('lobbyPanel').classList.add('hidden');
                document.getElementById('gamePanel').classList.remove('hidden');
                document.getElementById('gameOverPanel').classList.add('hidden');

                const isMyTurn = (data.turnOwner === myPlayerId);
                const myFilledCount = myGridData.filter(c => c !== '').length;
                const currentMove = data.moveNumber || 1;
                const myMoveDone = (myFilledCount >= currentMove);

                // 25. TUR: JOKER
                if (currentMove === 25) {
                    if (myFilledCount >= 25) {
                        updateUIState("RAKİP BEKLENİYOR...", "badge-warning", false);
                        if (classicArea) classicArea.classList.add('hidden');
                        if (randomDisplay) randomDisplay.classList.add('hidden');
                    } else {
                        renderAlphabetSelector(data.gameMode);
                        if (!myFinalLetter) {
                            updateUIState("FİNAL: JOKER HARFİ SEÇ", "badge-info", false);
                        } else {
                            updateUIState(`JOKER: ${myFinalLetter} - YERLEŞTİR`, "badge-success", true);
                            placementMode = true;
                        }
                    }
                    return;
                }

                // KLASİK MOD
                if (data.gameMode === 'CLASSIC') {
                    const harfSecildiMi = (data.currentLetter !== null && data.currentLetter !== "");

                    if (!harfSecildiMi) {
                        if (isMyTurn) {
                            if (classicArea) {
                                classicArea.classList.remove('hidden');
                                if (classicArea.querySelector('#classicAlphabetContainer').children.length === 0) {
                                    renderClassicAlphabet();
                                }
                                const confirmBtn = document.getElementById('confirmLetterBtn');
                                if (confirmBtn && !selectedClassicLetter) {
                                    confirmBtn.disabled = true;
                                    confirmBtn.textContent = "BİR HARF SEÇİNİZ";
                                }
                            }
                            updateUIState("Sıra Sizde: Harf Seç", "badge-info", false);
                        } else {
                            updateUIState("Rakip Harf Seçiyor", "badge-warning", false);
                        }
                    } else {
                        if (randomDisplay) {
                            randomDisplay.textContent = data.currentLetter;
                            randomDisplay.classList.remove('hidden');
                        }
                        if (!myMoveDone) {
                            updateUIState(`"${data.currentLetter}" Harfini Yerleştir`, "badge-success", true);
                        } else {
                            updateUIState("Rakip Yerleştiriyor", "badge-warning", false);
                        }
                    }
                }
                // RANDOM MOD
                else {
                    if (randomDisplay) {
                        randomDisplay.textContent = data.currentLetter;
                        randomDisplay.classList.remove('hidden');
                    }
                    if (!myMoveDone) {
                        updateUIState("Harfi Yerleştirin", "badge-success", true);
                    } else {
                        updateUIState(
                            data.isSinglePlayer ? "Kaydediliyor..." : "Rakip Bekleniyor...",
                            data.isSinglePlayer ? "badge-neutral" : "badge-warning",
                            false
                        );
                    }
                }

            } else if (data.status === 'finished') {
                showResults(data);
            }
        });
}

// ==========================================
// 12. KLASİK MOD HARF SEÇİMİ
// ==========================================
function renderClassicAlphabet() {
    const container = document.getElementById('classicAlphabetContainer');
    if (!container) return;

    container.innerHTML = '';
    "ABCÇDEFGĞHİIJKLMNOÖPRSŞTUÜVYZ".split('').forEach(char => {
        const btn = document.createElement('div');
        btn.classList.add('alpha-btn');
        btn.textContent = char;
        btn.onclick = () => selectClassicLetter(char, btn);
        container.appendChild(btn);
    });
}

function selectClassicLetter(char, btnElement) {
    selectedClassicLetter = char;

    document.querySelectorAll('#classicAlphabetContainer .alpha-btn').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');

    const confirmBtn = document.getElementById('confirmLetterBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = `"${char}" HARFİNİ GÖNDER`;
        confirmBtn.style.backgroundColor = "#28a745";
        confirmBtn.style.color = "white";
    }
}

function submitClassicLetter() {
    if (!selectedClassicLetter) return;
    submitLetter(selectedClassicLetter);
    selectedClassicLetter = null;
    document.getElementById('classicLetterSelectionArea').classList.add('hidden');
}

// ==========================================
// 13. JOKER HARF SEÇİMİ
// ==========================================
function renderAlphabetSelector(gameMode) {
    const randomDisplay = document.getElementById('randomLetterDisplay');
    const classicArea = document.getElementById('classicLetterSelectionArea');
    const classicContainer = document.getElementById('classicAlphabetContainer');
    const confirmBtn = document.getElementById('confirmLetterBtn');

    let target;
    if (gameMode === 'CLASSIC') {
        target = classicContainer;
        if (classicArea) classicArea.classList.remove('hidden');
        if (confirmBtn) confirmBtn.style.display = 'none';
    } else {
        target = randomDisplay;
        if (randomDisplay) randomDisplay.classList.remove('hidden');
    }

    if (!target || target.querySelector('.alphabet-wrapper')) return;

    target.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'alphabet-wrapper';

    "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split('').forEach(letter => {
        const btn = document.createElement('div');
        btn.textContent = letter;
        btn.className = 'alpha-btn';
        btn.id = `btn-joker-${letter}`;
        btn.onclick = (e) => {
            e.stopPropagation();
            selectJokerLetter(letter);
        };
        wrapper.appendChild(btn);
    });

    target.appendChild(wrapper);
}

function selectJokerLetter(letter) {
    myFinalLetter = letter;

    document.querySelectorAll('.alpha-btn').forEach(btn => btn.classList.remove('selected'));
    const selectedBtn = document.getElementById(`btn-joker-${letter}`);
    if (selectedBtn) selectedBtn.classList.add('selected');

    const turnBadge = document.getElementById('turnStatusBadge');
    if (turnBadge) {
        turnBadge.textContent = `SEÇİLEN: ${letter} - YERLEŞTİRİN`;
        turnBadge.className = "status-badge badge-success";
    }

    placementMode = true;
    const myGridEl = document.getElementById('myGrid');
    if (myGridEl) {
        myGridEl.classList.remove('waiting-turn');
        myGridEl.classList.add('active-turn');
        myGridEl.style.opacity = "1";
        myGridEl.style.pointerEvents = "auto";
    }

    renderGrid(myGridData, 'myGrid');
}

// ==========================================
// 14. HARF GÖNDERİMİ (KLASİK MOD)
// ==========================================
async function submitLetter(letterParam = null) {
    let letter = letterParam;

    if (!letter) {
        const letterInput = document.getElementById('letterInput');
        if (letterInput) letter = letterInput.value.trim().toUpperCase();
    }

    if (!letter) return;

    if (!"ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".includes(letter)) {
        alert("Geçersiz harf.");
        return;
    }

    const gameRef = db.collection('games').doc(currentGameId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(gameRef);
            if (!doc.exists) throw new Error("Oyun bulunamadı.");

            const data = doc.data();
            if (data.currentLetter) return;
            if (data.turnOwner !== myPlayerId) throw new Error("Sıra sizde değil.");

            transaction.update(gameRef, { currentLetter: letter });
        });

        const classicArea = document.getElementById('classicLetterSelectionArea');
        if (classicArea) classicArea.classList.add('hidden');
        selectedClassicLetter = null;

    } catch (error) {
        console.error("Harf gönderme hatası:", error);
    }
}

// ==========================================
// 15. HÜCRE TIKLAMA VE HAMLE YAPMA
// ==========================================
async function handleCellClick(index) {
    if (!placementMode) return;

    if (selectedDraftIndex !== index) {
        selectedDraftIndex = index;
        renderGrid(myGridData, 'myGrid');
        return;
    }

    selectedDraftIndex = null;

    if (myGridData[index] !== '') {
        alert("Bu hücre zaten dolu.");
        renderGrid(myGridData, 'myGrid');
        return;
    }

    const gameRef = db.collection('games').doc(currentGameId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(gameRef);
            if (!doc.exists) throw new Error("Oyun bulunamadı.");

            const data = doc.data();
            const currentMoveNumber = data.moveNumber;
            const isSinglePlayer = data.isSinglePlayer || false;
            const isFinalMove = (currentMoveNumber === 25);

            let letterToPlace;
            if (isFinalMove) {
                if (!myFinalLetter) throw new Error("Joker harf seçilmedi!");
                letterToPlace = myFinalLetter;
            } else {
                if (!data.currentLetter) throw new Error("Sunucudan harf gelmedi.");
                letterToPlace = data.currentLetter;
            }

            let myCurrentGrid = (myPlayerId === 'PlayerA') ? [...data.gridA] : [...data.gridB];
            if (myCurrentGrid[index] !== '') throw new Error("Hücre dolu.");
            myCurrentGrid[index] = letterToPlace;

            let updatePayload = {};
            if (myPlayerId === 'PlayerA') {
                updatePayload.gridA = myCurrentGrid;
                if (isFinalMove) updatePayload.jokerIndexA = index;
            } else {
                updatePayload.gridB = myCurrentGrid;
                if (isFinalMove) updatePayload.jokerIndexB = index;
            }

            if (isSinglePlayer) {
                if (isFinalMove) {
                    updatePayload.status = 'finished';
                    updatePayload.currentLetter = null;
                    if (data.isDailyChallenge) {
                        const finalRes = calculateScore(myCurrentGrid);
                        submitDailyScoreAndGetBest(finalRes.score, myCurrentGrid, index);
                    }
                } else {
                    const nextMove = currentMoveNumber + 1;
                    updatePayload.moveNumber = nextMove;
                    updatePayload.currentLetter = (nextMove === 25) ? null : data.letterSequence[currentMoveNumber];
                }
            } else {
                let oppCurrentGrid = (myPlayerId === 'PlayerA') ? data.gridB : data.gridA;
                const oppFilledCount = oppCurrentGrid.filter(c => c !== '' && c !== null).length;
                const myNewFilledCount = myCurrentGrid.filter(c => c !== '' && c !== null).length;

                if (isFinalMove) {
                    if (oppFilledCount === 25) {
                        updatePayload.status = 'finished';
                        updatePayload.currentLetter = null;
                    }
                } else {
                    if (myNewFilledCount === currentMoveNumber && oppFilledCount === currentMoveNumber) {
                        const nextMove = currentMoveNumber + 1;
                        updatePayload.moveNumber = nextMove;

                        if (data.gameMode === 'CLASSIC') {
                            updatePayload.turnOwner = (nextMove % 2 !== 0) ? 'PlayerA' : 'PlayerB';
                            updatePayload.currentLetter = null;
                        } else {
                            updatePayload.turnOwner = (data.turnOwner === 'PlayerA') ? 'PlayerB' : 'PlayerA';
                            updatePayload.currentLetter = (nextMove <= 24) ? data.letterSequence[nextMove - 1] : null;
                        }
                    }
                }
            }

            transaction.update(gameRef, updatePayload);
        });

    } catch (e) {
        console.error("Hücre hatası:", e);
        alert(e.message);
        selectedDraftIndex = null;
        renderGrid(myGridData, 'myGrid');
    }
}

// ==========================================
// 16. PUAN HESAPLAMA
// ==========================================
function calculateScore(gridData) {
    if (!gridData || !Array.isArray(gridData)) {
        return { score: 0, words: [], rowScores: [0, 0, 0, 0, 0], colScores: [0, 0, 0, 0, 0] };
    }

    const GRID_SIZE = 5;
    let totalScore = 0;
    let foundWords = new Set();
    const rowScores = Array(5).fill(0);
    const colScores = Array(5).fill(0);
    const SCORE_RULES = { 2: 2, 3: 5, 4: 9, 5: 15 };

    const getSegmentMaxScore = (text) => {
        if (text.length === 5 && isValidWord(text)) {
            foundWords.add(text);
            return SCORE_RULES[5];
        }

        for (let i = 0; i <= text.length - 4; i++) {
            const sub = text.substring(i, i + 4);
            if (isValidWord(sub)) {
                foundWords.add(sub);
                return SCORE_RULES[4];
            }
        }

        let maxComboScore = 0;
        let bestWords = [];
        let validSubWords = [];

        for (let len = 3; len >= 2; len--) {
            for (let i = 0; i <= text.length - len; i++) {
                const sub = text.substring(i, i + len);
                if (isValidWord(sub)) {
                    validSubWords.push({ word: sub, start: i, end: i + len, score: SCORE_RULES[len] });
                }
            }
        }

        validSubWords.forEach(item => {
            if (item.score > maxComboScore) {
                maxComboScore = item.score;
                bestWords = [item.word];
            }
        });

        for (let i = 0; i < validSubWords.length; i++) {
            for (let j = i + 1; j < validSubWords.length; j++) {
                const w1 = validSubWords[i];
                const w2 = validSubWords[j];
                if (w1.start < w2.end && w2.start < w1.end) continue;
                const currentTotal = w1.score + w2.score;
                if (currentTotal > maxComboScore) {
                    maxComboScore = currentTotal;
                    bestWords = [w1.word, w2.word];
                }
            }
        }

        bestWords.forEach(w => foundWords.add(w));
        return maxComboScore;
    };

    const getLineString = (indices) => indices.map(i => gridData[i] || ' ').join('');

    for (let row = 0; row < GRID_SIZE; row++) {
        const indices = Array.from({ length: GRID_SIZE }, (_, i) => row * GRID_SIZE + i);
        getLineString(indices).replace(/\s+/g, ' ').split(' ').forEach(seg => {
            if (seg.length >= 2) {
                const s = getSegmentMaxScore(seg);
                totalScore += s;
                rowScores[row] += s;
            }
        });
    }

    for (let col = 0; col < GRID_SIZE; col++) {
        const indices = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + col);
        getLineString(indices).replace(/\s+/g, ' ').split(' ').forEach(seg => {
            if (seg.length >= 2) {
                const s = getSegmentMaxScore(seg);
                totalScore += s;
                colScores[col] += s;
            }
        });
    }

    return {
        score: totalScore,
        words: Array.from(foundWords).sort((a, b) => b.length !== a.length ? b.length - a.length : a.localeCompare(b, 'tr')),
        rowScores,
        colScores
    };
}

// ==========================================
// 17. GÜNLÜK CHALLENGE SIRALAMA
// ==========================================
async function submitDailyScoreAndGetBest(score, gridData, jokerIndex) {
    const todayKey = new Date().toISOString().split('T')[0];
    const leaderboardRef = db.collection('daily_leaderboard').doc(todayKey).collection('scores');
    const userId = getMyStatsId();

    try {
        await leaderboardRef.doc(userId).set({
            score: Number(score),
            gridData: gridData || Array(25).fill(''),
            jokerIndex: jokerIndex !== undefined ? jokerIndex : -1,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: userId
        });

        const topScoreSnapshot = await leaderboardRef.orderBy('score', 'desc').limit(1).get();

        if (!topScoreSnapshot.empty) {
            const bestDoc = topScoreSnapshot.docs[0].data();
            if (bestDoc.score >= score) {
                return { score: bestDoc.score, gridData: bestDoc.gridData, jokerIndex: bestDoc.jokerIndex };
            }
        }
        return { score, gridData, jokerIndex };

    } catch (error) {
        console.error("Rekor çekme hatası:", error);
        return { score, gridData, jokerIndex };
    }
}

function shareDailyResult() {
    // İleride uygulanabilir
}

// ==========================================
// 18. OYUN SONUÇLARINI GÖSTERME
// ==========================================
async function showResults(data) {
    if (data.isDailyChallenge) {
        const titleB = document.getElementById('resultTitleB');
        if (titleB) titleB.textContent = "REKOR YÜKLENİYOR...";

        const tempResA = calculateScore(data.gridA);
        const bestRecord = await submitDailyScoreAndGetBest(tempResA.score, data.gridA, data.jokerIndexA);

        data.gridB = bestRecord.gridData || Array(25).fill('');
        data.jokerIndexB = bestRecord.jokerIndex !== undefined ? bestRecord.jokerIndex : -1;
    }

    const resA = calculateScore(data.gridA);
    const resB = calculateScore(data.gridB);

    const isMeA = (myPlayerId === 'PlayerA');
    const myRes = isMeA ? resA : resB;
    const oppRes = isMeA ? resB : resA;
    const myGrid = isMeA ? data.gridA : data.gridB;
    const oppGrid = isMeA ? data.gridB : data.gridA;
    const myJokerIndex = isMeA ? data.jokerIndexA : data.jokerIndexB;
    const oppJokerIndex = isMeA ? data.jokerIndexB : data.jokerIndexA;

    document.getElementById('lobbyPanel').classList.add('hidden');
    document.getElementById('gamePanel').classList.add('hidden');
    document.getElementById('gameOverPanel').classList.remove('hidden');

    const resultMsg = document.getElementById('finalResultMsg');
    if (resultMsg) resultMsg.style.display = 'none';

    const wordsListAEl = document.getElementById('wordsListA');
    const dailySummary = document.getElementById('dailyResultSummary');
    const opponentCard = document.getElementById('opponentResultCard');
    const titleA = document.getElementById('resultTitleA');
    const titleB = document.getElementById('resultTitleB');

    animateSlotScore(myRes.score, 'scoreA');
    renderFinalScoreGrid(myGrid, 'finalGridA', myRes.rowScores, myRes.colScores, myJokerIndex);

    wordsListAEl.innerHTML = myRes.words.length > 0
        ? myRes.words.map(w => `<li onclick="fetchDefinition('${w}')">${w}</li>`).join('')
        : '<li>Kelime bulunamadı</li>';

    if (data.isDailyChallenge) {
        if (opponentCard) opponentCard.style.display = 'flex';
        if (dailySummary) dailySummary.classList.add('hidden');
        if (titleA) titleA.innerHTML = 'SENİN ALANIN';
        if (titleB) titleB.textContent = '👑 GÜNÜN REKORU';

        const wordsListBEl = document.getElementById('wordsListB');
        animateSlotScore(oppRes.score, 'scoreB');
        renderFinalScoreGrid(oppGrid, 'finalGridB', oppRes.rowScores, oppRes.colScores, oppJokerIndex);

        if (wordsListBEl) {
            wordsListBEl.innerHTML = oppRes.words.length > 0
                ? oppRes.words.map(w => `<li onclick="fetchDefinition('${w}')">${w}</li>`).join('')
                : '<li>Kelime bulunamadı</li>';
        }

        localStorage.setItem('daily_last_played', new Date().toISOString().split('T')[0]);

    } else if (data.isSinglePlayer) {
        if (opponentCard) opponentCard.style.display = 'none';
        if (dailySummary) dailySummary.classList.add('hidden');
        if (titleA) titleA.textContent = "OYUN SONUCUNUZ";

    } else {
        if (opponentCard) opponentCard.style.display = 'flex';
        if (dailySummary) dailySummary.classList.add('hidden');
        if (titleA) titleA.innerHTML = 'SENİN ALANIN';
        if (titleB) titleB.textContent = 'RAKİP ALANI';

        const wordsListBEl = document.getElementById('wordsListB');
        animateSlotScore(oppRes.score, 'scoreB');
        renderFinalScoreGrid(oppGrid, 'finalGridB', oppRes.rowScores, oppRes.colScores, oppJokerIndex);

        if (wordsListBEl) {
            wordsListBEl.innerHTML = oppRes.words.length > 0
                ? oppRes.words.map(w => `<li onclick="fetchDefinition('${w}')">${w}</li>`).join('')
                : '<li>Kelime bulunamadı</li>';
        }
    }

    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}

// ==========================================
// 19. GRİD ÇİZİM FONKSİYONLARI
// ==========================================
function renderGrid(gridData, elementId) {
    const gridElement = document.getElementById(elementId);
    if (!gridElement || !gridData || !Array.isArray(gridData)) return;

    gridElement.innerHTML = '';

    const isMyGrid = (elementId === 'myGrid');
    const isClickable = isMyGrid && placementMode;

    gridData.forEach((letter, index) => {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.textContent = letter || '';

        if (isMyGrid && index === selectedDraftIndex) {
            cell.classList.add('selected-draft');
            if (letter === '') {
                if (myFinalLetter) {
                    cell.textContent = myFinalLetter;
                } else {
                    const display = document.getElementById('randomLetterDisplay');
                    if (display && !display.querySelector('.alphabet-wrapper')) {
                        const visibleLetter = display.textContent.trim();
                        if (visibleLetter.length === 1) cell.textContent = visibleLetter;
                    }
                }
            }
        }

        const shouldBeClickable = isClickable && (letter === '' || index === selectedDraftIndex);
        if (shouldBeClickable) {
            cell.classList.add('clickable');
            cell.onclick = () => handleCellClick(index);
        }

        gridElement.appendChild(cell);
    });
}

function renderFinalScoreGrid(gridData, elementId, rowScores, colScores, jokerIndex = -1) {
    const gridElement = document.getElementById(elementId);
    if (!gridElement) return;

    gridElement.style.gridTemplateColumns = 'repeat(6, 1fr)';
    gridElement.style.gridTemplateRows = 'repeat(6, 1fr)';
    gridElement.innerHTML = '';

    const getScoreClass = (score) => {
        if (score >= 15) return 'score-15';
        if (score >= 9) return 'score-9';
        if (score >= 7) return 'score-7';
        if (score >= 5) return 'score-5';
        if (score >= 4) return 'score-4';
        if (score === 2) return 'score-2';
        if (score === 0) return 'score-0';
        return '';
    };

    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        if (i === jokerIndex) cell.classList.add('joker-highlight');
        cell.textContent = gridData[i] || '';
        gridElement.appendChild(cell);

        if ((i + 1) % 5 === 0) {
            const rowIndex = Math.floor(i / 5);
            const scoreCell = document.createElement('div');
            const score = rowScores[rowIndex];
            scoreCell.classList.add('cell', 'score-cell-row', getScoreClass(score));
            scoreCell.textContent = score;
            gridElement.appendChild(scoreCell);
        }
    }

    colScores.forEach(score => {
        const scoreCell = document.createElement('div');
        scoreCell.classList.add('cell', 'score-cell-col', getScoreClass(score));
        scoreCell.textContent = score;
        gridElement.appendChild(scoreCell);
    });

    const cornerCell = document.createElement('div');
    cornerCell.classList.add('cell', 'empty-corner');
    gridElement.appendChild(cornerCell);
}

// ==========================================
// 20. KALAN HARF İSTATİSTİĞİ
// ==========================================
function updateLetterStats(sequence, moveNumber) {
    if (!sequence || sequence.length === 0) return;

    const remainingPool = (moveNumber <= 24) ? sequence.slice(moveNumber) : [];
    let vCount = 0;
    let cCount = 0;

    remainingPool.forEach(char => {
        ALL_VOWELS.includes(char.toUpperCase()) ? vCount++ : cCount++;
    });

    const vEl = document.getElementById('vowel-count');
    const cEl = document.getElementById('consonant-count');
    if (vEl) vEl.textContent = vCount;
    if (cEl) cEl.textContent = cCount;
}

// ==========================================
// 21. SLOT MAKİNESİ PUAN ANİMASYONU
// ==========================================
function animateSlotScore(targetNumber, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const digits = targetNumber.toString().split('');
    container.innerHTML = '';

    digits.forEach((digit, index) => {
        const column = document.createElement('div');
        column.className = 'slot-column';

        let slotContent = '';
        for (let i = 0; i <= 20; i++) {
            slotContent += `<div class="digit">${i % 10}</div>`;
        }
        column.innerHTML = slotContent;
        container.appendChild(column);

        setTimeout(() => {
            const moveY = (10 + parseInt(digit)) * 45;
            column.style.transform = `translateY(-${moveY}px)`;
        }, index * 150);
    });
}

// ==========================================
// 22. KELİME TANIMI (SÖZLÜK SORGUSU)
// ==========================================
async function fetchDefinition(word) {
    const modal = document.getElementById('definitionModal');
    const title = document.getElementById('defTitle');
    const body = document.getElementById('definitionBody');

    title.textContent = word.toUpperCase('tr');
    body.innerHTML = "<i>Searching...</i>";
    modal.style.display = "flex";

    const scriptUrl = "https://script.google.com/macros/s/AKfycbyHywT-EMNS7J1eOGbALgi2TGNF-uuM9wFpsVk12gn1_Lwwz0bq6AgY7m9EuAHSKXlP/exec";

    try {
        const response = await fetch(`${scriptUrl}?word=${encodeURIComponent(word.toLowerCase('tr'))}`);
        const data = await response.json();

        if (data && data[0] && data[0].anlamlarListe) {
            body.innerHTML = `<p>${data[0].anlamlarListe[0].anlam}</p>`;
        } else {
            body.innerHTML = "Definition not found.";
        }
    } catch (error) {
        body.innerHTML = "Error connecting to dictionary.";
    }
}

function closeDefinition() {
    const modal = document.getElementById('definitionModal');
    if (modal) {
        modal.style.display = "none";
        document.getElementById('definitionBody').innerHTML = "";
    }
}

// ==========================================
// 23. SAYFA YÜKLEME (DOMContentLoaded)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Dark mode tercihini uygula
    const savedTheme = localStorage.getItem('theme');
    const darkBtn = document.getElementById('darkModeBtn');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (darkBtn) darkBtn.textContent = '☀️';
    }

    // Modal: Dışarıya tıklanınca kapat
    window.onclick = (event) => {
        const infoModal = document.getElementById("howToPlayModal");
        const defModal = document.getElementById('definitionModal');
        if (event.target === infoModal) window.closeInfoModal();
        if (event.target === defModal) closeDefinition();
    };
});

