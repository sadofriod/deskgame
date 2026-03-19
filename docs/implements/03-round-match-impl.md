# 回合与对局实现

本文档的实现描述以 Node.js 作为后端语言。

## Round 值对象

Round 是单回合的状态快照，在正式对局开始后按回合创建，随阶段推进持续更新。

### Round 状态

- round
- environmentCard
- betSubmissions
- actionLogs
- voteSubmissions
- voteResult
- settlementResult
- stageSnapshots

### 更新流程

- 押牌阶段结束后，追加 BetSubmission 列表。
- 系统揭示环境牌时，写入 environmentCard。
- 玩家行动阶段记录 actionLogs。
- 伤害结算阶段写入 settlementResult。
- 发言投票阶段追加 VoteSubmission 列表并记录 VoteResolved。

## Match 聚合

Match 汇总所有 Round 与胜负结果，用于复盘输出。

### Match 状态

- matchId
- roomId
- rounds
- winnerResult

### 生命周期

- RoleSelectionCompleted 时创建 Match。
- 每回合结束追加 Round 快照。
- WinnerDecided 后终局封存。

## 持久化说明

- Round 以 (roomId, round) 存储，提交、行动日志与结算为 JSON 字段。
- Match 可存 rounds 的 JSON 复盘，或引用 Round 行。
