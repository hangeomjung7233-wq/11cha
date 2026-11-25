'use strict';
/* ================= 설정 (여기만 고치면 됩니다) ================= */
const SIDE_MS  = 10 * 1000;   // 부작용 확인 알림 대기시간. 시연: 10초 → 실제 30분은 30*60*1000
const AGAIN_MS = 10 * 1000;   // "식사 후 30분 뒤에 다시 알려주기" 대기시간 (시연 10초)
const PROFILE  = { name: '김영희', age: 72 };   // 1번·6번의 "○○님"과 같은 이름
const KEY = 'ssukssuk_app_v1';

/* ================= 기본 도구 ================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOW = ['일','월','화','수','목','금','토'];
const p2 = n => String(n).padStart(2, '0');
function kst() { const n = new Date(); return new Date(n.getTime() + n.getTimezoneOffset() * 60000 + 9 * 3600000); } // 대한민국 표준시
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const pd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today = () => ymd(kst());
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const md = s => { const d = pd(s); return `${d.getMonth()+1}월 ${d.getDate()}일`; };
const mdw = s => `${md(s)}(${DOW[pd(s).getDay()]})`;
const mds = s => { const d = pd(s); return `${d.getMonth()+1}/${d.getDate()}`; };
function korTime(t) { const [h,m] = t.split(':').map(Number); return `${h<12?'오전':'오후'} ${h%12===0?12:h%12}:${p2(m)}`; }
const fmtN = n => Number.isInteger(n) ? String(n) : String(Math.round(n*10)/10);

const SLOT_T = { '아침': 480, '점심': 720, '저녁': 1080, '잠자기 전': 1320 };
const NAMED = Object.keys(SLOT_T);
const slotMin = k => SLOT_T[k] !== undefined ? SLOT_T[k] : (() => { const [h,m] = k.split(':').map(Number); return h*60+m; })();
const slotWord = k => SLOT_T[k] !== undefined ? (k === '잠자기 전' ? '잠자기 전 약' : k + '약') : korTime(k) + ' 약';
const slotByHour = h => h < 10 ? '아침' : h < 15 ? '점심' : h < 20 ? '저녁' : '잠자기 전';

/* ================= 데이터 (한 곳에서만 관리) ================= */
const defState = () => ({ meds:[], hospitals:[], appts:[], guardians:[], records:{}, start: today(), chat:[], greeted:false,
  side:[], reask:[], shown:{}, apptSeen:{}, scores:[], gAlerts:[], dAlerts:[] });
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return Object.assign(defState(), s); } catch (e) {} return defState(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
let S = load();
const photos = {};   // 약 사진은 메모리에만 보관 (localStorage에는 저장하지 않음)

/* 데모용 의약품 정보 (실제 서비스에서는 식약처 e약은요 / 약학정보원 API로 대체) */
const DRUGS = [
 { name:'타이레놀정 500mg', ingredient:'아세트아미노펜', strength:'500mg', form:'정제', effect:'열을 내리고 두통·치통·근육통 등 통증을 줄여 줘요.', usage:'1회 1~2정, 4~6시간 간격으로 물과 함께 드세요. 하루 최대 8정을 넘기지 마세요.', caution:'술을 자주 드시면 먼저 의사·약사와 상담하세요. 같은 성분의 다른 약과 함께 드시지 마세요.', side:'드물게 발진, 구역, 간 기능 이상이 생길 수 있어요.' },
 { name:'가스모틴정 5mg', ingredient:'모사프리드', strength:'5mg', form:'정제', effect:'소화가 안 되고 속이 더부룩한 증상을 좋게 해요.', usage:'처방대로 하루 3번 식사 전후에 드세요.', caution:'설사가 계속되면 의사와 상담하세요.', side:'설사, 입마름, 복통이 생길 수 있어요.' },
 { name:'암로디핀정 5mg', ingredient:'암로디핀베실산염', strength:'5mg', form:'정제', effect:'혈압을 낮추고 협심증 증상을 줄여 줘요.', usage:'하루 한 번 같은 시간에 드세요.', caution:'임의로 끊지 마세요. 어지러우면 천천히 일어나세요.', side:'발목 부종, 두통, 얼굴 화끈거림이 생길 수 있어요.' },
 { name:'아스피린프로텍트정 100mg', ingredient:'아스피린', strength:'100mg', form:'장용정', effect:'피가 굳는 것을 막아 심장·뇌혈관 질환을 예방해요.', usage:'하루 한 번 식후에 씹지 말고 삼키세요.', caution:'출혈 위험이 있어요. 수술·치과 치료 전 꼭 알리세요.', side:'속쓰림, 멍이 쉽게 드는 증상이 생길 수 있어요.' },
 { name:'메트포르민정 500mg', ingredient:'메트포르민염산염', strength:'500mg', form:'정제', effect:'혈당을 낮춰 당뇨병을 관리해요.', usage:'식사 직후에 드세요.', caution:'조영제 검사 전에는 의사에게 알리세요.', side:'메스꺼움, 설사, 입맛 변화가 생길 수 있어요.' },
 { name:'오메프라졸캡슐 20mg', ingredient:'오메프라졸', strength:'20mg', form:'캡슐', effect:'위산을 줄여 속쓰림과 위궤양을 치료해요.', usage:'아침 식사 전에 물과 함께 삼키세요.', caution:'오래 드실 때는 정기적으로 진료받으세요.', side:'두통, 복통, 설사가 생길 수 있어요.' }
];
const findDrug = n => { const k = String(n).replace(/\s/g,''); return DRUGS.find(d => k.startsWith(d.name.replace(/\s/g,'').slice(0,3))) || null; };
const HOSP = [
 { name:'행복내과의원', dept:'내과', addr:'서울 강남구 테헤란로 123', tel:'02-555-1234' },
 { name:'튼튼정형외과', dept:'정형외과', addr:'서울 송파구 올림픽로 45', tel:'02-418-2345' },
 { name:'서울대학교병원', dept:'내과·외과 외', addr:'서울 종로구 대학로 101', tel:'02-2072-2114' },
 { name:'밝은눈안과', dept:'안과', addr:'서울 마포구 월드컵로 67', tel:'02-333-4567' },
 { name:'미소치과의원', dept:'치과', addr:'서울 영등포구 국회대로 89', tel:'02-785-6789' },
 { name:'사랑가정의학과', dept:'가정의학과', addr:'서울 서초구 반포대로 12', tel:'02-537-7890' },
 { name:'한마음신경과', dept:'신경과', addr:'서울 노원구 동일로 210', tel:'02-935-8901' },
 { name:'행복약국 옆 건강내과', dept:'내과', addr:'경기 성남시 분당구 정자로 7', tel:'031-712-3456' }
];

/* 샘플 처방전 인식 (실제 서비스에서는 OCR 서비스 + 식약처/약학정보원 API 호출로 교체) */
function ocrPrescription(file) {
  return new Promise(res => setTimeout(() => res([
    { raw:'타이레놀정 500mg', match:DRUGS[0], dose:1, freq:3, days:7, times:['아침','점심','저녁'], how:'식후 30분' },
    { raw:'가스모틴정 5mg', match:DRUGS[1], dose:1, freq:2, days:14, times:['아침','저녁'], how:'식전' },
    { raw:'아○○정', match:null, cands:[DRUGS[2], DRUGS[3]], dose:1, freq:1, days:30, times:['아침'], how:'식후' }
  ].map(i => Object.assign({ checked:true, open:false }, i))), 2200));
}

/* ================= 계산 ================= */
function slotsAll() { const set = new Set(); S.meds.forEach(m => m.times.forEach(t => set.add(t)));
  if (!set.size) return ['아침']; return [...set].sort((a,b) => slotMin(a) - slotMin(b)); }
function dayStatus(date) {
  if (date < S.start) return null;
  const r = S.records[date] || {}, sl = slotsAll();
  if (sl.every(s => r[s] === true)) return 'O';
  if (sl.some(s => r[s] === false)) return 'X';
  if (date < today()) return 'X';
  return null;
}
const inRange = d => d >= S.start && d <= addDays(S.start, 34);
function okCount() { let c = 0; for (let i = 0; i < 35; i++) if (dayStatus(addDays(S.start, i)) === 'O') c++; return c; }
const stageOf = n => n >= 21 ? 3 : n >= 14 ? 2 : n >= 7 ? 1 : 0;
const STAGE_KEY = ['seed','sprout','bud','flower'];
const STAGE_NAME = ['씨앗 🌰','새싹 🌱','꽃봉오리 🌷','꽃 🌸'];
const STAGE_PLAIN = ['씨앗','새싹','꽃봉오리','꽃'];
const remainDays = n => n < 7 ? 7 - n : n < 14 ? 14 - n : n < 21 ? 21 - n : null;
const curPeriod = () => Math.max(0, Math.min(4, Math.floor(diff(S.start, today()) / 7)));
const pStart = p => addDays(S.start, p * 7);
const pDates = p => Array.from({length:7}, (_, i) => addDays(pStart(p), i));
function pStats(p) { let o = 0, x = 0; pDates(p).forEach(d => { const s = dayStatus(d); if (s === 'O') o++; if (s === 'X') x++; }); return { o, x, pct: Math.round(o / 7 * 100) }; }
const isRec = (slot, d = today()) => (S.records[d] || {})[slot] !== undefined;
function pillsLeft() { const r = S.records[today()] || {}; let n = 0; S.meds.forEach(m => m.times.forEach(t => { if (r[t] !== true) n++; })); return n; }
function medTaken(m) { let c = 0; for (const d in S.records) { if (d < m.start) continue; const r = S.records[d]; m.times.forEach(t => { if (r[t] === true) c++; }); } return Math.min(m.total, c * m.dose); }

let grow = null;
function record(date, slot, val) {
  S.records[date] = S.records[date] || {};
  if (S.records[date][slot] !== undefined) return false;   // 한 번 기록한 시간대는 다시 설정 불가
  const before = stageOf(okCount());
  S.records[date][slot] = val;
  if (val && date === today()) S.side.push({ id: uid(), at: Date.now() + SIDE_MS, slot, state: 'pending' });
  const after = stageOf(okCount());
  if (after > before) grow = { from: before, to: after };
  save(); return true;
}

/* ================= 화분 캐릭터 (모든 화면이 같은 함수) ================= */
function plantSVG(st, w) {
  if (typeof st === 'number') st = STAGE_KEY[st];
  const leaf = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="17" ry="8" fill="#7fc241" transform="rotate(${r} ${x} ${y})"/>`;
  let top = '';
  if (st === 'seed') top = `<ellipse cx="100" cy="104" rx="19" ry="12" fill="#3f2616"/><ellipse cx="103" cy="105" rx="9" ry="5.5" fill="#9a7440" transform="rotate(-35 103 105)"/><ellipse cx="105" cy="103" rx="3.5" ry="1.8" fill="#fff3cf" transform="rotate(-35 105 103)"/><path d="M100 88 L103 99" stroke="#f5c518" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>`;
  if (st === 'sprout') top = `<path d="M100 94 L100 58" stroke="#4f9a2b" stroke-width="6" stroke-linecap="round"/>${leaf(86,58,-28)}${leaf(114,58,28)}`;
  if (st === 'bud') top = `<path d="M100 94 L100 50" stroke="#4f9a2b" stroke-width="6" stroke-linecap="round"/>${leaf(86,70,-28)}${leaf(114,70,28)}<ellipse cx="100" cy="38" rx="12" ry="16" fill="#f48fb1"/><path d="M90 44 Q100 54 110 44" stroke="#5aa832" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (st === 'flower') { let pet = ''; for (let i = 0; i < 8; i++) pet += `<ellipse cx="100" cy="21" rx="9" ry="15" fill="#f78fb3" transform="rotate(${i*45} 100 38)"/>`;
    top = `<path d="M100 94 L100 52" stroke="#4f9a2b" stroke-width="6" stroke-linecap="round"/>${leaf(86,72,-28)}${leaf(114,72,28)}${pet}<circle cx="100" cy="38" r="11" fill="#ffd23f"/>`; }
  return `<svg class="plant" viewBox="0 0 200 215" ${w ? `width="${w}"` : 'width="100%"'} role="img" aria-label="쑥쑥이 화분">
  <path d="M48 126 L152 126 Q150 205 128 209 L72 209 Q50 205 48 126Z" fill="#e8a584"/>
  <ellipse cx="62" cy="165" rx="6" ry="24" fill="#fff" opacity=".35"/>
  <path d="M50 112 Q58 86 100 84 Q142 86 150 112Z" fill="#7a5230"/>
  ${top}
  <rect x="38" y="108" width="124" height="24" rx="12" fill="#f2bfa0"/>
  <rect x="46" y="111" width="108" height="5" rx="2.5" fill="#fbe6d6"/>
  <circle cx="80" cy="162" r="8" fill="#3b2a20"/><circle cx="120" cy="162" r="8" fill="#3b2a20"/>
  <circle cx="83" cy="159" r="2.8" fill="#fff"/><circle cx="123" cy="159" r="2.8" fill="#fff"/>
  <ellipse cx="66" cy="177" rx="9" ry="6" fill="#ff8f8f" opacity=".65"/><ellipse cx="134" cy="177" rx="9" ry="6" fill="#ff8f8f" opacity=".65"/>
  <path d="M88 174 Q100 192 112 174Z" fill="#b83a2e"/><ellipse cx="100" cy="183" rx="6.5" ry="4" fill="#ff8a80"/></svg>`;
}
const curSVG = w => plantSVG(stageOf(okCount()), w);

/* ================= 화면 이동 ================= */
let cur = 'home', chatOpts = null;
let F = null, rx = { mode:'form', items:[], editIdx:null };
let hq = '', hsel = null, aMonth = null, AF = null, gForm = null, rMonth = null;
let vp10 = 0, vp11 = 0, selScore = null, scoreDone = false, detailIdx = null;
let bannerCur = null;

function go(s, o) {
  chatOpts = o || null;
  if (s !== cur || s === 'med') {
    if (s === 'med') { F = newForm(); rx = { mode:'form', items:[], editIdx:null }; }
    if (s === 'hosp') { hq = ''; hsel = null; }
    if (s === 'care') gForm = null;
    if (s === 'appt') { const d = kst(); aMonth = { y:d.getFullYear(), m:d.getMonth() }; }
    if (s === 'rec') { const d = kst(); rMonth = { y:d.getFullYear(), m:d.getMonth() }; }
    if (s === 'side') { selScore = null; scoreDone = false; }
    if (s === 'list') detailIdx = null;
  }
  if (s === 'rec' || s === 'plant') { vp10 = vp11 = curPeriod(); }
  cur = s;
  if (s === 'chat') { enterChat(); bannerCur = null; }
  render(); window.scrollTo(0, 0);
}
const hdr = (t, to = 'home') => `<div class="hdr"><button class="back" aria-label="뒤로가기" onclick="go('${to}')">←</button><h1>${t}</h1></div>`;

function render() {
  const f = { home:rHome, med:rMed, hosp:rHosp, appt:rAppt, care:rCare, chat:rChat, side:rSide, plant:rPlant, rec:rRec, list:rList }[cur];
  $('#screen').innerHTML = f();
  const tabs = ['rec','plant','side'].includes(cur);
  const t = $('#tabs'); t.className = tabs ? 'on' : '';
  t.innerHTML = [['rec','📅','복약 기록'],['plant',null,'내 식물'],['side','🩺','부작용 상태']].map(([k, ic, lb]) =>
    `<button class="${cur===k?'on':''}" onclick="go('${k}')"><span class="ti">${ic || plantSVG(stageOf(okCount()), 36)}</span>${lb}</button>`).join('');
  $('#lower').style.display = cur === 'chat' ? 'none' : 'flex';
  renderLower(); renderBanner();
  if (cur === 'chat') window.scrollTo(0, document.body.scrollHeight);
  if (grow && cur !== 'chat') showGrow();
}
function showGrow() {
  if (!grow) return; const g = grow; grow = null;
  modal(`<div class="box pop"><div style="font-size:22px;font-weight:800;margin-bottom:6px">🎉 7일 복약 달성!<br>식물이 ${STAGE_PLAIN[g.from]}에서 ${STAGE_PLAIN[g.to]} 단계로 자랐어요!</div>${plantSVG(g.to)}<button class="btn" onclick="closeModal()">확인</button></div>`);
}
function modal(html) { const m = $('#modal'); m.innerHTML = html; m.classList.add('on'); }
function closeModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; }
let toastT;
function toast(t, ms = 2200) { const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => e.style.display = 'none', ms); }
function doneBox(text, ms, cb) { const d = $('#done'); d.innerHTML = `<div class="box doneBox"><div class="ck">✓</div><p>${text}</p></div>`; d.classList.add('on');
  setTimeout(() => { d.classList.remove('on'); d.innerHTML = ''; cb && cb(); }, ms); }

