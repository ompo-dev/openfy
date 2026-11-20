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

### Reprodução interativa primeiro

`services/network/audioPriority.ts` mantém uma reserva temporal cooperativa para o início da reprodução. Descoberta musical, hidratação de perfis e downloads podem ceder por um prazo limitado; nunca devem bloquear uma ação explícita de play. A fila de vizinhos do player escalona preloads, cancela os agendados ao mudar de faixa e impede que a preparação de faixas obsoletas compita com a próxima ação. Isso não é controle global de banda do sistema operacional.

`stores/usePlayerStore.ts` usa `activeRequestId` para descartar respostas obsoletas, e `services/audio/playerService.ts` serializa comandos remotos de avançar/retroceder. Preservar a versão ativa da fila ao expandir uma playlist.

### Home e coleções progressivas

A Home publica um snapshot local, recupera um shell persistido de curta duração quando válido e publica descobertas quando cada busca termina. A UI não deve aguardar todos os artistas para mostrar a primeira seção útil. O cache persistido tem TTL e é associado à revisão da biblioteca e opções de recomendação.

Playlists remotas podem ter apenas uma página carregada. O usuário começa a ouvir as faixas visíveis, e `extendQueueFromCollection()` acrescenta páginas posteriormente somente se a mesma coleção ainda estiver ativa. Salvar ou baixar uma coleção inteira continua exigindo todas as páginas. A biblioteca combinada de catálogo e downloads possui cache curto invalidado por mutações e revisão.

## Logs e Métricas

Use `log.time(category, action, metadata)` para fluxos perceptíveis ou I/O, e finalize em sucesso, falha, timeout e resposta obsoleta. Os eventos devem identificar fase e contagens/IDs técnicos necessários para correlacionar pesquisa, perfil, fila e download. Não registre tokens, segredos nem URLs com query sensível.

Os logs consultáveis em Configurações devem permitir relacionar início/fim, duração, origem, resultado e falha; métricas agregadas devem orientar otimização antes de adicionar paralelismo ou preloads adicionais.

O logger em memória mantém no máximo 3.000 eventos. As métricas agregadas têm P50, P95 e P99. Observe separadamente `audio source resolution`, `time to first audio`, `audio buffering` e estágios nativos do AVPlayer. Consulte `docs/performance-stability-2026-11-20.md` para critérios de validação e limitações de testes em dispositivos.

## Widgets iOS

O WidgetKit é uma extensão nativa, isolada do processo React Native. O app publica um snapshot enxuto no App Group `group.com.openfy.app`; a extensão lê faixa, artistas, progresso e linha da letra sem consultar APIs nem controlar uma segunda instância de áudio. As mudanças de linha são preparadas em entradas futuras da timeline em vez de solicitar recarga a cada segundo.

Os controles usam links profundos para abrir a rota interna `openfy://widget/...`, que despacha as ações para o player local e para a fila Zustand. WidgetKit é iOS 17+ neste alvo. Por ser um novo target assinado e uma nova entitlement de App Group, a primeira instalação exige um build nativo/EAS e o App Group precisa estar habilitado no identificador Apple; OTA atualiza apenas o JavaScript e não instala a extensão.

## Verificação

Toda nova regra de idempotência, cache, classificação de catálogo ou transição de estado deve ter teste de unidade para deduplicação, invalidação, fallback e resultado final. Mudanças transversais devem passar por `npm run typecheck` e pelos testes afetados antes do commit.
