# 领域服务实现

本文档的实现描述以 Node.js 作为后端语言。

## DealService

- 输入：players、roomConfig、seed
- 输出：openId 与 3 张候选角色的映射
- 说明：基于 seed 的确定性洗牌，玩家顺序必须稳定，且身份配比需符合房间人数规则。

## EnvironmentDeckService

- 输入：envConfig、seed
- 输出：8 张环境牌序列
- 说明：从 9 张中选 8 张，结果可复验。

## StageFlowService

- 输入：currentStage、currentRound、allReady、allRolesSelected、allBetsSubmitted、allVotesSubmitted、winnerState
- 输出：nextStage
- 说明：单向推进；lobby -> roleSelection -> bet -> action -> settlement -> discussionVote -> review。

## SettlementService

- 输入：environmentCard、betSubmissions、actionTargets、players
- 输出：damages、heals、votePowerChanges、eliminated、actionLogs
- 说明：先结算环境基础伤害，再处理行动牌效果、不押牌惩罚与免疫规则。

## WinnerJudgementService

- 输入：按角色统计的存活玩家、currentRound、allEliminated
- 输出：winnerCamp、reason、isFinal
- 说明：每次结算与投票后评估胜负，第 8 回合结束后进行最终判定。
