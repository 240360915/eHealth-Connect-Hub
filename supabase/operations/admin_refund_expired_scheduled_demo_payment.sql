-- Admin-only virtual DemoPay refund for cancelled OR expired scheduled
-- appointments. Existing payment lock, admin identity check and earnings
-- release guard are preserved. No real banking action is performed.
CREATE OR REPLACE FUNCTION public.admin_refund_cancelled_demo_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_payment public.payments%ROWTYPE;
    v_appointment public.appointments%ROWTYPE;
    v_refund public.demo_refunds%ROWTYPE;
BEGIN
    -- Require an authenticated administrator.
    IF auth.uid() IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM public.admins ad
           WHERE ad.id = auth.uid()
       )
    THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    -- Lock the payment to prevent concurrent refunds.
    SELECT *
    INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    -- Never refund subscriptions through this function.
    IF v_payment.gateway_provider IS DISTINCT FROM 'ehealthy_demo'
       OR v_payment.payment_type IS DISTINCT FROM 'scheduled_online'
    THEN
        RAISE EXCEPTION 'Not an eligible DemoPay payment';
    END IF;

    -- Return existing refund instead of creating another.
    SELECT *
    INTO v_refund
    FROM public.demo_refunds
    WHERE payment_id = p_payment_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'already_refunded',
            'refund_reference', v_refund.refund_reference,
            'amount_minor', v_refund.amount_minor
        );
    END IF;

    IF v_payment.status IS DISTINCT FROM 'paid' THEN
        RAISE EXCEPTION 'Payment is not eligible for refund';
    END IF;

    -- Lock the related appointment.
    SELECT *
    INTO v_appointment
    FROM public.appointments
    WHERE id = v_payment.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked appointment not found';
    END IF;

    IF lower(coalesce(v_appointment.status,'')) NOT IN ('cancelled','expired') THEN
        RAISE EXCEPTION 'Appointment must be cancelled or expired first';
    END IF;

    IF v_appointment.funds_released IS TRUE
       OR EXISTS (
           SELECT 1
           FROM public.demo_earnings e
           WHERE e.appointment_id = v_appointment.id
              OR e.payment_id = v_payment.id
       )
    THEN
        RAISE EXCEPTION 'Earnings already released';
    END IF;

    -- Store the refund in an independent ledger.
    INSERT INTO public.demo_refunds (
        payment_id,
        appointment_id,
        original_payment_ref,
        amount_minor,
        currency,
        processed_by
    )
    VALUES (
        v_payment.id,
        v_appointment.id,
        v_payment.payment_ref,
        round(v_payment.amount * 100)::bigint,
        coalesce(v_payment.currency, 'ZAR'),
        auth.uid()
    )
    RETURNING * INTO v_refund;

    -- Update payment and refund in one transaction.
    UPDATE public.payments
    SET status = 'refunded'
    WHERE id = v_payment.id;

    RETURN jsonb_build_object(
        'status', 'refunded',
        'payment_reference', v_payment.payment_ref,
        'refund_reference', v_refund.refund_reference,
        'amount_minor', v_refund.amount_minor,
        'currency', v_refund.currency
    );
END;
$function$;
