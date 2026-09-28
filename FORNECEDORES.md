# Fornecedores com conta

Lista de **nomes**, mantida a pedido do dono a partir de 01/09/2026. Eram **32 contas**; as
marcadas "ok" (já cadastradas como fonte) saem da lista, e ficam **22** ainda por ligar.

**Este arquivo não é código e não é importado por nada.** Não há `export`, não há
`import` que aponte para cá, e nenhum leitor de `src/lib/coleta/` consulta esta lista.
A regra foi dada pelo dono em 01/09/2026, depois de uma primeira versão que colocava os
nomes dentro de `src/lib/coleta/fornecedores.js`: **os nomes ficam separados de toda a
aplicação**, e só voltam à conversa quando ele pedir por um deles.

Ter a conta não é ter o fornecedor ligado. Implementar um deles começa por descobrir
**como o dado chega** — vitrine pública, portal atrás de login, ou arquivo exportado —,
e só então se decide entre coleta e importação.

**O site só está anotado onde o dono deu o endereço.** Chutar produziria um valor com
cara de confirmado que não foi conferido; os demais ganham o seu na implementação.

| # | Fornecedor | Site | Nota |
| --- | --- | --- | --- |
| 1 | PoliComp | — | |
| 2 | Eletropeças | — | |
| 4 | Eletrônica Central | — | |
| 7 | Patola | — | |
| 8 | Neoyama | — | |
| 9 | ImoBrás | — | |
| 10 | Forsetti | — | |
| 11 | Karimex | — | impressora 3D |
| 12 | Megamix | — | |
| 13 | OBR | — | |
| 14 | Prado Automação | — | |
| 16 | Tespo | — | esteiras |
| 17 | Unitel | — | transformadores |
| 19 | Metaltex | — | |
| 20 | Lukbox / Circuitronix | — | componentes eletrônicos; **um nome ou dois, a confirmar** |
| 22 | Eletrodex | https://www.eletrodex.net/ | |
| 26 | Cromatek | https://cromatek.com.br/ | |
| 28 | Oceantech Automation | https://oceantech-automation.com.br/ | |
| 29 | Grupo MPC Distribuidora | https://grupompcdistribuidora.com.br/ | |
| 30 | Sibratec | https://www.sibratec.ind.br/ | |
| 31 | Fermarc | https://www.fermarc.com/ | |
| 32 | Kalatec | https://loja.kalatec.com.br/ | |

## Pontos em aberto

- **Lukbox / Circuitronix** foi passado com barra. Está como uma entrada só, no mesmo
  formato de Fortek/Benser (empresa e portal). Se forem duas empresas, viram duas linhas.
- **"eletrus Eletrônica Central Mamuti Eletronica"** foi lido como três lojas: Eletrus,
  Eletrônica Central e Mamuti Eletrônica. Outra divisão é possível.

## Fornecedores que já estão ligados

Não entram na tabela acima — o lugar deles é o código, porque têm regra medida em arquivo
real, em `src/lib/coleta/fornecedores.js`:

- **Fortek/Benser** — portal B2B atrás de login; HTML de 1592 produtos; regra `sufixoDeCarga`.
- **Nightech** — XLSX de 457 produtos; regra `mesclarSiteComArquivo`.
