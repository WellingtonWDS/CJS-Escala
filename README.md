# CJS Escala

Ferramenta para configurar, gerar e revisar escalas de trabalho e comparar a escala atual 6×1 com uma proposta 5×2. A interface e os cálculos usam HTML, CSS e módulos JavaScript nativos no navegador, sem bundler ou compilação do JavaScript da aplicação. A autenticação depende de código no servidor: middleware e função de login na Vercel. Por padrão, os cadastros e as escalas ficam no navegador. O modo individual com PostgreSQL e n8n é opcional e exige a configuração de homologação descrita adiante.

## Andamento do projeto

Consulte [Estado do projeto](docs/estado-do-projeto.md) para uma visão consolidada das funcionalidades implementadas, limitações, últimas validações e próximos passos propostos. O documento reflete o código atual; auditorias e relatórios datados em `docs/` são registros históricos.

O fluxo principal já inclui cadastro manual e por planilhas, importação Domínio, restrições individuais, habilitações por função, geração, conversão 6×1 → 5×2, comparação de cobertura, sugestões de ajustes com prévia/aplicação/desfazer, edição da grade, CSV e impressão. O acesso usa login compartilhado com sessão de 12 horas. Os detalhes de funcionamento e configuração estão nas seções abaixo.

## Conversão da escala atual 6×1 para uma proposta 5×2

1. Preencha o período, colaboradores, jornadas, dias de funcionamento, folgas e feriados **como estão atualmente no 6×1**. Para avaliar suficiência, ative a cobertura e informe a demanda por função, horário e dia.
2. Em **Conversão e comparação**, escolha o mês de destino, a vigência automática ou uma simulação explícita de 42h/40h e a distribuição de folgas. Clique em **Gerar proposta 5×2 e comparar**.
3. Confira a comparação, os horários descobertos e a nova grade. A proposta pode ser ajustada nas células e exportada pelo botão próprio. A prévia avulsa e a exportação da escala atual continuam disponíveis separadamente.

A origem e a proposta são configurações e resultados distintos. A conversão não troca o modelo, período ou cadastro da origem. O snapshot original preserva uma grade já gerada, incluindo seus ajustes manuais; sem grade anterior, a referência usa os horários atuais informados, sem reduzir a duração para limites futuros. Para comparar períodos de comprimentos diferentes, o relatório projeta o padrão original 6×1 também no mês de destino. Ajustes pontuais datados da grade original não são transpostos automaticamente para outras datas.

Os dias de funcionamento são preservados: uma loja aberta de segunda a sábado continua aberta aos sábados. A geração inicial da proposta distribui até cinco dias de trabalho, preserva contratos, funções, entradas/grupos de turno e usa as janelas atuais como limites. Sugestões adicionais de mudança de horário, turno ou função são buscadas em uma etapa própria, com prévia antes de aplicar. Respeita dias permitidos e folgas fixas atuais; sábado e domingo fixos são uma escolha explícita no destino. Não estende saídas nem presume ACT/CCT. Sem fundamento coletivo aplicável, mantém até 8h diárias: a distribuição de 42h em cinco dias pode exigir revisão, registrada nos déficits/alertas.

A busca de folgas é determinística, limitada a 120 avaliações em até duas rodadas e prioriza reduzir incompatibilidades antes das lacunas. Não é uma prova de otimização global. Os diagnósticos distinguem:

- **Suficiente:** a proposta cobre as demandas informadas, sem incompatibilidades objetivas ou déficit do alvo de horas. Pendências documentais continuam indicadas separadamente.
- **Insuficiente:** há lacunas e uma insuficiência demonstrável de capacidade por função, por horas ou dias-pessoa. A comparação explica os limites e os períodos descobertos.
- **Ajustes necessários:** persistem lacunas de distribuição/disponibilidade ou déficit de jornada, sem prova de que contratar seja obrigatório.
- **Incompatível:** a cobertura foi atendida, mas a proposta ainda contém erros de jornada/repouso.
- **Não avaliada:** faltam demandas ativas/válidas no período ou existem avisos que impedem a conclusão.

O pico de faltantes é ausência simultânea, não uma estimativa exata de contratações. Demandas sobrepostas continuam usando o maior mínimo, com intervalos descontados e trabalho noturno tratado pelo motor existente. Feriados nacionais são recalculados para o destino; feriados locais permanecem nas datas cadastradas e devem ser revisados para o novo período.

O formulário de ACT/CCT é compartilhado pela prévia e pela proposta. Para retratar a empresa, informe o instrumento real; hipóteses futuras devem ser testadas em modo de simulação e não representam um acordo firmado. Identificação, vigência e cláusulas precisam corresponder ao cenário. Um cadastro não representa dois instrumentos distintos simultâneos; nesse caso, faça simulações separadas. A referência automática preserva o instrumento aplicável à origem e suas condições, sem usar um acordo integralmente futuro ou expirado para autorizar a jornada atual. A proposta usa o cadastro selecionado para seu cenário e confere as datas.

A referência atual 6×1 criada automaticamente pela conversão conserva seu contexto de **44h**, inclusive na grade, resumo semanal, CSV, diagnóstico e busca de ajustes. Uma fase futura selecionada nos controles não deve recalcular essa referência como 42h ou exigir dois repousos. A proposta mantém sua própria fase. A prévia avulsa gerada explicitamente continua usando a referência legal escolhida; excessos reais e intervalos ausentes continuam sendo apontados. O contexto permanece após recarregar e é substituído ao gerar uma nova prévia avulsa.

Exemplo de conferência do preenchimento: 08h–18h com intervalo 11h–13h representa **8h efetivas**, ou 40h de segunda a sexta; mais 4h no sábado fecha 44h. A janela operacional da empresa não substitui os horários individuais importados ativos. Informar 08h, início de intervalo 18h e os dois últimos campos zerados representa turno contínuo de 10h, não um intervalo de almoço.

Mudanças na origem ou no destino suspendem a conclusão anterior e bloqueiam sua exportação até gerar uma nova proposta. Ajustes na grade proposta recalculam a comparação sem alterar a referência original. A conversão fica no armazenamento local, sujeita ao espaço disponível no navegador; se o salvamento falhar, a interface avisa para exportar antes de sair. Módulos: `domain/conversao.js` e `ui/conversao.js`. Regressões: `tests/conversao.test.cjs` e `tests/browser-conversao.cjs`.

## Desenvolvimento

Requer Node.js 22 ou superior.

O leitor Excel é `@e965/xlsx` 0.20.3, fixado no lockfile. O build publica apenas `xlsx.mjs` e sua licença em `assets/vendor/`; o servidor de desenvolvimento atende o mesmo caminho. O módulo é carregado localmente quando o usuário seleciona um relatório da Domínio, sem enviar a planilha a um serviço externo.

```sh
npm ci
npm run dev
```

O servidor local usa a porta 3000. Para outra porta, use `PORT=3001 npm run dev`. Abra a aplicação por HTTP: módulos JavaScript não devem ser executados abrindo o HTML diretamente pelo sistema de arquivos.

## Organização

