"use client";

import { useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import {
  consultarSituacaoConcorrentes,
  listarConcorrentesCadastrados,
  removerConcorrenteDoProduto,
  salvarConcorrenteDoProduto,
} from "@/app/produtos/acoes";
import BuscaColetadoPorCodigo from "./BuscaColetadoPorCodigo";
import CadastroRapidoConcorrente from "./CadastroRapidoConcorrente";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const percentual = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const VAZIO = { fonte: "", nome: "", codigo: "", preco: "", url: "", produtoColetadoId: null };

/** Mesma regra de src/app/produtos/acoes.js: so http/https vira link. */
function ehUrlSegura(valor) {
  if (!valor) return true;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

function validar(dados) {
  const erros = {};
  if (!dados.fonte.trim()) erros.fonte = "Informe o concorrente.";
  if (
    dados.preco !== "" &&
    (Number.isNaN(Number(dados.preco)) || Number(dados.preco) < 0)
  ) {
    erros.preco = "Informe um numero valido.";
  }
  if (dados.url && !ehUrlSegura(dados.url)) {
    erros.url = "Informe um endereco http ou https.";
  }
  return erros;
}

/**
 * Do mais barato para o mais caro, pedido do dono em 18/09/2026: e o que
 * importa para comparar preco. Sem preco fica por ultimo.
 */
function porPrecoAscendente(a, b) {
  if (a.preco == null && b.preco == null) return 0;
  if (a.preco == null) return 1;
  if (b.preco == null) return -1;
  return a.preco - b.preco;
}

/** Como a coluna e medida — mostrado na bolha "i" do cabecalho. */
const COMO_MEDE_A_DIFERENCA =
  "Seu Preco venda contra o preco normal do concorrente: (seu preco - preco do concorrente) / preco do concorrente. " +
  "A seta mostra onde o CONCORRENTE esta em relacao a voce: para baixo e vermelho, ele esta mais barato (voce perde venda); " +
  "para cima e verde, ele esta mais caro.";

/**
 * Onde o concorrente esta em relacao ao preco de venda do produto — pedido do
 * dono em 18/09/2026, que inverteu a seta e a cor da primeira versao: com o
 * MESMO numero (seu preco sobre o dele), a seta agora aponta para o
 * concorrente, e nao para o nosso preco. Concorrente mais barato = seta para
 * baixo em VERMELHO, porque e o caso ruim para quem vende; mais caro = seta
 * para cima em verde. Sem preco de um dos dois lados, nao ha o que comparar.
 */
function Diferenca({ precoProduto, precoConcorrente }) {
  if (precoProduto == null || precoConcorrente == null || precoConcorrente === 0) {
    return <span className="text-suave">—</span>;
  }

  const diferenca = ((precoProduto - precoConcorrente) / precoConcorrente) * 100;
  if (Math.abs(diferenca) < 0.05) {
    return <span className="text-suave">Igual</span>;
  }

  const concorrenteMaisBarato = diferenca > 0;
  const Seta = concorrenteMaisBarato ? ArrowDown : ArrowUp;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium tabular-nums ${
        concorrenteMaisBarato ? "text-red-700" : "text-emerald-700"
      }`}
      title={
        concorrenteMaisBarato
          ? "Este concorrente esta mais barato que voce"
          : "Este concorrente esta mais caro que voce"
      }
    >
      <Seta size={13} />
      {percentual.format(Math.abs(diferenca))}%
    </span>
  );
}

function EstoqueConcorrente({ situacao }) {
  if (!situacao) return <span className="text-suave">Nao informado</span>;
  if (situacao.quantidade === 0) return <span className="font-medium text-red-700">Sem estoque</span>;
  if (!situacao.ativo) return <span className="text-suave">Fora da coleta</span>;
  if (situacao.quantidade > 0) return (
    <span className="font-medium text-emerald-700">Em estoque <span className="block font-normal text-suave">{situacao.quantidade} un.</span></span>
  );
  if (situacao.estoqueStatus === "OUT_OF_STOCK") return <span className="font-medium text-red-700">Sem estoque</span>;
  if (situacao.estoqueStatus === "AVAILABLE" || situacao.estoqueStatus === "IN_STOCK") {
    return <span className="font-medium text-emerald-700">Em estoque</span>;
  }
  return <span className="text-suave">Nao informado</span>;
}

/**
 * Concorrentes do produto — marcados na lupa do Nome ou adicionados a mao
 * (pedido do dono em 18/09/2026, no mesmo desenho de Fornecedores.jsx).
 *
 * **Vindo da lupa, o preco NUNCA e gravado aqui** (`produtoColetadoId`
 * preenchido, sem os campos `*Manual`): a tela sempre le o preco de HOJE do
 * produto coletado, para acompanhar a proxima varredura sem o operador ter
 * que remover e adicionar de novo — decisao do dono em 18/09/2026, diferente
 * do preco de custo do Fornecedor (que o operador negociou e deve ficar
 * fixo). A leitura de hoje acontece no servidor (`[id]/page.jsx`); aqui so se
 * recebe o resultado pronto em `vinculos`.
 *
 * **Digitado a mao** (sem produto coletado por tras): os `*Manual` guardam o
 * que foi escrito, fixo — nao ha varredura para seguir.
 *
 * **Modo rascunho** (`modoRascunho`, produto ainda nao salvo): mesmo padrao
 * de Fornecedores — cada linha grava na lista do FORMULARIO
 * (`aoMudarRascunho`), e vira vinculo de verdade so no Salvar
 * (`gravarConcorrentesRascunho`).
 *
 * **Sincroniza sozinho com a lupa** (`sincronizarSugestoes`, via `ref`): o
 * FORMULARIO chama isto quando a janela da lupa fecha, e cada concorrente
 * marcado entra direto na lista — sem precisar apertar "Adicionar" (pedido do
 * dono em 18/09/2026, mesmo ajuste que ja valia para Fornecedores).
 */
export default function Concorrentes({
  ref,
  produtoId,
  vinculos,
  aoFalhar,
  modoRascunho = false,
  aoMudarRascunho,
  sugestoes = [],
  precoProduto,
  ativo = false,
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [editando, setEditando] = useState(null); // id do vinculo, "novo", ou null
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [catalogo, setCatalogo] = useState([]);
  const [situacoes, setSituacoes] = useState({});
  const [popupNome, setPopupNome] = useState(null);
  const filaSugestoes = useRef([]);
  const sugestaoAguardando = useRef(null);
  const cadastradosAgora = useRef(new Set());

  useEffect(() => {
    let cancelado = false;
    listarConcorrentesCadastrados().then((cadastros) => {
      if (!cancelado) setCatalogo(cadastros);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    consultarSituacaoConcorrentes(vinculos.map((item) => item.produtoColetadoId).filter(Boolean))
      .then((situacao) => { if (!cancelado) setSituacoes(situacao.ok ? situacao.itens : {}); })
      .catch(() => { if (!cancelado) setSituacoes({}); });
    return () => { cancelado = true; };
  }, [ativo, vinculos]);

  function abrirNovo() {
    setRascunho(VAZIO);
    setErros({});
    setEditando("novo");
  }

  function abrirEdicao(item) {
    setRascunho({
      fonte: item.fonte ?? "",
      nome: item.nome ?? "",
      codigo: item.codigo ?? "",
      preco: item.preco ?? "",
      url: item.url ?? "",
      produtoColetadoId: null,
    });
    setErros({});
    setEditando(item.id);
  }

  /** Rascunho (strings) -> campos que o servidor espera (`*Manual`, nulos no lugar de ""). */
  function dadosParaServidor(dados) {
    if (dados.produtoColetadoId) return {
      produtoColetadoId: dados.produtoColetadoId,
      fonteManual: null, nomeManual: null, codigoManual: null,
      precoManual: null, linkManual: null,
    };
    return {
      produtoColetadoId: null,
      fonteManual: dados.fonte.trim(),
      nomeManual: dados.nome.trim() || null,
      codigoManual: dados.codigo.trim() || null,
      precoManual: dados.preco === "" ? null : Number(dados.preco),
      linkManual: dados.url.trim() || null,
    };
  }

  function salvarDados(dados, cadastradoAgora = false) {
    const validacao = validar(dados);
    if (Object.keys(validacao).length > 0) {
      setErros(validacao);
      return;
    }
    if (!cadastradoAgora && !catalogo.some((item) => item.nome.toLocaleLowerCase("pt-BR") === dados.fonte.trim().toLocaleLowerCase("pt-BR"))) {
      setErros({ fonte: "Concorrente nao cadastrado. Complete o cadastro rapido." });
      setPopupNome(dados.fonte.trim());
      return;
    }

    if (modoRascunho) {
      const servidor = dadosParaServidor(dados);
      const vinculo = {
        manual: !dados.produtoColetadoId,
        fonte: dados.fonte.trim(),
        nome: dados.nome.trim() || null,
        codigo: dados.codigo.trim() || null,
        preco: dados.preco === "" ? null : Number(dados.preco),
        url: dados.url.trim() || null,
        ...servidor,
      };
      aoMudarRascunho((atual) =>
        editando === "novo"
          ? [...atual, { id: crypto.randomUUID(), ...vinculo }]
          : atual.map((item) => (item.id === editando ? { ...item, ...vinculo } : item)),
      );
      setEditando(null);
      setErros({});
      return;
    }

    iniciarTransicao(async () => {
      const resultado = await salvarConcorrenteDoProduto(
        produtoId,
        editando === "novo" ? null : editando,
        dadosParaServidor(dados),
      );

      if (resultado.ok) {
        setEditando(null);
        setErros({});
      } else {
        setErros(resultado.erros ?? {});
        if (resultado.cadastroNecessario) setPopupNome(resultado.nomeConcorrente ?? dados.fonte.trim());
        if (resultado.erro) aoFalhar?.(resultado.erro);
      }
    });
  }

  function salvar() {
    salvarDados(rascunho);
  }

  function escolherCodigo(item) {
    setRascunho({
      fonte: item.fonte ?? "", nome: item.nome ?? "", codigo: item.codigo ?? "",
      preco: item.preco == null ? "" : String(item.preco),
      url: item.url ?? "", produtoColetadoId: item.id,
    });
    setErros({});
  }

  /**
   * Adiciona uma referencia marcada na lupa direto na lista — sem passar pela
   * linha de edicao, pedido do dono em 18/09/2026. `item` vem de
   * `buscaPorPalavras.js`: `item.id` e o id do ProdutoColetado.
   */
  function proximaSugestaoSemCadastro() {
    while (filaSugestoes.current.length) {
      const item = filaSugestoes.current.shift();
      if (cadastradosAgora.current.has(item.fonte.trim().toLocaleLowerCase("pt-BR"))) {
        adicionarSugestao(item, true);
        continue;
      }
      sugestaoAguardando.current = item;
      escolherCodigo({ ...item, preco: item.precoNormal });
      setEditando("novo");
      setErros({ fonte: "Concorrente nao cadastrado. Complete o cadastro rapido." });
      setPopupNome(item.fonte);
      return;
    }
    sugestaoAguardando.current = null;
  }

  function adicionarSugestao(item, cadastradoAgora = false) {
    const chave = item.fonte.trim().toLocaleLowerCase("pt-BR");
    if (!cadastradoAgora && !cadastradosAgora.current.has(chave)
      && !catalogo.some((cadastro) => cadastro.nome.toLocaleLowerCase("pt-BR") === chave)) {
      filaSugestoes.current.push(item);
      if (!sugestaoAguardando.current) proximaSugestaoSemCadastro();
      return;
    }
    if (modoRascunho) {
      aoMudarRascunho((atual) => [
        ...atual,
        {
          id: crypto.randomUUID(),
          manual: false,
          produtoColetadoId: item.id,
          fonteManual: null,
          nomeManual: null,
          codigoManual: null,
          precoManual: null,
          linkManual: null,
          fonte: item.fonte,
          nome: item.nome,
          codigo: item.codigo,
          preco: item.precoNormal,
          url: item.url,
        },
      ]);
      return;
    }

    iniciarTransicao(async () => {
      // Os campos *Manual vao explicitos (nulos), e nao omitidos: o schema e
      // nullable, nao optional — chave ausente falha a validacao em silencio
      // (sem lancar excecao), e essa falha ja escapou uma vez sem aviso nenhum.
      const resultado = await salvarConcorrenteDoProduto(produtoId, null, {
        produtoColetadoId: item.id,
        fonteManual: null,
        nomeManual: null,
        codigoManual: null,
        precoManual: null,
        linkManual: null,
      });
      if (!resultado.ok) {
        aoFalhar?.(
          resultado.erro ?? Object.values(resultado.erros ?? {})[0] ?? "Falha ao adicionar concorrente.",
        );
      }
    });
  }

  useImperativeHandle(ref, () => ({
    sincronizarSugestoes: () => {
      for (const item of sugestoes) adicionarSugestao(item);
    },
  }));

  function remover(item) {
    if (modoRascunho) {
      aoMudarRascunho((atual) => atual.filter((outro) => outro.id !== item.id));
      return;
    }
    iniciarTransicao(async () => {
      const r = await removerConcorrenteDoProduto(item.id);
      if (!r.ok) aoFalhar?.(r.erro);
    });
  }

  const vinculosOrdenados = [...vinculos].sort(porPrecoAscendente);

  const campo = (chave) => ({
    value: rascunho[chave],
    onChange: (evento) =>
      setRascunho((atual) => ({
        ...atual, [chave]: evento.target.value, produtoColetadoId: null,
      })),
    className: `w-full rounded border px-2 py-1.5 text-sm focus:outline-none ${
      erros[chave] ? "border-red-400" : "border-borda focus:border-acento"
    }`,
  });

  return (
    <div>
      <h3 className="text-sm font-semibold">Concorrentes</h3>
      <p className="mt-0.5 text-[11px] text-suave">
        Marcados na lupa do Nome, ou adicionados aqui. So para consulta: preco de concorrente
        nao e custo e nao entra no calculo do produto.
      </p>
      {/* `md:overflow-visible`: a bolha "i" do cabecalho abre para CIMA, fora da
          caixa da tabela, e `overflow-x-auto` a cortava por inteiro (overflow-x
          diferente de visible tambem prende o eixo Y). A rolagem lateral fica so
          nas telas estreitas, onde a tabela nao cabe. */}
      <div className="mt-2 overflow-x-auto rounded border border-borda md:overflow-visible">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr className="divide-x divide-borda">
              <th className="px-3 py-2 font-medium">Concorrente</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Codigo</th>
              <th className="px-3 py-2 font-medium">Preco</th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  Diferenca
                  <BolhaDeAjuda texto={COMO_MEDE_A_DIFERENCA} variante="inline" />
                </span>
              </th>
              <th className="w-28 px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Estoque
                  <BolhaDeAjuda texto="Mostra se o concorrente tem estoque. Se informar a quantidade, zero significa sem estoque; quando nao informa, usamos a disponibilidade declarada pela loja." variante="inline" />
                </span>
              </th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>

          <tbody className="divide-y divide-borda">
            {vinculosOrdenados.length === 0 && editando !== "novo" && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-suave">
                  Nenhum concorrente marcado ou adicionado.
                </td>
              </tr>
            )}

            {vinculosOrdenados.map((item) =>
              editando === item.id ? (
                <LinhaEdicao
                  key={item.id}
                  campo={campo}
                  erros={erros}
                  pendente={pendente}
                  aoEscolherCodigo={escolherCodigo}
                  aoSalvar={salvar}
                  aoCancelar={() => setEditando(null)}
                />
              ) : (
                <tr key={item.id} className="divide-x divide-borda">
                  <td className="px-3 py-2 font-medium" title={item.fonte}>
                    {item.fonte}
                  </td>
                  {/* Corte so visual (o nome nao tem limite no banco); o texto
                      inteiro aparece ao passar o mouse (pedido do dono em
                      22/09/2026, mesmo ajuste ja feito em Fornecedores.jsx). */}
                  <td
                    className="max-w-xs truncate px-3 py-2 text-suave"
                    title={item.nome || undefined}
                  >
                    {item.nome || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.codigo && item.codigo !== "N/A" ? item.codigo : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.preco == null ? "—" : moeda.format(item.preco)}
                  </td>
                  <td className="px-3 py-2">
                    <Diferenca precoProduto={precoProduto} precoConcorrente={item.preco} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <EstoqueConcorrente situacao={situacoes[item.produtoColetadoId]} />
                  </td>
                  <td className="px-3 py-2">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        title={item.url}
                        className="inline-flex text-acento hover:underline"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {item.manual && (
                        <button
                          type="button"
                          onClick={() => abrirEdicao(item)}
                          aria-label={`Editar ${item.fonte}`}
                          className="rounded p-1 text-suave hover:bg-fundo hover:text-acento"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => remover(item)}
                        aria-label={`Remover ${item.fonte} da lista de concorrentes`}
                        title="Remover desta lista"
                        className="rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}

            {editando === "novo" && (
              <LinhaEdicao
                campo={campo}
                erros={erros}
                pendente={pendente}
                aoEscolherCodigo={escolherCodigo}
                aoSalvar={salvar}
                aoCancelar={() => setEditando(null)}
              />
            )}
          </tbody>
        </table>
      </div>

      {editando === null && (
        <button
          type="button"
          onClick={abrirNovo}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          <Plus size={15} />
          Adicionar concorrente
        </button>
      )}
      {popupNome !== null && (
        <CadastroRapidoConcorrente
          key={popupNome}
          nomeInicial={popupNome}
          nomeFixo={Boolean(rascunho.produtoColetadoId)}
          aoFechar={() => {
            setPopupNome(null);
            sugestaoAguardando.current = null;
            filaSugestoes.current = [];
          }}
          aoCadastrar={(cadastro) => {
            setCatalogo((atual) => [...atual, cadastro]);
            cadastradosAgora.current.add(cadastro.nome.trim().toLocaleLowerCase("pt-BR"));
            setPopupNome(null);
            if (sugestaoAguardando.current) {
              const item = sugestaoAguardando.current;
              sugestaoAguardando.current = null;
              adicionarSugestao(item, true);
              setEditando(null);
              proximaSugestaoSemCadastro();
              return;
            }
            const dados = { ...rascunho, fonte: cadastro.nome };
            setRascunho(dados);
            salvarDados(dados, true);
          }}
        />
      )}
    </div>
  );
}

function LinhaEdicao({ campo, erros, pendente, aoSalvar, aoCancelar, aoEscolherCodigo }) {
  return (
    <tr className="divide-x divide-borda bg-fundo/40">
      <td className="px-3 py-2">
        <input placeholder="Nome da loja" {...campo("fonte")} />
        {erros.fonte && <p className="mt-1 text-[11px] text-red-700">{erros.fonte}</p>}
      </td>
      <td className="px-3 py-2">
        <input placeholder="Produto" {...campo("nome")} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input placeholder="Codigo" {...campo("codigo")} />
          <BuscaColetadoPorCodigo codigo={campo("codigo").value} tipo="CONCORRENTE" aoEscolher={aoEscolherCodigo} />
        </div>
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.01" min="0" placeholder="0,00" {...campo("preco")} />
        {erros.preco && <p className="mt-1 text-[11px] text-red-700">{erros.preco}</p>}
      </td>
      <td className="px-3 py-2" colSpan={3}>
        <input placeholder="https://..." {...campo("url")} />
        {erros.url && <p className="mt-1 text-[11px] text-red-700">{erros.url}</p>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={aoSalvar}
            disabled={pendente}
            className="rounded bg-acento px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={aoCancelar}
            aria-label="Cancelar"
            className="rounded p-1 text-suave hover:text-texto"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
