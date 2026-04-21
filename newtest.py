import requests
import uuid
import time
from typing import Dict, List, Optional, Any

# ===================== 基础配置 =====================
BASE_URL = "https://deskgame.ashesborn.cloud"
PLAYERS = [
    {"openId": "player_001", "nickname": "玩家1（房主）", "avatar": "avatar_1"},
    {"openId": "player_002", "nickname": "玩家2", "avatar": "avatar_2"},
    {"openId": "player_003", "nickname": "玩家3", "avatar": "avatar_3"},
    {"openId": "player_004", "nickname": "玩家4", "avatar": "avatar_4"},
    {"openId": "player_005", "nickname": "玩家5", "avatar": "avatar_5"},
    {"openId": "player_006", "nickname": "玩家6", "avatar": "avatar_6"},
]
ROOM_CONFIG = {
    "ruleSetCode": "classic_v1",
    "deckTemplateCode": "classic_pool_v1",
}

# 后端要求 targetOpenId 的押牌（参见 src/domain/aggregates/Room.ts: TARGETED_CARDS）
TARGETED_CARDS = {"grab"}

# 环境牌伤害规则（参见 docs/规则以及相关数据.md #环境牌）
#   gas         有屁  → 全员1点
#   no_gas      无屁  → 无伤害
#   smelly_gas  有臭屁 → 全员2点
#   stuffy_gas  有闷屁 → 押牌玩家1点，空押玩家3点
ENV_DAMAGE_ALL = {"gas": 1, "no_gas": 0, "smelly_gas": 2}
GAS_CARDS = {"gas", "smelly_gas", "stuffy_gas"}
NON_GAS_CARDS = {"no_gas"}


# ===================== 工具函数 =====================
def generate_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:8]}"


def _safe_error_body(resp: Optional[requests.Response]) -> str:
    if resp is None:
        return ""
    try:
        return f" body={resp.json()}"
    except Exception:
        return f" body={resp.text[:200]}"


def post_request(url: str, payload: Dict) -> Dict:
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        return {"success": True, "data": resp.json(), "status_code": resp.status_code}
    except requests.exceptions.RequestException as e:
        resp = getattr(e, "response", None)
        return {
            "success": False,
            "error": f"{e}{_safe_error_body(resp)}",
            "status_code": getattr(resp, "status_code", None),
        }


def get_request(url: str) -> Dict:
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return {"success": True, "data": resp.json(), "status_code": resp.status_code}
    except requests.exceptions.RequestException as e:
        resp = getattr(e, "response", None)
        return {
            "success": False,
            "error": f"{e}{_safe_error_body(resp)}",
            "status_code": getattr(resp, "status_code", None),
        }


