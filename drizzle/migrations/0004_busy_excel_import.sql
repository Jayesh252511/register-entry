ALTER TABLE public.transport_entries ADD COLUMN source_system text, ADD COLUMN source_company text, ADD COLUMN source_reference text, ADD COLUMN source_values jsonb, ADD COLUMN import_batch_id uuid;
CREATE UNIQUE INDEX transport_busy_source_unique ON public.transport_entries(source_system, source_company, source_reference) WHERE source_system IS NOT NULL;
CREATE TABLE public.import_batches (id uuid PRIMARY KEY, filename text NOT NULL, company text NOT NULL, device_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), payload_hash text NOT NULL, candidate_count integer NOT NULL DEFAULT 0, inserted_count integer NOT NULL DEFAULT 0, updated_count integer NOT NULL DEFAULT 0, duplicate_count integer NOT NULL DEFAULT 0, failed_count integer NOT NULL DEFAULT 0, review_count integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'processing', results jsonb NOT NULL DEFAULT '[]'::jsonb);
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_entries ADD CONSTRAINT transport_import_batch_fk FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id);
CREATE OR REPLACE FUNCTION public.busy_proposed_numbers(p_count integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n bigint; out jsonb := '[]'; BEGIN IF p_count < 0 OR p_count > 500 THEN RAISE EXCEPTION 'INVALID_COUNT'; END IF; SELECT next_bill_number INTO n FROM app_settings WHERE id=1; FOR i IN 1..p_count LOOP WHILE EXISTS(SELECT 1 FROM transport_entries WHERE bill_no=n::text AND archived_at IS NULL) LOOP n:=n+1; END LOOP; out:=out || to_jsonb(n::text); n:=n+1; END LOOP; RETURN out; END $$;
REVOKE ALL ON FUNCTION public.busy_proposed_numbers(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.busy_proposed_numbers(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.import_busy_batch(p_id uuid,p_filename text,p_company text,p_device uuid,p_hash text,p_candidates integer,p_review integer,p_rows jsonb) RETURNS public.import_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.import_batches; old public.transport_entries; saved public.transport_entries; x jsonb; n bigint; result jsonb := '[]'; added integer:=0; changed integer:=0; dup integer:=0; failed integer:=0; wt numeric; dt date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM devices WHERE id=p_device AND revoked_at IS NULL) THEN RAISE EXCEPTION 'DEVICE_NOT_AUTHORIZED'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 OR length(p_company)<1 OR length(p_company)>200 THEN RAISE EXCEPTION 'INVALID_BATCH'; END IF;
 PERFORM 1 FROM app_settings WHERE id=1 FOR UPDATE;
 SELECT * INTO b FROM import_batches WHERE id=p_id;
 IF FOUND THEN IF b.payload_hash<>p_hash THEN RAISE EXCEPTION 'BATCH_CONTENT_CHANGED'; END IF; RETURN b; END IF;
 INSERT INTO import_batches(id,filename,company,device_id,payload_hash,candidate_count,review_count) VALUES(p_id,p_filename,p_company,p_device,p_hash,p_candidates,p_review);
 FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 BEGIN
 IF coalesce(x->>'source_reference','')='' OR length(x->>'source_reference')>200 OR coalesce(x->>'maal_diya','')='' OR length(x->>'maal_diya')>200 OR length(coalesce(x->>'maal_liya',''))>200 OR length(coalesce(x->>'vehicle_no',''))>50 THEN RAISE EXCEPTION 'Missing or invalid source reference or party'; END IF;
 dt:=(x->>'entry_date')::date;
 IF dt IS NULL THEN RAISE EXCEPTION 'Missing date'; END IF;
 IF coalesce(x->>'weight_value','')='' THEN IF NOT coalesce((x->>'allow_incomplete')::boolean,false) THEN RAISE EXCEPTION 'Missing weight'; END IF; wt:=NULL; ELSE IF (x->>'weight_value') !~ '^[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid weight'; END IF; wt:=(x->>'weight_value')::numeric; END IF;
 IF coalesce(x->>'vehicle_no','')='' AND NOT coalesce((x->>'allow_incomplete')::boolean,false) THEN RAISE EXCEPTION 'Missing vehicle number'; END IF;
 IF NOT coalesce((x->>'weight_confirmed')::boolean,false) THEN RAISE EXCEPTION 'Confirm quantity represents MT weight'; END IF;
 SELECT * INTO old FROM transport_entries WHERE source_system='BUSY' AND source_company=p_company AND source_reference=x->>'source_reference';
 IF FOUND THEN
 IF coalesce(x->>'action','new')='update' THEN
 IF old.archived_at IS NOT NULL OR old.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Restore archived or cancelled entry before updating'; END IF;
 IF old.updated_at <> (x->>'existing_updated_at')::timestamptz THEN RAISE EXCEPTION 'Entry changed since preview; preview again'; END IF;
 saved:=update_entry(old.id,dt,old.bill_no,x->>'maal_diya',old.maal_liya,wt,x->>'vehicle_no',p_device);
 UPDATE transport_entries SET source_values=x->'source_values',import_batch_id=p_id WHERE id=saved.id;
 changed:=changed+1; result:=result||jsonb_build_object('row',x->'row','status','updated','id',saved.id,'bill',saved.bill_no);
 ELSE dup:=dup+1; result:=result||jsonb_build_object('row',x->'row','status','duplicate','bill',old.bill_no); END IF;
 ELSE
 IF coalesce(x->>'action','new')='update' THEN RAISE EXCEPTION 'Existing voucher not found'; END IF;
 SELECT next_bill_number INTO n FROM app_settings WHERE id=1;
 WHILE EXISTS(SELECT 1 FROM transport_entries WHERE bill_no=n::text AND archived_at IS NULL) LOOP n:=n+1; END LOOP;
 saved:=create_entry(dt,n::text,x->>'maal_diya',coalesce(x->>'maal_liya',''),wt,coalesce(x->>'vehicle_no',''),gen_random_uuid(),p_device);
 UPDATE transport_entries SET source_system='BUSY',source_company=p_company,source_reference=x->>'source_reference',source_values=x->'source_values',import_batch_id=p_id WHERE id=saved.id;
 INSERT INTO audit_log(entry_id,action,actor_reference,new_values) VALUES(saved.id,'busy_import','device:'||p_device,jsonb_build_object('batch',p_id,'reference',x->>'source_reference'));
 added:=added+1; result:=result||jsonb_build_object('row',x->'row','status','added','id',saved.id,'bill',saved.bill_no);
 END IF;
 EXCEPTION WHEN OTHERS THEN failed:=failed+1; result:=result||jsonb_build_object('row',x->'row','status','failed','reason',CASE WHEN SQLSTATE='23505' THEN 'Duplicate source or bill; preview again' WHEN SQLSTATE IN ('22007','22008','22P02') THEN 'Invalid date or quantity' ELSE SQLERRM END);
 END;
 END LOOP;
 UPDATE import_batches SET inserted_count=added,updated_count=changed,duplicate_count=dup,failed_count=failed,status=CASE WHEN failed>0 THEN 'completed_with_errors' ELSE 'completed' END,results=result WHERE id=p_id RETURNING * INTO b;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.import_busy_batch(uuid,text,text,uuid,text,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_busy_batch(uuid,text,text,uuid,text,integer,integer,jsonb) TO service_role;