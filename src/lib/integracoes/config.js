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

function lerBooleano(nome, padrao = false) {
  return ler(nome, String(padrao)).toLowerCase() === "true";
}

/**
 * "a, B ,,c" vira ["a", "B", "c"]: separado por virgula, aparado e sem vazios.
 * Exportada para o teste conferir a regra sem mexer no ambiente.
 */
export function separarLista(texto) {
  return String(texto ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * "2026-11-01" vira a meia-noite desse dia em Sao Paulo (UTC-3, sem horario de verao desde 2019), em UTC.
 * Data invalida cai em 01/11/2026, o corte combinado com o dono: um .env errado nao pode abrir a leitura de
 * todo o historico.
 */
function dataDeSaoPaulo(texto) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00-03:00`) : null;
  return data && !Number.isNaN(data.getTime()) ? data : new Date("2026-11-01T00:00:00-03:00");
}

export const config = {
  // Onde a interface roda. Tem que ser localhost: o navegador bloqueia os
  // scripts quando servidos de dominios de loopback publico (localtest.me e
  // afins), por causa de DNS rebinding.
  appUrl: ler("APP_URL", "https://localhost:3000"),

  // Endereco PUBLICO do Rise (a VPS). Vazio enquanto o Rise roda so no PC: sem ele
  // nenhum link de documento vai para a descricao da Loja Integrada, porque o cliente
  // da loja nao alcanca o localhost.
  appUrlPublica: ler("APP_URL_PUBLICA"),

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
    personalToken: ler("LOJA_INTEGRADA_PERSONAL_TOKEN"),
    enabled: lerBooleano("LOJA_INTEGRADA_ENABLED", true),
    /// Endereco da loja. Nao monta a URL do produto (elas sao baseadas no nome
    /// e editaveis), mas avisa quando o link colado for de outro dominio.
    dominio: ler("LI_DOMINIO"),
  },

  // Pedidos de venda (04/11/2026): o Rise so le pedidos criados a partir desta data (00:00 de Sao Paulo).
  // Pedido anterior e ignorado, inclusive uma alteracao dele. Fica no .env para um dia mudar sem codigo.
  pedidos: {
    desde: dataDeSaoPaulo(ler("PEDIDOS_DESDE", "2026-11-01")),
  },

  // Travas de seguranca. Enquanto false, nada e escrito nas plataformas.
  // A conta do Bling tem anuncios e estoque reais: a trava impede escrita
  // acidental por construcao, nao por disciplina.
  travas: {
    // Emissao de NF pelo Rise (Pedidos de venda). Enquanto false, o botao "Criar NF" fica desabilitado.
    nfe: lerBooleano("NFE_EMISSAO"),
    mlPublicacao: lerBooleano("ML_PUBLICACAO"),
    // Segunda trava do Mercado Livre, no molde da do Bling: com ML_PUBLICACAO ligada, so os codigos
    // desta lista (o SKU do anuncio, ou o codigo do kit) podem ser publicados. Vazia = todos.
    mlCodigosLiberados: separarLista(ler("ML_PUBLICACAO_CODIGOS")),
    blingEscrita: lerBooleano("BLING_ESCRITA"),
    // Segunda trava do Bling: com BLING_ESCRITA ligada, so os codigos desta lista
    // (separados por virgula) podem ser escritos; qualquer outro e recusado antes da
    // chamada. Vazia = todos liberados. Serve para o primeiro teste com UM produto de
    // teste, numa conta com 1007 anuncios reais. Lida uma vez, na carga: o ambiente nao
    // muda com o processo no ar.
    blingCodigosLiberados: separarLista(ler("BLING_ESCRITA_CODIGOS")),
    liEscrita: lerBooleano("LI_ESCRITA"),
    // Segunda trava da Loja Integrada, no molde da do Bling: com LI_ESCRITA ligada, so os
    // SKUs desta lista podem ser escritos. Vazia = todos liberados. A loja tem 725 produtos
    // reais e a NF-e sai dela: o primeiro envio e com UM produto de teste.
    liCodigosLiberados: separarLista(ler("LI_ESCRITA_CODIGOS")),
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
    LOJA_INTEGRADA: ["liEscrita", "LI_ESCRITA"],
  };

  const [chave, variavel] = travas[servico] ?? [];
  if (!chave || config.travas[chave]) return;

  throw new Error(
    `Escrita bloqueada: ${variavel} está false no .env. Nenhum dado foi ` +
      "enviado. Mude para true quando quiser liberar a publicação.",
  );
}
