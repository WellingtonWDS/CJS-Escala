-- Executar após 019 no banco cjs_escala.
-- Desempenho das listas: as funções partem dos escritórios do usuário (e não verificam a
-- permissão empresa por empresa em todo o sistema) e deixam de ler o preenchimento
-- completo (state, até 1 MB) para montar o resumo dos cartões. Mesmas assinaturas e
-- mesmas respostas; o front-end não muda.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL ROLE cjs_owner;

CREATE INDEX IF NOT EXISTS companies_office ON cjs_private.companies (office_id);

-- Resumo do preenchimento calculado pelo banco a cada gravação. A leitura dos cartões
-- passa a usar estas colunas, sem descompactar o JSON inteiro de cada rascunho.
ALTER TABLE cjs_private.drafts
 ADD COLUMN summary_employees integer GENERATED ALWAYS AS
  (CASE WHEN jsonb_typeof(state->'colaboradores')='array' THEN jsonb_array_length(state->'colaboradores') ELSE 0 END) STORED,
 ADD COLUMN summary_has_result boolean GENERATED ALWAYS AS
  ((state ? 'resultadosCompactados') OR coalesce(state->'conversao','null'::jsonb)<>'null'::jsonb
   OR coalesce(state->'escalaGerada','null'::jsonb)<>'null'::jsonb) STORED;
-- Rascunhos ativos por empresa, do mais recente para o mais antigo (contagem e último).
CREATE INDEX IF NOT EXISTS drafts_company_live ON cjs_private.drafts (office_id, company_id, updated_at DESC, id)
 WHERE deleted_at IS NULL;

-- Escritórios visíveis ao usuário atual e o que ele pode em cada um.
-- ATENÇÃO: espelha as regras de allowed(), office_visible() e manage_office()
-- (migração 010). Se alguma delas mudar, mude aqui também.
CREATE OR REPLACE FUNCTION cjs_private.visible_offices()
 RETURNS TABLE(office_id uuid, can_manage boolean, can_write boolean, all_companies boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER ROWS 5
 SET search_path TO 'pg_catalog', 'cjs_private'
AS $function$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RETURN; END IF;
 IF cjs_private.platform_admin() THEN
  RETURN QUERY SELECT o.id,true,true,true FROM cjs_private.offices o WHERE o.active;
 ELSE
  RETURN QUERY SELECT o.id, m.role='admin', m.role IN ('admin','editor'), m.role='admin'
   FROM cjs_private.memberships m JOIN cjs_private.offices o ON o.id=m.office_id
   WHERE m.user_id=who AND m.active AND o.active AND NOT o.demo;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION cjs_private.visible_offices() FROM PUBLIC;

CREATE OR REPLACE FUNCTION cjs_api.company_cards()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'cjs_private'
AS $function$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (WITH v AS MATERIALIZED (SELECT * FROM cjs_private.visible_offices())
 SELECT jsonb_build_object(
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'demo',o.demo,
   'canCreate',v.can_manage,
   'plan',CASE WHEN v.can_manage THEN coalesce(cjs_private.plan_snapshot(o.id),jsonb_build_object('limited',false)) - 'notes' ELSE NULL END)
  ORDER BY o.name),'[]') FROM v JOIN cjs_private.offices o ON o.id=v.office_id),
 'companies',(SELECT coalesce(jsonb_agg(cjs_private.company_json(c) || jsonb_build_object(
   'officeName',o.name,
   'canWrite',v.can_write,
   'canManage',v.can_manage,
   'drafts',(SELECT count(*) FROM cjs_private.drafts d WHERE d.company_id=c.id AND d.office_id=c.office_id AND d.deleted_at IS NULL),
   'latest',(SELECT jsonb_build_object('title',d.title,'updatedAt',d.updated_at,'updatedBy',u.name,
      'employees',d.summary_employees,'hasResult',d.summary_has_result)
     FROM cjs_private.drafts d LEFT JOIN cjs_private.users u ON u.id=d.updated_by
     WHERE d.company_id=c.id AND d.office_id=c.office_id AND d.deleted_at IS NULL ORDER BY d.updated_at DESC,d.id LIMIT 1))
  ORDER BY c.archived_at IS NOT NULL,c.name),'[]')
  FROM v JOIN cjs_private.offices o ON o.id=v.office_id JOIN cjs_private.companies c ON c.office_id=v.office_id
  WHERE v.all_companies OR EXISTS(SELECT 1 FROM cjs_private.company_access a WHERE a.user_id=who AND a.office_id=c.office_id AND a.company_id=c.id))
 ));
