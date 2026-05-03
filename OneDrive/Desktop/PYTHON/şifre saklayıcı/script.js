'use strict';

// ---- DURUM ----
let cryptoKey = null;   // Bellekte tutulan AES anahtarı (sayfayı kapat = sıfırlanır)
let vault = {};         // Şifre deposu (bellekte)
let lockTimer = null;

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 dakika hareketsizlik = otomatik kilit
const $ = id => document.getElementById(id);

// ================================================================
// YARDIMCI FONKSİYONLAR — Byte ↔ Hex dönüşüm
// ================================================================
const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));

// ================================================================
// ŞİFRELEME — Web Crypto API (PBKDF2 + AES-GCM)
// ================================================================

// Master şifreden AES anahtarı türet
async function deriveKey(password, salt) {
  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

// Metni şifrele → "iv:ciphertext" formatında hex string döndür
async function aesEncrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)
  );
  return toHex(iv) + ':' + toHex(new Uint8Array(ct));
}

// Şifreli hex string'i çöz → düz metin döndür
async function aesDecrypt(data, key) {
  const [ivHex, ctHex] = data.split(':');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromHex(ivHex) }, key, fromHex(ctHex)
  );
  return new TextDecoder().decode(pt);
}

// ================================================================
// EKRAN YÖNETİMİ
// ================================================================
function showScreen(name) {
  ['setup', 'login', 'main'].forEach(s => {
    $(s + 'Screen').hidden = s !== name;
  });
}

// ================================================================
// BAŞLATMA
// ================================================================
function init() {
  // Klavye kısayolları
  $('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  $('setupPassword').addEventListener('keydown', e => { if (e.key === 'Enter') $('setupConfirm').focus(); });
  $('setupConfirm').addEventListener('keydown', e => { if (e.key === 'Enter') setupMaster(); });
  $('site').addEventListener('keydown', e => { if (e.key === 'Enter') $('newPassword').focus(); });
  $('newPassword').addEventListener('keydown', e => { if (e.key === 'Enter') savePassword(); });

  // Daha önce hesap kurulmuşsa giriş ekranı, kurulmamışsa kurulum ekranı
  showScreen(localStorage.getItem('salt') ? 'login' : 'setup');
}

// ================================================================
// LEVEL 3 — MASTER ŞİFRE KURULUMU
// ================================================================
async function setupMaster() {
  const p = $('setupPassword').value;
  const c = $('setupConfirm').value;
  const err = $('setupError');
  err.textContent = '';

  if (p.length < 6) return err.textContent = 'En az 6 karakter girin.';
  if (p !== c) return err.textContent = 'Şifreler eşleşmiyor.';

  // Rastgele salt oluştur ve sakla
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('salt', toHex(salt));

  // Master şifreden anahtar türet
  cryptoKey = await deriveKey(p, salt);

  // Doğrulayıcı: "VERIFIED" stringini şifreli sakla (giriş kontrolü için)
  localStorage.setItem('verifier', await aesEncrypt('VERIFIED', cryptoKey));

  vault = {};
  await persistVault();

  $('setupPassword').value = '';
  $('setupConfirm').value = '';
  resetLockTimer();
  showScreen('main');
  renderList();
  showToast('Hesap oluşturuldu!');
}

// ================================================================
// LEVEL 3 — GİRİŞ (KİLİT AÇ)
// ================================================================
async function unlock() {
  const p = $('loginPassword').value;
  const err = $('loginError');
  err.textContent = '';

  if (!p) return;

  try {
    const salt = fromHex(localStorage.getItem('salt'));
    const key = await deriveKey(p, salt);

    // Şifreyi doğrula
    const verified = await aesDecrypt(localStorage.getItem('verifier'), key);
    if (verified !== 'VERIFIED') throw new Error('wrong password');

    // Anahtarı bellekte tut ve vault'u yükle
    cryptoKey = key;
    const enc = localStorage.getItem('encVault');
    vault = enc ? JSON.parse(await aesDecrypt(enc, cryptoKey)) : {};

    $('loginPassword').value = '';
    resetLockTimer();
    showScreen('main');
    renderList();
  } catch {
    err.textContent = 'Yanlış şifre!';
  }
}

// ================================================================
// LEVEL 3 — KİLİTLE
// ================================================================
function lock() {
  cryptoKey = null;
  vault = {};
  clearTimeout(lockTimer);
  $('loginPassword').value = '';
  showScreen('login');
}

// ================================================================
// LEVEL 3 — OTOMATİK KİLİT (5 dakika hareketsizlik)
// ================================================================
function resetLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(lock, LOCK_TIMEOUT);
}

document.addEventListener('mousemove', () => { if (cryptoKey) resetLockTimer(); });
document.addEventListener('keydown',   () => { if (cryptoKey) resetLockTimer(); });
document.addEventListener('click',     () => { if (cryptoKey) resetLockTimer(); });

// ================================================================
// TÜM VERİLERİ SIFIRLA
// ================================================================
function resetAll() {
  if (!confirm('Tüm şifreler ve hesap silinecek. Bu işlem geri alınamaz. Emin misiniz?')) return;
  localStorage.clear();
  cryptoKey = null;
  vault = {};
  clearTimeout(lockTimer);
  showScreen('setup');
}

