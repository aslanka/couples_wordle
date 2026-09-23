create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  current_streak integer not null default 0,
  last_completed_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('a','b')),
  joined_at timestamptz not null default now(),
  primary key (pair_id, user_id),
  unique (user_id)
);

create table if not exists public.daily_games (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  game_date date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pair_id, game_date)
);

create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  daily_game_id uuid not null references public.daily_games(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  solver_id uuid not null references public.profiles(id) on delete cascade,
  secret_word text not null check (secret_word ~ '^[A-Z]{5}$'),
  solved boolean not null default false,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (daily_game_id, creator_id)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.puzzles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  guess text not null check (guess ~ '^[A-Z]{5}$'),
  states text[] not null,
  guess_number integer not null check (guess_number between 1 and 6),
  created_at timestamptz not null default now(),
  unique (puzzle_id, guess_number)
);

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.daily_games enable row level security;
alter table public.puzzles enable row level security;
alter table public.guesses enable row level security;

drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles
  for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.make_invite_code()
returns text
language plpgsql
as $$
declare c text;
begin
  loop
    c := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists(select 1 from public.pairs where invite_code = c);
  end loop;
  return c;
end;
$$;

create or replace function public.score_word(target text, attempt text)
returns text[]
language plpgsql
immutable
as $$
declare
  result text[] := array['absent','absent','absent','absent','absent'];
  used boolean[] := array[false,false,false,false,false];
  i int;
  j int;
begin
  target := upper(target);
  attempt := upper(attempt);
  for i in 1..5 loop
    if substr(attempt,i,1) = substr(target,i,1) then
      result[i] := 'correct';
      used[i] := true;
    end if;
  end loop;
  for i in 1..5 loop
    if result[i] = 'correct' then continue; end if;
    for j in 1..5 loop
      if not used[j] and substr(attempt,i,1) = substr(target,j,1) then
        result[i] := 'present';
        used[j] := true;
        exit;
      end if;
    end loop;
  end loop;
  return result;
end;
$$;

create or replace function public.create_pair()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.pairs;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from public.pair_members where user_id = uid) then
    raise exception 'You are already paired';
  end if;
  insert into public.pairs(invite_code)
  values (public.make_invite_code())
  returning * into p;
  insert into public.pair_members(pair_id,user_id,role) values (p.id,uid,'a');
  return jsonb_build_object('pair_id',p.id,'invite_code',p.invite_code);
end;
$$;

create or replace function public.join_pair(code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  cnt int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if exists(select 1 from public.pair_members where user_id = uid) then
    raise exception 'You are already paired';
  end if;
  select id into pid from public.pairs where invite_code = upper(trim(code));
  if pid is null then raise exception 'Invite code not found'; end if;
  select count(*) into cnt from public.pair_members where pair_id = pid;
  if cnt >= 2 then raise exception 'This pair is already full'; end if;
  insert into public.pair_members(pair_id,user_id,role) values (pid,uid,'b');
  return jsonb_build_object('pair_id',pid,'invite_code',upper(trim(code)));
end;
$$;

create or replace function public.get_pair_dashboard()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pm record;
  partner record;
  pairrow public.pairs;
  game public.daily_games;
  myp public.puzzles;
  theirp public.puzzles;
  my_guesses jsonb := '[]'::jsonb;
  their_guess_count int := 0;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into pm from public.pair_members where user_id = uid;
  if pm is null then return jsonb_build_object('paired',false); end if;

  select p.* into pairrow from public.pairs p where p.id = pm.pair_id;
  select m.user_id, pr.name into partner
    from public.pair_members m join public.profiles pr on pr.id = m.user_id
    where m.pair_id = pm.pair_id and m.user_id <> uid;

  insert into public.daily_games(pair_id,game_date)
  values (pm.pair_id,current_date)
  on conflict (pair_id,game_date) do update set game_date = excluded.game_date
  returning * into game;

  select * into myp from public.puzzles where daily_game_id = game.id and creator_id = uid;
  if partner.user_id is not null then
    select * into theirp from public.puzzles where daily_game_id = game.id and creator_id = partner.user_id;
  end if;

  if theirp.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('word',g.guess,'states',g.states) order by g.guess_number),'[]'::jsonb)
      into my_guesses from public.guesses g where g.puzzle_id = theirp.id and g.user_id = uid;
  end if;
  if myp.id is not null and partner.user_id is not null then
    select count(*) into their_guess_count from public.guesses g where g.puzzle_id = myp.id and g.user_id = partner.user_id;
  end if;

  return jsonb_build_object(
    'paired', true,
    'pairId', pairrow.id,
    'inviteCode', pairrow.invite_code,
    'streak', pairrow.current_streak,
    'partnerJoined', partner.user_id is not null,
    'partnerName', partner.name,
    'myWordReady', myp.id is not null,
    'partnerWordReady', theirp.id is not null,
    'myResult', jsonb_build_object(
      'guesses', my_guesses,
      'solved', coalesce(theirp.solved,false),
      'finished', theirp.finished_at is not null,
      'answer', case when theirp.finished_at is not null then theirp.secret_word else null end
    ),
    'partnerResult', jsonb_build_object(
      'guessCount', their_guess_count,
      'solved', coalesce(myp.solved,false),
      'finished', myp.finished_at is not null
    ),
    'completed', game.completed_at is not null
  );
