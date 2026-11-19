import { meGet, meLer } from "@/lib/integracoes/melhorenvio";

import { ErroDoProvedor, MENSAGENS } from "./erro";

/**
 * O Melhor Envio atras da interface de provedor (spec 5.2). E o UNICO lugar, com `integracoes/melhorenvio.js`, que
 * conhece campo e status do Melhor Envio: a tela, a cotacao e o worker falam so com `cotar`, `comprar`... A SuperFrete,
 * no futuro, e outro arquivo com a mesma forma.
 *
 * Fase 1: so `cotar` e `saldo`. Os outros lancam ate a fase 2.
 */

const daFase2 = async () => {
  throw new Error("Disponível na fase 2 do módulo de frete.");
};

const somenteDigitos = (cep) => String(cep ?? "").replace(/\D/g, "");

/** Chama o Melhor Envio e troca qualquer falha por um ErroDoProvedor com a frase da tela. */
async function chamarComErro(chamada) {
  let resposta;
  try {
    resposta = await chamada();
  } catch (erro) {
    if (/não conectado|venceu|recusou o pedido de token/i.test(erro.message)) throw new ErroDoProvedor("NAO_CONECTADO", MENSAGENS.NAO_CONECTADO);
    throw new ErroDoProvedor("FORA_DO_AR", MENSAGENS.FORA_DO_AR);
  }
  const { ok, status, dados } = resposta;
  if (ok) return dados;
  if (status === 401 || status === 403) throw new ErroDoProvedor("NAO_CONECTADO", MENSAGENS.NAO_CONECTADO);
  if (status === 429 || status >= 500) throw new ErroDoProvedor("FORA_DO_AR", MENSAGENS.FORA_DO_AR);
  // 422 de CEP (medido em 18/11/2026): { errors: { postal_code: ["O campo cep_origem está invalido"] } }.
  const deCep = dados?.errors?.postal_code ?? dados?.errors?.["from.postal_code"] ?? dados?.errors?.["to.postal_code"];
  if (deCep) {
    const daOrigem = /origem/i.test(JSON.stringify(deCep)) || dados?.errors?.["from.postal_code"];
    throw new ErroDoProvedor("CEP_INVALIDO", daOrigem ? MENSAGENS.CEP_DE_ORIGEM : MENSAGENS.CEP_INVALIDO);
  }
  const texto = dados?.message ?? Object.values(dados?.errors ?? {}).flat()[0] ?? `HTTP ${status}`;
  throw new ErroDoProvedor("RECUSADO", `O Melhor Envio recusou: ${texto}`);
}

const numeroOuNulo = (valor) => (valor === undefined || valor === null || valor === "" || !Number.isFinite(Number(valor)) ? null : Number(valor));

function paraServico(item) {
  const recusa = item.error ? String(item.error) : null;
  return {
    servicoId: String(item.id),
    servicoNome: item.name,
    transportadora: item.company?.name ?? null,
    // custom_*: o preco e o prazo ja com as regras da conta (desconto, prazo extra), como o painel mostra.
    preco: recusa ? null : numeroOuNulo(item.custom_price ?? item.price),
    prazoDias: recusa ? null : numeroOuNulo(item.custom_delivery_time ?? item.delivery_time),
    motivoDaRecusa: recusa,
  };
}

async function cotar({ origem, destino, pacote, valorDeclarado }) {
  const dados = await chamarComErro(() =>
    meLer("/api/v2/me/shipment/calculate", {
      from: { postal_code: somenteDigitos(origem.cep) },
      to: { postal_code: somenteDigitos(destino.cep) },
      package: { height: pacote.alturaCm, width: pacote.larguraCm, length: pacote.comprimentoCm, weight: pacote.pesoKg },
      options: { insurance_value: valorDeclarado, receipt: false, own_hand: false },
    }),
  );
  const lista = Array.isArray(dados) ? dados : Object.values(dados ?? {});
  return lista.filter((item) => item && item.id !== undefined).map(paraServico);
}

async function saldo() {
  const dados = await chamarComErro(() => meGet("/api/v2/me/balance"));
  return { saldo: Number(dados?.balance ?? 0), reservado: Number(dados?.reserved ?? 0) };
}

export const melhorEnvio = {
  id: "MELHOR_ENVIO",
  nome: "Melhor Envio",
  capacidades: { reverso: true, formatosDeImpressao: ["TERMICA", "A4"], declaracaoDeConteudo: true },
  cotar,
  saldo,
  comprar: daFase2,
  imprimir: daFase2,
  rastrear: daFase2,
  cancelar: daFase2,
  gerarReverso: daFase2,
};