# ===================== 核心游戏流程 =====================
class DeskGameTest:
    def __init__(self, base_url: str, players: List[Dict], room_config: Dict):
        self.base_url = base_url
        self.players = players
        self.room_config = room_config
        self.room_id: Optional[str] = None
        self.host_player = players[0]
        # 始终保存最新的房间快照（用于读取 voteModifier / canVote / currentVoteRound 等）
        self.latest_room: Dict[str, Any] = {}
        # 环境牌测试：记录每回合 (floor, environmentCardCode)，以及每回合的伤害校验结果
        self.env_log: List[Dict[str, Any]] = []
        # 进入 damage 阶段前的 hp 快照：openId → hp
        self._hp_before_damage: Dict[str, int] = {}

    # ---------- 快照辅助 ----------
    def _update_snapshot(self, data: Dict) -> None:
        room = data.get("room")
        if isinstance(room, dict):
            self.latest_room = room

    def _match(self) -> Dict[str, Any]:
        match = self.latest_room.get("match")
        return match if isinstance(match, dict) else {}

    def _match_players(self) -> List[Dict[str, Any]]:
        return self._match().get("players", []) or []

    def _player_state(self, open_id: str) -> Optional[Dict[str, Any]]:
        for mp in self._match_players():
            if mp.get("openId") == open_id:
                return mp
        return None

    def _alive_players(self) -> List[Dict]:
        alive_ids = {mp["openId"] for mp in self._match_players() if mp.get("isAlive")}
        if not alive_ids:
            return list(self.players)
        return [p for p in self.players if p["openId"] in alive_ids]

    def _current_round(self) -> Dict[str, Any]:
        floor = self.latest_room.get("currentFloor")
        for r in self._match().get("rounds", []) or []:
            if r.get("floor") == floor:
                return r
        return {}

    def _current_vote_round(self) -> int:
        return int(self._current_round().get("currentVoteRound") or 1)

    def _bet_action_code(self, open_id: str) -> Optional[str]:
        for s in self._current_round().get("actionSubmissions", []) or []:
            if s.get("openId") == open_id and s.get("sourceStage") == "bet":
                return s.get("actionCardCode")
        return None

    def _vote_power(self, open_id: str) -> float:
        state = self._player_state(open_id) or {}
        modifier = float(state.get("voteModifier") or 0)
        return 1 + modifier

    # ---------- 环境牌测试辅助 ----------
    def _hp_map(self) -> Dict[str, int]:
        return {
            mp["openId"]: int(mp.get("currentHp") or 0)
            for mp in self._match_players()
        }

    def _expected_env_damage(self, env_code: str, open_id: str) -> Optional[int]:
        """仅计算“环境牌本身”的基础伤害，不包含 suck/blow/grab 等行动牌加成。
        若返回 None 表示无法判定（如死亡玩家）。"""
        state = self._player_state(open_id) or {}
        if not state.get("isAlive"):
            return 0
        if env_code in ("gas", "smelly_gas"):
            return ENV_DAMAGE_ALL[env_code]
        if env_code == "no_gas":
            return 0
        if env_code == "stuffy_gas":
            # 押牌玩家1点，空压玩家3点
            return 1 if self._bet_action_code(open_id) is not None else 3
        return None

    def _verify_environment_damage(self, floor: int) -> Dict[str, Any]:
        """对比 damage 阶段前后的 hp，校验环境牌伤害是否符合规则。
        注意：实际伤害 = 环境伤害 + 行动牌伤害（吹/抓/吸 自伤等）。本校验只保证
        “实际伤害 ≥ 环境伤害下限”（考虑 endure/忍者 等减免前提）。"""
        round_state = self._current_round()
        env_code = round_state.get("environmentCardCode")
        round_kind = round_state.get("roundKind")
        before = self._hp_before_damage
        after = self._hp_map()
        actual_damage = {
            oid: max(0, before.get(oid, 0) - after.get(oid, 0)) for oid in after
        }

        # 基础一致性检查：roundKind 分类与 environmentCardCode 对应
        expected_kind = "gas" if env_code in GAS_CARDS else "safe"
        kind_ok = round_kind == expected_kind

        # 环境伤害下限（不考虑行动牌加伤或 endure 减免）
        # 仅作软性检查：actual_damage 必须 >= 环境本身的伤害（endure 减免除外——这里不做精确验证）
        env_only: Dict[str, int] = {}
        for oid in after:
            eo = self._expected_env_damage(env_code or "", oid)
            if eo is not None:
                env_only[oid] = eo

        result: Dict[str, Any] = {
            "floor": floor,
            "envCode": env_code,
            "roundKind": round_kind,
            "kindOk": kind_ok,
            "envOnlyDamage": env_only,
            "actualDamage": actual_damage,
            "before": before,
            "after": after,
        }
        self.env_log.append(result)

        status = "OK" if kind_ok else "FAIL"
        print(
            f"[env-check floor={floor}] {status} env={env_code} roundKind={round_kind} "
            f"expectedKind={expected_kind}"
        )
        print(f"  envOnlyDamage={env_only}")
        print(f"  actualDamage ={actual_damage}")
        # 软性：实际总伤害 >= 环境伤害（未触发 endure 的普通场景下应该成立）
        for oid, env_dmg in env_only.items():
            act = actual_damage.get(oid, 0)
            if env_dmg > 0 and act < env_dmg:
                print(
                    f"  WARN {oid}: 实际伤害 {act} < 环境最低伤害 {env_dmg}（可能由 endure/忍者 减免）"
                )
        return result

    def _verify_env_pool(self) -> None:
        """游戏结束后，对整局已经揭示的环境牌做池子构成校验（参见规则文档）：
        gas=3, no_gas=4, smelly_gas/stuffy_gas 二选一（仅 1 张）。
        注意：若对局提前结束（未走完 8 层），只能做不超限校验。"""
        print("\n=== 环境牌池校验 ===")
        codes = [
            e["envCode"] for e in self.env_log if e.get("envCode")
        ]
        counts = {c: codes.count(c) for c in set(codes)}
        print(f"已揭示环境牌：{codes}")
        print(f"统计：{counts}")
        # 上界检查（只要不超过池子上限就 OK）
        issues = []
        if counts.get("gas", 0) > 3:
            issues.append(f"gas={counts.get('gas')} 超过 3")
        if counts.get("no_gas", 0) > 4:
            issues.append(f"no_gas={counts.get('no_gas')} 超过 4")
        special = counts.get("smelly_gas", 0) + counts.get("stuffy_gas", 0)
        if special > 1:
            issues.append(
                f"smelly_gas({counts.get('smelly_gas', 0)}) + stuffy_gas({counts.get('stuffy_gas', 0)}) 超过 1"
            )
        if len(self.env_log) == 8:
            # 完整对局：必须严格符合
            if counts.get("gas", 0) != 3:
                issues.append(f"完整对局 gas 应为 3，实际 {counts.get('gas', 0)}")
            if counts.get("no_gas", 0) != 4:
                issues.append(f"完整对局 no_gas 应为 4，实际 {counts.get('no_gas', 0)}")
            if special != 1:
                issues.append(f"完整对局特殊屁应为 1，实际 {special}")
        if issues:
            print("环境牌池校验失败：")
            for msg in issues:
                print(f"  - {msg}")
        else:
            print("环境牌池校验通过 ✓")

    # ---------- 流程 ----------
    def create_room(self):
        print("\n=== 1. 创建房间 ===")
        url = f"{self.base_url}/rooms"
        payload = {
            "ownerOpenId": self.host_player["openId"],
            "ruleSetCode": self.room_config["ruleSetCode"],
            "deckTemplateCode": self.room_config["deckTemplateCode"],
            "requestId": generate_request_id(),
        }
        resp = post_request(url, payload)
        if not resp["success"]:
            raise Exception(f"创建房间失败: {resp['error']}")
        self._update_snapshot(resp["data"])
        self.room_id = self.latest_room.get("roomId")
        print(f"房间创建成功！roomId: {self.room_id}")

    def join_room(self):
        print("\n=== 2. 玩家加入房间 ===")
        for player in self.players[1:]:
            url = f"{self.base_url}/rooms/{self.room_id}/players"
            payload = {
                "openId": player["openId"],
                "nickname": player["nickname"],
                "avatar": player["avatar"],
                "requestId": generate_request_id(),
            }
            resp = post_request(url, payload)
            if resp["success"]:
                self._update_snapshot(resp["data"])
                print(f"{player['nickname']} 加入房间成功")
            else:
                print(f"{player['nickname']} 加入房间失败：{resp['error']}")
            time.sleep(0.2)

    def start_game(self):
        print("\n=== 3. 房主开始游戏 ===")
        url = f"{self.base_url}/rooms/{self.room_id}/start"
        payload = {"requestId": generate_request_id(), "openId": self.host_player["openId"]}
        resp = post_request(url, payload)
        if not resp["success"]:
            raise Exception(f"开始游戏失败: {resp['error']}")
        self._update_snapshot(resp["data"])
        print(f"游戏开始成功！已获取 {len(self._match_players())} 个玩家的角色选项")

    def confirm_role_selection(self):
        print("\n=== 4. 玩家确认角色选择 ===")
        for player in self.players:
            oid = player["openId"]
            state = self._player_state(oid) or {}
            role_options = state.get("roleOptions", []) or []
            if not role_options:
                raise Exception(f"{player['nickname']} ({oid}) 无角色选项")
            role_code = role_options[0]
            url = f"{self.base_url}/rooms/{self.room_id}/role-selection"
            payload = {"openId": oid, "roleCode": role_code, "requestId": generate_request_id()}
            resp = post_request(url, payload)
            if resp["success"]:
                self._update_snapshot(resp["data"])
                print(f"{player['nickname']} 角色确认成功（角色: {role_code}）")
            else:
                print(f"{player['nickname']} 角色确认失败：{resp['error']}")
            time.sleep(0.2)

    def _pick_bet_card(self, open_id: str) -> Optional[Dict[str, Any]]:
        """挑选一张可直接押注（无需 target）的未消耗手牌；若全部需要 target 则回退第一张。"""
        state = self._player_state(open_id) or {}
        hand = state.get("handCards", []) or []
        for card in hand:
            if card.get("consumed"):
                continue
            if card.get("actionCardCode") not in TARGETED_CARDS:
                return card
        for card in hand:
            if not card.get("consumed"):
                return card
        return None

    def submit_bet_action(self):
        print("\n=== 5. 玩家提交押牌（bet阶段） ===")
        alive_players = self._alive_players()
        for player in alive_players:
            oid = player["openId"]
            card = self._pick_bet_card(oid)
            if not card:
                print(f"{player['nickname']} ({oid}) 无可用手牌，跳过押牌")
                continue
            payload: Dict[str, Any] = {
                "openId": oid,
                "cardInstanceId": card["cardInstanceId"],
                "requestId": generate_request_id(),
            }
            # 若必须用需要 target 的牌，挑选其他存活玩家作为目标
            if card.get("actionCardCode") in TARGETED_CARDS:
                others = [p["openId"] for p in alive_players if p["openId"] != oid]
                if others:
                    payload["targetOpenId"] = others[0]
            url = f"{self.base_url}/rooms/{self.room_id}/actions"
            resp = post_request(url, payload)
            if resp["success"]:
                self._update_snapshot(resp["data"])
                print(
                    f"{player['nickname']} 押牌成功（{card.get('actionCardCode')} / "
                    f"{card['cardInstanceId']}）"
                )
            else:
                print(f"{player['nickname']} 押牌失败：{resp['error']}")
            time.sleep(0.2)

    def reveal_environment(self):
        print("\n=== 6. 揭示环境牌 ===")
        url = f"{self.base_url}/rooms/{self.room_id}/environment/reveal"
        payload = {"openId": self.host_player["openId"], "requestId": generate_request_id()}
        resp = post_request(url, payload)
        if resp["success"]:
            self._update_snapshot(resp["data"])
            env = self._current_round().get("environmentCardCode")
            print(f"环境牌揭示成功！environmentCard={env}")
        else:
            print(f"环境牌揭示失败：{resp['error']}")

    def submit_vote(self):
        """读取最新快照，依据 canVote/voteModifier/currentVoteRound 提交投票。"""
        print("\n=== 7. 玩家提交投票 ===")
        round_state = self._current_round()
        round_kind = round_state.get("roundKind")
        vote_round = self._current_vote_round()

        # 仅 isAlive 且 canVote 的玩家可以投票
        eligible_states = [
            s for s in self._match_players() if s.get("isAlive") and s.get("canVote")
        ]
        eligible_ids = [s["openId"] for s in eligible_states]
        if not eligible_ids:
            print("无符合条件的投票者")
            return

        for i, voter_state in enumerate(eligible_states):
            oid = voter_state["openId"]
            others = [pid for pid in eligible_ids if pid != oid]
            target: Optional[str] = others[i % len(others)] if others else None

            # scold 押牌玩家在 gas 回合不能弃票
            bet_code = self._bet_action_code(oid)
            if target is None and bet_code == "scold" and round_kind == "gas":
                target = others[0] if others else None

            payload = {
                "openId": oid,
                "voteRound": vote_round,
                "voteTarget": target,
                "votePowerAtSubmit": self._vote_power(oid),
                "requestId": generate_request_id(),
            }
            url = f"{self.base_url}/rooms/{self.room_id}/votes"
            resp = post_request(url, payload)
            if resp["success"]:
                self._update_snapshot(resp["data"])
                tgt_name = next(
                    (p["nickname"] for p in self.players if p["openId"] == target), target
                )
                print(
                    f"{oid} 投票（round={vote_round} power={payload['votePowerAtSubmit']}）→ {tgt_name}"
                )
            else:
                print(f"{oid} 投票失败：{resp['error']}")
            time.sleep(0.2)

    def advance_stage(self, label: str = "") -> Optional[Dict]:
        print(f"\n=== 推进阶段{f'（{label}）' if label else ''} ===")
        url = f"{self.base_url}/rooms/{self.room_id}/stage/advance"
        payload = {"openId": self.host_player["openId"], "requestId": generate_request_id()}
        resp = post_request(url, payload)
        if resp["success"]:
            self._update_snapshot(resp["data"])
            print(
                f"阶段推进成功！floor={self.latest_room.get('currentFloor')} "
                f"stage={self.latest_room.get('currentStage')} "
                f"voteRound={self._current_vote_round()}"
            )
            return resp["data"]
        print(f"阶段推进失败：{resp['error']}")
        return None

    def _is_game_over(self) -> bool:
        return self.latest_room.get("gameState", "") in ("end", "finished", "closed", "ended")

    def _handle_settlement_result(self, floor: int, tie_depth: int = 0) -> bool:
        if self._is_game_over():
            print(f"游戏结束！获胜者: {self._match().get('winnerResult')}")
            return True

        # tieBreak 循环：tieBreak → vote → settlement
        if self.latest_room.get("currentStage") == "tieBreak":
            if tie_depth >= 2:
                # 规则：重新投票后仍平票则无人出局；保护性上限，防止部署未修复时死循环
                print(f"[tieBreak] 已达最大重投次数 {tie_depth}，中止当前回合")
                return True
            print(f"\n--- floor{floor}: 处理 tieBreak (depth={tie_depth + 1}) ---")
            self.advance_stage(f"floor{floor}: tieBreak→vote")
            self.submit_vote()
            self.advance_stage(f"floor{floor}: tieBreak vote→settlement")
            return self._handle_settlement_result(floor, tie_depth + 1)

        print(f"存活玩家: {[p['nickname'] for p in self._alive_players()]}")
        return False

    def run_one_round(self, floor: int) -> bool:
        print(f"\n{'='*10} 第 {floor} 回合 {'='*10}")
        self.submit_bet_action()
        self.advance_stage(f"floor{floor}: bet→environment")
        self.reveal_environment()
        self.advance_stage(f"floor{floor}: environment→action")
        # 进入伤害结算前，先快照 hp 以便随后校验环境牌伤害
        self._hp_before_damage = self._hp_map()
        self.advance_stage(f"floor{floor}: action→damage（结算）")
        self.advance_stage(f"floor{floor}: damage→talk")
        # 在 damage 阶段结束后校验环境牌伤害
        self._verify_environment_damage(floor)
        self.advance_stage(f"floor{floor}: talk→vote")
        self.submit_vote()
        self.advance_stage(f"floor{floor}: vote→settlement")
        return self._handle_settlement_result(floor)

    def get_room_snapshot(self):
        print("\n=== 8. 获取房间快照 ===")
        url = f"{self.base_url}/rooms/{self.room_id}"
        resp = get_request(url)
        if resp["success"]:
            self._update_snapshot(resp["data"])
            print(
                f"  当前阶段: {self.latest_room.get('currentStage')}\n"
                f"  游戏状态: {self.latest_room.get('gameState')}\n"
                f"  存活玩家: {[p['openId'] for p in self._alive_players()]}"
            )
        elif resp.get("status_code") == 404:
            print("房间已关闭（404），游戏正常结束")
        else:
            print(f"获取房间快照失败：{resp['error']}")

    def run_full_test(self, max_rounds: int = 10):
        try:
            self.create_room()
            self.join_room()
            self.start_game()
            self.confirm_role_selection()
            self.advance_stage("preparation→bet")

            for floor in range(1, max_rounds + 1):
                if self.run_one_round(floor):
                    break
                if not self._alive_players():
                    print("所有玩家已淘汰，测试终止")
                    break
                # settlement → preparation → bet（若仍未结束）
                if self.latest_room.get("currentStage") == "settlement":
                    self.advance_stage(f"floor{floor}: settlement→preparation")
                if self.latest_room.get("currentStage") == "preparation":
                    self.advance_stage(f"floor{floor+1}: preparation→bet")
                if self._is_game_over():
                    break
            else:
                print(f"\n已达到最大回合数 {max_rounds}，测试结束")

            self.get_room_snapshot()
            self._verify_env_pool()
            print("\n=== 多回合测试流程执行完成 ===")
        except Exception as e:
            print(f"\n=== 测试流程异常终止：{e} ===")
            self._verify_env_pool()


if __name__ == "__main__":
    DeskGameTest(BASE_URL, PLAYERS, ROOM_CONFIG).run_full_test()
