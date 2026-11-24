-- Executar após 020 no banco cjs_escala.
-- Login direto pelo backend: a senha passa a ser conferida (bcrypt) na função do Vercel,
-- fora da VPS; o banco só entrega o hash ao papel de serviço e abre a sessão. O fluxo n8n
-- de login continua funcionando como alternativa enquanto esta migração não for aplicada.
-- O limite global de logins passa a ser distribuído por segundo, em vez de liberar todo
-- o minuto de uma vez.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL ROLE cjs_owner;

-- Somente o backend (cjs_identity_gateway) consulta; o hash nunca chega ao navegador.
CREATE FUNCTION cjs_api.login_lookup(p_email text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE r record; e text:=lower(btrim(coalesce(p_email,'')));
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF length(e) NOT BETWEEN 3 AND 254 THEN RETURN jsonb_build_object('found',false); END IF;
 SELECT user_id,password_hash INTO r FROM public.users WHERE lower(btrim(email))=e LIMIT 1;
 IF NOT FOUND OR r.password_hash IS NULL OR r.password_hash !~ '^\$2[aby]\$[0-9]{2}\$.{53}$' THEN RETURN jsonb_build_object('found',false); END IF;
 RETURN jsonb_build_object('found',true,'userId',r.user_id::text,'hash',r.password_hash);
END $$;
REVOKE ALL ON FUNCTION cjs_api.login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cjs_api.login_lookup(text) TO cjs_identity_gateway;

-- Limite global: até 15 tentativas por segundo e 600 por minuto (antes, 120 por minuto
-- liberadas de uma vez). Por e-mail continua: 10 tentativas a cada 15 minutos.
CREATE OR REPLACE FUNCTION cjs_api.login_attempt(p_bucket text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE n integer;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_bucket IS NULL OR p_bucket !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Identificador inválido.'; END IF;
 DELETE FROM cjs_private.login_attempts WHERE bucket IN (SELECT bucket FROM cjs_private.login_attempts WHERE started_at<now()-interval '15 minutes' AND bucket NOT IN ('global','global-s') LIMIT 100);
 INSERT INTO cjs_private.login_attempts AS a VALUES('global-s',now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 started_at=CASE WHEN a.started_at<now()-interval '1 second' THEN now() ELSE a.started_at END,
 attempts=CASE WHEN a.started_at<now()-interval '1 second' THEN 1 ELSE a.attempts+1 END RETURNING attempts INTO n;
 IF n>15 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Limite temporário de login. Aguarde.'; END IF;
 INSERT INTO cjs_private.login_attempts AS a VALUES('global',now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 started_at=CASE WHEN a.started_at<now()-interval '1 minute' THEN now() ELSE a.started_at END,
 attempts=CASE WHEN a.started_at<now()-interval '1 minute' THEN 1 ELSE a.attempts+1 END RETURNING attempts INTO n;
 IF n>600 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Limite temporário de login. Aguarde.'; END IF;
 INSERT INTO cjs_private.login_attempts AS a VALUES(p_bucket,now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 started_at=CASE WHEN a.started_at<now()-interval '15 minutes' THEN now() ELSE a.started_at END,
 attempts=CASE WHEN a.started_at<now()-interval '15 minutes' THEN 1 ELSE a.attempts+1 END
 RETURNING attempts INTO n;
 IF n>10 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitas tentativas. Aguarde antes de tentar novamente.'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
