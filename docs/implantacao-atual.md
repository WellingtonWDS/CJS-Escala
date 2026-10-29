# Registro de implantação — atualizado em 29/10/2026

Consultar este registro antes de orientar o operador. Distinguir código disponível, testes locais e resultados informados pelo operador. Não contém senhas, chaves ou identificadores pessoais.

## Atualização da faixa de almoço — 29/10/2026

Jornadas próximas de 8h (7h a 9h efetivas): sugestões de pausa entre 3h e 5h após a entrada, mantendo sua duração. Para 08h–18h com 2h de pausa, início entre 11h e 13h. Vale na redistribuição de pausas e nas sugestões de mudança de entrada/turno, inclusive noturnos. Outras durações mantêm a política anterior. Não altera os mínimos legais do art. 71 nem os horários atuais cadastrados; é critério do gerador. Regras `ec141-2026-10-29-10` exigem nova geração dos resultados, sem migração ou variável nova. Também aplicada na geração da proposta sem demanda operacional. Validação local: 501 testes unitários, build e navegador de ajustes de cobertura, conversão, escala fixa e cobertura aprovados.

## Correções posteriores de 29/10/2026 — seleção e intervalos

Seletor preservado na interação com scrollbar, altura fixa de 85dvh no modal, comparação com textos/colunas legíveis e remoção dos botões CSV. Intervalos: duração mínima do art. 71 preservada, teto geral de 2h validado, aviso preventivo para blocos contínuos acima de 6h e sugestões automáticas de pausa até quatro horas após entrada (política do gerador). Regras `ec141-2026-10-29-9` invalidam resultados antigos para nova geração, preservando cadastro; sem migração, RPC ou variável nova. 498 testes unitários, build e suíte completa de navegador aprovados localmente. Instalação depende do deploy, sem alteração direta na VPS.

## Entrega de 29/10/2026 — documentos PDF

Botões próprios para documento completo do empregador e ZIP com um PDF por colaborador, tanto na atual quanto na proposta e nos modos dinâmico/fixo. A4 paisagem, logo, empresa/período, horários/intervalos, folgas, função, resumo semanal e pendências; cobertura apenas no completo. Geração local independente da impressão, com jsPDF/AutoTable/fflate publicados pelo build (esbuild apenas para esse módulo de dependências). Sem migração SQL, nova variável, RPC ou mudança das regras de geração. Requer deploy do build atualizado. 496 testes unitários, build, suíte completa de navegador e downloads reais PDF/ZIP aprovados localmente; não confirma homologação no domínio público.

## Entrega de 28/10/2026 — modos dinâmico e fixo

Escolha inicial mensal dinâmica/fixa, referência jurídica do padrão, navegação/tutorial sem Feriados no fixo, validação semanal recorrente, cobertura/comparação por semana, intervalos sugeridos recorrentes, grade semanal, CSV fixo e impressão. Preenchimentos antigos continuam dinâmicos; feriados e parâmetros mensais são preservados. Eventos datados e admissão não são aplicados ao padrão; ciclos 12×36 e apurações coletivas por datas ficam no dinâmico. A edição de status/horários nos cards já está disponível nos dois modos: por data na dinâmica, por dia da semana em todo o padrão fixo. Resumo semanal compartilhado com cores e desfazer da última edição recorrente.

Não exige nova migração SQL nem variável de ambiente. `modeloEscala` e `dataReferenciaFixa` usam o JSONB existente (`schema_version=1`). Regras `ec141-2026-10-28-8` exigem nova geração de resultados antigos. A entrega depende do deploy do código; validações locais não comprovam homologação no domínio público. Quadro diário e novos documentos por público permanecem no planejamento.

### Referências publicadas na main em 28/10/2026

| Referência | Entrega |
| --- | --- |
| `221ebd9` | Modo fixo recorrente, referência jurídica, cobertura e comparação semanal, CSV próprio e persistência dos novos campos no JSON existente. |
| `f4e1bba` | Edição de status/entrada/intervalo/saída nos dois modos, recorrência e desfazer no fixo, resumo semanal unificado e CSV com pausas editadas. |
| `e22bdca` | Conversão 5×2 com busca sem cobertura, planos por perfil, desempate por déficit, ACT/CCT por data, janelas/pausas antes da distribuição e aviso de pesquisa parcial. |

