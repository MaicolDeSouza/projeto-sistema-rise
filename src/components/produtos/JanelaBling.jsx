"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, Loader } from "lucide-react";

import {
  abrirJanelaBling,
  cadastrarProdutoNoBling,
  enviarEstoqueAoBling,
  sincronizarComBling,
} from "@/app/produtos/acoes-bling";
import { mudouNoBling, resumirEnvio, valorParaTela } from "@/lib/blingSync/apresentacao";
import { Popup } from "./EdicaoRapida";

/**
 * Pop-up aberto pelo icone do Bling na lista de Produtos: o que o Bling tem sob o codigo do produto,
 * comparado campo a campo com o Rise, e os envios (sincronizar os campos, cadastrar o produto, enviar
 * os ajustes de estoque). Cada abertura monta a janela do zero e le o Bling de novo
 * (`abrirJanelaBling`, que so le).
 *
 * Estados do corpo: carregando; erro de leitura (token, limite, codigo duplicado: a mensagem vem da
 * acao); codigo que nao existe no Bling ("Cadastrar no Bling"); ou a lista de diferencas, os avisos e
 * o bloco de estoque. O botao principal do rodape muda com o estado e e sempre o envio que faz
 * sentido nele.
 *
 * A escrita no Bling tem duas travas no servidor. Com elas fechadas os botoes de envio CONTINUAM
 * aqui, e ao clicar a acao devolve o motivo, que a janela mostra em vermelho: nunca em silencio, e
 * nunca um botao que some e deixa o operador sem saber por que. Os botoes so ficam desabilitados
 * enquanto um envio roda (a trava de "um envio por produto" da lib so vale dentro de um processo, e
 * o clique duplo nao pode mandar o mesmo ajuste duas vezes).
 *
 * Este arquivo so chama as Server Actions de `acoes-bling.js`. A lib de sincronizacao e de servidor
 * (usa `node:crypto` e o banco): o texto e as contas daqui vem de `lib/blingSync/apresentacao.js`, e
 * os rotulos dos campos, das diferencas que a propria leitura devolve.
 */

/// A acao ja devolve `{ ok: false }` para o que da errado no servidor; isto cobre a rede caindo. Num
/// envio a resposta que se perde nao quer dizer que o Bling nao recebeu: a mensagem manda conferir
/// antes de tentar de novo, em vez de convidar a repetir uma escrita.
async function chamar(acao, argumentos, escreve) {
  try {
    return await acao(...argumentos);
  } catch {
    return {
      ok: false,
      erro: escreve
        ? "A resposta do servidor se perdeu. O Bling pode ter recebido o envio: confira no Bling antes de tentar de novo."
        : "Nao foi possivel falar com o servidor. Tente de novo.",
    };
  }
}

const CLASSE_DO_TOM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const CLASSE_DO_BOTAO_SECUNDARIO =
  "inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-1.5 text-xs font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60";

/// O valor de um campo: texto que cabe na coluna (a descricao inteira rola em vez de esticar a janela) ou,
/// sem valor, a frase que diz de qual lado ele falta.
function Valor({ campo, valor, quandoVazio }) {
  const texto = valorParaTela(campo, valor);
  if (texto === null) return <span className="text-suave italic">{quandoVazio}</span>;
  return <span className="block max-h-24 overflow-y-auto break-words whitespace-pre-wrap">{texto}</span>;
}

/**
 * Um campo que difere: Rise e Bling lado a lado. `vazioNoRise` (o Rise nao tem o valor e o Bling tem)
 * fica em cinza e diz que nao sera enviado: campo vazio no Rise nunca apaga o do Bling, entao nao e
 * divergencia. O estado vai em palavras ("diferente", "so tem no Bling"), alem da cor.
 */
