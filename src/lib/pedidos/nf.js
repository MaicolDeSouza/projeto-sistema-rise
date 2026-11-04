import { obterAccessToken } from "@/lib/integracoes/mercadolivre";

/**
 * Baixar a NF (PDF) e o XML de um pedido (fase 2 dos Pedidos de venda, spec 5.8). Nada fica gravado: o Rise busca na
 * hora. O ML exige o token do vendedor (os caminhos gravados sao da API dele), entao o Rise faz de intermediario; a LI e
 * o Bling dao um link direto, e o navegador e mandado para ele.
 */

const SEM_ARQUIVO = "Este canal não deu o arquivo.";

/**
 * Para onde vai o "Baixar NF" ou o "Baixar XML". Pura. `tipo` = "pdf" | "xml".
 * ML: so caminho da API (comeca com "/"), nunca URL absoluta: o token do vendedor iria junto para onde ela apontar.
 * LI e Bling: so https.
 */
export function destinoDaNF(nf, tipo) {
  if (!nf) return { erro: SEM_ARQUIVO };
  const xml = tipo === "xml";
  // O Bling guarda o link do XML no campo `xml` (urlXml fica null).
  const endereco = xml ? (nf.urlXml ?? (/^https?:\/\//i.test(String(nf.xml ?? "")) ? nf.xml : null)) : nf.urlPdf;
  if (!endereco) return { erro: SEM_ARQUIVO };
  const texto = String(endereco).trim();

  if (nf.origem === "MERCADO_LIVRE") {
    if (texto.startsWith("/") && !texto.startsWith("//")) return { tipo: "proxyML", caminho: texto };
    return { erro: "Endereço da NF fora da API do ML." };
  }
  if (/^https:\/\//i.test(texto)) return { tipo: "redirecionar", url: texto };
  return { erro: "Endereço da NF inválido." };
}

/** Baixa um documento da API do ML com o token do vendedor. Lanca quando o ML recusa. */
export async function baixarDoML(caminho, { obterToken = obterAccessToken, buscar = fetch } = {}) {
  const token = await obterToken();
  const resposta = await buscar(`https://api.mercadolibre.com${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) throw new Error(`O Mercado Livre recusou o download (HTTP ${resposta.status}).`);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return { bytes, tipoDeConteudo: resposta.headers.get("content-type") ?? "application/octet-stream" };
}
