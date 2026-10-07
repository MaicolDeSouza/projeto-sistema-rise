"use client";

import { useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import {
  CheckSquare,
  Clock,
  ExternalLink,
  Pencil,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";

import {
  definirFornecedorPadrao,
  consultarEstoqueFornecedores,
  listarFornecedores,
  removerFornecedorDoProduto,
  salvarFornecedorDoProduto,
} from "@/app/produtos/acoes";
import { precoComImpostoTexto, precoDaFaixaTexto } from "@/components/mercados/precoTexto";
import { precoComImpostos as precoComImpostosCalc } from "@/lib/coleta/impostos";
import CadastroRapidoFornecedor from "./CadastroRapidoFornecedor";
import BuscaColetadoPorCodigo from "./BuscaColetadoPorCodigo";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const VAZIO = {
  nome: "",
  descricao: "",
  codigo: "",
  precoCusto: "",
  link: "",
};

/**
 * Sem URL propria do produto (Fortek: portal fechado, sem pagina publica
 * nenhuma), o link cai no dominio da fonte — mesma regra de `linkDaFonte`
 * em TabelaMercados.jsx (Mercados), pedido do dono em 22/09/2026 para as
 * duas telas concordarem.
 */
function linkDoFornecedor(vinculo, dado) {
  if (vinculo.link) return { url: vinculo.link, titulo: vinculo.link };
  if (!dado?.fonteDominio) return null;
  const url = /^https?:\/\//i.test(dado.fonteDominio)
    ? dado.fonteDominio
    : `https://${dado.fonteDominio}`;
  return { url, titulo: `Abrir o site de ${vinculo.nome} (sem link direto deste produto)` };
}

/** Mesma regra de src/app/produtos/acoes.js: so http/https vira link. */
function ehUrlSegura(valor) {
  if (!valor) return true;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/**
 * Confere o rascunho no navegador, no MODO RASCUNHO (produto ainda nao
 * existe): o servidor valida de novo com o mesmo schema ao salvar o produto,
 * esta e so para o operador ver o erro na hora, sem esperar o Salvar.
 */
function validarRascunho(dados) {
  const erros = {};
  if (!dados.nome.trim()) erros.nome = "Informe o fornecedor.";
  if (dados.precoCusto !== "" && (Number.isNaN(Number(dados.precoCusto)) || Number(dados.precoCusto) < 0)) {
    erros.precoCusto = "Informe um número válido.";
  }
  if (dados.link && !ehUrlSegura(dados.link)) {
    erros.link = "Informe um endereço http ou https.";
  }
  return erros;
}

/**
 * Do mais barato para o mais caro, pedido do dono em 18/09/2026: e o que
 * importa para escolher o fornecedor. Sem preco fica por ultimo — nao e o
 * mais barato, e nao ha o que comparar.
 */
function porCustoAscendente(a, b) {
  if (a.precoCusto == null && b.precoCusto == null) return 0;
  if (a.precoCusto == null) return 1;
  if (b.precoCusto == null) return -1;
  return a.precoCusto - b.precoCusto;
}

/**
 * Icone + popover "Custo ultima varredura" (22/09/2026, pedido do dono): o
 * preco de custo continua so manual — este e o preco lido na ultima coleta,
 * so como REFERENCIA, escondido atras do icone para a tabela nao ficar
 * poluida.
 *
 * So aparece quando ha produto casado (`dado` truthy) — sem casamento nao ha
 * referencia nenhuma para mostrar. A linha de reserva so entra quando o
 * PRODUTO CASADO tem mesmo `precoReserva`: a Santana, por exemplo, nao tem
 * essa modalidade, e mostrar "reserva: —" fixo insinuaria que ela poderia
 * ter e so nao teve desta vez — o que nao e verdade.
 *
 * `overflow: visible` no pai (ver a tabela, mais abaixo) e o que evita a
 * mesma armadilha ja paga em Concorrentes.jsx: `overflow-x-auto` tambem
 * prende o eixo Y, e cortaria o popover pela metade.
 */
function CustoDaVarredura({ id, dado, aberto, aoAlternar }) {
  if (!dado) return null;

  const atualTexto = precoComImpostoTexto(dado.precoNormal, dado.precoComImpostos, dado.impostos);
  const temReserva = typeof dado.precoReserva === "number";
  const reservaTexto = temReserva
    ? precoComImpostoTexto(dado.precoReserva, precoComImpostosCalc(dado.precoReserva, dado.impostos), dado.impostos)
    : null;
  const faixas = (dado.precosPorQuantidade ?? [])
    .filter((faixa) => typeof faixa.preco === "number")
    .sort((a, b) => (a.minimo ?? 0) - (b.minimo ?? 0));

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          aoAlternar(aberto ? null : id);
        }}
        title="Ver custo da última varredura"
        aria-label="Ver custo da última varredura"
        aria-expanded={aberto}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
          aberto
            ? "border-acento bg-acento/10 text-acento"
            : "border-borda text-suave hover:text-acento"
        }`}
      >
        <Clock size={12} />
      </button>

      {aberto && (
        <div
          onClick={(evento) => evento.stopPropagation()}
          className="absolute top-full left-0 z-20 mt-1.5 w-60 rounded border border-borda bg-superficie p-3 text-xs shadow-lg"
        >
          <p className="mb-1.5 text-[10px] font-medium tracking-wide text-suave uppercase">
            Custo última varredura
          </p>
          <p className="text-texto">{atualTexto ?? "—"}</p>
          {reservaTexto && (
            <p className="mt-0.5 text-amber-700">
              {reservaTexto}
              <span className="ml-1 text-[10px] font-normal text-suave">reserva</span>
            </p>
          )}
          {faixas.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {faixas.map((faixa) => (
                <p key={`${faixa.minimo}-${faixa.maximo}-${faixa.rotulo}`} className="text-suave">
                  {precoDaFaixaTexto(faixa, dado.impostos)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fornecedores do produto.
 *
 * Os campos NAO levam atributo `name`: esta tabela vive dentro do <form> do
 * produto, e campo nomeado seria enviado junto no salvamento.
 *
 * **Modo rascunho** (`modoRascunho`, produto ainda nao salvo, pedido do dono em
 * 18/09/2026): cada linha grava na lista do FORMULARIO (`aoMudarRascunho`), e
 * nao pela propria acao — o produto so ganha id no Salvar, e e so entao que os
 * vinculos de verdade sao criados (`gravarFornecedoresRascunho`, mesmo padrao
 * de documentos e certificado). Num produto ja salvo, cada linha continua
 * gravando pela propria acao, no mesmo padrao do envio de arquivos.
 *
 * **Fornecedor marcado na lupa entra sozinho** (pedido do dono em 18/09/2026,
 * depois de ver uma lista separada pedindo clique — ele queria direto na
 * tabela). `sincronizarSugestoes` e chamada pelo FORMULARIO quando a janela da
 * lupa fecha (`ref`), e nao aqui dentro: e o fechar que marca "terminei de
 * escolher", e sincronizar a cada marcacao criaria linha a cada clique na
 * janela, antes do operador decidir o conjunto.
 */
export default function Fornecedores({
  ref,
  produtoId,
  vinculos,
  catalogo,
  ativo = false,
  aoFalhar,
  modoRascunho = false,
  aoMudarRascunho,
  sugestoes = [],
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [editando, setEditando] = useState(null); // id do vinculo, ou "novo"
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [catalogoAtual, setCatalogoAtual] = useState(catalogo);
  const [estoques, setEstoques] = useState({});
  const [popupNome, setPopupNome] = useState(null);
  // Id do vinculo cujo popover "Custo ultima varredura" esta aberto — um so
  // por vez, como a Janela do detalhe de Mercados.
  const [popoverAberto, setPopoverAberto] = useState(null);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    Promise.all([listarFornecedores(), consultarEstoqueFornecedores(vinculos)])
      .then(([cadastros, saldos]) => {
        if (cancelado) return;
        setCatalogoAtual(cadastros);
        setEstoques(saldos.ok ? saldos.itens : {});
      })
      .catch(() => { if (!cancelado) setEstoques({}); });
    return () => { cancelado = true; };
  }, [ativo, vinculos]);

  useEffect(() => {
    if (popoverAberto === null) return undefined;
    const fechar = (evento) => {
      if (evento.type === "keydown" && evento.key !== "Escape") return;
      setPopoverAberto(null);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", fechar);
    };
  }, [popoverAberto]);

  function abrirNovo() {
    setRascunho(VAZIO);
    setErros({});
    setEditando("novo");
  }

  function abrirEdicao(vinculo) {
    setRascunho({
      nome: vinculo.nome,
      descricao: vinculo.descricao ?? "",
      codigo: vinculo.codigo ?? "",
      precoCusto: vinculo.precoCusto ?? "",
      link: vinculo.link ?? "",
    });
    setErros({});
    setEditando(vinculo.id);
  }

  /** Campos do fornecedor a partir de uma referencia marcada na lupa do Nome. */
  function dadosDaSugestao(item) {
    return {
      nome: item.fonte ?? "",
      descricao: item.nome ?? "",
      codigo: item.codigo && item.codigo !== "N/A" ? item.codigo : "",
      precoCusto: item.preco != null ? String(item.preco) : "",
      link: item.url ?? "",
    };
  }

  /** Rascunho (strings) -> vinculo pronto para a lista, nulos no lugar de "". */
  function paraVinculo(dados) {
    return {
      nome: dados.nome.trim(),
      descricao: dados.descricao.trim() || null,
      codigo: dados.codigo.trim() || null,
      precoCusto: dados.precoCusto === "" ? null : Number(dados.precoCusto),
      link: dados.link.trim() || null,
    };
  }

  function salvarDados(dadosDoVinculo, cadastradoAgora = false) {
    if (!dadosDoVinculo.nome.trim()) {
      setErros({ nome: "Informe o fornecedor." });
      return;
    }
    if (!cadastradoAgora && !catalogoAtual.some((item) => item.nome.toLocaleLowerCase("pt-BR") === dadosDoVinculo.nome.trim().toLocaleLowerCase("pt-BR"))) {
      setErros({ nome: "Fornecedor não cadastrado. Complete o cadastro rápido." });
      setPopupNome(dadosDoVinculo.nome.trim());
      return;
    }
    if (modoRascunho) {
      const erros = validarRascunho(dadosDoVinculo);
      if (Object.keys(erros).length > 0) {
        setErros(erros);
        return;
      }

      const dados = paraVinculo(dadosDoVinculo);
      aoMudarRascunho((atual) =>
        editando === "novo"
          ? [...atual, { id: crypto.randomUUID(), ...dados, padrao: atual.length === 0 }]
          : atual.map((item) => (item.id === editando ? { ...item, ...dados } : item)),
      );
      setEditando(null);
      setErros({});
      return;
    }

    iniciarTransicao(async () => {
      const resultado = await salvarFornecedorDoProduto(
        produtoId,
        editando === "novo" ? null : editando,
        dadosDoVinculo,
      );

      if (resultado.ok) {
        setEditando(null);
        setErros({});
      } else {
        setErros(resultado.erros ?? {});
        if (resultado.cadastroNecessario) setPopupNome(dadosDoVinculo.nome.trim());
        if (resultado.erro) aoFalhar?.(resultado.erro);
      }
    });
  }

  function salvar() {
    salvarDados(rascunho);
  }

  /**
   * Adiciona uma referencia marcada direto na lista, sem passar pela linha de
   * edicao — pedido do dono em 18/09/2026: um clique em "Adicionar" basta. So
   * abre a linha (com o erro a vista) se a referencia nao servir sozinha:
   * fornecedor sem nome, ou o servidor recusando (ex.: ja vinculado).
   */
  function adicionarSugestao(item) {
    const dados = dadosDaSugestao(item);

    if (!catalogoAtual.some((cadastro) => cadastro.nome.toLocaleLowerCase("pt-BR") === dados.nome.trim().toLocaleLowerCase("pt-BR"))) {
      setRascunho(dados);
      setErros({ nome: "Fornecedor não cadastrado. Complete o cadastro rápido." });
      setEditando("novo");
      setPopupNome(dados.nome.trim());
      return;
    }

    if (modoRascunho) {
      const erros = validarRascunho(dados);
      if (Object.keys(erros).length > 0) {
        setRascunho(dados);
        setErros(erros);
        setEditando("novo");
        return;
      }

      const vinculo = paraVinculo(dados);
      aoMudarRascunho((atual) => [
        ...atual,
        { id: crypto.randomUUID(), ...vinculo, padrao: atual.length === 0 },
      ]);
      return;
    }

    iniciarTransicao(async () => {
      const resultado = await salvarFornecedorDoProduto(produtoId, null, dados);
      if (!resultado.ok) {
        // Nao serviu sozinho (nome invalido, ja vinculado...): abre a linha
        // preenchida, com o erro a vista, para o operador ajustar e confirmar.
        setRascunho(dados);
        setErros(resultado.erros ?? {});
        setEditando("novo");
        if (resultado.erro) aoFalhar?.(resultado.erro);
      }
    });
  }

  useImperativeHandle(ref, () => ({
    sincronizarSugestoes: () => {
      for (const item of sugestoes) adicionarSugestao(item);
    },
  }));

  function definirPadrao(vinculo) {
    if (modoRascunho) {
      aoMudarRascunho((atual) =>
        atual.map((item) => ({ ...item, padrao: item.id === vinculo.id })),
      );
      return;
    }
    iniciarTransicao(async () => {
      const r = await definirFornecedorPadrao(vinculo.id);
      if (!r.ok) aoFalhar?.(r.erro);
    });
  }

  function remover(vinculo) {
    if (modoRascunho) {
      aoMudarRascunho((atual) => {
        const restante = atual.filter((item) => item.id !== vinculo.id);
        if (vinculo.padrao && restante.length > 0) restante[0] = { ...restante[0], padrao: true };
        return restante;
      });
      return;
    }
    iniciarTransicao(async () => {
      const r = await removerFornecedorDoProduto(vinculo.id);
      if (!r.ok) aoFalhar?.(r.erro);
    });
  }

  const campo = (chave) => ({
    value: rascunho[chave],
    onChange: (evento) =>
      setRascunho((atual) => ({ ...atual, [chave]: evento.target.value })),
    className: `w-full rounded border px-2 py-1.5 text-sm focus:outline-none ${
      erros[chave] ? "border-red-400" : "border-borda focus:border-acento"
    }`,
  });

  return (
    <div>
      {/* `md:overflow-visible`: o popover de "Custo ultima varredura" abre para
          BAIXO, e `overflow-x-auto` prende tambem o eixo Y e o cortaria pela
          metade — mesma armadilha ja paga em Concorrentes.jsx. A rolagem
          lateral fica so nas telas estreitas. */}
      <div className="overflow-x-auto rounded border border-borda md:overflow-visible">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr className="divide-x divide-borda">
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Descrição no fornecedor</th>
              <th className="px-3 py-2 font-medium">Código no fornecedor</th>
              <th className="px-3 py-2 font-medium">Preço de custo</th>
              <th className="px-3 py-2 font-medium">Estoque fornecedor</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Padrão</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>

          <tbody className="divide-y divide-borda">
            {vinculos.length === 0 && editando !== "novo" && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-suave">
                  Nenhum fornecedor cadastrado para este produto.
                </td>
              </tr>
            )}

            {[...vinculos].sort(porCustoAscendente).map((vinculo) =>
              editando === vinculo.id ? (
                <LinhaEdicao
                  key={vinculo.id}
                  campo={campo}
                  catalogo={catalogoAtual}
                  aoEscolherCodigo={(item) => setRascunho(dadosDaSugestao(item))}
                  erros={erros}
                  pendente={pendente}
                  aoSalvar={salvar}
                  aoCancelar={() => setEditando(null)}
                />
              ) : (
                <tr key={vinculo.id} className="divide-x divide-borda">
                  <td className="px-3 py-2 font-medium">{vinculo.nome}</td>
                  {/* O campo nao tem limite de caracteres (Text no banco); o corte
                      aqui e so visual, para a linha nao esticar a tabela. O texto
                      inteiro aparece ao passar o mouse (title), e vira link quando
                      e uma URL — caso do Bling, que guarda ali o endereco do
                      produto no site do fornecedor. */}
                  <td
                    className="max-w-xs truncate px-3 py-2 text-suave"
                    title={vinculo.descricao || undefined}
                  >
                    {vinculo.descricao && ehUrlSegura(vinculo.descricao) ? (
                      <a
                        href={vinculo.descricao}
                        target="_blank"
                        rel="noreferrer"
                        className="text-acento hover:underline"
                      >
                        {vinculo.descricao}
                      </a>
                    ) : (
                      vinculo.descricao || "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {vinculo.codigo || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <span>{vinculo.precoCusto === null ? "—" : moeda.format(vinculo.precoCusto)}</span>
                      <CustoDaVarredura
                        id={vinculo.id}
                        dado={estoques[vinculo.id]}
                        aberto={popoverAberto === vinculo.id}
                        aoAlternar={setPopoverAberto}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {!estoques[vinculo.id] ? (
                      <span className="text-suave">—</span>
                    ) : estoques[vinculo.id].disponivel ? (
                      <span className="text-emerald-700">
                        estoque disponível
                        {typeof estoques[vinculo.id].quantidade === "number" && `: ${estoques[vinculo.id].quantidade}`}
                      </span>
                    ) : (
                      <span className="text-red-600">sem estoque atual</span>
                    )}
                    {estoques[vinculo.id]?.aChegar > 0 && (
                      <div className="text-[11px] text-amber-700">+{estoques[vinculo.id].aChegar} a chegar</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const link = linkDoFornecedor(vinculo, estoques[vinculo.id]);
                      return link ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          title={link.titulo}
                          className="inline-flex text-acento hover:underline"
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="text-suave">—</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pendente || vinculo.padrao}
                      onClick={() => definirPadrao(vinculo)}
                      aria-label={
                        vinculo.padrao
                          ? `${vinculo.nome} é o fornecedor padrão`
                          : `Usar ${vinculo.nome} como fornecedor padrão`
                      }
                      title={
                        vinculo.padrao
                          ? "É deste fornecedor que sai o custo do produto"
                          : "Usar o custo deste fornecedor"
                      }
                      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium ${
                        vinculo.padrao
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-suave hover:bg-fundo hover:text-texto"
                      }`}
                    >
                      {vinculo.padrao ? (
                        <CheckSquare size={16} className="shrink-0 fill-emerald-600 text-white" />
                      ) : (
                        <Square size={16} className="shrink-0" />
                      )}
                      {vinculo.padrao && "Padrão"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(vinculo)}
                        aria-label="Editar fornecedor"
                        className="rounded p-1 text-suave hover:bg-fundo hover:text-acento"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => remover(vinculo)}
                        aria-label="Remover fornecedor"
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
                catalogo={catalogoAtual}
                aoEscolherCodigo={(item) => setRascunho(dadosDaSugestao(item))}
                erros={erros}
                pendente={pendente}
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
          Adicionar fornecedor
        </button>
      )}

      <p className="mt-2 text-[11px] text-suave">
        O custo do produto vem do fornecedor marcado como padrão.
      </p>

      {popupNome !== null && (
        <CadastroRapidoFornecedor
          key={popupNome}
          nomeInicial={popupNome}
          aoFechar={() => setPopupNome(null)}
          aoCadastrar={(cadastro) => {
            setCatalogoAtual((atual) => [...atual, cadastro]);
            setPopupNome(null);
            const dados = { ...rascunho, nome: cadastro.nome };
            setRascunho(dados);
            salvarDados(dados, true);
          }}
        />
      )}

    </div>
  );
}

