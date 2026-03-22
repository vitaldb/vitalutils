# vitaldb-streaming-server

VitalDB open dataset의 `.vital` 파일을 실시간으로 웹소켓 스트리밍하는 Node.js 서버입니다.

[VitalRecorder](https://vitaldb.net/vitalrecorder)의 웹소켓 프로토콜(Socket.IO v2 / Engine.IO v3)을 그대로 구현하여, VitalRecorder 클라이언트 또는 호환 뷰어에서 바로 연결할 수 있습니다.

## 설치

### npx로 바로 실행 (설치 없이)

```bash
npx vitaldb-streaming-server
```

### 글로벌 설치

```bash
npm install -g vitaldb-streaming-server
```

### 프로젝트 의존성으로 설치

```bash
npm install vitaldb-streaming-server
```

## 사용법

### 기본 실행

```bash
# VitalDB에서 10개 파일을 다운로드하여 스트리밍 (기본 포트: 8153)
vitaldb-streaming-server

# 포트 변경
vitaldb-streaming-server -p 3000

# 다운로드 파일 수 지정 (1~10)
vitaldb-streaming-server -c 3
```

### 로컬 .vital 파일 스트리밍

```bash
# 특정 파일 지정
vitaldb-streaming-server ./my-recording.vital

# 여러 파일 지정
vitaldb-streaming-server case1.vital case2.vital case3.vital

# 와일드카드 사용
vitaldb-streaming-server ./data/*.vital
```

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-p, --port <port>` | 서버 포트 번호 | `8153` |
| `-c, --count <n>` | VitalDB에서 다운로드할 파일 수 (1~10) | `10` |
| `-h, --help` | 도움말 출력 | |
| `-v, --version` | 버전 출력 | |

### npm scripts로 실행

```bash
# 프로젝트 디렉토리에서
npm start
```

## 클라이언트 연결

서버가 시작되면 Socket.IO v2 클라이언트로 연결할 수 있습니다.

### JavaScript 클라이언트 예제

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.5.0/socket.io.js"></script>
<script>
const socket = io('http://localhost:8153');

// room 입장 (case-1 ~ case-10)
socket.emit('join_vr', 'case-1');

// 데이터 수신 (1초 간격, zlib 압축된 JSON)
socket.on('send_data', (compressed) => {
  // 브라우저에서 pako 등으로 inflate
  const text = pako.inflate(compressed, { to: 'string' });
  const data = JSON.parse(text);
  console.log(data);
});
</script>
```

### Node.js 클라이언트 예제

```javascript
const io = require('socket.io-client');
const zlib = require('zlib');

const socket = io('http://localhost:8153');

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join_vr', 'case-1');
});

socket.on('send_data', (compressed) => {
  const json = zlib.inflateSync(compressed).toString();
  const data = JSON.parse(json);

  for (const room of data.rooms) {
    console.log(`[${room.roomname}] ${room.trks.length} tracks`);
    for (const trk of room.trks) {
      if (trk.type === 'wav') {
        console.log(`  ${trk.name}: ${trk.recs.length} rec(s), srate=${trk.srate}`);
      } else if (trk.type === 'num') {
        const val = trk.recs[0]?.val;
        console.log(`  ${trk.name}: ${val} ${trk.unit}`);
      }
    }
  }
});
```

### Python 클라이언트 예제

```python
import socketio
import zlib
import json

sio = socketio.Client()

@sio.on('connect')
def on_connect():
    print('Connected')
    sio.emit('join_vr', 'case-1')

@sio.on('send_data')
def on_send_data(compressed):
    text = zlib.decompress(compressed).decode('utf-8')
    data = json.loads(text)
    for room in data['rooms']:
        for trk in room['trks']:
            if trk['type'] == 'num' and trk['recs']:
                print(f"  {trk['name']}: {trk['recs'][0]['val']} {trk['unit']}")

sio.connect('http://localhost:8153')
sio.wait()
```

## 프로토콜

### 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `join_vr` | Client -> Server | room 입장. vrcode 전달 (예: `case-1`) |
| `send_data` | Server -> Client | 1초 간격 데이터 전송. zlib deflate 압축된 JSON (Binary) |

### Room 코드

서버 시작 시 각 파일에 `case-1` ~ `case-N` 형태의 room 코드가 부여됩니다. 존재하지 않는 room 코드로 `join_vr`을 호출하면 모든 room에 자동으로 입장합니다.

### JSON 페이로드 구조

`send_data`로 전송되는 데이터는 zlib deflate (level 1) 압축된 JSON입니다.

```jsonc
{
  "ver": "1.0.0",
  "vrcode": "vitaldb-replay",
  "os": "nodejs",
  "rooms": [
    {
      "roomname": "Case 1",         // 파일명 기반 room 이름
      "seqid": 42,                   // 전송 시퀀스 번호
      "dtstart": 1711100000.0,       // 이 패킷의 시작 시각 (unix timestamp)
      "dtend": 1711100001.0,         // 이 패킷의 종료 시각
      "dtcase": 1711099000.0,        // 케이스 시작 시각
      "dgmt": 540,                   // UTC 오프셋 (분, KST=540)
      "devs": [                      // 장비 목록
        { "type": "Philips/IntelliVue", "name": "Monitor", "status": "connected" }
      ],
      "trks": [                      // 트랙 데이터
        {
          "id": 1,
          "name": "SNUADC/ECG_II",
          "type": "wav",             // wav | num | str
          "srate": 100,              // 샘플레이트 (wav 전용)
          "unit": "mV",
          "mindisp": -1.5,
          "maxdisp": 1.5,
          "recs": [
            { "dt": 1711100000.0, "val": [0.1, 0.2, 0.3] }
          ]
        },
        {
          "id": 2,
          "name": "Solar8000/HR",
          "type": "num",
          "unit": "bpm",
          "montype": "ECG_HR",
          "recs": [
            { "dt": 1711100000.5, "val": 72.0 }
          ]
        }
      ],
      "evts": [],
      "filts": []
    }
  ]
}
```

### 트랙 타입

| 타입 | 설명 | `val` 형식 |
|------|------|-----------|
| `wav` | 파형 데이터 (ECG, ABP 등) | `number[]` (샘플 배열) |
| `num` | 수치 데이터 (HR, SpO2 등) | `number` |
| `str` | 문자열 데이터 | `string` |

### WAV 리샘플링

서버는 전송 시 WAV 트랙을 자동으로 다운샘플링합니다:

- CO2, AWP 파형: 최대 25 Hz
- 기타 파형: 최대 100 Hz

## 동작 방식

1. 서버 시작 시 `.vital` 파일을 다운로드(또는 로컬에서 로드)하여 메모리에 파싱
2. Socket.IO v2 (Engine.IO v3) 서버 구동
3. 클라이언트가 `join_vr`로 room에 입장
4. 1초 주기로 해당 room의 1초 구간 데이터를 JSON 직렬화 -> zlib 압축 -> `send_data` 이벤트로 전송
5. 파일 끝에 도달하면 처음부터 자동 반복 (무한 루프)
6. 타임스탬프는 현재 서버 시각 기준으로 재매핑되어 실시간 데이터처럼 동작

## 요구사항

- Node.js >= 10.0.0

## 라이선스

MIT
