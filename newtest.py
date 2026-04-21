import requests
import uuid
import time
from typing import Dict, List, Optional

# ===================== 基础配置 =====================
BASE_URL = "https://deskgame.ashesborn.cloud"  # 后端服务基础地址
# 模拟6个玩家的信息（openId 需唯一，nickname/avatar 为测试用）
PLAYERS = [
    {"openId": "player_001", "nickname": "玩家1（房主）", "avatar": "avatar_1"},
    {"openId": "player_002", "nickname": "玩家2", "avatar": "avatar_2"},
    {"openId": "player_003", "nickname": "玩家3", "avatar": "avatar_3"},
    {"openId": "player_004", "nickname": "玩家4", "avatar": "avatar_4"},
    {"openId": "player_005", "nickname": "玩家5", "avatar": "avatar_5"},
    {"openId": "player_006", "nickname": "玩家6", "avatar": "avatar_6"},
]
# 房间配置（需使用后端支持的规则集和牌组模板编码）
ROOM_CONFIG = {
    "ruleSetCode": "classic_v1",         # 规则集编码
    "deckTemplateCode": "classic_pool_v1"  # 牌组模板编码
}


# ===================== 工具函数 =====================
def generate_request_id() -> str:
    """生成唯一requestId"""
    print(f"req_{uuid.uuid4().hex[:8]}")
    return f"req_{uuid.uuid4().hex[:8]}"


def post_request(url: str, payload: Dict) -> Dict:
    """封装POST请求"""
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()  # 抛出HTTP异常
        return {"success": True, "data": resp.json(), "status_code": resp.status_code}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e), "status_code": getattr(e.response, "status_code", None)}


def get_request(url: str) -> Dict:
    """封装GET请求"""
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return {"success": True, "data": resp.json(), "status_code": resp.status_code}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e), "status_code": getattr(e.response, "status_code", None)}


