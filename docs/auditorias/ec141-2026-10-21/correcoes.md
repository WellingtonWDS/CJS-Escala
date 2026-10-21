# Correções da auditoria EC 141

A implementação usa o texto da emenda fornecido para o projeto. O relatório original permanece como registro do commit auditado, e o comportamento corrigido é verificado em `tests/ec141.test.cjs` e `tests/browser-ec141.cjs`.

| Achado | Correção e cenário de aceitação |
| --- | --- |
| A — 2028 com 44h/uma folga | Modo automático resolve vigência por data, programa 40h e dois repousos; contrato de referência permanece 44h. |
| B — seleção de ACT/CCT atenua excesso | Só seleção não atenua; verificam-se vigência, compatibilidade, cláusula e parâmetros. Compensação de horas exige período completo, média efetiva e teto de pico. Pendência documental permanece mesmo quando os números fecham. |
| C — 42h em cinco dias sem cláusula | Excesso diário sem autorização válida é erro. ACT/CCT vencido, incompatível, sem datas ou fora do limite não autoriza a distribuição. |
| D — dispensa automática do 12×36 | Referência semanal é verificada. Regime diferenciado declarado não é presumido regular: recebe pendência de enquadramento e conferência específica. |
| E — preservar contratos menores | Contratos de 20h, 30h e 40h não recebem redução proporcional. |
| F/G — meses de transição | Datas anteriores e posteriores ao dia 16 têm fases distintas. Semana atravessando o marco usa programação conservadora e fica pendente de conferência, sem rateio legal presumido. |
| H — descanso da primeira jornada | Contexto anterior incluído na validação de interjornada e dias consecutivos, sem emitir de novo os achados fora da grade. |
| Compensação mensal de repousos | Modalidade explícita por ACT/CCT, mês completo mesmo com início tardio, referência de média proporcional aos dias do mês e verificação separada de sete dias consecutivos. |
| Feriados | Política anterior preservada com indicação de conferência do fundamento; alternativa para manter folgas e acrescentar feriados. Sábado/domingo fixos preservados. |
| Proteção salarial e pisos | Comparação anterior/atual no cadastro; redução sinalizada como erro e ausência de dados como pendência. Nenhum salário é alterado. |
| Art. 8º | Diploma, remuneração mínima, teto RGPS declarado, exclusão do empregado público e manutenção voluntária/coletiva de jornada. Exceção não elimina repousos e permanece sujeita à comprovação documental. |
| Art. 9º | Contrato vigente na publicação, emprego direto de mão de obra, data do aditamento, prazo máximo e aditamento antecipado. Segundo repouso mantém vigência geral. |
| Exportação e resultados antigos | CSV com detalhes e ocorrências, claramente identificado como rascunho quando houver pendências/erros. Resultados antigos invalidados por versão das regras; cadastros preservados. |

A geração resolve a referência geral e calcula cenários. Não atesta validade documental, não consulta automaticamente o teto RGPS, não homologa ACT/CCT e não transforma hipóteses jurídicas sem regra explícita em aprovação automática. Semanas/meses de transição e regimes diferenciados permanecem marcados para conferência quando o texto não fornece um critério operacional suficiente.

O comparativo da seção 7 continua sendo uma projeção das referências gerais, não um cálculo salarial nem uma redução automática de contratos individuais. A apuração de compensação de horas só usa períodos inteiramente disponíveis na escala/contexto; períodos mais longos exigem dados completos antes de qualquer conclusão.