/* ================= 1번 홈 ================= */
function rHome() {
  const n = pillsLeft();
  return `<div class="home">
  <div class="hello"><div class="hi">안녕하세요, ${esc(PROFILE.name)}님</div><div class="sub">${n ? `오늘 복용할 약 <b>${n}개</b>가 있어요` : '오늘 복용할 약이 없어요'}</div></div>
  <div class="grid2">
    <button class="mcardBtn" onclick="go('med')"><span class="ic">💊</span>약물 등록</button>
    <button class="mcardBtn" onclick="go('hosp')"><span class="ic">🏥</span>병원 등록</button>
  </div>
  <div class="center">
    <button class="plantbtn" aria-label="내 복약 기록 보기" onclick="go('rec')">${curSVG()}</button>
    <button class="btn orange" onclick="go('list')">💊 나의 등록된 약물 보기</button>
  </div>
  <div class="grid2">
    <button class="mcardBtn" onclick="go('appt')"><span class="ic">📅</span>다음 진료 일정</button>
    <button class="mcardBtn" onclick="go('care')"><span class="ic">🤝</span>보호자·의료진 연계</button>
  </div>
  <div class="fabwrap"><button class="fab" aria-label="쑥쑥이 챗봇" onclick="go('chat')">${plantSVG('sprout')}쑥쑥이</button></div>
  </div>`;
}

