# Sistema visual de notas

As notas são base visual reutilizável para atividade de amigos, destaques de
música e avisos curtos no Openfy. A superfície compartilhada é
`NoteBubble`, em `components/Home/FriendActivityStatus/NoteBubble.tsx`.

## Linguagem visual

- Superfície: bolha escura ou cor da nota, com gradiente diagonal do canto
  superior esquerdo para canto inferior direito.
- Luz: borda superior e esquerda recebem fade claro; direita e base não ganham
  aro próprio.
- Forma: largura `97`, altura mínima `44`, altura máxima `68` e raio `16`.
  Não altere esses valores sem tratar cada uso derivado.
- Conteúdo: título central, artista em tom menor e texto opcional. O marquee
  preserva leitura quando texto é maior que bolha.
- Cauda: ponto principal `14` e secundário `8`, renderizados atrás da bolha.
  Os dois seguem a mesma rotação durante arraste horizontal.

## Gradiente contínuo da cauda

A cauda não possui paleta independente. A nota é plano de cor de referência:

1. O ponto principal encontra borda do retângulo arredondado pela rotação.
2. Cor é amostrada na borda ou para dentro dela, conforme
   `colorReferenceInset`.
3. Gradiente local dos dois pontos deriva desse mesmo plano, então mudar
   rotação não cria corte de cor.
4. Ajustes `*Fine` são desvios deliberados. Valor `0` mantém continuidade.

## Composição e configuração

`FriendActivityStatus` cuida somente de exibir as notas. Recebe uma base para
todas elas (`tailTuning`) e exceções por id (`tailTuningByNoteId`).

`NoteBubbleFullWidth` mantém o mesmo sistema visual em uma nota que ocupa todo
o espaço disponível. Na folha de notas de amigos, o avatar fica à esquerda e a
nota ocupa o restante à direita; a cauda continua no lado esquerdo da nota,
voltada ao avatar. A folha usa a calibração final definida em
`FriendNoteSheet.tsx`.

```tsx
<NoteBubbleFullWidth
  color={note.note.bubbleColor || '#1C1E24'}
  title={note.note.title}
  subtitle={note.note.artist}
/>
```

## Tokens de ajuste

| Campo                             | Papel                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| `colorReferenceInset`             | Distância, em px, da referência de cor para dentro da borda. |
| `mainStartFine` / `mainEndFine`   | Desvio fino das pontas do gradiente do ponto principal.      |
| `smallStartFine` / `smallEndFine` | Desvio fino das pontas do gradiente do ponto secundário.     |
| `orbitAngle`                      | Posição angular da cauda na borda arredondada.               |
| `mainDistance`                    | Encaixe do ponto principal em relação à borda.               |
| `smallAngleOffset`                | Avanço angular do ponto secundário.                          |
| `smallDistance`                   | Distância do ponto secundário à borda.                       |

Para novo componente inspirado nessa nota, reutilize os tokens e a regra de
luz antes de criar outra variação. Mantenha cauda atrás da superfície e derive
cor da mesma superfície, nunca de gradiente reiniciado.
