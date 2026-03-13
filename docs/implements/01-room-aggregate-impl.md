# 房间聚合实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

Room 聚合负责单个房间的权威游戏状态，编排阶段流转、校验命令并发布领域事件。

## 聚合状态

- roomId
- ownerOpenId
- gameState: wait | start | end
- playerCount
- roleConfig
- currentFloor
- currentStage
- envDeck
- version

## 不变量

- playerCount 必须为 5-10。
- gameState = start 时禁止新玩家加入。
- currentFloor 在 1-8 范围内，9 用于终局标记。
- currentStage 只能按固定顺序单向推进。

## 命令处理

- CreateRoom
  - 校验房主身份。
  - 初始化默认值：gameState = wait，currentFloor = 1，currentStage = night。
  - 发送 RoomCreated。

- JoinRoom
  - 校验房间存在且 gameState = wait。
  - 校验 playerCount < 10。
  - 添加玩家并递增 playerCount。
  - 发送 PlayerJoinedRoom。

- LeaveRoom
  - 移除玩家；若房主离开，按策略转移或解散。
  - 发送 PlayerRemovedFromRoom。

- StartGame
  - 校验房主身份。
  - 校验 playerCount 在 5-10。
  - 调用服务发身份与环境牌堆。
  - 设置 gameState = start，currentStage = night。
  - 发送 CardsDealt。

- SubmitAction
  - 校验 currentStage = action。
  - 校验玩家存活且 actionCard 非空。
  - 基于 requestId 做幂等。
  - 发送 ActionSubmitted。

- RevealEnvironment
  - 校验 currentStage = env。
  - 揭示当前楼层环境牌。
  - 发送 EnvironmentRevealed。

- SubmitVote
  - 校验 currentStage = vote。
  - 校验玩家存活且 actionCard 非空。
  - 发送 VoteSubmitted。

- AdvanceStage
  - 校验房主指令或超时触发。
  - 通过 StageFlowService 计算下一阶段。
  - 发送 StageAdvanced（内部）及阶段相关领域事件。

## 状态流转

- 阶段顺序：night -> action -> env -> actionResolve -> hurt -> talk -> vote
- 投票结算后推进 currentFloor，并将阶段切回 night。
- WinnerDecided 为终局时，将 gameState 设为 end，currentFloor = 9。

## 持久化说明

- Room 单行存储，envDeck 以 JSON 保存。
- 每次命令接受后 version 递增以支持乐观并发。
