import { LIMITE_DA_DESCRIPTION_SEO, LIMITE_DO_TITULO_SEO } from "./seo";
import { slugDe, slugValido } from "./slug";

/**
 * Validacao do rascunho do anuncio da Loja Integrada, por aba. Sem imports de servidor: o
 * editor mostra os problemas enquanto o dono digita.
 *
 * Cada problema e `{ campo, aba, problema, bloqueante }`. Bloqueante impede cadastrar e
 * sincronizar; alerta so avisa (rascunho incompleto pode ser salvo).
 *
 * Origem e tipo de producao NAO sao acusados aqui: a API da LI nao os grava (medido em
 * 07/10/2026), entao o que importa e o valor da LI, e quem avisa e o pop-up de diferencas.
 */

// Ordem pedida pelo dono em 07/10/2026. A aba "Divergencias" nao esta aqui: o editor a poe na
// frente so quando a leitura da loja acha diferencas.
export const ABAS_LI = [
  { id: "geral", rotulo: "Geral" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "categorias", rotulo: "Categorias" },
  { id: "envio", rotulo: "Envio" },
  { id: "fiscal", rotulo: "Fiscal" },
  { id: "seo", rotulo: "SEO" },
  { id: "previa", rotulo: "Previa e sincronizacao" },
];

const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === "";
const semNumero = (valor) => vazio(valor) || !(Number(valor) > 0);

export function validarRascunhoLI(rascunho, contexto) {
  const r = rascunho ?? {};
  const produto = contexto?.produto ?? {};
  const categoriasDaLI = contexto?.categoriasDaLI ?? null;
  const problemas = [];
  const acusar = (campo, aba, problema, bloqueante = false) => problemas.push({ campo, aba, problema, bloqueante });

  // Bloqueantes.
  if (vazio(r.titulo)) acusar("titulo", "geral", "Informe o nome do produto na loja.", true);
  // O endereco sai do nome (07/10/2026): so acusa quando o nome existe e nao gera endereco.
  if (!vazio(r.titulo) && !slugValido(slugDe(r.titulo))) {
    acusar("slug", "geral", "O nome nao gera um endereco: use ao menos uma letra ou numero.", true);
  }
  if (!produto.conferido) {
    acusar("produto", "geral", "So produto Conferido vai para a Loja Integrada. Confira o cadastro antes.", true);
  }

  // Alertas.
  if (vazio(r.marca)) acusar("marca", "geral", "Sem marca: o produto fica sem marca na loja.");
  if (!r.categorias?.length) {
    acusar("categorias", "categorias", "Sem categoria: o produto nao aparece em nenhum menu da loja.");
  } else if (categoriasDaLI) {
    const existentes = new Set(categoriasDaLI.map((categoria) => String(categoria.id)));
    const sumidas = r.categorias.filter((id) => !existentes.has(String(id)));
    if (sumidas.length) {
      acusar("categorias", "categorias", `Categoria que nao existe mais na loja: ${sumidas.join(", ")}. Ela sai do envio.`);
    }
  }
  if ((r.seo?.title ?? "").trim().length > LIMITE_DO_TITULO_SEO) {
    acusar("seoTitulo", "seo", `Titulo SEO acima de ${LIMITE_DO_TITULO_SEO} caracteres: sera cortado no envio.`);
  }
  if ((r.seo?.description ?? "").trim().length > LIMITE_DA_DESCRIPTION_SEO) {
    acusar("seoDescription", "seo", `Description acima de ${LIMITE_DA_DESCRIPTION_SEO} caracteres: sera cortada no envio.`);
  }
  if (vazio(produto.ncm)) {
    acusar("ncm", "fiscal", "Sem NCM a Loja Integrada nao emite NF-e, e o cadastro na LI exige NCM.");
  }
  // O GTIN que ja esta na loja (lido pelo editor) e o que vai na nota: vazio no Rise nao apaga.
  if (vazio(produto.ean)) {
    const daLoja = String(contexto?.gtinDaLI ?? "").trim();
    acusar(
      "gtin",
      "fiscal",
      daLoja
        ? `Sem GTIN/EAN no Rise: a nota sai com o GTIN que ja esta na loja (${daLoja}). Para mudar, preencha no cadastro do produto.`
        : "Sem GTIN/EAN: a nota sai SEM GTIN.",
    );
  }
  if (semNumero(produto.pesoKg)) acusar("peso", "envio", "Sem peso: o frete da loja nao calcula.");
  if (semNumero(produto.alturaCm) || semNumero(produto.larguraCm) || semNumero(produto.comprimentoCm)) {
    acusar("medidas", "envio", "Falta altura, largura ou comprimento: o frete da loja nao calcula.");
  }
  return problemas;
}
