import assert from "node:assert/strict";
import { propsDoFundo } from "../src/lib/fundoDaJanela.js";

/**
 * A regra do fundo das janelas (pedido do dono em 10/10/2026): fecha SO quando o botao do mouse e apertado E solto
 * no fundo. Os eventos sao simulados com objetos simples: o navegador manda o `click` para o ancestral comum de onde
 * o botao foi apertado e de onde foi solto, e e isso que os casos abaixo reproduzem.
 */

let contagem = 0;
function conferir(nome, condicao) {
  assert.ok(condicao, nome);
  contagem++;
  console.log(`ok    ${nome}`);
}

const fundo = { nome: "fundo" };
const janela = { nome: "janela (filha do fundo)" };

/** Um gesto do mouse: onde apertou, onde soltou e onde o navegador disparou o click. */
function gesto(props, { apertou, soltou, click }, currentTarget = fundo) {
  props.onMouseDown?.({ target: apertou, currentTarget });
  props.onMouseUp?.({ target: soltou, currentTarget });
  props.onClick?.({ target: click, currentTarget });
}

function janelaDeTeste() {
  let fechou = 0;
  const props = propsDoFundo(() => fechou++);
  return { props, fechou: () => fechou };
}

{
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: fundo, soltou: fundo, click: fundo });
  conferir("apertar e soltar no fundo: fecha", fechou() === 1);
}
{
  // O defeito do dono: selecionar o texto do campo e arrastar para fora da janela.
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: janela, soltou: fundo, click: fundo });
  conferir("apertar DENTRO e soltar no fundo (arrastar para fora): NAO fecha", fechou() === 0);
}
{
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: fundo, soltou: janela, click: fundo });
  conferir("apertar no fundo e soltar DENTRO da janela: NAO fecha", fechou() === 0);
}
{
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: janela, soltou: janela, click: janela });
  conferir("clicar dentro da janela: nao fecha", fechou() === 0);
}
{
  const { props, fechou } = janelaDeTeste();
  props.onClick({ target: fundo, currentTarget: fundo });
  conferir("clique sem ter apertado o mouse (programatico): nao fecha", fechou() === 0);
}
{
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: fundo, soltou: fundo, click: fundo });
  props.onClick({ target: fundo, currentTarget: fundo });
  conferir("o gesto nao vaza: um segundo click isolado nao fecha de novo", fechou() === 1);
}
{
  const { props, fechou } = janelaDeTeste();
  gesto(props, { apertou: janela, soltou: fundo, click: fundo });
  gesto(props, { apertou: fundo, soltou: fundo, click: fundo });
  conferir("depois de um arrasto que nao fechou, um clique de verdade fecha", fechou() === 1);
}
{
  // Janela dentro de janela (o "Gerenciar prompts" dentro do "Criar descricao"): o mousedown borbulha do fundo de
  // dentro para o de fora, e cada fundo guarda o proprio gesto.
  const fundoDeFora = { nome: "fundo de fora" };
  const fundoDeDentro = { nome: "fundo de dentro" };
  let fechouFora = 0;
  let fechouDentro = 0;
  const deFora = propsDoFundo(() => fechouFora++);
  const deDentro = propsDoFundo(() => fechouDentro++);
  // O evento sobe do alvo: primeiro o fundo de dentro, depois o de fora.
  for (const tipo of ["onMouseDown", "onMouseUp", "onClick"]) {
    deDentro[tipo]({ target: fundoDeDentro, currentTarget: fundoDeDentro });
    deFora[tipo]({ target: fundoDeDentro, currentTarget: fundoDeFora });
  }
  conferir("janelas aninhadas: clicar no fundo de dentro fecha SO a de dentro", fechouDentro === 1 && fechouFora === 0);
}
{
  const fundoDeFora = { nome: "fundo de fora" };
  let fechouFora = 0;
  const deFora = propsDoFundo(() => fechouFora++);
  for (const tipo of ["onMouseDown", "onMouseUp", "onClick"]) deFora[tipo]({ target: fundoDeFora, currentTarget: fundoDeFora });
  conferir("janelas aninhadas: clicar so no fundo de fora fecha a de fora", fechouFora === 1);
}

console.log(`\nTodos os testes do fundo da janela OK (${contagem}).`);
