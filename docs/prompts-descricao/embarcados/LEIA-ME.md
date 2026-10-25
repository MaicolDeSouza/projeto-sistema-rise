# Prompts de descrição — Embarcados

Versão de trabalho: 12/10/2026. Cinco prompts completos e independentes, para enviar apenas o correspondente à subfamília do produto.

**Atualização de 25/10/2026:** o [Arduino](01-arduino.txt) (v4, 14/10) e o [ESP32](02-esp32.txt) (refeito em 25/10 no molde do Arduino, a partir dos 458 ESP32 coletados dos concorrentes) seguem a regra do roteiro da proposta: **campo sem dado confirmado SAI da descrição** (nunca `?`), nomes padronizados por campo, "possui" em vez de "tem", o porquê depois da vírgula e " / " entre informações distintas no mesmo valor. A tabela abaixo com `?` descreve o desenho antigo e ainda vale para os três prompts não revisados (ESP32 LoRa, STM32, Raspberry Pi).

- [Arduino](01-arduino.txt)
- [ESP32, incluindo ESP32-CAM](02-esp32.txt)
- [ESP32 LoRa](03-esp32-lora.txt)
- [STM32](04-stm32.txt)
- [Raspberry Pi: computadores Model B e Zero](05-raspberry-pi.txt)

Cada arquivo já contém parágrafos, características, fontes, itens inclusos, peso/medidas, divergências e a instrução sobre a garantia padrão. Não concatenar os cinco arquivos nem acrescentar o prompt padrão inteiro: cada um o substitui.

## Campos sem dado confirmado

Os campos principais da subfamília aparecem sempre. Campos condicionais aparecem quando aplicáveis ao modelo. A falta de informação não comprova ausência do recurso.

| Situação | Resposta da IA | Exibição pretendida na revisão |
| --- | --- | --- |
| Dado confirmado | `valor: "2GB LPDDR4"` | `Memória RAM: 2GB LPDDR4` |
| Campo técnico aplicável sem valor confirmado | `valor: "?", referencias: []` | `Memória RAM: ?` |
| Peso desconhecido | `pesoGramas: null` | `Peso: ?` |
| Dimensões desconhecidas | Eixos sem dado: `null` | `Dimensões(CxLxA): ?` |
| Apenas altura desconhecida | Altura: `null`; demais eixos numéricos | `Dimensões(CxLxA): 68mm x 53mm x ?` |
| Recurso comprovadamente ausente | `valor: "Não possui"` | `Bluetooth: Não possui` |
| Divergência já apresentada pelo Rise | `valor: ""` e decisão separada | Opções para o operador escolher |

O caractere `?` representa uma pendência de revisão, nunca um dado técnico. Recomendação de publicação: o operador preenche o campo ou aceita sua omissão antes de exportar a descrição. As medidas numéricas permanecem `null`; nunca transformar ausência em zero ou em texto no JSON.

## Fontes por campo

Exibição pretendida na revisão, fora do texto do anúncio:

```text
Microcontrolador: ATmega328P | Fonte: <nome da referência cadastrada no Rise>
Clock: 16MHz | Fonte: Web
Modelo: UNO R3 | Fonte: Cadastro
Memória RAM: ? | Fonte: —
```

Os nomes acima ilustram a apresentação, não comprovam valores de um produto específico.

A origem de cada dado é a referência efetivamente usada nesta geração. Uma página previamente coletada e selecionada no Rise é uma referência do Rise, mesmo tendo vindo originalmente da internet. `Fonte: Web` identifica consulta externa feita para esta geração ou resultado externo fornecido e identificado como tal.

A IA recebe fontes numeradas e devolve seus números em `referencias`. O Rise deve resolver esses números para o nome da referência cadastrada ou para o rótulo `Web`. Para Web, guardar também URL, título e data da consulta como informação interna, mesmo que a tela mostre apenas `Fonte: Web`. Não embutir origem, URL ou rótulos dentro do valor técnico; eles atrapalham comparação, validação e exportação. A ausência de referência numerada, por si só, não comprova origem no cadastro: o sistema precisa verificar os dados próprios do produto.

Uma consulta Web só existe quando uma busca/leitura real foi executada. Conhecimento do modelo não é consulta Web. Um link avulso não fornece seu conteúdo à IA. A busca deve ser uma etapa disponível e controlada pelo Rise; os prompts apenas usam os resultados fornecidos.

Para peso/medidas, itens inclusos e parágrafos, a estrutura atual não possui atribuição individual de origem. Se a tela também precisar mostrar fontes nessas partes, o contrato da resposta e a apresentação precisam ser ampliados. Fontes do corpo da placa não comprovam peso da embalagem; fontes de outro vendedor não comprovam acessórios da unidade vendida pela Rise.

## Garantia

Texto atualmente acrescentado pelo Rise:

```text
Garantia:
- Garantia Legal de 90 dias (contra defeitos de fabricação);
```

Os prompts mencionam esse comportamento para preservar a seção completa. Não há campo `garantia` no contrato da IA, e copiar garantias dos anúncios de referência produziria um texto fora do padrão da loja.

## Compatibilidade com o Rise atual

Esta entrega altera somente documentos de prompt. Não modifica a integração, o cadastro de prompts, a interface ou a exportação.

- A estrutura atual aceita `nome`, `valor` e `referencias`; `?` pode ser devolvido em valores textuais de características, mas ainda não é tratado como pendência separada e pode entrar no anúncio se publicado sem revisão.
- Peso e medidas usam números ou `null`. Atualmente o Rise omite medidas ausentes; exibir `Peso: ?` ou eixos desconhecidos exige ajuste na montagem/revisão.
- O Rise já associa referências selecionadas às características na revisão. A chamada de geração da descrição não oferece pesquisa Web nem metadados para distinguir `Fonte: Web`. Solicitar uma busca no texto do prompt não habilita essa função.
- Para usar resultados Web com o campo `referencias` existente, a coleta deve numerá-los e transmitir a origem; a resolução das fontes precisa reconhecer referências Web. Também é possível ampliar o contrato com metadados próprios, mas não adicionar campos desconhecidos ao JSON atual.
- A instrução interna do modo sem referências manda retornar apenas especificações escritas no cadastro e, se não houver nenhuma, uma lista vazia. Essa regra precisa ser alinhada ao comportamento desejado de mostrar campos principais com `?`.
- O sistema atualmente pode usar medidas de referências semelhantes como reserva. Esses prompts pedem medidas do mesmo produto/variante; o uso automático de reserva também precisa ser alinhado para não preencher uma pendência com medidas de outro produto.

Antes de uso em produção, comparar algumas respostas de cada subfamília, incluindo um produto com dados completos, um com dados faltantes e um com divergências. Não há promessa de economia percentual ou de qualidade equivalente sem essa comparação.
