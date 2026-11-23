-- Executar após 017 no banco cjs_escala.
-- Avisos automáticos ao Gerente (por e-mail, via backend + n8n):
--  * plano perto do limite (80%) e limite atingido (100%), uma vez por ciclo;
--  * troca de quadro detectada (operador tentou usar e precisa do Gerente), uma vez por empresa e dia;
--  * renovação do ciclo, uma vez por ciclo.
-- Os avisos entram numa fila; o backend envia e marca como enviados.
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.plan_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES cjs_private.offices,
 company_id uuid,
 kind text NOT NULL CHECK(kind IN ('plano_80','plano_100','troca','ciclo')),
 dedupe text NOT NULL UNIQUE,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 FOREIGN KEY(company_id,office_id) REFERENCES cjs_private.companies(id,office_id)
);
CREATE INDEX plan_notices_pending ON cjs_private.plan_notices(created_at) WHERE sent_at IS NULL;
ALTER TABLE cjs_private.plan_notices ENABLE ROW LEVEL SECURITY;

-- Uso do plano: 80% e 100% geram um aviso por ciclo.
CREATE FUNCTION cjs_private.enqueue_usage_notice(p_office uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE snap jsonb:=cjs_private.plan_snapshot(p_office); usado integer; cap integer; tipo text;
BEGIN
 IF snap IS NULL OR snap->>'status'<>'ativo' THEN RETURN; END IF;
 usado:=(snap->>'used')::integer; cap:=(snap->>'capacity')::integer;
 IF cap<1 THEN RETURN; END IF;
 tipo:=CASE WHEN usado>=cap THEN 'plano_100' WHEN usado>=0.8*cap THEN 'plano_80' END;
 IF tipo IS NULL THEN RETURN; END IF;
 INSERT INTO cjs_private.plan_notices(office_id,kind,dedupe,details)
 VALUES(p_office,tipo,tipo||':'||p_office::text||':'||(snap->>'cycleStart'),jsonb_build_object('used',usado,'capacity',cap))
 ON CONFLICT(dedupe) DO NOTHING;
END $$;
CREATE FUNCTION cjs_private.notice_usage_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 PERFORM cjs_private.enqueue_usage_notice(NEW.office_id);
 RETURN NULL;
END $$;
CREATE TRIGGER notice_usage AFTER INSERT ON cjs_private.plan_usage FOR EACH ROW EXECUTE FUNCTION cjs_private.notice_usage_trigger();
CREATE TRIGGER notice_companies AFTER INSERT ON cjs_private.companies FOR EACH ROW EXECUTE FUNCTION cjs_private.notice_usage_trigger();
CREATE TRIGGER notice_extras AFTER INSERT ON cjs_private.plan_extras FOR EACH ROW EXECUTE FUNCTION cjs_private.notice_usage_trigger();
CREATE TRIGGER notice_plans AFTER INSERT OR UPDATE ON cjs_private.office_plans FOR EACH ROW EXECUTE FUNCTION cjs_private.notice_usage_trigger();

-- Troca de quadro detectada (o uso ficou aguardando a confirmação do Gerente).
CREATE FUNCTION cjs_private.notice_swap_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 INSERT INTO cjs_private.plan_notices(office_id,company_id,kind,dedupe,details)
 VALUES(NEW.office_id,NEW.company_id,'troca','troca:'||NEW.company_id::text||':'||cjs_private.today()::text,
  NEW.details||jsonb_build_object('actor',(SELECT name FROM cjs_private.users WHERE id=NEW.actor_id)))
 ON CONFLICT(dedupe) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER notice_swap AFTER INSERT ON cjs_private.plan_events FOR EACH ROW WHEN (NEW.kind='troca_detectada' AND NEW.company_id IS NOT NULL)
 EXECUTE FUNCTION cjs_private.notice_swap_trigger();

-- Renovação do ciclo: criada pelo envio diário (até 3 dias após o início do ciclo).
CREATE FUNCTION cjs_private.enqueue_cycle_notices() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE p cjs_private.office_plans; snap jsonb; cs date; anterior date; liberadas integer;
BEGIN
 FOR p IN SELECT * FROM cjs_private.office_plans WHERE status='ativo' LOOP
  snap:=cjs_private.plan_snapshot(p.office_id);
  cs:=(snap->>'cycleStart')::date;
  CONTINUE WHEN cs<=p.cycle_anchor OR cs<cjs_private.today()-3;
  anterior:=cjs_private.cycle_start(p.cycle_anchor,cs-1);
  SELECT count(*) INTO liberadas FROM cjs_private.plan_usage u JOIN cjs_private.companies c ON c.id=u.company_id
   WHERE u.office_id=p.office_id AND u.cycle_start=anterior AND c.archived_at IS NOT NULL;
  INSERT INTO cjs_private.plan_notices(office_id,kind,dedupe,details)
  VALUES(p.office_id,'ciclo','ciclo:'||p.office_id::text||':'||cs::text,jsonb_build_object('used',(snap->>'used')::integer,'capacity',(snap->>'capacity')::integer,'freed',liberadas))
  ON CONFLICT(dedupe) DO NOTHING;
 END LOOP;
END $$;

-- Envio: entrega os avisos pendentes com os Gerentes de cada escritório (somente o backend).
CREATE FUNCTION cjs_api.plan_notices_pending(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE n cjs_private.plan_notices; saida jsonb:='[]'; destinos jsonb; snap jsonb;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 PERFORM cjs_private.enqueue_cycle_notices();
 FOR n IN SELECT * FROM cjs_private.plan_notices WHERE sent_at IS NULL AND attempts<5
  AND (last_attempt_at IS NULL OR last_attempt_at<now()-interval '10 minutes')
  ORDER BY created_at LIMIT least(greatest(coalesce(p_limit,50),1),200) FOR UPDATE SKIP LOCKED LOOP
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('email',lower(btrim(i.email)),'name',u.name)),'[]') INTO destinos
  FROM cjs_private.memberships m JOIN cjs_private.users u ON u.id=m.user_id AND u.active
  JOIN public.users i ON i.user_id::text=u.identity_subject
  JOIN cjs_private.offices o ON o.id=m.office_id AND o.active
  WHERE m.office_id=n.office_id AND m.active AND m.role='admin';
  IF jsonb_array_length(destinos)=0 THEN
   UPDATE cjs_private.plan_notices SET sent_at=now(),details=details||'{"semDestinatario":true}' WHERE id=n.id;
   CONTINUE;
  END IF;
  UPDATE cjs_private.plan_notices SET attempts=attempts+1,last_attempt_at=now() WHERE id=n.id;
  snap:=coalesce(cjs_private.plan_snapshot(n.office_id),'{}'::jsonb);
  saida:=saida||jsonb_build_array(jsonb_build_object('id',n.id,'kind',n.kind,'details',n.details,
   'officeName',(SELECT name FROM cjs_private.offices WHERE id=n.office_id),
   'companyName',(SELECT name FROM cjs_private.companies WHERE id=n.company_id),
   'plan',jsonb_build_object('name',snap->>'name','used',(snap->>'used')::integer,'capacity',(snap->>'capacity')::integer,
     'free',(snap->>'free')::integer,'cycleStart',snap->>'cycleStart','renewsAt',snap->>'renewsAt'),
   'recipients',destinos));
 END LOOP;
 RETURN saida;
END $$;
CREATE FUNCTION cjs_api.plan_notices_done(p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE n integer;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>200 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Lista inválida.'; END IF;
 UPDATE cjs_private.plan_notices SET sent_at=now() WHERE id=ANY(p_ids) AND sent_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM cjs_private.plan_notices WHERE sent_at<now()-interval '180 days';
 RETURN jsonb_build_object('sent',n);
END $$;
-- Padrão do PostgreSQL concede EXECUTE a PUBLIC; a fila é exclusiva do backend.
REVOKE ALL ON FUNCTION cjs_api.plan_notices_pending(integer),cjs_api.plan_notices_done(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cjs_api.plan_notices_pending(integer),cjs_api.plan_notices_done(uuid[]) TO cjs_identity_gateway;
NOTIFY pgrst,'reload schema';
COMMIT;
