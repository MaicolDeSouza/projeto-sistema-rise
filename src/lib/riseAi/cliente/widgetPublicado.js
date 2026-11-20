import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * O widget do chat da loja JA MONTADO (assistente/publicado/, gravado por scripts/montar-widget.js): o que o servico
 * `ia` serve e o que a etiqueta da loja aponta.
 *
 * Lido do disco da imagem (o servico e `read_only` e so le). Todos os publicados sao lidos, nao so o atual: a loja pode
 * estar com a etiqueta de uma versao anterior, e ela tem de continuar funcionando ate o dono colar a nova.
 */

export const ENDERECO_DO_HOBI = "https://hobi.4hobby.com.br";
export const NOME_DO_WIDGET = /^widget-[a-f0-9]{10}\.js$/;
const pastaPadrao = () => path.join(process.cwd(), "assistente", "publicado");

/**
 * @returns {{ atual: { arquivo: string, versao: string, integridade: string, bytes: number } | null, arquivos: Map<string, Buffer> }}
 *   `atual` e nulo quando nao ha manifesto ou ele aponta para um arquivo que nao esta na pasta.
 */
export function lerPublicados(pasta = pastaPadrao()) {
  const arquivos = new Map();
  if (!existsSync(pasta)) return { atual: null, arquivos };
  for (const nome of readdirSync(pasta)) {
    if (NOME_DO_WIDGET.test(nome)) arquivos.set(nome, readFileSync(path.join(pasta, nome)));
  }
  let atual = null;
  try {
    const lido = JSON.parse(readFileSync(path.join(pasta, "manifesto.json"), "utf8")).atual;
    if (lido && arquivos.has(lido.arquivo) && typeof lido.integridade === "string") {
      atual = { arquivo: lido.arquivo, versao: String(lido.versao), integridade: lido.integridade, bytes: Number(lido.bytes) };
    }
  } catch {
    // Sem manifesto (ou ilegivel) nao ha versao atual; os arquivos que existem continuam sendo servidos.
  }
  return { atual, arquivos };
}

/** A etiqueta que o dono cola na Loja Integrada. `crossorigin` e exigido pela conferencia de integridade. */
export function etiquetaDoWidget(atual, endereco = ENDERECO_DO_HOBI) {
  if (!atual) return null;
  return `<script defer src="${endereco}/${atual.arquivo}" integrity="${atual.integridade}" crossorigin="anonymous"></script>`;
}
