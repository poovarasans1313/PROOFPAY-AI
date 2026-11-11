CREATE OR REPLACE FUNCTION public.review_purchase_request(
  p_purchase_request_id uuid,
  p_action text,
  p_actor_id uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  updated_request_id uuid;
BEGIN
  IF p_purchase_request_id IS NULL
    OR p_actor_id IS NULL
    OR p_action IS NULL
    OR p_action NOT IN ('APPROVED', 'REJECTED')
    OR (p_note IS NOT NULL AND pg_catalog.char_length(p_note) > 1000)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid purchase review input';
  END IF;

  UPDATE public.purchase_requests
  SET
    status = p_action,
    reviewed_at = pg_catalog.now(),
    reviewed_by = p_actor_id,
    review_note = p_note
  WHERE id = p_purchase_request_id
    AND status IN ('PENDING_APPROVAL', 'PENDING_REVIEW')
  RETURNING id INTO updated_request_id;

  IF updated_request_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.approval_events (
    purchase_request_id,
    action,
    actor_id,
    note
  )
  VALUES (
    updated_request_id,
    p_action,
    p_actor_id,
    p_note
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.review_purchase_request(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_purchase_request(uuid, text, uuid, text)
  TO service_role;
