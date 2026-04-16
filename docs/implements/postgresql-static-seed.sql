BEGIN;

INSERT INTO "RuleSet" (
  "code",
  "name",
  "description",
  "totalFloors",
  "gasRoundsToFinish"
) VALUES (
  'classic_v1',
  '经典规则 v1',
  '根据规则以及相关数据.md 提取的标准桌游规则集。',
  8,
  4
);

INSERT INTO "RuleDefinition" (
  "ruleSetCode",
  "code",
  "category",
  "name",
  "description",
  "engineKey",
  "params",
  "sortOrder"
) VALUES
  ('classic_v1', 'vote_base_power', 'vote', '基础票权', '所有可投票玩家基础票权为 1。', 'vote.base_power', '{"value": 1}'::jsonb, 1),
  ('classic_v1', 'vote_scold_bonus', 'vote', '骂牌票权', '押牌为骂时，本回合票权 +0.5。', 'vote.action_bonus', '{"actionCardCode": "scold", "bonus": 0.5}'::jsonb, 2),
  ('classic_v1', 'vote_empty_bet_invalid', 'vote', '空押不可投票', '未押牌或已出局玩家票权强制为 0，且不能发言。', 'vote.empty_bet_forbidden', NULL, 3),
  ('classic_v1', 'vote_tie_break', 'vote', '平票处理', '平票玩家进入额外辩论，双方不能投票，其余玩家只能在平票目标间投票。', 'vote.tie_break', NULL, 4),
  ('classic_v1', 'damage_hp_floor', 'damage', '血量扣减', '最终血量 = 当前血量 - 总伤害，最低为 0。', 'damage.apply_to_hp', '{"minHp": 0}'::jsonb, 5),
  ('classic_v1', 'damage_zero_eliminated', 'damage', '空血出局', '血量小于等于 0 时标记出局。', 'damage.eliminate_when_zero', NULL, 6),
  ('classic_v1', 'winner_passenger_clear_fatter', 'win', '乘客淘汰屁者获胜', '活跃屁者人数为 0 时，乘客获胜。', 'winner.passenger_when_no_fatter', NULL, 7),
  ('classic_v1', 'winner_passenger_final_floor', 'win', '八层结束乘客获胜', '第 8 层结束后，若活跃乘客人数大于活跃屁者人数，则乘客获胜。', 'winner.passenger_on_final_floor', '{"floor": 8}'::jsonb, 8),
  ('classic_v1', 'winner_fatter_majority', 'win', '屁者人数追平获胜', '任意时刻活跃乘客人数小于等于活跃屁者人数时，屁者获胜。', 'winner.fatter_when_not_outnumbered', NULL, 9),
  ('classic_v1', 'winner_fatter_gas_rounds', 'win', '四轮屁牌获胜', '累计完成 4 轮有屁回合后，屁者立即获胜。', 'winner.fatter_after_gas_rounds', '{"gasRounds": 4}'::jsonb, 10),
  ('classic_v1', 'flow_stage_order', 'flow', '阶段顺序', '准备 -> 押牌 -> 环境 -> 行动 -> 伤害结算 -> 发言 -> 投票 -> 投票结算；若平票则进入平票辩论并重投。', 'flow.stage_order', '{"stages": ["preparation", "bet", "environment", "action", "damage", "talk", "vote", "settlement"], "tieBreakStage": "tieBreak", "tieBreakBackTo": "vote"}'::jsonb, 11);

INSERT INTO "IdentityDefinition" (
  "ruleSetCode",
  "code",
  "name",
  "camp",
  "description",
  "knowsEnvironmentOrder",
  "defaultKnowsTeammates",
  "sortOrder"
) VALUES
  ('classic_v1', 'passenger', '乘客', 'passenger', '乘客阵营，不知道其他乘客身份。', false, false, 1),
  ('classic_v1', 'fatter', '屁者', 'fatter', '屁者阵营，开局可知道环境牌排序。', true, false, 2);

