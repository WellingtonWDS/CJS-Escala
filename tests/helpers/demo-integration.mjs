import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { criarEstadoDemo } from "../../database/demo/state.mjs";
export async function testDemoIntegration({sql}) {
 const user='de000000-0000-4000-8000-000000000004', office='de000000-0000-4000-8000-000000000001', draft='de000000-0000-4000-8000-000000000003';
 sql(`INSERT INTO cjs_private.users(id,identity_subject,name,platform_admin) VALUES('${user}','test:demo-installer','Admin Demo Teste',true);`);
 const source=await readFile(new URL('../../database/demo/install.sql',import.meta.url),'utf8');
 const instalar=(subject='test:demo-installer')=>sql(`\\set identity_subject '${subject}'\n${source}`);
 instalar();instalar();
 assert.equal(sql(`SELECT count(*) FROM cjs_private.offices WHERE id='${office}';`),'1');
 assert.equal(sql(`SELECT cnpj FROM cjs_private.companies WHERE id='de000000-0000-4000-8000-000000000002';`),'00000000000191');
 const state=JSON.parse(sql(`SELECT state FROM cjs_private.drafts WHERE id='${draft}';`));
 assert.deepEqual(state,criarEstadoDemo());
 assert.equal(sql(`SELECT count(*) FROM cjs_private.audit WHERE draft_id='${draft}';`),'1');
 sql(`UPDATE cjs_private.drafts SET title='DEMO editado',revision=revision+1 WHERE id='${draft}';`);
 instalar();
 assert.equal(sql(`SELECT title||':'||revision FROM cjs_private.drafts WHERE id='${draft}';`),'DEMO editado:2');
 assert.throws(()=>instalar('test:editor-a'),/Admin global ativo/);
 assert.equal(sql(`SELECT count(*) FROM cjs_private.audit WHERE draft_id='${draft}';`),'2');
 // O editor de outro escritório não ganha vínculo por instalar a demonstração.
 assert.equal(sql(`SELECT count(*) FROM cjs_private.memberships WHERE office_id='${office}' AND user_id<>'${user}';`),'0');
 sql(`UPDATE cjs_private.offices SET name='Não sobrescrever' WHERE id='${office}';`);
 assert.throws(()=>instalar(),/Identificador DEMO/);
 assert.equal(sql(`SELECT name FROM cjs_private.offices WHERE id='${office}';`),'Não sobrescrever');
 console.log('OK: DEMO instalado com cinco colaboradores; idempotência, edição preservada, auditoria, identidade Admin e proteção de colisões.');
}
