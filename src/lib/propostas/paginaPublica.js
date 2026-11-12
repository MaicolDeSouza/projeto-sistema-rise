import { conteudoDaProposta } from "@/lib/propostas/conteudo";

/**
 * A pagina do LINK PUBLICO da proposta (spec 2026-11-12, extra C), no molde da do pedido de compra: HTML inteiro numa
 * resposta, CSS em linha, logo e fotos em data URI e NENHUM script (o cliente nao alcanca o /_next, que fica atras do
 * login). Mesmo conteudo do PDF (`conteudoDaProposta`), lido do banco a cada visita.
 */

const escapar = (texto) => String(texto ?? "").replace(/[&<>"']/g, (l) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[l]);
const dataUri = (bytes, tipo) => (bytes ? `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}` : null);
const DIREITA = new Set(["qtde", "preco", "desconto", "total"]);

const ESTILO = `
:root{color-scheme:light;--texto:#111827;--cinza:#6b7280;--linha:#d1d5db;--cab:#f3f4f6;--obs:#fffbeb;--fundo:#f9fafb}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
.folha{background:#fff;border:1px solid var(--linha);border-radius:8px;padding:28px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
header img{height:46px;max-width:170px;object-fit:contain;display:block;margin-bottom:6px}
.empresa{color:var(--cinza);font-size:12px}
h1{margin:0;font-size:22px;text-align:right}
.data{color:var(--cinza);font-size:12px;text-align:right}
.rotulo{margin-top:22px;color:var(--cinza);font-size:11px;letter-spacing:.05em;text-transform:uppercase}
.cliente{font-size:16px;font-weight:700}
.rolagem{margin-top:16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{border:1px solid var(--linha);padding:6px 8px;vertical-align:middle}
th{background:var(--cab);color:var(--cinza);font-size:11px;text-align:left;white-space:nowrap}
.c{text-align:center}.d{text-align:right;white-space:nowrap}
td.foto{width:52px;padding:4px}
td.foto img{display:block;width:40px;height:40px;object-fit:contain;margin:0 auto;outline:1px solid rgba(0,0,0,.08);outline-offset:-1px}
td.desc{min-width:220px}
tr.obs td{background:var(--obs);font-style:italic}
.totais{margin:16px 0 0 auto;max-width:360px;font-variant-numeric:tabular-nums}
.totais div{display:flex;justify-content:space-between;gap:16px;padding:2px 0}
.totais span:first-child{color:var(--cinza)}
.totais .geral{margin-top:4px;font-size:17px;font-weight:700}
.totais .geral span:first-child{color:var(--texto)}
.impostos{text-align:right;color:var(--cinza);font-size:12px}
.condicao{margin-top:16px}
.condicao b{display:block}
.condicao p{margin:2px 0 0;white-space:pre-line}
@media (max-width:640px){.folha{padding:16px}h1,.data{text-align:left}}
`;

/** @param {object} proposta `lerProposta`; @param {{ logo?: Buffer|null, fotos?: Record<string, Buffer|null> }} extras */
export function htmlDaProposta(proposta, empresa, extras = {}) {
  const c = conteudoDaProposta(proposta, empresa);
  const fotos = extras.fotos ?? {};
  const logo = dataUri(extras.logo, "image/png");
  const largura = c.colunas.length;
  const linhas = c.itens
    .map((item) => {
      const celulas = c.colunas
        .map((col) => {
          if (col.chave === "foto") {
            const uri = dataUri(fotos[item.id], "image/jpeg");
            return `<td class="foto"${item.obs ? ' rowspan="2"' : ""}>${uri ? `<img src="${uri}" alt="">` : ""}</td>`;
          }
          if (col.chave === "item") return `<td class="c"${item.obs ? ' rowspan="2"' : ""}>${escapar(item.celulas.item)}</td>`;
          const classe = col.chave === "descricao" ? "desc" : DIREITA.has(col.chave) ? "d" : col.chave === "un" ? "c" : "";
          return `<td${classe ? ` class="${classe}"` : ""}>${escapar(item.celulas[col.chave])}</td>`;
        })
        .join("");
      const obs = item.obs ? `<tr class="obs"><td colspan="${largura - 2}"><b>Obs.:</b> ${escapar(item.obs)}</td></tr>` : "";
      return `<tr>${celulas}</tr>${obs}`;
    })
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapar(c.titulo)}</title><style>${ESTILO}</style></head><body><main><div class="folha">
<header><div>${logo ? `<img src="${logo}" alt="">` : ""}<div class="empresa">${c.empresa.map(escapar).join("<br>")}</div></div>
<div><h1>${escapar(c.titulo)}</h1><div class="data">${escapar(c.data)}${c.quemFez ? `<br>${escapar(c.quemFez)}` : ""}</div></div></header>
<div class="rotulo">Cliente</div><div class="cliente">${escapar(c.cliente.nome)}</div><div>${c.cliente.linhas.map(escapar).join("<br>")}${c.cliente.ac ? `<br><b>${escapar(c.cliente.ac)}</b>` : ""}</div>
<div class="rolagem"><table><thead><tr>${c.colunas.map((col) => `<th${DIREITA.has(col.chave) ? ' class="d"' : ""}>${escapar(col.titulo)}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>
<div class="totais">${c.linhasDeTotal.map(([r, v]) => `<div><span>${escapar(r)}</span><span>${escapar(v)}</span></div>`).join("")}<div class="geral"><span>Total da proposta</span><span>${escapar(c.total)}</span></div></div>
<p class="impostos">${escapar(c.impostos)}</p>
${c.blocos.map(([r, v]) => `<div class="condicao"><b>${escapar(r)}</b><p>${escapar(v)}</p></div>`).join("")}
</div></main></body></html>`;
}
