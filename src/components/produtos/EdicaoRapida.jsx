"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Loader, Pencil, X } from "lucide-react";

import { ajustarEstoque, lerSaldoDoAjuste, salvarLocalizacao, salvarPrecoVenda } from "@/app/produtos/acoes-edicao-rapida";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { MAXIMO_ESTOQUE, MOTIVOS, TIPOS_DE_MOVIMENTO, novoSaldo } from "@/lib/estoque";
import { calcularMarkup, corDoMarkup, IMPOSTO_PADRAO, lucroLiquido } from "@/lib/margem";

/**
 * Edicao rapida da lista de Produtos (pedido do dono em 30/09/2026): localizacao,
 * preco de venda e ajuste de estoque, cada um num popup aberto ao clicar na celula.
 *
 * Desenhado num esboco aprovado por ele: no estoque, escolhe-se Entrada, Saida ou
 * Balanco e digita-se o valor logo abaixo, com a previa do saldo antes de confirmar.
 * Localizacao e preco gravam SO no banco local — os avisos dizem isso, para o numero
 * daqui nao passar pelo do Bling ou dos canais. O estoque, desde 20/11/2026, le o saldo
 * no Bling e envia o ajuste na mesma hora (ver `PopupEstoque`).
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

/**
 * `bloqueio` (texto) desliga o botao principal e vira o `title` dele (regra 8 do padrao visual: recusa e botao
 * desabilitado com o motivo). `soFechar` tira o Cancelar: a janela so mostra um resultado, e o botao principal fecha.
 */
