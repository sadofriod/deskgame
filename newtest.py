import requests
import uuid
import time
from typing import Dict, List, Optional

# ===================== 基础配置 =====================
BASE_URL = "http://localhost:3000"  # 后端服务基础地址（临时使用localhost）
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
                print(f"{player['nickname']} 无角色选项，跳过")
                continue
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
        for player in self.players:
            oid = player["openId"]
            hand_cards = self.player_hand_cards.get(oid, [])
            if not hand_cards:
                print(f"{player['nickname']} 无手牌，跳过")
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
                print(f"{player['nickname']} 押牌提交失败！错误: {resp['error']}")
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
        for i, voter in enumerate(self.players):
            # 投票目标：避开自己，选下一个玩家
            target_idx = (i + 1) % len(self.players)
            target_player = self.players[target_idx]

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

    def advance_stage(self, label: str = ""):
        """推进到下一个阶段（房主操作）"""
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
        else:
            print(f"阶段推进失败！错误: {resp['error']}")

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
        else:
            print(f"获取房间快照失败！错误: {resp['error']}")

    def run_full_test(self):
        """运行完整的六人玩家测试流程"""
        try:
            # 1. 创建房间
            self.create_room()
            # 2. 其他玩家加入
            self.join_room()
            # 3. 开始游戏（同时获取每个玩家的角色选项和手牌）
            self.start_game()
            # 4. 所有玩家确认角色选择（preparation 阶段）
            self.confirm_role_selection()
            # 5. 推进到 bet 阶段（preparation → bet）
            self.advance_stage("preparation→bet")
            # 6. 所有玩家提交押牌（bet 阶段）
            self.submit_bet_action()
            # 7. 推进到 environment 阶段（bet → environment）
            self.advance_stage("bet→environment")
            # 8. 揭示环境牌（environment 阶段）
            self.reveal_environment()
            # 9. 推进到 action 阶段（environment → action）
            self.advance_stage("environment→action")
            # 10. 推进到 damage 阶段（action → damage，触发结算）
            self.advance_stage("action→damage（结算）")
            # 11. 推进到 talk 阶段（damage → talk）
            self.advance_stage("damage→talk")
            # 12. 推进到 vote 阶段（talk → vote）
            self.advance_stage("talk→vote")
            # 13. 所有玩家提交投票（vote 阶段）
            self.submit_vote()
            # 14. 推进到 settlement 阶段（vote → settlement，解析投票结果）
            self.advance_stage("vote→settlement")
            # 15. 获取房间最终快照
            self.get_room_snapshot()

            print("\n=== 测试流程执行完成 ===")
        except Exception as e:
            print(f"\n=== 测试流程异常终止：{e} ===")


# ===================== 执行测试 =====================
if __name__ == "__main__":
    # 初始化测试类
    game_test = DeskGameTest(BASE_URL, PLAYERS, ROOM_CONFIG)
    # 运行完整测试
    game_test.run_full_test()