/* ================= 2번 약물 등록 ================= */
const newForm = () => ({ name:'', photo:null, dose:null, freq:null, freqC:'', times:[], customOn:false, custom:[], days:null, daysC:'' });
const freqN = () => F.freq === 'c' ? Math.floor(+F.freqC) || 0 : (F.freq || 0);
const daysN = () => F.days === 'c' ? Math.floor(+F.daysC) || 0 : (F.days || 0);
const timesList = () => [...F.times, ...(F.customOn ? F.custom : [])];
const formValid = () => F.name.trim() && F.dose && freqN() > 0 && timesList().length && daysN() > 0;
const totalN = () => (F.dose || 0) * freqN() * daysN();
function totalText() { return F.dose && freqN() && daysN() ? `${fmtN(F.dose)}정 × 하루 ${freqN()}번 × ${daysN()}일 = 총 ${fmtN(totalN())}정` : '총 0정'; }
function updForm() { const t = $('#total'), b = $('#regBtn'); if (t) t.textContent = totalText(); if (b) b.disabled = !formValid(); }
function setF(k, v) { F[k] = v; render(); }
function togTime(t) { const i = F.times.indexOf(t); i < 0 ? F.times.push(t) : F.times.splice(i, 1); render(); }
function togCustom() { F.customOn = !F.customOn; render(); }
function pickCustom() { openTP(F.custom[0] || null, v => { F.custom = [v]; render(); }); }
const stepBar = n => `<div class="steps">${['① 처방전 촬영','② 약물 자동 확인','③ 내용 확인','④ 등록 완료'].map((t,i) => `<div class="${i+1===n?'on':''}">${t}</div>`).join('')}</div>`;
function readFile(file, cb) { const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); }
function onPhoto(inp) { const f = inp.files && inp.files[0]; if (!f) return; readFile(f, u => { F.photo = u; render(); }); }
function onRx(inp) { const f = inp.files && inp.files[0]; if (!f) return; rx.mode = 'analyzing'; render();
  ocrPrescription(f).then(items => { rx.items = items; rx.mode = 'confirm'; render(); }); }
