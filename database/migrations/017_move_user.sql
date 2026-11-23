-- Executar após 016 no banco cjs_escala.
-- Os vínculos anteriores são removidos; o estado anterior fica em user_change_log.
-- Admin move um usuário para outro escritório (ou o promove/rebaixa de Admin global),
-- escolhendo perfil e empresas no escritório de destino. Evita contas sem vínculo:
-- Operador e Gerente sempre ficam com um escritório ativo.
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE FUNCTION cjs_api.manage_move_user(p_user_id uuid,p_revision integer,p_to_office_id uuid,p_role text,p_company_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); target cjs_private.users; antes jsonb; next_role text;
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT cjs_private.platform_admin() THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente o Admin muda o escritório de um usuário.'; END IF;
 PERFORM pg_advisory_xact_lock(876141008);
 SELECT * INTO target FROM cjs_private.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE='Usuário não encontrado.'; END IF;
 IF p_revision IS NULL OR p_revision<>target.management_revision THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Cadastro alterado. Atualize a lista antes de salvar.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('operator','manager','admin') OR p_company_ids IS NULL OR cardinality(p_company_ids)>1000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Dados inválidos.'; END IF;
 IF who=p_user_id THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Não é possível alterar o próprio perfil ou escritório.'; END IF;
 IF p_role<>'admin' THEN
  IF p_to_office_id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.offices WHERE id=p_to_office_id AND active) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Escolha o escritório do usuário.'; END IF;
  IF (p_role='operator' AND cardinality(p_company_ids)=0) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Selecione ao menos uma empresa para o operador.'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_company_ids) chosen(id) WHERE id IS NULL OR NOT EXISTS(SELECT 1 FROM cjs_private.companies c WHERE c.id=chosen.id AND c.office_id=p_to_office_id)) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Empresas inválidas.'; END IF;
  IF target.platform_admin AND target.active AND NOT EXISTS(SELECT 1 FROM cjs_private.users WHERE platform_admin AND active AND id<>p_user_id) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='É necessário manter ao menos um Admin ativo.'; END IF;
 END IF;
 SELECT jsonb_build_object('platformAdmin',target.platform_admin,'memberships',coalesce(jsonb_agg(jsonb_build_object('officeId',m.office_id,'role',m.role,'active',m.active)),'[]'))
 INTO antes FROM cjs_private.memberships m WHERE m.user_id=p_user_id;
 IF p_role='admin' THEN
  -- Admin global acessa todos os escritórios: vínculos anteriores saem (ficam no histórico).
  DELETE FROM cjs_private.company_access WHERE user_id=p_user_id;
  DELETE FROM cjs_private.memberships WHERE user_id=p_user_id;
  UPDATE cjs_private.users SET platform_admin=true,management_revision=management_revision+1 WHERE id=p_user_id;
 ELSE
  next_role:=CASE WHEN p_role='manager' THEN 'admin' ELSE 'editor' END;
  -- Vínculo único no destino: os demais vínculos e empresas saem (ficam no histórico).
  DELETE FROM cjs_private.company_access WHERE user_id=p_user_id;
  DELETE FROM cjs_private.memberships WHERE user_id=p_user_id AND office_id<>p_to_office_id;
  INSERT INTO cjs_private.memberships(user_id,office_id,role,active) VALUES(p_user_id,p_to_office_id,next_role,true)
  ON CONFLICT(user_id,office_id) DO UPDATE SET role=excluded.role,active=true;
  INSERT INTO cjs_private.company_access(user_id,office_id,company_id) SELECT DISTINCT p_user_id,p_to_office_id,id FROM unnest(p_company_ids) chosen(id);
  UPDATE cjs_private.users SET platform_admin=false,management_revision=management_revision+1 WHERE id=p_user_id;
 END IF;
 INSERT INTO cjs_private.user_change_log(actor_id,user_id,office_id,before_data,after_data)
 VALUES(who,p_user_id,p_to_office_id,antes,jsonb_build_object('moved',true,'officeId',p_to_office_id,'role',p_role,'companyIds',to_jsonb(p_company_ids)));
 RETURN jsonb_build_object('ok',true,'revision',target.management_revision+1,'officeId',CASE WHEN p_role='admin' THEN NULL ELSE p_to_office_id END);
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.manage_move_user(uuid,integer,uuid,text,uuid[]) TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
