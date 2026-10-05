/**
 * Textos e contas do pop-up do Bling (`JanelaBling.jsx`) e do botao "Sincronizar estoque com Bling"
 * (`BotaoSincronizarEstoque.jsx`): como um valor aparece na tela, o resumo do que um envio fez, o
 * resumo do botao de estoque e quando o pop-up le o Bling de novo. Sem imports, sem banco, sem rede
 * e sem Next.
 *
 * E o unico arquivo desta pasta que o NAVEGADOR pode importar. `campos.js`, `estado.js`, `envio.js`,
 * `saldos.js` e `leitura.js` sao de servidor (usam `node:crypto` e o banco): quem os importasse num
 * componente de cliente quebraria o bundle. Por isso as contas que a tela faz com o que as Server
 * Actions devolvem moram aqui, onde o teste (scripts/teste-bling-sync.js) tambem as alcanca.
 *
 * Nada aqui decide uma regra de envio: so conta o que a lib ja decidiu.
 */

/// Falhas que o botao de estoque lista; o resto vira "e mais K". Uma conta com 1.800 produtos e um
/// lote que falha geraria 100 linhas iguais, e a tela nao e lugar de despejar um log.
export const LIMITE_DE_FALHAS_VISIVEIS = 10;

/// Quanto de um valor entra numa frase ("de X para Y"): a descricao de um produto tem milhares de
/// caracteres, e a lista completa de diferencas ja esta na janela.
const LIMITE_DO_VALOR_NA_FRASE = 60;

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/// A unidade que cada campo numerico leva. Os valores ja chegam normalizados (peso em kg, medidas em
/// cm: `normalizarDoRise` e `normalizarDoBling`), entao e so dizer qual e.
const SUFIXO_DO_CAMPO = {
  peso: " kg",
  altura: " cm",
  largura: " cm",
  comprimento: " cm",
  percentualTributos: "%",
};

/// Inteiro maior que zero, ou 0: a resposta vem de uma Server Action e um campo estranho nao pode
/// derrubar a janela nem escrever "NaN atualizados" na tela.
function inteiro(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 0;
}

/**
 * O valor de um campo (ja normalizado, como `diferencas` o devolve) como a tela o escreve. Vazio
 * (null, undefined ou texto vazio) volta `null`: quem desenha diz "vazio no Rise" ou "vazio no
 * Bling", que depende do lado. O zero NAO e vazio (origem 0 = nacional, estoque minimo 0).
 *
 * @param {string} campo id do campo (`CAMPOS_DE_ENVIO`), que diz a unidade.
 * @param {unknown} valor
 * @returns {string|null}
 */
export function valorParaTela(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (campo === "preco") return MOEDA.format(valor);
    return `${NUMERO.format(valor)}${SUFIXO_DO_CAMPO[campo] ?? ""}`;
  }
  return String(valor);
}

/// O valor numa frase: uma linha so (sem quebras) e no maximo `LIMITE_DO_VALOR_NA_FRASE`. So
/// espaco comum e quebra de linha sao colapsados: o espaco sem quebra do "R$ 90,00" tem que ficar.
function valorNaFrase(campo, valor) {
  const texto = (valorParaTela(campo, valor) ?? "vazio").replace(/[\r\n\t ]+/g, " ").trim();
  return texto.length > LIMITE_DO_VALOR_NA_FRASE ? `${texto.slice(0, LIMITE_DO_VALOR_NA_FRASE)}...` : texto;
}

/// O rotulo do campo se a tela o conhece; senao o proprio id (nunca uma chave herdada do objeto).
function rotuloDe(rotulos, campo) {
  return rotulos && Object.hasOwn(rotulos, campo) ? rotulos[campo] : campo;
}

/**
 * O resumo do botao "Sincronizar estoque com Bling" (`sincronizarEstoqueComBling`). A acao devolve
 * `ok: true` mesmo com falhas e mesmo com 0 atualizados (a leitura aconteceu, o que nao deu certo
 * vem em `falhas`), entao a tela NUNCA pode tratar o `ok` como "tudo atualizado": a linha traz sempre
 * os dois numeros, e o `tom` so e "ok" quando alguem foi atualizado e nada falhou.
 *
 * @param {{atualizados?: number, semCodigoNoBling?: number, falhas?: {sku: string, erro: string}[]}} resultado
 * @returns {{linha: string, tom: "ok"|"atencao", falhas: {sku: string, erro: string}[], falhasOcultas: number}}
 *   `falhas`: as primeiras `LIMITE_DE_FALHAS_VISIVEIS`; `falhasOcultas`: quantas ficaram de fora.
 */
