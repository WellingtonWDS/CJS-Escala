BEGIN;
CREATE ROLE cjs_identity_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT cjs_identity_gateway TO cjs_authenticator;
SET LOCAL ROLE cjs_owner;
CREATE TABLE cjs_private.login_attempts(bucket text PRIMARY KEY,started_at timestamptz NOT NULL,attempts integer NOT NULL);
CREATE INDEX login_attempts_time ON cjs_private.login_attempts(started_at);
CREATE FUNCTION cjs_private.gateway_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
 SELECT coalesce(current_setting('request.jwt.claims',true)::jsonb @> '{"role":"cjs_identity_gateway","iss":"cjs-escala-api","aud":"cjs-postgrest","purpose":"identity"}'::jsonb,false)
$$;
CREATE OR REPLACE FUNCTION cjs_api.check_session() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF NOT cjs_private.gateway_valid() AND cjs_private.actor() IS NULL THEN
  RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida, expirada ou revogada.';
 END IF;
END $$;
CREATE FUNCTION cjs_api.login_attempt(p_bucket text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE n integer;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 IF p_bucket IS NULL OR p_bucket !~ '^[a-f0-9]{64}$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Identificador inválido.'; END IF;
 DELETE FROM cjs_private.login_attempts WHERE bucket IN (SELECT bucket FROM cjs_private.login_attempts WHERE started_at<now()-interval '15 minutes' LIMIT 100);
 INSERT INTO cjs_private.login_attempts AS a VALUES('global',now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 started_at=CASE WHEN a.started_at<now()-interval '1 minute' THEN now() ELSE a.started_at END,
 attempts=CASE WHEN a.started_at<now()-interval '1 minute' THEN 1 ELSE a.attempts+1 END RETURNING attempts INTO n;
 IF n>120 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Limite temporário de login. Aguarde.'; END IF;
 INSERT INTO cjs_private.login_attempts AS a VALUES(p_bucket,now(),1)
 ON CONFLICT(bucket) DO UPDATE SET
 started_at=CASE WHEN a.started_at<now()-interval '15 minutes' THEN now() ELSE a.started_at END,
 attempts=CASE WHEN a.started_at<now()-interval '15 minutes' THEN 1 ELSE a.attempts+1 END
 RETURNING attempts INTO n;
 -- Retorna erro sem desfazer o contador: na tentativa acima do limite não é preciso incrementá-lo.
 IF n>10 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitas tentativas. Aguarde antes de tentar novamente.'; END IF;
END $$;
CREATE FUNCTION cjs_api.open_session(p_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE claims jsonb; u cjs_private.users; s cjs_private.sessions;
BEGIN
 IF NOT cjs_private.gateway_valid() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Serviço não autorizado.'; END IF;
 claims:=current_setting('request.jwt.claims',true)::jsonb;
 SELECT * INTO u FROM cjs_private.users WHERE identity_subject=claims->>'sub' AND active;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id WHERE m.user_id=u.id AND m.active AND o.active)
 THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Usuário sem acesso ao sistema.'; END IF;
 IF p_expires_at IS NULL OR p_expires_at<=now() THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Identidade expirada.'; END IF;
 INSERT INTO cjs_private.sessions(user_id,expires_at) VALUES(u.id,least(p_expires_at,now()+interval '12 hours')) RETURNING * INTO s;
 RETURN jsonb_build_object('userId',u.id,'sessionId',s.id,'expiresAt',floor(extract(epoch FROM s.expires_at)*1000),'name',u.name);
END $$;
CREATE FUNCTION cjs_api.get_identity() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (SELECT jsonb_build_object('id',u.id,'name',u.name) FROM cjs_private.users u WHERE u.id=who);
END $$;
CREATE FUNCTION cjs_api.revoke_session() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 UPDATE cjs_private.sessions SET revoked_at=now() WHERE user_id=who AND id=(current_setting('request.jwt.claims',true)::jsonb->>'sid')::uuid;
END $$;
GRANT USAGE ON SCHEMA cjs_api TO cjs_identity_gateway;
GRANT EXECUTE ON FUNCTION cjs_api.check_session(),cjs_api.login_attempt(text),cjs_api.open_session(timestamptz) TO cjs_identity_gateway;
GRANT EXECUTE ON FUNCTION cjs_api.get_identity(),cjs_api.revoke_session() TO cjs_authenticated;
COMMIT;
