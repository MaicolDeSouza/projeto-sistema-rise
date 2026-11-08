import { conteudoDoPedido } from "@/lib/compras/conteudoDoPedido";

/**
 * A pagina do LINK PUBLICO do pedido de compra (pedido do dono em 07/11/2026: "copiar um link publico e enviar para meu
 * fornecedor, e ele acessar as mesmas informacoes que estao no PDF ... posso ajustar o PC e ele acessar o link sempre
 * com a PC atualizada"; Opcao 1, sem baixar PDF e sem trocar o link).
 *
 * HTML inteiro numa resposta: CSS em linha, logo e fotos em data URI e NENHUM script. Fora do login, o fornecedor nao
 * alcanca o `/_next/*` (fica atras do Tinyauth), entao a pagina nao pode depender dele; e sem script nada roda no
 * navegador de quem abre. Mesmo conteudo do PDF (`conteudoDoPedido`), lido do banco a cada visita.
 */

const escapar = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (letra) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[letra]);

const dataUri = (bytes, tipo) => (bytes ? `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}` : null);

const ESTILO = `
:root{color-scheme:light;--texto:#111827;--cinza:#6b7280;--linha:#d1d5db;--cab:#f3f4f6;--obs:#fffbeb;--fundo:#f9fafb}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
.folha{background:#fff;border:1px solid var(--linha);border-radius:8px;padding:28px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
header img{height:46px;max-width:170px;object-fit:contain}
h1{margin:0;font-size:20px;text-align:right;text-wrap:balance}
.data{color:var(--cinza);font-size:12px;text-align:right}
.cancelado{margin:16px 0 0;padding:8px 12px;border-radius:6px;background:#fef2f2;color:#b91c1c;font-weight:600}
.rotulo{margin-top:22px;color:var(--cinza);font-size:11px;letter-spacing:.05em;text-transform:uppercase}
.fornecedor{font-size:16px;font-weight:700}
.rolagem{margin-top:16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{border:1px solid var(--linha);padding:6px 8px;vertical-align:middle}
th{background:var(--cab);color:var(--cinza);font-size:11px;text-align:left;white-space:nowrap}
.c{text-align:center}.d{text-align:right;white-space:nowrap}
td.foto{width:52px;padding:4px}
td.foto img{display:block;width:40px;height:40px;object-fit:contain;margin:0 auto;outline:1px solid rgba(0,0,0,.08);outline-offset:-1px}
td.desc{min-width:220px}
tr.obs td{background:var(--obs);font-style:italic}
tr.obs b{font-style:italic}
.totais{margin:16px 0 0 auto;max-width:360px;font-variant-numeric:tabular-nums}
.totais div{display:flex;justify-content:space-between;gap:16px;padding:2px 0}
.totais span:first-child{color:var(--cinza)}
.totais .geral{margin-top:4px;font-size:16px;font-weight:700}
.totais .geral span:first-child{color:var(--texto)}
.condicao{margin-top:16px}
.condicao b{display:block}
.condicao p{margin:2px 0 0;white-space:pre-line}
@media (max-width:640px){.folha{padding:16px}h1,.data{text-align:left}}
`;

/**
 * @param {object} pedido o retorno de `lerPedido`
 * @param {{ logo?: Buffer|null, estrangeiro?: boolean, moeda?: string, cotacao?: number|null,
 *   fotos?: Record<string, Buffer|null>, dolar?: Record<string, number|null> }} [extras] o retorno de `dadosDoPdf`
 * @returns {string}
 */
export function htmlDoPedido(pedido, extras = {}) {
  const conteudo = conteudoDoPedido(pedido, extras);
  const { t } = conteudo;
  const comIpi = !conteudo.estrangeiro;
  const colunas = ["item", "foto", "codigo", "descricao", "qtde", "un", "preco", ...(comIpi ? ["ipi"] : []), "total"];
  const alinhar = { item: "c", un: "c", qtde: "d", preco: "d", ipi: "d", total: "d" };
  const logo = dataUri(extras.logo, "image/png");

  const linhas = conteudo.itens
    .map((item) => {
      const foto = dataUri(extras.fotos?.[item.id], "image/jpeg");
      // Com observacao, o "#" e a Foto ocupam as duas linhas (igual ao PDF), para ficar claro de que item ela e.
      const juntas = item.obs ? ' rowspan="2"' : "";
      const celulas = colunas
        .map((chave) => {
          if (chave === "item") return `<td class="c"${juntas}>${escapar(item.celulas.item)}</td>`;
          if (chave === "foto") return `<td class="foto"${juntas}>${foto ? `<img src="${foto}" alt="">` : ""}</td>`;
          if (chave === "descricao") return `<td class="desc">${escapar(item.celulas.descricao)}</td>`;
          return `<td class="${alinhar[chave] ?? ""}">${escapar(item.celulas[chave])}</td>`;
        })
        .join("");
      const obs = item.obs ? `<tr class="obs"><td colspan="${colunas.length - 2}"><b>${escapar(t.obsDoItem)}</b> ${escapar(item.obs)}</td></tr>` : "";
      return `<tr>${celulas}</tr>${obs}`;
    })
    .join("");

  const totais = conteudo.linhasDeTotal.map(([rotulo, valor]) => `<div><span>${escapar(rotulo)}</span><span>${escapar(valor)}</span></div>`).join("");
  const condicoes = conteudo.condicoes.map(([rotulo, valor]) => `<div class="condicao"><b>${escapar(rotulo)}</b><p>${escapar(valor)}</p></div>`).join("");

  return `<!doctype html>
<html lang="${conteudo.estrangeiro ? "en" : "pt-BR"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapar(conteudo.titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
<div class="folha">
<header>
<div>${logo ? `<img src="${logo}" alt="4HOBBY">` : ""}</div>
<div><h1>${escapar(conteudo.titulo)}</h1><div class="data">${escapar(conteudo.data)}</div></div>
</header>
${pedido.status === "CANCELADO" ? `<p class="cancelado">${escapar(t.cancelado)}</p>` : ""}
<div class="rotulo">${escapar(t.fornecedor)}</div>
<div class="fornecedor">${escapar(conteudo.fornecedor.nome)}</div>
<div>${escapar(`${t.ac} ${conteudo.fornecedor.contato}`.trim())}</div>
<div class="rolagem">
<table>
<thead><tr>${colunas.map((chave) => `<th class="${alinhar[chave] ?? ""}">${escapar(t.colunas[chave])}</th>`).join("")}</tr></thead>
<tbody>${linhas}</tbody>
</table>
</div>
<div class="totais">${totais}<div class="geral"><span>${escapar(t.totalDoPedido)}</span><span>${escapar(conteudo.totalDoPedido)}</span></div></div>
${condicoes}
</div>
</main>
</body>
</html>`;
}
