-- The Court: let players post their score to the online leaderboard.
--
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- It changes the existing table public.thecourt; it does not create a table.
--
-- How it stays safe:
--   * The public (publishable) key still cannot insert, update or delete rows
--     in the table directly. Those rights are taken away below.
--   * The only way in is the function submit_score. It checks every value
--     and then inserts exactly one row. Nothing else can be written.
--   * No secret key is needed anywhere: the function runs inside the database.
--
-- Limits (a score is worked out in the player's browser, so the database
-- cannot prove it is real; these checks only stop nonsense and floods):
--   name   1-8 characters: A-Z, 0-9, space, dot, dash (what the game allows)
--   court  1-120
--   score  1 to court x 7650 (7650 is the most one court can ever give:
--          49 blocks x 50 points x the x3 combo, plus 3 lives x 100)
--   flood  at most 30 new scores per minute across the whole board

-- 1. The public key may read, but never write the table directly.
revoke insert, update, delete, truncate on public.thecourt from anon, authenticated;

-- 2. The one, checked way to add a score.
create or replace function public.submit_score(p_name text, p_score bigint, p_court bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_name is null or p_name !~ '^[A-Z0-9 .-]{1,8}$' or btrim(p_name) = '' then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if p_court is null or p_court < 1 or p_court > 120 then
    raise exception 'invalid court' using errcode = '22023';
  end if;
  if p_score is null or p_score < 1 or p_score > p_court * 7650 then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if (select count(*) from public.thecourt where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many scores, try again soon' using errcode = '54000';
  end if;
  insert into public.thecourt (name, score, court, at, created_at)
  values (p_name, p_score, p_court, (extract(epoch from now()) * 1000)::bigint, now());
end;
$fn$;

-- 3. Only this function is callable with the public key.
revoke all on function public.submit_score(text, bigint, bigint) from public;
grant execute on function public.submit_score(text, bigint, bigint) to anon, authenticated;

-- 4. Tell the API about the new function straight away.
notify pgrst, 'reload schema';