Validação funcional mais recente: **493 testes unitários**, build e suíte completa de navegador aprovados localmente na revisão do motor. Inclui nove testes novos com matriz de 24 combinações. Simulação local de 100 colaboradores sem cobertura: 1.200 avaliações, pesquisa parcial sinalizada, sem erros objetivos ou déficit semanal; cobertura não avaliada. A integração PostgreSQL 17/PostgREST 14.15 com navegador foi executada na entrega do modo fixo, incluindo salvar/reabrir por RPC; não foi repetida nas mudanças posteriores de edição/cálculo, sem alteração de API ou schema. A atualização documental não é uma nova execução das suítes.

Para usar as correções, após o deploy gere novamente as escalas atuais/propostas antigas. Cadastros e preenchimentos permanecem preservados; não é necessário recriar banco, contas ou empresas. Envio à `main` não confirma sozinho o sucesso do deploy ou a homologação no domínio público. Detalhes: [revisão de precisão](auditorias/precisao-5x2-2026-10-28.md).

## Estado vigente

- Hospedagem permanece na Vercel, com publicação automática da `main`. O proprietário informou o novo domínio público **https://reescala.fintria.com.br**; `cjs-escala.vercel.app` é o endereço anterior. A troca do domínio não representa migração para a VPS. Uma alteração de variável exige novo deployment.
- Após a troca de domínio, o proprietário relatou **Origem inválida**. O código valida o cabeçalho `Origin` contra a origem reconstruída com `APP_ORIGIN`. Orientado atualizar `APP_ORIGIN=https://reescala.fintria.com.br` em Production e refazer o deploy. O valor real do ambiente e o sucesso após essa correção ainda não foram confirmados neste registro.
- Login individual pela aplicação **confirmado pelo operador** após corrigir o relógio de verificação do token (`6309a5a`). A tela de e-mail/senha já está ativa; não orientar novamente a configuração inicial de login.
- Operador utilizou seleção de empresa e salvamento de rascunho; relatou lista com apenas um item. Correção `d0679db` recarrega a lista sem esconder outros rascunhos. Testada localmente; aguarda confirmação específica em produção.
- A proposta de página secreta `/admin.html` com senha adicional (`7baa2d3`) foi **substituída a pedido do usuário**. Não configurar ADMIN_USER_IDS nem ADMIN_PASSWORD_HASH. O código atual não lê essas variáveis.
- Novo modelo: menu lateral dentro do sistema, nome e perfil; Operador acessa suas empresas, Gerente gera escalas e gerencia usuários no escritório, Admin tem acesso global. Não há senha adicional nem página separada. Gerente não cria Admin e não edita empresas de outro escritório. Admin/gerentes podem criar Gerentes nos escritórios autorizados; alteração de empresas vale para Operadores.
- O proprietário deve ser promovido explicitamente usando o **identity_subject informado no chat**. Esse ID é do provedor de login, não o UUID interno de cjs_private.users. Não presumir que o vínculo antigo membership.admin já seja Admin global: ele agora representa Gerente.

## Histórico de entregas de código — 27/10/2026

| Referência | Entrega |
| --- | --- |
| `373c51e` | Carregamento imediato na geração atual/proposta, cálculo em Worker, bloqueio de duplicação e descarte de resultado obsoleto; retorno de Buscar ajustes em modal antes da mensagem/prévia abaixo do botão, inclusive sem sugestões e em erro. |
| `228dd18` | Modal Empresa atual e Preenchimentos com 85% da largura no desktop; celular com uma coluna e margens reduzidas. |
| `e9d5d9d` | Quatro empresas DEMO por segmento, onze preenchimentos e instalador independente/idempotente; casos de cobertura, readequação e contratação. |
| `2cd31cb` | Limites de tamanho das logos também no HTML/CSS antigo e instalador do DEMO original com cinco colaboradores. |
| `7d0c1e3` | Nome e logos oficiais Reescala no sistema, impressão e ícones; publicação da pasta logos e imagens necessárias ao login acessíveis sem sessão. |
| `e40dc9b` | Ficha de colaboradores simplificada e ajuda contextual por mouse/teclado/toque; validações e dados importados preservados. |

