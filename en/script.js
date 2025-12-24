// ==========================================
// 1. AYARLAR (Lütfen Burayı Doldur)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCYoOAJshvUBvJhLW5PQTvz-bDfIobCwi8",
  authDomain: "kelimelik-5x5.firebaseapp.com",
  projectId: "kelimelik-5x5",
  storageBucket: "kelimelik-5x5.firebasestorage.app",
  messagingSenderId: "292210549026",
  appId: "1:292210549026:web:21f376ea9d0ee86555057b"
};

// Firebase Başlatma Kontrolü
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==========================================
// NASIL OYNANIR PENCERE AYARLARI (GLOBAL)
// ==========================================

// Pencereyi AÇAN Fonksiyon
window.openInfoModal = function() {
    const modal = document.getElementById("howToPlayModal");
    if (modal) {
        modal.classList.remove("hidden");
        // CSS yüklenmese bile açılması için zorluyoruz:
        modal.style.display = "flex"; 
    }
};

// Pencereyi KAPATAN Fonksiyon
window.closeInfoModal = function() {
    const modal = document.getElementById("howToPlayModal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
};

// Sayfa yüklendiğinde: Pencerenin dışına (siyah alana) tıklayınca kapatma
window.addEventListener('load', () => {
    const modal = document.getElementById("howToPlayModal");
    window.onclick = function(event) {
        if (event.target === modal) {
            window.closeInfoModal();
        }
    };
});

// ==========================================
// YENİ İSTATİSTİK VE SIRALAMA SİSTEMİ
// ==========================================

// 1. Kullanıcı ID'si Al
function getMyStatsId() {
    let id = localStorage.getItem('kelimelik_user_id');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('kelimelik_user_id', id);
    }
    return id;
}

// 2. Yerel İstatistikleri Getir
function getLocalRandomStats() {
    const raw = localStorage.getItem('wordy_random_history_en');
    // Veri yapısı: { allScores: [120, 90, ...], dates: [...] }
    if (!raw) return { allScores: [] };
    return JSON.parse(raw);
}

// 3. İstatistik Güncelle (Oyun Bittiğinde Çağrılır)
function updateRandomStats(score) {
    let data = getLocalRandomStats();
    
    // Puanı listeye ekle
    data.allScores.push(score);
    
    // LocalStorage'a kaydet
    localStorage.setItem('kelimelik_random_history', JSON.stringify(data));

    // --- FIREBASE GÜNCELLEME (AYLIK VERİ) ---
    saveMonthlyStatsToFirebase(data.allScores);
}

// 4. Firebase'e Aylık Veri Yazma
function saveMonthlyStatsToFirebase(allScores) {
    const userId = getMyStatsId();
    const date = new Date();
    // Anahtar Örneği: 'stats_2023_12' (Yıl_Ay)
    const monthKey = `en_stats_${date.getFullYear()}_${date.getMonth() + 1}`; 
    
    // Genel Ortalama
    const totalAvg = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    
    // Sadece bu ayın oyunlarını ayırt etmek zor olacağı için, 
    // Basitlik adına "Toplam Oyun Sayısı" üzerinden filtreleme yapacağız
    // Ancak kullanıcı "Bu ay en az 10 oyun" dediği için, Firebase'de o aya özel sayaç tutmalıyız.
    
    const userRef = db.collection('users').doc(userId);

    db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        let userData = doc.exists ? doc.data() : {};
        
        // O aya ait veriyi al veya oluştur
        let monthData = userData[monthKey] || { count: 0, totalScore: 0, avg: 0 };
        
        // Yeni puanı ekle
        // Not: Burada 'score' parametresini fonksiyon içinde globalden alamadığımız için
        // allScores dizisinin son elemanını alıyoruz.
        const lastScore = allScores[allScores.length - 1];
        
        monthData.count += 1;
        monthData.totalScore += lastScore;
        monthData.avg = Math.round(monthData.totalScore / monthData.count); // Tam sayı ortalama

        // Veriyi güncelle
        transaction.set(userRef, {
            [monthKey]: monthData, // Dinamik anahtar (Örn: stats_2025_12)
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    });
}

// 5. İstatistik Penceresini Açma ve Hesaplama
window.openStatsModal = function() {
    const modal = document.getElementById("statsModal");
    if (!modal) return;

    // --- KİŞİSEL VERİLERİ HESAPLA ---
    const data = getLocalRandomStats();
    const scores = data.allScores;
    
    let lifeTimeAvg = "-";
    let last10Avg = "-";

    if (scores.length > 0) {
        // Genel Ortalama
        const total = scores.reduce((a, b) => a + b, 0);
        lifeTimeAvg = (total / scores.length).toFixed(1); // Virgülden sonra 1 hane

        // Son 10 Ortalama
        // slice(-10) son 10 elemanı alır
        const last10 = scores.slice(-10);
        const total10 = last10.reduce((a, b) => a + b, 0);
        last10Avg = (total10 / last10.length).toFixed(1);
    }

    document.getElementById('statLifeTimeAvg').textContent = lifeTimeAvg;
    document.getElementById('statLast10Avg').textContent = last10Avg;

    modal.classList.remove("hidden");
    modal.style.display = "flex";

    // --- LİDER TABLOSUNU ÇEK ---
    fetchLeaderboard();
};

// 6. Lider Tablosunu Getir
function fetchLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '<tr><td colspan="3">Yükleniyor...</td></tr>';

    const date = new Date();
    const monthKey = `en_stats_${date.getFullYear()}_${date.getMonth() + 1}`; // Örn: stats_2025_12
    
    // SORGULAMA: O ayın sayacı >= 10 olanları getir, Ortalamaya göre sırala
    // NOT: Bu sorgu için Firebase Console'da Index oluşturmanız gerekebilir!
    // Eğer console'da hata linki çıkarsa ona tıklayıp index oluşturun.
    
    db.collection('users')
        .orderBy(`${monthKey}.avg`, 'desc') // Ortalamaya göre azalan
        .limit(20) // İlk 20 kişi
        .get()
        .then(snapshot => {
            let html = '';
            let rank = 1;
            
            snapshot.forEach(doc => {
                const uData = doc.data();
                const mData = uData[monthKey];

                // Filtreleme: En az 10 oyun (Firestore where sorgusu index isteyeceği için
                // basitlik adına filtrelemeyi burada yapıyoruz, veri azsa sorun olmaz)
                if (mData && mData.count >= 10) {
                    // Kullanıcı ID'sinin son 4 hanesini göster (Gizlilik için)
                    const shortName = "Player-" + doc.id.substr(-4).toUpperCase();
                    
                    // Kendi satırımızı vurgulamak için
                    const isMe = (doc.id === getMyStatsId());
                    const rowStyle = isMe ? 'style="background-color:#e8f8f5; font-weight:bold;"' : '';

                    html += `
                        <tr ${rowStyle}>
                            <td>${rank++}.</td>
                            <td>${shortName} ${isMe ? '(Sen)' : ''}</td>
                            <td>${mData.avg} Puan</td>
                        </tr>
                    `;
                }
            });

            if (html === '') {
                html = '<tr><td colspan="3">Bu ay henüz yeterli oyun oynanmadı.</td></tr>';
            }
            tbody.innerHTML = html;
        })
        .catch(error => {
            console.error("Leaderboard error:", error);
            tbody.innerHTML = '<tr><td colspan="3">Sıralama yüklenemedi.</td></tr>';
        });
}

// Kapatma Fonksiyonu (Aynı kalabilir)
window.closeStatsModal = function() {
    document.getElementById("statsModal").classList.add("hidden");
    document.getElementById("statsModal").style.display = "none";
};