```text
index.html                      Estrutura e conteúdo da aplicação
login.html                      Página de entrada
middleware.js                   Proteção de páginas e recursos na Vercel
api/auth.js                     Login, consulta da sessão e saída
server/auth.js                  Senha, assinatura e validação das sessões
assets/css/styles.css           Estilos próprios e impressão
assets/js/
  main.js                       Verificação de sessão e inicialização
  session.js                    Controle da expiração na interface
  login.js                      Envio do formulário de login
  app.js                        Montagem da aplicação e coordenação dos módulos
  config/                       Regras de jornada, constantes e tema Tailwind
  domain/                       Datas, feriados, cálculo e validação das escalas
  state/                        Estado inicial e persistência
  ui/                           Formulários, colaboradores, calendário e transição
  workers/                      Busca de ajustes de cobertura em segundo plano
  shared/                       Formatação de texto e escape
  import/                       Leitura e validação de CSV e relatórios Domínio
  export/                       Geração e download de CSV
scripts/                        Servidor local e preparação da publicação
tests/                          Regressões e fluxos no navegador
docs/estado-do-projeto.md        Implementado, limitações e próximos passos
```

O domínio recebe a configuração explicitamente, por meio de `createDomain(state)`, e não acessa HTML, armazenamento ou variáveis globais da aplicação. `gerarDadosEscala()` devolve a escala e suas validações; a interface decide quando exibi-la e salvá-la. Cada instância da aplicação possui seu próprio estado. O toggle de dois turnos mostra os grupos A/B para duas semanas e atualiza os horários da escala existente, inclusive ao mudar a entrada do Turno B, preservando status, folgas e horas ajustadas manualmente.

A interface recebe suas dependências na criação: estado, funções do domínio, persistência, recursos do navegador e callbacks entre seções. Os eventos são registrados em `bindEvents()`, e os dados são restaurados em `init()`. Importar os módulos não inicializa a página.

A persistência mantém a chave `fintria-escala-dp-v2` e o formato dos dados da versão anterior. A restauração atualiza o mesmo objeto de estado, preservando as referências usadas pelos módulos. A regra de abrir no mês atual foi mantida.

Para manutenção:

- Alterações em cálculos e validações pertencem a `domain/`; mantenha o acesso ao DOM em `ui/`.
- Regras e referências compartilhadas ficam em `config/regras-jornada.js`.
- Novos eventos devem invalidar a escala quando a configuração mudar e salvar as alterações pela persistência.
- Preserve a chave de armazenamento; mudanças no formato exigem migração dos dados existentes.

Ao ativar **horários por dia**, a geração limita a carga à janela de cada dia e redistribui o restante entre os dias com disponibilidade. Por exemplo, 44h em 6×1 podem ser distribuídas em 8h de segunda a sexta e 4h no sábado. O preenchimento `08:00 / 12:00 / 00:00 / 00:00` representa trabalho das 8h às 12h sem intervalo. O alvo programado é o menor entre a jornada contratual e o limite aplicável à fase/enquadramento, preservando o contrato cadastrado. Se esse alvo exceder a capacidade dos horários, o resumo indica déficit. Turnos únicos também são limitados quando usados no horário padrão; a alternância A/B preserva sua duração a partir da entrada do turno.

Na escala 5×2, os dias não operacionais já contam como folga. Quando há operação nos sete dias, a rotação verifica a última folga da semana anterior e antecipa uma das duas folgas, se necessário, para evitar sete dias consecutivos sem acrescentar um terceiro repouso. A decisão é estável ao gerar períodos sobrepostos. A política de feriados pode contar os dias não trabalhados entre as folgas no 5×2 e 6×1 (regra anterior preservada, com pendência de fundamento) ou manter as folgas e adicionar o feriado. A geração escolhe apenas as folgas restantes, sem duplicar um feriado que já cair em dia fechado ou em folga. Se dias fechados e feriados já ultrapassarem a quantidade de folgas, eles são preservados e o relatório explica a limitação. A opção **Trabalhar neste feriado**, em cada feriado, permite trabalho nessa data e mantém a distribuição normal das folgas; ela não obriga um colaborador que já estaria de folga a trabalhar. O ciclo 12×36 é preservado.

Na seção **Definição de folgas**, o seletor **Modelo de folgas** oferece **Sábado e domingo — 5×2**. O modelo mantém os dois dias fixos para todos os colaboradores e preserva os dias operacionais e a configuração personalizada anterior. Um feriado não trabalhado durante a semana não desloca o fim de semana fixo; o relatório explica quando isso gera mais de dois dias sem expediente. Ao voltar para o modelo rotativo ou fixo personalizado, os dias permitidos anteriores são recuperados. O modelo pronto só é aplicado ao 5×2.

A base de compensação não oferece acordo individual. Dados antigos com essa seleção são migrados para **Nenhuma compensação informada**, e a escala anterior é invalidada para nova geração.

## Vigência e enquadramento EC 141

O modo padrão **Automático** resolve a fase em cada data: 44h/um repouso antes de 16/12/2026, 42h/dois repousos a partir dessa data e 40h/dois repousos a partir de 16/12/2027, conforme o texto fornecido para o projeto. As opções **Simular** são explicitamente identificadas e não certificam a vigência real. As regras estão em `domain/ec141.js`.

A carga programada é limitada pela fase sem sobrescrever a jornada contratual, reduzir proporcionalmente contratos de até 40h ou alterar salários. O padrão 6×1 é ajustado para dois repousos quando exigido; manter semanas com um repouso requer a modalidade coletiva mensal. Semanas que atravessam um marco usam o menor limite como programação conservadora e recebem pendência de conferência; não é inventado rateio legal dentro da semana.

**Condições do ACT/CCT** registra identificação, início/fim de vigência, compatibilidade das cláusulas, autorização/limite diário, compensação mensal dos repousos, compensação de horas e regime 12×36. Selecionar ACT/CCT ou banco de horas não atenua excessos por si só. A apuração de compensação de horas exige todos os dias do período, mesma referência de vigência, média efetiva e teto de pico autorizado. O cálculo usa trabalho real em minutos; continua pendente a conferência documental da cláusula. Períodos sem dados completos ou que cruzem fases não recebem aprovação automática.

A compensação mensal dos repousos exige ACT/CCT válido no mês inteiro. A referência aritmética é `ceil(2 × dias do mês / 7)`, exibida no resultado e sujeita ao critério da cláusula; meses de transição ficam pendentes. O repouso dentro de sete dias é validado separadamente. `diasApuracao` mantém o mês completo mesmo quando a geração começa depois do dia 1; edições na grade prevalecem sobre cópias restauradas do contexto.

A análise individual **Enquadramento EC 141 e proteção salarial** fica oculta e desativada por padrão (`analiseEnquadramentoAtiva: false`). O cadastro não exige salários ou pisos nem emite pendências pela ausência desses dados. Registros avançados existentes são preservados, mas não alteram os limites usados na escala nem aparecem como enquadramentos aplicados no CSV enquanto a análise estiver desativada. A geração segue a regra geral; as validações de jornada, repousos, ACT/CCT e cobertura continuam ativas.

