# Cenários DEMO por segmento

Quatro novas empresas e onze preenchimentos fictícios, no mesmo escritório **DEMO**. O segmento aparece na razão social; cada preenchimento identifica a situação a testar. O exemplo original permanece intacto. Não são recomendações de dimensionamento para empresas reais: as demandas mínimas foram escolhidas para reproduzir os testes abaixo.

## Instalação na VPS

Sem conexão administrativa com a VPS no ambiente de desenvolvimento, a instalação remota precisa ser executada no servidor. Requer migrações 001–008 e o usuário Admin global ativo já cadastrado. Não cria contas, senhas ou acesso público.

```bash
curl --fail --show-error --location \
  https://raw.githubusercontent.com/WellingtonWDS/CJS-Escala/main/database/demo/segmentos.sql \
  --output /tmp/reescala-demo-segmentos.sql

docker exec -i postgres_apps psql -U postgres -d cjs_escala \
  -v ON_ERROR_STOP=1 \
  -v identity_subject=582f53bf-1918-44e9-9fe1-5cb6699f5058 \
  < /tmp/reescala-demo-segmentos.sql
```

O retorno lista **11 preenchimentos em quatro empresas**. O instalador cria o escritório DEMO se necessário, sem depender do instalador anterior. Atualize a página, abra **Empresa atual e Preenchimentos**, selecione DEMO, a empresa pelo segmento e o modelo; clique em abrir. Na etapa 8, gere a escala atual e, quando aplicável, a proposta.

Somente o Admin informado recebe vínculo. Outros Admins globais mantêm seu acesso a todos os escritórios; Gerentes e Operadores de outros escritórios não ganham acesso. CNPJs, nomes e instrumentos coletivos são fictícios. Resultados começam vazios para usar os cálculos atuais ao gerar.

## Modelos

| Empresa / modelo | Colaboradores | O que testar |
| --- | ---: | --- |
| Comércio — intervalos distribuídos | 8 | Quatro atendentes e quatro caixas cobrem o atendimento contínuo na referência atual. |
| Comércio — almoços juntos: readequar | 8 | A mesma equipe fica sem cobertura durante os almoços; redistribuir intervalos reduz as lacunas. |
| Comércio — equipe reduzida: contratar | 2 | Um atendente e um caixa: capacidade insuficiente na proposta, mesmo com redistribuição. |
| Fazenda — sábados compensados e almoço coletivo | 6 | Compensação de 44h e proposta de 40h com cobertura suficiente, sem deslocar o almoço coletivo. |
| Fazenda — safra: contratar trabalhadores | 6 | A demanda passa a sete trabalhadores simultâneos; aparece insuficiência de capacidade. |
| Entidade — 12×36 dia/noite + administrativo | 18 | Oito cuidadores, oito enfermeiros e dois administrativos; referência atual cobre as 24h, inclusive intervalos e feriado. |
| Entidade — grupos no mesmo dia: readequar ciclos | 18 | Grupo B com a mesma data inicial de A: sobram pessoas num dia e falta no outro. Corrigir as datas de B restaura cobertura sem contratar. |
| Entidade — falta cobertura nos intervalos: contratar | 10 | Quatro cuidadores e quatro enfermeiros, mais dois administrativos; falta substituição durante os intervalos dos plantões. |
| Padaria — turnos distribuídos 06h–20h30 | 12 | Seis atendentes e seis padeiros divididos em três turnos; referência atual coberta. |
| Padaria — pausas simultâneas: readequar | 12 | A mesma quantidade dividida entre abertura e fechamento, com pausas coincidentes; lacunas diminuem com readequação. |
| Padaria — equipe enxuta: contratar | 4 | Dois atendentes e dois padeiros; a proposta apresenta capacidade insuficiente para a operação completa. |

### Comércio

Operação **segunda a sexta, 08h–18h, sem fechar no almoço; sábado, 08h–14h**. Mínimo de um atendente e um caixa durante todo esse período. Domingo sem operação; feriados nacionais não trabalhados na referência. Os empregados trabalham 08h–18h com duas horas de intervalo nos dias úteis e quatro horas no sábado, distribuídas entre 08h–12h e 10h–14h. Cada contrato tem referência de 44h. O modelo de almoços juntos tem intervalos 11h–13h e precisa de redistribuição.

### Fazenda

Sem trabalho aos sábados ou domingos. Seis contratos de 44h: quatro empregados entram às 07h e dois às 08h; segunda a quinta trabalham nove horas efetivas, sexta oito. **Todos param de 12h a 13h**, sem demanda de cobertura nesse intervalo. O sábado está marcado **Compensado**, sem disponibilidade para reposição. ACT/CCT **DEMO FICTÍCIO** declara compensação diária com limite de 10h para o exemplo 9+9+9+9+8=44; não equivale a autorização de uma empresa real.

