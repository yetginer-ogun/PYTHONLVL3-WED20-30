/* ================================================================
   TRAFIK KORNACILARI - Oyun Mantığı
   Top-down (kuş bakışı), iki şeritli trafik ışığı oyunu
   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// CANVAS ve BAĞLAM
// ----------------------------------------------------------------
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');

// Sanal (base) çözünürlük — her şey buna göre ölçeklenir
const BASE_W = 480;
const BASE_H = 580;   // canvas'ın gösterdiği alan yüksekliği

// ----------------------------------------------------------------
// YOL LAYOUT (0-1 arasında oran olarak tanımlı)
// ----------------------------------------------------------------
const ROAD = {
    left:    0.12,   // yolun sol kenarı
    right:   0.88,   // yolun sağ kenarı
    mid:     0.500,  // şerit ayraç
    stopY:   0.52,   // dur çizgisi
    lightY:  0.22,   // trafik lambası (Y oranı)
    lightX:  0.895,  // trafik lambası (X — yol sağ kenarına yapışık)
};

// İki şeritin merkez X'leri (oran)
const LANE_X = [0.305, 0.695];

// Araç renk paleti
const CAR_COLORS = [
    '#e74c3c','#3498db','#2ecc71','#f39c12',
    '#9b59b6','#1abc9c','#e67e22','#e91e63',
    '#00bcd4','#ff5722','#607d8b','#795548',
];

// ----------------------------------------------------------------
// OYUN DURUMU (tek nesne — güvenli başlangıç değerleri)
// ----------------------------------------------------------------
let G = {
    screen:     'menu',
    light:      'red',
    lightTimer: 0,
    redDur:     4200,
    yellowDur:  700,
    greenDur:   5000,
    score:      0,
    combo:      0,
    highScore:  parseInt(localStorage.getItem('tnk_hs') || '0'),
    cycleCount: 0,
    passTimer:  0,
    passStage:  0,
    shakeAmt:   0,
    shakeDur:   0,
};

// ----------------------------------------------------------------
// VİZÜEL NESNELERİ
// ----------------------------------------------------------------
let cars          = [];  // bekleyen/hareket eden araçlar
let particles     = [];  // patlama partikülleri
let floatTexts    = [];  // yüzen yazılar ("+20!" gibi)
let speechBubbles = [];  // konuşma balonları
let figures       = [];  // kızgın sürücü figürleri

// ----------------------------------------------------------------
// SES (Web Audio API — programatik, dosya gerekmez)
// ----------------------------------------------------------------
let audioCtx = null;

function getAC() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch(e) {}
    }
    return audioCtx;
}

/* Ses tipi: 'horn_player' | 'horn_other' | 'wrong' | 'success' |
             'crowd' | 'beat' | 'green_ding' */
function playSound(type) {
    const ac = getAC();
    if (!ac) return;
    const t = ac.currentTime;

    const beep = (freq, dur, vol=0.3, shape='sine', start=0) => {
        try {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.connect(g); g.connect(ac.destination);
            o.type = shape;
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol, t+start);
            g.gain.exponentialRampToValueAtTime(0.001, t+start+dur);
            o.start(t+start); o.stop(t+start+dur+0.02);
        } catch(e) {}
    };

    const noise = (dur, vol=0.5, start=0) => {
        try {
            const buf = ac.createBuffer(1, ac.sampleRate*dur, ac.sampleRate);
            const d = buf.getChannelData(0);
            for (let i=0; i<d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length,2);
            const s = ac.createBufferSource();
            const g = ac.createGain();
            s.buffer = buf; s.connect(g); g.connect(ac.destination);
            g.gain.value = vol;
            s.start(t+start); s.stop(t+start+dur+0.02);
        } catch(e) {}
    };

    if (type === 'horn_player') {
        beep(466, 0.14, 0.4, 'sawtooth', 0);
        beep(554, 0.14, 0.4, 'sawtooth', 0.18);
    }
    if (type === 'horn_other') {
        const f = 280 + Math.random()*120;
        beep(f, 0.35, 0.18, 'sawtooth', 0);
    }
    if (type === 'wrong') {
        beep(180, 0.28, 0.35, 'square', 0);
        beep(120, 0.2,  0.25, 'square', 0.15);
    }
    if (type === 'success') {
        beep(523, 0.1, 0.3, 'sine', 0);
        beep(659, 0.1, 0.3, 'sine', 0.12);
        beep(784, 0.12,0.3, 'sine', 0.24);
    }
    if (type === 'green_ding') {
        beep(880, 0.08, 0.25, 'sine', 0);
        beep(1100,0.08, 0.2,  'sine', 0.1);
    }
    if (type === 'crowd') {
        for (let i=0; i<5; i++) {
            beep(200+Math.random()*120, 0.18, 0.12, 'square', i*0.12);
        }
    }
    if (type === 'beat') {
        noise(0.4, 0.7, 0);
        beep(80, 0.3, 0.5, 'square', 0.05);
        for (let i=0; i<6; i++) noise(0.15, 0.5, i*0.18+0.1);
    }
}

