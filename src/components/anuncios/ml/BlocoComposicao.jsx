"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Loader, Plus, Trash2 } from "lucide-react";

import {
  buscarItemDeComposicao,
  conferirCodigoDeKit,
  sugerirCodigoKit,
} from "@/app/canais-de-venda/mercado-livre/acoes";
import { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { aplicarComposicao } from "@/lib/canaisDeVenda/ml/rascunho";

const LIMITE_DO_CODIGO = 64;

// A quantidade e inteira: o <input type="number"> aceita "e", "+" e "-" (notacao cientifica),
// e o ponto e a virgula nao fazem sentido. Mesmo bloqueio dos campos inteiros do cadastro de Produto.
function recusarSimbolos(evento) {
  if (["e", "E", "+", "-", ".", ","].includes(evento.key)) evento.preventDefault();
}

// Excecao solta dentro de uma transicao vai para o error boundary e levaria o editor inteiro,
// com tudo o que foi digitado. As acoes ja devolvem { ok: false } nas falhas do servidor; isto
// cobre a queda da conexao.
async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor. Tente de novo." };
  }
}

function Mensagens({ lista }) {
  return lista.map((item, posicao) => (
    <p key={posicao} className={`mt-1 text-[11px] ${item.bloqueante ? "text-red-700" : "text-amber-700"}`}>
      {item.problema}
    </p>
  ));
}

const BOTAO_DA_LINHA =
  "rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * Itens da composicao (kit) e o codigo do kit, dentro da aba Geral. Toda mudanca da lista
 * passa por `aplicarComposicao`, que refaz estoque, peso, fotos, descricao e codigo.
 * `anuncioId` e o anuncio aberto (ou `null`): a conferencia do codigo nao o conta contra si.
 */
