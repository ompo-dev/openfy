# Openfy API

Serviço Next.js que entrega a API Elysia usada pelo Openfy Web, Android e iPhone.
O Bun instala as dependências e executa o desenvolvimento local; na Vercel, a
rota Next usa o adaptador Node do Elysia.

O resolvedor de áudio usa `yt-dlp` como o servidor local original. Ele exige
`python3`, portanto deve rodar em uma máquina ou contêiner persistente — não em
uma função serverless da Vercel.

## Desenvolvimento local

```powershell
cd apps/openfy-api
bun install
bun run dev
```

A API escuta em `0.0.0.0:3001` e expõe:

- `GET /health`
- `GET /swagger`
- `POST /api/music/resolve`
- `POST /api/music/youtube`
- `GET /api/audio/youtube?videoId=...`
- `GET /api/audio/proxy`
- letras, Spotify e imagem de artista nos mesmos caminhos já usados pelo Expo

O Expo usa automaticamente a porta `3001` no computador de desenvolvimento.
Em um dispositivo físico, ele utiliza o IP LAN provido pelo Metro. Para usar a
API remota, defina `EXPO_PUBLIC_MUSIC_SERVER_URL=https://api.exemplo.com` antes
de iniciar ou gerar o bundle Expo.

## Deploy da engine de áudio

Use o `Dockerfile.vercel` na raiz do repositório. A imagem instala Python e
executa o `yt-dlp`, como no fluxo local que funcionava antes.

1. Na Vercel, escolha **Container** e mantenha **Root Directory** como `./`.
2. Configure as variáveis de `.env.example`. Para produção, configure:

- `OPENFY_ALLOWED_ORIGINS`: lista separada por vírgulas com as origens web
  permitidas, por exemplo `https://openfy.exemplo.com`. Inclua também cada
  domínio de preview que deve abrir o app web. Não use `*`.
- `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`: credenciais do app Spotify
  usadas somente pela API para dados públicos e renovação de sessão. Nunca as
  cadastre no Expo/EAS nem com prefixo `EXPO_PUBLIC_`.
- `OPENFY_LEGACY_ENGINE_URL` (opcional): URL HTTPS de uma engine dedicada para
  tarefas pesadas. Quando ausente, a API usa a engine compatível no mesmo
  processo.

3. Faça o deploy e confirme `https://<seu-dominio>/health`. A
interface da API fica em `https://<seu-dominio>/swagger`.

## Conectar o Expo (Web, iPhone e Android)

Na raiz do repositório, crie um arquivo local `.env.local` a partir do arquivo
`.env.example` da raiz e substitua a URL pelo domínio HTTPS obtido no passo
anterior:

```dotenv
EXPO_PUBLIC_MUSIC_SERVER_URL=https://<seu-dominio>
```

Reinicie o Expo com cache limpo após trocar a URL:

```powershell
bunx expo start --clear
```

`EXPO_PUBLIC_MUSIC_SERVER_URL` é embutida no bundle. Por isso, para builds
instalados de iOS/Android, gere uma nova build ou publique uma atualização Expo
depois de alterar a variável. Em Expo Go, basta reiniciar o bundler. O iPhone e
o Android usam a mesma URL HTTPS e não dependem de `localhost`, IP LAN ou de
um servidor no computador.

Não inclua chaves ou credenciais de terceiros no repositório nem em variáveis
`EXPO_PUBLIC_*`.

## Proteção de produção

A API aplica limite local por IP e rota. Configure um firewall/rate limit no
provedor para `/api/*`. O proxy aceita somente HTTPS para `googlevideo.com`,
`sndcdn.com` e `soundcloud.com`.
