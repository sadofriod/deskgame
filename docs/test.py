import requests
import socketio
import time
import json
from typing import Dict, List, Optional

# ===================== 配置项 =====================
BASE_HTTP_URL = "https://deskgame.ashesborn.cloud"  # 后端HTTP地址
BASE_WS_URL = "ws://deskgame.ashesborn.cloud/"  # 后端WebSocket地址
PLAYER_LIST = ["owner-001", "player-001", "player-002", "player-003", "player-004"]  # 测试玩家列表
RULE_SET_CODE = "classic_v1"
DECK_TEMPLATE_CODE = "classic_pool_v1"


# ===================== HTTP 接口封装 =====================
def create_room(owner_open_id: str) -> Dict:
    """创建房间（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms"
    payload = {
        "ownerOpenId": owner_open_id,
        "ruleSetCode": RULE_SET_CODE,
        "deckTemplateCode": DECK_TEMPLATE_CODE,
        "requestId": f"req-create-{owner_open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def join_room(room_id: str, open_id: str, nickname: str) -> Dict:
    """加入房间（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/players"
    payload = {
        "openId": open_id,
        "nickname": nickname,
        "avatar": "",
        "requestId": f"req-join-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def start_game(room_id: str, owner_open_id: str, seed: str = "test-seed") -> Dict:
    """开始游戏（HTTP）- 房主调用，触发发牌和身份分配"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/start"
    payload = {
        "openId": owner_open_id,
        "seed": seed,
        "requestId": f"req-start-{owner_open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def confirm_role_selection(room_id: str, open_id: str, role_code: str) -> Dict:
    """确认身份选择（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/role-selection"
    payload = {
        "openId": open_id,
        "roleCode": role_code,
        "requestId": f"req-role-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def submit_action(room_id: str, open_id: str, card_instance_id: str) -> Dict:
    """提交行动卡（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/actions"
    payload = {
        "openId": open_id,
        "cardInstanceId": card_instance_id,
        "requestId": f"req-action-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def reveal_environment(room_id: str, owner_open_id: str) -> Dict:
    """揭示环境牌（HTTP）- 房主调用"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/environment/reveal"
    payload = {
        "openId": owner_open_id,
        "requestId": f"req-env-{owner_open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def advance_stage(room_id: str, open_id: str) -> Dict:
    """推进阶段（HTTP）- 房主调用"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/stage/advance"
    payload = {
        "openId": open_id,
        "requestId": f"req-advance-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def get_room_snapshot(room_id: str) -> Dict:
    """查询房间快照（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


# ===================== WebSocket 客户端封装 =====================
class DeskGameWSClient:
    def __init__(self, open_id: str):
        self.open_id = open_id
        self.sio = socketio.Client()
        self.event_log = []
        self.error_log = []

        @self.sio.on("event")
        def handle_event(message):
            print(f"\n[WS-{self.open_id}] 收到事件: {message['name']}")
            print(f"Payload: {json.dumps(message['payload'], indent=2)}")
            self.event_log.append(message)

        @self.sio.on("error")
        def handle_error(message):
            print(f"\n[WS-{self.open_id}] 收到错误:")
            print(f"Payload: {json.dumps(message['payload'], indent=2)}")
            self.error_log.append(message)

    def connect(self):
        self.sio.connect(BASE_WS_URL)
        print(f"\n[WS-{self.open_id}] 已连接到 {BASE_WS_URL}")
        time.sleep(0.5)

    def disconnect(self):
        self.sio.disconnect()
        print(f"\n[WS-{self.open_id}] 已断开连接")

    def wait_for_event(self, event_name: str, timeout: int = 10) -> Optional[Dict]:
        start_time = time.time()
        while time.time() - start_time < timeout:
            for event in self.event_log:
                if event["name"] == event_name:
                    return event
            time.sleep(0.5)
        print(f"\n[WS-{self.open_id}] 超时未收到事件: {event_name}")
        return None


# ===================== 完整流程测试 =====================
def test_full_game_flow():
    room_id = None
    ws_clients = {}

    try:
        # --------------------------
        # 1. 创建房间（房主）
        # --------------------------
        print("===== 步骤1：创建房间 =====")
        create_resp = create_room(PLAYER_LIST[0])
        room_id = create_resp["room"]["roomId"]
        print(f"房间创建成功，roomId: {room_id}")
        print(f"响应数据: {json.dumps(create_resp, indent=2)}")

        # --------------------------
        # 2. 其他玩家加入房间
        # --------------------------
        print("\n===== 步骤2：玩家加入房间 =====")
        for player in PLAYER_LIST[1:]:
            join_resp = join_room(room_id, player, player)
            print(f"玩家 {player} 加入成功")
            time.sleep(0.2)

        # --------------------------
        # 3. 连接WebSocket
        # --------------------------
        print("\n===== 步骤3：WebSocket连接 =====")
        for player in PLAYER_LIST:
            ws_client = DeskGameWSClient(player)
            ws_client.connect()
            ws_clients[player] = ws_client

        # --------------------------
        # 4. 房主开始游戏（发牌+分配身份）
        # --------------------------
        print("\n===== 步骤4：开始游戏 =====")
        start_resp = start_game(room_id, PLAYER_LIST[0])
        print(f"游戏开始: {json.dumps(start_resp, indent=2)}")

        # 等待 CardsDealt 和 RoleSelectionStarted 事件
        role_start_event = ws_clients[PLAYER_LIST[0]].wait_for_event("RoleSelectionStarted")
        if not role_start_event:
            raise Exception("未收到RoleSelectionStarted事件")

        # --------------------------
        # 5. 所有玩家确认身份选择
        # --------------------------
        print("\n===== 步骤5：确认身份选择 =====")
        snapshot = get_room_snapshot(room_id)
        match_players = snapshot["room"]["match"]["players"]
        for player_state in match_players:
            open_id = player_state["openId"]
            role_options = player_state["roleOptions"]
            role_code = role_options[0] if role_options else "broker"
            confirm_resp = confirm_role_selection(room_id, open_id, role_code)
            print(f"玩家 {open_id} 确认身份 {role_code}")
            time.sleep(0.2)

        # 等待身份选择完成事件
        role_complete_event = ws_clients[PLAYER_LIST[0]].wait_for_event("RoleSelectionCompleted")
        if not role_complete_event:
            raise Exception("未收到RoleSelectionCompleted事件")

        # --------------------------
        # 6. 所有玩家提交行动卡（bet阶段）
        # --------------------------
        print("\n===== 步骤6：提交行动卡 =====")
        snapshot = get_room_snapshot(room_id)
        match_players = snapshot["room"]["match"]["players"]
        for player_state in match_players:
            open_id = player_state["openId"]
            hand_cards = [c for c in player_state.get("handCards", []) if not c["consumed"]]
            if hand_cards:
                action_resp = submit_action(room_id, open_id, hand_cards[0]["cardInstanceId"])
                print(f"玩家 {open_id} 提交行动卡")
            time.sleep(0.2)

        # --------------------------
        # 7. 推进阶段（bet → environment → action → damage → talk → vote → settlement）
        # --------------------------
        print("\n===== 步骤7：推进游戏阶段 =====")
        owner = PLAYER_LIST[0]

        # bet → environment
        advance_stage(room_id, owner)
        print("推进到 environment 阶段")

        # 揭示环境牌
        reveal_environment(room_id, owner)
        ws_clients[owner].wait_for_event("EnvironmentRevealed")
        print("环境牌已揭示")

        # environment → action
        advance_stage(room_id, owner)
        print("推进到 action 阶段")

        # action → damage
        advance_stage(room_id, owner)
        ws_clients[owner].wait_for_event("RoundSettled")
        print("推进到 damage 阶段，伤害结算完成")

        # damage → talk
        advance_stage(room_id, owner)
        print("推进到 talk 阶段")

        # talk → vote
        advance_stage(room_id, owner)
        print("推进到 vote 阶段")

        # --------------------------
        # 8. 查询房间最终快照
        # --------------------------
        print("\n===== 步骤8：查询房间快照 =====")
        snapshot = get_room_snapshot(room_id)
        print(f"当前阶段: {snapshot['room']['currentStage']}")

        print("\n===== 测试完成：所有流程执行成功 =====")

    except Exception as e:
        print(f"\n===== 测试失败：{str(e)} =====")
        raise
    finally:
        print("\n===== 清理资源 =====")
        for ws_client in ws_clients.values():
            ws_client.disconnect()


# ===================== 执行测试 =====================
if __name__ == "__main__":
    print("开始执行DeskGame Backend测试流程...")
    test_full_game_flow()
