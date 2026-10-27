import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { criarCenariosSegmentos } from "../../database/demo/segmentos.mjs";
import { createPersistenceService } from "../../server/services/persistence.js";
export async function testDemoSegmentosIntegration({sql, env}) {
  const actor = randomUUID(), other = randomUUID(), sid = randomUUID(), otherSid = randomUUID();
  const subject = `test:segmentos:${actor}`, office = 'de000000-0000-4000-8000-000000000001';
  const source=await readFile(new URL('../../database/demo/segmentos.sql',import.meta.url),'utf8');
  const instalar=(who=subject)=>sql(`\\set identity_subject '${who}'\n${source}`);
  // O teste anterior deixa o nome divergente para verificar colisões. Restaura só no banco descartável.
  sql(`UPDATE cjs_private.offices SET name='DEMO' WHERE id='${office}';
    INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('${actor}','${subject}','Admin cenários DEMO',true),('${other}','test:segmentos-operador','Operador sem DEMO',false);
    INSERT INTO cjs_private.sessions(id,user_id,expires_at) VALUES('${sid}','${actor}',now()+interval '1 hour'),('${otherSid}','${other}',now()+interval '1 hour');`);
  const anterior=sql("SELECT title||':'||revision FROM cjs_private.drafts WHERE id='de000000-0000-4000-8000-000000000003';");
  assert.throws(()=>instalar('test:segmentos-operador'),/Admin global ativo/);
  const empresas=criarCenariosSegmentos();
  instalar(); instalar();
  const service=createPersistenceService({env});
  const admin={userId:actor,sessionId:sid,expiresAt:Date.now()+3600000};
  const operador={userId:other,sessionId:otherSid,expiresAt:Date.now()+3600000};
  for(const e of empresas) {
    const lista=await service.listDrafts(admin,office,e.id);
    assert.equal(lista.length,e.drafts.length);
    assert.equal(sql(`SELECT cnpj FROM cjs_private.companies WHERE id='${e.id}';`),e.cnpj);
    for(const d of e.drafts) {
      const saved=await service.getDraft(admin,office,e.id,d.id);
      assert.deepEqual(saved.state,d.state);
      assert.equal(saved.revision,1);
      assert.equal(sql(`SELECT count(*) FROM cjs_private.audit WHERE draft_id='${d.id}';`),'1');
    }
    await assert.rejects(()=>service.getDraft(operador,office,e.id,e.drafts[0].id),err=>err.status===403||err.status===404);
  }
  const e=empresas[0],d=e.drafts[0];
  sql(`UPDATE cjs_private.drafts SET title='Edição preservada',revision=revision+1 WHERE id='${d.id}';`);
  instalar();
  assert.equal(sql(`SELECT title||':'||revision FROM cjs_private.drafts WHERE id='${d.id}';`),'Edição preservada:2');
  assert.equal(sql("SELECT title||':'||revision FROM cjs_private.drafts WHERE id='de000000-0000-4000-8000-000000000003';"),anterior);
  // Uma exclusão não é ressuscitada: todo o lote falha sem efeitos parciais.
  const excluir=empresas[3].drafts[2];
  sql(`UPDATE cjs_private.drafts SET deleted_at=clock_timestamp(),deleted_by='${actor}' WHERE id='${excluir.id}';`);
  const audit=sql('SELECT count(*) FROM cjs_private.audit;');
  assert.throws(()=>instalar(),/excluído ou identificador/);
  assert.equal(sql('SELECT count(*) FROM cjs_private.audit;'),audit);
  assert.equal(sql(`SELECT count(*) FROM cjs_private.memberships WHERE user_id='${other}' AND office_id='${office}';`),'0');
  console.log('OK: quatro empresas/11 modelos DEMO via PostgreSQL/PostgREST: Admin, isolamento, leitura RPC, idempotência, auditoria, preservação do original/edições e bloqueio de ressurreição.');
}
