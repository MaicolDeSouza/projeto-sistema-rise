import "dotenv/config";

/**
 * Importa UMA VEZ as planilhas antigas de licencas e a pasta de arquivos do Mach3 (spec
 * 2026-11-05-licencas-softwares-design.md, §6.5). Idempotente: rodar de novo nao cria nada.
 *
 *   node scripts/importar-licencas.js --lightburn=dados/licencas-importacao/lightburn.xlsx \
 *     --mach3=dados/licencas-importacao/mach3.xlsx --pasta="<...>/Licenças de clientes" \
 *     --pdf="<...>/Instruçoes para ativação do software Mach3.pdf" --simular      # so conta e lista
 *   (o mesmo com --confirmo grava)
 *
 * Na VPS, como os outros scripts: os arquivos vao por scp para /srv/rise/app/dados/licencas-importacao/ e o script roda
 * dentro do conteiner (`docker compose exec -T app node scripts/importar-licencas.js ...`).
 *
 * Le SO as abas "Licencas em geral" e "Licencas maquinas 4hobby" (LightBurn) e "Página1" (Mach3). A aba "Link controle
 * licencas" guarda a senha do portal: nunca e aberta (o `abaPeloNome` recusa qualquer aba com "link" no nome).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AJUDA = `Uso: node scripts/importar-licencas.js [--lightburn=<xlsx>] [--mach3=<xlsx>] [--pasta=<pasta>] [--pdf=<pdf>] --simular|--confirmo
  --simular   so le, conta e lista (nada e gravado)
  --confirmo  grava no banco do .env`;

const argumentos = process.argv.slice(2);
const opcao = (nome) => argumentos.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3).replace(/^"|"$/g, "") ?? null;
const simular = argumentos.includes("--simular");
const confirmo = argumentos.includes("--confirmo");
if (simular === confirmo) {
  console.error(AJUDA);
  process.exit(2);
}

// Dentro do conteiner da VPS o script pode chegar pela entrada e `import.meta.url` nao aponta para a pasta do projeto.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const ExcelJS = (await import("exceljs")).default;
const { prisma } = await import("@/lib/db.js");
const I = await import("@/lib/ferramentas/licencas/importacao.js");
const { lerZipDeUmArquivo } = await import("@/lib/ferramentas/licencas/arquivos.js");
const B = await import("@/lib/ferramentas/licencas/banco.js");

const dois = (n) => String(n).padStart(2, "0");

/** O texto da celula como a planilha mostra: data em dd/mm/aaaa (UTC, como o Excel guarda o dia), numero e rich text em texto. */
function textoDaCelula(valor) {
  if (valor == null) return "";
  if (valor instanceof Date) return `${dois(valor.getUTCDate())}/${dois(valor.getUTCMonth() + 1)}/${valor.getUTCFullYear()}`;
  if (typeof valor === "object") {
    if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join("");
    if ("result" in valor) return textoDaCelula(valor.result);
    if ("text" in valor) return String(valor.text ?? "");
    return "";
  }
  return String(valor);
}

function abaPeloNome(livro, nome) {
  if (/link/i.test(nome)) throw new Error(`A aba "${nome}" não é lida pela importação.`);
  return livro.getWorksheet(nome) ?? null;
}

/** A aba como `string[][]` (linha 1 no indice 0) e as faixas mescladas ("A2:A5"). */
function linhasDaAba(aba) {
  const linhas = [];
  aba.eachRow({ includeEmpty: true }, (linha, numero) => {
    const valores = [];
    linha.eachCell({ includeEmpty: true }, (celula, coluna) => {
      valores[coluna - 1] = textoDaCelula(celula.value);
    });
    linhas[numero - 1] = Array.from(valores, (valor) => valor ?? "");
  });
  return { linhas: Array.from(linhas, (linha) => linha ?? []), mesclas: aba.model?.merges ?? [] };
}

async function lerLivro(caminho) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(caminho);
  return livro;
}

const ignorado = (nome) => nome.startsWith(".") || /^(desktop\.ini|thumbs\.db)$/i.test(nome);

/** Um arquivo de licenca: o zip com um unico arquivo dentro, ou o arquivo solto. */
function lerArquivoDeLicenca(caminho, identificador, avisos) {
  const bytes = readFileSync(caminho);
  if (/\.zip$/i.test(caminho)) {
    const lido = lerZipDeUmArquivo(bytes);
    if (!lido.ok) {
      avisos.push(`${identificador}: ${lido.erro}`);
      return null;
    }
    return { identificador, nomeOriginal: path.basename(lido.nome.replace(/\\/g, "/")), bytes: lido.bytes };
  }
  return { identificador, nomeOriginal: path.basename(caminho), bytes };
}

/**
 * A pasta "Licenças de clientes": cada `.zip` e uma licenca (o nome sem .zip), cada subpasta com um unico arquivo e uma
 * licenca (o nome da pasta); subpasta dentro de subpasta vira "<pai>/<filha>".
 */
