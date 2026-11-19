-- Executar após 010 no banco cjs_escala.
-- Tela inicial "Empresas": cartões com resumo de cada empresa autorizada
-- (preenchimentos, colaboradores do mais recente, última atualização e autor).
BEGIN;
SET LOCAL ROLE cjs_owner;
CREATE FUNCTION cjs_api.company_cards() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cjs_private AS $$
BEGIN
 IF cjs_private.actor() IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Sessão inválida.'; END IF;
 RETURN jsonb_build_object(
 'offices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'demo',o.demo,
   'canCreate',cjs_private.manage_office(o.id),
   'plan',CASE WHEN cjs_private.manage_office(o.id) THEN coalesce(cjs_private.plan_snapshot(o.id),jsonb_build_object('limited',false)) - 'notes' ELSE NULL END)
  ORDER BY o.name),'[]') FROM cjs_private.offices o WHERE cjs_private.office_visible(o.id)),
 'companies',(SELECT coalesce(jsonb_agg(cjs_private.company_json(c) || jsonb_build_object(
   'officeName',o.name,
   'canWrite',cjs_private.allowed(c.office_id,c.id,true),
   'canManage',cjs_private.manage_office(c.office_id),
   'drafts',(SELECT count(*) FROM cjs_private.drafts d WHERE d.company_id=c.id AND d.office_id=c.office_id AND d.deleted_at IS NULL),
   'latest',(SELECT jsonb_build_object('title',d.title,'updatedAt',d.updated_at,'updatedBy',u.name,
      'employees',CASE WHEN jsonb_typeof(d.state->'colaboradores')='array' THEN jsonb_array_length(d.state->'colaboradores') ELSE 0 END,
      'hasResult',(d.state ? 'resultadosCompactados') OR coalesce(d.state->'conversao','null'::jsonb)<>'null'::jsonb OR coalesce(d.state->'escalaGerada','null'::jsonb)<>'null'::jsonb)
     FROM cjs_private.drafts d LEFT JOIN cjs_private.users u ON u.id=d.updated_by
     WHERE d.company_id=c.id AND d.office_id=c.office_id AND d.deleted_at IS NULL ORDER BY d.updated_at DESC,d.id LIMIT 1))
  ORDER BY c.archived_at IS NOT NULL,c.name),'[]')
  FROM cjs_private.companies c JOIN cjs_private.offices o ON o.id=c.office_id WHERE cjs_private.allowed(c.office_id,c.id))
 );
END $$;
GRANT EXECUTE ON FUNCTION cjs_api.company_cards() TO cjs_authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
