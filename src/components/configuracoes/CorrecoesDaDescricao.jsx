"use client";

import { ArrowRight, ArrowRightLeft, Pencil, Plus, ScrollText, SpellCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { alternarCorrecaoAcao, excluirCorrecaoAcao, salvarCorrecaoAcao } from "@/app/configuracoes/correcoes-da-descricao/acoes";
import Pergunta from "@/components/compras/Pergunta";
import Janela from "@/components/ferramentas/licencas/Janela";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import CampoBusca from "@/components/ui/CampoBusca";
import EmptyState from "@/components/ui/EmptyState";
import EscolhaEntreOpcoes from "@/components/ui/EscolhaEntreOpcoes";
import PageHeader from "@/components/ui/PageHeader";
import { MAXIMO_EXPLICACAO, MAXIMO_TEXTO } from "@/lib/ia/correcoes";

/**
 * Correcoes da descricao (spec 2026-11-07): a lista do que o Rise corrige em toda descricao (TROCA) e do que vai para a
 * IA como regra (REGRA), vinda do chat, do popup do Salvar do produto ou desta tela. Linha-guia: o dono ve primeiro a
 * lista; a acao principal e "Nova correcao". Desligar nao apaga (a correcao guarda os usos e volta com um clique).
 */

const BOTAO_PRINCIPAL =
  "inline-flex items-center gap-1.5 rounded-md bg-acento px-3 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";
const BOTAO_ICONE =
  "rounded p-2 text-suave transition-colors duration-150 hover:bg-fundo hover:text-texto focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-40";
const CABECALHO = "px-3 py-2 font-medium";
const CELULA = "px-3 py-2.5 align-top";
const ORIGENS = { CHAT: "Chat", CADASTRO: "Cadastro", TELA: "Tela" };
const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });

