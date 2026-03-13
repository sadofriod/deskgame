# 玩家实体实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

Player 实体隶属于 Room 聚合，记录行动、投票与存活所需的玩家状态。

## 实体状态

- openId
- nickname
- avatar
- role
- hp
- votePower
- isAlive
- actionCard
- voteTarget
- isReady
- joinTime

## 不变量

- hp <= 0 必须 isAlive = false。
- isAlive = false 不能提交行动或投票。
- actionCard 为空不可投票或发言。

## 状态变化

- AssignRole
  - CardsDealt 时设置 role。

- DrawActionCard
  - 行动阶段更新 actionCard。

- SubmitAction
  - 锁定 actionCard，并在 Round 中记录提交时间。

- ResolveDamage
  - 应用总伤害；若 hp <= 0，标记 isAlive = false。

- ResolveVotePower
  - 根据行动牌计算本回合 votePower。

## 持久化说明

- Player 以 (roomId, openId) 作为主键。
- 每层开始于 night 阶段时重置 actionCard 与 voteTarget。
