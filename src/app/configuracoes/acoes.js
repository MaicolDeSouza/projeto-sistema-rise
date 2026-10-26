"use server";

import { revalidatePath } from "next/cache";

import { carregarUsuario, excluirFuncao, historicoDoUsuario, salvarFuncao, salvarUsuario, verComo } from "@/lib/acessos/banco";
import { definirSenha, removerLogin } from "@/lib/acessos/loginTinyauth";
import { executarComAcesso } from "@/lib/acessos/servidor";
import { salvarDadosDaEmpresa } from "@/lib/compras/empresa";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { ambienteDoRise } from "@/lib/sessao";
import { lerSegredo } from "@/lib/integracoes/conexoes";
import { criarClienteTelegram } from "@/lib/telegram/cliente";
import { SERVICO_TELEGRAM } from "@/lib/telegram/estado";
import { confirmarVinculo, desvincular, iniciarVinculo, localizarVinculo } from "@/lib/telegram/vinculo";

/**
 * Acoes de Configuracoes › Usuarios e funcoes. TODAS passam por `executarComAcesso` com "Usuarios e funcoes", que nao e
 * delegavel: so o Administrador (conferido no servidor, antes de qualquer leitura). Finas: a regra mora em
 * `src/lib/acessos/banco.js`, que e testado. Devolvem `{ ok, ... }`; erro de validacao volta em `erros` por campo.
 */

/** Listas que a tela manda como JSON num campo oculto (excecoes, a matriz de permissoes). */
function lerJson(formData, campo, padrao) {
  const bruto = formData.get(campo);
  if (bruto === null || bruto === "") return padrao;
  try {
    return JSON.parse(String(bruto)) ?? padrao;
  } catch {
    throw new ErroDeUso("Dados do formulário inválidos. Recarregue a página.");
  }
}

const atualizarTelas = () => revalidatePath("/configuracoes", "layout");

export async function salvarUsuarioAcao(id, formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const antes = id ? await carregarUsuario(id) : null;
    const resultado = await salvarUsuario(
      {
        id,
        login: formData.get("login"),
        nome: formData.get("nome"),
        assinatura: formData.get("assinatura"),
        ativo: formData.get("ativo") === "on",
        funcoes: formData.getAll("funcao").map(String),
        excecoes: lerJson(formData, "excecoes", []),
      },
      { quem: acesso.login ?? "pc" },
    );
    if (!resultado.ok) return { ok: false, erro: "Corrija os campos marcados.", erros: resultado.erros };
    // O login de entrada acompanha o cadastro: desativado ou com o login trocado, a pessoa deixa de entrar (o login novo
    // precisa de senha nova). O .env (reserva do dono) nao e tocado.
    const loginNovo = String(formData.get("login") ?? "").trim().toLowerCase();
    if (antes && (antes.login !== loginNovo || formData.get("ativo") !== "on")) await removerLogin(antes.login, { quem: acesso.login ?? "pc" });
    atualizarTelas();
    return { id: resultado.id };
  });
}

/** Na VPS ha a tela de entrada (Tinyauth); no PC nao ha login, e um arquivo de senhas aqui nao serviria para nada. */
function exigirVps() {
  if (ambienteDoRise(process.env) !== "vps") throw new ErroDeUso("Só na VPS: no PC não há tela de entrada.");
}

/**
 * "Definir senha" (Opcao 1 do dono, 20/10/2026): cria o login do usuario na tela de entrada, ou troca a senha. So o
 * Administrador (Usuarios e funcoes nao e delegavel). A senha chega num FormData e nunca volta; o arquivo do Tinyauth
 * guarda so o codigo bcrypt, e o vigia da VPS reinicia o login em ate um minuto.
 */
export async function definirSenhaAcao(id, formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    exigirVps();
    const usuario = await carregarUsuario(id);
    if (!usuario) throw new ErroDeUso("Usuário não encontrado.");
    if (!usuario.ativo) throw new ErroDeUso("Ative o usuário (e salve) antes de definir a senha.");
    const senha = formData.get("senha");
    if (senha !== formData.get("repetir")) return { ok: false, erro: "As senhas não conferem.", erros: { repetir: "As senhas não conferem." } };
    const resultado = await definirSenha({ login: usuario.login, nome: formData.get("nome"), senha }, { quem: acesso.login ?? "pc" });
    if (!resultado.ok) return resultado;
    atualizarTelas();
    return { nome: resultado.nome };
  });
}