function rMed() {
  if (rx.mode === 'analyzing') return hdr('약물 정보 등록') + `<div class="pad">${stepBar(2)}<div class="spin"><div class="big">🔍</div>처방전을 읽고 있어요<br>잠시만 기다려 주세요</div></div>`;
  if (rx.mode === 'confirm') return rConfirm();
  const opt = (on, fn, label) => `<button class="opt ${on?'on':''}" onclick="${fn}">${label}</button>`;
  return hdr('약물 정보 등록') + `<div class="pad">
  <input type="file" id="photoIn" accept="image/*" capture="environment" hidden onchange="onPhoto(this)">
  <input type="file" id="rxIn" accept="image/*" hidden onchange="onRx(this)">
  <button class="camera" onclick="document.getElementById('photoIn').click()">${F.photo ? `<img src="${F.photo}" alt="">` : '<span class="big">📷</span>'}약물 사진을 찍어주세요</button>
  <div class="flow"><span class="s">① 약물 사진</span><i>→</i><span class="s">② 처방전</span><i>→</i><span class="s">③ 자동 입력</span></div>
  <button class="btn orange rxbtn" onclick="document.getElementById('rxIn').click()">🧾 처방전을 촬영하면 입력이 돼요</button>
  <div class="q">약물 이름</div>
  <input type="text" placeholder="예: 타이레놀" value="${esc(F.name)}" oninput="F.name=this.value;updForm()">
  <div class="q">한 번에 몇 정 드세요?</div>
  <div class="opts">${[0.5,1,2].map(v => opt(F.dose===v, `setF('dose',${v})`, fmtN(v)+'정')).join('')}</div>
  <div class="q">하루에 몇 번 드세요?</div>
  <div class="opts">${[1,2,3].map(v => opt(F.freq===v, `setF('freq',${v})`, v+'번')).join('')}${opt(F.freq==='c', `setF('freq','c')`, '직접 입력')}</div>
  ${F.freq === 'c' ? `<div style="margin-top:10px"><input type="number" inputmode="numeric" min="1" placeholder="하루 몇 번인가요?" value="${esc(F.freqC)}" oninput="F.freqC=this.value;updForm()"></div>` : ''}
  <div class="q">언제 드세요?</div>
  <div class="opts">${NAMED.map(t => opt(F.times.includes(t), `togTime('${t}')`, t)).join('')}${opt(F.customOn, 'togCustom()', '직접 입력')}</div>
  ${F.customOn ? `<div style="margin-top:10px"><button class="timeBtn ${F.custom[0]?'has':''}" onclick="pickCustom()">${F.custom[0] ? korTime(F.custom[0]) : '원하는 시간 선택'}</button></div>` : ''}
  <div class="q">며칠 동안 드세요?</div>
  <div class="opts">${[7,14,30].map(v => opt(F.days===v, `setF('days',${v})`, v+'일')).join('')}${opt(F.days==='c', `setF('days','c')`, '직접 입력')}</div>
  ${F.days === 'c' ? `<div style="margin-top:10px"><input type="number" inputmode="numeric" min="1" placeholder="며칠 드시나요?" value="${esc(F.daysC)}" oninput="F.daysC=this.value;updForm()"></div>` : ''}
  <div class="total" id="total">${totalText()}</div>
  <button class="btn" id="regBtn" ${formValid() ? '' : 'disabled'} onclick="submitForm()">${rx.editIdx !== null ? '수정 완료' : '등록하기'}</button>
  <div class="note">입력한 정보가 맞는지 확인해주세요</div></div>`;
}
function addMed(o) {
  if (!S.meds.length && !Object.keys(S.records).length) S.start = today();
  const info = o.info || findDrug(o.name);
  S.meds.push({ id: uid(), name: o.name, strength: (info && info.strength) || o.strength || '', dose: o.dose, freq: o.freq, times: o.times.slice(), days: o.days,
    total: o.dose * o.freq * o.days, start: today(), regAt: Date.now(), info: info || null });
  if (o.photo) photos[o.name] = o.photo;
}
function submitForm() {
  if (!formValid()) return;
  const times = timesList();
  if (rx.editIdx !== null) { const it = rx.items[rx.editIdx];
    it.match = Object.assign({}, it.match || {}, { name: F.name.trim() }); it.dose = F.dose; it.freq = freqN(); it.days = daysN(); it.times = times;
    rx.editIdx = null; rx.mode = 'confirm'; render(); return; }
  addMed({ name: F.name.trim(), dose: F.dose, freq: freqN(), days: daysN(), times, photo: F.photo });
  save(); go('home');
}
function rConfirm() {
  const ok = rx.items.some(i => i.checked && i.match) && !rx.items.some(i => i.checked && !i.match);
  return hdr('약물 정보 등록') + `<div class="pad">${stepBar(3)}<h2 style="margin:0 0 12px;font-size:23px">처방전에서 다음 약물을 확인했습니다</h2>
  ${rx.items.map((it, i) => {
    if (!it.match) return `<div class="rx"><div class="warn">약물명을 정확하게 확인하지 못했습니다.<br>직접 확인해주세요.</div>
      <div style="font-weight:700">읽은 글자: ${esc(it.raw)}</div>
      ${it.cands.map((c, j) => `<button class="cand" onclick="pickCand(${i},${j})">${esc(c.name)}</button>`).join('')}
      <input type="text" id="man${i}" placeholder="약물명을 직접 입력"><button class="btn sm" style="margin-top:8px;width:100%" onclick="manualName(${i})">이 이름으로 확인</button></div>`;
    const m = it.match;
    return `<div class="rx ${it.checked?'sel':''}"><div class="nm"><input type="checkbox" ${it.checked?'checked':''} onchange="rx.items[${i}].checked=this.checked;render()" aria-label="선택">${esc(m.name)}</div>
      <div class="ln">${fmtN(it.dose)}정 · 하루 ${it.freq}번 · ${it.days}일${it.how ? ' · ' + esc(it.how) : ''}</div>
      <div class="row"><button onclick="rx.items[${i}].open=!rx.items[${i}].open;render()">정보 확인</button><button onclick="editRx(${i})">수정</button></div>
      ${it.open ? `<div class="info"><p><b>성분명</b> ${esc(m.ingredient || '확인 필요')}</p><p><b>함량</b> ${esc(m.strength || '확인 필요')}</p><p><b>제형</b> ${esc(m.form || '확인 필요')}</p><p><b>효능·효과</b> ${esc(m.effect || '확인 필요')}</p><p><b>복용 방법</b> ${esc(m.usage || '처방전대로 드세요')}</p><p><b>주의사항</b> ${esc(m.caution || '의사·약사에게 확인하세요')}</p></div>` : ''}</div>`;
  }).join('')}
  <button class="btn" ${ok ? '' : 'disabled'} onclick="confirmRx()">이대로 약물 등록하기</button>
  <div class="note">처방전 내용을 우선으로 저장돼요</div></div>`;
}
function pickCand(i, j) { rx.items[i].match = rx.items[i].cands[j]; render(); }
function manualName(i) { const v = $('#man' + i).value.trim(); if (!v) return toast('약물명을 입력해주세요'); rx.items[i].match = { name: v, custom: true }; render(); }
function editRx(i) { const it = rx.items[i]; F = newForm(); F.name = it.match.name; F.dose = it.dose; F.freq = [1,2,3].includes(it.freq) ? it.freq : 'c'; F.freqC = it.freq;
  F.times = it.times.filter(t => NAMED.includes(t)); const c = it.times.filter(t => !NAMED.includes(t)); F.customOn = c.length > 0; F.custom = c;
  F.days = [7,14,30].includes(it.days) ? it.days : 'c'; F.daysC = it.days; rx.editIdx = i; rx.mode = 'form'; render(); window.scrollTo(0, 0); }
function confirmRx() {
  rx.items.filter(i => i.checked && i.match).forEach(i => addMed({ name: i.match.name, dose: i.dose, freq: i.freq, days: i.days, times: i.times, info: i.match.ingredient ? i.match : null }));
  save(); doneBox('약물 등록이 완료되었습니다', 1500, () => go('home'));
}

/* ================= 시간 선택창 (오전/오후 + 12시간제) ================= */
let tp = null;
function openTP(init, cb) { let h = 9, m = 0, ap = '오전'; if (init) { const [H, M] = init.split(':').map(Number); ap = H < 12 ? '오전' : '오후'; h = H % 12 === 0 ? 12 : H % 12; m = M; }
  tp = { ap, h, m, cb }; drawTP(); }
function drawTP() {
  modal(`<div class="box"><h2>시간 선택</h2>
  <div class="tpg" style="grid-template-columns:1fr 1fr">${['오전','오후'].map(a => `<button class="${tp.ap===a?'on':''}" onclick="tp.ap='${a}';drawTP()">${a}</button>`).join('')}</div>
  <div style="font-weight:700;margin-top:8px">시</div><div class="tpg" style="grid-template-columns:repeat(6,1fr)">${Array.from({length:12}, (_, i) => i+1).map(h => `<button class="${tp.h===h?'on':''}" onclick="tp.h=${h};drawTP()">${h}</button>`).join('')}</div>
  <div style="font-weight:700">분</div><div class="tpg" style="grid-template-columns:repeat(6,1fr)">${Array.from({length:12}, (_, i) => i*5).map(m => `<button class="${tp.m===m?'on':''}" onclick="tp.m=${m};drawTP()">${p2(m)}</button>`).join('')}</div>
  <div class="btnrow"><button class="btn gray" onclick="closeModal();reopen()">취소</button><button class="btn" onclick="applyTP()">확인</button></div></div>`);
}
let reopenFn = null; const reopen = () => { if (reopenFn) { const f = reopenFn; reopenFn = null; f(); } };
function applyTP() { let h = tp.h % 12; if (tp.ap === '오후') h += 12; const v = `${p2(h)}:${p2(tp.m)}`; const cb = tp.cb; closeModal(); cb(v); reopenFn = null; }

/* ================= 3번 병원 등록 ================= */
function hres() {
  const q = hq.trim(); if (!q) return '';
  const r = HOSP.map((h, i) => ({ h, i })).filter(x => x.h.name.includes(q) || x.h.dept.includes(q));
  if (!r.length) return '<div class="empty" style="padding:30px 0">검색 결과가 없어요</div>';
  return r.map(({ h, i }) => `<button class="hcard ${hsel===i?'sel':''}" onclick="hsel=${i};upd3()"><div class="t">${esc(h.name)}</div><span class="dept">${esc(h.dept)}</span><div class="a">${esc(h.addr)}</div><div>📞 ${esc(h.tel)}</div>${hsel===i?'<div class="chk">✓</div>':''}</button>`).join('');
}
function upd3() { $('#hres').innerHTML = hres(); $('#hreg').disabled = hsel === null; }
function rHosp() {
  return hdr('병원 등록') + `<div class="pad" style="flex:1;padding-bottom:0"><div class="search"><span style="font-size:28px">🔍</span><input type="search" placeholder="다니는 병원을 검색해주세요" value="${esc(hq)}" oninput="hq=this.value;hsel=null;upd3()"></div><div id="hres">${hres()}</div></div>
  <div class="sticky"><button class="btn" id="hreg" ${hsel===null?'disabled':''} onclick="regHosp()">이 병원 등록하기</button></div>`;
}
function regHosp() {
  const h = HOSP[hsel]; if (!h) return;
  if (!S.hospitals.some(x => x.name === h.name)) S.hospitals.push({ id: uid(), name: h.name, dept: h.dept, addr: h.addr, tel: h.tel });
  save(); toast(`${h.name}이 등록되었습니다`, 2000); setTimeout(() => go('home'), 1300);
}

