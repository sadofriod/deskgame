# PostgreSQL 规则数据模型

本文档将规则文档里的静态内容拆成两层：

- 规则字典层：行动牌、环境牌、身份、角色、人数配置、胜负规则。
- 对局状态层：房间、对局、玩家、回合、伤害、投票、检视记录。

这样做的原因是：

- 静态规则需要可配置、可审计、可做后台运营。
- 对局状态需要强关系和可复盘能力。
- 角色技能异构程度很高，不能强行全部做成列；因此采用 `abilityKey + abilityConfig + abilityDescription` 的组合，兼顾查询和引擎执行。

## 哪些内容适合落库

适合直接落库的数据：

- 身份定义：乘客、屁者，及其阵营、是否知道环境序列、是否默认知道队友。
- 人数配置：5-10 人局各身份数量，以及是否互认。
- 行动牌定义：基础描述、回合限制、抽牌、票权、是否免疫、是否可行动阶段直出。
- 环境牌定义：回合类型、基础伤害、特殊伤害规则。
- 角色定义：角色名、基础血量、技能时机、技能引擎键、技能说明。
- 通用规则：投票、伤害、胜负、阶段流转等引擎规则。

不适合完全用列硬编码的数据：

- 复杂角色技能的执行细节，例如“忧郁的女士”“孙悟空”“修理工”“班主任”。
- 需要跨阶段、跨对象计算的规则组合。

这类规则在表里保存为：

- `engineKey`：后端结算引擎的稳定入口。
- `params` 或 `abilityConfig`：数值参数、次数限制、目标范围。
- `description`：给后台和调试查看的人类可读描述。

## 核心关系

- `RuleSet` 1:N `IdentityDefinition`
- `RuleSet` 1:N `IdentityDistribution`
- `RuleSet` 1:N `ActionCardDefinition`
- `ActionCardDefinition` 1:N `ActionCardEffect`
- `RuleSet` 1:N `EnvironmentCardDefinition`
- `EnvironmentCardDefinition` 1:N `EnvironmentCardEffect`
- `RuleSet` 1:N `RoleDefinition`
- `RuleSet` 1:N `RuleDefinition`
- `EnvironmentDeckTemplate` 1:N `EnvironmentDeckTemplateItem`
- `Match` 1:N `MatchPlayer`
- `MatchPlayer` 1:N `MatchPlayerRoleOption`
- `Round` 1:N `RoundActionSubmission`
- `Round` 1:N `RoundVoteSubmission`
- `Round` 1:N `RoundDamage`
- `Round` 1:N `IdentityReveal`

## 设计取舍

### 1. 身份和角色拆开

原文档里的“身份牌”和“角色牌”是两套概念：

- 身份决定阵营和胜负归属。
- 角色决定技能和基础血量。

因此运行时玩家需要同时关联：

- `identityCode`
- `chosenRoleCode`

`MatchPlayer` 会在 `StartGame` 时先创建身份与待确认状态，`chosenRoleCode`、`maxHp`、`currentHp` 在角色确认前允许为空。

### 2. 行动牌与环境牌独立建模

行动牌和环境牌都属于“规则字典”，但它们的触发方式不同：

- 行动牌由玩家提交和行动阶段触发。
- 环境牌由回合环境触发。

所以拆成两张定义表，并分别挂效果子表。

### 3. 角色技能不做过度范式化

47 个角色里，只有一部分能自然抽象成固定字段，例如：

- 基础血量变化
- 固定投票修正
- 开局抽牌加成
- 是否只能在某阶段触发

但大量角色是事件驱动技能，硬拆成很多列会让表失真且难维护。因此角色表只保留：

- 基础属性
- 技能时机
- 引擎键
- 技能描述
- JSON 参数

### 4. 回合明细采用强关系表，而不是全部塞 JSON

回合里的行动、投票、伤害、检视都拆成独立表，而不是只保留 `jsonb`：

- 更容易做复盘查询
- 更容易排查结算问题
- 更容易做战绩统计和后台报表

保留 JSON 的位置主要是：

- `settlementResult`
- `voteResult`
- `reviewSnapshot`

它们用于保存最终快照或冗余结果。

补充约束：

- `Round` 在 `preparation` 阶段预创建为空壳，`environmentCardCode` 与 `roundKind` 在 `environment` 阶段补写。
- `RoundActionSubmission` 通过 `sequence` 保留同层多次出牌，包括押牌和行动阶段直出。
- `RoundVoteSubmission` 通过 `voteRound` 保留首轮投票与平票重投历史。

## 建议的落地顺序

1. 先建静态字典：`RuleSet`、身份、牌、角色、人数配置。
2. 再建运行态表：房间、对局、玩家、回合。
3. 最后把结算服务切到 `engineKey` 驱动，逐步减少硬编码。

静态数据样例见 [postgresql-static-seed.sql](postgresql-static-seed.sql)。
完整 Prisma 草案见 [schema.prisma](schema.prisma)。