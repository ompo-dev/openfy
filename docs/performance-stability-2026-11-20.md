# Openfy — Relatório de correções de desempenho e estabilidade

**Revisão:** 20/11/2026
**Escopo:** reprodução, troca de faixas, fila, downloads, biblioteca, Home, descoberta musical, recomendações e diagnóstico.
**Plataformas:** lógica TypeScript compartilhada e reprodução nativa existente, com atenção especial ao AVPlayer do iOS.
**Importante:** o relatório distingue testes automatizados de validação em dispositivos. Nenhuma medição real de latência em iPhone/Android foi obtida nesta execução Windows.

## 1. Problemas de origem

O relato de uso incluía Home exibindo só a primeira música no início, demora para preencher recomendações, sugestões pouco relevantes, abertura lenta de playlists e álbuns, demora ao iniciar streaming de músicas longas e falhas durante sucessivos avanços de faixa (por volta da quinta). Uma inspeção anterior mostrou operações externas encadeadas, preloads concorrentes, fila remota que aguardava todas as páginas no botão principal, eventos de escuta incompletos e buffer de log global sem limite.

**Não foi possível reproduzir diretamente o travamento da quinta faixa nem medir a espera do primeiro áudio em aparelho.** As correções abaixo reduzem riscos demonstrados pelo código; o diagnóstico final desse sintoma depende dos traces nativos da versão instalada.

## 2. Entregas por prioridade

| Prioridade | Tema | Modificação realizada | Arquivos centrais |
|---|---|---|---|
| P0 | Tocar playlist paginada | O botão principal começa pelas faixas disponíveis. Depois, a fila recebe páginas restantes sem reiniciar a faixa atual. Identidade da coleção e duplicatas são verificadas. | `components/CollectionDetail/CollectionDetail.tsx`, `stores/usePlayerStore.ts` |
| P0 | Comandos de fone e tela bloqueada | Navegação remota usa fila serial limitada a 16 comandos, em vez de descartar comandos durante uma transição. | `services/audio/playerService.ts` |
| P0 | Concorrência de rede | A reprodução sinaliza uma janela breve de prioridade; descoberta, perfis e downloads cedem recursos, com atraso máximo delimitado. Preloads adjacentes são escalonados e revogados quando ficam obsoletos. | `services/network/audioPriority.ts`, `stores/usePlayerStore.ts`, `stores/useDownloadStore.ts` |
| P0 | Fonte local inválida | Arquivos vazios e arquivos muito pequenos deixam de ser tratados como áudio local válido. | `stores/usePlayerStore.ts` |
| P1 | Monitoramento do primeiro áudio | Foram separados tempo de resolução, origem da fonte, tempo até o primeiro áudio, períodos de buffering e etapas diagnósticas do player nativo. | `stores/usePlayerStore.ts`, `services/audio/playerService.ts` |
| P1 | Limite de log | Histórico global passa a ter capacidade fixa de 3.000 entradas. Métricas agregadas apresentam P50/P95/P99. | `utils/appLogger.ts`, `components/Settings/Settings.tsx` |
| P1 | Home progressiva | Descobertas são publicadas conforme cada busca retorna, sem esperar a pesquisa mais lenta. Catálogo persistido publica antecipadamente; snapshot local da Home persiste por até seis horas e é invalidado por chave de revisão/configuração. | `services/home/personalizedHome.ts`, `services/home/homeCatalog.ts`, `hooks/usePersonalizedHome.ts` |
| P1 | Sinais musicais | Reproduções contam somente após estado de áudio ativo. Skips precoces, conclusão, preferências negativas e timestamps entram no perfil. Escritas concorrentes são serializadas. | `services/recommendation/recommendationEngine.ts`, `stores/usePlayerStore.ts` |
| P1 | Ranking da Home | Pesos de artista ganham decaimento temporal; faixas rejeitadas são excluídas e skips penalizados. Artistas seguidos ocupam no máximo duas sementes, reservando descoberta para sinais de escuta. | `services/home/personalizedHome.ts` |
| P1 | Parecido com coleção | Álbuns e playlists podem receber seção contextual baseada em até três gravações reais da coleção, com deduplicação e fallback. O trabalho só começa após a tela inicial. | `services/recommendation/collectionSimilar.ts`, `components/CollectionDetail/CollectionDetail.tsx` |
| P1 | Baixar coleção remota | Download da coleção pode resolver todas as páginas, em vez de baixar só as faixas renderizadas. | `components/CollectionDetail/CollectionDetail.tsx` |
| P2 | Eficiência da biblioteca | Cache de curta duração para leitura combinada de catálogo/downloads, com invalidação por geração/revisão. Associação de álbum utiliza índices por faixa, vídeo e identidade textual. | `services/library/catalogLibrary.ts`, `services/library/albumMetadata.ts` |
| P2 | Atualização de artistas | Hidratação cede prioridade ao áudio; revisões da biblioteca são agrupadas em vez de publicadas uma por gravação. | `services/library/artistChannelHydration.ts` |
| P2 | Documentação | README atualizado para arquitetura real, testes, builds nativos e fontes de áudio. | `README.md`, `docs/architecture.md`, este relatório |