O código da análise avançada permanece disponível para eventual retomada: comparação de remuneração/pisos, requisitos do art. 8º e contrato público/aditamento do art. 9º. A reativação é uma configuração interna, sem controle exposto ao usuário. Testes específicos exercitam esse modo separadamente. O 12×36 continua sujeito à conferência do regime específico, independentemente dessa análise individual.

A validação legal recebe contexto anterior para interjornada e sequências de trabalho e retorna apenas os achados referentes à grade. Resultados calculados por versões anteriores das regras são descartados na restauração, preservando os cadastros. O CSV passa a ser um relatório detalhado com horários, horas, abonos, alvo, contrato, fases e ocorrências recalculadas; exportações com incompatibilidades ou pendências são identificadas como **RASCUNHO**.

## Fechamento semanal e feriados

O selo **HORAS OK** indica somente o fechamento do alvo programado, não a aprovação das verificações legais. O resumo semanal usa uma única apuração (`domain/resumo-semanal.js`) para a apresentação e a validação contratual: **horas trabalhadas + horas abonadas por feriado = total considerado**. O abono vale apenas para feriado dispensado em um dia originalmente previsto como trabalho. Quando esse feriado ocupa uma das folgas no 5×2/6×1, a outra folga é liberada para trabalho; o abono mantém a carga originalmente prevista e apenas o saldo contratual é distribuído entre os dias de trabalho, sem duplicar horas. Feriado em folga, feriado trabalhado e folga compensatória não geram esse crédito. A descrição do abono, com data, nome e carga, aparece no Resumo da semana.

O crédito não é contado como presença na cobertura nem como hora efetivamente trabalhada para o limite semanal. A carga original de cada dia fica em `horasPrevistas`; para escalas antigas sem esse campo, a apuração usa a distribuição original da carga contratual entre os dias previstos da semana. Uma falta em outro dia continua gerando déficit. Nomes originais de demonstração intactos são substituídos por Colaborador 1 e Colaborador 2 na restauração; registros personalizados são preservados.

## Cobertura operacional

Ative o toggle de **Cobertura operacional** para cadastrar faixas recorrentes, informando função, horário, mínimo de pessoas, dias da semana e aplicação em feriados. A seção fica recolhida quando desativada. O select de função lista somente os cargos preenchidos livremente em **Cargo / função** nos colaboradores; novos cargos são cadastrados ali. Desativar a cobertura suspende a análise e preserva as faixas salvas. Cadastros antigos que já tinham faixas mantêm a análise ativa na migração. Nomes de função ignoram acentos, maiúsculas e espaços extras; a função principal já está habilitada e funções adicionais podem ser marcadas na ficha. Cada pessoa é contada somente na função alocada ao plantão; habilitação não implica presença simultânea em várias funções.

Ao gerar a escala, o relatório mostra data, função, período descoberto, mínimo, presentes e faltantes. A análise usa os horários individuais, exclui intervalos e folgas e considera plantões iniciados no dia anterior. Horários noturnos têm término no dia seguinte. Faixas sobrepostas da mesma função usam o maior mínimo, sem somar demandas duplicadas. Os dias/feriados escolhidos referem-se ao início da faixa, independentemente dos dias operacionais da empresa.

Na geração inicial, a pausa mantém sua distância da entrada configurada, inclusive no Turno B; em jornadas menores, é antecipada para caber no plantão. A cobertura utiliza os limites explícitos da pausa efetiva quando disponíveis, incluindo jornadas recortadas por restrições e ajustes de horário. O intervalo efetivo aparece na descrição do dia na grade. A análise ocorre em minutos e se limita ao período selecionado. O total de horas-pessoa faltantes soma a duração de cada lacuna multiplicada pela quantidade de pessoas que faltam.

O módulo `domain/cobertura.js` é independente da interface e não modifica a configuração ou a escala. As demandas ficam em `demandasCobertura`, preservando a chave existente do armazenamento. Sem demandas, a cobertura por função é identificada como não avaliada. Alterar demandas ou cargos invalida a escala; editar um status diário recalcula a cobertura. A análise isolada diagnostica lacunas; o fluxo de conversão usa essa análise para buscar uma distribuição das folgas.

## Cadastro por planilha

Além do CSV e do cadastro manual, a terceira seção recolhível **Importar planilha da Domínio — Quadro de Horário de Trabalho** aceita relatórios `.xls` e `.xlsx` de até 5 MB. As três formas começam fechadas. A prévia informa empresa, CNPJ, empregador/endereço, pessoas e pendências antes de alterar o cadastro. O conteúdo original dos relatórios enviados por usuários não é publicado com a aplicação.

O importador identifica as colunas pelo título e reúne linhas de cada colaborador pelo código. Preserva nome, cargo, admissão, CTPS/série com zeros à esquerda, visto fiscal, dias agrupados ou separados, entradas, intervalos, saídas, folgas e ciclos. Empresa, páginas indicadas, licenciamento do relatório e células adicionais ficam guardados como metadados. A lista **Colaboradores cadastrados/importados**, ao final da seção, permite consultar os valores originais e revisar os horários individuais, sem sobrescrever o registro original da importação.

A ausência da carga contratual nos relatórios da Domínio não gera avisos ou pendências de importação. O campo de jornada contratual de referência e sua conferência permanecem disponíveis, com as validações de valores e limites da escala.

Os horários individuais são usados na geração, validação, cobertura e conversão 6×1 compatível; não são reduzidos a um horário padrão da empresa. Na referência importada, mantém-se a duração efetivamente informada, mesmo que produza alertas legais ou exceda a carga contratual confirmada. Admissão impede trabalho em datas anteriores, marcadas como **NC**, sem contá-las como folga; a semana parcial recebe conferência específica. A exportação CSV inclui a empresa e a identificação da Domínio.

Informações não disponíveis no relatório não são inventadas:

- Sexo ausente pode ser preenchido automaticamente por alta predominância na base local de prenomes, com origem e porcentagem identificadas; os demais casos ficam **Não informado**. A carga semanal é calculada dos horários completos, identificada como estimativa até confirmação do contrato; não é presumida como 44h.
- Horários `00:00–00:00` sem indicação de folga, intervalos fora da jornada e dias conflitantes ficam pendentes de revisão. A geração exige horários completos. Dias da semana não listados no relatório são considerados folga automaticamente, sem necessidade de marcar uma opção. Lacunas na numeração de ciclos permanecem pendentes, pois não determinam a duração real do ciclo.
- Ciclos `1º Dia/2º Dia` exigem a data de referência de cada pessoa. Não é presumido grupo A/B pela ordem do cadastro nem pela data de admissão. Jornadas semanais alternadas permanecem semanais até confirmação do usuário; o nome do arquivo não torna toda a equipe 12×36. Um ciclo de dois dias com plantão de 12h de permanência e segundo dia livre é reconhecido como 12×36, sujeito às validações do regime.
- Intervalo vazio permanece vazio, sem inserção automática de pausa. Cobertura mínima, tratamento de feriados e instrumento coletivo precisam ser conferidos na operação. Não se conclui suficiência com dados individuais pendentes.

