/**
 * Monta o widget do chat da loja (o Hobi) num arquivo so e o publica em `assistente/publicado/`.
 *
 *   npm run hobi:montar
 *
 * O arquivo publicado e o que a loja carrega, com a etiqueta `integrity="sha384-..."`: se alguem trocar o arquivo no
 * servidor, o navegador do visitante se recusa a rodar. Por isso:
 *
 *  - o NOME traz a versao, e a versao sai do CONTEUDO (10 hexadecimais do SHA-256): mudou um caractere, mudou o nome,
 *    e a etiqueta antiga continua apontando para o arquivo antigo;
 *  - NENHUM publicado antigo e apagado aqui: a loja pode estar com a etiqueta de uma versao anterior, e apagar o
 *    arquivo tiraria o chat do ar ate o dono colar a etiqueta nova;
 *  - a montagem e a MESMA em qualquer maquina: fim de linha do Windows vira "\n" antes de tudo (o git do PC converte),
 *    e os publicados ficam fora da conversao do git (.gitattributes).
 *
 * Sem minificar e sem dependencia nova: o arquivo e a juncao do nucleo (sem os `export`) com a tela, dentro de uma
 * funcao que roda na hora, e as imagens do mascote embutidas (um arquivo so, tudo coberto pela integridade).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGENS = ["cabeca", "corpo", "feliz", "pensando"];
const MARCADOR_DAS_IMAGENS = "__HOBI_IMAGENS__";

const comLf = (texto) => String(texto).replace(/\r\n/g, "\n");

/**
 * @param {{ nucleo: string, tela: string, imagens: Record<string, Buffer> }} fontes
 * @returns {{ conteudo: string, versao: string, arquivo: string, integridade: string }}
 */
export function montarWidget({ nucleo, tela, imagens }) {
  // O nucleo e um modulo (o teste o importa); dentro do widget ele e codigo comum, entao os `export` saem.
  const nucleoSemExport = comLf(nucleo).replace(/^export (?=(?:async function|function|const)\b)/gm, "");
  const embutidas = JSON.stringify(Object.fromEntries(Object.entries(imagens).map(([nome, bytes]) => [nome, `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`])));
  const telaComImagens = comLf(tela).replace(MARCADOR_DAS_IMAGENS, embutidas);
  const conteudo = `/* Hobi, o assistente da 4hobby. Arquivo gerado por scripts/montar-widget.js: nao editar. */\n(function () {\n"use strict";\n${nucleoSemExport}\n${telaComImagens}\n})();\n`;
  const versao = createHash("sha256").update(conteudo).digest("hex").slice(0, 10);
  return { conteudo, versao, arquivo: `widget-${versao}.js`, integridade: `sha384-${createHash("sha384").update(conteudo).digest("base64")}` };
}

/** As fontes de verdade, lidas do repositorio. */
export function lerFontesDoWidget(raiz = RAIZ) {
  return {
    nucleo: readFileSync(path.join(raiz, "assistente", "widget", "nucleo.js"), "utf8"),
    tela: readFileSync(path.join(raiz, "assistente", "widget", "tela.js"), "utf8"),
    imagens: Object.fromEntries(IMAGENS.map((nome) => [nome, readFileSync(path.join(raiz, "assistente", "mascote", `${nome}.webp`))])),
  };
}

/** Monta e grava o arquivo e o manifesto. Devolve o que publicou. */
export function publicarWidget(raiz = RAIZ) {
  const montado = montarWidget(lerFontesDoWidget(raiz));
  const pasta = path.join(raiz, "assistente", "publicado");
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, montado.arquivo), montado.conteudo);
  const atual = { arquivo: montado.arquivo, versao: montado.versao, integridade: montado.integridade, bytes: Buffer.byteLength(montado.conteudo) };
  writeFileSync(path.join(pasta, "manifesto.json"), `${JSON.stringify({ atual }, null, 2)}\n`);
  return atual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const atual = publicarWidget();
  console.log(`${atual.arquivo}  ${(atual.bytes / 1024).toFixed(1)} KB`);
  console.log(atual.integridade);
}
