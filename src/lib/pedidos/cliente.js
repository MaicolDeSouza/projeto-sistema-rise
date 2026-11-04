import { formatarCep, formatarCnpj, formatarCpf, validarCnpj, validarCpf } from "@/lib/documentos";
import { telefoneParaGravar } from "@/lib/telefone";

/**
 * O cliente de um pedido (spec 5.3): o Cliente de Cadastros casado pelo documento ou criado na hora, para o pedido
 * nunca ficar sem dono. Regras do dono: sem documento o pedido fica sem cliente (aviso `clienteSemDocumento`, nunca
 * um cliente "sem CPF"); documento que nao passa no digito verificador cria mesmo assim (o pedido existe), com o
 * aviso `documentoInvalido` e a nota nas observacoes; cliente que ja existe NUNCA tem o nome nem o endereco
 * reescritos pelo canal (o dono edita o cadastro), so o telefone e o e-mail vazios sao preenchidos.
 *
 * `tx` e o cliente Prisma ou a transacao de quem grava o pedido (Tarefa 8), para o cliente e o pedido entrarem juntos.
 */
export async function clienteDoPedido(tx, normalizado) {
  const comprador = normalizado?.comprador ?? {};
  const avisos = [];
  const digitos = String(comprador.documento ?? "").replace(/\D/g, "");
  if (!digitos) return { clienteId: null, avisos: ["clienteSemDocumento"] };

  let tipoPessoa = "FISICA";
  let documento;
  if (digitos.length === 14 && validarCnpj(digitos)) {
    tipoPessoa = "JURIDICA";
    documento = formatarCnpj(digitos);
  } else if (digitos.length === 11 && validarCpf(digitos)) {
    documento = formatarCpf(digitos);
  } else {
    // Tamanho estranho ou digito verificador errado: grava como veio (so digitos, formatado quando da) para o
    // dono conferir, e avisa. Formatar um documento de outro tamanho inventaria pontos no lugar errado.
    avisos.push("documentoInvalido");
    documento = digitos.length === 11 ? formatarCpf(digitos) : digitos.length === 14 ? formatarCnpj(digitos) : digitos;
    if (digitos.length === 14) tipoPessoa = "JURIDICA";
  }

  const telefone = comprador.telefone ? telefoneParaGravar(String(comprador.telefone)) : null;
  const email = String(comprador.email ?? "").trim() || null;

  const existente = await tx.cliente.findUnique({ where: { documento }, select: { id: true, telefone: true, email: true } });
  if (existente) {
    const preencher = {};
    if (!existente.telefone && telefone) preencher.telefone = telefone;
    if (!existente.email && email) preencher.email = email;
    if (Object.keys(preencher).length > 0) await tx.cliente.update({ where: { id: existente.id }, data: preencher });
    return { clienteId: existente.id, avisos };
  }

  const endereco = normalizado?.enderecoDeEntrega ?? {};
  const temEndereco = Boolean(endereco.cep || endereco.endereco || endereco.cidade);
  const nota = `Criado pelo pedido ${normalizado?.canal ?? normalizado?.origem ?? "?"} ${normalizado?.numero ?? ""}`.trim();
  const criado = await tx.cliente.create({
    data: {
      nome: String(comprador.nome ?? "").trim() || "Comprador sem nome",
      tipoPessoa,
      documento,
      telefone,
      email,
      observacoes: avisos.includes("documentoInvalido") ? `${nota} — documento inválido` : nota,
      enderecos: temEndereco
        ? {
            create: [
              {
                tipo: "GERAL",
                cep: endereco.cep ? formatarCep(endereco.cep) : null,
                uf: endereco.uf ?? null,
                cidade: endereco.cidade ?? null,
                bairro: endereco.bairro ?? null,
                logradouro: endereco.endereco ?? null,
                numero: endereco.numero ?? null,
                complemento: endereco.complemento ?? null,
              },
            ],
          }
        : undefined,
    },
    select: { id: true },
  });
  return { clienteId: criado.id, avisos };
}
