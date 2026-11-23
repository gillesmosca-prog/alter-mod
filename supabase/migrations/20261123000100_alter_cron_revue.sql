-- Revue du lundi à 7 h 40, heure de Genève.
--
-- pg_cron raisonne en UTC. Genève est à UTC+1 en hiver et UTC+2 en été :
-- on déclenche donc à 5 h 40 ET 6 h 40 UTC le lundi, et la fonction alter-revue
-- vérifie elle-même qu'il est bien 7 h 40 à Genève (et qu'aucune revue n'existe
-- déjà pour la semaine). Un seul des deux appels produit la revue.
--
-- Prérequis (à faire une fois, dans le SQL Editor, AVANT cette migration) :
--   select vault.create_secret('https://<ref-projet>.supabase.co/functions/v1/alter-revue', 'alter_revue_url');
--   select vault.create_secret('<secret aléatoire, le même que ALTER_CRON_SECRET>', 'alter_cron_secret');
-- Aucun secret n'est écrit dans ce fichier.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('alter-revue-lundi')
 where exists (select 1 from cron.job where jobname = 'alter-revue-lundi');

select cron.schedule(
  'alter-revue-lundi',
  '40 5,6 * * 1',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'alter_revue_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-alter-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'alter_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
