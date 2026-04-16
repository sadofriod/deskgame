# 房间聚合实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

Room 聚合负责单个房间的权威游戏状态，编排阶段流转、校验命令并发布领域事件。

## 聚合状态

- roomId
- ownerOpenId
- gameState: wait | start | end
- ruleSetCode
- deckTemplateCode
- playerCount
- currentFloor
- currentStage
- currentMatchId
- version

## 不变量

- playerCount 必须为 5-10。
- gameState = start 时禁止新玩家加入。
- currentFloor 在 1-8 范围内，9 用于终局标记。
- currentStage 只能按固定顺序单向推进。

## 命令处理

- CreateRoom
  - 校验房主身份。
  - 校验 ruleSetCode 与 deckTemplateCode 可用。
  - 初始化默认值：gameState = wait，currentFloor = 1，currentStage = preparation。
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
  - 调用 DealService 分配身份、角色候选、初始手牌与待确认角色状态。
  - 调用 EnvironmentDeckService 生成本局环境牌序列。
  - 创建 Match、MatchPlayer、MatchPlayerRoleOption、MatchPlayerActionCard、MatchEnvironmentDeck。
  - 为当前楼层预创建 Round 空壳，environmentCard 与 roundKind 暂为空，currentVoteRound = 1。
  - 设置 gameState = start，currentStage = preparation。
  - 发送 CardsDealt 与 RoleSelectionStarted。

- ConfirmRoleSelection
  - 校验 currentStage = preparation。
  - 校验角色在该玩家的 roleOptions 中，且尚未确认。
  - 回填 chosenRoleCode、maxHp、currentHp、roleSelectedAt。
  - 发送 RoleSelected。
  - 若所有玩家都已确认，则发送 RoleSelectionCompleted。

- SubmitAction
  - 校验 currentStage = bet。
  - 校验玩家存活，且拥有可提交的手牌实例。
  - 校验本层 Round 空壳已存在。
  - 锁定本层押牌，并以 sequence = 1、sourceStage = bet 写入 RoundActionSubmission。
  - 基于 requestId 做幂等。
  - 发送 ActionSubmitted。

- RevealEnvironment
  - 校验 currentStage = environment。
  - 揭示当前楼层环境牌，并回填当前 Round 的 environmentCard 与 roundKind。
  - 发送 EnvironmentRevealed。

- SubmitVote
  - 校验 currentStage = vote。
  - 校验玩家 canVote = true，且本层不是空押。
  - 若本层处于受限重投，仅允许在平票目标间投票。
  - 以 Round.currentVoteRound 写入 RoundVoteSubmission。
  - 发送 VoteSubmitted。

- AdvanceStage
  - 校验房主指令或超时触发。
  - 通过 StageFlowService 计算下一阶段；preparation 只有在全部玩家确认角色后才能进入 bet。
  - 若投票平票则进入 tieBreak；从 tieBreak 回到 vote 前将 Round.currentVoteRound + 1。
  - 在 damage 阶段调用 SettlementService 结算环境与行动伤害。
  - 在 settlement 阶段落最终票权结果、淘汰与胜负判断；第二轮仍平票则无人因投票出局。
  - 发送 StageAdvanced（内部）及阶段相关领域事件。

## 状态流转

- 阶段顺序：preparation -> bet -> environment -> action -> damage -> talk -> vote -> settlement
- preparation 包含角色确认；未完成 RoleSelectionCompleted 不能推进到 bet。
- 若 vote 平票，则进入 tieBreak，再回到 vote 进行受限重投。
- 第二轮仍平票时直接进入 settlement，且本层无人因投票出局。
- settlement 完成后推进 currentFloor，为下一层创建新的 Round 空壳，并将阶段切回 preparation。
- WinnerDecided 为终局时，将 gameState 设为 end，currentFloor = 9。

## 持久化说明

- Room 仅存房间级指针与阶段状态。
- 对局过程数据拆分到 Match、MatchPlayer、Round 及其子表中。
- Round 在 preparation 阶段即落库，环境与投票结果按阶段补写。
- 每次命令接受后 version 递增以支持乐观并发。
