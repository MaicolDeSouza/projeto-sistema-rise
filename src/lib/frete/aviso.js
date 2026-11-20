import { prisma } from "@/lib/db";
import { enviarEmail } from "@/lib/email/enviar";
import { linkDoWhatsApp } from "@/lib/propostas/regras";

import { lerConfigDeFrete } from "./configuracao";
import { numeroDoEnvio, preencherTexto, TEXTOS_DO_AVISO } from "./regras";

/**
 * O aviso ao cliente quando o pacote e postado (spec 5.7): o e-mail automatico, uma vez so, e o link do WhatsApp com o texto
 * pronto. O texto vem de Configuracoes > Envios; campo vazio usa o padrao de `regras.js`.
 */

const SEM_EMAIL = "Cliente sem e-mail: use o WhatsApp.";
const dataCurta = (data) =>
  new Date(data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Os marcadores do texto. `pedido`: o numero do pedido vinculado ou, no envio avulso, o ENV-0001. */
export function dadosDoAviso(envio, pedido) {
  const nome = String(envio?.destinatario?.nome ?? "").trim();
  return {
    cliente: nome.split(/\s+/)[0] || "cliente",
    pedido: pedido?.numero ?? numeroDoEnvio(envio.numero),
    transportadora: envio.transportadoraNome ?? "",
    servico: envio.servicoNome ?? "",
    rastreio: envio.rastreio ?? "",
    link: envio.linkDoRastreio ?? "",
  };
}

const textos = (config) => ({
  assunto: config?.assuntoDoEmail || TEXTOS_DO_AVISO.assunto,
  email: config?.textoDoEmail || TEXTOS_DO_AVISO.email,
  whatsapp: config?.textoDoWhatsapp || TEXTOS_DO_AVISO.whatsapp,
});

const lerComPedido = (id) =>
  prisma.envio.findUnique({ where: { id: String(id ?? "") }, include: { pedidoDeVenda: { select: { numero: true } } } });

/**
 * Manda o e-mail de postagem UMA vez. A marca `avisoEmailEm` e posta antes de enviar, numa escrita condicional (quem nao
 * acha a linha sem marca nao manda: duas rotinas ao mesmo tempo dao um e-mail so). Se nao sair (sem e-mail, trava, SMTP),
 * a marca volta a nula com o motivo em `avisoEmailErro`, e o "Reenviar e-mail" tenta de novo.
 * @returns {Promise<{ ok: boolean, enviado: boolean, erro?: string }>}
 */
export async function avisarCliente(envioId, { transporte } = {}) {
  const agora = new Date();
  const tomada = await prisma.envio.updateMany({ where: { id: String(envioId ?? ""), avisoEmailEm: null }, data: { avisoEmailEm: agora, avisoEmailErro: null } });
  if (tomada.count === 0) return { ok: true, enviado: false };
  const envio = await lerComPedido(envioId);

  const falhou = async (erro) => {
    await prisma.envio.update({ where: { id: envio.id }, data: { avisoEmailEm: null, avisoEmailErro: erro } });
    return { ok: false, enviado: false, erro };
  };
  const para = String(envio?.destinatario?.email ?? "").trim();
  if (!para) return falhou(SEM_EMAIL);

  const modelo = textos(await lerConfigDeFrete());
  const dados = dadosDoAviso(envio, envio.pedidoDeVenda);
  const resposta = await enviarEmail({ para, assunto: preencherTexto(modelo.assunto, dados), texto: preencherTexto(modelo.email, dados) }, { transporte });
  if (!resposta.ok) return falhou(resposta.erro);
  console.info(`[frete] aviso de postagem do envio ${envio.numero} enviado`);
  return { ok: true, enviado: true };
}

/** O botao "Reenviar e-mail": so quando o anterior nao saiu. */
export async function reenviarEmail(envioId, { transporte } = {}) {
  const envio = await prisma.envio.findUnique({ where: { id: String(envioId ?? "") }, select: { avisoEmailEm: true } });
  if (!envio) return { ok: false, enviado: false, erro: "Envio não encontrado." };
  if (envio.avisoEmailEm) return { ok: false, enviado: false, erro: `O e-mail já foi enviado em ${dataCurta(envio.avisoEmailEm)}.` };
  return avisarCliente(envioId, { transporte });
}

/** O link `wa.me` com o texto pronto; sem telefone, null (o botao some). `config`: a ConfigDeFrete (texto do WhatsApp). */
export function linkDoWhatsappDoEnvio(envio, pedido, config) {
  const telefone = String(envio?.destinatario?.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return null;
  return linkDoWhatsApp(telefone, preencherTexto(textos(config).whatsapp, dadosDoAviso(envio, pedido)));
}

/** O clique no botao do WhatsApp: o "!" da lista apaga. */
export async function marcarWhatsapp(envioId) {
  const atualizado = await prisma.envio.updateMany({ where: { id: String(envioId ?? "") }, data: { avisoWhatsappEm: new Date() } });
  return atualizado.count ? { ok: true } : { ok: false, erro: "Envio não encontrado." };
}
