# PDF resumido do empregador — 17/11/2026

O download **Baixar PDF do empregador** passa a produzir uma síntese da equipe, nas escalas atual/proposta e nos modelos mensal dinâmico/fixo. Mantém A4 paisagem, logo Reescala, empresa/CNPJ quando informados, período, referência de jornada, identificação de rascunho e numeração de páginas.

## Organização

1. **Quadro de horários:** reúne os dias em que o mesmo colaborador tem situação, entrada, intervalo, saída, trabalho efetivo e função exatamente iguais. Folgas, feriados, férias/afastamentos e horários especiais continuam em linhas próprias quando diferem. No mensal, a coluna Dias usa números do mês do cabeçalho; no fixo, dias da semana. Uma faixa “01 a 03” só é usada quando todos esses dias pertencem ao mesmo grupo.
2. **Carga semanal:** tabela única da equipe com computadas/alvo, situação e cores verde/âmbar/vermelho. Havendo abono de feriado ou créditos CCT, também mostra as parcelas trabalhadas, abonadas e creditadas. Semanas civis conservam a apuração original, inclusive contexto do mês vizinho e indicação de semana parcial.
3. **Cobertura:** mostra as funções, datas, faixas descobertas e quantidades faltantes. Faixas contíguas com o mesmo déficit são reunidas; dias com a mesma faixa também são agrupados. Não preenche intervalos cobertos nem mistura déficits diferentes. Demanda não cadastrada e avisos de cobertura continuam explícitos; ausência de lacunas não é tratada como prova de necessidade ou dispensa de contratação.
4. **Pontos de atenção:** reúne textos repetidos por condição/severidade, mantendo a quantidade de ocorrências, os colaboradores e as referências de cada pessoa. Valores, ações e datas dentro da mensagem permanecem distintos; somente a referência inicial é apresentada separadamente. Erros continuam destacados antes do quadro e no detalhamento.

Os colaboradores são numerados dentro do documento para facilitar referências e distinguir homônimos. As quebras acompanham o conteúdo, sem iniciar uma página por pessoa ou por seção. Fontes das tabelas em 8,5pt, sem cortar nomes/horários ou esconder avisos para caber em uma quantidade fixa de páginas.

## Redução verificada

Cenário DEMO com cinco colaboradores, mesmos dados antes/depois:

| Modelo | PDF anterior | PDF resumido |
| --- | ---: | ---: |
| Mensal dinâmico | 22 páginas | 3 páginas |
| Fixo | 7 páginas | 2 páginas |

A quantidade final depende da equipe e da diversidade dos horários/condições. Datas ou situações realmente diferentes continuam detalhadas. O relatório completo por data de cada colaborador permanece nos PDFs individuais do ZIP e no sistema.

## Uso e implantação

Basta baixar novamente o PDF do empregador após a publicação. Os preenchimentos e escalas existentes não precisam ser recalculados por causa desta mudança de apresentação. Não altera jornadas, regras da EC 141, cobertura calculada, banco ou permissões. A versão das regras continua `ec141-2026-11-12-14`; sem SQL, RPC, variável ou dependência nova.

Arquivos principais: `assets/js/export/pdf-empregador.js` (composição do documento), `resumo-empregador.js` (agrupamentos) e `pdf.js` (seleção entre empregador/individual e identidade comum).

## Verificação

**598 testes unitários**, build e downloads reais de PDF/ZIP pelo navegador aprovados nas duas origens e nos dois modelos. Regressões cobrem reconstrução das datas/horários agrupados, pausas e funções diferentes, homônimos, vínculos pessoa/referência, severidades/valores distintos, horários descobertos contíguos, preservação da origem, cobertura ausente/inválida, paginação compacta, isolamento individual e logo. Páginas rasterizadas e texto extraído para conferência visual de tabelas, resumo e avisos.
