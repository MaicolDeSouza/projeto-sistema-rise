"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, ExternalLink, ImagePlus, Loader2, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";

import { buscarProdutosAcao, enviarFotoDoItemAcao, estoqueDosItensAcao, produtoParaPropostaAcao } from "@/app/propostas/acoes";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { UNIDADES_DA_PROPOSTA, UNIDADE_POR_EXTENSO, itensComFreteDiluido, markupDoItem, totalDoItem } from "@/lib/propostas/regras";
import { doTexto, itemDoFormulario, moeda, moedaUnitaria, paraTexto, soDecimal, soDigitos } from "./formato";

// `celulaSolta`: sem o w-full, para a caixa que tem largura propria (fator, marca, modelo, custo, dias): as duas classes
// de largura juntas brigam e a w-full vencia.
const celulaSolta =
  "rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:bg-fundo disabled:text-suave aria-[invalid=true]:border-rose-500";
const celula = `w-full ${celulaSolta}`;

/**
 * Busca de produto do Rise num campo do item (pedido do dono em 17/11/2026). Dois modos:
 * - "nome" (coluna Produto): mostra o nome do Rise e busca pelo codigo ou por palavra do nome. Item sem produto guarda o
 *   nome digitado; num item com produto, digitar sem escolher volta ao nome do Rise ao sair do campo (ou vira item sem
 *   cadastro pela ultima opcao da lista).
 * - "codigo" (coluna Codigo): mostra o codigo do Rise e busca por ele; digitar sem escolher volta ao codigo ao sair (o
 *   codigo do item e sempre o do Rise, nunca digitado).
 * Escolher troca o produto do item (foto, codigo, nome, marca, modelo, unidade, preco e custo). A lista abre por cima da
 * pagina (fixa, no <body>): dentro da tabela, que rola de lado, ela ficava cortada.
 */
