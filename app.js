// v3.35 | 2026-07-05 KST | 수정: 데이터 백업(JSON) 파일명에서 한글 제거 — "전체"→"ALL", 날짜 표기도 "2025년1월5일"→"2025-01-05"로 바꿔서 다운로드/메일첨부 시 파일명 깨짐 방지 | cache:v239
'use strict';
const APP_VERSION = 'v3.35 (cache v239)';

// ============================================================
// 🔧 배포 설정 스위치
// church-finances 저장소: true / finances 저장소: false
// ============================================================
const USE_FIREBASE = true;



/* =========================================================
   비밀번호 / 입력 모드 제어
   ========================================================= */

// 비밀번호 가져오기 (Firebase or IndexedDB)
async function getAdminPasswordFromFirebase() {
  if (!USE_FIREBASE) {
    try {
      const rec = await DB.get('settings', 'adminPw');
      return rec ? rec.value : null;
    } catch(e) { return null; }
  }
  try { return await fbGet('churchData/adminPassword'); }
  catch(e) { return null; }
}

// 비밀번호 저장 (Firebase or IndexedDB)
async function saveAdminPasswordToFirebase(pw) {
  if (!USE_FIREBASE) {
    try {
      await DB.put('settings', { key: 'adminPw', value: pw });
      return true;
    } catch(e) { return false; }
  }
  try { await fbSet('churchData/adminPassword', pw); return true; }
  catch(e) { return false; }
}

function showPasswordPrompt(onSuccess, onCancel) {
  const existing = document.getElementById('pwOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pwOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:20px;padding:28px 24px;width:300px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,0.3);text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🔑</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:4px;">입력 모드 전환</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">비밀번호를 입력하세요</div>
      <input type="password" id="pwInput" placeholder="비밀번호"
        style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:12px;font-size:16px;text-align:center;margin-bottom:8px;box-sizing:border-box;">
      <div id="pwError" style="color:#e53e3e;font-size:12px;margin-bottom:12px;min-height:16px;"></div>
      <div style="display:flex;gap:8px;">
        <button id="pwCancel" style="flex:1;padding:12px;border-radius:12px;background:var(--surface-2);font-size:14px;font-weight:600;border:none;">취소</button>
        <button id="pwConfirm" style="flex:1;padding:12px;border-radius:12px;background:var(--primary);color:#fff;font-size:14px;font-weight:700;border:none;">확인</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#pwInput');
  const error = overlay.querySelector('#pwError');
  setTimeout(() => input.focus(), 100);

  const tryLogin = async () => {
    const pw = input.value;
    if (!pw) { error.textContent = '비밀번호를 입력해주세요'; return; }
    // Firebase에서 비밀번호 확인
    const saved = await getAdminPasswordFromFirebase();
    if (!saved) { error.textContent = '비밀번호가 설정되지 않았어요 (설정에서 등록)'; return; }
    if (pw.trim() === String(saved).trim()) {
      setIsAdmin(true);
      overlay.remove();
      applyLockState();
      onSuccess && onSuccess();
      showToast('🔓 입력 모드로 전환됐어요');
    } else {
      error.textContent = '비밀번호가 틀렸어요';
      input.value = '';
      input.focus();
    }
  };

  overlay.querySelector('#pwConfirm').addEventListener('click', tryLogin);
  overlay.querySelector('#pwCancel').addEventListener('click', () => { overlay.remove(); onCancel && onCancel(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
}

// + 버튼 등 입력 요소 잠금 (배너 없이)
function applyLockState() {
  const isAdmin = getIsAdmin();
  const fab = document.getElementById('fabAdd');
  const tab = State.tab;
  if (fab) {
    const hiddenTabs = ['settings','members','accounts'];
    fab.style.display = (!isAdmin || hiddenTabs.includes(tab)) ? 'none' : 'flex';
  }
}

/* =========================================================
   Firebase Realtime Database 동기화
   ========================================================= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB2zT9Wi_uecCfjSU90Up8geerZOskPCbs",
  authDomain: "juwon-church.firebaseapp.com",
  databaseURL: "https://juwon-church-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "juwon-church",
  storageBucket: "juwon-church.firebasestorage.app",
  messagingSenderId: "410693392195",
  appId: "1:410693392195:web:f62c07dfdfe4bdfd73c1f6"
};

// Firebase REST API 방식 (SDK 불필요 - fetch만 사용)
const FB_URL = 'https://juwon-church-default-rtdb.asia-southeast1.firebasedatabase.app';

async function fbGet(path) {
  const res = await fetch(`${FB_URL}/${path}.json`);
  if (!res.ok) throw new Error('FB GET failed: ' + res.status);
  return res.json();
}

async function fbSet(path, data) {
  const res = await fetch(`${FB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('FB SET failed: ' + res.status);
  return res.json();
}

// Firebase에 전체 데이터 저장
async function syncToFirebase() {
  if (!USE_FIREBASE) return false;
  try {
    const allTemplates = await DB.getAll('templates');
    const data = {
      syncedAt: new Date().toISOString(),
      categories: State.categories,
      persons: State.persons,
      subItems: State.subItems,
      subGroups: State.subGroups || [],
      linkedAccounts: State.linkedAccounts || [],
      transactions: State.transactions,
      templates: allTemplates || [],
    };
    await fbSet('churchData', data);
    console.log('Firebase sync OK');
    return true;
  } catch (e) {
    console.error('Firebase sync error:', e);
    return false;
  }
}

// Firebase에서 데이터 불러와서 로컬 DB 업데이트
async function syncFromFirebase() {
  if (!USE_FIREBASE) return false;
  try {
    // 먼저 syncedAt만 가져와서 비교 (전체 데이터 안 받음)
    const remoteSyncedAt = await fbGet('churchData/syncedAt');
    if (!remoteSyncedAt) return false;

    const localSyncRec = await DB.get('settings', 'firebaseSyncedAt');
    const localSyncedAt = localSyncRec ? localSyncRec.value : null;
    if (localSyncedAt && remoteSyncedAt <= localSyncedAt) {
      console.log('Firebase: 로컬이 최신');
      return false;
    }

    // 실제로 새 데이터가 있을 때만 전체 다운로드
    const data = await fbGet('churchData');
    if (!data || !data.transactions) return false;

    await restoreFromData(data);
    await DB.put('settings', { key: 'firebaseSyncedAt', value: data.syncedAt });
    showToast('☁️ 클라우드에서 최신 데이터를 불러왔어요');
    return true;
  } catch (e) {
    console.error('Firebase load error:', e);
    return false;
  }
}


/* =========================================================
   DB LAYER
   3단계 구조:
   - categories: 대분류 (헌금/이자/기타, 인건비/시설비 등). usePersonLevel 플래그 보유
   - persons: 대분류에 속한 인물(성도/직원 등). '하위항목' 사용 대분류에서만 의미 있음
   - subItems: 대분류에 속한 세부항목 (십일조/감사/주일, 전기료/수도료 등)
   - transactions: 거래 1건 = 날짜 + categoryId + (선택)personId + lines[{subItemId, amount}]
   ========================================================= */
const DB = (() => {
  const DB_NAME = 'budgetAppDB';
  const DB_VERSION = 6;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const _db = e.target.result;
        if (!_db.objectStoreNames.contains('transactions')) {
          const tx = _db.createObjectStore('transactions', { keyPath: 'id' });
          tx.createIndex('byDate', 'date');
          tx.createIndex('byCategory', 'categoryId');
          tx.createIndex('byType', 'type');
        }
        if (!_db.objectStoreNames.contains('categories')) {
          const cat = _db.createObjectStore('categories', { keyPath: 'id' });
          cat.createIndex('byType', 'type');
        }
        if (!_db.objectStoreNames.contains('persons')) {
          const p = _db.createObjectStore('persons', { keyPath: 'id' });
          p.createIndex('byCategory', 'categoryId');
        }
        if (!_db.objectStoreNames.contains('subItems')) {
          const s = _db.createObjectStore('subItems', { keyPath: 'id' });
          s.createIndex('byCategory', 'categoryId');
        }
        if (!_db.objectStoreNames.contains('settings')) {
          _db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!_db.objectStoreNames.contains('templates')) {
          _db.createObjectStore('templates', { keyPath: 'id' });
        }
        if (!_db.objectStoreNames.contains('subGroups')) {
          const sg = _db.createObjectStore('subGroups', { keyPath: 'id' });
          sg.createIndex('byCategory', 'categoryId');
        }
        if (!_db.objectStoreNames.contains('subGroups')) {
          const sg = _db.createObjectStore('subGroups', { keyPath: 'id' });
          sg.createIndex('byCategory', 'categoryId');
        }
        if (!_db.objectStoreNames.contains('linkedAccounts')) {
          _db.createObjectStore('linkedAccounts', { keyPath: 'id' });
        }
        // 방식 A: 연도별 항목(대분류/중분류/소분류) 스냅샷 — "예전엔 이런 항목이 있었어요" 조회용
        if (!_db.objectStoreNames.contains('categorySnapshots')) {
          _db.createObjectStore('categorySnapshots', { keyPath: 'year' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e);
    });
  }

  function tx(storeNames, mode = 'readonly') {
    return open().then(_db => _db.transaction(storeNames, mode));
  }

  async function getAll(store) {
    const t = await tx([store]);
    return new Promise((resolve, reject) => {
      const req = t.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async function get(store, key) {
    const t = await tx([store]);
    return new Promise((resolve, reject) => {
      const req = t.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async function put(store, value) {
    const t = await tx([store], 'readwrite');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(store).put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = (e) => reject(e);
    });
  }

  async function del(store, key) {
    const t = await tx([store], 'readwrite');
    return new Promise((resolve, reject) => {
      const req = t.objectStore(store).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  return { open, getAll, get, put, del };
})();

/* =========================================================
   DEFAULT CATEGORIES (대분류) + SUB ITEMS (세부항목)
   ========================================================= */
const DEFAULT_CATEGORIES = [
  // 수입 — 헌금은 인물별 대분류로 관리하므로 시드에 없음
  { type: 'income', name: '이자', icon: '🏦', color: '#0EA5E9', usePersonLevel: false,
    subItems: ['예금이자', '적금이자', '기타이자'] },
  { type: 'income', name: '기타', icon: '✨', color: '#84CC16', usePersonLevel: false,
    subItems: ['잡수입', '환급금', '후원금'] },
  // 지출
  { type: 'expense', name: '인건비', icon: '💼', color: '#3B82F6', usePersonLevel: false,
    subItems: ['사례비', '활동비', '교통비'], budget: 0 },
  { type: 'expense', name: '시설비', icon: '🏠', color: '#F08C3A', usePersonLevel: false,
    subItems: ['전기료', '수도료', '관리비', '수선비'], budget: 0 },
  { type: 'expense', name: '선교비', icon: '🌍', color: '#10B981', usePersonLevel: false,
    subItems: ['국내선교', '해외선교', '단기선교'], budget: 0 },
  { type: 'expense', name: '운영비', icon: '📦', color: '#9CA3AF', usePersonLevel: false,
    subItems: ['사무용품', '식사비', '차량유지', '기타'], budget: 0 },
  { type: 'expense', name: '예금', icon: '🏦', color: '#64748B', usePersonLevel: false,
    subItems: ['후대헌금', '건축헌금', '선교헌금'], budget: 0 },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* =========================================================
   연도별 예산 헬퍼
   - 예산 보유 객체(category / subGroup / subItem)는
     budgets: { [year:number]: amount } 형태로 연도별 예산을 저장.
   - 구버전 단일 budget 필드는 최초 로드시 budgets로 마이그레이션되어
     이후 화면에서는 getBudget()/setBudget()만 사용한다.
   ========================================================= */
function getBudget(obj, year) {
  if (!obj) return 0;
  const y = year != null ? year : new Date().getFullYear();
  if (obj.budgets && obj.budgets[y] != null) return obj.budgets[y];
  return 0;
}
function setBudget(obj, year, amount) {
  if (!obj) return;
  const y = year != null ? year : new Date().getFullYear();
  if (!obj.budgets) obj.budgets = {};
  obj.budgets[y] = amount;
  // 구버전 코드/디버깅 호환용으로 마지막 편집값을 budget 필드에도 동기화
  obj.budget = amount;
}
function migrateBudgetObj(obj) {
  if (!obj) return obj;
  if (!obj.budgets) {
    obj.budgets = {};
    if (obj.budget > 0) {
      // 마이그레이션: 연도 구분 없던 기존 예산값을 올해 예산으로 이전
      obj.budgets[new Date().getFullYear()] = obj.budget;
    }
  }
  return obj;
}
// 예산이 하나라도 설정된 모든 연도 + 올해 + 거래가 있는 연도 목록 (오름차순)
function allBudgetYears() {
  const years = new Set();
  years.add(new Date().getFullYear());
  [...State.categories, ...State.subGroups, ...State.subItems].forEach(o => {
    if (o.budgets) Object.keys(o.budgets).forEach(y => years.add(Number(y)));
  });
  State.transactions.forEach(t => { if (t.date) years.add(Number(t.date.slice(0,4))); });
  return [...years].sort((a,b) => a-b);
}

async function seedIfEmpty() {
  const cats = await DB.getAll('categories');
  if (cats.length === 0) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const def = DEFAULT_CATEGORIES[i];
      const catId = uid();
      const { subItems, ...catFields } = def;
      await DB.put('categories', { id: catId, order: i, ...catFields });
      for (let j = 0; j < subItems.length; j++) {
        await DB.put('subItems', { id: uid(), categoryId: catId, name: subItems[j], order: j });
      }
    }
  } else {
    // 마이그레이션: 기존 사용자에게 '예금' 지출 대분류가 없으면 추가
    const hasDeposit = cats.some(c => c.type === 'expense' && c.name === '예금');
    if (!hasDeposit) {
      const def = DEFAULT_CATEGORIES.find(d => d.name === '예금');
      const catId = uid();
      const { subItems, ...catFields } = def;
      await DB.put('categories', { id: catId, order: cats.length, ...catFields });
      for (let j = 0; j < subItems.length; j++) {
        await DB.put('subItems', { id: uid(), categoryId: catId, name: subItems[j], order: j });
      }
    }
  }
  const settings = await DB.get('settings', 'general');
  if (!settings) {
    await DB.put('settings', { key: 'general', monthStartDay: 1, currency: 'KRW' });
  }
  // 대표계정이 없으면 자동 생성
  const accounts = await DB.getAll('linkedAccounts');
  if (accounts.length === 0) {
    await DB.put('linkedAccounts', {
      id: uid(),
      name: '대표계정',
      isDefault: true,
      accountKind: 'normal',
      carryover: 0,
      order: 0,
    });
  }
}

/* =========================================================
   APP STATE
   ========================================================= */
// 관리자 권한 상태 - IndexedDB settings에 저장 (앱 재실행 후에도 유지)
function getIsAdmin() { return localStorage.getItem('churchAdmin') === '1'; }
function setIsAdmin(v) { 
  v ? localStorage.setItem('churchAdmin','1') : localStorage.removeItem('churchAdmin');
  // IndexedDB에도 동기화 (백업)
  if (typeof DB !== 'undefined') DB.put('settings', { key: 'adminLoggedIn', value: v ? '1' : '0' }).catch(()=>{});
}
async function restoreAdminState() {
  // localStorage 먼저 확인
  if (localStorage.getItem('churchAdmin') === '1') return;
  // IndexedDB에서 복원 (Firebase 호출 없음 - 빠름)
  try {
    const rec = await DB.get('settings', 'adminLoggedIn');
    if (rec && rec.value === '1') localStorage.setItem('churchAdmin', '1');
  } catch(e) {}
}

const State = {
  tab: 'home',
  homeView: 'calendar', // 'calendar' | 'daily' | 'monthly'
  cursorDate: new Date(), // 현재 보고 있는 월 기준
  categories: [],
  categorySnapshots: [], // 방식 A: 연도별 항목 스냅샷 (예전 항목 보기용)
  persons: [],
  subItems: [],
  subGroups: [],
  linkedAccounts: [],   // 연결계좌 목록 [{id, name, carryover, createdAt}]
  selectedAccountId: null, // 현재 선택된 연결계좌 id
  transactions: [],
  statsType: 'expense',
  statsView: 'stats',        // 'stats'(통계) | 'detail'(내용)
  statsPage: 'chart',        // 'chart'(차트) | 'table'(지출현황/헌금명세)
  // 통계 기간 모드
  statsPeriod: 'month',      // 'week' | 'month' | 'year' | 'custom'
  statsCustomStart: null,    // 'YYYY-MM-DD'
  statsCustomEnd: null,      // 'YYYY-MM-DD'
  statsWeekOffset: 0,        // 주간 모드에서 현재 주 기준 오프셋
  statsYearOffset: 0,        // 연간 모드에서 현재 연도 기준 오프셋
  editingTx: null, // 편집 중인 거래 (null이면 신규)
  // 거래 입력 폼 진행 상태
  formType: 'expense',
  formStep: 'pick', // 'pick'(중분류 선택) -> 'items'
  memberView: 'family', // 'donation' | 'family' | 'name'
  formCategoryId: null,
  formPersonId: null,
  formSubGroupId: null,
  formDate: null,
  formMemo: '',
  formAmounts: {}, // { subItemId: amountNumber }
  formAccountId: null, // 현재 거래 입력 시 선택된 계좌 id
  dayDetailDate: null, // 현재 열려있는 '일별 상세' 시트의 날짜 (null이면 닫힌 상태)
  catStatDetailId: null, // 현재 열려있는 '통계 항목 상세' 시트의 categoryId (null이면 닫힌 상태)
  subStatDetailKey: null, // 현재 열려있는 '내용 탭 집계 상세' 시트의 key (null이면 닫힌 상태)
  interestDetailKey: null, // 현재 열려있는 '이자 탭 계정 상세' 시트의 key (null이면 닫힌 상태)
  statsSortKey: 'amount',   // '내용' 탭 정렬 기준: 'label' | 'count' | 'amount'
  statsSortDir: 'desc',     // 'asc' | 'desc'
  budgetExpanded: {},       // { [catId]: true/false, [catId+'__'+groupName]: true/false }
  accountsSubTab: 'normal', // 'normal' | 'deposit'
  normalSortKey: 'name',    // 'name' | 'maturity'
  normalSortDir: 'asc',     // 'asc' | 'desc'
  depositSortKey: 'name',   // 'name' | 'maturity'
  depositSortDir: 'asc',    // 'asc' | 'desc'
  accountsYear: new Date().getFullYear(), // 'all' | 숫자연도 — 일반계정/정기계정 탭 연도 필터 (기본값: 당해연도)
  donationPrimaryKey: null, // 기부금영수증 발행: 주 신청인 key
  donationAddKeys: [],      // 기부금영수증 발행: 합산 대상 key 배열 (최대 5)
  donationYear: null,       // 기부금영수증 발행: 귀속연도 (null이면 당해연도-1로 기본 설정)
  donationIssueDate: null,  // 기부금영수증 발행: 발급일자 (null이면 오늘)
};

function fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(Math.round(n)).toLocaleString('ko-KR');
}

/* ---- 금액 입력칸 콤마 자동 포맷 ---- */
function rawDigits(str) {
  return (str || '').replace(/[^0-9]/g, '');
}
function formatDigitsWithComma(digits) {
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}
// input[type=text][inputmode=numeric]에 천단위 콤마 자동입력을 붙인다.
// onChange(numberValue)는 콤마 제거 후 숫자값이 바뀔 때마다 호출된다.
function attachMoneyInputFormatter(input, onChange, maxDigits) {
  input.addEventListener('input', () => {
    let digits = rawDigits(input.value).replace(/^0+(?=\d)/, '');
    if (maxDigits) digits = digits.slice(0, maxDigits);
    const formatted = formatDigitsWithComma(digits);
    const prevLen = input.value.length;
    input.value = formatted;
    const newLen = formatted.length;
    const diff = newLen - prevLen;
    try {
      const pos = Math.max(0, (input.selectionStart || newLen) + diff);
      input.setSelectionRange(pos, pos);
    } catch (e) { /* some input types don't support selection */ }
    if (onChange) onChange(digits === '' ? null : Number(digits));
  });
}

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isSameMonth(dateStr, d) {
  return dateStr.slice(0, 7) === ymKey(d);
}

function monthLabel(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function catById(id) {
  return State.categories.find(c => c.id === id);
}
function personById(id) {
  return State.persons.find(p => p.id === id);
}
function subItemById(id) {
  return State.subItems.find(s => s.id === id);
}

/* =========================================================
   방식 B (비정규화): 거래에 이름을 같이 저장해두고, 표시할 때는
   "그 거래가 저장될 당시의 이름"을 최우선으로 보여준다.
   → 나중에 카테고리 이름을 바꾸거나 삭제해도 과거 거래 기록은 그대로 유지됨.
   방식 A (연도 스냅샷)는 categorySnapshots 스토어에 별도 보관되며
   카테고리 관리 화면의 "예전 항목 보기"에서만 쓰인다 (아래 참고).
   ========================================================= */

// 거래 1건의 대분류 표시정보: 거래에 박혀있는 이름(방식 B) > 현재 카테고리 > 스냅샷(방식 A) > 기본값
function txCatInfo(t) {
  const cat = catById(t.categoryId);
  const snap = !t.categoryName && !cat ? findCatInSnapshots(t.categoryId) : null;
  return {
    id: t.categoryId,
    name: t.categoryName || cat?.name || snap?.name || '삭제된 항목',
    icon: t.categoryIcon || cat?.icon || snap?.icon || '📦',
    color: t.categoryColor || cat?.color || snap?.color || '#9CA3AF',
    type: cat?.type || t.type,
    usePersonLevel: cat ? !!cat.usePersonLevel : false,
  };
}

// 거래 1건의 중분류(=하위항목/인물 이름) 표시명: 거래에 박혀있는 이름 우선
function txSubGroupName(t) {
  if (t.subGroupName) return t.subGroupName;
  const sgId = t.subGroupId || t.personId;
  if (!sgId) return null;
  const sg = (State.subGroups || []).find(g => g.id === sgId);
  if (sg) return sg.name;
  const p = personById(sgId);
  return p ? p.name : null;
}

// 거래의 세부항목(라인) 1건 표시명: 라인에 박혀있는 이름 우선
function txLineName(l) {
  return l.subItemName || (subItemById(l.subItemId) || {}).name || '항목';
}

// 카테고리가 삭제된 경우, 연도 스냅샷들에서 마지막으로 기록된 정보를 찾는다 (방식 A 활용)
function findCatInSnapshots(catId) {
  if (!catId) return null;
  const snaps = State.categorySnapshots || []; // 최신 연도순 정렬되어 있음
  for (const snap of snaps) {
    const found = (snap.categories || []).find(c => c.id === catId);
    if (found) return found;
  }
  return null;
}

// 카테고리 단위(개별 거래가 아닌) 표시가 필요한 곳에서 쓰는 폴백: 현재 카테고리 > 스냅샷 > 기본값
function catFallbackInfo(catId, defaults) {
  const cat = catById(catId);
  if (cat) return cat;
  const snap = findCatInSnapshots(catId);
  return {
    id: catId,
    name: snap?.name || (defaults?.name ?? '삭제된 항목'),
    icon: snap?.icon || (defaults?.icon ?? '📦'),
    color: snap?.color || (defaults?.color ?? '#9CA3AF'),
    usePersonLevel: false,
    type: defaults?.type,
  };
}

/* ── 방식 A: 연도 스냅샷 저장/누적 ──
   그 해에 "존재했던 적이 있는" 모든 대분류/중분류/소분류를 계속 누적해서 보관한다.
   (이미 삭제된 항목이라도 한 번 스냅샷에 들어가면 계속 남아있음 — 합집합 방식) */
async function ensureYearSnapshot(year) {
  try {
    let existing = null;
    try { existing = await DB.get('categorySnapshots', year); } catch (e) { existing = null; }

    const mergeById = (prev, curr) => {
      const map = new Map((prev || []).map(x => [x.id, x]));
      (curr || []).forEach(x => map.set(x.id, {
        id: x.id, name: x.name, icon: x.icon, color: x.color,
        type: x.type, categoryId: x.categoryId, order: x.order
      }));
      return Array.from(map.values());
    };

    const snapshot = {
      year,
      categories: mergeById(existing?.categories, State.categories),
      subGroups: mergeById(existing?.subGroups, State.subGroups || []),
      subItems: mergeById(existing?.subItems, State.subItems || []),
      updatedAt: Date.now(),
    };
    await DB.put('categorySnapshots', snapshot);
    State.categorySnapshots = State.categorySnapshots || [];
    const idx = State.categorySnapshots.findIndex(s => s.year === year);
    if (idx >= 0) State.categorySnapshots[idx] = snapshot;
    else State.categorySnapshots.unshift(snapshot);
    State.categorySnapshots.sort((a,b) => b.year - a.year);
  } catch (e) {
    console.error('ensureYearSnapshot error:', e);
  }
}

function subItemsOfCategory(catId) {
  return State.subItems.filter(s => s.categoryId === catId).sort((a,b)=>a.name.localeCompare(b.name,'ko') || (a.order??0)-(b.order??0));
}
function subGroupsOfCategory(catId) {
  return (State.subGroups || [])
    .filter(g => g.categoryId === catId)
    .sort((a,b) => a.name.localeCompare(b.name, 'ko'));
}

function subItemsOfGroup(groupId) {
  return State.subItems
    .filter(s => s.subGroupId === groupId)
    .sort((a,b) => (a.order??0)-(b.order??0));
}

// 한 대분류(예: 헌금) 안의 모든 중분류(헌금자 이름)들이 공통으로 가져야 하는
// 소분류(헌금종류) 이름 목록. 어느 중분류에든 한 번이라도 등록된 이름이면 전체 후보가 됨.
// TX_ENTRY_ITEM_ORDER에 있는 이름은 그 순서를 우선하고, 나머지는 등장 순서대로 뒤에 붙인다.
function canonicalSubItemNamesForCategory(catId) {
  const groups = subGroupsOfCategory(catId);
  const seen = [];
  for (const g of groups) {
    for (const s of subItemsOfGroup(g.id)) {
      if (!seen.includes(s.name)) seen.push(s.name);
    }
  }
  const known = TX_ENTRY_ITEM_ORDER.filter(n => seen.includes(n));
  const rest = seen.filter(n => !TX_ENTRY_ITEM_ORDER.includes(n));
  return [...known, ...rest];
}

// 새 중분류(헌금자 이름)를 만들 때, 기존에 다른 중분류들이 갖고 있는
// 공통 소분류(헌금종류)들을 기본값으로 자동 생성해준다.
async function seedDefaultSubItemsForGroup(groupId, catId) {
  const names = canonicalSubItemNamesForCategory(catId);
  for (let i = 0; i < names.length; i++) {
    await DB.put('subItems', { id: uid(), categoryId: catId, subGroupId: groupId, name: names[i], order: i, budget: 0 });
  }
}

// 한 중분류에 새 소분류(헌금종류)를 추가했을 때, 같은 대분류의 다른 모든 중분류에도
// 같은 이름의 소분류가 없으면 자동으로 똑같이 만들어 전체에 적용한다.
async function propagateSubItemToSiblingGroups(catId, groupId, name) {
  const groups = subGroupsOfCategory(catId).filter(g => g.id !== groupId);
  for (const g of groups) {
    const existing = subItemsOfGroup(g.id);
    if (existing.find(s => s.name === name)) continue;
    await DB.put('subItems', { id: uid(), categoryId: catId, subGroupId: g.id, name, order: existing.length, budget: 0 });
  }
}

function personsOfCategory(catId, includeHidden = false) {
  return State.persons
    .filter(p => p.categoryId === catId && (includeHidden || !p.hidden))
    .sort((a,b)=>a.name.localeCompare(b.name,'ko') || (a.order??0)-(b.order??0));
}

// 거래입력 화면(세부항목별 금액 입력)에서만 쓰는 표시 순서.
// 목록에 없는 항목(다른 대분류 세부항목 등)은 뒤에 가나다순으로 붙는다.
const TX_ENTRY_ITEM_ORDER = ['주일헌금','십 일 조','감사헌금','선교헌금','건축헌금','후대헌금','맥추감사','부활주일','성탄감사','신년감사','추수감사','총회주일','헌신예배'];
function sortItemsForEntry(items) {
  return items.slice().sort((a, b) => {
    const ia = TX_ENTRY_ITEM_ORDER.indexOf(a.name);
    const ib = TX_ENTRY_ITEM_ORDER.indexOf(b.name);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/* =========================================================
   MIGRATION: persons → subGroups (v1.69)
   헌금 대분류의 usePersonLevel persons 데이터를
   subGroups로 전환하고 transactions.personId → subGroupId로 교체.
   이미 마이그레이션된 경우 멱등성(idempotent) 보장.
   ========================================================= */
async function migratePersonsToSubGroups() {
  const cats = await DB.getAll('categories');
  const personLevelCats = cats.filter(c => c.usePersonLevel);
  if (personLevelCats.length === 0) return; // 이미 완료 또는 해당 없음

  const allPersons   = await DB.getAll('persons');
  const allSubGroups = await DB.getAll('subGroups');
  const allTxs       = await DB.getAll('transactions');

  for (const cat of personLevelCats) {
    const catPersons = allPersons.filter(p => p.categoryId === cat.id);
    if (catPersons.length === 0) {
      // persons 없으면 그냥 플래그만 내림
      cat.usePersonLevel = false;
      await DB.put('categories', cat);
      continue;
    }

    // persons → subGroups 변환
    // 이미 같은 이름의 subGroup이 있으면 재사용
    const personIdToGroupId = {};
    for (const p of catPersons) {
      let existing = allSubGroups.find(g => g.categoryId === cat.id && g.name === p.name);
      if (!existing) {
        const newGroup = { id: uid(), categoryId: cat.id, name: p.name, order: p.order ?? 0 };
        await DB.put('subGroups', newGroup);
        existing = newGroup;
        allSubGroups.push(newGroup); // 로컬 캐시에도 추가
      }
      personIdToGroupId[p.id] = existing.id;
    }

    // transactions.personId → subGroupId 교체
    for (const t of allTxs) {
      if (t.categoryId === cat.id && t.personId) {
        const newGroupId = personIdToGroupId[t.personId];
        if (newGroupId) {
          t.subGroupId = newGroupId;
          delete t.personId;
          await DB.put('transactions', t);
        }
      }
    }

    // 대분류 플래그 내리기
    cat.usePersonLevel = false;
    await DB.put('categories', cat);

    // persons 레코드 삭제 (헌금 카테고리 것만)
    for (const p of catPersons) {
      await DB.del('persons', p.id);
    }
  }
}


/* =========================================================
   MIGRATION: subItems.subGroupId → subGroups 스토어 복구
   subItems에 subGroupId가 있지만 subGroups 스토어에 해당
   레코드가 없는 경우 자동 복구. (멱등성 보장)
   ========================================================= */
async function migrateSubGroupsFromSubItems() {
  const [allCats, allSubItems, allSubGroups] = await Promise.all([
    DB.getAll('categories'), DB.getAll('subItems'), DB.getAll('subGroups')
  ]);
  const existingIds = new Set(allSubGroups.map(g => g.id));
  let count = 0;

  // ① subGroupId가 있지만 subGroups 스토어에 레코드가 없는 경우 → 복구
  const sgMap = new Map();
  for (const s of allSubItems) {
    if (s.subGroupId && !existingIds.has(s.subGroupId) && !sgMap.has(s.subGroupId)) {
      sgMap.set(s.subGroupId, { id: s.subGroupId, categoryId: s.categoryId, name: s.name, order: s.order ?? 0 });
    }
  }
  for (const g of sgMap.values()) {
    await DB.put('subGroups', g);
    existingIds.add(g.id);
    count++;
  }

  // ② subGroupId가 아예 없는 subItem → 대분류 이름으로 중분류 생성 후 연결
  //    단, 이미 subGroups가 있는 카테고리(예: 헌금)는 공통 소분류이므로 건너뜀
  const catGroupMap = new Map(); // categoryId → 새로 만든 groupId
  const catsWithGroups = new Set(allSubGroups.map(g => g.categoryId));
  for (const s of allSubItems) {
    if (s.subGroupId) continue; // 이미 중분류 있음
    const cat = allCats.find(c => c.id === s.categoryId);
    if (!cat) continue;
    // 이미 subGroups가 있는 카테고리(예: 헌금)의 소분류는 공통 소분류 — 건드리지 않음
    if (catsWithGroups.has(cat.id)) continue;

    // 새 중분류 생성 (subGroups가 전혀 없는 카테고리만 해당)
    if (!catGroupMap.has(cat.id)) {
      const groupId = uid();
      await DB.put('subGroups', { id: groupId, categoryId: cat.id, name: cat.name, order: 0 });
      catGroupMap.set(cat.id, groupId);
      count++;
    }
    s.subGroupId = catGroupMap.get(cat.id);
    await DB.put('subItems', s);
  }

  if (count > 0) console.log(`[migration] subGroups 처리: ${count}개`);
}

async function reloadData() {
  const [cats, persons, subItems, subGroups, txs, linkedAccounts, catSnapshots] = await Promise.all([
    DB.getAll('categories'), DB.getAll('persons'), DB.getAll('subItems'),
    DB.getAll('subGroups'), DB.getAll('transactions'), DB.getAll('linkedAccounts'),
    DB.getAll('categorySnapshots')
  ]);
  cats.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  cats.forEach(migrateBudgetObj);
  (subItems || []).forEach(migrateBudgetObj);
  (subGroups || []).forEach(migrateBudgetObj);
  State.categories = cats;
  State.persons = persons;
  State.subItems = subItems;
  State.subGroups = subGroups || [];
  State.linkedAccounts = (linkedAccounts || []).sort((a,b) => a.createdAt - b.createdAt);
  State.transactions = txs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  State.categorySnapshots = (catSnapshots || []).sort((a,b) => b.year - a.year);
}

/* ---- 연도별 전년이월 금액 ---- */
function openAppTitleSheet(current, onSave) {
  // 임시 시트를 동적으로 생성
  let sheet = document.getElementById('appTitleSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'appTitleSheet';
    sheet.className = 'sheet';
    document.getElementById('app').appendChild(sheet);
  }
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>앱 이름 변경</h3>
      <button id="atClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="formrow">
        <label>앱 이름</label>
        <input type="text" id="atInput" class="dateinput"
          value="${escapeHTML(current)}" maxlength="30" placeholder="이름을 입력하세요. 예:oo교회"
          style="font-size:16px; padding:12px 14px;">
      </div>
      <button class="btn-primary" id="atSave">저장</button>
    </div>
  `;
  openSheet('appTitleSheet');
  setTimeout(() => sheet.querySelector('#atInput').focus(), 300);

  sheet.querySelector('#atClose').addEventListener('click', closeAllSheets);
  sheet.querySelector('#atSave').addEventListener('click', async () => {
    const val = sheet.querySelector('#atInput').value.trim() || '교회 회계부';
    await setAppTitle(val);
    closeAllSheets();
    onSave(val);
  });
}

async function getAppTitle() {
  const rec = await DB.get('settings', 'appTitle');
  return rec ? rec.value : '';
}
async function setAppTitle(value) {
  await DB.put('settings', { key: 'appTitle', value });
}

async function getYearCarryover(year) {
  const rec = await DB.get('settings', `yearCarryover:${year}`);
  return rec ? rec.amount : null; // null이면 아직 입력되지 않음
}
async function setYearCarryover(year, amount) {
  await DB.put('settings', { key: `yearCarryover:${year}`, amount: Number(amount) || 0 });
}

/* ---------------------------------------------------------
   서브계좌 ↔ 재정계정(대표계정) 간 이체 자동 반영 (가상 거래)
   -----------------------------------------------------------
   서브계좌끼리(예: 건축계정→정기건축2)의 이체는 거래 1건만 입력해도
   calcAcctTotals()/renderAcctDetail()가 예금(지출)·통장이동(수입)
   카테고리의 소분류명(=상대 계좌명)을 읽어 양쪽 계좌에 자동 반영해준다.
   그런데 대표계정(재정계정)은 이 매칭 대상(nonDefaultAccts)에서 제외되어
   있어서, 서브계좌 쪽에서만 기록된 이체가 재정계정 장부/통계에는 전혀
   반영되지 않는 비대칭이 있었다. 아래 함수는 그 누락된 반대쪽을
   "가상 거래(synthetic tx)"로 만들어 mainAcctTxs()에 병합해준다.
   - 원본 거래는 State.transactions에 그대로 두고 건드리지 않는다
     (서브계좌 쪽 집계는 기존 로직 그대로 정상 동작).
   - 가상 거래는 mainAcctTxs()를 사용하는 화면(총자산, 홈 요약, 통계
     [리스트] 탭, 재정계정 관련 엑셀 등)에서만 보이며, State.transactions
     자체에는 저장되지 않으므로 서브계좌 집계가 이중으로 잡히지 않는다.
   --------------------------------------------------------- */
function mainAcctSyntheticTxs() {
  const defAcct = (State.linkedAccounts || []).find(a => a.isDefault);
  if (!defAcct) return [];
  const tongCat = State.categories.find(c => c.name === '통장이동' && c.type === 'income'); // 계정→재정 반환
  const expCat  = State.categories.find(c => c.name === '예금'   && c.type === 'expense');  // 재정→계정 이체

  const result = [];
  for (const t of (State.transactions || [])) {
    // 재정계정 자체 거래(accountId 없음/대표계정)는 mainAcctTxs()가 이미 직접 포함하므로 제외
    if (!t.accountId || t.accountId === defAcct.id) continue;
    const srcAcct = (State.linkedAccounts || []).find(a => a.id === t.accountId);
    if (!srcAcct || srcAcct.isDefault) continue;

    const isDeposit = expCat  && t.categoryId === expCat.id  && t.type === 'expense'; // 서브계좌→ 상대계좌 지출
    const isReturn  = tongCat && t.categoryId === tongCat.id && t.type === 'income';  // 서브계좌→ 상대계좌로부터 수입
    if (!isDeposit && !isReturn) continue;

    (t.lines || []).forEach((line, i) => {
      const si = line.subItemId ? subItemById(line.subItemId) : null;
      const lineName = line.subItemName || (si ? si.name : null);
      if (lineName !== defAcct.name) return; // 이 라인의 상대방이 재정계정일 때만 처리

      if (isDeposit) {
        // 서브계좌 입장: 재정계정으로 지출 → 재정계정 입장: 수입(통장이동, 계정→재정 반환)
        result.push({
          id: `syn_${t.id}_${i}`,
          type: 'income',
          amount: line.amount,
          date: t.date,
          categoryId: tongCat ? tongCat.id : t.categoryId,
          subGroupId: t.subGroupId,
          memo: t.memo || '',
          accountId: null,
          createdAt: t.createdAt,
          isSynthetic: true,
          sourceTxId: t.id,
          sourceAccountId: t.accountId,
          lines: [{ subItemId: line.subItemId, amount: line.amount, subItemName: srcAcct.name }],
        });
      } else {
        // 서브계좌 입장: 재정계정으로부터 수입(반환) → 재정계정 입장: 지출(예금)
        result.push({
          id: `syn_${t.id}_${i}`,
          type: 'expense',
          amount: line.amount,
          date: t.date,
          categoryId: expCat ? expCat.id : t.categoryId,
          subGroupId: t.subGroupId,
          memo: t.memo || '',
          accountId: null,
          createdAt: t.createdAt,
          isSynthetic: true,
          sourceTxId: t.id,
          sourceAccountId: t.accountId,
          lines: [{ subItemId: line.subItemId, amount: line.amount, subItemName: srcAcct.name }],
        });
      }
    });
  }
  return result;
}

// 재정계정(대표계정) 거래 반환 — accountId가 null이거나 대표계정 id인 거래
// + 서브계좌↔재정계정 이체 중 재정계정 쪽에 누락된 반대쪽을 가상 거래로 보강
function mainAcctTxs() {
  const defAcct = (State.linkedAccounts || []).find(a => a.isDefault);
  const direct = State.transactions.filter(t =>
    !t.accountId || (defAcct && t.accountId === defAcct.id)
  );
  return [...direct, ...mainAcctSyntheticTxs()];
}

function txInCursorMonth() {
  return mainAcctTxs().filter(t => isSameMonth(t.date, State.cursorDate));
}

function monthSummary() {
  const list = txInCursorMonth();
  const carryoverCat = State.categories.find(c => c.name === '전년이월');
  const depositCat = State.categories.find(c => c.type === 'expense' && c.name === '예금');
  let income = 0, expense = 0, deposit = 0;
  for (const t of list) {
    if (t.type === 'income') {
      if (carryoverCat && t.categoryId === carryoverCat.id) continue;
      income += t.amount;
    } else {
      expense += t.amount;
      if (depositCat && t.categoryId === depositCat.id) deposit += t.amount;
    }
  }
  const netExpense = expense - deposit;
  const netTotal = income - netExpense;
  return { income, expense, balance: income - expense, deposit, netExpense, netTotal };
}

async function totalAssets() {
  const carryoverCat = State.categories.find(c => c.name === '전년이월');
  const depositCat   = State.categories.find(c => c.name === '예금');
  let income = 0, expense = 0, carryoverTx = 0, depositExp = 0;
  for (const t of mainAcctTxs()) {
    if (t.type === 'income') {
      if (carryoverCat && t.categoryId === carryoverCat.id) {
        carryoverTx += t.amount;
      } else {
        income += t.amount;
      }
    } else {
      if (depositCat && t.categoryId === depositCat.id) {
        depositExp += t.amount;
      }
      expense += t.amount;
    }
  }
  const years = new Set(mainAcctTxs().map(t => Number(t.date.slice(0, 4))));
  let carryoverSetting = 0;
  for (const y of years) {
    const amt = await getYearCarryover(y);
    if (amt !== null) carryoverSetting += amt;
  }
  const carryover  = carryoverSetting + carryoverTx;
  const netExpense = expense - depositExp;
  const net = carryover + income - expense;
  return { totalIncome: income, totalExpense: expense, depositExp, netExpense, carryover, net };
}

/* ---------------------------------------------------------
   연도별 전년이월 / 당해년도 자산 계산 (홈 헤더 전용)
   - 최초 거래연도: 그 해 수입 중 "전년이월" 카테고리로 명시된 금액을 사용
   - 그 다음 연도부터: 전년도의 "년말 순자산(=전년이월+수입-지출)"을
     자동으로 그 해의 전년이월로 이월 처리 (연속기재)
   - 총수입/총예금/순지출은 해당 연도 거래만 집계
   --------------------------------------------------------- */
function totalAssetsForYearSync(year) {
  const carryoverCat = State.categories.find(c => c.name === '전년이월');
  const depositCat   = State.categories.find(c => c.name === '예금');
  const allTxs = mainAcctTxs();

  const yearsWithTx = Array.from(new Set(allTxs.map(t => Number(t.date.slice(0, 4))))).sort((a, b) => a - b);
  const firstYear = yearsWithTx.length ? yearsWithTx[0] : year;

  function summarizeYear(yr) {
    let income = 0, expense = 0, carryoverTx = 0, depositExp = 0;
    for (const t of allTxs) {
      if (Number(t.date.slice(0, 4)) !== yr) continue;
      if (t.type === 'income') {
        if (carryoverCat && t.categoryId === carryoverCat.id && yr === firstYear) {
          carryoverTx += t.amount; // "전년이월" 명시는 최초 연도에서만 별도 집계(그 해의 시작 잔액)
        } else {
          income += t.amount;
        }
      } else {
        if (depositCat && t.categoryId === depositCat.id) depositExp += t.amount;
        expense += t.amount;
      }
    }
    return { income, expense, carryoverTx, depositExp };
  }

  // firstYear부터 요청 연도까지 순차적으로 전년이월을 이월 계산
  const cache = {};
  function carryoverFor(yr) {
    if (cache[yr] !== undefined) return cache[yr];
    let result;
    if (yr <= firstYear) {
      result = summarizeYear(yr).carryoverTx; // 최초 연도: 명시된 전년이월 그대로 사용
    } else {
      const prev = summarizeYear(yr - 1);
      result = carryoverFor(yr - 1) + prev.income - prev.expense; // 전년도 년말 순자산을 그대로 이월
    }
    cache[yr] = result;
    return result;
  }

  const carryover = carryoverFor(year);
  const { income, expense, depositExp } = summarizeYear(year);
  const netExpense = expense - depositExp;
  const net = carryover + income - expense;
  return { totalIncome: income, totalExpense: expense, depositExp, netExpense, carryover, net, year };
}

// 임의의 날짜 기준 "이월잔액" 계산 (연간이 아닌 월간/기간설정 통계 요약카드에서 사용)
// beforeDate(exclusive) 이전까지의 모든 거래를 반영한 누적 잔액 = 최초연도 전년이월 + 그 이전까지의 수입 - 지출
function balanceAsOfDateSync(beforeDate) {
  const carryoverCat = State.categories.find(c => c.name === '전년이월');
  const allTxs = mainAcctTxs();
  const yearsWithTx = Array.from(new Set(allTxs.map(t => Number(t.date.slice(0, 4))))).sort((a, b) => a - b);
  if (!yearsWithTx.length) return 0;
  const firstYear = yearsWithTx[0];

  let base = 0, income = 0, expense = 0;
  for (const t of allTxs) {
    if (t.type === 'income' && carryoverCat && t.categoryId === carryoverCat.id && Number(t.date.slice(0, 4)) === firstYear) {
      base += t.amount; // 최초 연도 전년이월 시작값
      continue;
    }
    if (t.date >= beforeDate) continue; // 기준일 이후는 제외
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return base + income - expense;
}

async function totalAssetsForYear(year) {
  return totalAssetsForYearSync(year);
}

/* =========================================================
   ICONS (inline SVG, stroke-based, consistent 22x22 viewBox)
   ========================================================= */
const ICONS = {
  home: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
  list: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1.3" fill="${active?'var(--primary)':'currentColor'}" stroke="none"/><circle cx="3.5" cy="12" r="1.3" fill="${active?'var(--primary)':'currentColor'}" stroke="none"/><circle cx="3.5" cy="18" r="1.3" fill="${active?'var(--primary)':'currentColor'}" stroke="none"/></svg>`,
  members: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg>`,
  budget: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 14.5h4"/></svg>`,
  stats: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>`,
  accounts: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
  settings: (active) => `<svg viewBox="0 0 24 24" fill="none" stroke="${active?'var(--primary)':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4L4.6 10a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.2-.9c.77.65 1.65 1.16 2.6 1.5L10 22h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4z"/></svg>`,
  chevLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  chevRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4L4.6 10a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.2-.9c.77.65 1.65 1.16 2.6 1.5L10 22h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4z"/></svg>`,
  chevR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`,
};

const TABS = [
  { key: 'home',     label: '홈' },
  { key: 'budget',   label: '예산' },
  { key: 'stats',    label: '통계' },
  { key: 'accounts', label: '계정' },
  { key: 'members',  label: '명부' },
  { key: 'settings', label: '설정' },
];

/* ── 공통 인쇄 헬퍼 ── */
function doPrint(html) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS) {
    // iOS: 새 탭(Blob)으로 열어야 인쇄 가능
    _doPrintBlob(html);
  } else {
    // PC/Android: print-area 방식
    const area = document.getElementById('print-area');
    area.innerHTML = html;
    area.style.display = 'block';
    const cleanup = () => {
      area.style.display = 'none';
      area.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 80);
  }
}

function _doPrintBlob(html) {
  const printCSS = `
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
    html,body{margin:0;padding:0;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;font-size:9pt;color:#000;background:#fff;}
    table{border-collapse:collapse;width:100%;font-size:7.5pt;}
    th{background:#1F4E79!important;color:#fff!important;padding:2.5pt 3pt;border:0.5pt solid #3a6fa0!important;font-size:7.5pt;font-weight:700;}
    td{padding:2pt 3pt;border:0.5pt solid #aaa!important;font-size:7.5pt;min-width:0;}
    tbody tr:nth-child(even) td{background:#f7f9fc!important;}
    tfoot td{background:#2E74B5!important;color:#fff!important;font-weight:700!important;border:1pt solid #1a5fa8!important;font-size:8pt!important;}
    .print-title{font-size:13pt;font-weight:800;margin-bottom:5pt;}
    .print-period{font-size:9pt;color:#555;margin-bottom:7pt;}
    .print-summary{display:flex;gap:14pt;margin-bottom:9pt;border-bottom:1pt solid #000;padding-bottom:5pt;flex-wrap:wrap;}
    .print-summary-item{flex:1;min-width:60pt;}
    .print-summary-label{font-size:7.5pt;color:#666;}
    .print-summary-value{font-size:11pt;font-weight:800;}
    .print-summary-value.income{color:#1F5C8B;}
    .print-summary-value.expense{color:#B00;}
    .print-bar-row{display:flex;justify-content:space-between;padding:3.5pt 2pt;border-bottom:0.5pt solid #ddd;font-size:8.5pt;}
    .print-bar-label{flex:1;}
    .print-bar-amt{font-weight:700;min-width:60pt;text-align:right;}
    .print-bar-pct{min-width:26pt;text-align:right;color:#555;}
    .print-section-title{font-size:11pt;font-weight:800;margin-bottom:5pt;margin-top:7pt;}
    .page-inner{margin:0;padding:0;}
    #pivot-tbl{table-layout:fixed!important;width:100%!important;}
    #pivot-tbl col{width:var(--pcw);}
    #pivot-tbl th{font-size:6pt!important;padding:2pt 1pt!important;text-align:center!important;overflow:hidden!important;word-break:break-all!important;min-width:0!important;box-sizing:border-box!important;}
    #pivot-tbl td{font-size:6.5pt!important;padding:2pt 1pt!important;overflow:hidden!important;word-break:break-all!important;min-width:0!important;box-sizing:border-box!important;}
    @media print{
      @page{size:A4 portrait;margin:15mm 12mm;}
      .print-page{
        page-break-after:always!important;
        break-after:page!important;
        display:block!important;
      }
      .print-page:last-child{page-break-after:avoid!important;break-after:avoid!important;}
      table{page-break-inside:auto;}
      thead{display:table-header-group!important;}
      tr{page-break-inside:avoid;}
      tfoot{display:table-footer-group;page-break-inside:avoid;}
      th{background:#1F4E79!important;color:#fff!important;}
      tfoot td{background:#2E74B5!important;color:#fff!important;font-weight:700!important;}
      tbody tr:nth-child(even) td{background:#f7f9fc!important;}
      #print-btn{display:none!important;}
    }
  `;

  const fullHTML = `<!DOCTYPE html><html lang="ko"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>인쇄</title>
    <style>
      ${printCSS}
      #print-btn{
        display:block;width:calc(100% - 32px);margin:16px auto;padding:14px;
        background:#1d4ed8;color:#fff;font-size:16px;font-weight:800;
        border:none;border-radius:12px;cursor:pointer;
        font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;
      }
      /* 화면에서는 페이지 구분 없이 연속 표시 + 좌우 스크롤 가능하도록 넓게 펼침 */
      .print-page{display:block;margin-bottom:24px;}
      .print-scroll-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;}
      .print-scroll-wrap .page-inner{min-width:760px;}
      .print-scroll-hint{
        display:flex;align-items:center;gap:6px;
        margin:0 16px 8px;padding:8px 12px;border-radius:10px;
        background:#EFF6FF;color:#1d4ed8;font-size:12px;font-weight:700;
      }
      @media print{
        .print-scroll-wrap{overflow:visible!important;}
        .print-scroll-wrap .page-inner{min-width:0!important;}
        .print-scroll-hint{display:none!important;}
      }
      #print-scrolltop{
        display:none;position:fixed;right:18px;bottom:24px;
        width:48px;height:48px;border-radius:50%;
        background:#fff;color:#1d4ed8;border:1.5px solid #1d4ed8;
        box-shadow:0 6px 16px rgba(0,0,0,0.2);
        font-size:20px;font-weight:800;cursor:pointer;
        align-items:center;justify-content:center;
      }
      #print-scrolltop.show{display:flex;}
      @media print{#print-btn{display:none!important;}#print-scrolltop{display:none!important;}}
    </style>
  </head><body>
    <button id="print-btn" onclick="window.print()">🖨️ 인쇄</button>
    <div class="print-scroll-hint">👉 좌우로 스크롤하면 전체 표를 볼 수 있어요</div>
    <div class="print-scroll-wrap">${html}</div>
    <button id="print-scrolltop" title="맨 위로" onclick="window.scrollTo({top:0,behavior:'smooth'})">▲</button>
    <script>
      (function(){
        var btn = document.getElementById('print-scrolltop');
        window.addEventListener('scroll', function(){
          if (window.scrollY > 300) btn.classList.add('show');
          else btn.classList.remove('show');
        });
      })();
    </script>
  </body></html>`;

  const blob = new Blob([fullHTML], {type:'text/html'});
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* =========================================================
   RENDER: APP SHELL
   ========================================================= */
function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="pages" id="pages">
      <div class="page" id="page-home"></div>
      <div class="page" id="page-budget"></div>
      <div class="page" id="page-stats"></div>
      <div class="page" id="page-members"></div>
      <div class="page" id="page-accounts"></div>
      <div class="page" id="page-settings"></div>
    </div>
    <button class="fab" id="fabAdd">${ICONS.plus}</button>
    <button class="fab-top" id="fabScrollTop" title="맨 위로">${ICONS.arrowUp}</button>
    <button class="fab-top" id="fabScrollTopSheet" title="맨 위로" style="bottom:calc(var(--safe-bottom) + 20px); z-index:105;">${ICONS.arrowUp}</button>
    <div class="tabbar" id="tabbar"></div>
    <div class="sheet-backdrop" id="sheetBackdrop"></div>
    <div class="sheet" id="txSheet"></div>
    <div class="sheet" id="linkedAccountsSheet"></div>
    <div class="sheet" id="acctDetailSheet" style="max-height:100%;border-radius:0;"></div>
    <div class="sheet" id="catManageSheet"></div>
    <div class="sheet" id="oldItemsSheet"></div>
    <div class="sheet" id="catEditSheet"></div>
    <div class="sheet" id="catSubSheet"></div>
    <div class="sheet" id="dayDetailSheet" style="max-height:100%; border-radius:0;"></div>
    <div class="sheet" id="catStatDetailSheet" style="max-height:100%; border-radius:0;"></div>
    <div class="sheet" id="subStatDetailSheet" style="max-height:100%; border-radius:0;"></div>
    <div class="sheet" id="excelRangeSheet"></div>
    <div class="sheet" id="backupRangeSheet"></div>
    <div class="sheet" id="maturitySheet"></div>
    <div class="toast" id="toast"></div>
  `;
  renderTabbar();
  document.getElementById('fabAdd').addEventListener('click', () => openDayDetail(todayStr()));
  document.getElementById('sheetBackdrop').addEventListener('click', closeAllSheets);
  initScrollTopBtn();
}

// ── 통계 [리스트] 처럼 내용이 길어질 때 쓰는 '맨 위로' 버튼 ──
// (+ 버튼 바로 위에 스택되어 표시됨. 탭바에 가려지지 않도록 위쪽에 배치)
function initScrollTopBtn() {
  const btn = document.getElementById('fabScrollTop');
  if (!btn) return;
  const check = () => {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.scrollTop > 200) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  };
  document.getElementById('pages').addEventListener('scroll', check, true);
  btn.addEventListener('click', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage) activePage.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window._checkScrollTopBtn = check;
  initSheetScrollTopBtn();
}

// 팝업(바텀시트) 안에서도 "맨 위로" 버튼 지원 — 계정 관리/카테고리 관리 등 긴 목록이 있는 모달
function activeSheetBody() {
  const openSheets = Array.from(document.querySelectorAll('.sheet.show'));
  if (!openSheets.length) return null;
  // 여러 시트가 겹쳐 열려있으면 z-index가 가장 높은(맨 위) 시트를 기준으로 삼는다
  const topSheet = openSheets.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0)).pop();
  return topSheet.querySelector('.sheet-body');
}

function initSheetScrollTopBtn() {
  const btn = document.getElementById('fabScrollTopSheet');
  if (!btn) return;
  const check = () => {
    const body = activeSheetBody();
    if (body && body.scrollTop > 200) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  };
  document.body.addEventListener('scroll', check, true);
  btn.addEventListener('click', () => {
    const body = activeSheetBody();
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window._checkSheetScrollTopBtn = check;
}

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  const isAdmin = getIsAdmin();
  const visibleTabs = TABS.filter(t => isAdmin || t.key !== 'members');
  bar.innerHTML = visibleTabs.map(t => `
    <button class="tab-btn ${State.tab === t.key ? 'active' : ''}" data-tab="${t.key}">
      ${ICONS[t.key](State.tab === t.key)}
      <span>${t.label}</span>
    </button>
  `).join('');
  bar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(key) {
  State.tab = key;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + key).classList.add('active');
  renderTabbar();
  renderCurrentPage();
  const isAdmin = getIsAdmin();
  document.getElementById('fabAdd').style.display = (key === 'settings' || key === 'members' || key === 'accounts' || !isAdmin) ? 'none' : 'flex';
  applyLockState();
  window._checkScrollTopBtn?.();
}

function renderCurrentPage() {
  if (State.tab === 'home') renderHome();
  else if (State.tab === 'budget') renderBudget();
  else if (State.tab === 'stats') renderStats();
  else if (State.tab === 'members') renderMembers();
  else if (State.tab === 'accounts') renderAccounts();  // async, fire-and-forget OK
  else if (State.tab === 'settings') renderSettings();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

function changeMonth(delta) {
  const d = new Date(State.cursorDate);
  d.setMonth(d.getMonth() + delta);
  State.cursorDate = d;
  renderCurrentPage();
}

/* =========================================================
   RENDER: HOME (캘린더)
   ========================================================= */
function dayTotalsMap() {
  // { 'YYYY-MM-DD': { income, expense } }
  const map = {};
  for (const t of txInCursorMonth()) {
    if (!map[t.date]) map[t.date] = { income: 0, expense: 0 };
    map[t.date][t.type] += t.amount;
  }
  return map;
}

function buildCalendarCells(cursorDate) {
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth(); // 0-indexed
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // leading days from previous month
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const dt = new Date(year, month - 1, d);
    cells.push({ date: dt, inMonth: false });
  }
  // this month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  // trailing days to complete weeks (multiple of 7)
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (startWeekday + daysInMonth);
    const d = idx + 1;
    cells.push({ date: new Date(year, month + 1, d), inMonth: false });
  }
  return cells;
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function renderHome() {
  const page = document.getElementById('page-home');
  const { income, expense, balance, deposit, netExpense: monthNetExpense, netTotal } = monthSummary();
  const homeYear = new Date().getFullYear();
  const { totalIncome, totalExpense, depositExp, netExpense, carryover, net } = await totalAssetsForYear(homeYear);
  const netColor = net < 0 ? 'var(--expense-light)' : '#fff';

  const viewTabsHTML = `
    <div class="home-view-tabs">
      <button class="home-view-tab ${State.homeView==='calendar'?'active':''}" data-view="calendar">달력</button>
      <button class="home-view-tab ${State.homeView==='daily'?'active':''}" data-view="daily">일일</button>
      <button class="home-view-tab ${State.homeView==='monthly'?'active':''}" data-view="monthly">월별</button>
    </div>
  `;

  let viewContent = '';
  if (State.homeView === 'calendar') {
    viewContent = renderHomeCalendar();
  } else if (State.homeView === 'daily') {
    viewContent = renderHomeDaily();
  } else {
    viewContent = renderHomeMonthly();
  }

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1 id="appTitleEl">${(await getAppTitle()) || '교회 회계부'}</h1>
      <button class="icon-btn" id="goSettings">${ICONS.gear}</button>
    </div>

    <div class="total-assets-banner" style="display:flex;justify-content:space-between;align-items:stretch;">
      <div style="display:flex;flex-direction:column;justify-content:center;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;color:rgba(255,255,255,0.75);font-weight:600;min-width:52px;">전년이월</span>
          <span class="tabular" style="font-size:12.5px;color:#fff;font-weight:700;">${fmtMoney(carryover)}원</span>
        </div>
        <div>
          <span class="total-assets-value tabular" style="color:${netColor};">${net < 0 ? '-' : ''}${fmtMoney(Math.abs(net))}원</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:4px;">
        <div class="total-assets-sub" style="display:flex;gap:8px;justify-content:space-between;min-width:150px;"><span>총수입</span><span class="tabular">${fmtMoney(totalIncome)}원</span></div>
        <div class="total-assets-sub" style="display:flex;gap:8px;justify-content:space-between;min-width:150px;"><span>총예금</span><span class="tabular">${fmtMoney(depositExp)}원</span></div>
        <div class="total-assets-sub" style="display:flex;gap:8px;justify-content:space-between;min-width:150px;"><span>순지출</span><span class="tabular">${fmtMoney(netExpense)}원</span></div>
      </div>
    </div>

    <div class="cal-summary-row" style="flex-direction:column;">
      <div style="display:flex;width:100%;">
        <div class="cal-summary-col">
          <div class="cal-summary-label">수입</div>
          <div class="cal-summary-value income tabular">${fmtMoney(income)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">지출</div>
          <div class="cal-summary-value expense tabular">${fmtMoney(expense)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">합계</div>
          <div class="cal-summary-value tabular">${fmtMoney(balance)}</div>
        </div>
      </div>

      <div style="width:100%;border-top:1px solid rgba(0,0,0,0.08);margin:8px 0;"></div>

      <div style="display:flex;width:100%;">
        <div class="cal-summary-col">
          <div class="cal-summary-label">예금</div>
          <div class="cal-summary-value tabular">${fmtMoney(deposit)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">순지출</div>
          <div class="cal-summary-value tabular">${fmtMoney(monthNetExpense)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">순수입계</div>
          <div class="cal-summary-value tabular" style="color:${netTotal>=0?'#2563eb':'#dc2626'};">${netTotal>=0?'':'-'}${fmtMoney(Math.abs(netTotal))}</div>
        </div>
      </div>
    </div>

    ${viewTabsHTML}

    ${State.homeView !== 'monthly' ? `
    <div class="cal-month-nav">
      <button id="prevMonth" class="cal-nav-arrow">${ICONS.chevLeft}</button>
      <button id="monthLabel" style="background:none;border:none;font-size:15px;font-weight:700;color:var(--text-1);cursor:pointer;padding:4px 8px;border-radius:8px;">${monthLabel(State.cursorDate)}</button>
      <button id="nextMonth" class="cal-nav-arrow">${ICONS.chevRight}</button>
      <button id="goTodayBtn" style="font-size:12.5px;font-weight:700;color:var(--primary);background:var(--primary-light);padding:6px 12px;border-radius:20px;white-space:nowrap;">오늘</button>
    </div>` : ''}

    ${viewContent}
  `;

  page.querySelector('#goSettings').addEventListener('click', () => switchTab('settings'));
  page.querySelector('#prevMonth')?.addEventListener('click', () => changeMonth(-1));
  page.querySelector('#nextMonth')?.addEventListener('click', () => changeMonth(1));
  page.querySelector('#goTodayBtn')?.addEventListener('click', () => {
    State.cursorDate = new Date();
    renderHome();
  });

  // 날짜 레이블 클릭 → 년/월 빠른 선택 팝업
  page.querySelector('#monthLabel')?.addEventListener('click', () => {
    const existing = document.getElementById('monthPickerPop');
    if (existing) { existing.remove(); return; }

    const cur = State.cursorDate;
    const curY = cur.getFullYear();
    const curM = cur.getMonth() + 1;

    // 현재 연도 기준 ±5년
    const years = [];
    for (let y = curY - 5; y <= curY + 1; y++) years.push(y);
    const months = Array.from({length: 12}, (_, i) => i + 1);

    const pop = document.createElement('div');
    pop.id = 'monthPickerPop';
    pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    pop.innerHTML = `
      <div style="background:var(--card);border-radius:20px;padding:20px;width:300px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:14px;text-align:center;">날짜 이동</div>

        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:600;">연도</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">
            ${years.map(y => `
              <button data-year="${y}" style="padding:8px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${y===curY?'700':'400'};background:${y===curY?'var(--primary)':'var(--card)'};color:${y===curY?'#fff':'var(--text-1)'};cursor:pointer;">${y}</button>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:600;">월</div>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px;">
            ${months.map(m => `
              <button data-month="${m}" style="padding:8px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${m===curM?'700':'400'};background:${m===curM?'var(--primary)':'var(--card)'};color:${m===curM?'#fff':'var(--text-1)'};cursor:pointer;">${m}월</button>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;gap:8px;">
          <button id="monthPickerCancel" style="flex:1;padding:11px;border-radius:12px;background:var(--surface-2);border:none;font-size:14px;font-weight:600;color:var(--text-1);">취소</button>
          <button id="monthPickerOk" style="flex:1;padding:11px;border-radius:12px;background:var(--primary);border:none;font-size:14px;font-weight:700;color:#fff;">이동</button>
        </div>
      </div>`;

    document.body.appendChild(pop);

    let selYear = curY, selMonth = curM;

    // 연도 선택
    pop.querySelectorAll('[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        selYear = Number(btn.dataset.year);
        pop.querySelectorAll('[data-year]').forEach(b => {
          b.style.background = b.dataset.year == selYear ? 'var(--primary)' : 'var(--card)';
          b.style.color = b.dataset.year == selYear ? '#fff' : 'var(--text-1)';
          b.style.fontWeight = b.dataset.year == selYear ? '700' : '400';
        });
      });
    });

    // 월 선택
    pop.querySelectorAll('[data-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        selMonth = Number(btn.dataset.month);
        pop.querySelectorAll('[data-month]').forEach(b => {
          b.style.background = b.dataset.month == selMonth ? 'var(--primary)' : 'var(--card)';
          b.style.color = b.dataset.month == selMonth ? '#fff' : 'var(--text-1)';
          b.style.fontWeight = b.dataset.month == selMonth ? '700' : '400';
        });
      });
    });

    pop.querySelector('#monthPickerCancel').addEventListener('click', () => pop.remove());
    pop.querySelector('#monthPickerOk').addEventListener('click', () => {
      State.cursorDate = new Date(selYear, selMonth - 1, 1);
      pop.remove();
      renderHome();
    });
    pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
  });
  page.querySelectorAll('.home-view-tab').forEach(btn => {
    btn.addEventListener('click', () => { State.homeView = btn.dataset.view; renderHome(); });
  });

  if (State.homeView === 'calendar') {
    page.querySelectorAll('.cal-day').forEach(el => {
      el.addEventListener('click', () => openDayDetail(el.dataset.date));
    });
  } else if (State.homeView === 'daily') {
    page.querySelectorAll('.tx-item').forEach(el => {
      el.addEventListener('click', () => openTxSheet(el.dataset.id));
    });
  } else {
    // 월별: 클릭하면 해당 월로 이동 후 일일 탭
    page.querySelectorAll('.monthly-row').forEach(el => {
      el.addEventListener('click', () => {
        const [y, m] = el.dataset.ym.split('-').map(Number);
        State.cursorDate = new Date(y, m - 1, 1);
        State.homeView = 'daily';
        renderHome();
      });
    });
  }
}

function renderHomeCalendar() {
  const totals = dayTotalsMap();
  const cells = buildCalendarCells(State.cursorDate);
  const today = todayStr();
  const weekdayNames = ['일','월','화','수','목','금','토'];
  return `
    <div class="cal-grid">
      <div class="cal-weekdays">${weekdayNames.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="cal-days">
        ${cells.map(({ date, inMonth }) => {
          const dstr = dateToStr(date);
          const t = totals[dstr];
          const wd = date.getDay();
          const classes = ['cal-day'];
          if (!inMonth) classes.push('other-month');
          if (wd === 0) classes.push('is-sun');
          if (wd === 6) classes.push('is-sat');
          if (dstr === today) classes.push('is-today');
          return `
            <div class="${classes.join(' ')}" data-date="${dstr}">
              <div class="dnum">${date.getDate()}</div>
              ${t && t.income > 0 ? `<div class="damt income tabular">${fmtMoneyShort(t.income)}</div>` : ''}
              ${t && t.expense > 0 ? `<div class="damt expense tabular">${fmtMoneyShort(t.expense)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderHomeDaily() {
  const list = txInCursorMonth();
  const groups = {};
  for (const t of list) {
    (groups[t.date] = groups[t.date] || []).push(t);
  }
  const dates = Object.keys(groups).sort((a,b) => b.localeCompare(a));
  if (dates.length === 0) return emptyStateHTML('이번 달 내역이 없어요', '＋ 버튼으로 거래를 추가해보세요');
  return dates.map(date => `
    <div class="tx-group-label">${dateGroupLabel(date)}</div>
    <div class="card" style="padding:4px 16px;">
      ${groups[date].map(txItemHTML).join('')}
    </div>
  `).join('');
}

function renderHomeMonthly() {
  const allTx = State.transactions;
  if (allTx.length === 0) return emptyStateHTML('내역이 없어요', '＋ 버튼으로 거래를 추가해보세요');

  // 전년이월 카테고리
  const carryoverCat = State.categories.find(c => c.name === '전년이월');

  const monthSet = new Set(allTx.map(t => t.date.slice(0, 7)));
  const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  return months.map(ym => {
    const [y, m] = ym.split('-').map(Number);
    const txs = allTx.filter(t => t.date.startsWith(ym));
    let inc = 0, exp = 0, carryoverAmt = 0;
    for (const t of txs) {
      if (t.type === 'income') {
        // 1월이고 전년이월 카테고리면 별도 집계
        if (m === 1 && carryoverCat && t.categoryId === carryoverCat.id) {
          carryoverAmt += t.amount;
        } else {
          inc += t.amount;
        }
      } else {
        exp += t.amount;
      }
    }
    const bal = inc - exp;
    return `
      <div class="monthly-row card" data-ym="${ym}" style="margin-bottom:10px; padding:14px 16px; cursor:pointer;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div style="font-size:15px; font-weight:800; color:var(--text-1);">${y}년 ${m}월</div>
          <div class="tabular" style="font-size:15px; font-weight:800; color:${bal<0?'var(--expense)':'var(--text-1)'};">${bal<0?'-':''}${fmtMoney(Math.abs(bal))}원</div>
        </div>
        <div style="display:flex; gap:14px; margin-top:6px;">
          ${m === 1 && carryoverAmt > 0 ? `<span style="font-size:12.5px; color:var(--text-3); font-weight:500;">이월 <b class="tabular">${fmtMoney(carryoverAmt)}</b></span>` : ''}
          <span style="font-size:12.5px; color:var(--primary); font-weight:600;">수입 <b class="tabular">${fmtMoney(inc)}</b></span>
          <span style="font-size:12.5px; color:var(--expense); font-weight:600;">지출 <b class="tabular">${fmtMoney(exp)}</b></span>
          <span style="font-size:12.5px; color:var(--text-3); font-weight:500;">${txs.length}건</span>
        </div>
      </div>
    `;
  }).join('');
}
function fmtMoneyShort(n) {
  // 달력 셀에 들어가는 짧은 금액 표기 (예: 7,448,786 -> 그대로, 필요시 만원단위 축약은 생략하고 천단위 콤마만)
  return fmtMoney(n);
}

function emptyStateHTML(msg, sub) {
  return `<div class="empty-state"><div class="emoji">🧾</div><div class="msg">${msg}<br><span style="font-size:12.5px;">${sub}</span></div></div>`;
}

function txDisplayTitle(t) {
  // 방식 B: 저장 당시의 이름을 최우선으로 사용 (카테고리가 나중에 개명/삭제되어도 유지)
  const sgName = txSubGroupName(t);
  if (sgName) return sgName;
  return txCatInfo(t).name;
}

function txItemHTML(t) {
  const cat = txCatInfo(t);
  const lines = t.lines || [];

  // 제목: 하위항목(중분류)이 있으면 그 이름, 없으면 대분류명
  const title = txDisplayTitle(t);

  // 부제: 메모가 있으면 메모, 아니면 (인물별 대분류일 땐 대분류명도 같이) 세부항목 요약
  let itemsSummary;
  if (lines.length > 0) {
    const names = lines.map(l => txLineName(l)).filter(Boolean);
    itemsSummary = names.slice(0, 2).join(', ');
    if (names.length > 2) itemsSummary += ` 외 ${names.length - 2}건`;
  } else {
    itemsSummary = t.date.slice(5).replace('-', '월 ') + '일';
  }
  let sub;
  if (t.memo) {
    sub = escapeHTML(t.memo);
  } else {
    sub = itemsSummary;
  }

  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon" style="background:${hexToLight(cat.color)};">${cat.icon}</div>
      <div class="tx-mid">
        <div class="tx-cat">${escapeHTML(title)}</div>
        <div class="tx-memo">${sub}</div>
      </div>
      <div class="tx-amt tabular ${t.type}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}원</div>
    </div>
  `;
}

function hexToLight(hex) {
  // returns a light tint background for icon circles
  try {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},0.14)`;
  } catch(e) { return '#F0F0F0'; }
}

function escapeHTML(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* =========================================================
   RENDER: LIST (내역)
   ========================================================= */
function renderList() {
  const page = document.getElementById('page-list');
  const list = txInCursorMonth();
  const groups = {};
  for (const t of list) {
    (groups[t.date] = groups[t.date] || []).push(t);
  }
  const dates = Object.keys(groups).sort((a,b) => b.localeCompare(a));

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1>내역</h1>
    </div>
    <div class="summary-month" style="justify-content:center; background:var(--card); border-radius:var(--radius-sm); padding:10px; box-shadow:var(--shadow); color:var(--text-1); margin-bottom:14px;">
      <button id="prevMonth2" style="color:var(--text-2);">${ICONS.chevLeft}</button>
      <span style="font-weight:700;">${monthLabel(State.cursorDate)}</span>
      <button id="nextMonth2" style="color:var(--text-2);">${ICONS.chevRight}</button>
    </div>
    ${dates.length === 0 ? emptyStateHTML('이번 달 내역이 없어요', '＋ 버튼으로 거래를 추가해보세요') : dates.map(date => `
      <div class="tx-group-label">${dateGroupLabel(date)}</div>
      <div class="card" style="padding:4px 16px;">
        ${groups[date].map(txItemHTML).join('')}
      </div>
    `).join('')}
  `;
  page.querySelector('#prevMonth2').addEventListener('click', () => changeMonth(-1));
  page.querySelector('#nextMonth2').addEventListener('click', () => changeMonth(1));
  page.querySelectorAll('.tx-item').forEach(el => {
    el.addEventListener('click', () => openTxSheet(el.dataset.id));
  });
}

function dateGroupLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  const today = todayStr();
  const yest = new Date(); yest.setDate(yest.getDate()-1);
  const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
  let prefix = '';
  if (dateStr === today) prefix = '오늘 · ';
  else if (dateStr === yestStr) prefix = '어제 · ';
  return `${prefix}${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/* =========================================================
   RENDER: BUDGET (예산)
   ========================================================= */
function renderBudget() {
  const page = document.getElementById('page-budget');
  const year = State.cursorDate.getFullYear();

  // 해당 연도 지출 거래 집계
  const yearTxs = State.transactions.filter(t => t.type === 'expense' && t.date.startsWith(String(year)));
  const spentByCat = {};
  const spentBySub = {};
  for (const t of yearTxs) {
    spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount;
    for (const l of (t.lines || [])) {
      spentBySub[l.subItemId] = (spentBySub[l.subItemId] || 0) + l.amount;
    }
  }

  // 수입/지출 예산 집계
  const incomeTxs = State.transactions.filter(t => t.type === 'income' && t.date.startsWith(String(year)));
  const incByCat = {}, incBySub = {};
  for (const t of incomeTxs) {
    incByCat[t.categoryId] = (incByCat[t.categoryId] || 0) + t.amount;
    for (const l of (t.lines || [])) incBySub[l.subItemId] = (incBySub[l.subItemId] || 0) + l.amount;
  }

  const incomeBudgetCats = State.categories.filter(c => c.type === 'income' && getBudget(c, year) > 0);
  const expenseBudgetCats = State.categories.filter(c => c.type === 'expense' && getBudget(c, year) > 0);
  const totalIncomeBudget = incomeBudgetCats.reduce((s,c) => s + getBudget(c, year), 0);
  const totalIncomeSpent = incomeBudgetCats.reduce((s,c) => s + (incByCat[c.id] || 0), 0);
  const totalExpenseBudget = expenseBudgetCats.reduce((s,c) => s + getBudget(c, year), 0);
  const totalExpenseSpent = expenseBudgetCats.reduce((s,c) => s + (spentByCat[c.id] || 0), 0);

  // 소분류 그룹핑 정의 (대분류명 → { 그룹명: [소분류명...] })
  const SUB_GROUPS = {
    '관리 및 유지비': {
      '자동차': ['자동차렌트비','자동차보험','자동차세','주유비','자동차관련'],
      '교회당': ['교회당임대료','교회당관리비'],
      '통신': ['통신비','통신비(본당)','통신비(목사님)'],
    }
  };

  const renderSubsWithGroup = (c, budSubs, spentByS) => {
    const groups = SUB_GROUPS[c.name];
    if (!groups) {
      // 그룹핑 없음 — 소분류 목록만
      return budSubs.map(s => {
        const ss = spentByS[s.id] || 0;
        const sBud = getBudget(s, year);
        const sp = sBud > 0 ? Math.min(100, Math.round(ss / sBud * 100)) : 0;
        return `<div style="margin-bottom:5px;">
          <div class="budget-top" style="font-size:12px;">
            <div style="font-weight:600;color:var(--text-1);">${escapeHTML(s.name)}</div>
            <div class="budget-nums tabular" style="font-size:12px;"><b>${fmtMoney(ss)}</b> / ${fmtMoney(sBud)}원</div>
          </div>
          <div class="budget-track" style="height:5px;"><div class="budget-fill" style="width:${sp}%; background:${budgetColor(sp)};"></div></div>
        </div>`;
      }).join('');
    }
    // 그룹핑 있음 — 중분류별 접기/펼치기
    const grouped = {};
    const ungrouped = [];
    for (const s of budSubs) {
      let found = false;
      for (const [gName, gSubs] of Object.entries(groups)) {
        if (gSubs.includes(s.name)) { (grouped[gName] = grouped[gName] || []).push(s); found = true; break; }
      }
      if (!found) ungrouped.push(s);
    }
    let html = '';
    for (const [gName, gSubs] of Object.entries(grouped)) {
      const gTotal = gSubs.reduce((s,x) => s + getBudget(x, year), 0);
      const gSpent = gSubs.reduce((s,x) => s + (spentByS[x.id]||0), 0);
      const gPct = gTotal > 0 ? Math.min(100, Math.round(gSpent/gTotal*100)) : 0;
      const groupKey = c.id + '__' + gName;
      const groupOpen = !!State.budgetExpanded[groupKey];
      const arrow = groupOpen ? '▾' : '▸';
      html += `<div style="margin-bottom:8px;">
        <div class="budget-group-header" data-group-key="${escapeHTML(groupKey)}"
             style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:3px 0;user-select:none;">
          <div style="font-size:11px;font-weight:800;color:var(--text-2);">${arrow} ${escapeHTML(gName)}</div>
          <div style="font-size:11px;color:var(--text-3);">${fmtMoney(gSpent)} / ${fmtMoney(gTotal)}원</div>
        </div>
        <div class="budget-group-body" data-group-key="${escapeHTML(groupKey)}" style="padding-left:8px;${groupOpen ? '' : 'display:none;'}">
          ${gSubs.map(s => {
            const ss = spentByS[s.id]||0;
            const sBud = getBudget(s, year);
            const sp = sBud>0 ? Math.min(100,Math.round(ss/sBud*100)) : 0;
            return `<div style="margin-bottom:4px;">
              <div class="budget-top" style="font-size:11px;">
                <div style="color:var(--text-1);">${escapeHTML(s.name)}</div>
                <div class="budget-nums tabular" style="font-size:11px;"><b>${fmtMoney(ss)}</b> / ${fmtMoney(sBud)}원</div>
              </div>
              <div class="budget-track" style="height:4px;"><div class="budget-fill" style="width:${sp}%; background:${budgetColor(sp)};"></div></div>
            </div>`;
          }).join('')}
          <div style="font-size:11px;color:var(--text-3);text-align:right;">소계 ${fmtMoney(gSpent)}/${fmtMoney(gTotal)}원 (${gPct}%)</div>
        </div>
      </div>`;
    }
    for (const s of ungrouped) {
      const ss = spentByS[s.id]||0;
      const sBud = getBudget(s, year);
      const sp = sBud>0 ? Math.min(100,Math.round(ss/sBud*100)) : 0;
      html += `<div style="margin-bottom:5px;">
        <div class="budget-top" style="font-size:12px;">
          <div style="font-weight:600;color:var(--text-1);">${escapeHTML(s.name)}</div>
          <div class="budget-nums tabular" style="font-size:12px;"><b>${fmtMoney(ss)}</b> / ${fmtMoney(sBud)}원</div>
        </div>
        <div class="budget-track" style="height:5px;"><div class="budget-fill" style="width:${sp}%; background:${budgetColor(sp)};"></div></div>
      </div>`;
    }
    return html;
  };

  // 수입 전용: subGroups 있는 대분류(헌금)는 공통 소분류(헌금종류)별 예산/실적 표시
  const renderIncomeCatSection = (budgetCats) => {
    if (budgetCats.length === 0) return `<div style="font-size:13px;color:var(--text-3);padding:12px 2px;">설정된 예산이 없어요</div>`;
    return budgetCats.map(c => {
      const catOpen = !!State.budgetExpanded[c.id];
      const hasGroups = subGroupsOfCategory(c.id).length > 0;
      if (hasGroups) {
        // 헌금 대분류: 공통 소분류(헌금종류)별 예산/실적
        const commonSubs = subItemsOfCategory(c.id).filter(s => !s.subGroupId);
        const budSubs = commonSubs.filter(s => getBudget(s, year) > 0);
        // 실적: 이 대분류 전체 거래의 line별 subItem 합산
        const catSpent = incByCat[c.id] || 0;
        const catBudget = getBudget(c, year) || budSubs.reduce((s,x) => s + getBudget(x, year), 0);
        const catPct = catBudget > 0 ? Math.min(100, Math.round(catSpent / catBudget * 100)) : 0;
        return `<div class="budget-item" style="margin-bottom:14px;">
          <div class="budget-cat-header" data-cat-id="${c.id}" style="cursor:pointer;user-select:none;">
            <div class="budget-top">
              <div class="budget-name"><span style="font-size:15px;">${c.icon}</span> ${c.name} <span style="font-size:11px;color:var(--text-3);">${catOpen ? '▾' : '▸'}</span></div>
              <div class="budget-nums tabular"><b>${fmtMoney(catSpent)}</b> / ${fmtMoney(catBudget)}원</div>
            </div>
            <div class="budget-track"><div class="budget-fill" style="width:${catPct}%; background:${budgetColor(catPct)};"></div></div>
            <div style="font-size:11px;color:var(--text-3);text-align:right;margin-top:2px;">${catPct}%</div>
          </div>
          <div class="budget-cat-body" data-cat-id="${c.id}" style="${catOpen ? '' : 'display:none;'}">
            ${budSubs.length > 0 ? `<div style="margin-top:6px;padding-left:10px;border-left:2px solid var(--border);">
              ${budSubs.map(s => {
                const ss = incBySub[s.id] || 0;
                const sBud = getBudget(s, year);
                const sp = sBud > 0 ? Math.min(100, Math.round(ss / sBud * 100)) : 0;
                return `<div style="margin-bottom:5px;">
                  <div class="budget-top" style="font-size:12px;">
                    <div style="font-weight:600;color:var(--text-1);">${escapeHTML(s.name)}</div>
                    <div class="budget-nums tabular" style="font-size:12px;"><b>${fmtMoney(ss)}</b> / ${fmtMoney(sBud)}원</div>
                  </div>
                  <div class="budget-track" style="height:5px;"><div class="budget-fill" style="width:${sp}%; background:${budgetColor(sp)};"></div></div>
                </div>`;
              }).join('')}
            </div>` : `<div style="font-size:11px;color:var(--text-3);padding:4px 0 0 10px;">헌금종류별 예산은 항목 관리에서 소분류 예산을 설정하세요</div>`}
          </div>
        </div>`;
      } else {
        // 이자/기타: 기존 방식 (대분류 + 소분류)
        const spent = incByCat[c.id] || 0;
        const cBud = getBudget(c, year);
        const pct = cBud > 0 ? Math.min(100, Math.round(spent / cBud * 100)) : 0;
        const budSubs = subItemsOfCategory(c.id).filter(s => getBudget(s, year) > 0);
        return `<div class="budget-item" style="margin-bottom:14px;">
          <div class="budget-cat-header" data-cat-id="${c.id}" style="cursor:pointer;user-select:none;">
            <div class="budget-top">
              <div class="budget-name"><span style="font-size:15px;">${c.icon}</span> ${c.name}${budSubs.length > 0 ? ` <span style="font-size:11px;color:var(--text-3);">${catOpen ? '▾' : '▸'}</span>` : ''}</div>
              <div class="budget-nums tabular"><b>${fmtMoney(spent)}</b> / ${fmtMoney(cBud)}원</div>
            </div>
            <div class="budget-track"><div class="budget-fill" style="width:${pct}%; background:${budgetColor(pct)};"></div></div>
            <div style="font-size:11px;color:var(--text-3);text-align:right;margin-top:2px;">${pct}%</div>
          </div>
          ${budSubs.length > 0 ? `<div class="budget-cat-body" data-cat-id="${c.id}" style="${catOpen ? '' : 'display:none;'}">
            <div style="margin-top:6px;padding-left:10px;border-left:2px solid var(--border);">
              ${renderSubsWithGroup(c, budSubs, incBySub)}
            </div>
          </div>` : ''}
        </div>`;
      }
    }).join('');
  };

  // 지출 전용: 기존 방식 유지
  const renderCatSection = (budgetCats, spentByC, spentByS, type) => {
    if (budgetCats.length === 0) return `<div style="font-size:13px;color:var(--text-3);padding:12px 2px;">설정된 예산이 없어요</div>`;
    return budgetCats.map(c => {
      const spent = spentByC[c.id] || 0;
      const cBud = getBudget(c, year);
      const pct = cBud > 0 ? Math.min(100, Math.round(spent / cBud * 100)) : 0;
      const budSubs = subItemsOfCategory(c.id).filter(s => getBudget(s, year) > 0);
      const catOpen = !!State.budgetExpanded[c.id];
      return `<div class="budget-item" style="margin-bottom:14px;">
        <div class="budget-cat-header" data-cat-id="${c.id}" style="cursor:pointer;user-select:none;">
          <div class="budget-top">
            <div class="budget-name"><span style="font-size:15px;">${c.icon}</span> ${c.name}${budSubs.length > 0 ? ` <span style="font-size:11px;color:var(--text-3);">${catOpen ? '▾' : '▸'}</span>` : ''}</div>
            <div class="budget-nums tabular"><b>${fmtMoney(spent)}</b> / ${fmtMoney(cBud)}원</div>
          </div>
          <div class="budget-track"><div class="budget-fill" style="width:${pct}%; background:${budgetColor(pct)};"></div></div>
          <div style="font-size:11px;color:var(--text-3);text-align:right;margin-top:2px;">${pct}%</div>
        </div>
        ${budSubs.length > 0 ? `<div class="budget-cat-body" data-cat-id="${c.id}" style="${catOpen ? '' : 'display:none;'}">
          <div style="margin-top:6px;padding-left:10px;border-left:2px solid var(--border);">
            ${renderSubsWithGroup(c, budSubs, spentByS)}
          </div>
        </div>` : ''}
      </div>`;
    }).join('');
  };

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1>예산</h1>
      <button class="icon-btn" id="manageCatsBtn" style="width:auto;padding:0 14px;font-size:13px;font-weight:700;color:var(--primary);">항목 관리</button>
    </div>
    <div class="summary-month" style="justify-content:center; background:var(--card); border-radius:var(--radius-sm); padding:10px; box-shadow:var(--shadow); color:var(--text-1); margin-bottom:14px;">
      <button id="prevYear" style="flex-shrink:0;color:var(--text-2);">${ICONS.chevLeft}</button>
      <button id="budgetYearLabel" style="flex:1;min-width:0;background:none;border:none;font-weight:800;font-size:19px;color:var(--text-1);cursor:pointer;padding:6px 4px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${year}년 예산 <span style="font-size:13px;color:var(--text-3);flex-shrink:0;">▾</span></button>
      <button id="nextYear" style="flex-shrink:0;color:var(--text-2);">${ICONS.chevRight}</button>
    </div>

    <!-- 전체 요약 -->
    <div class="card" style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:800;color:var(--text-3);margin-bottom:8px;">전체 요약</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:var(--income-light,#f0fdf4);border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:var(--income);font-weight:700;">수입 예산</div>
          <div style="font-size:13px;font-weight:800;">${fmtMoney(totalIncomeBudget)}원</div>
          <div style="font-size:11px;color:var(--text-3);">실적 ${fmtMoney(totalIncomeSpent)}원</div>
          ${totalIncomeBudget > 0 ? `
          <div style="margin-top:6px;background:var(--border);border-radius:4px;height:5px;overflow:hidden;">
            <div style="height:100%;border-radius:4px;background:var(--income);width:${Math.min(100,Math.round(totalIncomeSpent/totalIncomeBudget*100))}%;"></div>
          </div>
          <div style="font-size:11px;color:var(--income);font-weight:700;margin-top:3px;text-align:right;">${Math.round(totalIncomeSpent/totalIncomeBudget*100)}%</div>
          ` : ''}
        </div>
        <div style="background:var(--expense-light,#fff5f5);border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:var(--expense);font-weight:700;">지출 예산</div>
          <div style="font-size:13px;font-weight:800;">${fmtMoney(totalExpenseBudget)}원</div>
          <div style="font-size:11px;color:var(--text-3);">실적 ${fmtMoney(totalExpenseSpent)}원</div>
          ${totalExpenseBudget > 0 ? `
          <div style="margin-top:6px;background:var(--border);border-radius:4px;height:5px;overflow:hidden;">
            <div style="height:100%;border-radius:4px;background:var(--expense);width:${Math.min(100,Math.round(totalExpenseSpent/totalExpenseBudget*100))}%;"></div>
          </div>
          <div style="font-size:11px;color:var(--expense);font-weight:700;margin-top:3px;text-align:right;">${Math.round(totalExpenseSpent/totalExpenseBudget*100)}%</div>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- 수입 -->
    <div style="font-size:13px;font-weight:800;color:var(--income);margin:14px 0 8px;">📥 수입</div>
    <div class="card" style="margin-bottom:14px;">
      ${renderIncomeCatSection(incomeBudgetCats)}
      ${incomeBudgetCats.length === 0 ? '' : `<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
        <span>수입 합계</span><span>${fmtMoney(totalIncomeSpent)} / ${fmtMoney(totalIncomeBudget)}원</span>
      </div>`}
    </div>

    <!-- 지출 -->
    <div style="font-size:13px;font-weight:800;color:var(--expense);margin:14px 0 8px;">📤 지출</div>
    <div class="card" style="margin-bottom:80px;">
      ${renderCatSection(expenseBudgetCats, spentByCat, spentBySub, 'expense')}
      ${expenseBudgetCats.length === 0 ? '' : `<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
        <span>지출 합계</span><span>${fmtMoney(totalExpenseSpent)} / ${fmtMoney(totalExpenseBudget)}원</span>
      </div>`}
    </div>
  `;
  page.querySelector('#prevYear').addEventListener('click', () => changeMonth(-12));
  page.querySelector('#nextYear').addEventListener('click', () => changeMonth(12));
  page.querySelector('#manageCatsBtn').addEventListener('click', () => openCatManageSheet(year));

  // 연도 레이블 클릭 → 연도 리스트 팝업
  page.querySelector('#budgetYearLabel').addEventListener('click', () => {
    const existing = document.getElementById('budgetYearPop');
    if (existing) { existing.remove(); return; }

    const years = allBudgetYears();
    // 목록에 없으면 최근 연도까지 포함해서 선택폭 넓혀줌
    for (let y = year - 5; y <= year + 1; y++) if (!years.includes(y)) years.push(y);
    years.sort((a,b) => a-b);

    const pop = document.createElement('div');
    pop.id = 'budgetYearPop';
    pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    pop.innerHTML = `
      <div style="background:var(--card);border-radius:20px;padding:20px;width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:14px;text-align:center;">연도 선택</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:260px;overflow-y:auto;">
          ${years.map(y => `
            <button data-year="${y}" style="padding:10px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${y===year?'700':'400'};background:${y===year?'var(--primary)':'var(--card)'};color:${y===year?'#fff':'var(--text-1)'};cursor:pointer;">${y}년</button>
          `).join('')}
        </div>
        <button id="budgetYearPopClose" style="width:100%;margin-top:16px;padding:11px;border-radius:12px;background:var(--surface-2);border:none;font-size:14px;font-weight:600;color:var(--text-1);">닫기</button>
      </div>`;
    document.body.appendChild(pop);

    pop.querySelectorAll('[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        const selYear = Number(btn.dataset.year);
        State.cursorDate = new Date(selYear, State.cursorDate.getMonth(), 1);
        pop.remove();
        renderBudget();
      });
    });
    pop.querySelector('#budgetYearPopClose').addEventListener('click', () => pop.remove());
    pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
  });

  // 대분류 접기/펼치기
  page.querySelectorAll('.budget-cat-header').forEach(el => {
    el.addEventListener('click', () => {
      const catId = el.dataset.catId;
      State.budgetExpanded[catId] = !State.budgetExpanded[catId];
      renderBudget();
    });
  });
  // 중분류 접기/펼치기
  page.querySelectorAll('.budget-group-header').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const groupKey = el.dataset.groupKey;
      State.budgetExpanded[groupKey] = !State.budgetExpanded[groupKey];
      renderBudget();
    });
  });
}

function budgetColor(pct) {
  if (pct < 70) return 'var(--income)';
  if (pct < 100) return '#F0A93A';
  return 'var(--expense)';
}

/* =========================================================
   RENDER: STATS (통계)
   ========================================================= */
/* =========================================================
   RENDER: STATS
   ========================================================= */

// 기간 계산: { start:'YYYY-MM-DD', end:'YYYY-MM-DD', label:string }
function statsPeriodRange() {
  const today = new Date();
  const todayStr = dateToStr(today);

  if (State.statsPeriod === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() + State.statsWeekOffset * 7);
    const day = d.getDay(); // 0=일
    const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7)); // 월요일
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const start = dateToStr(mon);
    const end   = dateToStr(sun);
    const label = `${mon.getMonth()+1}월 ${mon.getDate()}일 ~ ${sun.getMonth()+1}월 ${sun.getDate()}일`;
    return { start, end, label };
  }

  if (State.statsPeriod === 'month') {
    const d = new Date(State.cursorDate);
    const y = d.getFullYear(), m = d.getMonth();
    const start = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m+1, 0).getDate();
    const end   = `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const label = `${y}년 ${m+1}월`;
    return { start, end, label };
  }

  if (State.statsPeriod === 'year') {
    const y = today.getFullYear() + State.statsYearOffset;
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}년` };
  }

  if (State.statsPeriod === 'custom') {
    const s = State.statsCustomStart || todayStr;
    const e = State.statsCustomEnd   || todayStr;
    const sd = new Date(s), ed = new Date(e);
    const label = `${sd.getMonth()+1}월 ${sd.getDate()}일 ~ ${ed.getMonth()+1}월 ${ed.getDate()}일`;
    return { start: s, end: e, label };
  }

  return { start: todayStr, end: todayStr, label: '오늘' };
}

function txInPeriod(start, end) {
  return mainAcctTxs().filter(t => t.date >= start && t.date <= end);
}

// 통계 탭: 년월(또는 연도) 빠른 선택 팝업
function openStatsPeriodPicker() {
  const existing = document.getElementById('statsPeriodPickerPop');
  if (existing) { existing.remove(); return; }

  const isMonthMode = State.statsPeriod === 'month';
  const today = new Date();
  const curY = isMonthMode ? State.cursorDate.getFullYear() : (today.getFullYear() + State.statsYearOffset);
  const curM = isMonthMode ? State.cursorDate.getMonth() + 1 : null;

  // 현재 연도 기준 ±5년
  const years = [];
  for (let y = curY - 5; y <= curY + 1; y++) years.push(y);
  const months = Array.from({length: 12}, (_, i) => i + 1);

  const pop = document.createElement('div');
  pop.id = 'statsPeriodPickerPop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
  pop.innerHTML = `
    <div style="background:var(--card);border-radius:20px;padding:20px;width:300px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:14px;text-align:center;">${isMonthMode ? '날짜 이동' : '연도 이동'}</div>

      <div style="${isMonthMode ? 'margin-bottom:12px;' : 'margin-bottom:16px;'}">
        <div style="font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:600;">연도</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">
          ${years.map(y => `
            <button data-year="${y}" style="padding:8px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${y===curY?'700':'400'};background:${y===curY?'var(--primary)':'var(--card)'};color:${y===curY?'#fff':'var(--text-1)'};cursor:pointer;">${y}</button>
          `).join('')}
        </div>
      </div>

      ${isMonthMode ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:600;">월</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px;">
          ${months.map(m => `
            <button data-month="${m}" style="padding:8px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${m===curM?'700':'400'};background:${m===curM?'var(--primary)':'var(--card)'};color:${m===curM?'#fff':'var(--text-1)'};cursor:pointer;">${m}월</button>
          `).join('')}
        </div>
      </div>` : ''}

      <div style="display:flex;gap:8px;">
        <button id="statsPeriodPickerCancel" style="flex:1;padding:11px;border-radius:12px;background:var(--surface-2);border:none;font-size:14px;font-weight:600;color:var(--text-1);">취소</button>
        <button id="statsPeriodPickerOk" style="flex:1;padding:11px;border-radius:12px;background:var(--primary);border:none;font-size:14px;font-weight:700;color:#fff;">이동</button>
      </div>
    </div>`;

  document.body.appendChild(pop);

  let selYear = curY, selMonth = curM;

  // 연도 선택
  pop.querySelectorAll('[data-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      selYear = Number(btn.dataset.year);
      pop.querySelectorAll('[data-year]').forEach(b => {
        b.style.background = b.dataset.year == selYear ? 'var(--primary)' : 'var(--card)';
        b.style.color = b.dataset.year == selYear ? '#fff' : 'var(--text-1)';
        b.style.fontWeight = b.dataset.year == selYear ? '700' : '400';
      });
    });
  });

  // 월 선택 (월 모드에서만)
  if (isMonthMode) {
    pop.querySelectorAll('[data-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        selMonth = Number(btn.dataset.month);
        pop.querySelectorAll('[data-month]').forEach(b => {
          b.style.background = b.dataset.month == selMonth ? 'var(--primary)' : 'var(--card)';
          b.style.color = b.dataset.month == selMonth ? '#fff' : 'var(--text-1)';
          b.style.fontWeight = b.dataset.month == selMonth ? '700' : '400';
        });
      });
    });
  }

  pop.querySelector('#statsPeriodPickerCancel').addEventListener('click', () => pop.remove());
  pop.querySelector('#statsPeriodPickerOk').addEventListener('click', () => {
    if (isMonthMode) {
      State.cursorDate = new Date(selYear, selMonth - 1, 1);
    } else {
      State.statsYearOffset = selYear - today.getFullYear();
    }
    pop.remove();
    renderStats();
  });
  pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
}

/* =========================================================
   PRINT: 통계 인쇄 (A4)
   ========================================================= */
/* =========================================================
   EXCEL EXPORT — 개인별헌금 / 월지출 / 월장부
   ========================================================= */

// 1. 개인별헌금 엑셀 (수입 통계)
function exportPivotToExcel() {
  const range = statsPeriodRange();
  const list  = txInPeriod(range.start, range.end).filter(t => t.type === 'income');
  const heongCat = State.categories.find(c => c.name === '헌금' && c.type === 'income');
  if (!heongCat) { alert('헌금 카테고리가 없습니다.'); return; }

  const heongList = list.filter(t => t.categoryId === heongCat.id);
  const pivot = {};
  const colSet = new Set();
  for (const t of heongList) {
    const sgId = t.subGroupId || t.personId;
    const pName = sgId ? ((State.subGroups||[]).find(p=>p.id===sgId)||(State.persons||[]).find(p=>p.id===sgId)||{}).name||'(이름없음)' : '(이름없음)';
    if (!pivot[pName]) pivot[pName] = {};
    for (const l of (t.lines||[])) {
      const si = subItemById(l.subItemId);
      const sName = si ? si.name : '(기타)';
      pivot[pName][sName] = (pivot[pName][sName]||0) + l.amount;
      colSet.add(sName);
    }
  }
  const rows = Object.keys(pivot).sort((a,b)=>a.localeCompare(b,'ko'));
  const orderedCols = [
    ...TX_ENTRY_ITEM_ORDER.filter(n=>colSet.has(n)),
    ...[...colSet].filter(n=>!TX_ENTRY_ITEM_ORDER.includes(n)).sort()
  ];
  const colTotals = orderedCols.map(col => rows.reduce((s,r)=>s+(pivot[r][col]||0),0));
  const grandTotal = colTotals.reduce((s,v)=>s+v,0);

  const aoa = [];
  aoa.push([`헌금 개인별 명세 — ${range.label}`]);
  aoa.push(['이름', ...orderedCols, '합계']);
  for (const name of rows) {
    const rowTotal = orderedCols.reduce((s,c)=>s+(pivot[name][c]||0),0);
    aoa.push([name, ...orderedCols.map(c=>pivot[name][c]||''), rowTotal]);
  }
  aoa.push(['합계', ...colTotals, grandTotal]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 숫자 열 서식
  const numFmt = '#,##0';
  for (let r = 2; r < aoa.length; r++) {
    for (let c = 1; c < aoa[r].length; c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = numFmt;
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, '개인별헌금');
  XLSX.writeFile(wb, `개인별헌금_${range.label}.xlsx`);
}

// 2. 월지출 엑셀
function exportExpenseToExcel() {
  const range = statsPeriodRange();
  const list  = txInPeriod(range.start, range.end).filter(t => t.type === 'expense');
  const expCats = State.categories.filter(c=>c.type==='expense').sort((a,b)=>(a.order||0)-(b.order||0));
  const expPivot = {};
  for (const t of list) {
    if (!expPivot[t.categoryId]) expPivot[t.categoryId] = {};
    for (const l of (t.lines||[])) {
      expPivot[t.categoryId][l.subItemId] = (expPivot[t.categoryId][l.subItemId]||0) + l.amount;
    }
  }
  const usedCats = expCats.filter(c => expPivot[c.id]);
  const depositCat = State.categories.find(c=>c.type==='expense'&&c.name==='예금');
  const depositTotal = depositCat && expPivot[depositCat.id]
    ? Object.values(expPivot[depositCat.id]).reduce((s,v)=>s+v,0) : 0;

  const aoa = [];
  aoa.push([`${range.label} 지출현황`]);
  aoa.push(['대분류','중분류','소분류','금액(원)','비고/잔액']);
  const acctBalanceMap = calcAcctBalanceMap();

  let grandTotal = 0;
  for (const cat of usedCats) {
    const catPivot = expPivot[cat.id];
    const isDepositCat = depositCat && cat.id === depositCat.id;
    const allSubs = State.subItems.filter(s=>s.categoryId===cat.id).sort((a,b)=>(a.order||0)-(b.order||0));
    const sgMap = new Map();
    const direct = [];
    for (const s of allSubs) {
      if (!catPivot[s.id]) continue;
      if (s.subGroupId) {
        const sg = (State.subGroups||[]).find(g=>g.id===s.subGroupId);
        const sgName = sg ? sg.name : s.name;
        if (!sgMap.has(s.subGroupId)) sgMap.set(s.subGroupId, {name:sgName, items:[]});
        sgMap.get(s.subGroupId).items.push(s);
      } else { direct.push(s); }
    }
    let catTotal = 0;
    let catFirst = true;
    for (const [,grp] of sgMap) {
      let grpFirst = true;
      for (const s of grp.items) {
        const amt = catPivot[s.id]||0;
        const remark = isDepositCat && acctBalanceMap[s.name] !== undefined
          ? acctBalanceMap[s.name].toLocaleString('ko-KR') + '원' : '';
        aoa.push([catFirst?cat.name:'', grpFirst?grp.name:'', s.name, amt, remark]);
        catFirst = false; grpFirst = false; catTotal += amt;
      }
    }
    for (const s of direct) {
      const amt = catPivot[s.id]||0;
      const remark = isDepositCat && acctBalanceMap[s.name] !== undefined
        ? acctBalanceMap[s.name].toLocaleString('ko-KR') + '원' : '';
      aoa.push([catFirst?cat.name:'', '', s.name, amt, remark]);
      catFirst = false; catTotal += amt;
    }
    aoa.push(['', '소 계', '', catTotal, '']);
    grandTotal += catTotal;
  }
  aoa.push(['합  계', '', '', grandTotal, '']);
  aoa.push(['순지출(지출-예금)', '', '', grandTotal-depositTotal, '']);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── 열 너비 (문자 길이 기반 고정) ──
  ws['!cols'] = [
    {wch: 14},  // 대분류
    {wch: 14},  // 중분류
    {wch: 22},  // 소분류
    {wch: 16},  // 금액(원)
    {wch: 18},  // 비고
  ];

  // ── 스타일 헬퍼 ──
  const borderStyle = { style: 'thin', color: { rgb: 'CCCCCC' } };
  const allBorder = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  const headerFill   = { patternType: 'solid', fgColor: { rgb: '1F4E79' } }; // 진파란
  const subHdrFill   = { patternType: 'solid', fgColor: { rgb: '2E74B5' } }; // 중간파란
  const catFill      = { patternType: 'solid', fgColor: { rgb: 'EBF3FB' } }; // 연파란
  const grpFill      = { patternType: 'solid', fgColor: { rgb: 'DEEAF1' } };
  const itemFill     = { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } };
  const subtotalFill = { patternType: 'solid', fgColor: { rgb: 'D6E4F0' } };
  const totalFill    = { patternType: 'solid', fgColor: { rgb: '1F4E79' } };

  const whiteFont  = { bold: true, color: { rgb: 'FFFFFF' } };
  const boldFont   = { bold: true };
  const numFmt     = '#,##0';

  const makeStyle = (fill, font={}, right=false, numFmtStr='') => ({
    fill, font,
    alignment: { horizontal: right ? 'right' : 'center', vertical: 'center', wrapText: false },
    border: allBorder,
    numFmt: numFmtStr || undefined
  });

  // ── 셀 스타일 적용 ──
  const totalRowCount = aoa.length;

  for (let r = 0; r < totalRowCount; r++) {
    for (let c = 0; c < 5; c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      if (!ws[addr]) ws[addr] = {t:'s', v:''};

      if (r === 0) {
        // 제목행
        ws[addr].s = { font: { bold:true, sz:14 }, alignment: { horizontal:'center' } };
      } else if (r === 1) {
        // 헤더행
        ws[addr].s = { fill: headerFill, font: whiteFont, border: allBorder,
          alignment: { horizontal:'center', vertical:'center' } };
      } else {
        const rowData = aoa[r];
        const isTotal   = rowData[0] === '합  계' || rowData[0] === '순지출(지출-예금)';
        const isSubtotal = rowData[1] === '소 계';
        if (isTotal) {
          ws[addr].s = { fill: totalFill, font: whiteFont, border: allBorder,
            alignment: { horizontal: c===3 ? 'right':'center', vertical:'center' },
            numFmt: c===3 ? numFmt : undefined };
        } else if (isSubtotal) {
          ws[addr].s = { fill: subtotalFill, font: boldFont, border: allBorder,
            alignment: { horizontal: c===3 ? 'right':'left', vertical:'center' },
            numFmt: c===3 ? numFmt : undefined };
        } else {
          // 데이터행
          let fill = {};
          if (c===0 && rowData[0]) fill = catFill;
          else if (c===1 && rowData[1]) fill = grpFill;
          else if (c===2) fill = itemFill;
          ws[addr].s = { fill, border: allBorder,
            alignment: { horizontal: c===3 ? 'right':'left', vertical:'center' },
            numFmt: c===3 ? numFmt : undefined };
        }
        if (c===3 && typeof ws[addr].v === 'number') ws[addr].z = numFmt;
      }
    }
  }

  // ── 제목행 병합 ──
  ws['!merges'] = ws['!merges'] || [];
  ws['!merges'].push({ s:{r:0,c:0}, e:{r:0,c:4} });

  // ── 인쇄 설정: 반복 헤더(row 1), A4 맞춤 ──
  ws['!printHeader'] = { firstRow: 1, lastRow: 1 };
  ws['!pageSetup'] = {
    paperSize: 9,           // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws['!sheetPr'] = { pageSetup: { fitToPage: true } };

  // ── 결재란 이미지 삽입 ──
  const approvalB64 = 'iVBORw0KGgoAAAANSUhEUgAAARwAAABjCAMAAAB+KU9yAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAL9UExURQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOafOxsAAAD/dFJOUwpEU1VUUEpMS0USACXg2Ly/1O3FvuLkw+vTu9U9KOdfDhNzLRG1Ltp1DWjyQuNm5havtxrXWfVRahwBsbgfa130GzMPMh4ECRU0FAwhBSsnNZO6oH6rTXy2rEdXhJ8IkjGUnCYCeq1eF1xPWgZhbWVkg1sLov9ABy8jHSIpSWNIaXma6c8Df3QQpiw6PLmbhffSjYiGO4yujnjze8mkqsLucszGo6nBNvjqWI+B/qGWnrI5pbOKp9mC1s37OD4gx4Dfyxj5Vnbvi86wxJfomcC9QbQk3ipuMGIZnYn8kZCVmMpw4WBnbHc/h/3syPB98U7QcVI39kPlb/rbqNHdRpYUjM4AAAAJcEhZcwAAFxEAABcRAcom8z8AAAqxSURBVHhe7Z17XEx5H8dHNVv66iJdUDExRUR5FKZWdL8oZaUol2RKtYnUSDeSUrEPVsITS20uIfdbRHJpUblt6065rLBYFrub53k8r+d1ppnpnN+c+Zma/nj29fze/8w5n+/pzDnvfud7zszr1S8Op4uauoYSqHO/UG5DZdHURBNVUFfT4nbm4amrddUGTjcdXT19JdDrbtBDqQ2Vw9DQyNjQEE07jp5Jz16deHj6vU2NzYBj3qcvz0IJeP369FdqQ+XgW1jq8flo2nF4VgMGduLhWVgPGmwDHPMhmqAUQ23t0Eglhv0NTVRiuP0gNFIJhxFiOSPRnJ1RtgI0UgVHpy/RSCVG6zqjkUqMGUvkKAQrx8XVwpERKJbj5u7hiWZ0rNnqGDle3sx3RnHx8UUjNjkC9AzGufv5MwIEz/EBXrIVrJzACV9NHE8PFMvxDrKcFIyGNLRDJk8JRUM2Od5hWt2ok586zXk6WqMROOOrieFoKC/HZ6ZexKzWRaGHNQDYRTpFzRYCQHSMuhY3lqvx9RgHeh+NmxNlGS/VxyZn+Nx5DjFD4xPmQ2KSaAG9IicneWGKRWpaemBGuNciUQKzRuG/MMU3NS3dZ3G4V6YoEq2yyeEtGZFFvS5cms1BawA53H5jYhZlLsvl5OWL5H6jMjkWPgLv0SnLV2il8qeIvmnNBH/XD6CO2EG0khpM/FWrv11TsGptge5Sye9/+BhXayHkFI4wpORRsMnRXrd+w9R/9BZNyOMnFPnQK3Jyxm3c1OO7mRGbt2RCeHEJs0bB2fh96daZEdu2Z8KOsni0yiYHfHWy40uWhEzdqZeMlgBg15Td5QOdRJPiYOOeLmhRJidgb7ZexL79B3ofhGVl/anEc96wQ5MOL3MD6G9wRLxN6pBt4tejxyQjh1+x8xAfgHfcSbo/NjkgTAawMDE+vHLGiWK8HEg8UBk8OlXgkggni9cs1zSTSpfVLVdnUHUOnFo9MLHKg1FnleN97PTcRXP6OhsZssmBHABrE93xANV7QuO0eYxa22WVcuZs+miB4JwnVJyvcR9pBfOKfpgOsRf2eUJg8UXxJnmXasWvk+ukI9RBtD8OwE4XL4dqsJbfLjc39y4oCqSn8nKg3iCldWGFQfbWuiBUDtRfrmpd2DG29MrVis/LsdOJiONY86p6XZPv4GLGRe25DgAhoqisL9UYlTY5cT0mS5bKRT9u3lIjNDlDdbDaEQ0yOXH6O3P7hZQX6Px0o3XLZL3jHtT760ZJflSRHL/a7aE3S5ydrxXfoscscvYXN0AO3zz0dsT5ars7VM9jcvcy9Y6Jadfv3X9QaCYRKYFVjsUx08am+offFTWhlVZS1m/a1uQDECSq1uSmMkptcqwfTQbwj144MvP04C520cnC3efDhOBuvJ0PgcWtlxXcfKD1uOxwRkZoYut6pmi9uGWbmpip1+RRCascx1i9I17gXPJ18LQn1KnJYJFTL6ov2Lv1SnXsz4OfojWKiPvNu57trt/gHHJ+LlpjlQO7nvtVCe6kLvAAEOagxWSH7U3eXi/s611CfilEi21yvExeJkxI2ttUYhNxgWrDoP3QNKvx1eEAgMDXvwLcSfXl++Z5hr+5wvN16V/4dhaAq9GRi3rpAHa/Xb57eII29UNsclwL7s5xDehW5dfNfGgS43GCRY7Z/pnvRrpqA6Q9+gKtUbx/dS1pbd9QcwivvI3W5OVcfzZvPjeYG6ul/vOi3KkzkxjjFgDcJ+yNpV7jnQRL9pxEivRbedihI08z0scBzK07Jw6EH+aHFVIXasDZMID4TQeSmhqPzNy++d7uffmTSzXhxukZ/on7TTWEvvaWvLzWNsQiJydDw806q3ZDRVBk0Nntd2gVNjng6BCvEdP3aW7BJKoTyKPtOx1gjO7Qhn3uaElezuIf8x9UL3k84/fap83vciOfMS8bgMDgcdSLZ8KlFWpJ0UiR8ZzjPWqO+uw5zs8eZknPQM255vbczNwX1POWH/ePFVbpAX6+wxv8UlNdBF7PJ2/MAYjbu6evm/0w6T5Y5FAkWt0QnIvW9vitF+N+wCYHYnv+Wd1ys7n2I7M70kivn5g1MV8LjVnkOHolU1fSqfsDkQKDrklZV5L270BjhhyvSNGrkpbmfv8cIBEsfGvbs7ylJfNfZbPF62EJ8c6jbt4sWZXfBeDc1Pfi0DfSlW//ubtV4MT1Wes2bGj6t2HroJTAKsezLpu6EyxafRCtSMjr0T0N3KL6iB846MjLkbCg7Bka0bBaeogHadmvsCMHZr0Wd3TLXpJ+C2CpS10tNYO7iteet4Rl2Jh9sHosagbwaruT2Omuly4qkONfLtqYvvyGedUdoH82YZWTc6C7GwC867kQrUjo9vtRAOgnkhtZCuVcX52LRjTCRJkAkC9yRQsMOSm2EdQAMtwk+xSydQDVZocaMIecTdlQxnr08UPSRQVyYJeosasW12FQRTz9UYxVDqysXJOwbnfdm9bhKs/0lW+a09R0StEGoliOzflRaEQjtc6e2zDqwl5x+6HDkHPn009BBeseGn0ylyb3zjcmrNugX8Tc938+zmesW/S6Il1UJKdh37R1F+9dbEx699mRA083a2gGv9UMbkALUtwG1ubXrmE+41AolBO4hfGRDsVvzbB8px+YT8cUDDm8iAnBwcFvtULFjywUuybVUMepKb63y1h4lDniE7c9li4qkgPg6Sn3tKtATmLbh3xF8PxYvmFQLGe6APu9AoBvFXUlozDkOOahD0lesu5Dx5/H/FLDUSCzqVgOG+xyOoxCOR1E/isL1SByMBA5GNop808LNFKJ9ZZoohLRx5l3ZVUJa5ecQS8zrFw7jVvuV0tvhaNpx+n/xZkX49FQBcx/LbreDjnz9tifyO40Ll16PfgSGqrAie5lRmfRUAUeDXn9vB1yBhmM/PBNp3GwcMurgyvQtOPseK9z0QcNVcC1ol0jp7N7TlTn9hy743JfGalETbt6DrlbYSByMBA5GIgcDEQOBiIHA5GDgcjBQORgIHIwEDkYiBwMRA4GIgcDkYOByMFA5GAgcjAQORiIHAxEDgYiBwORg4HIwUDkYCByMBA5GIgcDEQOBiIHA5GDgcjBQORgIHIwEDkYiBwMRA4GIgcDkYOByMFA5GAgcjAQORiIHAxEDgYiBwORg4HIocH3YP7hOpEjQWg2Mp07cVIzfUI6IkdKoZNtiZWtKX0aLiIHUkILTx48peFrI1oCvUvjaBUiB1bkz3jWcuLjB9fKd576pZ+fIqbD/BXlOFpzcqouX/N8XhkPvYkc+Z6z1vYk2FROvXGijshB5Sz+ZRg1/9H3d9/ok56DyNnRa0ZSU+KHynKXuh5k5DDldLlaAi6Glo9HxMM10nMYcuJmR4UBQP9hTUUt5G6FyMmLaZ3xy79LWWbOVRP63LJEjmx+rwVjY4SGerQKkdOG2eC38KVsLkoKIkdGVXUKTFtDT4gcOo4Bn5sPWRX+4nIQ/j/lcNGcnUzb4WikErWd+79mUnVxU5q2nxixHKMMNGfntvH/9LRU0aadOy2V+tg/gDOrT1RIhRJstBzbuAwNO055+bFP5dVo2nGCGl9aKnUeShLpVLQAOKNN/jRShidLXxs/QcOO88So2KATd2f0xPh1n87cn85L40L4LxLc7OrS+NG9AAAAAElFTkSuQmCC';

  if (wb.Workbook) wb.Workbook.Sheets = wb.Workbook.Sheets || [];
  // 이미지 삽입 (xlsx-js-style 또는 SheetJS Pro 전용이므로 대체: 이미지 데이터를 별도 시트 메타로 저장)
  // SheetJS community edition은 이미지 직접 삽입 미지원 → 결재란을 마지막 행 아래 텍스트로 처리
  // 단, 이미지를 별도 PNG 파일로 함께 제공하고 결재란 위치 안내 주석 삽입
  const lastDataRow = aoa.length; // 0-indexed 마지막 데이터행 다음
  // 결재란 안내 텍스트 (이미지는 엑셀에서 수동 삽입 필요 시 참고)
  const approvalRow = lastDataRow + 2; // 2행 띄움
  const apAddr = XLSX.utils.encode_cell({r: approvalRow, c: 3});
  ws[apAddr] = { t: 's', v: '※ 결재란 이미지는 파일과 함께 제공된 approval_stamp.png 를 삽입하세요', s: { font: { color: { rgb: '888888' }, italic: true }, alignment: { horizontal: 'left' } } };

  if (!ws['!ref']) ws['!ref'] = 'A1:E1';
  const ref = XLSX.utils.decode_range(ws['!ref']);
  ref.e.r = Math.max(ref.e.r, approvalRow);
  ws['!ref'] = XLSX.utils.encode_range(ref);

  XLSX.utils.book_append_sheet(wb, ws, '월지출');

  // 결재란 이미지를 별도 PNG로도 저장 (Blob URL 다운로드)
  try {
    const byteChars = atob(approvalB64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i=0; i<byteChars.length; i++) byteArr[i]=byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], {type:'image/png'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'approval_stamp.png';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch(e) {}

  XLSX.writeFile(wb, `월지출_${range.label}.xlsx`);
}

// 3. 월장부 엑셀
function exportLedgerToExcel(ym) {
  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr), month = parseInt(monthStr);
  const txs = State.transactions.filter(t=>t.date.startsWith(ym))
    .sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));

  let running = 0;
  const allSorted = [...State.transactions].sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
  for (const t of allSorted) {
    if (t.date >= ym) break;
    running += t.type==='income' ? t.amount : -t.amount;
  }

  // ── rows 구성 (renderLedger와 동일) ──
  const rows = [];
  for (const t of txs) {
    const cat = txCatInfo(t);
    const sgName = txSubGroupName(t) || '';
    const lines = (t.lines&&t.lines.length>0) ? t.lines : [{subItemId:null,amount:t.amount}];
    for (const l of lines) {
      const si = l.subItemId ? subItemById(l.subItemId) : null;
      const siRawName = txLineName(l);
      const siName = (l.subItemId || l.subItemName) ? subItemDisplayName(cat.type, cat.name, siRawName) : '';
      const hasGroups = subGroupsOfCategory(cat.id).length > 0;
      const major = hasGroups ? sgName : (si&&si.subGroupId?((State.subGroups||[]).find(g=>g.id===si.subGroupId)||{}).name||'':'');
      running += t.type==='income' ? l.amount : -l.amount;
      // 일자: YY-MM-DD 형식  (2026-06-04 → 26-06-04)
      const yy = String(year).slice(2);
      const dateFmt = `${yy}-${t.date.slice(5,7)}-${t.date.slice(8,10)}`;
      rows.push({ date:dateFmt, cat:cat.name, major, minor:siName,
        income:  t.type==='income'  ? l.amount : null,
        expense: t.type==='expense' ? l.amount : null,
        acc: running });
    }
  }

  // 결산
  const inc = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const tongCat = State.categories.find(c=>c.name==='통장이동');
  const transfer = tongCat ? txs.filter(t=>t.categoryId===tongCat.id&&t.type==='income').reduce((s,t)=>s+t.amount,0) : 0;
  const depCat = State.categories.find(c=>c.name==='예금'&&c.type==='expense');
  const deposit = depCat ? txs.filter(t=>t.categoryId===depCat.id).reduce((s,t)=>s+t.amount,0) : 0;

  // ── AOA ──
  const aoa = [];
  aoa.push(['일자','대분류','중분류','소분류','수입금액','지출금액','누계금액']);
  const dataStartRow = 1;
  for (const r of rows) {
    aoa.push([r.date, r.cat, r.major, r.minor,
      r.income ?? '', r.expense ?? '', r.acc]);
  }
  const summaryStartRow = aoa.length;
  aoa.push([`${month}월 결산`,'','수입/지출','',  inc,          exp,         '']);
  aoa.push(['',               '','통장이동(선교)','',transfer,   '',          '']);
  aoa.push(['',               '','예금',       '', '',           deposit,     '']);
  aoa.push(['',               '','순헌금/지출', '', inc-transfer, exp-deposit, '']);
  const totalRows = aoa.length;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── 열 너비 (줄임) ──
  ws['!cols'] = [{wch:8},{wch:11},{wch:11},{wch:14},{wch:11},{wch:11},{wch:13}];

  // ── 스타일 상수 ──
  const numFmt   = '#,##0';
  const gBdr = {style:'thin',color:{rgb:'CCCCCC'}};
  const allGray = {top:gBdr,bottom:gBdr,left:gBdr,right:gBdr};

  // 색상
  const TITLE_FILL = {patternType:'solid',fgColor:{rgb:'1F4E79'}};
  const HDR_FILL   = {patternType:'solid',fgColor:{rgb:'BDD7EE'}}; // 옅은 파랑
  const SUM_FILLS  = [
    {patternType:'solid',fgColor:{rgb:'2E75B6'}},  // 수입/지출 파랑
    {patternType:'solid',fgColor:{rgb:'E2EFDA'}},  // 통장이동 연두
    {patternType:'solid',fgColor:{rgb:'FCE4D6'}},  // 예금 연주황
    {patternType:'solid',fgColor:{rgb:'FFF2CC'}},  // 순헌금 연노랑
  ];
  const whiteFont  = {bold:true, color:{rgb:'FFFFFF'}};
  const boldFont   = {bold:true};
  const blueFont   = {color:{rgb:'1F497D'}};
  const redFont    = {color:{rgb:'CC0000'}};
  const normFont   = {};

  const sc = (r,c,v) => {
    const addr = XLSX.utils.encode_cell({r,c});
    if(!ws[addr]) ws[addr]={t:'s',v:''};
    if(v!==undefined) Object.assign(ws[addr], v);
  };

  if(!ws['!merges']) ws['!merges']=[];

  // row0: 헤더 (옅은 파랑)
  const hdrAligns = ['center','left','left','left','right','right','right'];
  for(let c=0;c<7;c++) {
    const addr=XLSX.utils.encode_cell({r:0,c});
    if(!ws[addr]) ws[addr]={t:'s',v:''};
    ws[addr].s={fill:HDR_FILL,font:boldFont,border:allGray,
      alignment:{horizontal:hdrAligns[c],vertical:'center'}};
  }

  // 데이터행
  for(let r=dataStartRow;r<summaryStartRow;r++) {
    for(let c=0;c<7;c++) {
      const addr=XLSX.utils.encode_cell({r,c});
      if(!ws[addr]) ws[addr]={t:'s',v:''};
      const v=ws[addr].v;
      const isNum=typeof v==='number';
      let font=normFont, halign='left';
      if(c===0) halign='center';
      if(c===4) { font=blueFont; halign='right'; }
      if(c===5) { font=redFont;  halign='right'; }
      if(c===6) halign='right';
      ws[addr].s={font,border:allGray,
        alignment:{horizontal:halign,vertical:'center'},
        ...(isNum&&c>=4?{numFmt}:{})};
      if(isNum&&c>=4) ws[addr].z=numFmt;
    }
  }

  // 결산행 (4행): A+B 병합, C+D 병합, 색상 시각화
  const sumLabels  = ['수입/지출','통장이동(선교)','예금','순헌금/지출'];
  const sumMonths  = [`${month}월 결산`,'','',''];
  for(let si=0;si<4;si++) {
    const r=summaryStartRow+si;
    const fill=SUM_FILLS[si];
    const isHdr=(si===0);
    const fnt=isHdr?whiteFont:boldFont;
    // A+B 병합
    ws['!merges'].push({s:{r,c:0},e:{r,c:1}});
    const addrA=XLSX.utils.encode_cell({r,c:0});
    if(!ws[addrA]) ws[addrA]={t:'s',v:sumMonths[si]};
    ws[addrA].s={fill,font:fnt,border:allGray,
      alignment:{horizontal:'left',vertical:'center'}};
    // C+D 병합
    ws['!merges'].push({s:{r,c:2},e:{r,c:3}});
    const addrC=XLSX.utils.encode_cell({r,c:2});
    if(!ws[addrC]) ws[addrC]={t:'s',v:sumLabels[si]};
    ws[addrC].s={fill,font:fnt,border:allGray,
      alignment:{horizontal:'left',vertical:'center'}};
    // B셀(병합 뒤) 빈 스타일
    const addrB=XLSX.utils.encode_cell({r,c:1});
    if(!ws[addrB]) ws[addrB]={t:'s',v:''};
    ws[addrB].s={fill,border:allGray};
    const addrD=XLSX.utils.encode_cell({r,c:3});
    if(!ws[addrD]) ws[addrD]={t:'s',v:''};
    ws[addrD].s={fill,border:allGray};
    // E: 수입, F: 지출, G: 빈
    for(const [ci,fntCol] of [[4,isHdr?'FFFFFF':'1F497D'],[5,isHdr?'FFFFFF':'CC0000'],[6,isHdr?'FFFFFF':'000000']]) {
      const addr=XLSX.utils.encode_cell({r,c:ci});
      if(!ws[addr]) ws[addr]={t:'s',v:''};
      const isNum=typeof ws[addr].v==='number';
      ws[addr].s={fill,font:{bold:isHdr,color:{rgb:fntCol}},border:allGray,
        alignment:{horizontal:'right',vertical:'center'},
        ...(isNum?{numFmt}:{})};
      if(isNum) ws[addr].z=numFmt;
    }
  }

  // ── 인쇄 설정: A4 세로 ──
  ws['!pageSetup']={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};

  const sheetName = `${month}월장부`;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // 반복 인쇄 헤더: _xlnm.Print_Titles + Sheet 인덱스 (xlsx-js-style 방식)
  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Names) wb.Workbook.Names = [];
  wb.Workbook.Names = wb.Workbook.Names.filter(n => n.Name !== '_xlnm.Print_Titles');
  wb.Workbook.Names.push({
    Name: '_xlnm.Print_Titles',
    Ref: `'${sheetName}'!$1:$1`,   // 헤더 1행만 반복
    Sheet: 0
  });

  XLSX.writeFile(wb, `월장부_${ym}.xlsx`);
}

/* =========================================================
   STATS [리스트] 탭 — 기간(주간/월간/연간/기간설정)에 맞춰
   월단위로 묶은 장부 리스트 (구 설정 > 월장부를 통계로 이동)
   ========================================================= */
// 선택된 기간(range.start~range.end) 내 거래를 월(YYYY-MM) 단위로 묶어
// 각 월별 행(rows) + 결산(inc/exp/transfer/deposit)을 구성한다.
// ※ 재정계정(대표계정) 거래만 대상으로 한다 — 다른 연동계좌 거래는 제외
function prepareLedgerSections(range) {
  const { start, end } = range;

  // 기간 시작 이전 누계 (재정계정 전체 거래이력 기준, 기존 월장부와 동일한 누계 산식 유지)
  let running = 0;
  const allSorted = [...mainAcctTxs()].sort((a,b) => a.date.localeCompare(b.date) || (a.createdAt||0)-(b.createdAt||0));
  for (const t of allSorted) {
    if (t.date >= start) break;
    running += t.type === 'income' ? t.amount : -t.amount;
  }

  // 기간 내 거래만, 날짜순
  const txs = allSorted.filter(t => t.date >= start && t.date <= end);

  // 월(YYYY-MM) 단위 그룹화 — 단위는 항상 월단위 고정
  const monthMap = new Map();
  for (const t of txs) {
    const ym = t.date.slice(0,7);
    if (!monthMap.has(ym)) monthMap.set(ym, []);
    monthMap.get(ym).push(t);
  }

  const sections = [];
  for (const ym of [...monthMap.keys()].sort()) {
    const [yearStr, monthStr] = ym.split('-');
    const year = parseInt(yearStr), month = parseInt(monthStr);
    const monthTxs = monthMap.get(ym);

    const rows = [];
    for (const t of monthTxs) {
      const cat = txCatInfo(t);
      const sgName = txSubGroupName(t) || '';
      const lines = (t.lines && t.lines.length > 0) ? t.lines : [{subItemId:null, amount:t.amount}];
      for (const l of lines) {
        const si = l.subItemId ? subItemById(l.subItemId) : null;
        const siRawName = txLineName(l);
        const siName = (l.subItemId || l.subItemName) ? subItemDisplayName(cat.type, cat.name, siRawName) : '';
        const hasGroups = subGroupsOfCategory(cat.id).length > 0;
        const major = hasGroups ? sgName : (si && si.subGroupId ? ((State.subGroups||[]).find(g=>g.id===si.subGroupId)||{}).name||'' : '');
        running += t.type === 'income' ? l.amount : -l.amount;
        rows.push({
          date: t.date, cat: cat.name, major, minor: siName,
          income: t.type === 'income' ? l.amount : null,
          expense: t.type === 'expense' ? l.amount : null,
          acc: running,
        });
      }
    }

    const inc = monthTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp = monthTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const tongCat = State.categories.find(c=>c.name==='통장이동');
    const transfer = tongCat ? monthTxs.filter(t=>t.categoryId===tongCat.id&&t.type==='income').reduce((s,t)=>s+t.amount,0) : 0;
    const depCat = State.categories.find(c=>c.name==='예금'&&c.type==='expense');
    const deposit = depCat ? monthTxs.filter(t=>t.categoryId===depCat.id).reduce((s,t)=>s+t.amount,0) : 0;

    sections.push({ ym, year, month, rows, inc, exp, transfer, deposit });
  }
  return sections;
}

// 화면용 HTML — 월별 장부 테이블을 기간 순서대로 이어붙임
function buildLedgerSectionsHTML(range) {
  const sections = prepareLedgerSections(range);
  if (sections.length === 0) {
    return `<div style="text-align:center;padding:50px 0;color:var(--text-3);font-size:13px;">해당 기간에 거래 내역이 없습니다.</div>`;
  }

  const TD = 'padding:5px 6px;border:1px solid var(--border);font-size:12px;';
  const TH = 'padding:6px;border:1px solid var(--border);font-size:12px;font-weight:700;background:var(--primary-light);';
  const SUM = 'padding:5px 6px;border:1px solid var(--border);font-size:12px;font-weight:700;background:var(--bg);';
  const colgroup = `<colgroup>
    <col style="width:13%"><col style="width:16%"><col style="width:16%">
    <col style="width:19%"><col style="width:16%"><col style="width:16%"><col style="width:18%">
  </colgroup>`;

  return sections.map(sec => {
    const dataRows = sec.rows.map(r => `<tr>
      <td style="${TD}text-align:center;">${r.date.slice(5)}</td>
      <td style="${TD}">${escapeHTML(r.cat)}</td>
      <td style="${TD}">${escapeHTML(r.major)}</td>
      <td style="${TD}">${escapeHTML(r.minor)}</td>
      <td style="${TD}text-align:right;color:var(--income);">${r.income ? r.income.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD}text-align:right;color:var(--expense);">${r.expense ? '-'+r.expense.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD}text-align:right;">${r.acc.toLocaleString('ko-KR')}</td>
    </tr>`).join('');

    const summaryRows = [
      [sec.month+'월 결산', '수입/지출', sec.inc, sec.exp],
      [null, '통장이동(선교)', sec.transfer, null],
      [null, '예금', null, sec.deposit],
      [null, '순헌금/지출', sec.inc-sec.transfer, sec.exp-sec.deposit],
    ].map(([c1,c2,iv,ev]) => `<tr>
      <td colspan="2" style="${SUM}">${escapeHTML(c1||'')}</td>
      <td colspan="2" style="${SUM}">${escapeHTML(c2)}</td>
      <td style="${SUM}text-align:right;color:var(--income);">${iv ? iv.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM}text-align:right;color:var(--expense);">${ev ? '-'+ev.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM}"></td>
    </tr>`).join('');

    return `
      <div style="margin-bottom:20px;">
        <div style="font-weight:800;font-size:15px;color:var(--text-1);margin:0 0 8px 2px;">${sec.year}년 ${sec.month}월</div>
        <div style="overflow-x:auto;border-radius:var(--radius-sm);box-shadow:var(--shadow);">
          <table style="border-collapse:collapse;width:100%;min-width:520px;table-layout:fixed;background:var(--card);">
            ${colgroup}
            <thead><tr>
              <th style="${TH}text-align:center;">일자</th>
              <th style="${TH}">대분류</th>
              <th style="${TH}">중분류</th>
              <th style="${TH}">소분류</th>
              <th style="${TH}text-align:right;">수입금액</th>
              <th style="${TH}text-align:right;">지출금액</th>
              <th style="${TH}text-align:right;">누계금액</th>
            </tr></thead>
            <tbody>${dataRows || `<tr><td colspan="7" style="${TD}text-align:center;color:var(--text-3);padding:14px;">내역 없음</td></tr>`}</tbody>
            <tbody>${summaryRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

// 엑셀용 — 월별 섹션 하나당 워크시트 한 장 (기존 월장부 엑셀 스타일 동일)
function buildLedgerWorksheet(section) {
  const { year, month, rows, inc, exp, transfer, deposit } = section;
  const yy = String(year).slice(2);

  const aoa = [];
  aoa.push(['일자','대분류','중분류','소분류','수입금액','지출금액','누계금액']);
  for (const r of rows) {
    const dateFmt = `${yy}-${r.date.slice(5,7)}-${r.date.slice(8,10)}`;
    aoa.push([dateFmt, r.cat, r.major, r.minor, r.income ?? '', r.expense ?? '', r.acc]);
  }
  const summaryStartRow = aoa.length;
  aoa.push([`${month}월 결산`,'','수입/지출','',  inc,          exp,         '']);
  aoa.push(['',               '','통장이동(선교)','',transfer,   '',          '']);
  aoa.push(['',               '','예금',       '', '',           deposit,     '']);
  aoa.push(['',               '','순헌금/지출', '', inc-transfer, exp-deposit, '']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:8},{wch:11},{wch:11},{wch:14},{wch:11},{wch:11},{wch:13}];

  const numFmt = '#,##0';
  const gBdr = {style:'thin',color:{rgb:'CCCCCC'}};
  const allGray = {top:gBdr,bottom:gBdr,left:gBdr,right:gBdr};
  const HDR_FILL  = {patternType:'solid',fgColor:{rgb:'BDD7EE'}};
  const SUM_FILLS = [
    {patternType:'solid',fgColor:{rgb:'2E75B6'}},
    {patternType:'solid',fgColor:{rgb:'E2EFDA'}},
    {patternType:'solid',fgColor:{rgb:'FCE4D6'}},
    {patternType:'solid',fgColor:{rgb:'FFF2CC'}},
  ];
  const whiteFont = {bold:true, color:{rgb:'FFFFFF'}};
  const boldFont  = {bold:true};
  const blueFont  = {color:{rgb:'1F497D'}};
  const redFont   = {color:{rgb:'CC0000'}};
  const normFont  = {};

  if (!ws['!merges']) ws['!merges'] = [];

  const hdrAligns = ['center','left','left','left','right','right','right'];
  for (let c=0;c<7;c++) {
    const addr = XLSX.utils.encode_cell({r:0,c});
    if (!ws[addr]) ws[addr] = {t:'s',v:''};
    ws[addr].s = {fill:HDR_FILL,font:boldFont,border:allGray,alignment:{horizontal:hdrAligns[c],vertical:'center'}};
  }

  for (let r=1;r<summaryStartRow;r++) {
    for (let c=0;c<7;c++) {
      const addr = XLSX.utils.encode_cell({r,c});
      if (!ws[addr]) ws[addr] = {t:'s',v:''};
      const v = ws[addr].v;
      const isNum = typeof v === 'number';
      let font = normFont, halign = 'left';
      if (c===0) halign = 'center';
      if (c===4) { font = blueFont; halign = 'right'; }
      if (c===5) { font = redFont;  halign = 'right'; }
      if (c===6) halign = 'right';
      ws[addr].s = {font,border:allGray,alignment:{horizontal:halign,vertical:'center'},...(isNum&&c>=4?{numFmt}:{})};
      if (isNum&&c>=4) ws[addr].z = numFmt;
    }
  }

  const sumLabels = ['수입/지출','통장이동(선교)','예금','순헌금/지출'];
  const sumMonths = [`${month}월 결산`,'','',''];
  for (let si=0; si<4; si++) {
    const r = summaryStartRow + si;
    const fill = SUM_FILLS[si];
    const isHdr = (si===0);
    const fnt = isHdr ? whiteFont : boldFont;
    ws['!merges'].push({s:{r,c:0},e:{r,c:1}});
    const addrA = XLSX.utils.encode_cell({r,c:0});
    if (!ws[addrA]) ws[addrA] = {t:'s',v:sumMonths[si]};
    ws[addrA].s = {fill,font:fnt,border:allGray,alignment:{horizontal:'left',vertical:'center'}};
    ws['!merges'].push({s:{r,c:2},e:{r,c:3}});
    const addrC = XLSX.utils.encode_cell({r,c:2});
    if (!ws[addrC]) ws[addrC] = {t:'s',v:sumLabels[si]};
    ws[addrC].s = {fill,font:fnt,border:allGray,alignment:{horizontal:'left',vertical:'center'}};
    const addrB = XLSX.utils.encode_cell({r,c:1});
    if (!ws[addrB]) ws[addrB] = {t:'s',v:''};
    ws[addrB].s = {fill,border:allGray};
    const addrD = XLSX.utils.encode_cell({r,c:3});
    if (!ws[addrD]) ws[addrD] = {t:'s',v:''};
    ws[addrD].s = {fill,border:allGray};
    for (const [ci,fntCol] of [[4,isHdr?'FFFFFF':'1F497D'],[5,isHdr?'FFFFFF':'CC0000'],[6,isHdr?'FFFFFF':'000000']]) {
      const addr = XLSX.utils.encode_cell({r,c:ci});
      if (!ws[addr]) ws[addr] = {t:'s',v:''};
      const isNum = typeof ws[addr].v === 'number';
      ws[addr].s = {fill,font:{bold:isHdr,color:{rgb:fntCol}},border:allGray,alignment:{horizontal:'right',vertical:'center'},...(isNum?{numFmt}:{})};
      if (isNum) ws[addr].z = numFmt;
    }
  }

  ws['!pageSetup'] = {paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};

  const sheetName = `${yy}.${month}월장부`;
  return { ws, sheetName };
}

function exportLedgerRangeToExcel(range) {
  const sections = prepareLedgerSections(range);
  if (sections.length === 0) { showToast('해당 기간에 거래 내역이 없어요'); return; }

  const wb = XLSX.utils.book_new();
  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Names) wb.Workbook.Names = [];

  sections.forEach(sec => {
    const { ws, sheetName } = buildLedgerWorksheet(sec);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    wb.Workbook.Names.push({
      Name: '_xlnm.Print_Titles',
      Ref: `'${sheetName}'!$1:$1`,
      Sheet: wb.SheetNames.length - 1,
    });
  });

  const first = sections[0], last = sections[sections.length-1];
  const fname = first.ym === last.ym ? `리스트_${first.ym}.xlsx` : `리스트_${first.ym}~${last.ym}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// 인쇄용 — 월별 섹션마다 페이지 분할(30행/페이지) + 결재란 (기존 월장부 인쇄와 동일 레이아웃)
function printLedgerRange(range) {
  const sections = prepareLedgerSections(range);
  if (sections.length === 0) { showToast('해당 기간에 거래 내역이 없어요'); return; }

  const TH2  = 'padding:2.5pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;font-weight:700;background:#DCE6F1;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
  const TD2  = 'padding:2pt 3pt;border:0.5pt solid #ccc;font-size:7.5pt;';
  const SUM2 = 'padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;font-weight:700;background:#FFFFF0;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
  const colgroup = `<colgroup>
    <col style="width:9%"><col style="width:13%"><col style="width:13%">
    <col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:17%">
  </colgroup>`;
  const makeHead = () => `<thead><tr>
    <th style="${TH2}text-align:center;">일자</th>
    <th style="${TH2}">대분류</th><th style="${TH2}">중분류</th><th style="${TH2}">소분류</th>
    <th style="${TH2}text-align:right;">수입금액</th>
    <th style="${TH2}text-align:right;">지출금액</th>
    <th style="${TH2}text-align:right;">누계금액</th>
  </tr></thead>`;

  const approvalSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCAyNDAgODAiPgogIDxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIzMCIgaGVpZ2h0PSI4MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cmVjdCB4PSIzMCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjEwMCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjE3MCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjMwIiB5PSIxNiIgd2lkdGg9IjcwIiBoZWlnaHQ9IjY0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjEwMCIgeT0iMTYiIHdpZHRoPSI3MCIgaGVpZ2h0PSI2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cmVjdCB4PSIxNzAiIHk9IjE2IiB3aWR0aD0iNzAiIGhlaWdodD0iNjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMTUiIHk9IjQ0IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEwIiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgd3JpdGluZy1tb2RlPSJ0YiI+6rKw7J6sPC90ZXh0PgogIDx0ZXh0IHg9IjY1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ri7Tri7k8L3RleHQ+CiAgPHRleHQgeD0iMTM1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7rtoDsnqU8L3RleHQ+CiAgPHRleHQgeD0iMjA1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ri7TsnoTrqqnsgqw8L3RleHQ+Cjwvc3ZnPg==';
  const approvalBox = `
    <div style="page-break-inside:avoid;break-inside:avoid;margin-top:6pt;display:flex;justify-content:flex-end;">
      <img src="${approvalSvg}" style="width:65%;height:auto;" alt="결재란">
    </div>`;

  const ROWS_PER_PAGE = 30;
  const pages = [];

  sections.forEach(sec => {
    const dataRowsArr = sec.rows.map(r => `<tr>
      <td style="${TD2}text-align:center;">${r.date.slice(5)}</td>
      <td style="${TD2}">${escapeHTML(r.cat)}</td>
      <td style="${TD2}">${escapeHTML(r.major)}</td>
      <td style="${TD2}">${escapeHTML(r.minor)}</td>
      <td style="${TD2}text-align:right;color:#1F497D;">${r.income ? r.income.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD2}text-align:right;color:#CC0000;">${r.expense ? '-'+r.expense.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD2}text-align:right;">${r.acc.toLocaleString('ko-KR')}</td>
    </tr>`);

    const summaryRowsHTML = [
      [sec.month+'월 결산', '수입/지출', sec.inc, sec.exp],
      [null, '통장이동(선교)', sec.transfer, null],
      [null, '예금', null, sec.deposit],
      [null, '순헌금/지출', sec.inc-sec.transfer, sec.exp-sec.deposit],
    ].map(([c1,c2,iv,ev]) => `<tr>
      <td colspan="2" style="${SUM2}font-weight:${c1?'700':'400'};">${escapeHTML(c1||'')}</td>
      <td colspan="2" style="${SUM2}">${escapeHTML(c2)}</td>
      <td style="${SUM2}text-align:right;color:#1F497D;">${iv ? iv.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM2}text-align:right;color:#CC0000;">${ev ? '-'+ev.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM2}"></td>
    </tr>`).join('');

    const monthTitle = `<div style="font-size:11pt;font-weight:800;margin-bottom:4pt;">${sec.year}년 ${sec.month}월</div>`;

    if (dataRowsArr.length === 0) {
      pages.push(`<div class="print-page"><div class="page-inner">
        ${monthTitle}
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          ${colgroup}${makeHead()}
          <tbody>${summaryRowsHTML}</tbody>
        </table>
        ${approvalBox}
      </div></div>`);
    } else {
      for (let i = 0; i < dataRowsArr.length; i += ROWS_PER_PAGE) {
        const chunk = dataRowsArr.slice(i, i + ROWS_PER_PAGE).join('');
        const isLast = i + ROWS_PER_PAGE >= dataRowsArr.length;
        pages.push(`<div class="print-page"><div class="page-inner">
          ${i === 0 ? monthTitle : ''}
          <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
            ${colgroup}${makeHead()}
            <tbody>${chunk}</tbody>
            ${isLast ? `<tbody>${summaryRowsHTML}</tbody>` : ''}
          </table>
          ${isLast ? approvalBox : ''}
        </div></div>`);
      }
    }
  });

  doPrint(pages.join(''));
}

function printStats() {
  const range = statsPeriodRange();
  const allTx  = txInPeriod(range.start, range.end);
  const list   = allTx.filter(t => t.type === State.statsType);
  const isIncome = State.statsType === 'income';

  const incTotal = allTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expTotal = allTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const netTotal = incTotal - expTotal;

  // ── 통계 탭: 막대 데이터 ──
  const byCat = {};
  let statTotal = 0;
  for (const t of list) {
    byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
    statTotal += t.amount;
  }
  const statRows = Object.entries(byCat)
    .map(([catId, amt]) => {
      const cat = catFallbackInfo(catId, {icon: isIncome?'🙏':'📦'});
      return { icon: cat.icon, name: cat.name, amt };
    })
    .sort((a,b) => b.amt - a.amt);

  // ── 내용 탭: 집계 데이터 ──
  const detailTx = list.slice().sort((a,b) => a.date.localeCompare(b.date));
  const aggMap = buildStatsAggMap(detailTx, isIncome);
  const aggRows = Object.entries(aggMap)
    .map(([key,r]) => ({key,...r}))
    .sort((a,b) => b.amount - a.amount);

  // ── 헌금 피벗 ──
  let pivotHTML = '';
  if (isIncome) {
    const heongCat = State.categories.find(c => c.name === '헌금' && c.type === 'income');
    if (heongCat) {
      const heongList = list.filter(t => t.categoryId === heongCat.id);
      const pivot = {};
      const colSet = new Set();
      for (const t of heongList) {
        const sgId = t.subGroupId || t.personId;
        const pName = sgId ? ((State.persons||[]).find(p=>p.id===sgId)||{}).name||'(이름없음)' : '(이름없음)';
        if (!pivot[pName]) pivot[pName] = {};
        for (const l of (t.lines||[])) {
          const si = subItemById(l.subItemId);
          const sName = si ? subItemDisplayName('income','헌금',si.name) : '(기타)';
          pivot[pName][sName] = (pivot[pName][sName]||0) + l.amount;
          colSet.add(sName);
        }
      }
      const rows = Object.keys(pivot).sort((a,b)=>a.localeCompare(b,'ko'));
      const orderedCols = [
        ...TX_ENTRY_ITEM_ORDER.filter(n=>colSet.has(n)),
        ...[...colSet].filter(n=>!TX_ENTRY_ITEM_ORDER.includes(n)).sort()
      ];
      if (rows.length > 0) {
        const colTotals = orderedCols.map(c=>rows.reduce((s,r)=>s+(pivot[r][c]||0),0));
        const grandTotal = colTotals.reduce((s,v)=>s+v,0);
        // 모든 열 동일 너비: 전체 열 수로 100% 균등 분할
        const totalCols = orderedCols.length + 2; // 이름 + 헌금종류들 + 합계
        const colPct = (100 / totalCols).toFixed(4);
        const colgroup = `<colgroup>${Array(totalCols).fill('').map((_,i)=>`<col style="width:${colPct}%;">`).join('')}</colgroup>`;
        // 인쇄 CSS 강제 override용 style 태그
        const pivotStyle = `<style>
          #pivot-tbl col { width: ${colPct}% !important; }
          #pivot-tbl th, #pivot-tbl td { min-width: 0 !important; box-sizing: border-box !important; }
        </style>`;
        const TH_S = 'padding:2pt 1pt;border:0.5pt solid #3a6fa0;background:#1F4E79;color:#fff;font-weight:700;font-size:6pt;text-align:center;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
        const TD_N = 'padding:2pt 1pt;border:0.5pt solid #aaa;font-size:6.5pt;text-align:right;overflow:hidden;';
        const TD_SUM = 'padding:2pt 1pt;border:0.5pt solid #aaa;font-size:6.5pt;text-align:right;overflow:hidden;background:#EBF3FB;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
        const FT_S = 'padding:2pt 1pt;border:0.5pt solid #3a6fa0;background:#2E74B5;color:#fff;font-size:6.5pt;text-align:right;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
        pivotHTML = `
          ${pivotStyle}
          <div style="margin-top:6pt;">
            <div style="font-size:10pt;font-weight:800;margin-bottom:4pt;border-bottom:0.5pt solid #000;padding-bottom:2pt;">🙏 헌금 개인별 명세</div>
            <table id="pivot-tbl" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:6.5pt;">
              ${colgroup}
              <thead><tr>
                <th style="${TH_S}text-align:left;">이름</th>
                ${orderedCols.map(c=>`<th style="${TH_S}">${escapeHTML(c)}</th>`).join('')}
                <th style="${TH_S}">합계</th>
              </tr></thead>
              <tbody>
                ${rows.map(name => {
                  const rowTotal = orderedCols.reduce((s,c)=>s+(pivot[name][c]||0),0);
                  return `<tr>
                    <td style="${TD_N}font-weight:700;text-align:left;">${escapeHTML(name)}</td>
                    ${orderedCols.map(c=>`<td style="${TD_N}">${pivot[name][c]?pivot[name][c].toLocaleString('ko-KR'):''}</td>`).join('')}
                    <td style="${TD_SUM}">${rowTotal.toLocaleString('ko-KR')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot><tr>
                <td style="${FT_S}text-align:left;">합계</td>
                ${colTotals.map(v=>`<td style="${FT_S}">${v?v.toLocaleString('ko-KR'):''}</td>`).join('')}
                <td style="${FT_S}">${grandTotal.toLocaleString('ko-KR')}</td>
              </tr></tfoot>
            </table>
          </div>`;
      }
    }
  }

  const typeLabel = isIncome ? '수입' : '지출';
  const pageHeader = `
    <div class="print-title">📊 통계 — ${typeLabel}</div>
    <div class="print-period">${range.label}</div>
    <div class="print-summary">
      <div class="print-summary-item">
        <div class="print-summary-label">수입</div>
        <div class="print-summary-value income">${fmtMoney(incTotal)}원</div>
      </div>
      <div class="print-summary-item">
        <div class="print-summary-label">지출</div>
        <div class="print-summary-value expense">${fmtMoney(expTotal)}원</div>
      </div>
      <div class="print-summary-item">
        <div class="print-summary-label">합계</div>
        <div class="print-summary-value">${fmtMoney(netTotal)}원</div>
      </div>
    </div>`;

  // ── 1페이지: 통계 (막대) ──
  const page1 = `
    <div class="print-page" style="display:block;page-break-after:always;break-after:page;">
      <div class="page-inner">
        ${pageHeader}
        <div class="print-section-title">${isIncome?'개인별 헌금액':'대분류별 지출'} · ${fmtMoney(statTotal)}원</div>
        ${statRows.map(r => {
          const pct = statTotal > 0 ? Math.round(r.amt/statTotal*100) : 0;
          return `<div class="print-bar-row">
            <div class="print-bar-label">${r.icon} ${escapeHTML(r.name)}</div>
            <div class="print-bar-pct">${pct}%</div>
            <div class="print-bar-amt">${fmtMoney(r.amt)}원</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // ── 2페이지: 월지출 (지출일 때) ──
  // 월지출.py 동일 구조: 대분류 > 중분류(subGroup) > 소분류 3단계 테이블
  let page2 = '';
  if (!isIncome) {
    const expCats = State.categories
      .filter(c => c.type === 'expense')
      .sort((a,b) => (a.order||99)-(b.order||99));

    // 대분류별 집계: {catId: {subItemId: amount}}
    const expPivot = {};
    for (const t of list) {
      if (!expPivot[t.categoryId]) expPivot[t.categoryId] = {};
      for (const l of (t.lines||[])) {
        expPivot[t.categoryId][l.subItemId] = (expPivot[t.categoryId][l.subItemId]||0) + l.amount;
      }
    }
    const usedCats = expCats.filter(c => expPivot[c.id]);

    // 예금 카테고리 합계 (순지출 계산용)
    const depositCat = State.categories.find(c => c.type==='expense' && c.name==='예금');
    const depositTotal = depositCat && expPivot[depositCat.id]
      ? Object.values(expPivot[depositCat.id]).reduce((s,v)=>s+v, 0) : 0;
    const acctBalanceMap = calcAcctBalanceMap(); // 예금 비고란 잔액용

    const td  = (val, opts={}) => {
      const {bold=false, bg='', right=false, center=false, colspan=1, rowspan=1} = opts;
      const fw  = bold ? 'font-weight:700;' : '';
      const ta  = right ? 'text-align:right;' : center ? 'text-align:center;' : 'text-align:left;padding-left:6pt;';
      const bgc = bg ? `background:${bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;` : '';
      const cs  = colspan>1 ? ` colspan="${colspan}"` : '';
      const rs  = rowspan>1 ? ` rowspan="${rowspan}"` : '';
      const vStr = typeof val==='number' ? val.toLocaleString('ko-KR') : (val||'');
      return `<td${cs}${rs} style="padding:2pt 3pt;border:0.5pt solid #bbb;font-size:7.5pt;${fw}${ta}${bgc}">${escapeHTML ? escapeHTML(String(vStr)) : vStr}</td>`;
    };
    const th = (val, opts={}) => {
      const {right=false, center=true, colspan=1, rowspan=1} = opts;
      const ta = right ? 'text-align:right;' : 'text-align:center;';
      const cs = colspan>1 ? ` colspan="${colspan}"` : '';
      const rs = rowspan>1 ? ` rowspan="${rowspan}"` : '';
      return `<th${cs}${rs} style="padding:3pt 3pt;border:0.5pt solid rgba(255,255,255,0.3);font-size:7.5pt;font-weight:700;color:#fff;background:#1F4E79;${ta}-webkit-print-color-adjust:exact;print-color-adjust:exact;">${val}</th>`;
    };

    let tableRows = '';
    let grandTotal = 0;

    // 스타일 상수
    const S  = (extra='') => `padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;${extra}`;
    const SB = (bg,extra='') => `padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;background:${bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;${extra}`;

    for (const cat of usedCats) {
      const catPivot = expPivot[cat.id];
      const allSubs = State.subItems
        .filter(s => s.categoryId === cat.id)
        .sort((a,b) => (a.order||0)-(b.order||0));

      // 중분류별 그룹핑
      const sgMap = new Map();
      const direct = [];
      for (const s of allSubs) {
        if (!catPivot[s.id]) continue;
        const sg = s.subGroupId ? (State.subGroups||[]).find(g=>g.id===s.subGroupId) : null;
        if (sg) {
          if (!sgMap.has(sg.id)) sgMap.set(sg.id, {name:sg.name, items:[]});
          sgMap.get(sg.id).items.push(s);
        } else {
          direct.push(s);
        }
      }

      // 평탄화: {catName, sgName, subName, amt, remark}
      const flatRows = [];
      const isDepCat = depositCat && cat.id === depositCat.id;
      for (const [,grp] of sgMap) {
        for (const s of grp.items) {
          const amt = catPivot[s.id]||0;
          const remark = isDepCat && acctBalanceMap[s.name] !== undefined
            ? acctBalanceMap[s.name].toLocaleString('ko-KR')+'원' : '';
          flatRows.push({catName:cat.name, sgName:grp.name, subName:s.name, amt, remark});
        }
      }
      for (const s of direct) {
        const amt = catPivot[s.id]||0;
        const remark = isDepCat && acctBalanceMap[s.name] !== undefined
          ? acctBalanceMap[s.name].toLocaleString('ko-KR')+'원' : '';
        flatRows.push({catName:cat.name, sgName:'', subName:s.name, amt, remark});
      }

      const catTotal = flatRows.reduce((s,r)=>s+r.amt, 0);
      grandTotal += catTotal;

      // rowspan 없이 모든 셀 명시 출력
      flatRows.forEach(r => {
        const remarkColor = r.remark && acctBalanceMap[r.subName] < 0 ? '#CC0000' : '#1F497D';
        tableRows += `<tr>
          <td style="${SB('#fff','font-weight:700;text-align:center;')}">${escapeHTML(r.catName)}</td>
          <td style="${SB('#DEEAF1')}">${escapeHTML(r.sgName)}</td>
          <td style="${SB('#BDD7EE')}">${escapeHTML(r.subName)}</td>
          <td style="${S('text-align:right;')}">${r.amt.toLocaleString('ko-KR')}</td>
          <td style="${S('text-align:right;color:'+remarkColor+';font-weight:'+(r.remark?'700':'400')+';')}">${escapeHTML(r.remark)}</td>
        </tr>`;
      });
      // 소계행
      tableRows += `<tr>
        <td style="${SB('#D6E4F0','font-weight:700;')}"></td>
        <td colspan="2" style="${SB('#D6E4F0','font-weight:700;')}">소 계</td>
        <td style="${SB('#D6E4F0','font-weight:700;text-align:right;')}">${catTotal.toLocaleString('ko-KR')}</td>
        <td style="${SB('#D6E4F0')}"></td>
      </tr>`;
    }

    // page2: 완전히 독립된 Blob HTML (CSS 간섭 없음, 자동 축소)
    // page2: #exp-page id로 격리된 지출현황 (자체 스타일, 자동 축소)
    page2 = `
      <div class="print-page" id="exp-page" style="page-break-before:always;break-before:page;overflow:hidden;">
        <style>
          #exp-inner{transform-origin:top left;}
          #exp-page table{border-collapse:collapse;width:100%;table-layout:fixed;}
          #exp-page thead th{padding:3pt;border:0.5pt solid rgba(255,255,255,0.3);font-size:7.5pt;font-weight:700;color:#fff!important;background:#1F4E79!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
          #exp-page td{padding:2.5pt 3pt;border:0.5pt solid #aaa!important;font-size:7.5pt;}
          #exp-page .sum-row td{background:#2E74B5!important;color:#fff!important;font-weight:700!important;border:1pt solid #1a5fa8!important;font-size:8pt!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        </style>
        <div id="exp-inner">
          ${pageHeader}
          <div style="font-size:11pt;font-weight:800;margin-bottom:5pt;">${range.label} 지출현황</div>
          <table>
            <colgroup>
              <col style="width:15%"><col style="width:13%"><col style="width:26%"><col style="width:23%"><col style="width:23%">
            </colgroup>
            <thead><tr>
              <th>대분류</th><th>중분류</th><th>소분류</th>
              <th style="text-align:right;">금액(원)</th><th>비고/잔액</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
            <tbody>
              <tr class="sum-row">
                <td colspan="3" style="text-align:center;">합  계</td>
                <td style="text-align:right;">${grandTotal.toLocaleString('ko-KR')}</td>
                <td></td>
              </tr>
              <tr class="sum-row">
                <td colspan="3" style="text-align:center;">순지출(지출-예금)</td>
                <td style="text-align:right;">${(grandTotal-depositTotal).toLocaleString('ko-KR')}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        (function(){
          var pg = document.getElementById('exp-page');
          var inner = document.getElementById('exp-inner');
          if(!pg||!inner) return;
          var availH = pg.clientHeight || 900;
          var h = inner.scrollHeight;
          if(h > availH){
            var s = availH / h;
            inner.style.transform = 'scale('+s+')';
            inner.style.width = Math.round(100/s)+'%';
          }
        })();
      </script>`;
  }

  // 현재 보이는 페이지만 인쇄
  const html = isIncome
    ? (pivotHTML ? `<div class="print-page"><div class="page-inner">${pageHeader}${pivotHTML}</div></div>` : '')
    : page1 + page2;
  doPrint(html);
}

function renderStats() {
  const page = document.getElementById('page-stats');
  const range = statsPeriodRange();
  const allTx  = txInPeriod(range.start, range.end);
  const isIncome   = State.statsType === 'income';
  const isList     = State.statsType === 'list';
  const isInterest = State.statsType === 'interest';
  const list   = (isList || isInterest) ? [] : allTx.filter(t => t.type === State.statsType);

  // 연간/월간/기간설정 모드일 때: 이월잔액/총수입/총지출/총예금/순지출/순수입계 계산 (주간만 단순 3항목 유지)
  const statsYear = new Date().getFullYear() + State.statsYearOffset;
  let periodAssets = null;
  if (!isInterest && State.statsPeriod === 'year') {
    periodAssets = totalAssetsForYearSync(statsYear);
  } else if (!isInterest && (State.statsPeriod === 'month' || State.statsPeriod === 'custom')) {
    const depositCat = State.categories.find(c => c.name === '예금');
    const carryoverCat = State.categories.find(c => c.name === '전년이월');
    let totalIncome = 0, totalExpense = 0, depositExp = 0;
    for (const t of allTx) {
      if (t.type === 'income') {
        if (carryoverCat && t.categoryId === carryoverCat.id) continue;
        totalIncome += t.amount;
      } else {
        if (depositCat && t.categoryId === depositCat.id) depositExp += t.amount;
        totalExpense += t.amount;
      }
    }
    const carryover = balanceAsOfDateSync(range.start);
    const netExpense = totalExpense - depositExp;
    const net = carryover + totalIncome - totalExpense;
    periodAssets = { totalIncome, totalExpense, depositExp, netExpense, carryover, net };
  }
  const carryLabel = State.statsPeriod === 'year' ? '전년이월' : '이월잔액';

  // 기간별 내역 (날짜순)
  const detailTx = list.slice().sort((a,b) => a.date.localeCompare(b.date) || b.createdAt - a.createdAt);

  const PERIOD_LABELS = { week:'주간', month:'월간', year:'연간', custom:'기간설정' };

  // 이전/다음 버튼 표시 여부
  const canNav = State.statsPeriod !== 'custom';

  // ── [통계] 탭: 수입=개인별 헌금 합계 / 지출=대분류별 합계 ──────────────
  // 수입: 헌금은 인물별 '대분류'로 관리되므로(대분류명 = 인물이름) categoryId 기준 집계
  // 지출: 대분류 기준 집계
  let statRows = [];
  let statTotal = 0;
  if (!isInterest) {
    const byCat = {};
    for (const t of list) {
      byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
      statTotal += t.amount;
    }
    statRows = Object.entries(byCat)
      .map(([catId, amt]) => {
        const cat = catFallbackInfo(catId, {color:'#9CA3AF', icon: isIncome ? '🙏' : '📦'});
        return { catId, icon: cat.icon, name: cat.name, color: cat.color, amt };
      })
      .sort((a,b) => b.amt - a.amt);
  }

  let interestPeriodTotal = 0;
  if (isInterest) {
    interestPeriodTotal = Object.values(buildInterestAggMap(range)).reduce((s,r)=>s+r.amount, 0);
  }

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1>통계</h1>
      ${!isInterest ? `
      <div style="display:flex;gap:6px;">
        <button id="statsExcel" style="font-size:13px;color:#217346;font-weight:700;display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;background:#E8F5E9;">📥 엑셀</button>
        <button id="statsPrint" style="font-size:13px;color:var(--primary);font-weight:700;display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>` : ''}
    </div>

    <!-- 통계 | 내용 -->
    ${(!isList && !isInterest) ? `
    <div class="segctrl" id="viewToggle" style="margin-bottom:12px;">
      <button data-view="stats"  class="${State.statsView==='stats' ?'active':''}">통계</button>
      <button data-view="detail" class="${State.statsView==='detail'?'active':''}">내용</button>
    </div>` : ''}

    <!-- 기간 모드 선택 -->
    <div style="display:flex; gap:6px; margin-bottom:12px; overflow-x:auto; padding-bottom:2px;">
      ${['week','month','year','custom'].map(p => `
        <button class="period-chip ${State.statsPeriod===p?'active':''}" data-period="${p}">
          ${PERIOD_LABELS[p]}
        </button>
      `).join('')}
    </div>

    <!-- 기간 네비게이터 -->
    <div class="summary-month" style="justify-content:center; background:var(--card); border-radius:var(--radius-sm); padding:10px; box-shadow:var(--shadow); margin-bottom:14px;">
      ${canNav ? `<button id="statsPrev" style="color:var(--text-2);">${ICONS.chevLeft}</button>` : `<div style="width:28px;"></div>`}
      ${(State.statsPeriod === 'month' || State.statsPeriod === 'year')
        ? `<button id="statsLabel" style="background:none;border:none;font-weight:800; font-size:${State.statsPeriod==='year'?'22px':'14px'}; flex:1; text-align:center; color:var(--text-1); cursor:pointer; padding:4px 8px; border-radius:8px;">${range.label}</button>`
        : `<span style="font-weight:700; font-size:14px; flex:1; text-align:center;">${range.label}</span>`}
      ${canNav ? `<button id="statsNext" style="color:var(--text-2);">${ICONS.chevRight}</button>` : `<div style="width:28px;"></div>`}
    </div>

    <!-- 기간설정 입력 -->
    ${State.statsPeriod === 'custom' ? `
      <div class="card" style="padding:14px 16px; margin-bottom:14px; display:flex; gap:10px; align-items:center;">
        <input type="date" class="dateinput" id="customStart" value="${State.statsCustomStart || ''}" style="flex:1; font-size:13px;">
        <span style="color:var(--text-3);">~</span>
        <input type="date" class="dateinput" id="customEnd" value="${State.statsCustomEnd || ''}" style="flex:1; font-size:13px;">
      </div>
    ` : ''}

    <!-- 수입/지출/이자/리스트 토글 -->
    <div class="segctrl" id="typeToggle" style="margin-bottom:14px;">
      <button data-type="expense"  class="${State.statsType==='expense' ?'active':''}">지출</button>
      <button data-type="income"   class="${State.statsType==='income'  ?'active':''}">수입</button>
      <button data-type="interest" class="${State.statsType==='interest'?'active':''}">이자</button>
      <button data-type="list"     class="${State.statsType==='list'    ?'active':''}">리스트</button>
    </div>

    <!-- 요약 숫자 -->
    ${isInterest ? `
    <div class="cal-summary-row" style="margin-bottom:14px;">
      <div class="cal-summary-col" style="flex:1;">
        <div class="cal-summary-label">이자합계</div>
        <div class="cal-summary-value income tabular">${fmtMoney(interestPeriodTotal)}</div>
      </div>
    </div>
    ` : periodAssets ? `
    <div class="cal-summary-row" style="flex-direction:column;margin-bottom:14px;">
      <div style="display:flex;width:100%;">
        <div class="cal-summary-col">
          <div class="cal-summary-label">${carryLabel}</div>
          <div class="cal-summary-value tabular">${fmtMoney(periodAssets.carryover)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">수입</div>
          <div class="cal-summary-value income tabular">${fmtMoney(periodAssets.totalIncome)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">지출</div>
          <div class="cal-summary-value expense tabular">${fmtMoney(periodAssets.totalExpense)}</div>
        </div>
      </div>

      <div style="width:100%;border-top:1px solid rgba(0,0,0,0.08);margin:8px 0;"></div>

      <div style="display:flex;width:100%;">
        <div class="cal-summary-col">
          <div class="cal-summary-label">예금</div>
          <div class="cal-summary-value tabular">${fmtMoney(periodAssets.depositExp)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">순지출</div>
          <div class="cal-summary-value tabular">${fmtMoney(periodAssets.netExpense)}</div>
        </div>
        <div class="cal-summary-col">
          <div class="cal-summary-label">순수입계</div>
          <div class="cal-summary-value tabular" style="color:${periodAssets.net>=0?'#2563eb':'#dc2626'};">${periodAssets.net>=0?'':'-'}${fmtMoney(Math.abs(periodAssets.net))}</div>
        </div>
      </div>
    </div>
    ` : `
    <div class="cal-summary-row" style="margin-bottom:14px;">
      <div class="cal-summary-col">
        <div class="cal-summary-label">수입</div>
        <div class="cal-summary-value income tabular">${fmtMoney(allTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0))}</div>
      </div>
      <div class="cal-summary-col">
        <div class="cal-summary-label">지출</div>
        <div class="cal-summary-value expense tabular">${fmtMoney(allTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))}</div>
      </div>
      <div class="cal-summary-col">
        <div class="cal-summary-label">합계</div>
        <div class="cal-summary-value tabular">${fmtMoney(
          allTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0) -
          allTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)
        )}</div>
      </div>
    </div>
    `}

    ${isList
      ? buildLedgerSectionsHTML(range)
      : isInterest
        ? renderInterestTab(range)
        : (State.statsView === 'stats'
            ? `${renderStatsTabBars(statRows, statTotal, isIncome)}
               ${!isIncome ? `<div style="margin-top:6px;">${renderExpenseTableA4(list, range)}</div>` : ''}`
            : renderStatsTabDetail(detailTx, isIncome))
    }
  `;

  // 이벤트
  page.querySelector('#statsExcel')?.addEventListener('click', () => {
    if (State.statsType === 'list') exportLedgerRangeToExcel(range);
    else if (State.statsType === 'income') exportPivotToExcel();
    else exportExpenseToExcel();
  });
  page.querySelector('#statsPrint')?.addEventListener('click', () => {
    if (State.statsType === 'list') printLedgerRange(range);
    else printStats();
  });

  const viewToggle = page.querySelector('#viewToggle');
  if (viewToggle) {
    viewToggle.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => { State.statsView = b.dataset.view; renderStats(); });
    });
  }

  page.querySelectorAll('.period-chip').forEach(b => {
    b.addEventListener('click', () => {
      State.statsPeriod = b.dataset.period;
      if (State.statsPeriod === 'custom' && !State.statsCustomStart) {
        State.statsCustomStart = dateToStr(new Date());
        State.statsCustomEnd   = dateToStr(new Date());
      }
      renderStats();
    });
  });

  if (canNav) {
    page.querySelector('#statsPrev').addEventListener('click', () => {
      if (State.statsPeriod === 'week')  State.statsWeekOffset--;
      if (State.statsPeriod === 'month') changeMonth(-1);
      if (State.statsPeriod === 'year')  State.statsYearOffset--;
      renderStats();
    });
    page.querySelector('#statsNext').addEventListener('click', () => {
      if (State.statsPeriod === 'week')  State.statsWeekOffset++;
      if (State.statsPeriod === 'month') changeMonth(1);
      if (State.statsPeriod === 'year')  State.statsYearOffset++;
      renderStats();
    });
  }

  page.querySelector('#statsLabel')?.addEventListener('click', openStatsPeriodPicker);

  if (State.statsPeriod === 'custom') {
    page.querySelector('#customStart').addEventListener('change', e => {
      State.statsCustomStart = e.target.value;
      renderStats();
    });
    page.querySelector('#customEnd').addEventListener('change', e => {
      State.statsCustomEnd = e.target.value;
      renderStats();
    });
  }

  page.querySelector('#typeToggle').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { State.statsType = b.dataset.type; renderStats(); });
  });

  page.querySelectorAll('.tx-item').forEach(el => {
    el.addEventListener('click', () => openTxSheet(el.dataset.id));
  });

  page.querySelectorAll('.stat-bar-row').forEach(el => {
    el.addEventListener('click', () => openCatStatDetail(el.dataset.catid));
  });

  page.querySelectorAll('.stats-agg-row').forEach(el => {
    el.addEventListener('click', () => openSubStatDetail(el.dataset.key));
  });

  page.querySelectorAll('.interest-agg-row').forEach(el => {
    el.addEventListener('click', () => openInterestDetail(el.dataset.key));
  });

  page.querySelectorAll('[data-sortkey]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.sortkey;
      if (State.statsSortKey === key) {
        State.statsSortDir = State.statsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        State.statsSortKey = key;
        State.statsSortDir = key === 'label' ? 'asc' : 'desc'; // 이름은 가나다순 기본, 숫자는 큰값 먼저 기본
      }
      renderStats();
    });
  });

  window._checkScrollTopBtn?.();
}

// [통계] 탭: 막대 차트형 요약 (수입=개인별 헌금 합계 / 지출=대분류별 합계)
// 통계 탭 지출 모드 - 화면 월지출 상세표 (A4 맞춤 + 좌우 스크롤)
function renderExpenseTableA4(list, range) {
  const expCats = State.categories.filter(c=>c.type==='expense').sort((a,b)=>(a.order||0)-(b.order||0));
  const expPivot = {};
  for (const t of list) {
    if (!expPivot[t.categoryId]) expPivot[t.categoryId] = {};
    for (const l of (t.lines||[])) {
      expPivot[t.categoryId][l.subItemId] = (expPivot[t.categoryId][l.subItemId]||0) + l.amount;
    }
  }
  const usedCats = expCats.filter(c => expPivot[c.id]);
  if (usedCats.length === 0) return '';
  const depositCat = State.categories.find(c=>c.type==='expense'&&c.name==='예금');
  const acctBalanceMap = calcAcctBalanceMap(); // 예금 비고란 잔액용
  const depositTotal = depositCat && expPivot[depositCat.id]
    ? Object.values(expPivot[depositCat.id]).reduce((s,v)=>s+v,0) : 0;

  const cellStyle = (opts={}) => {
    const {bold=false,bg='',right=false,center=false,color=''}=opts;
    const fw=bold?'font-weight:700;':'';
    const ta=right?'text-align:right;':center?'text-align:center;':'text-align:left;padding-left:6pt;';
    const bgc=bg?`background:${bg};`:'';
    const fg=color?`color:${color};`:'';
    return `padding:3pt 4pt;border:0.5pt solid #ccc;font-size:7.5pt;${fw}${ta}${bgc}${fg}`;
  };

  let tableRows = '';
  let grandTotal = 0;
  for (const cat of usedCats) {
    const catPivot = expPivot[cat.id];
    const allSubs = State.subItems.filter(s=>s.categoryId===cat.id).sort((a,b)=>(a.order||0)-(b.order||0));
    const sgMap = new Map();
    const direct = [];
    for (const s of allSubs) {
      if (!catPivot[s.id]) continue;
      const sg = s.subGroupId ? (State.subGroups||[]).find(g=>g.id===s.subGroupId) : null;
      if (sg) {
        if (!sgMap.has(sg.id)) sgMap.set(sg.id, {name:sg.name, items:[]});
        sgMap.get(sg.id).items.push(s);
      } else { direct.push(s); }
    }
    const isDepCat = depositCat && cat.id === depositCat.id;
    const catRows = [];
    for (const [,grp] of sgMap) {
      grp.items.forEach((s,i)=>catRows.push({sgName:i===0?grp.name:null,sgRowspan:i===0?grp.items.length:0,subName:s.name,amt:catPivot[s.id]||0,isDirect:false}));
    }
    for (const s of direct) catRows.push({sgName:null,sgRowspan:0,subName:s.name,amt:catPivot[s.id]||0,isDirect:true});
    const catTotal = catRows.reduce((s,r)=>s+r.amt,0);
    grandTotal += catTotal;
    const catRowspan = catRows.length + 1;
    catRows.forEach((r,i) => {
      const catTd = i===0 ? `<td rowspan="${catRowspan}" style="${cellStyle({bold:true,center:true,bg:'#EBF3FB'})}vertical-align:middle;">${escapeHTML(cat.name)}</td>` : '';
      const sgTd = r.sgRowspan > 0
        ? `<td rowspan="${r.sgRowspan}" style="${cellStyle({bg:'#DEEAF1'})}vertical-align:middle;">${escapeHTML(r.sgName)}</td>`
        : r.isDirect
          ? `<td style="${cellStyle({bg:'#DEEAF1'})}"></td>`
          : '';
      const remark = isDepCat && acctBalanceMap[r.subName] !== undefined
        ? acctBalanceMap[r.subName].toLocaleString('ko-KR') + '원' : '';
      tableRows += `<tr>${catTd}${sgTd}<td style="${cellStyle({bg:'#BDD7EE'})}">${escapeHTML(r.subName)}</td><td style="${cellStyle({right:true})}">${r.amt.toLocaleString('ko-KR')}</td><td style="${cellStyle({right:true,color:remark&&acctBalanceMap[r.subName]<0?'#CC0000':'#1F497D'})}">${escapeHTML(remark)}</td></tr>`;
    });
    tableRows += `<tr><td colspan="2" style="${cellStyle({bold:true,bg:'#D6E4F0'})}">소 계</td><td style="${cellStyle({bold:true,right:true,bg:'#D6E4F0'})}">${catTotal.toLocaleString('ko-KR')}</td><td style="${cellStyle({bg:'#D6E4F0'})}"></td></tr>`;
  }

  const thStyle = `padding:4pt 4pt;border:0.5pt solid rgba(255,255,255,0.3);font-size:7.5pt;font-weight:700;color:#fff;background:#1F4E79;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;
  const ftStyle = (right=false) => `padding:3pt 4pt;border:0.5pt solid #ccc;font-size:7.5pt;font-weight:700;text-align:${right?'right':'center'};background:#2E74B5;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;

  return `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:12px;margin-bottom:16px;">
      <div style="width:100%;">
        <div style="font-size:12px;font-weight:700;color:var(--text-1);margin-bottom:6px;padding:0 2px;">📋 ${range.label} 지출현황</div>
        <table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
          <colgroup>
            <col style="width:16%"><col style="width:14%"><col style="width:22%"><col style="width:24%"><col style="width:24%">
          </colgroup>
          <thead><tr>
            <th style="${thStyle}">대분류</th><th style="${thStyle}">중분류</th><th style="${thStyle}">소분류</th><th style="${thStyle}text-align:right;">금액(원)</th><th style="${thStyle}">비고/잔액</th>
          </tr></thead>
          <tbody>${tableRows}
            <tr><td colspan="3" style="${ftStyle()}">합  계</td><td style="${ftStyle(true)}">${grandTotal.toLocaleString('ko-KR')}</td><td style="${ftStyle()}"></td></tr>
            <tr><td colspan="3" style="${ftStyle()}">순지출(지출-예금)</td><td style="${ftStyle(true)}">${(grandTotal-depositTotal).toLocaleString('ko-KR')}</td><td style="${ftStyle()}"></td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

function printAccounts({sub, accounts, totals, grandNet, grandNetColor, mainNet, normalNet, depositNet, mainLabel,
  totalCarry, totalIncome, totalExpense, totalNet, summaryTitle,
  normalCarry, normalIncome, normalExpense,
  depositCarry, depositIncome, depositExpense, nonDefaultAccts, selectedYear, yearLabel}) {

  const fmt = n => n ? n.toLocaleString('ko-KR') : '-';
  const shortName = name => name.replace(/계정$/, '');
  const today = todayStr();
  const yLabel = yearLabel || (selectedYear && selectedYear !== 'all' ? `${selectedYear}년` : '전체 연도');

  // 테이블 행 생성 함수
  const makeRows = (acctList, isDeposit) => {
    if (!acctList.length) return `<tr><td colspan="${isDeposit?6:5}" style="text-align:center;padding:12pt;color:#888;">등록된 계좌가 없습니다</td></tr>`;
    return acctList.map(a => {
      const t = totals[a.name] || {income:0, expense:0, carryIn:0};
      const carry = (a.carryover || 0) + (t.carryIn || 0);
      const net = carry + t.income - t.expense;
      const netColor = net >= 0 ? '#1F497D' : '#CC0000';
      let matTd = '';
      if (isDeposit) {
        const md = a.maturityDate || '';
        const matLabel = md ? md.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3') : '-';
        const matColor = md ? (md < today ? '#CC0000' : '#1F497D') : '#888';
        matTd = `<td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:center;color:${matColor};">${matLabel}</td>`;
      }
      return `<tr>
        <td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;font-weight:600;">${escapeHTML(shortName(a.name))}</td>
        <td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;">${fmt(carry)}</td>
        <td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;color:#1F497D;">${fmt(t.income)}</td>
        <td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;color:#CC0000;">${fmt(t.expense)}</td>
        <td style="padding:2pt 4pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;font-weight:700;color:${netColor};">${net.toLocaleString('ko-KR')}</td>
        ${matTd}
      </tr>`;
    }).join('');
  };

  const thStyle = 'padding:2.5pt 4pt;border:0.5pt solid #3a6fa0;background:#1F4E79;color:#fff;font-size:7.5pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
  const ftStyle = 'padding:2.5pt 4pt;border:0.5pt solid #3a6fa0;background:#2E74B5;color:#fff;font-size:7.5pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;';

  const normalAccts  = nonDefaultAccts.filter(a => !a.accountKind || a.accountKind === 'normal');
  const depositAccts = nonDefaultAccts.filter(a => a.accountKind === 'deposit');

  // 표시용 순증감 합계 — 연도 필터가 적용된 totals 기준(연도 미선택 시 all-time과 동일)
  const netOf = acctList => acctList.reduce((s,a)=>{
    const t = totals[a.name] || {income:0, expense:0, carryIn:0};
    return s + (a.carryover||0) + (t.carryIn||0) + t.income - t.expense;
  }, 0);
  const normalNetDisp  = netOf(normalAccts);
  const depositNetDisp = netOf(depositAccts);

  const makeTable = (acctList, isDeposit) => {
    const carry = acctList.reduce((s,a)=>s+(a.carryover||0)+(totals[a.name]?.carryIn||0),0);
    const inc   = acctList.reduce((s,a)=>s+(totals[a.name]?.income||0),0);
    const exp   = acctList.reduce((s,a)=>s+(totals[a.name]?.expense||0),0);
    const net   = carry + inc - exp;
    const cols  = isDeposit ? 6 : 5;
    return `
    <table style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:7.5pt;">
      <colgroup>
        <col style="width:18%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:${isDeposit?'16%':'34%'}">
        ${isDeposit ? '<col style="width:18%">' : ''}
      </colgroup>
      <thead><tr>
        <th style="${thStyle}text-align:left;">계좌이름</th>
        <th style="${thStyle}text-align:right;">이월금</th>
        <th style="${thStyle}text-align:right;">수입금</th>
        <th style="${thStyle}text-align:right;">지출금</th>
        <th style="${thStyle}text-align:right;">합계</th>
        ${isDeposit ? `<th style="${thStyle}text-align:center;">만기일</th>` : ''}
      </tr></thead>
      <tbody>${makeRows(acctList, isDeposit)}</tbody>
      <tfoot><tr>
        <td style="${ftStyle}text-align:center;">합 계</td>
        <td style="${ftStyle}text-align:right;">${carry.toLocaleString('ko-KR')}</td>
        <td style="${ftStyle}text-align:right;">${inc.toLocaleString('ko-KR')}</td>
        <td style="${ftStyle}text-align:right;">${exp.toLocaleString('ko-KR')}</td>
        <td style="${ftStyle}text-align:right;">${net.toLocaleString('ko-KR')}</td>
        ${isDeposit ? `<td style="${ftStyle}"></td>` : ''}
      </tr></tfoot>
    </table>`;
  };

  const html = `
    <div class="print-page" style="display:block;">
      <div class="page-inner">
        <div class="print-title">🏦 계정 현황</div>
        <div class="print-period">${new Date().toLocaleDateString('ko-KR')} · ${yLabel}</div>

        <!-- 자산합계 -->
        <div style="display:flex;gap:8pt;margin-bottom:10pt;border:1pt solid #1F4E79;border-radius:6pt;padding:7pt 10pt;background:#EBF3FB;-webkit-print-color-adjust:exact;print-color-adjust:exact;align-items:center;">
          <div style="flex:2;min-width:0;">
            <div style="font-size:7pt;color:#555;white-space:nowrap;">자산합계</div>
            <div style="font-size:13pt;font-weight:900;color:${grandNetColor};white-space:nowrap;">${grandNet.toLocaleString('ko-KR')}원</div>
          </div>
          <div style="flex:1;min-width:0;border-left:0.5pt solid #b0c4de;padding-left:6pt;">
            <div style="font-size:6.5pt;color:#555;white-space:nowrap;">${mainLabel || '대표계정'}</div>
            <div style="font-size:8.5pt;font-weight:700;white-space:nowrap;">${mainNet.toLocaleString('ko-KR')}원</div>
          </div>
          <div style="flex:1;min-width:0;border-left:0.5pt solid #b0c4de;padding-left:6pt;">
            <div style="font-size:6.5pt;color:#555;white-space:nowrap;">일반계정</div>
            <div style="font-size:8.5pt;font-weight:700;white-space:nowrap;">${normalNet.toLocaleString('ko-KR')}원</div>
          </div>
          <div style="flex:1;min-width:0;border-left:0.5pt solid #b0c4de;padding-left:6pt;">
            <div style="font-size:6.5pt;color:#555;white-space:nowrap;">정기계정</div>
            <div style="font-size:8.5pt;font-weight:700;white-space:nowrap;">${depositNet.toLocaleString('ko-KR')}원</div>
          </div>
        </div>

        <!-- 일반계정 -->
        <div class="print-section-title">일반계정 합계 (${yLabel}) · ${normalNetDisp.toLocaleString('ko-KR')}원</div>
        ${makeTable(normalAccts, false)}

        <!-- 정기계정 -->
        <div class="print-section-title" style="margin-top:10pt;">정기계정 합계 (${yLabel}) · ${depositNetDisp.toLocaleString('ko-KR')}원</div>
        ${makeTable(depositAccts, true)}
      </div>
    </div>`;

  doPrint(html);
}

// ── 계정 현황 엑셀 내보내기 (일반계정/정기계정 각각 시트로) ──
function exportAccountsToExcel({totals, mainNet, normalNet, depositNet, mainLabel, grandNet, nonDefaultAccts, selectedYear, yearLabel}) {
  const wb = XLSX.utils.book_new();
  const numFmt = '#,##0';
  const gBdr = {style:'thin', color:{rgb:'CCCCCC'}};
  const allGray = {top:gBdr,bottom:gBdr,left:gBdr,right:gBdr};
  const HDR_FILL = {patternType:'solid',fgColor:{rgb:'1F4E79'}};
  const SUM_FILL = {patternType:'solid',fgColor:{rgb:'2E74B5'}};
  const whiteFont = {bold:true,color:{rgb:'FFFFFF'}};
  const blueFont  = {color:{rgb:'1F497D'}};
  const redFont   = {color:{rgb:'CC0000'}};
  const shortName = name => name.replace(/계정$/, '');
  const today = todayStr();
  const yLabel = yearLabel || (selectedYear && selectedYear !== 'all' ? `${selectedYear}년` : '전체 연도');

  const buildSheet = (acctList, isDeposit, sheetName) => {
    const header = isDeposit
      ? ['계좌이름','이월금','수입금','지출금','합계','만기일']
      : ['계좌이름','이월금','수입금','지출금','합계'];
    const aoa = [header];
    let sCarry=0, sInc=0, sExp=0;
    for (const a of acctList) {
      const t = totals[a.name] || {income:0, expense:0, carryIn:0};
      const carry = (a.carryover||0) + (t.carryIn||0);
      const net   = carry + t.income - t.expense;
      sCarry += carry; sInc += t.income; sExp += t.expense;
      const row = [shortName(a.name), carry, t.income, t.expense, net];
      if (isDeposit) {
        const md = a.maturityDate || '';
        row.push(md ? md.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3') : '-');
      }
      aoa.push(row);
    }
    const sNet = sCarry + sInc - sExp;
    const sumRow = ['합계', sCarry, sInc, sExp, sNet];
    if (isDeposit) sumRow.push('');
    aoa.push(sumRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const nCols = header.length;
    ws['!cols'] = isDeposit
      ? [{wch:14},{wch:13},{wch:13},{wch:13},{wch:14},{wch:12}]
      : [{wch:14},{wch:13},{wch:13},{wch:13},{wch:14}];

    const sc = (r,c,s) => {
      const addr = XLSX.utils.encode_cell({r,c});
      if (!ws[addr]) ws[addr] = {t:'s',v:''};
      ws[addr].s = s;
    };
    for (let c=0;c<nCols;c++) sc(0,c,{fill:HDR_FILL,font:whiteFont,border:allGray,alignment:{horizontal:c>0?'right':'center',vertical:'center'}});
    for (let r=1;r<aoa.length-1;r++) {
      for (let c=0;c<nCols;c++) {
        const addr = XLSX.utils.encode_cell({r,c});
        if (!ws[addr]) ws[addr]={t:'s',v:''};
        const isNum = typeof ws[addr].v === 'number';
        let font = {};
        if (c===2) font = blueFont;
        if (c===3) font = redFont;
        ws[addr].s = {font,border:allGray,alignment:{horizontal:c>0?'right':'left',vertical:'center'}, ...(isNum?{numFmt}:{})};
        if (isNum) ws[addr].z = numFmt;
      }
    }
    const sumR = aoa.length-1;
    for (let c=0;c<nCols;c++) {
      const addr = XLSX.utils.encode_cell({r:sumR,c});
      if (!ws[addr]) ws[addr]={t:'s',v:''};
      const isNum = typeof ws[addr].v === 'number';
      ws[addr].s = {fill:SUM_FILL,font:whiteFont,border:allGray,alignment:{horizontal:c>0?'right':'center',vertical:'center'},...(isNum?{numFmt}:{})};
      if (isNum) ws[addr].z = numFmt;
    }
    ws['!pageSetup'] = {paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  const normalAccts  = nonDefaultAccts.filter(a => !a.accountKind || a.accountKind === 'normal');
  const depositAccts = nonDefaultAccts.filter(a => a.accountKind === 'deposit');

  buildSheet(normalAccts, false, '일반계정');
  buildSheet(depositAccts, true, '정기계정');

  XLSX.writeFile(wb, `계정현황_${yLabel}_${today}.xlsx`);
}

function renderStatsTabBars(rows, total, isIncome) {
  if (rows.length === 0) {
    return `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', `선택한 기간의 ${isIncome?'수입':'지출'} 내역이 없습니다`)}</div>`;
  }
  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:13px; color:var(--text-2); margin-bottom:12px;">
        ${isIncome ? '개인별 헌금액' : '대분류별 지출'} ·
        <b class="tabular" style="color:var(--text-1);">${fmtMoney(total)}원</b>
      </div>
      ${rows.map(r => {
        const pct = total > 0 ? Math.round(r.amt/total*100) : 0;
        return `
          <div class="stat-bar-row" data-catid="${r.catId}" style="cursor:pointer;">
            <div class="stat-bar-label">${r.icon} ${escapeHTML(r.name)}</div>
            <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%; background:${r.color};"></div></div>
            <div class="stat-bar-amt tabular">${fmtMoney(r.amt)}</div>
            <div class="stat-bar-pct tabular">${pct}%</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// [내용] 탭: 수입=헌금 종류별 / 지출=대분류/소분류 집계 테이블
// 통계 [내용] 탭 집계: key → { label, amount, count, entries:[{txId,date,amount}] }
function buildStatsAggMap(detailTx, isIncome) {
  const aggMap = {};
  if (isIncome) {
    // 수입: 헌금 종류(세부항목 이름) 기준으로 집계
    for (const t of detailTx) {
      for (const l of (t.lines || [])) {
        const si  = subItemById(l.subItemId);
        const key = si ? si.name : 'etc';
        const lbl = key;
        if (!aggMap[key]) aggMap[key] = { label: lbl, amount: 0, count: 0, entries: [] };
        aggMap[key].amount += l.amount;
        aggMap[key].count  += 1;
        aggMap[key].entries.push({ txId: t.id, date: t.date, amount: l.amount, categoryId: t.categoryId, subGroupId: t.subGroupId || t.personId });
      }
    }
  } else {
    // 지출: "대분류/소분류" 조합으로 집계
    for (const t of detailTx) {
      const cat = txCatInfo(t);
      for (const l of (t.lines || [])) {
        const siName = txLineName(l);
        const key = `${t.categoryId}__${l.subItemId||''}`;
        const lbl = (l.subItemId || l.subItemName) ? `${cat.name}/${siName}` : cat.name;
        if (!aggMap[key]) aggMap[key] = { label: lbl, amount: 0, count: 0, entries: [] };
        aggMap[key].amount += l.amount;
        aggMap[key].count  += 1;
        aggMap[key].entries.push({ txId: t.id, date: t.date, amount: l.amount, categoryId: t.categoryId });
      }
    }
  }
  return aggMap;
}

function renderStatsTabDetail(detailTx, isIncome) {
  const sortKey = State.statsSortKey;
  const sortDir = State.statsSortDir;
  const arrow = sortDir === 'desc' ? ' ▼' : ' ▲';
  const hStyle = key => `cursor:pointer; ${sortKey===key ? 'color:var(--text-1);' : ''}`;

  const header = `
    <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
      <span data-sortkey="label" style="${hStyle('label')}">내용${sortKey==='label'?arrow:''}</span>
      <div style="display:flex; gap:16px; font-size:11.5px; color:var(--text-3); font-weight:700; padding-right:2px;">
        <span data-sortkey="count" style="min-width:36px; text-align:right; ${hStyle('count')}">건수${sortKey==='count'?arrow:''}</span>
        <span data-sortkey="amount" style="min-width:90px; text-align:right; ${hStyle('amount')}">금액${sortKey==='amount'?arrow:''}</span>
      </div>
    </div>
  `;

  if (detailTx.length === 0) {
    return header + `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', `선택한 기간의 ${isIncome?'수입':'지출'} 내역이 없습니다`)}</div>`;
  }

  const aggMap = buildStatsAggMap(detailTx, isIncome);

  const aggRows = Object.entries(aggMap)
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => {
      let cmp;
      if (sortKey === 'label') cmp = a.label.localeCompare(b.label, 'ko');
      else if (sortKey === 'count') cmp = a.count - b.count;
      else cmp = a.amount - b.amount;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  const totalAmt = aggRows.reduce((s,r) => s+r.amount, 0);

  return header + `
    <div class="card" style="padding:0 16px;">
      ${aggRows.map(r => `
        <div class="stats-agg-row" data-key="${escapeHTML(r.key)}" style="cursor:pointer;">
          <div class="stats-agg-label">${escapeHTML(r.label)}</div>
          <div class="stats-agg-count tabular">${r.count}건</div>
          <div class="stats-agg-amt tabular ${isIncome ? 'income' : 'expense'}">
            ${fmtMoney(r.amount)}원
          </div>
        </div>
      `).join('')}
      <div class="stats-agg-total">
        <span style="font-weight:700; color:var(--text-2);">합계</span>
        <span class="tabular ${isIncome?'income':'expense'}" style="font-weight:800;">${fmtMoney(totalAmt)}원</span>
      </div>
    </div>
  `;
}

// [이자] 탭: 계정별 이자 합계 집계
// key → { label(계정명), amount, count, entries:[{txId,date,amount,subName}], acct }
// 대표계정(재정계정) 거래도 포함하기 위해 mainAcctTxs()가 아닌 전체 거래를 날짜로만 필터링한다.
function buildInterestAggMap(range) {
  const aggMap = {};
  const interestCat = State.categories.find(c => c.type === 'income' && c.name === '이자');
  if (!interestCat) return aggMap;

  const acctById = {};
  for (const a of (State.linkedAccounts || [])) acctById[a.id] = a;
  const defAcct = (State.linkedAccounts || []).find(a => a.isDefault);
  const mainLabel = defAcct ? defAcct.name : '대표계정';

  for (const t of State.transactions) {
    if (t.type !== 'income') continue;
    if (t.categoryId !== interestCat.id) continue;
    if (t.date < range.start || t.date > range.end) continue;

    const key   = t.accountId || 'default';
    const acct  = t.accountId ? acctById[t.accountId] : defAcct;
    const label = acct ? acct.name : mainLabel;
    if (!aggMap[key]) aggMap[key] = { label, amount: 0, count: 0, entries: [], acct: acct || null };

    for (const l of (t.lines && t.lines.length ? t.lines : [{ subItemId: null, amount: t.amount }])) {
      const si = subItemById(l.subItemId);
      aggMap[key].amount += l.amount;
      aggMap[key].count  += 1;
      aggMap[key].entries.push({ txId: t.id, date: t.date, amount: l.amount, subName: si ? si.name : '이자' });
    }
  }
  return aggMap;
}

// 계정 정렬 우선순위: 대표계정(0) → 일반계정(1) → 정기계정(2), 그룹 내에서는 연결계좌 등록순서 그대로
function interestAcctGroupPriority(acct) {
  if (!acct) return 1;
  if (acct.isDefault) return 0;
  if (acct.accountKind === 'deposit') return 2;
  return 1;
}

function renderInterestTab(range) {
  const sortKey = State.statsSortKey;
  const sortDir = State.statsSortDir;
  const arrow = sortDir === 'desc' ? ' ▼' : ' ▲';
  const hStyle = key => `cursor:pointer; ${sortKey===key ? 'color:var(--text-1);' : ''}`;

  const header = `
    <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
      <span data-sortkey="label" style="${hStyle('label')}">계정${sortKey==='label'?arrow:''}</span>
      <div style="display:flex; gap:16px; font-size:11.5px; color:var(--text-3); font-weight:700; padding-right:2px;">
        <span data-sortkey="count" style="min-width:36px; text-align:right; ${hStyle('count')}">건수${sortKey==='count'?arrow:''}</span>
        <span data-sortkey="amount" style="min-width:90px; text-align:right; ${hStyle('amount')}">이자금액${sortKey==='amount'?arrow:''}</span>
      </div>
    </div>
  `;

  const acctIndex = {};
  (State.linkedAccounts || []).forEach((a, i) => { acctIndex[a.id] = i; });

  const aggMap = buildInterestAggMap(range);
  const aggRows = Object.entries(aggMap)
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => {
      // 1순위: 대표계정 → 일반계정 → 정기계정 그룹 순서는 항상 고정
      const pa = interestAcctGroupPriority(a.acct), pb = interestAcctGroupPriority(b.acct);
      if (pa !== pb) return pa - pb;

      // 2순위: 같은 그룹 안에서는 선택한 정렬 기준(계정명/건수/이자금액)으로 정렬
      let cmp;
      if (sortKey === 'label') cmp = a.label.localeCompare(b.label, 'ko');
      else if (sortKey === 'count') cmp = a.count - b.count;
      else cmp = a.amount - b.amount;
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;

      // 동점 시: 연결계좌 등록순서로 안정적으로 정렬
      const ia = a.acct ? (acctIndex[a.acct.id] ?? 999) : -1;
      const ib = b.acct ? (acctIndex[b.acct.id] ?? 999) : -1;
      return ia - ib;
    });

  if (aggRows.length === 0) {
    return header + `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', '선택한 기간의 이자 내역이 없습니다')}</div>`;
  }

  const totalAmt = aggRows.reduce((s,r) => s + r.amount, 0);

  return header + `
    <div class="card" style="padding:0 16px;">
      ${aggRows.map(r => `
        <div class="interest-agg-row" data-key="${escapeHTML(r.key)}" style="cursor:pointer;">
          <div class="stats-agg-label">🏦 ${escapeHTML(r.label)}</div>
          <div class="stats-agg-count tabular">${r.count}건</div>
          <div class="stats-agg-amt tabular income">${fmtMoney(r.amount)}원</div>
        </div>
      `).join('')}
      <div class="stats-agg-total">
        <span style="font-weight:700; color:var(--text-2);">합계</span>
        <span class="tabular income" style="font-weight:800;">${fmtMoney(totalAmt)}원</span>
      </div>
    </div>
  `;
}


/* =========================================================
   RENDER: SETTINGS
   ========================================================= */
/* =========================================================
   ITEM STRUCTURE SHEET — 설정에서 항목구조표 보기 및 인쇄
   ========================================================= */
/* =========================================================
   LEDGER SHEET — 설정에서 월장부 보기 및 인쇄
   ========================================================= */
function openLedgerSheet() {
  const sheet = document.getElementById('ledgerSheet');

  // 거래 있는 월 목록
  const monthsSet = new Set(State.transactions.map(t => t.date.slice(0,7)));
  const months = [...monthsSet].sort().reverse(); // 최신월 먼저
  const currentYM = months[0] || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;

  function renderLedger(ym) {
    const [yearStr, monthStr] = ym.split('-');
    const year = parseInt(yearStr), month = parseInt(monthStr);

    const txs = State.transactions
      .filter(t => t.date.startsWith(ym))
      .sort((a,b) => a.date.localeCompare(b.date) || (a.createdAt||0)-(b.createdAt||0));

    // 누계 계산 (해당 월 이전 누적)
    let running = 0;
    const allSorted = [...State.transactions].sort((a,b) => a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0));
    for (const t of allSorted) {
      if (t.date >= ym) break;
      running += t.type === 'income' ? t.amount : -t.amount;
    }

    // 데이터 행 생성
    const rows = [];
    for (const t of txs) {
      const cat = txCatInfo(t);
      const sgName = txSubGroupName(t) || '';
      const lines = (t.lines && t.lines.length > 0) ? t.lines : [{subItemId:null, amount:t.amount}];
      for (const l of lines) {
        const si = l.subItemId ? subItemById(l.subItemId) : null;
        const siRawName = txLineName(l);
        const siName = (l.subItemId || l.subItemName) ? subItemDisplayName(cat.type, cat.name, siRawName) : '';
        // 중분류: subGroups 있는 카테고리면 sg이름, 아니면 subGroup명
        const hasGroups = subGroupsOfCategory(cat.id).length > 0;
        const major = hasGroups ? sgName : (si && si.subGroupId ? ((State.subGroups||[]).find(g=>g.id===si.subGroupId)||{}).name||'' : '');
        running += t.type === 'income' ? l.amount : -l.amount;
        rows.push({
          date: t.date,
          cat: cat.name,
          major,
          minor: siName,
          income: t.type === 'income' ? l.amount : null,
          expense: t.type === 'expense' ? l.amount : null,
          acc: running,
        });
      }
    }

    // 결산 계산
    const inc = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const exp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const tongCat = State.categories.find(c=>c.name==='통장이동');
    const transfer = tongCat ? txs.filter(t=>t.categoryId===tongCat.id&&t.type==='income').reduce((s,t)=>s+t.amount,0) : 0;
    const depCat = State.categories.find(c=>c.name==='예금'&&c.type==='expense');
    const deposit = depCat ? txs.filter(t=>t.categoryId===depCat.id).reduce((s,t)=>s+t.amount,0) : 0;

    const TD = 'padding:2pt 3pt;border:0.5pt solid #ccc;font-size:7.5pt;';
    const TH = 'padding:2.5pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;font-weight:700;background:#DCE6F1;-webkit-print-color-adjust:exact;print-color-adjust:exact;';

    const dataRows = rows.map(r => `<tr>
      <td style="${TD}text-align:center;">${r.date.slice(5)}</td>
      <td style="${TD}">${escapeHTML(r.cat)}</td>
      <td style="${TD}">${escapeHTML(r.major)}</td>
      <td style="${TD}">${escapeHTML(r.minor)}</td>
      <td style="${TD}text-align:right;color:#1F497D;">${r.income ? r.income.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD}text-align:right;color:#CC0000;">${r.expense ? '-'+r.expense.toLocaleString('ko-KR') : ''}</td>
      <td style="${TD}text-align:right;">${r.acc.toLocaleString('ko-KR')}</td>
    </tr>`).join('');

    const SUM = 'padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;font-weight:700;background:#FFFFF0;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const summaryRows = [
      [month+'월 결산', '수입/지출', inc, exp],
      [null, '통장이동(선교)', transfer, null],
      [null, '예금', null, deposit],
      [null, '순헌금/지출', inc-transfer, exp-deposit],
    ].map(([c1,c2,iv,ev]) => `<tr>
      <td colspan="2" style="${SUM}font-weight:${c1?'700':'400'};">${escapeHTML(c1||'')}</td>
      <td colspan="2" style="${SUM}">${escapeHTML(c2)}</td>
      <td style="${SUM}text-align:right;color:#1F497D;">${iv ? iv.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM}text-align:right;color:#CC0000;">${ev ? '-'+ev.toLocaleString('ko-KR') : ''}</td>
      <td style="${SUM}"></td>
    </tr>`).join('');

    const tableHTML = `
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <colgroup>
          <col style="width:9%"><col style="width:13%"><col style="width:13%">
          <col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:17%">
        </colgroup>
        <thead style="display:table-header-group;"><tr>
          <th style="${TH}text-align:center;">일자</th>
          <th style="${TH}">대분류</th>
          <th style="${TH}">중분류</th>
          <th style="${TH}">소분류</th>
          <th style="${TH}text-align:right;">수입금액</th>
          <th style="${TH}text-align:right;">지출금액</th>
          <th style="${TH}text-align:right;">누계금액</th>
        </tr></thead>
        <tbody>${dataRows}</tbody>
        <tbody>${summaryRows}</tbody>
      </table>`;

    const approvalBoxScreen = `
      <div style="display:flex;justify-content:flex-end;margin-top:12px;margin-bottom:8px;">
        <table style="border-collapse:collapse;table-layout:fixed;width:155px;border:1px solid #555;">
          <colgroup>
            <col style="width:17px;">
            <col style="width:46px;">
            <col style="width:46px;">
            <col style="width:46px;">
          </colgroup>
          <tbody>
            <tr>
              <td rowspan="2" style="border:1px solid #555;padding:0;text-align:center;font-weight:700;font-size:8px;vertical-align:middle;overflow:hidden;">
                <span style="display:inline-block;writing-mode:vertical-lr;text-orientation:mixed;letter-spacing:2px;font-size:8px;font-weight:700;">결재</span>
              </td>
              <td style="border:1px solid #555;padding:2px 0;text-align:center;font-weight:700;font-size:8px;white-space:nowrap;overflow:hidden;">담당</td>
              <td style="border:1px solid #555;padding:2px 0;text-align:center;font-weight:700;font-size:8px;white-space:nowrap;overflow:hidden;">부장</td>
              <td style="border:1px solid #555;padding:2px 0;text-align:center;font-weight:700;font-size:8px;white-space:nowrap;overflow:hidden;">담임목사</td>
            </tr>
            <tr>
              <td style="border:1px solid #555;height:42px;"></td>
              <td style="border:1px solid #555;height:42px;"></td>
              <td style="border:1px solid #555;height:42px;"></td>
            </tr>
          </tbody>
        </table>
      </div>`;

    const body = sheet.querySelector('#ledgerBody');
    if (body) body.innerHTML = tableHTML + approvalBoxScreen;
    return { tableHTML, dataRows, summaryRows, TH };
  }

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="ldClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <div style="display:flex;align-items:center;gap:8px;">
        <h3>월장부</h3>
        <select id="ldMonthSel" style="font-size:13px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:var(--card);">
          ${months.map(m=>`<option value="${m}"${m===currentYM?'selected':''}>${m.replace('-','년 ')}월</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px;">
        <button id="ldExcel" style="font-size:13px;color:#217346;font-weight:700;padding:6px 10px;border-radius:8px;background:#E8F5E9;">📥 엑셀</button>
        <button id="ldPrint" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>
    </div>
    <div class="sheet-body" id="ledgerBody" style="padding:12px 16px 80px;">
    </div>
  `;

  let currentLedger = renderLedger(currentYM);

  sheet.querySelector('#ldClose').addEventListener('click', () => closeSheet('ledgerSheet'));
  sheet.querySelector('#ldExcel').addEventListener('click', () => {
    const ym = sheet.querySelector('#ldMonthSel').value;
    exportLedgerToExcel(ym);
  });
  sheet.querySelector('#ldMonthSel').addEventListener('change', e => {
    currentLedger = renderLedger(e.target.value);
  });
  sheet.querySelector('#ldPrint').addEventListener('click', () => {
    const ym = sheet.querySelector('#ldMonthSel').value;
    const [y,m] = ym.split('-');
    const appName = State.appName || '교회 회계부';
    // thead repeat을 위해 table을 print-page div 없이 직접 출력
    // @media print에서 thead가 매 페이지 반복됨
    const approvalSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCAyNDAgODAiPgogIDxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIzMCIgaGVpZ2h0PSI4MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cmVjdCB4PSIzMCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjEwMCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjE3MCIgeT0iMCIgd2lkdGg9IjcwIiBoZWlnaHQ9IjE2IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjMwIiB5PSIxNiIgd2lkdGg9IjcwIiBoZWlnaHQ9IjY0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxyZWN0IHg9IjEwMCIgeT0iMTYiIHdpZHRoPSI3MCIgaGVpZ2h0PSI2NCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cmVjdCB4PSIxNzAiIHk9IjE2IiB3aWR0aD0iNzAiIGhlaWdodD0iNjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMTUiIHk9IjQ0IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjEwIiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgd3JpdGluZy1tb2RlPSJ0YiI+6rKw7J6sPC90ZXh0PgogIDx0ZXh0IHg9IjY1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ri7Tri7k8L3RleHQ+CiAgPHRleHQgeD0iMTM1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7rtoDsnqU8L3RleHQ+CiAgPHRleHQgeD0iMjA1IiB5PSI4IiBmb250LWZhbWlseT0iJ+unkeydgCDqs6DrlJUnLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjkiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ri7TsnoTrqqnsgqw8L3RleHQ+Cjwvc3ZnPg==';
    const approvalBox = `
      <div style="page-break-inside:avoid;break-inside:avoid;margin-top:6pt;display:flex;justify-content:flex-end;">
        <img src="${approvalSvg}" style="width:65%;height:auto;" alt="결재란">
      </div>`;
    // 인쇄용: 행을 30개씩 나눠 페이지마다 헤더 포함한 테이블 생성
    const { dataRows: dRows, summaryRows: sRows, TH: TH2 } = currentLedger;
    const ROWS_PER_PAGE = 30;
    const colgroup = `<colgroup>
      <col style="width:9%"><col style="width:13%"><col style="width:13%">
      <col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:17%">
    </colgroup>`;
    const makeHead = (th) => `<thead><tr>
      <th style="${th}text-align:center;">일자</th>
      <th style="${th}">대분류</th><th style="${th}">중분류</th><th style="${th}">소분류</th>
      <th style="${th}text-align:right;">수입금액</th>
      <th style="${th}text-align:right;">지출금액</th>
      <th style="${th}text-align:right;">누계금액</th>
    </tr></thead>`;

    // dataRows를 <tr>...</tr> 단위로 분리
    const allDataRows = dRows.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    const pages2 = [];
    if (allDataRows.length === 0) {
      // 거래 행이 없어도 결산+결재란은 출력
      pages2.push(`<div class="print-page"><div class="page-inner">
        <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
          ${colgroup}${makeHead(TH2)}
          <tbody>${sRows}</tbody>
        </table>
        ${approvalBox}
      </div></div>`);
    } else {
      for (let i = 0; i < allDataRows.length; i += ROWS_PER_PAGE) {
        const chunk = allDataRows.slice(i, i + ROWS_PER_PAGE).join('');
        const isLast = i + ROWS_PER_PAGE >= allDataRows.length;
        pages2.push(`<div class="print-page"><div class="page-inner">
          <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
            ${colgroup}${makeHead(TH2)}
            <tbody>${chunk}</tbody>
            ${isLast ? `<tbody>${sRows}</tbody>` : ''}
          </table>
          ${isLast ? approvalBox : ''}
        </div></div>`);
      }
    }
    // 마지막 페이지에 결재란이 없으면 강제 추가 (안전장치)
    if (pages2.length > 0 && !pages2[pages2.length-1].includes('결재')) {
      pages2[pages2.length-1] = pages2[pages2.length-1].replace('</div></div>', approvalBox + '</div></div>');
    }
    doPrint(pages2.join(''));
  });

  openSheet('ledgerSheet');
}

function exportItemStructureToExcel() {
  const cats = [...State.categories].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const aoa = [['구분','대분류','중분류','소분류']];

  function buildRows(typeKey, typeLabel) {
    const typeCats = cats.filter(c => c.type === typeKey);
    for (const cat of typeCats) {
      const allSubs = (State.subItems||[])
        .filter(s => s.categoryId === cat.id)
        .sort((a,b) => a.name.localeCompare(b.name,'ko'));
      const sgMap = new Map();
      const direct = [];
      for (const s of allSubs) {
        if (s.subGroupId) {
          const sg = (State.subGroups||[]).find(g => g.id === s.subGroupId);
          const sgName = sg ? sg.name : s.name;
          if (!sgMap.has(s.subGroupId)) sgMap.set(s.subGroupId, {name:sgName, items:[]});
          sgMap.get(s.subGroupId).items.push(s);
        } else {
          direct.push(s);
        }
      }
      // 중분류 이름순 정렬
      const sortedGroups = [...sgMap.entries()].sort((a,b) => a[1].name.localeCompare(b[1].name,'ko'));
      for (const [,grp] of sortedGroups) {
        grp.items.sort((a,b) => a.name.localeCompare(b.name,'ko'));
        for (const item of grp.items) {
          aoa.push([typeLabel, `${cat.icon} ${cat.name}`, grp.name, item.name]);
        }
      }
      direct.sort((a,b) => a.name.localeCompare(b.name,'ko'));
      for (const item of direct) {
        aoa.push([typeLabel, `${cat.icon} ${cat.name}`, '(그룹없음)', item.name]);
      }
    }
  }

  buildRows('income', '수입');
  buildRows('expense', '지출');

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:8},{wch:18},{wch:18},{wch:20}];
  // 헤더 스타일
  ['A1','B1','C1','D1'].forEach(addr => {
    if (ws[addr]) ws[addr].s = { font:{bold:true,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'1E3A5F'}}, alignment:{horizontal:'center'} };
  });
  XLSX.utils.book_append_sheet(wb, ws, '항목구조표');
  const appTitle = document.title || '교회회계부';
  XLSX.writeFile(wb, `항목구조표_${appTitle}.xlsx`);
}

// hex 색상을 percent만큼 어둡게(음수)/밝게(양수) 조정 (항목구조표 줄무늬 배경용)
function shadeColor(hex, percent) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00FF) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000FF) + Math.round(255 * (percent / 100));
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function openItemStructureSheet() {
  const sheet = document.getElementById('itemStructureSheet');
  const cats = [...State.categories].sort((a,b)=>a.name.localeCompare(b.name,'ko'));

  function buildSection(typeKey, typeLabel, titleBg, catBg, catFg, grpBg, itemBg) {
    let rows = '';
    const typeCats = cats.filter(c => c.type === typeKey);
    for (const cat of typeCats) {
      const allSubs = (State.subItems||[])
        .filter(s => s.categoryId === cat.id)
        .sort((a,b) => a.name.localeCompare(b.name,'ko'));
      // subGroup별 그룹핑
      const sgMap = new Map();
      const direct = [];
      for (const s of allSubs) {
        if (s.subGroupId) {
          const sg = (State.subGroups||[]).find(g => g.id === s.subGroupId);
          const sgName = sg ? sg.name : s.name;
          if (!sgMap.has(s.subGroupId)) sgMap.set(s.subGroupId, {name:sgName, items:[]});
          sgMap.get(s.subGroupId).items.push(s);
        } else {
          direct.push(s);
        }
      }
      if (sgMap.size === 0 && direct.length === 0) continue;

      const totalRows = [...sgMap.values()].reduce((s,g)=>s+g.items.length,0) + direct.length;
      // 중분류 이름순 정렬
      const sortedSgMap = [...sgMap.entries()].sort((a,b) => a[1].name.localeCompare(b[1].name,'ko'));
      let first = true;
      let groupIdx = 0;
      const totalGroups = sortedSgMap.length + (direct.length ? 1 : 0);
      for (const [,grp] of sortedSgMap) {
        grp.items.sort((a,b) => a.name.localeCompare(b.name,'ko'));
        const zebraGrp = (groupIdx % 2 === 0) ? grpBg : shadeColor(grpBg, -6);
        const zebraItem = (groupIdx % 2 === 0) ? itemBg : shadeColor(itemBg, -4);
        const isLastGroup = (groupIdx === totalGroups - 1);
        let gFirst = true;
        for (let ii = 0; ii < grp.items.length; ii++) {
          const item = grp.items[ii];
          const isLastRowOfGroup = (ii === grp.items.length - 1);
          const catBorderBottom = (isLastGroup && isLastRowOfGroup) ? `border-bottom:2pt solid ${catFg};` : '';
          rows += `<tr>
            ${first ? `<td rowspan="${totalRows}" style="text-align:center;font-weight:700;font-size:9px;background:${catBg};color:${catFg};border:1pt solid #9CA3AF;border-right:2pt solid ${catFg};vertical-align:middle;padding:1pt 2pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escapeHTML(cat.icon)} ${escapeHTML(cat.name)}</td>` : ''}
            ${gFirst ? `<td rowspan="${grp.items.length}" style="font-size:9px;font-weight:700;background:${zebraGrp};border:1pt solid #9CA3AF;border-right:1.5pt solid #B0B7C3;${isLastGroup?`border-bottom:2pt solid ${catFg};`:''}vertical-align:middle;padding:2pt 3pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escapeHTML(grp.name)}</td>` : ''}
            <td style="font-size:9px;background:${zebraItem};border:1pt solid #9CA3AF;${catBorderBottom}padding:2pt 3pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escapeHTML(item.name)}</td>
          </tr>`;
          first = false; gFirst = false;
        }
        groupIdx++;
      }
      direct.sort((a,b) => a.name.localeCompare(b.name,'ko'));
      for (let di = 0; di < direct.length; di++) {
        const item = direct[di];
        const isLastRow = (di === direct.length - 1);
        const catBorderBottom = isLastRow ? `border-bottom:2pt solid ${catFg};` : '';
        rows += `<tr>
          ${first ? `<td rowspan="${totalRows}" style="text-align:center;font-weight:700;font-size:9px;background:${catBg};color:${catFg};border:1pt solid #9CA3AF;border-right:2pt solid ${catFg};vertical-align:middle;padding:1pt 2pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escapeHTML(cat.icon)} ${escapeHTML(cat.name)}</td>` : ''}
          ${di===0 ? `<td rowspan="${direct.length}" style="font-size:9px;color:#9CA3AF;font-style:italic;background:${grpBg};border:1pt solid #9CA3AF;border-right:1.5pt solid #B0B7C3;${isLastRow?`border-bottom:2pt solid ${catFg};`:''}vertical-align:middle;padding:2pt 3pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">(그룹없음)</td>` : ''}
          <td style="font-size:9px;background:${itemBg};border:1pt solid #9CA3AF;${catBorderBottom}padding:2pt 3pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escapeHTML(item.name)}</td>
        </tr>`;
        first = false;
      }
    }
    if (!rows) return '';
    return `
      <tr><td colspan="3" style="background:${titleBg};color:#fff;font-weight:700;font-size:10px;padding:3pt 4pt;line-height:1.4;border:1pt solid #555;-webkit-print-color-adjust:exact;print-color-adjust:exact;">▶ ${typeLabel}</td></tr>
      ${rows}`;
  }

  const incSection = buildSection('income','수입 항목','#1D4ED8','#DBEAFE','#1E3A8A','#EFF6FF','#F8FBFF');
  const expSection = buildSection('expense','지출 항목','#BE185D','#FCE7F3','#831843','#FDF2F8','#FFF5FB');

  const tableHTML = `
    <table style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:9px;line-height:1.2;">
      <thead>
        <tr style="background:#1E3A5F;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
          <th style="color:#fff;font-size:9px;font-weight:700;padding:3pt;line-height:1.2;border:0.7pt solid #555;text-align:center;width:25%;">대분류</th>
          <th style="color:#fff;font-size:9px;font-weight:700;padding:3pt;line-height:1.2;border:0.7pt solid #555;text-align:center;width:25%;">중분류</th>
          <th style="color:#fff;font-size:9px;font-weight:700;padding:3pt;line-height:1.2;border:0.7pt solid #555;text-align:center;width:50%;">소분류</th>
        </tr>
      </thead>
      <tbody>${incSection}${expSection}</tbody>
    </table>`;

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="isClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>항목구조표</h3>
      <div style="display:flex;gap:6px;">
        <button id="isExcel" style="font-size:13px;color:#1D7A4C;font-weight:700;padding:6px 10px;border-radius:8px;background:#E6F4EA;">📊 엑셀</button>
        <button id="isPrint" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>
    </div>
    <div class="sheet-body" style="padding:12px 16px 80px;">
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <div style="width:100%;box-sizing:border-box;">
          ${tableHTML}
        </div>
      </div>
    </div>
  `;

  sheet.querySelector('#isClose').addEventListener('click', () => closeSheet('itemStructureSheet'));
  sheet.querySelector('#isExcel').addEventListener('click', () => exportItemStructureToExcel());
  sheet.querySelector('#isPrint').addEventListener('click', () => {
    const appTitle = document.title || '교회 회계부';
    doPrint(`<div class="print-page"><div class="page-inner"><div class="print-title">📋 항목구조표</div><div class="print-period">${appTitle}</div><div style="margin-top:8pt;">${tableHTML}</div></div></div>`);
  });

  openSheet('itemStructureSheet');
}

/* =========================================================
   ACCOUNTS TAB — 계정 현황
   통장이동(수입) subItem명 = 계정수입
   예금(지출) subItem명 = 계정지출
   linkedAccounts의 name과 subItem name을 매칭하여 집계
   ========================================================= */
function calcAcctBalanceMap() {
  // 계정별 현잔액 계산 (subItemName → 잔액)
  const tongCat = State.categories.find(c => c.name === '통장이동' && c.type === 'income');
  const expCat  = State.categories.find(c => c.name === '예금' && c.type === 'expense');
  const incomeSubIds = {}, expenseSubIds = {};
  for (const si of (State.subItems||[])) {
    if (expCat  && si.categoryId === expCat.id)  incomeSubIds[si.id]  = si.name;
    if (tongCat && si.categoryId === tongCat.id) expenseSubIds[si.id] = si.name;
  }
  const idToName = {};
  for (const a of (State.linkedAccounts||[])) idToName[a.id] = a.name;
  const acctIncome = {}, acctExpense = {};
  for (const t of (State.transactions||[])) {
    if (t.accountId && idToName[t.accountId]) {
      const n = idToName[t.accountId];
      const a = (State.linkedAccounts||[]).find(x=>x.id===t.accountId);
      if (a && !a.isDefault) {
        if (t.type==='income')  acctIncome[n]  = (acctIncome[n]||0)  + t.amount;
        if (t.type==='expense') acctExpense[n] = (acctExpense[n]||0) + t.amount;
        continue;
      }
    }
    for (const line of (t.lines||[])) {
      const sid = line.subItemId, amt = line.amount||0;
      if (incomeSubIds[sid])  acctIncome[incomeSubIds[sid]]   = (acctIncome[incomeSubIds[sid]]||0)   + amt;
      if (expenseSubIds[sid]) acctExpense[expenseSubIds[sid]] = (acctExpense[expenseSubIds[sid]]||0) + amt;
    }
  }
  const map = {};
  for (const a of (State.linkedAccounts||[])) {
    if (a.isDefault) continue;
    map[a.name] = (a.carryover||0) + (acctIncome[a.name]||0) - (acctExpense[a.name]||0);
  }
  return map;
}

// year: null/undefined/'all' → 전체 기간 합산(기존 동작과 동일, carryIn은 항상 0)
//       숫자연도 지정 시 → income/expense는 해당 연도 거래만 집계하고,
//       carryIn에는 그 연도 이전(1/1 이전) 거래들의 순증감(수입-지출)을 누적해
//       "해당 연도 시작 시점 이월잔액에 더할 보정값"으로 반환한다.
function calcAcctTotals(year) {
  const tongCat = State.categories.find(c => c.name === '통장이동' && c.type === 'income');
  const expCat  = State.categories.find(c => c.name === '예금' && c.type === 'expense');

  // 계정명 → subItemId 매핑 (통장이동: 계정지출, 예금: 계정수입)
  const incomeMap  = {};  // acctName → subItemId (예금지출 = 계정수입)
  const expenseMap = {};  // acctName → subItemId (통장이동수입 = 계정지출)
  for (const si of (State.subItems || [])) {
    if (expCat  && si.categoryId === expCat.id)  incomeMap[si.name]  = si.id;
    if (tongCat && si.categoryId === tongCat.id) expenseMap[si.name] = si.id;
  }

  // 계좌 id → name 매핑
  const idToName = {};
  for (const a of (State.linkedAccounts || [])) idToName[a.id] = a.name;

  const yearFilter = (year != null && year !== 'all') ? String(year) : null;

  const result = {};  // acctName → { income, expense, carryIn }
  const ensure = name => { if (!result[name]) result[name] = {income:0, expense:0, carryIn:0}; };

  const applyOne = (name, date, type, amt) => {
    ensure(name);
    if (!yearFilter) {
      if (type === 'income') result[name].income += amt; else result[name].expense += amt;
      return;
    }
    const y = (date || '').slice(0, 4);
    if (y === yearFilter) {
      if (type === 'income') result[name].income += amt; else result[name].expense += amt;
    } else if (y && y < yearFilter) {
      result[name].carryIn += (type === 'income' ? amt : -amt);
    }
  };

  for (const t of (State.transactions || [])) {
    // ── 방식 A: accountId 직접 태깅 (v2.25 이후 신규 거래) ──
    let taggedName = null; // 방식 A로 이미 집계된 계좌 이름 (방식 B 중복 집계 방지용)
    if (t.accountId && idToName[t.accountId]) {
      const name = idToName[t.accountId];
      // 대표계정(재정계정) 거래는 제외
      const acct = (State.linkedAccounts||[]).find(a => a.id === t.accountId);
      if (acct && !acct.isDefault) {
        taggedName = name;
        applyOne(name, t.date, t.type, t.amount);
      }
    }
    // ── 방식 B: 예금/통장이동 subItem 기준 — 계좌간 이체의 상대 계좌를 반영 ──
    // 방식 A로 이미 집계된 "자기 자신" 계좌만 제외하고, 이체 상대 계좌(다른 계좌)는 항상 반영한다.
    // (예: 건축계정 → 정기건축2 이체 시, 건축계정은 방식 A로, 정기건축2는 방식 B로 각각 집계되어야 함)
    for (const line of (t.lines || [])) {
      const sid = line.subItemId;
      const amt = line.amount || 0;
      for (const [name, id] of Object.entries(incomeMap)) {
        if (sid === id && name !== taggedName) applyOne(name, t.date, 'income', amt);
      }
      for (const [name, id] of Object.entries(expenseMap)) {
        if (sid === id && name !== taggedName) applyOne(name, t.date, 'expense', amt);
      }
    }
  }
  return result;
}

// 계정 탭에서 연도 필터 선택지로 사용할 연도 목록 (오름차순, 올해 포함)
function allAccountsYears() {
  const years = new Set();
  years.add(new Date().getFullYear());
  for (const t of (State.transactions || [])) {
    if (t.date) years.add(Number(t.date.slice(0, 4)));
  }
  return [...years].sort((a, b) => a - b);
}

async function renderAccounts() {
  const page = document.getElementById('page-accounts');
  const sub = State.accountsSubTab || 'normal';

  // ── 재정(대표계정) 합계 ──
  const { totalIncome: mainIncome, totalExpense: mainExpense, carryover: mainCarry, net: mainNet } = await totalAssets();
  const defaultAcct = (State.linkedAccounts || []).find(a => a.isDefault);
  const mainLabel = defaultAcct ? defaultAcct.name : '대표계정';

  // ── 연결계좌 합계 (자산합계 카드는 항상 전체기간 기준) ──
  const totals = calcAcctTotals();
  // ── 연도 필터 적용 합계 (일반계정/정기계정 표 + 인쇄/엑셀에 사용) ──
  const selectedYear = State.accountsYear || 'all';
  const yearTotals = selectedYear === 'all' ? totals : calcAcctTotals(selectedYear);
  const nonDefaultAccts = (State.linkedAccounts || []).filter(a => !a.isDefault);

  let normalCarry = 0, normalIncome = 0, normalExpense = 0;
  let depositCarry = 0, depositIncome = 0, depositExpense = 0;
  for (const a of nonDefaultAccts) {
    const t = totals[a.name] || {income:0, expense:0};
    const carry = a.carryover || 0;
    if (!a.accountKind || a.accountKind === 'normal') {
      normalCarry   += carry;
      normalIncome  += t.income;
      normalExpense += t.expense;
    } else if (a.accountKind === 'deposit') {
      depositCarry   += carry;
      depositIncome  += t.income;
      depositExpense += t.expense;
    }
  }
  const normalNet  = normalCarry  + normalIncome  - normalExpense;
  const depositNet = depositCarry + depositIncome - depositExpense;

  // ── 전체 자산합계 ──
  const grandCarry   = mainCarry   + normalCarry   + depositCarry;
  const grandIncome  = mainIncome  + normalIncome  + depositIncome;
  const grandExpense = mainExpense + normalExpense  + depositExpense;
  const grandNet     = mainNet     + normalNet      + depositNet;
  const grandNetColor = grandNet >= 0 ? 'var(--primary)' : 'var(--expense)';

  // ── 현재 탭 계좌 목록 (정기계정 탭이면 정렬 적용) ──
  let accounts = nonDefaultAccts.filter(a => {
    if (sub === 'deposit') return a.accountKind === 'deposit';
    return !a.accountKind || a.accountKind === 'normal';
  });

  if (accounts.length > 0) {
    const sk  = (sub === 'deposit' ? State.depositSortKey : State.normalSortKey) || 'name';
    const dir = (sub === 'deposit' ? State.depositSortDir : State.normalSortDir) || 'asc';
    accounts = [...accounts].sort((a, b) => {
      let va, vb;
      if (sk === 'maturity') {
        va = a.maturityDate || 'zzzz'; // 미입력은 맨 뒤
        vb = b.maturityDate || 'zzzz';
      } else {
        va = a.name;
        vb = b.name;
      }
      return dir === 'asc' ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
    });
  }

  let totalCarry = 0, totalIncome = 0, totalExpense = 0;
  for (const a of accounts) {
    const t = yearTotals[a.name] || {income:0, expense:0, carryIn:0};
    totalCarry   += (a.carryover || 0) + (t.carryIn || 0);
    totalIncome  += t.income;
    totalExpense += t.expense;
  }
  const totalNet = totalCarry + totalIncome - totalExpense;

  const fmt = n => n ? n.toLocaleString('ko-KR') : '-';
  const shortName = name => name.replace(/계정$/, '');

  const emptyMsg = sub === 'deposit'
    ? '등록된 정기계정 계좌가 없어요<br><span style="font-size:12px;">설정 → 연결계좌 관리에서 추가하세요</span>'
    : '등록된 계정이 없어요<br><span style="font-size:12px;">설정 → 연결계좌 관리에서 추가하세요</span>';

  const rowsHTML = accounts.length === 0
    ? `<tr><td colspan="${sub==='deposit'?6:5}" style="text-align:center;color:var(--text-3);padding:24px;">${emptyMsg}</td></tr>`
    : accounts.map(a => {
        const t = yearTotals[a.name] || {income:0, expense:0, carryIn:0};
        const carry = (a.carryover || 0) + (t.carryIn || 0);
        const net   = carry + t.income - t.expense;
        const netColor = net >= 0 ? 'var(--primary)' : 'var(--expense)';
        // 만기일 표시 (정기계정 탭)
        let maturityTd = '';
        if (sub === 'deposit') {
          const md = a.maturityDate || '';
          const matLabel = md ? md.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3') : '-';
          // 만기 경과 여부
          let matColor = 'var(--text-3)';
          if (md) {
            const today = todayStr();
            matColor = md < today ? 'var(--expense)' : 'var(--primary)';
          }
          maturityTd = `<td class="acct-tbl-num" style="color:${matColor};font-size:12px;">${matLabel}</td>`;
        }
        return `<tr class="acct-tbl-row" data-acct-id="${a.id}" style="cursor:pointer;">
          <td class="acct-tbl-name">${escapeHTML(shortName(a.name))}</td>
          <td class="acct-tbl-num">${fmt(carry)}</td>
          <td class="acct-tbl-num income">${fmt(t.income)}</td>
          <td class="acct-tbl-num expense">${fmt(t.expense)}</td>
          <td class="acct-tbl-num" style="color:${netColor};font-weight:700;">${net.toLocaleString('ko-KR')}</td>
          ${maturityTd}
        </tr>`;
      }).join('');

  const summaryTitle = sub === 'deposit' ? '정기계정 합계' : '계좌 합계';
  const yearLabel = selectedYear === 'all' ? '전체 연도' : `${selectedYear}년`;

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;display:flex;align-items:center;justify-content:space-between;">
      <h1>계정</h1>
      <div style="display:flex;gap:6px;">
        <button id="acctExcel" style="font-size:13px;color:#217346;font-weight:700;display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;background:#E8F5E9;">📥 엑셀</button>
        <button id="acctPrint" style="font-size:13px;color:var(--primary);font-weight:700;display:flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>
    </div>

    <!-- 자산합계 카드 -->
    <div class="acct-grand-card">
      <div class="acct-grand-title">자산합계</div>
      <div class="acct-grand-amount" style="color:${grandNetColor};">${grandNet.toLocaleString('ko-KR')}원</div>
      <div class="acct-grand-rows">
        <div class="acct-grand-row">
          <span class="acct-grand-label">${mainLabel}</span>
          <span class="acct-grand-val">${mainNet.toLocaleString('ko-KR')}원</span>
        </div>
        <div class="acct-grand-row">
          <span class="acct-grand-label">일반계정</span>
          <span class="acct-grand-val">${normalNet.toLocaleString('ko-KR')}원</span>
        </div>
        <div class="acct-grand-row">
          <span class="acct-grand-label">정기계정</span>
          <span class="acct-grand-val">${depositNet.toLocaleString('ko-KR')}원</span>
        </div>
      </div>
    </div>

    <!-- 서브탭 -->
    <div class="acct-sub-tabs">
      <button class="acct-sub-tab ${sub==='normal'?'active':''}" data-sub="normal">일반계정</button>
      <button class="acct-sub-tab ${sub==='deposit'?'active':''}" data-sub="deposit">정기계정</button>
    </div>

    <!-- 연도 필터 -->
    <div class="acct-year-bar">
      <button id="acctYearBtn" class="acct-year-btn">📅 ${yearLabel} <span style="font-size:10px;">▾</span></button>
      ${selectedYear !== 'all' ? `<span class="acct-year-hint">이월금 = 연초 이월잔액</span>` : ''}
    </div>

    <div class="acct-summary-card">
      <div class="acct-summary-title">${summaryTitle}</div>
      <div class="acct-summary-amount">${totalNet.toLocaleString('ko-KR')}원</div>
      <div class="acct-summary-row">
        <span>이월 <b>${totalCarry.toLocaleString('ko-KR')}원</b></span>
        <span>수입 <b class="income">${totalIncome.toLocaleString('ko-KR')}원</b></span>
        <span>지출 <b class="expense">${totalExpense.toLocaleString('ko-KR')}원</b></span>
      </div>
    </div>

    <div class="acct-tbl-wrap">
      <table class="acct-tbl" style="min-width:${sub==='deposit'?'580px':'460px'};">
        <thead>
          <tr>
            <th class="acct-tbl-name acct-th-sort" data-sort="name">
              계좌이름<span class="acct-sort-icon">${(sub==='deposit' ? State.depositSortKey : State.normalSortKey)==='name' ? ((sub==='deposit' ? State.depositSortDir : State.normalSortDir)==='asc'?'↑':'↓') : '↕'}</span>
            </th>
            <th class="acct-tbl-num">이월금</th>
            <th class="acct-tbl-num">수입금</th>
            <th class="acct-tbl-num">지출금</th>
            <th class="acct-tbl-num">합계</th>
            ${sub==='deposit' ? `<th class="acct-tbl-num acct-th-sort" data-sort="maturity">만기일<span class="acct-sort-icon">${State.depositSortKey==='maturity' ? (State.depositSortDir==='asc'?'↑':'↓') : '↕'}</span></th>` : ''}
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
  `;

  page.querySelectorAll('.acct-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      State.accountsSubTab = btn.dataset.sub;
      renderAccounts();
    });
  });

  page.querySelector('#acctYearBtn').addEventListener('click', () => openAccountsYearPopup());

  const printPayload = {
    sub, accounts, totals: yearTotals, grandNet, grandNetColor, mainNet, normalNet, depositNet, mainLabel,
    totalCarry, totalIncome, totalExpense, totalNet, summaryTitle,
    normalCarry, normalIncome, normalExpense,
    depositCarry, depositIncome, depositExpense,
    nonDefaultAccts, selectedYear, yearLabel
  };

  page.querySelector('#acctPrint').addEventListener('click', () => printAccounts(printPayload));
  page.querySelector('#acctExcel').addEventListener('click', () => exportAccountsToExcel(printPayload));

  // 계정 탭(일반계정/정기계정): 헤더 클릭 정렬
  page.querySelectorAll('.acct-th-sort[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const sortKeyProp = sub === 'deposit' ? 'depositSortKey' : 'normalSortKey';
      const sortDirProp = sub === 'deposit' ? 'depositSortDir' : 'normalSortDir';
      if (State[sortKeyProp] === key) {
        State[sortDirProp] = State[sortDirProp] === 'asc' ? 'desc' : 'asc';
      } else {
        State[sortKeyProp] = key;
        State[sortDirProp] = 'asc';
      }
      renderAccounts();
    });
  });

  page.querySelectorAll('.acct-tbl-row[data-acct-id]').forEach(row => {
    row.addEventListener('click', () => {
      const acct = (State.linkedAccounts || []).find(a => a.id === row.dataset.acctId);
      if (acct) openAcctDetail(acct);
    });
  });
}

// ── 계정 탭: 연도 선택 팝업 ──
function openAccountsYearPopup() {
  const existing = document.getElementById('acctYearPop');
  if (existing) { existing.remove(); return; }

  const years = allAccountsYears();
  const cur = State.accountsYear || 'all';

  const pop = document.createElement('div');
  pop.id = 'acctYearPop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
  pop.innerHTML = `
    <div style="background:var(--card);border-radius:20px;padding:20px;width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:14px;text-align:center;">연도 선택</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:260px;overflow-y:auto;">
        <button data-year="all" style="padding:10px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${cur==='all'?'700':'400'};background:${cur==='all'?'var(--primary)':'var(--card)'};color:${cur==='all'?'#fff':'var(--text-1)'};cursor:pointer;">전체</button>
        ${years.map(y => `
          <button data-year="${y}" style="padding:10px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${String(y)===String(cur)?'700':'400'};background:${String(y)===String(cur)?'var(--primary)':'var(--card)'};color:${String(y)===String(cur)?'#fff':'var(--text-1)'};cursor:pointer;">${y}년</button>
        `).join('')}
      </div>
      <button id="acctYearPopClose" style="width:100%;margin-top:16px;padding:11px;border-radius:12px;background:var(--surface-2);border:none;font-size:14px;font-weight:600;color:var(--text-1);">닫기</button>
    </div>`;
  document.body.appendChild(pop);

  pop.querySelectorAll('[data-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      const y = btn.dataset.year;
      State.accountsYear = y === 'all' ? 'all' : Number(y);
      pop.remove();
      renderAccounts();
    });
  });
  pop.querySelector('#acctYearPopClose').addEventListener('click', () => pop.remove());
  pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
}

/* =========================================================
   ACCT DETAIL SHEET — 계정 탭에서 계정 클릭 시 거래 내역
   재정→계정 이체(예금) + 계정→재정 반환(통장이동) + accountId 직접 태깅 거래
   ========================================================= */
function openAcctDetail(acct) {
  renderAcctDetail(acct);
  openSheet('acctDetailSheet');
}

function renderAcctDetail(acct) {
  const sheet = document.getElementById('acctDetailSheet');
  const tongCat = State.categories.find(c => c.name === '통장이동' && c.type === 'income');
  const expCat  = State.categories.find(c => c.name === '예금' && c.type === 'expense');

  // 이 계정에 해당하는 subItemId 수집
  const incomeSubIds  = new Set(); // 예금→계정 (수입)
  const expenseSubIds = new Set(); // 통장이동→재정 (지출)
  for (const si of (State.subItems || [])) {
    if (expCat  && si.categoryId === expCat.id  && si.name === acct.name) incomeSubIds.add(si.id);
    if (tongCat && si.categoryId === tongCat.id && si.name === acct.name) expenseSubIds.add(si.id);
  }

  // 거래 수집
  const txList = [];
  for (const t of (State.transactions || [])) {
    // 방식 A: accountId 직접 태깅
    if (t.accountId === acct.id) {
      txList.push({ date: t.date, type: t.type, amount: t.amount, memo: t.memo || '', source: 'direct', tx: t });
      continue;
    }
    // 방식 B: 예금/통장이동 subItem
    for (const line of (t.lines || [])) {
      if (incomeSubIds.has(line.subItemId)) {
        txList.push({ date: t.date, type: 'income', amount: line.amount, memo: t.memo || '', source: 'transfer_in', tx: t });
      } else if (expenseSubIds.has(line.subItemId)) {
        txList.push({ date: t.date, type: 'expense', amount: line.amount, memo: t.memo || '', source: 'transfer_out', tx: t });
      }
    }
  }

  // 날짜순 정렬
  txList.sort((a, b) => a.date.localeCompare(b.date) || (a.tx.createdAt||0) - (b.tx.createdAt||0));

  const carry = acct.carryover || 0;
  let running = carry;
  const shortName = acct.name.replace(/계정$/, '');

  // 이체 상대 계좌 이름 — 거래에 accountId가 다른(비대표) 계좌로 태깅돼 있으면 그 계좌 이름을,
  // 없거나 대표계정이면 '재정'을 상대방으로 표시한다.
  const otherPartyName = (tx) => {
    if (tx.accountId) {
      const other = (State.linkedAccounts || []).find(a => a.id === tx.accountId);
      if (other && !other.isDefault) return other.name.replace(/계정$/, '');
    }
    return '재정';
  };

  const typeLabel = { income: '수입', expense: '지출' };
  const rows = txList.map(item => {
    if (item.type === 'income') running += item.amount;
    else running -= item.amount;
    const amtColor = item.type === 'income' ? 'var(--primary)' : 'var(--expense)';
    const sign     = item.type === 'income' ? '+' : '-';
    // 내용 표시
    let label = '';
    if (item.source === 'transfer_in')  label = otherPartyName(item.tx) + '→' + shortName;
    else if (item.source === 'transfer_out') label = shortName + '→' + otherPartyName(item.tx);
    else {
      const cat = catById(item.tx.categoryId);
      label = cat ? cat.name : '기타';
      if (item.memo) label += ' · ' + item.memo;
    }
    return `<div class="acct-ledger-row">
      <div class="acct-ledger-date">${item.date.slice(5).replace('-','/')}</div>
      <div class="acct-ledger-label">${escapeHTML(label)}</div>
      <div class="acct-ledger-amt" style="color:${amtColor}">${sign}${item.amount.toLocaleString('ko-KR')}</div>
      <div class="acct-ledger-bal">${running.toLocaleString('ko-KR')}</div>
    </div>`;
  }).join('');

  const totalIncome  = txList.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
  const totalExpense = txList.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
  const net = carry + totalIncome - totalExpense;

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="adClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>${escapeHTML(shortName)}</h3>
      <div style="display:flex;gap:6px;">
        <button id="adExcel" style="font-size:13px;color:#217346;font-weight:700;padding:6px 10px;border-radius:8px;background:#E8F5E9;">📥 엑셀</button>
        <button id="adPrint" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="acct-detail-summary">
        <span>이월 <b>${carry.toLocaleString('ko-KR')}</b></span>
        <span>수입 <b class="income">${totalIncome.toLocaleString('ko-KR')}</b></span>
        <span>지출 <b class="expense">${totalExpense.toLocaleString('ko-KR')}</b></span>
        <span>잔액 <b style="color:${net>=0?'var(--primary)':'var(--expense)'}">${net.toLocaleString('ko-KR')}</b></span>
      </div>
      <div class="acct-ledger-header">
        <span>날짜</span><span>내용</span><span>금액</span><span>잔액</span>
      </div>
      <div class="acct-ledger-body">
        ${txList.length === 0
          ? `<div style="text-align:center;color:var(--text-3);padding:32px 0;">거래 내역이 없어요</div>`
          : rows}
      </div>
    </div>
  `;

  sheet.querySelector('#adClose').addEventListener('click', () => closeSheet('acctDetailSheet'));
  sheet.querySelector('#adPrint').addEventListener('click', () => printAcctDetail(acct, txList, carry, totalIncome, totalExpense, net, shortName));
  sheet.querySelector('#adExcel').addEventListener('click', () => exportAcctDetailToExcel(acct, txList, carry, totalIncome, totalExpense, net, shortName));
}

// ── 계정 상세 인쇄 ──
function printAcctDetail(acct, txList, carry, totalIncome, totalExpense, net, shortName) {
  const netColor = net >= 0 ? '#1F497D' : '#CC0000';
  let running = carry;
  const rows = txList.map(item => {
    if (item.type === 'income') running += item.amount;
    else running -= item.amount;
    let label = '';
    if (item.source === 'transfer_in')  label = '재정→' + shortName;
    else if (item.source === 'transfer_out') label = shortName + '→재정';
    else { const cat = catById(item.tx.categoryId); label = (cat?cat.name:'기타') + (item.memo?' · '+item.memo:''); }
    const sign = item.type === 'income' ? '+' : '-';
    const col  = item.type === 'income' ? '#1F497D' : '#CC0000';
    return `<tr>
      <td style="padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:center;">${item.date}</td>
      <td style="padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;">${escapeHTML(label)}</td>
      <td style="padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;color:${col};font-weight:700;">${sign}${item.amount.toLocaleString('ko-KR')}</td>
      <td style="padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:right;">${running.toLocaleString('ko-KR')}</td>
    </tr>`;
  }).join('');

  const html = `
    <div class="print-page">
      <div class="page-inner">
        <div class="print-title">📋 ${escapeHTML(acct.name)} 장부</div>
        <div class="print-summary">
          <div class="print-summary-item"><div class="print-summary-label">이월금액</div><div class="print-summary-value">${carry.toLocaleString('ko-KR')}원</div></div>
          <div class="print-summary-item"><div class="print-summary-label">수입합계</div><div class="print-summary-value income">${totalIncome.toLocaleString('ko-KR')}원</div></div>
          <div class="print-summary-item"><div class="print-summary-label">지출합계</div><div class="print-summary-value expense">${totalExpense.toLocaleString('ko-KR')}원</div></div>
          <div class="print-summary-item"><div class="print-summary-label">잔액</div><div class="print-summary-value" style="color:${netColor}">${net.toLocaleString('ko-KR')}원</div></div>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
          <colgroup><col style="width:17%"><col style="width:43%"><col style="width:20%"><col style="width:20%"></colgroup>
          <thead><tr style="background:#1F4E79;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <th style="color:#fff;padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;text-align:center;">날짜</th>
            <th style="color:#fff;padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;text-align:left;">내용</th>
            <th style="color:#fff;padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;text-align:right;">금액</th>
            <th style="color:#fff;padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;text-align:right;">잔액</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#2E74B5;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
              <td colspan="2" style="padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;font-weight:700;color:#fff;text-align:center;">합 계</td>
              <td style="padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;font-weight:700;color:#fff;text-align:right;">${(totalIncome-totalExpense>=0?'+':'')+(totalIncome-totalExpense).toLocaleString('ko-KR')}</td>
              <td style="padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;font-weight:700;color:${netColor};text-align:right;">${net.toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;

  doPrint(html);
}

// ── 계정 상세 엑셀 내보내기 ──
function exportAcctDetailToExcel(acct, txList, carry, totalIncome, totalExpense, net, shortName) {
  const wb = XLSX.utils.book_new();
  const numFmt = '#,##0';
  const gBdr = {style:'thin', color:{rgb:'CCCCCC'}};
  const allGray = {top:gBdr,bottom:gBdr,left:gBdr,right:gBdr};
  const HDR_FILL = {patternType:'solid',fgColor:{rgb:'1F4E79'}};
  const SUM_FILL = {patternType:'solid',fgColor:{rgb:'2E74B5'}};
  const whiteFont = {bold:true,color:{rgb:'FFFFFF'}};
  const boldFont  = {bold:true};
  const blueFont  = {color:{rgb:'1F497D'}};
  const redFont   = {color:{rgb:'CC0000'}};

  // 헤더행
  const aoa = [['날짜','내용','수입금액','지출금액','잔액']];
  let running = carry;
  for (const item of txList) {
    let label = '';
    if (item.source === 'transfer_in')  label = '재정→' + shortName;
    else if (item.source === 'transfer_out') label = shortName + '→재정';
    else { const cat = catById(item.tx.categoryId); label = (cat?cat.name:'기타') + (item.memo?' · '+item.memo:''); }
    if (item.type === 'income') running += item.amount;
    else running -= item.amount;
    aoa.push([
      item.date,
      label,
      item.type === 'income'  ? item.amount : '',
      item.type === 'expense' ? item.amount : '',
      running
    ]);
  }
  // 결산행
  aoa.push(['결산','합계', totalIncome, totalExpense, net]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:12},{wch:24},{wch:13},{wch:13},{wch:14}];

  const sc = (r,c,s) => {
    const addr = XLSX.utils.encode_cell({r,c});
    if (!ws[addr]) ws[addr] = {t:'s',v:''};
    ws[addr].s = s;
  };

  // 헤더 스타일
  for (let c=0;c<5;c++) sc(0,c,{fill:HDR_FILL,font:whiteFont,border:allGray,alignment:{horizontal:c>=2?'right':'center',vertical:'center'}});

  // 데이터 스타일
  for (let r=1;r<aoa.length-1;r++) {
    for (let c=0;c<5;c++) {
      const addr = XLSX.utils.encode_cell({r,c});
      if (!ws[addr]) ws[addr]={t:'s',v:''};
      const isNum = typeof ws[addr].v === 'number';
      let font = {};
      if (c===2) font = blueFont;
      if (c===3) font = redFont;
      ws[addr].s = {font,border:allGray,alignment:{horizontal:c>=2?'right':c===0?'center':'left',vertical:'center'}, ...(isNum?{numFmt}:{})};
      if (isNum) ws[addr].z = numFmt;
    }
  }
  // 결산행 스타일
  const sumR = aoa.length-1;
  for (let c=0;c<5;c++) {
    const addr = XLSX.utils.encode_cell({r:sumR,c});
    if (!ws[addr]) ws[addr]={t:'s',v:''};
    const isNum = typeof ws[addr].v === 'number';
    ws[addr].s = {fill:SUM_FILL,font:whiteFont,border:allGray,alignment:{horizontal:c>=2?'right':'center',vertical:'center'},...(isNum?{numFmt}:{})};
    if (isNum) ws[addr].z = numFmt;
  }

  ws['!pageSetup'] = {paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
  XLSX.utils.book_append_sheet(wb, ws, shortName+'장부');
  XLSX.writeFile(wb, `${acct.name}_장부.xlsx`);
}

function renderSettings() {
  const page = document.getElementById('page-settings');
  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1>설정</h1>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">일반</div>
      <div class="settings-row" id="rowAppTitle">
        <div>
          <div class="settings-label">앱 이름</div>
          <div class="settings-sub" id="appTitlePreview">로딩 중...</div>
        </div>
        ${ICONS.chevR}
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">관리</div>
      <div class="settings-row" id="rowLinkedAccounts">
        <div>
          <div class="settings-label">연결계좌 관리</div>
          <div class="settings-sub">계좌 추가 · 이월금액 설정</div>
        </div>
        ${ICONS.chevR}
      </div>
      <div class="settings-row" id="rowCats">
        <div><div class="settings-label">수입/지출 항목 관리</div></div>
        ${ICONS.chevR}
      </div>
      <div class="settings-row" id="rowItemStructure">
        <div>
          <div class="settings-label">항목구조표</div>
          <div class="settings-sub">대분류 · 중분류 · 소분류 구조 보기 및 인쇄</div>
        </div>
        ${ICONS.chevR}
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">🔐 입력 모드</div>
      ${getIsAdmin() ? `
        <div class="settings-row" style="justify-content:space-between;align-items:center;">
          <div>
            <div class="settings-label">🔓 입력 모드 중</div>
            <div class="settings-sub">데이터 입력/수정이 가능합니다</div>
          </div>
          <button id="btnLogout" style="padding:6px 14px;border-radius:20px;background:var(--surface-2);font-size:12px;font-weight:700;border:1px solid var(--border);">로그아웃</button>
        </div>
        <div class="settings-row" style="justify-content:space-between;align-items:center;">
          <div>
            <div class="settings-label">비밀번호 변경</div>
            <div class="settings-sub">버튼을 눌러 변경하세요</div>
          </div>
          <button id="btnChangePw" style="padding:6px 14px;border-radius:20px;background:var(--surface-2);font-size:12px;font-weight:700;border:1px solid var(--border);">변경</button>
        </div>
        <div id="pwChangeForm" style="display:none;flex-direction:column;gap:10px;padding:12px 16px;background:var(--surface-1);border-radius:12px;margin:0 0 8px;">
          <div id="pwStep1" style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:13px;font-weight:600;color:var(--text-1);">현재 비밀번호 확인</div>
            <div style="position:relative;">
              <input type="password" id="adminPwCurrent" class="textinput" placeholder="현재 비밀번호" style="font-size:14px;padding:10px 44px 10px 12px;width:100%;box-sizing:border-box;">
              <button id="toggleCur" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-2);">👁</button>
            </div>
            <div id="pwCurError" style="color:var(--expense);font-size:12px;min-height:14px;"></div>
            <div style="display:flex;gap:8px;">
              <button id="btnPwStep1Cancel" style="flex:1;padding:10px;border-radius:10px;background:var(--surface-2);border:none;font-size:13px;font-weight:600;">취소</button>
              <button id="btnPwStep1Next" class="btn-primary" style="flex:1;padding:10px;margin-top:0;font-size:13px;">확인</button>
            </div>
          </div>
          <div id="pwStep2" style="display:none;flex-direction:column;gap:8px;">
            <div style="font-size:13px;font-weight:600;color:var(--text-1);">새 비밀번호 입력</div>
            <div style="position:relative;">
              <input type="password" id="adminPwNew" class="textinput" placeholder="새 비밀번호 (4자 이상)" style="font-size:14px;padding:10px 44px 10px 12px;width:100%;box-sizing:border-box;">
              <button id="toggleNew" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-2);">👁</button>
            </div>
            <div style="position:relative;">
              <input type="password" id="adminPwNewConfirm" class="textinput" placeholder="새 비밀번호 재입력" style="font-size:14px;padding:10px 44px 10px 12px;width:100%;box-sizing:border-box;">
              <button id="toggleNewConfirm" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-2);">👁</button>
            </div>
            <div id="pwNewError" style="color:var(--expense);font-size:12px;min-height:14px;"></div>
            <div style="display:flex;gap:8px;">
              <button id="btnPwStep2Cancel" style="flex:1;padding:10px;border-radius:10px;background:var(--surface-2);border:none;font-size:13px;font-weight:600;">취소</button>
              <button id="adminPwSave" class="btn-primary" style="flex:1;padding:10px;margin-top:0;font-size:13px;">변경 저장</button>
            </div>
          </div>
        </div>
      ` : `
        <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
          <div class="settings-label" id="loginModeLabel">🔒 열람 전용 모드</div>
          <div class="settings-sub" id="loginModeSub">비밀번호를 입력해 입력 모드로 전환하세요</div>
          <div style="position:relative;width:100%;">
            <input type="password" id="adminPwInput" class="textinput" placeholder="비밀번호" style="font-size:14px;padding:10px 44px 10px 12px;width:100%;box-sizing:border-box;">
            <button id="toggleLogin" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:var(--text-2);">👁</button>
          </div>
          <div id="loginError" style="color:#e53e3e;font-size:12px;min-height:16px;"></div>
          <button id="btnLogin" class="btn-primary" style="width:100%;padding:12px;margin-top:0;font-size:14px;border-radius:12px;">로그인</button>
        </div>
      `}
    </div>


    ${USE_FIREBASE ? `
    <div class="settings-group">
      <div class="settings-group-title">☁️ 클라우드 동기화</div>
      <div class="settings-row" id="rowSyncUp">
        <div>
          <div class="settings-label">지금 업로드</div>
          <div class="settings-sub">현재 데이터를 클라우드에 저장</div>
        </div>
        <span style="font-size:18px;">⬆️</span>
      </div>
      <div class="settings-row" id="rowSyncDown">
        <div>
          <div class="settings-label">지금 다운로드</div>
          <div class="settings-sub">클라우드에서 최신 데이터 가져오기</div>
        </div>
        <span style="font-size:18px;">⬇️</span>
      </div>
    </div>` : ''}

    <div class="settings-group">
      <div class="settings-group-title">정기계정 만기 알림</div>
      <div class="settings-row" style="justify-content:space-between;align-items:center;" id="emailDisplayRow">
        <div>
          <div class="settings-label">알림 수신 이메일</div>
          <div class="settings-sub" id="emailDisplaySub">설정된 이메일 없음</div>
        </div>
        <button id="btnEmailChange" style="padding:6px 14px;border-radius:20px;background:var(--surface-2);font-size:12px;font-weight:700;border:1px solid var(--border);white-space:nowrap;">설정</button>
      </div>
      <div id="emailChangeForm" style="display:none;flex-direction:column;gap:8px;padding:12px 16px;background:var(--surface-1);border-radius:12px;margin:0 0 8px;">
        <div style="font-size:13px;color:var(--text-2);">앱 실행 시 만기 30일 이내 계좌를 이 주소로 알려드려요</div>
        <input type="email" id="maturityEmailInput" class="textinput" placeholder="example@gmail.com" style="font-size:14px;padding:10px 12px;">
        <div id="emailError" style="color:var(--expense);font-size:12px;min-height:14px;"></div>
        <div style="display:flex;gap:8px;">
          <button id="btnEmailCancel" style="flex:1;padding:10px;border-radius:10px;background:var(--surface-2);border:none;font-size:13px;font-weight:600;">취소</button>
          <button id="maturityEmailSave" class="btn-primary" style="flex:1;padding:10px;margin-top:0;font-size:13px;">저장</button>
        </div>
      </div>
      <div class="settings-row" id="rowMaturityCheck" style="cursor:pointer;">
        <div>
          <div class="settings-label">지금 바로 만기 체크</div>
          <div class="settings-sub">90일 이내 만기 계좌를 화면에서 확인하고 메일 발송</div>
        </div>
        ${ICONS.chevR}
      </div>
    </div>



    <div class="settings-group">
      <div class="settings-group-title">교회 직인</div>
      <div class="settings-row" style="align-items:center;">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div id="sealPreviewWrap" style="width:52px;height:52px;border-radius:12px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;border:1px solid var(--border);">
            <span style="font-size:20px;opacity:0.35;">🔖</span>
          </div>
          <div style="min-width:0;">
            <div class="settings-label">직인(도장) 이미지</div>
            <div class="settings-sub" id="sealStatusSub">불러오는 중...</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button id="btnSealRemove" style="display:none;padding:6px 12px;border-radius:20px;background:var(--surface-2);font-size:12px;font-weight:700;border:1px solid var(--border);color:var(--expense);white-space:nowrap;">삭제</button>
          <button id="btnSealUpload" style="padding:6px 14px;border-radius:20px;background:var(--surface-2);font-size:12px;font-weight:700;border:1px solid var(--border);white-space:nowrap;">등록</button>
        </div>
      </div>
      <div class="settings-sub" style="padding:0 16px 12px;">기부금 영수증 등 문서 출력 시 사용할 직인 이미지예요. 배경이 투명한 PNG를 권장해요.</div>
      <input type="file" id="sealFileInput" accept="image/png,image/jpeg" style="display:none;">
    </div>

    <div class="settings-group">
      <div class="settings-group-title">데이터</div>
      <div class="settings-row" id="rowExportExcel">
        <div>
          <div class="settings-label">엑셀로 내보내기</div>
          <div class="settings-sub">xlsx 파일로 거래 내역 내보내기</div>
        </div>
        ${ICONS.download}
      </div>
      <div class="settings-row" id="rowExport">
        <div>
          <div class="settings-label">데이터 백업 (JSON)</div>
          <div class="settings-sub">전체 데이터를 JSON 파일로 백업</div>
        </div>
        ${ICONS.download}
      </div>
      <div class="settings-row" id="rowEmailBackup">
        <div>
          <div class="settings-label">백업 메일 발송</div>
          <div class="settings-sub">전체 데이터 JSON을 등록된 이메일로 발송</div>
        </div>
        <span style="font-size:18px;">📧</span>
      </div>
      <div class="settings-row" id="rowImport">
        <div>
          <div class="settings-label">데이터 가져오기${getIsAdmin()?'':' 🔒'}</div>
          <div class="settings-sub">백업 JSON 파일에서 복원</div>
        </div>
        ${ICONS.upload}
      </div>


      <input type="file" id="importFile" accept="application/json" style="display:none;">
    </div>

      <div class="settings-group">
      <div class="settings-group-title">정보</div>
      <div class="settings-row">
        <div class="settings-label">버전</div>
        <div class="settings-value">${APP_VERSION}</div>
      </div>
      <div class="settings-row" id="rowUpdate" style="cursor:pointer;">
        <div class="settings-label">앱 업데이트</div>
        <div class="settings-value" style="color:var(--primary);font-size:12px;">새로고침으로 최신버전 로드</div>
      </div>
      <div class="settings-row" style="flex-direction:column; align-items:flex-start; gap:2px;">
        <div class="settings-label">개발</div>
        <div class="settings-sub">JS Kang</div>
        <div class="settings-sub" style="color:var(--primary);">✉ drimsw@gmail.com</div>
      </div>
      <div class="settings-row" id="rowReset">
        <div class="settings-label" style="color:var(--expense);">모든 데이터 초기화</div>
      </div>
    </div>
  `;
  // 앱 이름 미리보기 로드
  getAppTitle().then(t => {
    const el = page.querySelector('#appTitlePreview');
    if (el) el.textContent = t || '교회 회계부';
  });

  page.querySelector('#rowAppTitle').addEventListener('click', async () => {
    const current = await getAppTitle();
    openAppTitleSheet(current, (trimmed) => {
      page.querySelector('#appTitlePreview').textContent = trimmed;
      const el = document.getElementById('appTitleEl');
      if (el) el.textContent = trimmed;
      showToast('앱 이름이 변경됐어요');
    });
  });
  page.querySelector('#rowLinkedAccounts').addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } openLinkedAccountsSheet(); });
  page.querySelector('#rowCats').addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } openCatManageSheet(); });
  page.querySelector('#rowItemStructure').addEventListener('click', () => openItemStructureSheet());
  page.querySelector('#rowExportExcel').addEventListener('click', exportExcel);
  page.querySelector('#rowExport').addEventListener('click', () => openBackupRangeSheet('download'));
  page.querySelector('#rowEmailBackup').addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } openBackupRangeSheet('email'); });
  // 로그아웃
  const btnLogout = page.querySelector('#btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      setIsAdmin(false);
      if (State.tab === 'members') switchTab('home');
      applyLockState();
      renderTabbar();
      renderSettings();
      showToast('👁️ 열람 모드로 전환됐어요');
    });
  }

  // 비밀번호 변경 버튼
  const btnChangePw = page.querySelector('#btnChangePw');
  if (btnChangePw) {
    const form = page.querySelector('#pwChangeForm');
    const step1 = page.querySelector('#pwStep1');
    const step2 = page.querySelector('#pwStep2');

    const closeForm = () => {
      form.style.display = 'none';
      step1.style.display = 'flex';
      step2.style.display = 'none';
      page.querySelector('#adminPwCurrent').value = '';
      page.querySelector('#adminPwNew').value = '';
      page.querySelector('#adminPwNewConfirm').value = '';
      page.querySelector('#pwCurError').textContent = '';
      page.querySelector('#pwNewError').textContent = '';
      btnChangePw.textContent = '변경';
    };

    btnChangePw.addEventListener('click', () => {
      const open = form.style.display !== 'flex';
      if (open) {
        form.style.display = 'flex';
        btnChangePw.textContent = '닫기';
        page.querySelector('#adminPwCurrent').focus();
      } else {
        closeForm();
      }
    });

    // 눈 아이콘 토글
    const toggleVis = (btnId, inputId) => {
      const btn = page.querySelector('#' + btnId);
      const inp = page.querySelector('#' + inputId);
      if (btn && inp) btn.addEventListener('click', () => {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    };
    toggleVis('toggleCur', 'adminPwCurrent');
    toggleVis('toggleNew', 'adminPwNew');
    toggleVis('toggleNewConfirm', 'adminPwNewConfirm');

    // 1단계 취소
    page.querySelector('#btnPwStep1Cancel').addEventListener('click', closeForm);

    // 1단계 확인 - 현재 비밀번호 검증
    page.querySelector('#btnPwStep1Next').addEventListener('click', async () => {
      const cur = page.querySelector('#adminPwCurrent').value;
      const err = page.querySelector('#pwCurError');
      if (!cur) { err.textContent = '현재 비밀번호를 입력해주세요'; return; }
      err.textContent = '확인 중...';
      try {
        const saved = await getAdminPasswordFromFirebase();
        if (cur.trim() === String(saved).trim()) {
          err.textContent = '';
          step1.style.display = 'none';
          step2.style.display = 'flex';
          page.querySelector('#adminPwNew').focus();
        } else {
          err.textContent = '비밀번호가 틀렸어요';
          page.querySelector('#adminPwCurrent').value = '';
        }
      } catch(e) {
        err.textContent = '네트워크 오류';
      }
    });

    // 2단계 취소
    page.querySelector('#btnPwStep2Cancel').addEventListener('click', closeForm);

    // 2단계 저장
    page.querySelector('#adminPwSave').addEventListener('click', async () => {
      const val = page.querySelector('#adminPwNew').value.trim();
      const val2 = page.querySelector('#adminPwNewConfirm').value.trim();
      const err = page.querySelector('#pwNewError');
      if (!val || val.length < 4) { err.textContent = '새 비밀번호는 4자 이상이어야 해요'; return; }
      if (val !== val2) { err.textContent = '새 비밀번호가 일치하지 않아요'; return; }
      err.textContent = '저장 중...';
      const ok = await saveAdminPasswordToFirebase(val);
      if (ok) {
        closeForm();
        showToast('🔐 비밀번호가 변경됐어요');
      } else {
        err.textContent = '저장 실패 — 네트워크를 확인해주세요';
      }
    });
  }

  // 열람 모드: 로그인
  const btnLogin = page.querySelector('#btnLogin');
  if (btnLogin) {
    // 눈 아이콘
    const tglLogin = page.querySelector('#toggleLogin');
    const loginInp = page.querySelector('#adminPwInput');
    if (tglLogin && loginInp) {
      tglLogin.addEventListener('click', () => {
        loginInp.type = loginInp.type === 'password' ? 'text' : 'password';
        tglLogin.textContent = loginInp.type === 'password' ? '👁' : '🙈';
      });
    }

    const doLogin = async () => {
      const inp = page.querySelector('#adminPwInput');
      const err = page.querySelector('#loginError');
      if (!inp || !err) return;
      const pw = inp.value;
      if (!pw) { err.textContent = '비밀번호를 입력해주세요'; return; }
      err.textContent = '확인 중...';
      try {
        const saved = await getAdminPasswordFromFirebase();
        if (!saved) {
          // 최초 설정: 저장된 비밀번호가 없으면 입력한 값을 최초 비밀번호로 등록
          if (pw.trim().length < 4) { err.textContent = '최초 비밀번호는 4자 이상으로 설정해주세요'; return; }
          const ok = await saveAdminPasswordToFirebase(pw.trim());
          if (!ok) { err.textContent = '비밀번호 저장에 실패했어요'; return; }
          setIsAdmin(true);
          applyLockState();
          renderSettings();
          showToast('🔐 비밀번호가 최초로 설정됐어요');
          return;
        }
        if (pw.trim() === String(saved).trim()) {
          setIsAdmin(true);
          applyLockState();
          renderSettings();
          showToast('🔓 입력 모드로 전환됐어요');
        } else {
          err.textContent = '비밀번호가 틀렸어요';
          inp.value = '';
          inp.focus();
        }
      } catch(e) {
        err.textContent = '네트워크 오류 — 다시 시도해주세요';
      }
    };
    btnLogin.addEventListener('click', doLogin);
    if (loginInp) loginInp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // 비밀번호가 한 번도 설정되지 않았으면 안내문구를 '최초 설정' 모드로 전환
    (async () => {
      try {
        const saved = await getAdminPasswordFromFirebase();
        if (!saved) {
          const lbl = page.querySelector('#loginModeLabel');
          const sub = page.querySelector('#loginModeSub');
          if (lbl) lbl.textContent = '🔑 비밀번호 최초 설정';
          if (sub) sub.textContent = '로그인을 위해 비밀번호를 설정하세요';
          if (loginInp) loginInp.placeholder = '사용할 비밀번호 입력 (4자 이상)';
          btnLogin.textContent = '비밀번호 설정';
        }
      } catch(e) {}
    })();
  }


  if (USE_FIREBASE) {
    page.querySelector('#rowSyncUp').addEventListener('click', async () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; }
      showToast('⬆️ 업로드 중...');
      const ok = await syncToFirebase();
      showToast(ok ? '☁️ 업로드 완료!' : '업로드 실패 — 네트워크 확인해주세요');
    });
    page.querySelector('#rowSyncDown').addEventListener('click', async () => {
      showToast('⬇️ 다운로드 중...');
      const ok = await syncFromFirebase();
      if (!ok) showToast('이미 최신 데이터예요');
    });
  }
  page.querySelector('#rowImport').addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } page.querySelector('#importFile').click(); });
  page.querySelector('#importFile').addEventListener('change', importData);
  page.querySelector('#rowUpdate').addEventListener('click', async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }
    showToast('캐시를 비웠습니다. 새로고침합니다...');
    setTimeout(() => location.reload(true), 800);
  });

  // 만기 알림 이메일
  (async () => {
    const rec = await DB.get('settings', 'maturityEmail');
    const sub = page.querySelector('#emailDisplaySub');
    const btn = page.querySelector('#btnEmailChange');
    if (rec && rec.email) {
      if (sub) sub.textContent = rec.email;
      if (btn) btn.textContent = '변경';
      // 이미 설정됨 → 입력창 닫힌 상태 유지
    } else {
      if (sub) sub.textContent = '설정된 이메일 없음';
      if (btn) btn.textContent = '설정';
    }
  })();

  // 교회 직인(도장) 이미지
  async function refreshSealUI() {
    const rec = await DB.get('settings', 'churchSeal');
    const wrap = page.querySelector('#sealPreviewWrap');
    const sub = page.querySelector('#sealStatusSub');
    const uploadBtn = page.querySelector('#btnSealUpload');
    const removeBtn = page.querySelector('#btnSealRemove');
    if (rec && rec.dataUrl) {
      if (wrap) wrap.innerHTML = `<img src="${rec.dataUrl}" style="width:100%;height:100%;object-fit:contain;">`;
      if (sub) sub.textContent = '등록됨 · 문서 출력에 사용돼요';
      if (uploadBtn) uploadBtn.textContent = '변경';
      if (removeBtn) removeBtn.style.display = '';
    } else {
      if (wrap) wrap.innerHTML = `<span style="font-size:20px;opacity:0.35;">🔖</span>`;
      if (sub) sub.textContent = '등록된 직인이 없어요';
      if (uploadBtn) uploadBtn.textContent = '등록';
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }
  refreshSealUI();

  page.querySelector('#btnSealUpload')?.addEventListener('click', () => {
    page.querySelector('#sealFileInput').click();
  });
  page.querySelector('#sealFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('이미지 용량은 2MB 이하로 올려주세요'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      await DB.put('settings', { key: 'churchSeal', dataUrl: reader.result });
      await refreshSealUI();
      showToast('✅ 직인이 등록됐어요');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  });
  page.querySelector('#btnSealRemove')?.addEventListener('click', async () => {
    await DB.del('settings', 'churchSeal');
    await refreshSealUI();
    showToast('직인을 삭제했어요');
  });

  // 이메일 설정/변경 버튼 토글
  const btnEmailChange = page.querySelector('#btnEmailChange');
  if (btnEmailChange) {
    const form = page.querySelector('#emailChangeForm');
    const closeEmailForm = () => {
      form.style.display = 'none';
      btnEmailChange.textContent = page.querySelector('#emailDisplaySub').textContent !== '설정된 이메일 없음' ? '변경' : '설정';
    };
    btnEmailChange.addEventListener('click', () => {
      const open = form.style.display !== 'flex';
      form.style.display = open ? 'flex' : 'none';
      if (open) {
        // 기존 이메일 채우기
        DB.get('settings', 'maturityEmail').then(rec => {
          if (rec && rec.email) page.querySelector('#maturityEmailInput').value = rec.email;
        });
        page.querySelector('#maturityEmailInput').focus();
        btnEmailChange.textContent = '닫기';
      } else {
        closeEmailForm();
      }
    });
    page.querySelector('#btnEmailCancel').addEventListener('click', closeEmailForm);
    page.querySelector('#maturityEmailSave').addEventListener('click', async () => {
      const inp = page.querySelector('#maturityEmailInput');
      const err = page.querySelector('#emailError');
      const email = inp.value.trim();
      if (!email || !email.includes('@')) { err.textContent = '올바른 이메일 주소를 입력해주세요'; return; }
      await DB.put('settings', { key: 'maturityEmail', email });
      page.querySelector('#emailDisplaySub').textContent = email;
      closeEmailForm();
      showToast('✅ 이메일이 저장됐어요');
    });
  }

  page.querySelector('#rowMaturityCheck').addEventListener('click', async () => {
    showToast('만기 체크 중...');
    await openMaturityCheckSheet();
  });

  page.querySelector('#rowReset').addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } resetAllData(); });
}

/* =========================================================
   명부 페이지
   ========================================================= */
/* =========================================================
   기부금영수증 발행 (명부 탭 내 서브 화면)
   ========================================================= */

// 특정 연도의 사람별 헌금 합계 (실제 교인만, 무명/구역 등 가짜 항목 제외)
function donationTotalsForYear(year) {
  const giveCat = State.categories.find(c => c.name === '헌금' && c.type === 'income');
  if (!giveCat) return [];
  const realPersons = {};
  for (const p of State.persons) {
    if (p.position) realPersons[p.id] = p; // position 없는 항목(무명/구역 등)은 제외
  }
  const totals = {};
  for (const t of State.transactions) {
    if (t.type !== 'income' || t.categoryId !== giveCat.id) continue;
    if ((t.date || '').slice(0, 4) !== String(year)) continue;
    const pid = t.subGroupId || t.personId;
    if (!pid || !realPersons[pid]) continue;
    totals[pid] = (totals[pid] || 0) + t.amount;
  }
  return Object.entries(totals)
    .filter(([, amt]) => amt > 0)
    .map(([pid, amt]) => {
      const p = realPersons[pid];
      return { key: pid, name: p.name, amount: amt, residentId: p.residentId || '', address: p.address || '' };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function renderDonationReceiptHTML() {
  return `
    <div style="padding:4px 2px 16px;">
      <p style="font-size:12.5px;color:var(--text-3);margin:0 0 14px;">명부와 헌금 내역으로 기부금영수증을 발행해요. 주 신청인 1명은 필수이고, 합산할 인원을 최대 5명까지 추가할 수 있어요.</p>

      <div class="card" style="padding:14px 16px;margin-bottom:14px;">
        <div style="font-weight:800;font-size:13.5px;margin-bottom:10px;">주 신청인 <span style="color:var(--expense);font-weight:600;font-size:11.5px;">(필수, 1명)</span></div>
        <input type="text" id="donPrimarySearch" class="dateinput" placeholder="이름 검색..." style="margin-bottom:8px;">
        <div id="donPrimaryList" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;"></div>
      </div>

      <div class="card" style="padding:14px 16px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:800;font-size:13.5px;">합산 대상 추가</span>
          <span id="donAddCount" style="font-size:11.5px;color:var(--text-3);font-weight:700;">(0/5)</span>
        </div>
        <input type="text" id="donAddSearch" class="dateinput" placeholder="이름 검색..." style="margin-bottom:8px;">
        <div id="donAddList" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;"></div>
        <div id="donAddChips" style="margin-top:8px;"></div>
      </div>

      <div class="card" style="padding:14px 16px;margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--text-2);margin-bottom:6px;">귀속 연도</label>
            <input type="number" id="donYear" class="dateinput">
          </div>
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--text-2);margin-bottom:6px;">발급일자</label>
            <input type="date" id="donIssueDate" class="dateinput">
          </div>
        </div>
        <div style="background:var(--primary);color:#fff;border-radius:12px;padding:14px 16px;">
          <div style="font-size:11.5px;font-weight:700;opacity:0.85;">합산 금액</div>
          <div id="donTotalAmt" style="font-size:24px;font-weight:800;margin-top:2px;">0원</div>
        </div>
        <div id="donSealWarn" style="display:none;font-size:12px;color:var(--expense);margin-top:10px;">🔖 등록된 직인이 없어요. <a href="#" id="donGoSeal" style="color:var(--primary);font-weight:700;">설정에서 등록하기</a></div>
        <button id="donIssueBtn" class="btn-primary" disabled style="margin-top:14px;">발행</button>
      </div>

      <div id="donReceiptCard" class="card" style="display:none;padding:14px 16px;margin-bottom:14px;">
        <div style="font-weight:800;font-size:13.5px;margin-bottom:10px;">미리보기</div>
        <div id="donReceiptPreview" style="border:1px solid var(--border);border-radius:10px;padding:14px;background:#fff;font-size:11px;color:#111;overflow-x:auto;"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="donPrintBtn" style="flex:1;padding:12px;border-radius:10px;background:var(--primary-light);color:var(--primary);font-weight:800;font-size:14px;border:none;">🖨️ 인쇄</button>
          <button id="donPdfBtn" style="flex:1;padding:12px;border-radius:10px;background:var(--primary);color:#fff;font-weight:800;font-size:14px;border:none;">⬇️ PDF로 저장</button>
        </div>
        <div id="donPdfStatus" style="font-size:11.5px;color:var(--text-3);margin-top:8px;text-align:center;"></div>
      </div>

      <div class="card" style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13.5px;margin-bottom:10px;">
          발행 내역 <span style="background:var(--primary);color:#fff;font-size:11px;font-weight:800;border-radius:20px;padding:1px 8px;" id="donLogCount">0</span>
        </div>
        <div id="donLogWrap"></div>
      </div>
    </div>
  `;
}

function donationReceiptHTMLBody(rec) {
  const seal = rec.sealDataUrl;
  const periodStr = `${rec.donationYear}.1.1 ~ ${rec.donationYear}.12.31`;
  const [iy, im, id] = rec.issueDate.split('-');
  const emptyRow = `<tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;">&nbsp;</td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;"></td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;"></td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;"></td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;"></td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;"></td></tr>`;
  return `
    <div style="font-size:10.5px;">■ 소득세법 시행규칙 [별지 제45호의2서식]</div>
    <div style="margin-top:6px;"><span style="border:1px solid #333;display:inline-block;padding:4px 10px;font-weight:700;font-size:13px;">일련번호&nbsp;&nbsp;${rec.serial}</span></div>
    <div style="text-align:center;font-size:19px;font-weight:800;letter-spacing:4px;margin:6px 0 14px;">기 부 금 영 수 증</div>

    <div style="font-weight:800;font-size:12px;margin:14px 0 4px;">1. 기부자</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">성&nbsp;&nbsp;&nbsp;&nbsp;명</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;width:35%;">${escapeHTML(rec.primary.name)}</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">주민등록번호<br><span style="font-weight:400;font-size:9.5px;">(사업자등록번호)</span></td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;width:35%;">${escapeHTML(rec.primary.residentId||'')}</td></tr>
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">주&nbsp;&nbsp;&nbsp;&nbsp;소</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;" colspan="3">${escapeHTML(rec.primary.address||'')}</td></tr>
    </table>

    <div style="font-weight:800;font-size:12px;margin:14px 0 4px;">2. 기부금 단체</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">단 체 명</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;width:35%;">${escapeHTML(rec.church.name)}</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">주민등록번호<br><span style="font-weight:400;font-size:9.5px;">(사업자등록번호)</span></td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;width:35%;">${escapeHTML(rec.church.bizNo)}</td></tr>
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">소 재 지</td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:13px;" colspan="3">${escapeHTML(rec.church.addr)}</td></tr>
    </table>

    <div style="font-weight:800;font-size:12px;margin:14px 0 4px;">3. 기부금 모집처(언론기관 등)</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">단 체 명</td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;width:35%;"></td>
          <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;width:15%;">사업자등록번호</td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;width:35%;"></td></tr>
      <tr><td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">소 재 지</td><td style="border:1px solid #333;padding:6px 8px;font-size:11px;" colspan="3"></td></tr>
    </table>

    <div style="font-weight:800;font-size:12px;margin:14px 0 4px;">4. 기부내용</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">유&nbsp;&nbsp;형</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">코&nbsp;&nbsp;드</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">구&nbsp;&nbsp;분</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">년&nbsp;&nbsp;월</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">내&nbsp;&nbsp;용</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:11px;background:#F2F4F8;font-weight:700;text-align:center;">금&nbsp;&nbsp;액</td>
      </tr>
      <tr>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:center;">기부금</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:center;">41</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:center;">금전</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:center;">${periodStr}</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:center;">헌금</td>
        <td style="border:1px solid #333;padding:6px 8px;font-size:13px;text-align:right;font-weight:800;">${fmtMoney(rec.total)}</td>
      </tr>
      ${emptyRow}${emptyRow}${emptyRow}${emptyRow}${emptyRow}
    </table>

    <div style="font-size:10.5px;line-height:1.6;margin-top:14px;">「소득세법」 제34조, 「조세특례제한법」 제73조, 제76조 및 제88조의4에 따른 기부금을 위와 같이 기부하였음을 증명하여 주시기 바랍니다.</div>
    <div style="text-align:center;margin-top:10px;font-size:13.5px;">${iy}년 &nbsp;${parseInt(im)}월 &nbsp;${parseInt(id)}일</div>

    <div style="margin-top:18px;font-size:11.5px;">
      <div style="display:flex;justify-content:flex-end;">신청인&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</div>
      <div style="margin-top:6px;">위와 같이 기부금을 기부받았음을 증명합니다.</div>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px;position:relative;">
        <span style="font-size:13.5px;">기부금 수령인&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${escapeHTML(rec.church.receiverLine)} (서명 또는 인)</span>
        ${seal ? `<img src="${seal}" style="width:90px;height:90px;object-fit:contain;position:absolute;right:4px;top:-65px;opacity:0.92;">` : ''}
      </div>
    </div>

    <div style="font-weight:800;font-size:10px;text-align:center;border-top:2px solid #333;padding-top:8px;margin-top:20px;">작 성 방 법</div>
    <table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <tr>
        <td style="width:18px;vertical-align:top;border:none;font-weight:700;font-size:8px;">1</td>
        <td style="border:none;line-height:1.7;font-size:8px;">
          "2. 기부금 단체"는 해당 단체를 기부금공제대상 기부금단체로 규정하고 있는 「소득세법」 또는 「법인세법」 등 관련 법령을 기재하여 기부금영수증을 발행하여야 합니다.(예, 「소득세법 시행령」 제80조제1항제2호 나목, 「법인세법 시행규칙」 제18조제1항제1호) 다만, 기획재정부장관이 지정하는 지정기부금단체 및 기부금대상민간단체의 경우에는 기부금단체 지정 공고번호 및 기부금 인정기한을 기재합니다[예. 기획재정부 공고 제2010-249호(2014.12.31)].
        </td>
      </tr>
      <tr>
        <td style="width:18px;vertical-align:top;border:none;font-weight:700;font-size:8px;">2</td>
        <td style="border:none;line-height:1.7;font-size:8px;">"3. 기부금 모집처(언론기관 등)"는 방송사, 신문사, 통신회사 등 기부금을 대신 접수하여 기부금 단체에 전달하는 기관을 말합니다.</td>
      </tr>
      <tr>
        <td style="width:18px;vertical-align:top;border:none;font-weight:700;font-size:8px;">3</td>
        <td style="border:none;line-height:1.7;font-size:8px;">
          "4. 기부내용"란에 적는 유형·코드는 다음과 같습니다.<br>
          가. 「소득세법」 제34조제2항에 따른 기부금 : 법정, 코드 10<br>
          나. 「조세특례제한법」 제76조에 따른 기부금 : 정치자금, 코드 20<br>
          다. 「조세특례제한법」 제73조제1항(제1호 및 제11호 제외)에 따른 기부금 : 조특법 73, 코드 30(2011.6.30이전까지 지출한 경우)<br>
          라. 「조세특례제한법」 제73조제1항제11호에 따른 공익법인신탁기부금 : 조특법 73 ① 11, 코드 31(2011.6.30이전까지 지출한 경우)<br>
          마. 「소득세법」 제34조제1항(종교단체 기부금 제외)에 따른 기부금 : 지정, 코드 40<br>
          바. 「소득세법」 제34조제1항에 따른 기부금 중 종교단체기부금 : 종교단체 코드 41<br>
          사. 「조세특례제한법」 제88조의4에 따른 기부금 : 우리사주, 코드 42<br>
          아. 필요경비 및 소득공제금액대상에 해당되지 아니하는 기부금) : 공제제외, 코드 50
        </td>
      </tr>
      <tr>
        <td style="width:18px;vertical-align:top;border:none;font-weight:700;font-size:8px;">4</td>
        <td style="border:none;line-height:1.7;font-size:8px;">3. 구분란에는 "금전기부"의 경우에는 "금전", "현물기부"의 경우에는 "현물"로 적습니다.</td>
      </tr>
    </table>
    <div style="text-align:right;font-weight:700;font-size:9px;margin-top:6px;">210mm×297mm(일반용지 60g/㎡(재활용품))</div>
  `;
}

// 영수증을 실제 PDF 파일로 만들어서 다운로드 (html2canvas로 캡처 -> jsPDF에 A4로 삽입)
async function downloadReceiptPDF(rec, statusEl) {
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    showToast('PDF 기능을 불러오지 못했어요. 새로고침 후 다시 시도해주세요');
    return;
  }
  if (statusEl) statusEl.textContent = 'PDF 생성 중...';

  // 화면 밖에 A4 비율(210:297)의 흰 배경 컨테이너를 만들어 그 안에 영수증을 렌더링
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#fff;padding:24px 14px;box-sizing:border-box;';
  box.innerHTML = donationReceiptHTMLBody(rec);
  document.body.appendChild(box);

  try {
    const canvas = await html2canvas(box, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // 페이지 안에 항상 한 장으로 다 들어오도록 가로/세로 비율을 유지하며 축소(자르지 않음)
    const scaleToFit = Math.min(pageW / canvas.width, pageH / canvas.height);
    const imgW = canvas.width * scaleToFit;
    const imgH = canvas.height * scaleToFit;
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgW, imgH);
    pdf.save(`기부금영수증_${rec.serial}_${rec.primary.name}.pdf`);
    if (statusEl) statusEl.textContent = '✅ PDF로 저장됐어요';
  } catch (e) {
    console.error('PDF 생성 오류:', e);
    showToast('PDF 생성에 실패했어요');
    if (statusEl) statusEl.textContent = '';
  } finally {
    box.remove();
    if (statusEl) setTimeout(() => { statusEl.textContent = ''; }, 2500);
  }
}

// 일련번호(예: "2025003") -> { year: 2025, seq: 3 }
function parseDonationSerial(serial) {
  const s = String(serial || '');
  const year = parseInt(s.slice(0, 4), 10);
  const seq = parseInt(s.slice(4), 10);
  if (!year || !seq) return null;
  return { year, seq };
}

async function initDonationReceiptView(page) {
  let donors = donationTotalsForYear(State.donationYear || (new Date().getFullYear() - 1));
  const sealRec = await DB.get('settings', 'churchSeal');
  const sealDataUrl = sealRec && sealRec.dataUrl ? sealRec.dataUrl : null;
  const CHURCH = { name: '주원교회(이현재)', bizNo: '144-89-00213', addr: '경기도 성남시 분당구 운중동 959 판오션타워 702호', receiverLine: '대한예수교장로회    주원교회' };

  const yearInput = page.querySelector('#donYear');
  const dateInput = page.querySelector('#donIssueDate');
  yearInput.value = State.donationYear || (new Date().getFullYear() - 1);
  dateInput.value = State.donationIssueDate || todayStr();

  if (!sealDataUrl) page.querySelector('#donSealWarn').style.display = 'block';
  page.querySelector('#donGoSeal')?.addEventListener('click', (e) => { e.preventDefault(); switchTab('settings'); });

  const fmt = (n) => fmtMoney(n);
  const byKey = (k) => donors.find(d => d.key === k);

  function renderPrimaryList(filter) {
    const el = page.querySelector('#donPrimaryList');
    const f = (filter || '').trim();
    if (donors.length === 0) { el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12.5px;">${State.donationYear || (new Date().getFullYear()-1)}년 헌금 기록이 없어요</div>`; return; }
    el.innerHTML = donors.filter(d => !f || d.name.includes(f)).map(d => {
      const disabled = State.donationAddKeys.includes(d.key);
      return `<div class="don-prow" data-k="${d.key}" data-role="primary" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;${disabled?'opacity:0.35;':'cursor:pointer;'}">
        <input type="radio" name="donPrimaryRadio" ${State.donationPrimaryKey===d.key?'checked':''} ${disabled?'disabled':''} style="accent-color:var(--primary);">
        <span style="flex:1;font-weight:600;">${escapeHTML(d.name)}</span><span style="color:var(--text-3);font-size:12.5px;">${fmt(d.amount)}원</span>
      </div>`;
    }).join('');
  }

  function renderAddList(filter) {
    const el = page.querySelector('#donAddList');
    const f = (filter || '').trim();
    if (donors.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = donors.filter(d => !f || d.name.includes(f)).map(d => {
      const disabled = (d.key === State.donationPrimaryKey) || (!State.donationAddKeys.includes(d.key) && State.donationAddKeys.length >= 5);
      return `<div class="don-prow" data-k="${d.key}" data-role="add" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);font-size:13px;${disabled?'opacity:0.35;':'cursor:pointer;'}">
        <input type="checkbox" ${State.donationAddKeys.includes(d.key)?'checked':''} ${disabled?'disabled':''} style="accent-color:var(--primary);">
        <span style="flex:1;font-weight:600;">${escapeHTML(d.name)}</span><span style="color:var(--text-3);font-size:12.5px;">${fmt(d.amount)}원</span>
      </div>`;
    }).join('');
  }

  function renderChips() {
    const el = page.querySelector('#donAddChips');
    el.innerHTML = State.donationAddKeys.map(k => {
      const d = byKey(k);
      if (!d) return '';
      return `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--primary-light);color:var(--primary);font-size:12px;font-weight:700;padding:5px 10px;border-radius:20px;margin:3px 4px 0 0;">${escapeHTML(d.name)} <button data-remove="${k}" style="border:none;background:none;color:var(--primary);font-weight:800;cursor:pointer;font-size:13px;padding:0;">×</button></span>`;
    }).join('');
    page.querySelector('#donAddCount').textContent = `(${State.donationAddKeys.length}/5)`;
  }

  function currentTotal() {
    let sum = 0;
    if (State.donationPrimaryKey) { const d = byKey(State.donationPrimaryKey); if (d) sum += d.amount; }
    State.donationAddKeys.forEach(k => { const d = byKey(k); if (d) sum += d.amount; });
    return sum;
  }

  function refresh(pf, af) {
    renderPrimaryList(pf);
    renderAddList(af);
    renderChips();
    page.querySelector('#donTotalAmt').textContent = fmt(currentTotal()) + '원';
    page.querySelector('#donIssueBtn').disabled = !State.donationPrimaryKey;
  }

  page.querySelector('#donPrimaryList').addEventListener('click', (e) => {
    const row = e.target.closest('.don-prow');
    if (!row || row.style.opacity === '0.35') return;
    State.donationPrimaryKey = row.dataset.k;
    refresh(page.querySelector('#donPrimarySearch').value, page.querySelector('#donAddSearch').value);
  });
  page.querySelector('#donAddList').addEventListener('click', (e) => {
    const row = e.target.closest('.don-prow');
    if (!row || row.style.opacity === '0.35') return;
    const k = row.dataset.k;
    const idx = State.donationAddKeys.indexOf(k);
    if (idx >= 0) State.donationAddKeys.splice(idx, 1);
    else if (State.donationAddKeys.length < 5) State.donationAddKeys.push(k);
    refresh(page.querySelector('#donPrimarySearch').value, page.querySelector('#donAddSearch').value);
  });
  page.querySelector('#donAddChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    State.donationAddKeys = State.donationAddKeys.filter(k => k !== btn.dataset.remove);
    refresh(page.querySelector('#donPrimarySearch').value, page.querySelector('#donAddSearch').value);
  });
  page.querySelector('#donPrimarySearch').addEventListener('input', (e) => renderPrimaryList(e.target.value));
  page.querySelector('#donAddSearch').addEventListener('input', (e) => renderAddList(e.target.value));

  yearInput.addEventListener('change', () => {
    State.donationYear = parseInt(yearInput.value, 10) || (new Date().getFullYear() - 1);
    State.donationPrimaryKey = null;
    State.donationAddKeys = [];
    donors = donationTotalsForYear(State.donationYear);
    refresh('', '');
  });
  dateInput.addEventListener('change', () => { State.donationIssueDate = dateInput.value; });

  async function renderLog() {
    const rec = await DB.get('settings', 'donationReceiptLog');
    const log = (rec && rec.list) || [];
    page.querySelector('#donLogCount').textContent = log.length;
    const wrap = page.querySelector('#donLogWrap');
    if (!log.length) { wrap.innerHTML = `<div style="text-align:center;color:var(--text-3);font-size:12.5px;padding:20px 0;">아직 발행한 영수증이 없어요</div>`; return; }
    wrap.innerHTML = log.slice().reverse().map((r, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;${i < log.length-1 ? 'border-bottom:1px solid var(--border);' : ''}">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:13px;">${escapeHTML(r.primary.name)}${r.addNames && r.addNames.length ? ` 외 ${r.addNames.length}명` : ''}</div>
          <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;">${r.serial} · ${r.issueDate}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-weight:700;font-size:13px;">${fmt(r.total)}원</span>
          <button data-reprint="${log.length - 1 - i}" style="background:var(--primary-light);color:var(--primary);border:none;border-radius:8px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;">인쇄/PDF</button>
          <button data-delrec="${log.length - 1 - i}" style="background:none;color:var(--expense);border:none;padding:5px 4px;font-size:11.5px;font-weight:700;cursor:pointer;">삭제</button>
        </div>
      </div>
    `).join('');
  }

  function showPreview(rec) {
    page.querySelector('#donReceiptCard').style.display = 'block';
    page.querySelector('#donReceiptPreview').innerHTML = donationReceiptHTMLBody(rec);
    page.querySelector('#donReceiptCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    page.querySelector('#donPrintBtn').onclick = () => {
      doPrint(`<div class="print-page"><div class="page-inner">${donationReceiptHTMLBody(rec)}</div></div>`);
    };
    page.querySelector('#donPdfBtn').onclick = () => downloadReceiptPDF(rec, page.querySelector('#donPdfStatus'));
  }

  page.querySelector('#donLogWrap').addEventListener('click', async (e) => {
    const reprintBtn = e.target.closest('[data-reprint]');
    if (reprintBtn) {
      const dbRec = await DB.get('settings', 'donationReceiptLog');
      const log = (dbRec && dbRec.list) || [];
      const r = log[parseInt(reprintBtn.dataset.reprint, 10)];
      if (r) showPreview(r);
      return;
    }
    const delBtn = e.target.closest('[data-delrec]');
    if (delBtn) {
      if (!confirm('이 발행 내역을 삭제할까요? 삭제해도 이미 사용된 일련번호는 재사용되지 않고, 다음 발행은 다음 번호로 계속됩니다.')) return;
      const dbRec = await DB.get('settings', 'donationReceiptLog');
      const log = (dbRec && dbRec.list) || [];
      const idx = parseInt(delBtn.dataset.delrec, 10);
      const removed = log[idx];
      log.splice(idx, 1);
      await DB.put('settings', { key: 'donationReceiptLog', list: log });

      // 삭제한 일련번호는 재사용 가능하도록 "빈 번호" 목록에 되돌려놓는다
      if (removed) {
        const parsed = parseDonationSerial(removed.serial);
        if (parsed) {
          const seqRec = await DB.get('settings', 'donationReceiptSeq');
          const seqMap = (seqRec && seqRec.map) || {};
          const freedMap = (seqRec && seqRec.freed) || {};
          const freedList = freedMap[parsed.year] || [];
          if (!freedList.includes(parsed.seq)) freedList.push(parsed.seq);
          freedList.sort((a, b) => a - b);
          freedMap[parsed.year] = freedList;
          await DB.put('settings', { key: 'donationReceiptSeq', map: seqMap, freed: freedMap });
        }
      }

      await renderLog();

      // 삭제한 발행 건의 인원을 다시 선택해두어 바로 재발행할 수 있게 함
      let refilled = false;
      if (removed) {
        const stillExists = donors.some(d => d.key === removed.primary.key);
        if (stillExists) {
          State.donationPrimaryKey = removed.primary.key;
          State.donationAddKeys = (removed.addNames || [])
            .map(nm => donors.find(d => d.name === nm)?.key)
            .filter(Boolean)
            .slice(0, 5);
          page.querySelector('#donReceiptCard').style.display = 'none';
          refresh('', '');
          page.querySelector('#donPrimaryList').scrollIntoView({ behavior: 'smooth', block: 'start' });
          refilled = true;
        }
      }
      showToast(refilled ? '삭제했어요. 대상이 다시 선택됐으니 확인 후 발행을 눌러주세요' : '삭제했어요');
    }
  });

  page.querySelector('#donIssueBtn').addEventListener('click', async () => {
    if (!State.donationPrimaryKey) return;
    const primary = byKey(State.donationPrimaryKey);
    const donationYear = parseInt(yearInput.value, 10);
    const issueDate = dateInput.value;
    if (!donationYear || !issueDate) { showToast('귀속 연도와 발급일자를 확인해주세요'); return; }

    const seqRec = await DB.get('settings', 'donationReceiptSeq');
    const seqMap = (seqRec && seqRec.map) || {};
    const freedMap = (seqRec && seqRec.freed) || {};
    const freedList = freedMap[donationYear] || [];

    let seq;
    if (freedList.length > 0) {
      seq = freedList.shift(); // 삭제되어 비어있는 번호 중 가장 작은 것부터 재사용
      freedMap[donationYear] = freedList;
    } else {
      seq = (seqMap[donationYear] || 0) + 1;
      seqMap[donationYear] = seq;
    }
    await DB.put('settings', { key: 'donationReceiptSeq', map: seqMap, freed: freedMap });

    const serial = `${donationYear}${String(seq).padStart(3, '0')}`;
    const addNames = State.donationAddKeys.map(k => byKey(k)?.name).filter(Boolean);
    const total = currentTotal();

    const rec = { serial, primary, addNames, total, donationYear, issueDate, church: CHURCH, sealDataUrl };

    const logRec = await DB.get('settings', 'donationReceiptLog');
    const log = (logRec && logRec.list) || [];
    log.push(rec);
    await DB.put('settings', { key: 'donationReceiptLog', list: log });

    showPreview(rec);
    await renderLog();
    showToast(`✅ ${serial} 발행 완료`);
  });

  refresh('', '');
  renderLog();
}

function renderMembers() {
  const page = document.getElementById('page-members');
  // usePersonLevel 폐기 후에도 교인명부는 persons 스토어 사용
  const heongCat = State.categories.find(c => c.name === '헌금');
  const members = heongCat ? personsOfCategory(heongCat.id, true) : [];
  const viewMode = State.memberView || 'family'; // 'family' | 'name'

  // 가족 그룹 묶기
  const groups = {};
  const noGroup = [];
  for (const m of members) {
    if (m.family) {
      (groups[m.family] = groups[m.family] || []).push(m);
    } else {
      noGroup.push(m);
    }
  }
  const genOrder = { '1세대': 1, '2세대': 2, '3세대': 3, '4세대': 4 };
  for (const g of Object.values(groups)) {
    g.sort((a, b) => (genOrder[a.generation] || 9) - (genOrder[b.generation] || 9) || a.name.localeCompare(b.name, 'ko'));
  }

  const genColors = { '1세대': '#1a56db', '2세대': '#057a55', '3세대': '#c27803', '4세대': '#9333ea' };

  const memberRow = (m, indent = false) => {
    const bg = m.hidden ? 'rgba(0,0,0,0.04)' : 'transparent';
    const op = m.hidden ? 'opacity:0.5;' : '';
    const genColor = genColors[m.generation] || 'var(--text-3)';
    const hasExtra = m.address || m.memo;
    const headName = m.headId ? (members.find(p => p.id === m.headId)?.name || '') : '';
    return `
      <tr style="border-top:1px solid var(--border); background:${bg}; ${op}">
        <td style="padding:8px 10px 8px ${indent ? '20px' : '10px'}; font-weight:700; min-width:80px;">
          ${m.generation ? `<div style="font-size:10px; color:${genColor}; font-weight:700; border:1px solid ${genColor}; border-radius:4px; padding:1px 4px; display:inline-block; margin-bottom:2px;">${m.generation}</div>` : ''}
          <div style="white-space:nowrap;">${escapeHTML(m.name)}</div>
          ${m.position ? `<div style="font-size:11px; color:var(--text-3); font-weight:500;">${escapeHTML(m.position)}</div>` : ''}
          ${headName ? `<div style="font-size:10px; color:var(--primary);">↳ ${escapeHTML(headName)}</div>` : ''}
        </td>
        <td style="padding:8px 10px;">${escapeHTML(m.residentId || '')}</td>
        <td style="padding:8px 10px;">${escapeHTML(m.phone || '')}</td>
        <td style="padding:8px 10px; text-align:center;">
          <label class="toggle-switch" style="transform:scale(0.8);">
            <input type="checkbox" class="member-hidden-toggle" data-id="${m.id}" ${m.hidden ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td style="padding:8px 4px; text-align:center;">
          <button class="member-edit-btn" data-id="${m.id}" style="color:var(--primary);">${ICONS.edit}</button>
        </td>
      </tr>
      ${hasExtra ? `
      <tr style="background:${bg}; ${op}">
        <td colspan="5" style="padding:2px 10px 8px ${indent ? '20px' : '10px'}; font-size:12px; color:var(--text-2);">
          ${m.address ? `📍 ${escapeHTML(m.address)}` : ''}${m.address && m.memo ? '　' : ''}${m.memo ? `📝 ${escapeHTML(m.memo)}` : ''}
        </td>
      </tr>` : ''}
    `;
  };

  // 가족 보기
  const groupRows = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b,'ko')).map(([name, ms]) => {
    const nameList = ms.map(m => m.name).join(', ');
    return `
    <tr style="background:var(--primary-light, #eef2ff);">
      <td colspan="5" style="padding:8px 10px; font-weight:800; font-size:13.5px; color:var(--primary);">
        👨‍👩‍👧 ${escapeHTML(name)} <span style="font-size:11px; font-weight:500; color:var(--text-3);">${ms.length}명 · ${escapeHTML(nameList)}</span>
      </td>
    </tr>
    ${ms.map(m => memberRow(m, true)).join('')}
  `;}).join('');
  const noGroupRows = noGroup.map(m => memberRow(m, false)).join('');

  // 이름순 보기
  const nameRows = [...members].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(m => memberRow(m, false)).join('');

  const bodyRows = members.length === 0
    ? `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-3);">등록된 교인이 없어요</td></tr>`
    : viewMode === 'name'
      ? nameRows
      : groupRows + (noGroup.length > 0 ? `
          ${Object.keys(groups).length > 0 ? `<tr style="background:var(--bg);"><td colspan="5" style="padding:8px 10px; font-weight:800; font-size:13px; color:var(--text-2);">개인</td></tr>` : ''}
          ${noGroupRows}` : '');

  page.innerHTML = `
    <div class="appbar" style="padding-left:0;padding-right:0;">
      <h1>교인 명부</h1>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="display:flex;background:var(--border);border-radius:8px;padding:2px;gap:2px;">
          <button id="viewDonation" style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;${viewMode==='donation'?'background:#fff;color:var(--primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);':'color:var(--text-3);'}">기부금</button>
          <button id="viewFamily" style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;${viewMode==='family'?'background:#fff;color:var(--primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);':'color:var(--text-3);'}">가족</button>
          <button id="viewName" style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;${viewMode==='name'?'background:#fff;color:var(--primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);':'color:var(--text-3);'}">이름순</button>
        </div>
        <button id="memberAdd" style="color:var(--primary);font-weight:800;font-size:14px;${viewMode==='donation'?'display:none;':''}">+ 추가</button>
      </div>
    </div>
    <div style="padding:0 0 120px;">
      ${viewMode === 'donation' ? renderDonationReceiptHTML() : `
      <table style="width:100%; border-collapse:collapse; font-size:13px; font-family:var(--font-sans, -apple-system, sans-serif);">
        <thead>
          <tr style="background:var(--primary); color:#fff; text-align:left;">
            <th style="padding:9px 10px; width:28%;">이름 / 직분</th>
            <th style="padding:9px 10px; width:24%;">주민번호</th>
            <th style="padding:9px 10px; width:24%;">전화번호</th>
            <th style="padding:9px 10px; width:16%; text-align:center;">숨김</th>
            <th style="padding:9px 4px; width:8%;"></th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      `}
    </div>
  `;

  if (viewMode === 'donation') {
    initDonationReceiptView(page);
    page.querySelector('#viewDonation').addEventListener('click', () => { State.memberView = 'donation'; renderMembers(); });
    page.querySelector('#viewFamily').addEventListener('click', () => { State.memberView = 'family'; renderMembers(); });
    page.querySelector('#viewName').addEventListener('click', () => { State.memberView = 'name'; renderMembers(); });
    return;
  }

  page.querySelector('#viewDonation').addEventListener('click', () => { State.memberView = 'donation'; renderMembers(); });
  page.querySelector('#viewFamily').addEventListener('click', () => { State.memberView = 'family'; renderMembers(); });
  page.querySelector('#viewName').addEventListener('click', () => { State.memberView = 'name'; renderMembers(); });
  page.querySelector('#memberAdd').addEventListener('click', () => openMemberEditSheet(null, heongCat));
  page.querySelectorAll('.member-hidden-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      const p = await DB.get('persons', cb.dataset.id);
      if (!p) return;
      p.hidden = cb.checked;
      await DB.put('persons', p);
      await reloadData();
      renderMembers();
    });
  });
  page.querySelectorAll('.member-edit-btn').forEach(b => {
    b.addEventListener('click', () => {
      const m = State.persons.find(p => p.id === b.dataset.id);
      if (m) openMemberEditSheet(m, heongCat);
    });
  });
}

function openMemberEditSheet(member, heongCat) {
  let sheet = document.getElementById('memberEditSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'memberEditSheet';
    sheet.className = 'sheet';
    sheet.style.zIndex = '95';
    document.getElementById('app').appendChild(sheet);
  }
  const isNew = !member;
  const m = member || { id: uid(), name: '', position: '', residentId: '', phone: '', address: '', memo: '', hidden: false, createdAt: Date.now(), family: '', generation: '', headId: '' };

  // 가족 그룹 목록 (기존 그룹 + 새로 입력 가능)
  const allMembers = heongCat ? personsOfCategory(heongCat.id, true) : [];
  const familyGroups = [...new Set(allMembers.map(p => p.family).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ko'));
  const familyOptions = familyGroups.map(f => `<option value="${escapeHTML(f)}" ${m.family===f?'selected':''}>${escapeHTML(f)}</option>`).join('');
  const headOptions = allMembers
    .filter(p => p.id !== m.id)
    .map(p => `<option value="${p.id}" ${m.headId===p.id?'selected':''}>${escapeHTML(p.name)}</option>`)
    .join('');

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>${isNew ? '교인 추가' : '교인 정보 수정'}</h3>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="mEditClose" class="sheet-close-btn">${ICONS.close}닫기</button>
        <button id="mEditSave" style="color:var(--primary);font-weight:800;font-size:14.5px;">저장</button>
      </div>
    </div>
    <div class="sheet-body">
      <div style="font-size:12px; color:var(--text-3); font-weight:700; margin-bottom:4px; margin-top:4px;">기본 정보</div>
      <div class="formrow"><label>이름 *</label><input type="text" id="mName" class="dateinput" value="${escapeHTML(m.name)}" placeholder="이름"></div>
      <div class="formrow"><label>직분</label><input type="text" id="mPosition" class="dateinput" value="${escapeHTML(m.position||'')}" placeholder="예: 집사, 권사, 장로"></div>
      <div class="formrow"><label>주민번호</label><input type="text" id="mResidentId" class="dateinput" value="${escapeHTML(m.residentId||'')}" placeholder="000000-0000000"></div>
      <div class="formrow"><label>전화번호</label><input type="text" id="mPhone" class="dateinput" value="${escapeHTML(m.phone||'')}" placeholder="010-0000-0000"></div>
      <div class="formrow"><label>주소</label><input type="text" id="mAddress" class="dateinput" value="${escapeHTML(m.address||'')}" placeholder="주소"></div>
      <div class="formrow"><label>비고</label><input type="text" id="mMemo" class="dateinput" value="${escapeHTML(m.memo||'')}" placeholder="메모"></div>

      <div style="font-size:12px; color:var(--text-3); font-weight:700; margin:12px 0 4px;">가족 정보</div>
      <div class="formrow">
        <label>가족 그룹</label>
        <input type="text" id="mFamily" class="dateinput" list="familyList" value="${escapeHTML(m.family||'')}" placeholder="예: 홍길동 가족">
        <datalist id="familyList">${familyOptions}</datalist>
      </div>
      <div class="formrow">
        <label>세대</label>
        <select id="mGeneration" class="dateinput">
          <option value="">선택 안 함</option>
          <option value="1세대" ${m.generation==='1세대'?'selected':''}>1세대 (조부모)</option>
          <option value="2세대" ${m.generation==='2세대'?'selected':''}>2세대 (부모)</option>
          <option value="3세대" ${m.generation==='3세대'?'selected':''}>3세대 (자녀)</option>
          <option value="4세대" ${m.generation==='4세대'?'selected':''}>4세대 (손자·손녀)</option>
        </select>
      </div>
      <div class="formrow">
        <label>가족 대표자</label>
        <select id="mHeadId" class="dateinput">
          <option value="">없음 (본인이 대표)</option>
          ${headOptions}
        </select>
      </div>
      ${!isNew ? `<button id="mEditDel" style="color:var(--expense);font-size:13px;margin-top:8px;">이 교인 삭제</button>` : ''}
    </div>
  `;
  openSheet('memberEditSheet');
  sheet.querySelector('#mEditClose').addEventListener('click', () => closeSubSheet('memberEditSheet'));
  sheet.querySelector('#mEditSave').addEventListener('click', async () => {
    const name = sheet.querySelector('#mName').value.trim();
    if (!name) { showToast('이름을 입력해주세요'); return; }
    const updated = {
      ...m,
      categoryId: heongCat?.id || m.categoryId,
      name,
      position:   sheet.querySelector('#mPosition').value.trim(),
      residentId: sheet.querySelector('#mResidentId').value.trim(),
      phone:      sheet.querySelector('#mPhone').value.trim(),
      address:    sheet.querySelector('#mAddress').value.trim(),
      memo:       sheet.querySelector('#mMemo').value.trim(),
      family:     sheet.querySelector('#mFamily').value.trim(),
      generation: sheet.querySelector('#mGeneration').value,
      headId:     sheet.querySelector('#mHeadId').value || null,
      createdAt:  m.createdAt || Date.now(),
    };
    await DB.put('persons', updated);
    // subGroups 동기화: 헌금 거래 입력의 이름 선택에도 반영
    if (heongCat) {
      const existingGroup = (State.subGroups || []).find(g => g.categoryId === heongCat.id && g.id === updated.id);
      if (existingGroup) {
        // 이름 변경 반영
        existingGroup.name = updated.name;
        await DB.put('subGroups', existingGroup);
      } else {
        // 신규 교인 → subGroup 추가
        await DB.put('subGroups', { id: updated.id, categoryId: heongCat.id, name: updated.name, order: allMembers.length });
      }
    }
    await reloadData();
    closeSubSheet('memberEditSheet');
    renderMembers();
    showToast(isNew ? '교인이 추가됐어요' : '정보가 수정됐어요');
  });
  if (!isNew) {
    sheet.querySelector('#mEditDel').addEventListener('click', async () => {
      if (!confirm(`"${m.name}"을(를) 명부에서 삭제할까요?\n(기존 거래 데이터는 유지됩니다)`)) return;
      await DB.del('persons', m.id);
      // subGroups에서도 삭제 (헌금 이름 선택 목록에서 제거)
      const sg = (State.subGroups || []).find(g => g.id === m.id);
      if (sg) await DB.del('subGroups', sg.id);
      await reloadData();
      closeSubSheet('memberEditSheet');
      renderMembers();
      showToast('삭제됐어요');
    });
  }
}

/* =========================================================
   자동 백업 (매주 일요일)
   ========================================================= */
async function getAutoBackupEnabled() {
  const rec = await DB.get('settings', 'autoBackup');
  return rec ? rec.enabled : false;
}
async function setAutoBackupEnabled(v) {
  const rec = (await DB.get('settings', 'autoBackup')) || { key: 'autoBackup' };
  await DB.put('settings', { ...rec, enabled: v });
}
async function getLastAutoBackupDate() {
  const rec = await DB.get('settings', 'autoBackup');
  return rec ? rec.lastDate || null : null;
}
async function setLastAutoBackupDate(dateStr) {
  const rec = (await DB.get('settings', 'autoBackup')) || { key: 'autoBackup' };
  await DB.put('settings', { ...rec, lastDate: dateStr });
}
async function getAutoBackupDirHandle() {
  const rec = await DB.get('settings', 'autoBackupDir');
  return rec ? rec.handle : null;
}
async function setAutoBackupDirHandle(handle) {
  await DB.put('settings', { key: 'autoBackupDir', handle });
}

// 오늘이 일요일인지 확인
function isSunday() {
  return new Date().getDay() === 0;
}

/* =========================================================
   정기계정 만기 알림 — Gmail MCP via Anthropic API
   ========================================================= */
const MATURITY_WINDOW_DAYS = 90;

// 정기계정 중 만기일이 오늘 ~ N일 이내인 계좌 목록 (만기일 가까운 순)
function findMaturityTargets(today) {
  const d = new Date(); d.setDate(d.getDate() + MATURITY_WINDOW_DAYS);
  const dateLimit = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const deposits = (State.linkedAccounts || []).filter(a => a.accountKind === 'deposit' && a.maturityDate);
  return deposits
    .filter(a => a.maturityDate >= today && a.maturityDate <= dateLimit)
    .sort((a,b) => a.maturityDate.localeCompare(b.maturityDate));
}

function maturityDaysLeft(maturityDate, today) {
  return Math.round((new Date(maturityDate) - new Date(today)) / (1000*60*60*24));
}

function maturityTag(daysLeft) {
  return daysLeft === 0 ? '🔴 오늘 만기' : daysLeft <= 7 ? `🟡 ${daysLeft}일 후 만기` : `🟢 ${daysLeft}일 후 만기`;
}

function buildMaturityMailContent(targets, today) {
  const appName = State.appName || '교회 회계부';
  const rows = targets.map(a => {
    const tag = maturityTag(maturityDaysLeft(a.maturityDate, today));
    const amt = (a.carryover || 0).toLocaleString('ko-KR');
    return `• ${tag} | ${a.name} | ${a.maturityDate} | ${amt}원`;
  }).join('\n');
  const subject = `[${appName}] 정기계정 만기 알림 (${today})`;
  const body = `안녕하세요.\n\n정기계정 만기 계좌를 알려드립니다.\n\n${rows}\n\n확인 후 적절한 조치를 취해주세요.\n\n— ${appName}`;
  return { subject, body };
}

function openMailtoForMaturity(targets, email, today) {
  const { subject, body } = buildMaturityMailContent(targets, today);
  const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

// 자동 백그라운드 체크 (앱 실행 5초 후, 하루 1회) — 대상 있으면 메일 앱을 바로 연다
async function checkMaturityAndNotify(force = false) {
  const emailRec = await DB.get('settings', 'maturityEmail');
  if (!emailRec || !emailRec.email) return 0;
  const email = emailRec.email;

  const today = todayStr();

  // 오늘 이미 체크했으면 스킵 (force=true면 무조건 실행)
  if (!force) {
    const lastRec = await DB.get('settings', 'maturityLastCheck');
    if (lastRec && lastRec.date === today) return 0;
  }

  const targets = findMaturityTargets(today);

  if (targets.length === 0) {
    await DB.put('settings', { key: 'maturityLastCheck', date: today });
    return 0;
  }

  try {
    openMailtoForMaturity(targets, email, today);
    await DB.put('settings', { key: 'maturityLastCheck', date: today });
    showToast(`📧 만기 알림 ${targets.length}건 — 메일 앱을 열었어요`);
    return targets.length;
  } catch (e) {
    console.error('maturity notify error:', e);
    showToast('메일 앱 열기 실패');
    return 0;
  }
}

// 수동 "지금 바로 만기 체크": 화면에 리스트를 먼저 보여주고, 버튼을 눌러야 메일을 발송한다
async function openMaturityCheckSheet() {
  const today = todayStr();
  const targets = findMaturityTargets(today);
  const emailRec = await DB.get('settings', 'maturityEmail');
  renderMaturitySheet(targets, today, emailRec && emailRec.email ? emailRec.email : null);
  openSheet('maturitySheet');
}

function renderMaturitySheet(targets, today, email) {
  const sheet = document.getElementById('maturitySheet');
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>만기 체크 (${MATURITY_WINDOW_DAYS}일 이내)</h3>
      <button id="matClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      ${targets.length === 0 ? `
        <div style="padding:32px 8px;text-align:center;color:var(--text-3);font-size:13.5px;">
          ${MATURITY_WINDOW_DAYS}일 이내 만기인 정기계정이 없어요
        </div>
      ` : `
        <div style="font-size:12.5px;color:var(--text-3);padding:0 2px 12px;">오늘(${today}) 기준 ${MATURITY_WINDOW_DAYS}일 이내 만기인 정기계정 ${targets.length}건입니다.</div>
        <div class="card" style="padding:0 16px;margin-bottom:14px;">
          ${targets.map((a, i) => {
            const daysLeft = maturityDaysLeft(a.maturityDate, today);
            const tag = maturityTag(daysLeft);
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;${i < targets.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:14px;color:var(--text-1);">${escapeHTML(a.name)}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${a.maturityDate} · ${tag}</div>
              </div>
              <div style="text-align:right;font-weight:700;font-size:13.5px;color:var(--text-1);white-space:nowrap;">${fmtMoney(a.carryover || 0)}원</div>
            </div>`;
          }).join('')}
        </div>
      `}

      ${!email ? `
        <div style="font-size:12.5px;color:var(--text-3);padding:0 2px 12px;">메일을 발송하려면 설정에서 알림 이메일을 먼저 등록해주세요.</div>
      ` : ''}

      <button class="btn-primary" id="matSendBtn" ${(targets.length === 0 || !email) ? 'disabled style="opacity:0.45;"' : ''}>📧 메일로 발송하기</button>
    </div>
  `;
  sheet.querySelector('#matClose').addEventListener('click', closeAllSheets);
  sheet.querySelector('#matSendBtn')?.addEventListener('click', async () => {
    if (targets.length === 0 || !email) return;
    openMailtoForMaturity(targets, email, today);
    await DB.put('settings', { key: 'maturityLastCheck', date: today });
    showToast('📧 메일 앱을 열었어요');
    closeAllSheets();
  });
}

async function checkAndRunAutoBackup() {
  const enabled = await getAutoBackupEnabled();
  if (!enabled) return;
  if (!isSunday()) return;
  const today = todayStr();
  const last = await getLastAutoBackupDate();
  if (last === today) return; // 이미 오늘 백업함

  // 백업 실행
  await runAutoBackup();
}

async function runAutoBackup(manual = false) {
  if (State.transactions.length === 0) {
    if (manual) showToast('백업할 거래가 없어요');
    return;
  }
  const today = todayStr();
  const months = availableMonthsFromTx();
  const sYm = months[0], eYm = months[months.length - 1];
  const appTitle = await getAppTitle();
  const fname = `${appTitle}_자동백업_${today}.json`;

  const payload = buildBackupPayload(sYm, eYm);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

  // PC Chrome/Edge: File System Access API로 폴더에 직접 저장
  const dirHandle = await getAutoBackupDirHandle();
  if (dirHandle && window.showDirectoryPicker) {
    try {
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted' || (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        const fileHandle = await dirHandle.getFileHandle(fname, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        await setLastAutoBackupDate(today);
        showToast(`✅ 자동 백업 완료: ${fname}`);
        return;
      }
    } catch (e) {
      console.warn('폴더 저장 실패, 다운로드로 대체:', e);
    }
  }

  // 폴더 미지정 또는 iOS: 일반 다운로드
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
  await setLastAutoBackupDate(today);
  showToast(`✅ 자동 백업 완료: ${fname}`);
}

async function pickAutoBackupFolder() {
  if (!window.showDirectoryPicker) {
    showToast('이 기기에서는 폴더 지정이 지원되지 않아요 (iOS 미지원). 일요일에 자동 다운로드로 대신해요.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await setAutoBackupDirHandle(handle);
    showToast(`백업 폴더 설정 완료: ${handle.name}`);
    renderSettings();
  } catch (e) {
    if (e.name !== 'AbortError') showToast('폴더 선택 취소');
  }
}

// 세부항목 표시명: 수입 세부항목 중 헌금 종류는 '...헌금' 접미어 부착
// (대분류가 인물이름으로 바뀌었으므로 세부항목 이름 자체로 판단)
const HEONG_SUBS_NO_SUFFIX = new Set(['십 일 조','헌신예배','통장이동','통장이동(퇴직)']);
function subItemDisplayName(catType, catName, subName) {
  // 예외 목록은 그대로 (헌금 접미사 안 붙임)
  if (HEONG_SUBS_NO_SUFFIX.has(subName)) return subName;
  // 이미 헌금으로 끝나면 그대로
  if (subName.endsWith('헌금')) return subName;
  // 수입 거래 세부항목이면 헌금 접미어 부착
  if (catType === 'income') return subName + '헌금';
  return subName;
}

// 거래 1건을 출력용 줄 단위로 풀어낸다.
// 인물단계 대분류: 대분류칸=인물이름, 소분류칸=세부항목명(헌금 표기)
// 인물단계 없는 대분류: 대분류칸=대분류명, 소분류칸=세부항목명
function explodeTxToRows(t) {
  const cat = txCatInfo(t);
  const sgName = txSubGroupName(t);
  const hasGroupStructure = subGroupsOfCategory(cat.id).length > 0;

  let major, minor_prefix;
  if (hasGroupStructure || sgName) {
    major = sgName || (cat.name + ' (이름없음)');
    minor_prefix = '';
  } else {
    major = cat.name;
    minor_prefix = '';
  }

  const lines = (t['lines'] && t['lines'].length > 0) ? t['lines'] : [{ subItemId: null, amount: t['amount'] }];
  return lines.map(l => {
    const subRawName = txLineName(l);
    const subName = (l['subItemId'] || l.subItemName) ? subItemDisplayName(cat['type'], cat['name'], subRawName) : '';
    return {
      date: t['date'],
      major,
      minor: subName,
      amount: l['amount'],
      type: t['type'],
    };
  });
}

/* =========================================================
   날짜 변경 시트
   ========================================================= */
function openDatePickerSheet(currentDate, onPick) {
  let sheet = document.getElementById('datePickerSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'datePickerSheet';
    sheet.className = 'sheet';
    sheet.style.zIndex = '97';
    document.getElementById('app').appendChild(sheet);
  }
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>날짜 변경</h3>
      <button id="dpClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="formrow">
        <input type="date" id="dpInput" class="dateinput" value="${currentDate}" style="font-size:16px; padding:12px 14px;">
      </div>
      <button class="btn-primary" id="dpConfirm">확인</button>
    </div>
  `;
  openSheet('datePickerSheet');
  sheet.querySelector('#dpClose').addEventListener('click', () => closeSubSheet('datePickerSheet'));
  sheet.querySelector('#dpConfirm').addEventListener('click', () => {
    const val = sheet.querySelector('#dpInput').value;
    if (!val) { showToast('날짜를 선택해주세요'); return; }
    closeSubSheet('datePickerSheet');
    onPick(val);
  });
}

function closeSubSheet(id) {
  const s = document.getElementById(id);
  if (s) s.classList.remove('show');
}

/* =========================================================
   즐겨찾기 템플릿
   ========================================================= */
async function getTemplates() { return await DB.getAll('templates'); }
async function saveTemplate(tpl) { await DB.put('templates', tpl); }
async function deleteTemplate(id) { await DB.del('templates', id); }

// 반복 템플릿 키: 대분류+이름 조합마다 1개
function tplKey(categoryId, personId) {
  return `${categoryId}:${personId || ''}`;
}
async function getRepeatTpl(categoryId, personId) {
  return await DB.get('templates', tplKey(categoryId, personId));
}
async function saveRepeatTpl(categoryId, personId, lines) {
  await DB.put('templates', { id: tplKey(categoryId, personId), categoryId, personId: personId || null, lines });
}
async function deleteRepeatTpl(categoryId, personId) {
  await DB.del('templates', tplKey(categoryId, personId));
}

// 지정 연/월 범위의 월 목록을 만든다. [{year, month}], month는 1~12
function buildMonthRange(startYear, startMonth, endYear, endMonth) {
  const months = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

const EXCEL_HEADER = ['일자', '대분류', '소분류', '수입금액', '지출금액', '누계금액'];

// 한 달치 결산에 필요한 항목별 합계 계산
function monthCalc(txs, year, month) {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const list = txs.filter(t => t.date.startsWith(ym));
  let income = 0, expense = 0;
  for (const t of list) { if (t.type === 'income') income += t.amount; else expense += t.amount; }

  // 통장이동(선교) = 그 달 '교회' 대분류(또는 통장이동 세부항목을 가진 임의 수입 대분류)의 '통장이동' 세부항목 합계
  // 구 구조(헌금 대분류)와 신 구조(교회 대분류) 모두 지원
  let missionTransfer = 0;
  // '통장이동' 이름의 세부항목을 가진 수입 거래 전체를 합산
  const transferSubIds = new Set(
    State.subItems
      .filter(s => s.name === '통장이동')
      .map(s => s.id)
  );
  if (transferSubIds.size > 0) {
    for (const t of list) {
      if (t.type !== 'income') continue;
      for (const l of (t.lines || [])) {
        if (transferSubIds.has(l.subItemId)) missionTransfer += l.amount;
      }
    }
  }

  // 예금 = 그 달 '예금' 지출 대분류 합계
  const depositCat = State.categories.find(c => c.type === 'expense' && c.name === '예금');
  let depositTotal = 0;
  if (depositCat) {
    for (const t of list) {
      if (t.categoryId === depositCat.id) depositTotal += t.amount;
    }
  }

  return {
    list,
    income,
    expense,
    missionTransfer,
    depositTotal,
    netIncome: income - missionTransfer,
    netExpense: expense,
  };
}

async function ensureYearCarryover(year) {
  let amount = await getYearCarryover(year);
  if (amount === null) {
    const input = prompt(`${year}년 전년이월 금액을 입력해주세요 (처음 한 번만 입력하면 계속 사용됩니다)`, '0');
    if (input === null) return null; // 사용자가 취소
    amount = Number(rawDigits(input)) || 0;
    await setYearCarryover(year, amount);
  }
  return amount;
}


/* =========================================================
   항목 구조 엑셀 내보내기
   카테고리 > 중분류(subGroup) > 소분류(subItem) 트리를 표로 출력
   ========================================================= */

async function exportExcel() {
  if (State.transactions.length === 0) { showToast('내보낼 거래가 없어요'); return; }
  openExcelRangeSheet();
}

function availableMonthsFromTx() {
  const set = new Set();
  for (const t of State.transactions) set.add(t.date.slice(0, 7)); // YYYY-MM
  return Array.from(set).sort();
}

function availableDateRangeFromTx() {
  if (State.transactions.length === 0) return null;
  let min = State.transactions[0].date, max = State.transactions[0].date;
  for (const t of State.transactions) {
    if (t.date < min) min = t.date;
    if (t.date > max) max = t.date;
  }
  return { min, max };
}

let excelMode = 'all'; // 'all' | 'monthly' | 'custom'

function openExcelRangeSheet() {
  if (State.transactions.length === 0) { showToast('내보낼 거래가 없어요'); return; }
  excelMode = 'all';
  renderExcelRangeSheet();
  openSheet('excelRangeSheet');
}

function renderExcelRangeSheet() {
  const sheet = document.getElementById('excelRangeSheet');
  const months = availableMonthsFromTx();
  const range = availableDateRangeFromTx();

  const optionHTML = months.map(ym => {
    const [y, m] = ym.split('-');
    return `<option value="${ym}">${y}년 ${Number(m)}월</option>`;
  }).join('');

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>엑셀 내보내기</h3>
      <button id="excClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="segctrl">
        <button data-mode="all"     class="${excelMode==='all'    ?'active':''}">전체</button>
        <button data-mode="monthly" class="${excelMode==='monthly'?'active':''}">월간</button>
        <button data-mode="custom"  class="${excelMode==='custom' ?'active':''}">지정기간</button>
      </div>

      ${excelMode === 'all' ? `
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">전체 기간의 모든 달을 정식 교회 결산 양식으로, 달별로 나누어 만들어요.</div>
      ` : excelMode === 'monthly' ? `
      <div class="formrow">
        <label>월 선택</label>
        <select class="dateinput" id="excMSingle">${optionHTML}</select>
      </div>
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">선택한 달의 정식 교회 결산 양식으로 만들어요.</div>
      ` : `
      ${(() => {
        // 연도/월 범위 파싱
        const [minY, minM] = range.min.split('-').map(Number);
        const [maxY, maxM] = range.max.split('-').map(Number);
        const years = [];
        for (let y = minY; y <= maxY; y++) years.push(y);
        const monthOpts = Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${i+1}월</option>`).join('');
        const yearOptsStart = years.map(y=>`<option value="${y}">${y}년</option>`).join('');
        const yearOptsEnd   = years.map(y=>`<option value="${y}">${y}년</option>`).join('');
        return `
        <div class="formrow">
          <label>시작</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="dateinput" id="excStartY" style="flex:1;">${yearOptsStart}</select>
            <select class="dateinput" id="excStartM" style="flex:1;">${monthOpts}</select>
            <select class="dateinput" id="excStartD" style="flex:1;"></select>
          </div>
        </div>
        <div class="formrow">
          <label>종료</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="dateinput" id="excEndY" style="flex:1;">${yearOptsEnd}</select>
            <select class="dateinput" id="excEndM" style="flex:1;">${monthOpts}</select>
            <select class="dateinput" id="excEndD" style="flex:1;"></select>
          </div>
        </div>`;
      })()}
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">정확히 선택한 기간의 거래만, 날짜·중분류·소분류·수입·지출·누계가 있는 줄 단위 표 1장으로 만들어요.</div>
      `}

      <button class="btn-primary" id="excGo">엑셀 파일 만들기</button>
    </div>
  `;

  // 초기값 설정
  if (excelMode === 'monthly') {
    sheet.querySelector('#excMSingle').value = months[months.length - 1];
  } else if (excelMode === 'custom') {
    // 날일 select 채우기 함수
    const fillDays = (ySel, mSel, dSel, defaultDay) => {
      const y = Number(ySel.value), m = Number(mSel.value);
      const days = new Date(y, m, 0).getDate();
      dSel.innerHTML = Array.from({length:days},(_,i)=>{
        const d = String(i+1).padStart(2,'0');
        return `<option value="${d}">${i+1}일</option>`;
      }).join('');
      if (defaultDay) dSel.value = String(Math.min(Number(defaultDay), days)).padStart(2,'0');
    };

    const [minY, minM, minD] = range.min.split('-');
    const [maxY, maxM, maxD] = range.max.split('-');

    const sY = sheet.querySelector('#excStartY');
    const sM = sheet.querySelector('#excStartM');
    const sD = sheet.querySelector('#excStartD');
    const eY = sheet.querySelector('#excEndY');
    const eM = sheet.querySelector('#excEndM');
    const eD = sheet.querySelector('#excEndD');

    sY.value = minY; sM.value = minM; fillDays(sY, sM, sD, minD);
    eY.value = maxY; eM.value = maxM; fillDays(eY, eM, eD, maxD);

    [sY, sM].forEach(el => el.addEventListener('change', () => fillDays(sY, sM, sD, sD.value)));
    [eY, eM].forEach(el => el.addEventListener('change', () => fillDays(eY, eM, eD, eD.value)));
  }

  sheet.querySelector('#excClose').addEventListener('click', closeAllSheets);
  sheet.querySelectorAll('.segctrl button').forEach(b => {
    b.addEventListener('click', () => {
      excelMode = b.dataset.mode;
      renderExcelRangeSheet();
    });
  });

  sheet.querySelector('#excGo').addEventListener('click', async () => {
    if (excelMode === 'custom') {
      const sDate = sheet.querySelector('#excStartY').value + '-' +
                    sheet.querySelector('#excStartM').value + '-' +
                    sheet.querySelector('#excStartD').value;
      const eDate = sheet.querySelector('#excEndY').value + '-' +
                    sheet.querySelector('#excEndM').value + '-' +
                    sheet.querySelector('#excEndD').value;
      if (sDate > eDate) { showToast('시작 날짜가 종료 날짜보다 늦어요'); return; }
      const wb = generateCustomRangeWorkbook(sDate, eDate);
      XLSX.writeFile(wb, `회계부-지정기간-${sDate}_${eDate}.xlsx`);
      closeAllSheets();
      showToast('엑셀 내보내기 완료');
      return;
    }

    // 전체 / 월간 — 정식 결산 양식
    let sy, sm, ey, em;
    if (excelMode === 'all') {
      [sy, sm] = months[0].split('-').map(Number);
      [ey, em] = months[months.length - 1].split('-').map(Number);
    } else {
      const sYm = sheet.querySelector('#excMSingle').value;
      [sy, sm] = sYm.split('-').map(Number);
      ey = sy; em = sm;
    }

    const monthsRange = buildMonthRange(sy, sm, ey, em);
    const yearsNeeded = Array.from(new Set(monthsRange.map(m => m.year)));
    const carryoverByYear = {};
    for (const y of yearsNeeded) {
      const amt = await ensureYearCarryover(y);
      if (amt === null) { showToast('취소되었습니다'); return; }
      carryoverByYear[y] = amt;
    }
    const wb = generateChurchLedgerWorkbook(monthsRange, carryoverByYear);
    const fname = excelMode === 'all'
      ? `회계부-전체_${todayStr()}.xlsx`
      : `회계부-${sy}-${String(sm).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, fname);
    closeAllSheets();
    showToast('엑셀 내보내기 완료');
  });
}

// 지정기간: 날짜 / 중분류 / 소분류 / 수입 / 지출 / 누계 — 줄 단위 내역 + 정식 결산 없이 약식 1장
function generateCustomRangeWorkbook(startDate, endDate) {
  const txs = State.transactions
    .filter(t => t.date >= startDate && t.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const aoa = [['날짜', '중분류', '소분류', '수입', '지출', '누계']];
  let running = 0, totalIncome = 0, totalExpense = 0;
  for (const t of txs) {
    for (const r of explodeTxToRows(t)) {
      if (r.type === 'income') { running += r.amount; totalIncome += r.amount; }
      else { running -= r.amount; totalExpense += r.amount; }
      aoa.push([
        r.date,
        r.major,
        r.minor,
        r.type === 'income' ? r.amount : '',
        r.type === 'expense' ? r.amount : '',
        running,
      ]);
    }
  }
  aoa.push(['합계', '', '', totalIncome, totalExpense, running]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const numFmtCols = [3, 4, 5]; // D, E, F (수입/지출/누계)
  for (let r = 0; r < aoa.length; r++) {
    for (const c of numFmtCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') cell.z = '#,##0;-#,##0';
    }
  }
  ws['!cols'] = [
    { wch: 11 }, // 날짜
    { wch: 11 }, // 중분류
    { wch: 12 }, // 소분류
    { wch: 12 }, // 수입
    { wch: 12 }, // 지출
    { wch: 13 }, // 누계
  ];

  XLSX.utils.book_append_sheet(wb, ws, '지정기간');
  return wb;
}

// 실제 엑셀 생성: months = [{year, month}] (출력할 달), carryoverByYear = { year: amount }
function generateChurchLedgerWorkbook(months, carryoverByYear) {
  const wb = XLSX.utils.book_new();
  if (months.length === 0) return wb;

  // 누계는 항상 그 해 1월부터 정확히 계산해야 하므로,
  // 출력 시작월이 1월이 아니면 1월~(시작월-1)까지를 '선행 계산'으로 누계만 구해둔다(시트에는 안 보임).
  const firstOut = months[0];
  let runningTotal = carryoverByYear[firstOut.year] || 0;
  for (let m = 1; m < firstOut.month; m++) {
    const calc = monthCalc(State.transactions, firstOut.year, m);
    const sortedTx = calc.list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    for (const t of sortedTx) {
      for (const r of explodeTxToRows(t)) {
        runningTotal += (r.type === 'income') ? r.amount : -r.amount;
      }
    }
  }

  let lastYear = null;

  for (const { year, month } of months) {
    // 연도가 바뀌면(이 범위 안에서 새 해로 넘어가면) 그 해의 carryover로 누계를 다시 맞춘다.
    if (year !== lastYear) {
      if (lastYear !== null) {
        // 새 해로 넘어가는 경우: 1월부터 다시 선행 계산 (month가 1이 아닐 일은 없지만 안전하게)
        runningTotal = carryoverByYear[year] || 0;
        for (let m = 1; m < month; m++) {
          const calc = monthCalc(State.transactions, year, m);
          const sortedTx = calc.list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
          for (const t of sortedTx) {
            for (const r of explodeTxToRows(t)) {
              runningTotal += (r.type === 'income') ? r.amount : -r.amount;
            }
          }
        }
      }
      lastYear = year;
    }

    const aoa = [];
    const merges = [];

    aoa.push(EXCEL_HEADER);

    // 그 해의 1월을 출력하는 경우에만 '전년이월' 줄 표시
    if (month === 1) {
      const carry = carryoverByYear[year] || 0;
      aoa.push([`${year}-01-01`, '전년이월', '전년이월', carry, '', carry]);
    }

    const calc = monthCalc(State.transactions, year, month);
    const sortedTx = calc.list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

    for (const t of sortedTx) {
      const rows = explodeTxToRows(t);
      for (const r of rows) {
        if (r.type === 'income') runningTotal += r.amount;
        else runningTotal -= r.amount;
        aoa.push([
          r.date,
          r.major,
          r.minor,
          r.type === 'income' ? r.amount : '',
          r.type === 'expense' ? r.amount : '',
          runningTotal,
        ]);
      }
    }

    // 월 결산 5줄 (결산 줄 자체는 누계에 영향 주지 않음)
    aoa.push([`${month}월 결산`, '', '', calc.income, -calc.expense, '']);
    aoa.push(['', '통장이동(선교)', '', calc.missionTransfer, '', '']);
    aoa.push(['', '예금', '', '', -calc.depositTotal, '']);
    aoa.push(['', '순헌금/지출', '', calc.netIncome, -calc.netExpense, '']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // D, E, F열(수입금액/지출금액/누계금액) 숫자 셀에 천단위 콤마 서식 적용
    const numFmtCols = [3, 4, 5]; // D, E, F (0-indexed)
    for (let r = 0; r < aoa.length; r++) {
      for (const c of numFmtCols) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') {
          cell.z = '#,##0;-#,##0';
        }
      }
    }

    ws['!cols'] = [
      { wch: 10 }, // 일자
      { wch: 10 }, // 대분류
      { wch: 11 }, // 소분류
      { wch: 11 }, // 수입금액
      { wch: 11 }, // 지출금액
      { wch: 11 }, // 누계금액
      { wch: 9 },
    ];
    ws['!merges'] = merges;
    // A4 인쇄 설정 (가로 폭을 한 페이지에 맞춤)
    ws['!pageSetup'] = { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0, scale: 100 };
    ws['!margins'] = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };

    const sheetName = `${String(year).slice(2)}년${month}월`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return wb;
}

let backupMode = 'all'; // 'all' | 'single' | 'range'
let backupAction = 'download'; // 'download' | 'email'

async function openBackupRangeSheet(action = 'download') {
  if (State.transactions.length === 0) { showToast('내보낼 거래가 없어요'); return; }
  if (action === 'email') {
    const emailRec = await DB.get('settings', 'maturityEmail');
    if (!emailRec || !emailRec.email) {
      showToast('설정에서 이메일을 먼저 등록해주세요');
      return;
    }
  }
  backupMode = 'all';
  backupAction = action;
  renderBackupRangeSheet();
  openSheet('backupRangeSheet');
}

function renderBackupRangeSheet() {
  const sheet = document.getElementById('backupRangeSheet');
  const months = availableMonthsFromTx();
  const dateRange = availableDateRangeFromTx();
  const optionHTML = months.map(ym => {
    const [y, m] = ym.split('-');
    return `<option value="${ym}">${y}년 ${Number(m)}월</option>`;
  }).join('');
  const isEmail = backupAction === 'email';

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>${isEmail ? '백업 메일 발송' : '데이터 백업'}</h3>
      <button id="bkClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="segctrl">
        <button data-mode="all"    class="${backupMode==='all'   ?'active':''}">${isEmail ? '전체' : '전체 백업'}</button>
        <button data-mode="single" class="${backupMode==='single'?'active':''}">개별 달</button>
        <button data-mode="range"  class="${backupMode==='range' ?'active':''}">범위 설정</button>
      </div>

      ${backupMode === 'all' ? `
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">전체 기간의 모든 거래 데이터와 카테고리/이름 정보가 ${isEmail ? '메일로 발송됩니다.' : '저장됩니다.'}</div>
      ` : backupMode === 'single' ? `
      <div class="formrow">
        <label>${isEmail ? '발송할 달' : '백업할 달'}</label>
        <select class="dateinput" id="bkSingle">${optionHTML}</select>
      </div>
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">선택한 달의 거래 데이터와 모든 카테고리/이름 정보가 함께 ${isEmail ? '발송됩니다.' : '저장됩니다.'}</div>
      ` : `
      <div class="formrow">
        <label>시작일</label>
        <input type="date" class="dateinput" id="bkStart"
          ${dateRange ? `min="${dateRange.min}" max="${dateRange.max}"` : ''}>
      </div>
      <div class="formrow">
        <label>종료일</label>
        <input type="date" class="dateinput" id="bkEnd"
          ${dateRange ? `min="${dateRange.min}" max="${dateRange.max}"` : ''}>
      </div>
      <div style="font-size:12.5px; color:var(--text-3); padding:0 2px 16px;">선택한 기간(연-월-일)의 거래 데이터와 모든 카테고리/이름 정보가 함께 ${isEmail ? '발송됩니다.' : '저장됩니다.'}</div>
      `}

      ${!isEmail ? `
      <div class="formrow">
        <label>파일 이름 (선택)</label>
        <input type="text" class="dateinput" id="bkFileName" placeholder="비워두면 자동으로 생성돼요">
      </div>
      ` : ''}

      <button class="btn-primary" id="bkGo">${isEmail ? '메일로 발송하기' : 'JSON 백업 파일 만들기'}</button>
    </div>
  `;

  // 초기값 설정
  if (backupMode === 'single') {
    sheet.querySelector('#bkSingle').value = months[months.length - 1];
  } else if (backupMode === 'range' && dateRange) {
    sheet.querySelector('#bkStart').value = dateRange.min;
    sheet.querySelector('#bkEnd').value   = dateRange.max;
  }

  // 탭 전환
  sheet.querySelectorAll('.segctrl button').forEach(b => {
    b.addEventListener('click', () => {
      backupMode = b.dataset.mode;
      renderBackupRangeSheet();
    });
  });

  sheet.querySelector('#bkClose').addEventListener('click', closeAllSheets);
  sheet.querySelector('#bkGo').addEventListener('click', () => {
    let sDate = null, eDate = null;
    if (backupMode === 'single') {
      const ym = sheet.querySelector('#bkSingle').value;
      sDate = `${ym}-01`;
      const [y, m] = ym.split('-').map(Number);
      eDate = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`;
    } else if (backupMode === 'range') {
      sDate = sheet.querySelector('#bkStart').value;
      eDate = sheet.querySelector('#bkEnd').value;
      if (!sDate || !eDate) { showToast('시작일과 종료일을 선택해주세요'); return; }
      if (sDate > eDate) { showToast('시작일이 종료일보다 늦어요'); return; }
    }
    if (backupAction === 'email') {
      sendBackupByEmail(sDate, eDate);
    } else {
      const customName = sheet.querySelector('#bkFileName')?.value.trim() || null;
      exportData(sDate, eDate, customName);
    }
    closeAllSheets();
  });
}

async function sendBackupByEmail(startDate = null, endDate = null) {
  const emailRec = await DB.get('settings', 'maturityEmail');
  if (!emailRec || !emailRec.email) {
    showToast('설정에서 이메일을 먼저 등록해주세요');
    return;
  }
  const email = emailRec.email;
  const appName = State.appName || '교회 회계부';
  const today = todayStr();

  const txs = (startDate && endDate)
    ? State.transactions.filter(t => t.date >= startDate && t.date <= endDate)
    : State.transactions;

  let rangeLabel;
  if (startDate && endDate) {
    const fmt = (d) => d; // yyyy-mm-dd 그대로 사용 (한글 없이 인코딩 안전하게)
    rangeLabel = (startDate === endDate) ? fmt(startDate) : `${fmt(startDate)}_${fmt(endDate)}`;
  } else {
    rangeLabel = `ALL_${today}`;
  }

  const allTemplates = await DB.getAll('templates');
  const data = {
    exportedAt: new Date().toISOString(),
    rangeStart: startDate || null,
    rangeEnd:   endDate   || null,
    categories: State.categories,
    persons: State.persons,
    subItems: State.subItems,
    subGroups: State.subGroups || [],
    linkedAccounts: State.linkedAccounts || [],
    transactions: txs,
    templates: allTemplates || [],
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const txCount = txs.length;
  const fileName = `backup-${rangeLabel}.json`;
  const subject = `[${appName}] 데이터 백업 ${rangeLabel}`;
  const blob = new Blob([jsonStr], { type: 'application/json' });

  // iOS/Android: Web Share API로 파일 공유 (메일 앱에 첨부 가능)
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'application/json' })] })) {
    const file = new File([blob], fileName, { type: 'application/json' });
    try {
      await navigator.share({
        title: subject,
        text: `${appName} 데이터 백업 (${rangeLabel})\n거래 ${txCount}건\n백업일시: ${new Date().toLocaleString('ko-KR')}`,
        files: [file],
      });
      showToast('📧 공유 완료');
      return;
    } catch (e) {
      if (e.name !== 'AbortError') console.error('share error:', e);
    }
  }

  // fallback: 파일 다운로드 + 메일 앱 열기
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  const bodyShort = `${appName} 백업 (${rangeLabel})\n\n백업일시: ${new Date().toLocaleString('ko-KR')}\n거래 건수: ${txCount}건\n\n다운로드된 JSON 파일을 첨부해 보내주세요.`;
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyShort)}`;
  showToast('📥 JSON 다운로드 완료 — 메일에 첨부해 발송해주세요');
}

async function exportData(startDate, endDate, customName = null) {
  // 범위 내 거래만 필터 (인수 없으면 전체)
  const txs = (startDate && endDate)
    ? State.transactions.filter(t => t.date >= startDate && t.date <= endDate)
    : State.transactions;

  let rangeLabel;
  if (startDate && endDate) {
    const fmt = (d) => d; // yyyy-mm-dd 그대로 사용 (한글 없이 인코딩 안전하게)
    rangeLabel = (startDate === endDate) ? fmt(startDate) : `${fmt(startDate)}_${fmt(endDate)}`;
  } else {
    rangeLabel = `ALL_${todayStr()}`;
  }

  const data = {
    exportedAt: new Date().toISOString(),
    rangeStart: startDate || null,
    rangeEnd:   endDate   || null,
    categories: State.categories,
    persons:    State.persons,
    subItems:   State.subItems,
    subGroups:  State.subGroups,
    linkedAccounts: State.linkedAccounts || [],
    transactions: txs,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // 파일 이름을 지정하지 않으면 기존 방식(backup-범위.json) 그대로 사용
  let fileName = customName ? customName.replace(/[\\/:*?"<>|]/g, '') : `backup-${rangeLabel}`;
  if (!/\.json$/i.test(fileName)) fileName += '.json';
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`${txs.length}건 백업 완료`);
}

async function importDataFromText() {
  // 텍스트 입력 시트 표시
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet active';
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>📋 텍스트로 복원</h3>
      <button id="importTextClose" class="sheet-close-btn">${ICONS.close}</button>
    </div>
    <div class="sheet-body" style="padding:12px 16px 24px;">
      <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;line-height:1.6;">
        메일 본문에서 <b>===== JSON START =====</b> 부터<br>
        <b>===== JSON END =====</b> 까지 전체를 복사해서 붙여넣으세요.
      </div>
      <textarea id="importTextArea" style="width:100%;height:180px;font-size:11px;padding:10px;border:1px solid var(--border);border-radius:10px;resize:none;font-family:monospace;" placeholder="여기에 붙여넣기..."></textarea>
      <button id="importTextBtn" class="btn-primary" style="margin-top:10px;">복원하기</button>
    </div>`;
  document.body.appendChild(sheet);

  sheet.querySelector('#importTextClose').addEventListener('click', () => sheet.remove());

  sheet.querySelector('#importTextBtn').addEventListener('click', async () => {
    let raw = sheet.querySelector('#importTextArea').value.trim();

    // ===== JSON START ===== ~ ===== JSON END ===== 사이 추출
    const startTag = '===== JSON START =====';
    const endTag   = '===== JSON END =====';
    const si = raw.indexOf(startTag);
    const ei = raw.indexOf(endTag);
    if (si !== -1 && ei !== -1 && ei > si) {
      raw = raw.slice(si + startTag.length, ei).trim();
    }

    try {
      const data = JSON.parse(raw);
      if (!data.categories || !data.transactions) throw new Error('invalid');
      const ok = confirm(
        `${data.categories.length}개 항목, ${data.transactions.length}개 거래가 있는 백업입니다.\n\n기존 데이터를 모두 지우고 복원할까요?`
      );
      if (!ok) return;
      sheet.remove();
      // importData와 동일한 복원 로직 재사용
      await restoreFromData(data);
    } catch (e) {
      showToast('JSON 형식이 올바르지 않아요. 전체를 다시 복사해주세요.');
    }
  });
}

async function restoreFromData(data) {
  const [oldCats, oldPersons, oldSubs, oldTxs, oldSubGroups, oldLinkedAccounts] = await Promise.all([
    DB.getAll('categories'), DB.getAll('persons'), DB.getAll('subItems'),
    DB.getAll('transactions'), DB.getAll('subGroups'), DB.getAll('linkedAccounts')
  ]);
  for (const x of oldTxs) await DB.del('transactions', x.id);
  for (const x of oldSubs) await DB.del('subItems', x.id);
  for (const x of oldPersons) await DB.del('persons', x.id);
  for (const x of oldCats) await DB.del('categories', x.id);
  for (const x of oldSubGroups) await DB.del('subGroups', x.id);
  for (const x of oldLinkedAccounts) await DB.del('linkedAccounts', x.id);
  for (const c of (data.categories||[])) await DB.put('categories', c);
  for (const p of (data.persons||[])) await DB.put('persons', p);
  for (const s of (data.subItems||[])) await DB.put('subItems', s);
  for (const g of (data.subGroups||[])) await DB.put('subGroups', g);
  for (const a of (data.linkedAccounts||[])) await DB.put('linkedAccounts', a);
  for (const t of (data.transactions||[])) await DB.put('transactions', t);
  for (const tpl of (data.templates||[])) await DB.put('templates', tpl);
  await reloadData();
  renderCurrentPage();
  showToast(`✅ 복원 완료 — 거래 ${(data.transactions||[]).length}건`);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.categories || !data.transactions) throw new Error('invalid');
      const replace = confirm(
        `${data.categories.length}개 항목, ${data.transactions.length}개 거래가 있는 백업 파일입니다.\n\n` +
        `[확인]을 누르면 기존 데이터를 모두 지우고 이 파일로 교체합니다.\n` +
        `[취소]를 누르면 가져오기를 중단합니다.\n\n` +
        `(기존 데이터에 추가하려면 취소 후 설정에서 별도로 진행해주세요)`
      );
      if (!replace) return;

      // 기존 데이터 전체 삭제 후 교체
      const [oldCats, oldPersons, oldSubs, oldTxs, oldSubGroups, oldLinkedAccounts] = await Promise.all([
        DB.getAll('categories'), DB.getAll('persons'), DB.getAll('subItems'),
        DB.getAll('transactions'), DB.getAll('subGroups'), DB.getAll('linkedAccounts')
      ]);
      for (const x of oldTxs) await DB.del('transactions', x.id);
      for (const x of oldSubs) await DB.del('subItems', x.id);
      for (const x of oldPersons) await DB.del('persons', x.id);
      for (const x of oldCats) await DB.del('categories', x.id);
      for (const x of oldSubGroups) await DB.del('subGroups', x.id);
      for (const x of oldLinkedAccounts) await DB.del('linkedAccounts', x.id);

      for (const c of data.categories) await DB.put('categories', c);
      for (const p of (data.persons || [])) await DB.put('persons', p);
      for (const s of (data.subItems || [])) await DB.put('subItems', s);
      for (const g of (data.subGroups || [])) await DB.put('subGroups', g);
      for (const a of (data.linkedAccounts || [])) await DB.put('linkedAccounts', a);
      for (const t of data.transactions) await DB.put('transactions', t);
      await reloadData();
      renderCurrentPage();
      showToast('가져오기 완료');
    } catch (err) {
      alert('올바른 백업 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

async function resetAllData() {
  if (!confirm('사용자가 입력한 모든 데이터(거래, 항목, 계정, 명부 등)가 삭제됩니다.\n계속할까요?')) return;
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  // 사용자 데이터 전체 삭제 (settings 제외 — 이메일·자동백업 설정은 유지)
  const stores = ['categories','persons','subItems','subGroups','transactions','linkedAccounts','templates'];
  for (const store of stores) {
    const all = await DB.getAll(store);
    for (const x of all) await DB.del(store, x.id || x.key);
  }

  // 기본 항목 재생성
  await seedIfEmpty();
  // 대표계정 강제 생성 (seedIfEmpty 이후에도 없으면)
  const accts = await DB.getAll('linkedAccounts');
  if (accts.length === 0) {
    await DB.put('linkedAccounts', {
      id: uid(), name: '대표계정', isDefault: true,
      accountKind: 'normal', carryover: 0, order: 0,
    });
  }
  await reloadData();
  renderCurrentPage();
  showToast('✅ 초기화 완료 — 모든 데이터가 삭제됐어요');
}

/* =========================================================
   SHEETS: shared open/close
   ========================================================= */
function closeAllSheets() {
  document.getElementById('sheetBackdrop').classList.remove('show');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('show'));
  State.dayDetailDate = null;
  State.catStatDetailId = null;
  State.subStatDetailKey = null;
  State.interestDetailKey = null;
  window._checkSheetScrollTopBtn?.();
}

function openSheet(id) {
  document.getElementById('sheetBackdrop').classList.add('show');
  document.getElementById(id).classList.add('show');
  window._checkSheetScrollTopBtn?.();
}

function closeSheet(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
  // 남은 시트가 없으면 backdrop도 제거
  const anyOpen = document.querySelectorAll('.sheet.show').length > 0;
  if (!anyOpen) document.getElementById('sheetBackdrop').classList.remove('show');
  window._checkSheetScrollTopBtn?.();
}

// 거래입력 시트(txSheet)만 닫기: 일별상세/통계항목상세에서 열렸으면 그 화면으로 복귀, 아니면 전체 닫기
function closeTxSheet() {
  if (State.dayDetailDate) {
    document.getElementById('txSheet').classList.remove('show');
    // selectedAccountId는 유지한 채로 복귀 (계정 선택 상태 보존)
    openDayDetail(State.dayDetailDate);
  } else if (State.catStatDetailId) {
    document.getElementById('txSheet').classList.remove('show');
    openCatStatDetail(State.catStatDetailId);
  } else if (State.subStatDetailKey) {
    document.getElementById('txSheet').classList.remove('show');
    openSubStatDetail(State.subStatDetailKey);
  } else if (State.interestDetailKey) {
    document.getElementById('txSheet').classList.remove('show');
    openInterestDetail(State.interestDetailKey);
  } else {
    closeAllSheets();
  }
}

/* =========================================================
   TX SHEET (거래 추가/수정) — 3단계: 대분류 -> (하위항목:이름) -> 세부항목 다중입력
   ========================================================= */
function resetTxForm(type) {
  State.formType = type || 'expense';
  State.formStep = 'pick';
  State.formCategoryId = null;
  State.formPersonId = null;
  State.formDate = todayStr();
  State.formMemo = '';
  State.formAmounts = {};
}

function openTxSheet(txId, presetDate, presetType, presetAccountId) {
  // 가상 거래(서브계좌↔재정계정 자동 반영분)는 실제 저장된 거래가 아니므로 직접 수정 불가.
  // 원본은 상대 계좌(서브계좌) 쪽에 있으니 그쪽에서 수정하도록 안내한다.
  if (typeof txId === 'string' && txId.startsWith('syn_')) {
    const srcTx = State.transactions.find(t => txId.startsWith(`syn_${t.id}_`));
    const srcAcct = srcTx ? (State.linkedAccounts || []).find(a => a.id === srcTx.accountId) : null;
    showToast(srcAcct ? `'${srcAcct.name}' 계좌 쪽 거래를 수정해주세요` : '연결된 계좌 쪽 거래를 수정해주세요');
    return;
  }
  if (!getIsAdmin()) { showPasswordPrompt(() => openTxSheet(txId, presetDate, presetType, presetAccountId)); return; }
  const editing = txId ? State.transactions.find(t => t.id === txId) : null;
  State.editingTx = editing;

  if (editing) {
    State.formType = editing.type;
    State.formCategoryId = editing.categoryId;
    State.formPersonId = null; // persons 구조 사용 안 함 (마이그레이션 완료 후)
    State.formSubGroupId = editing.subGroupId || editing.personId || null; // 구버전 호환
    State.formDate = editing.date;
    State.formMemo = editing.memo || '';
    State.formAmounts = {};
    (editing.lines || []).forEach(l => {
      if (l.subItemId) State.formAmounts[l.subItemId] = l.amount;
      else State.formAmounts['__direct__'] = l.amount; // 소분류 없이 저장된 거래
    });
    if (!editing.lines || editing.lines.length === 0) {
      State.formAmounts['__direct__'] = editing.amount || 0; // 구버전 호환
    }
    State.formAccountId = editing.accountId || null;
    // 수정 시에는 바로 항목 입력 단계로 진입 (대분류/이름은 이미 확정된 상태로 보여줌)
    State.formStep = 'items';
  } else {
    resetTxForm(presetType || 'expense');
    if (presetDate) State.formDate = presetDate;
    State.formAccountId = presetAccountId || State.selectedAccountId || null;
  }

  renderTxSheet();
  openSheet('txSheet');
}

function renderTxSheet() {
  const sheet = document.getElementById('txSheet');
  if (State.formStep === 'pick') {
    renderTxStepPick(sheet);
  } else if (State.formStep === 'pickGroup') {
    renderTxStepPickGroup(sheet);
  } else {
    renderTxStepItems(sheet);
  }
}

/* ---- STEP 1: 중분류 선택 (대분류는 건너뛰고 바로 중분류부터) ----
   하위항목(중분류)을 쓰는 대분류는 그 사람들/이름을, 그렇지 않은 대분류는
   대분류 자기 자신을 하나짜리 중분류처럼 만들어, 전부 하나의 목록으로 합쳐
   이름순으로 정렬해서 보여준다. 고르면 다음 단계(소분류 금액 입력)로 넘어간다. */
function renderTxStepPick(sheet) {
  const cats = State.categories.filter(c => c.type === State.formType);

  const flat = [];
  for (const c of cats) {
    // usePersonLevel 구조 폐기 — subGroups 기반으로 통일
    const groups = subGroupsOfCategory(c.id);
    if (groups.length > 0) {
      // 중분류(이름) 있는 대분류 → 대분류 자체를 선택 항목으로 (다음 단계에서 중분류 선택)
      flat.push({ catId: c.id, personId: null, subGroupId: '__has_groups__', name: c.name, icon: c.icon, color: c.color });
    } else {
      flat.push({ catId: c.id, personId: null, subGroupId: null, name: c.name, icon: c.icon, color: c.color });
    }
  }
  flat.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>새 거래</h3>
      <button id="txClose" class="sheet-close-btn">${ICONS.close}취소</button>
    </div>
    <div class="sheet-body">
      <div class="typeswitch">
        <button data-type="expense" class="${State.formType==='expense'?'active expense':''}">지출</button>
        <button data-type="income" class="${State.formType==='income'?'active income':''}">수입</button>
      </div>
      <div class="formrow">
        <label>항목 선택</label>
        <div class="catgrid">
          ${flat.map(item => `
            <button class="catchip" data-pick-cat="${item.catId}" data-pick-person="${item.personId || ''}" data-pick-subgroup="${item.subGroupId || ''}">
              <span class="ic" style="background:${hexToLight(item.color)};">${item.icon}</span>
              <span>${escapeHTML(item.name)}</span>
            </button>
          `).join('')}
        </div>
        ${flat.length === 0 ? `<div style="font-size:13px;color:var(--text-3);padding:8px 2px;">설정에서 대분류를 먼저 추가해주세요</div>` : ''}
      </div>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <button id="txAddPerson" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 0;">+ 새 항목 추가</button>
          <span style="color:var(--border);">|</span>
          <button id="txAddNewCat" style="font-size:13px;color:var(--text-2);font-weight:700;padding:6px 0;">+ 새 대분류</button>
        </div>
        <div id="txAddPersonForm" style="display:none;margin-top:2px;padding-bottom:60px;">
          <div style="font-size:11px;color:var(--text-3);margin-bottom:6px;">대분류를 선택한 후 중분류(이름) 또는 소분류를 추가합니다</div>
          <select id="txAddPersonCat" style="width:100%;margin-bottom:6px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            <option value="">-- 대분류 선택 --</option>
            ${cats.map(c => `<option value="${c.id}" data-hasgroups="${subGroupsOfCategory(c.id).length>0?'1':'0'}">${escapeHTML(c.name)}</option>`).join('')}
          </select>
          <div id="txAddPersonNameWrap" style="display:none;flex-direction:column;gap:6px;">
            <div id="txAddPersonDesc" style="font-size:11px;color:var(--text-3);"></div>
            <div style="display:flex;gap:6px;">
              <input type="text" id="txAddPersonName" placeholder="이름 입력" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
              <button id="txAddPersonSave" style="background:var(--primary);color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;">추가</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  sheet.querySelector('#txClose').addEventListener('click', () => {
    if (State.editingTx) {
      // 수정 모드에서 분류 변경 중 취소 → items로 복귀
      State.formCategoryId = State.editingTx.categoryId;
      State.formSubGroupId = State.editingTx.subGroupId || State.editingTx.personId || null;
      State.formAmounts = {};
      (State.editingTx.lines || []).forEach(l => { State.formAmounts[l.subItemId] = l.amount; });
      State.formStep = 'items';
      renderTxSheet();
    } else {
      closeTxSheet();
    }
  });
  // 새 항목 추가 버튼
  const txAddBtn = sheet.querySelector('#txAddPerson');
  if (txAddBtn) {
    const form = sheet.querySelector('#txAddPersonForm');
    txAddBtn.addEventListener('click', () => {
      const visible = form.style.display !== 'none';
      form.style.display = visible ? 'none' : 'block';
    });
    const catSel = sheet.querySelector('#txAddPersonCat');
    const nameWrap = sheet.querySelector('#txAddPersonNameWrap');
    const desc = sheet.querySelector('#txAddPersonDesc');
    catSel?.addEventListener('change', () => {
      const opt = catSel.selectedOptions[0];
      const hasGroups = opt?.dataset.hasgroups === '1';
      if (catSel.value) {
        nameWrap.style.display = 'flex';
        desc.textContent = hasGroups ? '중분류(이름) 추가' : '소분류 추가';
        sheet.querySelector('#txAddPersonName').placeholder = hasGroups ? '이름 입력 (예: 홍길동)' : '소분류 이름 입력';
        sheet.querySelector('#txAddPersonName').focus();
      } else {
        nameWrap.style.display = 'none';
      }
    });
    sheet.querySelector('#txAddPersonSave')?.addEventListener('click', async () => {
      const catId = catSel.value;
      if (!catId) { showToast('대분류를 선택해주세요'); return; }
      const opt = catSel.selectedOptions[0];
      const hasGroups = opt?.dataset.hasgroups === '1';
      const name = sheet.querySelector('#txAddPersonName').value.trim();
      if (!name) { showToast('이름을 입력해주세요'); return; }
      if (hasGroups) {
        // 중분류(이름) 추가
        const list = subGroupsOfCategory(catId);
        if (list.find(g => g.name === name)) { showToast('이미 있는 이름이에요'); return; }
        await DB.put('subGroups', { id: uid(), categoryId: catId, name, order: list.length });
      } else {
        const list = subItemsOfCategory(catId);
        if (list.find(s => s.name === name)) { showToast('이미 있는 항목이에요'); return; }
        await DB.put('subItems', { id: uid(), categoryId: catId, name, order: list.length });
      }
      await reloadData();
      showToast(`"${name}" 추가됐어요`);
      renderTxStepPick(sheet);
    });
  }
  // 새 대분류 추가 버튼 (항상 등록)
  sheet.querySelector('#txAddNewCat')?.addEventListener('click', () => {
    const prevType = catManageType;
    catManageType = State.formType;
    openCatEditSheet(null);
    catManageType = prevType;
  });
  // 새 대분류 버튼 (항상 등록)
  sheet.querySelector('#txAddNewCat')?.addEventListener('click', () => {
    const prevType = catManageType;
    catManageType = State.formType;
    openCatEditSheet(null);
    catManageType = prevType;
  });
  sheet.querySelectorAll('.typeswitch button').forEach(b => {
    b.addEventListener('click', () => {
      State.formType = b.dataset.type;
      State.formCategoryId = null;
      renderTxStepPick(sheet);
    });
  });
  sheet.querySelectorAll('[data-pick-cat]').forEach(b => {
    b.addEventListener('click', async () => {
      State.formCategoryId = b.dataset.pickCat;
      State.formPersonId = b.dataset.pickPerson || null;
      State.formSubGroupId = null;
      State.formAmounts = {};
      if (b.dataset.pickSubgroup === '__has_groups__') {
        // 중분류 선택 단계로
        State.formStep = 'pickGroup';
        renderTxSheet();
        return;
      }
      // 반복 등록된 항목이면 금액 자동 적용
      const tpl = await getRepeatTpl(State.formCategoryId, State.formPersonId);
      if (tpl) {
        tpl.lines.forEach(l => { State.formAmounts[l.subItemId] = l.amount; });
      }
      State.formStep = 'items';
      renderTxSheet();
    });
  });
}

/* ---- STEP 2: 중분류 선택 (subGroup이 있는 대분류) ---- */
function renderTxStepPickGroup(sheet) {
  const cat = catById(State.formCategoryId);
  // 명부에서 "가리기" 처리된 교인은 헌금 입력 시 이름 선택 목록에 나오지 않게 제외
  // (subGroup은 교인 등록 시 person과 동일한 id로 생성되므로 id로 매칭)
  const groups = subGroupsOfCategory(State.formCategoryId).filter(g => {
    const person = (State.persons || []).find(p => p.id === g.id);
    return !person || !person.hidden;
  });
  // subGroups(사람)가 있는 카테고리(예: 헌금)는 ungroupedItems 표시 안 함 — 공통 소분류이므로
  const ungroupedItems = groups.length > 0 ? [] : State.subItems.filter(s => s.categoryId === State.formCategoryId && !s.subGroupId);

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="txBack" style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:2px;">${ICONS.chevLeft}이전</button>
      <h3>${cat.icon} ${cat.name}</h3>
      <button id="txClose" class="sheet-close-btn">${ICONS.close}취소</button>
    </div>
    <div class="sheet-body">
      <div class="formrow">
        <label>이름 선택</label>
        <div class="catgrid">
          ${groups.map(g => `
            <button class="catchip" data-pick-group="${g.id}">
              <span class="ic" style="background:${hexToLight(cat.color)};">📂</span>
              <span>${escapeHTML(g.name)}</span>
            </button>
          `).join('')}
          ${ungroupedItems.map(s => `
            <button class="catchip" data-pick-group-item="${s.id}">
              <span class="ic" style="background:${hexToLight(cat.color)};">${cat.icon}</span>
              <span>${escapeHTML(s.name)}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <button id="txAddGroupBtn" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 0;">+ 중분류 추가</button>
        </div>
        <div id="txAddGroupForm" style="display:none;margin-top:2px;">
          <div style="display:flex;gap:6px;">
            <input type="text" id="txAddGroupName" placeholder="이름 입력 (예: 홍길동)" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
            <button id="txAddGroupSave" style="background:var(--primary);color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;">추가</button>
          </div>
        </div>
      </div>
    </div>
  `;
  sheet.querySelector('#txBack').addEventListener('click', () => {
    State.formStep = 'pick';
    State.formCategoryId = null;
    renderTxSheet();
  });
  sheet.querySelector('#txClose').addEventListener('click', () => {
    if (State.editingTx) {
      // 수정 모드에서 중분류 변경 중 취소 → items로 복귀
      State.formSubGroupId = State.editingTx.subGroupId || State.editingTx.personId || null;
      State.formAmounts = {};
      (State.editingTx.lines || []).forEach(l => { State.formAmounts[l.subItemId] = l.amount; });
      State.formStep = 'items';
      renderTxSheet();
    } else {
      closeTxSheet();
    }
  });

  // 중분류 추가 인라인 폼
  sheet.querySelector('#txAddGroupBtn').addEventListener('click', () => {
    const form = sheet.querySelector('#txAddGroupForm');
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (!visible) setTimeout(() => sheet.querySelector('#txAddGroupName').focus(), 50);
  });
  const doAddGroup = async () => {
    const input = sheet.querySelector('#txAddGroupName');
    const name = input.value.trim();
    if (!name) { showToast('이름을 입력해주세요'); return; }
    const catId = State.formCategoryId;
    const list = subGroupsOfCategory(catId);
    if (list.find(g => g.name === name)) { showToast('이미 있는 이름이에요'); return; }
    const newGroup = { id: uid(), categoryId: catId, name, order: list.length };
    await DB.put('subGroups', newGroup);
    // 기존 공통 소분류(헌금종류)를 새 중분류에도 자동 생성
    await reloadData();
    await seedDefaultSubItemsForGroup(newGroup.id, catId);
    await reloadData();
    showToast(`"${name}" 추가됐어요`);
    renderTxStepPickGroup(sheet);
  };
  sheet.querySelector('#txAddGroupSave').addEventListener('click', doAddGroup);
  sheet.querySelector('#txAddGroupName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddGroup();
  });

  sheet.querySelectorAll('[data-pick-group]').forEach(b => {
    b.addEventListener('click', async () => {
      State.formSubGroupId = b.dataset.pickGroup;
      State.formAmounts = {};
      State.formStep = 'items';
      renderTxSheet();
    });
  });
  // 중분류 없는 소분류 직접 선택
  sheet.querySelectorAll('[data-pick-group-item]').forEach(b => {
    b.addEventListener('click', async () => {
      State.formSubGroupId = null;
      const subId = b.dataset.pickGroupItem;
      State.formAmounts = { [subId]: 0 };
      State.formStep = 'items';
      renderTxSheet();
    });
  });
}

/* ---- STEP 3: 세부항목 다중 입력 ---- */
async function renderTxStepItems(sheet) {
  const editing = State.editingTx;
  const cat = catById(State.formCategoryId);
  // subGroupId 기반으로 표시 (persons 구조 폐기)
  const subGroup = State.formSubGroupId ? (State.subGroups||[]).find(g => g.id === State.formSubGroupId) : null;

  // 중분류(이름)가 선택된 경우:
  //   해당 subGroup 전용 소분류 있으면 그것만, 없으면 subGroupId 없는 공통 소분류 표시
  // 중분류 선택 안 된 경우: subGroupId 없는 소분류 전체
  const allCatItems = subItemsOfCategory(cat.id);
  let items;
  if (State.formSubGroupId) {
    // 중분류(이름) 선택됨: 해당 subGroup 전용 소분류 우선, 없으면 공통(subGroupId 없는 것)
    const dedicated = allCatItems.filter(s => s.subGroupId === State.formSubGroupId);
    const common    = allCatItems.filter(s => !s.subGroupId);
    items = sortItemsForEntry(dedicated.length > 0 ? dedicated : common);
  } else {
    // 중분류 없이 바로 온 경우: subGroupId 무관하게 전체 표시
    items = sortItemsForEntry(allCatItems);
  }

  // 수정 모드: 기존 거래의 lines에 있는 소분류가 목록에 없으면 추가 표시
  if (editing) {
    const existingIds = new Set(items.map(s => s.id));
    const missingItems = (editing.lines || [])
      .map(l => l.subItemId ? subItemById(l.subItemId) : null)
      .filter(s => s && !existingIds.has(s.id));
    if (missingItems.length > 0) {
      items = [...missingItems, ...items];
    }
  }

  const total = Object.values(State.formAmounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const tpl = await getRepeatTpl(State.formCategoryId, State.formPersonId);
  const hasTpl = !!tpl;

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head" style="flex-direction:column; align-items:stretch; gap:10px; padding-bottom:12px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        ${!editing ? `<button id="txBack" style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:2px;">${ICONS.chevLeft}이전</button>` : `<div style="width:40px;"></div>`}
        <div style="text-align:center;">
          ${editing ? `
            <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:2px;flex-wrap:wrap;">
              <button id="txChangeCat" style="font-size:14px;font-weight:800;color:var(--text-1);border-bottom:1px dashed var(--border);padding-bottom:1px;line-height:1.4;background:none;cursor:pointer;">
                ${cat.icon} ${escapeHTML(cat.name)}
              </button>
              ${subGroup ? `<span style="color:var(--text-3);font-size:13px;">›</span>
              <button id="txChangeGroup" style="font-size:13px;font-weight:700;color:var(--primary);border-bottom:1px dashed var(--primary);padding-bottom:1px;background:none;cursor:pointer;">
                ${escapeHTML(subGroup.name)}
              </button>` : ''}
            </div>
          ` : `<h3 style="line-height:1.3;">${cat.icon} ${subGroup ? escapeHTML(subGroup.name) : cat.name}</h3>`}
          <span id="txDateLabel" style="font-size:12px; color:var(--primary); font-weight:600; border-bottom:1px dashed var(--primary); padding-bottom:1px; cursor:pointer;">${dayLabel(State.formDate)}</span>
            <input type="date" id="txDateInput" value="${State.formDate}" style="width:0;height:0;opacity:0;position:absolute;">
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button id="txClose" class="sheet-close-btn">${ICONS.close}취소</button>
          <button id="txSave" style="color:var(--primary); font-weight:800; font-size:14.5px; white-space:nowrap;">${editing ? '수정 완료' : '저장'}</button>
        </div>
      </div>
      <!-- 반복 버튼 영역 -->
      <div style="display:flex; gap:8px;">
        ${hasTpl ? `
          <button id="txRepeatApply" style="flex:1; padding:8px 0; border-radius:10px; background:var(--primary); color:#fff; font-weight:700; font-size:13.5px;">🔄 반복 적용</button>
          <button id="txRepeatDel" style="padding:8px 12px; border-radius:10px; border:1.5px solid var(--expense); color:var(--expense); font-size:12px;">반복 해제</button>
        ` : `
          <button id="txRepeatSave" style="flex:1; padding:8px 0; border-radius:10px; border:1.5px solid var(--border); color:var(--text-2); font-size:13.5px;">🔄 반복 등록</button>
        `}
      </div>
      <div class="card" style="background:var(--bg); box-shadow:none; display:flex; justify-content:space-between; align-items:center; margin:0;">
        <span style="font-size:13.5px; color:var(--text-2); font-weight:600;">합계</span>
        <span class="tabular" style="font-size:19px; font-weight:800; color:${State.formType==='income'?'var(--primary)':'var(--expense)'};">${fmtMoney(total)}원</span>
      </div>
    </div>
    <div class="sheet-body">
      <div class="formrow">
        <label>세부항목별 금액 입력</label>
        <div id="itemsList" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:2px 8px;">
          ${items.filter(it => it.isPrimary !== false).map(it => `
            <div class="formrow" style="margin-bottom:4px; min-width:0;">
              <label style="font-weight:700; color:var(--text-1); margin-bottom:3px; display:block; font-size:14px;">${escapeHTML(it.name)}</label>
              <div class="amt-input-wrap item-amt-wrap" style="border-bottom-width:1px; padding-bottom:5px; gap:3px;">
                <input type="text" inputmode="numeric" class="item-amt-input" data-item="${it.id}" placeholder="0" style="font-size:14px; font-weight:400;" value="${State.formAmounts[it.id] != null ? fmtMoney(State.formAmounts[it.id]) : ''}">
                <span class="won" style="font-size:11px;">원</span>
              </div>
            </div>
          `).join('')}
        </div>
        ${items.filter(it => it.isPrimary === false).length > 0 ? `
        <div style="margin-top:6px;">
          <button id="toggleSecondary" style="font-size:12px;color:var(--text-2);background:none;border:none;padding:4px 0;cursor:pointer;">▶ 추가 항목 더보기 (${items.filter(it=>it.isPrimary===false).length}개)</button>
          <div id="secondaryItems" style="display:none;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px 8px;margin-top:4px;">
            ${items.filter(it => it.isPrimary === false).map(it => `
              <div class="formrow" style="margin-bottom:4px; min-width:0;">
                <label style="font-weight:700; color:var(--text-2); margin-bottom:3px; display:block; font-size:13px;">${escapeHTML(it.name)}</label>
                <div class="amt-input-wrap item-amt-wrap" style="border-bottom-width:1px; padding-bottom:5px; gap:3px;">
                  <input type="text" inputmode="numeric" class="item-amt-input" data-item="${it.id}" placeholder="0" style="font-size:14px; font-weight:400;" value="${State.formAmounts[it.id] != null ? fmtMoney(State.formAmounts[it.id]) : ''}">
                  <span class="won" style="font-size:11px;">원</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
        <div style="display:flex; gap:8px; margin-top:4px;">
          <input type="text" class="textinput" id="newSubItemName" placeholder="새 세부항목 추가" style="flex:1;">
          <button class="btn-secondary" id="addSubItemBtn" style="width:auto; padding:0 16px; margin-top:0; color:var(--primary); font-weight:700;">추가</button>
        </div>
        ${items.length === 0 ? `
          <div style="margin-top:8px;">
            <label style="font-weight:600;color:var(--text-1);margin-bottom:6px;display:block;font-size:13px;">
              ${subGroup ? escapeHTML(subGroup.name) : cat.name}
            </label>
            <div class="amt-input-wrap item-amt-wrap" style="border-bottom-width:1px;padding-bottom:5px;gap:3px;">
              <input type="text" inputmode="numeric" class="item-amt-input" data-item="__direct__" placeholder="0"
                style="font-size:18px;font-weight:700;"
                value="${State.formAmounts['__direct__'] != null ? fmtMoney(State.formAmounts['__direct__']) : ''}">
              <span class="won" style="font-size:13px;">원</span>
            </div>
          </div>` : ''}
      </div>
      <div class="formrow" style="margin-top:10px;">
        <label>비고</label>
        <input type="text" class="textinput" id="txMemoInput" placeholder="메모 (선택)" maxlength="100" value="${escapeHTML(State.formMemo || '')}">
      </div>
      ${editing ? `<button class="btn-secondary" id="txDelete" style="color:var(--expense);">삭제</button>` : ''}
    </div>
  `;

  sheet.querySelector('#txClose').addEventListener('click', closeTxSheet);

  // 수정 모드: 대분류 변경 → pick 단계
  sheet.querySelector('#txChangeCat')?.addEventListener('click', () => {
    State.formAmounts = {};
    State.formSubGroupId = null;
    State.formCategoryId = null;
    State.formStep = 'pick';
    renderTxSheet();
  });

  // 수정 모드: 중분류 변경 → pickGroup 단계
  sheet.querySelector('#txChangeGroup')?.addEventListener('click', () => {
    State.formAmounts = {};
    State.formSubGroupId = null;
    State.formStep = 'pickGroup';
    renderTxSheet();
  });

  sheet.querySelector('#txMemoInput').addEventListener('input', (e) => {
    State.formMemo = e.target.value;
  });
  // 반복 버튼
  const repeatApplyBtn = sheet.querySelector('#txRepeatApply');
  const repeatSaveBtn  = sheet.querySelector('#txRepeatSave');
  const repeatDelBtn   = sheet.querySelector('#txRepeatDel');
  if (repeatApplyBtn) {
    repeatApplyBtn.addEventListener('click', async () => {
      const tpl = await getRepeatTpl(State.formCategoryId, State.formPersonId);
      if (!tpl) return;
      State.formAmounts = {};
      tpl.lines.forEach(l => { State.formAmounts[l.subItemId] = l.amount; });
      await renderTxStepItems(sheet);
      showToast('반복 금액이 적용됐어요');
    });
  }
  if (repeatSaveBtn) {
    repeatSaveBtn.addEventListener('click', async () => {
      const lines = Object.entries(State.formAmounts)
        .filter(([, v]) => Number(v) > 0)
        .map(([subItemId, amount]) => ({ subItemId, amount: Number(amount) }));
      if (lines.length === 0) { showToast('금액을 먼저 입력해주세요'); return; }
      await saveRepeatTpl(State.formCategoryId, State.formPersonId, lines);
      showToast('🔄 반복 등록됐어요');
      await renderTxStepItems(sheet);
    });
  }
  if (repeatDelBtn) {
    repeatDelBtn.addEventListener('click', async () => {
      await deleteRepeatTpl(State.formCategoryId, State.formPersonId);
      showToast('반복 해제됐어요');
      await renderTxStepItems(sheet);
    });
  }
  const dateInput = sheet.querySelector('#txDateInput');
  const updateDate = (e) => {
    if (e.target.value && e.target.value !== State.formDate) {
      State.formDate = e.target.value;
      const label = sheet.querySelector('#txDateLabel');
      if (label) label.textContent = dayLabel(State.formDate);
      dateInput.value = State.formDate;
    }
  };
  dateInput.addEventListener('change', updateDate);
  dateInput.addEventListener('input', updateDate);

  // 날짜 레이블 클릭 → 날짜 선택 팝업
  sheet.querySelector('#txDateLabel')?.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;justify-content:center;';
    const cur = State.formDate || todayStr();
    overlay.innerHTML = `
      <div style="background:var(--card);border-radius:20px 20px 0 0;padding:20px 20px 40px;width:100%;max-width:480px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span style="font-size:15px;font-weight:700;">날짜 선택</span>
          <button id="datePickClose" style="font-size:20px;background:none;border:none;color:var(--text-2);">✕</button>
        </div>
        <input type="date" id="datePickInput" value="${cur}"
          style="width:100%;padding:12px;font-size:17px;border:1.5px solid var(--border);border-radius:12px;box-sizing:border-box;background:var(--surface-1);color:var(--text-1);">
        <button id="datePickConfirm" style="width:100%;margin-top:14px;padding:14px;background:var(--primary);color:#fff;font-size:16px;font-weight:700;border:none;border-radius:14px;">확인</button>
      </div>`;
    document.body.appendChild(overlay);
    const inp = overlay.querySelector('#datePickInput');
    setTimeout(() => inp.focus(), 100);
    overlay.querySelector('#datePickClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#datePickConfirm').addEventListener('click', () => {
      if (inp.value) {
        State.formDate = inp.value;
        const label = sheet.querySelector('#txDateLabel');
        if (label) label.textContent = dayLabel(State.formDate);
        if (dateInput) dateInput.value = State.formDate;
      }
      overlay.remove();
    });
  });
  const backBtn = sheet.querySelector('#txBack');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // 중분류에서 왔으면 중분류로, 아니면 pick으로
      State.formStep = State.formSubGroupId ? 'pickGroup' : 'pick';
      renderTxSheet();
    });
  }

  // 추가 항목 더보기 토글
  const toggleBtn = sheet.querySelector('#toggleSecondary');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sec = sheet.querySelector('#secondaryItems');
      const open = sec.style.display !== 'grid';
      sec.style.display = open ? 'grid' : 'none';
      toggleBtn.textContent = open
        ? `▼ 추가 항목 접기`
        : `▶ 추가 항목 더보기 (${sec.querySelectorAll('.item-amt-input').length}개)`;
      // 금액 입력된 항목이 있으면 자동 펼침
    });
    // 이미 값 입력된 secondary 항목 있으면 자동 펼침
    const hasFilled = items.filter(it => it.isPrimary === false).some(it => State.formAmounts[it.id]);
    if (hasFilled) {
      sheet.querySelector('#secondaryItems').style.display = 'grid';
      toggleBtn.textContent = '▼ 추가 항목 접기';
    }
  }

  sheet.querySelectorAll('.item-amt-input').forEach(input => {
    attachMoneyInputFormatter(input, (numVal) => {
      if (numVal === null) delete State.formAmounts[input.dataset.item];
      else State.formAmounts[input.dataset.item] = numVal;
      const totalNow = Object.values(State.formAmounts).reduce((s, vv) => s + (Number(vv) || 0), 0);
      const totalEl = sheet.querySelector('.card .tabular');
      if (totalEl) totalEl.textContent = fmtMoney(totalNow) + '원';
    }, 9);
    const wrap = input.closest('.amt-input-wrap');
    input.addEventListener('focus', () => wrap.classList.add('focus'));
    input.addEventListener('blur', () => wrap.classList.remove('focus'));
  });
  sheet.querySelector('#addSubItemBtn').addEventListener('click', () => addSubItemInline(sheet, cat.id));
  sheet.querySelector('#newSubItemName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSubItemInline(sheet, cat.id);
  });

  sheet.querySelector('#txSave').addEventListener('click', saveTx);
  if (editing) sheet.querySelector('#txDelete').addEventListener('click', deleteTx);
}

async function addSubItemInline(sheet, categoryId) {
  const input = sheet.querySelector('#newSubItemName');
  const name = input.value.trim();
  if (!name) { showToast('세부항목 이름을 입력해주세요'); return; }
  const existing = subItemsOfCategory(categoryId).find(s => s.name === name);
  if (existing) { showToast('이미 있는 항목이에요'); return; }
  const subItem = { id: uid(), categoryId, name, order: subItemsOfCategory(categoryId).length };
  await DB.put('subItems', subItem);
  await reloadData();
  renderTxSheet();
}

async function saveTx() {
  const date = State.formDate;
  const memo = (State.formMemo || '').trim();
  const cat = catById(State.formCategoryId);

  const lines = Object.entries(State.formAmounts)
    .filter(([, amt]) => Number(amt) > 0)
    .map(([subItemId, amt]) => {
      const realId = subItemId === '__direct__' ? null : subItemId;
      const si = realId ? subItemById(realId) : null;
      return {
        subItemId: realId,
        amount: Number(amt),
        subItemName: si ? si.name : null, // 방식 B: 저장 시점의 세부항목 이름을 함께 기록
      };
    });

  if (lines.length === 0) { showToast('금액을 1개 이상 입력해주세요'); return; }
  // usePersonLevel 구조 사용 안 함 — subGroupId 필수 여부는 subGroups 여부로 판단
  if (!date) { showToast('날짜를 선택해주세요'); return; }

  const total = lines.reduce((s, l) => s + l.amount, 0);

  // 방식 B: 저장 시점의 대분류/중분류(하위항목) 이름을 거래에 함께 저장 (비정규화)
  const sg = State.formSubGroupId ? (State.subGroups || []).find(g => g.id === State.formSubGroupId) : null;

  const record = {
    id: State.editingTx ? State.editingTx.id : uid(),
    type: State.formType,
    categoryId: State.formCategoryId,
    subGroupId: State.formSubGroupId || null,
    lines,
    amount: total,
    date,
    memo,
    accountId: State.formAccountId || null,
    createdAt: State.editingTx ? State.editingTx.createdAt : Date.now(),
    categoryName: cat ? cat.name : null,
    categoryIcon: cat ? cat.icon : null,
    categoryColor: cat ? cat.color : null,
    subGroupName: sg ? sg.name : null,
  };
  await DB.put('transactions', record);
  await reloadData();
  closeTxSheet();
  renderCurrentPage();
  showToast(State.editingTx ? '수정되었습니다' : '저장되었습니다');
  if (USE_FIREBASE) syncToFirebase().catch(e => console.error('sync error:', e));
}

async function deleteTx() {
  if (!confirm('이 거래를 삭제할까요?')) return;
  await DB.del('transactions', State.editingTx.id);
  await reloadData();
  closeTxSheet();
  renderCurrentPage();
  showToast('삭제되었습니다');
  if (USE_FIREBASE) syncToFirebase().catch(e => console.error('sync error:', e));
}

/* =========================================================
   DAY DETAIL SHEET — 날짜 탭 시 그 날의 거래 목록 + 추가
   ========================================================= */
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function openDayDetail(dateStr) {
  State.dayDetailDate = dateStr;
  renderDayDetail(dateStr);
  openSheet('dayDetailSheet');
}

function renderDayDetail(dateStr) {
  const sheet = document.getElementById('dayDetailSheet');

  // 계좌 목록 및 현재 선택 계좌 결정
  const accounts = State.linkedAccounts || [];
  const defaultAcct = accounts.find(a => a.isDefault) || accounts[0] || null;
  // selectedAccountId가 유효한 계좌가 아닐 때만 대표계정으로 초기화
  if (!State.selectedAccountId || !accounts.find(a => a.id === State.selectedAccountId)) {
    State.selectedAccountId = defaultAcct ? defaultAcct.id : null;
  }
  const selAcct = accounts.find(a => a.id === State.selectedAccountId) || defaultAcct || null;

  // 선택된 계좌에 해당하는 거래만 필터링
  // 대표계정(재정계정): accountId가 null이거나 대표계정 id인 거래
  // 다른 계정: accountId가 해당 계정 id인 거래
  const isDefault = selAcct && selAcct.isDefault;
  const list = State.transactions
    .filter(t => {
      if (t.date !== dateStr) return false;
      if (isDefault) return !t.accountId || t.accountId === selAcct.id;
      return t.accountId === (selAcct ? selAcct.id : null);
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
      return txDisplayTitle(a).localeCompare(txDisplayTitle(b), 'ko');
    });

  let income = 0, expense = 0;
  for (const t of list) { if (t.type === 'income') income += t.amount; else expense += t.amount; }

  const acctLabel = selAcct ? selAcct.name : '계좌 없음';

  const acctSelectorHTML = accounts.length === 0
    ? `<div class="acct-empty">설정 &gt; 연결계좌 관리에서 계좌를 먼저 추가해주세요</div>`
    : `<div class="acct-selector">
        <div class="acct-current" id="ddAcctBtn">
          <span id="ddAcctLabel">${acctLabel}</span>
          <span class="acct-arrow">▼</span>
        </div>
        <div class="acct-list" id="ddAcctList">
          ${accounts.map(a => `<div class="acct-item${selAcct&&a.id===selAcct.id?' active':''}" data-id="${a.id}">${escapeHTML(a.name)}</div>`).join('')}
        </div>
      </div>`;

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="ddClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <button id="ddDateLabel" style="font-size:17px;font-weight:700;background:none;border:none;border-bottom:1.5px dashed var(--primary);color:var(--text-1);padding:2px 4px;cursor:pointer;">${dayLabel(dateStr)}</button>
      <button class="sheet-close-btn" style="visibility:hidden;">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="daydetail-summary">
        <span>수입 <b class="income tabular">${fmtMoney(income)}원</b></span>
        <span>지출 <b class="expense tabular">${fmtMoney(expense)}원</b></span>
      </div>

      ${acctSelectorHTML}

      <div class="day-add-row">
        <button class="day-add-btn income" id="ddAddIncome">${ICONS.plus} 수입 추가</button>
        <button class="day-add-btn expense" id="ddAddExpense">${ICONS.plus} 지출 추가</button>
      </div>

      <div class="card" style="padding:4px 16px;">
        ${list.length === 0 ? emptyStateHTML('이 날의 내역이 없어요', '위 버튼으로 수입이나 지출을 추가해보세요') : list.map(txItemHTML).join('')}
      </div>
    </div>
  `;

  sheet.querySelector('#ddClose').addEventListener('click', closeAllSheets);

  // 날짜 버튼 탭 → 인라인 미니 달력
  sheet.querySelector('#ddDateLabel').addEventListener('click', () => {
    const existing = document.getElementById('ddCalPop');
    if (existing) { existing.remove(); return; }
    const [y, m, d] = dateStr.split('-').map(Number);
    const pop = document.createElement('div');
    pop.id = 'ddCalPop';
    pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';

    const renderCal = (cy, cm) => {
      const first = new Date(cy, cm - 1, 1).getDay();
      const days = new Date(cy, cm, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += `<div></div>`;
      for (let i = 1; i <= days; i++) {
        const ds = `${cy}-${String(cm).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isToday = ds === todayStr();
        const isSel = ds === dateStr;
        cells += `<button data-date="${ds}" style="padding:6px 0;border:none;border-radius:50%;width:34px;height:34px;font-size:14px;font-weight:${isSel?'800':'400'};background:${isSel?'var(--primary)':isToday?'var(--surface-2)':'none'};color:${isSel?'#fff':'var(--text-1)'};cursor:pointer;">${i}</button>`;
      }
      pop.innerHTML = `
        <div style="background:var(--card);border-radius:20px;padding:16px;width:320px;max-width:90vw;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <button id="calPrev" style="font-size:20px;background:none;border:none;padding:4px 10px;color:var(--text-1);">‹</button>
            <span style="font-weight:700;font-size:15px;">${cy}년 ${cm}월</span>
            <button id="calNext" style="font-size:20px;background:none;border:none;padding:4px 10px;color:var(--text-1);">›</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;margin-bottom:6px;">
            ${['일','월','화','수','목','금','토'].map(x=>`<div style="font-size:11px;color:var(--text-2);padding:4px 0;">${x}</div>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;">
            ${cells}
          </div>
        </div>`;
      pop.querySelector('#calPrev').addEventListener('click', () => { cm--; if(cm<1){cm=12;cy--;} renderCal(cy,cm); });
      pop.querySelector('#calNext').addEventListener('click', () => { cm++; if(cm>12){cm=1;cy++;} renderCal(cy,cm); });
      pop.querySelectorAll('[data-date]').forEach(btn => {
        btn.addEventListener('click', () => { pop.remove(); openDayDetail(btn.dataset.date); });
      });
      pop.onclick = e => { if (e.target === pop) pop.remove(); };
    };
    renderCal(y, m);
    document.body.appendChild(pop);
  });

  // 계정선택 토글 — 변경 시 목록 즉시 갱신
  if (accounts.length > 0) {
    const acctBtn  = sheet.querySelector('#ddAcctBtn');
    const acctList = sheet.querySelector('#ddAcctList');
    acctBtn.addEventListener('click', () => {
      const isOpen = acctList.classList.toggle('open');
      acctBtn.classList.toggle('open', isOpen);
    });
    acctList.querySelectorAll('.acct-item').forEach(el => {
      el.addEventListener('click', () => {
        State.selectedAccountId = el.dataset.id;
        // 계정 바뀌면 목록 전체 다시 렌더링
        renderDayDetail(dateStr);
      });
    });
  }

  sheet.querySelector('#ddAddIncome').addEventListener('click', () => openTxSheet(null, dateStr, 'income', State.selectedAccountId));
  sheet.querySelector('#ddAddExpense').addEventListener('click', () => openTxSheet(null, dateStr, 'expense', State.selectedAccountId));
  sheet.querySelectorAll('.tx-item').forEach(el => {
    el.addEventListener('click', () => openTxSheet(el.dataset.id, dateStr));
  });
}

/* =========================================================
   CAT STAT DETAIL SHEET — 통계 탭에서 항목(인물/대분류) 클릭 시
   해당 기간의 해당 항목 거래 내역을 일자별로 나열
   ========================================================= */
function openCatStatDetail(categoryId) {
  State.catStatDetailId = categoryId;
  renderCatStatDetail(categoryId);
  openSheet('catStatDetailSheet');
}

function renderCatStatDetail(categoryId) {
  const sheet = document.getElementById('catStatDetailSheet');
  const range = statsPeriodRange();
  const cat = catFallbackInfo(categoryId);
  const list = txInPeriod(range.start, range.end)
    .filter(t => t.type === State.statsType && t.categoryId === categoryId)
    .sort((a,b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const total = list.reduce((s,t) => s + t.amount, 0);

  // 헌금 카테고리이면 개인별 × 헌금종류 피벗 표
  const isHeon = cat.name === '헌금' && State.statsType === 'income';

  let bodyHTML = '';

  if (isHeon) {
    // ── 피벗 집계 ──────────────────────────────────────
    const pivot  = {};   // { personName: { subItemName: amount } }
    const colSet = new Set();

    for (const t of list) {
      // 인물 이름: subGroupId → persons
      const sgId  = t.subGroupId || t.personId;
      const pName = sgId
        ? ((State.persons||[]).find(p=>p.id===sgId)||{}).name || '(이름없음)'
        : '(이름없음)';

      if (!pivot[pName]) pivot[pName] = {};
      for (const l of (t.lines||[])) {
        const si    = subItemById(l.subItemId);
        const sName = si ? subItemDisplayName('income', '헌금', si.name) : '(기타)';
        pivot[pName][sName] = (pivot[pName][sName] || 0) + l.amount;
        colSet.add(sName);
      }
    }

    const rows = Object.keys(pivot).sort((a,b) => a.localeCompare(b,'ko'));
    // 헌금종류 열 순서: TX_ENTRY_ITEM_ORDER 기준, 나머지는 뒤에
    const orderedCols = [
      ...TX_ENTRY_ITEM_ORDER.filter(n => colSet.has(n)),
      ...[...colSet].filter(n => !TX_ENTRY_ITEM_ORDER.includes(n)).sort()
    ];

    if (rows.length === 0) {
      bodyHTML = `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', '선택한 기간의 헌금 내역이 없습니다')}</div>`;
    } else {
      // 헤더
      const thStyle = 'padding:6px 4px;font-size:11px;font-weight:700;color:#fff;background:var(--primary);text-align:right;white-space:nowrap;border:1px solid rgba(255,255,255,0.2);';
      const thStyleL = thStyle + 'text-align:left;';
      const tdStyle  = 'padding:5px 4px;font-size:11.5px;text-align:right;border:1px solid var(--border);white-space:nowrap;';
      const tdStyleL = tdStyle + 'text-align:left;font-weight:600;';
      const tdSum    = tdStyle + 'font-weight:700;background:var(--bg-2);';
      const trSum    = 'background:var(--bg-2);';

      const headerCols = orderedCols.map(c=>`<th style="${thStyle}">${escapeHTML(c)}</th>`).join('');
      const colTotals  = orderedCols.map(c => rows.reduce((s,r) => s+(pivot[r][c]||0), 0));
      const grandTotal = colTotals.reduce((s,v)=>s+v, 0);

      const dataRows = rows.map(name => {
        const rowTotal = orderedCols.reduce((s,c) => s+(pivot[name][c]||0), 0);
        const cells = orderedCols.map(c => {
          const v = pivot[name][c] || 0;
          return `<td style="${tdStyle}">${v ? fmtMoney(v) : ''}</td>`;
        }).join('');
        return `<tr>
          <td style="${tdStyleL}">${escapeHTML(name)}</td>
          ${cells}
          <td style="${tdSum}">${fmtMoney(rowTotal)}</td>
        </tr>`;
      }).join('');

      const sumRow = `<tr style="${trSum}">
        <td style="${tdStyleL}">합계</td>
        ${colTotals.map(v=>`<td style="${tdSum}">${fmtMoney(v)}</td>`).join('')}
        <td style="${tdSum}">${fmtMoney(grandTotal)}</td>
      </tr>`;

      bodyHTML = `
        <div style="overflow-x:auto; margin-bottom:14px;">
          <table style="border-collapse:collapse; width:100%; min-width:max-content; font-size:12px;">
            <thead>
              <tr>
                <th style="${thStyleL}">이름</th>
                ${headerCols}
                <th style="${thStyle}">합계</th>
              </tr>
            </thead>
            <tbody>
              ${dataRows}
              ${sumRow}
            </tbody>
          </table>
        </div>
      `;
    }
  } else {
    // ── 기존: 날짜별 목록 ──────────────────────────────
    const byDate = {};
    for (const t of list) {
      (byDate[t.date] = byDate[t.date] || []).push(t);
    }
    const dates = Object.keys(byDate).sort();
    bodyHTML = dates.length === 0
      ? `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', '선택한 기간의 거래 내역이 없습니다')}</div>`
      : dates.map(d => `
          <div class="section-title">${dayLabel(d)}</div>
          <div class="card" style="padding:4px 16px; margin-bottom:14px;">
            ${byDate[d].map(txItemHTML).join('')}
          </div>
        `).join('');
  }

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="csdClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>${cat.icon} ${escapeHTML(cat.name)}</h3>
      <div style="display:flex;gap:6px;">
        ${isHeon ? `<button id="csdExcel" style="font-size:13px;color:#217346;font-weight:700;padding:6px 10px;border-radius:8px;background:#E8F5E9;">📥 엑셀</button>` : ''}
        <button id="csdPrint" style="font-size:13px;color:var(--primary);font-weight:700;padding:6px 10px;border-radius:8px;background:var(--primary-light);">🖨️ 인쇄</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="daydetail-summary">
        <span>${range.label}</span>
        <b class="tabular ${State.statsType}">${fmtMoney(total)}원</b>
      </div>
      ${bodyHTML}
    </div>
  `;

  sheet.querySelector('#csdClose').addEventListener('click', closeAllSheets);

  // 인쇄
  sheet.querySelector('#csdPrint').addEventListener('click', () => {
    printCatStatDetail(cat, range, list, total, isHeon);
  });

  // 엑셀 (헌금 피벗만)
  if (isHeon) {
    sheet.querySelector('#csdExcel').addEventListener('click', () => {
      exportCatStatDetailToExcel(cat, range, list, total);
    });
  }

  if (!isHeon) {
    sheet.querySelectorAll('.tx-item').forEach(el => {
      el.addEventListener('click', () => openTxSheet(el.dataset.id));
    });
  }
}

// ── 헌금 상세 인쇄 ──
function printCatStatDetail(cat, range, list, total, isHeon) {
  const pageHeader = `
    <div class="print-title">${cat.icon} ${escapeHTML(cat.name)}</div>
    <div class="print-period">${range.label}</div>
    <div class="print-summary">
      <div class="print-summary-item">
        <div class="print-summary-label">합계</div>
        <div class="print-summary-value income">${total.toLocaleString('ko-KR')}원</div>
      </div>
    </div>`;

  // ── 공통 테이블 스타일 ──
  const TS = 'border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;';
  const TH = (txt, right=false, w='') =>
    `<th style="padding:2.5pt 3pt;border:0.5pt solid #3a6fa0;font-size:7.5pt;background:#1F4E79;color:#fff;text-align:${right?'right':'left'};${w?'width:'+w+';':''}-webkit-print-color-adjust:exact;print-color-adjust:exact;">${txt}</th>`;
  const TD = (txt, opts={}) => {
    const {right=false,bold=false,bg=''} = opts;
    return `<td style="padding:2pt 3pt;border:0.5pt solid #aaa;font-size:7.5pt;text-align:${right?'right':'left'};font-weight:${bold?'700':'400'};${bg?'background:'+bg+';-webkit-print-color-adjust:exact;print-color-adjust:exact;':''}">${txt}</td>`;
  };

  // ── 페이지 분할 헬퍼: rows 배열을 ROWS_PER_PAGE씩 잘라 페이지 HTML 반환 ──
  const makePages = (rowsPerPage, headerHTML, makeRowHTML, rows, footerRow='') => {
    const pages = [];
    for (let i=0; i<rows.length; i+=rowsPerPage) {
      const chunk = rows.slice(i, i+rowsPerPage);
      const isLast = i+rowsPerPage >= rows.length;
      pages.push(`<div class="print-page">
        <div class="page-inner">
        ${i===0 ? pageHeader : ''}
        <table style="${TS}">
          <thead>${headerHTML}</thead>
          <tbody>${chunk.map(makeRowHTML).join('')}</tbody>
          ${isLast && footerRow ? `<tfoot>${footerRow}</tfoot>` : ''}
        </table>
        </div>
      </div>`);
    }
    return pages.join('');
  };

  let pagesHTML = '';

  if (isHeon) {
    // 피벗 집계
    const pivot = {}, colSet = new Set();
    for (const t of list) {
      const sgId = t.subGroupId || t.personId;
      const pName = sgId ? ((State.persons||[]).find(p=>p.id===sgId)||{}).name||'(이름없음)' : '(이름없음)';
      if (!pivot[pName]) pivot[pName] = {};
      for (const l of (t.lines||[])) {
        const si = subItemById(l.subItemId);
        const sName = si ? subItemDisplayName('income','헌금',si.name) : '(기타)';
        pivot[pName][sName] = (pivot[pName][sName]||0) + l.amount;
        colSet.add(sName);
      }
    }
    const rows = Object.keys(pivot).sort((a,b)=>a.localeCompare(b,'ko'));
    const orderedCols = [...TX_ENTRY_ITEM_ORDER.filter(n=>colSet.has(n)), ...[...colSet].filter(n=>!TX_ENTRY_ITEM_ORDER.includes(n)).sort()];
    const colTotals = orderedCols.map(c=>rows.reduce((s,r)=>s+(pivot[r][c]||0),0));
    const grandTotal = colTotals.reduce((s,v)=>s+v,0);

    // 열 수에 따라 글씨 크기 조정
    const fontSize = orderedCols.length > 8 ? '6pt' : '7pt';
    const nameW = orderedCols.length > 8 ? '12%' : '14%';
    const totalW = '10%';
    const midPct = Math.floor((100 - parseInt(nameW) - parseInt(totalW)) / Math.max(orderedCols.length,1));

    const colgroup = `<colgroup>
      <col style="width:${nameW}">
      ${orderedCols.map(()=>`<col style="width:${midPct}%">`).join('')}
      <col style="width:${totalW}">
    </colgroup>`;

    const headerRow = `<tr>
      ${TH('이름', false, nameW)}
      ${orderedCols.map(c=>TH(escapeHTML(c), true)).join('')}
      ${TH('합계', true, totalW)}
    </tr>`;

    const footerRow = `<tr>
      ${TD('합계', {bold:true, bg:'#E8F0FE'})}
      ${colTotals.map(v=>TD(v?v.toLocaleString('ko-KR'):'', {right:true, bold:true, bg:'#E8F0FE'})).join('')}
      ${TD(grandTotal.toLocaleString('ko-KR'), {right:true, bold:true, bg:'#E8F0FE'})}
    </tr>`;

    // 페이지 분할 없이 전체를 한 페이지로 출력 (iOS 자동 페이지 분리에 맡김)
    const ROWS_1ST = rows.length, ROWS_REST = 45;
    const pages = [];
    let i = 0;
    while (i < rows.length) {
      const rowsPerPage = pages.length === 0 ? ROWS_1ST : ROWS_REST;
      const chunk = rows.slice(i, i + rowsPerPage);
      const isLast = i + rowsPerPage >= rows.length;
      const makeRow = name => {
        const rowTotal = orderedCols.reduce((s,c)=>s+(pivot[name][c]||0),0);
        return `<tr>
          ${TD(escapeHTML(name), {bold:true})}
          ${orderedCols.map(c=>{const v=pivot[name][c]||0; return TD(v?v.toLocaleString('ko-KR'):'',{right:true});}).join('')}
          ${TD(rowTotal.toLocaleString('ko-KR'),{right:true,bold:true})}
        </tr>`;
      };
      pages.push(`<div class="print-page">
        <div class="page-inner">
        ${pages.length === 0 ? pageHeader : ''}
        <table style="${TS.replace('font-size:7pt','font-size:'+fontSize)}">
          ${colgroup}
          <thead>${headerRow}</thead>
          <tbody>${chunk.map(makeRow).join('')}</tbody>
          ${isLast ? `<tfoot>${footerRow}</tfoot>` : ''}
        </table>
        </div>
      </div>`);
      i += rowsPerPage;
    }
    pagesHTML = pages.join('');

  } else {
    // 날짜별 목록 (페이지당 40행)
    const sortedList = list.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const headerRow = `<tr>
      ${TH('날짜', false, '22%')}${TH('내용', false)}${TH('금액', true, '25%')}
    </tr>`;
    const footerRow = `<tr>
      ${TD('합계',{bold:true,bg:'#eee'})}
      ${TD('',{bg:'#eee'})}
      ${TD(total.toLocaleString('ko-KR'),{right:true,bold:true,bg:'#eee'})}
    </tr>`;
    const makeRow = t => `<tr>
      ${TD(t.date)}${TD(escapeHTML(txDisplayTitle(t)))}${TD(t.amount.toLocaleString('ko-KR'),{right:true,bold:true})}
    </tr>`;
    pagesHTML = makePages(40, headerRow, makeRow, sortedList, footerRow);
  }

  doPrint(pagesHTML || `<div class="print-page">${pageHeader}<p>내역이 없습니다.</p></div>`);
}

// ── 헌금 피벗 엑셀 내보내기 ──
function exportCatStatDetailToExcel(cat, range, list, total) {
  exportPivotToExcel(); // 기존 함수 재사용
}

/* =========================================================
   SUB STAT DETAIL SHEET — 통계 [내용] 탭에서 집계 항목(헌금종류/대분류·소분류)
   클릭 시 해당 기간의 해당 항목 내역을 일자별로 나열
   ========================================================= */
function openSubStatDetail(key) {
  State.subStatDetailKey = key;
  renderSubStatDetail(key);
  openSheet('subStatDetailSheet');
}

function renderSubStatDetail(key) {
  const sheet = document.getElementById('subStatDetailSheet');
  const range = statsPeriodRange();
  const isIncome = State.statsType === 'income';
  const allTx  = txInPeriod(range.start, range.end);
  const detailTx = allTx.filter(t => t.type === State.statsType);
  const aggMap = buildStatsAggMap(detailTx, isIncome);
  const agg = aggMap[key] || { label: '내역', amount: 0, count: 0, entries: [] };

  const entries = agg.entries.slice().sort((a,b) => a.date.localeCompare(b.date));

  // 날짜별 그룹화
  const byDate = {};
  for (const e of entries) {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  }
  const dates = Object.keys(byDate).sort();

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="ssdClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>${escapeHTML(agg.label)}</h3>
      <button class="sheet-close-btn" style="visibility:hidden;">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="daydetail-summary">
        <span>${range.label}</span>
        <b class="tabular ${isIncome ? 'income' : 'expense'}">${fmtMoney(agg.amount)}원</b>
      </div>

      ${dates.length === 0
        ? `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', '선택한 기간의 거래 내역이 없습니다')}</div>`
        : dates.map(d => `
            <div class="section-title">${dayLabel(d)}</div>
            <div class="card" style="padding:0 16px; margin-bottom:14px;">
              ${byDate[d].map(e => {
                const srcTx = State.transactions.find(x => x.id === e.txId);
                const cat = srcTx ? txCatInfo(srcTx) : catFallbackInfo(e.categoryId);
                // 수입(헌금)이면 중분류(사람 이름) 표시, 지출이면 카테고리 이름
                let rowLabel;
                if (isIncome && e.subGroupId) {
                  const sgName = srcTx ? txSubGroupName(srcTx) : null;
                  const sg = sgName ? { name: sgName } : (State.subGroups||[]).find(g=>g.id===e.subGroupId);
                  rowLabel = sg ? sg.name : (cat.icon ? cat.icon+' '+cat.name : cat.name);
                } else {
                  rowLabel = (cat.icon ? cat.icon+' ' : '') + cat.name;
                }
                return `
                  <div class="stats-agg-row tx-item" data-id="${e.txId}" style="cursor:pointer;">
                    <div class="stats-agg-label">${escapeHTML(rowLabel)}</div>
                    <div class="stats-agg-amt tabular ${isIncome ? 'income' : 'expense'}">${fmtMoney(e.amount)}원</div>
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')
      }
    </div>
  `;

  sheet.querySelector('#ssdClose').addEventListener('click', closeAllSheets);
  sheet.querySelectorAll('.tx-item').forEach(el => {
    el.addEventListener('click', () => openTxSheet(el.dataset.id));
  });
}

// [이자] 탭: 계정별 이자 상세 시트
function openInterestDetail(key) {
  State.interestDetailKey = key;
  renderInterestDetail(key);
  openSheet('subStatDetailSheet');
}

function renderInterestDetail(key) {
  const sheet = document.getElementById('subStatDetailSheet');
  const range = statsPeriodRange();
  const aggMap = buildInterestAggMap(range);
  const agg = aggMap[key] || { label: '내역', amount: 0, count: 0, entries: [] };

  const entries = agg.entries.slice().sort((a,b) => a.date.localeCompare(b.date));

  // 날짜별 그룹화
  const byDate = {};
  for (const e of entries) {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  }
  const dates = Object.keys(byDate).sort();

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="ssdClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>🏦 ${escapeHTML(agg.label)}</h3>
      <button class="sheet-close-btn" style="visibility:hidden;">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="daydetail-summary">
        <span>${range.label}</span>
        <b class="tabular income">${fmtMoney(agg.amount)}원</b>
      </div>

      ${dates.length === 0
        ? `<div class="card" style="padding:6px 16px;">${emptyStateHTML('내역이 없어요', '선택한 기간의 이자 내역이 없습니다')}</div>`
        : dates.map(d => `
            <div class="section-title">${dayLabel(d)}</div>
            <div class="card" style="padding:0 16px; margin-bottom:14px;">
              ${byDate[d].map(e => `
                <div class="stats-agg-row tx-item" data-id="${e.txId}" style="cursor:pointer;">
                  <div class="stats-agg-label">${escapeHTML(e.subName)}</div>
                  <div class="stats-agg-amt tabular income">${fmtMoney(e.amount)}원</div>
                </div>
              `).join('')}
            </div>
          `).join('')
      }
    </div>
  `;

  sheet.querySelector('#ssdClose').addEventListener('click', closeAllSheets);
  sheet.querySelectorAll('.tx-item').forEach(el => {
    el.addEventListener('click', () => openTxSheet(el.dataset.id));
  });
}

/* =========================================================
   CATEGORY MANAGE SHEET (목록)
   ========================================================= */
let catManageType = 'expense';
let catManageExpanded = new Set();
let catManageLevel = 1;      // 1:대분류, 2:중분류, 3:소분류
let catManageSelCatId = null; // 선택된 대분류 id
/* =========================================================
   LINKED ACCOUNTS SHEET — 설정 > 연결계좌 관리
   ========================================================= */
function openLinkedAccountsSheet() {
  renderLinkedAccountsSheet();
  openSheet('linkedAccountsSheet');
}

function renderLinkedAccountsSheet() {
  const sheet = document.getElementById('linkedAccountsSheet');
  const accounts = State.linkedAccounts || [];

  const normalAccts  = accounts.filter(a => a.isDefault || (!a.isDefault && (!a.accountKind || a.accountKind === 'normal')));
  const depositAccts = accounts.filter(a => !a.isDefault && a.accountKind === 'deposit');

  const normalListHTML = normalAccts.length === 0
    ? `<div style="text-align:center;color:var(--text-3);padding:20px 0;font-size:13px;">없음</div>`
    : normalAccts.map(a => laItemHTML(a)).join('');

  const depositListHTML = depositAccts.length === 0
    ? `<div style="text-align:center;color:var(--text-3);padding:20px 0;font-size:13px;">없음</div>`
    : depositAccts.map(a => laItemHTML(a)).join('');

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="laClose" class="sheet-close-btn">${ICONS.close}닫기</button>
      <h3>연결계좌 관리</h3>
      <button class="sheet-close-btn" style="visibility:hidden;">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="la-split-wrap">
        <div class="la-split-col">
          <div class="la-split-header">일반계좌</div>
          <div class="la-list" id="laNormalList">${normalListHTML}</div>
          <button class="la-add-btn la-add-small" data-kind="normal">${ICONS.plus} 일반계좌 추가</button>
        </div>
        <div class="la-split-divider"></div>
        <div class="la-split-col">
          <div class="la-split-header">정기계정</div>
          <div class="la-list" id="laDepositList">${depositListHTML}</div>
          <button class="la-add-btn la-add-small" data-kind="deposit">${ICONS.plus} 정기계정 추가</button>
        </div>
      </div>
    </div>
  `;

  sheet.querySelector('#laClose').addEventListener('click', () => closeSheet('linkedAccountsSheet'));

  sheet.querySelectorAll('.la-add-small').forEach(btn => {
    btn.addEventListener('click', () => { if (!getIsAdmin()) { showToast('🔒 입력 모드에서만 사용 가능합니다'); return; } openLinkedAccountEditSheet(null, btn.dataset.kind); });
  });

  sheet.querySelectorAll('.la-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const acct = (State.linkedAccounts||[]).find(a=>a.id===id);
      if (acct) openLinkedAccountEditSheet(acct, acct.accountKind || 'normal');
    });
  });
  sheet.querySelectorAll('.la-del-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (!confirm('이 계좌를 삭제할까요?')) return;
      await DB.del('linkedAccounts', id);
      await reloadData();
      renderLinkedAccountsSheet();
    });
  });
}

function laItemHTML(a) {
  const carry = a.carryover ? `이월 ${Number(a.carryover).toLocaleString('ko-KR')}원` : '이월 없음';
  const badge = a.isDefault ? `<span class="la-default-badge">대표</span>` : '';
  return `
    <div class="la-item" data-id="${a.id}">
      <div class="la-item-info">
        <div class="la-item-name">${escapeHTML(a.name)}${badge}</div>
        <div class="la-item-sub">${carry}</div>
      </div>
      <button class="la-del-btn" data-id="${a.id}" title="삭제">✕</button>
    </div>`;
}

// 계좌 추가/편집 시트
function openLinkedAccountEditSheet(acct, kind) {
  const isNew = !acct;
  const accountKind = isNew ? (kind || 'normal') : (acct.accountKind || 'normal');
  const sheet = document.getElementById('linkedAccountsSheet');
  // 신규 일반계좌 기본값: 대표계정 이름 + isDefault on
  // (단, 이미 대표계정이 있으면 isDefault off)
  const existingDefault = (State.linkedAccounts||[]).find(a => a.isDefault);
  const newIsDefault = isNew && accountKind === 'normal' && !existingDefault;
  const isDefault = isNew ? newIsDefault : !!acct.isDefault;
  const defaultName = isNew && accountKind === 'normal' && !existingDefault ? '대표계정' : '';

  // 정기계정 프리셋 이름
  const depositPresets = ['정기선교', '정기건축', '정기후대', '정기퇴직'];

  const kindLabel = accountKind === 'deposit' ? '정기계정' : '일반계좌';

  const presetsHTML = (isNew && accountKind === 'deposit') ? `
    <div class="form-field" style="margin-bottom:0;">
      <label class="form-label">빠른 선택</label>
      <div class="la-preset-row">
        ${depositPresets.map(p => `<button class="la-preset-btn" data-name="${p}">${p}</button>`).join('')}
      </div>
    </div>` : '';

  const editHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="laeBack" class="sheet-close-btn">${ICONS.chevLeft}뒤로</button>
      <h3>${isNew ? kindLabel + ' 추가' : '계좌 편집'}</h3>
      <button class="sheet-close-btn" style="visibility:hidden;">${ICONS.chevLeft}뒤로</button>
    </div>
    <div class="sheet-body">
      ${presetsHTML}
      <div class="form-field" style="margin-top:${isNew && accountKind==='deposit'?'12px':'0'};">
        <label class="form-label">계좌 이름</label>
        <input id="laeNameInput" class="form-input" type="text" placeholder="${accountKind==='deposit'?'예: 정기선교, 정기건축':'예: 재정계정, 선교계정'}" maxlength="20"
          value="${isNew ? defaultName : escapeHTML(acct.name)}">
      </div>
      <div class="form-field" style="margin-top:16px;">
        <label class="form-label">이월금액 (원)</label>
        <input id="laeCarryInput" class="form-input" type="number" placeholder="0" min="0"
          value="${isNew ? '' : (acct.carryover||0)}">
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">이 계좌의 이전기간 이월금액을 입력하세요</div>
      </div>
      ${accountKind === 'deposit' ? `
      <div class="form-field" style="margin-top:16px;">
        <label class="form-label">만기일</label>
        <input id="laeMaturityInput" class="form-input" type="date"
          value="${isNew ? '' : (acct.maturityDate||'')}">
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">정기계정 만기일을 입력하세요 (선택)</div>
      </div>` : ''}
      <div class="la-default-row">
        <label class="la-default-label" for="laeDefaultChk">대표계정으로 설정</label>
        <label class="toggle-switch">
          <input type="checkbox" id="laeDefaultChk" ${isDefault ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:20px;">대표계정은 날짜 패널에서 기본으로 선택돼요</div>
      <button class="la-save-btn" id="laeSaveBtn">${isNew ? kindLabel + ' 추가' : '저장'}</button>
      ${!isNew ? `<button class="la-del-full-btn" id="laeDelBtn">계좌 삭제</button>` : ''}
    </div>
  `;

  sheet.innerHTML = editHTML;

  // 프리셋 버튼 클릭 → 이름 입력창에 채우기
  sheet.querySelectorAll('.la-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sheet.querySelector('#laeNameInput').value = btn.dataset.name;
    });
  });

  sheet.querySelector('#laeBack').addEventListener('click', () => {
    renderLinkedAccountsSheet();
  });

  sheet.querySelector('#laeSaveBtn').addEventListener('click', async () => {
    const name = sheet.querySelector('#laeNameInput').value.trim();
    const carryover = parseInt(sheet.querySelector('#laeCarryInput').value) || 0;
    const isDefaultChk = sheet.querySelector('#laeDefaultChk').checked;
    const maturityInput = sheet.querySelector('#laeMaturityInput');
    const maturityDate = maturityInput ? (maturityInput.value || '') : (acct && acct.maturityDate ? acct.maturityDate : '');
    if (!name) { alert('계좌 이름을 입력해주세요.'); return; }
    const dup = (State.linkedAccounts||[]).find(a => a.name === name && (!acct || a.id !== acct.id));
    if (dup) { alert('같은 이름의 계좌가 이미 있어요.'); return; }

    // 대표계정 설정 시 기존 대표계정 해제
    if (isDefaultChk) {
      for (const a of (State.linkedAccounts||[])) {
        if (a.isDefault && (!acct || a.id !== acct.id)) {
          await DB.put('linkedAccounts', { ...a, isDefault: false });
        }
      }
    }

    const record = {
      id: isNew ? ('la_' + Date.now()) : acct.id,
      name,
      carryover,
      isDefault: isDefaultChk,
      accountKind,
      maturityDate,
      createdAt: isNew ? Date.now() : acct.createdAt
    };
    await DB.put('linkedAccounts', record);
    await reloadData();
    // 대표계정이면 selectedAccountId도 업데이트
    if (isDefaultChk) State.selectedAccountId = record.id;
    renderLinkedAccountsSheet();
  });

  if (!isNew) {
    sheet.querySelector('#laeDelBtn').addEventListener('click', async () => {
      if (!confirm(`"${acct.name}" 계좌를 삭제할까요?`)) return;
      await DB.del('linkedAccounts', acct.id);
      await reloadData();
      renderLinkedAccountsSheet();
    });
  }

  setTimeout(() => sheet.querySelector('#laeNameInput').focus(), 100);
}

let catManageSelGroupId = null; // 선택된 중분류 id
let catManageYear = new Date().getFullYear(); // 항목 관리에서 편집 중인 예산 연도

function openCatManageSheet(year) {
  catManageType = 'expense';
  catManageExpanded = new Set();
  catManageLevel = 1;
  catManageSelCatId = null;
  catManageSelGroupId = null;
  catManageYear = year != null ? year : new Date().getFullYear();
  renderCatManageSheet();
  openSheet('catManageSheet');
}

function renderCatManageSheet() {
  const sheet = document.getElementById('catManageSheet');
  renderCatTree(sheet);
}

/* =========================================================
   예전 항목 보기 (방식 A: 연도 스냅샷 조회)
   지금은 삭제/개명되어 사라졌지만, 그 해에는 분명히 존재했던 대분류/중분류/소분류를
   연도별로 모아 보여준다. 개별 거래 표시는 방식 B(비정규화)로 이미 해결되므로,
   여기서는 순수하게 "히스토리 열람" 용도로만 쓰인다.
   ========================================================= */
function openOldItemsSheet() {
  renderOldItemsSheet();
  openSheet('oldItemsSheet');
}

function renderOldItemsSheet() {
  const sheet = document.getElementById('oldItemsSheet');
  const currentCatIds   = new Set(State.categories.map(c => c.id));
  const currentGroupIds = new Set((State.subGroups || []).map(g => g.id));
  const currentSubIds   = new Set(State.subItems.map(s => s.id));

  const snaps = (State.categorySnapshots || []).slice().sort((a,b) => b.year - a.year);

  const yearBlocks = snaps.map(snap => {
    const goneCats   = (snap.categories || []).filter(c => !currentCatIds.has(c.id));
    const goneGroups = (snap.subGroups  || []).filter(g => !currentGroupIds.has(g.id));
    const goneSubs   = (snap.subItems   || []).filter(s => !currentSubIds.has(s.id));

    if (goneCats.length === 0 && goneGroups.length === 0 && goneSubs.length === 0) return '';

    return `
      <div class="card" style="padding:12px 16px;margin-bottom:12px;">
        <div style="font-size:13.5px;font-weight:800;margin-bottom:8px;">${snap.year}년에 있었던 항목</div>
        ${goneCats.length ? `
          <div style="font-size:11px;font-weight:700;color:var(--text-3);margin-bottom:4px;">대분류</div>
          ${goneCats.map(c => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
              <div style="background:${hexToLight(c.color||'#9CA3AF')};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${c.icon||'📦'}</div>
              <span style="font-size:13px;">${escapeHTML(c.name)}</span>
            </div>`).join('')}
        ` : ''}
        ${goneGroups.length ? `
          <div style="font-size:11px;font-weight:700;color:var(--text-3);margin:8px 0 4px;">중분류</div>
          ${goneGroups.map(g => `<div style="font-size:13px;padding:4px 0;">📂 ${escapeHTML(g.name)}</div>`).join('')}
        ` : ''}
        ${goneSubs.length ? `
          <div style="font-size:11px;font-weight:700;color:var(--text-3);margin:8px 0 4px;">소분류</div>
          ${goneSubs.map(s => `<div style="font-size:13px;padding:4px 0;color:var(--text-2);">· ${escapeHTML(s.name)}</div>`).join('')}
        ` : ''}
      </div>
    `;
  }).filter(Boolean).join('');

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>예전 항목 보기</h3>
      <button id="oldItemsClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div style="font-size:12.5px;color:var(--text-3);margin-bottom:12px;">
        지금은 삭제되었거나 이름이 바뀐 항목들이에요. 예전 거래 기록에는 그때 이름 그대로 남아있어요.
      </div>
      ${yearBlocks || emptyStateHTML('아직 기록된 예전 항목이 없어요', '항목을 삭제하거나 이름을 바꾸면 여기 자동으로 남아요')}
    </div>
  `;
  sheet.querySelector('#oldItemsClose').addEventListener('click', () => {
    closeSheet('oldItemsSheet');
  });
}

// ── 항목 관리 트리 ──
function renderCatTree(sheet) {
  const cats = State.categories.filter(c => c.type === catManageType);
  const year = catManageYear;
  const totalBudget = cats.reduce((s, c) => s + getBudget(c, year), 0);
  const isIncome = catManageType === 'income';
  const accent = isIncome ? 'var(--income)' : 'var(--expense)';
  const accentBg = isIncome ? 'var(--income-light,#f0fdf4)' : 'var(--expense-light,#fff5f5)';

  function subRowHTML(s, catId) {
    const sBud = getBudget(s, year);
    return `<div class="cattree-leaf" style="${s.hidden?'opacity:0.45;':''}display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:5px 0 5px 40px;border-bottom:1px solid var(--border);">
      <span style="flex:1;font-size:13px;">${s.hidden?'🚫 ':''}${escapeHTML(s.name)}</span>
      <label style="display:flex;align-items:center;gap:3px;font-size:12px;color:var(--primary);cursor:pointer;white-space:nowrap;font-weight:600;">
        <input type="checkbox" data-primary-id="${s.id}" ${s.isPrimary!==false?'checked':''} style="width:16px;height:16px;accent-color:var(--primary);">기본
      </label>
      <div style="display:flex;align-items:center;gap:3px;">
        <input type="text" inputmode="numeric" data-budget-id="${s.id}" data-cat-id="${catId}" value="${sBud?fmtMoney(sBud):''}" placeholder="${year}년 예산" style="width:70px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:11px;text-align:right;">
        <span style="font-size:11px;color:var(--text-3);">원</span>
      </div>
      <button class="grip" data-rename-sub="${s.id}">${ICONS.edit}</button>
      <button class="grip" data-del-sub="${s.id}" style="color:var(--expense);">${ICONS.trash}</button>
    </div>`;
  }

  function groupBlockHTML(g, catId) {
    const gSubs = subItemsOfGroup(g.id);
    const expanded = catManageExpanded.has(g.id);
    const subTotal = gSubs.reduce((s,x) => s + getBudget(x, year), 0);
    // 소분류 합이 있으면 소분류 합 표시, 없으면 중분류 직접 입력값
    const gBud = getBudget(g, year);
    const grpBudgetVal = subTotal > 0 ? subTotal : gBud;
    return `<div class="cattree-group-block" data-group-id="${g.id}">
      <div class="catrow" style="padding:6px 0 6px 20px;border-bottom:1px solid var(--border);cursor:pointer;" data-toggle-group="${g.id}">
        <span style="font-size:13px;margin-right:4px;transition:transform .2s;display:inline-block;transform:rotate(${expanded?'90':'0'}deg);">›</span>
        <span style="font-size:15px;margin-right:6px;">📂</span>
        <div class="nm" style="font-size:13.5px;">${escapeHTML(g.name)}</div>
        <div style="display:flex;align-items:center;gap:3px;margin-right:4px;">
          <input type="text" inputmode="numeric"
            data-group-budget-id="${g.id}" data-cat-id="${catId}"
            value="${grpBudgetVal ? fmtMoney(grpBudgetVal) : ''}"
            placeholder="${year}년 예산"
            style="width:80px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:11px;text-align:right;${subTotal > 0 ? 'background:var(--bg-2);' : ''}">
          <span style="font-size:11px;color:var(--text-3);">원</span>
        </div>
        <button class="grip" data-rename-group="${g.id}" style="margin-left:2px;">${ICONS.edit}</button>
        <button class="grip" data-del-group="${g.id}" style="color:var(--expense);">${ICONS.trash}</button>
      </div>
      ${expanded ? `
        <div class="cattree-group-subs">
          ${gSubs.length === 0 ? '<div style="padding:6px 0 6px 40px;font-size:12px;color:var(--text-3);">소분류가 없어요</div>' : gSubs.map(s => subRowHTML(s, catId)).join('')}
          <div class="cattree-addrow" style="padding:6px 0 6px 40px;">
            <input type="text" class="textinput" data-add-sub-group="${g.id}" data-add-sub-cat="${catId}" placeholder="새 소분류 이름" style="font-size:12px;">
            <button class="btn-secondary" data-add-sub-btn="${g.id}" style="font-size:12px;padding:5px 10px;">추가</button>
          </div>
        </div>` : ''}
    </div>`;
  }

  function catBlockHTML(c) {
    const groups = subGroupsOfCategory(c.id);
    const subs = subItemsOfCategory(c.id).filter(s => !s.subGroupId);
    const expanded = catManageExpanded.has(c.id);
    const cBud = getBudget(c, year);
    return `<div class="cattree-cat-block" data-cat-id="${c.id}" style="border-bottom:1px solid var(--border);">
      <div class="catrow" style="padding:6px 0;cursor:pointer;" data-toggle-cat="${c.id}">
        <span style="font-size:14px;margin-right:4px;transition:transform .2s;display:inline-block;transform:rotate(${expanded?'90':'0'}deg);">›</span>
        <div class="ic" style="background:${hexToLight(c.color)};">${c.icon}</div>
        <div class="nm">${escapeHTML(c.name)}${c.usePersonLevel?' <span style="font-size:11px;color:var(--primary);font-weight:700;">· 하위항목</span>':''}</div>
        <div style="display:flex;align-items:center;gap:3px;margin-right:4px;">
          <input type="text" inputmode="numeric"
            data-cat-budget-id="${c.id}"
            value="${cBud ? fmtMoney(cBud) : ''}"
            placeholder="미설정"
            style="width:72px;padding:2px 5px;border:1px solid var(--border);border-radius:6px;font-size:11px;text-align:right;${(subGroupsOfCategory(c.id).length > 0 || subItemsOfCategory(c.id).length > 0) ? 'background:var(--bg-2);' : ''}">
          <span style="font-size:11px;color:var(--text-3);">원</span>
        </div>
        <button class="grip" data-edit-cat="${c.id}">${ICONS.edit}</button>
        <button class="grip" data-del-cat="${c.id}" style="color:var(--expense);">${ICONS.trash}</button>
      </div>
      ${expanded ? `
        <div class="cattree-cat-body" style="padding:0 0 6px 0;">
          <!-- 공통 소분류 -->
          ${subs.length > 0 || groups.length === 0 ? `
            <div style="font-size:11px;font-weight:700;color:var(--text-3);padding:6px 0 2px 10px;">${groups.length>0?'공통 소분류':'소분류'}</div>
            ${subs.map(s => subRowHTML(s, c.id)).join('')}` : ''}
          <!-- 중분류 목록 -->
          ${groups.length > 0 ? `
            <div style="font-size:11px;font-weight:700;color:var(--text-3);padding:6px 0 2px 10px;">중분류</div>
            ${groups.map(g => groupBlockHTML(g, c.id)).join('')}` : ''}
          <!-- 추가 영역 -->
          <div style="padding:6px 0 0 10px;display:flex;flex-direction:column;gap:6px;">
            ${groups.length > 0 ? '' : `
            <div class="cattree-addrow">
              <input type="text" class="textinput" data-add-sub-cat-direct="${c.id}" placeholder="새 소분류 이름" style="font-size:12px;">
              <button class="btn-secondary" data-add-sub-direct="${c.id}" style="font-size:12px;padding:5px 10px;">소분류 추가</button>
            </div>`}
            <div class="cattree-addrow">
              <input type="text" class="textinput" data-add-group-cat="${c.id}" placeholder="새 중분류 이름" style="font-size:12px;">
              <button class="btn-secondary" data-add-group-btn="${c.id}" style="font-size:12px;padding:5px 10px;">중분류 추가</button>
            </div>
          </div>
        </div>` : ''}
    </div>`;
  }

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3>항목 관리</h3>
      <button id="catMClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="segctrl">
        <button data-type="expense" class="${catManageType==='expense'?'active':''}">지출 항목</button>
        <button data-type="income" class="${catManageType==='income'?'active':''}">수입 항목</button>
      </div>
      <div class="summary-month" style="justify-content:center; background:var(--card); border-radius:var(--radius-sm); padding:8px; box-shadow:var(--shadow); color:var(--text-1); margin-bottom:10px;">
        <button id="catMPrevYear" style="color:var(--text-2);">${ICONS.chevLeft}</button>
        <button id="catMYearLabel" style="background:none;border:none;font-size:14px;font-weight:700;color:var(--text-1);cursor:pointer;padding:4px 8px;border-radius:8px;flex:1;display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;">${year}년 예산 편집 <span style="font-size:11px;color:var(--text-3);">▾</span></button>
        <button id="catMNextYear" style="color:var(--text-2);">${ICONS.chevRight}</button>
      </div>
      <div style="background:${accentBg};border-radius:10px;padding:10px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12px;font-weight:800;color:${accent};">${isIncome?'수입':'지출'} ${year}년 예산 합계</div>
        <div style="font-size:17px;font-weight:900;color:${accent};" class="tabular">${totalBudget>0?fmtMoney(totalBudget)+'원':'미설정'}</div>
      </div>
      <div class="card" style="padding:4px 14px;">
        ${cats.length === 0
          ? '<div style="padding:16px 2px;color:var(--text-3);font-size:13px;">등록된 항목이 없어요</div>'
          : cats.map(c => catBlockHTML(c)).join('')}
      </div>
      <button class="btn-secondary" id="catAddNew" style="color:var(--primary);font-weight:800;">+ 새 대분류 추가</button>
      <button class="btn-secondary" id="oldItemsBtn" style="color:var(--text-2);font-weight:700;margin-top:6px;">🕘 예전 항목 보기</button>
    </div>
  `;

  sheet.querySelector('#catMClose').addEventListener('click', closeAllSheets);
  sheet.querySelectorAll('.segctrl button').forEach(b => {
    b.addEventListener('click', () => { catManageType = b.dataset.type; renderCatManageSheet(); });
  });
  sheet.querySelector('#catAddNew').addEventListener('click', () => openCatEditSheet(null));
  sheet.querySelector('#oldItemsBtn').addEventListener('click', () => openOldItemsSheet());

  // 연도 이동
  sheet.querySelector('#catMPrevYear').addEventListener('click', () => { catManageYear -= 1; renderCatManageSheet(); });
  sheet.querySelector('#catMNextYear').addEventListener('click', () => { catManageYear += 1; renderCatManageSheet(); });
  sheet.querySelector('#catMYearLabel').addEventListener('click', () => {
    const existing = document.getElementById('catMYearPop');
    if (existing) { existing.remove(); return; }
    const years = allBudgetYears();
    for (let y = year - 5; y <= year + 1; y++) if (!years.includes(y)) years.push(y);
    years.sort((a,b) => a-b);
    const pop = document.createElement('div');
    pop.id = 'catMYearPop';
    pop.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    pop.innerHTML = `
      <div style="background:var(--card);border-radius:20px;padding:20px;width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:14px;text-align:center;">예산 편집 연도 선택</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:260px;overflow-y:auto;">
          ${years.map(y => `
            <button data-year="${y}" style="padding:10px 4px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:${y===year?'700':'400'};background:${y===year?'var(--primary)':'var(--card)'};color:${y===year?'#fff':'var(--text-1)'};cursor:pointer;">${y}년</button>
          `).join('')}
        </div>
        <button id="catMYearPopClose" style="width:100%;margin-top:16px;padding:11px;border-radius:12px;background:var(--surface-2);border:none;font-size:14px;font-weight:600;color:var(--text-1);">닫기</button>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelectorAll('[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        catManageYear = Number(btn.dataset.year);
        pop.remove();
        renderCatManageSheet();
      });
    });
    pop.querySelector('#catMYearPopClose').addEventListener('click', () => pop.remove());
    pop.addEventListener('click', e => { if (e.target === pop) pop.remove(); });
  });

  // 대분류 토글
  sheet.querySelectorAll('[data-toggle-cat]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit-cat],[data-del-cat]')) return;
      const id = el.dataset.toggleCat;
      catManageExpanded.has(id) ? catManageExpanded.delete(id) : catManageExpanded.add(id);
      renderCatManageSheet();
    });
  });

  // 중분류 토글
  sheet.querySelectorAll('[data-toggle-group]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-rename-group],[data-del-group]')) return;
      const id = el.dataset.toggleGroup;
      catManageExpanded.has(id) ? catManageExpanded.delete(id) : catManageExpanded.add(id);
      renderCatManageSheet();
    });
  });

  // 대분류 수정/삭제
  sheet.querySelectorAll('[data-edit-cat]').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); openCatEditSheet(b.dataset.editCat); });
  });
  sheet.querySelectorAll('[data-del-cat]').forEach(b => {
    b.addEventListener('click', async (e) => { e.stopPropagation(); await deleteCatWithConfirm(b.dataset.delCat); });
  });

  // 중분류 이름 수정/삭제
  sheet.querySelectorAll('[data-rename-group]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const g = (State.subGroups||[]).find(x => x.id === b.dataset.renameGroup);
      if (!g) return;
      const name = prompt('중분류 이름 수정', g.name);
      if (!name?.trim()) return;
      await ensureYearSnapshot(new Date().getFullYear());
      g.name = name.trim();
      await DB.put('subGroups', g); await reloadData(); renderCatManageSheet();
    });
  });
  sheet.querySelectorAll('[data-del-group]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = b.closest('[data-cat-id]')?.dataset.catId;
      await deleteGroupWithConfirm(b.dataset.delGroup, catId);
    });
  });

  // 중분류 안에 소분류 추가
  sheet.querySelectorAll('[data-add-sub-btn]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gId = btn.dataset.addSubBtn;
      const catId = btn.dataset.addSubCat || btn.closest('[data-cat-id]')?.dataset.catId;
      const input = sheet.querySelector(`[data-add-sub-group="${gId}"]`);
      const name = input?.value.trim();
      if (!name) { showToast('이름을 입력해주세요'); return; }
      const list = subItemsOfGroup(gId);
      if (list.find(s => s.name === name)) { showToast('이미 있는 항목이에요'); return; }
      await DB.put('subItems', { id: uid(), categoryId: catId, subGroupId: gId, name, order: list.length, budget: 0 });
      await propagateSubItemToSiblingGroups(catId, gId, name);
      await reloadData(); renderCatManageSheet();
    });
  });
  sheet.querySelectorAll('[data-add-sub-group]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const gId = input.dataset.addSubGroup;
      sheet.querySelector(`[data-add-sub-btn="${gId}"]`)?.click();
    });
  });

  // 대분류 직접 소분류 추가 (중분류 없는 경우)
  sheet.querySelectorAll('[data-add-sub-direct]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.addSubDirect;
      const input = sheet.querySelector(`[data-add-sub-cat-direct="${catId}"]`);
      const name = input?.value.trim();
      if (!name) { showToast('이름을 입력해주세요'); return; }
      const list = subItemsOfCategory(catId);
      if (list.find(s => s.name === name)) { showToast('이미 있는 항목이에요'); return; }
      await DB.put('subItems', { id: uid(), categoryId: catId, name, order: list.length, budget: 0 });
      await reloadData(); renderCatManageSheet();
    });
  });
  sheet.querySelectorAll('[data-add-sub-cat-direct]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const catId = input.dataset.addSubCatDirect;
      sheet.querySelector(`[data-add-sub-direct="${catId}"]`)?.click();
    });
  });

  // 중분류 추가
  sheet.querySelectorAll('[data-add-group-btn]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = btn.dataset.addGroupBtn;
      const input = sheet.querySelector(`[data-add-group-cat="${catId}"]`);
      const name = input?.value.trim();
      if (!name) { showToast('이름을 입력해주세요'); return; }
      const groups = subGroupsOfCategory(catId);
      if (groups.find(g => g.name === name)) { showToast('이미 있는 이름이에요'); return; }
      const newGroupId = uid();
      await DB.put('subGroups', { id: newGroupId, categoryId: catId, name, order: groups.length });
      await seedDefaultSubItemsForGroup(newGroupId, catId);
      catManageExpanded.add(catId);
      catManageExpanded.add(newGroupId);
      await reloadData(); renderCatManageSheet();
    });
  });
  sheet.querySelectorAll('[data-add-group-cat]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const catId = input.dataset.addGroupCat;
      sheet.querySelector(`[data-add-group-btn="${catId}"]`)?.click();
    });
  });

  // 소분류 기본/일반 체크박스
  sheet.querySelectorAll('[data-primary-id]').forEach(chk => {
    chk.addEventListener('change', async () => {
      const item = await DB.get('subItems', chk.dataset.primaryId);
      if (!item) return;
      item.isPrimary = chk.checked;
      await DB.put('subItems', item);
      await reloadData();
      showToast(chk.checked ? '기본 항목으로 설정됐어요' : '일반 항목으로 설정됐어요');
    });
  });

  // 소분류 예산/수정/삭제 (기존 attachSubItemEvents 인라인)
  sheet.querySelectorAll('[data-budget-id]').forEach(input => {
    attachMoneyInputFormatter(input, () => {});
    const save = async () => {
      const subId = input.dataset.budgetId;
      const catId = input.dataset.catId;
      const item = await DB.get('subItems', subId);
      if (!item) return;
      const newVal = Number(rawDigits(input.value)) || 0;
      if (getBudget(item, catManageYear) === newVal) return;
      setBudget(item, catManageYear, newVal);
      await DB.put('subItems', item);
      await recalcGroupBudget(item.subGroupId, catManageYear);
      await recalcCatBudget(catId, catManageYear);
      await reloadData(); renderCurrentPage();
      showToast('예산 저장됐어요');
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if(e.key==='Enter') input.blur(); });
    input.addEventListener('click', e => e.stopPropagation());
  });

  // 중분류 예산 입력
  sheet.querySelectorAll('[data-group-budget-id]').forEach(input => {
    attachMoneyInputFormatter(input, () => {});
    const save = async () => {
      const grpId = input.dataset.groupBudgetId;
      const catId = input.dataset.catId;
      const g = await DB.get('subGroups', grpId);
      if (!g) return;
      const newVal = Number(rawDigits(input.value)) || 0;
      if (getBudget(g, catManageYear) === newVal) return;
      setBudget(g, catManageYear, newVal);
      await DB.put('subGroups', g);
      await recalcCatBudget(catId, catManageYear);
      await reloadData(); renderCurrentPage();
      showToast('예산 저장됐어요');
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if(e.key==='Enter') input.blur(); });
    input.addEventListener('click', e => e.stopPropagation());
  });

  // 대분류 예산 입력
  sheet.querySelectorAll('[data-cat-budget-id]').forEach(input => {
    attachMoneyInputFormatter(input, () => {});
    const save = async () => {
      const catId = input.dataset.catBudgetId;
      const cat = await DB.get('categories', catId);
      if (!cat) return;
      const newVal = Number(rawDigits(input.value)) || 0;
      if (getBudget(cat, catManageYear) === newVal) return;
      setBudget(cat, catManageYear, newVal);
      await DB.put('categories', cat);
      await reloadData(); renderCurrentPage();
      showToast('예산 저장됐어요');
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if(e.key==='Enter') input.blur(); });
    input.addEventListener('click', e => e.stopPropagation());
  });

  sheet.querySelectorAll('[data-rename-sub]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = await DB.get('subItems', b.dataset.renameSub);
      if (!item) return;
      const name = prompt('소분류 이름 수정', item.name);
      if (!name?.trim()) return;
      await ensureYearSnapshot(new Date().getFullYear());
      item.name = name.trim();
      await DB.put('subItems', item); await reloadData(); renderCatManageSheet();
    });
  });
  sheet.querySelectorAll('[data-del-sub]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = b.closest('[data-cat-id]')?.dataset.catId;
      const groupId = b.closest('[data-group-id]')?.dataset.groupId || null;
      await deleteSubWithConfirm(b.dataset.delSub, catId, groupId);
    });
  });
}


// ── 중분류 예산 재합산: 소분류가 있으면 소분류 합으로 업데이트 (0으로 비워진 경우도 반영, 지정 연도 기준) ──
async function recalcGroupBudget(groupId, year) {
  if (!groupId) return;
  const g = await DB.get('subGroups', groupId);
  if (!g) return;
  const allSubs  = await DB.getAll('subItems');
  const gSubs    = allSubs.filter(s => s.subGroupId === groupId);
  const subTotal = gSubs.reduce((s, x) => s + getBudget(x, year), 0);
  // 소분류가 하나라도 있으면(값이 전부 0이어도) 중분류를 소분류 합으로 동기화
  // 소분류가 아예 없을 때만 중분류 직접값을 유지
  if (gSubs.length > 0 && getBudget(g, year) !== subTotal) {
    setBudget(g, year, subTotal);
    await DB.put('subGroups', g);
  }
}

// ── 대분류 예산 재합산: 소분류합 + 중분류직접입력합 (소분류가 있는 중분류는 소분류합 우선, 지정 연도 기준) ──
async function recalcCatBudget(catId, year) {
  const cat = await DB.get('categories', catId);
  if (!cat) return;
  const allSubs   = await DB.getAll('subItems');
  const allGroups = await DB.getAll('subGroups');
  const catGroups = allGroups.filter(g => g.categoryId === catId);
  const catSubs   = allSubs.filter(s => s.categoryId === catId);

  // 중분류별 유효 예산: 소분류가 있으면 소분류 합(0 포함), 없으면 중분류 직접값
  let grpTotal = 0;
  for (const g of catGroups) {
    const gSubs    = catSubs.filter(s => s.subGroupId === g.id);
    const subTotal = gSubs.reduce((s, x) => s + getBudget(x, year), 0);
    grpTotal += gSubs.length > 0 ? subTotal : getBudget(g, year);
  }
  const directTotal = catSubs.filter(s => !s.subGroupId).reduce((s,x) => s + getBudget(x, year), 0);
  const total = grpTotal + directTotal;

  // 중분류/소분류가 하나라도 있으면(합계가 0이어도) 대분류를 합산값으로 동기화
  // 중분류/소분류가 아예 없을 때만 대분류 직접값 유지
  const hasManagedChildren = catGroups.length > 0 || catSubs.length > 0;
  if (hasManagedChildren && getBudget(cat, year) !== total) {
    setBudget(cat, year, total);
    await DB.put('categories', cat);
  }
}

// ── 소분류 이벤트 (수정/삭제/예산) ──
function attachSubItemEvents(sheet, catId, groupId) {
  sheet.querySelectorAll('[data-budget-id]').forEach(input => {
    attachMoneyInputFormatter(input, () => {});
    const save = async () => {
      const subId = input.dataset.budgetId;
      const item = await DB.get('subItems', subId);
      if (!item) return;
      const newVal = Number(rawDigits(input.value)) || 0;
      if (getBudget(item, catManageYear) === newVal) return;
      setBudget(item, catManageYear, newVal);
      await DB.put('subItems', item);
      // 중분류 예산 재합산 (있는 경우)
      if (item.subGroupId) {
        const g = await DB.get('subGroups', item.subGroupId);
        if (g) {
          const allSubs = await DB.getAll('subItems');
          const gSubs   = allSubs.filter(s => s.subGroupId === g.id);
          const gTotal  = gSubs.reduce((s, sub) => s + (sub.id === subId ? newVal : getBudget(sub, catManageYear)), 0);
          if (getBudget(g, catManageYear) !== gTotal) { setBudget(g, catManageYear, gTotal); await DB.put('subGroups', g); }
        }
      }
      await recalcCatBudget(catId, catManageYear);
      await reloadData(); renderCurrentPage();
      showToast('예산 저장됐어요');
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if(e.key==='Enter') input.blur(); });
    input.addEventListener('click', e => e.stopPropagation());
  });

  sheet.querySelectorAll('[data-rename-sub]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = await DB.get('subItems', b.dataset.renameSub);
      if (!item) return;
      const name = prompt('소분류 이름 수정', item.name);
      if (!name?.trim()) return;
      await ensureYearSnapshot(new Date().getFullYear());
      item.name = name.trim();
      await DB.put('subItems', item); await reloadData(); renderCatManageSheet();
    });
  });

  sheet.querySelectorAll('[data-del-sub]').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteSubWithConfirm(b.dataset.delSub, catId, groupId);
    });
  });
}

// ── 삭제 함수들 (데이터 이동 옵션 포함) ──
// ── 거래 이동 시트 ──
// deletingItem = { type: 'sub'|'group'|'cat'|'person', id, catId, groupId, name, txs }
let _deletingItem = null;

function openMoveSheet(deletingItem) {
  _deletingItem = deletingItem;
  let sheet = document.getElementById('moveItemSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'moveItemSheet';
    sheet.className = 'sheet';
    sheet.style.zIndex = '110';
    document.getElementById('app').appendChild(sheet);
  }
  renderMoveSheet(sheet, 1, null, null); // 대분류 선택부터
  openSheet('moveItemSheet');
}

function renderMoveSheet(sheet, step, selCatId, selGroupId) {
  const d = _deletingItem;
  const txs = d.txs;
  const type = d.type; // 'sub','group','cat','person'
  const txType = txs[0]?.type || 'expense';
  const cats = State.categories.filter(c => c.type === txType);

  // 거래 목록 HTML
  const txListHtml = `
    <div style="font-size:12px;font-weight:800;color:var(--text-3);margin-bottom:4px;">관련 거래 ${txs.length}건</div>
    <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">
      ${txs.map(t => `
        <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px;">
          <span style="color:var(--text-2);">${t.date}</span>
          <span style="font-weight:600;">${fmtMoney(t.amount)}원</span>
        </div>`).join('')}
    </div>`;

  if (step === 1) {
    // 대분류 선택
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h3>거래 이동: "${escapeHTML(d.name)}"</h3>
        <button id="moveClose" class="sheet-close-btn">${ICONS.close}취소</button>
      </div>
      <div class="sheet-body">
        ${txListHtml}
        <div style="font-size:13px;font-weight:800;margin-bottom:8px;">이동할 대분류 선택</div>
        <div class="catgrid">
          ${cats.map(c => `
            <button class="catchip" data-move-cat="${c.id}">
              <span class="ic" style="background:${hexToLight(c.color)};">${c.icon}</span>
              <span>${escapeHTML(c.name)}</span>
            </button>`).join('')}
        </div>
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
          <button id="moveDeleteOnly" style="font-size:13px;color:var(--expense);font-weight:700;">거래 이동 없이 항목만 삭제</button>
        </div>
      </div>`;
    sheet.querySelector('#moveClose').addEventListener('click', () => { closeSheet('moveItemSheet'); _deletingItem = null; });
    sheet.querySelectorAll('[data-move-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const cId = b.dataset.moveCat;
        const groups = subGroupsOfCategory(cId);
        if (groups.length > 0) renderMoveSheet(sheet, 2, cId, null);
        else renderMoveSheet(sheet, 3, cId, null);
      });
    });
    sheet.querySelector('#moveDeleteOnly').addEventListener('click', async () => {
      await doDeleteItem(false, null, null, null);
    });

  } else if (step === 2) {
    // 중분류 선택
    const cat = catById(selCatId);
    const groups = subGroupsOfCategory(selCatId);
    const persons = []; // persons 구조 폐기
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <button id="moveBack" style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:2px;">${ICONS.chevLeft}이전</button>
        <h3>${cat?.icon} ${escapeHTML(cat?.name||'')}</h3>
        <button id="moveClose" class="sheet-close-btn">${ICONS.close}취소</button>
      </div>
      <div class="sheet-body">
        ${txListHtml}
        <div style="font-size:13px;font-weight:800;margin-bottom:8px;">중분류 선택</div>
        <div class="catgrid">
          ${groups.map(g => `
            <button class="catchip" data-move-group="${g.id}">
              <span class="ic" style="background:${hexToLight(cat?.color||'#eee')};">📂</span>
              <span>${escapeHTML(g.name)}</span>
            </button>`).join('')}
          ${persons.map(p => `
            <button class="catchip" data-move-person="${p.id}">
              <span class="ic" style="background:${hexToLight(cat?.color||'#eee')};">👤</span>
              <span>${escapeHTML(p.name)}</span>
            </button>`).join('')}
          ${groups.length === 0 && persons.length === 0 ? `<button class="catchip" data-move-direct="${selCatId}">
            <span class="ic" style="background:${hexToLight(cat?.color||'#eee')};">${cat?.icon}</span>
            <span>직접 이동</span>
          </button>` : ''}
        </div>
      </div>`;
    sheet.querySelector('#moveBack').addEventListener('click', () => renderMoveSheet(sheet, 1, null, null));
    sheet.querySelector('#moveClose').addEventListener('click', () => { closeSheet('moveItemSheet'); _deletingItem = null; });
    sheet.querySelectorAll('[data-move-group]').forEach(b => {
      b.addEventListener('click', () => renderMoveSheet(sheet, 3, selCatId, b.dataset.moveGroup));
    });
    sheet.querySelectorAll('[data-move-person]').forEach(b => {
      b.addEventListener('click', async () => {
        await doDeleteItem(true, selCatId, null, null, b.dataset.movePerson);
      });
    });
    sheet.querySelectorAll('[data-move-direct]').forEach(b => {
      b.addEventListener('click', () => renderMoveSheet(sheet, 3, selCatId, null));
    });

  } else {
    // 소분류 선택
    const cat = catById(selCatId);
    const subs = selGroupId ? subItemsOfGroup(selGroupId) : subItemsOfCategory(selCatId).filter(s => !s.subGroupId);
    const groupName = selGroupId ? (State.subGroups||[]).find(g=>g.id===selGroupId)?.name : '';
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <button id="moveBack" style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:2px;">${ICONS.chevLeft}이전</button>
        <h3>${escapeHTML(groupName || cat?.name||'')}</h3>
        <button id="moveClose" class="sheet-close-btn">${ICONS.close}취소</button>
      </div>
      <div class="sheet-body">
        ${txListHtml}
        ${subs.length > 0 ? `
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;">소분류 선택</div>
          <div class="catgrid">
            ${subs.map(s => `
              <button class="catchip" data-move-sub="${s.id}">
                <span class="ic" style="background:${hexToLight(cat?.color||'#eee')};">${cat?.icon}</span>
                <span>${escapeHTML(s.name)}</span>
              </button>`).join('')}
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
            <button id="moveToCatOnly" style="font-size:12px;color:var(--text-3);">소분류 없이 "${escapeHTML(groupName||cat?.name||'')}"로 이동</button>
          </div>
        ` : `
          <div style="background:var(--income-light,#f0fdf4);border-radius:10px;padding:16px;text-align:center;margin-bottom:12px;">
            <div style="font-size:13px;color:var(--text-2);margin-bottom:4px;">소분류가 없습니다</div>
            <div style="font-size:12px;color:var(--text-3);">"${escapeHTML(groupName||cat?.name||'')}"(으)로 바로 이동합니다</div>
          </div>
          <button id="moveToCatOnly" style="width:100%;padding:12px;background:var(--primary);color:#fff;border-radius:10px;font-size:14px;font-weight:800;">
            거래 ${d.txs.length}건 이동 후 삭제 확인
          </button>
        `}
      </div>`;
    sheet.querySelector('#moveBack').addEventListener('click', () => {
      if (selGroupId) renderMoveSheet(sheet, 2, selCatId, null);
      else renderMoveSheet(sheet, 1, null, null);
    });
    sheet.querySelector('#moveClose').addEventListener('click', () => { closeSheet('moveItemSheet'); _deletingItem = null; });
    sheet.querySelectorAll('[data-move-sub]').forEach(b => {
      b.addEventListener('click', async () => {
        await doDeleteItem(true, selCatId, selGroupId, b.dataset.moveSub);
      });
    });
    sheet.querySelector('#moveToCatOnly')?.addEventListener('click', async () => {
      await doDeleteItem(true, selCatId, selGroupId, null);
    });
  }
}

async function doDeleteItem(doMove, targetCatId, targetGroupId, targetSubId, targetPersonId) {
  const d = _deletingItem;
  if (doMove && d.txs.length > 0) {
    if (d.type === 'sub') {
      for (const t of d.txs) {
        if (targetCatId) t.categoryId = targetCatId;
        for (const l of (t.lines||[])) { if (l.subItemId === d.id && targetSubId) l.subItemId = targetSubId; }
        await DB.put('transactions', t);
      }
    } else if (d.type === 'group') {
      for (const t of d.txs) {
        if (targetCatId) t.categoryId = targetCatId;
        for (const l of (t.lines||[])) {
          const sub = d.groupSubs?.find(s => s.id === l.subItemId);
          if (sub && targetSubId) l.subItemId = targetSubId;
        }
        await DB.put('transactions', t);
      }
    } else if (d.type === 'cat') {
      for (const t of d.txs) {
        if (targetCatId) { t.categoryId = targetCatId; if (targetPersonId) t.personId = targetPersonId; }
        await DB.put('transactions', t);
      }
    } else if (d.type === 'person') {
      // persons 구조 폐기 — subGroupId 기반으로 교체
      for (const t of d.txs) {
        if (targetPersonId) t.subGroupId = targetPersonId; // 이동 대상이 subGroup id
        else if (targetCatId) t.categoryId = targetCatId;
        delete t.personId;
        await DB.put('transactions', t);
      }
    }
    showToast(`거래 ${d.txs.length}건 이동 완료`);
  }

  // 방식 A: 삭제되기 전, 올해 스냅샷에 현재 항목들을 먼저 누적 저장
  await ensureYearSnapshot(new Date().getFullYear());

  // 실제 삭제
  if (d.type === 'sub') {
    await DB.del('subItems', d.id);
    // 삭제된 소분류의 예산이 상위 중분류/대분류 합계에 남지 않도록 재계산
    await recalcGroupBudget(d.groupId, catManageYear);
    await recalcCatBudget(d.catId, catManageYear);
  } else if (d.type === 'group') {
    for (const s of (d.groupSubs||[])) await DB.del('subItems', s.id);
    await DB.del('subGroups', d.id);
    // 삭제된 중분류의 예산이 대분류 합계에 남지 않도록 재계산
    await recalcCatBudget(d.catId, catManageYear);
  } else if (d.type === 'cat') {
    for (const s of subItemsOfCategory(d.id)) await DB.del('subItems', s.id);
    for (const g of subGroupsOfCategory(d.id)) await DB.del('subGroups', g.id);
    for (const p of personsOfCategory(d.id, true)) await DB.del('persons', p.id);
    await DB.del('categories', d.id);
  } else if (d.type === 'person') {
    await DB.del('persons', d.id);
  }

  // moveItemSheet 닫고 삭제 전 위치로 복귀
  const returnLevel = d.returnLevel || 1;
  const returnCatId = d.returnCatId || null;
  const returnGroupId = d.returnGroupId || null;

  closeSheet('moveItemSheet');
  _deletingItem = null;
  await reloadData();

  renderCatManageSheet();
  renderCurrentPage();
  showToast('삭제됐어요');
}

// ── 삭제 진입점 ──
async function deleteSubWithConfirm(subId, catId, groupId) {
  const item = await DB.get('subItems', subId);
  if (!item) return;
  const txs = State.transactions.filter(t => (t.lines||[]).some(l => l.subItemId === subId));
  if (txs.length === 0) {
    if (!confirm(`"${item.name}"을 삭제할까요?`)) return;
    await ensureYearSnapshot(new Date().getFullYear());
    await DB.del('subItems', subId);
    // 삭제된 소분류의 예산이 상위 중분류/대분류 합계에 남지 않도록 재계산
    await recalcGroupBudget(groupId, catManageYear);
    await recalcCatBudget(catId, catManageYear);
    await reloadData(); renderCatManageSheet(); renderCurrentPage();
    showToast('삭제됐어요');
    return;
  }
  // 거래 있으면 이동 시트 열기
  const enriched = txs.map(t => ({ ...t, amount: (t.lines||[]).reduce((s,l) => s+(l.amount||0),0) }));
  openMoveSheet({ type: 'sub', id: subId, catId, groupId, name: item.name, txs: enriched,
    returnLevel: groupId ? 3 : 2, returnCatId: catId, returnGroupId: groupId });
}

async function deleteGroupWithConfirm(groupId, catId) {
  const group = (State.subGroups||[]).find(g => g.id === groupId);
  if (!group) return;
  const gSubs = subItemsOfGroup(groupId);
  const txs = State.transactions.filter(t => (t.lines||[]).some(l => gSubs.some(s => s.id === l.subItemId)));
  if (txs.length === 0) {
    if (!confirm(`"${group.name}" 중분류와 하위 소분류 ${gSubs.length}개를 삭제할까요?`)) return;
    await ensureYearSnapshot(new Date().getFullYear());
    for (const s of gSubs) await DB.del('subItems', s.id);
    await DB.del('subGroups', groupId);
    // 삭제된 중분류의 예산이 대분류 합계에 남지 않도록 재계산
    await recalcCatBudget(catId, catManageYear);
    await reloadData(); renderCatManageSheet();
    showToast('삭제됐어요');
    return;
  }
  const enriched = txs.map(t => ({ ...t, amount: (t.lines||[]).reduce((s,l) => s+(l.amount||0),0) }));
  openMoveSheet({ type: 'group', id: groupId, catId, name: group.name, txs: enriched, groupSubs: gSubs,
    returnLevel: 2, returnCatId: catId });
}

async function deleteCatWithConfirm(catId) {
  const cat = catById(catId);
  if (!cat) return;
  const txs = State.transactions.filter(t => t.categoryId === catId);
  if (txs.length === 0) {
    if (!confirm(`"${cat.name}" 대분류를 삭제할까요? 하위 항목도 모두 삭제됩니다.`)) return;
    await ensureYearSnapshot(new Date().getFullYear());
    for (const s of subItemsOfCategory(catId)) await DB.del('subItems', s.id);
    for (const g of subGroupsOfCategory(catId)) await DB.del('subGroups', g.id);
    for (const p of personsOfCategory(catId, true)) await DB.del('persons', p.id);
    await DB.del('categories', catId);
    await reloadData(); renderCatManageSheet(); renderCurrentPage();
    showToast('삭제됐어요');
    return;
  }
  const enriched = txs.map(t => ({ ...t, amount: (t.lines||[]).reduce((s,l) => s+(l.amount||0),0) }));
  openMoveSheet({ type: 'cat', id: catId, name: cat.name, txs: enriched, returnLevel: 1 });
}

async function deletePersonWithConfirm(personId, catId) {
  const p = State.persons.find(x => x.id === personId);
  if (!p) return;
  const txs = State.transactions.filter(t => t.personId === personId);
  if (txs.length === 0) {
    if (!confirm(`"${p.name}"을 삭제할까요?`)) return;
    await DB.del('persons', personId);
    await reloadData(); renderCatManageSheet();
    showToast('삭제됐어요');
    return;
  }
  const enriched = txs.map(t => ({ ...t, amount: (t.lines||[]).reduce((s,l) => s+(l.amount||0),0) }));
  openMoveSheet({ type: 'person', id: personId, catId, name: p.name, txs: enriched,
    returnLevel: 2, returnCatId: catId });
}


const ICON_PALETTE = ['🍚','🚌','🏠','🛍️','🎬','💊','📚','📱','🙏','📦','💼','👛','💰','✨','🎁','🐶','✈️','🏥','🚗','⚡','💧','📺','☕','🍺','👕','🧒','💳','🏦','🎮','🛠️'];
const COLOR_PALETTE = ['#E5484D','#F08C3A','#F0A93A','#1FAA59','#10B981','#0EA5E9','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899','#9CA3AF'];

function openCatEditSheet(catId) {
  const editing = catId ? catById(catId) : null;
  const sheet = document.getElementById('catEditSheet');
  const draft = editing ? { ...editing } : { type: catManageType, name: '', icon: ICON_PALETTE[0], color: COLOR_PALETTE[0], budgets: {}, usePersonLevel: false };

  function paint() {
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h3>${editing ? '대분류 수정' : '새 대분류'}</h3>
        <div style="display:flex; align-items:center; gap:10px;">
          <button id="catEClose" class="sheet-close-btn">${ICONS.close}취소</button>
          <button id="catSave" style="color:var(--primary); font-weight:800; font-size:14.5px; white-space:nowrap;">${editing ? '수정 완료' : '추가'}</button>
        </div>
      </div>
      <div class="sheet-body">
        <div class="formrow">
          <label>이름</label>
          <input type="text" class="textinput" id="catName" placeholder="예: 헌금" value="${escapeHTML(draft.name)}">
        </div>
        <div class="formrow">
          <label>아이콘</label>
          <div class="catgrid">
            ${ICON_PALETTE.map(ic => `
              <button class="catchip iconpick ${draft.icon===ic?'selected':''}" data-icon="${ic}">
                <span class="ic" style="background:${hexToLight(draft.color)};">${ic}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="formrow">
          <label>색상</label>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${COLOR_PALETTE.map(c => `
              <button class="colorpick" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c}; ${draft.color===c?'box-shadow:0 0 0 3px '+c+'55, 0 0 0 2px #fff inset;':''}"></button>
            `).join('')}
          </div>
        </div>
        ${draft.type === 'expense' ? `
          <div class="formrow">
            <label>${catManageYear}년 연간 예산 (선택, 0이면 미설정)</label>
            <div class="amt-input-wrap" id="budgetWrap">
              <input type="text" inputmode="numeric" id="catBudget" placeholder="0" value="${getBudget(draft, catManageYear) ? fmtMoney(getBudget(draft, catManageYear)) : ''}">
              <span class="won">원</span>
            </div>
          </div>
        ` : ''}
        <div class="formrow">
          <div class="settings-row" style="padding:14px 16px;">
            <div>
              <div class="settings-label">하위항목 사용</div>
              <div class="settings-sub">예: 헌금 → 성도 이름 선택 후 세부항목 입력</div>
            </div>
            <button class="switch ${draft.usePersonLevel ? 'on' : ''}" id="personLevelSwitch"></button>
          </div>
        </div>
        ${editing ? `
          <button class="btn-secondary" id="manageSubItemsBtn" style="font-weight:700; color:var(--text-1);">세부항목 관리 (${subItemsOfCategory(editing.id).length}개)</button>
          ${draft.usePersonLevel ? `<button class="btn-secondary" id="managePersonsBtn" style="font-weight:700; color:var(--text-1);">하위항목 설정 (${personsOfCategory(editing.id).length}개)</button>` : ''}
        ` : `<div style="font-size:12.5px; color:var(--text-3); padding:2px 2px 0;">세부항목과 하위항목은 추가 후 관리할 수 있어요</div>`}

        ${editing ? `<button class="btn-secondary" id="catDelete" style="color:var(--expense);">대분류 삭제</button>` : ''}
      </div>
    `;
    sheet.querySelector('#catEClose').addEventListener('click', () => { closeAllSheets(); openCatManageSheet(catManageYear); });
    sheet.querySelectorAll('.iconpick').forEach(b => {
      b.addEventListener('click', () => { draft.icon = b.dataset.icon; paint(); });
    });
    sheet.querySelectorAll('.colorpick').forEach(b => {
      b.addEventListener('click', () => { draft.color = b.dataset.color; paint(); });
    });
    sheet.querySelector('#personLevelSwitch').addEventListener('click', () => {
      draft.usePersonLevel = !draft.usePersonLevel;
      paint();
    });
    const budgetInput = sheet.querySelector('#catBudget');
    if (budgetInput) {
      attachMoneyInputFormatter(budgetInput, () => {});
      const bWrap = sheet.querySelector('#budgetWrap');
      budgetInput.addEventListener('focus', () => bWrap.classList.add('focus'));
      budgetInput.addEventListener('blur', () => bWrap.classList.remove('focus'));
    }
    if (editing) {
      sheet.querySelector('#manageSubItemsBtn').addEventListener('click', () => openCatSubSheet(editing.id, 'items'));
      const pBtn = sheet.querySelector('#managePersonsBtn');
      if (pBtn) pBtn.addEventListener('click', () => openCatSubSheet(editing.id, 'persons'));
    }
    sheet.querySelector('#catSave').addEventListener('click', async () => {
      const name = sheet.querySelector('#catName').value.trim();
      if (!name) { showToast('이름을 입력해주세요'); return; }
      draft.name = name;
      if (draft.type === 'expense') {
        const newVal = Number(rawDigits(sheet.querySelector('#catBudget').value)) || 0;
        setBudget(draft, catManageYear, newVal);
      }
      const isNew = !editing;
      if (isNew) { draft.id = uid(); draft.order = State.categories.length; }
      else await ensureYearSnapshot(new Date().getFullYear()); // 수정 전 이름/아이콘/색상을 올해 스냅샷에 남겨둠
      await DB.put('categories', draft);

      // 새 대분류 추가 시: 중분류·소분류가 없으면 동일 이름으로 자동 생성
      if (isNew) {
        const existingGroups = (await DB.getAll('subGroups')).filter(g => g.categoryId === draft.id);
        const existingItems  = (await DB.getAll('subItems')).filter(s => s.categoryId === draft.id);
        if (existingGroups.length === 0 && existingItems.length === 0) {
          const groupId  = uid();
          const subItemId = uid();
          await DB.put('subGroups', { id: groupId,  categoryId: draft.id, name: draft.name, order: 0 });
          await DB.put('subItems',  { id: subItemId, categoryId: draft.id, subGroupId: groupId, name: draft.name, order: 0, budget: 0 });
        }
      }

      await reloadData();
      closeAllSheets();
      openCatManageSheet(catManageYear);
      renderCurrentPage();
      showToast(editing ? '수정되었습니다' : `'${draft.name}' 대분류가 추가되었습니다`);
    });
    if (editing) {
      sheet.querySelector('#catDelete').addEventListener('click', async () => {
        const usedCount = State.transactions.filter(t => t.categoryId === editing.id).length;
        const msg = usedCount > 0
          ? `이 대분류를 사용한 거래가 ${usedCount}건 있습니다. 삭제해도 기존 거래에는 그때의 분류명이 그대로 남아있어요. 계속할까요?`
          : '이 대분류를 삭제할까요? 하위 세부항목/이름도 함께 삭제됩니다.';
        if (!confirm(msg)) return;
        await ensureYearSnapshot(new Date().getFullYear());
        await DB.del('categories', editing.id);
        for (const s of subItemsOfCategory(editing.id)) await DB.del('subItems', s.id);
        for (const p of personsOfCategory(editing.id)) await DB.del('persons', p.id);
        await reloadData();
        closeAllSheets();
        openCatManageSheet(catManageYear);
        renderCurrentPage();
        showToast('삭제되었습니다');
      });
    }
  }
  paint();
  openSheet('catEditSheet');
}

/* =========================================================
   CAT SUB SHEET — 세부항목 관리 / 하위항목(이름) 관리
   ========================================================= */
function openCatSubSheet(categoryId, mode) {
  renderCatSubSheet(categoryId, mode);
  openSheet('catSubSheet');
}

function renderCatSubSheet(categoryId, mode) {
  const sheet = document.getElementById('catSubSheet');
  const cat = catById(categoryId);
  const isItems = mode === 'items';
  const list = isItems ? subItemsOfCategory(categoryId) : personsOfCategory(categoryId);
  const store = isItems ? 'subItems' : 'persons';
  const usageCountOf = (id) => isItems
    ? State.transactions.filter(t => t.categoryId === categoryId && (t.lines||[]).some(l => l.subItemId === id)).length
    : State.transactions.filter(t => t.personId === id).length;

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <button id="subBack" style="font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:2px;">${ICONS.chevLeft}이전</button>
      <h3>${cat.icon} ${isItems ? '세부항목' : '하위항목'} 관리</h3>
      <button id="subClose" class="sheet-close-btn">${ICONS.close}닫기</button>
    </div>
    <div class="sheet-body">
      <div class="card" style="padding:4px 14px;">
        ${list.length === 0 ? `<div style="font-size:13px;color:var(--text-3);padding:16px 2px;">등록된 ${isItems?'세부항목이':'하위항목이'} 없어요</div>` : list.map(item => `
          <div class="catrow" data-id="${item.id}" style="flex-wrap:wrap;gap:4px;">
            ${!isItems ? `<div class="ic" style="background:${hexToLight(cat.color)};font-size:16px;">👤</div>` : ''}
            <div class="nm" style="${isItems?'margin-left:2px;':''}flex:1;">${escapeHTML(item.name)}</div>
            ${isItems ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;">
              <label style="display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-2);cursor:pointer;">
                <input type="checkbox" data-primary-id="${item.id}" ${item.isPrimary!==false?'checked':''} style="width:15px;height:15px;cursor:pointer;">
                기본
              </label>
              <input type="text" inputmode="numeric" data-budget-id="${item.id}" value="${getBudget(item, catManageYear) ? fmtMoney(getBudget(item, catManageYear)) : ''}" placeholder="${catManageYear}년 예산" style="width:80px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:right;">
              <span style="color:var(--text-3);">원</span>
            </div>` : ''}
            <button class="grip" data-rename="${item.id}">${ICONS.edit}</button>
            <button class="grip" data-del="${item.id}" style="color:var(--expense);">${ICONS.trash}</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <input type="text" class="textinput" id="newSubName" placeholder="${isItems?'예: 추수감사':'예: 김철수'}" style="flex:1;">
        <button class="btn-primary" id="addSubBtn" style="width:auto; padding:0 18px; margin-top:0;">추가</button>
      </div>
    </div>
  `;

  sheet.querySelector('#subClose').addEventListener('click', closeAllSheets);

  // 소분류 연간 예산 입력 → 저장 + 대분류 자동 합산
  if (isItems) {
    sheet.querySelectorAll('[data-budget-id]').forEach(input => {
      attachMoneyInputFormatter(input, () => {});
      const saveBudget = async () => {
        const item = list.find(x => x.id === input.dataset.budgetId);
        if (!item) return;
        const newVal = Number(rawDigits(input.value)) || 0;
        if (getBudget(item, catManageYear) === newVal) return;
        setBudget(item, catManageYear, newVal);
        await DB.put('subItems', item);
        // 대분류 예산 = 소분류 예산 합산
        const allSubs = subItemsOfCategory(categoryId);
        const updatedSubs = allSubs.map(s => s.id === item.id ? item : s);
        const catTotal = updatedSubs.reduce((s, sub) => s + getBudget(sub, catManageYear), 0);
        const catObj = catById(categoryId);
        if (catObj) {
          setBudget(catObj, catManageYear, catTotal);
          await DB.put('categories', catObj);
        }
        await reloadData();
        renderCurrentPage();
        showToast('예산 저장됐어요');
      };
      input.addEventListener('blur', saveBudget);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { input.blur(); } });
    });
  }
  // isPrimary 체크박스 이벤트
  if (isItems) {
    sheet.querySelectorAll('[data-primary-id]').forEach(chk => {
      chk.addEventListener('change', async () => {
        const item = list.find(x => x.id === chk.dataset.primaryId);
        if (!item) return;
        item.isPrimary = chk.checked;
        await DB.put('subItems', item);
        await reloadData();
        showToast(chk.checked ? '기본 항목으로 설정됐어요' : '일반 항목으로 설정됐어요');
      });
    });
  }

  sheet.querySelector('#subBack').addEventListener('click', () => { closeAllSheets(); openCatEditSheet(categoryId); });

  sheet.querySelectorAll('[data-rename]').forEach(b => {
    b.addEventListener('click', async () => {
      const item = list.find(x => x.id === b.dataset.rename);
      const newName = prompt('이름 수정', item.name);
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed) { showToast('이름을 입력해주세요'); return; }
      item.name = trimmed;
      await DB.put(store, item);
      await reloadData();
      renderCatSubSheet(categoryId, mode);
      renderCurrentPage();
    });
  });

  sheet.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      const item = list.find(x => x.id === b.dataset.del);
      const used = usageCountOf(item.id);
      const msg = used > 0
        ? `이 ${isItems?'세부항목':'이름'}을 사용한 거래가 ${used}건 있습니다. 삭제해도 거래 기록은 남습니다. 계속할까요?`
        : `'${item.name}'을 삭제할까요?`;
      if (!confirm(msg)) return;
      await DB.del(store, item.id);
      await reloadData();
      renderCatSubSheet(categoryId, mode);
      renderCurrentPage();
      showToast('삭제되었습니다');
    });
  });

  sheet.querySelector('#addSubBtn').addEventListener('click', () => addSubOrPerson(sheet, categoryId, mode));
  sheet.querySelector('#newSubName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSubOrPerson(sheet, categoryId, mode);
  });
}

async function addSubOrPerson(sheet, categoryId, mode) {
  const isItems = mode === 'items';
  const input = sheet.querySelector('#newSubName');
  const name = input.value.trim();
  if (!name) { showToast('이름을 입력해주세요'); return; }
  const store = isItems ? 'subItems' : 'persons';
  const list = isItems ? subItemsOfCategory(categoryId) : personsOfCategory(categoryId);
  if (list.find(x => x.name === name)) { showToast('이미 있는 항목이에요'); return; }
  await DB.put(store, { id: uid(), categoryId, name, order: list.length });
  await reloadData();
  renderCatSubSheet(categoryId, mode);
}

/* =========================================================
   INIT
   ========================================================= */
async function initApp() {
  await DB.open();
  await seedIfEmpty();
  await migratePersonsToSubGroups();
  await migrateSubGroupsFromSubItems();
  await reloadData();
  renderShell();
  switchTab('home');
  // Firebase 관련은 렌더링 후 백그라운드 실행 (초기 로딩 속도 영향 없도록)
  setTimeout(async () => { await restoreAdminState(); applyLockState(); renderTabbar(); }, 500);
  setTimeout(() => checkMaturityAndNotify(false), 5000);
  if (USE_FIREBASE) setTimeout(async () => { await syncFromFirebase(); }, 3000);
}

document.addEventListener('DOMContentLoaded', initApp);