// ==========================================
// 1.1. PUANLAMA VE SÖZLÜK TANIMLARI
// ==========================================
const SCORE_RULES = { 3: 5, 4: 9, 5: 15 };

// DİKKAT: JSON dosyasının içeriği bu değişkenin içine yapıştırılacak.

// Global Sözlük Değişkeni (Başlangıçta boş)
let DICTIONARY = new Set();

// JSON dosyasını yükleyen asenkron fonksiyon
async function loadDictionary() {
    try {
        // 'en' klasöründeki words.json dosyasını oku
        const response = await fetch('words.json');
        
        if (!response.ok) {
            throw new Error('Dictionary file (words.json) could not be loaded.');
        }

        const words = await response.json();

        // İngilizce için standart toUpperCase() kullanıyoruz
        // Set kullanımı arama hızını (includes) binlerce kelime olsa bile çok artırır.
        DICTIONARY = new Set(words.map(word => word.trim().toUpperCase()));

        console.log("English dictionary loaded successfully. Word count:", DICTIONARY.size);
        
        // İsteğe bağlı: Sözlük yüklendiğinde lobideki mesajı temizle
        const lobbyStatus = document.getElementById('lobbyStatus');
        if (lobbyStatus) lobbyStatus.textContent = "";

    } catch (error) {
        console.error("Fatal Error:", error);
        const lobbyStatus = document.getElementById('lobbyStatus');
        if (lobbyStatus) lobbyStatus.textContent = "Error: Word list failed to load.";
    }
}

// Sayfa açılır açılmaz sözlüğü yüklemeye başla
loadDictionary();

function isValidWord(word) {
    // Kelimeyi büyük harfe çevir ve sözlükte var mı diye bak
    return DICTIONARY.has(word.toUpperCase());
}

// 1. ENGLISH ALPHABET & POINTS
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Türkçedeki Sesli ve Sessiz Harfler
const VOWELS = "AEIOU";

// ENGLISH LETTER POOL CONFIG (For Random Mode)
const LETTER_POOL_CONFIG = {
    'E': 12, 'A': 9, 'I': 8, 'O': 7, 'U': 4, // Vowels
    'T': 8, 'R': 7, 'N': 6, 'S': 6, 'L': 5, 'D': 4, // Common Consonants
    'H': 4, 'C': 3, 'M': 3, 'P': 3, 'G': 2, 'B': 2, 'Y': 3, 
    'F': 2, 'W': 2, 'V': 2, 'K': 1, 'X': 1, 'J': 1, 'Q': 1, 'Z': 1
};

// =========================================================
// YARDIMCI FONKSİYON: DİZİ KARIŞTIRMA (SHUFFLE)
// =========================================================
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// =========================================================
// OYUN SIRASINI ÜRETME FONKSİYONU (12 SESLİ + 12 SESSİZ = 24 HARF)
// =========================================================

function generateGameSequence() {
    let vowelPool = [];
    let consonantPool = [];

    // 1. Ağırlığa göre Harf Havuzlarını Sesli ve Sessiz olarak ayır
    // (LETTER_POOL_CONFIG değişkeninin İngilizce versiyonunu kullandığından emin ol)
    for (let [letter, count] of Object.entries(LETTER_POOL_CONFIG)) {
        for (let i = 0; i < count; i++) {
            if (VOWELS.includes(letter)) {
                vowelPool.push(letter);
            } else {
                consonantPool.push(letter);
            }
        }
    }

    // 2. Havuzları Karıştır
    shuffleArray(vowelPool);
    shuffleArray(consonantPool);

    // 3. İNGİLİZCE İÇİN YENİ HEDEFLER
    // Toplam 24 Harf (25. tur Joker)
    const VOWEL_TARGET = 10;      // Türkçe'de 12 idi, burada 10'a düşürdük
    const CONSONANT_TARGET = 14;  // Türkçe'de 12 idi, burada 14'e çıkardık (Sessiz öbekleri için)

    let finalSequence = [];
    
    // 4. Hedef Sayıda Harf Çekimi
    
    // Sesli Harfleri Çek (10 tane)
    const requiredVowels = Math.min(VOWEL_TARGET, vowelPool.length);
    finalSequence.push(...vowelPool.slice(0, requiredVowels));

    // Sessiz Harfleri Çek (14 tane)
    const requiredConsonants = Math.min(CONSONANT_TARGET, consonantPool.length);
    finalSequence.push(...consonantPool.slice(0, requiredConsonants));

    // --- İNGİLİZCEYE ÖZEL Q-U KONTROLÜ (BONUS) ---
    // Eğer dizide 'Q' varsa ama 'U' yoksa, rastgele bir sesliyi silip yerine 'U' koyar.
    const hasQ = finalSequence.includes('Q');
    const hasU = finalSequence.includes('U');

    if (hasQ && !hasU) {
        // Dizideki herhangi bir sesli harfin yerini bul
        const vowelIndex = finalSequence.findIndex(l => VOWELS.includes(l));
        if (vowelIndex !== -1) {
            finalSequence[vowelIndex] = 'U'; // O sesliyi U yap
            console.log("Oyun Dengesı: Q geldiği için U harfi zorunlu eklendi.");
        }
    }
    // ------------------------------------------------

    // 5. Son 24 Harflik Diziyi Karıştır
    shuffleArray(finalSequence); 

    // Güvenlik Kontrolü
    if (finalSequence.length !== (VOWEL_TARGET + CONSONANT_TARGET)) {
        console.warn(`WARNING: Letter pool insufficient. Generated only ${finalSequence.length} letters.`);
    }

    return finalSequence;
}

// ==========================================
// 2. OYUN DEĞİŞKENLERİ
// ==========================================
let currentGameId = null;     // Mevcut oyunun kodu (Örn: "AB12")
let myPlayerId = null;        // Oyuncunun rolü ('PlayerA' veya 'PlayerB')
let placementMode = false;    // Hücrelere tıklamaya izin var mı? (Boolean)
let myFinalLetter = null;     // 25. hamle için yerel olarak seçilen harf (Sadece 25. hamlede kullanılır)
let unsubscribe = null;       // Firebase anlık dinleyicisini kapatmak için kullanılır.
let selectedDraftIndex = -1; // Seçili hücrenin indeksini tutar (Onay mekanizması için)
let myGridData = [];
let selectedClassicLetter = null; // Klasik modda o an seçilen (ama henüz gönderilmeyen) harf

// ==========================================
// 3. DOM ELEMENTLERİ
// ==========================================

const lobbyPanel = document.getElementById('lobbyPanel');
const gamePanel = document.getElementById('gamePanel');
const gameOverPanel = document.getElementById('gameOverPanel'); 
const myGridEl = document.getElementById('myGrid');
const oppGridEl = document.getElementById('opponentGrid');
const statusMsg = document.getElementById('gameStatusMsg');

// HTML'deki ID'lerle eşleştirilen kritik elementler
const gameCodeDisplay = document.getElementById('gameCodeDisplay'); 
const myPlayerRoleEl = document.getElementById('myPlayerRole'); 
const moveNumberDisplayEl = document.getElementById('moveNumberDisplay');
const randomLetterDisplay = document.getElementById('randomLetterDisplay');

// ==========================================
// YENİ OYUN KURMA (GÜNCELLENMİŞ VE PARAMETRELİ)
// ==========================================

