import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import vitaldb
from refine_bedmoves import PatientMovementRefinement

class VitalFileMatcher:
    def __init__(self, start_date, end_date, use_existing_file=True):
        self.refiner = PatientMovementRefinement(start_date, end_date)
        if use_existing_file:
            self.df_moves = self._load_moves()
        else:
            self._run_refiner()

    def _run_refiner(self):
        self.refiner.refine_data()
        self.refiner.find_missing_bedmoves()
        self.refiner.process_merged_data()
        refined_df = self.refiner.refine_bed_moves(self.refiner.df_merge)
        self.df_moves = self.refiner.refine_and_save_moves(refined_df)

    def _load_moves(self):
        file_path = "bedmoves_data_file_path"  # 최종 수정된 bedmoves 파일의 경로를 넣습니다.
        return pd.read_csv(file_path, parse_dates=['bedin', 'bedout'], low_memory=False)

    def match_vital_files(self, icurooms, vitaldb_credentials):
        vitaldb.api.login(**vitaldb_credentials)
        for icuroom in icurooms:
            self._process_icuroom(icuroom)

    def _process_icuroom(self, icuroom):
        result_file = f'{self.refiner.moves_dir}/{icuroom}_matched_{self.refiner.period_str}.csv'
        if not os.path.exists(result_file):
            df_icu = self.df_moves.loc[self.df_moves['icuroom'] == icuroom]
            df_filelist = self._get_filelist(icuroom)
            df_track = self._get_tracklist(icuroom)
            df_match = self._match_files_with_patients(df_filelist, df_track, df_icu)
            df_match.to_csv(result_file, index=False, encoding='utf-8-sig')
        else:
            print(f"Result file for {icuroom} already exists.")

    def _get_filelist(self, icuroom):
        print(f'[{datetime.now()}] Making df_filelist_{icuroom}')
        df_filelist = pd.DataFrame(vitaldb.api.filelist(bedname=icuroom, dtstart=self.refiner.start_date, dtend=self.refiner.end_date, hid=True))           
        df_filelist.drop(df_filelist[df_filelist['dtend'].str.contains('NaN', na=False, case=False)].index, inplace=True)
        df_filelist['dtend'] = pd.to_datetime(df_filelist['dtend'])
        df_filelist['dtstart'] = pd.to_datetime(df_filelist['dtstart'])
        # dtstart - dtend > 6min인 파일만 매칭한다.
        df_filelist = df_filelist[df_filelist['dtend'] - df_filelist['dtstart'] > timedelta(minutes=6)]
        return df_filelist.sort_values(by='filename').reset_index(drop=True)

    def _get_tracklist(self, icuroom):
        print(f"[{datetime.now()}] Making df_tracklist_{icuroom}")
        df_track = pd.DataFrame(vitaldb.api.tracklist(bedname=icuroom, dtstart=self.refiner.start_date, dtend=self.refiner.end_date))
        df_track['trks'] = df_track['trks'].apply(lambda x:' '.join(x[:-1]))
        # track parameter에 hr, spo2 둘 중 하나가 존재한다면 valid
        df_track['valid'] = df_track['trks'].str.contains('HR|PLETH_SAT_O2|PLETH_SPO2').astype(int).astype(str)
        return df_track

    def _match_files_with_patients(self, df_filelist, df_track, df_icu):
        """Match vital files with patient data."""
        print(f"[{datetime.now()}] Matching files with patients...")
        vitalfiles = pd.merge(df_filelist, df_track)
        # location_id = bed위치 = vrname
        # filelist에서 hid는 bedmove의 hid와 구별하기 위해 adt로 이름을 바꾼다.
        filelist = vitalfiles[['filename','hid1','hid2','dtstart','dtend','valid']]
        filelist.rename(columns={'hid1' : 'adt1', 'hid2' : 'adt2'}, inplace=True)
        filelist.loc[:, 'icuroom'] = filelist['filename'].str.split('_').str[0]
        filelist.loc[:, 'location_id'] = filelist['filename'].str.split('_').str[0] + '_' + filelist['filename'].str.split('_').str[1]

        file_merge = pd.merge(filelist, df_icu, on='location_id', how='left')

        cols_to_convert = ['bedin', 'bedout', 'dtstart', 'dtend']
        file_merge[cols_to_convert] = file_merge[cols_to_convert].apply(pd.to_datetime)

        df_match = file_merge.loc[(file_merge['bedin'] - timedelta(hours=1) < file_merge['dtstart']) & (file_merge['dtstart'] <= file_merge['bedout'])]
        df_match.drop_duplicates(subset=['filename','hid'], ignore_index=True, inplace=True)

        out = df_match.groupby('filename', as_index=False).agg({'hid':list})
        out = out.join(pd.DataFrame(out.pop('hid').tolist()).rename(columns=lambda x:f"hid{x+1}"))
        out.dropna(how='all', axis=1, inplace=True)

        df_match = pd.merge(filelist, out, on='filename', how='left')
        df_match.drop_duplicates(subset=['filename','hid1'], ignore_index=True, inplace=True)
        print(f"[{datetime.now()}]Matched {len(df_match)} files with patients.")

        return df_match
        
# Usage:
# 1. VitalFileMatcher 클래스를 초기화합니다.
#    - 시작 및 종료 날짜를 지정합니다.
#    - use_existing_file를 False로 설정하여 기존 파일을 사용하지 않고 새로운 데이터 처리를 진행합니다.
matcher = VitalFileMatcher('2020-01-01', '2023-07-31', False) 
# 2. VitalDB 웹모니터링에서 사용되는 ICU 그룹을 지정합니다.
icurooms = ['CCU', 'MICU', 'SICU', 'PICU'] 
# 3. VitalDB에 로그인하기 위한 사용자 인증 정보를 설정합니다.
#    이 정보는 intranet vitalserver에 접근하기 위한 사용자의 인증 정보입니다.
vitaldb_credentials = {
    'id': 'YOUR_VITALDB_ID',       # vitalserver 사용자 ID
    'pw': 'YOUR_VITALDB_PW',       # vitalserver 사용자 비밀번호
    'host': 'YOUR_VITALDB_HOST'    # vitalserver 주소 (포트가 80이 아니면 포트까지 포함)
}
# 4. 지정된 ICU 그룹 및 인증 정보를 사용하여 Vital 파일 매칭을 시작합니다.
matcher.match_vital_files(icurooms, vitaldb_credentials)