// ----------------------------------------------------------------
// CANVAS BOYUTLANDIRMA
// ----------------------------------------------------------------
function resizeCanvas() {
    const screen = document.getElementById('game-screen');
    if (screen.classList.contains('hidden')) return;

    // HUD + korna buton yüksekliğini çıkar
    const hudH    = document.getElementById('hud').offsetHeight || 54;
    const hornH   = document.getElementById('horn-wrap').offsetHeight || 60;
    const availH  = window.innerHeight - hudH - hornH;
    const availW  = Math.min(window.innerWidth, 480);

    const scaleW  = availW / BASE_W;
    const scaleH  = availH / BASE_H;
    const scale   = Math.min(scaleW, scaleH);

    canvas.width  = Math.floor(BASE_W * scale);
    canvas.height = Math.floor(BASE_H * scale);
    canvas.style.width  = canvas.width  + 'px';
    canvas.style.height = canvas.height + 'px';
}

// Sanal koordinatları canvas koordinatına dönüştür
function sx(v) { return v * (canvas.width  / BASE_W); }
function sy(v) { return v * (canvas.height / BASE_H); }

// ----------------------------------------------------------------
// ARAÇ YÖNETİMİ
// ----------------------------------------------------------------
function makeCar(lane, row, isPlayer=false) {
    return {
        lane, row,
        x:       LANE_X[lane],
        y:       ROAD.stopY + 0.055 + row * 0.125,
        color:   CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        isPlayer,
        vy:      0,          // hız (orana göre/sn)
        moving:  false,
        wobble:  0,
        hornAnim:0,          // animasyon timer (ms)
        removed: false,
    };
}

function initCars() {
    cars = [];
    for (let lane = 0; lane < 2; lane++) {
        for (let row = 0; row < 4; row++) {
            cars.push(makeCar(lane, row, lane===0 && row===0));
        }
    }
}

/* Araçları ileri (yukarı) yürüt — yeşil ışıkta korna basınca çağrılır */
function launchCars() {
    for (const c of cars) {
        c.moving = true;
        c.vy     = 0.38 + Math.random() * 0.08;  // şerit/sn
    }
}

// Araç yenileme zamanlayıcısı — çift çağrıyı önler
let carsRespawning = false;

/* Hareket eden araçları güncelle, ekran dışına çıkınca yenile */
function updateCars(dt) {
    if (carsRespawning) return;   // Yenileme bekleniyorsa atla

    let anyVisible = false;
    for (const c of cars) {
        if (!c.moving) { anyVisible = true; continue; }
        c.y -= c.vy * dt / 1000;
        c.wobble = Math.sin(Date.now() / 80) * 0.004;
        if (c.y < -0.2) c.removed = true;
        else anyVisible = true;
    }
    cars = cars.filter(c => !c.removed);

    // Tüm araçlar gidince yenilerini oluştur (bir kez)
    if (!anyVisible && cars.length === 0) {
        carsRespawning = true;
        setTimeout(() => { initCars(); carsRespawning = false; }, 400);
    }
}

// ----------------------------------------------------------------
// PARTİKÜL SİSTEMİ
// ----------------------------------------------------------------
function spawnParticles(cx, cy, color='#ffff00', count=18) {
    for (let i=0; i<count; i++) {
        const a = (Math.PI*2*i/count) + Math.random()*0.6;
        const spd = 90 + Math.random()*130;
        particles.push({
            x:cx, y:cy,
            vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 50,
            color, r: 3+Math.random()*5,
            life: 1, decay: 0.9+Math.random()*1.2,
        });
    }
}

function updateParticles(dt) {
    for (let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.x += p.vx*dt/1000; p.y += p.vy*dt/1000;
        p.vy += 250*dt/1000;
        p.life -= p.decay*dt/1000;
        if (p.life<=0) particles.splice(i,1);
    }
}

