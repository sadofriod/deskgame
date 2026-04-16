import requests
import socketio
import time
import json
from typing import Dict, List, Optional

# ===================== 配置项 =====================
BASE_HTTP_URL = "https://deskgame.ashesborn.cloud/"  # 后端HTTP地址
BASE_WS_URL = "ws://deskgame.ashesborn.cloud/"  # 后端WebSocket地址
PLAYER_LIST = ["owner-001", "player-001", "player-002", "player-003", "player-004"]  # 测试玩家列表
ROOM_PLAYER_COUNT = 5  # 房间人数
ROLE_CONFIG = "independent"  # 角色配置（independent/faction）


# ===================== HTTP 接口封装 =====================
def create_room(owner_open_id: str) -> Dict:
    """创建房间（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms"
    payload = {
        "ownerOpenId": owner_open_id,
        "roomConfig": {
            "playerCount": ROOM_PLAYER_COUNT,
            "roleConfig": ROLE_CONFIG
        },
        "requestId": f"req-create-{owner_open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()  # 抛出HTTP错误
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


def set_ready(room_id: str, open_id: str, ready: bool = True) -> Dict:
    """设置准备状态（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/ready"
    payload = {
        "openId": open_id,
        "ready": ready,
        "requestId": f"req-ready-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def confirm_role_selection(room_id: str, open_id: str, role_id: str) -> Dict:
    """确认身份选择（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/role-selection"
    payload = {
        "openId": open_id,
        "roleId": role_id,
        "requestId": f"req-role-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def submit_bet(room_id: str, open_id: str, action_card: str = "listen") -> Dict:
    """提交押牌（HTTP）"""
    url = f"{BASE_HTTP_URL}/rooms/{room_id}/bets"
    payload = {
        "openId": open_id,
        "actionCard": action_card,
        "requestId": f"req-bet-{open_id}-{int(time.time())}"
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()


def advance_stage(room_id: str, open_id: str) -> Dict:
    """推进阶段（HTTP）"""
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
        self.sio = socketio.Client()  # 初始化Socket.IO客户端
        self.event_log = []  # 存储收到的事件
        self.error_log = []  # 存储收到的错误

        # 注册事件处理器
        @self.sio.on("event")
        def handle_event(message):
            """处理服务端广播的event事件"""
            print(f"\n[WS-{self.open_id}] 收到事件: {message['name']}")
            print(f"Payload: {json.dumps(message['payload'], indent=2)}")
            self.event_log.append(message)

        @self.sio.on("error")
        def handle_error(message):
            """处理服务端广播的error事件"""
            print(f"\n[WS-{self.open_id}] 收到错误:")
            print(f"Payload: {json.dumps(message['payload'], indent=2)}")
            self.error_log.append(message)

    def connect(self):
        """连接到WebSocket服务器"""
        self.sio.connect(BASE_WS_URL)
        print(f"\n[WS-{self.open_id}] 已连接到 {BASE_WS_URL}")
        time.sleep(0.5)  # 等待连接稳定

    def disconnect(self):
        """断开WebSocket连接"""
        self.sio.disconnect()
        print(f"\n[WS-{self.open_id}] 已断开连接")

    def wait_for_event(self, event_name: str, timeout: int = 10) -> Optional[Dict]:
        """等待指定事件，超时返回None"""
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
    ws_clients = {}  # 存储所有玩家的WS客户端

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
            print(f"玩家 {player} 加入成功: {json.dumps(join_resp, indent=2)}")
            time.sleep(0.2)  # 避免请求过快

        # --------------------------
        # 3. 所有玩家设置准备状态
        # --------------------------
        print("\n===== 步骤3：设置玩家准备状态 =====")
        for player in PLAYER_LIST:
            ready_resp = set_ready(room_id, player, ready=True)
            print(f"玩家 {player} 准备完成: {json.dumps(ready_resp, indent=2)}")
            time.sleep(0.2)

        # --------------------------
        # 4. 连接WebSocket，监听身份选择事件
        # --------------------------
        print("\n===== 步骤4：WebSocket连接 & 等待身份选择 =====")
        for player in PLAYER_LIST:
            ws_client = DeskGameWSClient(player)
            ws_client.connect()
            ws_clients[player] = ws_client

        # 等待房主收到「身份选择开始」事件
        role_start_event = ws_clients[PLAYER_LIST[0]].wait_for_event("RoleSelectionStarted")
        if not role_start_event:
            raise Exception("未收到RoleSelectionStarted事件")

        # 提取每个玩家的候选身份
        candidate_roles = role_start_event["payload"]["candidateRoles"]
        print(f"\n候选身份列表: {json.dumps(candidate_roles, indent=2)}")

        # --------------------------
        # 5. 所有玩家确认身份选择
        # --------------------------
        print("\n===== 步骤5：确认身份选择 =====")
        for candidate in candidate_roles:
            open_id = candidate["openId"]
            role_id = "passenger"  # 选择第一个候选身份
            confirm_resp = confirm_role_selection(room_id, open_id, role_id)
            print(f"玩家 {open_id} 确认身份 {role_id}: {json.dumps(confirm_resp, indent=2)}")
            time.sleep(0.2)

        # 等待身份选择完成事件
        role_complete_event = ws_clients[PLAYER_LIST[0]].wait_for_event("RoleSelectionCompleted")
        if not role_complete_event:
            raise Exception("未收到RoleSelectionCompleted事件")

        # --------------------------
        # 6. 所有玩家提交押牌
        # --------------------------
        print("\n===== 步骤6：提交押牌 =====")
        for player in PLAYER_LIST:
            bet_resp = submit_bet(room_id, player, action_card="listen")
            print(f"玩家 {player} 押牌完成: {json.dumps(bet_resp, indent=2)}")
            time.sleep(0.2)

        # 等待所有押牌提交事件
        bet_count = 0
        start_time = time.time()
        while bet_count < len(PLAYER_LIST) and time.time() - start_time < 10:
            bet_count = sum(1 for e in ws_clients[PLAYER_LIST[0]].event_log if e["name"] == "BetSubmitted")
            time.sleep(0.5)

        # --------------------------
        # 7. 推进阶段（bet → action → settlement → discussionVote）
        # --------------------------
        print("\n===== 步骤7：推进游戏阶段 =====")
        # 推进到action阶段
        advance_resp1 = advance_stage(room_id, PLAYER_LIST[0])
        print(f"推进到action阶段: {json.dumps(advance_resp1, indent=2)}")
        ws_clients[PLAYER_LIST[0]].wait_for_event("EnvironmentRevealed")

        # 推进到settlement阶段
        advance_resp2 = advance_stage(room_id, PLAYER_LIST[0])
        print(f"推进到settlement阶段: {json.dumps(advance_resp2, indent=2)}")
        ws_clients[PLAYER_LIST[0]].wait_for_event("RoundSettled")

        # 推进到discussionVote阶段
        advance_resp3 = advance_stage(room_id, PLAYER_LIST[0])
        print(f"推进到discussionVote阶段: {json.dumps(advance_resp3, indent=2)}")
        stage_event = ws_clients[PLAYER_LIST[0]].wait_for_event("StageAdvanced")
        if stage_event["payload"]["currentStage"] != "discussionVote":
            raise Exception("未成功进入discussionVote阶段")

        # --------------------------
        # 8. 查询房间最终快照
        # --------------------------
        print("\n===== 步骤8：查询房间快照 =====")
        snapshot = get_room_snapshot(room_id)
        print(f"房间快照: {json.dumps(snapshot, indent=2)}")

        print("\n===== 测试完成：所有流程执行成功 =====")

    except Exception as e:
        print(f"\n===== 测试失败：{str(e)} =====")
        raise
    finally:
        # 清理WebSocket连接
        print("\n===== 清理资源 =====")
        for ws_client in ws_clients.values():
            ws_client.disconnect()


# ===================== 执行测试 =====================
if __name__ == "__main__":
    # 确保后端服务已启动（localhost:3000）
    print("开始执行DeskGame Backend测试流程...")
    test_full_game_flow()