end;
$$;

create or replace function public.submit_word(word text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pm record;
  partner_id uuid;
  game_id uuid;
  clean text := upper(trim(word));
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if clean !~ '^[A-Z]{5}$' then raise exception 'Word must be five letters'; end if;
  select * into pm from public.pair_members where user_id = uid;
  if pm is null then raise exception 'Not paired'; end if;
  select user_id into partner_id from public.pair_members where pair_id = pm.pair_id and user_id <> uid;
  if partner_id is null then raise exception 'Your partner has not joined yet'; end if;
  insert into public.daily_games(pair_id,game_date) values(pm.pair_id,current_date)
    on conflict(pair_id,game_date) do update set game_date = excluded.game_date
    returning id into game_id;
  insert into public.puzzles(daily_game_id,creator_id,solver_id,secret_word)
  values(game_id,uid,partner_id,clean)
  on conflict(daily_game_id,creator_id) do nothing;
  return public.get_pair_dashboard();
end;
$$;

create or replace function public.submit_guess(attempt text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := upper(trim(attempt));
  pm record;
  game public.daily_games;
  puzzle public.puzzles;
  n int;
  states text[];
  solved_now boolean;
  both_done boolean;
  pairrow public.pairs;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if clean !~ '^[A-Z]{5}$' then raise exception 'Guess must be five letters'; end if;
  select * into pm from public.pair_members where user_id = uid;
  if pm is null then raise exception 'Not paired'; end if;
  select * into game from public.daily_games where pair_id = pm.pair_id and game_date = current_date;
  if game.id is null then raise exception 'No game for today'; end if;
  select * into puzzle from public.puzzles where daily_game_id = game.id and solver_id = uid;
  if puzzle.id is null then raise exception 'Your partner has not sent a word yet'; end if;
  if puzzle.finished_at is not null then raise exception 'Puzzle already finished'; end if;
  select count(*) into n from public.guesses where puzzle_id = puzzle.id;
  if n >= 6 then raise exception 'No guesses left'; end if;

  states := public.score_word(puzzle.secret_word,clean);
  solved_now := clean = puzzle.secret_word;
  insert into public.guesses(puzzle_id,user_id,guess,states,guess_number)
  values(puzzle.id,uid,clean,states,n+1);

  if solved_now or n+1 >= 6 then
    update public.puzzles set solved = solved_now, finished_at = now() where id = puzzle.id;
  end if;

  select bool_and(finished_at is not null) into both_done
    from public.puzzles where daily_game_id = game.id;

  if both_done and (select count(*) from public.puzzles where daily_game_id = game.id) = 2 and game.completed_at is null then
    update public.daily_games set completed_at = now() where id = game.id;
    select * into pairrow from public.pairs where id = pm.pair_id for update;
    update public.pairs
      set current_streak = case when pairrow.last_completed_date = current_date - 1 then pairrow.current_streak + 1 else 1 end,
          last_completed_date = current_date
      where id = pm.pair_id;
  end if;

  return public.get_pair_dashboard();
end;
$$;

grant execute on function public.create_pair() to authenticated;
grant execute on function public.join_pair(text) to authenticated;
grant execute on function public.get_pair_dashboard() to authenticated;
grant execute on function public.submit_word(text) to authenticated;
grant execute on function public.submit_guess(text) to authenticated;
