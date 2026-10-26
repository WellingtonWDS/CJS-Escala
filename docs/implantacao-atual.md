# Registro de implantação — 26/10/2026

Consultar este registro antes de orientar o operador. Distinguir código disponível, testes locais e resultados informados pelo operador. Não contém senhas, chaves ou identificadores pessoais.

## Estado vigente

- Vercel publica automaticamente a main em `https://cjs-escala.vercel.app`. Uma alteração de variável ainda exige novo deployment.
- Login individual pela aplicação **confirmado pelo operador** após corrigir o relógio de verificação do token (`6309a5a`). A tela de e-mail/senha já está ativa; não orientar novamente a configuração inicial de login.
- Operador utilizou seleção de empresa e salvamento de rascunho; relatou lista com apenas um item. Correção `d0679db` recarrega a lista sem esconder outros rascunhos. Testada localmente; aguarda confirmação específica em produção.
- A proposta de página secreta `/admin.html` com senha adicional (`7baa2d3`) foi **substituída a pedido do usuário**. Não configurar ADMIN_USER_IDS nem ADMIN_PASSWORD_HASH. O código atual não lê essas variáveis.
- Novo modelo: menu lateral dentro do sistema, nome e perfil; Operador acessa suas empresas, Gerente gera escalas e gerencia usuários no escritório, Admin tem acesso global. Não há senha adicional nem página separada. Gerente não cria Admin e não edita empresas de outro escritório. Admin/gerentes podem criar Gerentes nos escritórios autorizados; alteração de empresas vale para Operadores.
- O proprietário deve ser promovido explicitamente usando o **identity_subject informado no chat**. Esse ID é do provedor de login, não o UUID interno de cjs_private.users. Não presumir que o vínculo antigo membership.admin já seja Admin global: ele agora representa Gerente.

## Próxima ação na infraestrutura

1. Operador executa `database/enable-user-management.sql` com identity_subject do proprietário. Pré-requisitos 001/002 já cumpridos. O instalador aplica 003/004 se ausentes e promove somente a conta explicitamente informada. Não repetir migrações manualmente sem conferir o estado.
2. Aguardar deployment da main e recarregar a aplicação. Não há novo segredo nem alteração do workflow n8n. ADMIN_USER_IDS/ADMIN_PASSWORD_HASH, se cadastradas antes, podem ser removidas.
3. Homologar menu Admin, criar Operador/Gerente e alterar acesso a empresas na VPS real. Testes locais passaram com os três perfis, limites por escritório, cadastro bcrypt atômico, auditoria, revogação e navegador real; isso não confirma ativação remota.

Guia vigente: [administração de usuários](administracao-usuarios.md). Não orientar mais o fluxo da página secreta.

## Infraestrutura confirmada pelo operador

- PostgreSQL 17.10 em postgres_apps, banco dedicado cjs_escala; migrações 001/002 executadas. Aplicação da 003 isolada não foi confirmada, por isso o instalador verifica sua presença.
- PostgREST 14.15 dedicado, rede Docker privada; API HTTPS `https://api.fintria.com.br/escala`. Sem sessão, check_session retorna 401 via Caddy.
- public.users criada administrativamente no banco dedicado; hashes bcrypt. Credencial cjs_identity_reader consulta apenas as colunas necessárias no login n8n; teste de conexão aprovado.
- Primeira identidade, escritório, vínculo e empresa confirmados por consulta. Mínimo de senha de usuário: 6 caracteres. Sem cadastro público.
- Workflow de login publicado em `https://n8n.fintria.com.br/webhook/auth/cjs-login`; teste HTTP 200/success/token passou, seguido de login real pela aplicação confirmado.
- Frontend permanece na Vercel. Migração de hospedagem para VPS não executada.

## Limites e pendências preservados

- Rotação da chave de RPC anteriormente exposta ainda não foi confirmada explicitamente; nunca registrar ou pedir seu valor.
- CNPJ informado no chat não foi persistido: cadastro de empresas ainda não possui campo próprio.
- Rascunhos exigem salvar manualmente. Salvar atualiza o aberto; Salvar como novo cria outro. Não há sincronização automática nem painel de histórico.
- Não há edição de senha, convites, exclusão de contas, alteração de perfil existente ou cadastro de escritório/empresa na nova gestão. Vínculos legados de consulta conservam restrição de escrita.
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
