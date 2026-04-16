# 回合与对局实现

本文档的实现描述以 Node.js 作为后端语言。

## Round 值对象

Round 是单层的状态快照，在 preparation 阶段先创建为空壳，随后随阶段推进持续更新。

### Round 状态

- floor
- environmentCard
- roundKind
- currentVoteRound
- actionSubmissions
- damages
- voteSubmissions
- settlementResult
- voteResult
- stageSnapshots

### 更新流程

- preparation 阶段创建 Round 空壳，并初始化起始玩家与 currentVoteRound = 1。
- bet 阶段写入 ActionSubmission 列表，sequence 从 1 开始。
- environment 阶段设置 environmentCard 与 roundKind。
- action 阶段补充目标、检视与效果执行结果；若存在直出牌，则追加新的 ActionSubmission sequence。
- damage 阶段写入 damages 与 settlementResult。
- vote 阶段按 currentVoteRound 追加 VoteSubmission 列表。
- tieBreak 阶段固化 tieTargets；若回到 vote，则 currentVoteRound 递增。
- settlement 阶段写入最终 voteResult 并决定是否进入下一层。

## Match 聚合

Match 汇总所有 Round 与胜负结果，用于复盘输出。

### Match 状态

- matchId
- roomId
- rounds
- winnerResult

### 生命周期

- StartGame 时创建 Match。
- 每层结束追加 Round 快照。
- WinnerDecided 后终局封存。

## 持久化说明

- Round 以 (matchId, floor) 存储。
- environmentCard 与 roundKind 在 reveal 前允许为空。
- 行动、目标、投票、伤害、检视拆到独立子表，避免全部堆入 JSON。
- 行动子表以 sequence 保留同层多次出牌；投票子表以 voteRound 保留重投历史。
- Match 可存 reviewSnapshot 作为复盘冗余结构，同时保留对 Round 行的引用。
