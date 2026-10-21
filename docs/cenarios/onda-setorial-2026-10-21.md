# Onda de cenários setoriais — 21/10/2026

Foram acrescentados 89 cenários: 17 casos dirigidos e uma matriz de 72 combinações, gerando 192 escalas mensais individuais. A suíte completa passou com 208 testes, sem falhas ou testes ignorados. Os fluxos de navegador também passaram na saída de produção.

| Perfil | Operação exercitada |
| --- | --- |
| Padaria | Equipe de manhã, funções distintas e turno noturno dirigido |
| Supermercado | 6×1, dois turnos, caixas e repositores |
| Farmácia | Plantões noturnos 12×36 |
| Comércio | Segunda a sábado, sábado encerrando às 12h |
| Clínica | Contratos de 30h e demanda além da saída da equipe |
| Restaurante | Jornada e intervalo atravessando a meia-noite |

A matriz cruza fevereiro, outubro e dezembro de 2026, dezembro de 2027 e fevereiro e dezembro de 2028 com as duas políticas de distribuição dos feriados. Os testes verificam horários, horas efetivas, folgas, limites, contexto entre semanas e cobertura por função.

## Problemas corrigidos

- Normalização de jornadas e pausas que atravessam a meia-noite, incluindo o preenchimento de turno único.
- Rejeição de valores de relógio inválidos e de trabalho sem horas positivas.
- Preservação da escolha de trabalhar no feriado ao mudar o mês e restauração coerente dos feriados removidos.
- Uso do mesmo calendário pela geração e pela análise de cobertura.
- Inclusão do primeiro dia mesmo quando a data recebida contém horário.
- Indicação de saída no dia seguinte na grade e coluna de data da saída no CSV.
- Identificação de trabalho noturno como pendência de conferência específica.

O trabalho noturno permanece calculado em horas de relógio. Hora reduzida, adicionais, prorrogações e enquadramento da categoria não são calculados automaticamente; o resultado recebe pendência, sem aprovação automática desses aspectos.

Os cenários também confirmam alertas esperados: uma função não substitui outra, contratos de 30h podem deixar o fim do expediente descoberto, um sábado de 4h pode impedir o fechamento de 40h em uma determinada distribuição, e a troca de turno entre domingo e segunda pode deixar descanso insuficiente.

## Reprodução

```sh
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Casos: `tests/cenarios-setores.test.cjs` e `tests/browser-setores.cjs`. O teste de navegador simula os serviços externos de fontes e Tailwind, sem certificar a aparência fornecida por esses serviços ou uma implantação na Vercel.
