# Interface e revisão visual

Revisão de 27/10/2026, preservando os fluxos, dados e regras de negócio.

## Direção visual

- Fundo neutro e cartões brancos, bordas suaves e sombra discreta. Títulos maiores identificam a seção e textos auxiliares têm hierarquia secundária.
- Menu lateral azul escuro com ícones vetoriais e indicação da página selecionada. Cabeçalho claro separa contexto de ações; saída continua no final do menu.
- Ações principais em verde, ações secundárias com borda e operações destrutivas identificadas em vermelho. Estados de erro, aviso e status da escala conservam suas cores e textos.
- Etapas em uma faixa com seleção destacada e modo compacto durante a rolagem. No celular, a faixa continua acessível por rolagem horizontal.
- Controles de formulário com altura mínima de 44px; no celular, fonte de 16px evita ampliação automática ao focar. Toggles decorativos mantêm input acessível, área clicável e indicação de foco.
- Importações e opções avançadas continuam recolhíveis. Cadastros, edição, modais e salvamento usam a mesma linguagem visual.
- A grade conserva altura uniforme dos colaboradores, horários completos e rolagem própria. A impressão mantém os controles de visibilidade existentes.

## Ajuda contextual nos colaboradores

Explicações longas de carga contratual, horários individuais, funções e restrições ficam em ícones circulares escuros de **?**. A ajuda abre ao passar o mouse, focar pelo teclado ou tocar/clicar, e fecha com Escape, clique fora ou rolagem. O balão fica dentro da tela e acima dos elementos, sem ser cortado pelos quadros. Não aparece na impressão.

Série, visto fiscal e a linha de origem do arquivo não são exibidos no cadastro. Os dados importados são preservados; avisos de inconsistência, pendências e resultados calculados que exigem análise continuam visíveis.

## Identidade Reescala

Os arquivos originais de `logos/` são copiados integralmente para a publicação. Símbolo colorido no login/cabeçalho e favicon; branco transparente no menu e no centro do carregamento; preto transparente na impressão da escala. O nome Reescala acompanha o símbolo, que permanece visível no menu recolhido. As versões com fundo sólido ficam disponíveis para usos externos; a versão preta sobre branco é usada no ícone Apple. Somente os três arquivos necessários antes do login são públicos; módulos e dados continuam protegidos. As chaves internas de armazenamento, API e permissões mantêm seus nomes para preservar os dados existentes.

## Organização dos estilos

`interface.css` é a camada visual compartilhada e vem depois dos arquivos específicos. As regras de tela ficam em `@media screen`; não substituir regras de impressão com seletores globais indiscriminados. `login.css` mantém o acesso independente dos estilos internos. `motion.css` continua responsável por animações e movimento reduzido.

O Tailwind 3.4.19 está fixado como dependência de desenvolvimento. `tailwind.config.cjs` contém a paleta e os caminhos de conteúdo. Não incluir bases de dados na varredura de classes. A compilação usa `utilities-source.css` e gera `assets/css/utilities.css`, ignorado pelo Git, além de copiá-lo para `dist`. O navegador não executa o Tailwind nem depende de seu CDN. Fontes do Google são opcionais e têm fallback de sistema.

```bash
npm ci
npm run build
npm run dev
```

`npm run dev` tem preparo automático de build. Depois de alterar classes utilitárias ou a configuração, refaça o build. Instale dependências de desenvolvimento na etapa de construção; a publicação serve os arquivos de `dist`.

## Conferência

```bash
npm test
npm run test:browser
npm run test:auth:browser
npm run test:identity:browser
```

A suíte `browser-interface.cjs` verifica estilos locais, contraste do cabeçalho, ausência do script Tailwind remoto, oito etapas em 320/375/768/1440px sem rolagem horizontal da página, impressão e login móvel. Os demais testes conferem importação, tutorial, modais, loading, geração, edição, empresas e preenchimentos. Integração usa PostgreSQL/PostgREST locais; não atesta implantação remota.

Conferir visualmente também com fontes reais, zoom do navegador, nomes longos e dados da empresa. Testes automatizados de layout não equivalem a uma auditoria completa de acessibilidade nem a testes em todos os aparelhos físicos.
