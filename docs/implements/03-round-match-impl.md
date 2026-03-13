# 回合与对局实现

本文档的实现描述以 Node.js 作为后端语言。

## Round 值对象

Round 是单层的状态快照，楼层开始时创建，随阶段推进持续更新。

### Round 状态

- floor
- environmentCard
- actionSubmissions
- voteSubmissions
- settlementResult
- stageSnapshots

### 更新流程

- 行动阶段结束，追加 ActionSubmission 列表。
- 环境阶段设置 environmentCard。
- actionResolve/hurt 阶段写入 settlementResult。
- 投票阶段追加 VoteSubmission 列表并记录 VoteResolved。

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

- Round 以 (roomId, floor) 存储，提交与结算为 JSON 字段。
- Match 可存 rounds 的 JSON 复盘，或引用 Round 行。