INSERT INTO "IdentityDistribution" (
  "ruleSetCode",
  "playerCount",
  "identityCode",
  "quantity",
  "knowsTeammates"
) VALUES
  ('classic_v1', 5, 'passenger', 3, false),
  ('classic_v1', 5, 'fatter', 2, false),
  ('classic_v1', 6, 'passenger', 4, false),
  ('classic_v1', 6, 'fatter', 2, false),
  ('classic_v1', 7, 'passenger', 5, false),
  ('classic_v1', 7, 'fatter', 2, true),
  ('classic_v1', 8, 'passenger', 6, false),
  ('classic_v1', 8, 'fatter', 2, true),
  ('classic_v1', 9, 'passenger', 6, false),
  ('classic_v1', 9, 'fatter', 3, true),
  ('classic_v1', 10, 'passenger', 7, false),
  ('classic_v1', 10, 'fatter', 3, true);

INSERT INTO "ActionCardDefinition" (
  "ruleSetCode",
  "code",
  "name",
  "description",
  "roundKindRestriction",
  "drawCountOnGas",
  "drawCountOnSafe",
  "voteBonus",
  "extraSelfDamageOnGas",
  "blocksAllDamage",
  "cannotAbstain",
  "canDirectPlayInAction",
  "sortOrder"
) VALUES
  ('classic_v1', 'endure', '忍', '押牌后本回合防御所有伤害。', NULL, 0, 0, 0.0, 0, true, false, false, 1),
  ('classic_v1', 'scold', '骂', '有屁回合抽 1 张牌，票权 +0.5，投票阶段不能弃票。', 'gas', 1, 0, 0.5, 0, false, true, false, 2),
  ('classic_v1', 'blow', '吹', '有屁回合抽 1 张牌，并对相邻一位玩家造成 1 点伤害。', 'gas', 1, 0, 0.0, 0, false, false, false, 3),
  ('classic_v1', 'suck', '吸', '无屁回合抽 2 张牌；有屁回合额外受 1 点伤害。', NULL, 0, 2, 0.0, 1, false, false, false, 4),
  ('classic_v1', 'grab', '抓', '有屁回合对 1 位玩家造成 1 点不可防御伤害；你的行动阶段可直接打出。', 'gas', 0, 0, 0.0, 0, false, false, true, 5),
  ('classic_v1', 'listen', '听', '有屁回合独自检视 1 位活跃玩家的身份牌。', 'gas', 0, 0, 0.0, 0, false, false, false, 6);

INSERT INTO "ActionCardEffect" (
  "ruleSetCode",
  "cardCode",
  "code",
  "timing",
  "engineKey",
  "targeting",
  "damage",
  "drawCount",
  "canInspectIdentity",
  "ignoresDefense",
  "description",
  "params"
) VALUES
  ('classic_v1', 'endure', 'block_round_damage', 'damage', 'action.endure.block_round_damage', 'self', NULL, NULL, false, false, '本回合免疫全部伤害。', NULL),
  ('classic_v1', 'scold', 'draw_on_gas', 'action', 'action.scold.draw', 'self', NULL, 1, false, false, '有屁回合抽 1 张牌。', '{"roundKind": "gas"}'::jsonb),
  ('classic_v1', 'scold', 'vote_bonus', 'vote', 'action.scold.vote_bonus', 'self', NULL, NULL, false, false, '本回合票权 +0.5。', '{"bonus": 0.5}'::jsonb),
  ('classic_v1', 'scold', 'cannot_abstain', 'vote', 'action.scold.cannot_abstain', 'self', NULL, NULL, false, false, '投票阶段不能弃票。', NULL),
  ('classic_v1', 'blow', 'draw_on_gas', 'action', 'action.blow.draw', 'self', NULL, 1, false, false, '有屁回合抽 1 张牌。', '{"roundKind": "gas"}'::jsonb),
  ('classic_v1', 'blow', 'adjacent_damage', 'action', 'action.blow.damage_adjacent', 'adjacent_player', 1, NULL, false, false, '对相邻一位玩家造成 1 点伤害。', NULL),
  ('classic_v1', 'suck', 'draw_on_safe', 'action', 'action.suck.draw', 'self', NULL, 2, false, false, '无屁回合抽 2 张牌。', '{"roundKind": "safe"}'::jsonb),
  ('classic_v1', 'suck', 'extra_self_damage_on_gas', 'damage', 'action.suck.extra_self_damage', 'self', 1, NULL, false, false, '有屁回合额外受 1 点伤害。', '{"roundKind": "gas"}'::jsonb),
  ('classic_v1', 'grab', 'unavoidable_damage', 'action', 'action.grab.damage_target', 'single_player', 1, NULL, false, true, '对 1 位玩家造成 1 点不可防御伤害。', NULL),
  ('classic_v1', 'grab', 'direct_play', 'action', 'action.grab.direct_play', 'single_player', 1, NULL, false, true, '你的行动阶段可直接打出。', NULL),
  ('classic_v1', 'listen', 'inspect_identity', 'action', 'action.listen.inspect_identity', 'single_player', NULL, NULL, true, false, '独自检视 1 位活跃玩家身份牌。', NULL);

