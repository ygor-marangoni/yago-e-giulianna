// ═══════════════════════════════════════
// TAG CONFIG
// ═══════════════════════════════════════
const TAG_MAP = {
  'Assistir série':    'tv',
  'Comer juntos':      'utensils',
  'Passear':           'map-pin',
  'Jogar':             'gamepad-2',
  'Chamego':           'heart',
  'Cinema':            'clapperboard',
  'Treinar':           'dumbbell',
  'Estudar':           'book-open',
  'Ouvir música':      'music',
  'Cozinhar':          'chef-hat',
  'Dormir juntos':     'moon',
  'Sair com amigos':   'users',
};

const DEFAULT_TAGS = [
  'Assistir série','Comer juntos','Passear','Jogar','Chamego','Cinema',
  'Treinar','Estudar','Ouvir música','Cozinhar','Dormir juntos',
  'Sair com amigos'
];

// ═══════════════════════════════════════
// FIREBASE — CONFIGURAÇÃO
// ═══════════════════════════════════════
/*
 * ─────────────────────────────────────────────────────────────
 *  NOSSO TEMPO — Firebase Realtime Database
 * ─────────────────────────────────────────────────────────────
 *  Painel do projeto : https://console.firebase.google.com
 *  Banco de dados    : https://SEU_PROJETO-default-rtdb.firebaseio.com
 *
 *  Como configurar (primeira vez):
 *   1. Acesse https://console.firebase.google.com e crie um projeto
 *   2. Vá em Build → Realtime Database → Criar banco de dados
 *      → Selecione a região mais próxima → Modo de teste → Concluir
 *   3. Em Realtime Database → Regras, cole e publique:
 *      { "rules": { ".read": true, ".write": true } }
 *   4. Vá em Configurações do projeto (ícone engrenagem)
 *      → Seus apps → Adicionar app → Web
 *   5. Copie o objeto firebaseConfig e substitua os valores abaixo
 * ─────────────────────────────────────────────────────────────
 */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBF_PRXRNrtPrr2D54uoJViaQaafbWD16o",
  authDomain:        "nosso-tempo-giulianna.firebaseapp.com",
  databaseURL:       "https://nosso-tempo-giulianna-default-rtdb.firebaseio.com",
  projectId:         "nosso-tempo-giulianna",
  storageBucket:     "nosso-tempo-giulianna.firebasestorage.app",
  messagingSenderId: "25135207742",
  appId:             "1:25135207742:web:80613353445d82bbc1486f",
  measurementId:     "G-WFYMW706BQ"
};

firebase.initializeApp(FIREBASE_CONFIG);
const _fdb = firebase.database();
const _REF = {
  entries  : _fdb.ref('yj/entries'),
  config   : _fdb.ref('yj/config'),
  tags     : _fdb.ref('yj/tags'),
  album    : _fdb.ref('yj/album'),
  timeline : _fdb.ref('yj/timeline'),
  phrases  : _fdb.ref('yj/phrases'),
};

// Cache em memória — fonte da verdade após o carregamento
const _cache = {
  entries  : [],
  config   : { name1: 'Giulianna', name2: 'Yago' },
  tags     : [],
  album    : [],
  timeline : [],
  phrases  : [],
};

// ═══════════════════════════════════════
// ESTADO DE CARREGAMENTO
// ═══════════════════════════════════════
let _pendingLoads = 6;
let _appReady     = false;
let _loadTimer    = null;

function _onDataLoaded() {
  _pendingLoads--;
  if (_pendingLoads > 0) return;
  clearTimeout(_loadTimer);
  _tryMigrateLocalStorage().finally(() => {
    document.getElementById('loading-screen').style.display = 'none';
    _appReady = true;
    const lastPage = localStorage.getItem('yj_page') || 'home';
    navigateTo(lastPage);
    scheduleMidnightRefresh();
  });
}

function showErrorScreen() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('error-screen').style.display   = 'flex';
  lucide.createIcons();
}

let _midnightTimer = null;
function scheduleMidnightRefresh() {
  clearTimeout(_midnightTimer);
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  _midnightTimer = setTimeout(() => {
    if (localStorage.getItem('yj_page') === 'home') refreshHome();
    scheduleMidnightRefresh();
  }, msUntilMidnight);
}

// ═══════════════════════════════════════
// LISTENERS EM TEMPO REAL
// ═══════════════════════════════════════
function setupListeners() {
  _loadTimer = setTimeout(showErrorScreen, 6000);

  _REF.entries.on('value', snap => {
    const val = snap.val();
    _cache.entries = val ? Object.values(val) : [];
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });

  _REF.config.on('value', snap => {
    _cache.config = snap.val() || { name1: 'Giulianna', name2: 'Yago' };
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });

  _REF.tags.on('value', snap => {
    const val = snap.val();
    _cache.tags = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });

  _REF.album.on('value', snap => {
    const val = snap.val();
    _cache.album = val ? Object.values(val) : [];
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });

  _REF.timeline.on('value', snap => {
    const val = snap.val();
    _cache.timeline = val ? Object.values(val) : [];
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });

  _REF.phrases.on('value', snap => {
    const val = snap.val();
    _cache.phrases = val ? Object.values(val) : [];
    if (_appReady) _refreshCurrentPage(); else _onDataLoaded();
  });
}

// Atualiza a renderização da página atual sem resetar formulários
function _refreshCurrentPage() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id.replace('page-', '');
  ({
    home    : refreshHome,
    register: renderTags,
    history : () => renderHistory(curFilter),
    reports : renderReports,
    album    : () => renderAlbum(albumFilter),
    timeline : renderTimeline,
    config   : initConfig,
  })[pageId]?.();
}

