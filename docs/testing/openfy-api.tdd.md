# Openfy API — evidência TDD

As jornadas foram definidas a partir da migração solicitada para uma API Next.js
com Elysia, Swagger, Bun e Axios.

| # | Garantia | Teste/comando | Tipo | Resultado |
|---|---|---|---|---|
| 1 | A API expõe saúde versionada | `apps/openfy-api/src/__tests__/app.test.ts` | Unitário | PASS |
| 2 | Expo Web local passa pelo CORS, sem liberar origens arbitrárias em produção | `app.test.ts` | Unitário | PASS |
| 3 | Importação de YouTube inválida é rejeitada antes de alcançar a engine | `app.test.ts` | Unitário | PASS |
| 4 | Uma resolução válida é encaminhada para a engine | `app.test.ts` | Integração de contrato | PASS |
| 5 | Erros internos não expõem a mensagem upstream ao cliente | `app.test.ts` | Unitário | PASS |
| 6 | Swagger é exposto pelo serviço | `app.test.ts` | Integração de contrato | PASS |
| 7 | A ponte preserva resposta parcial de áudio e cabeçalhos `Range` | `nodeRequestAdapter.test.ts` | Integração de contrato | PASS |
| 8 | A ponte encaminha corpos POST | `nodeRequestAdapter.test.ts` | Integração de contrato | PASS |
| 9 | O Next não é forçado a executar dentro do runtime Bun | `runtimeScript.test.ts` | Unitário | PASS |
| 10 | Corpos JSON validados são recriados antes de chegar à engine | `app.test.ts` | Integração de contrato | PASS |
| 11 | Cookies do YouTube são aceitos somente do ambiente e em formato Netscape | `youtubeCredentials.test.ts` | Unitário | PASS |
| 12 | O binário `yt-dlp` é autorizado explicitamente pelo Bun | `runtimeScript.test.ts` | Unitário | PASS |
| 13 | Falhas do stream do YouTube preservam um código estruturado até o cliente | `app.test.ts` | Integração de contrato | PASS |
| 14 | Cliente InnerTube iOS produz stream AAC válido antes do fallback `yt-dlp` | `youtubeInnertube.test.js` | Unitário | PASS |

## Evidência RED

- `bun test src/__tests__/app.test.ts` falhou inicialmente porque
  `createApiApp` ainda não existia.
- `bun test src/__tests__/nodeRequestAdapter.test.ts` falhou inicialmente
  porque `handleNodeServerRequest` ainda não existia.
- O teste CORS falhou antes da configuração do plugin, pois o cabeçalho
  `Access-Control-Allow-Origin` estava ausente.
- Os testes de encaminhamento POST falharam com `Body already used` antes de
  a ponte recriar o corpo que o Elysia já havia validado.
- `runtimeScript.test.ts` falhou antes de remover `bun --bun next`, que faz o
  runtime do Next/Turbopack falhar ao carregar módulos CommonJS.

## Evidência GREEN

- `bun test --coverage`: 18 testes passaram; 90,25% de funções e 95,69% de
  linhas cobertas.
- `bun run typecheck`: passou.
- `bun run build`: passou.
- `npm test -- --runInBand`: 21 suítes passaram, 25 permaneceram skipped pela
  configuração existente; 50 testes passaram.
- Teste HTTP local de `/health`, `/swagger`, preflight CORS e stream de áudio
  parcial passou, com `206`, `audio/mp4` e `Content-Range` preservado.

## Limitações conhecidas

O adaptador mantém o motor atual durante a migração. Em produção, tarefas
realmente pesadas podem ser encaminhadas via `OPENFY_LEGACY_ENGINE_URL`; o
Next/Vercel permanece responsável pelo contrato HTTPS, validação, CORS,
Swagger e streaming.
