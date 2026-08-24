# Openfy API

Serviço Next.js que entrega a API Elysia usada pelo Openfy Web, Android e iPhone.
O Bun instala as dependências e executa o desenvolvimento local; na Vercel, a
rota Next usa o adaptador Node do Elysia.

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

Crie um projeto Vercel com **Root Directory** em `apps/openfy-api`. Configure:

- `OPENFY_ALLOWED_ORIGINS`: lista separada por vírgulas com as origens web
  permitidas, por exemplo `https://openfy.exemplo.com`.
- `OPENFY_LEGACY_ENGINE_URL` (opcional): URL HTTPS de uma engine dedicada para
  tarefas pesadas. Quando ausente, a API usa a engine compatível no mesmo
  processo durante a migração.

Depois do deploy, use a URL HTTPS obtida como `EXPO_PUBLIC_MUSIC_SERVER_URL` no
Expo. Não inclua chaves, cookies de navegador ou credenciais de terceiros no
repositório ou nas variáveis públicas.