// ═══════════════════════════════════════
// MIGRAÇÃO DO LOCALSTORAGE
// ═══════════════════════════════════════
async function _tryMigrateLocalStorage() {
  try {
    const localEntries = JSON.parse(localStorage.getItem('yj_entries') || '[]');
    const localAlbum   = JSON.parse(localStorage.getItem('yj_album')   || '[]');
    const localTags    = JSON.parse(localStorage.getItem('yj_tags')    || '[]');
    const localConfig  = JSON.parse(localStorage.getItem('yj_config')  || 'null');

    const hasLocal   = localEntries.length || localAlbum.length || localTags.length || localConfig;
    const cloudEmpty = !_cache.entries.length && !_cache.album.length && !_cache.tags.length;
    if (!hasLocal || !cloudEmpty) return;

    const updates = {};
    localEntries.forEach(e => { updates[`yj/entries/${e.id}`] = e; });
    localAlbum.forEach(a   => { updates[`yj/album/${a.id}`]   = a; });
    if (localTags.length) updates['yj/tags']   = localTags;
    if (localConfig)      updates['yj/config'] = localConfig;

    await _fdb.ref().update(updates);
    showToast('Dados migrados para a nuvem');
  } catch (_) { /* migração é best-effort */ }
}

// ═══════════════════════════════════════
// DATA HELPERS (lê do cache)
// ═══════════════════════════════════════
function entries()      { return _cache.entries; }
function config()       { return _cache.config; }
function customTags()   {
  return (_cache.tags || []).map(t => typeof t === 'string' ? { name: t, icon: 'sparkles' } : t);
}
function albumEntries() { return _cache.album; }

