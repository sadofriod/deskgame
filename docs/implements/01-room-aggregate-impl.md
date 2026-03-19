# 房间聚合实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

Room 聚合负责单个房间的权威游戏状态，编排阶段流转、校验命令并发布领域事件。

## 聚合状态

- roomId
- roomCode
- ownerOpenId
- gameState: wait | selecting | playing | ended
- playerCount
- roomConfig
- currentRound
- currentStage
- envDeck
- version

## 不变量

- playerCount 必须为 5-10。
- lobby 阶段的座位号必须唯一且连续。
- gameState = playing 时禁止新玩家加入。
- currentRound 在未开局时为 0，正式对局时在 1-8 范围内。
- currentStage 只能按固定顺序单向推进。

## 命令处理

- CreateRoom
  - 校验房主身份。
  - 生成唯一 6 位 roomCode。
  - 初始化默认值：gameState = wait，currentRound = 0，currentStage = lobby。
  - 初始化房主玩家记录与 seatNo = 1。
  - 发送 RoomCreated。

- JoinRoom
  - 校验房间存在且 gameState = wait。
  - 校验 playerCount < 10。
  - 追加玩家并按加入顺序分配 seatNo。
  - 中途退出后由后续进入的玩家补齐座位号。
  - 发送 PlayerJoinedRoom。

- LeaveRoom
  - 移除玩家；若房主离开则直接解散房间。
  - 若仍处于 lobby，则重排 seatNo 保持连续。
  - 发送 PlayerRemovedFromRoom。

- UpdateRoomConfig
  - 校验房主身份且 currentStage = lobby。
  - 校验 roomConfig.playerCount 在 5-10。
  - 更新房间配置。
  - 发送 RoomConfigUpdated。

- SetReady
  - 校验 currentStage = lobby。
  - 更新玩家准备状态。
  - 发送 PlayerReadyStateChanged。
  - 当配置人数已满且全员 ready 时，调用 DealService 生成候选角色。
  - 设置 gameState = selecting，currentStage = roleSelection。
  - 发送 RoleSelectionStarted。

- ConfirmRoleSelection
  - 校验 currentStage = roleSelection。
  - 校验玩家选择的角色属于本人候选列表。
  - 锁定 selectedRole，不允许修改。
  - 当全员完成选择时，调用 EnvironmentDeckService 生成 8 回合环境牌。
  - 设置 gameState = playing，currentRound = 1，currentStage = bet。
  - 发送 RoleSelectionCompleted。

- SubmitBet
  - 校验 currentStage = bet。
  - 校验玩家存活。
  - 接受 6 张行动牌之一，或显式提交不押牌。
  - 基于 requestId 做幂等。
  - 发送 BetSubmitted。

- SubmitVote
  - 校验 currentStage = discussionVote。
  - 校验玩家存活且本回合具备投票权。
  - 发送 VoteSubmitted。

- AdvanceStage
  - 校验系统触发、房主指令或超时触发。
  - 通过 StageFlowService 计算下一阶段。
  - bet -> action 时先揭示当前回合环境牌并发送 EnvironmentRevealed。
  - action -> settlement 时调用 SettlementService 并发送 RoundSettled。
  - discussionVote 结束后计算 VoteResolved。
  - 若 WinnerJudgementService 判定终局，则发送 WinnerDecided。

## 状态流转

- 阶段顺序：lobby -> roleSelection -> bet -> action -> settlement -> discussionVote
- 每回合投票结算后，若未终局则 currentRound + 1，并将阶段切回 bet。
- WinnerDecided 为终局时，将 gameState 设为 ended，currentStage = review。

## 持久化说明

- Room 单行存储，roomConfig 与 envDeck 以 JSON 保存。
- 每次命令接受后 version 递增以支持乐观并发。
