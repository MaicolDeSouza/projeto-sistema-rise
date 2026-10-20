import { prisma } from "@/lib/db";

import { ErroDeUso } from "./erros";

/**
 * A revisão do dia (spec §5.8, tela 3A): o dono lê, à noite, o que a equipe conversou com o assistente. As conversas
 * vêm na ordem que importa para quem tem pouco tempo — primeiro as que alguém SINALIZOU (👎 ou comentário), depois as
 * SUSPEITAS (a IA não achou produto, bateu no limite de consultas, deu erro ou a reserva respondeu) e, por último, o
 * resto. Só administradores leem conversa de outras pessoas.
 */

const FUSO = "America/Sao_Paulo";
const AVISOS_DE_SUSPEITA = ["sem_resultado", "limite_de_ferramentas", "erro"];
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

function exigirAdministrador(administrador) {
  if (!administrador) throw new ErroDeUso("Só administradores do Rise AI podem ver a revisão.");
}

/**
 * Do primeiro ao último instante de um dia de São Paulo, como datas UTC (as colunas guardam UTC). Perto da meia-noite o
 * UTC já é o dia seguinte: pedir "hoje" às 22h de São Paulo não pode devolver o dia de amanhã.
 *
 * @param {string} dia  "AAAA-MM-DD", no fuso de São Paulo
 * @returns {{ inicio: Date, fim: Date }}  `fim` é exclusivo
 */
export function limitesDoDia(dia) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? ""));
  if (!partes) throw new ErroDeUso("Dia inválido.");
  const [ano, mes, diaDoMes] = partes.slice(1).map(Number);
  const conferido = new Date(Date.UTC(ano, mes - 1, diaDoMes));
  if (conferido.getUTCFullYear() !== ano || conferido.getUTCMonth() !== mes - 1 || conferido.getUTCDate() !== diaDoMes) throw new ErroDeUso("Dia inválido.");

  // O deslocamento do fuso naquele dia, lido do próprio fuso (hoje é -3 h o ano todo, mas o relógio é quem diz).
  const meioDia = new Date(Date.UTC(ano, mes - 1, diaDoMes, 15));
  const horaLocal = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(meioDia));
  const inicio = new Date(Date.UTC(ano, mes - 1, diaDoMes, 15 - horaLocal));
  return { inicio, fim: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}

/** O dia de hoje em São Paulo, "AAAA-MM-DD": o dia em que a revisão abre. */
export const hojeEmSaoPaulo = () => new Date().toLocaleDateString("sv-SE", { timeZone: FUSO });

const horaDeSaoPaulo = (data) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(data);

/** Por que a resposta merece uma segunda olhada: os avisos que o laço grava e "reserva" (outro modelo respondeu). */
function suspeitasDaMensagem(mensagem) {
  const motivos = mensagem.avisos.filter((aviso) => AVISOS_DE_SUSPEITA.includes(aviso));
  return mensagem.motivoDaReserva ? [...motivos, "reserva"] : motivos;
}
const ehSinalizada = (mensagem) => mensagem.avaliacao === -1 || Boolean(mensagem.comentario?.trim());

/**
 * As conversas com mensagem no dia, já na ordem da revisão. Cada número (respostas, custo, modelos) é só do DIA: uma
 * conversa que continua amanhã mostra amanhã o que foi dito amanhã.
 *
 * `revisadaEm` só vale enquanto não chegou mensagem nova: conversa revisada que ganhou resposta depois volta para a fila.
 *
 * `suspeita` vale mesmo na conversa sinalizada (os selos mostram os dois); a ORDEM é que põe a sinalizada na frente.
 * `suspeitas` diz por quê: "sem_resultado", "limite_de_ferramentas", "erro" e/ou "reserva".
 *
 * `canal` diz de onde veio a conversa: "CHAT" (o chat interno, até 20/10/2026) ou "MCP" (as dúvidas que o Claude ou o
 * ChatGPT anotaram pelo `anotarDuvida`); no MCP, `cliente` é o nome do cliente ("Claude"), que a resposta guarda em `modelo`.
 *
 * @returns {Promise<{ id: string, titulo: string, usuario: string, canal: "CHAT" | "MCP", cliente: string | null, horaInicio: string,
 *   respostas: number, modelos: string[], custoBrl: number, sinalizada: boolean, suspeita: boolean, suspeitas: string[], revisadaEm: string | null }[]>}
 */
