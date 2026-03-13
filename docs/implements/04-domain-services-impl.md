# 领域服务实现

本文档的实现描述以 Node.js 作为后端语言。

## DealService

- 输入：players、roleConfig、seed
- 输出：openId 与 role 的映射
- 说明：基于 seed 的确定性洗牌，玩家顺序必须稳定。

## EnvironmentDeckService

- 输入：envConfig、seed
- 输出：8 张环境牌序列
- 说明：从 9 张中选 8 张，结果可复验。

## StageFlowService

- 输入：currentStage、timeoutFlag、ownerCommand
- 输出：nextStage
- 说明：单向推进；night -> action -> env -> actionResolve -> hurt -> talk -> vote。

## SettlementService

- 输入：environmentCard、actionSubmissions、players
- 输出：damages、votePowerChanges、eliminated 列表
- 说明：先处理免疫规则，再结算抓的不可防御伤害。

## WinnerJudgementService

- 输入：按角色统计的存活玩家、currentFloor
- 输出：winnerCamp、reason、isFinal
- 说明：每次结算与投票后评估胜负。
