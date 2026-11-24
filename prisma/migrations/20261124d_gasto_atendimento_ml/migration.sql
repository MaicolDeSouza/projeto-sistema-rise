-- O gasto da sugestao de resposta do Atendimento do ML (spec 2026-11-24-atendimento-ml-design.md): um tipo novo de GastoIA.
-- So acrescenta o valor ao enum; nenhuma linha muda.

-- AlterEnum
ALTER TYPE "TipoDeGastoIA" ADD VALUE 'ATENDIMENTO_ML';
