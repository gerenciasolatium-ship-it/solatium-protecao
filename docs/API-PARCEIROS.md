# API de Parceiros — Proteção Solatium (M11)

Integração para o **CRM do parceiro** enviar os dados do cliente e receber um
**link que abre o wizard "Nova Proteção" já preenchido**. O vendedor da loja só
confere os dados, faz a vistoria e cobra — sem redigitar nada.

Funciona com qualquer CRM que consiga fazer uma chamada HTTP (integração nativa,
Zapier/Make, webhook, script).

## Autenticação

Cada loja/parceiro recebe uma chave de API (`psk_...`), enviada no header
`x-api-key` de toda chamada. A chave é criada pelo backoffice Solatium
(`POST /api/lojas/{lojaId}/chaves-api` — a chave completa aparece **só** na
resposta da criação; guarde-a em local seguro). Revogação imediata via
`DELETE /api/lojas/{lojaId}/chaves-api/{id}`.

## 1. Criar proposta pré-preenchida

```
POST {BASE_URL}/api/integracao/propostas
x-api-key: psk_...
Content-Type: application/json
```

```json
{
  "cliente": {
    "nome": "Maria Souza",
    "cpf": "52998224725",
    "telefoneWhatsapp": "11999998888",
    "email": "maria@exemplo.com",
    "nascimento": "1990-05-20"
  },
  "aparelho": {
    "marca": "Apple",
    "modelo": "iPhone 15",
    "armazenamentoGb": 128,
    "cor": "Azul",
    "imei": "354328661234567",
    "valorMercado": 3500.0
  },
  "referenciaExterna": "deal-8123"
}
```

- `cliente` é obrigatório (nome, CPF válido e WhatsApp); `email` e `nascimento` opcionais.
- `aparelho` é opcional — mande o que o CRM tiver; o vendedor completa o resto.
- `referenciaExterna` é o id do negócio no CRM do parceiro; volta em toda consulta.

**Resposta:**

```json
{
  "id": "9a6f...",
  "status": "ABERTA",
  "link": "https://loja.protecaosolatium.com.br/protecao/nova?proposta=3fd2c1...",
  "expiraEm": "2026-07-15T18:00:00.000Z",
  "referenciaExterna": "deal-8123"
}
```

O CRM exibe/envia o `link` para o vendedor da loja. O link expira em **7 dias**.

## 2. Consultar andamento

```
GET {BASE_URL}/api/integracao/propostas/{id}
x-api-key: psk_...
```

```json
{
  "id": "9a6f...",
  "status": "CONCLUIDA",
  "referenciaExterna": "deal-8123",
  "utilizadaEm": "2026-07-08T14:03:00.000Z",
  "contrato": {
    "id": "c1b2...",
    "status": "ATIVO",
    "certificado": { "numero": "PS-2026-000042", "status": "ATIVO", "vigenciaFim": "2027-07-08T14:10:00.000Z" }
  }
}
```

| status | significado |
|---|---|
| `ABERTA` | criada pelo CRM, vendedor ainda não abriu o link |
| `UTILIZADA` | o wizard já carregou os dados na loja |
| `CONCLUIDA` | virou contrato (com certificado quando o pagamento confirma) |
| `EXPIRADA` | link venceu sem uso — crie outra proposta |

## Erros

Formato padrão `{ "statusCode": 400, "mensagem": "..." }`.

- `401` — chave ausente, inválida ou revogada.
- `400` — validação (ex.: CPF inválido, nome curto). `mensagem` lista os campos.
- `404` — proposta inexistente ou de outra loja.

## Segurança

- Uma chave por parceiro/loja — o link gerado só abre para vendedores logados **da própria loja**.
- Chave armazenada como SHA-256 (irrecuperável); prefixo `psk_xxxxxxxx` identifica a chave no painel.
- Env `APP_LOJA_URL` define a base do link gerado (default `http://localhost:5173`).
