# ICU 병상 이동 데이터 전처리 및 ICU vital file 매칭

## 목차
1. [준비할 데이터](#준비할-데이터)
2. [전처리 과정](#전처리-과정)
3. [매칭 알고리즘 원칙](#매칭-알고리즘-원칙)

## 1. 준비할 데이터
### admission table 
- 중환자실 입퇴실 정보를 포함합니다.

|column|description|
|--------|-----|
|hid|환자번호|
|icuroom | ICU type|
|icuin   | 중환자실 입실시간|
|icuout  | 중환자실 퇴실시간|

### bedmove table 
- ICU 입실 후 병상 이동 시간을 포함합니다.

|column|description|
|--------|-----|
|icuroom| ICU type 
|bed	| 병상번호
|hid 	| 환자번호
|bedin	| 병상에 들어온 시간
|bedout | 병상에서 나간 시간|

### filelist table
- Vitalserver API를 통해 취득됩니다.

|column|description|
|--------|-----|
|filename| 파일 이름 (ex) bedname_yymmdd_hhmmss.vital
|dtstart| 녹화 시작 시간
|dtend 	| 녹화 종료 시간
|adt1	| filename 별 저장된 매칭id1 (Intellivue, NihonKohden 환자 모니터에서만 취득 가능)
|adt2 | filename 별 저장된 매칭id2 (한 파일에 최대 2명까지 기록됨)

### tracklist table
- Vitalserver API를 통해 취득됩니다.

|column|description|
|--------|-----|
|filename| 파일 이름
|dtstart| 녹화 시작 시간
|dtend 	| 녹화 종료 시간
|trks	| 트랙 리스트 (ex) [‘Intellivue/HR’,...]

## 2. 전처리 과정

1. adt(filename 별 저장된 환자번호)취득이 불가능한 경우 중환자실 입퇴실 기록과 입실 후 병상 이동 기록을 이용합니다.
2. Vital file과 환자 정보를 매칭하기 위해서는 중환자실 입실 후 병상 이동 정보에 대한 전처리 과정이 필요합니다.
3. 전체 예시 코드를 보고 싶으시다면 01_refine_bedmoves.py 파일을 참고하세요.

    ### class `PatientMovementRefinement` 
    - ICU 환자의 이동 데이터를 정제하기 위한 목적으로 설계되었습니다. 이 클래스를 통해 병상 이동(`bedmove`) 및 입퇴실(`admission`) 데이터의 누락된 값, 잘못된 날짜 및 시간 데이터를 처리하고 정제할 수 있습니다.

    #### 속성

    - `start_date`: 정제할 데이터의 시작 날짜
    - `end_date`: 정제할 데이터의 종료 날짜
    - `dfbm`: `bedmove` 데이터프레임
    - `dfadm`: `admission` 데이터프레임

    #### 초기화 및 데이터 로딩

    - **`__init__`**: 클래스 초기화 및 데이터 로딩 작업 수행
    - **`create_directory`**: 지정된 날짜 기반의 디렉토리 생성
    - **`load_data`**: `bedmove` 또는 `admission` 데이터 로딩


    #### 결측치 처리

    - **`filler`**: 결측치 또는 잘못된 시간 데이터 처리
    - **원인:** 데이터 추출 기간 내에 퇴실하지 않은 환자, 퇴원, 사망, 또는 EMR 오류로 인해 icuout 및 bedout의 결측값이나 잘못된 값이 발생한다.
    - **과정:** 
        1. 결측값이 있을 경우, 해당 환자의 다음 `icuin` 또는 `bedin` 시간으로 채운다.
        2. 해당 환자의 `icuin` 또는 `bedin` 시간이 더 이상 없을 경우, 데이터 추출 기간의 마지막 날짜로 채운다.

    #### 병상 이동 정제

    - **`refine_bed_moves`**:
    - **원인:** bedmove 테이블은 병상이동을 한 당시에 기록되지 않았기 때문에 bedin 및 bedout 의 잘못된 값이 발생한다.
    - **과정:** 
        1. `bedin` 및 `bedout`을 기준으로 가장 가까운 시간을 값으로 하는 `icuin` 및 `icuout`을 찾아 두 테이블을 merge한다. ( method: **`process_merged_data`** ) 
        2. merge한 데이터에서 `bedin` 및 `bedout`을 `icuin` 및 `icuout`기준으로 수정한다.

            1. 짧은 병상 이동 제거
            - 함수: `_remove_short_bed_moves`
            - 설명: ICU 입원 전에 발생하고 1시간 미만의 초기 병상 이동을 제거

            2. bedin 시간 조정
            - 함수: `_adjust_bed_in`
            - 설명: 첫 번째 `bedin` 시간을 `icuin` 시간과 일치하도록 조정

            3. bedout 시간 조정
            - 함수: `_adjust_bed_out`
            - 설명: 다음 `bedin` 시간과 일관성을 유지하도록 `bedout` 시간을 조정합니다. 마지막 `bedout` 시간은 `icuout` 시간과 일치하도록 조정

            4. null bedout 시간 확인 및 조정
            - 함수: `_check_null_bed_out`
            - 설명: 결측치 처리에서 대체한 `bedout` 시간이 다음 `bedin` 시간과 충돌한다면,  `bedout` 시간을 수정


    #### 결과 저장

    - **`refine_and_save_moves`**: 정제된 데이터를 CSV 파일로 저장

    #### 실행방법

    1. 필요한 라이브러리 및 패키지 설치
    2. 원본 데이터 준비 (`bedmove`, `admission`)
    3. 클래스를 사용하여 데이터 정제 및 결과 저장

    ```python
    # 예제 코드
    refiner = PatientMovementRefinement('2020-01-01', '2023-07-31') # 추출시작날짜, 추출종료날짜
    refiner.refine_data()
    refiner.find_missing_bedmoves()
    refiner.process_merged_data()
    refined_df = refiner.refine_bed_moves(refiner.df_merge)
    refiner.refine_and_save_moves(refined_df, "저장할 파일 경로")
    ```


## 매칭 알고리즘 원칙

1) 길이가 6분 이내의 파일은 삭제한다.
2) valid column을 생성하고, trks 파일의 trks에 HR 과 SPO2가 모두 존재하지 않으면 0을, 둘 중 하나라도 존재하면 1을 할당한다.
3) adt 파일과 trks 파일을 filename 기준으로 병합하여 filelist.csv 파일을 만든다.
4) filelist.csv 파일의 filename에서 bedname을 추출하여 location_id 컬럼을 만든다.
5) 정제를 완료한 bedmove table (이지케어텍 api활용, 전처리 프로세스 참고)의 icuroom 과 bed를 합쳐 location_id 칼럼을 만든다. 이때 4.의 location_id 와 같은 형식으로 만든다.
6) location_id가 일치하고 bedin - 1hour < dtstart <= bedout 을 만족하는 hid를 찾아 filelist 테이블에 매칭한다. 
7) 하나의 파일에 매칭되는 hid가 한개 이상이라면 행을 추가한다.