function arquivosDaPasta(pasta, avisos) {
  const resultado = [];
  const lerSubpasta = (caminho, identificador) => {
    const nomes = readdirSync(caminho).filter((nome) => !ignorado(nome)).sort();
    const arquivos = nomes.filter((nome) => statSync(path.join(caminho, nome)).isFile());
    const pastas = nomes.filter((nome) => statSync(path.join(caminho, nome)).isDirectory());
    if (arquivos.length === 1 && !pastas.length) {
      const lido = lerArquivoDeLicenca(path.join(caminho, arquivos[0]), identificador, avisos);
      if (lido) resultado.push(lido);
    } else if (!arquivos.length && pastas.length) {
      for (const filha of pastas) lerSubpasta(path.join(caminho, filha), `${identificador}/${filha}`);
    } else {
      avisos.push(`${identificador}: a pasta tem ${arquivos.length} arquivo(s) e ${pastas.length} pasta(s); precisa ter um arquivo só.`);
    }
  };
  for (const nome of readdirSync(pasta).filter((nome) => !ignorado(nome)).sort()) {
    const caminho = path.join(pasta, nome);
    const info = statSync(caminho);
    if (info.isFile() && /\.zip$/i.test(nome)) {
      const lido = lerArquivoDeLicenca(caminho, nome.replace(/\.zip$/i, ""), avisos);
      if (lido) resultado.push(lido);
    } else if (info.isDirectory()) {
      lerSubpasta(caminho, nome);
    } else {
      avisos.push(`${nome}: não é zip nem pasta; ficou de fora.`);
    }
  }
  return resultado;
}

try {
  const avisosDaLeitura = [];
  let geral = [];
  let maquinas = [];
  let mach3 = [];
  let arquivosMach3 = [];

  const caminhoLightBurn = opcao("lightburn");
  if (caminhoLightBurn) {
    const livro = await lerLivro(caminhoLightBurn);
    const abaGeral = abaPeloNome(livro, "Licencas em geral");
    const abaMaquinas = abaPeloNome(livro, "Licencas maquinas 4hobby");
    if (!abaGeral) throw new Error(`Não achei a aba "Licencas em geral" em ${caminhoLightBurn}.`);
    const { linhas, mesclas } = linhasDaAba(abaGeral);
    geral = I.lerAbaGeral(I.preencherMescladas(linhas, mesclas));
    if (abaMaquinas) maquinas = I.lerAbaMaquinas(linhasDaAba(abaMaquinas).linhas);
    else avisosDaLeitura.push('Sem a aba "Licencas maquinas 4hobby".');
  }

  const caminhoMach3 = opcao("mach3");
  if (caminhoMach3) {
    const livro = await lerLivro(caminhoMach3);
    // "Página1" e o nome da aba hoje; com uma aba so no arquivo, e ela.
    const aba = abaPeloNome(livro, "Página1") ?? (livro.worksheets.length === 1 && !/link/i.test(livro.worksheets[0].name) ? livro.worksheets[0] : null);
    if (!aba) throw new Error(`Não achei a aba "Página1" em ${caminhoMach3}.`);
    const { linhas, mesclas } = linhasDaAba(aba);
    mach3 = I.lerAbaMach3(I.preencherMescladas(linhas, mesclas));
  }

  const pasta = opcao("pasta");
  if (pasta) arquivosMach3 = arquivosDaPasta(pasta, avisosDaLeitura);

  const plano = I.montarPlano({ geral, maquinas, mach3, arquivosMach3 });
  plano.avisos = [...avisosDaLeitura, ...plano.avisos];
  const resumo = await B.aplicarPlanoDeImportacao(plano, { simular });

  const caminhoPdf = opcao("pdf");
  let textoDoPdf = null;
  if (caminhoPdf) {
    const programa = await prisma.software.findUnique({ where: { slug: "mach3" }, select: { id: true, instrucoesNome: true } });
    if (!programa) textoDoPdf = "o programa Mach3 não existe no Rise";
    else if (programa.instrucoesNome) textoDoPdf = `já existe (${programa.instrucoesNome}); não foi trocado`;
    else if (simular) textoDoPdf = `seria gravado (${path.basename(caminhoPdf)})`;
    else {
      const salvo = await B.salvarSoftware(programa.id, { instrucoes: { nome: path.basename(caminhoPdf), bytes: readFileSync(caminhoPdf), tipo: "application/pdf" } });
      textoDoPdf = salvo.ok ? `gravado (${path.basename(caminhoPdf)})` : `recusado: ${Object.values(salvo.erros).join(" ")}`;
    }
  }

  console.log(simular ? "\nSIMULAÇÃO (nada foi gravado)" : "\nIMPORTAÇÃO GRAVADA");
  console.log(`Lido: ${geral.length} linha(s) da aba geral, ${maquinas.length} da aba antiga, ${mach3.length} do Mach3, ${arquivosMach3.length} arquivo(s) da pasta.`);
  console.log(`Licenças: ${resumo.licencas.novas} nova(s), ${resumo.licencas.existentes} já existiam.`);
  console.log(`Linhas: ${resumo.linhas.novas} nova(s), ${resumo.linhas.existentes} já existiam.`);
  console.log(`Clientes: ${resumo.clientes.criados} criado(s), ${resumo.clientes.ligados} já existiam e foram ligados.`);
  console.log(`Arquivos: ${resumo.arquivos.novos} novo(s), ${resumo.arquivos.existentes} já existiam.`);
  if (textoDoPdf) console.log(`PDF de instruções do Mach3: ${textoDoPdf}.`);
  if (resumo.semCliente.length) {
    console.log(`\nLinhas sem cliente (${resumo.semCliente.length}):`);
    for (const linha of resumo.semCliente) console.log(`  - ${linha.identificador} · ${linha.nome ?? "(sem nome)"} · ${linha.motivo}`);
  }
  if (resumo.avisos.length) {
    console.log(`\nAvisos (${resumo.avisos.length}):`);
    for (const aviso of resumo.avisos) console.log(`  - ${aviso}`);
  }
} catch (erro) {
  console.error(`\nFalhou: ${erro?.message ?? erro}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
