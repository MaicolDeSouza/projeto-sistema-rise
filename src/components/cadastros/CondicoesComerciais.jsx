"use client";

import { useState } from "react";
import Link from "next/link";

import { FORMAS_DE_PAGAMENTO, TEXTO_DO_FRETE } from "@/lib/propostas/regras";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";
import ListaDeValores from "./ListaDeValores";
import SenhaDoPortal from "./SenhaDoPortal";

const FRETES = ["CIF", "FOB", "A_COMBINAR"];

function Grupo({ titulo, children }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Caixa({ nome, rotulo, marcada, desabilitada = false, titulo }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${desabilitada ? "text-suave" : ""}`} title={titulo}>
      <input type="checkbox" name={nome} defaultChecked={marcada} disabled={desabilitada} className="h-4 w-4 accent-acento" />
      {rotulo}
    </label>
  );
}

/**
 * A aba "Condicoes comerciais" do cliente (24/11/2026, dono: "os dados devem ficar no cadastro do cliente junto com suas
 * peculiaridades"): o que a proposta deste cliente recebe ao ser ligada a ele (e o operador ainda muda na proposta), os
 * e-mails da NF e do rastreio e o acesso ao portal de compras. Nesta aba o operador ve primeiro como a proposta deste
 * cliente nasce (prazo, pagamento, frete) e a acao principal e o Salvar do cadastro.
 */
export default function CondicoesComerciais({ cliente, erros, transportadoras, condicoes, semPessoal, somenteLeitura }) {
  const inicial = cliente ?? {};
  const valor = (campo) => inicial[campo] ?? "";
  const [frete, setFrete] = useState(inicial.propostaFretePorConta ?? "");
  const contatos = (inicial.contatos ?? []).map((contato) => contato.nome).filter(Boolean);

  return (
    <div className="space-y-6">
      <Grupo titulo="Proposta">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo
            nome="propostaValidadeDias"
            rotulo="Validade (dias)"
            type="number"
            min={1}
            max={365}
            placeholder="15"
            erro={erros.propostaValidadeDias}
            defaultValue={valor("propostaValidadeDias")}
            ajuda="Vazio: 15 dias."
          />
          <Campo nome="condicaoPagamentoId" rotulo="Condição de pagamento" erro={erros.condicaoPagamentoId}>
            <select id="condicaoPagamentoId" name="condicaoPagamentoId" defaultValue={valor("condicaoPagamentoId")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.condicaoPagamentoId)}`}>
              <option value="">Nenhuma</option>
              {condicoes.map((condicao) => (
                <option key={condicao.id} value={condicao.id}>
                  {condicao.nome}
                </option>
              ))}
            </select>
            {condicoes.length === 0 && (
              <p className="mt-1 text-[11px] text-suave">
                Nenhuma condição cadastrada.{" "}
                <Link href="/cadastros/condicoes" className="text-acento hover:underline">
                  Cadastrar
                </Link>
              </p>
            )}
          </Campo>
          <Campo nome="propostaFormaPagamento" rotulo="Forma de pagamento" erro={erros.propostaFormaPagamento}>
            <select id="propostaFormaPagamento" name="propostaFormaPagamento" defaultValue={valor("propostaFormaPagamento")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.propostaFormaPagamento)}`}>
              <option value="">Não definida</option>
              {FORMAS_DE_PAGAMENTO.map((forma) => (
                <option key={forma} value={forma}>
                  {forma}
                </option>
              ))}
            </select>
          </Campo>
          <div className="md:col-span-3">
            <Campo nome="propostaPagamentoTexto" rotulo="Texto do pagamento" erro={erros.propostaPagamentoTexto} ajuda="Vai no PDF depois do resumo do pagamento.">
              <textarea id="propostaPagamentoTexto" name="propostaPagamentoTexto" rows={2} defaultValue={valor("propostaPagamentoTexto")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.propostaPagamentoTexto)}`} />
            </Campo>
          </div>
          <Campo nome="propostaFretePorConta" rotulo="Frete" erro={erros.propostaFretePorConta}>
            <select
              id="propostaFretePorConta"
              name="propostaFretePorConta"
              value={frete}
              onChange={(evento) => setFrete(evento.target.value)}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.propostaFretePorConta)}`}
            >
              <option value="">Não definido</option>
              {FRETES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {TEXTO_DO_FRETE[tipo]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo nome="transportadoraId" rotulo="Transportadora" erro={erros.transportadoraId}>
            <select id="transportadoraId" name="transportadoraId" defaultValue={valor("transportadoraId")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.transportadoraId)}`}>
              <option value="">Nenhuma</option>
              {transportadoras.map((transportadora) => (
                <option key={transportadora.id} value={transportadora.id}>
                  {transportadora.nome}
                </option>
              ))}
            </select>
            {transportadoras.length === 0 && (
              <p className="mt-1 text-[11px] text-suave">
                Nenhuma transportadora cadastrada.{" "}
                <Link href="/cadastros/transportadoras/novo" className="text-acento hover:underline">
                  Cadastrar
                </Link>
              </p>
            )}
          </Campo>
          <Campo nome="propostaGarantia" rotulo="Garantia" placeholder="90 dias" erro={erros.propostaGarantia} defaultValue={valor("propostaGarantia")} ajuda="Vazio: 90 dias." />
          <div className="flex items-end pb-2">
            <Caixa
              nome="propostaFreteDiluido"
              rotulo="Diluir o frete no preço"
              marcada={inicial.propostaFreteDiluido === true}
              desabilitada={frete !== "CIF"}
              titulo={frete !== "CIF" ? "Só com frete CIF." : undefined}
            />
          </div>
          <Campo nome="propostaAc" rotulo="A/C das propostas" list="contatos-do-cliente" erro={erros.propostaAc} defaultValue={valor("propostaAc")} ajuda="Um contato do cliente ou um texto, como “Grupo de Compras”." />
          <datalist id="contatos-do-cliente">
            {contatos.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Caixa nome="propostaMarcaModelo" rotulo="Marca/Modelo no PDF" marcada={inicial.propostaMarcaModelo === true} />
          <Caixa nome="propostaAssinar" rotulo="Assinar digitalmente" marcada={inicial.propostaAssinar === true} />
          <Caixa nome="propostaFaturamentoMinimo" rotulo="Faturamento mínimo no PDF" marcada={inicial.propostaFaturamentoMinimo === true} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo nome="propostaObservacoes" rotulo="Observações no PDF" erro={erros.propostaObservacoes}>
            <textarea id="propostaObservacoes" name="propostaObservacoes" rows={4} defaultValue={valor("propostaObservacoes")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.propostaObservacoes)}`} />
          </Campo>
          <Campo nome="propostaExigencias" rotulo="Exigências do cliente" erro={erros.propostaExigencias} ajuda="Uma por linha. Aparecem só na tela da proposta, nunca no PDF.">
            <textarea id="propostaExigencias" name="propostaExigencias" rows={4} defaultValue={valor("propostaExigencias")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.propostaExigencias)}`} />
          </Campo>
        </div>
      </Grupo>

      {!semPessoal && (
        <>
          <Grupo titulo="Faturamento">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Onde o cliente recebe a nota fiscal eletronica (ex.: o almoxarifado da FUNPEC); vai ao contato do Bling. */}
              <ListaDeValores nome="emailsNotaFiscal" rotulo="E-mails da nota fiscal" rotuloIncluir="incluir e-mail da nota" inicial={inicial.emailsNotaFiscal} erro={erros.emailsNotaFiscal} type="email" />
              <Campo nome="notaFiscalObservacao" rotulo="Observação padrão da NF" erro={erros.notaFiscalObservacao} ajuda="Vira o “Para a nota fiscal” da proposta.">
                <textarea id="notaFiscalObservacao" name="notaFiscalObservacao" rows={2} defaultValue={valor("notaFiscalObservacao")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.notaFiscalObservacao)}`} />
              </Campo>
            </div>
          </Grupo>

          <Grupo titulo="Entrega">
            <div className="grid gap-4 md:grid-cols-2">
              <ListaDeValores nome="emailsRastreio" rotulo="E-mails do rastreio" rotuloIncluir="incluir e-mail do rastreio" inicial={inicial.emailsRastreio} erro={erros.emailsRastreio} type="email" />
            </div>
          </Grupo>

          <Grupo titulo="Portal de compras">
            <div className="grid gap-4 md:grid-cols-3">
              <Campo nome="portalUrl" rotulo="Link do portal" type="url" placeholder="https://" erro={erros.portalUrl} defaultValue={valor("portalUrl")} />
              <Campo nome="portalUsuario" rotulo="Usuário" autoComplete="off" erro={erros.portalUsuario} defaultValue={valor("portalUsuario")} />
              <div>
                <label htmlFor="portalSenhaNova" className="flex items-center gap-1 text-sm font-semibold">
                  Senha
                </label>
                <SenhaDoPortal clienteId={inicial.id ?? null} nomeDoCliente={inicial.nome} temSenha={inicial.temSenhaDoPortal === true} editar={!somenteLeitura} />
              </div>
              <div className="md:col-span-3">
                <Campo nome="portalObservacao" rotulo="Observação do portal" erro={erros.portalObservacao}>
                  <textarea id="portalObservacao" name="portalObservacao" rows={2} defaultValue={valor("portalObservacao")} className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.portalObservacao)}`} />
                </Campo>
              </div>
            </div>
          </Grupo>
        </>
      )}
    </div>
  );
}
