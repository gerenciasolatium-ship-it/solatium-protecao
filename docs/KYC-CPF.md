# Consulta externa de CPF (KYC) — autopreenchimento no balcão

No wizard "Nova Proteção", quando o vendedor digita um CPF **válido** (dígito
verificador conferido no cliente e no backend):

1. O app busca primeiro na **base própria** (`GET /clientes?busca=`) — cliente
   recorrente preenche nome/WhatsApp/email/nascimento sem consulta externa.
2. Se não é cliente, o app chama `GET /api/kyc/cpf/{cpf}` → provedor externo
   preenche **nome** e **nascimento** (sempre editáveis — o vendedor confere).
3. Provedor fora do ar / CPF não encontrado / não configurado → o formulário
   segue com digitação manual, sem travar o fluxo.

## Provedor

Implementado: **Serpro Consulta CPF** (fonte oficial Receita Federal).
Ativação por env — sem elas o endpoint responde `501` e o app ignora:

| Env | Valor |
|---|---|
| `SERPRO_CONSULTA_CPF_TOKEN` | Bearer token do contrato Serpro |
| `SERPRO_CONSULTA_CPF_URL` | opcional — default `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf` |

Contratação: https://loja.serpro.gov.br (produto "Consulta CPF", cobrança por
consulta). Outros provedores (Assertiva, Datavalid) entram como classes irmãs
de `SerproCpfProvider` sem mudar o contrato da rota.

## LGPD

- **Base legal**: art. 7º, V — execução de contrato e procedimentos
  preliminares a pedido do titular (o cliente está no balcão contratando a
  proteção). Recomendado citar a consulta na política de privacidade.
- **Trilha de auditoria**: TODA consulta (sucesso, não encontrado ou falha) é
  gravada em `audit_log` com `entidade=kyc_cpf`, CPF **mascarado**
  (`529******25`), usuário que consultou, IP e resultado. O CPF completo não é
  persistido no log.
- **Minimização**: só nome e nascimento são usados; nada além disso é
  armazenado a partir do provedor.
- Somente usuários autenticados (qualquer papel de loja/admin) conseguem
  consultar; a chave do provedor nunca vai ao frontend.

## Identificação de modelo pelo IMEI (TAC)

`GET /api/aparelhos/tac/{8 primeiros dígitos do IMEI}` identifica
marca/modelo/armazenamento pela **base própria de aparelhos** (o grupo mais
frequente com o mesmo TAC). Quanto mais vendas, melhor a cobertura. Um provedor
GSMA/IMEI-lookup externo pode ser plugado depois na mesma rota. O wizard usa
isso para sugerir o modelo assim que um IMEI válido é digitado (só quando
marca/modelo ainda estão vazios; sugestão sempre editável).
