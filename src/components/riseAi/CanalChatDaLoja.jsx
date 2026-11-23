"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";

import { guardarSegredoDoChatAcao, removerSegredoDoChatAcao, testarChaveDoChatAcao } from "@/app/rise-ai/configuracoes/acoes";
import { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

/**
 * Canais > Chat da loja (o Hobi). Linha-guia: o dono precisa ver primeiro SE o chat esta no ar e o que falta, e a acao
 * principal e Salvar. Os tres assuntos ficam em abas internas, todas montadas (campo desmontado nao entraria no envio).
 *
 * Os segredos (a chave de IA e o segredo do Turnstile) NAO sao do Salvar: cada um tem o seu Guardar, e so de escrita: o
 * campo esvazia e a tela mostra apenas "cadastrada em". Por isso nao sao `<form>` (ficariam dentro do formulario da aba).
 */

const NAO_PREPARADO = "O serviço do chat ainda não foi preparado na VPS.";
const DIAS = [
  { valor: 1, letra: "S", nome: "Segunda" },
  { valor: 2, letra: "T", nome: "Terça" },
  { valor: 3, letra: "Q", nome: "Quarta" },
  { valor: 4, letra: "Q", nome: "Quinta" },
  { valor: 5, letra: "S", nome: "Sexta" },
  { valor: 6, letra: "S", nome: "Sábado" },
  { valor: 0, letra: "D", nome: "Domingo" },
];
const LIMITES = [
  { nome: "mensagensPorSessaoPorHora", rotulo: "Mensagens por visitante, por hora" },
  { nome: "mensagensPorIpPorHora", rotulo: "Mensagens por IP, por hora" },
  { nome: "caracteresPorMensagem", rotulo: "Caracteres por mensagem" },
  { nome: "respostasAoMesmoTempo", rotulo: "Respostas ao mesmo tempo" },
  { nome: "brlPorSessaoPorDia", rotulo: "Gasto por visitante, por dia (R$)", dinheiro: true },
  { nome: "brlPorDia", rotulo: "Gasto do chat, por dia (R$)", dinheiro: true },
];
const ABAS = [
  { id: "atendimento", rotulo: "Atendimento", campos: ["chatDaLoja.nome", "chatDaLoja.boasVindas", "chatDaLoja.horario"] },
  { id: "chaves", rotulo: "Chaves e instalação", campos: ["chatDaLoja.turnstileSiteKey"] },
  { id: "limites", rotulo: "Limites e modelos", campos: ["chatDaLoja.limites", "chatDaLoja.principal", "chatDaLoja.reserva"] },
];
const AJUDA = {
  whatsapp: "Os números de Configurações › Dados da empresa. O comercial recebe quem pede uma pessoa, pagamento, pedido e o que o assistente não sabe; o de suporte técnico recebe defeito, ligação, código e instalação.",
  horario: "Só decide o aviso do botão do WhatsApp: fora do horário, ele diz que a resposta vem no próximo dia útil. O assistente responde a qualquer hora.",
  ia: "A chave da API do provedor, criada só para o chat e com teto de gasto no painel do provedor. Fica cifrada e nunca volta para a tela.",
  turnstile: "No painel da Cloudflare, em Turnstile, crie um site para a loja. Ele dá duas chaves: a pública (o campo abaixo) e a secreta (este campo).",
  publica: "A chave pública do Turnstile (site key). Não é segredo: vai junto com a janela do chat.",
  etiqueta: "Cole na Loja Integrada, onde ela aceita código HTML no rodapé. A etiqueta muda a cada versão da janela; a antiga continua funcionando até você colar a nova.",
  quemVe: "\"Só em teste\": o chat aparece só para quem abre a loja com ?assistente=1 no endereço. \"Todos\": aparece para todos os visitantes.",
};
const botao = "h-9 rounded-md border border-borda px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-acento px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const diaEMes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
// Dinheiro sempre com dois centavos ("0,50"); em branco fica em branco.
const comVirgula = (numero) => (numero === "" || numero == null ? "" : Number(numero).toFixed(2).replace(".", ","));

/** Os valores do formulario a partir do grupo salvo. Tudo texto, como a tela edita. */
function valoresDe(canal) {
  const turno = (posicao, ponta) => canal.horario?.turnos?.[posicao]?.[ponta] ?? "";
  return {
    ligado: Boolean(canal.ligado),
    publico: Boolean(canal.publico),
    nome: canal.nome ?? "",
    boasVindas: canal.boasVindas ?? "",

    turnstileSiteKey: canal.turnstileSiteKey ?? "",
    dias: [...(canal.horario?.dias ?? [])].sort((a, b) => a - b),
    turno1De: turno(0, 0),
    turno1Ate: turno(0, 1),
    turno2De: turno(1, 0),
    turno2Ate: turno(1, 1),
    principal: `${canal.principal?.provedor ?? ""}/${canal.principal?.modelo ?? ""}`,
    reserva: canal.reserva ? `${canal.reserva.provedor}/${canal.reserva.modelo}` : "",
    limites: Object.fromEntries(LIMITES.map(({ nome, dinheiro }) => [nome, dinheiro ? comVirgula(canal.limites?.[nome] ?? "") : String(canal.limites?.[nome] ?? "")])),
  };
}

function Interruptor({ ligado, aoMudar, rotulo, desabilitado = false, motivo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      title={motivo}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ligado ? "translate-x-5" : ""}`} />
    </button>
  );
}

function Rotulo({ para, children, ajuda }) {
  return (
    <label htmlFor={para} className="flex items-center gap-1 text-sm font-semibold">
      {children}
      {ajuda && <BolhaDeAjuda variante="inline" texto={ajuda} />}
    </label>
  );
}

const Erro = ({ texto }) => (texto ? <p className="mt-1 text-xs text-red-700">{texto}</p> : null);

/** Um segredo do servico: so de escrita. Guardar, "cadastrada em", Remover (dois cliques) e, na chave de IA, Testar. */
function CampoDeSegredo({ nome, rotulo, ajuda, situacao, podeEditar, preparado, provedorParaTestar = null }) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [aviso, setAviso] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const travado = !podeEditar || !preparado;
  const motivo = !podeEditar ? MOTIVO_SO_LEITURA : !preparado ? NAO_PREPARADO : undefined;

  function executar(acao, mensagem) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.ok === false) return setAviso({ tipo: "erro", texto: resultado.erro });
      setAviso({ tipo: "ok", texto: typeof mensagem === "function" ? mensagem(resultado) : mensagem });
      router.refresh();
    });
  }
  function guardar() {
    if (!valor.trim() || travado) return;
    const dados = new FormData();
    dados.set("valor", valor);
    setValor("");
    executar(() => guardarSegredoDoChatAcao(nome, dados), "Guardada.");
  }
  function remover() {
    if (!confirmando) return setConfirmando(true);
    setConfirmando(false);
    executar(() => removerSegredoDoChatAcao(nome), "Removida.");
  }
  const testar = () => executar(() => testarChaveDoChatAcao(provedorParaTestar), (teste) => `Conectou em ${teste.latenciaMs} ms.`);

  return (
    <div className="flex flex-col gap-1.5">
      <Rotulo para={`segredo-${nome}`} ajuda={ajuda}>
        {rotulo}
      </Rotulo>
      <div className="flex gap-2">
        <input
          id={`segredo-${nome}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={valor}
          disabled={travado}
          title={motivo}
          onChange={(evento) => setValor(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key !== "Enter") return;
            evento.preventDefault();
            guardar();
          }}
          placeholder={situacao.cadastrado ? "••••••••  (cole outra para trocar)" : "Cole aqui"}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} mt-0`}
        />
        <button type="button" disabled={pendente || travado || !valor.trim()} title={motivo} onClick={guardar} className={botaoPrincipal}>
          <KeyRound size={14} aria-hidden="true" /> Guardar
        </button>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-3 text-xs">
        {/* Regra 8 do Padrao visual: campo travado diz por que numa linha, nao so no title (o dono achou que colar estava quebrado). */}
        <span className={situacao.cadastrado ? "text-emerald-700" : podeEditar && !preparado ? "text-amber-700" : "text-suave"}>{situacao.cadastrado ? `Cadastrada${situacao.em ? ` em ${diaEMes(situacao.em)}` : ""}` : podeEditar && !preparado ? NAO_PREPARADO : "Não cadastrada"}</span>
        {aviso && (
          <span className={aviso.tipo === "ok" ? "text-emerald-700" : "text-red-700"} role="status">
            {aviso.texto}
          </span>
        )}
        {situacao.cadastrado && provedorParaTestar && (
          <button type="button" disabled={pendente || travado} title={motivo} onClick={testar} className={`${botao} ml-auto h-8 text-xs`}>
            {pendente ? "Aguarde…" : "Testar chave"}
          </button>
        )}
        {situacao.cadastrado && podeEditar && (
          <button type="button" disabled={pendente} onClick={remover} className={`h-8 rounded-md px-2 text-xs text-red-700 transition-[background-color] duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:opacity-50 ${provedorParaTestar ? "" : "ml-auto"}`}>
            {confirmando ? "Clique de novo para remover" : "Remover"}
          </button>
        )}
      </div>
    </div>
  );
}

function Etiqueta({ widget }) {
  const [copiada, setCopiada] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(widget.etiqueta);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Sem permissao de area de transferencia: o campo continua selecionavel a mao.
    }
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-borda pt-4">
      <Rotulo para="etiqueta-do-chat" ajuda={AJUDA.etiqueta}>
        Etiqueta para a Loja Integrada <span className="font-normal text-suave">· versão {widget.versao}</span>
      </Rotulo>
      <div className="flex gap-2">
        <input id="etiqueta-do-chat" readOnly value={widget.etiqueta} onFocus={(evento) => evento.target.select()} className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} mt-0 font-mono text-xs`} />
        <button type="button" onClick={copiar} className={`${botao} inline-flex shrink-0 items-center gap-1`}>
          {copiada ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copiada ? "Copiada" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{ podeEditar: boolean, inicial: object, modelos: { valor: string, rotulo: string }[], aoMudarSujo?: (sujo: boolean) => void,
 *   estado: { preparado: boolean, segredos: Record<string, { cadastrado: boolean, em: string | null }>, noAr: boolean,
 *     sinal: { versao: string | null, emAndamento: number, ultimoErro: string | null } | null,
 *     widget: { versao: string, etiqueta: string } | null, faltas: string[] } }} props
 */
