# ICU Vital File Matching Tool

중환자실 환자의 병상 이동 시간 데이터를 처리하고 해당 데이터를 VitalDB의 Vital File과 매칭하는데 사용 할 수 있습니다.

중환자실 입퇴실시간 기록을 활용하여 병상 이동 시간 데이터를 정제함으로써, Vital file과의 매칭 정확도를 향상시킵니다. 또한, Vital File과 환자 정보를 매칭하여 향후 중환자실 Vitalfile을 활용한 연구에 사용할 수 있습니다.

## Features

- **MovementRefinement**: 병상 이동 시간의 누락된 값 및 잘못된 날짜/시간 정보를 중환자실 입퇴실 시간 기록을 기준으로 정제합니다.

- **VitalFileMatcher**: 정제된 병상 이동 데이터와 해당 시간에 레코딩 된 Vital file을 매칭합니다. 병상 이동 시간과 Vital file 레코딩 시간이 겹치고 침상 위치(location id)가 일치하는 경우 매칭합니다. 이때 vital file의 adt가 존재한다면 adt를 우선사용합니다. vitalfile의 레코딩 시간이 6분 미만인 파일은 매칭에서 제외합니다. 

## Requirements

- Python 3.x
- Pandas
- Numpy
- VitalDB python library

 * VitalDB의 API를 사용하기 위한 자세한 정보와 가이드는 VitalDB 공식 문서 페이지에서 확인할 수 있습니다. 구체적인 설명은 [VitalDB API 문서](https://vitaldb.net/docs/?documentId=1bWaC2aylECIvBYPgTmLING3lgaUYDZ5LYymE17hgBdo)를 참고하세요.

## Installation

Python이 설치되어 있다면 필요한 Python 패키지와 vitaldb python library를 설치합니다:

```sh
pip install pandas numpy vitaldb
```

## Data Preparation

### Admission Table 
중환자실 입퇴실 정보를 포함합니다.
| Column   | Description         |
|----------|---------------------|
| hid      | 환자번호            |
| icuroom  | ICU type            |
| icuin    | 중환자실 입실시간   |
| icuout   | 중환자실 퇴실시간   |

### Bedmove Table 
ICU 입실 후 병상 이동 시간을 기록합니다.
| Column  | Description        |
|---------|--------------------|
| icuroom | ICU type           |
| bed     | 병상번호           |
| hid     | 환자번호           |
| bedin   | 병상에 들어온 시간 |
| bedout  | 병상에서 나간 시간 |

### Filelist Table
Vitalserver API를 통해 취득된 데이터입니다.
| Column   | Description                                          |
|----------|------------------------------------------------------|
| filename | 파일 이름 (예: bedname_yymmdd_hhmmss.vital)          |
| dtstart  | 녹화 시작 시간                                       |
| dtend    | 녹화 종료 시간                                       |
| adt1     | filename 별 저장된 매칭id1 (Intellivue, NihonKohden) |
| adt2     | filename 별 저장된 매칭id2 (최대 2명)                |



## Usage
1. **Configuration:** 
    
    - main 함수에서 파일 경로와 VitalDB ID, PASSWORD, Server IP를 업데이트합니다.
    - 파일 경로 설정: bedmove_filename, admission_filename, moves_filename 변수 각각의 파일 경로를 설정합니다.
        - bedmove_filename: 환자의 병상 이동 시간 데이터가 있는 파일 경로입니다. 
        - admission_filename: 중환자실 입퇴실 정보가 담긴 파일 경로입니다.
        - moves_filename: 병상 이동 데이터를 정제한 후의 결과를 저장할 파일 경로입니다. 
        MovementRefinement 과정을 거쳐 정제된 병상 이동 데이터가 저장되는 경로입니다. 
        (VitalFileMatcher만 사용할 계획이라면, 사용자는 매칭을 위해 필요한 정제된 병상 이동 데이터의 위치(moves_filename)를 직접 지정해야 합니다.)
2. **Execution Flags:** 특정 기능을 활성화 또는 비활성화하려면 main 함수 내에서 use_movement_refinement 및 use_vitalfile_matcher 옵션을 설정합니다.
3. **Run:** 설정을 완료한 후, 터미널에서 아래 명령어를 사용하여 스크립트를 실행합니다:

   ```
   python ICUVitalFileMatcher.py
   ```

### Customizing the Tool
- 데이터 형식 및 요구사항에 맞게 `MovementRefinement` 와 `VitalFileMatcher` 클래스를 수정할 수 있습니다.
- multiprocessing을 사용하려면 `main` 함수에서 num_processes 설정을 조정합니다.



## Outputs
- 정제된 침상 이동 데이터 및 Vital file 리스트와 매칭된 환자 정보가 CSV 형식으로 저장됩니다.
