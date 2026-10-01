# Arquitetura da Aplicação

Este documento define o caminho padrão para evoluir o Openfy sem concentrar regras de negócio nas telas nem transformar todo estado em estado global.

## Composição

- **Átomos** representam controles visuais pequenos e sem regras de domínio: ícones, botões, campos e indicadores.
- **Componentes de feature** compõem átomos e recebem dados/ações por props. Mantêm apenas estado visual efêmero, como foco, expansão de busca e animação local.
- **Telas** compõem features, conectam rotas a stores e iniciam casos de uso. Regras reutilizáveis de catálogo, biblioteca, reprodução e persistência ficam em `api/`, `services/` ou `src/application/`.
- Uma ação de usuário flui como intenção da tela/componente para uma action ou comando; a camada de serviço executa I/O; o store publica o estado resultante.

## Estado Global

Zustand é a fonte de verdade para estado de domínio compartilhado entre rotas: reprodução/fila, downloads, preferências, usuário e navegação/consulta da biblioteca. Os providers existentes continuam como pontos de inicialização ou adaptadores de compatibilidade, não como cópias paralelas desses dados.

Estado transitório que só pertence a uma tela permanece local em React. Animações baseadas em `SharedValue` permanecem no Reanimated e não são espelhadas no store. Seletores Zustand devem ser estreitos para evitar renders de áreas não relacionadas.

## Comandos e Idempotência

Use `executeCommand` para mutações disparadas pelo usuário que possam ser repetidas por toques, retries ou eventos concorrentes. Cada comando recebe nome estável, categoria de log e uma chave composta pela identidade do recurso e pelos parâmetros semânticos. O bus coalesce chamadas simultâneas; resultados só são reproduzidos por TTL quando o comando sinaliza sucesso. Para atualizações de preferência em que o último valor deve vencer, use `successTtlMs: 0` e mantenha apenas o coalescing durante a gravação.

Operações com semântica própria, como a geração de request do player, podem manter seu mecanismo de concorrência no domínio. Não duplique a mesma proteção com outro cache sem demonstrar que os dois níveis resolvem riscos distintos.

## Cache e Rede

`AsyncResourceCache` oferece coalescing, TTL por resultado, limite de entradas, invalidação e logs de duração. Erros e resultados parciais não devem ser mantidos como sucesso. `delete`, `set` e `clear` também invalidam a gravação de respostas que ainda estavam em voo, impedindo que dados obsoletos ressuscitem após uma invalidação.

Use TTL curto para resultados de busca, longo para metadados estáveis e um TTL negativo curto para ausências. Dados persistentes continuam sob responsabilidade do serviço correspondente; cache de memória não substitui persistência nem validação de identidade.

## Logs e Métricas

Use `log.time(category, action, metadata)` para fluxos perceptíveis ou I/O, e finalize em sucesso, falha, timeout e resposta obsoleta. Os eventos devem identificar fase e contagens/IDs técnicos necessários para correlacionar pesquisa, perfil, fila e download. Não registre tokens, segredos nem URLs com query sensível.

Os logs consultáveis em Configurações devem permitir relacionar início/fim, duração, origem, resultado e falha; métricas agregadas devem orientar otimização antes de adicionar paralelismo ou preloads adicionais.

## Widgets iOS

O WidgetKit é uma extensão nativa, isolada do processo React Native. O app publica um snapshot enxuto no App Group `group.com.openfy.app`; a extensão lê faixa, artistas, progresso e linha da letra sem consultar APIs nem controlar uma segunda instância de áudio. As mudanças de linha são preparadas em entradas futuras da timeline em vez de solicitar recarga a cada segundo.

Os controles usam links profundos para abrir a rota interna `openfy://widget/...`, que despacha as ações para o player local e para a fila Zustand. WidgetKit é iOS 17+ neste alvo. Por ser um novo target assinado e uma nova entitlement de App Group, a primeira instalação exige um build nativo/EAS e o App Group precisa estar habilitado no identificador Apple; OTA atualiza apenas o JavaScript e não instala a extensão.

## Verificação

Toda nova regra de idempotência, cache, classificação de catálogo ou transição de estado deve ter teste de unidade para deduplicação, invalidação, fallback e resultado final. Mudanças transversais devem passar por `npm run typecheck` e pelos testes afetados antes do commit.