export default function BlocoComposicao({ rascunho, contexto, alterar, setContexto, problemas, anuncioId }) {
  const composicao = rascunho.composicao;
  const itens = Array.isArray(composicao.itens) ? composicao.itens : [];
  const unico = itens.length === 1;

  const [codigoBusca, setCodigoBusca] = useState("");
  const [erroDaBusca, setErroDaBusca] = useState(null);
  const [avisoDoCodigo, setAvisoDoCodigo] = useState(null);
  const [buscando, iniciarBusca] = useTransition();
  const [sugerindo, iniciarSugestao] = useTransition();
  // Cada conferencia leva o numero da vez; so a ultima grava. Sem isso, a resposta de um codigo
  // que o dono ja trocou chegaria depois e acusaria o codigo novo de estar em uso.
  const conferencia = useRef(0);
  // Passar pelo campo da quantidade sem digitar nada nao muda o codigo: nao vale uma ida ao servidor.
  const quantidadeMudou = useRef(false);

  const doCampo = (campo) => problemas.filter((problema) => problema.campo === campo);

  function limparCodigoEmUso() {
    setContexto((atual) => (atual.codigoEmUso === null ? atual : { ...atual, codigoEmUso: null }));
  }

  // O resultado depende do codigo E dos itens (a mesma composicao pode repetir o codigo, outra nao),
  // entao tambem roda quando a lista muda. O servidor confere de novo no Salvar.
  function conferirCodigo(proxima) {
    const minha = ++conferencia.current;
    setAvisoDoCodigo(null);
    const codigo = String(proxima.codigo ?? "").trim();
    if (!codigo) {
      limparCodigoEmUso();
      return;
    }
    chamar(conferirCodigoDeKit, codigo, anuncioId, proxima.itens).then((resultado) => {
      if (minha !== conferencia.current) return;
      if (resultado.ok) setContexto((atual) => ({ ...atual, codigoEmUso: resultado.codigoEmUso }));
      else setAvisoDoCodigo(resultado.erro);
    });
  }

  // `fazer` recebe a composicao ATUAL, nao a deste render: a busca de um produto demora, e o dono
  // pode ter mexido no resto do rascunho nesse meio tempo (a mudanca seria desfeita).
  function aplicar(fazer, { produtos = contexto.produtos, conferir = true } = {}) {
    alterar((atual) => (atual.composicao ? aplicarComposicao(atual, fazer(atual.composicao), produtos) : atual));
    if (conferir) conferirCodigo(aplicarComposicao(rascunho, fazer(composicao), produtos).composicao);
  }

  function mudarQuantidade(posicao, valor) {
    quantidadeMudou.current = true;
    aplicar(
      (atual) => ({ ...atual, itens: atual.itens.map((item, i) => (i === posicao ? { ...item, quantidade: valor } : item)) }),
      { conferir: false },
    );
  }

  function sairDaQuantidade() {
    if (!quantidadeMudou.current) return;
    quantidadeMudou.current = false;
    conferirCodigo(composicao);
  }

  function remover(posicao) {
    aplicar((atual) => ({ ...atual, itens: atual.itens.filter((_, i) => i !== posicao) }));
  }

  function mover(posicao, passo) {
    aplicar((atual) => {
      const destino = posicao + passo;
      if (destino < 0 || destino >= atual.itens.length) return atual;
      const reordenados = [...atual.itens];
      [reordenados[posicao], reordenados[destino]] = [reordenados[destino], reordenados[posicao]];
      return { ...atual, itens: reordenados };
    });
  }

  function incluir() {
    const codigo = codigoBusca.trim();
    if (!codigo) {
      setErroDaBusca("Informe o codigo do produto.");
      return;
    }
    setErroDaBusca(null);
    iniciarBusca(async () => {
      const resultado = await chamar(buscarItemDeComposicao, codigo);
      if (!resultado.ok) {
        setErroDaBusca(resultado.erro);
        return;
      }
      const { produto } = resultado;
      if (itens.some((item) => item.produtoId === produto.id)) {
        setErroDaBusca(`O produto ${produto.sku} ja esta na composicao.`);
        return;
      }
      const produtos = { ...contexto.produtos, [produto.id]: produto };
      setContexto((atual) => ({ ...atual, produtos: { ...atual.produtos, [produto.id]: produto } }));
      // O codigo gerado (`{sku}_{N}`) so vale para um produto so: com o segundo item o kit e misto
      // e o codigo e outro, digitado. Mante-lo gravaria um kit misto com cara de kit simples.
      aplicar(
        (atual) => ({
          ...atual,
          itens: [...atual.itens, { produtoId: produto.id, quantidade: 1 }],
          codigo: atual.itens.length === 1 ? "" : atual.codigo,
        }),
        { produtos },
      );
      setCodigoBusca("");
    });
  }

  // `aplicarComposicao` ja corta os brancos das pontas do codigo, a cada tecla.
  function mudarCodigo(valor) {
    conferencia.current += 1;
    setAvisoDoCodigo(null);
    limparCodigoEmUso();
    aplicar((atual) => ({ ...atual, codigo: valor }), { conferir: false });
  }

  function sugerir() {
    setAvisoDoCodigo(null);
    iniciarSugestao(async () => {
      const resultado = await chamar(sugerirCodigoKit);
      if (!resultado.ok) {
        setAvisoDoCodigo(resultado.erro);
        return;
      }
      // A faixa 25xxxx sai livre por construcao: nao precisa de conferencia.
      conferencia.current += 1;
      limparCodigoEmUso();
      aplicar((atual) => ({ ...atual, codigo: resultado.codigo }), { conferir: false });
    });
  }

  const problemasDoCodigo = doCampo("codigoKit");
  const erroDoCodigo = problemasDoCodigo.some((problema) => problema.bloqueante);

  return (
    <div className="rounded border border-borda p-3">
      <div className="flex items-center gap-1 text-sm font-semibold">
        Composicao
        <BolhaDeAjuda variante="inline" texto="O primeiro item e o produto principal do anuncio. Subir ou descer um item muda quem e o principal." />
      </div>

      <ul className="mt-2 divide-y divide-borda rounded border border-borda">
        {itens.map((item, posicao) => {
          const produto = contexto.produtos[item.produtoId];
          return (
            <li key={item.produtoId ?? posicao} className="p-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{produto?.sku ?? "?"}</span>
                  <span className="min-w-0 truncate">{produto?.tituloBase ?? "Produto nao encontrado"}</span>
                  {posicao === 0 && <Badge tom="info">Principal</Badge>}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-suave">
                  Quantidade
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="1"
                    max="9999"
                    value={item.quantidade ?? ""}
                    onChange={(evento) => mudarQuantidade(posicao, evento.target.value)}
                    onKeyDown={recusarSimbolos}
                    onBlur={sairDaQuantidade}
                    aria-label={`Quantidade de ${produto?.sku ?? "item"}`}
                    className="w-20 rounded border border-borda bg-superficie px-2 py-1 text-right text-sm text-texto focus:border-acento focus:outline-none"
                  />
                </label>
                <div className="flex">
                  <button type="button" onClick={() => mover(posicao, -1)} disabled={posicao === 0} aria-label="Subir item" title="Subir" className={BOTAO_DA_LINHA}>
                    <ChevronUp size={16} />
                  </button>
                  <button type="button" onClick={() => mover(posicao, 1)} disabled={posicao === itens.length - 1} aria-label="Descer item" title="Descer" className={BOTAO_DA_LINHA}>
                    <ChevronDown size={16} />
                  </button>
                  <button type="button" onClick={() => remover(posicao)} aria-label="Remover item" title="Remover" className={BOTAO_DA_LINHA}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <Mensagens lista={doCampo(`item:${item.produtoId}`)} />
            </li>
          );
        })}
      </ul>
      <Mensagens lista={doCampo("composicao")} />

      <div className="mt-3">
        <label htmlFor="ml-incluir-produto" className="text-xs text-suave">
          Incluir produto
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="ml-incluir-produto"
            value={codigoBusca}
            onChange={(evento) => {
              setCodigoBusca(evento.target.value);
              setErroDaBusca(null);
            }}
            onKeyDown={(evento) => {
              if (evento.key !== "Enter") return;
              evento.preventDefault();
              if (!buscando) incluir();
            }}
            placeholder="Codigo do produto"
            className="w-56 rounded border border-borda bg-superficie px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
          />
          <button
            type="button"
            onClick={incluir}
            disabled={buscando}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50"
          >
            {buscando ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
            Incluir
          </button>
        </div>
        {erroDaBusca && <p className="mt-1 text-[11px] text-red-700">{erroDaBusca}</p>}
      </div>

      <div className="mt-4">
        <label htmlFor="ml-codigo-kit" className="flex items-center gap-1 text-sm font-semibold">
          Codigo do kit
          <BolhaDeAjuda
            variante="inline"
            texto={
              unico
                ? "Com um produto so, o codigo sai pronto: codigo do produto, sublinhado e a quantidade (920302_1.000)."
                : "Kit com produtos diferentes: o codigo e o SKU do kit no Bling. Digite o seu ou use Sugerir (faixa 25xxxx)."
            }
          />
        </label>
        <div className="flex gap-2">
          <input
            id="ml-codigo-kit"
            value={composicao.codigo ?? ""}
            readOnly={unico}
            maxLength={LIMITE_DO_CODIGO}
            placeholder={unico ? "Sai pronto quando ha produto e quantidade" : ""}
            onChange={(evento) => mudarCodigo(evento.target.value)}
            onBlur={unico ? undefined : () => conferirCodigo(composicao)}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoCodigo)} ${unico ? "bg-fundo text-suave" : ""}`}
          />
          {!unico && (
            <button
              type="button"
              onClick={sugerir}
              disabled={sugerindo}
              className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50"
            >
              {sugerindo && <Loader size={14} className="animate-spin" />}
              Sugerir
            </button>
          )}
        </div>
        <Mensagens lista={problemasDoCodigo} />
        {avisoDoCodigo && <p className="mt-1 text-[11px] text-amber-700">{avisoDoCodigo}</p>}
      </div>
    </div>
  );
}
