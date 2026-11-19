# Planos por escritório (limite de empresas)

Controle comercial do Reescala por escritório contábil, gerenciado pelo Admin da plataforma em **/admin**.

## Regras

| Regra | Como funciona |
| --- | --- |
| Unidade | Empresa = **CNPJ completo** cadastrado no escritório. |
| Escritório sem plano | **Sem limite** (situação atual da CJS e da DEMO). |
| Ciclo | Mensal, a partir do **início do ciclo** do plano (ex.: dia 19 → 19/11 a 18/12). Dia 29–31 cai no último dia dos meses menores. |
| Vagas em uso | Empresas **ativas** sempre contam. Empresa **arquivada** no meio do ciclo continua contando até o fim dele; a vaga volta na renovação. |
| Nova empresa | Só é cadastrada (importação ou cadastro) se houver vaga livre no ciclo. |
| Colaboradores | Limite por empresa (padrão **50**). Acima dele, gerar, buscar ajustes, salvar e exportar ficam bloqueados. |
| Troca de quadro | Com mais de 3 nomes, se **mais da metade** for nova (ausente da base da empresa ou incluída nos últimos 30 dias), o uso pede confirmação. Somente **Gerente** (ou Admin) confirma; a confirmação consome **1 vaga extra** no ciclo e exige vaga livre. Operador vê o aviso e não continua. |
| Base do quadro | Guardada só como **hash** do nome normalizado (sem acento/caixa/pontuação) por empresa; nomes não são armazenados. Hash sem uso há 90 dias é descartado. Não depende de CTPS. |
| Aviso | A partir de 80% das vagas, o uso mostra “Uso do plano: X de Y”. |
| Plano suspenso | Bloqueia gerar, buscar ajustes, salvar e exportar em todo o escritório. |
| CNPJ travado | Após o primeiro uso (geração, salvamento etc.), só o Admin altera o CNPJ. A razão social continua editável pelo Gerente. |
| Empresa arquivada | **Somente visualização**: abrir e consultar preenchimentos; nada pode ser editado, gerado, salvo, excluído ou exportado. O Gerente arquiva e reativa (reativar exige vaga, salvo se a empresa já contou no ciclo). |
| DEMO | Escritório marcado como demonstração fica visível **somente para o Admin**, mesmo para quem tem vínculo. |

## Onde é conferido

- **Servidor/banco:** `cjs_api.plan_register_use` decide liberado / aviso / confirmar troca / bloqueado. A gravação (`/api/persistence`, `saveDraft`) confere o plano com os nomes do próprio preenchimento enviado, antes de salvar. Empresa arquivada também é barrada por trigger em `drafts`. Criação de empresa (`resolve_company`) respeita o limite.
- **Navegador (modo individual com servidor):** gerar, gerar proposta 5×2, buscar ajustes, salvar e baixar documentos exigem empresa do servidor selecionada e passam pela conferência. O preenchimento local fica apenas como cópia de segurança.
- **Documentos:** com empresa do servidor, o termo aditivo usa a razão social e o CNPJ cadastrados; o CNPJ da importação SCI vem preenchido e travado com o da empresa aberta.

## Painel Admin (/admin)

Página separada, acessível pelo menu lateral (**Painel Admin · Planos**) apenas para o Admin global. O HTML não contém dados; tudo vem de `/api/plans`, conferido no banco (`platform_admin`). Gerentes e operadores veem “Acesso restrito”; sessão compartilhada recebe 404.

- Indicadores: escritórios com plano, empresas ativas/arquivadas, vagas em uso, alertas.
- Lista com uso no ciclo, limite de colaboradores, renovação e alertas (≥ 80%, sem vagas, acima do limite, suspenso, trocas pendentes, bloqueios em 30 dias), busca e filtros.
- Por escritório: criar/editar plano (modelos Inicial 5, Profissional 15, Escritório 40, Plus 100 ou personalizado), suspender, remover (sem limite), conceder vaga extra no ciclo com motivo, marcar DEMO, empresas (CNPJ, travamento, arquivada, conta no ciclo, último uso, tamanho da base do quadro) e histórico.
- Atividade recente de todos os escritórios.

O Gerente vê no painel de salvamento “Uso do plano Inicial: X de Y empresas · renova em dd/mm” e o botão **Arquivar empresa / Reativar empresa**.

## Ativação no banco da VPS

Aplicar a migração **010_office_plans.sql** após 001–009:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/010_office_plans.sql -o /tmp/010_office_plans.sql
docker cp /tmp/010_office_plans.sql postgres_apps:/tmp/010_office_plans.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/010_office_plans.sql
```

A migração marca o escritório DEMO padrão (`de000000-0000-4000-8000-000000000001`) como demonstração, trava o CNPJ das empresas que já têm preenchimento salvo e notifica o PostgREST para recarregar o schema. Nenhum escritório recebe plano: todos continuam sem limite até o Admin criar um plano em /admin. Sem variável de ambiente, webhook ou configuração nova.

Antes da migração, o app continua funcionando sem limite (a API trata a ausência das funções como “sem plano”); o painel /admin informa que a migração 010 precisa ser aplicada.

## Validação

`database/tests/plans.sql` roda em banco descartável após `seed.sql` e confere 41 cenários (DEMO, limites, aviso, troca de quadro por perfil, cortesia, arquivamento, trigger, CNPJ travado, suspensão, remoção e ciclo mensal). Testes unitários em `tests/plans-api.test.cjs` e navegador em `tests/browser-planos.cjs`.
