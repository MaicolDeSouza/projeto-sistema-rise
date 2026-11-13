"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, FileDown, Link2, Loader2, MessageCircle, MoreVertical, PhoneCall, Send, ShoppingCart, Undo2, XCircle } from "lucide-react";

import { linkPublicoAcao, marcarEnviadaAcao, mudarSituacaoAcao, registrarContatoAcao, salvarPropostaAcao, gerarPedidoDeVendaAcao } from "@/app/propostas/acoes";
import Pergunta from "@/components/compras/Pergunta";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { marcarTelaIniciada } from "@/components/mercados/NavegacaoDoTopo";
import { MOTIVOS_DE_RECUSA, camposDoPadrao, dataBR, linhasDasExigencias, linkDoWhatsApp, mensagemDoWhatsApp, numeroDaProposta, pendenciasDoPdf, precisaContato } from "@/lib/propostas/regras";
import { lerListaDaTela, pedirVoltaNaRolagem } from "@/lib/ultimaListaDaTela";
import { AbasDaProposta, CartaoFrete, CartaoPagamento, CartaoTotais, HistoricoDeContatos } from "./BlocosDaProposta";
import CartaoCliente, { campo, Rotulo } from "./CartaoCliente";
import { entradaDoFormulario, formularioDaProposta, moeda, totaisDoFormulario } from "./formato";
import ItensDaProposta from "./ItensDaProposta";
import { AlertaDeContato, SeloDaSituacao } from "./TabelaPropostas";
import { AnexosDaCotacao, JanelaContato, JanelaPedidoDeVenda, JanelaRecusar } from "./JanelasDaProposta";

/**
 * O editor da proposta. Linha-guia (Padrao visual): o operador ve primeiro o CLIENTE, os ITENS e o TOTAL; a acao
 * principal e Salvar, e o "Gerar PDF" fecha a linha de botoes. Aprovar, Recusar, Reabrir e o pedido de venda moram no
 * menu da situacao. Aprovada e Recusada ficam so leitura (Reabrir volta a Em negociacao).
 */