Validação registrada em **27/10/2026**: **460 testes unitários**, build, suíte completa de navegador e integração PostgreSQL 17/PostgREST 14.15 com navegador real **locais** aprovados, na entrega `373c51e`. Esse número é histórico; a validação mais recente está na entrega de 28/10 acima. As entregas dessa data não acrescentaram migrações após a 008. Execução dos instaladores DEMO na VPS ainda não foi confirmada; não presumir que as empresas já estejam cadastradas.

Guias atuais: [interface](interface.md), [DEMO original](empresa-demo.md), [DEMO por segmento](cenarios-demo-segmentos.md). Nos exemplos, a entidade mista 12×36/administrativo tem prévia atual; a conversão automática continua limitada aos grupos 6×1 compatíveis.

A escala fixa sem calendário foi implementada em **28/10/2026**. Quadro diário e documentos completos/individuais continuam **planejados, sem implementação**: [escopo e critérios](planos/evolucao-escalas.md).

## Entrega anterior — horários, compensação e intervalos (27/10/2026)

Implementados horários individuais para cadastro manual/CSV via perfil compartilhado com a Domínio. Normalização aceita Entrada/Saída sem pausa ou Entrada/primeiro fim com os dois últimos vazios, preservando meia-noite e legado zerado. Sábado Compensado tem disponibilidade opcional de reposição; perfil conta o dia como compensável, sem crédito de trabalho/abono fictício. Geração usa apenas o saldo até o alvo, respeitando janela, bloqueios, pausas, limite diário, 11h de descanso e sequência de trabalho. Referência atual preserva reposição parcial; proposta não amplia a janela de sábado e não inventa disponibilidade ausente. Descansos Compensado em ciclos importados mantêm a interpretação de folga.

Checkbox explica manutenção do contrato versus estimativa; divergência aparece na ficha. Manual/CSV até 44h; referências acima disso geram erro e bloqueiam conversão. Horários físicos importados são preservados para diagnóstico. Compensado não substitui fundamento de compensação nem suprime excessos/erros legais.

Nova busca limitada de intervalos na geração da proposta: mantém entrada/saída, horas, duração da pausa, função/dias, não piora outras lacunas, preserva origem e dias manuais. Intervalos sinalizados na grade/comparação e CSV. A busca de ajustes também inclui pausas e deduplicação considera seus horários. Ciclos/12×36 e créditos específicos permanecem fora desse ajuste automático.

Versão de regras ec141-2026-10-27-6 invalida resultados antigos; dados de cadastro/configuração são preservados. Sem migração nova ou variável. Guia: [horários individuais](horarios-individuais.md). A aplicação da migração 008 da entrega de Usuários segue sem confirmação explícita na VPS.

Validação concluída: 445 testes unitários, build, suíte completa de navegador e integração PostgreSQL 17/PostgREST 14.15 com navegador real aprovados. Novos cenários cobrem meio período, cadastro manual individual, confirmação/estimativa/mismatch, teto 44h, sábado compensado 9/9/9/9/8h, reposição integral/parcial/sem disponibilidade, feriados, bloqueios, 11h após turno noturno, pausas mínimas, janela curta na proposta, importação de compensado sem quebrar ciclos, escalonamento com/sem solução, CSV e preservação de origem/dias manuais. Um timeout intermitente de sincronização de rolagem ocorreu na primeira suíte, passou isoladamente e na suíte completa final; não se alterou a rolagem nem se relaxaram suas asserções.

## Entrega anterior — remoção do comparativo da etapa 7 (27/10/2026)

Removida toda a seção Comparar as três referências, seu botão/resultado e o módulo de UI transicao.js, incluindo registro de eventos e limpeza de resultado no app. O tutorial não sugere mais essa ação. A etapa 7 conserva orientações e linha do tempo; conversão e comparação de origem/proposta na etapa 8 são preservadas. Não altera regras de cálculo, dados, APIs ou banco.

Build, 436 testes unitários e suíte completa de navegador aprovados, incluindo abertura da etapa 7 sem comparativo, geração, edição, conversão, importações, tutorial, modais e layout responsivo. Nenhuma migração ou variável nova.

## Entrega anterior — tutorial arrastável (27/10/2026)