// ----------------------------------------------------------------
// YÜZEN YAZI
// ----------------------------------------------------------------
function spawnText(x, y, text, color='#ffffff', size=28) {
    floatTexts.push({ x, y, text, color, size, vy:-60, life:1, decay:0.7 });
}

function updateFloatTexts(dt) {
    for (let i=floatTexts.length-1; i>=0; i--) {
        const t=floatTexts[i];
        t.y += t.vy*dt/1000;
        t.life -= t.decay*dt/1000;
        if (t.life<=0) floatTexts.splice(i,1);
    }
}

// ----------------------------------------------------------------
// KONUŞMA BALONLARI
// ----------------------------------------------------------------
function addBubble(xr, yr, text, duration=3500) {
    speechBubbles.push({ xr, yr, text, life:duration, maxLife:duration });
}

function updateBubbles(dt) {
    for (let i=speechBubbles.length-1; i>=0; i--) {
        speechBubbles[i].life -= dt;
        if (speechBubbles[i].life<=0) speechBubbles.splice(i,1);
    }
}

// ----------------------------------------------------------------
// KİZGIN SÜRÜCÜ FİGÜRLERİ
// ----------------------------------------------------------------
function addFigure(startXr, startYr, targetXr, targetYr) {
    figures.push({
        xr: startXr, yr: startYr,
        txr: targetXr, tyr: targetYr,
        reached: false,
        speed: 0.06 + Math.random()*0.02,
    });
}

function updateFigures(dt) {
    for (const f of figures) {
        if (f.reached) continue;
        const dx = f.txr - f.xr;
        const dy = f.tyr - f.yr;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 0.01) { f.reached = true; continue; }
        const step = f.speed * dt/1000;
        f.xr += (dx/dist)*step;
        f.yr += (dy/dist)*step;
    }
}

// ----------------------------------------------------------------
// OYUN SIFIRLA / BAŞLAT
// ----------------------------------------------------------------
function resetGame() {
    G = {
        screen:      'playing',
        light:       'red',      // red | yellow | green
        lightTimer:  0,
        redDur:      4200,       // kırmızı süre (ms) — zorlaşınca kısalır
        yellowDur:   700,
        greenDur:    5000,       // yeşilde tepki süresi

        score:       0,
        combo:       0,
        highScore:   parseInt(localStorage.getItem('tnk_hs') || '0'),
        cycleCount:  0,

        passTimer:   0,   // yeşil ışıkta geçen ms
        passStage:   0,   // 0=normal,1=diğer kornalar,2=adam indi,3=kalabalık,4=oyun bitti

        shakeAmt:    0,   // ekran sarsıntısı şiddeti
        shakeDur:    0,
    };

    particles      = [];
    floatTexts     = [];
    speechBubbles  = [];
    figures        = [];
    carsRespawning = false;

    initCars();
    updateHUD();
}

// ----------------------------------------------------------------
// HUD GÜNCELLEME
// ----------------------------------------------------------------
function updateHUD() {
    document.getElementById('score-val').textContent     = G.score;
    document.getElementById('highscore-val').textContent = G.highScore;

    const comboEl = document.getElementById('combo-display');
    if (G.combo >= 2) {
        comboEl.textContent = `🔥 COMBO x${G.combo}`;
        comboEl.style.animation = 'none';
        void comboEl.offsetWidth;
        comboEl.style.animation = 'comboAppear 0.3s ease';
    } else {
        comboEl.textContent = '';
    }

    // Işık uyarısı
    const warnEl = document.getElementById('light-warn');
    if (G.light === 'green' && G.passTimer < 2800) {
        warnEl.textContent = '⚡ KORNA BAS!';
        warnEl.style.color = '#00e676';
    } else if (G.light === 'green' && G.passStage >= 1) {
        const urgency = ['😤 Diğerleri kızıyor!','😡 Adam indi!','😱 Kalabalık geliyor!','💀'];
        warnEl.textContent = urgency[Math.min(G.passStage-1, 3)];
        warnEl.style.color = '#ff5722';
    } else if (G.light === 'red') {
        warnEl.textContent  = '🔴 Bekle...';
        warnEl.style.color  = '#ff1744';
    } else if (G.light === 'yellow') {
        warnEl.textContent  = '🟡 Hazır ol!';
        warnEl.style.color  = '#ffea00';
    } else {
        warnEl.textContent = '';
    }
}