# ===================== 核心游戏流程 =====================
class DeskGameTest:
    def __init__(self, base_url: str, players: List[Dict], room_config: Dict):
        self.base_url = base_url
        self.players = players
        self.room_config = room_config
        self.room_id = None  # 创建房间后赋值
        self.host_player = players[0]  # 第一个玩家作为房主
        self.player_role_options: Dict[str, List[str]] = {}  # openId → roleOptions（startGame后赋值）
        self.player_hand_cards: Dict[str, List[Dict]] = {}   # openId → handCards（startGame后赋值）
        self.alive_players: List[Dict] = list(players)       # 存活玩家列表，随回合更新

    def create_room(self):
        """创建房间（房主操作）"""
        print("\n=== 1. 创建房间 ===")
        url = f"{self.base_url}/rooms"
        payload = {
            "ownerOpenId": self.host_player["openId"],
            "ruleSetCode": self.room_config["ruleSetCode"],
            "deckTemplateCode": self.room_config["deckTemplateCode"],
            "requestId": generate_request_id()
        }
        resp = post_request(url, payload)
        if resp["success"]:
            self.room_id = resp["data"]["room"]["roomId"]  # 从room快照中取roomId
            print(f"房间创建成功！roomId: {self.room_id}")
            print(f"响应数据: {resp['data']}")
        else:
            print(f"房间创建失败！错误: {resp['error']}")
            raise Exception("创建房间失败，终止测试")

    def join_room(self):
        """其他玩家加入房间"""
        print("\n=== 2. 玩家加入房间 ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法加入")

        # 跳过房主（已创建房间），其他4个玩家加入
        for player in self.players[1:]:
            url = f"{self.base_url}/rooms/{self.room_id}/players"
            payload = {
                "openId": player["openId"],
                "nickname": player["nickname"],
                "avatar": player["avatar"],
                "requestId": generate_request_id()
            }
            resp = post_request(url, payload)
            if resp["success"]:
                print(f"{player['nickname']} 加入房间成功")
            else:
                print(f"{player['nickname']} 加入房间失败！错误: {resp['error']}")
            time.sleep(0.5)  # 避免请求过快

    def start_game(self):
        """房主开始游戏"""
        print("\n=== 3. 房主开始游戏 ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法开始游戏")

        url = f"{self.base_url}/rooms/{self.room_id}/start"
        payload = {
            "requestId": generate_request_id(),
            "openId": self.host_player["openId"]
        }
        resp = post_request(url, payload)
        if resp["success"]:
            print("游戏开始成功！")
            # 从快照中提取每个玩家的角色选项和手牌
            match_players = resp["data"]["room"].get("match", {}).get("players", [])
            for mp in match_players:
                oid = mp["openId"]
                self.player_role_options[oid] = mp.get("roleOptions", [])
                self.player_hand_cards[oid] = [c for c in mp.get("handCards", []) if not c.get("consumed", False)]
            print(f"已获取 {len(self.player_role_options)} 个玩家的角色选项")
        else:
            print(f"游戏开始失败！错误: {resp['error']}")
            raise Exception("开始游戏失败，终止测试")

    def confirm_role_selection(self):
        """所有玩家确认角色选择"""
        print("\n=== 4. 玩家确认角色选择 ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法确认角色")

        for player in self.players:
            oid = player["openId"]
            # 使用该玩家的第一个角色选项（从startGame响应中获取）
            role_options = self.player_role_options.get(oid, [])
            if not role_options:
                raise Exception(f"{player['nickname']} ({oid}) 无角色选项，startGame响应中未找到该玩家，终止测试")
            role_code = role_options[0]

            url = f"{self.base_url}/rooms/{self.room_id}/role-selection"
            payload = {
                "openId": oid,
                "roleCode": role_code,
                "requestId": generate_request_id()
            }
            resp = post_request(url, payload)
            if resp["success"]:
                print(f"{player['nickname']} 角色确认成功（角色: {role_code}）")
            else:
                print(f"{player['nickname']} 角色确认失败！错误: {resp['error']}")
            time.sleep(0.5)

    def submit_bet_action(self):
        """所有玩家在bet阶段提交押牌"""
        print("\n=== 5. 玩家提交押牌（bet阶段） ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法提交押牌")

        # 每个玩家提交押牌（使用实际手牌的cardInstanceId，格式为 {openId}-card-0）
        for player in self.alive_players:
            oid = player["openId"]
            hand_cards = self.player_hand_cards.get(oid, [])
            if not hand_cards:
                print(f"{player['nickname']} ({oid}) 无可用手牌，跳过押牌")
                continue
            card_instance_id = hand_cards[0]["cardInstanceId"]

            url = f"{self.base_url}/rooms/{self.room_id}/actions"
            payload = {
                "openId": oid,
                "cardInstanceId": card_instance_id,
                "requestId": generate_request_id()
            }
            resp = post_request(url, payload)
            if resp["success"]:
                print(f"{player['nickname']} 押牌提交成功（cardInstanceId: {card_instance_id}）")
            else:
                print(f"{player['nickname']} 押牌提交失败（可能角色不支持押牌）：{resp['error']}")
            time.sleep(0.5)

    def reveal_environment(self):
        """房主揭示环境牌"""
        print("\n=== 6. 揭示环境牌 ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法揭示环境牌")

        url = f"{self.base_url}/rooms/{self.room_id}/environment/reveal"
        payload = {
            "openId": self.host_player["openId"],
            "requestId": generate_request_id()
        }
        resp = post_request(url, payload)
        if resp["success"]:
            print("环境牌揭示成功！")
        else:
            print(f"环境牌揭示失败！错误: {resp['error']}")

    def submit_vote(self):
        """所有玩家在vote阶段提交投票"""
        print("\n=== 7. 玩家提交投票（vote阶段） ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法提交投票")

        # 模拟投票：每个玩家随机投给另一个玩家（测试用）
        for i, voter in enumerate(self.alive_players):
            # 投票目标：避开自己，选下一个玩家
            target_idx = (i + 1) % len(self.alive_players)
            target_player = self.alive_players[target_idx]

            url = f"{self.base_url}/rooms/{self.room_id}/votes"
            payload = {
                "openId": voter["openId"],
                "voteRound": 1,  # 投票轮次
                "voteTarget": target_player["openId"],  # 投票目标
                "votePowerAtSubmit": 1,  # 投票权重（测试用）
                "requestId": generate_request_id()
            }
            resp = post_request(url, payload)
            if resp["success"]:
                print(f"{voter['nickname']} 投票给 {target_player['nickname']} 成功")
            else:
                print(f"{voter['nickname']} 投票失败！错误: {resp['error']}")
            time.sleep(0.5)

    def advance_stage(self, label: str = "") -> Optional[Dict]:
        """推进到下一个阶段（房主操作），返回响应数据"""
        print(f"\n=== 推进阶段{f'（{label}）' if label else ''} ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法推进阶段")

        url = f"{self.base_url}/rooms/{self.room_id}/stage/advance"
        payload = {
            "openId": self.host_player["openId"],
            "requestId": generate_request_id()
        }
        resp = post_request(url, payload)
        if resp["success"]:
            current_stage = resp["data"]["room"].get("currentStage", "未知")
            print(f"阶段推进成功！当前阶段: {current_stage}")
            return resp["data"]
        else:
            print(f"阶段推进失败！错误: {resp['error']}")
            return None

    def _sync_players_from_snapshot(self, room_data: Dict):
        """从房间快照同步存活玩家的手牌信息"""
        match_players = room_data.get("room", {}).get("match", {}).get("players", [])
        alive_openids = set()
        for mp in match_players:
            oid = mp["openId"]
            status = mp.get("status", "")
            if status not in ("eliminated", "dead"):
                alive_openids.add(oid)
                remaining = [c for c in mp.get("handCards", []) if not c.get("consumed", False)]
                if remaining:
                    self.player_hand_cards[oid] = remaining
        # 更新存活玩家列表
        self.alive_players = [p for p in self.players if p["openId"] in alive_openids]
        print(f"存活玩家: {[p['nickname'] for p in self.alive_players]}")

    def _is_game_over(self, room_data: Optional[Dict]) -> bool:
        """判断游戏是否已结束"""
        if not room_data:
            return True  # 推进失败视为游戏结束
        room = room_data.get("room", {})
        game_state = room.get("gameState", "")
        current_stage = room.get("currentStage", "")
        return game_state in ("finished", "closed", "ended") or current_stage in ("end", "finished", "closed")

    def _handle_settlement_result(self, settlement_data: Dict, floor: int) -> bool:
        """
        处理 settlement 推进后的结果，含 tieBreak 循环。
        返回 True 表示游戏结束，False 表示继续。
        """
        if not settlement_data:
            print("settlement 推进失败，无法判断游戏状态")
            return True

        room_snapshot = settlement_data.get("room", {})
        game_state = room_snapshot.get("gameState", "")
        current_stage = room_snapshot.get("currentStage", "")
        print(f"结算后 gameState={game_state}，currentStage={current_stage}")

        if self._is_game_over(settlement_data):
            winner = room_snapshot.get("match", {}).get("winner")
            print(f"游戏结束！获胜者: {winner}")
            return True

        # tieBreak 处理：tieBreak → vote → settlement 循环
        if current_stage == "tieBreak":
            print(f"\n--- floor{floor}: 处理 tieBreak ---")
            self.advance_stage(f"floor{floor}: tieBreak→vote")
            self.submit_vote()
            tie_settlement_data = self.advance_stage(f"floor{floor}: tieBreak vote→settlement")
            return self._handle_settlement_result(tie_settlement_data, floor)

        # 游戏继续到下一回合：同步存活玩家及手牌
        self._sync_players_from_snapshot(settlement_data)
        return False

    def run_one_round(self, floor: int) -> bool:
        """
        执行一个完整回合（从 bet 到 settlement）。
        第一回合（floor=1）在外部已处理了 role selection；之后的回合直接从 bet 开始。
        返回 True 表示游戏已结束，False 表示继续下一回合。
        """
        print(f"\n{'='*10} 第 {floor} 回合 {'='*10}")

        # bet 阶段：提交押牌
        self.submit_bet_action()
        # bet → environment
        self.advance_stage(f"floor{floor}: bet→environment")
        # 揭示环境牌
        self.reveal_environment()
        # environment → action
        self.advance_stage(f"floor{floor}: environment→action")
        # action → damage（触发伤害结算）
        self.advance_stage(f"floor{floor}: action→damage（结算）")
        # damage → talk
        self.advance_stage(f"floor{floor}: damage→talk")
        # talk → vote
        self.advance_stage(f"floor{floor}: talk→vote")
        # 提交投票
        self.submit_vote()
        # vote → settlement
        settlement_data = self.advance_stage(f"floor{floor}: vote→settlement")
        return self._handle_settlement_result(settlement_data, floor)

    def get_room_snapshot(self):
        """获取房间快照，查看当前状态"""
        print("\n=== 8. 获取房间快照 ===")
        if not self.room_id:
            raise Exception("房间ID为空，无法获取快照")

        url = f"{self.base_url}/rooms/{self.room_id}"
        resp = get_request(url)
        if resp["success"]:
            print("房间快照获取成功：")
            # GET /rooms/:roomId 返回 { "room": {...} }，需取 room 子对象
            snapshot = resp["data"]["room"]
            print(f"  当前阶段: {snapshot.get('currentStage')}")
            print(f"  游戏状态: {snapshot.get('gameState')}")
            print(f"  玩家列表: {[p['openId'] for p in snapshot.get('roomPlayers', [])]}")
        elif resp.get("status_code") == 404:
            print("房间已关闭（404），游戏正常结束")
        else:
            print(f"获取房间快照失败！错误: {resp['error']}")

    def advance_to_bet(self, floor: int):
        """从当前阶段（可能是 settlement 或 preparation）推进到 bet 阶段"""
        # 最多推进两次：settlement→preparation→bet 或 preparation→bet
        for attempt in range(1, 3):
            data = self.advance_stage(f"floor{floor}: →bet (attempt {attempt})")
            if not data:
                return
            if data.get("room", {}).get("currentStage") == "bet":
                return

    def run_full_test(self, max_rounds: int = 10):
        """运行多回合六人玩家测试流程，最多执行 max_rounds 回合"""
        try:
            # 1. 创建房间
            self.create_room()
            # 2. 其他玩家加入
            self.join_room()
            # 3. 开始游戏（同时获取每个玩家的角色选项和手牌）
            self.start_game()
            # 4. 所有玩家确认角色选择（preparation 阶段，仅第一回合需要）
            self.confirm_role_selection()
            # 5. 推进到 bet 阶段（preparation → bet）
            self.advance_stage("preparation→bet")

            # 多回合循环：每次执行完整的 bet→settlement 流程
            for floor in range(1, max_rounds + 1):
                game_ended = self.run_one_round(floor)
                if game_ended:
                    break
                if not self.alive_players:
                    print("所有玩家已淘汰，测试终止")
                    break
                # 下一回合：从当前阶段推进到 bet（可能需经过 settlement→preparation→bet）
                self.advance_to_bet(floor + 1)
            else:
                print(f"\n已达到最大回合数 {max_rounds}，测试结束")

            # 获取房间最终快照
            self.get_room_snapshot()

            print("\n=== 多回合测试流程执行完成 ===")
        except Exception as e:
            print(f"\n=== 测试流程异常终止：{e} ===")


# ===================== 执行测试 =====================
if __name__ == "__main__":
    # 初始化测试类
    game_test = DeskGameTest(BASE_URL, PLAYERS, ROOM_CONFIG)
    # 运行完整测试
    game_test.run_full_test()