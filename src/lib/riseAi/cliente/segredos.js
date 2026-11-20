import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Os segredos do SERVICO `ia` (a chave de IA do chat e o segredo do Turnstile), cifrados com a chave "segredos" derivada
 * do `IA_SEGREDO` (`derivarChave`).
 *
 * Chave PROPRIA, e nao a ENCRYPTION_KEY do Rise: o servico publico nunca recebe a chave que decifra os tokens do Bling,
 * do Mercado Livre e da Loja Integrada (regra do dono: "nao pode colocar todo o sistema do Rise em risco"). O Rise grava
 * cifrado (tela Canais); o servico le e decifra.
 *
 * AES-256-GCM: texto adulterado ou chave errada LANCA, nunca devolve lixo. Formato `v1.<iv>.<tag>.<dados>`, em base64.
 */

const VERSAO = "v1";

function chaveDe(chaveHex) {
  if (typeof chaveHex !== "string" || !/^[0-9a-f]{64}$/i.test(chaveHex)) throw new Error("IA_SEGREDO precisa ter 64 caracteres hexadecimais.");
  return Buffer.from(chaveHex, "hex");
}

// O rotulo de cada uso entra na derivacao: trocar um rotulo troca a chave (e o que foi cifrado com a antiga nao abre mais).
const USOS = { segredos: "rise-ia/segredos/v1", passe: "rise-ia/passe/v1" };

/**
 * A chave de UM uso, derivada do `IA_SEGREDO` (HKDF-SHA256). O `IA_SEGREDO` nunca e usado direto: a chave que cifra os
 * segredos (AES) e a que assina o passe da verificacao de robo (HMAC) sao diferentes, e uma nao revela a outra. Quem
 * CIFRA (o Rise, na tela Canais) e quem DECIFRA (o servico) derivam a mesma chave "segredos" do mesmo `IA_SEGREDO`.
 *
 * @param {string} segredoHex o `IA_SEGREDO` (64 hexadecimais)
 * @param {"segredos" | "passe"} uso
 * @returns {string} 64 hexadecimais
 */
export function derivarChave(segredoHex, uso) {
  if (!Object.hasOwn(USOS, uso)) throw new Error(`Uso de chave desconhecido: ${uso}.`);
  return Buffer.from(hkdfSync("sha256", chaveDe(segredoHex), Buffer.alloc(0), USOS[uso], 32)).toString("hex");
}

/** @returns {string} o texto cifrado, pronto para a coluna `SegredoDoAssistente.cifrado` */
export function cifrarSegredo(texto, chaveHex) {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDe(chaveHex), iv);
  const dados = Buffer.concat([cifra.update(String(texto), "utf8"), cifra.final()]);
  return [VERSAO, iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}

/** @returns {string} o segredo; lança se a chave não é a que cifrou ou se o texto foi alterado */
export function decifrarSegredo(cifrado, chaveHex) {
  const [versao, iv, tag, dados] = String(cifrado ?? "").split(".");
  if (versao !== VERSAO || !iv || !tag || dados === undefined) throw new Error("Segredo em formato desconhecido.");
  const decifra = createDecipheriv("aes-256-gcm", chaveDe(chaveHex), Buffer.from(iv, "base64"));
  decifra.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
}
