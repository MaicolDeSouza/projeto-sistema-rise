# Anotação: janela "Fotos da proposta" (21/10/2026)

Pedido do dono, com print da janela (8 escolhidas de 43). **Só anotado e avaliado: executar quando ele pedir.**
Arquivo da tela: `src/components/produtos/FotosDaProposta.jsx` (hoje o clique na foto inteira marca/desmarca).

## Os 4 pedidos e a avaliação

1. **Botão "Escolher essa" / "Retirar da escolha" em cada foto.** Viável e simples. Necessário por causa do item 3: o
   clique na foto passa a abrir a foto grande, então marcar e desmarcar precisa de um botão próprio, no rodapé do
   cartão (verde "Escolher essa" quando fora; "Retirar" discreto quando escolhida, mantendo o selo ✓ com o número).
2. **Zoom ao passar o mouse.** Viável, reaproveitando o `ImagemComZoom` (`src/components/produtos/ImagemComZoom.jsx`):
   o zoom acontece DENTRO do cartão e segue o mouse, que é o que serve para ver detalhe (chip, serigrafia, marca d'água).
   O `FotoComLupa` (prévia de 260 px acima) foi feito para miniatura de lista e mostraria a foto MENOR que o cartão.
3. **Clique abre a foto grande com setas laterais.** Viável, reaproveitando o `AmpliacaoDeFoto` (o mesmo da janela de
   fotos do produto: setas na tela, setas do teclado, contador "5 / 43", Esc fecha). Na ampliada também caberia o
   "Escolher essa / Retirar", para decidir sem voltar à grade.
4. **Segurar e arrastar para mudar a ordem (ex.: levar a 5 para 1).** Viável, no molde do arrastar da
   `TiraDeFotos.jsx` (arrastar nativo do navegador: clicar e soltar sem mover continua sendo clique, então não briga
   com o item 3). Regra proposta: a ordem é só a das ESCOLHIDAS; soltar uma escolhida sobre outra a coloca naquela
   posição e renumera as demais; soltar uma NÃO escolhida sobre uma escolhida a escolhe já naquela posição (se passar
   de 8, a tela avisa, como hoje). As não escolhidas continuam depois, na ordem atual.

## Cuidados

- O "Aplicar fotos" continua sendo o único momento em que algo muda no formulário; nada disto grava no banco.
- Toque (celular/tablet): o arrastar nativo não funciona por toque; se o dono usar a tela no celular, precisa de outro
  jeito (setas "←/→" na ampliada, por exemplo).
- Teste na tela com uma proposta real (o 100103-teste da VPS tem 43 candidatas).

Estimativa: um pedaço só, numa sessão; sem mudança de banco nem de servidor (só a tela).
