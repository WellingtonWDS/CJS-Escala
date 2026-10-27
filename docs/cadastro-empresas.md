# Empresas, CNPJ e importação Domínio

## Cadastro e busca

Gerente e Admin têm a opção **Cadastrar empresas** no menu lateral. Selecionam o escritório e informam razão social e CNPJ. Gerente cadastra apenas nos escritórios que gerencia; Admin pode cadastrar em qualquer escritório ativo. Operador não cria empresas. O cadastro não concede automaticamente empresas novas aos Operadores: Gerente/Admin abrem **Usuários → Editar** para atribuí-las.

O CNPJ é armazenado sem pontuação e exibido formatado junto da razão social. Os dígitos verificadores são conferidos no servidor e banco, com suporte a CNPJ numérico e alfanumérico. A unicidade é por escritório: o mesmo cliente pode pertencer a contabilidades distintas, sem compartilhar dados. Repetir um cadastro ou confirmar duas vezes o mesmo CNPJ não cria duplicidade.

Em Empresa atual e Preenchimentos há um único seletor visível de empresa. Ao abrir, a lista apresenta a busca por razão social (inclusive sem acentos) ou CNPJ (com/sem pontuação). Digitar filtra somente as opções; clicar numa opção ou usar as setas e Enter confirma a escolha. Escape fecha a lista sem trocar a empresa nem fechar a janela. A listagem administrativa de cadastro mantém seus controles próprios de busca e seleção. Nas atribuições de empresas aos usuários, as opções de checkbox também mostram razão social/CNPJ e têm campo de busca. Filtrar não desmarca empresas já selecionadas.

## Importação Domínio no modo individual

Ao confirmar o relatório, o sistema pede o escritório e consulta o CNPJ antes de alterar colaboradores:

- CNPJ já cadastrado e autorizado: reutiliza o cadastro existente.
- Cadastro antigo sem CNPJ, com uma única razão social equivalente (ignorando espaços, pontuação e caixa): Gerente/Admin podem confirmar o vínculo do CNPJ, preservando ID e rascunhos. Operador solicita essa regularização ao gerente.
- Empresa inexistente: Gerente/Admin confirmam o cadastro com os dados do relatório e seguem com a importação. Operador solicita cadastro e acesso.
- Nome ambíguo entre cadastros antigos: não mescla por suposição; o CNPJ é cadastrado separadamente após confirmação.
- Empresa sem permissão, CNPJ ausente/inválido ou serviço indisponível: bloqueia a vinculação e preserva o preenchimento anterior.

Se a empresa escolhida difere da empresa aberta, começa um novo preenchimento com os colaboradores importados, sem carregar funcionários, cobertura ou condições de outra empresa. O preenchimento anterior permanece no cache de seu contexto. Cancelar não cria empresa nem altera o contexto. Envios pendentes de rascunho devem ser resolvidos antes de mudar de empresa.

O cadastro da empresa é confirmado no servidor. Os colaboradores continuam sendo um preenchimento local até usar **Salvar preenchimento**; a mensagem de importação informa isso. Cadastro de empresa e importação local são operações distintas: se o navegador falhar após cadastrar, repetir identifica a empresa existente. Não se presume demanda de cobertura do relatório.

No modo compartilhado/local, o importador anterior é preservado e não acessa cadastro remoto.

## Edição de empresas e criação de escritórios

Na seção **Empresas — cadastrar e editar**, selecionar a empresa na lista preenche o formulário de edição de razão social/CNPJ. Gerente edita apenas empresas do próprio escritório; Admin edita qualquer empresa ativa. O ID e o escritório da empresa permanecem os mesmos: rascunhos e acessos dos Operadores são preservados. Metadados históricos de relatórios já importados não são reescritos.

Mudanças concorrentes são detectadas: se nome ou CNPJ mudaram desde a abertura, é preciso reabrir antes de salvar. CNPJ já utilizado por outra empresa do mesmo escritório não é aceito. Auditoria registra os valores anteriores e posteriores. Não existe transferência de empresa entre escritórios nessa operação.

Somente Admin tem a opção **Escritórios**, para criar escritório pelo nome. Repetir o mesmo nome (ignorando caixa e espaços nas extremidades) reutiliza o escritório ativo sem duplicar. Nome ambíguo ou já pertencente a escritório inativo exige correção administrativa. O Admin tem acesso global imediato ao novo escritório e pode cadastrar empresas e criar um Gerente para ele; Operadores/Gerentes não ganham acesso a outros escritórios automaticamente.

## Compartilhamento de preenchimentos e escalas

Os rascunhos são vinculados por office_id/company_id, sem filtro pelo usuário que criou. Todo Operador autorizado à empresa pode listar, abrir e atualizar o mesmo rascunho, incluindo a escala gerada no snapshot. Gerentes e Admins seguem seus escopos. A revisão impede sobrescrever silenciosamente uma alteração de outro usuário.

Salvar no servidor continua **manual**: depois de preencher ou gerar, usar **Salvar preenchimento** na barra inferior. Isso atualiza o preenchimento aberto; **Salvar uma cópia** guarda um planejamento separado na lista. Dados apenas no navegador não ficam disponíveis a colegas. Há histórico interno de revisões, mas ainda não existe navegação por essas versões na interface. A listagem inicial retorna até 100 rascunhos por empresa. Retirada de acesso bloqueia as próximas consultas, sem excluir os dados.

## Banco e implantação

A migração 005_company_registry.sql acrescenta CNPJ nullable, validação/unicidade por escritório, identificação na importação e auditoria. A **006_registry_management.sql** acrescenta edição com detecção de conflito e criação de escritórios exclusiva de Admin, com auditoria. Requerem as migrações anteriores. Nenhum CNPJ antigo é inventado.

Com 001–005 já aplicadas, executar a 006 **uma única vez**, como postgres no banco dedicado:

```bash
curl -fsSL https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/migrations/006_registry_management.sql -o /tmp/006_registry_management.sql
docker cp /tmp/006_registry_management.sql postgres_apps:/tmp/006_registry_management.sql
docker exec postgres_apps psql -U postgres -d cjs_escala -v ON_ERROR_STOP=1 -f /tmp/006_registry_management.sql
```

Se ainda não aplicou alguma das etapas recentes, usar a versão atualizada de enable-user-management.sql, com os arquivos 003, 004, 005, **006** e promote-platform-admin.sql disponíveis nos caminhos relativos. Verifica o que falta e promove somente a identidade explicitamente fornecida. Não há novas variáveis privadas nem webhook.

Testes: npm test; npm run test:identity:browser. Usam banco/PostgREST locais descartáveis e relatórios fictícios. Cobrem edição/conflito/CNPJ duplicado, preservação de ID/rascunhos/permissões, cadastro de escritório só por Admin e acesso de dois Operadores diferentes à mesma escala gerada, atualização por ambos e bloqueio de revisão antiga. Também validam cadastro/importação/busca e isolamento entre escritórios.

## Exclusão de preenchimentos

A seleção agora permite **Excluir preenchimento selecionado**, com confirmação e permissão de edição na empresa. A exclusão vale para os colegas autorizados e fecha o registro se estiver aberto; os outros preenchimentos e o cadastro da empresa são preservados. Exige migração 007. Consulte [operação e atualização](exclusao-preenchimentos.md).
