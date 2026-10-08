create table if not exists search_cache (
  query_hash text primary key,
  query text not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists answers (
  id text primary key,
  data jsonb not null,
  upvotes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists search_logs (
  id bigserial primary key,
  query text not null,
  cache_hit boolean not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists favorites (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_logs_created_at on search_logs (created_at);
create index if not exists idx_answers_created_at on answers (created_at);
