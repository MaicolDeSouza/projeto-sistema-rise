import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { prisma } from "@/lib/db";

import { obterProvedor, PROVEDOR_PADRAO } from "./provedores/registro";

/**
 * O saldo da carteira do Melhor Envio (pedido do dono em 23/11/2026): o worker le de hora em hora e depois de cada
 * etiqueta comprada, e abaixo do limite (R$50, editavel em Configuracoes > Envios) sai UM aviso no Telegram por queda, com
 * o botao "Adicionar saldo". A recarga pelo Rise GERA a cobranca (Pix ou boleto) pela API e exige a senha da recarga; quem
 * paga e o dono, no link que volta. O Rise nunca paga nada sozinho.
 */

const ID = "frete";
/// A senha inicial que o dono pediu (23/11/2026). Vale so enquanto ele nao gravar outra em Configuracoes > Envios; a gravada
/// fica cifrada (scrypt), nunca em texto.
const SENHA_INICIAL = "123";
export const VALORES_RAPIDOS = [100, 200, 500];
export const VALOR_MINIMO = 10;
export const VALOR_MAXIMO = 5000;
export const FORMAS = ["PIX", "BOLETO"];

const centavos = (valor) => Math.round(Number(valor) * 100) / 100;

/**
 * A regra do aviso (pura): `saldoBaixoDesde` nasce quando o saldo cai abaixo do limite e some quando volta a ficar igual ou
 * acima. A chave do aviso usa essa data: uma queda = um aviso, e o proximo so depois de o saldo subir e cair de novo.
 */
export function proximoSaldoBaixoDesde({ saldo, limite, desdeAnterior, agora }) {
  if (saldo === null || saldo === undefined || !Number.isFinite(Number(saldo))) return desdeAnterior ?? null;
  if (Number(saldo) >= Number(limite)) return null;
  return desdeAnterior ?? new Date(agora);
}

/** Le o saldo no provedor e grava na configuracao. Nunca lanca: a falha so vai ao log e o saldo gravado fica. */
export async function lerEGravarSaldo({ provedor = obterProvedor(PROVEDOR_PADRAO), agora = new Date() } = {}) {
  try {
    const { saldo } = await provedor.saldo();
    const linha = await prisma.configDeFrete.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
    const desde = proximoSaldoBaixoDesde({ saldo, limite: Number(linha.limiteDeSaldo), desdeAnterior: linha.saldoBaixoDesde, agora });
    await prisma.configDeFrete.update({ where: { id: ID }, data: { saldoAtual: centavos(saldo), saldoLidoEm: agora, saldoBaixoDesde: desde } });
    return { ok: true, saldo: centavos(saldo), limite: Number(linha.limiteDeSaldo), baixoDesde: desde };
  } catch (erro) {
    // Aviso, nao erro: sem conexao (o PC) ou o Melhor Envio fora do ar sao estados esperados, e o saldo gravado fica.
    console.warn("[frete] leitura do saldo:", erro?.message ?? erro);
    return { ok: false, erro: erro?.message ?? String(erro) };
  }
}

/** O que a tela e o aviso mostram, sem chamar o provedor. */
export async function situacaoDoSaldo() {
  const linha = await prisma.configDeFrete.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
  return {
    saldo: linha.saldoAtual === null ? null : Number(linha.saldoAtual),
    lidoEm: linha.saldoLidoEm,
    limite: Number(linha.limiteDeSaldo),
    baixoDesde: linha.saldoBaixoDesde,
    senhaInicial: !linha.senhaDaRecarga,
  };
}

function cifrar(senha) {
  const sal = randomBytes(16);
  return `${sal.toString("hex")}:${scryptSync(String(senha), sal, 32).toString("hex")}`;
}

