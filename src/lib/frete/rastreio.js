import { prisma } from "@/lib/db";

import { obterProvedor, PROVEDOR_PADRAO } from "./provedores/registro";
import { linkDoRastreio } from "./regras";

/**
 * Rotina `envios` do worker (spec 5.6), a cada 15 minutos: pergunta ao provedor a situacao dos envios abertos, grava so o
 * que mudou e, na passagem para POSTADO, avisa o cliente. Etiqueta a postar que passou da validade vira EXPIRADO.
 * Provedor fora do ar e aviso da rotina, nunca erro do pedido: nenhum envio muda e a tela mostra o ultimo estado.
 */

const ABERTOS = ["A_POSTAR", "POSTADO", "COM_PROBLEMA"];
/** O cliente e avisado na postagem (`momentoDoAviso`): antes dela o link de rastreio nao mostra nada. */
const MOMENTO_DO_AVISO = "POSTADO";

const mesmaData = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
const jsonIgual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** O que gravar no envio pela situacao lida; vazio quando nada mudou. */
function mudancasDo(envio, lido) {
  const dados = {};
  if (lido.desconhecido) {
    const aviso = `Situação desconhecida do Melhor Envio: ${lido.statusOriginal ?? "(vazia)"}`;
    if (envio.ultimoErro !== aviso) dados.ultimoErro = aviso;
  } else {
    if (lido.status !== envio.status) dados.status = lido.status;
    if (envio.ultimoErro) dados.ultimoErro = null;
  }
  if (lido.rastreio && lido.rastreio !== envio.rastreio) {
    dados.rastreio = lido.rastreio;
    dados.linkDoRastreio = linkDoRastreio(lido.rastreio);
  }
  for (const [campo, valor] of [
    ["postadoEm", lido.datas.postadoEm],
    ["entregueEm", lido.datas.entregueEm],
    ["canceladoEm", lido.datas.canceladoEm],
  ]) {
    if (valor && !mesmaData(valor, envio[campo])) dados[campo] = valor;
  }
  if (lido.eventos.length && !jsonIgual(lido.eventos, envio.eventos)) dados.eventos = lido.eventos;
  return dados;
}

/**
 * @param {{ agora?: Date, avisar?: (envioId: string) => Promise<unknown> }} opcoes `avisar`: o aviso ao cliente (e-mail);
 *   o worker passa o de `aviso.js`.
 * @returns {Promise<{ ok: boolean, consultados: number, mudados: number, avisados: number, expirados: number, erro?: string }>}
 */
export async function rodarRastreioDosEnvios({ agora = new Date(), avisar } = {}) {
  const envios = await prisma.envio.findMany({ where: { status: { in: ABERTOS }, idNoProvedor: { not: null } } });
  const resultado = { ok: true, consultados: envios.length, mudados: 0, avisados: 0, expirados: 0 };
  if (envios.length === 0) return resultado;

  let lidos;
  try {
    lidos = await obterProvedor(PROVEDOR_PADRAO).rastrear(envios.map((envio) => envio.idNoProvedor));
  } catch (erro) {
    return { ...resultado, ok: false, erro: erro?.message ?? String(erro) };
  }

  // Os que nao mudaram ganham so a hora da consulta, numa escrita so (a tela mostra "consultado ha N min").
  const semMudanca = [];
  for (const envio of envios) {
    const lido = lidos.get(envio.idNoProvedor);
    const dados = lido ? mudancasDo(envio, lido) : {};
    // A etiqueta gerada vale 20 dias: a postar depois disso nao serve mais (o provedor tambem a marca expirada).
    if ((dados.status ?? envio.status) === "A_POSTAR" && envio.validoAte && new Date(envio.validoAte) < agora) dados.status = "EXPIRADO";
    if (dados.status === "EXPIRADO") resultado.expirados += 1;

    if (Object.keys(dados).length) {
      resultado.mudados += 1;
      await prisma.envio.update({ where: { id: envio.id }, data: { ...dados, ultimaConsultaEm: agora } });
    } else semMudanca.push(envio.id);

    if (dados.status === MOMENTO_DO_AVISO && avisar) {
      try {
        await avisar(envio.id);
        resultado.avisados += 1;
      } catch (erro) {
        console.error(`[frete] aviso do envio ${envio.numero} falhou:`, erro?.message ?? erro);
      }
    }
  }
  if (semMudanca.length) await prisma.envio.updateMany({ where: { id: { in: semMudanca } }, data: { ultimaConsultaEm: agora } });
  return resultado;
}
