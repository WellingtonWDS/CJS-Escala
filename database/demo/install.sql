-- Reescala: dados fictícios para testes. Executar como administrador do banco.
-- Requer migrações 001–008; não cria contas/senhas e não altera empresas reais.
\set ON_ERROR_STOP on
\if :{?identity_subject}
\else
\echo 'Informe -v identity_subject=ID_DA_IDENTIDADE_ADMIN'
\quit 3
\endif
BEGIN;
SET LOCAL ROLE cjs_owner;
SELECT set_config('cjs.demo_subject', :'identity_subject', true);
DO $install_demo$
DECLARE
 v_actor uuid;
 v_office constant uuid := 'de000000-0000-4000-8000-000000000001';
 v_company constant uuid := 'de000000-0000-4000-8000-000000000002';
 v_draft constant uuid := 'de000000-0000-4000-8000-000000000003';
 demo_state jsonb := $demo_state${"mes":9,"ano":2026,"diaInicio":1,"modeloEscala":"dinamica","dataReferenciaFixa":"2026-10-01","analiseEnquadramentoAtiva":false,"colaboradores":[{"id":1,"nome":"Colaborador Demo 1","sexo":"masculino","cargo":"Atendente","horasSemana":44},{"id":2,"nome":"Colaborador Demo 2","sexo":"feminino","cargo":"Atendente","horasSemana":44},{"id":3,"nome":"Colaborador Demo 3","sexo":"masculino","cargo":"Atendente","horasSemana":44},{"id":4,"nome":"Colaborador Demo 4","sexo":"feminino","cargo":"Supervisor","horasSemana":44},{"id":5,"nome":"Colaborador Demo 5","sexo":"masculino","cargo":"Supervisor","horasSemana":44}],"proximoId":6,"coberturaAtiva":true,"demandasCobertura":[{"id":1,"funcao":"Atendente","inicio":"09:00","fim":"11:00","minimo":1,"diasSemana":[1,2,3,4,5],"incluirFeriados":false},{"id":2,"funcao":"Atendente","inicio":"14:00","fim":"17:00","minimo":1,"diasSemana":[1,2,3,4,5],"incluirFeriados":false},{"id":3,"funcao":"Supervisor","inicio":"09:00","fim":"11:00","minimo":1,"diasSemana":[1,2,3,4,5],"incluirFeriados":false},{"id":4,"funcao":"Supervisor","inicio":"14:00","fim":"17:00","minimo":1,"diasSemana":[1,2,3,4,5],"incluirFeriados":false}],"proximaDemandaId":5,"tipoEscala":"6x1","regimeJornada":"atual44","modoRegime":"automatico","politicaFeriados":"conta_folga","instrumentoColetivo":{"identificacao":"","inicio":"","fim":"","compativelEC141":false,"compensacaoDiaria":false,"limiteDiario":10,"repousoMensal":false,"regime12x36":false,"intervaloComputado":false,"creditoNoturnoUmaHora":false,"compensacaoHoras":false,"apuracaoInicio":"","apuracaoFim":"","limiteSemanalCompensado":44},"instrumentoCompensacao":"nenhuma","feriados":[],"feriadosLocais":[],"feriadosConfigurados":[],"feriadosExcluidos":[],"jornada":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"jornadaPorDia":{"1":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"2":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"3":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"4":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"5":{"entrada":"08:00","intInicio":"11:00","intFim":"13:00","saida":"18:00"},"6":{"entrada":"08:00","intInicio":"","intFim":"","saida":"12:00"}},"horarioPorDia":true,"turnosRevezamento":false,"entradaTurnoB":"14:00","ancora12x36":"2026-01-01","diasTrabalho":[1,2,3,4,5,6],"folgaTipo":"fixa","folgasFimSemana":false,"folgaDiasPermitidos":[0],"folgaCobertura":"cobertura","escalaGerada":null,"conversao":null,"destinoConversao":{"periodo":"2028-02","fase":"automatico","folgas":"fim_semana"},"empresaDominio":null,"relatorioDominio":null,"atividadeComercio":false,"domingosPermitidos":false,"feriadosPermitidos":false}$demo_state$::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('reescala:demo:install:v1',0));
 SELECT id INTO v_actor FROM cjs_private.users
 WHERE identity_subject=current_setting('cjs.demo_subject') AND active AND platform_admin;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'A identidade informada precisa pertencer a um Admin global ativo.'; END IF;
 IF EXISTS(SELECT 1 FROM cjs_private.offices WHERE id=v_office AND (name<>'DEMO' OR NOT active))
 OR EXISTS(SELECT 1 FROM cjs_private.companies WHERE id=v_company AND (office_id<>v_office OR name<>'Empresa Demo — FICTÍCIA')) THEN
   RAISE EXCEPTION 'Identificador DEMO já usado por outro cadastro ou escritório inativo. Nada foi alterado.';
 END IF;
 IF EXISTS(SELECT 1 FROM cjs_private.drafts d WHERE d.id=v_draft AND (d.office_id<>v_office OR d.company_id<>v_company OR d.deleted_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'Preenchimento DEMO excluído ou identificador em outro contexto. Nada foi alterado.';
 END IF;
 INSERT INTO cjs_private.offices(id,name) VALUES(v_office,'DEMO') ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO cjs_private.office_registry_log(actor_id,office_id) VALUES(v_actor,v_office);
 END IF;
 -- CNPJ sintético apenas para teste, sem consulta cadastral externa.
 INSERT INTO cjs_private.companies(id,office_id,name,cnpj) VALUES(v_company,v_office,'Empresa Demo — FICTÍCIA','00000000000191') ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO cjs_private.company_registry_log(actor_id,office_id,company_id,action,details)
  VALUES(v_actor,v_office,v_company,'create','{"origem":"demo-ficticia"}');
 END IF;
 -- Somente o Admin informado recebe o vínculo. Não libera acesso a outros escritórios.
 INSERT INTO cjs_private.memberships(user_id,office_id,role) VALUES(v_actor,v_office,'admin') ON CONFLICT DO NOTHING;
 INSERT INTO cjs_private.drafts(id,office_id,company_id,title,state,updated_by)
 VALUES(v_draft,v_office,v_company,'DEMO — 5 colaboradores · 6×1 → 5×2',demo_state,v_actor)
 ON CONFLICT(id) DO NOTHING;
 -- Reexecução preserva inclusive edições feitas pelo usuário no preenchimento.
END $install_demo$;
COMMIT;
SELECT o.name AS escritorio,c.name AS empresa,d.title AS preenchimento,
 jsonb_array_length(d.state->'colaboradores') AS colaboradores,d.revision AS revisao
FROM cjs_private.offices o JOIN cjs_private.companies c ON c.office_id=o.id
JOIN cjs_private.drafts d ON d.company_id=c.id
WHERE d.id='de000000-0000-4000-8000-000000000003';