async function createNewGame(mode) { // 'mode' parametresini dışarıdan (butondan) alıyoruz
    // 1. Oyun Kodunu Üret ve Oyuncu Rolünü Belirle
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    myPlayerId = 'PlayerA';
    currentGameId = code;
    
    // 2. Mod Belirleme (Butondan gelen değeri kullan, yoksa varsayılan CLASSIC)
    const selectedMode = mode ? mode.toUpperCase() : 'CLASSIC'; 
    
    let sequence = null;
    let initialLetter = null;

    document.getElementById('lobbyStatus').textContent = `${selectedMode} oyun kuruluyor...`;

    // 3. Rastgele Mod (veya Puzzle) İçin Harf Dizisini Oluştur
    // Buraya 'RANDOM' yanına 'PUZZLE' da eklenebilir
    if (selectedMode === 'RANDOM' || selectedMode === 'PUZZLE') {
        try {
            sequence = generateGameSequence(); 
            
            if (!sequence || sequence.length < 24) {
                 throw new Error("Harf dizisi üretilemedi.");
            }
            
            // Random modda ilk harf hemen belirlenir
            initialLetter = sequence[0]; 
            
        } catch (e) {
            document.getElementById('lobbyStatus').textContent = `HATA: ${e.message}`;
            currentGameId = null; 
            return; 
        }
    }
    
    // 4. Firestore'a Veri Yazma
    try {
        await db.collection('games').doc(code).set({
            status: 'waiting',      
            turnOwner: 'PlayerA',   
            moveNumber: 1,  
            isSinglePlayer: false, 
            
            gameMode: selectedMode, // Artık butondan gelen gerçek mod yazılacak
            letterSequence: sequence,      
            currentLetter: initialLetter, 
            
            gridA: Array(25).fill(''),
            gridB: Array(25).fill(''),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 5. Arayüzü Güncelle
        setupGameUI(code);

        // UI Görünürlük Ayarları
        const oppSection = document.getElementById('opponentSection');
        if(oppSection) oppSection.style.display = 'block';

        const turnIndicator = document.getElementById('turnIndicator');
        if(turnIndicator) turnIndicator.style.display = 'block';

        const codeDisplay = document.getElementById('gameCodeDisplay');
        if (codeDisplay && codeDisplay.parentElement) codeDisplay.parentElement.style.display = 'block';
        
        const roleDisplay = document.getElementById('myPlayerRole');
        if (roleDisplay && roleDisplay.parentElement) roleDisplay.parentElement.style.display = 'block';

        // Dinlemeyi Başlat
        listenToGame();

    } catch (error) {
        document.getElementById('lobbyStatus').textContent = "Oyun kurulamadı!";
        console.error("Firebase Yazma Hatası:", error);
        currentGameId = null; 
    }
}
// ==========================================
// OYUNA KATILMA FONKSİYONU (DÜZELTİLMİŞ)
// ==========================================

async function joinGame() {
    // 1. Oda Kodunu Al ve Kontrol Et
    const gameCodeInput = document.getElementById('gameCodeInput');
    const code = gameCodeInput ? gameCodeInput.value.trim().toUpperCase() : '';
    
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

        // Oyun zaten başladıysa veya bittiyse (Veya Tek kişilik oyunsa - çünkü o da 'active' başlar)
        if (data.status === 'active' || data.status === 'finished') {
            document.getElementById('lobbyStatus').textContent = "HATA: Oyun zaten başladı veya doldu.";
            return;
        }
        
        // 2. Oyuncu B olarak global değişkenleri ayarla
        myPlayerId = 'PlayerB';
        currentGameId = code;

        // 3. Oyun durumunu "waiting" -> "active" olarak güncelle
        await gameRef.update({
            status: 'active'
        });

        // 4. Arayüzü oyun paneline geçir
        setupGameUI(code);

        // --- KRİTİK DÜZELTME: GİZLENEN ALANLARI GERİ AÇ ---
        // Tek kişilik oyundan gelindiyse bu alanlar 'display: none' kalmış olabilir.
        const oppSection = document.getElementById('opponentSection');
        if(oppSection) oppSection.style.display = 'block'; 

        const turnIndicator = document.getElementById('turnIndicator');
        if(turnIndicator) turnIndicator.style.display = 'block'; 

        const codeDisplay = document.getElementById('gameCodeDisplay');
        if (codeDisplay && codeDisplay.parentElement) codeDisplay.parentElement.style.display = 'block';
        
        const roleDisplay = document.getElementById('myPlayerRole');
        if (roleDisplay && roleDisplay.parentElement) roleDisplay.parentElement.style.display = 'block';

        // 5. Dinlemeyi Başlat
        listenToGame();

    } catch (error) {
        document.getElementById('lobbyStatus').textContent = "Oyuna katılırken bir hata oluştu.";
        console.error("Oyuna Katılma Hatası:", error);
        currentGameId = null; 
    }
}

// ==========================================
// TEK KİŞİLİK OYUN BAŞLATMA (GÜNCELLENMİŞ)
// ==========================================

async function startSinglePlayerGame() {
    // 1. Rastgele Kod Üret (Yine de bir ID lazım)
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    myPlayerId = 'PlayerA';
    currentGameId = code;
    
    document.getElementById('lobbyStatus').textContent = "Tek kişilik oyun hazırlanıyor...";

    // 2. Harf Dizisini Oluştur
    let sequence = null;
    let initialLetter = null;
    
    try {
        sequence = generateGameSequence(); // 24 harflik dizi
        initialLetter = sequence[0];
    } catch (e) {
        console.error("Harf dizisi hatası:", e);
        return;
    }

    // 3. Firestore'a Yaz (Rakip beklemeden direkt ACTIVE)
    try {
        await db.collection('games').doc(code).set({
            status: 'active',       // Bekleme yok, direkt başla
            isSinglePlayer: true,   // TEK KİŞİLİK OLDUĞUNU BELİRTİYORUZ
            turnOwner: 'PlayerA',
            moveNumber: 1,
            
            gameMode: 'RANDOM',     // Tek kişilik mod her zaman Random'dır
            letterSequence: sequence,
            currentLetter: initialLetter,
            
            gridA: Array(25).fill(''),
            gridB: Array(25).fill(''), // Boş kalacak ama hata vermemesi için dursun
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Arayüzü Kur
        setupGameUI(code);
        
        // --- UI TEMİZLİĞİ (TEK KİŞİLİK MODA ÖZEL GİZLEMELER) ---
        
        // 1. Rakip Alanını (Sağ Taraf) Gizle
        const opponentSection = document.getElementById('opponentSection');
        if (opponentSection) opponentSection.style.display = 'none';

        // 2. "Sıra Bekleniyor" Yazısını Gizle
        const turnIndicator = document.getElementById('turnIndicator');
        if (turnIndicator) turnIndicator.style.display = 'none';

        // 3. "Oda Kodu" bilgisini gizle (Tek kişilikte gereksiz)
        const codeDisplay = document.getElementById('gameCodeDisplay');
        if (codeDisplay && codeDisplay.parentElement) {
            codeDisplay.parentElement.style.display = 'none';
        }

        // 4. "Rolün: Kurucu" bilgisini gizle
        const roleDisplay = document.getElementById('myPlayerRole');
        if (roleDisplay && roleDisplay.parentElement) {
            roleDisplay.parentElement.style.display = 'none';
        }

        // Dinlemeyi Başlat
        listenToGame();

    } catch (error) {
        console.error("Tek kişilik oyun hatası:", error);
        document.getElementById('lobbyStatus').textContent = "Oyun başlatılamadı.";
    }
}

// ==========================================
// ARAYÜZ HAZIRLAMA (DÜZELTİLMİŞ)
// ==========================================

function setupGameUI(gameId) {
    // 1. Panelleri Tanımla
    const lobbyPanel = document.getElementById('lobbyPanel');
    const gamePanel = document.getElementById('gamePanel');
    const gameOverPanel = document.getElementById('gameOverPanel');
    
    // DÜZELTME 1: HTML'deki ID 'gameCodeDisplay' olduğu için bunu kullanmalıyız
    const displayCode = document.getElementById('gameCodeDisplay');
    
    // 2. Panelleri Değiştir
    if (lobbyPanel) lobbyPanel.classList.add('hidden');
    if (gameOverPanel) gameOverPanel.classList.add('hidden');
    
    if (gamePanel) {
        gamePanel.classList.remove('hidden');
    } else {
        console.error("HATA: gamePanel HTML'de bulunamadı!");
        return; 
    }

    // 3. Oyun Kodunu Ekrana Yaz
    if (displayCode) {
        displayCode.textContent = gameId;
    }

    // 4. Durum Mesajını Sıfırla
    // DÜZELTME 2: HTML'deki ID 'gameStatusMsg'
    const statusMsg = document.getElementById('gameStatusMsg');
    if (statusMsg) {
        statusMsg.textContent = "Oyun Yükleniyor...";
        statusMsg.className = "status-msg"; 
    }

    // 5. Action Area ve Random Harf Ekranını Sıfırla
    const actionArea = document.getElementById('actionArea');
    const randomLetterDisplay = document.getElementById('randomLetterDisplay');
    
    if (actionArea) actionArea.classList.add('hidden');
    if (randomLetterDisplay) randomLetterDisplay.classList.add('hidden');
}

// ==========================================
// OYUNU DİNLEME (TABELA VE GRID SORUNSUZ VERSİYON)
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

            // 1. Grid Verilerini Al ve Çiz
            myGridData = (myPlayerId === 'PlayerA') ? data.gridA : data.gridB;
            const oppGridData = (myPlayerId === 'PlayerA') ? data.gridB : data.gridA;

            renderGrid(myGridData, 'myGrid');
            renderGrid(oppGridData, 'opponentGrid');

            // 2. Elementleri Hazırla
            const classicArea = document.getElementById('classicLetterSelectionArea');
            const randomDisplay = document.getElementById('randomLetterDisplay');
            const myGridEl = document.getElementById('myGrid');
            
            // --- TABELAYI BUL ---
            const turnBadge = document.getElementById('turnStatusBadge');

            // --- UI TEMİZLİĞİ ---
            if (classicArea) classicArea.classList.add('hidden');
            if (randomDisplay) randomDisplay.classList.add('hidden');
            
            // ==========================================================
            // YARDIMCI: UI DURUM GÜNCELLEYİCİ (Sorunu Çözen Kısım)
            // ==========================================================
            const updateUIState = (text, badgeColor, isInteractive) => {
                // 1. Tabela Yazısını Güncelle (ZORLAYICI YÖNTEM)
                if (turnBadge) {
                    turnBadge.textContent = text;
                    // Tüm olası renk sınıflarını temizle, yenisini ekle
                    turnBadge.className = `status-badge ${badgeColor}`; 
                    turnBadge.classList.remove('hidden'); 
                    turnBadge.style.display = 'block'; // Görünürlüğü garanti et
                }

                // 2. Grid Görselini ve Tıklamayı Yönet
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
                // Gridi yeniden çiz (Clickable sınıfları için)
                renderGrid(myGridData, 'myGrid');
            };

            // -------------------------------------------------
            // DURUM: OYUN AKTİF (ACTIVE)
            // -------------------------------------------------
            if (data.status === 'active') {
                document.getElementById('lobbyPanel').classList.add('hidden');
                document.getElementById('gamePanel').classList.remove('hidden');
                document.getElementById('gameOverPanel').classList.add('hidden');

                const isMyTurn = (data.turnOwner === myPlayerId);
                const myFilledCount = myGridData.filter(c => c !== '').length;
                const currentMove = data.moveNumber || 1; // moveNumber yoksa 1 kabul et
                
                // Bu turdaki hamlem yapıldı mı?
                const myMoveDone = (myFilledCount >= currentMove);

                // ====================================================
                // A. 25. TUR: JOKER HAMLESİ
                // ====================================================
                if (currentMove === 25) {
                    if (randomDisplay) randomDisplay.classList.remove('hidden');
                    
                    if (myFilledCount >= 25) {
                        updateUIState("OYUN BİTİYOR... RAKİP BEKLENİYOR", "badge-neutral", false);
                    } else {
                        renderAlphabetSelector(); 
                        if (!myFinalLetter) {
                            updateUIState("SON HARF: JOKER SEÇ", "badge-info", false);
                        } else {
                            updateUIState(`SEÇİLEN: ${myFinalLetter} - YERLEŞTİR`, "badge-success", true);
                        }
                    }
                    return; // Fonksiyondan çık, aşağısı çalışmasın
                }

                // ====================================================
                // B. KLASİK MOD (CLASSIC)
                // ====================================================
                if (data.gameMode === 'CLASSIC') {
                    const harfSecildiMi = (data.currentLetter !== null && data.currentLetter !== "");

                    if (!harfSecildiMi) {
                        // HARF SEÇME AŞAMASI
                        if (isMyTurn) {
                            if (classicArea) {
                                classicArea.classList.remove('hidden');
                                if(classicArea.querySelector('#classicAlphabetContainer').children.length === 0) {
                                     renderClassicAlphabet(); 
                                }
                                const confirmBtn = document.getElementById('confirmLetterBtn');
                                if (confirmBtn && !selectedClassicLetter) {
                                    confirmBtn.disabled = true;
                                    confirmBtn.textContent = "BİR HARF SEÇİNİZ";
                                }
                            }
                            updateUIState("Sıra Sizde: Harf Seç", "your-turn", false);
                        } else {
                            updateUIState("Rakip Harf Seçiyor", "opponent-turn", false);
                        }
                    } else {
                        // YERLEŞTİRME AŞAMASI
                        if (randomDisplay) {
                            randomDisplay.textContent = data.currentLetter;
                            randomDisplay.classList.remove('hidden');
                            // Eğer içinde eski alfabe kaldıysa temizle
                            if (randomDisplay.querySelector('.alphabet-wrapper')) {
                                randomDisplay.textContent = data.currentLetter; 
                            }
                        }

                        if (!myMoveDone) {
                            updateUIState(`"${data.currentLetter}" Harfini Yerleştir`, "your-turn", true);
                        } else {
                            updateUIState("Rakip Yerleştiriyor", "opponent-turn", false);
                        }
                    }
                }

                // ====================================================
                // C. RANDOM MODLAR
                // ====================================================
                else {
                    if (randomDisplay) {
                        randomDisplay.textContent = data.currentLetter;
                        randomDisplay.classList.remove('hidden');
                        if (randomDisplay.querySelector('.alphabet-wrapper')) {
                             randomDisplay.textContent = data.currentLetter;
                        }
                    }

                    if (!myMoveDone) {
                        updateUIState("Harfi Yerleştirin", "your-turn", true);
                    } else {
                         if(data.isSinglePlayer) {
                             updateUIState("Kaydediliyor...", "badge-neutral", false);
                         } else {
                             updateUIState("Rakip Bekleniyor...", "opponent-turn", false);
                         }
                    }
                }
            } 
            
            // -------------------------------------------------
            // DURUM: OYUN BİTTİ (FINISHED)
            // -------------------------------------------------
            else if (data.status === 'finished') {
                showResults(data); 
            }
        });
}

