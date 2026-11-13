import { conteudoDaProposta } from "@/lib/propostas/conteudo";

/**
 * A pagina do LINK PUBLICO da proposta (spec 2026-11-12, extra C), no molde da do pedido de compra: HTML inteiro numa
 * resposta, CSS em linha, logo e fotos em data URI e NENHUM script (o cliente nao alcanca o /_next, que fica atras do
 * login). Mesmo conteudo do PDF (`conteudoDaProposta`), lido do banco a cada visita.
 */

const escapar = (texto) => String(texto ?? "").replace(/[&<>"']/g, (l) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[l]);
const dataUri = (bytes, tipo) => (bytes ? `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}` : null);
const DIREITA = new Set(["qtde", "preco", "desconto", "total"]);

// Os mesmos icones do PDF (13/11/2026): telefone e envelope do lucide e o balao verde do WhatsApp com o telefone branco.
const TELEFONE =
  "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384";
const ICONES = {
  fone: `<svg viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${TELEFONE}"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12.5" cy="11.5" r="10.5" fill="#25d366"/><path d="M1.5 23 3.6 15.5 9 20.5z" fill="#25d366"/><g transform="translate(6.2 5.2) scale(.54)"><path d="${TELEFONE}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/></svg>`,
};

/** Um contato do cabecalho: icone antes do texto; so o WhatsApp vira link (o fixo e o e-mail nao, pedido do dono). */
function contatoEmHtml(contato) {
  const conteudo = `${ICONES[contato.tipo] ?? ""}<span>${escapar(contato.texto)}</span>`;
  return contato.url ? `<a class="contato" href="${escapar(contato.url)}">${conteudo}</a>` : `<div class="contato">${conteudo}</div>`;
}

const ESTILO = `
:root{color-scheme:light;--texto:#111827;--cinza:#6b7280;--linha:#d1d5db;--cab:#f3f4f6;--obs:#fffbeb;--fundo:#f9fafb}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
.folha{background:#fff;border:1px solid var(--linha);border-radius:8px;padding:28px}
header{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
header img{height:54px;max-width:170px;object-fit:contain;display:block}
.nome{flex:1;min-width:220px;border-bottom:4px double #1f3d6b;padding-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.nome b{font-size:18px}
h1{margin:0;font-size:22px}
.info{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px 24px;margin-top:12px;color:#374151;font-size:12px}
.info a{color:#1d4ed8}
.contato{display:flex;align-items:center;gap:7px;color:#374151;text-decoration:none;line-height:1.6;white-space:nowrap}
.contato svg{width:14px;height:14px;flex:none}
a.contato:hover{text-decoration:underline}
.quadro{font-size:14px;text-align:left}
.quadro div{white-space:nowrap}
.partes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 24px}
.faixa{margin-top:16px}
.faixa td{text-align:center;white-space:pre-line}
.faixa th{text-align:center}
.rotulo{margin-top:22px;margin-bottom:4px;color:#1f3d6b;font-size:16px;font-weight:700}
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
.totais{margin:18px 0 0 auto;width:290px;max-width:100%;border:1px solid var(--linha);font-variant-numeric:tabular-nums}
.totais div{display:grid;grid-template-columns:120px 1fr;gap:8px;padding:6px 12px;border-bottom:1px solid var(--linha)}
.totais span:first-child{font-weight:700}
.totais .geral{border-bottom:0;background:var(--cab);font-size:17px;font-weight:700;padding:9px 12px}
.condicao{margin-top:16px}
.condicao b{display:block}
.condicao p{margin:2px 0 0;white-space:pre-line}
@media (max-width:640px){.folha{padding:16px}.info{grid-template-columns:1fr}}
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
<header>${logo ? `<img src="${logo}" alt="">` : ""}<div class="nome"><b>${escapar(c.nomeDaEmpresa)}</b><h1>PROPOSTA</h1></div></header>
<div class="info"><div>${c.empresa.map(escapar).join("<br>")}${c.site ? `<br><a href="${escapar(c.site.url)}">${escapar(c.site.texto)}</a>` : ""}</div>
<div>${c.contatos.map(contatoEmHtml).join("")}</div>
<div class="quadro">${c.quadro.map(([r, v]) => `<div><b>${escapar(r)}:</b> ${escapar(v)}</div>`).join("")}</div></div>
<div class="partes"><div><div class="rotulo">Dados do cliente</div><div class="cliente">${escapar(c.cliente.nome)}</div><div>${c.cliente.linhas.map(escapar).join("<br>")}${c.cliente.ac ? `<br><b>${escapar(c.cliente.ac)}</b>` : ""}</div></div>
<div><div class="rotulo">Endereço de entrega</div><div>${c.entrega.map(escapar).join("<br>")}</div></div></div>
<div class="rolagem faixa"><table><thead><tr>${c.faixa.map(([r]) => `<th>${escapar(r)}</th>`).join("")}</tr></thead><tbody><tr>${c.faixa.map(([, v]) => `<td>${escapar(v)}</td>`).join("")}</tr></tbody></table></div>
<div class="rolagem"><table><thead><tr>${c.colunas.map((col) => `<th${DIREITA.has(col.chave) ? ' class="d"' : ""}>${escapar(col.titulo)}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>
<div class="totais">${c.linhasDeTotal.map(([r, v]) => `<div><span>${escapar(r)}</span><span>${escapar(v)}</span></div>`).join("")}<div class="geral"><span>Total (R$)</span><span>${escapar(c.total)}</span></div></div>
${c.blocos.map(([r, v]) => `<div class="condicao"><b>${escapar(r)}</b><p>${escapar(v)}</p></div>`).join("")}
</div></main></body></html>`;
}
