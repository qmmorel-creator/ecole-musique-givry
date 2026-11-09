-- Règles d'accès : RLS sur toutes les tables. Le public n'accède à rien directement ;
-- il passe par public_catalog() (sans donnée personnelle) et par les fonctions Edge.

-- Rôle du membre du bureau connecté (null si visiteur ou compte désactivé)
create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff_profiles where id = auth.uid() and active
$$;

-- Même matrice que src/domain/permissions.ts
create or replace function public.has_cap(cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(case public.staff_role()
    when 'presidence' then cap in ('eleves', 'places', 'encaissements', 'bordereaux', 'comptabilite', 'parametres', 'comptes', 'rgpd', 'journal')
    when 'tresorerie' then cap in ('eleves', 'places', 'encaissements', 'bordereaux', 'comptabilite', 'parametres', 'rgpd', 'journal')
    when 'secretariat' then cap in ('eleves', 'places', 'encaissements')
  end, false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_role() is not null
$$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'seasons', 'families', 'guardians', 'students', 'courses', 'fee_grid', 'fee_rules', 'enrollments', 'waitlist',
    'installments', 'deposit_slips', 'payments', 'ledger_categories', 'events', 'attachments', 'ledger_entries', 'staff_profiles', 'audit_log', 'mail_outbox', 'rate_limits']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Paramétrage : lisible par le bureau, modifiable selon le rôle
create policy settings_read on public.settings for select to authenticated using (public.is_staff());
create policy settings_write on public.settings for update to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres'));
create policy seasons_read on public.seasons for select to authenticated using (public.is_staff());
create policy seasons_write on public.seasons for all to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres'));
create policy courses_read on public.courses for select to authenticated using (public.is_staff());
create policy courses_write on public.courses for all to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres'));
create policy fee_grid_read on public.fee_grid for select to authenticated using (public.is_staff());
create policy fee_grid_write on public.fee_grid for all to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres'));
create policy fee_rules_read on public.fee_rules for select to authenticated using (public.is_staff());
create policy fee_rules_write on public.fee_rules for all to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres'));
create policy categories_read on public.ledger_categories for select to authenticated using (public.is_staff());
create policy categories_write on public.ledger_categories for all to authenticated using (public.has_cap('parametres')) with check (public.has_cap('parametres') and not system);

-- Familles, élèves, inscriptions
create policy families_rw on public.families for all to authenticated using (public.has_cap('eleves')) with check (public.has_cap('eleves'));
create policy guardians_rw on public.guardians for all to authenticated using (public.has_cap('eleves')) with check (public.has_cap('eleves'));
create policy students_rw on public.students for all to authenticated using (public.has_cap('eleves')) with check (public.has_cap('eleves'));
create policy enrollments_rw on public.enrollments for all to authenticated using (public.has_cap('eleves')) with check (public.has_cap('eleves'));
create policy waitlist_rw on public.waitlist for all to authenticated using (public.has_cap('places')) with check (public.has_cap('places'));
create policy installments_read on public.installments for select to authenticated using (public.has_cap('encaissements'));
create policy installments_write on public.installments for all to authenticated using (public.has_cap('eleves')) with check (public.has_cap('eleves'));

-- Règlements : saisie par le bureau, encaissement en banque réservé à la trésorerie et à la présidence
create policy payments_read on public.payments for select to authenticated using (public.has_cap('encaissements'));
create policy payments_insert on public.payments for insert to authenticated with check (public.has_cap('encaissements') and (cashed_on is null or method = 'virement') and deposit_slip_id is null);
create policy payments_update on public.payments for update to authenticated using (public.has_cap('bordereaux')) with check (public.has_cap('bordereaux'));
create policy payments_delete on public.payments for delete to authenticated using (
  public.has_cap('encaissements') and (deposit_slip_id is null or not exists (select 1 from public.deposit_slips d where d.id = deposit_slip_id and d.deposited_on is not null)));
create policy slips_read on public.deposit_slips for select to authenticated using (public.has_cap('encaissements'));
create policy slips_write on public.deposit_slips for all to authenticated using (public.has_cap('bordereaux')) with check (public.has_cap('bordereaux'));

-- Comptabilité : les recettes automatiques ne se modifient pas à la main
create policy entries_read on public.ledger_entries for select to authenticated using (public.has_cap('comptabilite'));
create policy entries_insert on public.ledger_entries for insert to authenticated with check (public.has_cap('comptabilite') and source = 'manuel' and payment_id is null);
create policy entries_update on public.ledger_entries for update to authenticated using (public.has_cap('comptabilite') and source = 'manuel') with check (source = 'manuel' and payment_id is null);
create policy entries_delete on public.ledger_entries for delete to authenticated using (public.has_cap('comptabilite') and source = 'manuel');
create policy events_read on public.events for select to authenticated using (public.is_staff());
create policy events_write on public.events for all to authenticated using (public.has_cap('comptabilite')) with check (public.has_cap('comptabilite'));
create policy attachments_rw on public.attachments for all to authenticated using (public.has_cap('comptabilite')) with check (public.has_cap('comptabilite'));

-- Bureau, journal, mails
create policy staff_read on public.staff_profiles for select to authenticated using (public.is_staff() or id = auth.uid());
create policy staff_write on public.staff_profiles for all to authenticated using (public.has_cap('comptes')) with check (public.has_cap('comptes'));
create policy audit_read on public.audit_log for select to authenticated using (public.has_cap('journal'));
create policy mails_rw on public.mail_outbox for all to authenticated using (public.has_cap('encaissements')) with check (public.has_cap('encaissements'));
-- rate_limits : aucune politique, accessible uniquement par la clé service_role des fonctions Edge.

-- Journal automatique des actions du bureau
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  rec_id text;
begin
  if auth.uid() is null then
    return coalesce(new, old); -- actions du formulaire public : tracées par la fonction Edge
  end if;
  select full_name into actor_name from public.staff_profiles where id = auth.uid();
  rec_id := case when tg_op = 'DELETE' then to_jsonb(old) ->> 'id' else to_jsonb(new) ->> 'id' end;
  insert into public.audit_log (actor_id, actor, action, entity, entity_id, details)
  values (auth.uid(), coalesce(actor_name, 'compte inconnu'),
    case tg_op when 'INSERT' then 'Création' when 'UPDATE' then 'Modification' else 'Suppression' end,
    tg_table_name, rec_id,
    case when tg_op = 'UPDATE' then (select coalesce(string_agg(key, ', '), '') from jsonb_each(to_jsonb(new)) n where n.value is distinct from to_jsonb(old) -> n.key) else '' end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings', 'seasons', 'families', 'guardians', 'students', 'courses', 'fee_grid', 'fee_rules', 'enrollments', 'waitlist',
    'installments', 'deposit_slips', 'payments', 'ledger_categories', 'events', 'attachments', 'ledger_entries', 'staff_profiles', 'mail_outbox']
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- Déclencheur des recettes : un règlement encaissé crée sa recette « Inscriptions encaissées »,
-- datée du jour d'encaissement ; elle suit les corrections et disparaît si le règlement est supprimé.
-- Même règle que src/domain/ledger.ts (ledgerEntryFromPayment).
create or replace function public.payments_to_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lbl text;
begin
  if tg_op = 'DELETE' then
    delete from public.ledger_entries where payment_id = old.id and source = 'auto';
    return old;
  end if;
  if new.cashed_on is null then
    delete from public.ledger_entries where payment_id = new.id and source = 'auto';
    return new;
  end if;
  select 'Inscription · famille ' || f.family_name || ' · ' || s.first_name || ' · échéance ' || i.rank || '/' || i.count
    into lbl
    from public.installments i
    join public.enrollments e on e.id = i.enrollment_id
    join public.students s on s.id = e.student_id
    join public.families f on f.id = new.family_id
   where i.id = new.installment_id;
  insert into public.ledger_entries (date, kind, category_id, amount, label, payment_id, method, source)
  values (new.cashed_on, 'recette', 'cat-rec-inscriptions', new.amount, coalesce(lbl, 'Inscription'), new.id, new.method, 'auto')
  on conflict (payment_id) do update set date = excluded.date, amount = excluded.amount, method = excluded.method, label = excluded.label;
  return new;
end $$;

create trigger payments_to_ledger after insert or update or delete on public.payments
for each row execute function public.payments_to_ledger();

-- Un virement est encaissé à sa réception
create or replace function public.payments_defaults() returns trigger
language plpgsql as $$
begin
  if new.method = 'virement' and new.cashed_on is null then new.cashed_on := new.received_on; end if;
  return new;
end $$;
create trigger payments_defaults before insert on public.payments for each row execute function public.payments_defaults();

-- Normalisation des noms, identique à normalizeName() du domaine
create or replace function public.norm_name(s text) returns text
language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(s, ''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿŒœÆæ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyOoAa')), '[^a-z]', '', 'g')
$$;

-- Recherche de fratrie : ne renvoie que vrai ou faux. Appelée uniquement par la fonction Edge
-- (limite d'envois par adresse IP), jamais directement par le navigateur.
create or replace function public.sibling_lookup(p_family_name text, p_postal_code text, p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.norm_name(p_family_name) <> '' and exists (
    select 1 from public.families f
    join public.guardians g on g.family_id = f.id
    where public.norm_name(f.family_name) = public.norm_name(p_family_name)
      and f.postal_code = trim(p_postal_code)
      and lower(trim(g.email)) = lower(trim(p_email)))
$$;
revoke all on function public.sibling_lookup(text, text, text) from public, anon, authenticated;

-- Limite d'envois par clé (adresse IP hachée) et fenêtre de temps
create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Catalogue public : saison ouverte, cours et places restantes, grille. Aucune donnée personnelle.
create or replace function public.public_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from public.seasons where is_current limit 1),
  c as (
    select c.*, greatest(0, c.capacity - (select count(*) from public.enrollments e where e.status <> 'annulee' and (e.course_id = c.id or e.fm_course_id = c.id)))::int as remaining
    from public.courses c join s on s.id = c.season_id where c.active
  )
  select jsonb_build_object(
    'season', (select to_jsonb(s) from s),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'discipline', discipline, 'kind', kind, 'formula', formula, 'teacher', teacher, 'slots', slots, 'levels', levels,
      'requires_fm', requires_fm, 'abbr', abbr, 'color', color, 'remaining', remaining) order by discipline) from c), '[]'),
    'grid', coalesce((select jsonb_agg(to_jsonb(g)) from public.fee_grid g join s on s.id = g.season_id), '[]'),
    'rules', (select to_jsonb(r) from public.fee_rules r join s on s.id = r.season_id),
    'settings', (select jsonb_build_object('school_name', school_name, 'school_email', school_email, 'retention_years', retention_years) from public.settings)
  )