INSERT INTO "EnvironmentCardDefinition" (
  "ruleSetCode",
  "code",
  "name",
  "roundKind",
  "baseDamageAll",
  "description",
  "sortOrder"
) VALUES
  ('classic_v1', 'gas', '有屁', 'gas', 1, '对所有玩家造成 1 点伤害。', 1),
  ('classic_v1', 'no_gas', '无屁', 'safe', 0, '无屁环节，不造成环境伤害。', 2),
  ('classic_v1', 'stuffy_gas', '有闷屁', 'gas', 0, '对所有押牌玩家造成 1 点伤害，对所有空押玩家造成 3 点伤害。', 3),
  ('classic_v1', 'smelly_gas', '有臭屁', 'gas', 2, '对所有玩家造成 2 点伤害。', 4);

INSERT INTO "EnvironmentCardEffect" (
  "ruleSetCode",
  "cardCode",
  "code",
  "engineKey",
  "targeting",
  "damage",
  "description",
  "params"
) VALUES
  ('classic_v1', 'gas', 'damage_all', 'environment.gas.damage_all', 'all_players', 1, '对所有玩家造成 1 点伤害。', NULL),
  ('classic_v1', 'stuffy_gas', 'damage_bettors', 'environment.stuffy_gas.damage_bettors', 'players_with_bet', 1, '对所有押牌玩家造成 1 点伤害。', NULL),
  ('classic_v1', 'stuffy_gas', 'damage_empty_bet', 'environment.stuffy_gas.damage_empty_bet', 'players_without_bet', 3, '对所有空押玩家造成 3 点伤害。', NULL),
  ('classic_v1', 'smelly_gas', 'damage_all', 'environment.smelly_gas.damage_all', 'all_players', 2, '对所有玩家造成 2 点伤害。', NULL);

INSERT INTO "EnvironmentDeckTemplate" (
  "ruleSetCode",
  "code",
  "name",
  "description",
  "totalCards",
  "revealedCards"
) VALUES (
  'classic_v1',
  'classic_pool_v1',
  '经典环境牌池',
  '9 张环境牌中随机去掉有臭屁或有闷屁之一，最终形成 8 回合牌堆。',
  9,
  8
);

INSERT INTO "EnvironmentDeckTemplateItem" (
  "ruleSetCode",
  "templateCode",
  "environmentCardCode",
  "quantity",
  "isOptional"
) VALUES
  ('classic_v1', 'classic_pool_v1', 'gas', 3, false),
  ('classic_v1', 'classic_pool_v1', 'no_gas', 4, false),
  ('classic_v1', 'classic_pool_v1', 'smelly_gas', 1, true),
  ('classic_v1', 'classic_pool_v1', 'stuffy_gas', 1, true);

