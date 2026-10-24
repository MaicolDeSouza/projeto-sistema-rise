import { normalizar } from "../texto.js";
import { ehMedida, idDaCaracteristica, identidadeDoValor, recomendacaoDaDivergencia } from "./divergencias.js";

// Os quadros de divergencia nascem em `identificarDivergencias` com o ROTULO CRU da loja ("Tensão de entrada
// (recomendada)", "Tensão de Entrada"), e a padronizacao do prompt nunca passa por la. A IA e o motor de sinonimos:
// em cada decisao ela devolve o nome padronizado (`campo`), as ids que sao o mesmo campo (`ids`), a opcao escolhida
// (`id` + `opcao`), o valor no padrao do prompt (`valor`) e os grupos de opcoes que sao o mesmo valor escrito de
// outro jeito (`iguais`). Aqui os quadros sao fundidos por esse nome. Resposta no formato antigo (so `id`, `opcao`,
// `motivo`) deixa o quadro como esta, e o que a IA devolver de invalido (id desconhecido, opcao fora da lista) e
// ignorado em silencio, para uma resposta torta nunca derrubar a janela.

// Dimensoes e peso tem linha propria (`- Dimensões(CxLxA): 68x53x10mm;`), escrita pelo codigo: nunca sao renomeados.
const IDS_FIXOS = new Set(["dimensoes", "peso"]);

const lista = (valor) => (Array.isArray(valor) ? valor : []);
const texto = (valor) => (typeof valor === "string" ? valor.trim() : "");

/**
 * Funde os quadros do mesmo campo e separa os que deixaram de ser divergencia.
 *
 * @param {Array<{ id: string, campo: string, opcoes: Array<{ valor: string, linha: string, aviso: string | null, fontes: Array<{ id: string, nome: string, produto: string, numero: number }> }> }>} divergencias
 * @param {Array<{ id?: string, opcao?: number | null, motivo?: string, campo?: string | null, ids?: string[], valor?: string | null, iguais?: Array<Array<{ id: string, opcao: number }>> }>} decisoes
 * @returns {{ quadros: Array<object>, resolvidas: Array<{ campo: string, valor: string, linha: string, fontes: object[], referencias: number[] }> }}
 *   `quadros`: os que continuam pedindo escolha. `resolvidas`: o grupo em que todas as opcoes eram o mesmo valor
 *   (vira linha comum, com as lojas de todas as opcoes).
 */
export function fundirDivergencias(divergencias, decisoes) {
  const porId = new Map(lista(divergencias).map((item) => [item.id, item]));
  const grupoDoId = new Map();
  const grupos = [];

  // Quadros cujo dado o prompt nao pede (`foraDoPrompt`, pedido do dono em 24/10/2026): saem da descricao. Dimensoes e
  // peso nunca saem (o codigo escreve as duas linhas).
  const foraDoPrompt = new Set();
  for (const decisao of lista(decisoes)) {
    if (decisao?.foraDoPrompt !== true) continue;
    for (const id of [decisao.id, ...lista(decisao.ids)]) if (porId.has(id) && !IDS_FIXOS.has(id)) foraDoPrompt.add(id);
  }

  for (const decisao of lista(decisoes)) {
    const principal = porId.get(decisao?.id);
    if (!principal || grupoDoId.has(principal.id) || foraDoPrompt.has(principal.id)) continue; // desconhecida, ja reivindicada ou fora do prompt
    const campo = texto(decisao.campo);
    const podeRenomear = campo && !IDS_FIXOS.has(principal.id);
    const ids = podeRenomear
      ? [...new Set([principal.id, ...lista(decisao.ids)])].filter((id) => porId.has(id) && !grupoDoId.has(id) && !IDS_FIXOS.has(id))
      : [principal.id];
    const grupo = { campo: podeRenomear ? campo : principal.campo, renomear: Boolean(podeRenomear), ids, decisao };
    // O `id` da escolha vem primeiro: e o quadro cuja opcao a IA marcou.
    for (const id of ids) grupoDoId.set(id, grupo);
    grupos.push(grupo);
  }

  const quadros = [];
  const resolvidas = [];
  const emitidos = new Set();
  for (const item of lista(divergencias)) {
    if (foraDoPrompt.has(item.id)) continue;
    const grupo = grupoDoId.get(item.id);
    if (!grupo) {
      // Sem decisao: o quadro fica como esta, com a recomendacao de hoje.
      const { recomendada, motivo } = recomendacaoDaDivergencia(item, null);
      quadros.push({ id: item.id, ids: [item.id], campo: item.campo, opcoes: item.opcoes, recomendada, motivo });
      continue;
    }
    if (emitidos.has(grupo)) continue;
    emitidos.add(grupo);
    const fundido = fundirGrupo(grupo, porId);
    if (fundido.resolvida) resolvidas.push(fundido.resolvida);
    else quadros.push(fundido.quadro);
  }
  return { quadros, resolvidas };
}

