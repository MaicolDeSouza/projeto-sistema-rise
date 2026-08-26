/**
 * Leitura centralizada das variaveis de ambiente das integracoes.
 *
 * Este arquivo so roda no servidor. Nenhum valor daqui pode ser importado por
 * componente de cliente.
 */

function ler(nome, padrao = "") {
  const valor = process.env[nome];
  return valor === undefined || valor === "" ? padrao : valor;
}

function lerBooleano(nome) {
  return ler(nome, "false").toLowerCase() === "true";
}

export const config = {
  // Onde a interface roda. Tem que ser localhost: o navegador bloqueia os
  // scripts quando servidos de dominios de loopback publico (localtest.me e
  // afins), por causa de DNS rebinding.
  appUrl: ler("APP_URL", "https://localhost:3000"),

  bling: {
    clientId: ler("BLING_CLIENT_ID"),
    clientSecret: ler("BLING_CLIENT_SECRET"),
    redirectUri: ler(
      "BLING_REDIRECT_URI",
      "https://localhost:3000/api/oauth/bling/callback",
    ),
    canalMlId: ler("BLING_CANAL_ML_ID"),
  },

  mercadoLivre: {
    clientId: ler("ML_CLIENT_ID"),
    clientSecret: ler("ML_CLIENT_SECRET"),
    redirectUri: ler(
      "ML_REDIRECT_URI",
      "https://sistema-rise.localtest.me:3000/api/oauth/mercadolivre/callback",
    ),
  },

  lojaIntegrada: {
    chaveApi: ler("LI_CHAVE_API"),
    chaveAplicacao: ler("LI_CHAVE_APLICACAO"),
  },

  // Travas de seguranca. Enquanto false, nada e escrito nas plataformas.
  // A conta do Bling tem anuncios e estoque reais: a trava impede escrita
  // acidental por construcao, nao por disciplina.
  travas: {
    mlPublicacao: lerBooleano("ML_PUBLICACAO"),
    blingEscrita: lerBooleano("BLING_ESCRITA"),
  },
};

/**
 * Bloqueia qualquer escrita numa API externa enquanto a trava estiver
 * desligada. Chamar no inicio de toda funcao que faca POST/PUT/DELETE.
 */
export function exigirTravaLiberada(servico) {
  const travas = {
    MERCADO_LIVRE: ["mlPublicacao", "ML_PUBLICACAO"],
    BLING: ["blingEscrita", "BLING_ESCRITA"],
    LOJA_INTEGRADA: ["mlPublicacao", "ML_PUBLICACAO"],
  };

  const [chave, variavel] = travas[servico] ?? [];
  if (!chave || config.travas[chave]) return;

  throw new Error(
    `Escrita bloqueada: ${variavel} esta false no .env. Nenhum dado foi ` +
      "enviado. Mude para true quando quiser liberar a publicacao.",
  );
}
