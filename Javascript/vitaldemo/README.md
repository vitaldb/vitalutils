# VitalDB API Server

VitalDB open dataset의 .vital 파일을 읽어서 JSON API로 서비스하는 Node.js 서버입니다.

## 특징

- **Fastify** 기반 고성능 JSON API 서버
- 서버 시작 시 `api.vitaldb.net/{1-5}.vital` 파일을 다운로드하고 파싱하여 메모리에 적재
- **무한 루프 재생**: 서버 가동 시점부터 파일 데이터가 시간 기반으로 반복 매핑
- VitalDB Web API의 `receive` 엔드포인트와 호환되는 응답 형식

## 시간 매핑 (무한 루프)

```
wall-clock time:  |----서버시작---->|---elapsed----->|
                                    ↓
file time:        |===duration===|===duration===|===duration===| (무한 반복)
                     ↑ mapped position = elapsed % duration
```

현재 시각을 기준으로 요청하면, 서버 시작 시점부터의 경과 시간을 파일 duration으로 나눈 나머지로 매핑하여 데이터를 반환합니다.

## 설치 및 실행

```bash
npm install
node server.js
```

환경변수:
- `PORT`: 서버 포트 (기본: 3000)
- `HOST`: 바인드 주소 (기본: 0.0.0.0)

## API 엔드포인트

### GET /api/status
서버 상태 및 각 파일의 현재 시간 매핑 정보를 반환합니다.

### GET /api/filelist
로딩된 vital 파일 목록을 반환합니다.

```json
[
  {
    "filename": "1.vital",
    "dtstart": "2023-11-14T22:13:20.000Z",
    "dtend": "2023-11-14T22:18:20.000Z",
    "duration": 300,
    "tracks": ["IntelliVue/ECG_II", "IntelliVue/HR", ...]
  }
]
```

### GET /api/tracklist?filename={filename}
특정 파일의 트랙 목록을 반환합니다.

| Parameter | Required | Description |
|-----------|----------|-------------|
| filename  | Yes      | vital 파일명 (예: `1.vital`) |

```json
{
  "filename": "1.vital",
  "trks": [
    { "name": "IntelliVue/ECG_II", "type": "wav", "srate": 100, "unit": "mV" },
    { "name": "IntelliVue/HR", "type": "num", "srate": 0, "unit": "bpm" }
  ]
}
```

### GET /api/receive?filename={filename}&dtstart={dtstart}&dtend={dtend}&track={track}
VitalDB receive API 호환 - 시간 범위 내의 vital 데이터를 반환합니다.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| filename  | Yes      | -       | vital 파일명 |
| dtstart   | No       | now - 10 | 시작 시각 (Unix timestamp) |
| dtend     | No       | dtstart + 10 | 종료 시각 (Unix timestamp) |
| track     | No       | 전체    | 트랙 이름 필터 |

응답의 timestamp는 wall-clock time (요청 시각 기준)으로 매핑되어 반환됩니다.

```json
{
  "filename": "1.vital",
  "dtstart": 1772499100,
  "dtend": 1772499110,
  "mapped_dtstart": 1700000050,
  "mapped_dtend": 1700000060,
  "file_duration": 300,
  "trks": [
    {
      "name": "IntelliVue/HR",
      "type": "num",
      "unit": "bpm",
      "recs": [
        { "dt": 1772499102, "val": 72.5 },
        { "dt": 1772499104, "val": 71.8 }
      ]
    }
  ]
}
```

### GET /api/receive_current?filename={filename}&seconds={seconds}&track={track}
편의 엔드포인트 - 최근 N초간의 데이터를 반환합니다.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| filename  | Yes      | -       | vital 파일명 |
| seconds   | No       | 5       | 최근 몇 초간의 데이터 |
| track     | No       | 전체    | 트랙 이름 필터 |

## 프로젝트 구조

```
vital-server/
├── server.js              # Fastify 메인 서버
├── vital-store.js         # 파일 로딩 및 시간 매핑 로직
├── vitaldb.js             # .vital 파일 포맷 파서
├── generate-test-data.js  # 테스트용 .vital 파일 생성
├── test.js                # 통합 테스트
├── package.json
└── cache/                 # 다운로드된 .vital 파일 캐시
```

## 테스트

```bash
# 테스트 데이터 생성 (api.vitaldb.net 접속 불가시)
node generate-test-data.js

# 통합 테스트 실행
node test.js
```

## 커스터마이징

`server.js`의 `VITAL_URLS` 배열을 수정하여 다른 vital 파일을 로딩할 수 있습니다.
로컬 파일을 사용하려면 `vital-store.js`의 `loadFromUrls`를 `loadFromFiles`로 확장하거나,
파일을 `cache/` 디렉토리에 직접 넣으면 캐시로 인식합니다.