/* ================= 4번 다음 진료 일정 ================= */
const apDT = a => a.date + ' ' + a.time;
function upcoming() { const t = today(); return S.appts.filter(a => a.date >= t).sort((a, b) => apDT(a).localeCompare(apDT(b))); }
function rAppt() {
  const { y, m } = aMonth, first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate(), t = today();
  let cells = DOW.map(d => `<div class="dw">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let d = 1; d <= last; d++) { const ds = `${y}-${p2(m+1)}-${p2(d)}`; cells += `<div class="cd ${ds===t?'today':''}">${d}${S.appts.some(a => a.date === ds) ? '<span>🏥</span>' : ''}</div>`; }
  const up = upcoming(), n = up[0];
  const card = (a, near) => near ? `<div class="big-card"><div class="lb">가장 가까운 진료 일정</div><div class="hn">${esc(a.hospital)}</div><div class="dd">${mdw(a.date).replace('(', ' ').replace(')', '요일')}</div><div class="dd">${korTime(a.time)}</div><div class="dd">${esc(a.dept)}</div><button class="btn sm gray" style="margin-top:10px" onclick="openAppt('${a.id}')">수정</button></div>`
    : `<div class="sch"><div class="tx"><b>${esc(a.hospital)}</b><br>${mdw(a.date)} ${korTime(a.time)}<br>${esc(a.dept)}</div><button class="btn sm gray" onclick="openAppt('${a.id}')">수정</button></div>`;
  return hdr('다음 외래 일정') + `<div class="pad" style="flex:1;padding-bottom:0"><div class="cal ap"><div class="calh"><button class="circ" onclick="aMove(-1)" aria-label="이전 달">‹</button>${y}년 ${m+1}월<button class="circ" onclick="aMove(1)" aria-label="다음 달">›</button></div><div class="cg">${cells}</div></div>
  ${n ? card(n, true) : '<div class="empty" style="padding:30px 0">예정된 진료가 없어요</div>'}${up.slice(1).map(a => card(a, false)).join('')}</div>
  <div class="sticky"><button class="btn orange" onclick="openAppt()">➕ 진료 일정 추가하기</button></div>`;
}
function aMove(d) { let { y, m } = aMonth; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } aMonth = { y, m }; render(); }
function openAppt(id) {
  const a = id ? S.appts.find(x => x.id === id) : null;
  if (!AF || AF.reset !== false) AF = a ? Object.assign({}, a) : { id: null, hospital: '', date: today(), time: '', dept: '' };
  drawAppt();
}
function drawAppt() {
  modal(`<div class="box"><h2>${AF.id ? '진료 일정 수정' : '진료 일정 추가'}</h2>
  <div class="f"><label>병원</label><input list="hl" value="${esc(AF.hospital)}" placeholder="병원 이름" oninput="AF.hospital=this.value"><datalist id="hl">${S.hospitals.map(h => `<option value="${esc(h.name)}">`).join('')}</datalist></div>
  <div class="f"><label>날짜</label><input type="date" value="${AF.date}" oninput="AF.date=this.value"></div>
  <div class="f"><label>시간</label><button class="timeBtn ${AF.time?'has':''}" onclick="apTime()">${AF.time ? korTime(AF.time) : '진료 시간'}</button></div>
  <div class="f"><label>진료과</label><input value="${esc(AF.dept)}" placeholder="예: 내과" oninput="AF.dept=this.value"></div>
  <div class="btnrow"><button class="btn gray" onclick="AF=null;closeModal()">취소</button><button class="btn" onclick="saveAppt()">저장</button></div></div>`);
}
function apTime() { reopenFn = drawAppt; openTP(AF.time || null, v => { AF.time = v; drawAppt(); }); }
function saveAppt() {
  if (!AF.hospital.trim() || !AF.date || !AF.time || !AF.dept.trim()) return toast('병원, 날짜, 시간, 진료과를 모두 입력해주세요');
  const edit = !!AF.id;
  if (edit) { const i = S.appts.findIndex(x => x.id === AF.id); S.appts[i] = { id: AF.id, hospital: AF.hospital.trim(), date: AF.date, time: AF.time, dept: AF.dept.trim() }; }
  else S.appts.push({ id: uid(), hospital: AF.hospital.trim(), date: AF.date, time: AF.time, dept: AF.dept.trim() });
  AF = null; save(); closeModal(); render();
  doneBox(edit ? '일정 수정이 완료되었습니다' : '진료 일정 등록이 완료되었습니다', 3000);
}

/* ================= 5번 보호자·의료진 연계 ================= */
function rCare() {
  return hdr('보호자 연계 & 의료진 연계') + `<div class="half"><div class="rowh"><h2>등록된 보호자</h2><button class="addb" onclick="gForm={rel:'',name:'',phone:''};render()"><span class="im">👨‍👩‍👧</span>보호자 추가하기</button></div>
  ${gForm ? `<div class="gform"><div class="f"><label>환자와의 관계</label><input value="${esc(gForm.rel)}" placeholder="예: 아들" oninput="gForm.rel=this.value"></div>
   <div class="f"><label>보호자 이름</label><input value="${esc(gForm.name)}" placeholder="이름" oninput="gForm.name=this.value"></div>
   <div class="f"><label>전화번호</label><input type="tel" inputmode="tel" value="${esc(gForm.phone)}" placeholder="010-0000-0000" oninput="gForm.phone=this.value"></div>
   <div class="btnrow"><button class="btn gray" onclick="gForm=null;render()">취소</button><button class="btn" onclick="regGuardian()">등록</button></div></div>` : ''}
  ${S.guardians.map(g => `<div class="pcard"><span>${esc(g.rel)} ${esc(g.name)}님</span><a class="btn sm" href="tel:${esc(g.phone)}">📞 연락하기</a></div>`).join('')}</div>
  <div class="half" style="flex:1"><div class="rowh"><h2>등록된 병원</h2></div>
  ${S.hospitals.map(h => `<div class="pcard"><span>${esc(h.name)}</span><a class="btn sm" href="tel:${esc(h.tel)}">📞 문의하기</a></div>`).join('')}</div>`;
}
function regGuardian() {
  if (!gForm.rel.trim() || !gForm.name.trim() || !gForm.phone.trim()) return toast('관계, 이름, 전화번호를 모두 입력해주세요');
  S.guardians.push({ id: uid(), rel: gForm.rel.trim(), name: gForm.name.trim(), phone: gForm.phone.trim() });
  gForm = null; save(); render(); doneBox('보호자 등록이 완료되었습니다', 3000);
}

/* ================= 6~8번 쑥쑥이 챗봇 ================= */
const SYMS = [['어지러움','😵‍💫'],['졸림','😴'],['두통','🤕'],['속쓰림','🔥'],['메스꺼움','🤢'],['발진이나 가려움','🔴'],['호흡곤란','😮‍💨'],['심한 복통','😣'],['없음','👍']];
const hasUnanswered = () => S.chat.some(m => m.interactive && !m.done);
const unansweredSlot = s => S.chat.some(m => m.k === 'ask' && !m.done && m.slot === s);
const bot = (text, extra) => S.chat.push(Object.assign({ from:'bot', k:'text', text }, extra || {}));
const usr = text => S.chat.push({ from:'user', k:'text', text });
function askSlot(slot) {
  const names = S.meds.filter(m => m.times.includes(slot)).map(m => m.name); if (!names.length) return;
  S.chat.push({ from:'bot', k:'ask', interactive:true, done:false, slot, names, text:`${slotWord(slot)} 드셨나요?` });
}
function askSide(id) {
  const it = S.side.find(x => x.id === id); if (!it || it.state !== 'pending') return; it.state = 'asked';
  S.chat.push({ from:'bot', k:'side', interactive:true, done:false, sideId:id, text:'약을 복용하신지 30분이 지났습니다. 불편하신 점이 있으신가요?' });
}
function nextSlot(first) {
  if (!S.meds.length) return null;
  const left = slotsAll().filter(s => !isRec(s) && !S.reask.some(r => r.slot === s && r.state === 'pending'));
  if (!left.length) return null;
  if (first) { const w = slotByHour(kst().getHours()); if (left.includes(w)) return w; }
  return left[0];
}
function enterChat() {
  const o = chatOpts || {}; let first = false;
  if (!S.greeted) { bot(`안녕하세요? 저는 ${PROFILE.name}님의 건강 길잡이 쑥쑥이라고 해요!`); S.greeted = true; first = true; }
  if (o.side) askSide(o.side);
  if (bannerCur && bannerCur.kind === 'side') askSide(bannerCur.id);
  chatTick();
  if (o.slot) { if (!unansweredSlot(o.slot) && !isRec(o.slot)) askSlot(o.slot); }
  else if (!hasUnanswered()) { const s = nextSlot(first); if (s) askSlot(s); }
  save();
}
function chatTick() {
  let ch = false; const n = Date.now();
  for (const it of S.side) if (it.state === 'pending' && it.at <= n) { askSide(it.id); ch = true; }
  for (const r of S.reask) if (r.state === 'pending' && r.at <= n) { r.state = 'done'; if (!isRec(r.slot) && !unansweredSlot(r.slot)) askSlot(r.slot); ch = true; }
  const s = eligibleSlot();
  if (s) { (S.shown[today()] = S.shown[today()] || []).push(s); if (!unansweredSlot(s)) askSlot(s); ch = true; }
  return ch;
}
function medCards(names) { return names.map(n => `<div class="mcard"><div class="mph">${photos[n] ? `<img src="${photos[n]}" alt="">` : '💊'}</div><div class="mname">${esc(n)}</div></div>`).join(''); }
function msgHTML(m, i) {
  if (m.k === 'text') return m.from === 'user' ? `<div class="row user"><div class="bub">${esc(m.text)}</div></div>` : `<div class="row"><div class="av">${plantSVG('sprout')}</div><div class="bub">${esc(m.text)}</div></div>`;
  let body = `<div class="bub">${esc(m.text)}</div>`;
  if (m.k === 'ask') { body += medCards(m.names); if (!m.done) body += `<button class="pill g" onclick="ansAsk(${i},true)">예</button><button class="pill n" onclick="ansAsk(${i},false)">아니요</button>`; }
  if (m.k === 'meal' && !m.done) body += `<button class="pill n" onclick="ansMeal(${i},true)">아직 안 먹었어요</button><button class="pill g" onclick="ansMeal(${i},false)">식사했어요</button>`;
  if (m.k === 'btn' && !m.done) body += `<button class="pill ${m.act==='again'?'o':'g'}" onclick="btnAct(${i})">${esc(m.label)}</button>`;
  if (m.k === 'side' && !m.done) body += `<div class="sym">${SYMS.map(([n, e]) => `<button onclick="pickSide(${i},'${n}')"><span class="e">${e}</span>${n}</button>`).join('')}</div>
    <div class="sidein"><input id="sideTxt${i}" placeholder="직접 적어주세요"><button onclick="pickSide(${i},null)">보내기</button></div>`;
  return `<div class="row"><div class="av">${plantSVG('sprout')}</div><div class="blk">${body}</div></div>`;
}
function rChat() { return `<div class="chatwrap"><div class="chathdr"><button class="back" aria-label="뒤로가기" onclick="go('home')">←</button><h1>쑥쑥이</h1></div><div class="chatbody">${S.chat.map(msgHTML).join('')}</div></div>`; }
function ansAsk(i, yes) {
  const m = S.chat[i]; if (m.done) return; m.done = true; usr(yes ? '예' : '아니요');
  if (yes) { record(today(), m.slot, true); bot('잘하셨어요! 복용을 기록했어요.'); }
  else S.chat.push({ from:'bot', k:'meal', interactive:true, done:false, slot:m.slot, text:'혹시 식사를 안 하셨나요?' });
  save(); render();
}
function ansMeal(i, notYet) {
  const m = S.chat[i]; if (m.done) return; m.done = true; usr(notYet ? '아직 안 먹었어요' : '식사했어요');
  if (notYet) { bot('아, 식사 전이시군요! 빈속에 약을 드시면 속이 쓰릴 수 있어요. 식사를 가볍게 하신 후에 약을 드시는 것이 좋답니다.');
    S.chat.push({ from:'bot', k:'btn', interactive:true, done:false, act:'again', slot:m.slot, label:'식사 후 30분 뒤에 다시 알려주기', text:'식사 후에 약을 드시면 알림을 다시 보내드릴까요?' }); }
  else { bot('식사를 챙겨 드셨군요! 다행이에요. 그럼 지금 바로 물과 함께 약을 드셔주세요.');
    S.chat.push({ from:'bot', k:'btn', interactive:true, done:false, act:'taken', slot:m.slot, label:'약 복용 완료했어요', text:'드신 후에 아래 버튼을 눌러 주세요.' }); }
  save(); render();
}
function btnAct(i) {
  const m = S.chat[i]; if (m.done) return; m.done = true; usr(m.label);
  if (m.act === 'again') { S.reask.push({ id: uid(), at: Date.now() + AGAIN_MS, slot: m.slot, state: 'pending' }); bot('알겠어요! 시간이 되면 다시 여쭤볼게요.'); }
  else { record(today(), m.slot, true); bot('복용을 기록했어요. 잘하셨어요!'); }
  save(); render();
}
function pickSide(i, name) {
  const m = S.chat[i]; if (m.done) return;
  if (name === null) { name = ($('#sideTxt' + i).value || '').trim(); if (!name) return toast('불편한 점을 적어주세요'); }
  m.done = true; usr(name); bot('이어서 불편한 정도를 점수로 골라 주세요.');
  const it = S.side.find(x => x.id === m.sideId); if (it) it.state = 'closed';
  save(); render();
  setTimeout(() => { if (cur === 'chat') go('side'); }, 1500);
}

/* ================= 상단 알림 ================= */
function eligibleSlot() {
  if (!S.meds.length) return null;
  const t = today(), shown = S.shown[t] || [], rec = S.records[t] || {}, nk = kst(), now = Date.now();
  const mid = now - ((nk.getHours() * 60 + nk.getMinutes()) * 60000 + nk.getSeconds() * 1000 + nk.getMilliseconds());
  for (const s of slotsAll()) {
    if (rec[s] !== undefined || shown.includes(s)) continue;
    const abs = mid + slotMin(s) * 60000; if (abs > now) continue;
    const regs = S.meds.filter(m => m.times.includes(s)).map(m => m.regAt); if (!regs.length) continue;
    if (abs <= Math.min(...regs)) continue;      // 등록 전에 이미 지난 시각은 알리지 않음
    return s;
  }
  return null;
}
function sideDue() { return S.side.find(x => x.state === 'pending' && x.at <= Date.now()); }
function nextBanner() {
  const sd = sideDue();
  if (sd && cur !== 'side') return { kind:'side', id: sd.id, text:'약을 복용하신지 30분이 지났습니다. 불편하신 점이 있으신가요?' };
  const t = today();
  const r = S.reask.find(x => x.state === 'pending' && x.at <= Date.now());
  if (r) { if (isRec(r.slot)) r.state = 'done'; else { r.state = 'shown'; save(); return { kind:'med', slot:r.slot, text:`${slotWord(r.slot)} 드셨나요?` }; } }
  const s = eligibleSlot();
  if (s) { (S.shown[t] = S.shown[t] || []).push(s); save(); return { kind:'med', slot:s, auto:true, text:`${slotWord(s)} 드실 시간이에요. 약 드셨나요?` }; }
  const tm = addDays(t, 1), a = S.appts.find(x => x.date === tm && !S.apptSeen[x.id + x.date]);
  if (a) return { kind:'appt', id:a.id + a.date, text:`내일 ${a.hospital} 진료가 있어요` };
  return null;
}
function undoBanner(b) { if (b.kind === 'med' && b.auto) { const l = S.shown[today()] || []; const i = l.indexOf(b.slot); if (i >= 0) l.splice(i, 1); save(); } }
function renderBanner() {
  const e = $('#banner'); if (!bannerCur || cur === 'chat') { e.innerHTML = ''; return; }
  const sig = bannerCur.kind + bannerCur.text; if (e.dataset.sig === sig && e.innerHTML) return; e.dataset.sig = sig;
  e.innerHTML = `<div class="bn" onclick="bannerTap()"><div class="bnic">${plantSVG('sprout')}</div><div class="bntx"><b>쑥쑥이</b>${esc(bannerCur.text)}</div><button class="bnx" aria-label="닫기" onclick="event.stopPropagation();bannerClose()">✕</button></div>`;
}
function bannerTap() {
  const b = bannerCur; if (!b) return; bannerCur = null; $('#banner').innerHTML = ''; $('#banner').dataset.sig = '';
  if (b.kind === 'side') go('chat', { side: b.id });
  else if (b.kind === 'med') go('chat', { slot: b.slot });
  else { S.apptSeen[b.id] = 1; save(); go('appt'); }
}
function bannerClose() {
  const b = bannerCur; if (!b) return; bannerCur = null; $('#banner').innerHTML = ''; $('#banner').dataset.sig = '';
  if (b.kind === 'side') { const it = S.side.find(x => x.id === b.id); if (it) it.state = 'closed'; }
  if (b.kind === 'appt') S.apptSeen[b.id] = 1;
  save();
}
function tick() {
  if (cur === 'chat') { if (chatTick()) { save(); render(); } bannerCur = null; renderBanner(); return; }
  if (bannerCur && bannerCur.kind !== 'side' && sideDue() && cur !== 'side') { undoBanner(bannerCur); bannerCur = null; }
  if (bannerCur && bannerCur.kind === 'side') { const it = S.side.find(x => x.id === bannerCur.id); if (!it || it.state !== 'pending' || cur === 'side') bannerCur = null; }
  if (!bannerCur) bannerCur = nextBanner();
  renderBanner();
}

/* ================= 9번 부작용 상태 ================= */
const FACES = ['😀','🙂','😐','😟','😣'], COLS = ['#2e9d46','#8bc34a','#e6b800','#fb8c00','#e53935'];
const DESC = ['증상이 없어요','조금 불편해요','보통으로 불편해요','많이 불편해요','매우 심하게 불편해요'];
function rSide() {
  if (scoreDone) return `<div class="thanks"><div style="font-size:70px">😊</div><div>답해 주셔서 감사합니다</div><div>오늘 상태가 잘 기록되었어요</div></div>`;
  return hdr('약을 드신 지 30분 지났어요<br>지금 부작용 상태는 어떠세요?') .replace('<h1>', '<h1 style="font-size:22px">') + `<div class="pad"><div style="font-weight:700;font-size:20px">불편한 정도에 맞는 얼굴을 눌러 주세요</div>
  <div class="scale">${FACES.map((f, i) => `<button class="sc ${selScore===i+1?'on':''}" style="border-color:${COLS[i]};${selScore===i+1?`background:${COLS[i]}33`:''}" onclick="selScore=${i+1};render()" aria-label="${i+1}점"><span class="f">${f}</span><span class="n" style="color:${COLS[i]}">${i+1}</span></button>`).join('')}</div>
  ${selScore ? `<div class="picked"><span class="f">${FACES[selScore-1]}</span><span class="n">${selScore}점</span><span class="d">${DESC[selScore-1]}</span></div>` : '<div class="picked"><span class="d" style="color:var(--muted)">얼굴을 눌러 주세요</span></div>'}
  <div class="ends"><span>1 증상 없음</span><span>5 증상 매우 심함</span></div>
  <button class="btn" ${selScore?'':'disabled'} onclick="submitScore()">선택 완료</button></div>`;
}
function submitScore() {
  if (!selScore) return; const t = today(), sc = selScore;
  S.scores.push({ date:t, score:sc, ts:Date.now() });
  if (sc >= 3) {
    S.guardians.forEach(g => S.gAlerts.push({ id:uid(), gid:g.id, date:t, score:sc }));
    if (S.scores.filter(x => x.date === t && x.score >= 3).length >= 3)
      S.hospitals.forEach(h => { if (!S.dAlerts.some(a => a.hid === h.id && a.date === t)) S.dAlerts.push({ id:uid(), hid:h.id, date:t }); });
  }
  save(); scoreDone = true; render(); setTimeout(() => { if (cur === 'side') go('home'); }, 2800);
}

/* ================= 10번 내 식물 ================= */
function weekNav(p, set, kind) {
  const c = curPeriod(), title = p === c ? (kind === 'plant' ? '이번 주 복약 달성률' : '이번 주기 복약 달성률') : `${p+1}주차 복약 달성률`, ds = pDates(p);
  return `<div class="wk"><button class="circ" ${p<=0?'disabled':''} onclick="${set}(${p-1})" aria-label="이전 주차">‹</button><div class="mid"><h2>${title}</h2><div class="sm">${p+1}주차 · ${mds(ds[0])}~${mds(ds[6])}${kind==='plant' ? ' (7일 단위로 한 달 진행)' : ''}</div></div><button class="circ" ${p>=4?'disabled':''} onclick="${set}(${p+1})" aria-label="다음 주차">›</button></div>`;
}
const setV10 = p => { vp10 = p; render(); }, setV11 = p => { vp11 = p; render(); };
function rPlant() {
  const st = pStats(vp10), n = okCount(), s = stageOf(n), r = remainDays(n), t = today();
  const dots = pDates(vp10).map(d => { const x = dayStatus(d); return `<div class="dot"><div class="c ${x||''} ${d===t?'today':''}">${x==='O'?'✓':x==='X'?'×':''}</div><span>${mds(d)}</span></div>`; }).join('');
  return hdr('내 식물') + `<div class="pad" style="padding-top:6px">${weekNav(vp10, 'setV10', 'plant')}<div class="bigfrac">${st.o}/7일</div><div class="pct">${st.pct}%</div><div class="bar"><i style="width:${st.pct}%"></i></div>
  <div class="dots">${dots}</div><div class="plantbig"><button aria-label="복약 기록으로" onclick="go('rec')">${curSVG()}</button></div>
  <div class="stage"><p>현재 단계: ${STAGE_NAME[s]}</p><p>${r === null ? '꽃이 활짝 피었어요! 계속 챙겨 드세요' : `다음 성장까지 ${r}일 남았어요!`}</p></div></div>`;
}

/* ================= 11번 복약 기록 ================= */
function bubbleMsg() {
  const p = curPeriod(), ds = pDates(p), st = pStats(p), any = ds.some(d => S.records[d] && Object.keys(S.records[d]).length);
  if (!any) return '오늘 약을 드셨나요?';
  if (st.o === 7) return '대단하세요! 이번 주 약을 모두 드셨어요';
  if (st.x > 0) return '괜찮아요, 오늘부터 다시 챙겨 드세요';
  return '꾸준히 복약하고 계시네요!';
}
function rRec() {
  const n = okCount(), s = stageOf(n), r = remainDays(n), { y, m } = rMonth, first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate(), t = today();
  let cells = DOW.map(d => `<div class="dw">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let d = 1; d <= last; d++) { const ds = `${y}-${p2(m+1)}-${p2(d)}`, x = dayStatus(ds), ok = inRange(ds);
    cells += `<button class="cd ${x||''} ${ds===t?'today':''} ${ok?'':'off'}" ${ok?`onclick="openDay('${ds}')"`:''} style="min-height:60px;border-radius:12px;padding:2px 0">${d}${x ? `<span class="m">${x}</span>` : ''}</button>`; }
  const vs = pStats(vp11);
  return hdr('복약 기록') + `<div class="pad" style="padding-top:6px"><div class="bubrow">${curSVG(104)}<div class="bubble">${bubbleMsg()}</div></div>
  <div class="subtxt">${r === null ? '꽃이 활짝 피었어요' : `${r}일 더 드시면 식물이 자라요`} · 현재 ${STAGE_NAME[s]}</div>
  <div class="cal"><div class="calh"><button class="circ" onclick="rMove(-1)" aria-label="이전 달">‹</button>${y}년 ${m+1}월<button class="circ" onclick="rMove(1)" aria-label="다음 달">›</button></div><div class="cg">${cells}</div></div>
  <div class="note">날짜를 누르면 약을 먹었는지 기록할 수 있어요</div>
  <div class="achv">${weekNav(vp11, 'setV11', 'rec')}<div class="achrow"><div class="ring">${curSVG(70)}</div><div class="pg"><div class="bar"><i style="width:${vs.pct}%"></i></div><div class="pc">${vs.pct}%</div></div></div>
  <div class="two" style="margin-top:10px"><div>복용완료<b>${vs.o}일</b></div><div>미복용<b>${vs.x}일</b></div></div></div></div>`;
}
function rMove(d) { let { y, m } = rMonth; m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } rMonth = { y, m }; render(); }
function openDay(d) {
  const r = S.records[d] || {};
  modal(`<div class="box"><h2>${mdw(d)} 약을 드셨나요?</h2>${slotsAll().map(s => `<div class="slotrow"><div class="tt">${s.includes(':') ? korTime(s) : s}</div>
  ${r[s] === undefined ? `<button class="yes" onclick="recDay('${d}','${s}',true)">예, 먹었어요</button><button class="no" onclick="recDay('${d}','${s}',false)">아니요, 안 먹었어요</button>`
    : `<div class="res ${r[s]?'O':'X'}">${r[s] ? 'O 먹었어요' : 'X 안 먹었어요'}</div><button class="yes" disabled style="opacity:.35">예, 먹었어요</button><button class="no" disabled style="opacity:.35">아니요, 안 먹었어요</button>`}</div>`).join('')}
  <button class="neutralBtn" onclick="closeModal()">닫기</button></div>`);
}
function recDay(d, s, v) { record(d, s, v); closeModal(); vp10 = vp11 = curPeriod(); render(); }

