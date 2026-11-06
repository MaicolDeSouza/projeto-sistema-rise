/**
 * Iguala ao anuncio do Rise os OUTROS anuncios do ML com o mesmo SKU (pedido do dono em 05/11/2026: "Ja tem outros anuncios
 * do mesmo produto. E possivel alterar valores desses outros anuncios conforme o anuncio criado no Rise ML?"; escolheu
 * Preco + Dados fiscais, tudo de uma vez por script). Nada mais muda nos antigos: titulo, ficha, fotos e descricao ficam.
 *
 * Para cada anuncio do Rise com MLB (menos os encerrados), acha na conta os anuncios com o mesmo `seller_sku` que NAO sao do
 * Rise e nao estao encerrados, e:
 * - preco: o mesmo preco que o anuncio do Rise tem NO ML agora (lido ao vivo; o PUT so com `price` e aceito, medido em
 *   26/10/2026). Anuncio com variacoes recebe o preco em cada variacao.
 * - dados fiscais: vincula o antigo ao SKU fiscal do Rise (`garantirFiscalNoML`, as regras do Publicar); o SKU ja existe.
 *
 * Sem `--confirmo` NAO ESCREVE: so le e lista o que faria. `--sku=100101` faz so um SKU.
 *
 * NA VPS:
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - --confirmo" < scripts/ml-igualar-antigos.js
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
const soSku = argumentos.find((a) => a.startsWith("--sku="))?.slice(6) ?? null;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const reais = (valor) => `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
const ml = clienteML();

const eu = await ml.get("/users/me");
if (!eu?.ok) throw new Error("Não consegui ler a conta do ML.");
const vendedor = eu.dados.id;

const anuncios = await prisma.anuncio.findMany({
  where: { canal: "MERCADO_LIVRE", idExterno: { not: null }, NOT: { situacaoCanal: "ENCERRADA" } },
  select: { id: true, idExterno: true },
  orderBy: { criadoEm: "asc" },
});
const doRise = new Set(anuncios.map((a) => a.idExterno));
console.log(`${anuncios.length} anúncio(s) do Rise no ML. Modo: ${confirmo ? "ESCREVE no ML" : "simulação (só lê)"}.`);

const resumo = { pares: 0, precos: 0, precoIgual: 0, vinculos: 0, vinculoCerto: 0, falhas: [], semPlano: [] };
for (const anuncio of anuncios) {
  const alvo = await anuncioComPlano(anuncio.id);
  const sku = alvo.plano?.sku;
  if (!sku || (soSku && sku !== soSku)) continue;
  const busca = await ml.get(`/users/${vendedor}/items/search?seller_sku=${encodeURIComponent(sku)}&limit=50`);
  const outros = (busca.dados?.results ?? []).filter((id) => !doRise.has(id));
  if (!outros.length) continue;

  const rise = await ml.get(`/items/${anuncio.idExterno}?attributes=price`);
  const preco = Number(rise.dados?.price);
  if (!rise?.ok || !(preco > 0)) {
    resumo.falhas.push(`${sku}: não consegui ler o preço do anúncio do Rise ${anuncio.idExterno}.`);
    continue;
  }
  if (!alvo.ok || !alvo.plano.ok) resumo.semPlano.push(`${sku}: ${alvo.erro ?? alvo.plano.problemas.join(" ")}`);

  for (const itemId of outros) {
    const lido = await ml.get(`/items/${itemId}?attributes=id,price,status,listing_type_id,variations,title`);
    const item = lido.dados ?? {};
    if (!lido?.ok || ["closed", "inactive"].includes(item.status)) continue;
    resumo.pares += 1;
    if (confirmo) ml.exigirEscrita(sku);
    const rotulo = `${sku} ${itemId} (${item.status}${item.listing_type_id === "gold_pro" ? ", Premium" : ""}) ${String(item.title ?? "").slice(0, 40)}`;
    const linhas = [];

    const variacoes = item.variations ?? [];
    const precoAtual = variacoes.length ? variacoes.map((v) => Number(v.price)) : [Number(item.price)];
    if (precoAtual.every((p) => p === preco)) resumo.precoIgual += 1;
    else {
      const corpo = variacoes.length ? { variations: variacoes.map((v) => ({ id: v.id, price: preco })) } : { price: preco };
      if (confirmo) {
        const resposta = await ml.put(`/items/${itemId}`, corpo);
        if (!resposta?.ok) resumo.falhas.push(`${rotulo}: preço recusado (HTTP ${resposta?.status}) ${JSON.stringify(resposta?.dados ?? "").slice(0, 200)}`);
        else resumo.precos += 1;
      } else resumo.precos += 1;
      linhas.push(`preço ${reais(precoAtual[0])} → ${reais(preco)}`);
    }

    if (alvo.ok && alvo.plano.ok) {
      const feito = await garantirFiscalNoML(ml, alvo.plano, { itemId, simular: !confirmo });
      if (!feito.ok) resumo.falhas.push(`${rotulo}: dados fiscais: ${feito.erro}`);
      else if (feito.feitos.length) {
        resumo.vinculos += 1;
        linhas.push(feito.feitos.join(" "));
      } else resumo.vinculoCerto += 1;
    }
    if (linhas.length) console.log(`${confirmo ? "feito" : "faria"} ${rotulo}: ${linhas.join(" | ")}`);
    await esperar(250);
  }
}

const lista = (titulo, linhas) => linhas.length && console.log(`\n${titulo} (${linhas.length}):\n${linhas.map((l) => `  ${l}`).join("\n")}`);
console.log(`\nAnúncios antigos com o mesmo SKU (ativos ou pausados): ${resumo.pares}.`);
console.log(`Preço: ${confirmo ? "igualados" : "a igualar"} ${resumo.precos}, já iguais ${resumo.precoIgual}.`);
console.log(`Dados fiscais: ${confirmo ? "vinculados" : "a vincular"} ${resumo.vinculos}, já vinculados ${resumo.vinculoCerto}.`);
lista("Sem dados fiscais no Rise (só o preço foi tratado)", resumo.semPlano);
lista("Recusados pelo ML", resumo.falhas);
process.exit(0);