// ----------------------------------------------------------------
// KORNA BASMA — oyuncunun ana eylemi
// ----------------------------------------------------------------
function honk() {
    if (G.screen !== 'playing') return;
    getAC(); // Ses bağlamını kullanıcı etkileşimiyle başlat

    if (G.light === 'green') {
        // ✅ BAŞARILI
        playSound('horn_player');
        playSound('success');

        const reactFrac  = Math.max(0, 1 - G.passTimer / G.greenDur);
        const speedBonus = Math.round(reactFrac * 15);
        const comboMult  = 1 + G.combo * 0.35;
        const earned     = Math.round((10 + speedBonus) * comboMult);

        G.score += earned;
        G.combo++;
        G.cycleCount++;

        if (G.score > G.highScore) {
            G.highScore = G.score;
            localStorage.setItem('tnk_hs', G.highScore);
        }

        // Sarsıntı
        G.shakeAmt = 8; G.shakeDur = 280;

        // Görsel geri bildirim
        spawnParticles(canvas.width*0.5, canvas.height*ROAD.stopY, '#00ff88', 22);
        spawnText(canvas.width*0.5, canvas.height*0.38, `+${earned}!`, '#00e676', 36);
        if (G.combo >= 2) {
            spawnText(canvas.width*0.5, canvas.height*0.31, `🔥 COMBO x${G.combo}`, '#ffea00', 28);
        }

        // Araçları hareket ettir
        launchCars();

        // Işığı kırmızıya döndür ve durumu sıfırla
        G.light      = 'red';
        G.lightTimer = 0;
        G.passTimer  = 0;
        G.passStage  = 0;
        speechBubbles = [];
        figures       = [];

        // Zorluk artır
        G.redDur  = Math.max(1600, G.redDur  - 40);
        G.greenDur= Math.max(1300, G.greenDur - 30);

        updateHUD();

    } else if (G.light === 'red') {
        // ❌ YANLIŞ — kırmızıda bas
        playSound('wrong');

        const penalty = Math.max(5, 10 - G.combo);
        G.score = Math.max(0, G.score - penalty);
        G.combo = 0;
        G.shakeAmt = 5; G.shakeDur = 200;

        spawnParticles(canvas.width*0.5, canvas.height*0.5, '#ff1744', 14);
        spawnText(canvas.width*0.5, canvas.height*0.4, `-${penalty} KIRMIZIDA BASMA!`, '#ff1744', 22);
        updateHUD();

    } else if (G.light === 'yellow') {
        // Sarıda — çok erken
        playSound('wrong');
        spawnText(canvas.width*0.5, canvas.height*0.4, 'Çok erken! ⏳', '#ffea00', 22);
    }
}

// ----------------------------------------------------------------
// PASIF CEZA TETİKLEYİCİLERİ
// ----------------------------------------------------------------
function triggerStage1() {
    // Diğer araçlar kornaya başlar
    for (let i=0; i<4; i++) setTimeout(()=>playSound('horn_other'), i*350);
    for (const c of cars) if (!c.isPlayer) c.hornAnim = 2500;

    addBubble(LANE_X[1], ROAD.stopY - 0.02, 'BEEP BEEP! 😤', 3000);
    spawnText(canvas.width*0.5, canvas.height*0.33, 'Diğerleri sabırsızlandı! 😤', '#ff8800', 22);
}

function triggerStage2() {
    // Adam iner
    playSound('crowd');
    const c = cars.find(x => !x.isPlayer && x.lane===1) || cars.find(x=>!x.isPlayer);
    if (c) {
        addFigure(c.x + 0.07, c.y, LANE_X[0] + 0.1, ROAD.stopY - 0.04);
    }
    addBubble(LANE_X[0]+0.12, ROAD.stopY-0.1, 'HADİ İLERLE! 😡', 4500);
    spawnText(canvas.width*0.5, canvas.height*0.3, '😡 Adam indi!', '#ff5500', 28);
}

function triggerStage3() {
    // Kalabalık yaklaşır
    playSound('crowd'); playSound('crowd');
    G.shakeAmt = 10; G.shakeDur = 600;

    for (let i=0; i<5; i++) {
        addFigure(
            0.05 + i*0.17,
            ROAD.stopY + 0.25,
            LANE_X[0] - 0.04 + i*0.04,
            ROAD.stopY + 0.08
        );
    }
    addBubble(0.5, 0.28, '💢 GELİYORUZ! 👊', 5000);
    spawnText(canvas.width*0.5, canvas.height*0.25, '😱 Kalabalık geliyor!', '#ff0000', 32);
}

