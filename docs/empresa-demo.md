# Escritório e empresa DEMO

Dados fictícios para experimentar o Reescala: escritório **DEMO**, **Empresa Demo — FICTÍCIA**, CNPJ sintético `00.000.000/0001-91`, e um preenchimento com cinco colaboradores. Não é necessário criar usuário/senha novos: o instalador vincula o Admin global existente ao escritório de testes. Outros operadores não ganham acesso automaticamente; outros Admins globais mantêm o acesso previsto por seu perfil.

Para mais atividades e cenários de readequação/contratação, veja [quatro empresas por segmento e onze modelos](cenarios-demo-segmentos.md). Eles são adicionados ao mesmo escritório sem alterar este exemplo.

## Instalar na VPS

Requer as migrações 001–008 aplicadas no banco `cjs_escala` e identidade de Admin global ativo. A execução precisa ocorrer no servidor do banco, pois o ambiente de desenvolvimento não possui conexão administrativa com a VPS. Não há RPC pública de provisionamento.

```bash
curl --fail --show-error --location \
  https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/demo/install.sql \
  --output /tmp/reescala-demo.sql

docker exec -i postgres_apps psql -U postgres -d cjs_escala \
  -v ON_ERROR_STOP=1 \
  -v identity_subject=582f53bf-1918-44e9-9fe1-5cb6699f5058 \
  < /tmp/reescala-demo.sql
```

A identidade acima é a do proprietário informado na implantação, não seu UUID interno de `cjs_private.users`. O comando deve terminar mostrando escritório, empresa, preenchimento, **5 colaboradores** e revisão. Atualize a página, abra **Empresa atual e Preenchimentos**, escolha **DEMO**, a empresa e o preenchimento **DEMO — 5 colaboradores · 6×1 → 5×2**, e clique em abrir. Vá à etapa 8 para gerar ou converter.

## Cenário preenchido

- Escala atual: outubro de 2026, modelo 6×1, 44h, descanso aos domingos.
- Segunda a sexta: 08h–18h, intervalo de 11h–13h (8h efetivas); sábado: 08h–12h, sem intervalo (4h).
- Três atendentes e dois supervisores, com nomes e dados fictícios.
- Cobertura: um atendente e um supervisor, de segunda a sexta, 09h–11h e 14h–17h. Não há demanda mínima cadastrada no sábado.
- Proposta: fevereiro de 2028, fase automática de 40h já consolidada, folgas fixas no sábado/domingo. O quadro é suficiente nas faixas cadastradas. A referência de outubro e o destino são fixos para tornar os testes repetíveis.
- Feriados nacionais seguem o sistema; sem autorizações coletivas fictícias, restrições individuais ou exceções especiais. Pendências jurídicas que o sistema produzir continuam visíveis.
- Os resultados ficam inicialmente vazios: clique para gerar e testar os cálculos atuais, sem carregar uma escala certificada ou antiga.

Para testar lacunas, adicione demanda aos sábados e mantenha a proposta com sábado/domingo de folga. Para preservar o exemplo original, use **Salvar uma cópia** antes de alterar os dados.

## Reexecução e manutenção

O SQL usa IDs reservados e uma transação; não modifica outros escritórios/empresas. Reexecutar não duplica registros e não sobrescreve o preenchimento editado. Nome/contexto divergente ou preenchimento excluído gera erro e rollback, sem ressuscitar dados. Histórico e auditoria do preenchimento são gerados pelos triggers existentes; novos cadastros também ficam registrados.

O estado fonte está em `database/demo/state.mjs`. Após alterá-lo, execute `node scripts/gerar-demo.mjs` para atualizar `database/demo/install.sql` a partir do template. Isso atualiza o instalador para novas instalações; não altera dados já salvos na VPS. Os arquivos administrativos não entram no build estático.

Validação local: geração atual e proposta, cargas 44h/40h, cobertura suficiente e insuficiente, restauração no navegador, instalação/reexecução em PostgreSQL/PostgREST, preservação de edições, auditoria, Admin obrigatório e colisões de ID. A aprovação local não comprova execução remota.
