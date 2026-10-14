
-- Admin-only finance summary combining paid scheduled + on-demand DemoPay.
-- All monetary amounts are integer minor units. Only actual ledger releases
-- count as earned revenue; "completed" status without verified ledger is flagged.
CREATE OR REPLACE FUNCTION public.admin_get_demo_finance_report_v2()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  v_bps integer;
  v_summary jsonb;
  v_transactions jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS
      (SELECT 1 FROM public.admins ad WHERE ad.id=auth.uid()) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  SELECT commission_bps INTO v_bps
    FROM public.demo_platform_settings WHERE singleton=true;
  IF v_bps IS NULL THEN RAISE EXCEPTION 'Demo commission setting missing'; END IF;

  WITH payments_view AS (
    SELECT
      p.id,p.payment_type,p.status,p.currency,
      round(coalesce(p.amount,0)*100)::bigint amount_minor,
      coalesce(a.status,cr.status,'unknown') consultation_status,
      coalesce(se.released_at,oe.released_at) released_at,
      p.status='paid' AND p.payment_type='scheduled_online'
        AND a.status IN ('cancelled','expired') AND se.payment_id IS NULL needs_refund_review,
      p.status='paid' AND coalesce(a.status,cr.status)='completed'
        AND se.payment_id IS NULL AND oe.payment_id IS NULL needs_completion_review,
      p.status='paid' AND
        ((p.payment_type='scheduled_online' AND a.status IN ('pending','confirmed','accepted')
            AND se.payment_id IS NULL)
         OR (p.payment_type IN ('broadcast_consultation','private_consultation')
             AND cr.status='claimed' AND oe.payment_id IS NULL)) awaiting_service
    FROM public.payments p
    LEFT JOIN public.appointments a ON a.id=p.appointment_id
    LEFT JOIN public.consultation_requests cr ON cr.id=p.consultation_request_id
    LEFT JOIN public.demo_earnings se ON se.payment_id=p.id
    LEFT JOIN public.demo_on_demand_earnings oe ON oe.payment_id=p.id
    WHERE p.gateway_provider='ehealthy_demo'
      AND p.payment_type IN ('scheduled_online','broadcast_consultation','private_consultation')
  ),payments_summary AS (
    SELECT
      coalesce(sum(amount_minor) FILTER(WHERE status IN ('paid','refunded')),0)::bigint gross_paid,
      coalesce(sum(amount_minor) FILTER(WHERE status='refunded'),0)::bigint refunded,
      coalesce(sum(amount_minor) FILTER(WHERE status='paid' AND awaiting_service),0)::bigint awaiting,
      coalesce(sum(round(amount_minor::numeric*v_bps/10000)::bigint)
        FILTER(WHERE awaiting_service),0)::bigint potential,
      coalesce(sum(amount_minor) FILTER(WHERE needs_refund_review),0)::bigint cancellation,
      count(*) FILTER(WHERE needs_refund_review)::bigint cancellation_count,
      count(*) FILTER(WHERE needs_completion_review)::bigint review_count,
      coalesce(sum(amount_minor) FILTER(WHERE needs_completion_review),0)::bigint review_minor,
      count(*) FILTER(WHERE status='paid')::bigint currently_paid_count,
      count(*) FILTER(WHERE status IN ('paid','refunded'))::bigint paid_count,
      count(*) FILTER(WHERE status='refunded')::bigint refunded_count,
      count(*) FILTER(WHERE status='failed')::bigint failed_count
    FROM payments_view
  ),earnings_summary AS (
    SELECT
      coalesce(sum(platform_minor),0)::bigint platform,
      coalesce(sum(doctor_minor),0)::bigint doctor,
      coalesce(sum(total_minor),0)::bigint total,
      count(*)::bigint completed_count
    FROM (
      SELECT platform_minor,doctor_minor,total_minor FROM public.demo_earnings
      UNION ALL
      SELECT platform_minor,doctor_minor,total_minor FROM public.demo_on_demand_earnings
    ) ledger
  )
  SELECT jsonb_build_object(
    'paid_transaction_count',ps.paid_count,
    'gross_paid_minor',ps.gross_paid,
    'historical_gross_minor',ps.gross_paid,
    'net_collected_minor',ps.gross_paid-ps.refunded,
    'currently_paid_transaction_count',ps.currently_paid_count,
    'refunded_transaction_count',ps.refunded_count,
    'pending_consultation_minor',ps.awaiting,
    'potential_platform_minor',ps.potential,
    'cancelled_paid_minor',ps.cancellation,
    'cancelled_paid_count',ps.cancellation_count,
    'failed_transaction_count',ps.failed_count,
    'marked_refunded_minor',ps.refunded,
    'earned_platform_minor',es.platform,
    'released_doctor_minor',es.doctor,
    'released_gross_minor',es.total,
    'completed_consultation_count',es.completed_count,
    'unverified_completed_count',ps.review_count,
    'unverified_completed_minor',ps.review_minor
  ) INTO v_summary
  FROM payments_summary ps CROSS JOIN earnings_summary es;

  WITH payment_history AS (
    SELECT p.id,p.payment_ref,p.payment_type,p.amount,p.currency,
           p.status,p.created_at,p.appointment_id,p.consultation_request_id,
           a.status scheduled_status,a.date,a.time,
           cr.status on_demand_status,
           coalesce(se.released_at,oe.released_at) released_at,
           coalesce(se.doctor_minor,oe.doctor_minor,0) doctor_minor,
           coalesce(se.platform_minor,oe.platform_minor,0) platform_minor,
           r.refund_reference,r.created_at refunded_at,
           (p.status='paid' AND p.payment_type='scheduled_online'
               AND a.status IN ('cancelled','expired') AND se.payment_id IS NULL) needs_refund_review,
           (p.status='paid' AND coalesce(a.status,cr.status)='completed'
               AND se.payment_id IS NULL AND oe.payment_id IS NULL) needs_completion_review
    FROM public.payments p
    LEFT JOIN public.appointments a ON a.id=p.appointment_id
    LEFT JOIN public.consultation_requests cr ON cr.id=p.consultation_request_id
    LEFT JOIN public.demo_earnings se ON se.payment_id=p.id
    LEFT JOIN public.demo_on_demand_earnings oe ON oe.payment_id=p.id
    LEFT JOIN public.demo_refunds r ON r.payment_id=p.id
    WHERE p.gateway_provider='ehealthy_demo'
      AND p.payment_type IN ('scheduled_online','broadcast_consultation','private_consultation')
    ORDER BY p.created_at DESC,p.id DESC LIMIT 100
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'payment_id',h.id,'payment_reference',h.payment_ref,
    'payment_type',h.payment_type,
    'amount_minor',round(h.amount*100)::bigint,
    'currency',coalesce(h.currency,'ZAR'),
    'payment_status',h.status,
    'created_at',h.created_at,
    'appointment_id',h.appointment_id,
    'consultation_request_id',h.consultation_request_id,
    'appointment_status',coalesce(h.scheduled_status,h.on_demand_status),
    'appointment_date',h.date,'appointment_time',h.time,
    'released_at',h.released_at,
    'doctor_minor',h.doctor_minor,'platform_minor',h.platform_minor,
    'refund_reference',h.refund_reference,'refunded_at',h.refunded_at,
    'needs_refund_review',h.needs_refund_review,
    'needs_completion_review',h.needs_completion_review
  ) ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb)
  INTO v_transactions FROM payment_history h;

  RETURN jsonb_build_object(
    'generated_at',now(),
    'commission_bps',v_bps,
    'summary',v_summary,
    'transactions',v_transactions
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_demo_finance_report_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_demo_finance_report_v2() TO authenticated;