/* ================= 12번 나의 등록된 약물 ================= */
function rList() {
  if (detailIdx !== null && S.meds[detailIdx]) return rDetail(S.meds[detailIdx]);
  return hdr('나의 등록된 약물') + `<div class="pad">${!S.meds.length ? '<div class="empty">등록된 약물이 없어요</div>' : S.meds.map((m, i) => {
    const tk = medTaken(m), pc = Math.round(tk / m.total * 100);
    return `<button class="mc" onclick="detailIdx=${i};render();window.scrollTo(0,0)"><div class="ph">${photos[m.name] ? `<img src="${photos[m.name]}" alt="">` : '💊'}</div><div class="bd"><div class="nm">${esc(m.name)}</div><div style="font-weight:700">${esc(m.strength || '')}</div>
    <div class="fr">복용 ${fmtN(tk)}정 / 전체 ${fmtN(m.total)}정</div><div class="bar"><i style="width:${pc}%"></i></div><div class="pc">복용률 ${pc}% · ${fmtN(m.total - tk)}정 남음</div><div class="good">처방대로 잘 복용하고 있어요</div></div></button>`; }).join('')}</div>`;
}
function rDetail(m) {
  const tk = medTaken(m), pc = Math.round(tk / m.total * 100), info = m.info || findDrug(m.name) || {};
  const end = addDays(m.start, m.days - 1), no = '의사·약사에게 확인해 주세요.';
  return hdr('약물 상세', 'home').replace(`go('home')`, `detailIdx=null;render()`) + `<div class="pad"><div style="display:flex;gap:14px;align-items:center"><div class="ph" style="width:96px;height:96px;border-radius:22px;background:var(--limeL);display:flex;align-items:center;justify-content:center;font-size:52px;overflow:hidden">${photos[m.name] ? `<img src="${photos[m.name]}" style="width:100%;height:100%;object-fit:cover" alt="">` : '💊'}</div><div style="font-size:24px;font-weight:800">${esc(m.name)}</div></div>
  <div class="det"><div>복용량</div><div>1회 ${fmtN(m.dose)}정</div><div>하루 복용 횟수</div><div>${m.freq}번</div><div>복용 기간</div><div>${m.days}일</div><div>전체 처방량</div><div>${fmtN(m.total)}정</div><div>현재까지 복용</div><div>${fmtN(tk)}정</div><div>남은 약</div><div>${fmtN(m.total - tk)}정</div><div>복용률</div><div>${pc}%</div><div>복용 시작일</div><div>${md(m.start)}</div><div>복용 종료 예정일</div><div>${md(end)}</div></div>
  <div class="bar"><i style="width:${pc}%"></i></div>
  <div class="ib"><h3>💡 약물 용도 및 효능</h3><p>${esc(info.effect || no)}</p></div><div class="ib"><h3>💧 올바른 복용 방법</h3><p>${esc(info.usage || no)}</p></div>
  <div class="ib w"><h3>⚠️ 특별 주의사항</h3><p>${esc(info.caution || no)}</p></div><div class="ib w"><h3>🩺 예상되는 주요 부작용</h3><p>${esc(info.side || no)}</p></div></div>`;
}

