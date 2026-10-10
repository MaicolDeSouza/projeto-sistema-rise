"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useEffect, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Loader, Pencil, X } from "lucide-react";

import { ajustarEstoque, salvarLocalizacao, salvarPrecoVenda } from "@/app/produtos/acoes-edicao-rapida";
import { MAXIMO_ESTOQUE, MOTIVOS, TIPOS_DE_MOVIMENTO, novoSaldo } from "@/lib/estoque";
import { calcularMargem, corDaMargem, IMPOSTO_PADRAO, lucroLiquido } from "@/lib/margem";

/**
 * Edicao rapida da lista de Produtos (pedido do dono em 30/09/2026): localizacao,
 * preco de venda e ajuste de estoque, cada um num popup aberto ao clicar na celula.
 *
 * Desenhado num esboco aprovado por ele: no estoque, escolhe-se Entrada, Saida ou
 * Balanco e digita-se o valor logo abaixo, com a previa do saldo antes de confirmar.
 * Tudo grava SO no banco local — os avisos dizem isso, para o numero daqui nao
 * passar pelo do Bling ou dos canais.
 */

const CLASSE_CAMPO =
  "w-full rounded border border-borda bg-superficie px-2.5 py-2 text-sm focus:border-acento focus:outline-none";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Celula da tabela que abre a edicao. O lapis fica SEMPRE visivel (pedido do dono em
 * 30/09/2026): com ele so no hover, ninguem descobria que a celula era editavel.
 */
export function CelulaEditavel({ titulo, aoClicar, children }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={titulo}
      aria-label={titulo}
      className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-sky-50 focus-visible:bg-sky-50"
    >
      {children}
      <Pencil size={12} className="shrink-0 text-suave" />
    </button>
  );
}

/** Envio de uma acao: guarda o erro para mostrar no popup e fecha quando da certo. */
function useEnvio(acao, aoConcluir) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);

  function enviar(...argumentos) {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await acao(...argumentos);
      if (resultado.ok) aoConcluir(resultado);
      else setErro(resultado.erro);
    });
  }

  return { pendente, erro, enviar, limparErro: () => setErro(null) };
}

export function Popup({ titulo, produto, aoFechar, aoEnviar, rotuloBotao, pendente, erro, children }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{titulo}</p>
            {/* Sem produto (a importacao do Bling, que ainda nao tem um), a janela fica so com o titulo. */}
            {produto && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            aoEnviar();
          }}
          className="mt-3"
        >
          {children}

          <p className="mt-3 min-h-4 text-xs text-red-700" role="alert">
            {erro}
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={aoFechar}
              disabled={pendente}
              className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pendente}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pendente && <Loader size={13} className="animate-spin" />}
              {rotuloBotao}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AvisoSoAqui({ children }) {
  return (
    <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      {children}
    </p>
  );
}

const AVISO_CANAIS = "Fica só neste sistema: o Bling e os canais (Mercado Livre, Loja Integrada) não são atualizados.";

export function PopupLocalizacao({ produto, aoFechar }) {
  const [valor, setValor] = useState(produto.localizacao ?? "");
  const { pendente, erro, enviar, limparErro } = useEnvio(salvarLocalizacao, aoFechar);

  return (
    <Popup
      titulo="Editar localização"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={() => enviar(produto.id, valor)}
      rotuloBotao="Salvar"
      pendente={pendente}
      erro={erro}
    >
      <label className="mb-1 block text-xs text-suave" htmlFor="edicao-localizacao">
        Localização
      </label>
      <input
        id="edicao-localizacao"
        type="text"
        autoFocus
        maxLength={40}
        value={valor}
        onChange={(evento) => {
          setValor(evento.target.value);
          limparErro();
        }}
        placeholder="Ex.: R14"
        className={CLASSE_CAMPO}
      />
      <p className="mt-1.5 text-xs text-suave">
        Só para a separação do pedido. Não vai para canal nenhum. Vazio limpa a localização.
      </p>
    </Popup>
  );
}