export async function conversasDoDia(dia, { administrador = false } = {}) {
  exigirAdministrador(administrador);
  const { inicio, fim } = limitesDoDia(dia);

  const conversas = await prisma.conversaIA.findMany({
    where: { mensagens: { some: { criadoEm: { gte: inicio, lt: fim } } } },
    include: {
      mensagens: {
        where: { criadoEm: { gte: inicio, lt: fim } },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: { papel: true, provedor: true, modelo: true, custoBrl: true, avaliacao: true, comentario: true, avisos: true, motivoDaReserva: true, criadoEm: true },
      },
    },
  });
  const ultimas = await prisma.mensagemIA.groupBy({ by: ["conversaId"], where: { conversaId: { in: conversas.map((conversa) => conversa.id) } }, _max: { criadoEm: true } });
  const ultimaDe = new Map(ultimas.map((linha) => [linha.conversaId, linha._max.criadoEm]));

  const itens = conversas.map((conversa) => {
    const respostas = conversa.mensagens.filter((mensagem) => mensagem.papel === "ASSISTENTE");
    const modelos = [...new Set(respostas.filter((mensagem) => mensagem.provedor && mensagem.modelo).map((mensagem) => `${mensagem.provedor}/${mensagem.modelo}`))];
    const sinalizada = respostas.some(ehSinalizada);
    const suspeitas = [...new Set(respostas.flatMap(suspeitasDaMensagem))];
    const revisadaValeu = conversa.revisadaEm && conversa.revisadaEm >= (ultimaDe.get(conversa.id) ?? 0);
    return {
      id: conversa.id,
      titulo: conversa.titulo,
      usuario: conversa.usuario,
      canal: conversa.canal,
      cliente: conversa.canal === "MCP" ? (respostas.find((mensagem) => mensagem.modelo)?.modelo ?? null) : null,
      horaInicio: horaDeSaoPaulo(conversa.mensagens[0].criadoEm),
      respostas: respostas.length,
      modelos,
      custoBrl: arredondar(respostas.reduce((soma, mensagem) => soma + Number(mensagem.custoBrl ?? 0), 0), 4),
      sinalizada,
      suspeita: suspeitas.length > 0,
      suspeitas,
      revisadaEm: revisadaValeu ? conversa.revisadaEm.toISOString() : null,
      // Só para ordenar: a última mensagem do dia.
      recente: conversa.mensagens[conversa.mensagens.length - 1].criadoEm.getTime(),
    };
  });

  const grupo = (item) => (item.sinalizada ? 0 : item.suspeita ? 1 : 2);
  itens.sort((a, b) => grupo(a) - grupo(b) || b.recente - a.recente);
  return itens.map(({ recente, ...item }) => {
    void recente;
    return item;
  });
}

/**
 * Marca a conversa como revisada por `usuario`. Não mexe em `atualizadoEm`: a lista de quem conversou é ordenada por
 * ele, e a conversa não pode subir para o topo só porque o dono a leu.
 */
export async function marcarRevisada(id, usuario) {
  const conversa = await prisma.conversaIA.findUnique({ where: { id: String(id ?? "") }, select: { id: true, atualizadoEm: true } });
  if (!conversa) throw new ErroDeUso("Conversa não encontrada.");
  return prisma.conversaIA.update({ where: { id: conversa.id }, data: { revisadaEm: new Date(), revisadaPor: String(usuario ?? "").trim() || null, atualizadoEm: conversa.atualizadoEm } });
}

/**
 * O rodapé da revisão: quanto o dia custou na API e quantas respostas cada modelo deu (as de erro não contam: nenhum
 * modelo respondeu). Local custa zero; preço desconhecido não soma.
 *
 * @returns {Promise<{ custoBrl: number, respostasPorModelo: Record<string, number> }>}
 */
export async function resumoDoDia(dia) {
  const { inicio, fim } = limitesDoDia(dia);
  const respostas = await prisma.mensagemIA.findMany({
    where: { papel: "ASSISTENTE", criadoEm: { gte: inicio, lt: fim }, provedor: { not: null }, modelo: { not: null }, NOT: { avisos: { has: "erro" } } },
    select: { provedor: true, modelo: true, custoBrl: true },
  });
  const respostasPorModelo = {};
  let custo = 0;
  for (const resposta of respostas) {
    const chave = `${resposta.provedor}/${resposta.modelo}`;
    respostasPorModelo[chave] = (respostasPorModelo[chave] ?? 0) + 1;
    custo += Number(resposta.custoBrl ?? 0);
  }
  return { custoBrl: arredondar(custo, 4), respostasPorModelo };
}
