/**
 * Junta o PLANO (JSON) a um script que roda NA VPS pela entrada padrao, numa conexao so (roteiro da analise de lista de
 * fornecedor, passo 7). O plano vira `globalThis.PLANO` antes do script.
 *
 *   node scripts/analise-fornecedor-embutir.js <script.mjs> <plano.json> <saida.mjs>
 *   cat <saida.mjs> | ssh -i ~/.ssh/rise_vps rise@<vps> "cd /srv/rise/app && docker compose exec -T app node --input-type=module - [--confirmo]"
 */
import { readFileSync, writeFileSync } from "node:fs";

const [script, plano, saida] = process.argv.slice(2);
if (!script || !plano || !saida) {
  console.error("Uso: node scripts/analise-fornecedor-embutir.js <script.mjs> <plano.json> <saida.mjs>");
  process.exit(2);
}
const dados = JSON.parse(readFileSync(plano, "utf8"));
writeFileSync(saida, `globalThis.PLANO = ${JSON.stringify(dados)};\n${readFileSync(script, "utf8")}`);
console.log(`ok ${saida}`);
