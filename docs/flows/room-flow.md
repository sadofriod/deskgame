# Room Flow

This document visualizes the Room aggregate lifecycle and the updated round flow after the PostgreSQL rule model normalization.

## Room To Match Lifecycle

```mermaid
flowchart TD
  A[CreateRoom] --> B[Room\nstate=wait\nstage=preparation]
  B --> C[JoinRoom / Ready]
  C --> D{playerCount 5-10\nand all ready}
  D -->|StartGame| E[Create Match]
  E --> F[DealService\nassign identities role options\nand initial hands]
  E --> G[Create pending MatchPlayer]
  E --> H[EnvironmentDeckService\nbuild deck sequence]
  F --> I[Create MatchPlayerRoleOption\nand MatchPlayerActionCard]
  G --> J[Create Round shell\nfor floor 1]
  H --> K[Create MatchEnvironmentDeck]
  I --> L[RoleSelectionStarted]
  L --> M[Players confirm roles]
  M --> N{all roles selected}
  N -->|yes| O[RoleSelectionCompleted]
  J --> P[Round loop]
  K --> P
  O --> P
  P --> Q{WinnerJudgementService}
  Q -->|no winner| J
  Q -->|winner| R[Close Match and Room]
```

## Round Stage Progression

```mermaid
flowchart LR
  P[preparation] --> B[bet]
  B --> E[environment]
  E --> A[action]
  A --> D[damage]
  D --> T[talk]
  T --> V[vote]
  V -->|tie| TB[tieBreak]
  TB -->|restricted re-vote| V2[vote]
  V -->|resolved| S[settlement]
  V2 --> S
  S -->|next floor| P
  S -->|winner decided| X[end]
```

- `SubmitAction` happens in `bet`; the `action` stage only executes the locked submissions.
- `preparation` contains role confirmation; the room cannot advance to `bet` before `RoleSelectionCompleted`.
- Each floor already has a persisted Round shell before `environment`; reveal only fills `environmentCard` and `roundKind`.
- `damage` resolves environment damage and action damage before players can talk or vote.
- `tieBreak` is a constrained branch: only tied targets remain valid vote targets, and tied players cannot vote.
- `settlement` finalizes vote result, elimination, winner check, and the next-floor pointer; a second tie means no vote elimination that floor.

## Command To Persistence Flow

```mermaid
flowchart TD
  SG[StartGame] --> DS[DealService]
  SG --> ES[EnvironmentDeckService]
  DS --> MP[MatchPlayer\nstatus pendingRoleSelection]
  DS --> RO[MatchPlayerRoleOption]
  DS --> HC[MatchPlayerActionCard]
  SG --> RS[Round shell\nfloor 1 env=null\nvoteRound=1]
  ES --> MD[MatchEnvironmentDeck]

  CR[ConfirmRoleSelection] --> MPU[set chosenRoleCode\nmaxHp currentHp]

  SB[SubmitAction in bet] --> RA[RoundActionSubmission\nsequence=1 sourceStage=bet]
  SB --> HCC[consume MatchPlayerActionCard]

  RE[RevealEnvironment] --> RU[update Round.environmentCardCode\nand roundKind]
  AC[action stage direct play] --> RA2[RoundActionSubmission\nsequence>1 sourceStage=action]
  AC --> RT[RoundActionTarget]
  AC --> IR[IdentityReveal]

  DM[damage stage] --> SS[SettlementService]
  SS --> RD[RoundDamage]
  SS --> PS[MatchPlayer hp and status]

  SV[SubmitVote] --> RV[RoundVoteSubmission\nvoteRound=currentVoteRound]
  TB[tieBreak -> vote] --> VRN[Round.currentVoteRound + 1]
  ST[settlement stage] --> VR[Round.voteResult]
  ST --> WJ[WinnerJudgementService]
  WJ --> MS[Match winner fields]
  WJ --> RS[Room floor and stage update]
```