Janela do tutorial arrastável pelo cabeçalho via Pointer Events e captura de ponteiro (mouse/toque). Texto do corpo continua rolável; botões não iniciam arraste. Posição manual preservada entre etapas, limitada à viewport e reajustada em resize. Cabeçalho focável aceita setas, participa da contenção de Tab e tem indicação visual/instrução. Fechar encerra o arraste e reabrir restaura posicionamento automático. Não altera geração, dados nem registro de visitas.

Validação: build e 436 testes unitários passaram; teste de tutorial em Chromium passou com arraste de mouse, toque real via CDP, setas/Tab/Escape, nove etapas em 1366/390/320px, limites, fechamento/reabertura, resize e preservação de dados/escala. Nenhuma migração ou variável nova.

## Entrega anterior — revisão de interface (27/10/2026)

Revisão de UI/UX autorizada sem alterar funcionalidades: nova camada interface.css, cabeçalho branco, navegação lateral com ícones SVG, etapas, cartões, campos/botões, cadastros, seleção de empresa, salvamento, modais e grade. Login com linguagem visual correspondente. Controles maiores no celular, fonte de formulário de 16px, foco visível e trilhos de toggle com input transparente ocupando a área clicável. CSS visual principal restrito à tela para conservar impressão. Regras de escala, dados, APIs e permissões não foram alterados.

Tailwind 3.4.19 agora é dependência de desenvolvimento fixada; compilado pelo build, sem script de CDN no HTML. Paleta em tailwind.config.cjs, entrada utilities-source.css; utilities.css gerado/ignorado no repositório e copiado ao dist. npm run dev prepara os estilos via predev. Google Fonts permanece opcional com fallback. Sem migração nova ou variável. A migração 008 da gestão de usuários segue sem confirmação explícita na VPS.

Validação local concluída: 436 testes unitários, build, suíte completa de navegador, autenticação compartilhada e integração com PostgreSQL 17/PostgREST 14.15 em navegador real passaram. Nova regressão verifica oito etapas em 320/375/768/1440px, estilos locais, contraste de cabeçalho, impressão e login móvel. Conferência visual em login, configuração, jornada, cadastros e edição em desktop/celular. Corrigidos alvos de toque/foco dos toggles e colunas de datas/horários nas restrições expandidas para não alargar a página móvel. Guia: [interface](interface.md).

## Entrega anterior — Usuários (27/10/2026)

Unificadas Criar novo usuário e Acessos dos operadores em **Usuários**: lista ativos/inativos, pesquisa por nome/e-mail/escritório, filtro de escritório, novo cadastro e edição de nome/e-mail/perfil/situação/empresas no mesmo painel. Admin vê todos (incluindo contas sem vínculo); Gerente vê apenas vínculos do escritório e não edita Admin; Operador não entra na gestão. Gerente pode editar outro Gerente do mesmo escritório. Cadastro existente não troca senha.

Migração **008_users_directory.sql** necessária; instalador verifica 003–008. Aplicação na VPS ainda não confirmada. Guia atualizado: [administração de usuários](administracao-usuarios.md). Sem nova variável ou webhook. Situação local é membership.active; Admin também controla users.active global, revogando sessões ao inativar. Próprio perfil/acesso não podem ser retirados. Nome/e-mail de contas multi-escritório são somente leitura para Gerentes; perfil/situação/empresas são editáveis no vínculo autorizado. Consulta legada não vira editor sem mudança explícita de perfil. Revisão por usuário impede sobrescrita e a auditoria não guarda senha/hash. O caminho legado de atualizar empresas também participa da revisão.

Validação local concluída: 436 testes unitários, build, suíte completa de interface e integração PostgreSQL 17/PostgREST 14.15 com navegador real passaram. Inclui isolamento de escritórios, Operador sem gestão, edição atômica de nome/e-mail sem trocar senha, duplicidade, perfil, Consulta legada preservada, conta compartilhada, ativação/inativação local e global, sessões revogadas, concorrência, auditoria sem credenciais e criação. Interface testada com pesquisa, filtros, edição, empresas, toggles, cancelamento e conflito; conferência visual em desktop/celular, sem nomes comprimidos ou rolagem horizontal. Estes resultados não comprovam implantação remota.

