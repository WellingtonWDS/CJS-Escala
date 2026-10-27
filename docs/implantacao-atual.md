# Registro de implantação — 26/10/2026

Consultar este registro antes de orientar o operador. Distinguir código disponível, testes locais e resultados informados pelo operador. Não contém senhas, chaves ou identificadores pessoais.

## Estado vigente

- Vercel publica automaticamente a main em `https://cjs-escala.vercel.app`. Uma alteração de variável ainda exige novo deployment.
- Login individual pela aplicação **confirmado pelo operador** após corrigir o relógio de verificação do token (`6309a5a`). A tela de e-mail/senha já está ativa; não orientar novamente a configuração inicial de login.
- Operador utilizou seleção de empresa e salvamento de rascunho; relatou lista com apenas um item. Correção `d0679db` recarrega a lista sem esconder outros rascunhos. Testada localmente; aguarda confirmação específica em produção.
- A proposta de página secreta `/admin.html` com senha adicional (`7baa2d3`) foi **substituída a pedido do usuário**. Não configurar ADMIN_USER_IDS nem ADMIN_PASSWORD_HASH. O código atual não lê essas variáveis.
- Novo modelo: menu lateral dentro do sistema, nome e perfil; Operador acessa suas empresas, Gerente gera escalas e gerencia usuários no escritório, Admin tem acesso global. Não há senha adicional nem página separada. Gerente não cria Admin e não edita empresas de outro escritório. Admin/gerentes podem criar Gerentes nos escritórios autorizados; alteração de empresas vale para Operadores.
- O proprietário deve ser promovido explicitamente usando o **identity_subject informado no chat**. Esse ID é do provedor de login, não o UUID interno de cjs_private.users. Não presumir que o vínculo antigo membership.admin já seja Admin global: ele agora representa Gerente.

## Atualização vigente — nomes, saída e seleção de empresa (27/10/2026)

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

## Atualização mais recente — edição, escritórios e compartilhamento

Nova entrega: Gerente/Admin editam razão social/CNPJ das empresas autorizadas sem mudar ID/escritório, preservando rascunhos e permissões. Conflito entre edições e CNPJ duplicado são bloqueados, com auditoria. Admin cria novos escritórios no menu; Gerente/Operador não têm essa operação. Requer migração 006; não afirmar que já foi aplicada na VPS.

Conferido e testado: rascunhos são por empresa, sem filtro de criador. Dois Operadores diferentes abriram e atualizaram o mesmo rascunho com escala gerada, conflito de revisão e revogação conferidos em PostgreSQL/PostgREST e navegador locais. Salvamento continua manual. Salvar atualiza o aberto; Salvar como novo cria outro planejamento selecionável. Histórico interno não tem interface para versões anteriores. Explicar esses limites ao operador, sem prometer autosave.

Instalador atual inclui 003–006. Se todas as anteriores já foram aplicadas, executar só a 006 uma vez. Caso o estado ainda não esteja confirmado, executar o instalador atualizado com todas essas migrações disponíveis. Não há nova variável ou webhook. Guia: [cadastro de empresas](cadastro-empresas.md).

## Próxima ação na infraestrutura

Nova entrega solicitada: retirar Imprimir/PDF do cabeçalho (impressão da geração/navegador preservada), recolher/expandir menu com preferência local, cadastro de empresas por razão social/CNPJ para Gerente/Admin, seletores/busca por ambos e resolução da empresa no importador Domínio.

1. Aplicação da migração 004 e promoção do proprietário ainda não foram confirmadas explicitamente no chat. Não presumir que foram executadas. A nova migração 005 acrescenta CNPJ nullable, unicidade por escritório, validação numérica/alfanumérica, resolução/cadastro e auditoria.
2. Operador pode executar a versão atual de enable-user-management.sql com identidade do proprietário, tendo os arquivos 003, 004, 005, **006** e promote-platform-admin.sql disponíveis. Ela verifica o que falta e promove somente a conta explicitamente informada. Se 001–004 já estiverem aplicadas, executar somente a 005 uma vez também é suficiente.
3. Não há novas variáveis privadas nem alteração de n8n. ADMIN_USER_IDS/ADMIN_PASSWORD_HASH antigos podem ser removidos. Aguardar deployment e recarregar.
4. Homologar cadastro/busca e importação na VPS real. Os testes locais passaram: 434 unitários, navegação/impressão e importação local, navegador com PostgreSQL/PostgREST para perfis/cadastro/busca, duplicidade concorrente e troca de contexto sem mistura. Esses resultados não confirmam implantação remota.

A importação identifica CNPJ no escritório escolhido. Operador só utiliza cadastro autorizado; Gerente/Admin confirmam cadastro novo ou vínculo do CNPJ a cadastro antigo sem documento e nome único equivalente. Cancelamento preserva o estado. Outra empresa inicia preenchimento separado. Cadastro da empresa é remoto, mas colaboradores ainda exigem salvar o rascunho. Sem CNPJ válido, bloqueia vinculação remota; importação compartilhada/local segue disponível sem banco.

Guias vigentes: [administração de usuários](administracao-usuarios.md) e [empresas e Domínio](cadastro-empresas.md). Não orientar mais o fluxo da página secreta.

## Infraestrutura confirmada pelo operador

- PostgreSQL 17.10 em postgres_apps, banco dedicado cjs_escala; migrações 001/002 executadas. Aplicação da 003 isolada não foi confirmada, por isso o instalador verifica sua presença.
- PostgREST 14.15 dedicado, rede Docker privada; API HTTPS `https://api.fintria.com.br/escala`. Sem sessão, check_session retorna 401 via Caddy.
- public.users criada administrativamente no banco dedicado; hashes bcrypt. Credencial cjs_identity_reader consulta apenas as colunas necessárias no login n8n; teste de conexão aprovado.
- Primeira identidade, escritório, vínculo e empresa confirmados por consulta. Mínimo de senha de usuário: 6 caracteres. Sem cadastro público.
- Workflow de login publicado em `https://n8n.fintria.com.br/webhook/auth/cjs-login`; teste HTTP 200/success/token passou, seguido de login real pela aplicação confirmado.
- Frontend permanece na Vercel. Migração de hospedagem para VPS não executada.

## Limites e pendências preservados

- Rotação da chave de RPC anteriormente exposta ainda não foi confirmada explicitamente; nunca registrar ou pedir seu valor.
- O CNPJ informado no chat não foi gravado automaticamente. A entrega 005 passa a oferecer o campo e vínculo confirmado a cadastro antigo via importação/cadastro, após aplicar a migração.
- Rascunhos exigem salvar manualmente. Salvar atualiza o aberto; Salvar como novo cria outro. Não há sincronização automática nem painel de histórico.
- Não há edição de senha, convites, exclusão de contas, alteração de perfil existente ou edição de escritório na nova gestão. Vínculos legados de consulta conservam restrição de escrita.
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
