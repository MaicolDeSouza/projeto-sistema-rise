import { obter, USER_AGENT } from "@/lib/coleta/http";
import { enderecoPublico, lookupPublico, validarEnderecoPublico } from "@/lib/redePublica";

/**
 * Confere se o link de um documento da proposta abre (pedido do dono em 21/10/2026: os da Eletrogate davam 404 na
 * propria loja, e a proposta os mostrava como se valessem). Um GET que le so os cabecalhos (o corpo e descartado),
 * pelo `obter` da coleta com o filtro de rede publica: o endereco veio de pagina de terceiro, e o servidor nunca
 * pode ser levado a bater na rede interna. Segue redirecionamento, como o navegador do dono faria.
 */
export async function testarLink(url) {
  const resposta = await obter(enderecoPublico(url), {
    lookup: lookupPublico,
    validar: validarEnderecoPublico,
    sinal: AbortSignal.timeout(10000),
    cabecalhos: { "User-Agent": USER_AGENT, Accept: "*/*" },
    tetoDoCorpo: () => 0,
  });
  return { ok: resposta.status >= 200 && resposta.status < 300, status: resposta.status };
}

/**
 * Marca em cada item SEM arquivo baixado o `link: { ok, status, conferidoEm, erro? }`. Item com arquivo ja foi
 * conferido (e PDF guardado). Falha de rede, endereco recusado ou tempo esgotado = nao abre, com o motivo.
 *
 * @returns {Promise<{ testados: number, quebrados: number }>}
 */
export async function conferirLinksDosDocumentos(itens, { testar = testarLink } = {}) {
  let testados = 0;
  let quebrados = 0;
  for (const item of itens ?? []) {
    if (item.arquivo || !/^https?:\/\//i.test(String(item.url ?? ""))) continue;
    testados++;
    const conferidoEm = new Date().toISOString();
    try {
      const { ok, status } = await testar(item.url);
      item.link = { ok: Boolean(ok), status: status ?? null, conferidoEm };
    } catch (falha) {
      item.link = { ok: false, status: null, conferidoEm, erro: String(falha?.message ?? "não respondeu").slice(0, 200) };
    }
    if (!item.link.ok) quebrados++;
  }
  return { testados, quebrados };
}