## Entrega anterior — nomes, saída e seleção de empresa (27/10/2026)

Novos preenchimentos e sugestões de cópia incluem data/hora local com segundos no nome automático, mantendo o limite de 160 caracteres. Nomes já salvos e edição manual são preservados. No modo individual, Sair passa ao rodapé do menu lateral, com ícone/nome acessível no menu recolhido; o modo compartilhado sem menu mantém a saída disponível.

Em Empresa atual e Preenchimentos, a busca externa e o select visível foram substituídos por um único seletor com lista e busca internas. Filtra razão social sem distinguir acentos/caixa e CNPJ com/sem pontuação, sem incluir a seleção atual artificialmente nos resultados. A busca não seleciona sozinha; clique ou setas/Enter confirmam. Escape fecha primeiro a lista, Tab e clique externo encerram sem mudar o UUID. Select interno oculto mantém contrato da persistência, e a lista respeita bloqueio durante operações. Cadastro administrativo mantém seu seletor atual.

Não requer nova migração, variável ou alteração no n8n. A migração 007 da exclusão continua pendente de confirmação na VPS. Validação local concluída: 436 testes unitários, build, suíte completa de interface e integração PostgreSQL 17/PostgREST 14.15 com navegador real passaram. Conferidos nomes datados, preservação de nomes existentes, cópia, busca sem resultados/por acentos/CNPJ, seleção explícita por teclado, Escape, ausência de controles duplicados visíveis, posição de Sair e menu recolhido. Conferência visual realizada em desktop e celular.

## Entrega anterior — exclusão de preenchimentos (27/10/2026)

Implementada **Excluir preenchimento selecionado** na janela Empresa atual e Preenchimentos. Operadores com acesso de escrita, Gerentes e Admin podem excluir registros autorizados. Confirmação mostra título/empresa e alcance para os colegas. Revisão desatualizada bloqueia; repetição após falha de rede é segura. Excluir o aberto limpa apenas seu cache/contexto neste navegador e fecha o preenchimento; excluir outro preserva o aberto. Envio pendente do aberto precisa ser concluído antes. Histórico interno/auditoria ficam preservados, sem restauração pela interface.

Migração **007_delete_drafts.sql** necessária; instalador agora verifica 003–007. Não foi aplicada automaticamente na VPS. Não presumir 003–006 executadas: o [guia de exclusão](exclusao-preenchimentos.md) contém instalador para banco com 001/002 já confirmadas. Nenhuma variável ou webhook novo. A exclusão bloqueia consulta, versões, atualização e repetição de salvamento antigo. Cópias locais já vistas por colegas não são apagadas remotamente; salvar após exclusão retorna erro e permite somente cópia explícita com novo ID.

Validação local: 436 testes unitários, build, suíte completa de interface e integração PostgreSQL 17/PostgREST 14.15 com navegador real passaram. Inclui permissões, leitura legada sem escrita, concorrência, sessão revogada, auditoria única, histórico preservado, cancelamento, resposta perdida na rede, exclusão atual/selecionada e salvamento de cópia após exclusão por colega. Implantação de banco remoto continua dependendo do operador.

## Entrega anterior — Empresa atual e Preenchimentos

Nome atual da seção/menu: **Empresa atual e Preenchimentos**. Os botões frequentes saíram da janela: barra fixa inferior nas etapas mostra empresa (razão social/CNPJ), escritório, nome e **Salvar preenchimento** / **Salvar uma cópia**. Cópia pede nome e preserva o original. A janela só escolhe/abre a empresa e o preenchimento, com CTA visível no rodapé; recuperação/importação de dados antigos fica recolhida. Não orientar mais a abrir a janela para salvar nem usar os rótulos Abrir seleção/Salvar como novo.

Salvar usa workspace.context(), não uma seleção ainda não aberta. Selecionar outra empresa/preenchimento não sobrescreve o nome na barra. Cancelar preserva o contexto atual. A barra trata envio pendente com Concluir salvamento, desabilita cópia até resolver, informa alterações locais e só confirma sucesso após o servidor. Esquema/API de rascunhos, revisão, idempotência, cache por usuário e permissões por empresa não mudaram.

