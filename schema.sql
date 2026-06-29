-- =====================================================
-- نظام متابعة مشروع بناء الفيلا - Schema
-- =====================================================

-- 1) معلومات المشروع العامة
create table if not exists project_info (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default 'مشروع الفيلا',
  location text,
  land_area numeric,        -- مساحة الأرض م2
  building_area numeric,    -- مساحة البناء م2
  total_budget numeric not null default 0,
  start_date date,
  target_end_date date,
  status text not null default 'جاري' check (status in ('جاري','متوقف','مكتمل')),
  created_at timestamptz not null default now()
);

-- 2) مراحل المشروع (كل مرحلة لها ميزانية مخططة)
create table if not exists phases (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- مثال: الأساسات، الهيكل، التشطيب...
  description text,
  planned_budget numeric not null default 0,
  order_index integer not null default 0,   -- ترتيب ظهور المرحلة
  status text not null default 'لم يبدأ' check (status in ('لم يبدأ','جاري','مكتمل')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

-- 3) المقاولون / العمال / المهندسون
create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,                 -- مثال: مقاول عام، مهندس إنشاء، كهربائي، نجار...
  phase_id uuid references phases(id) on delete set null,
  contract_amount numeric not null default 0,  -- المبلغ المتفق عليه الكلي
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- 4) المصاريف الفعلية (مرتبطة بمرحلة، وممكن مرتبطة بمقاول)
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid references phases(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete set null,
  category text not null check (category in ('مواد','عمالة','أتعاب','معدات','أخرى')),
  description text not null,
  quantity numeric default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,   -- المبلغ الكلي (qty * unit_price أو مباشر)
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- 5) الدفعات المسددة للمقاولين/العمال
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  amount numeric not null default 0,
  payment_date date not null default current_date,
  payment_method text default 'نقدي',  -- نقدي / تحويل بنكي / شيك
  notes text,
  created_at timestamptz not null default now()
);

-- =====================================================
-- فهارس لتحسين الأداء
-- =====================================================
create index if not exists idx_expenses_phase on expenses(phase_id);
create index if not exists idx_expenses_contractor on expenses(contractor_id);
create index if not exists idx_payments_contractor on payments(contractor_id);
create index if not exists idx_contractors_phase on contractors(phase_id);

-- =====================================================
-- تفعيل Row Level Security مع سياسة مفتوحة (مشروع شخصي)
-- =====================================================
alter table project_info enable row level security;
alter table phases enable row level security;
alter table contractors enable row level security;
alter table expenses enable row level security;
alter table payments enable row level security;

create policy "allow all project_info" on project_info for all using (true) with check (true);
create policy "allow all phases" on phases for all using (true) with check (true);
create policy "allow all contractors" on contractors for all using (true) with check (true);
create policy "allow all expenses" on expenses for all using (true) with check (true);
create policy "allow all payments" on payments for all using (true) with check (true);

-- =====================================================
-- بيانات أولية: المراحل القياسية لبناء فيلا من الصفر
-- =====================================================
insert into phases (name, description, planned_budget, order_index) values
('التخطيط والتصاريح', 'تصاريح البناء، رسوم البلدية، أتعاب المهندس المعماري ومهندس الإنشاء', 0, 1),
('الأساسات', 'الحفر، الخرسانة، الحديد، العزل تحت الأساس', 0, 2),
('الهيكل الإنشائي', 'الأعمدة، السقوف، البلوك/الطوب', 0, 3),
('العزل المائي والحراري', 'عزل الأسطح والحمامات', 0, 4),
('التمديدات الكهربائية والسباكة', 'التمديدات قبل التشطيب', 0, 5),
('التشطيبات الخارجية', 'الواجهات والطلاء الخارجي', 0, 6),
('التشطيبات الداخلية', 'بلاط، رخام، جبس، أبواب، شبابيك، أصباغ', 0, 7),
('المطابخ والحمامات', 'تجهيزات صحية، خلاطات، كاونترات', 0, 8),
('التكييف', 'وحدات التكييف والتمديدات الخاصة بها', 0, 9),
('التأثيث', 'غرف، صالونات، مطبخ، حمامات', 0, 10),
('مصاريف غير متوقعة', 'احتياطي للطوارئ والزيادات غير المخططة', 0, 11)
on conflict do nothing;

insert into project_info (project_name, total_budget, status)
values ('مشروع الفيلا', 0, 'جاري')
on conflict do nothing;
