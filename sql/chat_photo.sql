-- 웹 채팅 사진 첨부 (2026-11-18)
-- 손님·가게 모두 채팅에 사진을 보낼 수 있음.
-- 사진: 저장소 버킷 'chat' (공개 URL, 목록 조회 불가) — 경로 = {thread_id}/{무작위 uuid}.jpg
-- 메시지: chat_messages.image (경로), body = '📷 사진 / Photo' (목록 미리보기·푸시용)

alter table public.chat_messages add column if not exists image text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 업로드 허용: 열린 채팅방 폴더에만, 1분에 10장까지
create or replace function public.can_upload_chat(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
     and exists (select 1 from public.chat_threads t
                  where t.id::text = split_part(p_name, '/', 1)
                    and (public.is_admin() or public.chat_is_open(t)))
     and (select count(*) from storage.objects o
           where o.bucket_id = 'chat' and o.name like split_part(p_name, '/', 1) || '/%'
             and o.created_at > now() - interval '1 minute') < 10;
$$;
grant execute on function public.can_upload_chat(text) to anon, authenticated;

drop policy if exists "chat photo upload" on storage.objects;
create policy "chat photo upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'chat' and public.can_upload_chat(name));

-- 손님 사진 보내기
create or replace function public.chat_send_image(p_thread uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.chat_threads; v_first boolean; s public.shop_settings; v_body text := '📷 사진 / Photo';
begin
  if split_part(coalesce(p_path, ''), '/', 1) <> p_thread::text
     or not exists (select 1 from storage.objects where bucket_id = 'chat' and name = p_path) then
    raise exception 'invalid image';
  end if;
  select * into t from public.chat_threads where id = p_thread for update;
  if not found then raise exception 'not found'; end if;
  if not public.chat_is_open(t) then raise exception 'chat_closed'; end if;
  if (select count(*) from public.chat_messages where thread_id = p_thread and sender = 'cust' and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'too_many_messages';
  end if;
  v_first := not exists (select 1 from public.chat_messages where thread_id = p_thread and sender = 'cust');
  insert into public.chat_messages(thread_id, sender, body, image) values (p_thread, 'cust', v_body, p_path);
  update public.chat_threads set last_at = now(), last_preview = v_body, admin_unread = admin_unread + 1 where id = p_thread;
  select * into s from public.shop_settings where id = 1;
  if v_first and coalesce(trim(s.chat_greeting), '') <> '' then
    perform public.chat_post_bi(p_thread, 'bot', s.chat_greeting, s.chat_greeting_en);
  end if;
end $$;
grant execute on function public.chat_send_image(uuid, text) to anon, authenticated;

-- 가게 사진 보내기
create or replace function public.admin_chat_send_image(p_thread uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_body text := '📷 사진 / Photo';
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_thread::text
     or not exists (select 1 from storage.objects where bucket_id = 'chat' and name = p_path) then
    raise exception 'invalid image';
  end if;
  insert into public.chat_messages(thread_id, sender, body, image) values (p_thread, 'admin', v_body, p_path);
  update public.chat_threads set last_at = now(), last_preview = v_body, cust_unread = cust_unread + 1, admin_unread = 0 where id = p_thread;
end $$;
grant execute on function public.admin_chat_send_image(uuid, text) to authenticated;

-- chat_fetch: image 필드 추가
create or replace function public.chat_fetch(p_thread uuid, p_after bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.chat_threads;
begin
  select * into t from public.chat_threads where id = p_thread;
  if not found then raise exception 'not found'; end if;
  if t.cust_unread > 0 then update public.chat_threads set cust_unread = 0 where id = p_thread; end if;
  return jsonb_build_object(
    'open', public.chat_is_open(t), 'kind', t.kind, 'order_id', t.order_id,
    'faq',    coalesce((select jsonb_agg(f->>'q' order by n) from public.shop_settings s, jsonb_array_elements(s.chat_faq) with ordinality x(f, n) where s.id = 1), '[]'::jsonb),
    'faq_en', coalesce((select jsonb_agg(coalesce(nullif(f->>'q_en', ''), f->>'q') order by n) from public.shop_settings s, jsonb_array_elements(s.chat_faq) with ordinality x(f, n) where s.id = 1), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body,
                                   'body_en', case when m.sender <> 'cust' then m.body_en end,
                                   'body_ko', case when m.sender <> 'cust' then m.body_ko end,
                                   'image', m.image, 'created_at', m.created_at) order by m.id)
                            from public.chat_messages m where m.thread_id = p_thread and m.id > coalesce(p_after, 0)), '[]'::jsonb));
end $$;
