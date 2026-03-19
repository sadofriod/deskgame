# Room Flow

This document visualizes the Room aggregate lifecycle and stage flow aligned with the latest core business process.

## Command To Event Flow

```mermaid
flowchart TD
  A[Gateway Command] --> B{Room Aggregate}
  B -->|CreateRoom| C[RoomCreated]
  B -->|JoinRoom| D[PlayerJoinedRoom]
  B -->|UpdateRoomConfig| E[RoomConfigUpdated]
  B -->|SetReady| F[PlayerReadyStateChanged]
  B -->|Auto when all ready| G[RoleSelectionStarted]
  B -->|ConfirmRoleSelection| H[RoleSelectionCompleted]
  B -->|SubmitBet| I[BetSubmitted]
  B -->|AdvanceStage| J[EnvironmentRevealed]
  B -->|SubmitVote| K[VoteSubmitted]
  B -->|AdvanceStage| L[RoundSettled]
  B -->|AdvanceStage| M[VoteResolved]
  B -->|AdvanceStage| N[WinnerDecided]
```

## Stage Progression

```mermaid
flowchart LR
  L[lobby] --> RS[roleSelection]
  RS --> B[bet]
  B --> A[action]
  A --> S[settlement]
  S --> DV[discussionVote]
  DV -->|next round| B
  DV -->|winner decided| R[review]
```

## Service Collaboration

```mermaid
flowchart TD
  Ready[All players ready] --> DS[DealService]
  DS --> RS[RoleSelectionStarted]
  Select[All players selected roles] --> ES[EnvironmentDeckService]
  ES --> RC[RoleSelectionCompleted]
  Bet[All bets locked] --> ER[EnvironmentRevealed]
  ER --> AX[Action execution]
  AX --> SS[SettlementService]
  SS --> ST[RoundSettled]
  ST --> WS[WinnerJudgementService]
  WS -->|final| WD[WinnerDecided]
  WS -->|continue| DV[discussionVote]
```
