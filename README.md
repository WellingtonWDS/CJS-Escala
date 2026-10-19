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

O domínio recebe a configuração explicitamente, por meio de `createDomain(state)`, e não acessa HTML, armazenamento ou variáveis globais da aplicação. `gerarDadosEscala()` devolve a escala e suas validações; a interface decide quando exibi-la e salvá-la. Cada instância da aplicação possui seu próprio estado.

A interface recebe suas dependências na criação: estado, funções do domínio, persistência, recursos do navegador e callbacks entre seções. Os eventos são registrados em `bindEvents()`, e os dados são restaurados em `init()`. Importar os módulos não inicializa a página.

A persistência mantém a chave `fintria-escala-dp-v2` e o formato dos dados da versão anterior. A restauração atualiza o mesmo objeto de estado, preservando as referências usadas pelos módulos. A regra de abrir no mês atual foi mantida.

Para manutenção:

- Alterações em cálculos e validações pertencem a `domain/`; mantenha o acesso ao DOM em `ui/`.
- Regras e referências compartilhadas ficam em `config/regras-jornada.js`.
- Novos eventos devem invalidar a escala quando a configuração mudar e salvar as alterações pela persistência.
- Preserve a chave de armazenamento; mudanças no formato exigem migração dos dados existentes.

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
