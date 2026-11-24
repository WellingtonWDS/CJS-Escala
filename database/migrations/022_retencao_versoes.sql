-- Executar após 021 no banco cjs_escala.
-- Retenção: cada preenchimento guarda só as 15 versões mais recentes no histórico
-- (draft_versions; cópia completa do preenchimento a cada salvamento, sem leitura pelo
-- sistema). Os registros de idempotência (proteção contra envio duplicado) ficam 30 dias.
-- A auditoria (quem salvou e quando) continua completa.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL ROLE cjs_owner;

-- Idempotência ganha a data do registro; os existentes usam a data do salvamento.
ALTER TABLE cjs_private.idempotency ADD COLUMN created_at timestamptz;
UPDATE cjs_private.idempotency SET created_at=coalesce((response->>'updated_at')::timestamptz, now());
ALTER TABLE cjs_private.idempotency ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX idempotency_created ON cjs_private.idempotency(created_at);

-- Mesmo comportamento da migração 007, mais a limpeza a cada salvamento.
CREATE OR REPLACE FUNCTION cjs_private.record_draft() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Preenchimento excluído.'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN
  INSERT INTO cjs_private.audit(office_id,company_id,draft_id,revision,user_id,action)
  VALUES(NEW.office_id,NEW.company_id,NEW.id,NEW.revision,NEW.deleted_by,'delete');
  RETURN NEW;
 END IF;
 INSERT INTO cjs_private.draft_versions(draft_id,office_id,company_id,revision,title,state,schema_version,changed_by)
 VALUES(NEW.id,NEW.office_id,NEW.company_id,NEW.revision,NEW.title,NEW.state,NEW.schema_version,NEW.updated_by);
 INSERT INTO cjs_private.audit(office_id,company_id,draft_id,revision,user_id,action)
 VALUES(NEW.office_id,NEW.company_id,NEW.id,NEW.revision,NEW.updated_by,CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'update' END);
 -- Histórico: só as 15 versões mais recentes deste preenchimento.
 DELETE FROM cjs_private.draft_versions WHERE draft_id=NEW.id AND revision<(
  SELECT min(r) FROM (SELECT revision r FROM cjs_private.draft_versions WHERE draft_id=NEW.id ORDER BY revision DESC LIMIT 15) ultimas);
 -- Idempotência com mais de 30 dias, em lotes pequenos para não pesar no salvamento.
 DELETE FROM cjs_private.idempotency WHERE ctid IN (
  SELECT ctid FROM cjs_private.idempotency WHERE created_at<now()-interval '30 days' LIMIT 200);
 RETURN NEW;
END $$;

-- Limpeza única do que já existe.
DELETE FROM cjs_private.draft_versions v USING (
 SELECT draft_id,revision,row_number() OVER (PARTITION BY draft_id ORDER BY revision DESC) n FROM cjs_private.draft_versions) o
WHERE o.draft_id=v.draft_id AND o.revision=v.revision AND o.n>15;
DELETE FROM cjs_private.idempotency WHERE created_at<now()-interval '30 days';
COMMIT;
