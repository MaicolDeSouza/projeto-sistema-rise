"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Loader, Plus, Trash2, X } from "lucide-react";

import {
  abrirAnuncioML,
  abrirNovoAnuncioML,
  anunciosDoSkuMLAcao,
  clonarAnuncioML,
  criarVarianteMLAcao,
  listarAnunciosDoProdutoML,
  reaproveitarAnuncioMLAcao,
} from "@/app/canais-de-venda/mercado-livre/acoes";
import { NOME_DA_VARIANTE } from "@/lib/canaisDeVenda/ml/faixas";
import BotaoNaoAnunciar from "@/components/anuncios/BotaoNaoAnunciar";
import Badge from "@/components/ui/Badge";
import { ROTULO_DO_TIPO_ML, seloDoAnuncioML } from "@/lib/canaisDeVenda/ml/rotulos";
import EditorAnuncioML from "./EditorAnuncioML";
import JanelaExcluirAnuncioML from "./JanelaExcluirAnuncioML";
import JanelaReaproveitarML from "./JanelaReaproveitarML";

/**
 * Pop-up aberto pelo icone do Mercado Livre na lista de Produtos. Mostra os anuncios ML do
 * produto e abre o editor (`modo="janela"`) sobre eles. Cada abertura monta a janela do zero:
 * quem a monta so a desmonta ao fechar, e o estado nasce de uma consulta nova ao banco.
 *
 * Fases: `carregando` (consulta em andamento), `naoConferido` (so o aviso), `lista`, `editor` e
 * `erro` (a lista nem carregou). Produto sem anuncio pula a lista e abre direto um anuncio novo.
 *
 * O editor desenha a propria janela (overlay, X, Esc e o aviso "Sair sem salvar?"); aqui fica so
 * o que e da lista. Esc e X, na lista ou no editor, fecham a janela inteira. Depois de salvar,
 * a janela volta a lista do produto, que e recarregada. O `key` do editor muda a cada abertura:
 * o estado dele nasce das props, e sem isso o anuncio anterior vazaria para o seguinte.
 *
 * Nenhuma escrita no Mercado Livre nem no Bling: as acoes gravam so no banco local, e a lista de
 * Produtos atras e atualizada pela revalidacao que elas mesmas fazem.
 */