## 3. Contratos importantes e detalhes de comportamento

### 3.1 Reproduzir e navegar

1. O toque entra no store com `activeRequestId` e preferência de fonte local ou resolvida.
2. A janela de prioridade da reprodução reduz competição com operações especulativas. O escalonamento é cooperativo, não é um controle de banda no sistema operacional.
3. O início do áudio encerra a métrica `time to first audio`. `audio source resolution` permanece uma métrica separada. Eventos do AVPlayer, como `descriptor-resolved` e `first-audio`, continuam disponíveis.
4. O primeiro vizinho pode ser preparado imediatamente; os demais são escalonados. Uma fila desatualizada não inicia preparações planejadas para a fila anterior.
5. Comandos remotos são serializados e preservados dentro do limite de segurança. Seleções por swipe usam a proteção preexistente de geração no store.
6. Erros ainda podem demandar nova resolução de stream: não houve substituição completa dos resolvers de YouTube/Spotify nem alteração do transportador AVFoundation.

### 3.2 Playlists grandes

O botão da coleção usa faixas que já estão na tela e carrega as demais páginas depois. `extendQueueFromCollection` só altera a fila quando o `sourceId` ainda é o da coleção ativa. Duplicatas por identificador são descartadas, e a fila original é preservada para desligar o shuffle. A fila de reprodução não deve ser reiniciada após expandir páginas. Ações explícitas de salvar e baixar coleção mantêm a necessidade de resolver todos os membros.

### 3.3 Home e perfil

O snapshot local continua útil quando uma pesquisa remota falha. O snapshot persistido deve ser descartado se a chave de revisão/preferências mudar ou se expirar. Uma atualização de descoberta compartilha callbacks entre consultas duplicadas. O ranking combina afinidade de artista, atividade recente, rejeições e diversidade; **não é um modelo de ML treinado nem uma medição de precisão de recomendação**. A qualidade deve ser validada por escuta e feedback real.

### 3.4 Recomendação contextual

A seção `Parecido com ...` usa gravações conhecidas e tenta construir rádios musicais a partir de seus IDs nativos. Sem âncora verificável, recorre a busca de descoberta por artistas da coleção. Ela evita membros já presentes, conteúdos explícitos quando desabilitados e duplicatas. A disponibilidade final depende da origem remota, e as sugestões não são automaticamente baixadas.

## 4. Verificações automatizadas

