"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";

import { buscarProdutosAcao, enviarFotoDoItemAcao, estoqueDosItensAcao, produtoParaPropostaAcao } from "@/app/propostas/acoes";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { UNIDADES_DA_PROPOSTA, UNIDADE_POR_EXTENSO, markupDoItem, totalDoItem } from "@/lib/propostas/regras";
import { doTexto, itemDoFormulario, moeda, paraTexto, soDecimal, soDigitos } from "./formato";

// `celulaSolta`: sem o w-full, para a caixa que tem largura propria (fator, marca, modelo, custo, dias): as duas classes
// de largura juntas brigam e a w-full vencia.
const celulaSolta =
  "rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:bg-fundo disabled:text-suave aria-[invalid=true]:border-rose-500";
const celula = `w-full ${celulaSolta}`;

/**
 * O nome do produto, campo principal do item (pedido do dono em 17/11/2026): mostra o nome do produto do Rise e, ao
 * digitar, busca no Rise pelo codigo ou por qualquer palavra do nome. Escolher troca o produto do item (foto, codigo,
 * marca, modelo, unidade, preco e custo). Item sem produto no Rise guarda o nome digitado; num item com produto, digitar
 * sem escolher volta ao nome do Rise ao sair do campo (ou vira item sem cadastro pela ultima opcao da lista).
 */