Adicionar exige a mesma empresa e rejeita códigos já cadastrados. Substituir por outra empresa reinicia cobertura, instrumento coletivo e feriados locais anteriores, conforme aviso da prévia. As demais configurações são preservadas. A importação invalida os resultados anteriores para nova geração.

Os três arquivos originais foram lidos no desenvolvimento: 7 colaboradores no quadro de comércio, 6 no de drogaria e 17 no misto, com 4 ciclos explícitos. Os testes no repositório usam versões **fictícias**, sem nomes, documentos ou empresas reais, e reproduzem também o preâmbulo BIFF8 irregular desses relatórios. A normalização aceita somente o padrão comprovado de registros BLANK anteriores ao BOF da aba; não tenta recuperar dados arbitrariamente. Planilhas com fórmulas são rejeitadas, sem execução de fórmulas ou macros. Limites adicionais: 500 colaboradores, 20 abas, 10 mil linhas e 200 colunas por aba.

Módulos: `import/arquivo-dominio.js`, `import/dominio.js`, `domain/perfil-dominio.js` e as interfaces correspondentes. Regressões: `tests/dominio.test.cjs` e `tests/browser-dominio.cjs`.

Em **Colaboradores → Preencher colaboradores por planilha**, baixe **modelo-colaboradores.csv**, abra no Excel ou LibreOffice e preencha a partir da segunda linha. Mantenha as quatro colunas: **Nome**, **Sexo** (Feminino/Masculino ou F/M), **Cargo / função** e **Horas semanais** (1 a 60 em múltiplos de 0,5). Salve como CSV, preferencialmente UTF-8; para esse modelo, arquivos `.xlsx` devem ser salvos como CSV antes de importar. O relatório da Domínio possui uma importação própria que aceita `.xls` e `.xlsx`. O modelo contém somente o cabeçalho, sem pessoas fictícias para importar por engano.

A leitura aceita delimitadores ponto e vírgula, vírgula ou tabulação, campos entre aspas, decimais com vírgula e codificações UTF-8, UTF-16 com BOM ou Windows-1252. Limites: 1 MB por arquivo e 500 colaboradores no cadastro resultante. Todos os registros precisam ser válidos; erros são informados por linha e nenhum cadastro muda antes da confirmação. A prévia mostra até 20 pessoas.

O padrão **Adicionar** preserva os registros atuais. **Substituir** remove os colaboradores anteriores e seus dados individuais e mantém as demais configurações. A prévia explica o efeito de cada modo. Nomes repetidos são pessoas distintas: não há atualização automática por nome. Os IDs são gerados pelo sistema. A importação atualiza as funções disponíveis na cobertura, invalida a escala anterior e persiste o cadastro. Confira o cadastro e a cobertura antes de gerar novamente. O arquivo é processado apenas no navegador.

Parser e validação: `assets/js/import/colaboradores.js`. Interface: `assets/js/ui/importar-colaboradores.js`. Regressões: `tests/importacao-colaboradores.test.cjs` e `tests/browser-importacao.cjs`.

## Tutorial guiado

O botão **Tutorial guiado**, ao lado de **Limpar dados salvos**, inicia nove etapas com destaque da área correspondente, instruções e contador. É possível avançar, voltar, concluir ou encerrar com **Esc**. O tutorial não altera o cadastro nem gera uma escala; a cobertura continua opcional. A implementação fica em `assets/js/ui/tutorial.js`, com regressões em `tests/browser-tutorial.cjs` para desktop e celular, navegação por teclado e preservação dos dados.

## Planejamento de persistência e hospedagem

A evolução para PostgreSQL/PostgREST com isolamento por escritório está descrita no [plano de persistência](docs/planos/persistencia-postgresql.md), junto à [análise dos fluxos de autenticação n8n](docs/planos/autenticacao-n8n.md). O acesso será provisionado por administração autorizada, sem autocadastro público. A API será preparada para rodar na Vercel ou na VPS, com futura hospedagem no domínio fintria.com.br. A [primeira entrega técnica](database/README.md) já implementa migração SQL, RLS, RPCs de rascunhos, histórico/auditoria e serviços portáteis de API, testados em PostgreSQL 17 e PostgREST 14.15 (versão confirmada na VPS). A segunda entrega já inclui login individual, abertura/revogação de sessões, rotas HTTP e interface de empresas/rascunhos com cache separado e migração local explícita. O operador já confirmou o login individual na Vercel e iniciou a validação de rascunhos no servidor. O modo padrão do código continua compartilhado até configurar as variáveis. O [registro de implantação](docs/implantacao-atual.md) distingue os resultados reais das verificações locais. O [guia n8n](integrations/n8n/README.md) documenta a configuração.

## Interface e manutenção visual

A interface usa navegação lateral, cabeçalho claro, etapas compactas durante a rolagem, cartões com hierarquia de títulos e ações principais em verde. Login, formulários, cadastros, modais, seleção de empresa, salvamento e grades compartilham a mesma linguagem visual. No celular, os controles de formulário têm tamanho adequado para toque e fonte de 16px para evitar zoom automático; a grade mantém rolagem própria. Foco de teclado, estados desabilitados, movimento reduzido e impressão são preservados.

A camada visual compartilhada fica em `assets/css/interface.css`; estilos específicos permanecem nos arquivos de navegação, workspace, diálogos, movimento e login. A paleta das classes utilitárias fica em `tailwind.config.cjs`, com entrada em `assets/css/utilities-source.css`. Depois de alterar classes ou configuração, execute `npm run build`. Não editar o CSS gerado. Guia: [interface e revisão visual](docs/interface.md).

## Administração de usuários

O menu lateral pode ser recolhido/expandido e mostra nome, perfil, geração de escala e empresas/rascunhos. Gerentes e Admins têm a janela **Usuários**, com lista e pesquisa por nome, e-mail ou escritório, cadastro, edição de nome/e-mail/perfil, toggles de situação e empresas autorizadas dentro da edição. Admin vê todos os usuários; Gerente vê os vínculos do próprio escritório e não edita Admins. Operador não tem acesso à gestão. A migração **008** habilita a nova janela; não há mais uma entrada separada de Acessos dos operadores. Operadores acessam somente as empresas atribuídas; Gerentes administram seu escritório; Admin tem acesso global. A migração 004 e a promoção explícita da identidade do proprietário habilitam o novo modelo: [guia de ativação](docs/administracao-usuarios.md). Não há senha administrativa adicional nem cadastro público. Cadastro e vínculos são atômicos, com bcrypt e auditoria; o servidor valida o escopo de cada operação.

Gerente e Admin podem cadastrar e editar empresas com razão social/CNPJ, preservando seus rascunhos e permissões. Admin também pode criar escritórios pelo menu lateral. Seletores e buscas exibem ambos os dados; a importação Domínio identifica o CNPJ no escritório e permite confirmar cadastro novo sem misturar colaboradores. Requer migrações 005/006: [operação e ativação](docs/cadastro-empresas.md).