// --- JOKER SEÇİMİ İÇİN YENİ FONKSİYONLAR (DÜZELTİLMİŞ) ---

// 1. Alfabeyi Ekrana Çizen Fonksiyon
function renderAlphabetSelector() {
    const display = document.getElementById('randomLetterDisplay');
    if (!display) return;

    // Zaten çiziliyse tekrar çizme
    if (display.querySelector('.alphabet-wrapper')) return;

    display.innerHTML = ''; 
    display.classList.remove('hidden');
    
    // Alfabe Wrapper Stili
    const wrapper = document.createElement('div');
    wrapper.className = 'alphabet-wrapper';
    
    // Harfler
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
    alphabet.forEach(letter => {
        const btn = document.createElement('div');
        btn.textContent = letter;
        btn.className = 'alpha-btn';
        btn.id = `btn-joker-${letter}`;
        
        btn.onclick = (e) => {
            e.stopPropagation(); // Event bubble'ı engelle
            selectJokerLetter(letter);
        };
        wrapper.appendChild(btn);
    });

    display.appendChild(wrapper);
}

// 2. Harf Seçildiğinde Çalışan Fonksiyon (Seçimi İşaretler)
function selectJokerLetter(letter) {
    // 1. Global değişkeni güncelle
    myFinalLetter = letter; 

    // 2. Görsel Olarak Harf Seçimini Göster
    const allBtns = document.querySelectorAll('.alpha-btn');
    allBtns.forEach(btn => btn.classList.remove('selected'));

    const selectedBtn = document.getElementById(`btn-joker-${letter}`);
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }

    // 3. Oyun Durumunu Güncelle (Tabela)
    const turnBadge = document.getElementById('turnStatusBadge');
    if(turnBadge) {
        turnBadge.textContent = `SEÇİLEN: ${letter} - YERLEŞTİRİN`;
        turnBadge.className = "status-badge badge-success";
    }

    // 4. Grid'i Aktif Et (Tıklamayı Aç)
    const myGridEl = document.getElementById('myGrid');
    placementMode = true; 
    
    if (myGridEl) {
        myGridEl.classList.remove('waiting-turn');
        myGridEl.classList.add('active-turn');
        myGridEl.style.opacity = "1";
        myGridEl.style.pointerEvents = "auto";
    }

    // Gridi yeniden çiz (Değişikliklerin yansıması için)
    renderGrid(myGridData, 'myGrid');
}