function LinhaDeDiferenca({ item }) {
  const vazioNoRise = item.tipo === "vazioNoRise";
  return (
    <li className={`rounded border p-2 ${vazioNoRise ? "border-borda bg-fundo/60 text-suave" : "border-amber-200 bg-amber-50/50"}`}>
      <p className="text-xs font-medium text-texto">
        {item.rotulo}
        <span className="ml-1.5 font-normal text-suave">{vazioNoRise ? "so tem no Bling" : "diferente"}</span>
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">No Rise</dt>
          <dd>
            <Valor campo={item.campo} valor={item.rise} quandoVazio="vazio no Rise (nao sera enviado)" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">No Bling</dt>
          <dd>
            <Valor campo={item.campo} valor={item.bling} quandoVazio="vazio no Bling" />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * As diferencas e quantos campos sao iguais. Os iguais ficam so na contagem: a leitura devolve o
 * numero, nao a lista deles, e os rotulos dos campos vivem numa lib de servidor que o navegador nao
 * importa.
 */
function Diferencas({ diferencas, iguais }) {
  const textoDosIguais = `${iguais} ${iguais === 1 ? "campo igual" : "campos iguais"}`;

  if (diferencas.length === 0) {
    return (
      <section aria-label="Diferencas entre o Rise e o Bling">
        <p className={`rounded border p-2 text-xs ${CLASSE_DO_TOM.ok}`}>
          Nenhuma diferenca: {textoDosIguais} no Rise e no Bling.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Diferencas entre o Rise e o Bling">
      <p className="text-xs font-medium">
        Diferencas entre o Rise e o Bling <span className="font-normal text-suave">({diferencas.length})</span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {diferencas.map((item) => (
          <LinhaDeDiferenca key={item.campo} item={item} />
        ))}
      </ul>
      {iguais > 0 && <p className="mt-1.5 text-xs text-suave">{textoDosIguais}</p>}
    </section>
  );
}

export default function JanelaBling({ produto, aoFechar }) {
  // null = lendo o Bling (a abertura e o "Ler de novo"). Depois de um envio a janela mantem a leitura
  // antiga na tela enquanto le a nova (`qual` = "lendo"), para o conteudo nao piscar.
  const [leitura, setLeitura] = useState(null);
  const [ocupado, iniciarTransicao] = useTransition();
  // O que roda agora, so para o botao certo dizer "Enviando...": "sincronizar", "cadastrar", "estoque"
  // ou "lendo" (a releitura que vem depois do envio).
  const [qual, setQual] = useState(null);
  const [erro, setErro] = useState(null);
  const [envio, setEnvio] = useState(null);
  // O Bling tem mais de um deposito e nenhum padrao: `{lista, motivo}` ate o operador escolher.
  const [depositos, setDepositos] = useState(null);
  const [deposito, setDeposito] = useState(null);
  const foco = useRef(null);
  // As respostas chegam depois de um await: se a janela foi fechada nesse meio tempo, nada a fazer.
  const montada = useRef(false);
  // A leitura da abertura sai UMA vez por abertura. No modo de desenvolvimento o React monta, desmonta
  // e monta o efeito de novo; sem isto cada abertura leria o Bling duas vezes (duas chamadas da conta,
  // que tem limite), e a primeira resposta seria jogada fora.
  const leituraIniciada = useRef(false);

  useEffect(() => {
    montada.current = true;
    // O foco entra na janela ao abrir (senao fica no icone, atras do fundo escuro e fora do alcance de
    // quem usa o teclado), como na janela do Mercado Livre. Sem prender o foco: so a entrada.
    foco.current?.focus();
    if (!leituraIniciada.current) {
      leituraIniciada.current = true;
      (async () => {
        const lida = await chamar(abrirJanelaBling, [produto.id], false);
        if (montada.current) setLeitura(lida);
      })();
    }
    return () => {
      montada.current = false;
    };
  }, [produto.id]);

  const carregando = leitura === null;
  const pendente = carregando || ocupado;

  /**
   * Roda um envio e conta o resultado. Depois, se o Bling pode ter mudado (`mudouNoBling`), le de novo
   * para a janela mostrar o estado de agora (e o saldo novo). A mensagem da acao vai em vermelho; o que
   * ja foi enviado antes de uma falha vai no quadro do resultado. Os rotulos dos campos vem das
   * diferencas que a janela mostrava ANTES de enviar: o resultado traz so o id do campo.
   */
  function enviar(tipo, executar) {
    setErro(null);
    setEnvio(null);
    setDepositos(null);
    setQual(tipo);
    const rotulos = Object.fromEntries((leitura?.diferencas ?? []).map((item) => [item.campo, item.rotulo]));

    iniciarTransicao(async () => {
      try {
        const resultado = await executar();
        const resumo = resumirEnvio(tipo, resultado, rotulos);
        const aviso = resultado.aviso ?? null;
        setEnvio(resumo || aviso ? { ok: resultado.ok === true, titulo: resumo?.titulo ?? null, linhas: resumo?.linhas ?? [], aviso } : null);

        if (!resultado.ok) {
          if (Array.isArray(resultado.precisaDeposito) && resultado.precisaDeposito.length > 0) {
            // Nada foi enviado: a lib quer saber em qual deposito lancar. A mensagem dela e a pergunta.
            setDeposito(null);
            setDepositos({ lista: resultado.precisaDeposito, motivo: resultado.erro });
          } else {
            setErro(resultado.erro ?? "O envio nao foi concluido.");
          }
        }

        if (mudouNoBling(tipo, resultado)) {
          setQual("lendo");
          setLeitura(await chamar(abrirJanelaBling, [produto.id], false));
        }
      } finally {
        setQual(null);
      }
    });
  }

  function lerDeNovo() {
    setErro(null);
    setEnvio(null);
    setDepositos(null);
    setLeitura(null);
    iniciarTransicao(async () => {
      setLeitura(await chamar(abrirJanelaBling, [produto.id], false));
    });
  }

  const sincronizar = () => enviar("sincronizar", () => chamar(sincronizarComBling, [produto.id], true));
  const cadastrar = () => enviar("cadastrar", () => chamar(cadastrarProdutoNoBling, [produto.id], true));
  const enviarEstoque = (depositoId) =>
    enviar("estoque", () => chamar(enviarEstoqueAoBling, depositoId === undefined ? [produto.id] : [produto.id, depositoId], true));

  // O botao principal do rodape e o envio que faz sentido no estado da janela.
  let principal;
  if (carregando) principal = { rotulo: "Lendo o Bling...", executar: () => {} };
  else if (!leitura.ok) principal = { rotulo: "Ler de novo", executar: lerDeNovo };
  else if (leitura.situacao === "nao_existe") principal = { rotulo: "Cadastrar no Bling", executar: cadastrar };
  else principal = { rotulo: "Sincronizar com o Bling", executar: sincronizar };

  let rotuloDoBotao = principal.rotulo;
  if (qual === "sincronizar" || qual === "cadastrar") rotuloDoBotao = "Enviando...";
  else if (qual === "lendo") rotuloDoBotao = "Atualizando...";

  const avisos = leitura?.avisos ?? [];
  const estoque = leitura?.estoque ?? null;
  // Sem o sku a leitura falhou antes de achar o produto no Rise: nao ha estoque a mostrar.
  const mostraEstoque = Boolean(estoque && leitura?.sku);
  const escritaBloqueada = leitura?.ok && leitura.escrita?.liberada === false;

  return (
    <Popup
      titulo="Sincronizacao com o Bling"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={principal.executar}
      rotuloBotao={rotuloDoBotao}
      pendente={pendente}
      erro={erro}
    >
      <div ref={foco} tabIndex={-1} aria-busy={pendente} className="max-h-[45vh] space-y-3 overflow-y-auto pr-1 focus:outline-none">
        {carregando ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-suave">
            <Loader size={16} className="animate-spin" />
            Lendo o Bling...
          </p>
        ) : (
          <>
            {!leitura.ok && (
              <p role="alert" className={`rounded border p-2.5 text-xs ${CLASSE_DO_TOM.erro}`}>
                {leitura.erro ?? "Nao foi possivel ler o Bling."}
              </p>
            )}

            {leitura.ok && leitura.situacao === "nao_existe" && (
              <section aria-label="Produto fora do Bling" className="rounded border border-borda bg-fundo p-2.5 text-xs">
                <p className="font-medium">Este codigo nao esta no Bling</p>
                <p className="mt-1 text-suave">
                  O codigo <span className="font-mono">{leitura.sku}</span> nao foi achado entre os produtos ativos do Bling.
                  &quot;Cadastrar no Bling&quot; cria o produto la com os dados do Rise. Se ele existe inativo no Bling, reative-o
                  la em vez de cadastrar.
                </p>
              </section>
            )}

            {leitura.ok && leitura.situacao === "existe" && (
              <Diferencas diferencas={leitura.diferencas ?? []} iguais={leitura.iguais ?? 0} />
            )}

            {avisos.length > 0 && (
              <ul className={`space-y-1 rounded border p-2 text-xs ${CLASSE_DO_TOM.atencao}`}>
                {avisos.map((aviso, indice) => (
                  <li key={`${indice}-${aviso}`}>{aviso}</li>
                ))}
              </ul>
            )}

            {mostraEstoque && (
              <section aria-label="Estoque" className="rounded border border-borda p-2.5">
                <p className="text-xs font-medium">Estoque</p>
                <dl className="mt-1.5 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-suave">Saldo no Bling</dt>
                    <dd className="text-base tabular-nums">{estoque.blingSaldo ?? "nao lido"}</dd>
                    {/* Sem leitura agora (codigo fora do Bling ou erro), o saldo e o ultimo guardado no Rise. */}
                    {estoque.blingSaldo !== null && (
                      <dd className="text-[11px] text-suave">{leitura.situacao === "existe" ? "lido agora" : "ultimo lido"}</dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-[11px] text-suave">Estoque no Rise</dt>
                    <dd className="text-base tabular-nums">{estoque.riseEstoque}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-suave">Ajustes pendentes</dt>
                    <dd className="text-base tabular-nums">{estoque.pendentes}</dd>
                  </div>
                </dl>
                <p className="mt-1.5 text-[11px] text-suave">O estoque do Rise e o saldo do Bling mais os ajustes ainda nao enviados.</p>

                {leitura.ok && leitura.situacao === "existe" && estoque.pendentes > 0 && !depositos && (
                  <button type="button" onClick={() => enviarEstoque()} disabled={pendente} className={`mt-2 ${CLASSE_DO_BOTAO_SECUNDARIO}`}>
                    {qual === "estoque" && <Loader size={13} className="animate-spin" />}
                    {qual === "estoque" ? "Enviando..." : "Enviar ajustes de estoque"}
                  </button>
                )}

                {depositos && (
                  <fieldset className={`mt-2 rounded border p-2.5 ${CLASSE_DO_TOM.atencao}`}>
                    <legend className="px-1 text-xs font-medium">Escolha o deposito</legend>
                    <p className="text-xs">{depositos.motivo}</p>
                    {/* O Enter num radio enviaria o formulario inteiro, e o botao principal do rodape e
                        outro envio (sincronizar): aqui o Enter nao faz nada. */}
                    <div
                      className="mt-1.5 space-y-1"
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter") evento.preventDefault();
                      }}
                    >
                      {depositos.lista.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="radio"
                            name="deposito-bling"
                            checked={deposito === item.id}
                            onChange={() => setDeposito(item.id)}
                            disabled={pendente}
                          />
                          {item.descricao || `Deposito ${item.id}`}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => enviarEstoque(deposito)}
                      disabled={pendente || deposito === null}
                      className={`mt-2 ${CLASSE_DO_BOTAO_SECUNDARIO}`}
                    >
                      {qual === "estoque" && <Loader size={13} className="animate-spin" />}
                      {qual === "estoque" ? "Enviando..." : "Enviar ajustes neste deposito"}
                    </button>
                  </fieldset>
                )}
              </section>
            )}

            {escritaBloqueada && (
              <p className={`rounded border p-2 text-xs ${CLASSE_DO_TOM.atencao}`}>
                <span className="font-medium">Envio ao Bling bloqueado.</span> {leitura.escrita.motivo}
              </p>
            )}
          </>
        )}
      </div>

      {envio && (
        <div role="status" className={`mt-3 rounded border p-2.5 text-xs ${CLASSE_DO_TOM[envio.ok ? "ok" : "atencao"]}`}>
          {envio.titulo && (
            <p className="flex items-start gap-1.5 font-medium">
              {envio.ok && <CircleCheck size={14} className="mt-px shrink-0" />}
              {envio.titulo}
            </p>
          )}
          {envio.linhas.length > 0 && (
            <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-5">
              {envio.linhas.map((linha, indice) => (
                <li key={`${indice}-${linha}`}>{linha}</li>
              ))}
            </ul>
          )}
          {envio.aviso && <p className={envio.titulo ? "mt-1" : ""}>{envio.aviso}</p>}
        </div>
      )}
    </Popup>
  );
}