function LinhaEdicao({ campo, catalogo, erros, pendente, aoSalvar, aoCancelar, aoEscolherCodigo }) {
  return (
    <tr className="divide-x divide-borda bg-fundo/40">
      <td className="px-3 py-2">
        {/* O nome novo abre o cadastro rapido antes de gravar o vinculo. */}
        <input list="catalogo-fornecedores" {...campo("nome")} />
        <datalist id="catalogo-fornecedores">
          {catalogo.map((f) => (
            <option key={f.id} value={f.nome} />
          ))}
        </datalist>
        {erros.nome && (
          <p className="mt-1 text-[11px] text-red-700">{erros.nome}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <input {...campo("descricao")} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input {...campo("codigo")} />
          <BuscaColetadoPorCodigo codigo={campo("codigo").value} tipo="FORNECEDOR" aoEscolher={aoEscolherCodigo} />
        </div>
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.01" min="0" {...campo("precoCusto")} />
        {erros.precoCusto && (
          <p className="mt-1 text-[11px] text-red-700">{erros.precoCusto}</p>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-suave">—</td>
      <td className="px-3 py-2" colSpan={2}>
        <input placeholder="https://..." {...campo("link")} />
        {erros.link && (
          <p className="mt-1 text-[11px] text-red-700">{erros.link}</p>
        )}
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
