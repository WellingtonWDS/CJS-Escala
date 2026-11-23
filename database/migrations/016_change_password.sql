-- Executar após 015 no banco cjs_escala.
-- "Alterar minha senha": usuário logado informa a senha atual e a nova.
-- Até 5 erros de senha atual a cada 15 minutos; as demais sessões são encerradas.
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE FUNCTION cjs_api.change_own_password(p_current text,p_new text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); sid uuid; u cjs_private.users; i public.users; balde text; erros integer; revogadas integer;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 sid:=(current_setting('request.jwt.claims',true)::jsonb->>'sid')::uuid;
 IF p_current IS NULL OR octet_length(p_current)>256 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Informe a senha atual.'; END IF;
 IF p_new IS NULL OR length(p_new)<8 OR octet_length(p_new)>72 OR p_new !~ '[[:alpha:]]' OR p_new !~ '[[:digit:]]'
 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='A nova senha precisa ter de 8 a 72 caracteres, com letras e números.'; END IF;
 SELECT * INTO u FROM cjs_private.users WHERE id=who AND active;
 SELECT * INTO i FROM public.users WHERE user_id::text=u.identity_subject FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Conta sem senha local para alterar.'; END IF;
 balde:='change:'||who::text;
 DELETE FROM cjs_private.login_attempts WHERE bucket=balde AND started_at<now()-interval '15 minutes';
 SELECT attempts INTO erros FROM cjs_private.login_attempts WHERE bucket=balde;
 IF coalesce(erros,0)>=5 THEN RAISE SQLSTATE 'PT429' USING MESSAGE='Muitas tentativas com a senha atual incorreta. Aguarde 15 minutos.'; END IF;
 IF i.password_hash IS NULL OR i.password_hash<>public.crypt(p_current,i.password_hash) THEN
  -- O erro precisa ficar registrado: a contagem é gravada e a função retorna sem exceção.
  INSERT INTO cjs_private.login_attempts AS a VALUES(balde,now(),1)
  ON CONFLICT(bucket) DO UPDATE SET attempts=a.attempts+1;
  RETURN jsonb_build_object('ok',false,'reason','senha_atual','remaining',greatest(0,4-coalesce(erros,0)));
 END IF;
 IF p_new=p_current THEN RAISE SQLSTATE 'PT400' USING MESSAGE='A nova senha precisa ser diferente da atual.'; END IF;
 UPDATE public.users SET password_hash=public.crypt(p_new,public.gen_salt('bf',12)) WHERE user_id=i.user_id;
 DELETE FROM cjs_private.login_attempts WHERE bucket=balde;
 UPDATE cjs_private.password_resets SET canceled_at=now() WHERE user_id=who AND used_at IS NULL AND canceled_at IS NULL;
 -- Encerra as outras sessões; a sessão atual continua aberta.
 UPDATE cjs_private.sessions SET revoked_at=now() WHERE user_id=who AND id IS DISTINCT FROM sid AND revoked_at IS NULL AND expires_at>now();
 GET DIAGNOSTICS revogadas=ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'email',lower(btrim(i.email)),'name',u.name,'sessionsRevoked',revogadas);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.change_own_password(text,text) TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