export function resumirEstoqueDaLista(resultado) {
  const atualizados = inteiro(resultado?.atualizados);
  const semCodigoNoBling = inteiro(resultado?.semCodigoNoBling);
  const falhas = Array.isArray(resultado?.falhas) ? resultado.falhas : [];
  return {
    linha: `${atualizados} atualizados, ${semCodigoNoBling} sem esse codigo no Bling`,
    tom: atualizados > 0 && falhas.length === 0 ? "ok" : "atencao",
    falhas: falhas.slice(0, LIMITE_DE_FALHAS_VISIVEIS),
    falhasOcultas: Math.max(0, falhas.length - LIMITE_DE_FALHAS_VISIVEIS),
  };
}

/**
 * Se o envio pode ter mudado alguma coisa no Bling, e portanto o pop-up tem que le-lo de novo para
 * mostrar o estado de agora. E a mesma decisao do `revalidatePath` das acoes (`acoes-bling.js`): o
 * que foi gravado no Bling e no Rise, mesmo parcial, tem que aparecer.
 *
 * - `sincronizar`: deu certo, ou o PATCH/algum fornecedor ja tinha ido antes da falha.
 * - `cadastrar`: deu certo, ou o produto ja foi criado (`blingId`) e o que falhou foi depois.
 * - `estoque`: deu certo, ou algum ajuste ja foi aceito (o envio para na primeira falha).
 *
 * Falha que nao enviou nada (escrita bloqueada, deposito pendente) devolve `false`: nada mudou, e ler
 * o Bling de novo gastaria duas chamadas a toa.
 *
 * @param {"sincronizar"|"cadastrar"|"estoque"} tipo
 * @param {object|null} resultado o que a Server Action devolveu.
 */
export function mudouNoBling(tipo, resultado) {
  if (!resultado) return false;
  const ok = resultado.ok === true;
  if (tipo === "sincronizar") {
    return ok || inteiro(resultado.alterados?.length) > 0 || inteiro(resultado.fornecedores?.enviados) > 0;
  }
  if (tipo === "cadastrar") return ok || Boolean(resultado.blingId);
  if (tipo === "estoque") return ok || inteiro(resultado.enviados) > 0;
  return false;
}

/**
 * O que a tela conta de um envio, em palavras: um titulo e, se for o caso, uma linha por campo
 * ("Preco: de R$ 90,00 para R$ 95,00"). `null` quando nao ha o que contar (a falha sem nada enviado:
 * quem a conta e a mensagem de erro da acao, em vermelho).
 *
 * `rotulos` mapeia o id do campo ao rotulo (`{preco: "Preco"}`): o resultado de `sincronizarProduto`
 * traz so o id, e a tela tira os rotulos das diferencas que ela mesma mostrava antes de enviar (nao
 * ha como importar `CAMPOS_DE_ENVIO` no navegador).
 *
 * @param {"sincronizar"|"cadastrar"|"estoque"} tipo
 * @param {object|null} resultado o que a Server Action devolveu.
 * @param {Record<string, string>} [rotulos]
 * @returns {{titulo: string, linhas: string[]}|null}
 */
export function resumirEnvio(tipo, resultado, rotulos = {}) {
  if (!resultado) return null;
  const ok = resultado.ok === true;

  if (tipo === "sincronizar") {
    const alterados = Array.isArray(resultado.alterados) ? resultado.alterados : [];
    const fornecedores = inteiro(resultado.fornecedores?.enviados);
    const linhas = alterados.map(
      ({ campo, de, para }) => `${rotuloDe(rotulos, campo)}: de ${valorNaFrase(campo, de)} para ${valorNaFrase(campo, para)}`,
    );
    if (fornecedores > 0) linhas.push(`Fornecedores enviados: ${fornecedores}.`);

    if (ok) {
      return linhas.length > 0
        ? { titulo: "Sincronizado com o Bling.", linhas }
        : { titulo: "Nada para enviar: o Bling ja estava igual ao Rise.", linhas: [] };
    }
    return linhas.length > 0 ? { titulo: "Antes da falha, foi enviado ao Bling:", linhas } : null;
  }

  if (tipo === "cadastrar") {
    const id = resultado.blingId ? ` (id ${resultado.blingId})` : "";
    if (ok) return { titulo: `Produto cadastrado no Bling${id}.`, linhas: [] };
    return resultado.blingId ? { titulo: `O produto foi criado no Bling${id}, mas o envio nao terminou.`, linhas: [] } : null;
  }

  if (tipo === "estoque") {
    const enviados = inteiro(resultado.enviados);
    const restantes = inteiro(resultado.restantes);
    if (ok) {
      return {
        titulo: enviados > 0 ? `${enviados} ajuste(s) de estoque enviado(s) ao Bling.` : "Nao havia ajuste de estoque pendente.",
        linhas: [],
      };
    }
    return enviados > 0
      ? { titulo: `${enviados} ajuste(s) de estoque foram ao Bling antes da falha; ${restantes} continuam pendente(s).`, linhas: [] }
      : null;
  }

  return null;
}