export function Popup({ titulo, produto, aoFechar, aoEnviar, rotuloBotao, pendente, erro, bloqueio = null, soFechar = false, children }) {
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
            {!soFechar && (
              <button
                type="button"
                onClick={aoFechar}
                disabled={pendente}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={pendente || Boolean(bloqueio)}
              title={bloqueio ?? undefined}
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
  // % sobre o custo (markup), como no cadastro (pedido do dono em 24/10/2026); o R$ e liquido.
  const margem = calcularMarkup(preco, custo);

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

      <p className={`mt-2 min-h-5 text-sm font-medium tabular-nums ${corDoMarkup(preco, custo)}`}>
        {lucro !== null &&
          (preco < custo
            ? `Abaixo do custo: ${moeda.format(lucro)} (${margem.toFixed(1)}%)`
            : `Lucro líquido ${moeda.format(lucro)} (${margem.toFixed(1)}% sobre o custo)`)}
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

/// O ajuste em palavras, para o aviso de conclusao: "Entrada de 3", "Balanço, contagem de 12".
function ajusteEmPalavras(tipo, quantidade) {
  if (tipo === "ENTRADA") return `Entrada de ${quantidade}`;
  if (tipo === "SAIDA") return `Saída de ${quantidade}`;
  return `Balanço, contagem de ${quantidade}`;
}

/**
 * Ajuste de estoque que JA vai ao Bling (pedido do dono em 20/11/2026: "quero que mudar o estoque no rise tambem mude
 * o bling ... Mas sempre ler saldo atual no bling"). Ao abrir, o saldo e lido do Bling; o Confirmar le de novo, grava
 * no Rise e envia na mesma hora (`lib/blingSync/ajusteComBling.js`). Ate ali o ajuste ficava so no Rise, pendente, e
 * dois esquecidos acenderam o "!" do Bling com 0 e 0 dos dois lados.
 */
export function PopupEstoque({ produto, aoFechar }) {
  const router = useRouter();
  const [tipo, setTipo] = useState("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS.ENTRADA[0]);
  const [observacao, setObservacao] = useState("");
  // null = lendo o Bling (a abertura e o "Ler de novo").
  const [leitura, setLeitura] = useState(null);
  // O que o Confirmar devolveu quando o ajuste foi gravado: "enviado" abre o aviso com OK, "pendente" troca o
  // formulario pelo motivo. Fora do Bling fecha direto, como antes.
  const [resultado, setResultado] = useState(null);
  const { pendente, erro, enviar, limparErro } = useEnvio(ajustarEstoque, (feito) => {
    if (feito.bling === "enviado" || feito.bling === "pendente") setResultado(feito);
    else aoFechar();
  });
  // As respostas chegam depois de um await: com o popup ja fechado, nada a fazer.
  const montado = useRef(false);
  // Uma leitura por abertura: no modo de desenvolvimento o React monta o efeito duas vezes, e cada leitura e uma
  // chamada da conta do Bling, que tem limite (o mesmo cuidado da janela do Bling).
  const leituraIniciada = useRef(false);
  // O numero que a lista mostrava ao abrir: se o Bling disse outro, a lista e atualizada.
  const estoqueAoAbrir = useRef(produto.estoque);

  async function lerSaldo() {
    let lida;
    try {
      lida = await lerSaldoDoAjuste(produto.id);
    } catch {
      lida = { ok: false, erro: "Não foi possível ler o saldo no Bling. Tente de novo." };
    }
    if (!montado.current) return;
    setLeitura(lida);
    if (lida.ok && lida.estoque !== estoqueAoAbrir.current) router.refresh();
  }

  useEffect(() => {
    montado.current = true;
    if (!leituraIniciada.current) {
      leituraIniciada.current = true;
      lerSaldo();
    }
    return () => {
      montado.current = false;
    };
    // So na abertura: `lerSaldo` muda a cada render, e relendo a cada render o Bling seria chamado sem parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto.id]);

  const configuracao = TIPOS_DE_MOVIMENTO.find((item) => item.id === tipo);

  function escolherTipo(novo) {
    setTipo(novo);
    setQuantidade("");
    setMotivo(MOTIVOS[novo][0]);
    limparErro();
  }

  const saldo = leitura?.ok ? leitura.estoque : null;
  const digitada = quantidade === "" ? null : Number(quantidade);
  const depois = digitada === null || saldo === null ? null : novoSaldo(tipo, saldo, digitada);
  const diferenca = depois === null ? null : depois - saldo;

  let previa = null;
  if (depois !== null) {
    if (depois < 0) {
      previa = { erro: true, texto: `A saída (${digitada}) é maior que o saldo (${saldo}).` };
    } else if (depois > MAXIMO_ESTOQUE) {
      previa = { erro: true, texto: `O saldo passaria do limite de ${MAXIMO_ESTOQUE}.` };
    } else {
      previa = {
        erro: false,
        texto: `Saldo depois: ${saldo} → ${depois} (${diferenca >= 0 ? "+" : ""}${diferenca})`,
      };
    }
  }

  // Deu certo dos dois lados: o aviso padrao de envio concluido, e o OK fecha tudo.
  if (resultado?.bling === "enviado") {
    const outros = resultado.enviados - 1;
    return (
      <ConclusaoDoEnvio
        titulo="Estoque sincronizado com o Bling"
        mensagem={`${ajusteEmPalavras(tipo, quantidade)}. Saldo no Rise e no Bling: ${resultado.estoque} un. (era ${resultado.saldoAnterior}).`}
        linhas={outros > 0 ? [`${outros} ajuste(s) que estava(m) pendente(s) foi(ram) junto.`] : []}
        aviso={resultado.aviso ?? null}
        aoFechar={aoFechar}
      />
    );
  }

  // O Rise gravou e o Bling nao recebeu: fica na janela, em ambar, com o motivo (resultado parcial nao e sucesso).
  if (resultado?.bling === "pendente") {
    return (
      <Popup titulo="Ajustar estoque" produto={produto} aoFechar={aoFechar} aoEnviar={aoFechar} rotuloBotao="Fechar" pendente={false} erro={null} soFechar>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Gravado no Rise, mas não enviado ao Bling</p>
          <p className="mt-1 text-xs">{resultado.motivo}</p>
          <p className="mt-2 text-xs">
            Saldo no Rise: {resultado.estoque} un. O ajuste ficou pendente: envie pela janela do Bling (ícone do Bling na lista).
          </p>
        </div>
      </Popup>
    );
  }

  const bloqueio = leitura === null ? "Lendo o saldo no Bling..." : leitura.ok ? null : "Sem o saldo do Bling não dá para ajustar.";
  const foraDoBling = leitura?.ok && !leitura.noBling;

  return (
    <Popup
      titulo="Ajustar estoque"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={() => {
        if (!bloqueio) enviar(produto.id, { tipo, quantidade, motivo, observacao });
      }}
      rotuloBotao={foraDoBling ? "Confirmar" : "Confirmar e sincronizar com Bling"}
      pendente={pendente}
      erro={erro}
      bloqueio={bloqueio}
    >
      <div className="rounded bg-fundo px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-suave">Saldo atual</span>
          {leitura === null ? (
            <span className="inline-flex items-center gap-1.5 py-1.5 text-sm text-suave">
              <Loader size={14} className="animate-spin" />
              Lendo o Bling...
            </span>
          ) : (
            <span className="text-2xl font-medium tabular-nums">
              {saldo ?? "—"} <span className="text-xs font-normal text-suave">un.</span>
            </span>
          )}
        </div>
        {leitura?.ok && leitura.noBling && (
          <p className="text-right text-[11px] text-suave">
            {leitura.pendentes > 0
              ? `Bling: ${leitura.blingSaldo} · ${leitura.pendentes} ajuste(s) pendente(s) vão junto`
              : "lido agora no Bling"}
          </p>
        )}
        {foraDoBling && <p className="text-right text-[11px] text-amber-800">Fora do Bling: o ajuste fica só no Rise.</p>}
        {leitura && !leitura.ok && (
          <p className="mt-1 flex items-start justify-between gap-2 text-xs text-red-700" role="alert">
            <span>{leitura.erro}</span>
            <button
              type="button"
              onClick={() => {
                setLeitura(null);
                lerSaldo();
              }}
              className="shrink-0 font-medium text-acento hover:underline"
            >
              Ler de novo
            </button>
          </p>
        )}
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
