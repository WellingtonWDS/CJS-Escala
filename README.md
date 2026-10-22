# CJS Escala

Ferramenta estática para configurar, gerar e revisar escalas de trabalho. Usa HTML, CSS e módulos JavaScript nativos. Não exige backend nem compilação do JavaScript.

## Conversão da escala atual 6×1 para uma proposta 5×2

1. Preencha o período, colaboradores, jornadas, dias de funcionamento, folgas e feriados **como estão atualmente no 6×1**. Para avaliar suficiência, ative a cobertura e informe a demanda por função, horário e dia.
2. Em **Conversão e comparação**, escolha o mês de destino, a vigência automática ou uma simulação explícita de 42h/40h e a distribuição de folgas. Clique em **Gerar proposta 5×2 e comparar**.
3. Confira a comparação, os horários descobertos e a nova grade. A proposta pode ser ajustada nas células e exportada pelo botão próprio. A prévia avulsa e a exportação da escala atual continuam disponíveis separadamente.

A origem e a proposta são configurações e resultados distintos. A conversão não troca o modelo, período ou cadastro da origem. O snapshot original preserva uma grade já gerada, incluindo seus ajustes manuais; sem grade anterior, a referência usa os horários atuais informados, sem reduzir a duração para limites futuros. Para comparar períodos de comprimentos diferentes, o relatório projeta o padrão original 6×1 também no mês de destino. Ajustes pontuais datados da grade original não são transpostos automaticamente para outras datas.

Os dias de funcionamento são preservados: uma loja aberta de segunda a sábado continua aberta aos sábados. A proposta distribui até cinco dias de trabalho, preserva contratos, funções, entradas/grupos de turno e usa as janelas atuais como limites. Respeita dias permitidos e folgas fixas atuais; sábado e domingo fixos são uma escolha explícita no destino. Não estende saídas nem presume ACT/CCT. Sem fundamento coletivo aplicável, mantém até 8h diárias: a distribuição de 42h em cinco dias pode exigir revisão, registrada nos déficits/alertas.

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
index.html                      Estrutura e conteúdo da página
assets/css/styles.css           Estilos próprios e impressão
assets/js/
  main.js                       Inicialização no navegador
  app.js                        Montagem da aplicação e coordenação dos módulos
  config/                       Regras de jornada, constantes e tema Tailwind
  domain/                       Datas, feriados, cálculo e validação das escalas
  state/                        Estado inicial e persistência
  ui/                           Formulários, colaboradores, calendário e transição
  shared/                       Formatação de texto e escape
  export/                       Geração e download de CSV
scripts/                        Servidor local e preparação da publicação
tests/                          Regressões e fluxos no navegador
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

Ative o toggle de **Cobertura operacional** para cadastrar faixas recorrentes, informando função, horário, mínimo de pessoas, dias da semana e aplicação em feriados. A seção fica recolhida quando desativada. O select de função lista somente os cargos preenchidos livremente em **Cargo / função** nos colaboradores; novos cargos são cadastrados ali. Desativar a cobertura suspende a análise e preserva as faixas salvas. Cadastros antigos que já tinham faixas mantêm a análise ativa na migração. Nomes de função ignoram acentos, maiúsculas e espaços extras; cada pessoa exerce uma única função nesta versão.

Ao gerar a escala, o relatório mostra data, função, período descoberto, mínimo, presentes e faltantes. A análise usa os horários individuais, exclui intervalos e folgas e considera plantões iniciados no dia anterior. Horários noturnos têm término no dia seguinte. Faixas sobrepostas da mesma função usam o maior mínimo, sem somar demandas duplicadas. Os dias/feriados escolhidos referem-se ao início da faixa, independentemente dos dias operacionais da empresa.

A pausa mantém sua distância da entrada configurada, inclusive no Turno B; em jornadas menores, é antecipada para caber no plantão. O intervalo efetivo aparece na descrição do dia na grade. A análise ocorre em minutos e se limita ao período selecionado. O total de horas-pessoa faltantes soma a duração de cada lacuna multiplicada pela quantidade de pessoas que faltam.

O módulo `domain/cobertura.js` é independente da interface e não modifica a configuração ou a escala. As demandas ficam em `demandasCobertura`, preservando a chave existente do armazenamento. Sem demandas, a cobertura por função é identificada como não avaliada. Alterar demandas ou cargos invalida a escala; editar um status diário recalcula a cobertura. A análise isolada diagnostica lacunas; o fluxo de conversão usa essa análise para buscar uma distribuição das folgas.

## Cadastro por planilha

Além do CSV e do cadastro manual, a terceira seção recolhível **Importar planilha da Domínio — Quadro de Horário de Trabalho** aceita relatórios `.xls` e `.xlsx` de até 5 MB. As três formas começam fechadas. A prévia informa empresa, CNPJ, empregador/endereço, pessoas e pendências antes de alterar o cadastro. O conteúdo original dos relatórios enviados por usuários não é publicado com a aplicação.

O importador identifica as colunas pelo título e reúne linhas de cada colaborador pelo código. Preserva nome, cargo, admissão, CTPS/série com zeros à esquerda, visto fiscal, dias agrupados ou separados, entradas, intervalos, saídas, folgas e ciclos. Empresa, páginas indicadas, licenciamento do relatório e células adicionais ficam guardados como metadados. O cadastro manual permite consultar os valores originais e revisar os horários individuais, sem sobrescrever o registro original da importação.

Os horários individuais são usados na geração, validação, cobertura e conversão 6×1 compatível; não são reduzidos a um horário padrão da empresa. Na referência importada, mantém-se a duração efetivamente informada, mesmo que produza alertas legais ou exceda a carga contratual confirmada. Admissão impede trabalho em datas anteriores, marcadas como **NC**, sem contá-las como folga; a semana parcial recebe conferência específica. A exportação CSV inclui a empresa e a identificação da Domínio.

Informações não disponíveis no relatório não são inventadas:

- Sexo fica **Não informado**. A carga semanal é calculada dos horários completos, identificada como estimativa até confirmação do contrato; não é presumida como 44h.
- Horários `00:00–00:00` sem indicação de folga, intervalos fora da jornada e dias conflitantes ficam pendentes de revisão. A geração exige horários completos. Dias não listados só viram folga mediante confirmação explícita na prévia ou revisão individual.
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

`npm run build` copia apenas `index.html` e `assets/` para `dist/`. A configuração em `vercel.json` define esse comando e essa pasta de publicação. Não há bundler: os módulos são publicados com seus caminhos relativos, e testes e ferramentas de desenvolvimento ficam fora da saída.

O site continua carregando Tailwind e fontes por CDN, como na versão anterior. Os dados permanecem no navegador e na origem do site; mudar o domínio da implantação não transfere o `localStorage` de uma origem para outra.
