import { meGet, meLer, mePost } from "@/lib/integracoes/melhorenvio";
import { dataDoProvedor, eventosDasDatas, numeroDoEnvio, statusDoProvedor, validadeDaEtiqueta } from "../regras";

import { ErroDoProvedor, MENSAGENS } from "./erro";

/**
 * O Melhor Envio atras da interface de provedor (spec 5.2). E o UNICO lugar, com `integracoes/melhorenvio.js`, que
 * conhece campo e status do Melhor Envio: a tela, a cotacao e o worker falam so com `cotar`, `comprar`... A SuperFrete,
 * no futuro, e outro arquivo com a mesma forma.
 *
 * Fase 2 (documentacao lida em 19/11/2026): carrinho -> pagamento -> geracao. Carrinho, pagamento, geracao e
 * cancelamento gastam ou devolvem saldo e passam pela trava FRETE_COMPRA (`mePost`); rastreio e impressao sao POST de
 * leitura (`meLer`). O reverso e da fase 3.
 */

const daFase3 = async () => {
  throw new Error("Disponível na fase 3 do módulo de frete.");
};

const somenteDigitos = (cep) => String(cep ?? "").replace(/\D/g, "");

/** Chama o Melhor Envio e troca qualquer falha por um ErroDoProvedor com a frase da tela. */
async function chamarComErro(chamada) {
  let resposta;
  try {
    resposta = await chamada();
  } catch (erro) {
    if (/FRETE_COMPRA/.test(erro.message)) throw new ErroDoProvedor("TRAVADO", MENSAGENS.TRAVADO);
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
  // O 422 do carrinho traz `errors` campo a campo; o do cancelamento, `error`. A primeira frase e a que vale.
  const texto = Object.values(dados?.errors ?? {}).flat()[0] ?? dados?.error ?? dados?.message ?? `HTTP ${status}`;
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

const texto = (valor, limite) => (valor === null || valor === undefined || valor === "" ? undefined : String(valor).slice(0, limite));
const dinheiro = (valor) => Math.round(Number(valor ?? 0) * 100) / 100;

/** Remetente ou destinatario do Rise ({ nome, documento, inscricaoEstadual, email, telefone, endereco }) na forma do carrinho. */
function parte(pessoa, { comInscricao }) {
  const documento = somenteDigitos(pessoa?.documento);
  const endereco = pessoa?.endereco ?? {};
  return {
    name: texto(pessoa?.nome, 100),
    phone: texto(somenteDigitos(pessoa?.telefone), 20),
    email: texto(pessoa?.email, 150),
    // CPF vai em `document`; CNPJ, em `company_document` (regra do carrinho).
    ...(documento.length === 14 ? { company_document: documento } : documento.length === 11 ? { document: documento } : {}),
    // A inscricao estadual so com NF-e: com declaracao de conteudo o campo tem de ir vazio.
    ...(comInscricao && pessoa?.inscricaoEstadual ? { state_register: String(pessoa.inscricaoEstadual) } : {}),
    address: texto(endereco.logradouro, 150),
    number: texto(endereco.numero, 20),
    complement: texto(endereco.complemento, 100),
    district: texto(endereco.bairro, 100),
    city: texto(endereco.cidade, 100),
    state_abbr: texto(endereco.uf, 2),
    country_id: "BR",
    postal_code: somenteDigitos(endereco.cep),
  };
}

/** O corpo do `POST /api/v2/me/cart`: um volume so, os produtos (a DC-e vai a SEFAZ) e a nota ou a declaracao. */
export function corpoDoCarrinho(envio) {
  const comNota = envio.tipoDeDocumento === "NFE";
  return {
    service: Number(envio.servicoId),
    from: parte(envio.remetente, { comInscricao: comNota }),
    to: parte(envio.destinatario, { comInscricao: false }),
    products: (envio.itensDaDeclaracao ?? []).map((item) => ({
      name: String(item.descricao ?? "").slice(0, 100),
      quantity: Number(item.quantidade ?? 1),
      unitary_value: dinheiro(item.valorUnitario),
    })),
    volumes: [{ height: Number(envio.alturaCm), width: Number(envio.larguraCm), length: Number(envio.comprimentoCm), weight: Number(envio.pesoKg) }],
    options: {
      insurance_value: dinheiro(envio.valorDeclarado),
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: !comNota,
      ...(comNota ? { invoice: { key: somenteDigitos(envio.chaveNfe) } } : {}),
      platform: "Rise 4hobby",
      tags: [{ tag: envio.pedidoNumero ? `Pedido ${envio.pedidoNumero}` : numeroDoEnvio(envio.numero), url: null }],
    },
  };
}

const lerPedido = (id) => chamarComErro(() => meGet(`/api/v2/me/orders/${encodeURIComponent(id)}`));

/**
 * Carrinho -> pagamento -> geracao. `aoCriarNoCarrinho(id, protocolo)` e chamado ANTES do pagamento, para o banco guardar
 * o id: uma queda depois disso e retomada por ele, sem outro carrinho (e sem pagar duas vezes). Com `idNoProvedor`, le o
 * pedido e continua da etapa em que parou.
 */
async function comprar(envio, { aoCriarNoCarrinho } = {}) {
  let id = envio.idNoProvedor ?? null;
  let pedido = null;
  if (!id) {
    const criado = await chamarComErro(() => mePost("/api/v2/me/cart", corpoDoCarrinho(envio)));
    if (!criado?.id) throw new ErroDoProvedor("RECUSADO", "O Melhor Envio não devolveu o pedido do carrinho.");
    id = String(criado.id);
    await aoCriarNoCarrinho?.(id, criado.protocol ?? null);
  } else {
    pedido = await lerPedido(id);
    const situacao = String(pedido?.status ?? "");
    if (situacao === "canceled" || situacao === "expired") {
      throw new ErroDoProvedor("PEDIDO_ENCERRADO", "A compra pela metade expirou ou foi cancelada no Melhor Envio: cote de novo.");
    }
  }
  if (!pedido || pedido.status === "pending") {
    await chamarComErro(() => mePost("/api/v2/me/shipment/checkout", { orders: [id] }));
  }
  if (!pedido?.generated_at) {
    const gerado = await chamarComErro(() => mePost("/api/v2/me/shipment/generate", { orders: [id] }));
    const doPedido = gerado?.[id];
    if (doPedido && doPedido.status === false) throw new ErroDoProvedor("RECUSADO", `O Melhor Envio recusou: ${doPedido.message ?? "etiqueta não gerada"}`);
  }
  const final = await lerPedido(id);
  const geradoEm = dataDoProvedor(final?.generated_at) ?? new Date();
  return {
    idNoProvedor: id,
    protocolo: final?.protocol ?? null,
    custo: dinheiro(final?.price),
    rastreio: final?.tracking ?? final?.self_tracking ?? null,
    geradoEm,
    validoAte: validadeDaEtiqueta(geradoEm),
    eventos: eventosDasDatas(final),
  };
}

/** O link publico da pagina de impressao (o Rise nao guarda: pede a cada clique). */
async function imprimir(envio) {
  const dados = await chamarComErro(() => meLer("/api/v2/me/shipment/print", { mode: "public", orders: [envio.idNoProvedor] }));
  if (!dados?.url) throw new ErroDoProvedor("RECUSADO", "O Melhor Envio não devolveu o link da etiqueta.");
  return { url: String(dados.url) };
}

const LOTE_DO_RASTREIO = 100;

/** Situacao de cada envio, em lotes. O id que o Melhor Envio nao devolve fica fora do mapa (a rotina nao mexe nele). */
async function rastrear(ids) {
  const resultado = new Map();
  const lista = [...new Set((ids ?? []).filter(Boolean).map(String))];
  for (let i = 0; i < lista.length; i += LOTE_DO_RASTREIO) {
    const dados = await chamarComErro(() => meLer("/api/v2/me/shipment/tracking", { orders: lista.slice(i, i + LOTE_DO_RASTREIO) }));
    for (const [id, item] of Object.entries(dados ?? {})) {
      if (!item || typeof item !== "object") continue;
      const { status, desconhecido } = statusDoProvedor(item.status);
      resultado.set(id, {
        status,
        desconhecido,
        statusOriginal: item.status ?? null,
        rastreio: item.tracking ?? item.melhorenvio_tracking ?? null,
        datas: {
          postadoEm: dataDoProvedor(item.posted_at),
          entregueEm: dataDoProvedor(item.delivered_at),
          canceladoEm: dataDoProvedor(item.canceled_at),
          expiradoEm: dataDoProvedor(item.expired_at),
        },
        eventos: eventosDasDatas(item),
      });
    }
  }
  return resultado;
}

/** `reason_id` e sempre "2" nas integracoes; com a etiqueta gerada, o estorno cai na carteira em 12 h. */
async function cancelar(envio, motivo) {
  await chamarComErro(() =>
    mePost("/api/v2/me/shipment/cancel", { order: { id: envio.idNoProvedor, reason_id: "2", description: String(motivo || "Cancelado pelo Rise").slice(0, 255) } }),
  );
  return { ok: true };
}

export const melhorEnvio = {
  id: "MELHOR_ENVIO",
  nome: "Melhor Envio",
  capacidades: { reverso: true, formatosDeImpressao: ["TERMICA", "A4"], declaracaoDeConteudo: true },
  cotar,
  saldo,
  corpoDoCarrinho,
  comprar,
  imprimir,
  rastrear,
  cancelar,
  gerarReverso: daFase3,
};