/** "Remover login": a pessoa deixa de entrar no Rise (o cadastro e as funcoes ficam). */
export async function removerLoginAcao(id) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    exigirVps();
    const usuario = await carregarUsuario(id);
    if (!usuario) throw new ErroDeUso("Usuário não encontrado.");
    const { removido } = await removerLogin(usuario.login, { quem: acesso.login ?? "pc" });
    if (!removido) throw new ErroDeUso("Este usuário não tem login pelo Rise.");
    atualizarTelas();
    return {};
  });
}

export async function salvarFuncaoAcao(id, formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const resultado = await salvarFuncao(
      { id, nome: formData.get("nome"), descricao: formData.get("descricao"), permissoes: lerJson(formData, "permissoes", {}) },
      { quem: acesso.login ?? "pc" },
    );
    if (!resultado.ok) return { ok: false, erro: resultado.erro ?? "Corrija os campos marcados.", erros: resultado.erros ?? {} };
    atualizarTelas();
    return { id: resultado.id };
  });
}

export async function excluirFuncaoAcao(id) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const resultado = await excluirFuncao(id, { quem: acesso.login ?? "pc" });
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    atualizarTelas();
    return {};
  });
}

/** "Ver como" do usuario (`tipo` "usuario") ou da funcao ("funcao"): so leitura, do que esta salvo. */
export async function verComoAcao(tipo, id) {
  return executarComAcesso("tela.configuracoes.usuarios", "ver", async () => {
    const visto = await verComo(tipo, id);
    if (!visto) throw new ErroDeUso("Não encontrado. Recarregue a página.");
    return visto;
  });
}

/** A aba Historico do usuario: 100 linhas por pagina, a mais recente primeiro. */
export async function historicoDoUsuarioAcao(id, pagina = 1) {
  return executarComAcesso("tela.configuracoes.usuarios", "ver", async () => historicoDoUsuario(id, { pagina }));
}

// ------------------------------------------------------------------------------------------- Telegram (Entrega C1)
// O vinculo de uma pessoa ao chat dela, pela tela do usuario. So o Administrador (Usuarios e funcoes nao e delegavel).
// O codigo aparece UMA vez na tela; no banco fica so o hash. Nada fica escutando o Telegram: "Conferir vinculo" faz uma
// leitura curta do getUpdates (spec do agente, §7: C1 sem polling).

/** O cliente do bot com o token cadastrado, ou `null` sem token. */
async function clienteDoBot() {
  const segredo = await lerSegredo(SERVICO_TELEGRAM);
  return segredo?.token ? criarClienteTelegram({ token: segredo.token }) : null;
}

export async function gerarCodigoDeVinculoAcao(usuarioId) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    if (!(await clienteDoBot())) throw new ErroDeUso("Cadastre o token do bot em Rise AI › Configurações › Canais.");
    const { codigo, expiraEm } = await iniciarVinculo(String(usuarioId), { quem: acesso.login ?? "pc" }).catch((erro) => {
      throw new ErroDeUso(erro.message);
    });
    return { codigo, expiraEm: expiraEm.toISOString() };
  });
}

/** Le o Telegram uma vez e devolve o chat que mandou o codigo (nome e @, para o Administrador conferir) ou o motivo. */
export async function conferirVinculoAcao(usuarioId) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async () => {
    const cliente = await clienteDoBot();
    if (!cliente) return { ok: false, motivo: "sem-token" };
    const leitura = await localizarVinculo(String(usuarioId), { cliente });
    if (!leitura.ok) return leitura;
    return { ok: true, chat: leitura.chat };
  });
}

export async function confirmarVinculoAcao(usuarioId, chatId) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const cliente = await clienteDoBot();
    if (!cliente) throw new ErroDeUso("Cadastre o token do bot em Rise AI › Configurações › Canais.");
    const resultado = await confirmarVinculo(String(usuarioId), String(chatId ?? ""), { cliente, quem: acesso.login ?? "pc" });
    if (!resultado.ok) return resultado;
    atualizarTelas();
    return { aviso: resultado.aviso ?? null };
  });
}

export async function desvincularTelegramAcao(usuarioId) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    await desvincular(String(usuarioId), { quem: acesso.login ?? "pc" });
    atualizarTelas();
    return {};
  });
}

/** Dados da empresa (o cabecalho do pedido de compra). So o Administrador, como o resto da empresa. */
export async function salvarDadosDaEmpresaAcao(dados) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async () => {
    const resultado = await salvarDadosDaEmpresa(dados);
    if (resultado.ok) revalidatePath("/configuracoes/empresa");
    return resultado;
  });
}