Testes locais: 434 unitários, build, suíte completa de interface, novo teste da barra em desktop/celular e integração individual PostgreSQL/PostgREST com repetição de envio, conflito, recuperação, empresas e perfis passaram. Sem migração nem variável nova para esta entrega. Migração 006 da funcionalidade anterior segue sem confirmação explícita do operador.

## Atualização de interface — carregamento e animações

Pedido atual: tela de carregamento nas operações demoradas, fundo escurecido e animação central fluida; animações nas janelas. Entrega usa loading.js/motion.js/motion.css e os aria-busy dos fluxos de cadastro/rascunho, login, importação e workers. Confirmações suspendem o overlay para não bloquear respostas; buscas canceláveis mantêm Cancelar busca na tela. Fluxos liberam o loading em sucesso/erro/cancelamento e leituras de arquivos descartadas limpam seu marcador. Entrada/saída dos modais, login/painéis/tutorial e menu recebem animações; preferência de movimento reduzido é respeitada.

Validado localmente: 434 unitários, build, suíte completa de interface incluindo teste específico de loading (requisição lenta/falha, duplicação, concorrência, confirmação, cancelamento, celular e movimento reduzido), login compartilhado e integração individual PostgreSQL/PostgREST com navegador real. Revisão visual local realizada. Não há nova migração nem variável para esta entrega; Vercel publica a main. A ativação da migração 006 da entrega de escritórios/edição de empresas continua sem confirmação explícita do operador; não misturar as duas etapas nem repetir configuração inicial de login.

## Atualização de interface — modais

Pedido seguinte do usuário: substituir alert/confirm/prompt nativos por modais com o estilo do sistema. Implementado componente compartilhado em assets/js/ui/dialogs.js, fila por documento, cancelamento sem mutação, foco e teclado. Confirm/prompt são assíncronos: calendário, limpeza e operações de rascunho aguardam a resposta. Editor do dia oferece select de status e campo de horas, com proteção se a escala mudar enquanto a pergunta estiver aberta. A sessão também usa o componente no aviso de logout sem confirmação remota.

Validação local: 434 testes unitários, build, suíte completa de interface, teste dedicado de modais (fila, Escape/Enter, texto seguro, foco, janela sobreposta e celular), login compartilhado e integração individual com PostgreSQL/PostgREST passaram. A troca de modais não requer migração nova nem variável. A entrega anterior de edição/criação de escritórios foi enviada à main em c5c4744, mas a migração 006 na VPS ainda não foi confirmada pelo operador. Ao responder, distinguir a interface nova da ativação do banco pendente e explicar que compartilhar escalas ainda exige Salvar manualmente.

## Entrega anterior — edição, escritórios e compartilhamento

Nova entrega: Gerente/Admin editam razão social/CNPJ das empresas autorizadas sem mudar ID/escritório, preservando rascunhos e permissões. Conflito entre edições e CNPJ duplicado são bloqueados, com auditoria. Admin cria novos escritórios no menu; Gerente/Operador não têm essa operação. Requer migração 006; não afirmar que já foi aplicada na VPS.

Conferido e testado: rascunhos são por empresa, sem filtro de criador. Dois Operadores diferentes abriram e atualizaram o mesmo rascunho com escala gerada, conflito de revisão e revogação conferidos em PostgreSQL/PostgREST e navegador locais. Salvamento continua manual. Salvar atualiza o aberto; Salvar como novo cria outro planejamento selecionável. Histórico interno não tem interface para versões anteriores. Explicar esses limites ao operador, sem prometer autosave.

Instalador atual inclui 003–006. Se todas as anteriores já foram aplicadas, executar só a 006 uma vez. Caso o estado ainda não esteja confirmado, executar o instalador atualizado com todas essas migrações disponíveis. Não há nova variável ou webhook. Guia: [cadastro de empresas](cadastro-empresas.md).

## Próxima ação na infraestrutura