Execute na raiz do projeto:

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand --silent
```

Novos testes cobrem: buffer de logs e percentis, rejeição de arquivo vazio, reprodução de playlists progressivas, fila expandida sem duplicatas, múltiplos saltos rápidos, sinais e escrita serial do perfil, classificação contextual, prioridades de startup, publicação parcial da descoberta e biblioteca invalidada por revisão. Testes anteriores do AVPlayer simulado, recuperação e downloads permanecem.

**Resultados efetivamente observados nesta revisão:** suíte Jest completa com **141 suítes aprovadas, 958 testes aprovados e 24 ignorados**, sem falha; TypeScript `tsc --noEmit` sem erros; ESLint com **0 erros e 45 avisos**, equivalentes aos avisos preexistentes. Após os últimos ajustes na restauração da Home e no índice de álbuns, foram executados novamente **64 testes focados, todos aprovados**, e o TypeScript passou novamente. Esses resultados não comprovam o comportamento em aparelho nativo.

## 5. Matriz obrigatória de validação no dispositivo

| Teste | Passo | Resultado esperado |
|---|---|---|
| Início de streaming | Tocar música curta, média e longa com cache frio e quente | Medir `time to first audio`, descritor, primeiro byte e buffering, sem assumir download completo |
| Quinta faixa | Reproduzir fila de 20–50 faixas e avançar repetidamente, inclusive por capa, fone e tela bloqueada | Sem travamento ou perda de intenção; áudio corresponde à fila |
| Rede ruim | Alternar Wi-Fi, rede móvel, modo avião e limites de velocidade | Falhas recuperáveis não deixam a fila permanentemente bloqueada |
| Áudio offline | Tocar arquivo válido, vazio, incompleto e ausente | Apenas fonte válida é reproduzida; erro acionável nos demais |
| Playlist longa | Abrir playlist com 300+ itens e tocar antes do término de carregamento | Início com página disponível e expansão ordenada da fila |
| Shuffle e retorno | Avançar durante expansão, ativar/desativar shuffle e voltar à coleção | Sem duplicatas e com faixa atual consistente |
| Download concorrente | Iniciar coleção grande e reproduzir outra música | Downloads cedem prioridade; medir rebuffer e impacto no início |
| Home fria/quente | Inicializar e reabrir Home com diferentes bibliotecas | Snapshot útil cedo, descoberta progressiva, sem reconstruções perceptíveis |
| Coleções | Abrir álbuns e playlists, procurar faixas e testar `Parecido com ...` | Lista operável, recomendações deduplicadas e contextuais |
| Preferências | Dar like, ouvir, completar, pular e rejeitar | Contagem de escutas correta; recomendações futuras incorporam os sinais |
| Ciclo de vida | Bloquear tela, voltar ao app, atender ligação e alternar áudio | Sessão de áudio e controle remoto estáveis |
| iOS e Android | Repetir matriz em ambas as plataformas | Identificar diferenças do AVPlayer nativo e do fallback expo-audio |

## 6. Métricas e critérios de aceite

O painel de desenvolvedor, em Configurações, exibe métricas de latência P50/P95/P99 e logs exportáveis. Correlacione `requestId`, `trackId`, geração do player, fase e origem. Não salve URL de mídia assinada integralmente, cookie ou token.

**Metas iniciais para uma avaliação real** (não alcançadas ou medidas nesta auditoria): primeiro conteúdo local da Home abaixo de 500 ms com cache quente; primeiro áudio P95 abaixo de 2 segundos para fonte quente em rede estável; carregamento remoto sem bloquear interação; 20 trocas consecutivas sem estado preso; nenhuma perda de dados de playlist ou downloads. Definir metas separadas por dispositivo, rede e origem.

## 7. Riscos e trabalho ainda necessário

1. **Dispositivo físico obrigatório:** o travamento da quinta música e a aparente dependência entre duração e startup não foram reproduzidos; apenas traces iOS/Android e comparação antes/depois poderão provar correção definitiva.
2. **Módulo iOS:** esta entrega não reescreveu `OpenfyAssetResourceLoader.swift` ou o AVPlayer nativo. O streaming por HTTP Range já existe; se o problema persistir, investigar contêiner, requisições AVFoundation, cabeçalhos 206 e assinaturas de URL.
3. **Descompasso iOS/Android:** streaming nativo do YouTube é iOS; Android pode seguir um fluxo diferente de resolução e `expo-audio`.
4. **Recomendações:** implementar ranking offline não substitui experimentos reais. Validar skips, retenção, diversidade e rejeições antes de recalibrar pesos.
5. **Disponibilidade dos provedores:** YouTube Music, metadados Spotify, HTTP 403 e exigências de autenticação são fatores externos. Não contornar controles de acesso ou direitos de distribuição.
6. **Escala:** a janela de prioridade atual é cooperativa e simples, não um escalonador QoS do sistema. Se sessões grandes mostrarem contenção, instrumentar operações simultâneas e introduzir limites globais somente a partir de medições.
7. **Privacidade e dados:** o snapshot local da Home é persistido no aparelho; se login multiusuário vier a ser suportado, isolar ou limpar esse cache por conta.

## 8. Procedimento de investigação de regressões

1. Abrir ferramentas de diagnóstico nas Configurações e ativar captura.
2. Reproduzir o cenário uma vez com cache quente e outra com cache frio.
3. Exportar somente logs sanitizados: `audio source resolution`, `time to first audio`, `audio buffering`, `native startup stage`, `queue neighbor warmup`, `collection queue expanded`.
4. Relacionar cada evento por `requestId`/`trackId`, observar bytes/HTTP 206 quando houver logs nativos.
5. Comparar com preload desabilitado, raio de um e raio de dois. Não confundir tempo até `play()` com primeiro áudio efetivo.
6. Adicionar caso de teste determinístico para a falha reproduzida e repetir a matriz no dispositivo antes da entrega a usuários.

O objetivo desta revisão foi tornar o caminho interativo mais determinístico, reduzir trabalho concorrente e fornecer evidências suficientes para as próximas otimizações, preservando o catálogo e as funcionalidades existentes.