function fundirGrupo(grupo, porId) {
  const { campo, renomear, ids, decisao } = grupo;
  const quadrosDoGrupo = ids.map((id) => porId.get(id));

  if (!renomear) {
    const item = quadrosDoGrupo[0];
    const { recomendada, motivo } = recomendacaoDaDivergencia(item, decisao);
    return { quadro: { id: item.id, ids: [item.id], campo: item.campo, opcoes: item.opcoes, recomendada, motivo } };
  }

  // Cada opcao de cada quadro e um no; `iguais` e a mesma identidade de valor ligam nos que sao um valor so.
  const nos = [];
  const indiceDoNo = new Map();
  for (const quadro of quadrosDoGrupo) {
    quadro.opcoes.forEach((opcao, indice) => {
      indiceDoNo.set(`${quadro.id}#${indice}`, nos.length);
      nos.push({ quadro, indice, opcao });
    });
  }
  const pai = nos.map((_, indice) => indice);
  const raiz = (indice) => (pai[indice] === indice ? indice : (pai[indice] = raiz(pai[indice])));
  const unir = (a, b) => { pai[raiz(Math.max(a, b))] = raiz(Math.min(a, b)); };

  for (const iguais of lista(decisao.iguais)) {
    const validos = lista(iguais)
      .map((ref) => indiceDoNo.get(`${ref?.id}#${ref?.opcao}`))
      .filter((indice) => indice !== undefined);
    for (const indice of validos.slice(1)) unir(validos[0], indice);
  }
  const porIdentidade = new Map();
  nos.forEach(({ quadro, opcao }, indice) => {
    const identidade = identidadeDoValor(quadro.campo, opcao.valor);
    if (porIdentidade.has(identidade)) unir(porIdentidade.get(identidade), indice);
    else porIdentidade.set(identidade, indice);
  });

  // Os aglomerados, na ordem em que aparecem.
  const aglomerados = new Map();
  nos.forEach((no, indice) => {
    const dono = raiz(indice);
    if (!aglomerados.has(dono)) aglomerados.set(dono, []);
    aglomerados.get(dono).push(no);
  });

  const escolhido = indiceDoNo.get(`${decisao.id}#${decisao.opcao}`);
  const valorDaIA = texto(decisao.valor);
  const opcoes = [];
  let indiceEscolhido = null;
  for (const [dono, membros] of aglomerados) {
    const fontes = [];
    for (const { opcao } of membros) {
      for (const fonte of opcao.fontes) if (!fontes.some((outra) => outra.id === fonte.id)) fontes.push(fonte);
    }
    const valorDaLoja = membros[0].opcao.valor;
    const ehEscolhida = escolhido !== undefined && raiz(escolhido) === dono;
    const valor = ehEscolhida && valorDaIA ? valorDaIA : valorDaLoja;
    const fundida = {
      valor: valorDaLoja,
      linha: `- ${campo}: ${valor};`,
      aviso: membros.map(({ opcao }) => opcao.aviso).find(Boolean) ?? null,
      fontes,
    };
    if (ehEscolhida && valorDaIA) fundida.valorDaLoja = valorDaLoja;
    if (ehEscolhida) indiceEscolhido = opcoes.length;
    opcoes.push(fundida);
  }

  if (opcoes.length === 1) {
    const unica = opcoes[0];
    const valor = valorDaIA || unica.valor;
    const referencias = [];
    for (const fonte of unica.fontes) {
      if (Number.isInteger(fonte.numero) && !referencias.includes(fonte.numero)) referencias.push(fonte.numero);
    }
    return { resolvida: { campo, valor, linha: `- ${campo}: ${valor};`, fontes: unica.fontes, referencias } };
  }

  const { recomendada, motivo } = recomendacaoDaDivergencia(
    { campo, opcoes },
    { opcao: indiceEscolhido, motivo: decisao.motivo },
  );
  return { quadro: { id: ids[0], ids, campo, opcoes, recomendada, motivo } };
}