1. Conferir a origem do domínio novo em `APP_ORIGIN`/Production e refazer o deployment; validar login, salvamento e administração em `reescala.fintria.com.br`. O login individual já foi confirmado anteriormente: não orientar a recomeçar o provisionamento inicial.
2. Para funcionalidades administrativas ainda não homologadas, conferir as migrações **003–008** e a promoção explícita do proprietário. O instalador `enable-user-management.sql` verifica todas elas; disponibilizar os arquivos 003, 004, 005, 006, 007, 008 e `promote-platform-admin.sql`, conforme [administração de usuários](administracao-usuarios.md). Não tratar somente a 005 como suficiente para o código atual. Não há confirmação explícita de execução de todas as migrações remotas neste registro.
3. Para ativar os exemplos, executar os instaladores administrativos dos guias [DEMO original](empresa-demo.md) e [cenários por segmento](cenarios-demo-segmentos.md). São testados localmente e não executados automaticamente na VPS. Os dois preservam os dados já instalados/alterados e não concedem acesso a Operadores de outros escritórios.
4. Conferir Usuários, cadastro/edição/importação por CNPJ, seleção de empresa e preenchimentos compartilhados, cópia/exclusão e conflito de revisão após o deploy. A validação local não confirma a homologação remota.

Não configurar novamente ADMIN_USER_IDS/ADMIN_PASSWORD_HASH nem a antiga página secreta: a administração usa o menu lateral por perfil. A troca do domínio público não exigiu alteração de código de origem, credenciais n8n ou schema; a variável e o novo deployment continuam sujeitos à configuração do operador.

A importação identifica CNPJ no escritório escolhido. Operador só utiliza cadastro autorizado; Gerente/Admin confirmam cadastro novo ou vínculo a cadastro legado sem documento, quando há nome único equivalente. Cancelamento preserva o estado; outra empresa inicia preenchimento separado. Cadastro da empresa é remoto; os colaboradores exigem salvar o preenchimento. Sem CNPJ válido, a vinculação remota é bloqueada; importação compartilhada/local continua disponível.

## Infraestrutura confirmada pelo operador

- PostgreSQL 17.10 em postgres_apps, banco dedicado cjs_escala; migrações 001/002 executadas. Aplicação da 003 isolada não foi confirmada, por isso o instalador verifica sua presença.
- PostgREST 14.15 dedicado, rede Docker privada; API HTTPS `https://api.fintria.com.br/escala`. Sem sessão, check_session retorna 401 via Caddy.
- public.users criada administrativamente no banco dedicado; hashes bcrypt. Credencial cjs_identity_reader consulta apenas as colunas necessárias no login n8n; teste de conexão aprovado.
- Primeira identidade, escritório, vínculo e empresa confirmados por consulta. Mínimo de senha de usuário: 6 caracteres. Sem cadastro público.
- Workflow de login publicado em `https://n8n.fintria.com.br/webhook/auth/cjs-login`; teste HTTP 200/success/token passou, seguido de login real pela aplicação confirmado.
- Frontend permanece na Vercel. Migração de hospedagem para VPS não executada.

## Limites e pendências preservados

- Rotação da chave de RPC anteriormente exposta ainda não foi confirmada explicitamente; nunca registrar ou pedir seu valor.
- O cadastro e o vínculo de CNPJ são oferecidos desde a migração 005. O conteúdo atual do cadastro remoto não foi consultado neste ambiente; não presumir atualização automática a partir de valores informados no chat.
- Rascunhos exigem salvar manualmente. **Salvar preenchimento** atualiza o aberto; **Salvar uma cópia** cria outro. Não há sincronização automática nem painel de histórico.
- Não há edição de senha, convites, exclusão definitiva de contas ou edição de escritório na nova gestão. Vínculos legados de consulta conservam restrição de escrita.
- Permissões do servidor são autoritativas; retirada de acesso não apaga caches já vistos no navegador. Novas aberturas conferem acesso.

## Histórico técnico essencial

- 1118045: base de persistência e isolamento por escritório.
- 4b1cd59: login individual, sessões e interface de empresas/rascunhos.
- 7cb692f: template n8n com JWT nativo.
- 7b3337e: diagnóstico seguro da API Vercel. Falha request-url investigada; operador ajustou configuração e abriu a tela individual.
- 6309a5a: relógio consultável na validação do token; login real confirmado depois.
- d0679db: correção da lista de rascunhos após salvar.
- 7baa2d3: página secreta, agora substituída pelo menu e perfis do banco.

SQL administrativo informado no chat não se torna automaticamente migração executada. Não declarar implantação confirmada sem retorno do operador; nunca repetir etapas concluídas por perda de contexto.
