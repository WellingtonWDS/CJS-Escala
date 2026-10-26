# Empresas, CNPJ e importação Domínio

## Cadastro e busca

Gerente e Admin têm a opção **Cadastrar empresas** no menu lateral. Selecionam o escritório e informam razão social e CNPJ. Gerente cadastra apenas nos escritórios que gerencia; Admin pode cadastrar em qualquer escritório ativo. Operador não cria empresas. O cadastro não concede automaticamente empresas novas aos Operadores: Gerente/Admin usam Acessos dos operadores para atribuí-las.

O CNPJ é armazenado sem pontuação e exibido formatado junto da razão social. Os dígitos verificadores são conferidos no servidor e banco, com suporte a CNPJ numérico e alfanumérico. A unicidade é por escritório: o mesmo cliente pode pertencer a contabilidades distintas, sem compartilhar dados. Repetir um cadastro ou confirmar duas vezes o mesmo CNPJ não cria duplicidade.

Empresas e rascunhos e a listagem de cadastro têm select e busca digitada por razão social (inclusive sem acentos) ou CNPJ (com/sem pontuação). Digitar um CNPJ completo seleciona a correspondência exata; busca parcial filtra as opções e preserva a seleção atual. Nas atribuições de empresas aos usuários, as opções de checkbox também mostram razão social/CNPJ e têm campo de busca. Filtrar não desmarca empresas já selecionadas.

## Importação Domínio no modo individual

Ao confirmar o relatório, o sistema pede o escritório e consulta o CNPJ antes de alterar colaboradores:

- CNPJ já cadastrado e autorizado: reutiliza o cadastro existente.
- Cadastro antigo sem CNPJ, com uma única razão social equivalente (ignorando espaços, pontuação e caixa): Gerente/Admin podem confirmar o vínculo do CNPJ, preservando ID e rascunhos. Operador solicita essa regularização ao gerente.
- Empresa inexistente: Gerente/Admin confirmam o cadastro com os dados do relatório e seguem com a importação. Operador solicita cadastro e acesso.
- Nome ambíguo entre cadastros antigos: não mescla por suposição; o CNPJ é cadastrado separadamente após confirmação.
- Empresa sem permissão, CNPJ ausente/inválido ou serviço indisponível: bloqueia a vinculação e preserva o preenchimento anterior.

Se a empresa escolhida difere da empresa aberta, começa um novo preenchimento com os colaboradores importados, sem carregar funcionários, cobertura ou condições de outra empresa. O preenchimento anterior permanece no cache de seu contexto. Cancelar não cria empresa nem altera o contexto. Envios pendentes de rascunho devem ser resolvidos antes de mudar de empresa.

O cadastro da empresa é confirmado no servidor. Os colaboradores continuam sendo um preenchimento local até **Salvar** o rascunho; a mensagem de importação informa isso. Cadastro de empresa e importação local são operações distintas: se o navegador falhar após cadastrar, repetir identifica a empresa existente. Não se presume demanda de cobertura do relatório.

No modo compartilhado/local, o importador anterior é preservado e não acessa cadastro remoto.

## Banco e implantação

A migração **005_company_registry.sql** requer 001–004. Ela acrescenta CNPJ nullable aos cadastros antigos, índice único por escritório, validação, auditoria e RPCs company_options/resolve_company; atualiza list_companies/manage_options para incluir CNPJ. Nenhum CNPJ de empresa antiga é inventado ou obtido de rascunhos sem confirmação. Não altera os CNPJs já presentes nos relatórios locais.

Com 001–004 aplicadas, executar a 005 **uma única vez**, como postgres no banco dedicado:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/005_company_registry.sql -o /tmp/005_company_registry.sql
docker cp /tmp/005_company_registry.sql postgres_apps:/tmp/005_company_registry.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/005_company_registry.sql
```

Se ainda não ativou a gestão por perfis, usar a versão atualizada de `enable-user-management.sql`, com os arquivos 003, 004, **005** e promote-platform-admin.sql disponíveis nos caminhos relativos. Ela verifica as migrações presentes e promove somente a identidade explicitamente fornecida. Não executar migrações de novo por tentativa; conferir estrutura em caso de dúvida. O guia de [administração de usuários](administracao-usuarios.md) continua válido. Não há novas variáveis privadas nem webhook.

Testes: npm test; npm run test:identity:browser. Usam banco/PostgREST locais descartáveis e relatórios fictícios. Verificam CNPJ, duplicidade concorrente, legado, isolamento de escritórios, permissões de Operador, menu recolhível persistido, cadastro e busca, importação existente/nova, cancelamento e mudança de contexto sem mistura de colaboradores.