export function PopupPreco({ produto, aoFechar }) {
  const [valor, setValor] = useState(produto.precoVenda === null ? "" : produto.precoVenda.toFixed(2));
  const { pendente, erro, enviar, limparErro } = useEnvio(salvarPrecoVenda, aoFechar);

  const preco = Number(valor);
  const custo = produto.custo;
  const lucro = lucroLiquido(preco, custo);
  const margem = calcularMargem(preco, custo);

  return (
    <Popup
      titulo="Editar preço de venda"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={() => enviar(produto.id, valor)}
      rotuloBotao="Salvar"
      pendente={pendente}
      erro={erro}
    >
      <label className="mb-1 block text-xs text-suave" htmlFor="edicao-preco">
        Preço de venda (R$)
      </label>
      <input
        id="edicao-preco"
        type="number"
        autoFocus
        min="0"
        step="0.01"
        inputMode="decimal"
        value={valor}
        onChange={(evento) => {
          setValor(evento.target.value);
          limparErro();
        }}
        className={`${CLASSE_CAMPO} tabular-nums`}
      />

      <p className={`mt-2 min-h-5 text-sm font-medium tabular-nums ${corDaMargem(preco, custo)}`}>
        {lucro !== null &&
          (preco < custo
            ? `Abaixo do custo: ${moeda.format(lucro)} (${margem.toFixed(1)}%)`
            : `Lucro líquido ${moeda.format(lucro)} (${margem.toFixed(1)}%)`)}
      </p>
      <p className="text-xs text-suave">
        {custo > 0
          ? `Custo ${moeda.format(custo)} · imposto de ${(IMPOSTO_PADRAO * 100).toFixed(0)}% descontado, fixo por enquanto.`
          : "Sem custo cadastrado: a margem não é calculada."}
      </p>
      <AvisoSoAqui>
        {AVISO_CANAIS} O preço de venda é um só por produto, igual para todos os canais.
      </AvisoSoAqui>
    </Popup>
  );
}

const ICONES_DO_MOVIMENTO = {
  ENTRADA: ArrowDownToLine,
  SAIDA: ArrowUpFromLine,
  BALANCO: ClipboardCheck,
};

/** Teclas que o navegador aceita num campo numerico mas nao servem a um inteiro. */
const TECLAS_RECUSADAS = ["e", "E", "+", "-", ".", ","];

