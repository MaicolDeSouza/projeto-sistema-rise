/**
 * Textos do editor da Loja Integrada (aba Divergencias e rodape do `EditorAnuncioLI.jsx`): como um valor aparece na tela, o
 * resumo do que um envio fez e quando o pop-up le a LI de novo. Sem imports, sem banco e sem rede:
 * e o unico arquivo de `li/` sobre envio que o NAVEGADOR pode importar (`campos.js`, `envio.js` e
 * `leitura.js` sao de servidor). Nada aqui decide regra de envio: so conta o que a lib decidiu.
 */

/// Quanto de um valor entra numa frase: a descricao tem milhares de caracteres.
const LIMITE_DO_VALOR_NA_FRASE = 60;

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const SUFIXO_DO_CAMPO = { peso: " kg", altura: " cm", largura: " cm", comprimento: " cm" };

const ROTULO_DO_TIPO_PRODUCAO = { REVENDA: "Revenda", FABRICACAO_PROPRIA: "Fabricacao propria" };

/**
 * O valor de um campo normalizado como a tela o escreve. Vazio (null, texto vazio, lista vazia)
 * volta `null`: quem desenha diz "vazio no Rise" ou "vazio na LI". O zero NAO e vazio (origem 0).
 */
export function valorParaTela(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : null;
  if (typeof valor === "boolean") return valor ? "sim" : "nao";
  if (campo === "tipoProducao") return ROTULO_DO_TIPO_PRODUCAO[valor] ?? String(valor);
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
    if (ignoradas.length) linhas.push(`Categorias que nao existem mais na loja ficaram de fora: ${ignoradas.join(", ")}.`);
    if (ok) {
      return alterados.length > 0
        ? { titulo: "Sincronizado com a Loja Integrada.", linhas }
        : { titulo: "Nada para enviar: a Loja Integrada ja estava igual ao Rise.", linhas };
    }
    return alterados.length > 0 ? { titulo: `O envio parou na etapa "${resultado.etapa ?? "?"}". Estes campos estavam para ir:`, linhas } : null;
  }

  if (tipo === "cadastrar") {
    if (ok) return { titulo: "Produto cadastrado na Loja Integrada (inativo).", linhas: ["Confira na loja e ative-o la quando quiser vender."] };
    return resultado.idExterno ? { titulo: `O produto foi criado na Loja Integrada (id ${resultado.idExterno}), mas o envio nao terminou.`, linhas: [] } : null;
  }

  return null;
}

/** Se o envio pode ter mudado algo (no Rise ou na LI): o pop-up le de novo e a lista e revalidada. */
export function mudouNaLI(tipo, resultado) {
  if (!resultado) return false;
  if (tipo === "sincronizar") {
    return resultado.ok === true || (Array.isArray(resultado.alterados) && resultado.alterados.length > 0) || Boolean(resultado.marcaCriada);
  }
  if (tipo === "cadastrar") return resultado.ok === true || Boolean(resultado.idExterno);
  return false;
}