// ==========================================
// HAMLE VE SIRA MANTIĞI (GÖRSEL EFEKTLİ)
// ==========================================

function handleTurnLogic(data, myGridData) {
    const actionArea = document.getElementById('actionArea');
    const randomLetterDisplay = document.getElementById('randomLetterDisplay');
    const turnBadge = document.getElementById('turnStatusBadge'); // Yeni Tabela
    const myGridElement = document.getElementById('myGrid'); // CSS sınıfı için
    
    // Yardımcı: Tabelayı Güncelleme Fonksiyonu
    const updateBadge = (text, type, isGridActive) => {
        if (!turnBadge) return;
        turnBadge.classList.remove('hidden', 'badge-success', 'badge-warning', 'badge-info', 'badge-neutral');
        turnBadge.classList.add(type);
        turnBadge.textContent = text;

        // Grid Efektini Yönet
        if (myGridElement) {
            myGridElement.classList.remove('active-turn', 'waiting-turn');
            if (isGridActive) {
                myGridElement.classList.add('active-turn');
            } else {
                myGridElement.classList.add('waiting-turn');
            }
        }
    };

    const moveNumber = data.moveNumber || 1;
    const currentLetter = data.currentLetter || "";
    const myFilledCount = myGridData.filter(cell => cell !== '' && cell !== null).length;

    // Varsayılan UI
    if (actionArea) actionArea.classList.add('hidden');
    if (randomLetterDisplay) randomLetterDisplay.classList.remove('hidden'); 
    if (randomLetterDisplay) randomLetterDisplay.textContent = currentLetter || "?";
    
    disableControls();
    placementMode = false;

 // --- 1. JOKER HAMLESİ (25. Hamle) ---
    if (moveNumber === 25) {
        if (actionArea) actionArea.classList.add('hidden');
        if (randomLetterDisplay) randomLetterDisplay.classList.remove('hidden');

        if (myFilledCount >= 25) {
            updateBadge("OYUN BİTİYOR...", "badge-neutral", false);
        } else {
            // HER DURUMDA ALFABEYİ GÖSTER
            // Kullanıcı seçmiş olsa bile değiştirebilmesi için alfabe ekranda kalmalı
            renderAlphabetSelector();

            if (!myFinalLetter) {
                // Henüz seçim yapılmadı
                updateBadge("JOKER HARFİ SEÇ", "badge-info", false); // Grid Pasif
            } else {
                // Seçim yapılmış (geri dönüldüyse görseli güncellemek gerekebilir)
                const selectedBtn = document.getElementById(`btn-joker-${myFinalLetter}`);
                if (selectedBtn) selectedBtn.classList.add('selected');

                updateBadge(`SEÇİLEN: ${myFinalLetter} - YERLEŞTİR`, "badge-success", true); // Grid Aktif
                placementMode = true;
            }
        }
        return; 
    }

    // --- 2. TEK KİŞİLİK MOD ---
    if (data.isSinglePlayer) {
        if (myFilledCount < moveNumber) {
            updateBadge("HARFİ YERLEŞTİR", "badge-success", true);
            placementMode = true;
            renderGrid(myGridData, 'myGrid');
        } else {
            updateBadge("KAYDEDİLİYOR...", "badge-neutral", false);
        }
        return;
    }

    // --- 3. ÇOK OYUNCULU MOD (KLASİK & RANDOM) ---
    const isMyTurn = (data.turnOwner === myPlayerId);
    const currentLetterIsAvailable = currentLetter !== null && currentLetter !== "";
    const hasNotPlacedInThisTurn = myFilledCount < moveNumber;

    // A. HARF SEÇİM AŞAMASI (Sadece Klasik Mod ve Harf Yoksa)
    if (data.gameMode === 'CLASSIC' && !currentLetterIsAvailable) {
        if (isMyTurn) { 
            // Sıra Bende: Harf Seçmeliyim
            updateBadge("HARF SEÇ", "badge-info", false); // Grid Pasif
            enableControls(true); 
            if(actionArea) actionArea.classList.remove('hidden');
        } else {
            // Sıra Rakipte: Harf Seçiyor
            updateBadge("RAKİP HARF SEÇİYOR", "badge-warning", false); // Grid Pasif
        }
        return;
    }

    // B. YERLEŞTİRME AŞAMASI
    if (currentLetterIsAvailable) {
        if(actionArea) actionArea.classList.add('hidden'); // Inputu gizle
        
        if (hasNotPlacedInThisTurn) {
            // Harf var, henüz koymadım -> YERLEŞTİR
            updateBadge("HARFİ YERLEŞTİR", "badge-success", true); // Grid AKTİF
            
            placementMode = true; 
            renderGrid(myGridData, 'myGrid'); 

        } else {
            // Ben koydum, rakibi bekliyorum
            updateBadge("RAKİP BEKLENİYOR", "badge-warning", false); // Grid Pasif
        }
        
    } else {
        // Beklenmedik durum
        updateBadge("BEKLENİYOR...", "badge-neutral", false);
    }
}

// ==========================================
// HARF SEÇİMİ VE GÖNDERİMİ (DÜZELTİLMİŞ)
// ==========================================

