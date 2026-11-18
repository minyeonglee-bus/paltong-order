-- owner 2026-11-18: an order keeps its order date (business day it was taken), but the Cash Book gets it on the
-- business day it was PAID. Example: T-23 taken 11/18 07:01 (business day 11/17), paid 11/18 08:45 (after the 8:00 cutoff)
-- → Cash Book 11/18. When the two days differ the receipt shows the order day after the number: "T-23·11/17".

-- ===== A) ORDER DB (PALTONG ORDER/RIDER, yzdhcumibflxtqkqvbul): send the payment time =====
-- paid_at = when the staff received the money (received_at), else the online payment receipt time; null → order date as before.
create or replace function public.cashbook_row(o orders)
 returns jsonb language sql stable as $function$
  select jsonb_build_object(
    'id', o.id, 'order_date', o.order_date, 'paid', public.cashbook_paid(o),
    'code', coalesce(o.order_prefix, public.order_prefix_of(o.source, o.channel)) || '-' || o.order_no,
    'amount', case when o.status = 'done' then o.total else o.paid_total end,
    'payment', o.payment, 'created_at', o.created_at,
    'paid_at', coalesce(o.received_at, o.receipt_at),
    'split', case when o.status = 'done' and jsonb_typeof(o.split_pay) = 'object' then o.split_pay end,
    'staff', o.staff_name,
    'note', case
      when o.source = 'dine' then 'Dine in'
      when o.source = 'external' then
        case when coalesce(o.channel, '') ~* '(전화|phone|call)' then 'Call'
             when coalesce(o.channel, '') ~* '(카톡|카카오|kakao)' then 'Kakao'
             when coalesce(o.channel, '') ~* '(바이버|viber)' then 'Viber'
             when coalesce(o.channel, '') ~* '(메세지|메시지|문자|message|sms|text)' then 'Text'
             when coalesce(o.channel, '') ~* '(페이스북|facebook)' then 'Facebook'
             else 'DK' end
      when o.order_type = 'pickup' then 'Take out (Website)'
      else 'Website' end);
$function$;

-- ===== B) CASH BOOK DB (MONEY TRACKER, nffexcfunbnxoyrfhvnu): book on the payment's business day =====
-- entries.src_order_day = the order's own day, so the daily import (per order day) only removes rows of that order day.
--   alter table public.entries add column if not exists src_order_day date;
--   update public.entries set src_order_day = biz_date where (src_order is not null or src_order_x is not null) and src_order_day is null;
alter table public.entries add column if not exists src_order_day date;
update public.entries set src_order_day = biz_date where (src_order is not null or src_order_x is not null) and src_order_day is null;

