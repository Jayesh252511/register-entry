CREATE INDEX IF NOT EXISTS transport_entries_updated_idx ON public.transport_entries (updated_at);

CREATE OR REPLACE FUNCTION public.create_entry(
  p_entry_date date, p_bill_no text, p_maal_diya text, p_maal_liya text,
  p_weight_value numeric, p_vehicle_no text, p_client_request_id uuid, p_device_id uuid)
RETURNS public.transport_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.app_settings; r public.transport_entries; v_bill text; v_num bigint;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT * INTO r FROM transport_entries WHERE client_request_id = p_client_request_id OR id = p_client_request_id;
    IF FOUND THEN RETURN r; END IF;
  END IF;
  SELECT * INTO s FROM app_settings WHERE id = 1 FOR UPDATE;
  v_bill := NULLIF(btrim(coalesce(p_bill_no,'')), '');
  IF v_bill IS NULL THEN v_bill := s.next_bill_number::text; END IF;
  IF EXISTS (SELECT 1 FROM transport_entries WHERE bill_no = v_bill AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'DUPLICATE_BILL:%', v_bill USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO transport_entries (id, register_serial_no, entry_date, bill_no, maal_diya, maal_liya,
    weight_value, weight_unit, vehicle_no, client_request_id, device_id)
  VALUES (coalesce(p_client_request_id, gen_random_uuid()), s.next_register_serial, p_entry_date, v_bill, p_maal_diya, p_maal_liya,
    p_weight_value, CASE WHEN p_weight_value IS NULL THEN NULL ELSE s.default_weight_unit END,
    p_vehicle_no, p_client_request_id, p_device_id)
  RETURNING * INTO r;
  v_num := CASE WHEN v_bill ~ '^[0-9]{1,15}$' THEN v_bill::bigint ELSE NULL END;
  UPDATE app_settings SET next_register_serial = s.next_register_serial + 1,
    next_bill_number = GREATEST(s.next_bill_number, coalesce(v_num + 1, s.next_bill_number)),
    updated_at = now() WHERE id = 1;
  INSERT INTO audit_log (entry_id, action, actor_reference, new_values)
  VALUES (r.id, 'create', 'device:' || coalesce(p_device_id::text,'unknown'), to_jsonb(r));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.create_entry(date,text,text,text,numeric,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_entry(date,text,text,text,numeric,text,uuid,uuid) TO service_role;