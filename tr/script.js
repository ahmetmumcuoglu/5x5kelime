// =========================================
// 1. KÜRESEL DURUM (STATE YÖNETİMİ)
// =========================================
const gameState = {
    wordList: new Set(),
    currentTurn: 1,
    maxTurns: 25,
    score: 0,
    gameMode: null,
    isJokerTurn: false,
    isGameOver: false,
    isGameStarted: false,
    board: Array(25).fill(null),
    currentLetter: null,
    roomCode: null,
    isHost: false
};

// =========================================
// 2. FIREBASE BAŞLATMA
// =========================================
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

// =========================================
// 3. VERİ ÇEKME (FETCH API)
// =========================================
async function loadWords() {
    try {
        const response = await fetch('kelime.json');
        if (!response.ok) throw new Error("Kelime veritabanına ulaşılamadı.");
        
        const wordsArray = await response.json();
        gameState.wordList = new Set(wordsArray.map(word => word.toLocaleUpperCase('tr-TR')));
        console.log(`${gameState.wordList.size} kelime başarıyla yüklendi.`);
    } catch (error) {
        console.error("Sistem Hatası:", error);
        alert("Oyun kelimeleri yüklenemedi. Lütfen bağlantınızı kontrol edip sayfayı yenileyin.");
    }
}

// =========================================
// 4. OYUN KURALLARI VE PUANLAMA MANTIĞI
// =========================================
function checkTurnStatus() {
    if (gameState.currentTurn === gameState.maxTurns) {
        gameState.isJokerTurn = true;
        activateJokerMode();
    } else if (gameState.currentTurn > gameState.maxTurns) {
        endGame();
    }
}

function activateJokerMode() {
    console.log("Joker Turu Aktif!");
    // Mobil klavye veya arayüz uyarıları eklenebilir.
}

function calculateWordScore(word) {
    const upperWord = word.toLocaleUpperCase('tr-TR');
    if (!gameState.wordList.has(upperWord)) return 0;

    const length = upperWord.length;
    if (length === 5) return 15;
    if (length === 4) return 9;
    if (length === 3) return 5;
    if (length === 2) return 2;
    return 0;
}

// =========================================
// 5. OYUN TAHTASI (GRID) YÖNETİMİ
// =========================================
function createGrid(containerId, isOpponent = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!isOpponent) {
        gameState.board = Array(25).fill(null);
    }

    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;

        if (!isOpponent) {
            cell.addEventListener('click', () => handleCellClick(i, cell));
        }
        container.appendChild(cell);
    }
}

function handleCellClick(index, cellElement) {
    if (gameState.isGameOver || gameState.board[index] !== null) return;

    let letterToPlace = '';

    if (gameState.isJokerTurn) {
        const input = prompt("JOKER TURU! Yerleştirmek istediğiniz harfi girin:")?.toLocaleUpperCase('tr-TR');
        if (!input || input.length !== 1 || !/^[A-ZÇĞİÖŞÜ]$/.test(input)) {
            alert("Lütfen geçerli tek bir harf girin.");
            return;
        }
        letterToPlace = input;
    } else {
        // Rastgele veya Klasik mod için harf ataması (Geçici varsayılan "A" olarak bırakıldı, oyun mantığına göre bağlanacak)
        letterToPlace = gameState.currentLetter || "A"; 
        if (!letterToPlace) {
            alert("Önce bir harf seçmeli veya oyunun harf vermesini beklemelisiniz!");
            return;
        }
    }

    gameState.board[index] = letterToPlace;
    cellElement.textContent = letterToPlace;
    cellElement.classList.add('filled');

    if (!gameState.isJokerTurn) {
        gameState.currentLetter = null;
    }

    gameState.currentTurn++;
    checkTurnStatus();
}

// =========================================
// 6. KELİME TARAMA VE PUAN HESAPLAMA
// =========================================
function getWordsFromLine(lineArray) {
    let foundWords = [];
    let usedIndices = new Set();

    for (let length = 5; length >= 2; length--) {
        for (let i = 0; i <= 5 - length; i++) {
            let canUse = true;
            for (let j = i; j < i + length; j++) {
                if (usedIndices.has(j)) { canUse = false; break; }
            }
            
            if (canUse) {
                let wordStr = lineArray.slice(i, i + length).join('');
                if (gameState.wordList.has(wordStr)) {
                    foundWords.push(wordStr);
                    for (let j = i; j < i + length; j++) { usedIndices.add(j); }
                }
            }
        }
    }
    return foundWords;
}

function calculateFinalScore(board) {
    let totalScore = 0;
    let allFoundWords = [];

    // YATAY TARAMA
    for (let row = 0; row < 5; row++) {
        let rowLetters = [];
        for (let col = 0; col < 5; col++) {
            rowLetters.push(board[row * 5 + col]);
        }
        let words = getWordsFromLine(rowLetters);
        words.forEach(word => {
            totalScore += calculateWordScore(word);
            allFoundWords.push(word);
        });
    }

    // DİKEY TARAMA
    for (let col = 0; col < 5; col++) {
        let colLetters = [];
        for (let row = 0; row < 5; row++) {
            colLetters.push(board[row * 5 + col]);
        }
        let words = getWordsFromLine(colLetters);
        words.forEach(word => {
            totalScore += calculateWordScore(word);
            allFoundWords.push(word);
        });
    }

    return { score: totalScore, words: allFoundWords };
}

