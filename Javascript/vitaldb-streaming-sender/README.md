# vitaldb-streaming-sender

VitalDB open dataset의 `.vital` 파일을 읽어 [VitalServer](https://vitaldb.net)에 실시간으로 스트리밍하는 Node.js 프로그램입니다.

[VitalRecorder](https://vitaldb.net/vitalrecorder)가 10개 탭을 열고 환자 데이터를 전송하는 것과 동일하게 동작합니다. VitalServer에 Socket.IO 클라이언트로 접속하여 1초마다 `send_data` 이벤트로 압축된 JSON 데이터를 전송합니다.

## 설치

### npx로 바로 실행 (설치 없이)

```bash
npx vitaldb-streaming-sender
```

### 글로벌 설치

```bash
npm install -g vitaldb-streaming-sender
```

### 프로젝트 의존성으로 설치

```bash
npm install vitaldb-streaming-sender
```

## 사용법

### 기본 실행

```bash
# VitalDB에서 10개 파일 다운로드 -> vitaldb.net 으로 전송
vitaldb-streaming-sender

# VitalServer 주소 지정
vitaldb-streaming-sender -s http://localhost:8153

# 다운로드 파일 수 지정 (1~10)
vitaldb-streaming-sender -c 3
```

### 로컬 .vital 파일 스트리밍

```bash
# 특정 파일 지정
vitaldb-streaming-sender ./my-recording.vital

# 여러 파일 지정
vitaldb-streaming-sender case1.vital case2.vital case3.vital

# 와일드카드 사용
vitaldb-streaming-sender ./data/*.vital

# 로컬 파일을 특정 서버로 전송
vitaldb-streaming-sender -s http://my-server:8153 ./data/*.vital
```

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-s, --server <url>` | VitalServer URL | `https://vitaldb.net` |
| `-c, --count <n>` | VitalDB에서 다운로드할 파일 수 (1~10) | `10` |
| `-h, --help` | 도움말 출력 | |
| `-v, --version` | 버전 출력 | |

## 동작 방식

```
┌──────────────────────────┐         ┌──────────────┐
│ vitaldb-streaming-sender │ Socket  │              │
│                          │  .IO    │  VitalServer  │
│                          ├────────►│              │
│ .vital 파일 10개 로드     │send_data│              │
│ → 1초마다 데이터 전송     │(deflate)│              │
└──────────────────────────┘         └──────────────┘
```

1. 시작 시 `.vital` 파일을 다운로드(또는 로컬에서 로드)하여 메모리에 파싱
2. VitalServer에 Socket.IO 클라이언트로 접속 (WebSocket transport)
3. 1초 주기로 전체 room(=파일)의 해당 구간 데이터를 JSON으로 직렬화
4. zlib deflate (level 1) 압축 후 `send_data` 이벤트로 전송
5. 파일 끝에 도달하면 처음부터 자동 반복 (무한 루프)
6. 연결이 끊어지면 자동 재접속

### 전송 프로토콜

VitalRecorder의 `send_thread_func()` (VRApp.cpp:1965~2256)과 동일한 프로토콜:

- **Transport**: Socket.IO v4 (WebSocket)
- **Event**: `send_data`
- **Payload**: zlib deflate (level 1) 압축된 JSON (Binary)
- **Interval**: 1초

### JSON 페이로드 구조

```jsonc
{
  "ver": "1.0.0",
  "vrcode": "vitaldb-replay",
  "os": "nodejs",
  "rooms": [              // 각 .vital 파일 = 1개 room (VitalRecorder의 탭과 동일)
    {
      "roomname": "Case 1",
      "seqid": 42,
      "dtstart": 1711100000.0,
      "dtend": 1711100001.0,
      "dtcase": 1711099000.0,
      "dgmt": 540,
      "devs": [
        { "type": "Philips/IntelliVue", "name": "Monitor", "status": "connected" }
      ],
      "trks": [
        {
          "id": 1, "name": "SNUADC/ECG_II", "type": "wav",
          "srate": 100, "unit": "mV",
          "recs": [{ "dt": 1711100000.0, "val": [0.1, 0.2, 0.3] }]
        },
        {
          "id": 2, "name": "Solar8000/HR", "type": "num",
          "unit": "bpm", "montype": "ECG_HR",
          "recs": [{ "dt": 1711100000.5, "val": 72.0 }]
        }
      ],
      "evts": [],
      "filts": []
    }
    // ... 최대 10개 room
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

전송 시 WAV 트랙은 자동으로 다운샘플링됩니다:

- CO2, AWP 파형: 최대 25 Hz
- 기타 파형: 최대 100 Hz

## 요구사항

- Node.js >= 10.0.0

## 라이선스

MIT