function CampoDoProduto({ item, editar, focar, erro, aoEscolher, aoNomeLivre }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const [escolhendo, setEscolhendo] = useState(null);
  const vez = useRef(0);
  const campoRef = useRef(null);
  const idDaLista = useId();

  useEffect(() => {
    const termo = texto.trim();
    if (!editando || termo.length < 2) return undefined;
    const minha = ++vez.current;
    const relogio = setTimeout(async () => {
      setBuscando(true);
      const lista = await buscarProdutosAcao(termo);
      if (minha !== vez.current) return;
      setAchados(Array.isArray(lista) ? lista : []);
      setMarcado(-1);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(relogio);
  }, [texto, editando]);

  const valor = editando ? texto : (item.nomeInterno ?? "");
  const termo = texto.trim();
  const aberta = editando && termo.length >= 2 && achados !== null && !buscando;
  const virarAvulso = Boolean(item.produtoId) && Boolean(termo) && termo !== item.nomeInterno;

  function fechar() {
    vez.current++;
    setEditando(false);
    setAchados(null);
    setBuscando(false);
  }
  async function escolher(produtoId) {
    setEscolhendo(produtoId);
    await aoEscolher(produtoId);
    setEscolhendo(null);
    fechar();
    campoRef.current?.blur();
  }
  function digitar(novo) {
    setTexto(novo);
    if (novo.trim().length < 2) setAchados(null);
    if (!item.produtoId) aoNomeLivre(novo, false);
  }
  function tecla(evento) {
    if (evento.key === "Enter") evento.preventDefault();
    if (!aberta) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setMarcado((i) => Math.min(i + 1, achados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setMarcado((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && achados[marcado]) {
      escolher(achados[marcado].produtoId);
    } else if (evento.key === "Escape") {
      evento.stopPropagation();
      fechar();
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-2.5 left-2.5 text-suave" />
        <textarea
          ref={campoRef}
          rows={1}
          autoFocus={focar}
          value={valor}
          disabled={!editar}
          placeholder="Buscar no Rise pelo código ou nome"
          aria-label="Produto"
          role="combobox"
          aria-expanded={aberta}
          aria-controls={idDaLista}
          aria-autocomplete="list"
          aria-invalid={Boolean(erro)}
          title={erro}
          onFocus={() => {
            setTexto(item.nomeInterno ?? "");
            setEditando(true);
          }}
          onBlur={fechar}
          onChange={(e) => digitar(e.target.value.replace(/[\r\n]+/g, " ").slice(0, 300))}
          onKeyDown={tecla}
          className={`${celula} field-sizing-content min-h-9 resize-none pl-7 font-medium`}
        />
        {buscando && <Loader2 size={14} className="absolute top-2.5 right-2.5 animate-spin text-suave" />}
      </div>
      {aberta && (
        <ul
          id={idDaLista}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full min-w-[28rem] overflow-y-auto rounded-md border border-borda bg-superficie py-1 shadow-lg"
        >
          {achados.length === 0 && (
            <li className="px-3 py-2 text-sm text-suave">
              {item.produtoId ? "Nenhum produto no Rise com esse texto." : "Nenhum produto no Rise: o nome digitado fica como item sem cadastro."}
            </li>
          )}
          {achados.map((a, indice) => (
            <li key={a.produtoId} role="option" aria-selected={indice === marcado}>
              <button
                type="button"
                disabled={escolhendo !== null}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(a.produtoId)}
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-fundo disabled:opacity-60 ${indice === marcado ? "bg-fundo" : ""}`}
              >
                {a.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain outline outline-1 -outline-offset-1 outline-black/10" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded bg-fundo" />
                )}
                <span className="w-20 shrink-0 font-mono text-xs">{a.sku}</span>
                <span className={`min-w-0 flex-1 truncate ${a.ativo ? "" : "text-suave line-through"}`}>{a.nome}</span>
                <span className="shrink-0 tabular-nums text-suave">{a.preco !== null ? moeda.format(a.preco) : "—"}</span>
                {escolhendo === a.produtoId && <Loader2 size={14} className="animate-spin" />}
              </button>
            </li>
          ))}
          {virarAvulso && (
            <li className="border-t border-borda">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  aoNomeLivre(termo, true);
                  fechar();
                  campoRef.current?.blur();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-suave hover:bg-fundo hover:text-texto"
              >
                <PackagePlus size={15} /> Usar “{termo}” como item sem cadastro
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const numeroBR = (valor) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/**
 * O "i" de estoque no fim da linha (pedido do dono em 17/11/2026, "igual ao Bling"): verde quando o disponivel cobre a
 * quantidade, vermelho quando falta; o mouse mostra o estoque, o reservado em pedidos abertos e quanto comprar. As
 * quantidades sao em unidades do Rise (a quantidade do item x o fator).
 */
function EstoqueDoItem({ info, produtoId }) {
  if (!info) return null;
  const peca = info.pecas[0];
  const simples = info.pecas.length === 1 && peca.produtoId === produtoId;
  const texto = simples ? (
    <>
      <span className="block">Em estoque: {numeroBR(peca.estoque)}</span>
      {peca.reservado > 0 && <span className="block">Reservado em pedidos abertos: {numeroBR(peca.reservado)}</span>}
      <span className="block">Disponível: {numeroBR(peca.disponivel)}</span>
      <span className="block">Nesta proposta: {numeroBR(peca.necessario)}</span>
      <span className="block font-semibold">{peca.falta > 0 ? `Comprar: ${numeroBR(peca.falta)}` : "O estoque atende"}</span>
      {peca.previsao && <span className="block">A caminho: {peca.previsao}</span>}
    </>
  ) : (
    <>
      <span className="block font-semibold">{info.atende ? "O estoque atende (peças do kit)" : "Faltam peças do kit"}</span>
      {info.pecas.map((p) => (
        <span key={p.produtoId} className="block">
          {p.sku}: disponível {numeroBR(p.disponivel)} de {numeroBR(p.necessario)}
          {p.falta > 0 ? `, comprar ${numeroBR(p.falta)}` : ""}
          {p.previsao ? ` (a caminho: ${p.previsao})` : ""}
        </span>
      ))}
    </>
  );
  return <BolhaDeAjuda variante="inline-direita" cor={info.atende ? "text-emerald-600" : "text-rose-600"} className="mt-2.5" texto={texto} />;
}

/**
 * Foto do item AVULSO (13/11/2026): clicar escolhe a imagem, que vai na hora para a pasta da proposta; o item a guarda
 * no Salvar. Com foto, o "x" tira (o arquivo fica na pasta ate a proposta ser excluida).
 */
function FotoDoAvulso({ numero, item, aoMudar, aoErro }) {
  const [enviando, setEnviando] = useState(false);
  async function enviar(arquivo) {
    if (!arquivo) return;
    setEnviando(true);
    const dados = new FormData();
    dados.set("numero", String(numero));
    dados.set("foto", arquivo);
    const resposta = await enviarFotoDoItemAcao(dados).catch(() => null);
    setEnviando(false);
    if (!resposta?.ok) return aoErro(resposta?.erro ?? "Não foi possível enviar a foto.");
    aoMudar({ foto: resposta.foto, fotoUrl: resposta.fotoUrl });
  }
  return (
    <div className="relative h-10 w-10">
      <label
        className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded border border-dashed border-borda bg-fundo text-suave hover:border-acento hover:text-acento"
        title={item.fotoUrl ? "Trocar a foto" : "Enviar foto do item"}
      >
        {enviando ? (
          <Loader2 size={16} className="animate-spin" />
        ) : item.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.fotoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <ImagePlus size={16} />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={enviando}
          onChange={(e) => {
            enviar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {item.fotoUrl && !enviando && (
        <button
          type="button"
          onClick={() => aoMudar({ foto: null, fotoUrl: null })}
          title="Tirar a foto"
          aria-label="Tirar a foto"
          className="absolute -top-1.5 -right-1.5 rounded-full border border-borda bg-superficie p-0.5 text-suave hover:text-rose-600"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

/** O fator valido do item (1 quando vazio ou invalido): quantas unidades do Rise formam 1 unidade do cliente. */
const fatorDe = (item) => {
  const valor = doTexto(item.fator);
  return valor > 0 ? valor : 1;
};

/**
 * Os itens da proposta (redesenho do dono em 17/11/2026). O campo principal e o NOME DO PRODUTO DO RISE, com a busca;
 * embaixo o codigo do Rise, os botoes "+ Descricao do cliente" e "+Obs." e a marca e o modelo (vem do Rise e se corrigem
 * aqui). No PDF sai a descricao do cliente quando preenchida, senao o nome do Rise, e sempre o codigo do Rise. Custo e
 * lucro (markup) numa coluna so, para quem ve custo; no fim, o "i" de estoque. Cabecalhos todos a esquerda e uma linha
 * entre as colunas (o dono: "nao estao alinhados ... hoje esta confuso").
 *
 * FATOR (pedido do dono em 17/11/2026: "kit espacador 10 unidades" = fator 10): so no item com produto do Rise, ao lado
 * da descricao do cliente. A quantidade, o preco e o custo da linha ficam na unidade do CLIENTE (o kit), que e o que sai
 * no PDF; o estoque e o pedido de venda do Bling usam quantidade x fator. Mudar o fator (ao sair do campo) leva o preco e
 * o custo junto, na proporcao (`fatorBase` = o fator em que o preco da linha esta).
 */
export default function ItensDaProposta({ numero, itens, editar, veCusto, erros, aoTrocar, aoErro, exigeMarcaModelo = false }) {
  const [obsAberta, setObsAberta] = useState(null);
  const [descricaoAberta, setDescricaoAberta] = useState(null);
  const [focar, setFocar] = useState(null);
  const [estoque, setEstoque] = useState({});
  const vezDoEstoque = useRef(0);

  const mudarItem = (indice, campo, valor) => aoTrocar(itens.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  const mudarCampos = (indice, campos) => aoTrocar(itens.map((item, i) => (i === indice ? { ...item, ...campos } : item)));
  const remover = (indice) => aoTrocar(itens.filter((_, i) => i !== indice));

  // O estoque e relido quando muda o produto, a quantidade ou o fator de algum item (so ids e numeros: a chave do efeito).
  const pedidoDeEstoque = JSON.stringify(itens.map((item) => [item.chave, item.produtoId ?? null, (doTexto(item.quantidade) ?? 0) * fatorDe(item)]));
  useEffect(() => {
    const lista = JSON.parse(pedidoDeEstoque);
    const minha = ++vezDoEstoque.current;
    const relogio = setTimeout(async () => {
      const lido = await estoqueDosItensAcao(lista.map(([, produtoId, quantidade]) => ({ produtoId, quantidade })));
      if (minha !== vezDoEstoque.current) return;
      setEstoque(Object.fromEntries(lista.map(([chave], i) => [chave, Array.isArray(lido) ? (lido[i] ?? null) : null])));
    }, 400);
    return () => clearTimeout(relogio);
  }, [pedidoDeEstoque]);

  function adicionar() {
    const novo = itemDoFormulario({ quantidade: 1 });
    aoTrocar([...itens, novo]);
    setFocar(novo.chave);
  }
  async function escolherProduto(indice, produtoId) {
    const dados = await produtoParaPropostaAcao(produtoId);
    if (!dados) return aoErro("Não foi possível usar o produto.");
    const fator = fatorDe(itens[indice] ?? {});
    const doProduto = itemDoFormulario({
      ...dados,
      quantidade: 1,
      // O preco e o custo do Rise sao por unidade; a linha fica na unidade do cliente (x fator).
      precoUnitario: dados.precoUnitario !== null && dados.precoUnitario !== undefined ? dados.precoUnitario * fator : null,
      custoUnitario: dados.custoUnitario !== null && dados.custoUnitario !== undefined ? dados.custoUnitario * fator : null,
    });
    // O que e do produto vem do Rise; o que o operador ja decidiu nesta linha (quantidade, descricao do cliente, fator,
    // observacao, desconto e prazo) fica.
    mudarCampos(indice, {
      produtoId: doProduto.produtoId,
      sku: doProduto.sku,
      codigoInterno: doProduto.codigoInterno,
      nomeInterno: doProduto.nomeInterno,
      foto: doProduto.foto,
      fotoUrl: doProduto.fotoUrl,
      marca: doProduto.marca,
      modelo: doProduto.modelo,
      unidade: doProduto.unidade,
      precoUnitario: doProduto.precoUnitario,
      custoUnitario: doProduto.custoUnitario,
      fatorBase: fator,
    });
  }
  function nomeLivre(indice, texto, desligar) {
    if (!desligar) return mudarItem(indice, "nomeInterno", texto);
    // Sem produto do Rise nao ha fator: o item volta a 1 (o preco digitado fica como esta).
    mudarCampos(indice, {
      produtoId: null,
      sku: null,
      codigoInterno: null,
      foto: null,
      fotoUrl: null,
      nomeInterno: texto,
      fator: "1",
      fatorBase: 1,
    });
  }
  /** Ao sair do campo Fator: preco e custo acompanham na proporcao do fator anterior. */
  function confirmarFator(indice) {
    const item = itens[indice];
    const novo = fatorDe(item);
    const antes = Number(item.fatorBase) > 0 ? Number(item.fatorBase) : 1;
    const escala = (texto) => {
      const valor = doTexto(texto);
      return valor === null ? texto : paraTexto((valor * novo) / antes, 4);
    };
    mudarCampos(indice, {
      fator: paraTexto(novo, 4),
      fatorBase: novo,
      ...(novo !== antes
        ? {
            precoUnitario: escala(item.precoUnitario),
            custoUnitario: escala(item.custoUnitario),
          }
        : {}),
    });
  }

  const th = "border-l border-borda px-3 py-2 text-left font-medium first:border-l-0";
  const td = "border-l border-borda px-3 py-2.5 first:border-l-0";

  return (
    <SecaoDoAnuncio
      titulo={`Itens (${itens.length})`}
      ajuda="O campo principal é o produto do Rise: digite o código ou uma palavra do nome. No PDF sai a descrição do cliente quando preenchida, senão o nome do Rise, e sempre o código do Rise. O mesmo produto pode entrar duas vezes."
      acao={
        editar ? (
          <button type="button" onClick={adicionar} className="inline-flex items-center gap-1 text-sm font-medium text-acento hover:underline">
            <Plus size={15} /> Adicionar item
          </button>
        ) : null
      }
    >
      {itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-suave">Nenhum item ainda.</p>
      ) : (
        <div className="-m-4 overflow-x-auto">
          {/* table-fixed: as larguras do cabecalho valem e o Produto fica com o resto (sem isso o nome longo espremia o resto). */}
          <table className="w-full min-w-[1280px] table-fixed border-collapse text-sm">
            <thead className="bg-fundo/70 text-xs text-suave">
              <tr className="border-b border-borda">
                <th className={`${th} w-14`}>
                  <span className="sr-only">Foto</span>
                </th>
                <th className={`${th} min-w-[20rem]`}>Produto</th>
                <th className={`${th} w-20`}>Qtd.</th>
                <th className={`${th} w-36`}>Un.</th>
                <th className={`${th} w-24`}>Unitário</th>
                <th className={`${th} w-20 whitespace-nowrap`}>Desc. %</th>
                <th className={`${th} w-28`}>Total</th>
                <th className={`${th} w-44`}>Prazo</th>
                {veCusto && <th className={`${th} w-40 whitespace-nowrap`}>Custo (lucro)</th>}
                <th className={`${th} w-12`}>
                  <span className="sr-only">Estoque</span>
                </th>
                {editar && (
                  <th className={`${th} w-12`}>
                    <span className="sr-only">Remover</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {itens.map((item, indice) => {
                const erro = (campo) => erros[`itens.${indice}.${campo}`];
                const numeros = {
                  quantidade: doTexto(item.quantidade) ?? 0,
                  precoUnitario: doTexto(item.precoUnitario) ?? 0,
                  descontoPercentual: doTexto(item.descontoPercentual) ?? 0,
                  custoUnitario: doTexto(item.custoUnitario),
                };
                const markup = markupDoItem(numeros);
                const fator = fatorDe(item);
                const verDescricao = Boolean(item.descricaoCliente) || descricaoAberta === item.chave;
                const verObs = Boolean(item.observacao) || obsAberta === item.chave;
                const verFator = Boolean(item.produtoId) && (verDescricao || fator !== 1);
                return (
                  <tr key={item.chave} className="border-b border-borda align-top last:border-b-0">
                    <td className={td}>
                      {editar && !item.produtoId ? (
                        <FotoDoAvulso numero={numero} item={item} aoMudar={(campos) => mudarCampos(indice, campos)} aoErro={aoErro} />
                      ) : item.fotoUrl ? (
                        <FotoComLupa src={item.fotoUrl} alt={item.nomeInterno ?? ""} className="h-10 w-10" />
                      ) : (
                        <span className="block h-10 w-10 rounded bg-fundo" />
                      )}
                    </td>
                    <td className={td}>
                      <CampoDoProduto
                        item={item}
                        editar={editar}
                        focar={focar === item.chave}
                        erro={erro("nomeInterno")}
                        aoEscolher={(produtoId) => escolherProduto(indice, produtoId)}
                        aoNomeLivre={(texto, desligar) => nomeLivre(indice, texto, desligar)}
                      />
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-suave">
                        {item.produtoId ? (
                          <span>
                            Cód. <span className="font-mono text-texto">{item.sku}</span>
                          </span>
                        ) : (
                          <span>Sem cadastro no Rise</span>
                        )}
                        {editar && !verDescricao && (
                          <button
                            type="button"
                            onClick={() => setDescricaoAberta(item.chave)}
                            className="font-medium text-acento hover:underline"
                            title="Texto que sai no PDF no lugar do nome do Rise"
                          >
                            + Descrição do cliente
                          </button>
                        )}
                        {editar && !verObs && (
                          <button type="button" onClick={() => setObsAberta(item.chave)} className="font-medium text-acento hover:underline">
                            +Obs.
                          </button>
                        )}
                      </p>
                      {(verDescricao || verFator) && (
                        <div className="mt-1 flex items-start gap-2">
                          {verDescricao && (
                            // A caixa da descricao num div flex-1: o textarea com field-sizing direto no flex ficava da
                            // largura do texto e espremido pelo Fator.
                            <div className="min-w-0 flex-1">
                              <textarea
                                rows={1}
                                autoFocus={descricaoAberta === item.chave}
                                value={item.descricaoCliente}
                                disabled={!editar}
                                placeholder="Descrição do cliente (sai no PDF no lugar do nome)"
                                aria-label="Descrição do cliente"
                                title="Descrição do cliente: sai no PDF no lugar do nome do Rise"
                                onChange={(e) => mudarItem(indice, "descricaoCliente", e.target.value)}
                                onBlur={() => setDescricaoAberta(null)}
                                className={`${celula} field-sizing-content min-h-8 resize-none border-sky-200 bg-sky-50/60 text-xs`}
                              />
                            </div>
                          )}
                          {verFator && (
                            <label
                              className="flex shrink-0 items-center gap-1.5 text-xs text-suave"
                              title="Quantas unidades do produto do Rise formam 1 unidade do cliente (kit de 10 = fator 10). Preço e custo da linha são do kit."
                            >
                              Fator
                              <input
                                inputMode="decimal"
                                value={item.fator}
                                disabled={!editar}
                                aria-label="Fator"
                                aria-invalid={Boolean(erro("fator"))}
                                onChange={(e) => mudarItem(indice, "fator", soDecimal(e.target.value))}
                                onBlur={() => confirmarFator(indice)}
                                className={`${celulaSolta} w-16 py-1 text-xs tabular-nums`}
                              />
                              {fator !== 1 && numeros.quantidade > 0 && (
                                <span className="whitespace-nowrap tabular-nums">= {numeroBR(numeros.quantidade * fator)} un. do Rise</span>
                              )}
                            </label>
                          )}
                        </div>
                      )}
                      {verObs && (
                        <textarea
                          rows={1}
                          autoFocus={obsAberta === item.chave}
                          value={item.observacao}
                          disabled={!editar}
                          placeholder="Observação do item (sai no PDF)"
                          aria-label="Observação do item"
                          onChange={(e) => mudarItem(indice, "observacao", e.target.value)}
                          onBlur={() => setObsAberta(null)}
                          className={`${celula} field-sizing-content mt-1 min-h-8 resize-none bg-amber-50/60 text-xs italic`}
                        />
                      )}
                      {/* Marca e modelo vem do produto do Rise e se corrigem aqui; saem no PDF (o SENAI exige; 13/11/2026). */}
                      <div className="mt-1.5 flex gap-2">
                        <input
                          value={item.marca}
                          disabled={!editar}
                          placeholder="Marca"
                          aria-label="Marca"
                          title="Marca"
                          aria-invalid={exigeMarcaModelo && !item.marca.trim()}
                          onChange={(e) => mudarItem(indice, "marca", e.target.value.slice(0, 100))}
                          className={`${celulaSolta} w-40 py-1 text-xs`}
                        />
                        <input
                          value={item.modelo}
                          disabled={!editar}
                          placeholder="Modelo"
                          aria-label="Modelo"
                          title="Modelo"
                          aria-invalid={exigeMarcaModelo && !item.modelo.trim()}
                          onChange={(e) => mudarItem(indice, "modelo", e.target.value.slice(0, 150))}
                          className={`${celulaSolta} w-52 py-1 text-xs`}
                        />
                      </div>
                    </td>
                    <td className={td}>
                      <input
                        inputMode="decimal"
                        value={item.quantidade}
                        disabled={!editar}
                        aria-label="Quantidade"
                        aria-invalid={Boolean(erro("quantidade"))}
                        title={erro("quantidade")}
                        onChange={(e) => mudarItem(indice, "quantidade", soDecimal(e.target.value))}
                        className={`${celula} tabular-nums`}
                      />
                    </td>
                    <td className={td}>
                      <select
                        value={item.unidade}
                        disabled={!editar}
                        aria-label="Unidade"
                        onChange={(e) => mudarItem(indice, "unidade", e.target.value)}
                        className={celula}
                      >
                        {UNIDADES_DA_PROPOSTA.map((u) => (
                          <option key={u} value={u}>
                            {u} ({UNIDADE_POR_EXTENSO[u]})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      <input
                        inputMode="decimal"
                        value={item.precoUnitario}
                        disabled={!editar}
                        aria-label="Preço unitário"
                        aria-invalid={Boolean(erro("precoUnitario"))}
                        title={erro("precoUnitario")}
                        onChange={(e) => mudarItem(indice, "precoUnitario", soDecimal(e.target.value))}
                        className={`${celula} tabular-nums`}
                      />
                    </td>
                    <td className={td}>
                      <input
                        inputMode="decimal"
                        value={item.descontoPercentual}
                        disabled={!editar}
                        aria-label="Desconto em %"
                        aria-invalid={Boolean(erro("descontoPercentual"))}
                        title={erro("descontoPercentual")}
                        onChange={(e) => mudarItem(indice, "descontoPercentual", soDecimal(e.target.value))}
                        className={`${celula} tabular-nums`}
                      />
                    </td>
                    <td className={`${td} pt-4 font-medium tabular-nums`}>{moeda.format(totalDoItem(numeros))}</td>
                    <td className={td}>
                      <div className="flex items-center gap-1">
                        <select
                          value={item.prontaEntrega ? "pronta" : "dias"}
                          disabled={!editar}
                          onChange={(e) => {
                            const pronta = e.target.value === "pronta";
                            aoTrocar(
                              itens.map((it, i) =>
                                i === indice
                                  ? {
                                      ...it,
                                      prontaEntrega: pronta,
                                      prazoDiasUteis: pronta ? "" : it.prazoDiasUteis || "5",
                                    }
                                  : it,
                              ),
                            );
                          }}
                          className={celula}
                          aria-label="Prazo"
                        >
                          <option value="pronta">Pronta entrega</option>
                          <option value="dias">Dias úteis</option>
                        </select>
                        {!item.prontaEntrega && (
                          <input
                            inputMode="numeric"
                            value={item.prazoDiasUteis}
                            disabled={!editar}
                            aria-label="Dias úteis"
                            aria-invalid={Boolean(erro("prazoDiasUteis"))}
                            onChange={(e) => mudarItem(indice, "prazoDiasUteis", soDigitos(e.target.value, 4))}
                            className={`${celulaSolta} w-14 shrink-0 tabular-nums`}
                          />
                        )}
                      </div>
                    </td>
                    {veCusto && (
                      <td className={td}>
                        {/* Custo e lucro juntos (pedido do dono em 17/11/2026): o markup sai ao lado, entre parenteses. */}
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={item.custoUnitario}
                            disabled={!editar}
                            aria-label="Custo unitário"
                            onChange={(e) => mudarItem(indice, "custoUnitario", soDecimal(e.target.value))}
                            className={`${celulaSolta} w-24 tabular-nums`}
                          />
                          <span
                            className={`shrink-0 font-medium tabular-nums ${markup === null ? "text-suave" : markup < 0 ? "text-rose-600" : markup < 60 ? "text-amber-700" : "text-emerald-700"}`}
                            title="Lucro sobre o custo (markup)"
                          >
                            ({markup === null ? "—" : `${Math.round(markup)}%`})
                          </span>
                        </div>
                      </td>
                    )}
                    <td className={`${td} text-center`}>
                      <EstoqueDoItem info={estoque[item.chave]} produtoId={item.produtoId} />
                    </td>
                    {editar && (
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => remover(indice)}
                          aria-label="Remover o item"
                          title="Remover o item"
                          className="rounded p-1.5 text-suave hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SecaoDoAnuncio>
  );
}
