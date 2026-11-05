/**
 * Ajusta os dados fiscais dos anuncios do Mercado Livre que o RISE publicou (pedido do dono em 05/11/2026: "nao quero que
 * mude anuncios que nao foram criados pelo Rise. Quero que altere apenas os anuncios criados pelo Rise ate entao,
 * respeitando o que foi informado no Rise"). Os anuncios antigos da conta, de fora do Rise, nao sao lidos nem mexidos.
 *
 * Para cada anuncio do Rise com MLB (menos os encerrados): monta os dados fiscais pelo cadastro do produto no Rise (NCM,
 * origem, tipo de producao, CEST, EAN; CSOSN 102) e garante no ML o SKU fiscal e o vinculo ao anuncio, com as mesmas
 * regras do Publicar (`src/lib/canaisDeVenda/ml/fiscalNoML.js`).
 *
 * Sem `--confirmo` NAO ESCREVE: so le e conta o que faria. Com `--confirmo` escreve no ML (precisa da trava
 * ML_PUBLICACAO liberada, que na VPS esta). `--item=MLB123` faz so um anuncio.
 *
 * NA VPS (o token do ML e o da producao; o arquivo viaja pela entrada do comando e nao fica la):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - --confirmo" < scripts/ml-dados-fiscais.js
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
if (RAIZ !== "/app") await import("dotenv/config");
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
const { clienteML } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/cliente.js`).href);
const { anuncioComPlano, garantirFiscalNoML } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/fiscalNoML.js`).href);

const argumentos = process.argv.slice(2);
const confirmo = argumentos.includes("--confirmo");
const soItem = argumentos.find((a) => a.startsWith("--item="))?.slice(7) ?? null;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const ml = clienteML();

const anuncios = await prisma.anuncio.findMany({
  where: { canal: "MERCADO_LIVRE", idExterno: soItem ?? { not: null }, NOT: { situacaoCanal: "ENCERRADA" } },
  select: { id: true, idExterno: true, dados: true },
  orderBy: { criadoEm: "asc" },
});
console.log(`${anuncios.length} anúncio(s) do Rise publicados no ML. Modo: ${confirmo ? "ESCREVE no ML" : "simulação (só lê)"}.`);

const resumo = { jaCertos: 0, ajustados: 0, semDadosNoRise: [], falharam: [], naoFaturam: [] };
for (const anuncio of anuncios) {
  const alvo = await anuncioComPlano(anuncio.id);
  const rotulo = `${anuncio.idExterno} [${alvo.plano?.sku ?? "?"}] ${String(anuncio.dados?.titulo ?? "").slice(0, 50)}`;
  if (!alvo.ok || !alvo.plano.ok) {
    resumo.semDadosNoRise.push(`${rotulo}: ${alvo.erro ?? alvo.plano.problemas.join(" ")}`);
    continue;
  }
  if (confirmo) ml.exigirEscrita(alvo.plano.sku);
  const feito = await garantirFiscalNoML(ml, alvo.plano, { itemId: alvo.itemId, simular: !confirmo });
  if (!feito.ok) resumo.falharam.push(`${rotulo}: ${feito.erro}`);
  else if (feito.feitos.length === 0) resumo.jaCertos += 1;
  else {
    resumo.ajustados += 1;
    console.log(`${confirmo ? "feito" : "faria"} ${rotulo}: ${feito.feitos.join(" ")}`);
  }
  if (confirmo && feito.ok && feito.podeFaturar === false) resumo.naoFaturam.push(rotulo);
  await esperar(250);
}

const lista = (titulo, linhas) => linhas.length && console.log(`\n${titulo} (${linhas.length}):\n${linhas.map((l) => `  ${l}`).join("\n")}`);
console.log(`\nJá certos: ${resumo.jaCertos}. ${confirmo ? "Ajustados" : "A ajustar"}: ${resumo.ajustados}.`);
lista("Faltam dados fiscais no cadastro do Rise (corrigir o produto e rodar de novo)", resumo.semDadosNoRise);
lista("Recusados pelo ML", resumo.falharam);
lista("Ajustados, mas o ML ainda não fatura", resumo.naoFaturam);
process.exit(0);
