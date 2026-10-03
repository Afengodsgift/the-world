-- THE WORLD: persistent shared memory (Phase 1).
-- Additive only. Nothing in the live game reads these until the phase-0-1 code ships.
-- Security model: the game uses the public anon key and rooms are identified by an
-- unguessable 8-char code, so anon may read/insert/update rows but never delete.

create table if not exists public.world_state (
  room       text        not null check (char_length(room) between 4 and 16),
  key        text        not null check (char_length(key) between 1 and 64),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (room, key),
  constraint world_state_size check (pg_column_size(value) < 65536)
);

create table if not exists public.world_log (
  id      bigint generated always as identity primary key,
  room    text        not null check (char_length(room) between 4 and 16),
  ts      timestamptz not null default now(),
  kind    text        not null check (char_length(kind) between 1 and 32),
  key     text        not null check (char_length(key) between 1 and 64),
  by_name text,
  data    jsonb,
  unique (room, kind, key),
  constraint world_log_size check (pg_column_size(data) < 8192)
);
create index if not exists world_log_room_ts on public.world_log (room, ts);

alter table public.world_state enable row level security;
alter table public.world_log   enable row level security;

drop policy if exists world_state_read  on public.world_state;
drop policy if exists world_state_write on public.world_state;
drop policy if exists world_state_upd   on public.world_state;
create policy world_state_read  on public.world_state for select to anon, authenticated using (true);
create policy world_state_write on public.world_state for insert to anon, authenticated with check (true);
create policy world_state_upd   on public.world_state for update to anon, authenticated using (true) with check (true);

drop policy if exists world_log_read  on public.world_log;
drop policy if exists world_log_write on public.world_log;
create policy world_log_read  on public.world_log for select to anon, authenticated using (true);
create policy world_log_write on public.world_log for insert to anon, authenticated with check (true);
