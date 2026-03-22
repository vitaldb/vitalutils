# VitalDB FHIR R4 Demo Server

[VitalDB](https://vitaldb.net) 공개 데이터셋을 HL7 FHIR R4 REST API로 제공하는 데모 서버입니다.

서울대학교병원 6,388건의 수술 케이스 데이터를 FHIR 표준 리소스(Patient, Encounter, Observation)로 변환하여 제공합니다.

## 주요 기능

- **FHIR R4 호환** — HL7 FHIR R4 (v4.0.1) 표준 준수
- **3종 리소스** — Patient, Encounter, Observation 지원
- **LOINC 코드 매핑** — 검사 항목을 표준 LOINC 코드로 자동 매핑
- **검색/페이지네이션** — FHIR 표준 검색 파라미터 및 Bundle 기반 페이지네이션
- **샘플 데이터 내장** — API 접속 없이도 10건의 샘플 데이터로 즉시 테스트 가능
- **API 자동 Fallback** — VitalDB API 접속 실패 시 자동으로 샘플 데이터 사용

## 설치

```bash
cd python/fhir_server
pip install -r requirements.txt
```

## 실행

```bash
# 기본 실행 (VitalDB API에서 최대 100건 로드)
python app.py

# 샘플 데이터로 실행 (API 접속 불필요)
python app.py --sample

# 옵션 지정
python app.py --port 8080 --host 0.0.0.0 --max-cases 500
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--port` | 8080 | 서버 포트 |
| `--host` | 0.0.0.0 | 바인딩 호스트 |
| `--max-cases` | 100 | 로드할 최대 케이스 수 |
| `--sample` | false | 내장 샘플 데이터 사용 |

## API 엔드포인트

### CapabilityStatement

```
GET /fhir/metadata
```

### Patient

VitalDB의 케이스(환자) 정보를 FHIR Patient 리소스로 제공합니다.

```bash
# 개별 조회
GET /fhir/Patient/{caseid}

# 검색
GET /fhir/Patient?gender=male&_count=10
```

**검색 파라미터:** `_id`, `gender`, `_count`, `_offset`

**매핑:**
| VitalDB 필드 | FHIR 표현 |
|-------------|-----------|
| caseid | Patient.id, identifier |
| sex | gender (M→male, F→female) |
| age | extension (age-at-surgery) |
| height, weight, bmi | extension (bodyHeight, bodyWeight, bmi) |
| subjectid | identifier (재수술 환자 식별) |

### Encounter

수술 정보를 FHIR Encounter 리소스로 제공합니다.

```bash
# 개별 조회
GET /fhir/Encounter/{caseid}

# 환자별 검색
GET /fhir/Encounter?patient=1
```

**검색 파라미터:** `_id`, `patient`, `_count`, `_offset`

**매핑:**
| VitalDB 필드 | FHIR 표현 |
|-------------|-----------|
| opname | type (수술명) |
| department | serviceType |
| casestart/caseend | length (수술 시간, 분) |
| ane_type | extension (마취 유형) |
| asa | extension (ASA 분류) |
| emop | extension (응급 수술) |
| dx | extension (진단명) |
| position, approach | extension |
| preop_htn, preop_dm | extension (기저 질환) |
| death_inhosp, icu_days | extension (예후) |

### Observation

검사 결과 및 수술 중 바이탈 데이터를 FHIR Observation 리소스로 제공합니다.

```bash
# 개별 조회
GET /fhir/Observation/{obs_id}

# 환자별 검색 (patient 필수)
GET /fhir/Observation?patient=1

# 코드 필터 (LOINC 코드 또는 이름)
GET /fhir/Observation?patient=1&code=718-7

# 카테고리 필터
GET /fhir/Observation?patient=1&category=laboratory
GET /fhir/Observation?patient=1&category=vital-signs

# 시간 범위 필터 (초 단위)
GET /fhir/Observation?patient=1&date=ge3600&date=le7200
```

**검색 파라미터:** `patient` (필수), `code`, `category`, `date`, `_count`, `_offset`, `_sort`

**Observation ID 형식:**
- `{caseid}-lab-{index}` — 검사 결과
- `{caseid}-preop-{param}` — 수술 전 검사
- `{caseid}-vital-{param}` — 수술 중 바이탈

**LOINC 코드 매핑 (주요 항목):**

| VitalDB | LOINC | 설명 |
|---------|-------|------|
| hb | 718-7 | Hemoglobin |
| plt | 777-3 | Platelet count |
| na | 2951-2 | Sodium |
| k | 2823-3 | Potassium |
| cr | 2160-0 | Creatinine |
| gluc | 2345-7 | Glucose |
| ast | 1920-8 | AST |
| alt | 1742-6 | ALT |
| lactate | 2524-7 | Lactate |

## 사용 예시

```bash
# 서버 시작 (샘플 데이터)
python app.py --sample

# 환자 목록 조회
curl http://localhost:8080/fhir/Patient?_count=5

# 특정 환자 조회
curl http://localhost:8080/fhir/Patient/1

# 수술 정보 조회
curl http://localhost:8080/fhir/Encounter/1

# 검사 결과 조회 (Hemoglobin)
curl http://localhost:8080/fhir/Observation?patient=1&code=718-7

# 수술 중 바이탈 조회
curl http://localhost:8080/fhir/Observation?patient=1&category=vital-signs
```

## 프로젝트 구조

```
fhir_server/
├── app.py              # Flask 서버 & FHIR REST 엔드포인트
├── data_loader.py      # VitalDB API 데이터 로더 & 검색 엔진
├── fhir_resources.py   # FHIR R4 리소스 빌더 (LOINC 매핑 포함)
├── sample_data.py      # 내장 샘플 데이터 (10건)
├── requirements.txt    # Python 의존성
└── README.md
```

## 데이터 출처

[VitalDB](https://vitaldb.net)는 서울대학교병원에서 수집한 수술 중 바이탈 사인 데이터의 공개 데이터셋입니다.

- **논문:** Lee HC, Jung CW. Vital Recorder—a free research tool for automatic recording of high-resolution time-synchronised physiological data from multiple anaesthesia devices. *Sci Rep.* 2018;8:1527.
- **라이선스:** VitalDB 데이터는 연구 목적으로 공개되어 있습니다. 사용 시 출처를 명시해 주세요.
