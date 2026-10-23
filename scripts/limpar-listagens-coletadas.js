import "dotenv/config";

/**
 * Apaga as LISTAGENS que a varredura gravou como produto numa loja Magento (a Curto Circuito).
 *
 * Ate 22/10/2026 cada pagina de categoria do Magento 2 (e cada "?p=N" e cada filtro "?cat=") virava um "produto": o
 * nome da categoria ("Modulos", "Componentes Eletronicos"), codigo N/A, o MAIOR preco da vitrine e o link da pagina.
 * Na VPS eram 6.257 das 7.263 linhas da loja (100 nomes de categoria), com 6.378 linhas de historico de preco e
 * 11.872 fotos mensais. O codigo deixou de gravar isso (`ehListagemDoMagento` em src/lib/coleta/magento.js e o
 * `linksDe` decodificando o "&amp;"); este script tira o que ficou.
 *
 *   node scripts/limpar-listagens-coletadas.js --simular                 # so conta e mostra uma amostra
 *   node scripts/limpar-listagens-coletadas.js --confirmo                # apaga
 *   node scripts/limpar-listagens-coletadas.js --fonte="Curto Circuito"  # outra loja (padrao: Curto Circuito)
 *
 * Na VPS, pela entrada do comando (nada fica no disco de la):
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - --simular" < scripts/limpar-listagens-coletadas.js
 *
 * O que sai: `ProdutoColetado` da fonte com codigo N/A E endereco que NAO termina em ".html". A pagina de produto do
 * Magento termina em .html e sempre tem codigo; a categoria chega com "?p=", "?cat=" ou sem extensao (medido na VPS em
 * 22/10/2026: zero linhas N/A terminadas em .html). Junto saem o `PrecoHistorico` dessas linhas (cascade do banco) e
 * as `FotoMensalColeta` e `QuantidadeSemanal` delas (sem chave estrangeira, de proposito: saem a mao). Linha com
 * vinculo em `ProdutoConcorrente` NUNCA sai (fica e e avisada). Sem `--confirmo` nada e apagado.
 */

import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Dentro do conteiner da VPS o script chega pela entrada e `import.meta.url` nao aponta para a pasta do projeto.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import("@/lib/db.js");

const argumentos = process.argv.slice(2);
const simular = argumentos.includes("--simular");
const confirmo = argumentos.includes("--confirmo");
const fonteNome = (argumentos.find((arg) => arg.startsWith("--fonte=")) ?? "--fonte=Curto Circuito").slice("--fonte=".length);

if (!simular && !confirmo) {
  console.error("Use --simular para so contar, ou --confirmo para apagar.");
  process.exit(2);
}

try {
  const fontes = await prisma.fonteColeta.findMany({
    where: { nome: { contains: fonteNome, mode: "insensitive" } },
    select: { id: true, nome: true, dominio: true },
  });
  if (fontes.length !== 1) {
    console.error(`Fonte "${fonteNome}": ${fontes.length === 0 ? "nao encontrada" : `${fontes.length} fontes casam (${fontes.map((f) => f.nome).join(", ")})`}.`);
    process.exit(2);
  }
  const [fonte] = fontes;

  // So pelo formato do endereco: a pagina de produto do Magento termina em .html.
  const candidatas = await prisma.produtoColetado.findMany({
    where: { fonteId: fonte.id, codigo: "N/A", NOT: { url: { endsWith: ".html" } } },
    select: { id: true, nome: true, url: true, precoNormal: true },
    orderBy: { url: "asc" },
  });
  const ids = candidatas.map((linha) => linha.id);

  const vinculadas = ids.length > 0
    ? await prisma.produtoConcorrente.findMany({ where: { produtoColetadoId: { in: ids } }, select: { produtoColetadoId: true } })
    : [];
  const protegidos = new Set(vinculadas.map((v) => v.produtoColetadoId));
  const apagar = ids.filter((id) => !protegidos.has(id));

  const [historico, fotos, quantidades, totalDaFonte] = await Promise.all([
    apagar.length > 0 ? prisma.precoHistorico.count({ where: { produtoId: { in: apagar } } }) : 0,
    apagar.length > 0 ? prisma.fotoMensalColeta.count({ where: { produtoId: { in: apagar } } }) : 0,
    apagar.length > 0 ? prisma.quantidadeSemanal.count({ where: { produtoId: { in: apagar } } }) : 0,
    prisma.produtoColetado.count({ where: { fonteId: fonte.id } }),
  ]);

  const nomes = new Map();
  for (const linha of candidatas) nomes.set(linha.nome, (nomes.get(linha.nome) ?? 0) + 1);
  const maisComuns = [...nomes].sort((a, b) => b[1] - a[1]).slice(0, 8);

  console.log(`${fonte.nome} (${fonte.dominio}): ${totalDaFonte} linha(s) na fonte`);
  console.log(`listagens gravadas como produto: ${candidatas.length} (${nomes.size} nome(s) de categoria)`);
  for (const [nome, quantos] of maisComuns) console.log(`  ${String(quantos).padStart(5)}  ${nome}`);
  console.log("amostra de enderecos:");
  for (const linha of candidatas.slice(0, 5)) console.log(`  ${linha.url}  (R$ ${linha.precoNormal ?? "-"})`);
  if (protegidos.size > 0) console.log(`FICAM ${protegidos.size} linha(s) com vinculo em ProdutoConcorrente (nao se apaga o que um produto da loja usa).`);
  console.log(`a apagar: ${apagar.length} linha(s), ${historico} de historico de preco (cascade), ${fotos} foto(s) mensal(is), ${quantidades} saldo(s) semanal(is)`);

  if (!confirmo) {
    console.log("\nSimulacao: nada foi apagado. Rode com --confirmo para apagar.");
    process.exit(0);
  }
  if (apagar.length === 0) {
    console.log("\nNada a apagar.");
    process.exit(0);
  }

  // Em pedacos: um IN com milhares de ids cabe no Postgres, mas uma transacao so com tudo segura as travas por mais
  // tempo do que a varredura em curso (se houver) tolera.
  const TAMANHO = 500;
  let apagados = { produtos: 0, fotos: 0, quantidades: 0 };
  for (let inicio = 0; inicio < apagar.length; inicio += TAMANHO) {
    const pedaco = apagar.slice(inicio, inicio + TAMANHO);
    const [f, q, p] = await prisma.$transaction([
      prisma.fotoMensalColeta.deleteMany({ where: { produtoId: { in: pedaco } } }),
      prisma.quantidadeSemanal.deleteMany({ where: { produtoId: { in: pedaco } } }),
      prisma.produtoColetado.deleteMany({ where: { id: { in: pedaco }, fonteId: fonte.id, codigo: "N/A" } }),
    ]);
    apagados = { produtos: apagados.produtos + p.count, fotos: apagados.fotos + f.count, quantidades: apagados.quantidades + q.count };
  }

  const restantes = await prisma.produtoColetado.count({ where: { fonteId: fonte.id } });
  console.log(`\nApagados: ${apagados.produtos} produto(s) coletado(s), ${apagados.fotos} foto(s) mensal(is), ${apagados.quantidades} saldo(s) semanal(is).`);
  console.log(`${fonte.nome} ficou com ${restantes} linha(s). O "coletados" da tela Fontes so muda na proxima varredura.`);
} finally {
  await prisma.$disconnect();
}