export default function CorrecoesDaDescricao({ correcoes, prompts, busca, aviso, podeEditar }) {
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function alternar(correcao) {
    setErro(null);
    iniciar(async () => {
      const resultado = await alternarCorrecaoAcao(correcao.id, !correcao.ativa);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function excluir() {
    const alvo = excluindo;
    iniciar(async () => {
      const resultado = await excluirCorrecaoAcao(alvo.id);
      setExcluindo(null);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const acao = podeEditar ? (
    <button type="button" onClick={() => setEditando({})} className={BOTAO_PRINCIPAL}>
      <Plus size={15} aria-hidden="true" /> Nova correção
    </button>
  ) : null;

  return (
    <>
      <PageHeader
        titulo="Correções da descrição"
        voltarPara="/configuracoes"
        voltarRotulo="Configurações"
        acao={acao}
        somenteLeitura={podeEditar ? null : "Você pode ver as correções, mas só quem edita o cadastro de Produtos as muda."}
      />

      <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <CampoBusca valorInicial={busca} rotulo="Buscar no texto ou no porquê" className="w-full max-w-sm" />
          <BolhaDeAjuda
            variante="inline"
            texto={
              <>
                <span className="block">Troca: o Rise escreve o certo no lugar do errado em toda descrição (IA, proposta e o Salvar do produto).</span>
                <span className="block">Regra: uma instrução que vai para a IA e para o Claude junto com o prompt.</span>
              </>
            }
          />
        </div>
        {aviso && <p className="mx-4 mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{aviso}</p>}
        {erro && <p className="mx-4 mt-3 text-sm text-red-600" role="alert">{erro}</p>}

        {correcoes.length === 0 ? (
          <div className="p-4">
            <EmptyState icone={SpellCheck} titulo={busca ? "Nenhuma correção com esse texto." : "Nenhuma correção ainda."} />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-borda bg-fundo text-left text-xs text-suave">
                <tr>
                  <th className={`${CABECALHO} w-8`}><span className="sr-only">Tipo</span></th>
                  <th className={CABECALHO}>Correção</th>
                  <th className={CABECALHO}>Vale para</th>
                  <th className={CABECALHO}>Origem</th>
                  <th className={`${CABECALHO} text-right`}>Usos</th>
                  <th className={CABECALHO}>Criada</th>
                  <th className={CABECALHO}>Ligada</th>
                  {podeEditar && <th className={CABECALHO}><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {correcoes.map((correcao) => (
                  <tr key={correcao.id} className={correcao.ativa ? "" : "text-suave"}>
                    <td className={CELULA}>
                      {correcao.tipo === "TROCA" ? (
                        <ArrowRightLeft size={15} className="mt-0.5 text-suave" aria-label="Troca" />
                      ) : (
                        <ScrollText size={15} className="mt-0.5 text-suave" aria-label="Regra" />
                      )}
                    </td>
                    <td className={`${CELULA} max-w-md`}>
                      {correcao.tipo === "TROCA" ? (
                        <span className="flex flex-wrap items-center gap-x-1.5">
                          <span className="text-suave line-through">{correcao.errado}</span>
                          <ArrowRight size={13} aria-hidden="true" className="shrink-0 text-suave" />
                          <span className="font-medium">{correcao.certo}</span>
                        </span>
                      ) : (
                        <span className="font-medium">{correcao.certo}</span>
                      )}
                      {correcao.explicacao && <span className="mt-0.5 block truncate text-xs text-suave">{correcao.explicacao}</span>}
                    </td>
                    <td className={`${CELULA} whitespace-nowrap`}>
                      {correcao.promptNome ? (
                        <span title={prompts.includes(correcao.promptNome) ? undefined : "Este prompt não existe mais na biblioteca."}>
                          {correcao.promptNome}
                          {!prompts.includes(correcao.promptNome) && <span className="text-amber-700"> (não existe)</span>}
                        </span>
                      ) : (
                        "Todas"
                      )}
                    </td>
                    <td className={`${CELULA} whitespace-nowrap`} title={[correcao.produtoSku && `Produto ${correcao.produtoSku}`, correcao.criadoPor && `por ${correcao.criadoPor}`].filter(Boolean).join(", ")}>
                      {ORIGENS[correcao.origem] ?? correcao.origem}
                    </td>
                    <td className={`${CELULA} text-right tabular-nums`}>{correcao.usos}</td>
                    <td className={`${CELULA} whitespace-nowrap tabular-nums`}>{DATA.format(new Date(correcao.criadoEm))}</td>
                    <td className={CELULA}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={correcao.ativa}
                        aria-label={correcao.ativa ? "Desligar a correção" : "Ligar a correção"}
                        disabled={!podeEditar || ocupado}
                        onClick={() => alternar(correcao)}
                        // A area de clique passa do desenho (20x36): o `after` a leva a ~36x52 sem mudar a linha.
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-default ${correcao.ativa ? "bg-emerald-600" : "bg-slate-300"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${correcao.ativa ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    {podeEditar && (
                      <td className={`${CELULA} whitespace-nowrap text-right`}>
                        <button type="button" onClick={() => setEditando(correcao)} className={BOTAO_ICONE} aria-label="Editar a correção" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => setExcluindo(correcao)} className={BOTAO_ICONE} aria-label="Excluir a correção" title="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="h-2" />
      </div>

      {editando && <JanelaDaCorrecao correcao={editando.id ? editando : null} prompts={prompts} aoFechar={() => setEditando(null)} />}

      {excluindo && (
        <Pergunta titulo="Excluir correção?" confirmar="Excluir" destrutiva ocupado={ocupado} aoConfirmar={excluir} aoRecuar={() => setExcluindo(null)}>
          <span className="font-medium">{excluindo.tipo === "TROCA" ? `${excluindo.errado} → ${excluindo.certo}` : excluindo.certo}</span> deixa de valer e
          some da lista. Para só parar de usar, desligue.
        </Pergunta>
      )}
    </>
  );
}

/** Nova correcao ou edicao. O tipo so se escolhe na nova: uma TROCA que vira REGRA e outra correcao. */
function JanelaDaCorrecao({ correcao, prompts, aoFechar }) {
  const [tipo, setTipo] = useState(correcao?.tipo ?? "TROCA");
  const [alterado, setAlterado] = useState(false);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, iniciar] = useTransition();
  const idDoFormulario = "formulario-da-correcao";
  // O prompt de uma correcao antiga pode ter sido renomeado ou apagado: continua na lista, para a edicao nao o trocar.
  const escopos = correcao?.promptNome && !prompts.includes(correcao.promptNome) ? [...prompts, correcao.promptNome] : prompts;

  function enviar(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    dados.set("tipo", tipo);
    iniciar(async () => {
      const resultado = await salvarCorrecaoAcao(correcao?.id ?? null, dados);
      if (resultado.ok) {
        aoFechar();
        return;
      }
      const porCampo = resultado.erros ?? {};
      // A repetida volta sem campo: o lugar dela e o texto que repete (o errado na TROCA, a regra na REGRA).
      if (resultado.erro && Object.keys(porCampo).length === 0) setErros({ [tipo === "TROCA" ? "errado" : "certo"]: resultado.erro });
      else setErros(porCampo);
      setErro(Object.keys(porCampo).length === 0 && !resultado.erro ? "Não foi possível salvar." : null);
    });
  }

  const campo = "mt-1 w-full rounded border border-borda bg-fundo px-2 py-1.5 text-sm";
  const mensagem = (nome) => erros[nome] && <span className="mt-1 block text-xs text-red-600">{erros[nome]}</span>;

  return (
    <Janela
      titulo={correcao ? "Editar correção" : "Nova correção"}
      alterado={alterado}
      aoFechar={aoFechar}
      rodape={(fechar) => (
        <>
          {erro && <span className="text-sm text-red-600">{erro}</span>}
          <span className="flex-1" />
          <button type="button" onClick={fechar} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
            Cancelar
          </button>
          <button type="submit" form={idDoFormulario} disabled={salvando} className={BOTAO_PRINCIPAL}>
            Salvar
          </button>
        </>
      )}
    >
      <form id={idDoFormulario} onSubmit={enviar} onInput={() => setAlterado(true)} className="space-y-4">
        {correcao ? (
          <p className="text-sm text-suave">{tipo === "TROCA" ? "Troca" : "Regra"}</p>
        ) : (
          <EscolhaEntreOpcoes
            nome="tipo"
            rotulo="Tipo da correção"
            opcoes={[
              { valor: "TROCA", rotulo: "Troca" },
              { valor: "REGRA", rotulo: "Regra" },
            ]}
            valor={tipo}
            aoMudar={(valor) => {
              setTipo(valor);
              setAlterado(true);
            }}
          />
        )}
        {tipo === "TROCA" && (
          <label className="block text-sm">
            <span className="font-medium">Como está escrito</span>
            <input name="errado" defaultValue={correcao?.errado ?? ""} maxLength={MAXIMO_TEXTO} required autoFocus className={campo} placeholder="5 V" />
            {mensagem("errado")}
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium">{tipo === "TROCA" ? "Como deve ficar" : "Regra"}</span>
          <input
            name="certo"
            defaultValue={correcao?.certo ?? ""}
            maxLength={MAXIMO_TEXTO}
            required
            autoFocus={tipo === "REGRA"}
            className={campo}
            placeholder={tipo === "TROCA" ? "5V" : "Garantia sempre em meses"}
          />
          {mensagem("certo")}
        </label>
        <label className="block text-sm">
          <span className="font-medium">Vale para</span>
          <select name="promptNome" defaultValue={correcao?.promptNome ?? ""} className={campo}>
            <option value="">Todas as descrições</option>
            {escopos.map((nome) => (
              <option key={nome} value={nome}>
                Só o prompt “{nome}”
              </option>
            ))}
          </select>
          {mensagem("promptNome")}
        </label>
        <label className="block text-sm">
          <span className="font-medium">Por quê (opcional)</span>
          <input name="explicacao" defaultValue={correcao?.explicacao ?? ""} maxLength={MAXIMO_EXPLICACAO} className={campo} />
          {mensagem("explicacao")}
        </label>
      </form>
    </Janela>
  );
}
