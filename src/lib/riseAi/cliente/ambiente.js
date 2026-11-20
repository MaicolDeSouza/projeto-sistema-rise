/**
 * O ambiente do servico `ia` (o chat da loja): o que ele EXIGE para subir e o que ele se RECUSA a ter.
 *
 * A recusa e a regra do dono "nao pode colocar todo o sistema do Rise em risco" escrita em codigo: se alguem, por
 * engano, subir o servico publico com o `.env` do Rise (a chave que decifra os tokens do Bling, do Mercado Livre e da
 * Loja Integrada, o segredo de borda, a senha do dono do banco), ele nao liga. E o usuario do banco tem de ser o
 * `rise_ia`: com o dono do banco, as visoes e as politicas nao protegeriam nada.
 *
 * Sem imports: roda ANTES de qualquer outro modulo do servico ser carregado. As mensagens dizem o NOME da variavel,
 * nunca o valor.
 */

export const PORTA_PADRAO = 8787;
const USUARIO_DO_BANCO = "rise_ia";
const PROIBIDAS = ["ENCRYPTION_KEY", "RISE_SEGREDO_DE_BORDA", "POSTGRES_PASSWORD", "TINYAUTH_AUTH_USERS", "RISE_AI_ADMINS"];
const PREFIXOS_PROIBIDOS = ["BLING_", "ML_", "LI_"];

const listaDe = (texto) => String(texto ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function ehHttps(endereco) {
  try {
    const url = new URL(endereco);
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.username;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} os problemas (vazio = pode subir)
 */
export function conferirAmbiente(env) {
  const problemas = [];

  for (const nome of Object.keys(env)) {
    if (env[nome] === undefined || env[nome] === "") continue;
    if (PROIBIDAS.includes(nome) || PREFIXOS_PROIBIDOS.some((prefixo) => nome.startsWith(prefixo))) {
      problemas.push(`${nome} não pode existir no ambiente do serviço do chat: ele não recebe as chaves do Rise.`);
    }
  }

  let usuario = null;
  try {
    usuario = decodeURIComponent(new URL(env.DATABASE_URL ?? "").username);
  } catch {
    usuario = null;
  }
  if (usuario !== USUARIO_DO_BANCO) problemas.push(`DATABASE_URL precisa usar o usuário ${USUARIO_DO_BANCO} (o usuário restrito do chat).`);

  if (!/^[0-9a-f]{64}$/i.test(env.IA_SEGREDO ?? "")) problemas.push("IA_SEGREDO precisa ter 64 caracteres hexadecimais.");

  const origens = listaDe(env.IA_ORIGENS);
  if (origens.length === 0 || !origens.every(ehHttps)) problemas.push("IA_ORIGENS precisa listar os endereços https da loja, separados por vírgula.");

  if (!ehHttps(env.IA_BASE_DAS_FOTOS ?? "")) problemas.push("IA_BASE_DAS_FOTOS precisa ser o endereço https de onde saem as fotos dos produtos.");

  if (env.IA_PORTA !== undefined && env.IA_PORTA !== "" && !(Number.isInteger(Number(env.IA_PORTA)) && Number(env.IA_PORTA) >= 1024 && Number(env.IA_PORTA) <= 65535)) {
    problemas.push("IA_PORTA precisa ser uma porta entre 1024 e 65535.");
  }
  return problemas;
}

/** O ambiente ja conferido, no formato que o processo usa. */
export function lerAmbiente(env) {
  return {
    porta: env.IA_PORTA ? Number(env.IA_PORTA) : PORTA_PADRAO,
    origens: listaDe(env.IA_ORIGENS).map((origem) => new URL(origem).origin),
    baseDasFotos: new URL(env.IA_BASE_DAS_FOTOS).origin,
    chaveHex: env.IA_SEGREDO,
  };
}
