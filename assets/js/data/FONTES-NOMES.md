# Frequências de prenomes para sugestão de sexo

Fonte original: **IBGE — Censo 2010 / Nomes no Brasil**: https://censo2010.ibge.gov.br/nomes/.

As frequências públicas agregadas foram obtidas do espelho **MedidaSP/nomes-brasileiros-ibge**, revisão `ea0678d8e410c44fb6c72324feadfec486bd555b` (2017): https://github.com/MedidaSP/nomes-brasileiros-ibge/tree/ea0678d8e410c44fb6c72324feadfec486bd555b.

Foram utilizadas as colunas `nome`, `freq` e `sexo` dos arquivos `ibge-fem-10000.csv` e `ibge-mas-10000.csv`. A derivação contém somente fatos estatísticos agregados de prenomes: nenhuma informação dos colaboradores ou relatórios enviados é incorporada. Código de terceiros não foi copiado. Os hashes SHA-256 das fontes estão em `nomes-ibge-fontes.json`.

O espelho reúne listas truncadas dos nomes mais frequentes por sexo. Por isso, só preservamos os **1.040 nomes presentes nas duas listas**, com ambas as frequências positivas. Um nome ausente de uma das listas não recebe frequência zero nem predominância de 100%. Dos nomes preservados, 216 atendem ao critério atual de predominância de pelo menos 99,5% e amostra de pelo menos 1.000 registros.

A predominância é a proporção observada nessas frequências históricas, não a probabilidade comprovada de acertar o sexo de uma pessoa. Grafias raras, nomes não cobertos, iniciais e combinações com evidências divergentes ficam sem preenchimento. Nenhuma heurística baseada em sufixos ou sobrenomes é utilizada. O usuário pode corrigir ou retirar a estimativa.

Para reproduzir: `node scripts/gerar-base-nomes.js`. Para usar cópias locais das duas fontes: `node scripts/gerar-base-nomes.js --source-dir=/caminho/das/fontes`. O aplicativo usa apenas a base local gerada e não consulta serviços externos com nomes dos usuários.