// Onde cada tipo de caracteristica fica na lista quando a IA nao reservou a posicao (a mesma ordem que o prompt
// pede: modelo e chip, USB, clock, tensao, pinos, memorias, corrente, o resto).
function prioridade(nome) {
  const chave = normalizar(String(nome ?? ""));
  if (/modelo|chip de interface|microcontrolador|micro.controlador|processador/.test(chave)) return 10;
  if (/usb|conversor/.test(chave)) return 20;
  if (/clock|frequencia|velocidade/.test(chave)) return 30;
  if (/tensao|voltagem|alimentacao/.test(chave)) return 40;
  if (/pinos|portas|entrada|saida|gpio/.test(chave)) return 50;
  if (/memoria|flash|sram|eeprom|rom|ram/.test(chave)) return 60;
  if (/corrente/.test(chave)) return 70;
  return 80;
}

/**
 * Encaixa os quadros fundidos e as linhas resolvidas na lista de caracteristicas da IA.
 *
 * A IA reserva a posicao de um campo divergente com uma caracteristica de valor "" e o nome padronizado (ou, no formato
 * antigo, o nome da loja). A reserva marca o lugar e sai da lista; uma linha comum com o mesmo nome de um quadro
 * tambem sai (senao a linha apareceria duas vezes), e o quadro fica no lugar dela. Quadro ou linha resolvida sem
 * reserva entra pela prioridade do nome. Dimensoes e peso ficam no fim, como sempre.
 *
 * @param {{ caracteristicas: Array<{ nome: string, valor: string, referencias: number[] }>, divergencias: object[], decisoes: object[] }} entrada
 * @returns {{ caracteristicas: object[], quadros: object[], resolvidas: Array<{ campo: string, valor: string, lojas: string[] }>, substituidas: Set<string> }}
 *   `caracteristicas`: so as linhas comuns (as resolvidas ja dentro, no lugar certo). `quadros`: com `posicao` = quantas
 *   linhas comuns vem antes. `substituidas`: as chaves (`idDaCaracteristica`) de itens da IA trocados por quadro ou
 *   resolvida, para a loja de cada linha nao ser calculada em cima de um item que saiu.
 */
export function integrarDecisoes({ caracteristicas, divergencias, decisoes }) {
  const { quadros, resolvidas } = fundirDivergencias(divergencias, decisoes);
  const comPosicaoLivre = quadros.filter((quadro) => !IDS_FIXOS.has(quadro.id));

  const alvos = new Map();
  for (const quadro of comPosicaoLivre) {
    for (const chave of [...quadro.ids, idDaCaracteristica(quadro.campo)]) if (!alvos.has(chave)) alvos.set(chave, { quadro });
  }
  for (const resolvida of resolvidas) {
    const chave = idDaCaracteristica(resolvida.campo);
    if (!alvos.has(chave)) alvos.set(chave, { resolvida });
  }

  const espacos = [];
  const colocados = new Set();
  const substituidas = new Set();
  for (const item of lista(caracteristicas)) {
    const chave = idDaCaracteristica(item?.nome);
    const alvo = alvos.get(chave);
    if (alvo) {
      substituidas.add(chave);
      const dono = alvo.quadro ?? alvo.resolvida;
      if (!colocados.has(dono)) {
        colocados.add(dono);
        espacos.push(alvo);
      }
      continue;
    }
    if (item?.nome && item?.valor && !ehMedida.test(String(item.nome).trim())) espacos.push({ comum: item });
  }

  const nomeDoEspaco = (espaco) => espaco.comum?.nome ?? espaco.resolvida?.campo;
  const semReserva = [...comPosicaoLivre.map((quadro) => ({ quadro })), ...resolvidas.map((resolvida) => ({ resolvida }))];
  for (const alvo of semReserva) {
    const dono = alvo.quadro ?? alvo.resolvida;
    if (colocados.has(dono)) continue;
    const indice = espacos.findIndex((espaco) => !espaco.quadro && prioridade(nomeDoEspaco(espaco)) > prioridade(dono.campo));
    espacos.splice(indice < 0 ? espacos.length : indice, 0, alvo);
  }

  let comuns = 0;
  const posicoes = new Map();
  const linhas = [];
  for (const espaco of espacos) {
    if (espaco.quadro) {
      posicoes.set(espaco.quadro, comuns);
      continue;
    }
    comuns++;
    linhas.push(espaco.comum ?? { nome: espaco.resolvida.campo, valor: espaco.resolvida.valor, referencias: espaco.resolvida.referencias });
  }

  return {
    caracteristicas: linhas,
    quadros: quadros.map((quadro) => ({
      ...quadro,
      posicao: quadro.id === "dimensoes" ? comuns : quadro.id === "peso" ? comuns + 1 : posicoes.get(quadro) ?? comuns,
    })),
    resolvidas: resolvidas.map(({ campo, valor, fontes }) => ({ campo, valor, lojas: [...new Set(fontes.map((fonte) => fonte.nome))] })),
    substituidas,
  };
}
