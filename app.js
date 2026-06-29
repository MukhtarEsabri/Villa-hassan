// =====================================================
// الاتصال بـ Supabase
// =====================================================
const SUPABASE_URL = "https://wetuosyedociasfiiqjx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldHVvc3llZG9jaWFzZmlpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjU3MzcsImV4cCI6MjA5ODI0MTczN30.goS8iNwyOUBWqpaZeEd2SXFoXYLWEK6aWmCxXhxd2T8";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
// State
// =====================================================
let STATE = {
  project: null,
  phases: [],
  contractors: [],
  expenses: [],
  payments: [],
  activeTab: 'phases'
};

// =====================================================
// Helpers
// =====================================================
function fmtMoney(n){
  n = Number(n) || 0;
  return n.toLocaleString('ar-LY', {maximumFractionDigits:0}) + ' د.ل';
}
function fmtDate(d){
  if(!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('ar-LY', {day:'numeric', month:'short', year:'numeric'});
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function uid(){ return 'id-' + Math.random().toString(36).slice(2,9); }

function phaseSpent(phaseId){
  return STATE.expenses.filter(e=>e.phase_id===phaseId).reduce((s,e)=>s+Number(e.amount||0),0);
}
function contractorPaid(contractorId){
  return STATE.payments.filter(p=>p.contractor_id===contractorId).reduce((s,p)=>s+Number(p.amount||0),0);
}
function contractorName(id){
  const c = STATE.contractors.find(c=>c.id===id);
  return c ? c.name : '—';
}
function phaseName(id){
  const p = STATE.phases.find(p=>p.id===id);
  return p ? p.name : 'غير محدد';
}

// =====================================================
// Data loading
// =====================================================
async function loadAll(){
  try{
    const [proj, phases, contractors, expenses, payments] = await Promise.all([
      sb.from('project_info').select('*').limit(1).maybeSingle(),
      sb.from('phases').select('*').order('order_index'),
      sb.from('contractors').select('*').order('created_at'),
      sb.from('expenses').select('*').order('expense_date', {ascending:false}),
      sb.from('payments').select('*').order('payment_date', {ascending:false}),
    ]);

    if(proj.error) throw proj.error;
    if(phases.error) throw phases.error;
    if(contractors.error) throw contractors.error;
    if(expenses.error) throw expenses.error;
    if(payments.error) throw payments.error;

    STATE.project = proj.data;
    STATE.phases = phases.data || [];
    STATE.contractors = contractors.data || [];
    STATE.expenses = expenses.data || [];
    STATE.payments = payments.data || [];

    renderAll();
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'block';
  }catch(err){
    console.error(err);
    document.getElementById('loadingScreen').innerHTML =
      `<p style="color:#C96156;max-width:280px;text-align:center;">حدث خطأ في الاتصال بقاعدة البيانات.<br>تحقق من بيانات الاتصال أو اتصال الإنترنت.</p>`;
  }
}

// =====================================================
// Render: Overview + Stage track
// =====================================================
function renderOverview(){
  const totalBudget = Number(STATE.project?.total_budget || 0);
  const totalSpent = STATE.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const remaining = totalBudget - totalSpent;
  const totalContracted = STATE.contractors.reduce((s,c)=>s+Number(c.contract_amount||0),0);
  const totalPaid = STATE.payments.reduce((s,p)=>s+Number(p.amount||0),0);
  const outstanding = Math.max(totalContracted - totalPaid, 0);

  document.getElementById('projectNameDisplay').textContent = STATE.project?.project_name || 'مشروع الفيلا';
  document.getElementById('projectLocationDisplay').textContent = STATE.project?.location || 'لم يتم تحديد الموقع';
  document.getElementById('statTotalBudget').textContent = fmtMoney(totalBudget);
  document.getElementById('statTotalSpent').textContent = fmtMoney(totalSpent);
  const remEl = document.getElementById('statRemaining');
  remEl.textContent = fmtMoney(remaining);
  remEl.className = 'value' + (remaining < 0 ? ' brick' : '');
  document.getElementById('statOutstanding').textContent = fmtMoney(outstanding);
}

function renderStageTrack(){
  const track = document.getElementById('stageTrack');
  if(STATE.phases.length === 0){
    track.innerHTML = `<p style="font-size:12px;color:var(--text-mute);">أضف مراحل المشروع لمتابعة التقدم هنا</p>`;
    return;
  }
  track.innerHTML = STATE.phases.map(ph=>{
    const spent = phaseSpent(ph.id);
    const budget = Number(ph.planned_budget||0);
    const pct = budget > 0 ? Math.min((spent/budget)*100, 100) : (spent>0 ? 100 : 0);
    const over = budget > 0 && spent > budget;
    return `
      <div class="stage-seg" onclick="switchTab('phases'); document.getElementById('phase-${ph.id}')?.scrollIntoView({behavior:'smooth',block:'center'});">
        <div class="bar"><div class="fill ${over?'over':''}" style="width:${pct}%"></div></div>
        <div class="name">${ph.name}</div>
        <div class="pct">${budget>0 ? Math.round((spent/budget)*100)+'٪' : fmtMoney(spent)}</div>
      </div>
    `;
  }).join('');
}

// =====================================================
// Render: Phases
// =====================================================
function statusBadge(status){
  if(status==='مكتمل') return `<span class="badge done">مكتمل</span>`;
  if(status==='جاري') return `<span class="badge progress">جاري</span>`;
  return `<span class="badge notstarted">لم يبدأ</span>`;
}

function renderPhases(){
  const list = document.getElementById('phasesList');
  if(STATE.phases.length===0){
    list.innerHTML = emptyState('▦','لا توجد مراحل بعد','أضف أول مرحلة لمشروع البناء','openPhaseModal()');
    return;
  }
  list.innerHTML = STATE.phases.map(ph=>{
    const spent = phaseSpent(ph.id);
    const budget = Number(ph.planned_budget||0);
    const over = budget > 0 && spent > budget;
    return `
    <div class="row-card" id="phase-${ph.id}">
      <div class="rc-top">
        <div>
          <div class="rc-title">${ph.name}</div>
          <div class="rc-meta">${ph.description || ''}</div>
        </div>
        <div class="rc-amount ${over?'brick':''}" style="${over?'color:var(--brick-bright);':''}">${fmtMoney(spent)}</div>
      </div>
      <div class="rc-meta">من ميزانية ${fmtMoney(budget)} ${over?' — تجاوز الميزانية':''}</div>
      <div style="margin-top:8px;">${statusBadge(ph.status)}</div>
      <div class="rc-actions">
        <button class="btn ghost sm" onclick="openPhaseModal('${ph.id}')">تعديل</button>
        <button class="btn danger sm" onclick="deletePhase('${ph.id}')">حذف</button>
      </div>
    </div>`;
  }).join('');
}

// =====================================================
// Render: Expenses
// =====================================================
function renderExpenses(){
  const list = document.getElementById('expensesList');
  if(STATE.expenses.length===0){
    list.innerHTML = emptyState('◆','لا توجد مصاريف مسجلة','سجّل أول مصروف لمتابعة التكاليف الفعلية','openExpenseModal()');
    return;
  }
  list.innerHTML = STATE.expenses.map(ex=>`
    <div class="row-card">
      <div class="rc-top">
        <div>
          <div class="rc-title">${ex.description}</div>
          <div class="rc-meta">${phaseName(ex.phase_id)} · ${ex.category} · ${fmtDate(ex.expense_date)}</div>
          ${ex.contractor_id ? `<div class="rc-meta">المورّد/المقاول: ${contractorName(ex.contractor_id)}</div>` : ''}
        </div>
        <div class="rc-amount">${fmtMoney(ex.amount)}</div>
      </div>
      <div class="rc-actions">
        <button class="btn ghost sm" onclick="openExpenseModal('${ex.id}')">تعديل</button>
        <button class="btn danger sm" onclick="deleteExpense('${ex.id}')">حذف</button>
      </div>
    </div>
  `).join('');
}

// =====================================================
// Render: Contractors
// =====================================================
function renderContractors(){
  const list = document.getElementById('contractorsList');
  if(STATE.contractors.length===0){
    list.innerHTML = emptyState('⚒','لا يوجد مقاولون أو عمال','أضف أول مقاول أو عامل لمتابعة مستحقاته','openContractorModal()');
    return;
  }
  list.innerHTML = STATE.contractors.map(c=>{
    const paid = contractorPaid(c.id);
    const contract = Number(c.contract_amount||0);
    const remaining = contract - paid;
    return `
    <div class="row-card">
      <div class="rc-top">
        <div>
          <div class="rc-title">${c.name}</div>
          <div class="rc-meta">${c.role} ${c.phase_id ? '· '+phaseName(c.phase_id) : ''}</div>
          ${c.phone ? `<div class="rc-meta">${c.phone}</div>` : ''}
        </div>
        <div style="text-align:left;">
          <div class="rc-amount">${fmtMoney(contract)}</div>
          <div class="rc-meta">مدفوع: ${fmtMoney(paid)}</div>
        </div>
      </div>
      <div style="margin-top:8px;">
        ${remaining<=0 ? `<span class="badge done">مسدد بالكامل</span>` : `<span class="badge progress">متبقي ${fmtMoney(remaining)}</span>`}
      </div>
      <div class="rc-actions">
        <button class="btn ghost sm" onclick="openContractorModal('${c.id}')">تعديل</button>
        <button class="btn danger sm" onclick="deleteContractor('${c.id}')">حذف</button>
      </div>
    </div>`;
  }).join('');
}

// =====================================================
// Render: Payments
// =====================================================
function renderPayments(){
  const list = document.getElementById('paymentsList');
  if(STATE.payments.length===0){
    list.innerHTML = emptyState('◈','لا توجد دفعات مسجلة','سجّل أول دفعة لمقاول أو عامل','openPaymentModal()');
    return;
  }
  list.innerHTML = STATE.payments.map(p=>`
    <div class="row-card">
      <div class="rc-top">
        <div>
          <div class="rc-title">${contractorName(p.contractor_id)}</div>
          <div class="rc-meta">${p.payment_method || 'نقدي'} · ${fmtDate(p.payment_date)}</div>
          ${p.notes ? `<div class="rc-meta">${p.notes}</div>` : ''}
        </div>
        <div class="rc-amount">${fmtMoney(p.amount)}</div>
      </div>
      <div class="rc-actions">
        <button class="btn ghost sm" onclick="openPaymentModal('${p.id}')">تعديل</button>
        <button class="btn danger sm" onclick="deletePayment('${p.id}')">حذف</button>
      </div>
    </div>
  `).join('');
}

function emptyState(icon, title, sub, action){
  return `
    <div class="empty-state">
      <div class="ic">${icon}</div>
      <div style="font-weight:700;color:var(--text);margin-bottom:6px;">${title}</div>
      <p>${sub}</p>
      <button class="btn" onclick="${action}">إضافة</button>
    </div>
  `;
}

function renderAll(){
  renderOverview();
  renderStageTrack();
  renderPhases();
  renderExpenses();
  renderContractors();
  renderPayments();
}

// =====================================================
// Tabs
// =====================================================
function switchTab(tab){
  STATE.activeTab = tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.bn-item').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+tab));
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>switchTab(t.dataset.tab)));
document.querySelectorAll('.bn-item').forEach(t=>t.addEventListener('click', ()=>switchTab(t.dataset.tab)));

// =====================================================
// Modal helpers
// =====================================================
function openModal(html){
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalBg').classList.add('active');
}
function closeModal(){
  document.getElementById('modalBg').classList.remove('active');
}
document.getElementById('modalBg').addEventListener('click', (e)=>{
  if(e.target.id==='modalBg') closeModal();
});

function phaseOptions(selectedId){
  return STATE.phases.map(p=>`<option value="${p.id}" ${p.id===selectedId?'selected':''}>${p.name}</option>`).join('');
}
function contractorOptions(selectedId){
  return STATE.contractors.map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.name} (${c.role})</option>`).join('');
}

// ===== Settings modal (project info) =====
function openSettingsModal(){
  const p = STATE.project || {};
  openModal(`
    <h3>إعدادات المشروع</h3>
    <div class="field"><label>اسم المشروع</label><input id="f_name" value="${p.project_name||''}"></div>
    <div class="field"><label>الموقع</label><input id="f_location" value="${p.location||''}"></div>
    <div class="field-row">
      <div class="field"><label>مساحة الأرض (م²)</label><input id="f_land" type="number" value="${p.land_area||''}"></div>
      <div class="field"><label>مساحة البناء (م²)</label><input id="f_build" type="number" value="${p.building_area||''}"></div>
    </div>
    <div class="field"><label>الميزانية الكلية (د.ل)</label><input id="f_budget" type="number" value="${p.total_budget||0}"></div>
    <div class="field"><label>حالة المشروع</label>
      <select id="f_status">
        <option value="جاري" ${p.status==='جاري'?'selected':''}>جاري</option>
        <option value="متوقف" ${p.status==='متوقف'?'selected':''}>متوقف</option>
        <option value="مكتمل" ${p.status==='مكتمل'?'selected':''}>مكتمل</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="saveProjectInfo()">حفظ</button>
    </div>
  `);
}
async function saveProjectInfo(){
  const payload = {
    project_name: document.getElementById('f_name').value || 'مشروع الفيلا',
    location: document.getElementById('f_location').value,
    land_area: Number(document.getElementById('f_land').value) || null,
    building_area: Number(document.getElementById('f_build').value) || null,
    total_budget: Number(document.getElementById('f_budget').value) || 0,
    status: document.getElementById('f_status').value,
  };
  try{
    if(STATE.project?.id){
      const {error} = await sb.from('project_info').update(payload).eq('id', STATE.project.id);
      if(error) throw error;
    }else{
      const {error} = await sb.from('project_info').insert(payload);
      if(error) throw error;
    }
    closeModal();
    showToast('تم حفظ بيانات المشروع');
    await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}

// ===== Phase modal =====
function openPhaseModal(id){
  const ph = id ? STATE.phases.find(p=>p.id===id) : null;
  openModal(`
    <h3>${ph ? 'تعديل المرحلة' : 'مرحلة جديدة'}</h3>
    <div class="field"><label>اسم المرحلة</label><input id="f_pname" value="${ph?.name||''}" placeholder="مثال: الأساسات"></div>
    <div class="field"><label>الوصف</label><textarea id="f_pdesc" rows="2">${ph?.description||''}</textarea></div>
    <div class="field"><label>الميزانية المخططة (د.ل)</label><input id="f_pbudget" type="number" value="${ph?.planned_budget||0}"></div>
    <div class="field"><label>الحالة</label>
      <select id="f_pstatus">
        <option value="لم يبدأ" ${ph?.status==='لم يبدأ'?'selected':''}>لم يبدأ</option>
        <option value="جاري" ${ph?.status==='جاري'?'selected':''}>جاري</option>
        <option value="مكتمل" ${ph?.status==='مكتمل'?'selected':''}>مكتمل</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="savePhase(${ph?`'${ph.id}'`:'null'})">حفظ</button>
    </div>
  `);
}
async function savePhase(id){
  const payload = {
    name: document.getElementById('f_pname').value,
    description: document.getElementById('f_pdesc').value,
    planned_budget: Number(document.getElementById('f_pbudget').value)||0,
    status: document.getElementById('f_pstatus').value,
  };
  if(!payload.name){ showToast('اكتب اسم المرحلة'); return; }
  try{
    if(id){
      const {error} = await sb.from('phases').update(payload).eq('id', id);
      if(error) throw error;
    }else{
      payload.order_index = STATE.phases.length + 1;
      const {error} = await sb.from('phases').insert(payload);
      if(error) throw error;
    }
    closeModal(); showToast('تم حفظ المرحلة'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}
async function deletePhase(id){
  if(!confirm('حذف هذه المرحلة؟ سيتم إلغاء ربط المصاريف المرتبطة بها.')) return;
  try{
    const {error} = await sb.from('phases').delete().eq('id', id);
    if(error) throw error;
    showToast('تم الحذف'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}

// ===== Expense modal =====
function openExpenseModal(id){
  const ex = id ? STATE.expenses.find(e=>e.id===id) : null;
  openModal(`
    <h3>${ex ? 'تعديل المصروف' : 'مصروف جديد'}</h3>
    <div class="field"><label>البيان</label><input id="f_edesc" value="${ex?.description||''}" placeholder="مثال: شراء حديد تسليح"></div>
    <div class="field"><label>المرحلة</label><select id="f_ephase"><option value="">— بدون —</option>${phaseOptions(ex?.phase_id)}</select></div>
    <div class="field"><label>التصنيف</label>
      <select id="f_ecat">
        ${['مواد','عمالة','أتعاب','معدات','أخرى'].map(c=>`<option value="${c}" ${ex?.category===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>المقاول/المورّد (اختياري)</label><select id="f_econtractor"><option value="">— بدون —</option>${contractorOptions(ex?.contractor_id)}</select></div>
    <div class="field-row">
      <div class="field"><label>الكمية</label><input id="f_eqty" type="number" value="${ex?.quantity||1}"></div>
      <div class="field"><label>سعر الوحدة (د.ل)</label><input id="f_eprice" type="number" value="${ex?.unit_price||0}"></div>
    </div>
    <div class="field"><label>المبلغ الإجمالي (د.ل)</label><input id="f_eamount" type="number" value="${ex?.amount||0}"></div>
    <div class="field"><label>التاريخ</label><input id="f_edate" type="date" value="${ex?.expense_date || new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="f_enotes" rows="2">${ex?.notes||''}</textarea></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="saveExpense(${ex?`'${ex.id}'`:'null'})">حفظ</button>
    </div>
  `);
  // مساعد: حساب المبلغ تلقائي من الكمية × السعر إن لم يتم تعديله يدويًا
  const qtyEl = document.getElementById('f_eqty');
  const priceEl = document.getElementById('f_eprice');
  const amountEl = document.getElementById('f_eamount');
  function autoCalc(){ amountEl.value = (Number(qtyEl.value)||0) * (Number(priceEl.value)||0); }
  qtyEl.addEventListener('input', autoCalc);
  priceEl.addEventListener('input', autoCalc);
}
async function saveExpense(id){
  const payload = {
    description: document.getElementById('f_edesc').value,
    phase_id: document.getElementById('f_ephase').value || null,
    contractor_id: document.getElementById('f_econtractor').value || null,
    category: document.getElementById('f_ecat').value,
    quantity: Number(document.getElementById('f_eqty').value)||1,
    unit_price: Number(document.getElementById('f_eprice').value)||0,
    amount: Number(document.getElementById('f_eamount').value)||0,
    expense_date: document.getElementById('f_edate').value,
    notes: document.getElementById('f_enotes').value,
  };
  if(!payload.description){ showToast('اكتب بيان المصروف'); return; }
  try{
    if(id){
      const {error} = await sb.from('expenses').update(payload).eq('id', id);
      if(error) throw error;
    }else{
      const {error} = await sb.from('expenses').insert(payload);
      if(error) throw error;
    }
    closeModal(); showToast('تم حفظ المصروف'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}
async function deleteExpense(id){
  if(!confirm('حذف هذا المصروف؟')) return;
  try{
    const {error} = await sb.from('expenses').delete().eq('id', id);
    if(error) throw error;
    showToast('تم الحذف'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}

// ===== Contractor modal =====
function openContractorModal(id){
  const c = id ? STATE.contractors.find(c=>c.id===id) : null;
  openModal(`
    <h3>${c ? 'تعديل المقاول/العامل' : 'مقاول / عامل جديد'}</h3>
    <div class="field"><label>الاسم</label><input id="f_cname" value="${c?.name||''}"></div>
    <div class="field"><label>الدور / التخصص</label><input id="f_crole" value="${c?.role||''}" placeholder="مثال: مقاول عام، كهربائي، مهندس إنشاء"></div>
    <div class="field"><label>المرحلة المرتبطة (اختياري)</label><select id="f_cphase"><option value="">— بدون —</option>${phaseOptions(c?.phase_id)}</select></div>
    <div class="field"><label>المبلغ المتفق عليه (د.ل)</label><input id="f_camount" type="number" value="${c?.contract_amount||0}"></div>
    <div class="field"><label>رقم الهاتف</label><input id="f_cphone" value="${c?.phone||''}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="f_cnotes" rows="2">${c?.notes||''}</textarea></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="saveContractor(${c?`'${c.id}'`:'null'})">حفظ</button>
    </div>
  `);
}
async function saveContractor(id){
  const payload = {
    name: document.getElementById('f_cname').value,
    role: document.getElementById('f_crole').value,
    phase_id: document.getElementById('f_cphase').value || null,
    contract_amount: Number(document.getElementById('f_camount').value)||0,
    phone: document.getElementById('f_cphone').value,
    notes: document.getElementById('f_cnotes').value,
  };
  if(!payload.name || !payload.role){ showToast('اكتب الاسم والدور'); return; }
  try{
    if(id){
      const {error} = await sb.from('contractors').update(payload).eq('id', id);
      if(error) throw error;
    }else{
      const {error} = await sb.from('contractors').insert(payload);
      if(error) throw error;
    }
    closeModal(); showToast('تم الحفظ'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}
async function deleteContractor(id){
  if(!confirm('حذف هذا المقاول/العامل؟ سيتم حذف دفعاته المرتبطة أيضًا.')) return;
  try{
    const {error} = await sb.from('contractors').delete().eq('id', id);
    if(error) throw error;
    showToast('تم الحذف'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}

// ===== Payment modal =====
function openPaymentModal(id){
  const p = id ? STATE.payments.find(p=>p.id===id) : null;
  if(STATE.contractors.length===0){ showToast('أضف مقاولًا أولًا'); return; }
  openModal(`
    <h3>${p ? 'تعديل الدفعة' : 'دفعة جديدة'}</h3>
    <div class="field"><label>المقاول/العامل</label><select id="f_payContractor">${contractorOptions(p?.contractor_id)}</select></div>
    <div class="field"><label>المبلغ (د.ل)</label><input id="f_payAmount" type="number" value="${p?.amount||0}"></div>
    <div class="field"><label>طريقة الدفع</label>
      <select id="f_payMethod">
        ${['نقدي','تحويل بنكي','شيك'].map(m=>`<option value="${m}" ${p?.payment_method===m?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>التاريخ</label><input id="f_payDate" type="date" value="${p?.payment_date || new Date().toISOString().slice(0,10)}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="f_payNotes" rows="2">${p?.notes||''}</textarea></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn" onclick="savePayment(${p?`'${p.id}'`:'null'})">حفظ</button>
    </div>
  `);
}
async function savePayment(id){
  const payload = {
    contractor_id: document.getElementById('f_payContractor').value,
    amount: Number(document.getElementById('f_payAmount').value)||0,
    payment_method: document.getElementById('f_payMethod').value,
    payment_date: document.getElementById('f_payDate').value,
    notes: document.getElementById('f_payNotes').value,
  };
  try{
    if(id){
      const {error} = await sb.from('payments').update(payload).eq('id', id);
      if(error) throw error;
    }else{
      const {error} = await sb.from('payments').insert(payload);
      if(error) throw error;
    }
    closeModal(); showToast('تم حفظ الدفعة'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}
async function deletePayment(id){
  if(!confirm('حذف هذه الدفعة؟')) return;
  try{
    const {error} = await sb.from('payments').delete().eq('id', id);
    if(error) throw error;
    showToast('تم الحذف'); await loadAll();
  }catch(err){ console.error(err); showToast('حدث خطأ، حاول مرة أخرى'); }
}

// =====================================================
// Init
// =====================================================
loadAll();
