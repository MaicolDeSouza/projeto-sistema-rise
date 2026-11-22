import { z } from "zod";

import { PRECOS_USD_POR_MILHAO } from "../modelos";

/**
 * A configuracao do chat da loja (o Hobi): o grupo `chatDaLoja` de `ConfiguracaoIA.dados` (spec de 19/11/2026, §8 e §9).
 * Mora aqui, fora de `configuracao.js`, porque o servico `ia` le o mesmo padrao e o mesmo esquema sem carregar o resto
 * da configuracao do Rise (chaves, Telegram, enderecos).
 *
 * O chat NASCE DESLIGADO: nada aparece na loja ate o dono ligar na tela.
 */

/** Os provedores que o canal aceita: so os de API paga com preco cadastrado (o modelo local do PC nao alcanca o servico). */
export const PROVEDORES_DO_CANAL = ["openai", "anthropic"];

export function chatDaLojaPadrao() {
  return {
    ligado: false,
    // Quem ve o chat ligado: `false` = so quem abre a loja com `?assistente=1` (o dono testa na loja de verdade sem os
    // clientes verem); `true` = todos os visitantes.
    publico: false,
    nome: "Hobi",
    // Diz o que ele faz (pedido do dono em 22/11/2026); o acompanhar pedido entrou com a fase 3.
    boasVindas: "Oi! Sou o Hobi, da 4hobby. Posso te ajudar a achar um componente, tirar dúvida sobre uma peça, montar a lista do seu projeto e acompanhar o seu pedido.",
    // Link wa.me da loja; vazio = sem botao de WhatsApp.
    whatsapp: "",
    // A chave PUBLICA do Turnstile (a secreta fica cifrada em SegredoDoAssistente).
    turnstileSiteKey: "",
    // Segunda a sexta, 9h-12h e 14h-17h (decisao do dono em 12/10/2026). So decide o aviso "fora do horario" do WhatsApp.
    horario: { dias: [1, 2, 3, 4, 5], turnos: [["09:00", "12:00"], ["14:00", "17:00"]] },
    principal: { provedor: "openai", modelo: "gpt-4.1-mini" },
    reserva: { provedor: "anthropic", modelo: "claude-haiku-5-5" },
    limites: {
      mensagensPorSessaoPorHora: 30,
      caracteresPorMensagem: 2000,
      brlPorSessaoPorDia: 0.5,
      mensagensPorIpPorHora: 60,
      respostasAoMesmoTempo: 5,
      brlPorDia: 7,
    },
  };
}

/**
 * O que o cerebro do cliente usa da configuracao GERAL do Rise AI quando o dono nunca salvou esses campos (a visao
 * `ia_configuracao` devolve nulo). Copia do `configuracaoPadrao` de `configuracao.js`, que o servico `ia` nao carrega
 * (ele traz chaves e enderecos); o `teste:assistente` falha se os dois divergirem.
 */
export const PADRAO_DO_CEREBRO = {
  tetoClientesBrl: 70,
  tempoLimite: { primeiroTokenMs: 45000, totalMs: 180000 },
  maxChamadasDeFerramenta: 8,
  maxTokensResposta: 1500,
  contextoMaxTokens: 12000,
};

// Modelo sem preco cadastrado nao pode responder cliente: o teto de gasto nao somaria (spec de 12/10/2026, §2a).
const Escolha = z.object({
  provedor: z.enum(PROVEDORES_DO_CANAL, { message: "Escolha OpenAI ou Anthropic." }),
  modelo: z
    .string()
    .max(200, "O nome do modelo é longo demais.")
    .refine((modelo) => Boolean(PRECOS_USD_POR_MILHAO[modelo]), "Escolha um modelo com preço cadastrado."),
});

const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.");

const inteiro = (minimo, maximo, rotulo) =>
  z.number({ message: `${rotulo}: informe um número.` }).int(`${rotulo}: use um número inteiro.`).min(minimo, `${rotulo}: no mínimo ${minimo}.`).max(maximo, `${rotulo}: no máximo ${maximo}.`);

const reais = (rotulo) =>
  z.number({ message: `${rotulo}: informe um número.` }).gt(0, `${rotulo}: precisa ser maior que zero.`).max(500, `${rotulo}: no máximo 500.`);

export const EsquemaDoChatDaLoja = z.object({
  ligado: z.boolean({ message: "Use ligado ou desligado." }),
  publico: z.boolean({ message: "Escolha quem vê o chat." }),
  nome: z.string().trim().min(1, "Informe o nome do assistente.").max(40, "O nome passa de 40 caracteres."),
  boasVindas: z.string().max(300, "A saudação passa de 300 caracteres."),
  whatsapp: z.string().refine((link) => link === "" || /^https:\/\/wa\.me\/\d{10,15}(\?\S*)?$/.test(link), "Use um link https://wa.me/ com o número da loja."),
  turnstileSiteKey: z.string().max(100, "A chave pública passa de 100 caracteres."),
  horario: z.object({
    dias: z.array(z.number().int().min(0).max(6)).max(7),
    turnos: z.array(z.tuple([Hora, Hora])).max(4),
  }),
  principal: Escolha,
  reserva: Escolha.nullable(),
  limites: z.object({
    mensagensPorSessaoPorHora: inteiro(1, 500, "Mensagens por visitante por hora"),
    caracteresPorMensagem: inteiro(200, 8000, "Caracteres por mensagem"),
    brlPorSessaoPorDia: reais("Gasto por visitante por dia"),
    mensagensPorIpPorHora: inteiro(1, 500, "Mensagens por IP por hora"),
    respostasAoMesmoTempo: inteiro(1, 50, "Respostas ao mesmo tempo"),
    brlPorDia: reais("Gasto por dia"),
  }),
});

const DIAS_DA_SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A loja esta FORA do horario de atendimento neste instante? Pelo relogio de Sao Paulo. So decide o aviso do botao do
 * WhatsApp ("respondemos no proximo dia util"); o assistente responde a qualquer hora.
 */
export function foraDoHorario(horario, agora = Date.now()) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(agora));
  const parte = (tipo) => partes.find((item) => item.type === tipo)?.value ?? "";
  const dia = DIAS_DA_SEMANA.indexOf(parte("weekday"));
  const hora = `${parte("hour")}:${parte("minute")}`;
  if (!(horario?.dias ?? []).includes(dia)) return true;
  return !(horario?.turnos ?? []).some(([de, ate]) => hora >= de && hora < ate);
}

/**
 * O link `wa.me` de um numero gravado como o Rise grava telefone (so digitos, com DDD, sem o 55; ver src/lib/telefone.js).
 * Aceita tambem o numero formatado e o que ja vem com o 55. Numero que nao e telefone brasileiro: `null` (sem botao).
 */
export function linkDoWhatsappDoNumero(numero) {
  const digitos = String(numero ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `https://wa.me/55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `https://wa.me/${digitos}`;
  return null;
}

/** O que foi salvo por cima do padrao. `limites` se mescla por dentro: salvar um limite nao pode apagar os outros. */
export function mesclarChatDaLoja(base, salvo) {
  const padrao = base ?? chatDaLojaPadrao();
  if (!salvo || typeof salvo !== "object") return padrao;
  return { ...padrao, ...salvo, limites: { ...padrao.limites, ...(salvo.limites && typeof salvo.limites === "object" ? salvo.limites : {}) } };
}