/* ================= 아래 영역 (환자 화면과 분리) ================= */
function renderLower() {
  const nm = PROFILE.name;
  $('#gpanel').innerHTML = `<h3>보호자용 화면</h3>` + (S.gAlerts.length ? S.gAlerts.slice().reverse().map(a => { const g = S.guardians.find(x => x.id === a.gid) || {};
    return `<div class="it">${esc(nm)}님의 부작용이 3점 이상(${a.score}점)으로 기록되었어요 (${mdw(a.date)})<br><b>받는 사람: ${esc(g.rel || '')} ${esc(g.name || '')} · ${esc(g.phone || '')}</b></div>`; }).join('') : '<div class="it">받은 알림이 없어요</div>');
  $('#dpanel').innerHTML = `<h3>의료진용 화면</h3>` + (S.dAlerts.length ? S.dAlerts.slice().reverse().map(a => { const h = S.hospitals.find(x => x.id === a.hid) || {};
    const hist = S.scores.map(x => `${mds(x.date)} ${x.score}점`).join(', ');
    return `<div class="it">3점 이상 누적 3회 이상으로 알람이 왔어요<br>이름: ${esc(nm)} · 나이: ${PROFILE.age}세<br>복용약: ${S.meds.map(m => esc(m.name)).join(', ') || '없음'}<br>점수 이력: ${hist}<br><b>받는 병원: ${esc(h.name || '')} · ${esc(h.tel || '')}</b></div>`; }).join('') : '<div class="it">받은 알림이 없어요</div>');
  $('#apanel').innerHTML = `<h3>관리자용 패널</h3><button class="btn gray" onclick="adminRemind()">지금 약 먹을 시간 알림 띄우기</button>
  <button class="btn gray" onclick="adminResetRec()">복약기록 처음 상태로 초기화</button><button class="reset" onclick="adminResetAll()">모든 내용 초기화</button>`;
}
function adminRemind() {
  if (!S.meds.length) return toast('등록된 약물이 없어요');
  const rec = S.records[today()] || {}, s = slotsAll().find(x => rec[x] === undefined);
  if (!s) return toast('기록하지 않은 시간대가 없어요');
  if (cur === 'chat') { if (!unansweredSlot(s)) { askSlot(s); save(); render(); } return; }
  bannerCur = { kind:'med', slot:s, text:`${slotWord(s)} 드실 시간이에요. 약 드셨나요?` }; renderBanner();
}
function adminResetRec() {
  if (!confirm('복약 기록을 처음 상태로 되돌릴까요?')) return;
  S.records = {}; S.side = []; S.reask = []; S.shown = {}; grow = null; bannerCur = null; vp10 = vp11 = curPeriod(); save(); render();
}
function adminResetAll() {
  if (!confirm('모든 내용을 초기화할까요?')) return;
  try { localStorage.removeItem(KEY); } catch (e) {}
  S = defState(); Object.keys(photos).forEach(k => delete photos[k]); grow = null; bannerCur = null; closeModal(); go('home');
}

/* ================= 시작 ================= */
render();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', tick);