INSERT INTO "RoleDefinition" (
  "ruleSetCode",
  "code",
  "sortOrder",
  "name",
  "baseHp",
  "abilityTiming",
  "abilityKey",
  "abilityDescription",
  "abilityConfig",
  "isEnabled"
) VALUES
  ('classic_v1', 'broker', 1, '中介', 4, 'action', 'role.broker.mutual_reveal_once', '行动阶段，可使两位其他玩家互相检视彼此的身份牌，每局限一次。', '{"limit": 1, "targets": 2}'::jsonb, true),
  ('classic_v1', 'alien', 2, '外星人', 4, 'bet_end', 'role.alien.swap_future_environment', '押牌阶段结束时，可弃除两张手牌，将两张尚未触发的环境牌位置对调。', '{"discardCount": 2, "targets": 2}'::jsonb, true),
  ('classic_v1', 'pumpkin', 3, '南瓜头', 5, 'passive', 'role.pumpkin.extra_blow_damage_taken', '血量 +1，“吹”对你造成的伤害 +1。', '{"extraDamageSource": "blow", "bonusDamage": 1}'::jsonb, true),
  ('classic_v1', 'vampire', 4, '吸血鬼', 4, 'action', 'role.vampire.suck_cards_from_players', '“吸”的抽牌效果可改为抽取玩家手牌。', '{"cardCode": "suck", "maxCards": 2}'::jsonb, true),
  ('classic_v1', 'melancholy_lady', 5, '忧郁的女士', 4, 'eliminated', 'role.melancholy_lady.replace_role_on_leave', '离场时，选择一位玩家，将其角色牌替换为忧郁的女士。', NULL, true),
  ('classic_v1', 'plague_doctor', 6, '瘟疫医生', 5, 'passive', 'role.plague_doctor.no_empty_bet_or_abstain', '血量 +1，不可空押或弃票。', '{"forbidEmptyBet": true, "forbidAbstain": true}'::jsonb, true),
  ('classic_v1', 'unlucky_guy', 7, '非酋', 4, 'environment', 'role.unlucky_guy.draw_on_gas_streak', '当 1 号环境牌为屁牌时抽两张牌；当出现连续屁牌时抽一张牌。', '{"firstGasDraw": 2, "streakGasDraw": 1}'::jsonb, true),
  ('classic_v1', 'prophet', 8, '预言家', 4, 'setup', 'role.prophet.peek_floor_8', '首个押注阶段开始时，独自查看 8 号环境牌。', '{"position": 8}'::jsonb, true),
  ('classic_v1', 'hypnotist', 9, '催眠师', 4, 'action', 'role.hypnotist.swap_bet_card', '行动阶段开始时，可与一位玩家交换押注牌；若其当前血量小于你，则其无法拒绝。', NULL, true),
  ('classic_v1', 'big_bro', 10, '榜一大哥', 4, 'vote', 'role.big_bro.discard_for_votes', '起始手牌 +1。投票时可弃任意张手牌，每张使本回合投票 +0.5。', '{"startDrawBonus": 1, "discardVoteBonus": 0.5}'::jsonb, true),
  ('classic_v1', 'yokozuna', 11, '横纲', 4, 'endgame', 'role.yokozuna.count_as_two', '游戏结束时，结算人数视为 2；若结束时已离场则无效。', '{"survivorWeight": 2}'::jsonb, true),
  ('classic_v1', 'keyboard_warrior', 12, '键盘侠', 4, 'passive', 'role.keyboard_warrior.vote_after_leave', '活跃时投票 -0.5，离场后仍可投票，票数为 1。', '{"activeVoteModifier": -0.5, "postLeaveVotePower": 1}'::jsonb, true),
  ('classic_v1', 'aq', 13, '阿Q', 4, 'passive', 'role.aq_scold_defense_and_reflect_vote', '“骂”能防御 1 点屁牌伤害；投你的人若被你投中，其自身被投数 +1。', NULL, true),
  ('classic_v1', 'landlord', 14, '地主', 4, 'vote', 'role.landlord.vote_bonus_when_three_players', '当活跃人数为 3 人时，投票 +1。', '{"alivePlayers": 3, "voteBonus": 1}'::jsonb, true),
  ('classic_v1', 'lin_daiyu', 15, '林黛玉', 4, 'eliminated', 'role.lin_daiyu.peek_and_give_hand', '出局时，可检视一位活跃玩家身份牌，并可将剩余手牌交给任意一位玩家或弃除。', NULL, true),
  ('classic_v1', 'monkey_king', 16, '孙悟空', 4, 'setup', 'role.monkey_king.copy_role_skill', '选人阶段复制一位玩家的角色技能，不能复制离场时或离场后的技能。', NULL, true),
  ('classic_v1', 'mask_master', 17, '变脸大师', 4, 'action', 'role.mask_master_rebet', '“吸”抽牌 -1；有屁回合行动阶段可弃除押牌并重新押注，重新押牌不可空押。', '{"suckDrawPenalty": 1, "roundKind": "gas"}'::jsonb, true),
  ('classic_v1', 'escort', 18, '镖师', 4, 'action', 'role.escort_two_cards_as_grab', '可将 2 张手牌当 1 张“抓”使用。', '{"discardCount": 2, "asCard": "grab"}'::jsonb, true),
  ('classic_v1', 'zombie', 19, '僵尸', 4, 'passive', 'role.zombie_stay_at_zero', '空血时不会出局，继续游戏，但无法发言或投票，游戏结束时人数视为 0。', '{"keepAliveAtZero": true, "canSpeak": false, "canVote": false, "survivorWeight": 0}'::jsonb, true),
  ('classic_v1', 'blind_swordsman', 20, '盲侠', 4, 'bet', 'role.blind_swordsman_two_cards_as_listen', '可将 2 张手牌当 1 张“听”押注。', '{"discardCount": 2, "asCard": "listen"}'::jsonb, true),
  ('classic_v1', 'special_ops', 21, '特战员', 4, 'damage', 'role.special_ops_peek_attacker_identity', '有屁回合，当有玩家触发“吹”或“抓”并造成伤害时，你可检视其身份牌。', '{"watchCards": ["blow", "grab"], "roundKind": "gas"}'::jsonb, true),
  ('classic_v1', 'mechanic', 22, '修理工', 4, 'eliminated', 'role.mechanic_remove_environment', '离场时，可打出 2 张相同手牌，将 1 张未翻开的环境牌移出牌堆，至多移除 1 张。', '{"discardSameCardCount": 2, "limit": 1}'::jsonb, true),
  ('classic_v1', 'thief', 23, '小偷', 4, 'eliminated', 'role.thief_discard_target_hand', '淘汰时，可选择 1 位玩家，弃除其等同于你当前血量的手牌。', NULL, true),
  ('classic_v1', 'robot', 24, 'Robot', 4, 'damage', 'role.robot_peek_environment_after_multi_damage', '一回合内受到大于 1 点伤害时，可检视 1 张尚未触发的环境牌，每回合限 1 次。', '{"threshold": 2, "limitPerRound": 1}'::jsonb, true),
  ('classic_v1', 'detective', 25, '侦探', 4, 'eliminated', 'role.detective_reveal_identity_on_vote_out', '其他玩家淘汰时，你可选择公示其身份牌；若非屁者阵营，则你一并淘汰。', NULL, true),
  ('classic_v1', 'ninja', 27, '忍者', 4, 'passive', 'role.ninja_true_immunity', '“忍”免疫所有伤害，包括不可防御伤害和精神伤害。', '{"cardCode": "endure", "ignoreUnavoidable": true}'::jsonb, true),
  ('classic_v1', 'operator', 28, '接听员', 4, 'reveal', 'role.operator_share_listen_result', '当有玩家触发“听”检视身份牌时，你一并检视该身份牌。', '{"watchCard": "listen"}'::jsonb, true),
  ('classic_v1', 'introvert', 29, '社恐', 5, 'talk', 'role.introvert_skip_first_talk', '血量 +1，跳过首个发言阶段。', '{"skipTalkRounds": 1}'::jsonb, true),
  ('classic_v1', 'gourmet', 30, '美食家', 4, 'vote', 'role.gourmet_vote_per_damage', '本回合每受到 1 点伤害，投票 +0.5。', '{"voteBonusPerDamage": 0.5}'::jsonb, true),
  ('classic_v1', 'elevator_king', 31, '电梯战神', 4, 'damage', 'role.elevator_king_reflect_damage', '对你造成伤害的玩家会受到同等伤害。', '{"reflect": "same_amount"}'::jsonb, true),
  ('classic_v1', 'zhuge_liang', 32, '诸葛亮', 4, 'vote', 'role.zhuge_liang_disable_other_scold_bonus', '当押牌为“骂”时，其他玩家“骂”无 0.5 票加成。', '{"watchCard": "scold"}'::jsonb, true),
  ('classic_v1', 'cat_person', 33, '喵星人', 4, 'eliminated', 'role.cat_person_give_hand_and_bonus', '离场后，可将剩余手牌给一位活跃玩家；若其直到游戏结束仍未离场，则其结算人数 +0.5。', '{"survivorBonus": 0.5}'::jsonb, true),
  ('classic_v1', 'leader', 34, '领导', 4, 'vote', 'role.leader_vote_bonus_per_abstain', '每有 1 位玩家弃票，该回合投票 +0.5。', '{"voteBonusPerAbstain": 0.5}'::jsonb, true),
  ('classic_v1', 'security_guard', 35, '保安', 4, 'eliminated', 'role.security_guard_peek_identity_on_leave', '当其他玩家离场后，检视其身份牌。', NULL, true),
  ('classic_v1', 'social_person', 36, '社会人', 4, 'passive', 'role.social_person_static_vote_bonus', '投票始终 +0.5。', '{"voteBonus": 0.5}'::jsonb, true),
  ('classic_v1', 'delivery_rider', 37, '外卖小哥', 4, 'eliminated', 'role.delivery_rider_revive_next_round', '首次离场后，保留 1 张手牌，于下回合结束后返场，届时血量为 1；若下回合为最后一回合则无法返场。', '{"reviveHp": 1, "keepCards": 1, "limit": 1}'::jsonb, true),
  ('classic_v1', 'cleaner', 38, '保洁阿姨', 4, 'passive', 'role.cleaner_scold_draw_and_vote_taken', '有屁回合“骂”抽牌 +1，该回合背负票数 +0.5。', '{"roundKind": "gas", "extraDrawOnScold": 1, "receivedVoteModifier": 0.5}'::jsonb, true),
  ('classic_v1', 'chef', 39, '大厨', 4, 'passive', 'role.chef_all_gas_damage_to_one', '将所有屁牌的伤害视为 1。', '{"gasDamageCap": 1}'::jsonb, true),
  ('classic_v1', 'baby', 40, '婴儿', 4, 'passive', 'role.baby_received_vote_minus', '背负票数始终 -0.5，最低不低于 0。', '{"receivedVoteModifier": -0.5, "minVotes": 0}'::jsonb, true),
  ('classic_v1', 'irobot', 41, 'irobot', 4, 'bet', 'role.irobot_blow_and_grab_as_endure', '可将“吹”和“抓”当“忍”使用。', '{"fromCards": ["blow", "grab"], "toCard": "endure"}'::jsonb, true),
  ('classic_v1', 'head_teacher', 42, '班主任', 4, 'talk', 'role.head_teacher_interrupt_speech', '其他玩家发言时，你可弃 1 张手牌，终止其本回合发言。', '{"discardCount": 1}'::jsonb, true),
  ('classic_v1', 'sunshine_boy', 43, '阳光开朗大男孩', 4, 'passive', 'role.sunshine_boy_no_ability', '无技能。', NULL, true),
  ('classic_v1', 'rhinitis_kid', 44, '鼻炎小孩', 5, 'passive', 'role.rhinitis_kid_vote_minus', '血量 +1，投票始终 -0.5。', '{"voteModifier": -0.5}'::jsonb, true),
  ('classic_v1', 'smoke_man', 45, '烟男', 4, 'passive', 'role.smoke_man_vote_taken_plus_and_suck_immune', '背负票数始终 +0.5；有屁回合“吸”不生效。', '{"receivedVoteModifier": 0.5, "disableCardOnGas": "suck"}'::jsonb, true),
  ('classic_v1', 'old_doctor', 46, '老中医', 4, 'action', 'role.old_doctor_peek_after_suck', '有屁回合，“吸”触发后检视 1 位活跃玩家身份牌；若因此出局则无法触发。', '{"watchCard": "suck", "roundKind": "gas"}'::jsonb, true),
  ('classic_v1', 'doctor', 47, '医生', 4, 'bet_end', 'role.doctor_assign_bet_to_empty_player', '押牌阶段结束时，你可使用 1 张手牌为 1 位空押玩家押注。', '{"discardCount": 1, "targets": 1}'::jsonb, true),
  ('classic_v1', 'young_master', 48, '少爷', 3, 'setup', 'role.young_master_extra_start_cards', '血量 3，开局抽牌 +3。', '{"startDrawBonus": 3}'::jsonb, true);

COMMIT;