Os rascunhos salvos pertencem à empresa e podem ser abertos por outros usuários autorizados, mesmo quando criados por colegas. Preenchimentos e escalas geradas só chegam ao servidor ao usar **Salvar preenchimento**; **Salvar uma cópia** cria outro planejamento. Não há salvamento automático na nuvem.

O botão **Sair** fica no final do menu lateral, com ícone acessível quando recolhido.

## Empresa atual e Preenchimentos

O menu e o cabeçalho abrem a janela **Empresa atual e Preenchimentos**, organizada em empresa/escritório e preenchimentos disponíveis. A empresa usa um único seletor: ao clicar, abre a lista com busca interna por razão social ou CNPJ, com ou sem pontuação. A busca filtra as opções sem trocar a empresa até uma seleção explícita; aceita teclado e informa quando não há resultados. O botão principal é **Usar esta empresa** para um preenchimento ainda não salvo ou **Abrir preenchimento** para um registro existente. A ação permanece visível no rodapé da janela; recuperação e importação de dados antigos ficam numa área recolhível.

Durante o preenchimento das oito etapas, uma barra fixa inferior mostra razão social/CNPJ, escritório e nome do preenchimento aberto. Novos preenchimentos recebem nome com data e hora local, por exemplo **Planejamento de escala — 27/10/2026, 14:05:06**. O nome pode ser editado; abrir ou salvar um registro existente preserva seu título. O nome sugerido para uma cópia também inclui a data e hora da criação da sugestão. **Salvar preenchimento** atualiza o aberto diretamente, sem precisar abrir a janela. **Salvar uma cópia** pede o nome e cria outro registro na mesma empresa, preservando o original. **Trocar empresa ou abrir preenchimento** leva ao seletor. A barra informa alterações locais, confirmação no servidor e envio pendente; nesse último caso o botão passa a **Concluir salvamento** e a cópia fica indisponível até resolver o envio anterior.

Escolher outra empresa ou outro preenchimento no seletor não altera os dados nem o nome do que já está aberto. Salvar usa o contexto efetivamente aberto; cancelar a seleção mantém a empresa anterior como destino. Só o botão de abertura confirmado troca esse contexto. A barra se adapta ao celular, reserva espaço de rolagem, fica fora da impressão e não aparece nos painéis de gestão de cadastros. O contrato de persistência/idempotência/revisão permanece o mesmo; não há nova migração.

Na janela, selecione um registro salvo e use **Excluir preenchimento selecionado**. A confirmação identifica o nome e a empresa: a exclusão vale para todos os usuários autorizados, fecha o registro se estiver aberto e preserva os demais. Exige permissão de edição na empresa e bloqueia revisão desatualizada. O histórico interno é preservado; não há restauração pela interface. Requer a migração **007**: [operação e atualização do banco](docs/exclusao-preenchimentos.md).

## Avisos e confirmações

Alertas, confirmações e edição de valores usam modais com o estilo do sistema, incluindo os fluxos de limpeza local, rascunhos e calendário. O editor do dia apresenta um select de status e um campo para horas. Há cancelamento por Escape, confirmação por teclado, foco contido na janela e restauração do foco sem rolagem. Mensagens são inseridas como texto, e avisos simultâneos são exibidos em fila.

Componente: `assets/js/ui/dialogs.js` e `assets/css/dialogs.css`. `getDialogs(document)` retorna alert/confirm/prompt **assíncronos**; aguardar confirm/prompt antes de alterar dados. No ambiente da aplicação, env.alert/env.confirm/env.prompt usam esse componente. A escala não é alterada quando o usuário cancela uma pergunta. O módulo da sessão compartilha a mesma fila e o arquivo de diálogo é uma dependência pública do login, sem dados de usuário.

## Carregamento e animações

Operações demoradas de cadastro, rascunhos, login, importação e buscas de ajuste mostram um overlay modal com fundo escurecido/desfocado e animação central nas cores do sistema. A indicação só aparece após 180 ms, evita piscar em chamadas rápidas e acompanha o término real da operação. Confirmações não ficam encobertas; buscas canceláveis mantêm Cancelar busca no overlay. Sucesso, falha e cancelamento liberam a interface, e uma operação não esconde o carregamento de outra ainda ativa.

Janelas têm entrada/saída suaves; painéis de gestão, login, tutorial e menu lateral também recebem transições. Movimento reduzido do navegador remove rotações e transições. Componentes: assets/js/ui/loading.js, assets/js/ui/motion.js e assets/css/motion.css. O loading acompanha aria-busy=true dos fluxos assíncronos; sempre remover esse atributo em finally, inclusive em erros e descarte de leitura de arquivo. O overlay não representa progresso percentual nem inventa duração de processamento. Não requer alteração de banco ou novas variáveis.

## Testes

```sh
npm test
# Integração opcional: requer Docker; cria apenas serviços locais descartáveis.
npm run test:persistence
# Login individual + interface, com banco real e provedor simulado (Docker + Chromium).
npm run test:identity:browser
npx playwright install chromium
npm run test:browser
```

Os testes de regressão importam os módulos reais. O teste de navegador prepara e serve a saída de produção e verifica modelos de escala, edição, persistência, turnos, comparativo, invalidação e download CSV. O CSS Tailwind é compilado localmente no build e servido pela aplicação. As fontes externas ficam bloqueadas nos testes, que usam o fallback do sistema; isso não comprova a disponibilidade do Google Fonts. A suíte inclui oito etapas em 320/375/768/1440 px, contraste do cabeçalho, impressão e login móvel.

Para usar um Chromium já instalado:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

## Vercel

`npm run build` prepara `dist/` com `index.html`, `login.html`, `assets/` e o leitor Excel local com sua licença. A configuração em `vercel.json` define esse comando e essa pasta para os arquivos estáticos. Não há bundler para os módulos da aplicação: eles são publicados com seus caminhos relativos, e testes e ferramentas de desenvolvimento ficam fora da saída.

