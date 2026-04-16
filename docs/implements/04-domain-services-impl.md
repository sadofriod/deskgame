# 领域服务实现

本文档的实现描述以 Node.js 作为后端语言。

## DealService

- 输入：players、identityDistribution、rolePool、seed
- 输出：MatchPlayer 初始身份、角色候选、初始手牌与待确认角色状态
- 说明：基于 seed 的确定性洗牌，玩家顺序必须稳定。

## EnvironmentDeckService

- 输入：deckTemplate、seed
- 输出：MatchEnvironmentDeck 的 8 层环境牌序列
- 说明：从模板牌池中生成可复验序列，并保留被移除/未揭示信息。

## StageFlowService

- 输入：currentStage、timeoutFlag、ownerCommand、roundState、roleSelectionState
- 输出：nextStage
- 说明：主路径单向推进；preparation -> bet -> environment -> action -> damage -> talk -> vote -> settlement。preparation 需等待全部玩家确认角色。若 vote 平票，则进入 tieBreak 后回到 vote，且 currentVoteRound + 1。

## SettlementService

- 输入：round、environmentCard、按 sequence 排序的 actionSubmissions、players
- 输出：damages、identityReveals、playerStateChanges、eliminated 列表
- 说明：在 damage 阶段先处理免疫/不可防御规则，再更新血量、禁言/禁投等状态，并生成回合快照。

## WinnerJudgementService

- 输入：按身份统计的存活玩家、currentFloor、resolvedGasRounds
- 输出：winnerCamp、reason、isFinal
- 说明：在 settlement 阶段评估胜负；第 8 层结束和 4 轮有屁回合都属于终局条件。活跃人数为 0 时按规则判定为屁者获胜。
