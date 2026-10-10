import { config } from "./config";
import { salvarConexao } from "./conexoes";
import {
  classificarFalhaLojaIntegrada,
  clienteLojaIntegrada,
} from "./lojaIntegrada/client";

/**
 * Loja Integrada.
 *
 * Para a loja do proprio proprietario, a autenticacao atual usa somente o
 * Personal Token em `Authorization: Basic <PERSONAL_TOKEN>`. Nao se mistura
 * esse modelo com `chave_api + aplicacao`, reservado a integradores parceiros.
 */

const SERVICO = "LOJA_INTEGRADA";
export async function salvarCredenciais({ personalToken }) {
  const token = String(personalToken ?? "").trim();
  if (!token) throw new Error("Informe o Personal Token da Loja Integrada.");

  const agora = new Date();
  const expiraEm = new Date(agora);
  expiraEm.setMonth(expiraEm.getMonth() + 3);

  await salvarConexao(SERVICO, {
    segredo: { personalToken: token },
    status: "CONECTADO",
    conectadoEm: agora,
    expiraEm,
  });
}

export const liGet = (caminho, params) =>
  clienteLojaIntegrada.get(caminho, params);

/** Teste minimo, somente leitura: uma pagina com no maximo um produto. */
export async function testar(cliente = clienteLojaIntegrada) {
  try {
    const { ok, status, duracaoMs, dados } = await cliente.get("/produto", {
      limit: 1,
    });

    if (!ok) {
      return {
        ok: false,
        latenciaMs: duracaoMs,
        ...classificarFalhaLojaIntegrada(status, dados),
      };
    }

    const total = dados?.meta?.total_count ?? null;
    return {
      ok: true,
      latenciaMs: duracaoMs,
      conta: "Personal Token válido",
      detalhe:
        total === null ? "Catálogo acessível" : `${total} produto(s) no catálogo`,
    };
  } catch (erro) {
    // As mensagens ganharam acento em 07/10/2026; o "a" sem acento fica para mensagem antiga.
    const configuracao = /n[aã]o configurada|desabilitada/i.test(erro.message);
    return {
      ok: false,
      tipo: configuracao ? "CONFIGURACAO" : "INDISPONIVEL",
      erro: configuracao
        ? erro.message
        : "Não foi possível acessar a API da Loja Integrada.",
      ...(configuracao ? {} : { detalheTecnico: erro.message }),
    };
  }
}

export const conector = {
  id: SERVICO,
  nome: "Loja Integrada",
  descricao: "Loja própria — catálogo, pedidos e estoque",
  tipoAuth: "personal_token",
  origemOAuth: null,
  campos: [
    {
      nome: "personalToken",
      rotulo: "Personal Token",
      ajuda:
        "Gerado pelo proprietário em Configurações > Chave para API > Personal token.",
      tipo: "password",
    },
  ],
  configurado: config.lojaIntegrada.enabled,
  faltando: config.lojaIntegrada.enabled
    ? []
    : ["LOJA_INTEGRADA_ENABLED=true"],
  // Onde o proprietario gera ou troca o Personal Token, como os cartoes do Bling e do ML (pedido do dono em
  // 10/10/2026).
  painel: {
    url: "https://app.lojaintegrada.com.br/configuracao/token/personal",
    rotulo: "Link configuração API",
  },
  salvarCredenciais,
  testar,
};
