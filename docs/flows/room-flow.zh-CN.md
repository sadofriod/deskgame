# 房间流程

本文档用于展示 Room 聚合的生命周期，以及 PostgreSQL 规则模型归一化后的最新回合流程。

## 房间到对局的生命周期

```mermaid
flowchart TD
  A[创建房间\nCreateRoom] --> B[房间\nstate=wait\nstage=preparation]
  B --> C[加入房间 / 准备\nJoinRoom / Ready]
  C --> D{玩家数 5-10\n且全部 ready}
  D -->|开始游戏\nStartGame| E[创建对局\nCreate Match]
  E --> F[发牌服务\n分配身份 角色候选\n和初始手牌]
  E --> G[创建待确认的 MatchPlayer]
  E --> H[环境牌堆服务\n构建牌堆顺序]
  F --> I[创建 MatchPlayerRoleOption\n和 MatchPlayerActionCard]
  G --> J[为第 1 层创建\nRound 空壳]
  H --> K[创建 MatchEnvironmentDeck]
  I --> L[角色选择开始\nRoleSelectionStarted]
  L --> M[玩家确认角色]
  M --> N{是否全部选定角色}
  N -->|是| O[角色选择完成\nRoleSelectionCompleted]
  J --> P[回合循环]
  K --> P
  O --> P
  P --> Q{胜负判断服务\nWinnerJudgementService}
  Q -->|未决出胜者| J
  Q -->|已决出胜者| R[关闭 Match 和 Room]
```

## 回合阶段推进

```mermaid
flowchart LR
  P[准备阶段] --> B[押牌阶段]
  B --> E[环境阶段]
  E --> A[行动阶段]
  A --> D[伤害阶段]
  D --> T[发言阶段]
  T --> V[投票阶段]
  V -->|平票| TB[平票辩论]
  TB -->|受限重投| V2[投票阶段]
  V -->|已决议| S[结算阶段]
  V2 --> S
  S -->|进入下一层| P
  S -->|已决出胜者| X[结束]
```

- `SubmitAction` 发生在 `bet`；`action` 阶段只执行已经锁定的提交。
- `preparation` 包含角色确认；在 `RoleSelectionCompleted` 之前，房间不能进入 `bet`。
- 每一层在进入 `environment` 之前就已经持久化了一个 `Round` 空壳；揭示时只补齐 `environmentCard` 和 `roundKind`。
- `damage` 会先结算环境伤害和行动伤害，然后玩家才能发言或投票。
- `tieBreak` 是一个受限分支：只有平票目标仍然是合法投票目标，且平票玩家不能投票。
- `settlement` 负责最终确认投票结果、淘汰结果、胜负检查以及下一层指针；若第二次仍平票，则该层不会发生投票淘汰。

## 命令到持久化的流转

```mermaid
flowchart TD
  SG[开始游戏\nStartGame] --> DS[DealService]
  SG --> ES[EnvironmentDeckService]
  DS --> MP[MatchPlayer\nstatus=pendingRoleSelection]
  DS --> RO[MatchPlayerRoleOption]
  DS --> HC[MatchPlayerActionCard]
  SG --> RS[Round 空壳\nfloor 1 env=null\nvoteRound=1]
  ES --> MD[MatchEnvironmentDeck]

  CR[确认角色选择\nConfirmRoleSelection] --> MPU[设置 chosenRoleCode\nmaxHp currentHp]

  SB[在 bet 阶段提交动作\nSubmitAction] --> RA[RoundActionSubmission\nsequence=1 sourceStage=bet]
  SB --> HCC[消耗 MatchPlayerActionCard]

  RE[揭示环境\nRevealEnvironment] --> RU[更新 Round.environmentCardCode\n和 roundKind]
  AC[action 阶段直接打出] --> RA2[RoundActionSubmission\nsequence>1 sourceStage=action]
  AC --> RT[RoundActionTarget]
  AC --> IR[IdentityReveal]

  DM[damage 阶段] --> SS[SettlementService]
  SS --> RD[RoundDamage]
  SS --> PS[MatchPlayer 血量与状态]

  SV[提交投票\nSubmitVote] --> RV[RoundVoteSubmission\nvoteRound=currentVoteRound]
  TB[tieBreak -> vote] --> VRN[Round.currentVoteRound + 1]
  ST[settlement 阶段] --> VR[Round.voteResult]
  ST --> WJ[WinnerJudgementService]
  WJ --> MS[Match 胜负字段]
  WJ --> RS[Room 层数与阶段更新]
```