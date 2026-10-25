import { LEITURAS_PARA_DIVERGIR } from "../ml/estadoNoML";

/**
 * O "!" da Loja Integrada vindo da LOJA (pedido do dono em 25/10/2026): o que o worker leu na loja e nao bate com o Rise
 * (`dados.monitorLI`, gravado por `monitor.js`). Puro e sem node: o icone (componente de cliente), o servidor e o teste
 * leem daqui. O "!" do Rise que mudou desde o ultimo envio (a assinatura) continua em `estado.js`.
 *
 * Acende com: campo diferente na loja (os mesmos da aba Divergencias), produto inativo, na lixeira, sumido ou duplicado
 * na loja, e o estoque da loja diferente do saldo do Bling em 2 leituras seguidas.
 */

const lista = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? ""));

const FORA_DA_LOJA = { removido: "na lixeira da loja", nao_existe: "não encontrado na loja", duplicado: "código duplicado na loja" };

/** `{ alertaNaLoja, estoqueDivergenteNaLoja, naLoja }` para o icone; `{}` sem monitor (o worker ainda nao leu). */
export function alertaDoMonitorLI(monitor) {
  if (!monitor) return {};
  const diferentes = Array.isArray(monitor.diferentes) ? monitor.diferentes : [];
  const fora = FORA_DA_LOJA[monitor.situacao] ?? null;
  const inativo = monitor.situacao === "existe" && monitor.ativo === false;
  const estoque = (monitor.estoqueDiferenteSeguidas ?? 0) >= LEITURAS_PARA_DIVERGIR ? { loja: monitor.estoque, bling: monitor.estoqueBling } : null;
  return {
    alertaNaLoja: Boolean(fora || inativo || estoque || diferentes.length > 0),
    estoqueDivergenteNaLoja: Boolean(estoque),
    naLoja: { diferentes, fora, inativo, estoque },
  };
}

/** Os textos do alerta, na ordem em que aparecem no icone ("inativo na loja", "diferente na loja: Nome e Preço"...). */
export function textosDoAlertaNaLoja(estado) {
  const naLoja = estado?.naLoja;
  if (!naLoja) return [];
  const textos = [];
  if (naLoja.fora) textos.push(naLoja.fora);
  if (naLoja.inativo) textos.push("inativo na loja");
  if (naLoja.diferentes?.length) textos.push(`diferente na loja: ${lista(naLoja.diferentes)}`);
  if (naLoja.estoque) textos.push(`estoque na loja ${naLoja.estoque.loja}, no Bling ${naLoja.estoque.bling}`);
  return textos;
}
