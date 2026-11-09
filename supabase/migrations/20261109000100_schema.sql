-- École de Musique de Givry · schéma de données
-- Aucune donnée de santé ni numéro de sécurité sociale. Montants en euros (numeric 10,2).


-- Paramètres généraux (une seule ligne)
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  school_name text not null default 'École de Musique de Givry',
  school_address text not null default 'Givry (71640)',
  school_email text not null default '',
  exercise_start_month smallint not null default 9 check (exercise_start_month between 1 and 12),
  exercise_start_day smallint not null default 1 check (exercise_start_day between 1 and 28),
  retention_years smallint not null default 3 check (retention_years between 1 and 10),
  required_documents text[] not null default array['Attestation d’assurance responsabilité civile']
);
insert into public.settings (id) values (1);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  is_current boolean not null default false,
  registration_open boolean not null default false,
  installment_dates date[] not null check (cardinality(installment_dates) >= 3)
);
create unique index seasons_one_current on public.seasons (is_current) where is_current;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null check (length(family_name) between 1 and 60),
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  commune text not null,
  address text not null default '',
  sibling_check text not null default 'aucun' check (sibling_check in ('aucun', 'trouvee', 'a_verifier', 'validee')),
  reinscription_token uuid not null unique default gen_random_uuid(),
  continuation_token uuid unique,
  continuation_expires timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  phone text not null default '',
  relation text not null default '',
  is_primary boolean not null default false
);
create index guardians_family on public.guardians (family_id);
create index guardians_email on public.guardians (lower(email));

create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date not null
);
create index students_family on public.students (family_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  discipline text not null,
  kind text not null check (kind in ('instrument', 'collectif', 'fm')),
  formula text not null,
  teacher text not null default '',
  slots text[] not null default '{}',
  capacity integer not null check (capacity >= 0),
  levels text[] not null default '{}',
  requires_fm boolean not null default false,
  abbr text not null default '',
  color text not null default '#1f78c8',
  active boolean not null default true
);
create index courses_season on public.courses (season_id);

-- Grille tarifaire paramétrable par le bureau
create table public.fee_grid (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  formula text not null,
  public text not null check (public in ('enfant', 'adulte')),
  residence text not null check (residence in ('commune', 'hors_commune')),
  amount numeric(10, 2) not null check (amount >= 0),
  unique (season_id, formula, public, residence)
);

create table public.fee_rules (
  season_id uuid primary key references public.seasons on delete cascade,
  formulas jsonb not null default '[]',
  sibling_discount_pct numeric(5, 2) not null default 10 check (sibling_discount_pct between 0 and 100),
  sibling_from_rank smallint not null default 2 check (sibling_from_rank >= 2),
  sibling_children_only boolean not null default true,
  adhesion_amount numeric(10, 2) not null default 20 check (adhesion_amount >= 0),
  adult_age smallint not null default 18,
  communes text[] not null default array['Givry'],
  fm_formula text not null default 'fm_seule',
  fm_included_for_children boolean not null default true
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  student_id uuid not null references public.students on delete cascade,
  family_id uuid not null references public.families on delete cascade,
  course_id uuid not null references public.courses,
  fm_course_id uuid references public.courses,
  level text not null,
  slot text not null,
  status text not null default 'a_valider' check (status in ('a_valider', 'validee', 'annulee')),
  public text not null check (public in ('enfant', 'adulte')),
  residence text not null check (residence in ('commune', 'hors_commune')),
  sibling_rank smallint not null default 1,
  pricing jsonb not null,
  total numeric(10, 2) not null check (total >= 0),
  plan smallint not null check (plan in (1, 3)),
  intended_method text not null check (intended_method in ('cheque', 'virement', 'ancv', 'especes')),
  source text not null check (source in ('en_ligne', 'guichet', 'reinscription', 'liste_attente')),
  sibling_check text not null default 'aucun' check (sibling_check in ('aucun', 'trouvee', 'a_verifier', 'validee')),
  image_rights boolean,
  image_rights_at timestamptz,
  rules_accepted_at timestamptz,
  privacy_ack_at timestamptz,
  documents_received text[] not null default '{}',
  created_at timestamptz not null default now(),
  validated_at timestamptz
);
create index enrollments_season on public.enrollments (season_id);
create index enrollments_family on public.enrollments (family_id);
create index enrollments_course on public.enrollments (course_id);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  student_id uuid not null references public.students on delete cascade,
  family_id uuid not null references public.families on delete cascade,
  level text not null,
  slot text not null,
  plan smallint not null check (plan in (1, 3)),
  intended_method text not null check (intended_method in ('cheque', 'virement', 'ancv', 'especes')),
  image_rights boolean,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  status text not null default 'en_attente' check (status in ('en_attente', 'proposee', 'acceptee', 'refusee')),
  proposed_at timestamptz
);
create index waitlist_course on public.waitlist (course_id, created_at);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments on delete cascade,
  family_id uuid not null references public.families on delete cascade,
  season_id uuid not null references public.seasons on delete cascade,
  rank smallint not null,
  count smallint not null check (count in (1, 3)),
  due_on date not null,
  amount numeric(10, 2) not null check (amount >= 0)
);
create index installments_family on public.installments (family_id);

create sequence public.deposit_slip_number;
create table public.deposit_slips (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.deposit_slip_number'),
  created_at timestamptz not null default now(),
  deposited_on date
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments on delete cascade,
  family_id uuid not null references public.families on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('cheque', 'virement', 'ancv', 'especes')),
  reference text not null default '',
  bank text not null default '',
  received_on date not null,
  cashed_on date,
  deposit_slip_id uuid references public.deposit_slips on delete set null,
  created_at timestamptz not null default now(),
  check (method <> 'virement' or deposit_slip_id is null)
);
create index payments_installment on public.payments (installment_id);

-- Comptabilité de trésorerie
create table public.ledger_categories (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('recette', 'depense')),
  label text not null,
  system boolean not null default false,
  archived boolean not null default false
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons on delete set null,
  name text not null,
  date date not null,
  kind text not null check (kind in ('audition', 'concert', 'stage', 'autre')),
  place text not null default '',
  budget numeric(10, 2) not null default 0
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  filename text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size integer not null check (size between 1 and 10485760),
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('recette', 'depense')),
  category_id text not null references public.ledger_categories,
  amount numeric(10, 2) not null check (amount > 0),
  label text not null,
  event_id uuid references public.events on delete set null,
  payment_id uuid unique references public.payments on delete set null,
  method text check (method in ('cheque', 'virement', 'ancv', 'especes')),
  attachment_id uuid references public.attachments on delete set null,
  source text not null default 'manuel' check (source in ('auto', 'manuel')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index ledger_entries_date on public.ledger_entries (date);

-- Bureau, journal, mails, limites d'envoi
create table public.staff_profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('presidence', 'tresorerie', 'secretariat')),
  active boolean not null default true
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  details text not null default ''
);
create index audit_log_at on public.audit_log (at desc);

create table public.mail_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  kind text not null check (kind in ('confirmation', 'relance', 'proposition_place', 'reinscription', 'connexion')),
  status text not null default 'brouillon' check (status in ('brouillon', 'envoye')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  validated_by text
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
