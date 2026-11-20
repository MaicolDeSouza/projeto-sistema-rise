import nodemailer from "nodemailer";

import { config } from "@/lib/integracoes/config";

/**
 * O e-mail que o Rise manda (hoje so o aviso de postagem ao cliente). SMTP do Google Workspace com a senha de aplicativo
 * de contato@4hobby.com.br, no `.env`. Com a trava EMAIL_ENVIO fechada o transporte nem e chamado: o PC nunca manda
 * e-mail a cliente de verdade.
 */

export const REMETENTE = "4hobby <contato@4hobby.com.br>";

let transportePadrao = null;
function transporteDoGoogle() {
  if (!config.email.usuario || !config.email.senha) throw new Error("E-mail não configurado: EMAIL_SMTP_USUARIO e EMAIL_SMTP_SENHA no .env.");
  // Criado uma vez: o nodemailer reaproveita a conexao entre envios.
  transportePadrao ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.email.usuario, pass: config.email.senha },
  });
  return transportePadrao;
}

/**
 * @param {{ para: string, assunto: string, texto: string }} mensagem
 * @param {{ transporte?: { sendMail: Function } }} opcoes o teste passa um transporte falso
 * @returns {Promise<{ ok: true, id } | { ok: false, erro: string, trava?: true }>}
 */
export async function enviarEmail({ para, assunto, texto }, { transporte } = {}) {
  if (!config.travas.emailEnvio) return { ok: false, trava: true, erro: "Não enviado: trava EMAIL_ENVIO fechada." };
  try {
    const resposta = await (transporte ?? transporteDoGoogle()).sendMail({ from: REMETENTE, to: para, subject: assunto, text: texto });
    return { ok: true, id: resposta?.messageId ?? null };
  } catch (erro) {
    return { ok: false, erro: `Não enviado: ${String(erro?.message ?? erro).slice(0, 200)}` };
  }
}
