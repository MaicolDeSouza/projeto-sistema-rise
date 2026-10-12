import { ErroDeUso } from "@/lib/riseAi/erros";
import { LOGINS_RESERVADOS, loginsAdministradores, normalizarLogin } from "./sessao.js";

/**
 * A semeadura de Acessos (spec §4 e §7): roda na partida do `app` (`src/instrumentation.js`), idempotente, e NAO e uma
 * migration (a migration so cria as tabelas; quem sao os administradores depende do `.env` de cada ambiente).
 *
 * So CRIA o que falta (revisao 2 da spec): a funcao Administrador; a Atendimento uma vez so (a marca em
 * `SemeaduraDeAcessos` impede que ela renasca a cada deploy depois de o dono excluir); e um usuario Administrador para
 * cada login de `RISE_AI_ADMINS` que ainda nao existe. Usuario que ja existe nao ganha nem perde funcao.
 */

/** A funcao Atendimento do primeiro dia (spec §7). O dono escolhe os demais cartoes do Painel na tela. */
export const PERMISSOES_DA_ATENDIMENTO = Object.freeze(
  [
    ["tela.painel", "ver"],
    ["cartao.painel.produtos", "ver"],
    ["cartao.painel.anunciosPublicados", "ver"],
    ["tela.cadastros", "ver"],
    ["tela.cadastros.clientes", "ver"],
    ["tela.cadastros.fornecedores", "ver"],
    ["tela.cadastros.concorrentes", "ver"],
    ["tela.cadastros.transportadoras", "ver"],
    ["tela.cadastros.marcas", "ver"],
    ["tela.canaisDeVenda", "ver"],
    ["tela.canaisDeVenda.mercadoLivre", "ver"],
    ["tela.canaisDeVenda.mercadoLivre.frases", "ver"],
    ["tela.canaisDeVenda.lojaIntegrada", "ver"],
    ["tela.produtos", "ver"],
    ["tela.produtos.cadastro", "ver"],
    ["tela.produtos.canais", "ver"],
    ["dado.custo", "ver"],
    ["dado.margem", "ver"],
    ["dado.localizacao", "ver"],
    ["dado.estoqueExato", "ver"],
    ["dado.concorrentes", "ver"],
    ["dado.pessoalDoCliente", "ver"],
    ["dado.financeiro", "ver"],
    ["tela.pedidos", "ver"],
    ["tela.estoque", "ver"],
    ["tela.financeiro", "ver"],
    ["tela.riseAi", "ver"],
    ["riseAi.chat", "editar"],
  ].map(([recurso, nivel]) => Object.freeze({ recurso, nivel })),
);

const NOMES = { administrador: "Administrador", atendimento: "Atendimento" };
const CHAVES = { atendimento: "atendimento" };

/** Corrida entre duas partidas (ou com o script): quem chega depois encontra o unico ocupado, e esta tudo certo. */
const jaExiste = (erro) => erro?.code === "P2002";

async function garantirAdministrador(prisma, nome) {
  return prisma.funcaoRise.upsert({
    where: { nome },
    update: {},
    create: { nome, descricao: "Vê e edita tudo.", fixa: true },
  });
}

/**
 * @param {{ prisma: object, env: Record<string, string|undefined>, nomes?: { administrador: string, atendimento: string }, chaves?: { atendimento: string } }} entrada
 *   `nomes` e `chaves` existem para o teste usar nomes proprios e nunca tocar na semeadura de verdade.
 * @returns {Promise<{ administradorId: string, atendimentoCriada: boolean, usuariosCriados: string[] }>}
 */
export async function semearAcessos({ prisma, env, nomes = NOMES, chaves = CHAVES }) {
  const administrador = await garantirAdministrador(prisma, nomes.administrador);
  if (!administrador.fixa) console.warn(`[acessos] a função "${nomes.administrador}" existe e não é fixa: confira na tela.`);

  let atendimentoCriada = false;
  const marca = await prisma.semeaduraDeAcessos.findUnique({ where: { chave: chaves.atendimento } });
  if (!marca) {
    try {
      await prisma.$transaction(async (tx) => {
        const existente = await tx.funcaoRise.findUnique({ where: { nome: nomes.atendimento } });
        if (!existente) {
          await tx.funcaoRise.create({
            data: {
              nome: nomes.atendimento,
              descricao: "Atende clientes pelo WhatsApp e pelo Rise.",
              permissoes: { create: PERMISSOES_DA_ATENDIMENTO.map(({ recurso, nivel }) => ({ recurso, nivel })) },
            },
          });
          atendimentoCriada = true;
        }
        await tx.semeaduraDeAcessos.create({ data: { chave: chaves.atendimento } });
      });
    } catch (erro) {
      if (!jaExiste(erro)) throw erro;
      atendimentoCriada = false;
    }
  }

  const usuariosCriados = [];
  for (const login of loginsAdministradores(env)) {
    if (await prisma.usuarioRise.findUnique({ where: { login }, select: { id: true } })) continue;
    try {
      await prisma.usuarioRise.create({ data: { login, nome: login, funcoes: { create: [{ funcaoId: administrador.id }] } } });
      usuariosCriados.push(login);
    } catch (erro) {
      if (!jaExiste(erro)) throw erro;
    }
  }
  return { administradorId: administrador.id, atendimentoCriada, usuariosCriados };
}

/**
 * `npm run acessos:admin -- <login>` (por SSH, na VPS): o caminho de volta quando ninguem mais administra. Cria ou
 * reativa o usuario e o liga a funcao Administrador.
 *
 * @returns {Promise<{ login: string, criado: boolean }>}
 */
export async function promoverAdministrador({ prisma, login: bruto, nomeAdministrador = NOMES.administrador }) {
  const login = normalizarLogin(bruto);
  if (!login) throw new ErroDeUso("Informe o login.");
  if (LOGINS_RESERVADOS.includes(login)) throw new ErroDeUso("Este login não pode ser usado.");

  const administrador = await garantirAdministrador(prisma, nomeAdministrador);
  const existente = await prisma.usuarioRise.findUnique({ where: { login }, select: { id: true } });
  const usuario = existente
    ? await prisma.usuarioRise.update({ where: { id: existente.id }, data: { ativo: true } })
    : await prisma.usuarioRise.create({ data: { login, nome: login } });
  await prisma.usuarioFuncao.upsert({
    where: { usuarioId_funcaoId: { usuarioId: usuario.id, funcaoId: administrador.id } },
    update: {},
    create: { usuarioId: usuario.id, funcaoId: administrador.id },
  });
  return { login, criado: !existente };
}
