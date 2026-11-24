import { registrarAuditoria } from "@/lib/acessos/banco";
import { cifrar, decifrar } from "@/lib/crypto";
import { prisma } from "@/lib/db";

/**
 * A senha do portal de compras do cliente (24/11/2026, Opcao 1 do dono: "cifrada no Rise"). Uma por cliente, cifrada com a
 * mesma chave das integracoes (`cifrar` de src/lib/crypto.js). So o "Mostrar" a decifra; nada a leva ao navegador, ao MCP,
 * ao PDF ou ao Historico.
 */

const MAXIMO_SENHA = 200;

/**
 * O que gravar na coluna: `undefined` = manter a gravada (campo em branco no Salvar), `null` = apagar, texto = a nova,
 * cifrada. Sem `trim`: espaco faz parte da senha.
 */
export function senhaDoPortalParaGravar({ nova, apagar } = {}) {
  if (apagar) return null;
  const senha = String(nova ?? "");
  if (!senha) return undefined;
  return cifrar({ senha: senha.slice(0, MAXIMO_SENHA) });
}

/**
 * A senha nova e o "Apagar" do formulario do cliente, lidos direto do FormData: o `lerCampos` do Salvar corta as pontas de
 * todo campo, e a senha com espaco no comeco ou no fim seria gravada errada, sem aviso.
 */
export function senhaDoFormulario(formData) {
  const nova = formData?.get?.("portalSenhaNova");
  return { nova: typeof nova === "string" ? nova : "", apagar: formData?.get?.("portalSenhaApagar") === "on" };
}

/** A senha decifrada, ou o motivo. Cifra de outra chave (a copia do banco no PC, por exemplo) e aviso, nunca erro 500. */
export function abrirSenhaDoPortal(cifrada) {
  if (!cifrada) return { ok: false, erro: "Nenhuma senha gravada." };
  try {
    const aberta = decifrar(cifrada);
    if (typeof aberta?.senha !== "string") throw new Error("formato");
    return { ok: true, senha: aberta.senha };
  } catch {
    return { ok: false, erro: "Senha gravada com outra chave; grave de novo." };
  }
}

/**
 * O "Mostrar": decifra e deixa no Historico quem viu e de qual cliente, sem a senha. Quem chama confere o acesso
 * (`senhaDoPortalAcao`).
 */
export async function senhaDoPortalDoCliente(clienteId, { quem, db = prisma } = {}) {
  const cliente = await db.cliente.findUnique({ where: { id: String(clienteId ?? "") }, select: { id: true, portalSenhaCifrada: true } });
  if (!cliente) return { ok: false, erro: "Este cliente não existe mais." };
  const aberta = abrirSenhaDoPortal(cliente.portalSenhaCifrada);
  if (!aberta.ok) return aberta;
  await db.$transaction((tx) => registrarAuditoria(tx, { quem, oQue: "cliente.portal.verSenha", alvo: cliente.id }));
  return aberta;
}