Cobertura exigida de um trabalhador, 07h–12h e 13h–17h de segunda a quinta, e até 16h na sexta. A frente com entrada às 08h mantém a cobertura final na proposta. Na safra, o mínimo passa a sete; não há pessoas suficientes para isso. A proposta fixa sábado e domingo de folga e reduz as jornadas para 40h semanais. O algoritmo não encontra razão para deslocar o almoço porque nenhuma demanda foi cadastrada durante a pausa coletiva.

### Entidade / ação social

Mínimo de **um cuidador e um enfermeiro 24h por dia**, todos os dias, inclusive feriado. Plantões **08h–20h e 20h–08h**, grupo A ancorado em 01/10/2026 e B em 02/10/2026, com um dia de trabalho e o seguinte de descanso. Cada plantonista tem um intervalo real de uma hora, não contado como presença nem como crédito fictício de jornada. A carga efetiva média é 38,5h/semana; a janela de presença tem 12h e o descanso entre plantões é 36h. As pausas das duplas são alternadas, inclusive no período noturno.

O instrumento coletivo fictício declara o regime 12×36; não presume intervalo trabalhado nem crédito noturno de uma hora. Os dois administrativos têm horário comercial 08h–18h/11h–13h nos dias úteis e 08h–12h aos sábados, com referência de 44h.

**Limite atual do produto:** esses modelos mistos são para gerar/analisar a escala atual. A conversão automática 6×1→5×2 ainda rejeita grupos com ciclos 12×36, preservando os plantões. O instalador não altera essa funcionalidade nem converte plantonistas indevidamente. A correção das âncoras no modelo de grupos concentrados é manual, no horário individual; a busca automática de ajustes não desloca ciclos 12×36. Com as âncoras incorretas, o diagnóstico pode indicar capacidade insuficiente nas datas descobertas; isso se refere às referências cadastradas, não prova falta absoluta de empregados.

### Padaria

Operação **segunda a sábado, 06h–20h30**, com mínimo de um atendente e um padeiro durante todo o período, incluindo almoço. Domingo e feriados nacionais sem operação na referência. Turnos de 7h20 efetivas: 06h–14h20, 09h–17h20 e 12h10–20h30, cada um com uma hora de intervalo. A soma de seis dias é 44h. O modelo de pausas simultâneas concentra os empregados na abertura/fechamento; o modelo enxuto tem apenas um empregado de cada função em cada um desses dois turnos.

## Como interpretar a comparação

As referências são fixas em outubro de 2026; propostas em fevereiro de 2028, fase consolidada de 40h. A fazenda fixa fins de semana; comércio e padaria distribuem folgas para buscar cobertura nos dias de operação.

**Cobertura suficiente não significa todas as condições resolvidas.** No comércio, trabalhar o sábado curto e mais quatro dias de oito horas pode somar 36h. Na padaria, cinco jornadas atuais de 7h20 somam 36h40. Como a conversão preserva as janelas e não amplia saídas, esses modelos podem indicar **ajustes** mesmo quando não há horários descobertos. É necessário rever horários/disponibilidades, não presumir automaticamente novas contratações ou compensação coletiva.

Nos modelos de contratação, foram verificadas provas de capacidade insuficiente na proposta. Nos de readequação, há pessoal para melhorar a cobertura redistribuindo pausas ou corrigindo referências de ciclos. A busca é limitada e pode deixar lacunas após uma rodada; não há garantia de solução ótima. O modelo de padaria com pausas coincidentes também pode continuar com lacunas na primeira proposta. Use o relatório e a busca de ajustes para observar a evolução, sem tratar o título do modelo como certificação do resultado.

Use **Salvar uma cópia** para preservar o exemplo antes de experimentar. Nenhum resultado ou diagnóstico foi pré-certificado no banco.

## Segurança, reexecução e manutenção

Instalação em transação, IDs estáveis e o mesmo lock administrativo do DEMO original. Reexecutar não duplica empresas/preenchimentos nem sobrescreve nomes, CNPJs ou estados editados. Identificadores em outro contexto, escritório divergente/inativo ou preenchimentos excluídos causam rollback. Não restaura exclusões. Os cadastros e preenchimentos usam os logs/triggers de auditoria existentes. O instalador original e o lote novo são independentes; não alteram dados reais.

Fonte: `database/demo/segmentos.mjs`. Gere novamente os SQLs com `node scripts/gerar-demo.mjs`. O estado, os templates e os scripts administrativos ficam fora do build público. A atualização do instalador não altera os exemplos já instalados.

Validações: 11 modelos no domínio e no navegador, falta de capacidade por segmento, redução das lacunas por pausa, restauração de A/B, 36h de descanso, pausa coletiva e sábado compensado, CNPJs/IDs únicos, SQL sincronizado, leitura autenticada das empresas/preenchimentos, isolamento do operador sem acesso, reexecução, preservação de edições e bloqueio de ressurreição em PostgreSQL 17/PostgREST 14.15 locais. Execução na VPS ainda depende do comando administrativo acima.