async function submitLetter(letterParam = null) {
    // 1. Harfi Belirle (Parametreden mi Inputtan mı?)
    let letter = letterParam;

    // Eğer parametre yoksa inputtan al (Eski input sistemi için güvenlik)
    if (!letter) {
        const letterInput = document.getElementById('letterInput');
        if (letterInput) letter = letterInput.value.trim().toUpperCase();
    }
    
    // Harf yoksa dur
    if (!letter) return;
    
    // Geçerlilik Kontrolü
    const validLetters = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
    if (!validLetters.includes(letter)) {
        alert("Geçersiz harf.");
        return;
    }

    const gameRef = db.collection('games').doc(currentGameId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(gameRef);
            if (!doc.exists) throw new Error("Oyun bulunamadı.");
            
            const data = doc.data();

            // Klasik Mod Kontrolleri
            if (data.currentLetter) {
                 // Zaten harf seçilmiş, işlem yapma
                 return; 
            }
            if (data.turnOwner !== myPlayerId) {
                throw new Error("Sıra sizde değil.");
            }
            
            // Harfi Yaz
            transaction.update(gameRef, {
                currentLetter: letter
            });
        });
        
        // UI Temizliği
        const classicArea = document.getElementById('classicLetterSelectionArea');
        if (classicArea) classicArea.classList.add('hidden');
        selectedClassicLetter = null;

    } catch (error) {
        console.error("Harf gönderme hatası:", error);
    }
}

// ==========================================
// HÜCRE TIKLAMA VE HAMLE YAPMA (GÜNCELLENMİŞ)
// ==========================================
async function handleCellClick(index) {
    // 1. Kontrol: Yerleştirme modunda mıyız?
    if (!placementMode) {
        console.log("Yerleştirme modu kapalı.");
        return;
    }

    // --- ONAY (DRAFT) MEKANİZMASI ---
    if (selectedDraftIndex !== index) {
        selectedDraftIndex = index;
        renderGrid(myGridData, 'myGrid'); 
        return;
    }
    
    selectedDraftIndex = null; // Onaylandı, seçimi kaldır

    // Hücre dolu mu?
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
            
            // --- HARF BELİRLEME ---
            let letterToPlace;
            const isFinalMove = (currentMoveNumber === 25);

            if (isFinalMove) {
                // 25. TUR: Yerel değişkenden al (myFinalLetter)
                if (!myFinalLetter) throw new Error("Joker harf seçilmedi!");
                letterToPlace = myFinalLetter;
            } else {
                // NORMAL TUR: Veritabanından al
                if (!data.currentLetter) throw new Error("Sunucudan harf gelmedi.");
                letterToPlace = data.currentLetter;
            }
            
            // --- GRID GÜNCELLEME ---
            let myCurrentGrid = (myPlayerId === 'PlayerA') ? [...data.gridA] : [...data.gridB];
            
            if (myCurrentGrid[index] !== '') throw new Error("Hücre dolu (Sunucu kontrolü).");
            myCurrentGrid[index] = letterToPlace;
            
            let updatePayload = {};
            if (myPlayerId === 'PlayerA') updatePayload.gridA = myCurrentGrid;
            else updatePayload.gridB = myCurrentGrid;
            
            // --- TUR ATLAMA VE BİTİRME MANTIĞI ---
            
            // SENARYO 1: TEK KİŞİLİK OYUN
            if (isSinglePlayer) {
                if (isFinalMove) {
                    updatePayload.status = 'finished'; // OYUN BİTTİ
                    updatePayload.currentLetter = null;
                } else {
                    const nextMove = currentMoveNumber + 1;
                    updatePayload.moveNumber = nextMove;
                    if (nextMove === 25) updatePayload.currentLetter = null;
                    else updatePayload.currentLetter = data.letterSequence[currentMoveNumber];
                }
            }
            
            // SENARYO 2: MULTIPLAYER
            else {
                let oppCurrentGrid = (myPlayerId === 'PlayerA') ? data.gridB : data.gridA;
                const oppFilledCount = oppCurrentGrid.filter(c => c !== '' && c !== null).length;
                const myNewFilledCount = myCurrentGrid.filter(c => c !== '' && c !== null).length;

                // A. 25. TUR (JOKER) BİTİŞ KONTROLÜ
                if (isFinalMove) {
                    if (myNewFilledCount === 25) {
                        // Ben bitirdim. Rakip de bitirdi mi?
                        if (oppFilledCount === 25) { 
                            updatePayload.status = 'finished'; // HERKES BİTİRDİ -> OYUN SONU
                            updatePayload.currentLetter = null;
                        } 
                        // Rakip bitirmediyse sadece benim gridim kaydolur, oyun 'active' kalır.
                    }
                } 
                
                // B. NORMAL TUR (1-24)
                else { 
                    // İkimiz de koyduysak tur atla
                    if (myNewFilledCount === currentMoveNumber && oppFilledCount === currentMoveNumber) {
                        const nextMove = currentMoveNumber + 1;
                        updatePayload.moveNumber = nextMove;
                        
                        // Modlara göre harf belirle
                        if (data.gameMode === 'CLASSIC') {
                            updatePayload.turnOwner = (nextMove % 2 !== 0) ? 'PlayerA' : 'PlayerB';
                            updatePayload.currentLetter = null; 
                            
                        } else if (data.gameMode === 'RANDOM') {
                            updatePayload.turnOwner = (data.turnOwner === 'PlayerA') ? 'PlayerB' : 'PlayerA'; 
                            if (nextMove <= 24) { 
                               updatePayload.currentLetter = data.letterSequence[nextMove - 1]; 
                            } else {
                               updatePayload.currentLetter = null; // 25. Tur için null yap
                            }
                        }
                    }
                }
            }
            
            transaction.update(gameRef, updatePayload);
        });
        
        // Başarılı işlem sonrası temizlik
        if (placementMode && myFinalLetter) {
             // Joker kullanıldıysa temizle ama hemen null yapma, renderGrid kullansın
             // myFinalLetter = null; // (Bunu kapattım, oyun bitiş ekranına geçerken sorun olmasın)
        }

    } catch (e) {
        console.error("Hücre hatası:", e);
        alert(e.message); // Kullanıcı hatayı görsün
        selectedDraftIndex = null;
        renderGrid(myGridData, 'myGrid');
    }
}

// ==========================================
// PUAN HESAPLAMA (GÜNCELLENMİŞ - Satır/Sütun Puanlarını Döndürür)
// ==========================================

function calculateScore(gridData) {
    const GRID_SIZE = 5;
    let totalScore = 0;
    let foundWords = new Set();
    
    // YENİ EKLENEN: Satır ve Sütun bazlı puanları tutar
    const rowScores = Array(5).fill(0);
    const colScores = Array(5).fill(0);
    
    const SCORE_RULES = { 2: 2, 3: 5, 4: 9, 5: 15 };

    const getSegmentMaxScore = (text) => {
        // --- ADIM 1: BASKIN KELİME KONTROLÜ (4 ve 5 Harfliler) ---
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

        // --- ADIM 2: KOMBİNASYON KONTROLÜ (3 ve 2 Harfliler) ---
        let maxComboScore = 0;
        let bestWords = []; 
        let validSubWords = [];
        
        for (let len = 3; len >= 2; len--) {
            for (let i = 0; i <= text.length - len; i++) {
                const sub = text.substring(i, i + len);
                if (isValidWord(sub)) {
                    validSubWords.push({
                        word: sub,
                        start: i,
                        end: i + len,
                        score: SCORE_RULES[len]
                    });
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
                const isOverlapping = (w1.start < w2.end && w2.start < w1.end);

                if (!isOverlapping) {
                    const currentTotal = w1.score + w2.score;
                    if (currentTotal > maxComboScore) {
                        maxComboScore = currentTotal;
                        bestWords = [w1.word, w2.word];
                    }
                }
            }
        }
        
        bestWords.forEach(w => foundWords.add(w));
        return maxComboScore;
    };

    const getLineString = (indices) => {
        return indices.map(index => gridData[index] || ' ').join('');
    };

    // --- Satır Tarama ---
    for (let row = 0; row < GRID_SIZE; row++) {
        const indices = Array.from({ length: GRID_SIZE }, (_, i) => row * GRID_SIZE + i);
        const lineStr = getLineString(indices);
        
        const segments = lineStr.replace(/\s+/g, ' ').split(' ');
        
        segments.forEach(segment => {
            if (segment.length >= 2) { 
                const segmentScore = getSegmentMaxScore(segment);
                totalScore += segmentScore;
                rowScores[row] += segmentScore; // <--- PUANI KAYDET
            }
        });
    }

    // --- Sütun Tarama ---
    for (let col = 0; col < GRID_SIZE; col++) {
        const indices = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + col);
        const lineStr = getLineString(indices);
        
        const segments = lineStr.replace(/\s+/g, ' ').split(' ');
        
        segments.forEach(segment => {
            if (segment.length >= 2) {
                const segmentScore = getSegmentMaxScore(segment);
                totalScore += segmentScore;
                colScores[col] += segmentScore; // <--- PUANI KAYDET
            }
        });
    }

    // SONUÇLARI YENİ YAPIDA DÖNDÜR
    return {
        score: totalScore,
        words: Array.from(foundWords).sort((a, b) => {
            if (b.length !== a.length) return b.length - a.length;
            return a.localeCompare(b, 'en');
        }),
        rowScores: rowScores,
        colScores: colScores
    };
}

