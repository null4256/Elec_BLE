import asyncio
import json
import time
from contextlib import suppress
from urllib.parse import urlparse, parse_qs

from bleak import BleakScanner, BleakClient
from websockets.asyncio.server import serve, broadcast

# ===== 設定 =====
PICOS = {1: "PRC-1", 2: "PRC-2", 3: "PRC-3"}   # 番号: アドバタイズ名
PRIORITY = [1, 2, 3]            # 接続の優先順(先頭ほど優先)
SENT_UUID = "fd9811b9-aa86-4c22-81a9-5da8306915b1"   # モーター書き込み
READ_UUID = "a597c0b6-02de-4cce-b896-db087b21f773"   # 電圧Notify(mV, uint16)
SCAN_SEC = 5.0                  # 1回のスキャン時間
RESEND_SEC = 0.5                # 変化がなくても、この間隔でPicoに再送する
TABLET_TIMEOUT = 1.0            # タブレットからこの秒数届かなければ停止指令にする
STOP_CMD = (0, 0, 6)            # 停止指令 (speed, radian, giar)。giar=6はN(ニュートラル)
WS_HOST, WS_PORT = "0.0.0.0", 8765

# ===== 状態 =====
latest = {pid: None for pid in PICOS}      # タブレットから届いた最新の (speed, radian, giar)
rx_time = {pid: 0.0 for pid in PICOS}      # 最後にタブレットから受信した時刻
state = {pid: {"id": pid, "connected": False, "voltage": None} for pid in PICOS}
ws_clients = {}                            # ws -> 担当のPico番号
token_of = {}                              # ws -> そのタブレットのtoken
last_id = {}                               # token -> 前回割り当てた番号(再接続で同じ番号に戻す)
sessions = {}                              # pid -> 通信中のタスク(参照を保持)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def pack_sent(speed, radian, giar) -> bytes:
    speed = clamp(int(speed), 0, 10)
    radian = clamp(int(radian), -90, 90)
    giar = clamp(int(giar), 0, 6)
    value = speed | ((radian & 0xFF) << 8) | (giar << 16)
    return value.to_bytes(3, "little")


def publish(pid, **changes):
    """状態を更新し、そのPicoを担当するタブレットにだけ送る"""
    state[pid].update(changes)
    targets = [w for w, i in ws_clients.items() if i == pid]
    if targets:
        broadcast(targets, json.dumps(state[pid]))


def make_on_voltage(pid):
    def on_voltage(sender, data: bytearray):
        mv = int.from_bytes(data, "little")        # Picoは mV(符号なし16bit)で送る
        publish(pid, voltage=mv / 1000)
    return on_voltage


# ===== タブレット(WebSocket)側 =====
def assign_id(token, wanted):
    """タブレットに割り当てるPico番号を決める"""
    taken = set(ws_clients.values())            # 今つながっているタブレットが使っている番号
    if wanted in PICOS:                         # ?id= の手動指定を優先
        return wanted
    prev = last_id.get(token)
    if prev in PICOS and prev not in taken:     # 前回と同じ番号が空いていれば戻す
        return prev
    for pid in PRIORITY:                        # 空いている最小番号(1→2→3)
        if pid not in taken:
            return pid
    return None                                 # 満席


async def handler(ws):
    q = parse_qs(urlparse(ws.request.path).query)
    token = q.get("token", [""])[0][:64]
    try:
        wanted = int(q["id"][0])
    except (KeyError, ValueError, IndexError):
        wanted = None

    # 同じタブレットの古い接続が残っていたら閉じる(リロード直後など)
    if token:
        for w in [w for w, t in token_of.items() if t == token]:
            ws_clients.pop(w, None)
            token_of.pop(w, None)
            await w.close()

    my_id = assign_id(token, wanted)
    if my_id is None:
        print("満席: 3台とも割り当て済み")
        await ws.close(code=1013, reason="all picos taken")
        return

    ws_clients[ws] = my_id
    token_of[ws] = token
    if token:
        last_id[token] = my_id
    print(f"tablet connected: Pico{my_id}")

    try:
        await ws.send(json.dumps({"assign": my_id}))    # 割り当てた番号を教える
        await ws.send(json.dumps(state[my_id]))         # 現在の状態を送る
        async for message in ws:
            try:
                d = json.loads(message)
                latest[my_id] = (int(d["speed"]), int(d["radian"]), int(d["giar"]))
                rx_time[my_id] = time.monotonic()
            except (ValueError, KeyError, TypeError):
                print("不正なメッセージ:", message)
    finally:
        ws_clients.pop(ws, None)
        token_of.pop(ws, None)
        if my_id not in ws_clients.values():            # 同じ番号の別タブレットがいなければ停止
            latest[my_id] = None
        print(f"tablet disconnected: Pico{my_id}")


# ===== Pico(BLE)側 =====
async def sender(pid, client):
    """Picoへ書き込む。タブレットから届いていなければ停止指令を送る"""
    last, last_t = None, 0.0
    while client.is_connected:
        now = time.monotonic()
        cmd = latest[pid]
        if cmd is None or now - rx_time[pid] > TABLET_TIMEOUT:
            cmd = STOP_CMD
        if cmd != last or now - last_t > RESEND_SEC:
            await client.write_gatt_char(SENT_UUID, pack_sent(*cmd), response=True)
            last, last_t = cmd, now
        await asyncio.sleep(0.05)


async def session(pid, client):
    """1台分の通信。終わったら切断状態にして後始末する"""
    try:
        await sender(pid, client)
    except Exception as e:
        print(f"[Pico{pid}] {type(e).__name__}: {e}")
    finally:
        print(f"[Pico{pid}] disconnected")
        publish(pid, connected=False, voltage=None)
        with suppress(Exception):
            await client.disconnect()
        sessions.pop(pid, None)


async def scan():
    """1回のスキャンで、見えているPicoを {名前: デバイス} で返す"""
    names = set(PICOS.values())
    found = {}
    results = await BleakScanner.discover(timeout=SCAN_SEC, return_adv=True)
    print("scan:", [adv.local_name for _a, (_d, adv) in results.items() if adv.local_name])
    for _addr, (dev, adv) in results.items():
        if adv.local_name in names:
            found[adv.local_name] = dev
    return found


async def connect_one(pid, dev):
    client = BleakClient(dev, timeout=15.0)
    try:
        await client.connect()
        await client.start_notify(READ_UUID, make_on_voltage(pid))
    except Exception as e:
        print(f"[Pico{pid}] 接続失敗: {type(e).__name__}: {e}")
        with suppress(Exception):
            await client.disconnect()
        return False
    publish(pid, connected=True)
    print(f"[Pico{pid}] connected")
    sessions[pid] = asyncio.create_task(session(pid, client))
    return True


async def connector():
    """未接続のPicoを、PRIORITYの順に1台ずつ接続し続ける"""
    while True:
        missing = [pid for pid in PRIORITY if not state[pid]["connected"]]
        if not missing:
            await asyncio.sleep(1.0)
            continue

        found = await scan()                       # スキャンは1回で全台分
        for pid in PRIORITY:                       # ← ここが優先順位
            if pid in missing and PICOS[pid] in found:
                await connect_one(pid, found[PICOS[pid]])   # 見えない子は飛ばす
        await asyncio.sleep(1.0)


async def main():
    async with serve(handler, WS_HOST, WS_PORT):
        print(f"WebSocket待ち受け: ws://<PiのIP>:{WS_PORT}/  (?id=は省略可)")
        await connector()

asyncio.run(main())