// ----------------------------------------------------------------
// OYUN BİTTİ
// ----------------------------------------------------------------
function triggerGameOver() {
    G.screen   = 'gameover';
    G.passStage = 4;

    playSound('beat');
    setTimeout(()=>playSound('crowd'), 300);
    G.shakeAmt = 20; G.shakeDur = 1000;

    // Patlatma efektleri
    for (let i=0; i<10; i++) {
        setTimeout(()=>{
            spawnParticles(
                canvas.width  * (0.25 + Math.random()*0.5),
                canvas.height * (0.3  + Math.random()*0.4),
                ['#ff1744','#ff8800','#ffff00'][Math.floor(Math.random()*3)],
                12
            );
        }, i*180);
    }

    setTimeout(()=>{
        if (G.score > G.highScore) {
            G.highScore = G.score;
            localStorage.setItem('tnk_hs', G.highScore);
        }
        document.getElementById('final-score').textContent     = G.score;
        document.getElementById('final-highscore').textContent = G.highScore;
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.remove('hidden');
    }, 2200);
}

// ----------------------------------------------------------------
// ANA GÜNCELLEME DÖNGÜSÜ
// ----------------------------------------------------------------
let lastTs = 0;

function update(ts) {
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;

    if (G.screen !== 'playing') {
        // Partikül animasyonlarını oyun bitti ekranında da sürdür
        updateParticles(dt);
        updateFloatTexts(dt);
        return;
    }

    // ---- Işık durumu makinesi ----
    G.lightTimer += dt;

    switch (G.light) {
        case 'red':
            if (G.lightTimer >= G.redDur) {
                G.light      = 'yellow';
                G.lightTimer = 0;
            }
            break;

        case 'yellow':
            if (G.lightTimer >= G.yellowDur) {
                G.light      = 'green';
                G.lightTimer = 0;
                G.passTimer  = 0;
                G.passStage  = 0;
                playSound('green_ding');
                spawnText(canvas.width*0.5, canvas.height*0.38, '🟢 KORNA BAS! 📯', '#00e676', 34);
            }
            break;

        case 'green':
            G.passTimer += dt;

            if (G.passTimer >= 3000  && G.passStage < 1) { G.passStage=1; triggerStage1(); }
            if (G.passTimer >= 6500  && G.passStage < 2) { G.passStage=2; triggerStage2(); }
            if (G.passTimer >= 10500 && G.passStage < 3) { G.passStage=3; triggerStage3(); }
            if (G.passTimer >= 15000 && G.passStage < 4) { triggerGameOver(); }
            break;
    }

    // ---- Araçlar ----
    updateCars(dt);
    for (const c of cars) {
        if (c.hornAnim > 0) c.hornAnim -= dt;
    }

    // ---- Ekran sarsıntısı ----
    if (G.shakeDur > 0) {
        G.shakeDur -= dt;
        if (G.shakeDur <= 0) { G.shakeAmt = 0; G.shakeDur = 0; }
    }

    // ---- Efektler ----
    updateParticles(dt);
    updateFloatTexts(dt);
    updateBubbles(dt);
    updateFigures(dt);
    updateHUD();
}

// ----------------------------------------------------------------
// ÇİZİM FONKSİYONLARI
// ----------------------------------------------------------------

/* Yol ve kaldırım */
function drawRoad() {
    const W = canvas.width, H = canvas.height;
    const rL = W*ROAD.left, rR = W*ROAD.right;

    // Arka plan (kaldırım / şehir zemini)
    ctx.fillStyle = '#0e0e22';
    ctx.fillRect(0, 0, W, H);

    // Yol yüzeyi
    const grad = ctx.createLinearGradient(rL, 0, rR, 0);
    grad.addColorStop(0,   '#1e1e30');
    grad.addColorStop(0.5, '#252540');
    grad.addColorStop(1,   '#1e1e30');
    ctx.fillStyle = grad;
    ctx.fillRect(rL, 0, rR-rL, H);

    // Kaldırım şeritleri (dekoratif)
    ctx.fillStyle = '#14142a';
    ctx.fillRect(0, 0, rL, H);
    ctx.fillRect(rR, 0, W-rR, H);
    ctx.strokeStyle = '#222240';
    ctx.lineWidth = sx(1);
    for (let y=0; y<H; y+=sy(30)) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(sx(4), y, rL-sx(8), sy(14));
        ctx.fillRect(rR+sx(4), y, W-rR-sx(8), sy(14));
    }

    // Yol kenar çizgileri
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = sx(2);
    ctx.beginPath(); ctx.moveTo(rL, 0); ctx.lineTo(rL, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rR, 0); ctx.lineTo(rR, H); ctx.stroke();

    // Orta kesik çizgi
    ctx.strokeStyle = '#cccc00';
    ctx.lineWidth   = sx(2);
    ctx.setLineDash([sy(22), sy(16)]);
    ctx.beginPath(); ctx.moveTo(W*ROAD.mid, 0); ctx.lineTo(W*ROAD.mid, H); ctx.stroke();
    ctx.setLineDash([]);
}

