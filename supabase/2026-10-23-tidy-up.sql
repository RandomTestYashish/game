-- The Court: leaderboard tidy-up, 2026-10-23.
--
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- It changes no table structure and no permissions, and it is safe to run
-- again (the delete finds nothing the second time; the index already exists).
-- It assumes submit_score.sql has already been run (the 150300 limit).

-- 1. Remove the one test score left from checking the game (CLTEST, 695,
--    court 2, saved 2026-10-20 18:08 UTC). Only that row, by its id and name.
delete from public.thecourt where id = 46 and name = 'CLTEST';

-- 2. The leaderboard asks for the top 20 by score; an index keeps that fast
--    as the table grows.
create index if not exists thecourt_score_desc on public.thecourt (score desc);

-- 3. Checks (read only). Expected: no CLTEST row; the index is listed; the
--    function's limit says 150300; anon may execute submit_score but not
--    insert into the table directly.
select count(*) as cltest_rows_left from public.thecourt where name = 'CLTEST';
select indexname from pg_indexes where schemaname = 'public' and tablename = 'thecourt';
select position('150300' in pg_get_functiondef('public.submit_score(text,bigint,bigint)'::regprocedure)) > 0 as limit_is_150300;
select has_function_privilege('anon', 'public.submit_score(text,bigint,bigint)', 'execute') as anon_can_submit,
       has_table_privilege('anon', 'public.thecourt', 'insert') as anon_can_insert_directly;