export function PopupEstoque({ produto, aoFechar }) {
  const [tipo, setTipo] = useState("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS.ENTRADA[0]);
  const [observacao, setObservacao] = useState("");
  const { pendente, erro, enviar, limparErro } = useEnvio(ajustarEstoque, aoFechar);

  const configuracao = TIPOS_DE_MOVIMENTO.find((item) => item.id === tipo);

  function escolherTipo(novo) {
    setTipo(novo);
    setQuantidade("");
    setMotivo(MOTIVOS[novo][0]);
    limparErro();
  }

  const digitada = quantidade === "" ? null : Number(quantidade);
  const depois = digitada === null ? null : novoSaldo(tipo, produto.estoque, digitada);
  const diferenca = depois === null ? null : depois - produto.estoque;

  let previa = null;
  if (depois !== null) {
    if (depois < 0) {
      previa = { erro: true, texto: `A saída (${digitada}) é maior que o saldo (${produto.estoque}).` };
    } else if (depois > MAXIMO_ESTOQUE) {
      previa = { erro: true, texto: `O saldo passaria do limite de ${MAXIMO_ESTOQUE}.` };
    } else {
      previa = {
        erro: false,
        texto: `Saldo depois: ${produto.estoque} → ${depois} (${diferenca >= 0 ? "+" : ""}${diferenca})`,
      };
    }
  }

  return (
    <Popup
      titulo="Ajustar estoque"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={() => enviar(produto.id, { tipo, quantidade, motivo, observacao })}
      rotuloBotao={configuracao.botao}
      pendente={pendente}
      erro={erro}
    >
      <div className="flex items-baseline justify-between rounded bg-fundo px-3 py-2">
        <span className="text-xs text-suave">Saldo atual</span>
        <span className="text-2xl font-medium tabular-nums">
          {produto.estoque} <span className="text-xs font-normal text-suave">un.</span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Operação">
        {TIPOS_DE_MOVIMENTO.map((item) => {
          const Icone = ICONES_DO_MOVIMENTO[item.id];
          return (
            <div key={item.id}>
              <input
                type="radio"
                name="operacao-estoque"
                id={`operacao-${item.id}`}
                checked={tipo === item.id}
                onChange={() => escolherTipo(item.id)}
                className="peer sr-only"
              />
              <label
                htmlFor={`operacao-${item.id}`}
                className="block cursor-pointer rounded border border-borda px-2 py-2 text-center text-sm peer-checked:border-acento peer-checked:bg-sky-50 peer-focus-visible:ring-2 peer-focus-visible:ring-acento"
              >
                <Icone size={18} className="mx-auto mb-0.5" />
                {item.rotulo}
                <span className="block text-[11px] text-suave">{item.ajuda}</span>
              </label>
            </div>
          );
        })}
      </div>

      <label className="mt-3 mb-1 block text-xs text-suave" htmlFor="edicao-quantidade">
        {configuracao.campo}
      </label>
      <input
        id="edicao-quantidade"
        type="number"
        autoFocus
        min="0"
        step="1"
        inputMode="numeric"
        placeholder="0"
        value={quantidade}
        onKeyDown={(evento) => {
          if (TECLAS_RECUSADAS.includes(evento.key)) evento.preventDefault();
        }}
        onChange={(evento) => {
          setQuantidade(evento.target.value);
          limparErro();
        }}
        className={`${CLASSE_CAMPO} tabular-nums`}
      />
      <p
        className={`mt-2 min-h-5 text-sm tabular-nums ${previa?.erro ? "text-red-700" : "font-medium"}`}
        aria-live="polite"
      >
        {previa?.texto}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-suave" htmlFor="edicao-motivo">
            Motivo
          </label>
          <select
            id="edicao-motivo"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            className={CLASSE_CAMPO}
          >
            {MOTIVOS[tipo].map((opcao) => (
              <option key={opcao}>{opcao}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-suave" htmlFor="edicao-observacao">
            Observação (opcional)
          </label>
          <input
            id="edicao-observacao"
            type="text"
            maxLength={200}
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
            placeholder="Ex.: NF 1234"
            className={CLASSE_CAMPO}
          />
        </div>
      </div>

      <AvisoSoAqui>{AVISO_CANAIS}</AvisoSoAqui>
    </Popup>
  );
}

/**
 * A Localizacao de um KIT na lista (pedido do dono em 10/10/2026): a celula fica numa linha so e abre este popup,
 * que mostra cada peca do kit com o codigo, o nome, a quantidade e a localizacao. So consulta, sem Salvar: a
 * localizacao do kit e automatica (a das pecas), e quem muda e a peca (o link abre o cadastro dela em outra aba).
 */
export function PopupPecasDoKit({ produto, aoFechar }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const pecas = produto.pecasDoKit ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Localização do kit"
        className="w-full max-w-2xl rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Localização do kit</p>
            <p className="mt-0.5 truncate text-xs text-suave">
              <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </div>

        {pecas.length === 0 ? (
          <p className="mt-3 text-sm text-suave">Este kit ainda não tem peças.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-borda">
            <table className="w-full text-sm">
              <thead className="bg-fundo text-left text-xs font-semibold text-suave">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Peça</th>
                  <th className="px-3 py-2 text-right">Qtde</th>
                  <th className="px-3 py-2">Localização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {pecas.map((peca) => (
                  <tr key={peca.id}>
                    <td className="px-3 py-2 font-mono text-xs">{peca.sku}</td>
                    <td className="px-3 py-2">
                      <a href={`/produtos/${peca.id}`} target="_blank" rel="noreferrer" className="hover:text-acento hover:underline">
                        {peca.tituloBase}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{peca.quantidade}</td>
                    <td className="px-3 py-2 font-medium">{peca.localizacao || <span className="font-normal text-suave">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-suave">
          A localização do kit vem das peças e muda junto com elas. Para mudar, edite a localização da peça.
        </p>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={aoFechar} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}
