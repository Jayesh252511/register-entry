CREATE TABLE public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_bill_number bigint NOT NULL DEFAULT 168,
  next_register_serial bigint NOT NULL DEFAULT 1,
  default_weight_unit text NOT NULL DEFAULT 'MT',
  business_display_name text NOT NULL DEFAULT 'Transport Register',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.transport_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_serial_no bigint NOT NULL UNIQUE,
  entry_date date NOT NULL,
  bill_no text NOT NULL CHECK (length(btrim(bill_no)) > 0),
  maal_diya text NOT NULL CHECK (length(btrim(maal_diya)) > 0),
  maal_liya text NOT NULL CHECK (length(btrim(maal_liya)) > 0),
  weight_value numeric CHECK (weight_value IS NULL OR weight_value >= 0),
  weight_unit text,
  vehicle_no text NOT NULL CHECK (length(btrim(vehicle_no)) > 0),
  client_request_id uuid UNIQUE,
  device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX transport_entries_bill_active_uq ON public.transport_entries (bill_no) WHERE archived_at IS NULL;
CREATE INDEX ON public.transport_entries (entry_date);
CREATE INDEX ON public.transport_entries (vehicle_no);
CREATE INDEX ON public.transport_entries (maal_diya);
CREATE INDEX ON public.transport_entries (maal_liya);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid,
  action text NOT NULL,
  actor_reference text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);
CREATE INDEX ON public.audit_log (entry_id);

CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE public.auth_attempts (
  id bigserial PRIMARY KEY,
  ip text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);
CREATE INDEX ON public.auth_attempts (ip, attempted_at);

GRANT ALL ON public.app_settings, public.transport_entries, public.audit_log, public.devices, public.auth_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.auth_attempts_id_seq TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only the trusted server (service role) can access these tables.

CREATE OR REPLACE FUNCTION public.create_entry(
  p_entry_date date, p_bill_no text, p_maal_diya text, p_maal_liya text,
  p_weight_value numeric, p_vehicle_no text, p_client_request_id uuid, p_device_id uuid)
RETURNS public.transport_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.app_settings; r public.transport_entries; v_bill text; v_num bigint;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT * INTO r FROM transport_entries WHERE client_request_id = p_client_request_id;
    IF FOUND THEN RETURN r; END IF;
  END IF;
  SELECT * INTO s FROM app_settings WHERE id = 1 FOR UPDATE;
  v_bill := NULLIF(btrim(coalesce(p_bill_no,'')), '');
  IF v_bill IS NULL THEN v_bill := s.next_bill_number::text; END IF;
  IF EXISTS (SELECT 1 FROM transport_entries WHERE bill_no = v_bill AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'DUPLICATE_BILL:%', v_bill USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO transport_entries (register_serial_no, entry_date, bill_no, maal_diya, maal_liya,
    weight_value, weight_unit, vehicle_no, client_request_id, device_id)
  VALUES (s.next_register_serial, p_entry_date, v_bill, p_maal_diya, p_maal_liya,
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
  v_bill := NULLIF(btrim(coalesce(p_bill_no,'')), '');
  IF v_bill IS NULL THEN RAISE EXCEPTION 'BILL_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM transport_entries WHERE bill_no = v_bill AND archived_at IS NULL AND id <> p_id) THEN
    RAISE EXCEPTION 'DUPLICATE_BILL:%', v_bill;
  END IF;
  UPDATE transport_entries SET entry_date = p_entry_date, bill_no = v_bill, maal_diya = p_maal_diya,
    maal_liya = p_maal_liya, weight_value = p_weight_value,
    weight_unit = CASE WHEN p_weight_value IS NULL THEN NULL ELSE coalesce(old.weight_unit, s.default_weight_unit) END,
    vehicle_no = p_vehicle_no, updated_at = now()
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