# 玩家实体实现

本文档的实现描述以 Node.js 作为后端语言。

## 范围

运行态玩家实体隶属于 Match 聚合，记录身份、角色、血量、押牌与投票所需的玩家状态。

## 实体状态

- openId
- identityCode
- chosenRoleCode（确认前可为空）
- maxHp（确认前可为空）
- currentHp（确认前可为空）
- isAlive
- canSpeak
- canVote
- voteModifier
- status

## 不变量

- currentHp <= 0 时，默认必须 isAlive = false；特殊角色可在 status 中声明例外。
- isAlive = false 不能提交行动或投票。
- 空押或被禁投时不可投票；被禁言时不可发言。

## 状态变化

- AssignIdentity
  - CardsDealt 时设置 identityCode、角色候选与待确认状态，chosenRoleCode 保持为空。

- ConfirmRoleSelection
  - 选择角色后设置 chosenRoleCode、maxHp、currentHp 与 roleSelectedAt。

- DealActionCards
  - 开局或抽牌效果触发时，向 MatchPlayerActionCard 发放手牌。

- SubmitAction
  - 在 bet 阶段锁定押牌，并以 sequence = 1 写入 RoundActionSubmission。

- ResolveAction
  - 在 action 阶段执行已锁定押牌；若存在可直出的手牌，则可追加 sequence > 1 的行动提交。

- ResolveDamage
  - 在 damage 阶段应用总伤害，并同步 currentHp、canSpeak、canVote、isAlive。

- ResolveVotePower
  - 在 vote 阶段根据行动牌和角色效果计算最终票权；若进入重投，则以新的 voteRound 单独记录。

## 持久化说明

- MatchPlayer 以 (matchId, openId) 作为主键。
- chosenRoleCode、maxHp、currentHp 在角色确认前允许为空。
- 手牌与押牌明细不直接堆在玩家主记录里，而是拆到 MatchPlayerActionCard 和 RoundActionSubmission。
- 每层开始于 preparation 阶段时，重置本层的发言/投票临时状态。