create or replace function public.order_sale_put(p_day date, r jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_at timestamptz := coalesce((r->>'paid_at')::timestamptz, (r->>'created_at')::timestamptz); rd date; rt time; bd date;
  v_paid boolean := (r->>'paid_at') is not null;
  v_id uuid := (r->>'id')::uuid; total numeric := (r->>'amount')::numeric; code text := r->>'code';
  parts jsonb := '{}'; k text; v text; a text; s numeric := 0; main text; n int; x numeric; det text := 'Order site (auto)';
begin
  perform public.order_staff_put(r);
  rd := (v_at at time zone 'Asia/Manila')::date; rt := date_trunc('minute', (v_at at time zone 'Asia/Manila')::time);
  bd := public.receipt_biz_date(rd, rt);
  if v_paid and bd > p_day and p_day >= date '2026-11-17' then   -- from the 11/17 business day on (owner 11/18; older days stay as they are)
    -- paid on a later business day than the order (owner 2026-11-18): book it on the payment day, mark the order day
    code := code || '·' || to_char(p_day, 'FMMM/FMDD');
  else
    bd := p_day;
    if public.receipt_biz_date(rd, rt) <> p_day then rd := p_day; rt := time '12:00'; end if;
  end if;

  if jsonb_typeof(r->'split') = 'object' then
    for k, v in select * from jsonb_each_text(r->'split') loop
      if v ~ '^[0-9]+(\.[0-9]+)?$' and v::numeric > 0 then
        a := public.order_pay_acct(k);
        parts := jsonb_set(parts, array[a], to_jsonb(coalesce((parts->>a)::numeric, 0) + v::numeric));
      end if;
    end loop;
  end if;
  select count(*) into n from jsonb_object_keys(parts);

  if n < 2 then
    main := case when n = 1 then (select key from jsonb_object_keys(parts) key limit 1) else public.order_pay_acct(r->>'payment') end;
    parts := jsonb_build_object(main, total);
  else
    main := case when parts ? 'CASH' then 'CASH' else (select key from jsonb_each_text(parts) order by value::numeric desc limit 1) end;
    select sum(value::numeric) into s from jsonb_each_text(parts);
    if s <> total then   -- 장부 합계 = 주문 금액 (차액은 주 결제수단에)
      parts := jsonb_set(parts, array[main], to_jsonb((parts->>main)::numeric + total - s));
    end if;
    det := 'Order site (auto) · split ' || (select string_agg(key || ' ' || to_char(value::numeric, 'FM999,999,990'), ' + ' order by key) from jsonb_each_text(parts));
  end if;

  insert into public.entries(biz_date, kind, amount, account, receipt, note, details, staff_name, receipt_date, receipt_time, src_order, src_part, src_order_day, created_by)
  values (bd, 'sale', (parts->>main)::numeric, main, code, r->>'note', det, 'Order site', rd, rt, v_id, case when n >= 2 then main end, p_day, null)
  on conflict (src_order) where src_order is not null do update
    set biz_date = excluded.biz_date, amount = excluded.amount, account = excluded.account, receipt = excluded.receipt,
        note = excluded.note, details = excluded.details, src_part = excluded.src_part, src_order_day = excluded.src_order_day,
        receipt_date = excluded.receipt_date, receipt_time = excluded.receipt_time, updated_by_name = 'Order site'
    where (entries.biz_date, entries.amount, entries.account, entries.receipt, entries.note, entries.details, entries.src_order_day, entries.receipt_date, entries.receipt_time)
          is distinct from (excluded.biz_date, excluded.amount, excluded.account, excluded.receipt, excluded.note, excluded.details, excluded.src_order_day, excluded.receipt_date, excluded.receipt_time);

  delete from public.entries where src_order_x = v_id and (src_part = main or not (parts ? src_part) or (parts->>src_part)::numeric <= 0);
  for a, x in select key, value::numeric from jsonb_each_text(parts) where key <> main loop
    if x <= 0 then continue; end if;
    insert into public.entries(biz_date, kind, amount, account, receipt, note, details, staff_name, receipt_date, receipt_time, src_order_x, src_part, src_order_day, created_by)
    values (bd, 'sale', x, a, code, r->>'note', det, 'Order site', rd, rt, v_id, a, p_day, null)
    on conflict (src_order_x, src_part) where src_order_x is not null do update
      set biz_date = excluded.biz_date, amount = excluded.amount, account = excluded.account, receipt = excluded.receipt, src_order_day = excluded.src_order_day,
          note = excluded.note, details = excluded.details, receipt_date = excluded.receipt_date, receipt_time = excluded.receipt_time, updated_by_name = 'Order site'
      where (entries.biz_date, entries.amount, entries.account, entries.receipt, entries.note, entries.details, entries.src_order_day, entries.receipt_date, entries.receipt_time)
            is distinct from (excluded.biz_date, excluded.amount, excluded.account, excluded.receipt, excluded.note, excluded.details, excluded.src_order_day, excluded.receipt_date, excluded.receipt_time);
  end loop;
end $function$;

create or replace function public.order_sales_import(p_token text, p_day date, p_rows jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r jsonb; n_up int := 0; n_del int := 0; n2 int := 0; ids uuid[] := '{}';
begin
  if p_token is null or p_token is distinct from (select token from public.order_sync_secret where id = 1) then raise exception 'bad token'; end if;
  if p_day is null or jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'bad input'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce((r->>'amount')::numeric, 0) <= 0 then continue; end if;
    ids := ids || (r->>'id')::uuid;
    perform public.order_sale_put(p_day, r);
    n_up := n_up + 1;
  end loop;
  -- rows of THIS order day that are no longer in the push (an order paid on a later day keeps src_order_day = its order day)
  delete from public.entries where coalesce(src_order_day, biz_date) = p_day and src_order is not null and not (src_order = any(ids));
  get diagnostics n_del = row_count;
  delete from public.entries where coalesce(src_order_day, biz_date) = p_day and src_order_x is not null and not (src_order_x = any(ids));
  get diagnostics n2 = row_count;
  return jsonb_build_object('day', p_day, 'sales', n_up, 'removed', n_del + n2,
    'total', (select coalesce(sum(amount), 0) from public.entries where biz_date = p_day and (src_order is not null or src_order_x is not null)));
end $function$;
