-- ⭐ 앱 리뷰 (2026-11-20): 손님 웹 '리뷰 보기' 탭
-- 웹 주문(source = 'web')이 완료(done)되면 14일 안에 주문 1건당 리뷰 1개 (별점 + 글 + 사진 1장)
-- 주문 id(uuid)를 아는 사람 = 주문한 손님 (비회원 주문 화면과 같은 방식)
-- 회원 주문이면 리뷰 쓰면 스탬프 +1 (add_stamp)
-- 관리자: 숨기기 · 답글

create table if not exists public.store_reviews (
  id bigserial primary key,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid,
  name text not null,
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  photo_path text,
  items jsonb not null default '[]'::jsonb,
  hidden boolean not null default false,
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists store_reviews_created on public.store_reviews (created_at desc);
alter table public.store_reviews enable row level security;   -- 정책 없음: 아래 함수로만 읽고 씀

-- 리뷰 가능한 주문인지
create or replace function public.review_order_ok(p_order uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.orders o
    where o.id = p_order and o.status = 'done' and coalesce(o.source, 'web') = 'web'
      and o.created_at > now() - interval '14 days')
$$;

-- 손님: 이 주문 리뷰 상태
create or replace function public.review_status(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r public.store_reviews;
begin
  select * into r from public.store_reviews where order_id = p_order;
  if found then return jsonb_build_object('can', false, 'done', true, 'rating', r.rating); end if;
  return jsonb_build_object('can', public.review_order_ok(p_order), 'done', false);
end $$;

-- 이름 가리기: "Juan Dela Cruz" → "Ju***"
create or replace function public.review_mask_name(p text)
returns text language sql immutable as $$
  select case when coalesce(trim(p), '') = '' then 'Guest'
              else left(trim(p), 2) || '***' end
$$;

-- 손님: 리뷰 쓰기
create or replace function public.review_submit(p_order uuid, p_rating int, p_body text, p_photo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare o public.orders; r public.store_reviews; v_items jsonb;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'review_rating'; end if;
  if char_length(coalesce(p_body, '')) > 500 then raise exception 'review_too_long'; end if;
  if not public.review_order_ok(p_order) then raise exception 'review_not_allowed'; end if;
  if exists (select 1 from public.store_reviews where order_id = p_order) then raise exception 'review_already'; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> p_order::text then raise exception 'bad path'; end if;
  select * into o from public.orders where id = p_order;
  select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'en', coalesce(e->>'en', e->>'name'))), '[]'::jsonb) into v_items
    from (select e from jsonb_array_elements(o.items) e
           where not coalesce((e->>'svc')::boolean, false) limit 6) x;
  insert into public.store_reviews(order_id, user_id, name, rating, body, photo_path, items)
  values (p_order, o.user_id, public.review_mask_name(o.cust_name), p_rating, trim(coalesce(p_body, '')), p_photo, v_items)
  returning * into r;
  if o.user_id is not null then perform public.add_stamp(o.user_id); end if;
  return jsonb_build_object('id', r.id, 'stamp', o.user_id is not null);
end $$;

-- 모두: 리뷰 목록 (숨긴 것 제외) + 평균
create or replace function public.review_list(p_limit int default 30, p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  return jsonb_build_object(
    'count', (select count(*) from public.store_reviews where not hidden),
    'avg', (select round(avg(rating)::numeric, 1) from public.store_reviews where not hidden),
    'stars', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb) from (select rating, count(*) n from public.store_reviews where not hidden group by rating) s),
    'rows', coalesce((select jsonb_agg(x order by x.id desc) from (
      select id, name, rating, body, photo_path, items, reply, replied_at, created_at
        from public.store_reviews
       where not hidden and (p_before is null or id < p_before)
       order by id desc limit least(greatest(coalesce(p_limit, 30), 1), 50)) x), '[]'::jsonb));
end $$;

-- 관리자: 전체 목록 (숨긴 것 포함, 주문번호·손님 정보)
create or replace function public.admin_store_reviews()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return coalesce((select jsonb_agg(x order by x.id desc) from (
    select r.*, o.order_no, o.cust_name, o.cust_phone, o.created_at as order_at
      from public.store_reviews r join public.orders o on o.id = r.order_id
     order by r.id desc limit 200) x), '[]'::jsonb);
end $$;

-- 관리자: 숨기기 / 답글 (null 이면 그대로)
create or replace function public.admin_store_review_set(p_id bigint, p_hidden boolean, p_reply text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.store_reviews
     set hidden = coalesce(p_hidden, hidden),
         reply = case when p_reply is null then reply else nullif(trim(p_reply), '') end,
         replied_at = case when p_reply is null then replied_at when nullif(trim(p_reply), '') is null then null else now() end
   where id = p_id;
  if not found then raise exception 'not found'; end if;
end $$;

revoke all on function public.review_submit(uuid, int, text, text) from public;
grant execute on function public.review_status(uuid), public.review_submit(uuid, int, text, text), public.review_list(int, bigint) to anon, authenticated;
grant execute on function public.admin_store_reviews(), public.admin_store_review_set(bigint, boolean, text) to authenticated;

-- 사진: 공개 버킷 review_photos, 경로 = 주문id/파일. 리뷰 가능한 주문이고 아직 리뷰 전, 주문당 3장까지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review_photos', 'review_photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.can_upload_review_photo(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$'
     and public.review_order_ok(split_part(p_name, '/', 1)::uuid)
     and not exists (select 1 from public.store_reviews where order_id::text = split_part(p_name, '/', 1))
     and (select count(*) from storage.objects where bucket_id = 'review_photos' and split_part(name, '/', 1) = split_part(p_name, '/', 1)) < 3
$$;

drop policy if exists "review photo upload" on storage.objects;
create policy "review photo upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'review_photos' and public.can_upload_review_photo(name));
