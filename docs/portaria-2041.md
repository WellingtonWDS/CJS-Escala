# Portaria MTE nº 2.041/2026 e Decreto nº 13.173/2026 — adequação

Portaria publicada no DOU de 23/11/2026 (Edição 219-A, Seção 1 Extra A). Ela complementa o Decreto nº 13.173, de 19/11/2026, e revoga o § 2º do art. 58 da Portaria MTP nº 671/2021, que exigia domingo de repouso ao menos uma vez a cada 7 semanas.

Regras **`ec141-2026-11-24-17`**: gere novamente os resultados anteriores; os cadastros permanecem. Não há migração SQL, RPC nova, variável nova nem mudança no n8n. Os instaladores DEMO foram regenerados apenas para incluir o novo campo `turnosIninterruptos: false`.

## O que mudou no sistema

| Regra | Fundamento | Dinâmica | Fixa |
|---|---|---|---|
| Descanso de 11h somado às 24h de cada repouso intercalado: 35h com 1 repouso e 59h com 2 seguidos | Portaria, art. 4º, § 2º | A validação aponta erro (`INTERJORNADA`). A geração atrasa a entrada do dia seguinte ao repouso quando necessário, sem mudar a carga, e registra o atraso (`DESCANSO_AJUSTADO`, informativo). A busca de ajustes de cobertura respeita o mesmo mínimo. | O padrão semanal é conferido de forma cíclica: a saída do último dia da semana é comparada com a entrada da semana seguinte. O atraso é aplicado igualmente em todas as semanas, preservando o padrão recorrente. |
| Comércio: repouso em pelo menos 1 domingo a cada 3 semanas | Lei 10.101/2000, art. 6º; Portaria 671, art. 58, § 3º; Portaria 2.041, art. 5º, § 4º | Erro `DOMINGO_COMERCIO` no 3º domingo seguido trabalhado. A geração com folgas rotativas passa a folga pelo domingo em rodízio entre os colaboradores, inclusive na proposta 5×2. | Domingo trabalhado no padrão gera erro `DOMINGO_FIXO`, porque se repete em todas as semanas. |
| Empregadas: revezamento quinzenal que favoreça o repouso dominical | CLT, art. 386; Portaria, art. 5º, § 3º | Alerta `DOMINGO_MULHER` no 2º domingo seguido trabalhado. A geração passa a folga pelo domingo a cada 2 semanas quando o domingo é dia permitido de folga. | Erro `DOMINGO_FIXO`. |
| Demais atividades: domingo de repouso preferencialmente 1 vez a cada 4 semanas (substitui a regra de 7 semanas) | Portaria, art. 5º, § 5º | Alerta `DOMINGO_PREFERENCIAL` no 4º domingo seguido. A geração faz o rodízio a cada 4 semanas quando o domingo é dia permitido de folga. | Alerta `DOMINGO_FIXO_PREFERENCIAL`. |
| Comércio sem autorização confirmada para domingos | Lei 10.101/2000, art. 6º | Alerta `DOMINGO`. | Alerta `DOMINGO`. |
| 12×36: média semanal do mês-calendário acima do limite exige compensação ou horas extras | Decreto, art. 3º; Portaria, arts. 3º e 8º | `MEDIA_12X36`: pendência quando há ACT/CCT para 12×36, alerta quando não há. | A 12×36 não se repete nos mesmos dias da semana; continua disponível só na dinâmica. |
| Turnos ininterruptos de revezamento (turnos alternados que alcançam os períodos diurno e noturno): 6h diárias, salvo ACT/CCT, com média mensal no limite e dois repousos | Decreto, art. 2º; Portaria, art. 7º | Erro `TURNO_ININTERRUPTO` para dias acima de 6h sem instrumento. Com a cláusula "Autoriza mais de 6h diárias em turnos ininterruptos de revezamento", vira pendência; se a média do mês passar do limite, gera erro `TURNO_ININTERRUPTO_MEDIA`. | Na fixa, cada colaborador mantém o mesmo turno em todas as semanas (não há revezamento individual). |
| Férias não podem começar nos 2 dias antes de feriado ou repouso | CLT, art. 134, § 3º; Portaria, art. 4º, § 5º | Alerta `FERIAS_INICIO`. | Férias têm datas reais e não fazem parte do padrão fixo. |
| Compensação de horas: limite médio aferido no mês-calendário | Portaria, art. 3º | Pendência `COMPENSACAO_MES` quando o período de apuração não é um mês-calendário. | A compensação por período exige datas reais (dinâmica). |
| Exceção de diploma superior e alta remuneração | Portaria, art. 9º, §§ 1º e 2º | Campo de remuneração orienta usar a média de 12 meses quando a remuneração é variável. O rótulo passou a "Controle de jornada mantido por liberalidade ou previsão coletiva". | Igual. |
| Termo aditivo: divisor do salário-hora | Decreto, art. 5º; Portaria, art. 10 | Nova cláusula "Salário-hora": divisor 210 na fase de 42h e 200 a partir de 16/12/2027, ou o divisor da jornada contratual menor (por exemplo, 180 para 36h). Prevalece o mais favorável e fica dito que não é reajuste. | Igual. |

## Onde configurar

- **Definição de folgas → Repouso aos domingos:** "Atividade do comércio em geral (Lei nº 10.101/2000)" e "Trabalho aos domingos autorizado pela legislação municipal e pela convenção coletiva".
- **Tipo de escala → Condições do ACT/CCT:** "Autoriza mais de 6h diárias em turnos ininterruptos de revezamento".

## Limites conhecidos

- As sequências de domingos são conferidas no período gerado: o mês e a semana anterior. A geração usa um rodízio contínuo por semana, então a sequência se mantém entre meses consecutivos.
- O rodízio dominical na geração vale para semanas com duas folgas (5×2 e 6×1 a partir da 1ª fase). Em semanas com uma única folga (6×1 antes de 16/12/2026 ou com compensação mensal), mudar a folga para o domingo criaria sequências longas de trabalho. Nesses casos, só a validação aponta.
- Com "Folgas fixas" escolhidas pelo usuário, a geração respeita os dias informados e a validação aponta o que faltar.
- O atraso de entrada para garantir o descanso não ultrapassa 6h e, na proposta 5×2, não ultrapassa o horário de funcionamento. Quando não cabe, a validação mantém o erro.
- Remuneração do repouso (art. 11), perda do repouso (art. 12), pagamento em dobro (art. 5º, § 6º), saúde e segurança (arts. 14 e 15), dupla visita (art. 17) e eSocial (art. 18) são de folha de pagamento ou fiscalização e ficam fora da escala.

## Testes

- `tests/portaria-2041.test.cjs`: descanso de 35h e 59h; atraso de entrada na dinâmica e na fixa; rodízio de domingos no comércio; sequências de domingos por regra; domingo no padrão fixo; média da 12×36; turnos ininterruptos; início de férias; mês-calendário.
- `tests/browser-domingos.cjs`: campos de domingos e da cláusula de turnos ininterruptos, persistência, contraste e celular.
- Testes existentes atualizados: a troca de turno B→A deixou de gerar descanso curto, e o termo aditivo ganhou a cláusula do salário-hora.