function endGame() {
    gameState.isGameOver = true;
    const finalResult = calculateFinalScore(gameState.board);
    
    document.getElementById('gamePanel').classList.add('hidden');
    document.getElementById('gameOverPanel').classList.remove('hidden');
    
    console.log("Oyun Bitti! Toplam Puan:", finalResult.score);
    
    // Kazanılan kelimeleri listeleme
    const wordsListA = document.getElementById('wordsListA');
    if (wordsListA) {
        wordsListA.innerHTML = '';
        finalResult.words.forEach(w => {
            let li = document.createElement('li');
            li.textContent = `${w} (${calculateWordScore(w)}p)`;
            wordsListA.appendChild(li);
        });
    }

    // Orijinal Slot Skor Animasyonunu tetikle
    animateSlotScore(finalResult.score, 'scoreA');
}

// Orijinal Slot Animasyonu (Korundu)
function animateSlotScore(targetNumber, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const digits = targetNumber.toString().split('');
    container.innerHTML = ''; 

    digits.forEach((digit) => {
        const column = document.createElement('div');
        column.className = 'slot-column';
        
        let slotContent = '';
        for (let i = 0; i <= 20; i++) { 
            slotContent += `<div class="digit">${i % 10}</div>`;
        }
        column.innerHTML = slotContent;
        container.appendChild(column);

        setTimeout(() => {
            const finalDigit = parseInt(digit);
            // Her hane 45px boyunda.
            column.style.transform = `translateY(-${(10 + finalDigit) * 45}px)`;
        }, 100);
    });
}

// =========================================
// 7. ÇOK OYUNCULU SENKRONİZASYON (FIREBASE)
// =========================================
async function createRoom(mode) {
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    try {
        await db.collection("rooms").doc(roomCode).set({
            mode: mode,
            player1: "Oda Sahibi",
            player2: null,
            status: "waiting",
            moves: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        gameState.roomCode = roomCode;
        gameState.isHost = true;
        
        document.getElementById('gameCodeDisplay').textContent = roomCode;
        document.getElementById('turnStatusBadge').textContent = "Rakip Bekleniyor...";
        document.getElementById('turnStatusBadge').classList.remove('hidden');
        
        listenRoomChanges(roomCode);
    } catch (error) {
        console.error("Oda kurulamadı:", error);
        alert("Oda kurarken bir hata oluştu.");
    }
}

async function joinRoom() {
    const inputField = document.getElementById('gameCodeInput');
    const roomCode = inputField.value.trim();

    if (roomCode.length !== 4) {
        alert("Lütfen 4 haneli geçerli bir oda kodu girin.");
        return;
    }

    const roomRef = db.collection("rooms").doc(roomCode);
    const doc = await roomRef.get();

    if (doc.exists && doc.data().status === "waiting") {
        await roomRef.update({
            player2: "Katılımcı",
            status: "playing"
        });

        gameState.roomCode = roomCode;
        gameState.isHost = false;
        
        document.getElementById('lobbyPanel').classList.add('hidden');
        document.getElementById('gamePanel').classList.remove('hidden');
        document.getElementById('gameCodeDisplay').textContent = roomCode;
        
        createGrid('myGrid', false);
        createGrid('opponentGrid', true);

        listenRoomChanges(roomCode);
    } else {
        alert("Oda bulunamadı veya şu an dolu.");
    }
}

function listenRoomChanges(roomCode) {
    db.collection("rooms").doc(roomCode).onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();

        if (data.status === "playing" && !gameState.isGameStarted) {
            gameState.isGameStarted = true;
            document.getElementById('turnStatusBadge').textContent = "Oyun Başladı!";
            
            if (gameState.isHost) {
                document.getElementById('lobbyPanel').classList.add('hidden');
                document.getElementById('gamePanel').classList.remove('hidden');
                createGrid('myGrid', false);
                createGrid('opponentGrid', true);
            }
        }
        
        if (data.moves && data.moves.length > 0) {
            // Rakip hamlelerini opponentGrid üzerine çizme mantığı (İleride eklenecek)
        }
    });
}

// =========================================
// 8. OLAY DİNLEYİCİLERİ (EVENT LISTENERS)
// =========================================
function setupEventListeners() {
    const howToPlayModal = document.getElementById('howToPlayModal');
    document.getElementById('howToPlayBtn')?.addEventListener('click', () => howToPlayModal.showModal());
    document.getElementById('closeHowToPlayBtn')?.addEventListener('click', () => howToPlayModal.close());

    const statsModal = document.getElementById('statsModal');
    document.getElementById('statsBtn')?.addEventListener('click', () => statsModal.showModal());
    document.getElementById('closeStatsBtn')?.addEventListener('click', () => statsModal.close());

    document.getElementById('darkModeBtn')?.addEventListener('click', () => document.body.classList.toggle('dark-mode'));

    document.getElementById('btnClassicGame')?.addEventListener('click', () => createRoom('classic'));
    document.getElementById('btnRandomGame')?.addEventListener('click', () => createRoom('random'));
    document.getElementById('joinGameBtn')?.addEventListener('click', () => joinRoom());
}

// =========================================
// SİSTEMİ BAŞLAT
// =========================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadWords();
    setupEventListeners();
});
