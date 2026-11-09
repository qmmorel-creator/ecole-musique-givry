-- Données de référence : nomenclature associative proposée par défaut (paramétrable par le bureau)
insert into public.ledger_categories (id, kind, label, system) values
  ('cat-rec-inscriptions', 'recette', 'Inscriptions encaissées', true),
  ('cat-rec-sub-commune', 'recette', 'Subvention de la commune', false),
  ('cat-rec-sub-dep', 'recette', 'Subventions du département et de la région', false),
  ('cat-rec-dons', 'recette', 'Dons', false),
  ('cat-rec-cotisations', 'recette', 'Cotisations et adhésions hors inscription', false),
  ('cat-rec-concerts', 'recette', 'Concerts, auditions et buvette', false),
  ('cat-rec-stages', 'recette', 'Stages', false),
  ('cat-rec-autres', 'recette', 'Autres recettes', false),
  ('cat-dep-prof', 'depense', 'Rémunération des professeurs (salaires et charges versés)', false),
  ('cat-dep-evenements', 'depense', 'Événements · salle, communication, réception', false),
  ('cat-dep-assurance', 'depense', 'Assurance', false),
  ('cat-dep-instruments', 'depense', 'Location et entretien d’instruments', false),
  ('cat-dep-cmf', 'depense', 'Cotisation fédération (CMF)', false),
  ('cat-dep-sacem', 'depense', 'SACEM et droits', false),
  ('cat-dep-partitions', 'depense', 'Partitions et fournitures', false),
  ('cat-dep-fonctionnement', 'depense', 'Frais de fonctionnement (bureau, poste, site)', false),
  ('cat-dep-banque', 'depense', 'Frais bancaires', false),
  ('cat-dep-autres', 'depense', 'Autres dépenses', false)
on conflict (id) do nothing;

-- Justificatifs : bucket privé, lecture par liens signés à durée courte (60 s côté application)
insert into storage.buckets (id, name, public) values ('justificatifs', 'justificatifs', false)
on conflict (id) do nothing;

create policy justificatifs_read on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and public.has_cap('comptabilite'));
create policy justificatifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.has_cap('comptabilite'));
create policy justificatifs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and public.has_cap('comptabilite'));
