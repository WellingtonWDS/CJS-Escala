# CJS Escala

Ferramenta estática para configurar, gerar e revisar escalas de trabalho. Usa HTML, CSS e módulos JavaScript nativos. Não exige backend nem compilação do JavaScript.

## Desenvolvimento

Requer Node.js 22 ou superior.

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

Ao ativar **horários por dia**, a geração limita a carga à janela de cada dia e redistribui o restante entre os dias com disponibilidade. Por exemplo, 44h em 6×1 podem ser distribuídas em 8h de segunda a sexta e 4h no sábado. O preenchimento `08:00 / 12:00 / 00:00 / 00:00` representa trabalho das 8h às 12h sem intervalo. Se a carga contratual exceder a capacidade, o resumo indica déficit. Turnos únicos também são limitados quando usados no horário padrão; a alternância A/B preserva sua duração a partir da entrada do turno.

Na escala 5×2, os dias não operacionais já contam como folga. Quando há operação nos sete dias, a rotação verifica a última folga da semana anterior e antecipa uma das duas folgas, se necessário, para evitar sete dias consecutivos sem acrescentar um terceiro repouso. A decisão é estável ao gerar períodos sobrepostos. Feriados não trabalhados contam primeiro entre as folgas no 5×2 e 6×1. A geração escolhe apenas as folgas restantes, sem duplicar um feriado que já cair em dia fechado ou em folga. Se dias fechados e feriados já ultrapassarem a quantidade de folgas, eles são preservados e o relatório explica a limitação. A opção **Trabalhar neste feriado**, em cada feriado, permite trabalho nessa data e mantém a distribuição normal das folgas; ela não obriga um colaborador que já estaria de folga a trabalhar. O ciclo 12×36 é preservado.

## Fechamento semanal e feriados

O resumo semanal usa uma única apuração (`domain/resumo-semanal.js`) para a apresentação e a validação contratual: **horas trabalhadas + horas abonadas por feriado = total considerado**. O abono vale apenas para feriado dispensado em um dia originalmente previsto como trabalho. Quando esse feriado ocupa uma das folgas no 5×2/6×1, a outra folga é liberada para trabalho; o abono mantém a carga originalmente prevista e apenas o saldo contratual é distribuído entre os dias de trabalho, sem duplicar horas. Feriado em folga, feriado trabalhado e folga compensatória não geram esse crédito. A descrição do abono, com data, nome e carga, aparece no Resumo da semana.

O crédito não é contado como presença na cobertura nem como hora efetivamente trabalhada para o limite semanal. A carga original de cada dia fica em `horasPrevistas`; para escalas antigas sem esse campo, a apuração usa a distribuição original da carga contratual entre os dias previstos da semana. Uma falta em outro dia continua gerando déficit. Nomes originais de demonstração intactos são substituídos por Colaborador 1 e Colaborador 2 na restauração; registros personalizados são preservados.

## Cobertura operacional

Ative o toggle de **Cobertura operacional** para cadastrar faixas recorrentes, informando função, horário, mínimo de pessoas, dias da semana e aplicação em feriados. A seção fica recolhida quando desativada. O select de função lista somente os cargos preenchidos livremente em **Cargo / função** nos colaboradores; novos cargos são cadastrados ali. Desativar a cobertura suspende a análise e preserva as faixas salvas. Cadastros antigos que já tinham faixas mantêm a análise ativa na migração. Nomes de função ignoram acentos, maiúsculas e espaços extras; cada pessoa exerce uma única função nesta versão.

Ao gerar a escala, o relatório mostra data, função, período descoberto, mínimo, presentes e faltantes. A análise usa os horários individuais, exclui intervalos e folgas e considera plantões iniciados no dia anterior. Horários noturnos têm término no dia seguinte. Faixas sobrepostas da mesma função usam o maior mínimo, sem somar demandas duplicadas. Os dias/feriados escolhidos referem-se ao início da faixa, independentemente dos dias operacionais da empresa.

A pausa mantém sua distância da entrada configurada, inclusive no Turno B; em jornadas menores, é antecipada para caber no plantão. O intervalo efetivo aparece na descrição do dia na grade. A análise ocorre em minutos e se limita ao período selecionado. O total de horas-pessoa faltantes soma a duração de cada lacuna multiplicada pela quantidade de pessoas que faltam.

O módulo `domain/cobertura.js` é independente da interface e não modifica a configuração ou a escala. As demandas ficam em `demandasCobertura`, preservando a chave existente do armazenamento. Sem demandas, a cobertura por função é identificada como não avaliada. Alterar demandas ou cargos invalida a escala; editar um status diário recalcula a cobertura. A funcionalidade diagnostica lacunas, mas não redistribui automaticamente a equipe.

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
