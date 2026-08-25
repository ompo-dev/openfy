# Openfy API

Serviço Next.js que entrega a API Elysia usada pelo Openfy Web, Android e iPhone.
O Bun instala as dependências e executa o desenvolvimento local; na Vercel, a
rota Next usa o adaptador Node do Elysia.

O pacote `youtube-dl-exec` é explicitamente confiado no `package.json` porque
seu pós-instalação baixa o binário `yt-dlp` exigido pelo resolvedor. O binário é
incluído no trace de deploy do Next.

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
- `GET /api/audio/proxy`
- letras, Spotify e imagem de artista nos mesmos caminhos já usados pelo Expo

O Expo usa automaticamente a porta `3001` no computador de desenvolvimento.
Em um dispositivo físico, ele utiliza o IP LAN provido pelo Metro. Para usar a
API remota, defina `EXPO_PUBLIC_MUSIC_SERVER_URL=https://api.exemplo.com` antes
de iniciar ou gerar o bundle Expo.

## Deploy na Vercel

O deploy não exige alterações de código no Expo: a URL do projeto Vercel é a
única configuração necessária para Web, iOS e Android.

1. Importe este repositório na Vercel e defina **Root Directory** como
   `apps/openfy-api`.
2. Mantenha os comandos definidos em `vercel.json`: `bun install
   --frozen-lockfile` e `bun run build`.
3. Em **Settings → Environment Variables**, copie as variáveis de
   `.env.example` que forem necessárias. Para produção, configure:

- `OPENFY_ALLOWED_ORIGINS`: lista separada por vírgulas com as origens web
  permitidas, por exemplo `https://openfy.exemplo.com`. Inclua também cada
  domínio de preview que deve abrir o app web. Não use `*`.
- `OPENFY_LEGACY_ENGINE_URL` (opcional): URL HTTPS de uma engine dedicada para
  tarefas pesadas. Quando ausente, a API usa a engine compatível no mesmo
  processo durante a migração.
- `YOUTUBE_COOKIES_BASE64` (opcional, segredo): arquivo de cookies **somente
  do YouTube**, em formato Netscape e codificado em Base64. É materializado
  apenas no diretório temporário da função para permitir que `yt-dlp` passe por
  desafios de login/CAPTCHA do YouTube. Nunca use o prefixo `EXPO_PUBLIC_` e
  nunca versione esse valor.

Para desenvolvimento local, `YOUTUBE_COOKIES_PATH` pode apontar para o mesmo
arquivo de cookies. O serviço valida o formato, mas não registra nem retorna o
conteúdo. Crie/renove essa credencial em uma conta dedicada e configure-a como
segredo no provedor de deploy.

4. Faça o deploy e confirme `https://<seu-projeto>.vercel.app/health`. A
   interface da API fica em `https://<seu-projeto>.vercel.app/swagger`.

## Conectar o Expo (Web, iPhone e Android)

Na raiz do repositório, crie um arquivo local `.env.local` a partir do arquivo
`.env.example` da raiz e substitua a URL pelo domínio HTTPS obtido no passo
anterior:

```dotenv
EXPO_PUBLIC_MUSIC_SERVER_URL=https://<seu-projeto>.vercel.app
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

Não inclua chaves, cookies de navegador ou credenciais de terceiros no
repositório nem em variáveis `EXPO_PUBLIC_*`.