// ==========================================
// OYUN SONUÇLARINI GÖSTERME (TEMİZLENMİŞ VERSİYON)
// ==========================================

function showResults(data) {
    // 1. Puanları Hesapla
    const resultA = calculateScore(data.gridA);
    const resultB = calculateScore(data.gridB);

    // 2. DOM Elementlerini Seç
    const scoreAEl = document.getElementById('scoreA');
    const scoreBEl = document.getElementById('scoreB');
    const wordsListAEl = document.getElementById('wordsListA');
    const wordsListBEl = document.getElementById('wordsListB');
    const finalResultMsgEl = document.getElementById('finalResultMsg');
    
    // Skor Kartlarını (Kutularını) Seç
    const resultCards = document.querySelectorAll('.result-card'); 

    // 3. Panelleri Geçiş
    document.getElementById('lobbyPanel').classList.add('hidden');
    document.getElementById('gamePanel').classList.add('hidden');
    document.getElementById('gameOverPanel').classList.remove('hidden');

    // 4. İstenmeyen Yazıları Gizle (Kazandın/Kaybettin)
    if (finalResultMsgEl) {
        finalResultMsgEl.style.display = 'none'; // Bu yazıyı tamamen kaldırıyoruz
        finalResultMsgEl.textContent = '';
    }

    // 5. Gridleri ve Skorları Doldur
    // A Oyuncusu (Her zaman var)
    scoreAEl.textContent = resultA.score;
    renderFinalScoreGrid(data.gridA, 'finalGridA', resultA.rowScores, resultA.colScores);
    
    // Kelime listesi A
    wordsListAEl.innerHTML = resultA.words.length > 0 
        ? resultA.words.map(w => `<li>${w}</li>`).join('') 
        : '<li>Kelime yok</li>';

    // 6. TEK KİŞİLİK / ÇOK KİŞİLİK GÖRÜNÜM AYARI
    if (data.isSinglePlayer) {
        // --- TEK KİŞİLİK MOD ---
        
        // İkinci kartı (Rakip/Boş olanı) tamamen GİZLE
        if (resultCards.length > 1) {
            resultCards[1].style.display = 'none';
        }
        
        // Başlığı düzenle ("Kurucu A" yerine "SKOR TABLONUZ" gibi)
        const titleA = document.getElementById('resultTitleA');
        if (titleA) {
            titleA.innerHTML = 'OYUN SONUCUNUZ';
            titleA.style.color = '#2c3e50';
        }

    } else {
        // --- MULTIPLAYER MOD (KLASİK & RANDOM) ---

        // İkinci kartı GÖSTER (Eğer gizlendiyse geri aç)
        if (resultCards.length > 1) {
            resultCards[1].style.display = 'flex'; // Veya 'block', CSS yapınıza göre
        }

        // B Oyuncusunun verilerini doldur
        scoreBEl.textContent = resultB.score;
        renderFinalScoreGrid(data.gridB, 'finalGridB', resultB.rowScores, resultB.colScores);
        
        // Kelime listesi B
        wordsListBEl.innerHTML = resultB.words.length > 0 
            ? resultB.words.map(w => `<li>${w}</li>`).join('') 
            : '<li>Kelime yok</li>';

        // Başlıkları "Sen" ve "Rakip" olarak ayarla
        const titleA = document.getElementById('resultTitleA');
        const titleB = document.getElementById('resultTitleB');

        if (titleA && titleB) {
            if (myPlayerId === 'PlayerA') {
                titleA.innerHTML = 'SİZİN ALANINIZ <span style="color:#2ecc71">(SEN)</span>';
                titleB.innerHTML = 'RAKİP ALANI';
                titleA.style.color = '#2c3e50'; 
                titleB.style.color = '#95a5a6';
            } else {
                titleA.innerHTML = 'RAKİP ALANI';
                titleB.innerHTML = 'SİZİN ALANINIZ <span style="color:#2ecc71">(SEN)</span>';
                titleB.style.color = '#2c3e50';
                titleA.style.color = '#95a5a6'; 
            }
        }
    }

    // Dinleyiciyi kapat
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // ... (showResults fonksiyonunun en sonu) ...

    // --- YENİ İSTATİSTİK GÜNCELLEME (SADECE RANDOM MOD) ---
    const lastProcessedGame = localStorage.getItem('last_processed_game_id');
    
    if (lastProcessedGame !== currentGameId) {
        localStorage.setItem('last_processed_game_id', currentGameId);
        
        // Sadece RANDOM mod ise istatistiği işle
        // Not: Tek kişilik oyun her zaman Random'dır.
        if (data.gameMode === 'RANDOM' || data.isSinglePlayer) {
            
            let myScore = 0;
            if (myPlayerId === 'PlayerA') myScore = resultA.score;
            else myScore = resultB.score;

            // Yeni Fonksiyonu Çağır
            updateRandomStats(myScore);
            console.log("Random mod istatistiği kaydedildi:", myScore);
        }
    }
}
// showResults bitişi

// ==========================================
// GRID ÇİZİM FONKSİYONU (GÜNCELLENMİŞ)
// ==========================================

function renderGrid(gridData, elementId) {
    const gridElement = document.getElementById(elementId);
    if (!gridElement) return;

    gridElement.innerHTML = ''; 
    
    const isMyGrid = (elementId === 'myGrid');
    const isClickable = isMyGrid && placementMode; 

    gridData.forEach((letter, index) => {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        
        // 1. Varsayılan olarak veritabanındaki (kesinleşmiş) harfi yaz
        cell.textContent = letter || ''; 
        
        // 2. Seçim (Draft) Görselleştirmesi
        if (isMyGrid && index === selectedDraftIndex) {
            cell.classList.add('selected-draft');

            // --- YENİ EKLENEN KISIM: HARFİ GÖSTER ---
            // Eğer hücre henüz boşsa (onaylanmamışsa), seçili harfi içinde göster.
            if (letter === '') {
                // A. Joker harfi seçili mi? (25. Tur)
                if (typeof myFinalLetter !== 'undefined' && myFinalLetter) {
                    cell.textContent = myFinalLetter;
                } 
                // B. Değilse, normal turdaki harfi ekrandaki kutudan al
                else {
                    const display = document.getElementById('randomLetterDisplay');
                    // Kutunun içinde Alfabe Seçicisi yoksa (yani tek harf varsa)
                    if (display && !display.querySelector('.alphabet-wrapper')) {
                        const visibleLetter = display.textContent.trim();
                        // Sadece tek karakterse (örn: "A") hücreye yaz
                        if (visibleLetter.length === 1) {
                            cell.textContent = visibleLetter;
                        }
                    }
                }
            }
        }
        
        // 3. Tıklanabilirlik Kontrolü
        // Hücre boşsa VEYA zaten o an seçtiğimiz hücreyse (tekrar tıklayıp onaylamak için)
        const shouldBeClickable = isClickable && (letter === '' || index === selectedDraftIndex);
        
        if (shouldBeClickable) {
            cell.classList.add('clickable');
            // Hücreye tıklanınca handleCellClick çalışsın
            cell.onclick = () => handleCellClick(index);
        } else {
            cell.classList.remove('clickable');
            cell.onclick = null;
        }

        gridElement.appendChild(cell);
    });
}

