const STORAGE_KEY = 'travel-planner:v1';
const checklistTemplates = {
  japan: ['여권', 'Visit Japan Web 등록', 'eSIM 또는 유심', '100V 전압/어댑터 확인', '교통카드 또는 패스 준비', '해외결제 카드'],
  taiwan: ['여권', '온라인 입국신고서 작성', 'eSIM 또는 유심', '110V 전압/어댑터 확인', '이지카드 준비', '해외결제 카드'],
  other: ['여권', '항공권 확인', '숙소 예약 확인', 'eSIM 또는 유심', '해외결제 카드', '여행자 보험']
};
const initialState = () => ({
  schemaVersion: 1,
  tripInfo: { id: crypto.randomUUID(), title: '', country: 'japan', cities: [], startDate: '', endDate: '', baseCurrency: 'KRW', members: [] },
  days: [], itineraryItems: {}, expenses: {}, checklists: [], changeHistory: [],
  uiState: { activeTab: 'schedule', selectedDate: '' }
});
let state = loadState();
function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState(); } catch { return initialState(); } }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
const $ = id => document.getElementById(id);
const splitCsv = value => value.split(',').map(v => v.trim()).filter(Boolean);
const formatDate = date => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`));
function datesBetween(start, end) {
  if (!start || !end || start > end) return [];
  const dates = []; const cursor = new Date(`${start}T00:00:00`); const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
  return dates;
}
function createMapSearchUrl(place) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`; }
function logChange(entityType, entityId, field, before, after) {
  if (before === after) return;
  state.changeHistory.unshift({ id: crypto.randomUUID(), entityType, entityId, field, before, after, changedAt: new Date().toISOString() });
}
function ensureChecklist(country) {
  if (state.checklists.length) return;
  state.checklists = (checklistTemplates[country] || checklistTemplates.other).map(title => ({ id: crypto.randomUUID(), title, checked: false, category: '기본' }));
}
function applyTripTemplate(event) {
  event.preventDefault();
  const previous = { ...state.tripInfo };
  state.tripInfo = {
    ...state.tripInfo,
    title: $('tripTitle').value.trim(), country: $('tripCountry').value, cities: splitCsv($('tripCities').value),
    startDate: $('startDate').value, endDate: $('endDate').value, members: splitCsv($('members').value), baseCurrency: $('baseCurrency').value.trim() || 'KRW'
  };
  for (const [key, value] of Object.entries(state.tripInfo)) logChange('trip', state.tripInfo.id, key, JSON.stringify(previous[key]), JSON.stringify(value));
  const dates = datesBetween(state.tripInfo.startDate, state.tripInfo.endDate);
  state.days = dates.map((date, index) => ({ date, title: `${index + 1}일차`, itineraryIds: Object.values(state.itineraryItems).filter(item => item.date === date).map(item => item.id) }));
  state.uiState.selectedDate = state.uiState.selectedDate && dates.includes(state.uiState.selectedDate) ? state.uiState.selectedDate : dates[0] || '';
  ensureChecklist(state.tripInfo.country); saveState(); render();
}
function addItinerary(event) {
  event.preventDefault(); if (!state.uiState.selectedDate) return alert('먼저 여행 기간을 설정하세요.');
  const items = getItemsForDate(state.uiState.selectedDate);
  const item = { id: crypto.randomUUID(), date: state.uiState.selectedDate, time: $('itemTime').value, title: $('itemTitle').value.trim(), placeName: $('itemPlace').value.trim(), category: $('itemCategory').value, labels: splitCsv($('itemLabels').value), memo: $('itemMemo').value.trim(), order: items.length + 1, updatedAt: new Date().toISOString() };
  state.itineraryItems[item.id] = item; logChange('itinerary', item.id, 'created', '', item.title); event.target.reset(); saveState(); render();
}
function getItemsForDate(date) { return Object.values(state.itineraryItems).filter(item => item.date === date).sort((a,b) => a.order - b.order || a.time.localeCompare(b.time)); }
function moveItem(id, direction) {
  const item = state.itineraryItems[id]; const items = getItemsForDate(item.date); const index = items.findIndex(v => v.id === id); const target = index + direction;
  if (target < 0 || target >= items.length) return;
  [items[index].order, items[target].order] = [items[target].order, items[index].order]; logChange('itinerary', id, 'order', index + 1, target + 1); saveState(); render();
}
function deleteItem(id) { if (!confirm('일정을 삭제할까요?')) return; logChange('itinerary', id, 'deleted', state.itineraryItems[id].title, ''); delete state.itineraryItems[id]; saveState(); render(); }
function editItem(id) {
  const item = state.itineraryItems[id]; const title = prompt('일정 제목을 수정하세요.', item.title); if (title === null) return;
  logChange('itinerary', id, 'title', item.title, title.trim()); item.title = title.trim(); item.updatedAt = new Date().toISOString(); saveState(); render();
}
function moveDate(id) {
  const item = state.itineraryItems[id]; const date = prompt('이동할 날짜를 입력하세요. 예: 2026-07-01', item.date); if (!date || !state.days.some(day => day.date === date)) return alert('여행 기간 안의 날짜를 입력하세요.');
  logChange('itinerary', id, 'date', item.date, date); item.date = date; item.order = getItemsForDate(date).length + 1; saveState(); render();
}
function addExpense(event) {
  event.preventDefault();
  const expense = { id: crypto.randomUUID(), title: $('expenseTitle').value.trim(), amount: Number($('expenseAmount').value), currency: $('expenseCurrency').value.trim() || state.tripInfo.baseCurrency, paidBy: $('expensePaidBy').value.trim(), participants: splitCsv($('expenseParticipants').value), createdAt: new Date().toISOString() };
  state.expenses[expense.id] = expense; logChange('expense', expense.id, 'created', '', expense.title); event.target.reset(); $('expenseCurrency').value = 'JPY'; saveState(); render();
}
function deleteExpense(id) { delete state.expenses[id]; saveState(); render(); }
function toggleChecklist(id) { const item = state.checklists.find(v => v.id === id); item.checked = !item.checked; saveState(); render(); }
function addChecklist() { const title = prompt('추가할 준비물을 입력하세요.'); if (!title) return; state.checklists.push({ id: crypto.randomUUID(), title: title.trim(), checked: false, category: '사용자' }); saveState(); render(); }
function render() {
  $('tripTitle').value = state.tripInfo.title; $('tripCountry').value = state.tripInfo.country; $('tripCities').value = state.tripInfo.cities.join(', '); $('startDate').value = state.tripInfo.startDate; $('endDate').value = state.tripInfo.endDate; $('members').value = state.tripInfo.members.join(', '); $('baseCurrency').value = state.tripInfo.baseCurrency;
  renderDateSelector(); renderItinerary(); renderMap(); renderChecklist(); renderExpenses(); renderHistory();
}
function renderDateSelector() {
  $('dateSelector').innerHTML = state.days.map(day => `<option value="${day.date}" ${day.date === state.uiState.selectedDate ? 'selected' : ''}>${day.title} · ${formatDate(day.date)}</option>`).join('');
}
function renderItinerary() {
  const items = getItemsForDate(state.uiState.selectedDate); $('itineraryList').innerHTML = items.length ? items.map(itemCard).join('') : '<div class="empty">선택한 날짜에 일정이 없습니다.</div>';
}
function itemCard(item) {
  const map = item.placeName ? `<a class="btn btn-secondary" target="_blank" href="${createMapSearchUrl(item.placeName)}">지도 보기</a>` : '';
  return `<article class="card item-card ${Date.now() - new Date(item.updatedAt).getTime() < 3600000 ? 'updated' : ''}"><div class="card-title-row"><div><strong>${item.time || '시간 미정'} · ${item.title}</strong><p class="meta">${item.placeName || '장소 미정'} · ${item.category}</p></div><span class="badge">수정됨</span></div><div class="badges">${item.labels.map(label => `<span class="badge">${label}</span>`).join('')}</div><p>${item.memo || ''}</p><div class="actions"><button class="btn btn-secondary" onclick="moveItem('${item.id}',-1)">위로</button><button class="btn btn-secondary" onclick="moveItem('${item.id}',1)">아래로</button><button class="btn btn-secondary" onclick="moveDate('${item.id}')">날짜 이동</button><button class="btn btn-primary" onclick="editItem('${item.id}')">수정</button>${map}<button class="btn btn-danger" onclick="deleteItem('${item.id}')">삭제</button></div></article>`;
}
function renderMap() { const items = Object.values(state.itineraryItems).sort((a,b) => a.date.localeCompare(b.date) || a.order - b.order); $('mapList').innerHTML = items.length ? items.map(item => `<article class="card item-card"><strong>${item.date} · ${item.title}</strong><p class="meta">${item.placeName || '장소 미정'}</p>${item.placeName ? `<a class="btn btn-primary" target="_blank" href="${createMapSearchUrl(item.placeName)}">Google Maps 열기</a>` : ''}</article>`).join('') : '<div class="empty">지도에 표시할 장소가 없습니다.</div>'; }
function renderChecklist() { $('checklistList').innerHTML = state.checklists.map(item => `<article class="card item-card"><label><input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecklist('${item.id}')" /> ${item.title}</label><span class="badge">${item.category}</span></article>`).join('') || '<div class="empty">준비물 템플릿을 적용하세요.</div>'; }
function renderExpenses() { const expenses = Object.values(state.expenses); const totals = expenses.reduce((acc,e) => { acc[e.currency] = (acc[e.currency] || 0) + e.amount; return acc; }, {}); $('expenseSummary').textContent = Object.entries(totals).map(([c,a]) => `${c} ${a.toLocaleString()}`).join(' · ') || '비용 없음'; $('expenseList').innerHTML = expenses.map(e => `<article class="card item-card"><strong>${e.title}</strong><p class="meta">${e.currency} ${e.amount.toLocaleString()} · 결제자 ${e.paidBy || '미정'} · 참여 ${e.participants.join(', ') || '미정'}</p><button class="btn btn-danger" onclick="deleteExpense('${e.id}')">삭제</button></article>`).join('') || '<div class="empty">등록된 비용이 없습니다.</div>'; }
function renderHistory() { $('historyList').innerHTML = state.changeHistory.map(h => `<article class="card item-card"><strong>${h.entityType} · ${h.field}</strong><p class="meta">${new Date(h.changedAt).toLocaleString('ko-KR')}</p><p>${h.before || '(없음)'} → ${h.after || '(없음)'}</p></article>`).join('') || '<div class="empty">변경 이력이 없습니다.</div>'; }
function exportData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${state.tripInfo.title || 'travel-planner'}.json`; a.click(); URL.revokeObjectURL(url); }
function importData(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); if (!data.schemaVersion) throw new Error('Invalid schema'); state = data; saveState(); render(); } catch { alert('가져올 수 없는 JSON 파일입니다.'); } }; reader.readAsText(file); }
function resetData() { if (!confirm('로컬 데이터를 모두 삭제할까요?')) return; localStorage.removeItem(STORAGE_KEY); state = initialState(); render(); }
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.tab-panel').forEach(el => el.classList.remove('active')); tab.classList.add('active'); $(tab.dataset.tab).classList.add('active'); }));
$('tripForm').addEventListener('submit', applyTripTemplate); $('itineraryForm').addEventListener('submit', addItinerary); $('dateSelector').addEventListener('change', event => { state.uiState.selectedDate = event.target.value; saveState(); render(); }); $('expenseForm').addEventListener('submit', addExpense); $('addChecklistBtn').addEventListener('click', addChecklist); $('exportBtn').addEventListener('click', exportData); $('importInput').addEventListener('change', importData); $('resetBtn').addEventListener('click', resetData);
render();