// A acao ja devolve `{ ok: false }` para o que da errado no servidor; isto cobre a rede caindo.
async function chamar(acao, argumento) {
  try {
    return await acao(argumento);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

function Moldura({ produto, aoFechar, rodape = null, larga = false, children }) {
  const secao = useRef(null);
  // O foco vai para dentro da janela ao abrir (senao fica no icone, atras do fundo escuro e
  // fora do alcance de quem usa o teclado). Sem prender o foco: so a entrada.
  useEffect(() => {
    secao.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section
        ref={secao}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Anúncios do Mercado Livre"
        className={`flex max-h-full w-full flex-col rounded-lg border border-borda bg-superficie shadow-2xl focus:outline-none ${
          // A lista Reaproveitar tem 7 colunas: em 2xl (e ainda em 4xl) o botao Reaproveitar ficava escondido atras da rolagem horizontal
          // (visto na tela em 08/11/2026), e o operador precisa ver a acao principal sem rolar.
          larga ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anúncios do Mercado Livre</p>
            {produto && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
              </p>
            )}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {rodape && <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-borda px-5 py-3">{rodape}</footer>}
      </section>
    </div>
  );
}

const CLASSE_DO_AVISO = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

// `naoAnunciar` (27/10/2026): a marca "Não anunciar no ML" do produto, vinda da lista; ausente (sem permissao de editar o
// cadastro), o botao do rodape nao aparece.
export default function JanelaAnuncioML({ produtoId, aoFechar, naoAnunciar }) {
  const [marcado, setMarcado] = useState(Boolean(naoAnunciar));
  const [fase, setFase] = useState("carregando");
  const [produto, setProduto] = useState(null);
  // Os acessos do editor (Acessos): sem editar nao ha anuncio novo, e o editor abre so para leitura.
  const [acessos, setAcessos] = useState(null);
  const [anuncios, setAnuncios] = useState([]);
  // As variantes pelas faixas (08/11/2026): `{ esperadas, existentes, faltam }` do produto, lidas com a lista.
  const [variantes, setVariantes] = useState(null);
  const [editor, setEditor] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [erro, setErro] = useState(null);
  // O anuncio da lista com a pergunta de excluir aberta (28/10/2026).
  const [paraExcluir, setParaExcluir] = useState(null);
  // Os anuncios do SKU que a conta do ML ja tem e o Rise nao (08/11/2026): `{ sku, candidatos }` na fase "reaproveitar";
  // `ocupado` e o MLB sendo reaproveitado.
  const [candidatos, setCandidatos] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const abertura = useRef(0);
  // A nota ("Anuncio salvo.") que a proxima carga da lista mostra; guardada para o "Tentar de novo".
  const notaDaLista = useRef(null);
  // As respostas chegam depois de um await: se a janela foi fechada nesse meio tempo, nada a fazer.
  const montada = useRef(false);

  const carregarLista = useCallback(
    async (nota) => {
      notaDaLista.current = nota ?? null;
      const resultado = await chamar(listarAnunciosDoProdutoML, produtoId);
      if (!montada.current) return null;
      if (!resultado.ok) {
        // O Salvar ja deu certo: a falha e so de recarregar a lista, e o texto nao pode sugerir o contrario.
        setErro(nota?.tipo === "ok" ? `${nota.texto} Não foi possível recarregar a lista: ${resultado.erro}` : resultado.erro);
        setFase("erro");
        return null;
      }
      setProduto(resultado.produto);
      setAcessos(resultado.acessos ?? null);
      setAnuncios(resultado.anuncios);
      setVariantes(resultado.variantes ?? null);
      setAviso(nota ?? null);
      setFase(resultado.produto.conferido ? "lista" : "naoConferido");
      return resultado;
    },
    [produtoId],
  );

  // O editor de um anuncio novo, do zero (o caminho de sempre). `avisoInicial`: a conta nao pode ser lida, e o editor diz.
  const abrirEditorNovo = useCallback(async (avisoInicial = null) => {
    setFase("carregando");
    const resultado = await chamar(abrirNovoAnuncioML, produtoId);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `novo-${abertura.current}`,
      anuncioId: null,
      status: undefined,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
      acessos: resultado.acessos,
      avisoInicial,
    });
    setFase("editor");
  }, [produtoId]);

  // "Novo anuncio" (definicao 4 do dono em 08/11/2026): produto sem anuncio do ML no Rise consulta a conta antes; com anuncio
  // antigo do SKU la, a lista "Reaproveitar" aparece no lugar do editor. Com anuncio no Rise, ou sem nada na conta, o editor
  // abre direto. A conta que nao responde nao barra o anuncio novo: o editor abre com o aviso.
  const abrirNovo = useCallback(async () => {
    if (anuncios.length > 0) return abrirEditorNovo();
    setFase("carregando");
    const resultado = await chamar(anunciosDoSkuMLAcao, produtoId);
    if (!montada.current) return;
    if (!resultado.ok) return abrirEditorNovo(`Não foi possível ler os anúncios da conta do Mercado Livre: ${resultado.erro}`);
    if ((resultado.candidatos?.length ?? 0) === 0) return abrirEditorNovo();
    setCandidatos({ sku: resultado.sku, candidatos: resultado.candidatos });
    setFase("reaproveitar");
  }, [anuncios.length, produtoId, abrirEditorNovo]);

  // Clonar (22/10/2026): um anuncio novo igual ao escolhido, do mesmo produto; nada e gravado ate o Salvar.
  const abrirClone = useCallback(async (id) => {
    setFase("carregando");
    const resultado = await chamar(clonarAnuncioML, id);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `clone-${id}-${abertura.current}`,
      anuncioId: null,
      status: undefined,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
      acessos: resultado.acessos,
      origem: resultado.origem,
    });
    setFase("editor");
  }, []);

  // Criar a variante que falta (08/11/2026): o clone do anuncio existente com o tipo e o frete da variante e o preco pelo
  // lucro da loja, aberto como o Clonar; nada e gravado ate o Salvar. O aviso (sem categoria, sem custo) vai para a lista.
  const criarVariante = useCallback(async (id, variante) => {
    setFase("carregando");
    const resultado = await chamar((argumentos) => criarVarianteMLAcao(...argumentos), [id, variante]);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `variante-${id}-${variante}-${abertura.current}`,
      anuncioId: null,
      status: undefined,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
      acessos: resultado.acessos,
      origem: resultado.origem,
      avisoInicial: resultado.aviso ?? null,
    });
    setFase("editor");
  }, []);

  const abrirExistente = useCallback(async (id) => {
    setFase("carregando");
    const resultado = await chamar(abrirAnuncioML, id);
    if (!montada.current) return;
    if (!resultado.ok) {
      setAviso({ tipo: "erro", texto: resultado.erro });
      setFase("lista");
      return;
    }
    abertura.current += 1;
    setEditor({
      chave: `${resultado.anuncioId}-${abertura.current}`,
      anuncioId: resultado.anuncioId,
      status: resultado.status,
      rascunho: resultado.rascunho,
      contexto: resultado.contexto,
      acessos: resultado.acessos,
      publicacaoInicial: { publicacao: resultado.publicacao, idExterno: resultado.idExterno, urlExterna: resultado.urlExterna, mudancas: resultado.mudancas },
    });
    setFase("editor");
  }, []);

  // Reaproveitar (08/11/2026): o anuncio da conta vira anuncio PUBLICADO do produto no Rise e abre no editor, com o "!" do que
  // o produto tem a mandar. Nada e escrito no ML nem no Bling aqui.
  const reaproveitar = useCallback(
    async (itemId) => {
      setOcupado(itemId);
      const resultado = await chamar((argumentos) => reaproveitarAnuncioMLAcao(...argumentos), [produtoId, itemId]);
      if (!montada.current) return;
      setOcupado(null);
      if (!resultado.ok) {
        setAviso({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setCandidatos(null);
      await abrirExistente(resultado.anuncioId);
    },
    [produtoId, abrirExistente],
  );

  const iniciar = useCallback(
    async (nota) => {
      const lista = await carregarLista(nota);
      // Produto Conferido sem nenhum anuncio: nao ha o que listar, abre direto o editor de um novo. Com UM anuncio, abre
      // direto o editor dele (pedido do dono em 24/10/2026); a lista so aparece com dois ou mais (Classico e Premium).
      if (lista?.produto.conferido && lista.anuncios.length === 0 && lista.acessos?.editar !== false) await abrirNovo();
      else if (lista?.produto.conferido && lista.anuncios.length === 1) await abrirExistente(lista.anuncios[0].id);
    },
    [carregarLista, abrirNovo, abrirExistente],
  );

  useEffect(() => {
    montada.current = true;
    (async () => {
      await iniciar();
    })();
    return () => {
      montada.current = false;
    };
  }, [iniciar]);

  // O editor ouve o proprio Esc (e tem o aviso de alteracao nao salva): aqui so as outras fases.
  useEffect(() => {
    if (fase === "editor") return undefined;
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fase, aoFechar]);

  // Depois do Salvar: com um anuncio so, reabre o editor dele; com dois ou mais, volta a lista com o recado.
  function aoSalvar() {
    setFase("carregando");
    iniciar({ tipo: "ok", texto: "Anúncio salvo." });
  }

  // Depois de excluir ou encerrar: a lista do produto e recarregada com o recado (sem anuncio, abre um novo, como sempre).
  function aoExcluido(resultado) {
    setParaExcluir(null);
    setFase("carregando");
    carregarLista({ tipo: "ok", texto: resultado?.destino === "encerrar" ? "Anúncio encerrado no Mercado Livre." : "Anúncio excluído." });
  }

  function tentarDeNovo() {
    setFase("carregando");
    iniciar(notaDaLista.current);
  }

  const botaoNaoAnunciar =
    naoAnunciar === undefined ? null : <BotaoNaoAnunciar produtoId={produtoId} canal="MERCADO_LIVRE" marcado={marcado} aoMudar={setMarcado} />;

  if (fase === "editor" && editor) {
    return (
      <EditorAnuncioML
        extraNoRodape={botaoNaoAnunciar}
        key={editor.chave}
        anuncioId={editor.anuncioId}
        rascunhoInicial={editor.rascunho}
        contextoInicial={editor.contexto}
        status={editor.status}
        publicacaoInicial={editor.publicacaoInicial ?? null}
        acessos={editor.acessos}
        origem={editor.origem ?? null}
        mensagemInicial={editor.avisoInicial ? { tipo: "aviso", texto: editor.avisoInicial } : null}
        modo="janela"
        aoSalvar={aoSalvar}
        aoFechar={aoFechar}
        aoClonar={abrirClone}
        aoExcluido={aoExcluido}
      />
    );
  }

  // O anuncio de onde a variante que falta e clonada: o do proprio produto (nao o kit) e nao encerrado, senao o primeiro.
  const origemDaVariante = anuncios.find((anuncio) => anuncio.codigo === anuncio.sku && anuncio.situacaoCanal !== "ENCERRADA") ?? anuncios[0] ?? null;

  return (
    <Moldura produto={produto} aoFechar={aoFechar} larga={fase === "reaproveitar"} rodape={fase === "lista" || fase === "naoConferido" ? botaoNaoAnunciar : null}>
      {fase === "carregando" && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-suave" role="status">
          <Loader size={16} className="animate-spin" />
          Carregando...
        </p>
      )}

      {fase === "erro" && (
        <div className="space-y-3">
          <p role="alert" className={`rounded border px-3 py-2 text-sm ${CLASSE_DO_AVISO.erro}`}>
            {erro}
          </p>
          <button
            type="button"
            onClick={tentarDeNovo}
            className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {fase === "naoConferido" && (
        <div className="space-y-3 text-sm">
          <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Este produto ainda não foi Conferido. Só produto Conferido vira anúncio.
          </p>
          <Link href={`/produtos/${produto.id}`} className="inline-block text-acento hover:underline">
            Abrir o cadastro do produto
          </Link>
        </div>
      )}

      {fase === "reaproveitar" && candidatos && (
        <div className="space-y-3">
          {aviso?.tipo === "erro" && (
            <p role="alert" className={`rounded border px-3 py-2 text-sm ${CLASSE_DO_AVISO.erro}`}>
              {aviso.texto}
            </p>
          )}
          <JanelaReaproveitarML sku={candidatos.sku} candidatos={candidatos.candidatos} ocupado={ocupado} aoReaproveitar={reaproveitar} aoCriarNovo={() => abrirEditorNovo()} />
        </div>
      )}

      {fase === "lista" && (
        <div className="space-y-3">
          {aviso && (
            <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${CLASSE_DO_AVISO[aviso.tipo]}`}>
              {aviso.texto}
            </p>
          )}

          {anuncios.length === 0 ? (
            <p className="py-4 text-center text-sm text-suave">Este produto ainda não tem anúncio no Mercado Livre.</p>
          ) : (
            <ul className="divide-y divide-borda rounded border border-borda">
              {anuncios.map((anuncio) => {
                const situacao = seloDoAnuncioML(anuncio);
                return (
                  <li key={anuncio.id} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => abrirExistente(anuncio.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-fundo"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {anuncio.titulo || <span className="text-suave italic">Sem título</span>}
                        </span>
                        <span className="block truncate font-mono text-xs text-suave">{anuncio.codigo}</span>
                      </span>
                      <span className="shrink-0 text-xs text-suave">{ROTULO_DO_TIPO_ML[anuncio.tipoAnuncio] ?? "-"}</span>
                      <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
                    </button>
                    {acessos?.editar !== false && (
                      <button
                        type="button"
                        onClick={() => abrirClone(anuncio.id)}
                        title="Clonar anúncio: abre um anúncio novo igual a este, do mesmo produto"
                        aria-label={`Clonar o anúncio ${anuncio.codigo}`}
                        className="shrink-0 px-3 text-suave hover:bg-fundo hover:text-acento"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                    {acessos?.editar !== false && (
                      <button
                        type="button"
                        onClick={() => setParaExcluir(anuncio.id)}
                        title="Excluir anúncio: sem vendas sai do ML, do Bling e do Rise; com vendas, é encerrado"
                        aria-label={`Excluir o anúncio ${anuncio.codigo}`}
                        className="shrink-0 px-3 text-suave hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* As variantes que faltam pelas faixas (08/11/2026): com um anuncio do produto, "Criar" abre o clone dele na variante,
              com o preco pelo lucro da loja. Sem anuncio, o "Novo anúncio" ja cobre. Nada e gravado ate o Salvar. */}
          {acessos?.editar !== false && origemDaVariante && (variantes?.faltam?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave">
              <span>Faltam:</span>
              {variantes.faltam.map((variante) => (
                <span key={variante} className="inline-flex items-center gap-1.5">
                  {NOME_DA_VARIANTE[variante] ?? variante}
                  <button
                    type="button"
                    onClick={() => criarVariante(origemDaVariante.id, variante)}
                    title={`Cria o anúncio ${NOME_DA_VARIANTE[variante] ?? variante} a partir de ${origemDaVariante.codigo}, com o preço pelo lucro da loja`}
                    className="rounded border border-borda px-2 py-0.5 text-acento transition-[background-color,transform] duration-150 ease-out hover:bg-fundo active:scale-[0.98]"
                  >
                    Criar
                  </button>
                </span>
              ))}
            </div>
          )}

          {acessos?.editar !== false && (
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={14} />
            Novo anúncio
          </button>
          )}
        </div>
      )}
      {paraExcluir && <JanelaExcluirAnuncioML anuncioId={paraExcluir} aoFechar={() => setParaExcluir(null)} aoConcluir={aoExcluido} />}
    </Moldura>
  );
}