// Operações atômicas por documento — nunca sobrescrevem dados de outro dispositivo
function addEntry(entry) {
  _REF.entries.child(String(entry.id)).set(entry)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function removeEntry(id) {
  _REF.entries.child(String(id)).remove()
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function updateEntry(entry) {
  _REF.entries.child(String(entry.id)).set(entry)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function addPhotoToAlbum(photo) {
  _REF.album.child(String(photo.id)).set(photo)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function removePhotoFromAlbum(id) {
  _REF.album.child(String(id)).remove()
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function saveConf(c) {
  _cache.config = { ..._cache.config, ...c };
  _REF.config.update(c)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function saveTags(t) {
  _cache.tags = t;
  _REF.tags.set(t.length ? t : null)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function allTags()  { return [...DEFAULT_TAGS, ...customTags().map(t => t.name)]; }
function tagIcon(t) {
  if (TAG_MAP[t]) return TAG_MAP[t];
  const custom = customTags().find(c => c.name === t);
  return custom ? custom.icon : 'sparkles';
}

function formatTime(h) {
  const totalMin = Math.round(h * 60);
  const hrs  = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
}

// ═══════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════
function navigateTo(page) {
  window.scrollTo(0, 0);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const idx = { home:0, register:1, history:2, reports:3, album:4, timeline:5, config:6 };
  document.querySelectorAll('.nav-item')[idx[page]].classList.add('active');
  localStorage.setItem('yj_page', page);

  ({ home: refreshHome, register: initRegister, history: () => renderHistory('all'), reports: renderReports, album: initAlbum, timeline: initTimeline, config: initConfig })[page]();

  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  lucide.createIcons();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ═══════════════════════════════════════
// HOME
// ═══════════════════════════════════════
function refreshHome() {
  const c = config();
  const { name1 = 'Giulianna', name2 = 'Yago' } = c;

  // Saudação com coração inline
  const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="var(--rosa-500)" stroke="var(--rosa-500)" stroke-width="1.5" style="vertical-align:middle;margin:0 4px;position:relative;top:-2px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  document.getElementById('home-greet').innerHTML =
    `<span class="home-greet-names">${name1}${heartSvg}${name2}</span>`;

  // Sub-saudação rotativa
  const subPhrases = [
    'que bom ter vocês aqui',
    'mais um dia dessa história linda',
    'cada momento de vocês importa',
    'essa história fica mais bonita todo dia',
    'que dia lindo pra estar juntos',
  ];
  document.getElementById('home-subgreet').textContent = subPhrases[Math.floor(Math.random() * subPhrases.length)];

  // Foto do casal
  const polaroidEl = document.getElementById('home-polaroid');
  const heartEl    = document.getElementById('home-photo-heart');
  const phEl       = document.getElementById('home-photo-placeholder');
  if (c.couplePhoto) {
    document.getElementById('home-photo-img').src = c.couplePhoto;
    polaroidEl.style.display = '';
    heartEl.style.display    = '';
    phEl.style.display       = 'none';
  } else {
    polaroidEl.style.display = 'none';
    heartEl.style.display    = 'none';
    phEl.style.display       = '';
  }

  // Contador do relacionamento
  const cntWrap = document.getElementById('home-counter-wrap');
  const noDate  = document.getElementById('home-no-date');
  if (c.startDate) {
    const start = new Date(c.startDate + 'T12:00:00');
    const now   = new Date();
    let years  = now.getFullYear() - start.getFullYear();
    let months = now.getMonth()    - start.getMonth();
    let days   = now.getDate()     - start.getDate();
    if (days < 0) {
      months--;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) { years--; months += 12; }
    document.getElementById('cnt-years').textContent  = years;
    document.getElementById('cnt-months').textContent = months;
    document.getElementById('cnt-days').textContent   = days;
    document.getElementById('cnt-lbl-years').textContent  = years  === 1 ? 'ano'  : 'anos';
    document.getElementById('cnt-lbl-months').textContent = months === 1 ? 'mês'  : 'meses';
    document.getElementById('cnt-lbl-days').textContent   = days   === 1 ? 'dia'  : 'dias';
    const showYears  = years > 0;
    const showMonths = years > 0 || months > 0;
    document.getElementById('cnt-unit-years').style.display  = showYears  ? '' : 'none';
    document.getElementById('cnt-sep-1').style.display       = showYears  ? '' : 'none';
    document.getElementById('cnt-unit-months').style.display = showMonths ? '' : 'none';
    document.getElementById('cnt-sep-2').style.display       = showMonths ? '' : 'none';
    cntWrap.style.display = '';
    noDate.style.display  = 'none';
  } else {
    cntWrap.style.display = 'none';
    noDate.style.display  = '';
  }

  // Frase aleatória
  const phrases   = _cache.phrases || [];
  const quoteWrap = document.getElementById('home-quote');
  if (phrases.length) {
    const p = phrases[Math.floor(Math.random() * phrases.length)];
    document.getElementById('home-quote-text').textContent = p.text;
    quoteWrap.style.display = '';
  } else {
    quoteWrap.style.display = 'none';
  }
}

// ═══════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════
let selected = [];

function initRegister() {
  selected = [];
  document.getElementById('reg-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('reg-hours').value = '';
  document.getElementById('reg-minutes').value = '';
  document.getElementById('reg-note').value = '';
  document.getElementById('custom-activity').value = '';
  ['reg-date', 'reg-hours', 'reg-minutes'].forEach(id => document.getElementById(id).classList.remove('input-error'));
  renderTags();
}

function renderTags() {
  document.getElementById('preset-tags').innerHTML = allTags().map(t => {
    const ic = tagIcon(t);
    const sel = selected.includes(t) ? 'selected' : '';
    return `<span class="tag ${sel}" onclick="toggle(this,'${t.replace(/'/g,"\\'")}')" ><span class="tag-icon"><i data-lucide="${ic}" style="width:13px;height:13px"></i></span>${t}</span>`;
  }).join('');
  lucide.createIcons();
}

function toggle(el, tag) {
  if (selected.includes(tag)) { selected = selected.filter(t => t !== tag); el.classList.remove('selected'); }
  else { selected.push(tag); el.classList.add('selected'); }
}

function addCustomTag() {
  const v = document.getElementById('custom-activity').value.trim();
  if (!v) return;
  if (!selected.includes(v)) selected.push(v);
  document.getElementById('custom-activity').value = '';
  renderTags();
}

function saveEntry() {
  const date = document.getElementById('reg-date').value;
  const h = parseInt(document.getElementById('reg-hours').value) || 0;
  const m = parseInt(document.getElementById('reg-minutes').value) || 0;
  const hours = h + m / 60;
  const note = document.getElementById('reg-note').value.trim();
  if (!date || hours <= 0) {
    if (!date) document.getElementById('reg-date').classList.add('input-error');
    if (hours <= 0) {
      document.getElementById('reg-hours').classList.add('input-error');
      document.getElementById('reg-minutes').classList.add('input-error');
    }
    showToast('Preencha a data e o tempo');
    return;
  }
  const entry = { id: Date.now(), date, hours, activities: [...selected], note };
  addEntry(entry);
  showToast('Momento salvo com sucesso');
  initRegister();
}

// ═══════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════
let curFilter = 'all';

function filterHistory(f, el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  curFilter = f;
  renderHistory(f);
}

function renderHistory(filter) {
  let data = entries();
  const now = new Date();
  if (filter === 'week') { const wa = new Date(now); wa.setDate(wa.getDate()-7); data = data.filter(e => new Date(e.date+'T12:00:00') >= wa); }
  else if (filter === 'month') { data = data.filter(e => { const d = new Date(e.date+'T12:00:00'); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); }); }
  data.sort((a,b) => b.date.localeCompare(a.date));

  const hl = document.getElementById('history-list');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  if (!data.length) {
    hl.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="book-open" style="width:38px;height:38px"></i></div><h3>Nenhum momento encontrado</h3><p>Registre momentos para vê-los aqui</p></div>`;
    lucide.createIcons();
    return;
  }

  hl.innerHTML = data.map(e => {
    const d = new Date(e.date+'T12:00:00');
    return `<div class="history-card">
      <div class="history-date-badge"><div class="day">${d.getDate()}</div><div class="month">${months[d.getMonth()]}</div></div>
      <div class="history-content">
        <div class="history-hours">${formatTime(e.hours)} <span>juntos</span></div>
        <div class="history-tags">${(e.activities||[]).map(a=>`<span class="history-tag">${a}</span>`).join('')}</div>
        ${e.note ? `<div class="history-note">"${e.note}"</div>` : ''}
      </div>
      <div class="history-actions">
        <button class="btn-edit" onclick="editEntry(${e.id})"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
        <button class="btn-delete" onclick="delEntry(${e.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

function delEntry(id) {
  showConfirm('Deseja remover este momento?', () => {
    removeEntry(id);
    showToast('Registro removido');
  });
}

// ═══════════════════════════════════════
// EDIT
// ═══════════════════════════════════════
let editingId = null;
let selectedEdit = [];

function editEntry(id) {
  const entry = entries().find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  selectedEdit = [...(entry.activities || [])];
  const totalMin = Math.round(entry.hours * 60);
  document.getElementById('edit-date').value = entry.date;
  document.getElementById('edit-hours').value = Math.floor(totalMin / 60);
  document.getElementById('edit-minutes').value = totalMin % 60;
  document.getElementById('edit-note').value = entry.note || '';
  document.getElementById('edit-custom-activity').value = '';
  renderEditTags();
  document.getElementById('modal-overlay').classList.add('show');
  lucide.createIcons();
}

function renderEditTags() {
  document.getElementById('edit-preset-tags').innerHTML = allTags().map(t => {
    const ic = tagIcon(t);
    const sel = selectedEdit.includes(t) ? 'selected' : '';
    return `<span class="tag ${sel}" onclick="toggleEdit(this,'${t.replace(/'/g,"\\'")}')" ><span class="tag-icon"><i data-lucide="${ic}" style="width:13px;height:13px"></i></span>${t}</span>`;
  }).join('');
  lucide.createIcons();
}

function toggleEdit(el, tag) {
  if (selectedEdit.includes(tag)) { selectedEdit = selectedEdit.filter(t => t !== tag); el.classList.remove('selected'); }
  else { selectedEdit.push(tag); el.classList.add('selected'); }
}

function addEditCustomTag() {
  const v = document.getElementById('edit-custom-activity').value.trim();
  if (!v) return;
  if (!selectedEdit.includes(v)) selectedEdit.push(v);
  document.getElementById('edit-custom-activity').value = '';
  renderEditTags();
}

function saveEdit() {
  const date = document.getElementById('edit-date').value;
  const h = parseInt(document.getElementById('edit-hours').value) || 0;
  const m = parseInt(document.getElementById('edit-minutes').value) || 0;
  const hours = h + m / 60;
  const note = document.getElementById('edit-note').value.trim();
  if (!date || hours <= 0) { showToast('Preencha a data e o tempo'); return; }
  const original = entries().find(e => e.id === editingId);
  updateEntry({ ...original, date, hours, activities: [...selectedEdit], note });
  closeModal();
  showToast('Momento atualizado');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  editingId = null;
  selectedEdit = [];
}

// ═══════════════════════════════════════
// CONFIRM MODAL
// ═══════════════════════════════════════
let pendingConfirmCallback = null;

function showConfirm(message, callback) {
  pendingConfirmCallback = callback;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-overlay').classList.add('show');
  lucide.createIcons();
}

function doConfirm() {
  document.getElementById('confirm-overlay').classList.remove('show');
  if (pendingConfirmCallback) { pendingConfirmCallback(); pendingConfirmCallback = null; }
}

function cancelConfirm() {
  document.getElementById('confirm-overlay').classList.remove('show');
  pendingConfirmCallback = null;
}

// ═══════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════
let ch1, ch2, ch3;

function destroyCharts() { [ch1,ch2,ch3].forEach(c => { if(c) c.destroy(); }); ch1=ch2=ch3=null; }

function renderReports() {
  const data = entries();
  const els = { t: 'rpt-total-h', a: 'rpt-avg-h', b: 'rpt-best-day', s: 'rpt-streak' };

  if (!data.length) {
    document.getElementById(els.t).textContent = '0h';
    document.getElementById(els.a).textContent = '0h';
    document.getElementById(els.b).textContent = '---';
    document.getElementById(els.s).textContent = '0';
    destroyCharts(); return;
  }

  const totalH = data.reduce((s,e)=>s+e.hours,0);
  const dow = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const best = data.reduce((m,e)=>e.hours>m.hours?e:m);

  const last7Date = new Date(); last7Date.setDate(last7Date.getDate() - 7);
  const last7H = data.filter(e => new Date(e.date + 'T12:00:00') >= last7Date).reduce((s, e) => s + e.hours, 0);

  document.getElementById(els.t).textContent = formatTime(totalH);
  document.getElementById(els.a).textContent = formatTime(last7H / 7);
  document.getElementById(els.b).textContent = dow[new Date(best.date+'T12:00:00').getDay()];

  // Streak
  const dates = [...new Set(data.map(e=>e.date))].sort().reverse();
  let streak = 0, chk = new Date(new Date().toISOString().split('T')[0]+'T12:00:00');
  for (const dt of dates) {
    if (dt === chk.toISOString().split('T')[0]) { streak++; chk.setDate(chk.getDate()-1); }
    else if (dt < chk.toISOString().split('T')[0]) break;
  }
  document.getElementById(els.s).textContent = streak;

  destroyCharts();
  const pk = a => `rgba(239,80,135,${a})`;
  const font = { family: 'Figtree' };

  // Daily line
  const last30 = [];
  for (let i=29;i>=0;i--) { const d=new Date();d.setDate(d.getDate()-i); const k=d.toISOString().split('T')[0]; last30.push({l:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),h:data.filter(e=>e.date===k).reduce((s,e)=>s+e.hours,0)}); }

  ch1 = new Chart(document.getElementById('chart-daily'), {
    type:'line',
    data:{labels:last30.map(d=>d.l),datasets:[{data:last30.map(d=>d.h),borderColor:'#ef5087',backgroundColor:pk(0.06),borderWidth:2.5,fill:true,tension:0.4,pointBackgroundColor:'#ef5087',pointBorderColor:'#fff',pointBorderWidth:2,pointRadius:3,pointHoverRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#3d2233',titleFont:font,bodyFont:font,padding:12,cornerRadius:10,callbacks:{label:c=>formatTime(c.parsed.y)+' juntos'}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(242,218,226,0.4)'},ticks:{font:{...font,size:11},color:'#ad8999'}},x:{grid:{display:false},ticks:{font:{...font,size:10},color:'#ad8999',maxRotation:45}}}}
  });

  // Activities doughnut
  const ac={};
  data.forEach(e=>(e.activities||[]).forEach(a=>{ac[a]=(ac[a]||0)+1}));
  const top = Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const colors = ['#ef5087','#ff7a9c','#ffa0b8','#d63a6e','#ffc2d1','#a82d57'];

  ch2 = new Chart(document.getElementById('chart-activities'), {
    type:'doughnut',
    data:{labels:top.map(a=>a[0]),datasets:[{data:top.map(a=>a[1]),backgroundColor:colors,borderWidth:3,borderColor:'#fff',hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{font:{...font,size:11},color:'#7a5468',padding:10,usePointStyle:true,pointStyleWidth:10}},tooltip:{backgroundColor:'#3d2233',titleFont:font,bodyFont:font,padding:12,cornerRadius:10}}}
  });

  // Weekday bars — últimos 7 dias
  const last7bars = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.','');
    last7bars.push({ l: label, h: data.filter(e => e.date === k).reduce((s, e) => s + e.hours, 0) });
  }

  ch3 = new Chart(document.getElementById('chart-weekday'), {
    type:'bar',
    data:{labels:last7bars.map(d=>d.l),datasets:[{data:last7bars.map(d=>d.h),backgroundColor:pk(0.55),borderRadius:8,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#3d2233',titleFont:font,bodyFont:font,padding:12,cornerRadius:10,callbacks:{label:c=>formatTime(c.parsed.y)+' juntos'}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(242,218,226,0.4)'},ticks:{font:{...font,size:11},color:'#ad8999'}},x:{grid:{display:false},ticks:{font:{...font,size:12,weight:500},color:'#7a5468'}}}}
  });
}

// ═══════════════════════════════════════
// ÁLBUM
// ═══════════════════════════════════════
let albumFilter = 'all';
let pendingPhotoSrc = null;

function initAlbum() {
  closeAlbumForm();
  albumFilter = 'all';
  document.querySelectorAll('#page-album .filter-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
  renderAlbum('all');
}

function openAlbumForm() {
  document.getElementById('album-form-card').style.display = 'block';
  document.getElementById('btn-add-photo').style.display = 'none';
  document.getElementById('album-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('album-caption').value = '';
  document.getElementById('album-desc').value = '';
  removePreview(null);
  lucide.createIcons();
}

function closeAlbumForm() {
  document.getElementById('album-form-card').style.display = 'none';
  document.getElementById('btn-add-photo').style.display = '';
  pendingPhotoSrc = null;
}

function handleUploadClick() {
  document.getElementById('photo-input').click();
}

function handlePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 800, src => {
    pendingPhotoSrc = src;
    document.getElementById('preview-img').src = src;
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
  });
}

function removePreview(e) {
  if (e) e.stopPropagation();
  pendingPhotoSrc = null;
  document.getElementById('preview-img').src = '';
  document.getElementById('upload-placeholder').style.display = '';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('photo-input').value = '';
}

function resizeImage(file, maxWidth, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function savePhoto() {
  if (!pendingPhotoSrc) { showToast('Selecione uma foto'); return; }
  const date    = document.getElementById('album-date').value;
  const caption = document.getElementById('album-caption').value.trim();
  const desc    = document.getElementById('album-desc').value.trim();
  if (!date) { showToast('Informe a data da foto'); return; }
  const photo = { id: Date.now(), date, caption, desc, src: pendingPhotoSrc };
  addPhotoToAlbum(photo);
  closeAlbumForm();
  showToast('Foto salva no álbum');
}

function filterAlbum(f, el) {
  document.querySelectorAll('#page-album .filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  albumFilter = f;
  renderAlbum(f);
}

function renderAlbum(filter) {
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  let data = albumEntries();
  const now = new Date();

  if (filter === 'month') {
    data = data.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  } else if (filter === 'year') {
    data = data.filter(e => new Date(e.date + 'T12:00:00').getFullYear() === now.getFullYear());
  }
  data.sort((a, b) => b.date.localeCompare(a.date));

  const count = document.getElementById('album-count');
  count.textContent = data.length === 1 ? '1 memória guardada' : `${data.length} memórias guardadas`;

  const grid = document.getElementById('album-grid');
  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><i data-lucide="camera" style="width:38px;height:38px"></i></div><h3>Nenhuma foto ainda</h3><p>Adicione fotos dos momentos especiais de vocês</p></div>`;
    lucide.createIcons();
    return;
  }

  grid.innerHTML = data.map(e => {
    const d = new Date(e.date + 'T12:00:00');
    const dateStr = `${d.getDate()} de ${months[d.getMonth()]}, ${d.getFullYear()}`;
    return `<div class="photo-card">
      <img class="photo-card-img" src="${e.src}" alt="${e.caption || ''}" onclick="openLightbox(${e.id})">
      <button class="photo-delete-btn" onclick="deletePhoto(${e.id})"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
      <div class="photo-card-body">
        ${e.caption ? `<div class="photo-card-caption">${e.caption}</div>` : ''}
        <div class="photo-card-date">${dateStr}</div>
        ${e.desc ? `<div class="photo-card-desc">"${e.desc}"</div>` : ''}
      </div>
    </div>`;
  }).join('');
  lucide.createIcons();
}

function deletePhoto(id) {
  showConfirm('Deseja remover esta foto do álbum?', () => {
    removePhotoFromAlbum(id);
    showToast('Foto removida');
  });
}

function openLightbox(id) {
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const entry = albumEntries().find(e => e.id === id);
  if (!entry) return;
  const d = new Date(entry.date + 'T12:00:00');
  document.getElementById('lightbox-img').src = entry.src;
  document.getElementById('lightbox-caption').textContent = entry.caption || '';
  document.getElementById('lightbox-date').textContent = `${d.getDate()} de ${months[d.getMonth()]}, ${d.getFullYear()}`;
  document.getElementById('lightbox-overlay').classList.add('show');
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('show');
  document.getElementById('lightbox-img').src = '';
}

// ═══════════════════════════════════════
// LINHA DO TEMPO
// ═══════════════════════════════════════
let pendingMilestoneSrc = null;
let editingMilestoneId  = null;
let editingMilestoneSrc = null;

function milestones() { return _cache.timeline || []; }

function addMilestone(m) {
  _REF.timeline.child(String(m.id)).set(m)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}
function removeMilestone(id) {
  _REF.timeline.child(String(id)).remove()
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}
function updateMilestone(m) {
  _REF.timeline.child(String(m.id)).set(m)
    .catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function initTimeline() {
  closeMilestoneForm();
  editingMilestoneId = null;
  editingMilestoneSrc = null;
  renderTimeline();
}

function openMilestoneForm() {
  document.getElementById('milestone-form-card').style.display = 'block';
  document.getElementById('btn-add-milestone').style.display = 'none';
  document.getElementById('ms-date').value = '';
  document.getElementById('ms-title').value = '';
  document.getElementById('ms-desc').value = '';
  pendingMilestoneSrc = null;
  document.getElementById('ms-upload-placeholder').style.display = '';
  document.getElementById('ms-upload-preview').style.display = 'none';
  document.getElementById('ms-preview-img').src = '';
  document.getElementById('ms-photo-input').value = '';
  lucide.createIcons();
}

function closeMilestoneForm() {
  const fc = document.getElementById('milestone-form-card');
  const btn = document.getElementById('btn-add-milestone');
  if (fc) fc.style.display = 'none';
  if (btn) btn.style.display = '';
  pendingMilestoneSrc = null;
}

function handleMilestonePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 800, src => {
    pendingMilestoneSrc = src;
    document.getElementById('ms-preview-img').src = src;
    document.getElementById('ms-upload-placeholder').style.display = 'none';
    document.getElementById('ms-upload-preview').style.display = 'block';
  });
}

function removeMilestonePreview(e) {
  if (e) e.stopPropagation();
  pendingMilestoneSrc = null;
  document.getElementById('ms-preview-img').src = '';
  document.getElementById('ms-upload-placeholder').style.display = '';
  document.getElementById('ms-upload-preview').style.display = 'none';
  document.getElementById('ms-photo-input').value = '';
}

function saveMilestone() {
  const date  = document.getElementById('ms-date').value;
  const title = document.getElementById('ms-title').value.trim();
  const desc  = document.getElementById('ms-desc').value.trim();
  if (!date || !title) { showToast('Preencha a data e o título'); return; }
  addMilestone({ id: Date.now(), date, title, desc, photo: pendingMilestoneSrc || null });
  closeMilestoneForm();
  showToast('Marco salvo na linha do tempo');
}

function startEditMilestone(id) {
  editingMilestoneId = id;
  const m = milestones().find(x => x.id === id);
  editingMilestoneSrc = m ? (m.photo || null) : null;
  renderTimeline();
}

function cancelEditMilestone() {
  editingMilestoneId = null;
  editingMilestoneSrc = null;
  renderTimeline();
}

function handleEditMilestonePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 800, src => {
    editingMilestoneSrc = src;
    const prev = document.getElementById('ms-edit-preview-img');
    const ph   = document.getElementById('ms-edit-upload-placeholder');
    const pv   = document.getElementById('ms-edit-upload-preview');
    if (prev) prev.src = src;
    if (ph)   ph.style.display = 'none';
    if (pv)   pv.style.display = 'block';
  });
}

function removeEditMilestonePhoto(e) {
  if (e) e.stopPropagation();
  editingMilestoneSrc = null;
  const prev = document.getElementById('ms-edit-preview-img');
  const ph   = document.getElementById('ms-edit-upload-placeholder');
  const pv   = document.getElementById('ms-edit-upload-preview');
  if (prev) prev.src = '';
  if (ph)   ph.style.display = '';
  if (pv)   pv.style.display = 'none';
}

function saveEditMilestone() {
  const date  = document.getElementById('ms-edit-date').value;
  const title = document.getElementById('ms-edit-title').value.trim();
  const desc  = document.getElementById('ms-edit-desc').value.trim();
  if (!date || !title) { showToast('Preencha a data e o título'); return; }
  const original = milestones().find(x => x.id === editingMilestoneId);
  if (!original) return;
  updateMilestone({ ...original, date, title, desc, photo: editingMilestoneSrc });
  editingMilestoneId = null;
  editingMilestoneSrc = null;
  showToast('Marco atualizado');
}

function deleteMilestone(id) {
  showConfirm('Deseja remover este marco?', () => {
    removeMilestone(id);
    showToast('Marco removido');
  });
}

function openMilestonePhotoLightbox(id) {
  const m = milestones().find(x => x.id === id);
  if (!m || !m.photo) return;
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const d = new Date(m.date + 'T12:00:00');
  document.getElementById('lightbox-img').src = m.photo;
  document.getElementById('lightbox-caption').textContent = m.title || '';
  document.getElementById('lightbox-date').textContent = `${d.getDate()} de ${months[d.getMonth()]}, ${d.getFullYear()}`;
  document.getElementById('lightbox-overlay').classList.add('show');
}

function relativeTime(dateStr) {
  const diff   = Date.now() - new Date(dateStr + 'T12:00:00').getTime();
  const days   = Math.floor(diff / 86400000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  if (days < 30)  return `há ${days} dias`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? 'há 1 mês' : `há ${months} meses`;
  const years = Math.floor(months / 12);
  const rem   = months % 12;
  const y  = years  === 1 ? '1 ano'  : `${years} anos`;
  const m2 = rem    === 1 ? '1 mês'  : `${rem} meses`;
  return rem === 0 ? `há ${y}` : `há ${y} e ${m2}`;
}

function timeBetween(olderDate, newerDate) {
  const diff  = new Date(newerDate + 'T12:00:00') - new Date(olderDate + 'T12:00:00');
  const days  = Math.floor(diff / 86400000);
  if (days === 0) return 'no mesmo dia';
  if (days === 1) return '1 dia depois';
  if (days < 30)  return `${days} dias depois`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? '1 mês depois' : `${months} meses depois`;
  const years = Math.floor(months / 12);
  const rem   = months % 12;
  const y  = years === 1 ? '1 ano'  : `${years} anos`;
  const m2 = rem   === 1 ? '1 mês'  : `${rem} meses`;
  return rem === 0 ? `${y} depois` : `${y} e ${m2} depois`;
}

function renderTimeline() {
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const data = [...milestones()].sort((a, b) => b.date.localeCompare(a.date));

  const countEl = document.getElementById('milestone-count');
  if (countEl) countEl.textContent = data.length === 0 ? '' : data.length === 1 ? '1 marco na história de vocês' : `${data.length} marcos na história de vocês`;

  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (!data.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="heart" style="width:38px;height:38px"></i></div><h3>A história de vocês começa aqui</h3><p>Adicione os marcos mais importantes do relacionamento de vocês</p></div>`;
    lucide.createIcons();
    return;
  }

  let html = '<div class="tl-wrap"><div class="tl-vline"></div>';

  data.forEach((m, idx) => {
    const side     = idx % 2 === 0 ? 'tl-left' : 'tl-right';
    const isNewest = idx === 0;
    const isOldest = idx === data.length - 1;
    const dotCls   = isNewest ? 'tl-dot tl-dot-pulse' : isOldest ? 'tl-dot tl-dot-first' : 'tl-dot';
    const d        = new Date(m.date + 'T12:00:00');
    const dateStr  = `${d.getDate()} de ${months[d.getMonth()]}, ${d.getFullYear()}`;
    const isEditing = editingMilestoneId === m.id;

    let cardHtml;
    if (isEditing) {
      cardHtml = `<div class="milestone-card milestone-card-edit">
        <div class="form-grid">
          <div>
            <label><span class="label-icon"><i data-lucide="calendar" style="width:13px;height:13px"></i></span> Data</label>
            <input type="date" id="ms-edit-date" value="${m.date}">
          </div>
          <div>
            <label><span class="label-icon"><i data-lucide="type" style="width:13px;height:13px"></i></span> Título</label>
            <input type="text" id="ms-edit-title" value="${m.title.replace(/"/g,'&quot;')}" placeholder="Título do marco">
          </div>
          <div class="form-full">
            <label><span class="label-icon"><i data-lucide="file-text" style="width:13px;height:13px"></i></span> Descrição <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></label>
            <textarea id="ms-edit-desc" placeholder="Conte como foi esse momento...">${m.desc || ''}</textarea>
          </div>
          <div class="form-full">
            <label><span class="label-icon"><i data-lucide="camera" style="width:13px;height:13px"></i></span> Foto <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></label>
            <div class="upload-area ms-upload-area ms-upload-area-sm" onclick="document.getElementById('ms-edit-photo-input').click()">
              <input type="file" id="ms-edit-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="handleEditMilestonePhoto(this)">
              <div class="upload-placeholder ms-upload-placeholder" id="ms-edit-upload-placeholder" ${editingMilestoneSrc ? 'style="display:none"' : ''}>
                <i data-lucide="camera" style="width:22px;height:22px;color:var(--rosa-300)"></i>
                <p>Clique para ${m.photo ? 'alterar' : 'adicionar'} foto</p>
              </div>
              <div class="upload-preview" id="ms-edit-upload-preview" ${editingMilestoneSrc ? '' : 'style="display:none"'}>
                <img id="ms-edit-preview-img" src="${editingMilestoneSrc || ''}" alt="" style="max-height:200px">
                <button class="preview-remove" onclick="removeEditMilestonePhoto(event)"><i data-lucide="x" style="width:14px;height:14px"></i></button>
              </div>
            </div>
          </div>
        </div>
        <div class="form-actions" style="margin-top:20px">
          <button class="btn btn-primary btn-sm" onclick="saveEditMilestone()"><i data-lucide="check" style="width:14px;height:14px"></i> Salvar</button>
          <button class="btn btn-secondary btn-sm" onclick="cancelEditMilestone()">Cancelar</button>
        </div>
      </div>`;
    } else {
      cardHtml = `<div class="milestone-card">
        <div class="ms-card-actions">
          <button class="ms-btn-action" onclick="startEditMilestone(${m.id})"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
          <button class="ms-btn-action ms-btn-delete" onclick="deleteMilestone(${m.id})"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>
        </div>
        <div class="ms-date">${dateStr}</div>
        <div class="ms-title">${m.title}</div>
        ${m.desc ? `<div class="ms-desc">"${m.desc}"</div>` : ''}
        ${m.photo ? `<img class="ms-photo" src="${m.photo}" alt="" onclick="openMilestonePhotoLightbox(${m.id})">` : ''}
        <div class="ms-relative-time">${relativeTime(m.date)}</div>
      </div>`;
    }

    html += `<div class="tl-item ${side}">
      <div class="tl-center"><div class="${dotCls}"></div></div>
      <div class="tl-card-wrap">${cardHtml}</div>
    </div>`;

    if (idx < data.length - 1) {
      html += `<div class="tl-between"><span>${timeBetween(data[idx + 1].date, m.date)}</span></div>`;
    }
  });

  html += '</div>';
  container.innerHTML = html;
  lucide.createIcons();
}

// ═══════════════════════════════════════
// ICON PICKER
// ═══════════════════════════════════════
const ICON_OPTIONS = [
  // Sentimentos & pessoas
  'heart','star','smile','laugh','baby','users','user','crown','gem',
  // Natureza & clima
  'sun','moon','cloud','snowflake','flame','leaf','flower-2','tree-pine','waves','mountain','sunset','rainbow','zap','umbrella',
  // Comida & bebida
  'coffee','pizza','cake','wine','utensils','cooking-pot','ice-cream','candy','popcorn','salad','beer',
  // Entretenimento
  'music','film','tv','gamepad-2','headphones','mic','camera','ticket','party-popper','clapperboard',
  // Atividades & esporte
  'dumbbell','bike','footprints','volleyball','compass','trophy','tent','map-pin','map','navigation',
  // Transporte
  'car','plane','train','ship','bus',
  // Casa & objetos
  'home','bed','sofa','gift','shopping-bag','shopping-cart','shirt',
  // Tecnologia & comunicação
  'phone','message-circle','mail','video','book-open',
  // Misc
  'sparkles','palette','paintbrush','feather','anchor','flag','rocket','alarm-clock','dog','cat',
];

let selectedNewIcon = 'sparkles';

function openIconPicker(e) {
  e.stopPropagation();
  const popup = document.getElementById('icon-picker-popup');
  const btn = document.getElementById('cfg-icon-btn');
  const isOpen = popup.classList.contains('show');
  popup.classList.toggle('show');
  btn.classList.toggle('active', !isOpen);
  if (!isOpen) {
    popup.innerHTML = `<div class="icon-picker-title">Escolha um ícone</div><div class="icon-grid">${
      ICON_OPTIONS.map(ic => `<div class="icon-option${ic === selectedNewIcon ? ' selected' : ''}" onclick="selectNewIcon('${ic}')"><i data-lucide="${ic}" style="width:18px;height:18px"></i></div>`).join('')
    }</div>`;
    lucide.createIcons();
  }
}

function selectNewIcon(icon) {
  selectedNewIcon = icon;
  document.getElementById('icon-picker-popup').classList.remove('show');
  document.getElementById('cfg-icon-btn').classList.remove('active');
  document.getElementById('cfg-icon-btn').innerHTML = `<i data-lucide="${icon}" style="width:16px;height:16px"></i>`;
  lucide.createIcons();
}

document.addEventListener('click', e => {
  if (!e.target.closest('#cfg-icon-btn') && !e.target.closest('#icon-picker-popup')) {
    document.getElementById('icon-picker-popup')?.classList.remove('show');
    document.getElementById('cfg-icon-btn')?.classList.remove('active');
  }
});

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════
function initConfig() {
  const c = config();
  document.getElementById('cfg-name1').value = c.name1 || 'Giulianna';
  document.getElementById('cfg-name2').value = c.name2 || 'Yago';
  document.getElementById('cfg-start-date').value = c.startDate || '';

  // Foto do casal
  const photo = c.couplePhoto;
  if (photo) {
    document.getElementById('cfg-photo-preview-img').src = photo;
    document.getElementById('cfg-photo-placeholder').style.display = 'none';
    document.getElementById('cfg-photo-preview').style.display = 'block';
    document.getElementById('cfg-remove-photo-btn').style.display = '';
  } else {
    document.getElementById('cfg-photo-preview').style.display = 'none';
    document.getElementById('cfg-photo-placeholder').style.display = 'flex';
    document.getElementById('cfg-remove-photo-btn').style.display = 'none';
  }

  renderGlobalTags();
  renderPhrasesList();
}

// ─── Foto do casal ───────────────────────────────
let _cfgPhotoPending = null;

function handleCouplePhotoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 400, src => {
    _cfgPhotoPending = src;
    document.getElementById('cfg-photo-preview-img').src = src;
    document.getElementById('cfg-photo-placeholder').style.display = 'none';
    document.getElementById('cfg-photo-preview').style.display = 'block';
  });
}

function clearCouplePhotoPreview(e) {
  e.stopPropagation();
  _cfgPhotoPending = null;
  document.getElementById('cfg-photo-input').value = '';
  document.getElementById('cfg-photo-preview').style.display = 'none';
  document.getElementById('cfg-photo-placeholder').style.display = 'flex';
}

function saveCouplePhoto() {
  const src = _cfgPhotoPending || _cache.config?.couplePhoto;
  if (!src) { showToast('Selecione uma foto primeiro'); return; }
  _REF.config.update({ couplePhoto: src }).catch(() => showToast('Erro ao sincronizar com a nuvem'));
  _cfgPhotoPending = null;
  showToast('Foto salva');
}

function removeCouplePhoto() {
  showConfirm('Remover a foto do casal?', () => {
    _REF.config.child('couplePhoto').remove().catch(() => showToast('Erro ao sincronizar com a nuvem'));
    document.getElementById('cfg-photo-preview').style.display = 'none';
    document.getElementById('cfg-photo-placeholder').style.display = 'flex';
    document.getElementById('cfg-remove-photo-btn').style.display = 'none';
    _cfgPhotoPending = null;
    showToast('Foto removida');
  });
}

// ─── Data do relacionamento ──────────────────────
function saveStartDate() {
  const date = document.getElementById('cfg-start-date').value;
  if (!date) { showToast('Selecione uma data'); return; }
  _REF.config.update({ startDate: date }).catch(() => showToast('Erro ao sincronizar com a nuvem'));
  showToast('Data salva');
}

// ─── Frases do casal ─────────────────────────────
function addCouplePhrase() {
  const v = document.getElementById('cfg-new-phrase').value.trim();
  if (!v) return;
  const id = Date.now();
  _REF.phrases.child(String(id)).set({ id, text: v }).catch(() => showToast('Erro ao sincronizar com a nuvem'));
  document.getElementById('cfg-new-phrase').value = '';
  showToast('Frase adicionada');
}

function removeCouplePhrase(id) {
  _REF.phrases.child(String(id)).remove().catch(() => showToast('Erro ao sincronizar com a nuvem'));
}

function renderPhrasesList() {
  const list = document.getElementById('cfg-phrases-list');
  if (!list) return;
  const phrases = _cache.phrases || [];
  if (!phrases.length) { list.innerHTML = ''; return; }
  list.innerHTML = phrases.map(p =>
    `<span class="removable-tag"><i data-lucide="quote" style="width:12px;height:12px"></i> ${p.text} <button onclick="removeCouplePhrase(${p.id})"><i data-lucide="x" style="width:11px;height:11px"></i></button></span>`
  ).join('');
  lucide.createIcons();
}

function saveConfig() {
  saveConf({ name1: document.getElementById('cfg-name1').value.trim(), name2: document.getElementById('cfg-name2').value.trim() });
  showToast('Nomes salvos');
}

function renderGlobalTags() {
  document.getElementById('global-tags-list').innerHTML = customTags().map((t, i) =>
    `<span class="removable-tag"><i data-lucide="${t.icon}" style="width:12px;height:12px"></i> ${t.name} <button onclick="removeTag(${i})"><i data-lucide="x" style="width:11px;height:11px"></i></button></span>`
  ).join('');
  lucide.createIcons();
}

function addGlobalTag() {
  const v = document.getElementById('cfg-new-tag').value.trim();
  if (!v) return;
  const t = customTags(); t.push({ name: v, icon: selectedNewIcon }); saveTags(t);
  document.getElementById('cfg-new-tag').value = '';
  selectedNewIcon = 'sparkles';
  document.getElementById('cfg-icon-btn').innerHTML = `<i data-lucide="sparkles" style="width:16px;height:16px"></i>`;
  lucide.createIcons();
  renderGlobalTags();
  showToast('Atividade adicionada');
}

function removeTag(i) {
  const t = customTags(); t.splice(i,1); saveTags(t);
  renderGlobalTags();
}

function clearAllData() {
  showConfirm('Tem certeza que deseja apagar TODOS os dados?', () => {
    _fdb.ref('yj').remove().catch(() => {});
    ['yj_entries','yj_config','yj_tags','yj_album'].forEach(k => localStorage.removeItem(k));
    showToast('Dados removidos');
    navigateTo('home');
  });
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupListeners();

  // Drag & drop no upload de fotos
  const uploadArea = document.getElementById('upload-area');
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && ['image/jpeg','image/png','image/webp'].includes(file.type)) {
      resizeImage(file, 800, src => {
        pendingPhotoSrc = src;
        document.getElementById('preview-img').src = src;
        document.getElementById('upload-placeholder').style.display = 'none';
        document.getElementById('upload-preview').style.display = 'block';
      });
    }
  });

  // Fechar modais com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); cancelConfirm(); }
  });
});
