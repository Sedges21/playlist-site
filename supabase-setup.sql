-- =====================================================================
-- 플레이리스트 사이트 Supabase 초기 설정
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- 여러 번 실행해도 오류 없이 같은 결과가 되도록 작성했습니다.
-- =====================================================================

-- 1) 관리자 목록 ------------------------------------------------------
--    여기에 등록된 로그인 계정만 플레이리스트를 만들고 고칠 수 있어요.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note    text,                         -- 예: '개발자', '스트리머'
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- 로그인한 사람은 "내가 관리자인지"만 확인할 수 있음 (다른 관리자 목록은 안 보임)
drop policy if exists "admins: read own row" on public.admins;
create policy "admins: read own row" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- 관리자 여부 확인 함수 (아래 권한 규칙에서 사용)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2) 플레이리스트 ------------------------------------------------------
create table if not exists public.playlists (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,                       -- 예: '가을맞이'
  yt_list_id   text not null,                       -- 유튜브 뮤직 재생목록 ID (list= 값)
  cover_path   text,                                -- covers 저장소 안의 파일 경로
  tracks       jsonb not null default '[]'::jsonb,  -- ["이문세 - 가을이 오면", ...]
  sort_order   integer not null default 0,          -- 첫 화면 정렬 순서 (작을수록 앞)
  is_published boolean not null default true,       -- false면 시청자에게 숨김
  theme        jsonb,                               -- 배경 색 {"grid": [[...3], [...3], [...3]]}, 없으면 커버 흐림
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 예전에 만든 테이블에도 배경 색 칸 추가
alter table public.playlists add column if not exists theme jsonb;
-- 날짜 (재생 화면에 표시할지 선택)
alter table public.playlists add column if not exists playlist_date date;
alter table public.playlists add column if not exists show_date boolean not null default true;

-- 수정할 때마다 updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists playlists_touch on public.playlists;
create trigger playlists_touch
  before update on public.playlists
  for each row execute function public.touch_updated_at();

alter table public.playlists enable row level security;

-- 시청자(로그인 안 함 포함): 공개된 플레이리스트만 읽기
drop policy if exists "playlists: public read" on public.playlists;
create policy "playlists: public read" on public.playlists
  for select to anon, authenticated
  using (is_published or public.is_admin());

-- 관리자만 추가 / 수정 / 삭제
drop policy if exists "playlists: admin insert" on public.playlists;
create policy "playlists: admin insert" on public.playlists
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "playlists: admin update" on public.playlists;
create policy "playlists: admin update" on public.playlists
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "playlists: admin delete" on public.playlists;
create policy "playlists: admin delete" on public.playlists
  for delete to authenticated
  using (public.is_admin());

-- 3) 커버 이미지 저장소 -------------------------------------------------
--    공개 버킷: 누구나 이미지 주소로 볼 수 있고, 올리기/지우기는 관리자만.
--    파일 하나 최대 5MB, jpg / png / webp만 허용.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "covers: admin read" on storage.objects;
create policy "covers: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and public.is_admin());

drop policy if exists "covers: admin upload" on storage.objects;
create policy "covers: admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and public.is_admin());

drop policy if exists "covers: admin update" on storage.objects;
create policy "covers: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and public.is_admin());

drop policy if exists "covers: admin delete" on storage.objects;
create policy "covers: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and public.is_admin());

-- 3-1) Data API 권한 ------------------------------------------------------
--    2026년 5월 30일 이후 만든 프로젝트는 새 테이블이 자동 공개되지 않아서
--    GRANT가 있어야 사이트가 테이블을 읽고 쓸 수 있어요.
--    (누가 무엇을 할 수 있는지는 위의 권한 규칙(RLS)이 그대로 제한합니다)
grant select on table public.playlists to anon, authenticated;
grant insert, update, delete on table public.playlists to authenticated;
grant select on table public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- 4) 관리자 등록 --------------------------------------------------------
--    먼저 Authentication → Users → Add user 로 계정을 만든 뒤,
--    아래 줄의 이메일을 그 계정 이메일로 바꾸고 주석(--)을 지워서 실행하세요.
--
-- insert into public.admins (user_id, note)
-- select id, '개발자' from auth.users where email = '여기에_이메일'
-- on conflict (user_id) do nothing;

-- 확인용: 등록된 관리자 목록
-- select a.note, u.email from public.admins a join auth.users u on u.id = a.user_id;
