-- Alter PWA : schéma initial.
--
-- Principe : la base ne contient que des données chiffrées par les Edge Functions
-- (AES-256-GCM, clé dans les secrets des fonctions, jamais en base).
-- Seuls restent en clair : les identifiants techniques, le code projet (Pxx),
-- les dates et les statuts de traitement.
--
-- Le navigateur n'accède JAMAIS directement à ces tables : RLS activé sans
-- aucune politique, et droits retirés aux rôles anon et authenticated.
-- Seules les Edge Functions (rôle service) lisent et écrivent.

create extension if not exists pgcrypto;

-- Portefeuille : une ligne par projet
create table if not exists public.alter_projets (
  owner     uuid        not null references auth.users (id) on delete cascade,
  code      text        not null check (code ~ '^P[0-9]{2,4}$'),
  version   integer     not null default 1,
  iv        text        not null,
  donnees   text        not null,  -- JSON chiffré : nom, domaine, statut, resume, prochaine_action, echeance, experts, confidentiel, info_du, source
  maj       timestamptz not null default now(),
  primary key (owner, code)
);

-- Journal : décisions, tâches, idées, notes, revues
create table if not exists public.alter_journal (
  id        uuid        primary key default gen_random_uuid(),
  owner     uuid        not null references auth.users (id) on delete cascade,
  cree_le   timestamptz not null default now(),
  iv        text        not null,
  donnees   text        not null   -- JSON chiffré : genre, texte, projet, source
);
create index if not exists alter_journal_owner_date on public.alter_journal (owner, cree_le desc);

-- Fil de conversation avec Alter
create table if not exists public.alter_messages (
  id        uuid        primary key default gen_random_uuid(),
  owner     uuid        not null references auth.users (id) on delete cascade,
  cree_le   timestamptz not null default clock_timestamp(),
  role      text        not null check (role in ('user', 'assistant')),
  iv        text        not null,
  donnees   text        not null   -- texte chiffré du message
);
create index if not exists alter_messages_owner_date on public.alter_messages (owner, cree_le desc);

-- Blocs QG proposés par Alter, en attente de validation
create table if not exists public.alter_propositions (
  id          uuid        primary key default gen_random_uuid(),
  owner       uuid        not null references auth.users (id) on delete cascade,
  cree_le     timestamptz not null default now(),
  statut      text        not null default 'en_attente'
                          check (statut in ('en_attente', 'validee', 'rejetee', 'perimee')),
  decide_le   timestamptz,
  iv          text        not null,
  donnees     text        not null  -- JSON chiffré : genre, code, champs, journal, motif, version_lue
);
create index if not exists alter_propositions_owner_statut on public.alter_propositions (owner, statut, cree_le desc);

-- Revues hebdomadaires préparées par le serveur
create table if not exists public.alter_revues (
  id        uuid        primary key default gen_random_uuid(),
  owner     uuid        not null references auth.users (id) on delete cascade,
  cree_le   timestamptz not null default now(),
  semaine   text        not null,  -- ex. 2026-W48, pour ne générer qu'une revue par semaine
  lue       boolean     not null default false,
  iv        text        not null,
  donnees   text        not null,
  unique (owner, semaine)
);

-- Abonnements aux notifications (Web Push). Les notifications sont envoyées
-- SANS contenu : seule l'adresse d'abonnement fournie par le navigateur est stockée.
create table if not exists public.alter_abonnements_push (
  id        uuid        primary key default gen_random_uuid(),
  owner     uuid        not null references auth.users (id) on delete cascade,
  endpoint  text        not null unique,
  cree_le   timestamptz not null default now()
);

-- Verrouillage : aucune politique RLS = aucun accès pour anon / authenticated.
alter table public.alter_projets           enable row level security;
alter table public.alter_journal           enable row level security;
alter table public.alter_messages          enable row level security;
alter table public.alter_propositions      enable row level security;
alter table public.alter_revues            enable row level security;
alter table public.alter_abonnements_push  enable row level security;

revoke all on public.alter_projets, public.alter_journal, public.alter_messages,
              public.alter_propositions, public.alter_revues, public.alter_abonnements_push
  from anon, authenticated;

-- Mise à jour atomique d'une fiche avec contrôle de version (évite d'écraser
-- une modification faite entre la proposition d'Alter et ta validation).
create or replace function public.alter_maj_projet(
  p_owner uuid, p_code text, p_version_attendue integer, p_iv text, p_donnees text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nouvelle_version integer;
begin
  update public.alter_projets
     set iv = p_iv, donnees = p_donnees, version = version + 1, maj = now()
   where owner = p_owner and code = p_code and version = p_version_attendue
  returning version into nouvelle_version;
  if nouvelle_version is null then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  return nouvelle_version;
end;
$$;
revoke all on function public.alter_maj_projet(uuid, text, integer, text, text) from public, anon, authenticated;
