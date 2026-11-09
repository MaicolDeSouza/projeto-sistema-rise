# Prompts de descrição — regras comuns a todas as pastas

Cada pasta guarda os prompts de uma família, e o LEIA-ME dela conta de onde cada prompt veio. Na biblioteca do Rise o nome
é "<Família>-<Nome>" (ex.: "Módulos-Relé", "CNC-Fresas de Topo").

## Estilo dos parágrafos (obrigatório em todo prompt, desde 09/11/2026)

Pedido do dono, depois das descrições das fresas e dos eletroímãs: "não fica fluido no mesmo raciocínio, tem troca de
posição de palavras que dificulta o entendimento, tenho que ler 2 a 3 vezes", com a Smartkits como referência.

- O bloco **ESTILO DOS PARÁGRAFOS** mora em `src/lib/ia/estiloDosParagrafos.js` e é copiado **igual** na seção PARÁGRAFOS
  de todo prompt, logo depois da linha do tamanho. O prompt padrão do sistema (`PROMPT_DESCRICAO_PADRAO`) e o roteiro da
  proposta (v18, que manda segui-lo mesmo quando o prompt escolhido não o traz) usam o mesmo bloco.
- O prompt decide só o **tamanho** e o **conteúdo** de cada parágrafo: o que entra no 1º, o que entra no 2º e as regras
  da família. Nunca reescreva o estilo nem peça "frases curtas de no máximo N palavras": frase curta não é frase simples,
  e foi essa regra que deixou o texto picado (medido: 11 palavras por frase e 68% das frases abrindo com um trecho solto,
  contra 27 palavras e 5% na Smartkits).
- `npm run teste:extracao` falha se um prompt desta pasta não trouxer o bloco igual, voltar a pedir frase telegráfica ou
  passar do teto de 16.000 caracteres da tela.
- Mudou o bloco? Troque nos prompts de todas as pastas e regrave a biblioteca da VPS: o prompt da biblioteca é uma cópia
  do arquivo, e a tela não lê esta pasta.
- Prompt criado só pela tela, fora desta pasta, não passa pelo teste: copie o bloco nele também.

## Molde de um prompt novo

1. Abertura: o que o prompt cobre, o que fica de fora e "Textos puros...".
2. **PARÁGRAFOS**: a linha do tamanho; o bloco ESTILO; "Primeiro parágrafo, UMA frase: “O <nome do produto> é ...”";
   "Segundo parágrafo: ... a cada recurso, o que ele permite ou dispensa"; o sujeito ao voltar a falar do produto, os
   elogios vazios da família e as regras próprias dela.
3. PADRONIZAÇÃO DOS NOMES, CARACTERÍSTICAS, REGRAS ESPECÍFICAS, FONTES, ITENS INCLUSOS, PESO E DIMENSÕES, DIVERGÊNCIAS e
   GARANTIA, como nos prompts de Módulos.

## Biblioteca da VPS

Em 09/11/2026 os 18 prompts da biblioteca eram cópia exata dos arquivos (conferido por hash). ESP32 LoRa, STM32 e
Raspberry Pi (`embarcados/03` a `05`) nunca foram para a biblioteca. Para gravar: pela tela ("Criar descrição", escolher o
prompt e Salvar) ou por script com `criarPromptDaDescricao` e `salvarPromptDaDescricao` (`src/lib/ia/promptsDescricao.js`)
dentro do contêiner do app, numa conexão SSH só.
