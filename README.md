# Openfy

Aplicativo experimental de música para iOS, Android e web, com biblioteca local, descoberta musical, playlists, downloads para escuta offline, letras sincronizadas, player em segundo plano e criação de mixes.

> O Openfy não distribui áudio pela API do Spotify. Metadados e identificadores são independentes da resolução da fonte de áudio. A disponibilidade de fontes remotas depende dos provedores e das permissões de uso aplicáveis.

## Tecnologias

- Expo SDK 57, React Native 0.86, Expo Router, React 19 e TypeScript 6.
- Zustand para reprodução, fila, downloads e preferências; AsyncStorage para catálogo local e caches.
- youtubei.js e serviços de identidade musical para pesquisa, descoberta e resolução de gravações.
- `expo-audio` e um módulo iOS em Swift com AVPlayer, AVAssetResourceLoader e HTTP Range.
- Código nativo para downloads e renderização de mixes; WidgetKit e comandos Siri no iOS.

As funções nativas **não funcionam integralmente no Expo Go**. Use development builds e ferramentas adequadas à plataforma. O iOS nativo requer macOS/Xcode ou um pipeline de build remoto configurado.

## Instalação e desenvolvimento

```bash
git clone https://github.com/ompo-dev/openfy.git
cd openfy
npm ci
npm run start
```

Comandos úteis:

```bash
npm run android
npm run ios
npm run dev:web
npm run typecheck
npm run lint
npm test -- --runInBand
```

Os scripts `npm run android` e `npm run ios` compilam código nativo e exigem SDKs instalados. O postinstall aplica patches locais de dependências, portanto utilize `npm ci` e não ignore falhas do patch-package.

## Como funciona

1. A biblioteca guarda metadados, capas, relações entre músicas, álbuns e playlists sem exigir o download do áudio.
2. Ao tocar, o player verifica fonte offline, cache, vínculo de gravação e fonte remota; a faixa atual tem prioridade sobre enriquecimento em segundo plano.
3. O iOS pode transmitir por requisições HTTP Range nativas. Durante a reprodução, um cache temporário em disco guarda os bytes recebidos e antecipa o resto da música, permitindo continuar durante quedas de rede quando os dados necessários já estiverem disponíveis. Download permanente continua sendo uma operação separada. Faixas baixadas são encontradas e reproduzidas **diretamente do arquivo local**, inclusive offline; caminhos de downloads anteriores são adaptados ao diretório atual do aplicativo. Consulte [reprodução em segundo plano](docs/background-playback.md) para limitações e validação.
4. As listas remotas exibem páginas progressivas. A fila inicia com o conteúdo disponível e pode expandir sem reiniciar a reprodução.
5. A Home reutiliza snapshots locais e persistidos, publica resultados remotos progressivamente e aprende com reprodução, conclusão, skip e outras interações.
6. Álbuns e playlists oferecem sugestões contextuais baseadas em suas faixas quando há dados suficientes.

## Estrutura

| Local | Responsabilidade |
|---|---|
| `app/`, `screens/`, `components/` | Rotas, telas e interface |
| `stores/usePlayerStore.ts` | Fila, transições, recuperação e preloads |
| `services/audio/` | Identidade de fonte e reprodução |
| `modules/openfy-youtube/` | Streaming e transferências nativos |
| `services/download/` | Downloads, metadados e diagnósticos |
| `services/home/`, `services/recommendation/` | Home, rádios, descoberta, ranking e sinais |
| `services/library/` | Catálogo e coleções locais |
| `utils/appLogger.ts` | Logs limitados, métricas P50/P95/P99 |
| `docs/` | Arquitetura, streaming, background e auditorias |

## Diagnósticos e testes

O painel de desenvolvedor em Configurações expõe logs, estatísticas e inspeção de áudio. Procure eventos `time to first audio`, `audio source resolution`, `audio buffering`, `native startup stage`, `queue neighbor warmup` e `collection queue expanded`.

Testes Jest não substituem testes em iPhone e Android reais. Em especial, verifique reprodução longa, sequências rápidas de 20–50 trocas, downloads durante reprodução, retomada em segundo plano e rede instável.

O arquivo `scripts/e2e-test.js` contém verificações legadas com serviços externos e não valida sozinho a reprodução nativa atual.

Consulte [Arquitetura](docs/architecture.md), [Streaming e catálogo](docs/streaming-catalog-architecture.md) e [Relatório de desempenho e estabilidade](docs/performance-stability-2026-11-20.md).

## Avisos

O projeto é experimental. Respeite direitos autorais, licenças, termos dos provedores e a privacidade dos usuários. Não registre tokens nem URLs de mídia assinadas completas em telemetria.