A implantação também precisa do middleware da raiz, de `api/auth.js` e do módulo de autenticação em `server/`, processados pela Vercel separadamente dos arquivos estáticos. Publicar somente `dist/` em um servidor estático não reproduz a proteção de acesso. Configure `AUTH_SESSION_SECRET` nos ambientes utilizados e faça novo deploy, conforme [Login e sessão de 12 horas](#login-e-sessão-de-12-horas).

O Tailwind não é mais carregado por CDN: `npm run build` compila as classes usadas em HTML/JavaScript, gerando `assets/css/utilities.css` e copiando-o para `dist`. `npm run dev` executa esse preparo automaticamente. O arquivo gerado não é versionado; a versão do compilador está fixada no projeto. As fontes do Google continuam opcionais, com fallback local. Os dados permanecem no navegador e na origem do site; mudar o domínio da implantação não transfere o `localStorage` de uma origem para outra.

O painel **Preencher colaboradores manualmente** contém somente o formulário de inclusão (nome, sexo, cargo e carga contratual). Confirmar um cadastro adiciona a pessoa à lista **Colaboradores cadastrados/importados**, limpa o formulário e leva o foco para essa lista, onde todos os registros podem ser editados ou removidos. Confirmar uma importação CSV ou Domínio recolhe os painéis de importação e leva à mesma lista, com a mensagem de resultado visível. Prévia, cancelamento e erros não disparam essa navegação.

## Navegação por etapas

O preenchimento usa uma barra horizontal de oito etapas: Configuração, Tipo de escala, Feriados, Jornada, Folgas, Cobertura, Emenda Constitucional e Conversão e comparação. A barra permanece no topo durante a rolagem e fica compacta, mantendo nomes, etapa selecionada e indicadores de pendências; no celular, as abas continuam acessíveis por rolagem horizontal. Ao voltar ao início, recupera o tamanho normal. A troca de etapas não rola automaticamente a tela para baixo. Apenas a etapa selecionada aparece; os botões Avançar/Voltar e os links da barra usam os mesmos formulários, preservando os dados e rascunhos sem recarregar a aplicação. A etapa aparece no endereço (`#sec-jornada`, por exemplo), permitindo recarga, links diretos e voltar/avançar pelo navegador. A barra também aceita setas, Home e End, com indicação da etapa atual e foco no título ao navegar.

O tutorial abre a etapa de cada destaque e restaura a etapa anterior ao encerrar. A impressão acompanha a etapa aberta e inclui seus painéis expandidos. Módulo: `ui/etapas.js`; regressões específicas: `tests/browser-etapas.cjs`. Os testes dos demais fluxos navegam pela barra antes de operar seus campos.

As etapas mostram uma bolinha vermelha piscando quando o usuário sai de uma etapa com dados obrigatórios pendentes. Corrigir os dados remove a indicação; navegar pelo tutorial não registra visitas. A etapa aberta diretamente ao recarregar não presume visitas às demais: esse acompanhamento vale durante a navegação atual. O indicador inclui texto acessível, descrição das pendências e atalhos para os campos; com movimento reduzido, a bolinha fica estática.

A geração da **nova proposta 5×2** exige completar os dados obrigatórios de todas as etapas, mesmo das ainda não visitadas. A tentativa incompleta mostra uma lista de correções e mantém os dados existentes. A prévia avulsa continua disponível para diagnóstico. Cadastro manual e importações sem confirmação não são novos registros obrigatórios; cobertura desativada não exige faixas, e a seção de consulta da Emenda não exige preenchimento. Identificação/vigência do ACT/CCT só são exigidas quando essa base é selecionada; referências de ciclos e horários individuais são verificados quando utilizados. Alertas de mérito legal continuam nas validações da escala. Regras de preenchimento: `domain/preenchimento.js`; testes: `tests/preenchimento.test.cjs` e `tests/browser-pendencias.cjs`.

## Plantões 12×36 com condições específicas de CCT

Em **Tipo de escala → Condições do ACT/CCT**, selecione a base ACT/CCT, preencha identificação e vigência, marque o instrumento para o regime 12×36 e configure as cláusulas aplicáveis:

- **Computar o intervalo intrajornada como jornada**: mantém a pausa real, mas credita sua duração no cômputo.
- **Acrescentar crédito fixo de 1h por plantão com trabalho entre 22h e 5h**: aplica a regra específica declarada pelo usuário. Não é um cálculo universal do fator legal da hora noturna reduzida, adicional ou prorrogações.

Exemplo: 19h–6h com pausa 22h–23h preserva **10h efetivas**, soma **1h de intervalo computado + 1h de crédito noturno**, totalizando **12h computadas**. O ciclo importado com primeiro dia de trabalho e segundo de folga é identificado como 12×36 sob essas condições declaradas. A data individual de plantão continua necessária. A saída permanece às 6h e o descanso até o próximo plantão às 19h é de 37h reais. O modelo global 12×36 também preserva a janela real quando essas condições são usadas.

Os créditos só são concedidos aos plantões 12×36 com instrumento ACT/CCT válido na data, incluindo a compatibilidade da nova fase quando exigida. Sem vigência ou fundamento configurado, não são computados. Jornada diurna não recebe o crédito noturno. A cobertura usa a pausa individual importada e os horários de presença, sem contar créditos como disponibilidade. A soma acima de 12h computadas é apontada para revisão.

O resumo semanal e o CSV separam horas efetivas, intervalo computado e crédito noturno. Feriado dispensado abona as horas computadas originalmente previstas, sem duplicar créditos de trabalho. A média do ciclo do exemplo passa de 35h de relógio para 42h computadas; a carga contratual já confirmada pelo usuário é preservada, enquanto a referência ainda não confirmada acompanha essa estimativa declarada. A vigência é conferida em cada dia na geração. A configuração é salva no navegador; resultados antigos são invalidados pela nova versão das regras.

Módulo: `domain/computo-cct.js`. Regressões: `tests/computo-cct.test.cjs` e `tests/browser-computo-cct.cjs`, usando exclusivamente registros fictícios.


## Preenchimento conservador de sexo por prenome

A importação da Domínio consulta uma base local de frequências agregadas atribuídas ao **IBGE/Censo 2022** pelo espelho **ggustavowerlangg/ibge-nomes-2022**. Só preenche quando a predominância observada é **≥ 99%**, com **≥ 1.000 registros** e frequências positivas disponíveis para ambos os sexos. A comparação usa os valores originais antes de arredondar. Ausência de uma frequência não é considerada zero nem certeza de 100%. A fonte bruta contém 134.315 registros de sexo/frequência, relativos a 123.733 prenomes; a derivação preserva **10.582 prenomes com ambas as contagens**, dos quais **2.655** passam pelos critérios atuais. A base anterior (1.040 pares do Censo 2010) foi substituída integralmente para não misturar populações de censos diferentes.

A prévia e o cadastro identificam a estimativa, o prenome e a predominância; a porcentagem descreve a base histórica, sem garantir o sexo de uma pessoa específica. A consulta não utiliza terminações de nomes, não decide por sobrenomes e não envia nomes a serviços externos. Nomes fora da base, iniciais, nomes com dados insuficientes ou evidências divergentes ficam não informados. Por exemplo, Lucas, Tiago, Thamires e Hellen agora atendem ao limiar; Adair e Ariel continuam sem preencher. Combinações iniciais com sugestões conflitantes também são recusadas por cautela.

O botão **Preencher sexos por nome nos importados**, na lista de cadastrados/importados, atende registros antigos e atualiza as evidências das estimativas anteriores, inclusive quando o sexo permanece igual. Valores já informados e escolhas manuais são preservados, inclusive a escolha explícita de Não informado. Alterar o nome de um registro estimado reavalia a sugestão e a retira quando os critérios deixam de ser atendidos. A aplicação não altera automaticamente registros antigos ao carregar a página. CSV com registros estimados inclui origem e predominância; as informações também persistem no navegador. O modelo CSV e o formulário manual continuam respeitando o sexo preenchido pelo usuário.

Fonte, revisão fixa, hashes e limites: `assets/js/data/FONTES-NOMES.md`. Reprodução da base: `node scripts/gerar-base-nomes.js`. Regra: `domain/sexo-por-nome.js`. Testes: `tests/sexo-por-nome.test.cjs` e `tests/browser-sexo-nomes.cjs`.

## Login e sessão de 12 horas

A aplicação exige a senha compartilhada configurada no servidor. O navegador recebe um cookie HttpOnly, SameSite=Lax e Secure em HTTPS, assinado e com expiração fixa de 12 horas. Usar o sistema não prorroga a sessão. Ao expirar, o sistema bloqueia a interface e volta ao login; o servidor também bloqueia páginas e recursos protegidos. Sair remove o cookie, preservando os dados locais da escala. O acesso é compartilhado: não há contas individuais ou recuperação de senha.

**Antes de publicar na Vercel:** em Settings → Environment Variables, cadastre `AUTH_SESSION_SECRET` com um segredo aleatório de pelo menos 32 caracteres (gere com `openssl rand -hex 32`), nos ambientes usados, e faça um novo deploy. Não use a senha de acesso como segredo e não publique o valor no repositório. Sem essa variável, o acesso em produção fica bloqueado. Trocar o segredo invalida as sessões anteriores. O hash da senha é verificado no servidor; a senha não é enviada nos arquivos públicos. Não configure cache público para páginas protegidas.

`npm run dev` gera um segredo temporário em memória quando a variável não está definida; reiniciar o servidor encerra essas sessões. Para manter sessões locais, exporte a variável antes de iniciar. Os arquivos `.env` são apenas modelo de configuração: o servidor nativo não os carrega automaticamente. O build estático sozinho não fornece autenticação: na hospedagem devem estar ativos o middleware e a função `api/auth.js` da Vercel.

Validação específica: `node --test tests/auth.test.cjs` e `npm run test:auth:browser`. A suíte anterior de interface usa um servidor de teste sem autenticação para isolar as regressões funcionais; a suíte de autenticação usa o bloqueio real, inclusive nos recursos estáticos.

## Restrições individuais dos colaboradores

Na lista **Colaboradores cadastrados/importados**, abra **Restrições individuais** na ficha da pessoa. O preenchimento é opcional e atende cadastros manuais, CSV e Domínio. Há quatro condições por período (férias, afastamento, indisponibilidade ou folga obrigatória), indisponibilidades e folgas recorrentes por dia da semana e uma janela de horário permitido por dia. Salvar um horário para um dia já cadastrado substitui a janela anterior. Datas são inclusivas; janelas com saída anterior à entrada atravessam a meia-noite. Dias sem janela adicional mantêm a jornada configurada.

As condições são salvas no navegador e aplicadas tanto à escala atual quanto à proposta, nas respectivas datas. Alterar ou remover uma restrição invalida a escala e a comparação anteriores. Restrições com datas/horas inválidas e sobreposição de férias com afastamento não são aceitas. Dados legados sem restrições mantêm o comportamento anterior.

- **Férias (VA) e afastamento (AF):** retiram o colaborador da cobertura e diminuem a meta de alocação pelas horas que estavam originalmente previstas, sem redistribuir essas horas aos demais dias. Não são folgas compensatórias nem abono de feriado. A carga contratual permanece intacta. O resumo semanal discrimina período e horas retiradas da meta. Isso não calcula salário, benefícios ou efeitos previdenciários; apurações coletivas de compensação que incluam ausências ficam pendentes de conferência.
- **Indisponibilidade (I) e folga obrigatória (F):** impedem trabalho, inclusive por período. Na distribuição semanal, os dias obrigatórios são considerados antes das folgas opcionais. Não há abono automático para indisponibilidade. Se os bloqueios exigirem mais dias sem trabalho que o modelo comporta, a escala permanece como rascunho com a incompatibilidade e a orientação para revisar as condições/modelo.
- **Horários permitidos:** recortam a presença à interseção entre a jornada gerada e a janela permitida, preservando a pausa real e sem estender o expediente. O relatório explica as horas não alocadas e as lacunas por função. Esta etapa não busca automaticamente outro turno nem redistribui todas as horas perdidas; déficit da distribuição gerada não comprova, isoladamente, necessidade de contratação.
- **Turnos noturnos e 12×36:** uma data bloqueada também impede o plantão iniciado na véspera que invadir esse dia. Por segurança, esse plantão é retirado inteiro e identificado. Plantão 12×36 que não caiba na janela não é encurtado: fica indisponível, com diagnóstico e âncora do ciclo preservada. Data anterior à admissão continua sendo NC.

A grade, impressão, CSV, validações legais, cobertura operacional e comparação utilizam a presença resultante. Edições manuais não podem ultrapassar bloqueios ou janelas: é necessário revisar a condição no cadastro e gerar novamente. O comparativo de capacidade por função desconta ausências e janelas restritas. Resultados salvos de versões anteriores são invalidados pela nova versão das regras.

Regras em `assets/js/domain/restricoes.js`; formulário em `assets/js/ui/restricoes.js`. Testes: `tests/restricoes.test.cjs`, incluindo uma matriz de operações de comércio, padaria e drogaria, e `tests/browser-restricoes.cjs` na suíte de interface.


## Ajustes sugeridos para cobrir horários descobertos

1. Na ficha do colaborador, abra **Funções habilitadas para cobertura** e marque outras funções que ele pode exercer. A função principal já está habilitada. As opções vêm dos cargos e habilitações cadastrados, sem campo livre na cobertura. O sistema não infere qualificação profissional por nome ou semelhança de cargos.
2. Ative a cobertura, cadastre os mínimos e gere a escala ou a proposta 5×2. Na grade correspondente, use **Buscar ajustes de cobertura**.
3. Acompanhe o carregamento, o número de alternativas avaliadas e os ajustes encontrados. **Cancelar busca** encerra o processamento sem alterar a escala. A busca ocorre em um Web Worker local, sem enviar cadastros ou planilhas a serviços externos.
4. Confira a prévia por pessoa e data: trabalho/folga, função, entrada, saída, intervalo e horas antes/depois, redução de horas-pessoa descobertas, lacunas restantes e conferências da escala sugerida. **Aplicar ajustes sugeridos** atualiza grade, validações, cobertura, CSV e comparação. A origem da conversão é preservada quando os ajustes são feitos na proposta.
5. **Desfazer último ajuste** restaura o estado anterior à última aplicação, inclusive após recarregar. Alterações posteriores na escala ou configuração desabilitam o desfazer para preservar essas alterações. Não é um histórico completo de versões.

A busca tenta deslocar horários dentro das janelas operacionais cadastradas, incluindo o Turno B quando declarado, e das disponibilidades individuais; realocar o plantão para outra função explicitamente habilitada; ou trocar um dia de trabalho com uma folga da mesma semana, inclusive em uma troca coordenada entre duas pessoas. O intervalo pode acompanhar o horário sugerido e aparece na prévia. Nas propostas, a janela operacional original é preservada como teto, mesmo quando a geração inicial encurta a jornada para o limite da fase. Horários individuais da Domínio também são limites, não permissões para estender o expediente.

Cada alternativa aceita reduz as lacunas totais **sem criar ou agravar uma lacuna em outro horário ou função**. Conserva as horas computadas e a quantidade de dias trabalhados por pessoa/semana, exige ausência de erros objetivos nas validações dos colaboradores alterados e respeita jornadas, interjornada, repousos, admissão, feriados dispensados, folgas protegidas e restrições. Dias editados manualmente são preservados. Colaboradores com incompatibilidades objetivas precisam de revisão antes de receber ajustes. Pendências de fundamento ou conferência continuam visíveis e não representam aprovação automática.

O escopo atual realoca funções pelo plantão inteiro e não divide o mesmo funcionário entre funções simultâneas ou faixas dentro do dia. Não cria horas extras, não aumenta a jornada para preencher déficits, não altera plantões 12×36 nem ciclos importados diferenciados. A busca é determinística e limitada, por padrão, a **600 alternativas avaliadas e 20 ajustes aceitos** por execução; pode terminar antes ao não encontrar melhoria. Após aplicar uma melhoria, é possível buscar novamente. Nenhuma sugestão encontrada não é prova de inviabilidade global nem indicação automática de contratação.

Prévia e aplicação conferem se os dados permanecem atuais. Alterar cadastro, restrições, habilitações, demanda, horários ou a grade exige nova busca; proposta desatualizada precisa ser gerada novamente. As mudanças efetivas e o registro da última aplicação ficam no armazenamento local, sujeitos ao espaço disponível, com aviso se o salvamento falhar. O CSV identifica a função alocada no dia e os ajustes de cobertura aplicados; o cargo cadastrado é preservado.

Motor: `assets/js/domain/ajustes-cobertura.js`; habilitações: `assets/js/domain/funcoes.js`; execução: `assets/js/workers/ajustes-cobertura.js`; painel e cadastro: `assets/js/ui/ajustes-cobertura.js` e `assets/js/ui/habilitacoes.js`. Testes: `tests/ajustes-cobertura.test.cjs` e `tests/browser-ajustes-cobertura.cjs`, integrados às suítes existentes.

## Diagnóstico da equipe e contratação

A escala gerada e a comparação 6×1 → 5×2 mostram lacunas agrupadas por **função, dias da semana, horário e quantidade**, por exemplo: “Às terças e quintas, das 14:00 às 18:00: falta 1 pessoa na função Atendente”. Cada grupo informa as datas efetivamente afetadas, inclusive em meses parciais; não presume recorrência nas demais semanas.

O diagnóstico distingue quadro habilitado insuficiente, disponibilidade incompatível (incluindo férias, afastamentos, admissão e janelas permitidas), disputa entre funções pela mesma equipe e possibilidade de redistribuição. Verifica também os limites de horas e dias-pessoa por semana e horas por dia. Habilitações adicionais compartilham a capacidade de cada pessoa: ela não é duplicada para atender funções simultâneas. A comparação utiliza esse mesmo diagnóstico e o CSV inclui os grupos, datas, causas e verificações.

**Como interpretar:** falta mesmo sob um teto otimista de capacidade comprova insuficiência nas condições cadastradas; reveja a operação, disponibilidade ou reforço de equipe. Ausência temporária pode exigir reforço temporário. Se o teto comporta a demanda, teste **Buscar ajustes**: isso não garante uma redistribuição viável. O pico de déficit simultâneo não é o número exato de contratações e os déficits de períodos diferentes não devem ser somados como pessoas.

Pausas e interjornada continuam verificadas na escala e nas sugestões; o teto potencial não resolve uma otimização global. Em turnos noturnos e ciclos especiais, a prova usa disponibilidade simultânea, sem presumir rateio semanal de horas ou dias. Dados inválidos ou limite de processamento suspendem a conclusão de capacidade e preservam as lacunas observadas. Alterações invalidam a comparação anterior. Módulos: `domain/diagnostico-equipe.js`, `domain/disponibilidade.js`, `domain/fluxo-capacidade.js` e `ui/diagnostico-equipe.js`. Testes específicos: `tests/diagnostico-equipe.test.cjs`; integração na suíte de navegador (aplicar/desfazer, comparação, CSV e resultado desatualizado).

Os cartões de colaboradores nas escalas atual e proposta exibem o nome completo com quebra de linha, horários de entrada/saída e intervalo visível. A grade usa colunas mais largas, cartões com altura uniforme calculada pelo maior conteúdo da grade, independentemente do status; em telas menores, há rolagem horizontal. Os cartões também permanecem visíveis na impressão.

Nas duas prévias, a grade mensal aparece primeiro. Erros objetivos ficam abertos antes dela; análises documentais, informações e detalhes por colaborador ficam em um painel recolhido depois. A comparação detalhada também fica abaixo das prévias. A grade tem rolagem vertical e horizontal, barra horizontal sincronizada no topo e botão **Ver resumo da semana**, mantendo a última coluna acessível em telas menores ou com zoom. Ajustar uma célula preserva a posição da grade; na impressão, a altura deixa de ser limitada para incluir todas as semanas. Regressão de interface: `tests/browser-previas.cjs`.

## Impressão e PDF

A impressão acompanha a **etapa aberta**: use a impressão do navegador em qualquer etapa, inclusive antes de gerar uma escala. Abra os painéis de detalhes que deseja incluir. Na etapa de conversão, também ficam disponíveis os parâmetros e resultados exibidos. As outras etapas e os botões de ação ficam fora do documento; a impressão não troca de etapa nem modifica o preenchimento.


## Revisão da edição manual

Ao clicar em um cartão e alterar trabalho/folga, a grade já é recalculada e o painel **Revisão da edição manual** recebe foco. Ele mostra repousos e horas da semana civil, com aviso quando faltam repousos ou o alvo semanal é ultrapassado. A edição com incompatibilidades permanece como rascunho para revisão.

A busca em segundo plano tenta trocar outro dia do próprio colaborador e, quando necessário para preservar a cobertura, ajustar colegas habilitados na mesma semana. O dia escolhido e as demais edições manuais são preservados. A prévia permite escolher a alternativa e conferir cada mudança antes de **Aplicar readequação**. **Cancelar busca** mantém apenas a edição feita; **Desfazer última edição** restaura o dia anterior, inclusive após recarregar, enquanto os dados não tiverem mudado.

As sugestões conferem restrições, horários declarados, repouso e jornada; não aumentam as horas/dias de colegas nem criam novas lacunas em relação à cobertura anterior à edição. Sem faixas válidas, a cobertura é explicitamente indicada como não avaliada. Folgas fixas e ciclos especiais podem impedir a troca: 12×36 e ciclos importados continuam exigindo revisão própria. A busca avalia até sete bases e, para cada uma, até 100 tentativas e oito ações de cobertura. Não encontrar uma alternativa não comprova inviabilidade ou necessidade de contratação.

Implementação em `domain/edicao-manual.js`, `ui/edicao-manual.js` e `workers/edicao-manual.js`. Regressões em `tests/edicao-manual.test.cjs` e `tests/browser-edicao-manual.cjs` (avisos, proposta sem mutação, troca com colega, aplicar, cancelar, desfazer após recarga e altura uniforme em desktop, celular e impressão).