export default function EditorProposta({ propostaInicial, transportadoras, condicoes, padroes = [], podeEditar, podePedidoDeVenda }) {
  const router = useRouter();
  const [proposta, setProposta] = useState(propostaInicial);
  const [cliente, setCliente] = useState(propostaInicial.cliente);
  const [base, setBase] = useState(() => formularioDaProposta(propostaInicial));
  const [formulario, setFormulario] = useState(base);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvoAgora, setSalvoAgora] = useState(false);
  const [pergunta, setPergunta] = useState(null);
  const [menu, setMenu] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const veCusto = !proposta.custoCortado;
  const editar = podeEditar && !proposta.soLeitura;
  const alterado = useMemo(() => JSON.stringify(formulario) !== JSON.stringify(base), [formulario, base]);
  const totais = useMemo(() => totaisDoFormulario(formulario), [formulario]);
  // O padrao em uso: o da lista (pode ter mudado) ou o gravado na proposta (padrao desativado some da lista).
  const padrao = padroes.find((p) => p.id === formulario.padraoId) ?? (proposta.padrao?.id === formulario.padraoId ? proposta.padrao : null);
  const exigeMarcaModelo = Boolean(padrao?.exigeMarcaModelo);
  const pendencias = pendenciasDoPdf({ clienteNome: formulario.clienteNome || cliente?.nome, itens: formulario.itens, exigeMarcaModelo });

  useEffect(() => {
    if (!alterado) return undefined;
    const avisar = (evento) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  const irParaALista = () => {
    marcarTelaIniciada();
    pedirVoltaNaRolagem("/propostas");
    router.push(lerListaDaTela("/propostas"), { scroll: false });
  };
  const voltar = () => (alterado ? setPergunta("sair") : irParaALista());

  function aplicar(nova) {
    setProposta(nova);
    setCliente(nova.cliente);
    const f = formularioDaProposta(nova);
    setBase(f);
    setFormulario(f);
  }
  const mudar = (campoDoFormulario, valor) => setFormulario((antes) => ({ ...antes, [campoDoFormulario]: valor }));

  /** Escolher o padrao copia as regras dele para a proposta (validade, pagamento, frete, garantia, observacoes). */
  function aplicarPadrao(id) {
    const escolhido = padroes.find((p) => p.id === id);
    setFormulario((antes) => (escolhido ? { ...antes, ...camposDoPadrao(escolhido) } : { ...antes, padraoId: "" }));
  }

  function ligarCliente(lido) {
    setCliente(lido);
    // O cliente com padrao (SENAI...) traz as regras dele, se a proposta ainda nao tem padrao escolhido.
    const doCliente = padroes.find((p) => p.id === lido.padraoPropostaId);
    setFormulario((antes) => ({
      ...antes,
      ...(doCliente && !antes.padraoId ? camposDoPadrao(doCliente) : {}),
      clienteId: lido.id,
      clienteNome: lido.nome,
      clienteDocumento: lido.documento ?? "",
      contatoId: "",
      // So preenche o que esta vazio: trocar de cliente nao apaga o que o operador ja escolheu.
      transportadoraId: antes.transportadoraId || lido.transportadoraId || "",
      condicaoPagamentoId: antes.condicaoPagamentoId || lido.condicoesPreferidas?.[0]?.id || "",
    }));
  }
  function desligarCliente() {
    setCliente(null);
    setFormulario((antes) => ({ ...antes, clienteId: null, contatoId: "", clienteNome: "", clienteDocumento: "", clienteTelefone: "", clienteEmail: "" }));
  }

  /** Grava; devolve a proposta salva ou null (com os erros na tela). */
  async function salvar() {
    setErroGeral(null);
    const resposta = await salvarPropostaAcao(proposta.numero, entradaDoFormulario(formulario));
    if (!resposta?.ok) {
      setErros(resposta?.erros ?? {});
      setErroGeral(resposta?.erros ? "Confira os campos marcados em vermelho." : resposta?.erro ?? "Não foi possível salvar.");
      return null;
    }
    setErros({});
    setAviso(resposta.avisoBling ? `Cliente cadastrado no Rise, mas o Bling não recebeu: ${resposta.avisoBling}` : null);
    aplicar(resposta.proposta);
    setSalvoAgora(true);
    setTimeout(() => setSalvoAgora(false), 2500);
    return resposta.proposta;
  }
  const salvarAqui = () => iniciar(async () => void (await salvar()));

  /** PDF, link e WhatsApp saem do que esta SALVO: com alteracao, salva antes. */
  async function salvoParaEnviar() {
    if (alterado && editar) return Boolean(await salvar());
    return true;
  }

  const abrirPdf = () =>
    iniciar(async () => {
      if (!(await salvoParaEnviar())) return;
      window.open(`/api/propostas/${proposta.numero}/pdf`, "_blank", "noopener");
      await marcarEnviadaAcao(proposta.numero);
      router.refresh();
    });
  const copiarLink = () =>
    iniciar(async () => {
      if (!(await salvoParaEnviar())) return;
      const resposta = await linkPublicoAcao(proposta.numero);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível criar o link.");
      try {
        await navigator.clipboard.writeText(resposta.url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      } catch {
        window.prompt("Copie o link público da proposta:", resposta.url);
      }
      router.refresh();
    });
  const telefoneDoWhats = cliente?.contatos?.find((c) => c.id === formulario.contatoId)?.telefone || cliente?.telefone || formulario.clienteTelefone;
  const abrirWhatsApp = () =>
    iniciar(async () => {
      if (!(await salvoParaEnviar())) return;
      const resposta = await linkPublicoAcao(proposta.numero);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível criar o link.");
      const nome = cliente?.contatos?.find((c) => c.id === formulario.contatoId)?.nome ?? formulario.clienteNome;
      const url = linkDoWhatsApp(telefoneDoWhats, mensagemDoWhatsApp({ numero: proposta.numero, nome, link: resposta.url }));
      if (url) window.open(url, "_blank", "noopener");
      router.refresh();
    });

  const mudarSituacao = (para, extras) =>
    iniciar(async () => {
      if (alterado && editar && !(await salvar())) return setPergunta(null);
      const resposta = await mudarSituacaoAcao(proposta.numero, para, extras);
      setPergunta(null);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível mudar a situação.");
      aplicar(resposta.proposta);
      router.refresh();
    });
  const registrar = (dados) =>
    iniciar(async () => {
      const resposta = await registrarContatoAcao(proposta.numero, dados);
      setPergunta(null);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível registrar o contato.");
      // So o proximo contato e o historico mudam: o resto do formulario fica como estava (pode ter alteracao nao salva).
      setProposta(resposta.proposta);
      setBase((antes) => ({ ...antes, proximoContato: resposta.proposta.proximoContato ?? "" }));
      setFormulario((antes) => ({ ...antes, proximoContato: resposta.proposta.proximoContato ?? "" }));
      router.refresh();
    });
  const gerarPedido = () =>
    iniciar(async () => {
      const resposta = await gerarPedidoDeVendaAcao(proposta.numero);
      setPergunta(null);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível gerar o pedido.");
      aplicar(resposta.proposta);
      setAviso(null);
    });

  const situacao = proposta.situacao;
  const contatoAgora = precisaContato({ situacao, proximoContato: formulario.proximoContato || null });
  const itemDoMenu = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50";
  const botaoSecundario = "inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-sm text-texto hover:bg-fundo hover:text-acento disabled:opacity-50";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={voltar} aria-label="Voltar às propostas" title="Voltar às propostas" className="rounded-md p-1.5 text-suave hover:bg-superficie hover:text-texto">
            <ArrowLeft size={20} />
          </button>
          <h1 className="truncate text-2xl font-semibold text-balance">
            {numeroDaProposta(proposta.numero)}
            {(cliente?.nome || formulario.clienteNome) && <span className="text-suave"> · {cliente?.nome || formulario.clienteNome}</span>}
          </h1>
          <SeloDaSituacao situacao={situacao} />
          {contatoAgora && <AlertaDeContato />}
        </div>
        <p className="text-xs text-suave">
          Criada por {proposta.criadoPorNome || proposta.criadoPor} em {new Date(proposta.criadoEm).toLocaleDateString("pt-BR")}
          {situacao === "RECUSADA" && proposta.motivoRecusa && ` · recusada: ${MOTIVOS_DE_RECUSA[proposta.motivoRecusa]}${proposta.motivoRecusaTexto ? ` (${proposta.motivoRecusaTexto})` : ""}`}
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-lg border border-borda bg-superficie px-4 py-2.5">
        {editar && (
          <button type="button" onClick={salvarAqui} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {ocupado && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        )}
        <button type="button" onClick={voltar} className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo">
          {editar ? "Cancelar" : "Voltar"}
        </button>
        <span className="mx-1 h-6 w-px bg-borda" aria-hidden="true" />
        <button type="button" onClick={copiarLink} disabled={ocupado || pendencias.length > 0} title={pendencias.join(" ") || "Copiar o link que o cliente abre sem login (sempre a proposta salva)"} className={botaoSecundario}>
          {copiado ? <Check size={16} className="text-emerald-600" /> : <Link2 size={16} />} {copiado ? "Link copiado" : "Link público"}
        </button>
        <button
          type="button"
          onClick={abrirWhatsApp}
          disabled={ocupado || pendencias.length > 0 || !linkDoWhatsApp(telefoneDoWhats, "x")}
          title={pendencias.join(" ") || (linkDoWhatsApp(telefoneDoWhats, "x") ? "Enviar o link pelo WhatsApp" : "Sem telefone do cliente ou do A/C")}
          className={botaoSecundario}
        >
          <MessageCircle size={16} /> WhatsApp
        </button>
        {podeEditar && (
          <button type="button" onClick={() => setPergunta("contato")} disabled={ocupado} className={botaoSecundario}>
            <PhoneCall size={16} /> Registrar contato
          </button>
        )}
        {podeEditar && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((aberto) => !aberto)} aria-label="Situação da proposta" aria-expanded={menu} title="Situação da proposta" className="rounded-md p-2 text-suave hover:bg-fundo hover:text-texto">
              <MoreVertical size={18} />
            </button>
            {menu && (
              <div className="absolute left-0 z-20 mt-1 w-60 rounded-md border border-borda bg-superficie py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                {situacao === "RASCUNHO" && (
                  <button type="button" className={itemDoMenu} onClick={() => (setMenu(false), mudarSituacao("ENVIADA"))}>
                    <Send size={15} /> Marcar como enviada
                  </button>
                )}
                {["ENVIADA", "RASCUNHO"].includes(situacao) && (
                  <button type="button" className={itemDoMenu} onClick={() => (setMenu(false), mudarSituacao("EM_NEGOCIACAO"))}>
                    <PhoneCall size={15} /> Em negociação
                  </button>
                )}
                {["RASCUNHO", "ENVIADA", "EM_NEGOCIACAO"].includes(situacao) && (
                  <>
                    <button type="button" className={`${itemDoMenu} text-emerald-700`} onClick={() => (setMenu(false), setPergunta("aprovar"))}>
                      <CheckCircle2 size={15} /> Aprovada pelo cliente
                    </button>
                    <button type="button" className={`${itemDoMenu} text-rose-600`} onClick={() => (setMenu(false), setPergunta("recusar"))}>
                      <XCircle size={15} /> Recusada
                    </button>
                  </>
                )}
                {["APROVADA", "RECUSADA", "VENCIDA"].includes(situacao) && (
                  <button type="button" className={itemDoMenu} onClick={() => (setMenu(false), mudarSituacao("EM_NEGOCIACAO"))}>
                    <Undo2 size={15} /> Reabrir
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {alterado && <span className="text-sm font-medium text-amber-700">Alterações não salvas</span>}
        {salvoAgora && !alterado && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check size={15} /> Salvo</span>}
        <div className="ml-auto flex items-center gap-2">
          {situacao === "APROVADA" && podePedidoDeVenda && !proposta.pedidoDeVendaBlingId && (
            <button type="button" onClick={() => setPergunta("pedido")} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              <ShoppingCart size={15} /> Gerar pedido de venda
            </button>
          )}
          {proposta.pedidoDeVendaBlingId && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700" title={`Pedido ${proposta.pedidoDeVendaBlingId} no Bling`}>
              <ShoppingCart size={15} /> Pedido de venda gerado no Bling
            </span>
          )}
          <button
            type="button"
            onClick={abrirPdf}
            disabled={ocupado || pendencias.length > 0}
            title={pendencias.join(" ") || (situacao === "RASCUNHO" ? "Abrir o PDF (a proposta passa a Enviada)" : "Abrir o PDF")}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-acento px-3.5 py-1.5 text-sm font-semibold text-acento transition-[background-color,transform] duration-150 hover:bg-acento/5 active:scale-[0.97] disabled:opacity-50"
          >
            <FileDown size={15} /> Gerar PDF
          </button>
        </div>
      </div>

      {erroGeral && <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">{erroGeral}</p>}
      {aviso && <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800" role="status">{aviso}</p>}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <CartaoCliente formulario={formulario} cliente={formulario.clienteId ? cliente : null} editar={editar} erros={erros} aoMudar={mudar} aoLigarCliente={ligarCliente} aoDesligarCliente={desligarCliente} />
          <SecaoDoAnuncio titulo="Validade e contato">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Rotulo texto="Válida até" erro={erros.validadeAte}>
                <input type="date" value={formulario.validadeAte} disabled={!podeEditar || (proposta.soLeitura && situacao !== "VENCIDA")} aria-invalid={Boolean(erros.validadeAte)} onChange={(e) => mudar("validadeAte", e.target.value)} className={campo} />
              </Rotulo>
              <Rotulo texto="Padrão do cliente" className="col-span-2 lg:col-span-1">
                <select value={formulario.padraoId} disabled={!editar} onChange={(e) => aplicarPadrao(e.target.value)} className={campo} title="Aplica validade, pagamento, frete, garantia e observações do padrão">
                  <option value="">Sem padrão</option>
                  {padroes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                  {padrao && !padroes.some((p) => p.id === padrao.id) && <option value={padrao.id}>{padrao.nome}</option>}
                </select>
              </Rotulo>
              <Rotulo texto="Próximo contato" erro={erros.proximoContato}>
                <input type="date" value={formulario.proximoContato} disabled={!editar} onChange={(e) => mudar("proximoContato", e.target.value)} className={`${campo} ${contatoAgora ? "border-amber-400 bg-amber-50" : ""}`} />
              </Rotulo>
            </div>
            {situacao === "VENCIDA" && <p className="mt-2 text-xs text-suave">Venceu em {dataBR(proposta.validadeAte)}. Mude a data e salve para reabrir.</p>}
          </SecaoDoAnuncio>
        </div>

        {linhasDasExigencias(padrao?.exigencias).length > 0 && (
          <details open className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-amber-900">Exigências do cliente ({padrao.nome}) · só na tela, não vão ao PDF</summary>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-amber-950 md:grid-cols-2">
              {linhasDasExigencias(padrao.exigencias).map((linha) => (
                <li key={linha}>{linha}</li>
              ))}
            </ol>
          </details>
        )}

        <ItensDaProposta numero={proposta.numero} exigeMarcaModelo={exigeMarcaModelo} itens={formulario.itens} editar={editar} veCusto={veCusto} erros={erros} aoMudar={mudar} aoTrocar={(itens) => mudar("itens", itens)} aoErro={setErroGeral} />

        <CartaoTotais formulario={formulario} totais={totais} editar={editar} erros={erros} aoMudar={mudar} veCusto={veCusto} />

        <div className="grid gap-6 lg:grid-cols-2">
          <CartaoPagamento formulario={formulario} condicoes={condicoes} editar={editar} erros={erros} aoMudar={mudar} />
          <CartaoFrete formulario={formulario} transportadoras={transportadoras} editar={editar} erros={erros} aoMudar={mudar} />
        </div>

        <AbasDaProposta
          formulario={formulario}
          editar={editar}
          aoMudar={mudar}
          quantos={{ contatos: proposta.contatos.length, cotacao: proposta.anexos.length }}
          contatos={<HistoricoDeContatos contatos={proposta.contatos} />}
          cotacao={<AnexosDaCotacao numero={proposta.numero} anexos={proposta.anexos} editar={podeEditar} aoAtualizar={(nova) => setProposta((antes) => ({ ...antes, anexos: nova.anexos }))} />}
        />
      </div>

      {pergunta === "sair" && (
        <Pergunta titulo="Sair sem salvar?" confirmar="Sair sem salvar" recuar="Continuar editando" destrutiva aoRecuar={() => setPergunta(null)} aoConfirmar={irParaALista}>
          As alterações desta proposta ainda não foram salvas e serão perdidas.
        </Pergunta>
      )}
      {pergunta === "aprovar" && (
        <Pergunta titulo={`${numeroDaProposta(proposta.numero)} aprovada pelo cliente?`} confirmar={alterado ? "Salvar e marcar aprovada" : "Marcar aprovada"} ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => mudarSituacao("APROVADA")}>
          A proposta fica só leitura (Reabrir volta a Em negociação). Total {moeda.format(totais.total)}.
        </Pergunta>
      )}
      {pergunta === "recusar" && <JanelaRecusar numero={proposta.numero} ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={(extras) => mudarSituacao("RECUSADA", extras)} />}
      {pergunta === "contato" && <JanelaContato numero={proposta.numero} ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={registrar} />}
      {pergunta === "pedido" && <JanelaPedidoDeVenda proposta={proposta} moeda={moeda} ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={gerarPedido} />}
    </div>
  );
}
