# Tempo ate a janela OTA

O problema investigado e o tempo antes de disponibilizar o endpoint, nao os
dez minutos em que ele deve permanecer aberto. O workflow completo original
continua presente, incluindo validacao, testes, verificacoes nativas, IPA/APK,
assinatura, releases, artefatos e limpeza do tunel.

## Evidencia antes desta alteracao

[Run 91](https://github.com/ompo-dev/openfy/actions/runs/38192710903),
commit 5e5f097478ffa49e1bb8e3f226249987c267cd93. Tempos desde a criacao do run:

| Marco | Tempo | Horario de Sao Paulo, 2026-10-11 |
| --- | --- | --- |
| Criacao | 0:00 | 22:39:08 |
| Fim dos testes | 1:54 | 22:41:02 |
| Entrada na etapa de abrir a janela | 5:38 | 22:44:46 |
| Publicacao do endpoint validado | 5:50 | 22:44:58 |
| Fim do job IPA | 12:16 | 22:51:24 |
| Fim do job OTA, depois do keepalive | 15:54 | 22:55:02 |

O export ocupou 189 segundos e incluiu cerca de 89 segundos de web/SSR,
desnecessarios para Expo Updates iOS/Android. Havia ainda instalacao de
dependencias e export depois da espera por validar/testar. O run 90 tambem
entrou na etapa OTA antes do fim do IPA (4:27 contra 14:19). Esses dados nao
confirmam IPA concluido antes da entrada na etapa nesses runs; o fim do job
OTA inclui deliberadamente os dez minutos seguintes a disponibilizacao.

## Novo caminho critico

1. Preparar OTA inicia em paralelo a validar. Instala dependencias e exporta
   somente iOS/Android, com cache de transformacoes do Metro por config/lock/
   patches/variavel publica. O bundle exportado nunca vem de cache.
2. Compacta export, config publica e runtime em um artefato identificado pelo
   run atual. A preparacao tem apenas permissao de leitura e nao publica nada.
3. Publicar OTA depende de validar, testar e preparar OTA. Baixa somente o
   artefato desse run, sem outro npm ci ou export. Inicia servidor/tunel,
   verifica runtime/updateId e publica o ponteiro existente.
4. Mantem a janela por 600 segundos; ponteiro de 605 segundos e traps de limpeza
   foram preservados. O sumario distingue preparacao e horario de publicacao.

O cache frio ainda necessita compilar dois bundles. Jobs podem esperar por
runners; cloudflared/rede tambem influenciam. O ganho real no CI deve ser medido
no novo run, nao anunciado como um tempo ja observado a partir de testes locais.

Verificacao automatizada cobre as dependencias entre jobs, ausencia de export
web/reinstalacao na publicacao, artefato do mesmo run, cache de transformacoes,
health/updateId e preservacao do keepalive/cleanup. Export local nao verifica
assinatura ou execucao dos binarios iOS/Android.

## Resultado no CI

[Run 92](https://github.com/ompo-dev/openfy/actions/runs/38198263388), commit
adf14d0ab87eb5ffda3bf0d434a8d2005515eb26, concluiu os sete jobs com sucesso,
incluindo OTA, IPA, APK e verificacoes de audio nativo. A etapa de abrir a
janela iniciou em 137 segundos (2:17 desde a criacao), contra 338 segundos
(5:38) no run 91: 201 segundos a menos antes da janela. Export nativo demorou
76 segundos, contra 189 segundos do export anterior com web. A janela
continua aberta durante dez minutos. Esse run confirma a otimizacao do CI,
mas nao confirma a correcao visual da letra expandida relatada depois dele.