// ================================================================
// VAULT — Şifrelenmiş olarak localStorage'a kaydet
// ================================================================
async function persistVault() {
  localStorage.setItem('encVault', await aesEncrypt(JSON.stringify(vault), cryptoKey));
}

// ================================================================
// LEVEL 1 — ŞİFRE KAYDET
// ================================================================
async function savePassword() {
  const site = $('site').value.trim();
  const pass = $('newPassword').value;

  if (!site || !pass) return showToast('Tüm alanları doldurun.');

  vault[site] = pass;
  await persistVault();

  $('site').value = '';
  $('newPassword').value = '';
  $('strengthBar').style.width = '0';
  $('search').value = '';
  renderList();
  showToast('Kaydedildi!');
  resetLockTimer();
}

// ================================================================
// LEVEL 1 — ŞİFRE SİL
// ================================================================
async function deletePassword(site) {
  if (!confirm(`"${site}" silinsin mi?`)) return;
  delete vault[site];
  await persistVault();
  renderList();
  resetLockTimer();
}

// ================================================================
// LEVEL 7 — LİSTE RENDER (arama filtresi dahil)
// ================================================================
function renderList() {
  const query = $('search').value.toLowerCase();
  const list = $('passwordList');
  list.innerHTML = '';

  const entries = Object.entries(vault).filter(([s]) => s.toLowerCase().includes(query));

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = query ? 'Sonuç bulunamadı.' : 'Henüz kayıt yok.';
    list.appendChild(li);
    return;
  }

  entries.forEach(([site, pass]) => {
    const li = document.createElement('li');

    // Site adı
    const siteName = document.createElement('span');
    siteName.className = 'site-name';
    siteName.textContent = site;

    // Şifre göstergesi (LEVEL 1 — göster/gizle)
    const passDisplay = document.createElement('span');
    passDisplay.className = 'pass-display';
    passDisplay.textContent = '••••••••';
    let visible = false;

    const actions = document.createElement('div');
    actions.className = 'actions';

    // 👁 Göster / Gizle butonu (LEVEL 1)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-icon';
    toggleBtn.title = 'Göster / Gizle';
    toggleBtn.textContent = '👁';
    toggleBtn.onclick = () => {
      visible = !visible;
      passDisplay.textContent = visible ? pass : '••••••••';
      resetLockTimer();
    };

    // 📋 Kopyala butonu (LEVEL 2)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-icon';
    copyBtn.title = 'Panoya kopyala';
    copyBtn.textContent = '📋';
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(pass);
      showToast('Kopyalandı!');
      resetLockTimer();
    };

    // 🗑 Sil butonu (LEVEL 3)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon btn-delete';
    deleteBtn.title = 'Sil';
    deleteBtn.textContent = '🗑';
    deleteBtn.onclick = () => deletePassword(site);

    actions.append(toggleBtn, copyBtn, deleteBtn);
    li.append(siteName, passDisplay, actions);
    list.appendChild(li);
  });
}

// ================================================================
// LEVEL 1 — YENİ ŞİFRE ALANINI GÖSTER / GİZLE
// ================================================================
function toggleNewPass() {
  const inp = $('newPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ================================================================
// LEVEL 6 — ŞİFRE GÜÇ GÖSTERGESİ
// ================================================================
function checkStrength() {
  const pass = $('newPassword').value;
  const bar = $('strengthBar');
  let score = 0;
  if (pass.length >= 8)            score++;
  if (pass.length >= 12)           score++;
  if (/[A-Z]/.test(pass))          score++;
  if (/[0-9]/.test(pass))          score++;
  if (/[^A-Za-z0-9]/.test(pass))   score++;

  const colors = ['', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'];
  bar.style.width   = (score * 20) + '%';
  bar.style.background = colors[score] || '#ecf0f1';
}

// ================================================================
// LEVEL 5 — RASTGELE ŞİFRE ÜRETECI
// ================================================================
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
  const len = Math.min(Math.max(parseInt($('passLength').value) || 16, 8), 32);
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  $('newPassword').value = Array.from(arr).map(n => chars[n % chars.length]).join('');
  $('newPassword').type = 'text'; // üretileni göster
  checkStrength();
}

// ================================================================
// LEVEL 8 — DIŞA AKTAR (JSON)
// ================================================================
function exportVault() {
  const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vault-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Dışa aktarıldı!');
  resetLockTimer();
}

// ================================================================
// LEVEL 8 — İÇE AKTAR (JSON)
// ================================================================
async function importVault(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error();
    const count = Object.keys(data).length;
    Object.assign(vault, data);
    await persistVault();
    renderList();
    showToast(`${count} kayıt içe aktarıldı!`);
  } catch {
    showToast('Geçersiz dosya!');
  }
  event.target.value = '';
  resetLockTimer();
}

// ================================================================
// TOAST BİLDİRİMİ
// ================================================================
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ================================================================
window.onload = init;
