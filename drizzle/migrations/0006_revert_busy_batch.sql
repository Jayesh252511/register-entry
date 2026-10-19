CREATE OR REPLACE FUNCTION public.revert_busy_batch(p_id uuid, p_device uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches; deleted_count integer; max_bill bigint; max_serial bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM devices WHERE id=p_device AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'DEVICE_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO b FROM import_batches WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND';
  END IF;

  PERFORM 1 FROM app_settings WHERE id=1 FOR UPDATE;

  -- Delete audit logs for entries from this batch
  DELETE FROM audit_log WHERE entry_id IN (SELECT id FROM transport_entries WHERE import_batch_id=p_id);

  -- Delete the transport entries
  WITH del AS (
    DELETE FROM transport_entries WHERE import_batch_id=p_id RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM del;

  -- Delete the batch record
  DELETE FROM import_batches WHERE id=p_id;

  -- Recalculate app_settings next_bill_number and next_register_serial based on remaining active entries
  SELECT COALESCE(MAX(register_serial_no), 0) + 1 INTO max_serial FROM transport_entries;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_no, '\D', '', 'g'), '')::bigint), 0) + 1 INTO max_bill FROM transport_entries WHERE archived_at IS NULL;

  UPDATE app_settings SET
    next_register_serial = GREATEST(1, max_serial),
    next_bill_number = GREATEST(1, max_bill),
    updated_at = now()
  WHERE id = 1;

  INSERT INTO audit_log(action, actor_reference, new_values)
  VALUES ('revert_busy_batch', 'device:' || p_device, jsonb_build_object('batch', p_id, 'deleted_count', deleted_count));

  RETURN jsonb_build_object('deleted', deleted_count, 'batch_id', p_id);
END $$;
REVOKE ALL ON FUNCTION public.revert_busy_batch(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_busy_batch(uuid, uuid) TO service_role;