export default function CanalChatDaLoja({ podeEditar, inicial, estado, modelos, aoMudarSujo }) {
  const [valores, setValores] = useState(() => valoresDe(inicial));
  const [aba, setAba] = useState("atendimento");
  const { erros, aviso, pendente, salvar } = useSalvarAba("canais");
  const mudar = (nome, valor) => setValores((atual) => ({ ...atual, [nome]: valor }));
  const sujo = JSON.stringify(valores) !== JSON.stringify(valoresDe(inicial));
  useEffect(() => {
    aoMudarSujo?.(sujo);
  }, [aoMudarSujo, sujo]);

  const erroDe = (campo) => Object.entries(erros).find(([chave]) => chave === campo || chave.startsWith(`${campo}.`))?.[1] ?? null;
  const abaComErro = (item) => item.campos.some((campo) => erroDe(campo));

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    for (const nome of ["ligado", "publico"]) dados.set(`chat.${nome}`, String(valores[nome]));
    for (const nome of ["nome", "boasVindas", "turnstileSiteKey", "turno1De", "turno1Ate", "turno2De", "turno2Ate", "principal", "reserva"]) dados.set(`chat.${nome}`, valores[nome]);
    dados.set("chat.horario", "1");
    for (const dia of valores.dias) dados.append("chat.dias", String(dia));
    for (const { nome } of LIMITES) dados.set(`chat.limite.${nome}`, valores.limites[nome]);
    salvar(dados);
  }

  // O estado numa linha: cor = situacao; a frase so aparece quando pede acao.
  const faltas = estado.faltas;
  const situacao = !inicial.ligado
    ? { cor: "bg-slate-400", texto: "Desligado" }
    : faltas.length
      ? { cor: "bg-amber-500", texto: `Ligado, mas fora do ar: falta ${faltas[0]}${faltas.length > 1 ? ` (e mais ${faltas.length - 1})` : ""}` }
      : estado.noAr
        ? { cor: "bg-emerald-600", texto: `No ar${estado.sinal?.versao ? ` · versão ${estado.sinal.versao}` : ""} · ${estado.sinal?.emAndamento ?? 0} resposta(s) agora` }
        : { cor: "bg-red-600", texto: "Ligado, mas o serviço não dá sinal" };
  const travado = !podeEditar;
  const naoPodeLigar = !valores.ligado && faltas.length > 0;
  const provedorDe = (escolha) => escolha.split("/")[0];
  const principal = provedorDe(valores.principal);
  const reserva = valores.reserva ? provedorDe(valores.reserva) : null;
  const ROTULO_DO_PROVEDOR = { openai: "OpenAI", anthropic: "Anthropic" };
  const campo = (nome, erro) => `${CLASSE_CAMPO} ${bordaDoCampo(Boolean(erro))}`;

  return (
    <form onSubmit={aoEnviar} className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${situacao.cor}`} aria-hidden="true" />
            <span className="truncate">{situacao.texto}</span>
          </span>
          <Interruptor
            ligado={valores.ligado}
            aoMudar={(valor) => mudar("ligado", valor)}
            rotulo="Chat da loja ligado"
            desabilitado={travado || naoPodeLigar}
            motivo={travado ? MOTIVO_SO_LEITURA : naoPodeLigar ? `Para ligar falta: ${faltas.join("; ")}.` : undefined}
          />
        </div>
        <Erro texto={erroDe("chatDaLoja.ligado")} />
        <div className="flex flex-wrap items-center gap-3 border-t border-borda pt-3">
          <span className="flex items-center gap-1 text-sm font-medium">
            Quem vê
            <BolhaDeAjuda variante="inline" texto={AJUDA.quemVe} />
          </span>
          <div role="radiogroup" aria-label="Quem vê o chat" className="flex overflow-hidden rounded-md border border-borda text-sm">
            {[
              { valor: false, rotulo: "Só em teste" },
              { valor: true, rotulo: "Todos os visitantes" },
            ].map((opcao) => (
              <label key={String(opcao.valor)} className={`cursor-pointer px-3 py-1.5 transition-[background-color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento ${valores.publico === opcao.valor ? "bg-acento font-medium text-white" : "hover:bg-fundo"}`}>
                <input type="radio" name="quem-ve-o-chat" disabled={travado} className="sr-only" checked={valores.publico === opcao.valor} onChange={() => mudar("publico", opcao.valor)} />
                {opcao.rotulo}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-borda">
        <div role="tablist" aria-label="Configuração do chat da loja" className="flex gap-1 border-b-2 border-borda px-2">
          {ABAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={aba === item.id}
              onClick={() => setAba(item.id)}
              className={`-mb-0.5 flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-[color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none ${aba === item.id ? "border-acento font-semibold" : "border-transparent text-suave hover:text-inherit"}`}
            >
              {item.rotulo}
              {abaComErro(item) && <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-label="tem erro" />}
            </button>
          ))}
        </div>

        <div role="tabpanel" hidden={aba !== "atendimento"} className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <div>
              <Rotulo para="chat-nome">Nome do assistente</Rotulo>
              <input id="chat-nome" disabled={travado} value={valores.nome} maxLength={40} onChange={(evento) => mudar("nome", evento.target.value)} className={campo("nome", erroDe("chatDaLoja.nome"))} />
              <Erro texto={erroDe("chatDaLoja.nome")} />
            </div>
            {/* Os WhatsApp moram em Dados da empresa (pedido do dono em 22/11/2026): aqui so se mostra, para haver um lugar so. */}
            <div>
              <span className="flex items-center gap-1 text-sm font-semibold">
                WhatsApp
                <BolhaDeAjuda variante="inline" texto={AJUDA.whatsapp} />
              </span>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-suave">Comercial</dt>
                <dd className={estado.whatsapp?.comercial ? "tabular-nums" : "text-red-700"}>{estado.whatsapp?.comercial ?? "não cadastrado"}</dd>
                <dt className="text-suave">Suporte técnico</dt>
                <dd className={estado.whatsapp?.tecnico ? "tabular-nums" : "text-suave"}>{estado.whatsapp?.tecnico ?? "não cadastrado (vai para o comercial)"}</dd>
              </dl>
              <a href="/configuracoes/empresa" className="mt-1 inline-block text-xs text-acento hover:underline">
                Alterar em Dados da empresa
              </a>
            </div>
          </div>
          <div>
            <Rotulo para="chat-boas-vindas">Saudação</Rotulo>
            <textarea id="chat-boas-vindas" disabled={travado} rows={2} maxLength={300} value={valores.boasVindas} onChange={(evento) => mudar("boasVindas", evento.target.value)} className={campo("boasVindas", erroDe("chatDaLoja.boasVindas"))} />
            <Erro texto={erroDe("chatDaLoja.boasVindas")} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold">
              Horário de atendimento
              <BolhaDeAjuda variante="inline" texto={AJUDA.horario} />
            </span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex gap-1" role="group" aria-label="Dias de atendimento">
                {DIAS.map((dia) => {
                  const marcado = valores.dias.includes(dia.valor);
                  return (
                    <label key={dia.valor} title={dia.nome} className={`grid h-9 w-9 cursor-pointer place-items-center rounded-md border text-sm transition-[background-color,border-color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento ${marcado ? "border-emerald-600 bg-emerald-600 font-semibold text-white" : "border-borda hover:bg-fundo"}`}>
                      <input
                        type="checkbox"
                      disabled={travado}
                        className="sr-only"
                        aria-label={dia.nome}
                        checked={marcado}
                        onChange={() => mudar("dias", marcado ? valores.dias.filter((valor) => valor !== dia.valor) : [...valores.dias, dia.valor].sort((a, b) => a - b))}
                      />
                      {dia.letra}
                    </label>
                  );
                })}
              </div>
              {[1, 2].map((numero) => (
                <div key={numero} className="flex items-center gap-1.5 text-sm">
                  <input type="time" aria-label={`Turno ${numero}, início`} disabled={travado} value={valores[`turno${numero}De`]} onChange={(evento) => mudar(`turno${numero}De`, evento.target.value)} className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} mt-0 w-28`} />
                  <span className="text-suave">às</span>
                  <input type="time" aria-label={`Turno ${numero}, fim`} disabled={travado} value={valores[`turno${numero}Ate`]} onChange={(evento) => mudar(`turno${numero}Ate`, evento.target.value)} className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} mt-0 w-28`} />
                </div>
              ))}
            </div>
            <Erro texto={erroDe("chatDaLoja.horario")} />
          </div>
        </div>

        <div role="tabpanel" hidden={aba !== "chaves"} className="flex flex-col gap-4 p-4">
          <CampoDeSegredo nome={principal} rotulo={`Chave da IA (${ROTULO_DO_PROVEDOR[principal] ?? principal})`} ajuda={AJUDA.ia} situacao={estado.segredos[principal] ?? { cadastrado: false, em: null }} podeEditar={podeEditar} preparado={estado.preparado} provedorParaTestar={principal} />
          {reserva && reserva !== principal && (
            <CampoDeSegredo nome={reserva} rotulo={`Chave da IA da reserva (${ROTULO_DO_PROVEDOR[reserva] ?? reserva})`} ajuda={AJUDA.ia} situacao={estado.segredos[reserva] ?? { cadastrado: false, em: null }} podeEditar={podeEditar} preparado={estado.preparado} provedorParaTestar={reserva} />
          )}
          <CampoDeSegredo nome="turnstile" rotulo="Segredo do Turnstile" ajuda={AJUDA.turnstile} situacao={estado.segredos.turnstile ?? { cadastrado: false, em: null }} podeEditar={podeEditar} preparado={estado.preparado} />
          <div>
            <Rotulo para="chat-site-key" ajuda={AJUDA.publica}>
              Chave pública do Turnstile
            </Rotulo>
            <input id="chat-site-key" disabled={travado} value={valores.turnstileSiteKey} spellCheck={false} onChange={(evento) => mudar("turnstileSiteKey", evento.target.value)} className={`${campo("turnstileSiteKey", erroDe("chatDaLoja.turnstileSiteKey"))} font-mono`} />
            <Erro texto={erroDe("chatDaLoja.turnstileSiteKey")} />
          </div>
          {estado.widget && <Etiqueta widget={estado.widget} />}
        </div>

        <div role="tabpanel" hidden={aba !== "limites"} className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {LIMITES.map(({ nome, rotulo }) => (
              <div key={nome}>
                <Rotulo para={`chat-limite-${nome}`}>{rotulo}</Rotulo>
                <input
                  id={`chat-limite-${nome}`}
                  disabled={travado}
                  inputMode="decimal"
                  value={valores.limites[nome]}
                  onChange={(evento) => mudar("limites", { ...valores.limites, [nome]: evento.target.value })}
                  className={`${campo(nome, erroDe(`chatDaLoja.limites.${nome}`))} tabular-nums`}
                />
                <Erro texto={erroDe(`chatDaLoja.limites.${nome}`)} />
              </div>
            ))}
          </div>
          <div className="grid gap-4 border-t border-borda pt-4 sm:grid-cols-2">
            <div>
              <Rotulo para="chat-principal">Modelo principal</Rotulo>
              <select id="chat-principal" disabled={travado} value={valores.principal} onChange={(evento) => mudar("principal", evento.target.value)} className={campo("principal", erroDe("chatDaLoja.principal"))}>
                {modelos.map((modelo) => (
                  <option key={modelo.valor} value={modelo.valor}>
                    {modelo.rotulo}
                  </option>
                ))}
              </select>
              <Erro texto={erroDe("chatDaLoja.principal")} />
            </div>
            <div>
              <Rotulo para="chat-reserva">Modelo de reserva</Rotulo>
              <select id="chat-reserva" disabled={travado} value={valores.reserva} onChange={(evento) => mudar("reserva", evento.target.value)} className={campo("reserva", erroDe("chatDaLoja.reserva"))}>
                <option value="">Sem reserva</option>
                {modelos.map((modelo) => (
                  <option key={modelo.valor} value={modelo.valor}>
                    {modelo.rotulo}
                  </option>
                ))}
              </select>
              <Erro texto={erroDe("chatDaLoja.reserva")} />
            </div>
          </div>
        </div>
      </section>

      <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
    </form>
  );
}
