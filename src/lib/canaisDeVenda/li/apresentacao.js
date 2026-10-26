/**
 * Textos do editor da Loja Integrada (aba Divergencias e rodape do `EditorAnuncioLI.jsx`): como um valor aparece na tela, o
 * resumo do que um envio fez e quando o pop-up le a LI de novo. Sem banco e sem rede (so importa os rotulos de
 * `etapasCadastro.js`, que tambem nao importa nada): o NAVEGADOR pode importar este arquivo (`campos.js`,
 * `envio.js` e `leitura.js` sao de servidor). Nada aqui decide regra de envio: so conta o que a lib decidiu.
 */

import { ROTULO_DA_ETAPA_LI } from "./etapasCadastro";

/// Quanto de um valor entra numa frase: a descricao tem milhares de caracteres.
const LIMITE_DO_VALOR_NA_FRASE = 60;

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SUFIXO_DO_CAMPO = { peso: " kg", altura: " cm", largura: " cm", comprimento: " cm" };

const ROTULO_DO_TIPO_PRODUCAO = { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricação própria" };

/**
 * O valor de um campo normalizado como a tela o escreve. Vazio (null, texto vazio, lista vazia)
 * volta `null`: quem desenha diz "vazio no Rise" ou "vazio na LI". O zero NAO e vazio (origem 0).
 */
export function valorParaTela(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : null;
  if (campo === "ativo" && typeof valor === "boolean") return valor ? "Ativo" : "Inativo";
  if (typeof valor === "boolean") return valor ? "sim" : "nao";
  if (campo === "tipoProducao") return ROTULO_DO_TIPO_PRODUCAO[valor] ?? String(valor);
  if (campo === "preco" && typeof valor === "number" && Number.isFinite(valor)) return MOEDA.format(valor);
  if (typeof valor === "number" && Number.isFinite(valor)) return `${NUMERO.format(valor)}${SUFIXO_DO_CAMPO[campo] ?? ""}`;
  return String(valor);
}

function valorNaFrase(campo, valor) {
  const texto = (valorParaTela(campo, valor) ?? "vazio").replace(/[\r\n\t ]+/g, " ").trim();
  return texto.length > LIMITE_DO_VALOR_NA_FRASE ? `${texto.slice(0, LIMITE_DO_VALOR_NA_FRASE)}...` : texto;
}

function rotuloDe(rotulos, campo) {
  return rotulos && Object.hasOwn(rotulos, campo) ? rotulos[campo] : campo;
}

/**
 * O resumo de um envio para a tela. `sincronizar`: os campos de-para, a marca criada e as categorias
 * que ficaram de fora. `cadastrar`: o produto nasce INATIVO, e a frase diz isso. Falha sem nada a
 * contar volta `null` (o erro ja aparece em vermelho).
 */
export function resumirEnvioLI(tipo, resultado, rotulos = {}) {
  if (!resultado) return null;
  const ok = resultado.ok === true;

  if (tipo === "sincronizar") {
    const alterados = Array.isArray(resultado.alterados) ? resultado.alterados : [];
    const linhas = alterados.map(({ campo, de, para }) => `${rotuloDe(rotulos, campo)}: de ${valorNaFrase(campo, de)} para ${valorNaFrase(campo, para)}`);
    if (resultado.marcaCriada) linhas.push(`Marca criada na Loja Integrada: ${resultado.marcaCriada}.`);
    const ignoradas = Array.isArray(resultado.categoriasIgnoradas) ? resultado.categoriasIgnoradas : [];
    if (ignoradas.length) linhas.push(`Categorias que não existem mais na loja ficaram de fora: ${ignoradas.join(", ")}.`);
    if (resultado.fotos) linhas.push(resultado.fotos);
    if (ok) {
      return alterados.length > 0 || resultado.fotos
        ? { titulo: "Sincronizado com a Loja Integrada.", linhas }
        : { titulo: "Nada para enviar: a Loja Integrada já estava igual ao Rise.", linhas };
    }
    return alterados.length > 0 ? { titulo: `O envio parou na etapa "${resultado.etapa ?? "?"}". Estes campos estavam para ir:`, linhas } : null;
  }

  // Cadastro automatico (24/10/2026): o que passou vira lista; a falha diz em que etapa parou e o que fazer.
  if (tipo === "cadastrar" || tipo === "completar") {
    const etapas = (Array.isArray(resultado.etapas) ? resultado.etapas : []).map((etapa) => `${ROTULO_DA_ETAPA_LI[etapa] ?? etapa}: feito.`);
    if (ok) {
      // Com o liga/desliga "Ativo na loja" desligado (26/10/2026) o cadastro termina com o produto pausado, de proposito.
      const pausado = resultado.ativo === false;
      const titulos = pausado
        ? { cadastrar: "Produto cadastrado na Loja Integrada, pausado (Ativo na loja desligado).", completar: "Cadastro completo: produto pausado na Loja Integrada (Ativo na loja desligado)." }
        : { cadastrar: "Produto cadastrado e ativo na Loja Integrada.", completar: "Cadastro completo: produto ativo na Loja Integrada." };
      return {
        titulo: titulos[tipo],
        linhas: [...etapas, ...(resultado.fotos ? [resultado.fotos] : [])],
      };
    }
    if (!resultado.idExterno) return null;
    const parou = ROTULO_DA_ETAPA_LI[resultado.etapa] ?? resultado.etapa;
    const conteudoFoi = tipo === "completar" || (resultado.etapas ?? []).includes("criar");
    return conteudoFoi
      ? { titulo: `O cadastro parou em "${parou}". O produto está na Loja Integrada, pausado.`, linhas: [...etapas, 'Corrija o motivo e use "Completar o cadastro": o que já foi feito não é refeito.'] }
      : { titulo: `O produto foi criado na Loja Integrada (id ${resultado.idExterno}), mas o envio não terminou.`, linhas: [] };
  }

  return null;
}

/**
 * O que a aba Divergencias do editor mostra, a partir da leitura da loja (`lerParaPopupLI`). Antes (ate 25/10/2026) so os
 * campos "diferente" e as fotos abriam a aba, e o "!" do icone podia vir de outro motivo (origem e tipo de producao vazios
 * na loja, produto inativo) com a aba sumida: o dono abria o editor e nao via o que o "!" acusava.
 *
 * - `diferentes`: campos diferentes na loja (o Sincronizar corrige), mais as fotos quando elas mudariam. O "Ativo na loja"
 *   conta aqui (o liga/desliga do anuncio contra o estado da loja, 26/10/2026), menos com o cadastro automatico falho: a faixa
 *   do editor ja explica, e o Sincronizar nao ativa nesse caso;
 * - `fiscais`: origem e tipo de producao vazios ou diferentes (so o painel da LI os grava).
 */
export function resumoDasDivergenciasLI(leitura) {
  if (!leitura?.ok || leitura.situacao !== "existe") return { diferentes: 0, fiscais: 0, total: 0 };
  const diferentes =
    (leitura.diferencas ?? []).filter((item) => item.tipo === "diferente" && !(leitura.cadastroFalhou && item.campo === "ativo")).length +
    (["diferentes", "faltam"].includes(leitura.fotos?.estado) ? 1 : 0);
  const fiscais = (leitura.fiscais ?? []).length;
  return { diferentes, fiscais, total: diferentes + fiscais };
}

/** Se o envio pode ter mudado algo (no Rise ou na LI): o pop-up le de novo e a lista e revalidada. */
export function mudouNaLI(tipo, resultado) {
  if (!resultado) return false;
  if (tipo === "sincronizar") {
    return resultado.ok === true || (Array.isArray(resultado.alterados) && resultado.alterados.length > 0) || Boolean(resultado.marcaCriada) || Boolean(resultado.fotos);
  }
  if (tipo === "cadastrar" || tipo === "completar") return resultado.ok === true || Boolean(resultado.idExterno);
  return false;
}
