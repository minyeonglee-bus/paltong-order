-- Cash Book sync also sends who completed the order (orders.staff_name = the employee who took the order / payment,
-- confirmed with their PIN). The payroll app uses it to suggest who is responsible for a cash / GCash / Maya shortage
-- (owner 2026-11-05: responsible = the employee who completed the order, not whoever did the closing).
-- Changing the staff on an order re-sends that order (cashbook_order_changed compares cashbook_row).
create or replace function public.cashbook_row(o orders)
 returns jsonb language sql stable as $function$
  select jsonb_build_object(
    'id', o.id, 'order_date', o.order_date, 'paid', public.cashbook_paid(o),
    'code', coalesce(o.order_prefix, public.order_prefix_of(o.source, o.channel)) || '-' || o.order_no,
    'amount', case when o.status = 'done' then o.total else o.paid_total end,
    'payment', o.payment, 'created_at', o.created_at,
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