function confere(senha, guardada) {
  if (!guardada) return String(senha ?? "") === SENHA_INICIAL;
  const [sal, hash] = String(guardada).split(":");
  if (!sal || !hash) return false;
  const esperado = Buffer.from(hash, "hex");
  const calculado = scryptSync(String(senha ?? ""), Buffer.from(sal, "hex"), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Configuracoes > Envios: limite do aviso e, se veio, a senha nova da recarga (3 a 64 caracteres). */
export async function salvarSaldoDoFrete({ limiteDeSaldo, senhaNova }) {
  const erros = {};
  const limite = lerValorDaRecarga(limiteDeSaldo);
  if (limite === null || limite < 0 || limite > 100000) erros.limiteDeSaldo = "Valor de R$0,00 a R$100.000,00.";
  const senha = String(senhaNova ?? "");
  if (senha && (senha.length < 3 || senha.length > 64)) erros.senhaNova = "A senha tem de 3 a 64 caracteres.";
  if (Object.keys(erros).length) return { ok: false, erros };
  const linha = await prisma.configDeFrete.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
  // Limite novo refaz a marca da queda com o saldo gravado: subir o limite acima do saldo avisa na proxima volta.
  const desde = proximoSaldoBaixoDesde({ saldo: linha.saldoAtual === null ? null : Number(linha.saldoAtual), limite, desdeAnterior: linha.saldoBaixoDesde, agora: new Date() });
  await prisma.configDeFrete.update({ where: { id: ID }, data: { limiteDeSaldo: limite, saldoBaixoDesde: desde, ...(senha ? { senhaDaRecarga: cifrar(senha) } : {}) } });
  return { ok: true };
}

/** Le o valor digitado ("150", "150,50", "1.500,00", "R$150"). */
export function lerValorDaRecarga(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) ? centavos(texto) : null;
  const limpo = String(texto ?? "").trim().replace(/^R\$\s*/i, "");
  if (!limpo) return null;
  const numero = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(numero) ? centavos(numero) : null;
}

function paraTela(recarga) {
  return {
    id: recarga.id, valor: Number(recarga.valor), forma: recarga.forma, status: recarga.status, link: recarga.link, digitavel: recarga.digitavel,
    pedidoPor: recarga.pedidoPor, erro: recarga.erro, criadoEm: recarga.criadoEm.toISOString(),
  };
}

/**
 * Gera a recarga: confere a senha, o valor e a forma, pede a cobranca ao provedor e guarda o pedido (com a resposta
 * inteira). Nunca lanca. `{ ok: true, recarga }` ou `{ ok: false, erro, erros? }`.
 */
export async function gerarRecarga({ valor, forma, senha, login, provedor = obterProvedor(PROVEDOR_PADRAO), urlDeVolta = null }) {
  const erros = {};
  const quanto = lerValorDaRecarga(valor);
  if (quanto === null || quanto < VALOR_MINIMO || quanto > VALOR_MAXIMO) erros.valor = `Valor de R$${VALOR_MINIMO},00 a R$${VALOR_MAXIMO.toLocaleString("pt-BR")},00.`;
  if (!FORMAS.includes(forma)) erros.forma = "Escolha Pix ou boleto.";
  const linha = await prisma.configDeFrete.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
  if (!confere(senha, linha.senhaDaRecarga)) erros.senha = "Senha incorreta.";
  if (Object.keys(erros).length) return { ok: false, erro: Object.values(erros)[0], erros };

  let empresa = null;
  if (forma === "BOLETO") {
    const dados = await lerDadosDaEmpresa().catch(() => null);
    if (dados?.razaoSocial && dados?.cnpj) empresa = { nome: dados.razaoSocial, cnpj: dados.cnpj };
  }
  try {
    const gerado = await provedor.recarregar({ valor: quanto, forma, redirectUrl: urlDeVolta, empresa });
    const temLink = Boolean(gerado.link || gerado.digitavel);
    const recarga = await prisma.recargaDoFrete.create({
      data: {
        valor: quanto, forma, status: temLink ? "GERADA" : "FALHOU", link: gerado.link, digitavel: gerado.digitavel, idNoProvedor: gerado.id,
        pedidoPor: login ?? null, resposta: gerado.resposta ?? {}, erro: temLink ? null : "O Melhor Envio não devolveu o link do pagamento.",
      },
    });
    if (!temLink) return { ok: false, erro: "O Melhor Envio aceitou o pedido mas não devolveu o link do pagamento: confira a carteira no painel do Melhor Envio.", recarga: paraTela(recarga) };
    return { ok: true, recarga: paraTela(recarga) };
  } catch (erro) {
    const mensagem = erro?.message ?? String(erro);
    await prisma.recargaDoFrete.create({ data: { valor: quanto, forma, status: "FALHOU", pedidoPor: login ?? null, erro: mensagem } }).catch(() => {});
    return { ok: false, erro: mensagem };
  }
}

/** As ultimas recargas pedidas pelo Rise (a tela mostra embaixo). */
export async function ultimasRecargas(quantas = 10) {
  const linhas = await prisma.recargaDoFrete.findMany({ orderBy: { criadoEm: "desc" }, take: quantas });
  return linhas.map(paraTela);
}
