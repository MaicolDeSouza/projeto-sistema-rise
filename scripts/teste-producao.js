import "dotenv/config";

/**
 * Testes das pecas proprias e da ordem de producao (spec 2026-10-26-producao-pecas-proprias-design.md): regras
 * puras, custo pelas pecas, Salvar do cadastro e a ordem contra um Bling falso. SEM rede.
 *
 *   npm run teste:producao
 *
 * So escreve produtos ZZ-PROD-* (e as ordens deles), apagados no comeco e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const {
  custoDasPecas,
  corDoEstoque,
  textoDoEstoque,
  validarPecas,
  quantidadeTotalDaPeca,
  faltasParaBaixa,
  numeroDaOrdem,
  podeIrPara,
  validarQuantidadeProduzida,
} = await import("../src/lib/producao/regras.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nRegras da producao");
conferir("custo total", custoDasPecas([{ custo: 10, quantidade: 2 }, { custo: 1.5, quantidade: 0.5 }]), { total: 20.75, incompleto: false });
conferir("custo incompleto", custoDasPecas([{ custo: 10, quantidade: 1 }, { custo: null, quantidade: 1 }]), { total: null, incompleto: true });
conferir("custo lista vazia", custoDasPecas([]), { total: 0, incompleto: false });
conferir("cor zero", corDoEstoque({ estoque: 0, estoqueMinimo: 5 }), "vermelho");
conferir("cor negativo", corDoEstoque({ estoque: -2, estoqueMinimo: null }), "vermelho");
conferir("cor abaixo", corDoEstoque({ estoque: 3, estoqueMinimo: 5 }), "amarelo");
conferir("cor ok", corDoEstoque({ estoque: 5, estoqueMinimo: 5 }), "verde");
conferir("cor sem minimo", corDoEstoque({ estoque: 1, estoqueMinimo: null }), "verde");
conferir(
  "texto",
  textoDoEstoque({ estoque: 0, estoqueMinimo: 2, estoqueMaximo: 3 }),
  { titulo: "Estoque do produto vazio", linhas: ["Estoque atual: 0", "Estoque mínimo: 2", "Estoque máximo: 3"] },
);
conferir("texto sem minimo", textoDoEstoque({ estoque: 4, estoqueMinimo: null, estoqueMaximo: null }), { titulo: "Estoque ok", linhas: ["Estoque atual: 4"] });
conferir("texto abaixo", textoDoEstoque({ estoque: 1, estoqueMinimo: 2, estoqueMaximo: null }).titulo, "Estoque abaixo do mínimo");
conferir("total arredonda para cima", quantidadeTotalDaPeca(0.5, 3), 2);
conferir("total inteiro", quantidadeTotalDaPeca(2, 3), 6);
conferir("total sem erro de ponto flutuante", quantidadeTotalDaPeca(0.1, 30), 3);
conferir(
  "faltas",
  faltasParaBaixa(
    [
      { componenteId: "a", sku: "1", descricao: "A", quantidadeTotal: 4 },
      { componenteId: null, sku: null, descricao: "cola", quantidadeTotal: 1 },
      { componenteId: "b", sku: "2", descricao: "B", quantidadeTotal: 1 },
    ],
    new Map([["a", 3], ["b", 5]]),
  ),
  [{ sku: "1", descricao: "A", necessario: 4, disponivel: 3 }],
);
conferir("valida peca manual sem custo", validarPecas([{ descricao: "x", quantidade: 1 }]).ok, false);
conferir("valida peca manual", validarPecas([{ descricao: " cola ", custoManual: "1,50", quantidade: "0,5" }]), {
  ok: true,
  pecas: [{ componenteId: null, descricao: "cola", custoManual: 1.5, quantidade: 0.5, ordem: 0 }],
});
conferir("valida repetida", validarPecas([{ componenteId: "a", quantidade: 1 }, { componenteId: "a", quantidade: 2 }]).ok, false);
conferir("valida proprio", validarPecas([{ componenteId: "eu", quantidade: 1 }], "eu").ok, false);
conferir("valida quantidade zero", validarPecas([{ componenteId: "a", quantidade: 0 }]).ok, false);
conferir("valida 4 casas", validarPecas([{ componenteId: "a", quantidade: "0.0001" }]).ok, false);
conferir("valida acima de 50", validarPecas(Array.from({ length: 51 }, (_, i) => ({ componenteId: `p${i}`, quantidade: 1 }))).ok, false);
conferir("numero", numeroDaOrdem(7), "OP-0007");
conferir(
  "transicoes",
  [podeIrPara("ABERTA", "CONCLUIDA"), podeIrPara("EM_PRODUCAO", "CONCLUIDA"), podeIrPara("CONCLUIDA", "CANCELADA"), podeIrPara("ABERTA", "EM_PRODUCAO")],
  [false, true, false, true],
);
conferir("produzida acima", validarQuantidadeProduzida("4", 3).ok, false);
conferir("produzida zero", validarQuantidadeProduzida("0", 3).ok, false);
conferir("produzida ok", validarQuantidadeProduzida("2", 3), { ok: true, quantidade: 2 });

// (blocos de banco entram aqui)

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
