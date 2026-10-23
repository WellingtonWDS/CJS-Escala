# CJS Escala

Ferramenta para configurar, gerar e revisar escalas de trabalho e comparar a escala atual 6×1 com uma proposta 5×2. A interface e os cálculos usam HTML, CSS e módulos JavaScript nativos no navegador, sem bundler ou compilação do JavaScript da aplicação. A autenticação depende de código no servidor: middleware e função de login na Vercel. Os cadastros e as escalas continuam armazenados no navegador, sem banco de dados central.

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

## Testes

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Os testes de regressão importam os módulos reais. O teste de navegador prepara e serve a saída de produção e verifica modelos de escala, edição, persistência, turnos, comparativo, invalidação e download CSV. Fontes e Tailwind externos são simulados nesse teste para isolar a aplicação da rede; ele não valida esses serviços nem a aparência completa.

Para usar um Chromium já instalado:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

## Vercel

`npm run build` prepara `dist/` com `index.html`, `login.html`, `assets/` e o leitor Excel local com sua licença. A configuração em `vercel.json` define esse comando e essa pasta para os arquivos estáticos. Não há bundler para os módulos da aplicação: eles são publicados com seus caminhos relativos, e testes e ferramentas de desenvolvimento ficam fora da saída.

A implantação também precisa do middleware da raiz, de `api/auth.js` e do módulo de autenticação em `server/`, processados pela Vercel separadamente dos arquivos estáticos. Publicar somente `dist/` em um servidor estático não reproduz a proteção de acesso. Configure `AUTH_SESSION_SECRET` nos ambientes utilizados e faça novo deploy, conforme [Login e sessão de 12 horas](#login-e-sessão-de-12-horas).

O site continua carregando Tailwind e fontes por CDN, como na versão anterior. Os dados permanecem no navegador e na origem do site; mudar o domínio da implantação não transfere o `localStorage` de uma origem para outra.

O painel **Preencher colaboradores manualmente** contém somente o formulário de inclusão (nome, sexo, cargo e carga contratual). Confirmar um cadastro adiciona a pessoa à lista **Colaboradores cadastrados/importados**, limpa o formulário e leva o foco para essa lista, onde todos os registros podem ser editados ou removidos. Confirmar uma importação CSV ou Domínio recolhe os painéis de importação e leva à mesma lista, com a mensagem de resultado visível. Prévia, cancelamento e erros não disparam essa navegação.

## Navegação por etapas

O preenchimento usa uma barra horizontal de oito etapas: Configuração, Tipo de escala, Feriados, Jornada, Folgas, Cobertura, Emenda Constitucional e Conversão e comparação. Apenas a etapa selecionada aparece; os botões Avançar/Voltar e os links da barra usam os mesmos formulários, preservando os dados e rascunhos sem recarregar a aplicação. A etapa aparece no endereço (`#sec-jornada`, por exemplo), permitindo recarga, links diretos e voltar/avançar pelo navegador. A barra também aceita setas, Home e End, com indicação da etapa atual e foco no título ao navegar.

O tutorial abre a etapa de cada destaque e restaura a etapa anterior ao encerrar. A impressão continua exibindo a escala da etapa final, inclusive quando outra etapa está aberta na tela. Módulo: `ui/etapas.js`; regressões específicas: `tests/browser-etapas.cjs`. Os testes dos demais fluxos navegam pela barra antes de operar seus campos.

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
