-- Trace des imports du QG claude.ai : empêche d'importer deux fois le même fichier.
-- On ne garde que l'empreinte SHA-256 de l'export et les compteurs, aucun contenu.

create table if not exists public.alter_imports (
  id          uuid        primary key default gen_random_uuid(),
  owner       uuid        not null references auth.users (id) on delete cascade,
  cree_le     timestamptz not null default now(),
  empreinte   text        not null,
  projets     integer     not null,
  journal     integer     not null,
  unique (owner, empreinte)
);

alter table public.alter_imports enable row level security;
revoke all on public.alter_imports from anon, authenticated;