// ==========================================
// YENİ FONKSİYON: SONUÇ GRIDINI ÇİZME (GÜVENLİ VE RENK KODLAMALI)
// ==========================================

function renderFinalScoreGrid(gridData, elementId, rowScores, colScores) {
    const gridElement = document.getElementById(elementId);
    if (!gridElement) return;

    // Grid yapısını 6x6 olarak ayarla
    gridElement.style.gridTemplateColumns = 'repeat(6, 1fr)';
    gridElement.style.gridTemplateRows = 'repeat(6, 1fr)';

    // İçeriği temizle
    gridElement.innerHTML = '';
    
    // Yardımcı fonksiyon: Puana göre CSS sınıfı döndürür
    const getScoreClass = (score) => {
        if (score >= 15) return 'score-15';
        if (score >= 9) return 'score-9';
        if (score >= 7) return 'score-7';
        if (score >= 5) return 'score-5';
        if (score >= 4) return 'score-4';
        if (score >= 2) return 'score-2';
        if (score === 1) return 'score-1';
        if (score === 0) return 'score-0';
        return '';
    };

    // 5x5 harf hücresi ve 5x1 satır puanı hücresi oluştur
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.textContent = gridData[i] || '';
        gridElement.appendChild(cell);

        // Satır sonu (i=4, 9, 14, 19, 24)
        if ((i + 1) % 5 === 0) {
            const rowIndex = Math.floor(i / 5);
            const scoreCell = document.createElement('div');
            const score = rowScores[rowIndex];
            
            // --- KRİTİK GÜVENLİK DÜZELTMESİ ---
            // Sınıf listesini oluştur, boş stringleri filtrele
            const classes = ['cell', 'score-cell-row', getScoreClass(score)].filter(Boolean);
            scoreCell.classList.add(...classes);
            // ----------------------------------
            
            scoreCell.textContent = score;
            gridElement.appendChild(scoreCell);
        }
    }
    
    // 5x1 kolon puanı hücresi oluştur
    // Hata izi bu forEach döngüsünü işaret ediyor olabilir.
    colScores.forEach(score => {
        const scoreCell = document.createElement('div');
        
        // --- KRİTİK GÜVENLİK DÜZELTMESİ ---
        // Sınıf listesini oluştur, boş stringleri filtrele
        const classes = ['cell', 'score-cell-col', getScoreClass(score)].filter(Boolean);
        scoreCell.classList.add(...classes);
        // ----------------------------------

        scoreCell.textContent = score;
        gridElement.appendChild(scoreCell);
    });

    // Köşe hücresi (Boş ve şeffaf kalacak)
    const cornerCell = document.createElement('div');
    cornerCell.classList.add('cell', 'empty-corner');
    gridElement.appendChild(cornerCell);
}

// ==========================================
// KONTROL FONKSİYONLARI
// ==========================================

function disableControls() {
    const letterInput = document.getElementById('letterInput');
    const actionButton = document.getElementById('submitLetterButton');
    if (letterInput) letterInput.disabled = true;
    if (actionButton) actionButton.disabled = true;
}

function enableControls(isLetterSelectionMode = true) {
    const letterInput = document.getElementById('letterInput');
    const actionButton = document.getElementById('submitLetterButton');
    
    if (letterInput) {
        letterInput.disabled = !isLetterSelectionMode;
        if (isLetterSelectionMode) {
            letterInput.focus();
        }
    }
    if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = isLetterSelectionMode ? "SEÇ" : "BEKLE";
    }
}

// ==========================================
// KLASİK MOD HARF SEÇİM FONKSİYONLARI
// ==========================================

// 1. Alfabeyi Ekrana Çiz
function renderClassicAlphabet() {
    const container = document.getElementById('classicAlphabetContainer');
    if (!container) return;
    
    container.innerHTML = ''; // Temizle
    const alphabet = "ABCÇDEFGĞHİIJKLMNOÖPRSŞTUÜVYZ";
    
    alphabet.split('').forEach(char => {
        const btn = document.createElement('div');
        btn.classList.add('alpha-btn'); // CSS'deki mavi buton stili
        btn.textContent = char;
        
        // Tıklama Olayı
        btn.onclick = () => selectClassicLetter(char, btn);
        
        container.appendChild(btn);
    });
}

// 2. Harfe Tıklandığında Seçim Yap
function selectClassicLetter(char, btnElement) {
    selectedClassicLetter = char;
    
    // Görsel vurgu: Önce hepsinden 'selected' sınıfını kaldır
    const allBtns = document.querySelectorAll('#classicAlphabetContainer .alpha-btn');
    allBtns.forEach(b => b.classList.remove('selected'));
    
    // Tıklanana ekle
    btnElement.classList.add('selected');
    
    // Onay butonunu aktif et
    const confirmBtn = document.getElementById('confirmLetterBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = `"${char}" HARFİNİ GÖNDER`;
        confirmBtn.style.backgroundColor = "#28a745"; // Yeşil renk
        confirmBtn.style.color = "white";
    }
}

// 3. Onay Butonuna Tıklanınca Gönder
function submitClassicLetter() {
    if (!selectedClassicLetter) return;
    
    // Mevcut submitLetter fonksiyonunu çağır (veya direkt veritabanı kodu)
    // Eğer kodunuzda "submitLetter()" fonksiyonu varsa onu kullanıyoruz:
    submitLetter(selectedClassicLetter); 
    
    // Temizlik
    selectedClassicLetter = null;
    document.getElementById('classicLetterSelectionArea').classList.add('hidden');
}

// ==========================================
// BİLGİ PENCERESİ (MODAL) YÖNETİMİ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById("howToPlayModal");
    const btn = document.getElementById("howToPlayBtn");
    const closeSpan = document.querySelector(".close-modal");

    if (btn && modal && closeSpan) {
        // Butona basınca aç
        btn.onclick = (e) => {
            e.preventDefault(); // Form submit olmasın diye
            modal.classList.remove("hidden");
            modal.style.display = "flex"; // CSS çakışması olursa garanti olsun
        };

        // Çarpıya basınca kapat
        closeSpan.onclick = () => {
            modal.classList.add("hidden");
            modal.style.display = "none";
        };

        // Boşluğa basınca kapat
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.classList.add("hidden");
                modal.style.display = "none";
            }
        };
    }
  });

// ==========================================
// DARK MODE YÖNETİMİ
// ==========================================

function toggleDarkMode() {
    const body = document.body;
    const btn = document.getElementById('darkModeBtn');
    
    // Class'ı aç/kapa
    body.classList.toggle('dark-mode');
    
    // Durumu kontrol et
    const isDark = body.classList.contains('dark-mode');
    
    // İkonu değiştir
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    
    // Tercihi kaydet
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Sayfa Yüklendiğinde Tercihi Hatırla
window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    const btn = document.getElementById('darkModeBtn');
    
    // Eğer daha önce dark mode seçildiyse
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (btn) btn.textContent = '☀️';
    }
});