END $function$;

CREATE OR REPLACE FUNCTION cjs_api.company_options()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'cjs_private'
AS $function$
DECLARE who uuid:=cjs_private.actor();
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN (WITH v AS MATERIALIZED (SELECT * FROM cjs_private.visible_offices())
 SELECT jsonb_build_object(
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'canCreate',v.can_manage,'demo',o.demo) ORDER BY o.name),'[]')
  FROM v JOIN cjs_private.offices o ON o.id=v.office_id),
 'companies',(SELECT coalesce(jsonb_agg(cjs_private.company_json(c) ORDER BY c.archived_at IS NOT NULL,c.name),'[]')
  FROM v JOIN cjs_private.companies c ON c.office_id=v.office_id
  WHERE v.all_companies OR EXISTS(SELECT 1 FROM cjs_private.company_access a WHERE a.user_id=who AND a.office_id=c.office_id AND a.company_id=c.id))
 ));
END $function$;

-- Gestão de usuários: o Admin geral vê tudo (inclusive escritórios inativos, como antes);
-- o Gerente, apenas os escritórios que gerencia.
CREATE OR REPLACE FUNCTION cjs_api.manage_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE who uuid:=cjs_private.actor(); elevated boolean:=cjs_private.platform_admin(); geridos uuid[];
BEGIN
 IF who IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 IF NOT elevated THEN
  SELECT coalesce(array_agg(v.office_id),'{}') INTO geridos FROM cjs_private.visible_offices() v WHERE v.can_manage;
  IF cardinality(geridos)=0 THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Acesso não permitido.'; END IF;
 END IF;
 RETURN jsonb_build_object(
 'currentUserId',who,'platformAdmin',elevated,
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) ORDER BY name),'[]') FROM cjs_private.offices WHERE elevated OR id=ANY(geridos)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name),'[]') FROM cjs_private.companies WHERE elevated OR office_id=ANY(geridos)),
 'users',(SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',u.id,'name',u.name,'email',i.email,'officeId',m.office_id,
 'role',CASE WHEN u.platform_admin THEN 'admin' WHEN m.role='admin' THEN 'manager' WHEN m.role='viewer' THEN 'viewer' ELSE 'operator' END,
 'accountActive',u.active,'membershipActive',coalesce(m.active,true),'active',u.active AND (u.platform_admin OR coalesce(m.active,false)),
 'revision',u.management_revision,'canEdit',elevated OR NOT u.platform_admin,
 'canEditIdentity',elevated OR NOT EXISTS(SELECT 1 FROM cjs_private.memberships other WHERE other.user_id=u.id AND other.office_id<>m.office_id),
 'companyIds',(SELECT coalesce(jsonb_agg(a.company_id ORDER BY a.company_id),'[]') FROM cjs_private.company_access a WHERE a.user_id=u.id AND a.office_id=m.office_id)
 ) ORDER BY u.name,u.id,m.office_id),'[]') FROM cjs_private.users u LEFT JOIN cjs_private.memberships m ON m.user_id=u.id LEFT JOIN public.users i ON i.user_id::text=u.identity_subject WHERE elevated OR m.office_id=ANY(geridos))
 );
END $$;

CREATE OR REPLACE FUNCTION cjs_api.diagnostic_options() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
DECLARE geridos uuid[];
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 SELECT coalesce(array_agg(v.office_id),'{}') INTO geridos FROM cjs_private.visible_offices() v WHERE v.can_manage;
 IF cardinality(geridos)=0 THEN RAISE SQLSTATE 'PT403' USING MESSAGE='Somente Gerentes e Admins.'; END IF;
 RETURN jsonb_build_object('offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]') FROM cjs_private.offices WHERE id=ANY(geridos)),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'officeId',office_id,'name',name,'cnpj',cnpj) ORDER BY name,id),'[]') FROM cjs_private.companies WHERE office_id=ANY(geridos)));
END $$;

ANALYZE cjs_private.companies;
ANALYZE cjs_private.drafts;
NOTIFY pgrst,'reload schema';
COMMIT;