function CampoDoProduto({ item, editar, focar, erro, aoEscolher, aoNomeLivre, modo = "nome" }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const [escolhendo, setEscolhendo] = useState(null);
  const vez = useRef(0);
  const campoRef = useRef(null);
  const caixaRef = useRef(null);
  const listaRef = useRef(null);
  const idDaLista = useId();
  const porCodigo = modo === "codigo";
  const atual = (porCodigo ? item.sku : item.nomeInterno) ?? "";

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

  const valor = editando ? texto : atual;
  const termo = texto.trim();
  const aberta = editando && termo.length >= 2 && achados !== null && !buscando;
  const virarAvulso = !porCodigo && Boolean(item.produtoId) && Boolean(termo) && termo !== item.nomeInterno;

  // A lista fica fixa na tela, colada embaixo do campo, e acompanha a rolagem (a mesma conta da BolhaDeAjuda).
  useLayoutEffect(() => {
    if (!aberta) return undefined;
    function posicionar() {
      const lista = listaRef.current;
      const ancora = caixaRef.current;
      if (!lista || !ancora) return;
      const alvo = ancora.getBoundingClientRect();
      const largura = Math.max(alvo.width, 448);
      const esquerda = Math.min(alvo.left, document.documentElement.clientWidth - largura - 8);
      Object.assign(lista.style, { left: `${Math.max(8, esquerda)}px`, top: `${alvo.bottom + 4}px`, width: `${largura}px`, visibility: "visible" });
    }
    posicionar();
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberta, achados]);

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
    if (!porCodigo && !item.produtoId) aoNomeLivre(novo, false);
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

  const semAchado = porCodigo
    ? "Nenhum produto no Rise com esse código."
    : item.produtoId
      ? "Nenhum produto no Rise com esse texto."
      : "Nenhum produto no Rise: o nome digitado fica como item sem cadastro.";

  return (
    <div ref={caixaRef} className="relative">
      {!porCodigo && <Search size={14} className="pointer-events-none absolute top-2.5 left-2.5 text-suave" />}
      <textarea
        ref={campoRef}
        rows={1}
        autoFocus={focar}
        value={valor}
        disabled={!editar}
        placeholder={porCodigo ? "Código" : "Buscar no Rise pelo código ou nome"}
        aria-label={porCodigo ? "Código" : "Produto"}
        title={erro ?? (porCodigo ? "Digite o código do Rise para trocar o produto" : undefined)}
        role="combobox"
        aria-expanded={aberta}
        aria-controls={idDaLista}
        aria-autocomplete="list"
        aria-invalid={Boolean(erro)}
        onFocus={() => {
          setTexto(atual);
          setEditando(true);
        }}
        onBlur={fechar}
        onChange={(e) => digitar(e.target.value.replace(/[\r\n]+/g, " ").slice(0, porCodigo ? 60 : 300))}
        onKeyDown={tecla}
        className={`${celula} field-sizing-content min-h-9 resize-none ${porCodigo ? "font-mono text-xs" : "pl-7 font-medium"}`}
      />
      {buscando && <Loader2 size={14} className="absolute top-2.5 right-2.5 animate-spin text-suave" />}
      {aberta &&
        createPortal(
          <ul
            ref={listaRef}
            id={idDaLista}
            role="listbox"
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
            className="z-50 max-h-80 overflow-y-auto rounded-md border border-borda bg-superficie py-1 shadow-lg"
          >
            {achados.length === 0 && <li className="px-3 py-2 text-sm text-suave">{semAchado}</li>}
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
          </ul>,
          document.body,
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
  // Caixas empilhadas, o icone de estoque do Bling (pedido do dono em 17/11/2026); a cor diz se atende.
  return (
    <BolhaDeAjuda variante="inline-direita" texto={texto}>
      <Boxes size={18} aria-label={info.atende ? "Estoque atende" : "Falta estoque"} className={info.atende ? "text-emerald-600" : "text-rose-600"} />
    </BolhaDeAjuda>
  );
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
export default function ItensDaProposta({ numero, itens, editar, veCusto, erros, aoTrocar, aoErro, exigeMarcaModelo = false, freteNosProdutos = 0 }) {
  // Frete diluido (pedido do dono em 17/11/2026, "ao clicar em diluir nao alterou o valor dos produtos"): a tela mostra o
  // preco e o total de cada item COM a parte do frete (a mesma conta do PDF); o preco digitado continua sem o frete, para
  // o frete nao somar duas vezes e acompanhar quando o valor dele muda.
  const precosComFrete =
    freteNosProdutos > 0
      ? itensComFreteDiluido(
          itens.map((i) => ({ quantidade: doTexto(i.quantidade) ?? 0, precoUnitario: doTexto(i.precoUnitario) ?? 0, descontoPercentual: doTexto(i.descontoPercentual) ?? 0 })),
          freteNosProdutos,
        ).map((i) => i.precoUnitario)
      : null;
  const [obsAberta, setObsAberta] = useState(null);
  const [descricaoAberta, setDescricaoAberta] = useState(null);
  const [linkAberto, setLinkAberto] = useState(null);
  const [precoEmEdicao, setPrecoEmEdicao] = useState(null);
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
  // Prazo de TODOS os itens (pedido do dono em 17/11/2026, "igual foi feito na secao de compras"): a linha "Todos os
  // itens" em cima da coluna Prazo; mudar vale na hora para todas as linhas, que continuam editaveis uma a uma. Mostra o
  // prazo comum quando todos sao iguais; senao, "Vários".
  const prazoComum =
    itens.length > 0 && itens.every((it) => it.prontaEntrega === itens[0].prontaEntrega && (it.prontaEntrega || it.prazoDiasUteis === itens[0].prazoDiasUteis))
      ? { pronta: itens[0].prontaEntrega, dias: itens[0].prazoDiasUteis }
      : null;
  const prazoParaTodos = (pronta, dias) => aoTrocar(itens.map((it) => ({ ...it, prontaEntrega: pronta, prazoDiasUteis: pronta ? "" : dias })));

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

  // px-2 (era px-3): com a coluna Marca / Modelo (17/11/2026) o espaco ficou curto e cada coluna devolve 8 px ao Produto.
  const th = "border-l border-borda px-2 py-2 text-left font-medium first:border-l-0";
  const td = "border-l border-borda px-2 py-2.5 first:border-l-0";

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
        <div className="-m-4">
          {/* Sem rolagem lateral (pedido do dono em 17/11/2026): table-fixed, as colunas com largura fixa e o Produto com o resto. */}
          <table className="w-full table-fixed border-collapse text-sm">
            {/* As larguras moram no colgroup: com table-fixed o navegador mede pela PRIMEIRA linha, e a "Todos os itens"
                (colSpan) vinha antes e espremia o Produto. */}
            <colgroup>
              <col className="w-14" />
              <col />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-[76px]" />
              <col className="w-26" />
              <col className="w-[72px]" />
              <col className="w-26" />
              <col className="w-42" />
              {veCusto && <col className="w-26" />}
              <col className="w-11" />
            </colgroup>
            <thead className="bg-fundo/70 text-xs text-suave">
              {editar && itens.length > 1 && (
                <tr className="border-b border-borda">
                  <th colSpan={8} className="px-2 py-1.5 text-right font-medium">
                    Todos os itens
                  </th>
                  <th className="border-l border-borda px-2 py-1.5 font-normal">
                    <div className="flex items-center gap-1">
                      <select
                        value={prazoComum ? (prazoComum.pronta ? "pronta" : "dias") : ""}
                        onChange={(e) => prazoParaTodos(e.target.value === "pronta", e.target.value === "dias" ? prazoComum?.dias || "5" : "")}
                        aria-label="Prazo de todos os itens"
                        title="Prazo de entrega para todos os itens"
                        className={`${celula} text-sm text-texto`}
                      >
                        {!prazoComum && <option value="">Vários</option>}
                        <option value="pronta">Pronta entrega</option>
                        <option value="dias">Dias úteis</option>
                      </select>
                      {prazoComum && !prazoComum.pronta && (
                        <input
                          inputMode="numeric"
                          value={prazoComum.dias}
                          onChange={(e) => prazoParaTodos(false, soDigitos(e.target.value, 4))}
                          aria-label="Dias úteis de todos os itens"
                          className={`${celulaSolta} w-14 shrink-0 text-sm text-texto tabular-nums`}
                        />
                      )}
                    </div>
                  </th>
                  <th colSpan={veCusto ? 2 : 1} className="border-l border-borda" />
                </tr>
              )}
              <tr className="border-b border-borda">
                <th className={`${th} w-14`}>
                  <span className="sr-only">Foto</span>
                </th>
                <th className={th}>Produto</th>
                <th className={`${th} w-24`}>Código</th>
                <th className={`${th} w-20`}>Qtd.</th>
                <th className={`${th} w-[76px]`}>Un.</th>
                <th className={`${th} w-26 whitespace-nowrap`}>Preço</th>
                <th className={`${th} w-[72px] whitespace-nowrap`}>Desc. %</th>
                <th className={`${th} w-26`}>Total</th>
                <th className={`${th} w-42`}>Prazo</th>
                {veCusto && <th className={`${th} w-26`}>Lucro</th>}
                <th className={`${th} w-11`}>
                  <span className="sr-only">Estoque e excluir</span>
                </th>
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
                const comFrete = Boolean(precosComFrete) && precosComFrete[indice] !== numeros.precoUnitario;
                // Lucro em R$ da linha: o total (sem o frete) menos o custo x quantidade; sem custo, nao ha lucro.
                const lucro = numeros.custoUnitario === null ? null : Math.round((totalDoItem(numeros) - numeros.custoUnitario * numeros.quantidade) * 100) / 100;
                const fator = fatorDe(item);
                const verDescricao = Boolean(item.descricaoCliente) || descricaoAberta === item.chave;
                const verObs = Boolean(item.observacao) || obsAberta === item.chave;
                const verLink = Boolean(item.linkDeCompra) || linkAberto === item.chave;
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
                      {/* Cada campo aberto tem o nome em cima e os botoes "+" ficam embaixo dos campos (pedido do dono em 17/11/2026). */}
                      {(verDescricao || verFator) && (
                        <div className="mt-2 flex items-start gap-2">
                          {verDescricao && (
                            <label className="block min-w-0 flex-1">
                              {/* Uma linha so (pedido do dono em 17/11/2026): assim a caixa fica na altura da do Fator. */}
                              <span className="mb-0.5 block truncate text-[11px] font-medium text-suave" title="Sai no PDF no lugar do nome do Rise">
                                Descrição do cliente <span className="font-normal">(sai no PDF)</span>
                              </span>
                              <textarea
                                rows={1}
                                autoFocus={descricaoAberta === item.chave}
                                value={item.descricaoCliente}
                                disabled={!editar}
                                placeholder="Como o cliente descreveu o item"
                                aria-label="Descrição do cliente"
                                onChange={(e) => mudarItem(indice, "descricaoCliente", e.target.value)}
                                onBlur={() => setDescricaoAberta(null)}
                                className={`${celula} field-sizing-content min-h-8 resize-none border-sky-200 bg-sky-50/60 text-xs`}
                              />
                            </label>
                          )}
                          {verFator && (
                            <label
                              className="block shrink-0"
                              title="Quantas unidades do produto do Rise formam 1 unidade do cliente (kit de 10 = fator 10). Preço e custo da linha são do kit."
                            >
                              <span className="mb-0.5 block text-[11px] font-medium text-suave">Fator</span>
                              <span className="flex items-center gap-1.5 text-xs text-suave">
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
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                      {verObs && (
                        <label className="mt-2 block">
                          <span className="mb-0.5 block text-[11px] font-medium text-suave">
                            Observação <span className="font-normal">(sai no PDF)</span>
                          </span>
                          <textarea
                            rows={1}
                            autoFocus={obsAberta === item.chave}
                            value={item.observacao}
                            disabled={!editar}
                            placeholder="Observação do item"
                            onChange={(e) => mudarItem(indice, "observacao", e.target.value)}
                            onBlur={() => setObsAberta(null)}
                            className={`${celula} field-sizing-content min-h-8 resize-none bg-amber-50/60 text-xs italic`}
                          />
                        </label>
                      )}
                      {verLink && (
                        // Link de compra (pedido do dono em 17/11/2026): digitado a mao, so no Rise; o icone abre numa aba nova.
                        <div className="mt-2">
                          <label htmlFor={`link-${item.chave}`} className="mb-0.5 block text-[11px] font-medium text-suave">
                            Link de compra <span className="font-normal">(só no Rise)</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              id={`link-${item.chave}`}
                              type="url"
                              autoFocus={linkAberto === item.chave}
                              value={item.linkDeCompra}
                              disabled={!editar}
                              placeholder="https://..."
                              aria-invalid={Boolean(erro("linkDeCompra"))}
                              title={erro("linkDeCompra")}
                              onChange={(e) => mudarItem(indice, "linkDeCompra", e.target.value.trim().slice(0, 1000))}
                              onBlur={() => setLinkAberto(null)}
                              className={`${celula} py-1 text-xs`}
                            />
                            {/^https?:\/\//i.test(item.linkDeCompra ?? "") && (
                              <a
                                href={item.linkDeCompra}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Abrir o link de compra"
                                title="Abrir o link de compra"
                                className="shrink-0 rounded p-1.5 text-suave hover:bg-fundo hover:text-acento"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-suave">
                        {!item.produtoId && <span>Sem cadastro no Rise</span>}
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
                        {editar && !verLink && (
                          <button
                            type="button"
                            onClick={() => setLinkAberto(item.chave)}
                            className="font-medium text-acento hover:underline"
                            title="Onde comprar este item (só no Rise, não sai no PDF)"
                          >
                            + Link de compra
                          </button>
                        )}
                      </p>
                      {/* A coluna Marca / Modelo saiu (pedido do dono em 17/11/2026); marca e modelo vem do Rise sozinhos. So o
                          padrao que exige (SENAI) mostra os dois campos aqui, porque sem eles o PDF fica travado. */}
                      {exigeMarcaModelo && (
                        <div className="mt-1.5 flex gap-2">
                          <input
                            value={item.marca}
                            disabled={!editar}
                            placeholder="Marca"
                            aria-label="Marca"
                            aria-invalid={!item.marca.trim()}
                            onChange={(e) => mudarItem(indice, "marca", e.target.value.slice(0, 100))}
                            className={`${celula} py-1 text-xs`}
                          />
                          <input
                            value={item.modelo}
                            disabled={!editar}
                            placeholder="Modelo"
                            aria-label="Modelo"
                            aria-invalid={!item.modelo.trim()}
                            onChange={(e) => mudarItem(indice, "modelo", e.target.value.slice(0, 150))}
                            className={`${celula} py-1 text-xs`}
                          />
                        </div>
                      )}
                    </td>
                    <td className={td}>
                      {/* Coluna Codigo (pedido do dono em 17/11/2026): sempre o codigo do Rise, e digitar busca por ele. */}
                      <CampoDoProduto
                        item={item}
                        editar={editar}
                        modo="codigo"
                        aoEscolher={(produtoId) => escolherProduto(indice, produtoId)}
                        aoNomeLivre={(texto, desligar) => nomeLivre(indice, texto, desligar)}
                      />
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
                      {/* So a sigla; o significado aparece no mouse (pedido do dono em 17/11/2026). */}
                      <select
                        value={item.unidade}
                        disabled={!editar}
                        aria-label="Unidade"
                        title={`${item.unidade} = ${UNIDADE_POR_EXTENSO[item.unidade] ?? item.unidade}`}
                        onChange={(e) => mudarItem(indice, "unidade", e.target.value)}
                        className={celula}
                      >
                        {UNIDADES_DA_PROPOSTA.map((u) => (
                          <option key={u} value={u} title={UNIDADE_POR_EXTENSO[u]}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      {/* Coluna "Preco" (pedido do dono em 17/11/2026): com o frete diluido o campo MOSTRA o preco com frete (o do
                          PDF) e diz embaixo; ao clicar para editar, mostra e grava o preco sem o frete, e volta ao sair. */}
                      <input
                        inputMode="decimal"
                        value={comFrete && precoEmEdicao !== item.chave ? paraTexto(precosComFrete[indice], 2) : item.precoUnitario}
                        disabled={!editar}
                        aria-label="Preço"
                        aria-invalid={Boolean(erro("precoUnitario"))}
                        title={erro("precoUnitario") ?? (comFrete ? `Sem o frete: ${moedaUnitaria.format(numeros.precoUnitario)}. Clique para editar o preço sem o frete.` : undefined)}
                        onFocus={() => setPrecoEmEdicao(item.chave)}
                        onBlur={() => setPrecoEmEdicao(null)}
                        onChange={(e) => mudarItem(indice, "precoUnitario", soDecimal(e.target.value))}
                        className={`${celula} tabular-nums ${comFrete && precoEmEdicao !== item.chave ? "border-emerald-300 bg-emerald-50/60" : ""}`}
                      />
                      {comFrete && (
                        <p className="mt-1 text-xs whitespace-nowrap text-emerald-700">{precoEmEdicao === item.chave ? "preço sem o frete" : "com frete diluído"}</p>
                      )}
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
                    <td className={`${td} pt-4 font-medium tabular-nums`} title={precosComFrete ? "Total com o frete diluído" : undefined}>
                      {moeda.format(totalDoItem(precosComFrete ? { ...numeros, precoUnitario: precosComFrete[indice] } : numeros))}
                    </td>
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
                      // Lucro so de leitura, com a % embaixo (pedido do dono em 17/11/2026); o custo vem do Rise e aparece no mouse.
                      // O item SEM cadastro no Rise nao tem de onde tirar o custo: ali o custo se digita (17/11/2026, senao o
                      // lucro dele e o da proposta inteira ficavam em branco).
                      <td className={`${td} tabular-nums ${item.produtoId || !editar ? "pt-3" : ""}`} title={numeros.custoUnitario !== null ? `Custo: ${moedaUnitaria.format(numeros.custoUnitario)} cada` : "Sem custo"}>
                        {!item.produtoId && editar && (
                          <label className="mb-1 block">
                            <span className="sr-only">Custo unitário</span>
                            <input
                              inputMode="decimal"
                              value={item.custoUnitario}
                              placeholder="Custo"
                              aria-label="Custo unitário"
                              onChange={(e) => mudarItem(indice, "custoUnitario", soDecimal(e.target.value))}
                              className={`${celula} py-1 text-xs tabular-nums`}
                            />
                          </label>
                        )}
                        <p className={`font-medium ${lucro === null ? "text-suave" : lucro < 0 ? "text-rose-600" : "text-texto"}`}>{lucro === null ? "—" : moeda.format(lucro)}</p>
                        {markup !== null && (
                          <p className={`text-xs ${markup < 0 ? "text-rose-600" : markup < 60 ? "text-amber-700" : "text-emerald-700"}`}>{Math.round(markup)}%</p>
                        )}
                      </td>
                    )}
                    {/* Estoque e excluir no fim da linha, um embaixo do outro (pedido do dono em 17/11/2026). */}
                    <td className={`${td} px-1`}>
                      <div className="flex flex-col items-center gap-2 pt-2">
                        <EstoqueDoItem info={estoque[item.chave]} produtoId={item.produtoId} />
                        {editar && (
                          <button
                            type="button"
                            onClick={() => remover(indice)}
                            aria-label="Remover o item"
                            title="Remover o item"
                            className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
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