/* Dur çizgisi + yaya geçidi işareti */
function drawStopLine() {
    const W = canvas.width, H = canvas.height;
    const y  = H * ROAD.stopY;
    const rL = W * ROAD.left;
    const rR = W * ROAD.right;

    // Beyaz dur çizgisi
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rL, y, rR-rL, sy(5));

    // Hafif yaya geçidi deseni
    const sw = sx(16), sh = sy(22);
    for (let x = rL; x < rR; x += sw*2) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x, y+sy(5), sw, sh);
    }
}

/* Trafik lambası */
function drawTrafficLight() {
    const W = canvas.width, H = canvas.height;
    const px = W * ROAD.lightX;   // direk X
    const ly = H * ROAD.lightY;   // lamba merkezi Y

    // Direk
    ctx.fillStyle = '#777788';
    ctx.fillRect(px-sx(3), ly, sx(6), H*ROAD.stopY - ly + sy(5));

    // Lamba gövdesi
    const hW = sx(28), hH = sy(72);
    const hX = px - hW/2, hY = ly - hH/2;

    ctx.fillStyle   = '#1a1a30';
    ctx.strokeStyle = '#333355';
    ctx.lineWidth   = sx(2);
    roundRect(hX, hY, hW, hH, sx(7));
    ctx.fill(); ctx.stroke();

    // Üç lamba (kırmızı / sarı / yeşil)
    const lamps = [
        { name:'red',    col:'#ff1744', off:'#3a0010', yp:0.18 },
        { name:'yellow', col:'#ffea00', off:'#3a3000', yp:0.50 },
        { name:'green',  col:'#00e676', off:'#003a1a', yp:0.82 },
    ];

    for (const lamp of lamps) {
        const on  = G.light === lamp.name;
        const lcx = px;
        const lcy = hY + hH * lamp.yp;
        const lr  = sx(9);

        if (on) {
            ctx.shadowBlur  = sx(18);
            ctx.shadowColor = lamp.col;
        }
        ctx.fillStyle = on ? lamp.col : lamp.off;
        ctx.beginPath();
        ctx.arc(lcx, lcy, lr, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Kalan süre çubuğu (ışık altında)
    drawLightBar(px, hY+hH+sy(8), hW);
}

function drawLightBar(cx, y, w) {
    const x = cx - w/2;
    const h = sy(5);
    ctx.fillStyle = '#22223a';
    ctx.fillRect(x, y, w, h);

    let prog = 0, color = '#ffffff';
    if (G.light === 'red') {
        prog  = G.lightTimer / G.redDur;
        color = '#ff1744';
    } else if (G.light === 'green') {
        prog  = 1 - Math.min(1, G.passTimer / 15000);
        color = prog > 0.5 ? '#00e676' : prog > 0.25 ? '#ffea00' : '#ff1744';
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, y, w*prog, h);
}

/* Araç çizimi — top-down görünüm */
function drawCar(car) {
    const W = canvas.width, H = canvas.height;
    const wobX = car.moving ? car.wobble * W : 0;
    const cx   = car.x * W + wobX;
    const cy   = car.y * H;
    const cw   = sx(46);
    const ch   = sy(72);

    ctx.save();
    ctx.translate(cx, cy);

    // Gölge
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-cw/2+sx(3), -ch/2+sy(4), cw, ch);

    // Gövde
    ctx.fillStyle = car.color;
    roundRect(-cw/2, -ch/2, cw, ch, sx(6));
    ctx.fill();

    // Kaput (hafif açık ton)
    ctx.fillStyle = lighten(car.color, 25);
    ctx.fillRect(-cw/2+sx(4), -ch/2+sy(4), cw-sx(8), ch*0.3);

    // Ön cam
    ctx.fillStyle = 'rgba(170,220,255,0.72)';
    ctx.fillRect(-cw/2+sx(5), -ch/2+sy(6), cw-sx(10), ch*0.26);

    // Arka cam
    ctx.fillStyle = 'rgba(170,220,255,0.55)';
    ctx.fillRect(-cw/2+sx(5), ch/2-sy(6)-ch*0.2, cw-sx(10), ch*0.18);

    // Far (ön — sarı)
    ctx.fillStyle = '#ffffaa';
    ctx.beginPath(); ctx.ellipse(-cw/2+sx(7),  -ch/2+sy(4), sx(5), sy(4), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( cw/2-sx(7),  -ch/2+sy(4), sx(5), sy(4), 0, 0, Math.PI*2); ctx.fill();

    // Stop ışığı (arka — kırmızı)
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.ellipse(-cw/2+sx(7),  ch/2-sy(4), sx(5), sy(4), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( cw/2-sx(7),  ch/2-sy(4), sx(5), sy(4), 0, 0, Math.PI*2); ctx.fill();

    // Oyuncu göstergesi
    if (car.isPlayer) {
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth   = sx(2.5);
        roundRect(-cw/2-sx(3), -ch/2-sy(3), cw+sx(6), ch+sy(6), sx(8));
        ctx.stroke();

        ctx.font      = `${sx(11)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00e676';
        ctx.fillText('▲ SİZ', 0, -ch/2-sy(10));
    }

    // Diğer araç korna animasyonu
    if (car.hornAnim > 0 && !car.isPlayer) {
        const hop = Math.sin(Date.now()/90) * sy(4);
        ctx.font      = `${sx(18)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('📯', 0, -ch/2-sy(12)+hop);
    }

    ctx.restore();
}

/* Kızgın figür (çubuk adam) */
function drawFigure(fig) {
    const W = canvas.width, H = canvas.height;
    const x  = fig.xr * W;
    const y  = fig.yr * H;

    ctx.save();
    ctx.translate(x, y);

    const wave = Math.sin(Date.now()/170) * sx(7);

    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth   = sx(2.5);
    ctx.lineCap     = 'round';

    // Baş
    ctx.beginPath(); ctx.arc(0, -sy(22), sy(7), 0, Math.PI*2); ctx.stroke();
    ctx.font      = `${sy(9)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline='middle';
    ctx.fillText('😡', 0, -sy(22));

    // Gövde
    ctx.beginPath(); ctx.moveTo(0,-sy(15)); ctx.lineTo(0, sy(5)); ctx.stroke();

    // Kollar (kızgın el sallama)
    ctx.beginPath(); ctx.moveTo(0,-sy(10)); ctx.lineTo(-sx(12),-sy(15)+wave); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-sy(10)); ctx.lineTo( sx(12),-sy(15)-wave); ctx.stroke();

    // Bacaklar
    ctx.beginPath(); ctx.moveTo(0,sy(5)); ctx.lineTo(-sx(6),sy(20)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,sy(5)); ctx.lineTo( sx(6),sy(20)); ctx.stroke();

    ctx.restore();
}

/* Konuşma balonu */
function drawBubble(b) {
    const W = canvas.width, H = canvas.height;
    const x = b.xr * W;
    const y = b.yr * H;
    const alpha = Math.min(1, b.life / (b.maxLife * 0.25));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${sx(12)}px Arial`;
    const tw  = ctx.measureText(b.text).width;
    const pad = sx(9);
    const bW  = tw + pad*2;
    const bH  = sy(26);

    // Arka plan
    ctx.fillStyle   = '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = sx(1.5);
    roundRect(x-bW/2, y-bH/2, bW, bH, sx(7));
    ctx.fill(); ctx.stroke();

    // Kuyruk
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x-sx(5), y+bH/2);
    ctx.lineTo(x+sx(5), y+bH/2);
    ctx.lineTo(x, y+bH/2+sy(8));
    ctx.closePath(); ctx.fill();

    ctx.fillStyle   = '#111';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.fillText(b.text, x, y);
    ctx.restore();
}

/* Partiküller */
function drawParticles() {
    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.shadowBlur  = sx(6);
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r*p.life, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

/* Yüzen yazılar */
function drawFloatTexts() {
    for (const t of floatTexts) {
        ctx.save();
        ctx.globalAlpha = t.life;
        ctx.font        = `900 ${sx(t.size)}px Arial Black, Arial`;
        ctx.textAlign   = 'center';
        ctx.textBaseline= 'middle';
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth   = sx(4);
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle   = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
    }
}

// ----------------------------------------------------------------
// ANA RENDER — sadece oyun ekranı görünürken çizer
// ----------------------------------------------------------------
function render() {
    if (G.screen === 'menu') return;   // Menüde canvas boş kalabilir
    const W = canvas.width, H = canvas.height;

    ctx.save();

    // Ekran sarsıntısı
    if (G.shakeDur > 0 && G.shakeAmt > 0) {
        const s  = G.shakeAmt * (G.shakeDur / 300);
        ctx.translate((Math.random()-0.5)*s*2, (Math.random()-0.5)*s*2);
    }

    ctx.clearRect(-30, -30, W+60, H+60);

    drawRoad();
    drawStopLine();
    drawTrafficLight();

    // Araçlar (alttakiler önce)
    const sorted = [...cars].sort((a,b) => b.y - a.y);
    for (const c of sorted) drawCar(c);

    // Kızgın figürler
    for (const f of figures) drawFigure(f);

    // Konuşma balonları
    for (const b of speechBubbles) drawBubble(b);

    drawParticles();
    drawFloatTexts();

    // "KORNA BAS!" vurgulama — yeşil ışıkta titreşen banner
    if (G.screen==='playing' && G.light==='green' && G.passStage===0) {
        const blink = Math.floor(Date.now()/280) % 2 === 0;
        if (blink) {
            ctx.save();
            ctx.fillStyle   = 'rgba(0,230,118,0.13)';
            ctx.strokeStyle = 'rgba(0,230,118,0.6)';
            ctx.lineWidth   = sx(3);
            roundRect(W*0.05, H*0.3, W*0.9, sy(46), sx(10));
            ctx.fill(); ctx.stroke();
            ctx.restore();
        }
    }

    ctx.restore();
}

// ----------------------------------------------------------------
// YARDIMCI FONKSİYONLAR
// ----------------------------------------------------------------

/* roundRect uyumluluk yardımcısı */
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        // Eski tarayıcı uyumu
        ctx.moveTo(x+r, y);
        ctx.lineTo(x+w-r, y);
        ctx.arcTo(x+w, y, x+w, y+r, r);
        ctx.lineTo(x+w, y+h-r);
        ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
        ctx.lineTo(x+r, y+h);
        ctx.arcTo(x, y+h, x, y+h-r, r);
        ctx.lineTo(x, y+r);
        ctx.arcTo(x, y, x+r, y, r);
        ctx.closePath();
    }
}

/* Rengi aydınlat (#rrggbb → rgb(...)) */
function lighten(hex, amt) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.min(255,r+amt)},${Math.min(255,g+amt)},${Math.min(255,b+amt)})`;
}

// ----------------------------------------------------------------
// ANA DÖNGÜ
// ----------------------------------------------------------------
function loop(ts) {
    update(ts);
    render();
    requestAnimationFrame(loop);
}

// ----------------------------------------------------------------
// EKRAN YÖNETİMİ
// ----------------------------------------------------------------
function showGame() {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    resizeCanvas();
}

function showMenu() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('menu-highscore').textContent =
        localStorage.getItem('tnk_hs') || '0';
}

// ----------------------------------------------------------------
// GİRDİ YÖNETİMİ
// ----------------------------------------------------------------
function setupInput() {
    // Klavye
    document.addEventListener('keydown', e => {
        if (e.code === 'Space') { e.preventDefault(); honk(); }
    });

    // Canvas tıklama / dokunma
    canvas.addEventListener('click',      e => { e.preventDefault(); honk(); });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); honk(); }, { passive:false });

    // Korna butonu
    const hornBtn = document.getElementById('horn-btn');
    hornBtn.addEventListener('click',      e => { e.stopPropagation(); honk(); });
    hornBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); honk(); }, { passive:false });

    // Menü → Başlat
    document.getElementById('start-btn').addEventListener('click', () => {
        resetGame();
        showGame();
    });

    // Oyun bitti → Tekrar
    document.getElementById('restart-btn').addEventListener('click', () => {
        resetGame();
        showGame();
    });

    // Oyun bitti → Menü
    document.getElementById('menu-btn').addEventListener('click', () => {
        G.screen = 'menu';
        showMenu();
    });
}

// ----------------------------------------------------------------
// BAŞLATMA
// ----------------------------------------------------------------
function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Menü skor gösterimi
    document.getElementById('menu-highscore').textContent =
        localStorage.getItem('tnk_hs') || '0';

    setupInput();

    // Oyun döngüsünü başlat (her zaman çalışır, ekran durumuna göre davranır)
    requestAnimationFrame(ts => { lastTs = ts; loop(ts); });
}

// Dünya hazır olduğunda başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
