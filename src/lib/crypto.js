import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Cifra dos segredos guardados na tabela Conexao.
 *
 * AES-256-GCM: alem de cifrar, autentica. Se alguem alterar um byte do texto
 * cifrado no banco, a decifragem falha em vez de devolver lixo silenciosamente.
 *
 * Formato gravado: "iv.tag.conteudo", tudo em base64url. O IV e novo a cada
 * chamada — reusar IV em GCM quebra a seguranca do modo.
 */

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12; // 96 bits, o recomendado para GCM

function obterChave() {
  const hex = process.env.ENCRYPTION_KEY;

  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY não definida no .env. Gere uma com: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  const chave = Buffer.from(hex, "hex");
  if (chave.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex); tem ${chave.length}.`,
    );
  }

  return chave;
}

/** Recebe um objeto, devolve a string cifrada pronta para gravar. */
export function cifrar(objeto) {
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv(ALGORITMO, obterChave(), iv);

  const conteudo = Buffer.concat([
    cifra.update(JSON.stringify(objeto), "utf8"),
    cifra.final(),
  ]);

  return [
    iv.toString("base64url"),
    cifra.getAuthTag().toString("base64url"),
    conteudo.toString("base64url"),
  ].join(".");
}

/** Recebe a string gravada, devolve o objeto original. */
export function decifrar(texto) {
  if (!texto) return null;

  const partes = texto.split(".");
  if (partes.length !== 3) {
    throw new Error("Segredo cifrado em formato inválido.");
  }

  const [iv, tag, conteudo] = partes.map((parte) =>
    Buffer.from(parte, "base64url"),
  );

  const decifra = createDecipheriv(ALGORITMO, obterChave(), iv);
  decifra.setAuthTag(tag);

  const aberto = Buffer.concat([
    decifra.update(conteudo),
    decifra.final(),
  ]);

  return JSON.parse(aberto.toString("utf8"));
}
