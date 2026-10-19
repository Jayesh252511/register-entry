ALTER TABLE public.transport_entries
  DROP CONSTRAINT IF EXISTS transport_entries_bill_no_check,
  DROP CONSTRAINT IF EXISTS transport_entries_maal_diya_check,
  DROP CONSTRAINT IF EXISTS transport_entries_maal_liya_check,
  DROP CONSTRAINT IF EXISTS transport_entries_vehicle_no_check,
  ALTER COLUMN entry_date DROP NOT NULL,
  ALTER COLUMN bill_no SET DEFAULT '',
  ALTER COLUMN maal_diya SET DEFAULT '',
  ALTER COLUMN maal_liya SET DEFAULT '',
  ALTER COLUMN vehicle_no SET DEFAULT '';
DROP INDEX IF EXISTS public.transport_entries_bill_active_uq;
CREATE UNIQUE INDEX transport_entries_bill_active_uq ON public.transport_entries (bill_no) WHERE archived_at IS NULL AND bill_no <> '';

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
  v_bill := btrim(coalesce(p_bill_no,''));
  IF v_bill <> '' AND EXISTS (SELECT 1 FROM transport_entries WHERE bill_no = v_bill AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'DUPLICATE_BILL:%', v_bill USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO transport_entries (id, register_serial_no, entry_date, bill_no, maal_diya, maal_liya,
    weight_value, weight_unit, vehicle_no, client_request_id, device_id)
  VALUES (coalesce(p_client_request_id, gen_random_uuid()), s.next_register_serial, p_entry_date, v_bill,
    coalesce(p_maal_diya,''), coalesce(p_maal_liya,''),
    p_weight_value, CASE WHEN p_weight_value IS NULL THEN NULL ELSE s.default_weight_unit END,
    coalesce(p_vehicle_no,''), p_client_request_id, p_device_id)
  RETURNING * INTO r;
  v_num := CASE WHEN v_bill ~ '^[0-9]{1,15}$' THEN v_bill::bigint ELSE NULL END;
  UPDATE app_settings SET next_register_serial = s.next_register_serial + 1,
    next_bill_number = GREATEST(s.next_bill_number, coalesce(v_num + 1, s.next_bill_number)),
    updated_at = now() WHERE id = 1;
  INSERT INTO audit_log (entry_id, action, actor_reference, new_values)
  VALUES (r.id, 'create', 'device:' || coalesce(p_device_id::text,'unknown'), to_jsonb(r));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.update_entry(
  p_id uuid, p_entry_date date, p_bill_no text, p_maal_diya text, p_maal_liya text,
  p_weight_value numeric, p_vehicle_no text, p_device_id uuid)
RETURNS public.transport_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.app_settings; old public.transport_entries; r public.transport_entries; v_bill text; v_num bigint;
BEGIN
  SELECT * INTO s FROM app_settings WHERE id = 1 FOR UPDATE;
  SELECT * INTO old FROM transport_entries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_bill := btrim(coalesce(p_bill_no,''));
  IF v_bill <> '' AND EXISTS (SELECT 1 FROM transport_entries WHERE bill_no = v_bill AND archived_at IS NULL AND id <> p_id) THEN
    RAISE EXCEPTION 'DUPLICATE_BILL:%', v_bill;
  END IF;
  UPDATE transport_entries SET entry_date = p_entry_date, bill_no = v_bill, maal_diya = coalesce(p_maal_diya,''),
    maal_liya = coalesce(p_maal_liya,''), weight_value = p_weight_value,
    weight_unit = CASE WHEN p_weight_value IS NULL THEN NULL ELSE coalesce(old.weight_unit, s.default_weight_unit) END,
    vehicle_no = coalesce(p_vehicle_no,''), updated_at = now()
  WHERE id = p_id RETURNING * INTO r;
  v_num := CASE WHEN v_bill ~ '^[0-9]{1,15}$' THEN v_bill::bigint ELSE NULL END;
  UPDATE app_settings SET next_bill_number = GREATEST(s.next_bill_number, coalesce(v_num + 1, s.next_bill_number)), updated_at = now() WHERE id = 1;
  INSERT INTO audit_log (entry_id, action, actor_reference, old_values, new_values)
  VALUES (r.id, 'update', 'device:' || coalesce(p_device_id::text,'unknown'), to_jsonb(old), to_jsonb(r));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.create_entry(date,text,text,text,numeric,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_entry(uuid,date,text,text,text,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_entry(date,text,text,text,numeric,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_entry(uuid,date,text,text,text,numeric,text,uuid) TO service_role;