$$;
grant execute on function public.public_catalog() to anon, authenticated;

-- Bordereau : regroupe des pièces non encaissées (chèques, ANCV, espèces)
create or replace function public.create_deposit_slip(p_payment_ids uuid[]) returns public.deposit_slips
language plpgsql security invoker set search_path = public as $$
declare slip public.deposit_slips;
begin
  if not public.has_cap('bordereaux') then raise exception 'Droits insuffisants'; end if;
  if exists (select 1 from public.payments where id = any(p_payment_ids) and (method = 'virement' or cashed_on is not null or deposit_slip_id is not null))
     or (select count(*) from public.payments where id = any(p_payment_ids)) <> cardinality(p_payment_ids) then
    raise exception 'Sélection invalide';
  end if;
  insert into public.deposit_slips default values returning * into slip;
  update public.payments set deposit_slip_id = slip.id where id = any(p_payment_ids);
  return slip;
end $$;

-- Dépôt en banque : encaisse les pièces du bordereau (le déclencheur crée les recettes)
create or replace function public.mark_deposited(p_slip uuid, p_date date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_cap('bordereaux') then raise exception 'Droits insuffisants'; end if;
  update public.deposit_slips set deposited_on = p_date where id = p_slip and deposited_on is null;
  if not found then raise exception 'Bordereau introuvable ou déjà déposé'; end if;
  update public.payments set cashed_on = p_date where deposit_slip_id = p_slip;
end $$;

-- Rattachement d'une famille à une autre (fratrie vérifiée par le bureau)
create or replace function public.merge_family(p_from uuid, p_into uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_cap('eleves') then raise exception 'Droits insuffisants'; end if;
  if p_from = p_into then raise exception 'Familles identiques'; end if;
  update public.guardians set family_id = p_into, is_primary = false where family_id = p_from;
  update public.students set family_id = p_into where family_id = p_from;
  update public.enrollments set family_id = p_into, sibling_check = case when sibling_check = 'a_verifier' then 'validee' else sibling_check end where family_id = p_from;
  update public.installments set family_id = p_into where family_id = p_from;
  update public.payments set family_id = p_into where family_id = p_from;
  update public.waitlist set family_id = p_into where family_id = p_from;
  update public.families set sibling_check = 'validee' where id = p_into;
  delete from public.families where id = p_from;
end $$;

-- Purge RGPD : familles sans saison depuis plus que la durée de conservation
create or replace function public.purge_candidates() returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.id from public.families f
  where coalesce(
    (select max(s.ends_on) from public.seasons s where s.id in (select season_id from public.enrollments where family_id = f.id union select season_id from public.waitlist where family_id = f.id)),
    f.created_at::date) < (current_date - make_interval(years => (select retention_years from public.settings)))
$$;
revoke all on function public.purge_candidates() from public, anon, authenticated;

create or replace function public.purge_preview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_cap('rgpd') then raise exception 'Droits insuffisants'; end if;
  return jsonb_build_object(
    'families', (select count(*) from public.purge_candidates()),
    'students', (select count(*) from public.students where family_id in (select public.purge_candidates())),
    'enrollments', (select count(*) from public.enrollments where family_id in (select public.purge_candidates())),
    'before', (current_date - make_interval(years => (select retention_years from public.settings)))::date);
end $$;

create or replace function public.purge_old_seasons() returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.has_cap('rgpd') then raise exception 'Droits insuffisants'; end if;
  res := public.purge_preview();
  -- Les écritures comptables restent, sans donnée personnelle
  update public.ledger_entries set label = 'Inscription (données personnelles purgées)', payment_id = null
   where payment_id in (select id from public.payments where family_id in (select public.purge_candidates()));
  delete from public.families where id in (select public.purge_candidates());
  insert into public.audit_log (actor_id, actor, action, entity, details)
  values (auth.uid(), coalesce((select full_name from public.staff_profiles where id = auth.uid()), '?'), 'Purge des anciennes saisons', 'families', res::text);
  return res;
end $$;
grant execute on function public.purge_preview(), public.purge_old_seasons(), public.create_deposit_slip(uuid[]), public.mark_deposited(uuid, date), public.merge_family(uuid, uuid) to authenticated;
revoke execute on function public.purge_preview(), public.purge_old_seasons(), public.create_deposit_slip(uuid[]), public.mark_deposited(uuid, date), public.merge_family(uuid, uuid) from anon;

-- Le déclencheur d'une recette détachée (purge) ne doit pas la supprimer
-- (payment_id devient null : la ligne n'est plus liée à un règlement).
