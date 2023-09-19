import pandas as pd
import os
from datetime import datetime
from datetime import timedelta
import numpy as np
import vitaldb

# admission & bed_indout 데이터를 저장할 디렉토리 및 파일명 설정
start_date = '2020-01-01'  # 데이터 추출 시작 날짜
end_date = '2023-07-31'    # 데이터 추출 마지막 날짜

start = start_date.replace('-', '')[2:]
end = end_date.replace('-', '') [2:]
moves_dir = './' + start + '_' + end

if not os.path.exists(moves_dir):
    os.makedirs(moves_dir)

moves_filename = f'{moves_dir}/moves_{start}_{end}.csv'     #01_refine_bedmoves.py 에서 정제한 bedmove 테이블 경로
df_moves = pd.read_csv(moves_filename, parse_dates=['bedin','bedout'], low_memory=False)

# 6. vital server API에서 filelist와 tacklist를 읽어와 테이블 생성
# vitaldb login
vitaldb.api.login(id='', pw='', host='') #vitaldb id=아이디, pw=패스워드, host=주소

# 매칭하고자 하는 icu, 기간 
icurooms = ['CCU','CPICU','DICU','DICU2','EICU','MCICU','MICU','NICU','PICU','SICU1','SICU2','SICU3']

for icuroom in icurooms :
    result_file = f'{moves_dir}/{icuroom}_matched_{start}_{end}.csv'
    df_icu = df_moves.loc[df_moves['icuroom']==icuroom]   
    if not os.path.exists(result_file):      
            
        BEDNAME = icuroom
        DTSTART = start_date
        DTEND = end_date
    
        # load filelist 
        print(f'making df_filelist_{icuroom}')
        df_filelist = pd.DataFrame(vitaldb.api.filelist(bedname=BEDNAME, dtstart=DTSTART, dtend=DTEND, hid=True))           
        df_filelist.drop(index=df_filelist[df_filelist['dtend'].str.contains('NaN', na=False, case=False)].index, inplace=True)
        df_filelist = df_filelist.reset_index(drop=True)

        df_filelist = df_filelist.astype({'dtstart':'datetime64[ns]',
                        'dtend':'datetime64[ns]'
                        })

        # dtstart - dtend > 6min인 파일만 매칭한다.
        df_filelist = df_filelist.loc[np.where((np.timedelta64(6, 'm') < (df_filelist["dtend"] - df_filelist['dtstart']).values))]
        df_filelist = df_filelist.sort_values(by='filename').reset_index(drop=True).fillna('')
        print(f'loading {icuroom} vital file list', end='...', flush=True)
        
        # load tracklist
        df_track = pd.DataFrame(vitaldb.api.tracklist(bedname=BEDNAME, dtstart=DTSTART, dtend=DTEND))
        df_track['trks'] = df_track['trks'].apply(lambda x:' '.join(x[0: -1]))
        vitalfiles = pd.merge(df_filelist, df_track)

        # track parameter에 hr, spo2 둘 중 하나가 존재한다면 valid
        vitalfiles.loc[vitalfiles['trks'].str.contains('HR|PLETH_SAT_O2|PLETH_SPO2'),'valid'] = '1'
        vitalfiles.loc[~vitalfiles['trks'].str.contains('HR|PLETH_SAT_O2|PLETH_SPO2'), 'valid'] = '0'

        # location_id = bed위치 = vrname
        # filelist에서 hid는 bedmove의 hid와 구별하기 위해 adt로 이름을 바꾼다.
        filelist = vitalfiles[['filename','hid1','hid2','dtstart','dtend','valid']]
        filelist.rename(columns={'hid1' : 'adt1', 'hid2' : 'adt2'}, inplace=True)
        filelist['icuroom'] = filelist['filename'].str.split('_').str[0]
        filelist = filelist.loc[filelist['icuroom']==icuroom]
        filelist['location_id'] = filelist['filename'].str.split('_').str[0] + '_' + filelist['filename'].str.split('_').str[1]

        filelist.to_csv(f'{moves_dir}/{icuroom}_filelist_{start}_{end}.csv', index=False, encoding='utf-8-sig')
        print(f'matching {icuroom} vital files', end='...', flush=True)

        # filelist 와 환자정보 매칭
        # 7. location_id가 같고 bedin- 1hr <= dtstart <= bedout인 file과 bedmove_hid를 매칭

        file_merge = pd.merge(filelist, df_icu, on='location_id', how='left')

        file_merge['bedin'] = pd.to_datetime(file_merge['bedin'])
        file_merge['bedout'] = pd.to_datetime(file_merge['bedout'])
        file_merge['dtstart'] = pd.to_datetime(file_merge['dtstart']) 
        file_merge['dtend'] = pd.to_datetime(file_merge['dtend'])

        df_match = file_merge.loc[((file_merge['bedin'] - timedelta(hours=1) < file_merge['dtstart'])) & (file_merge['dtstart'] <= file_merge['bedout'])]
        df_match.drop_duplicates(subset=['filename','hid'], ignore_index=True, inplace=True)

        out = df_match.groupby('filename', as_index=False).agg({'hid':list})
        out = out.join(pd.DataFrame(out.pop('hid').tolist()).rename(columns=lambda x:f"hid{x+1}"))
        out.dropna(how='all', axis=1, inplace=True)

        df_match = pd.merge(filelist, out, on='filename', how='left')
        df_match = df_match.drop_duplicates(subset=['filename','hid1'])

        df_match.to_csv(result_file, index=False, encoding='utf-8-sig')
        print(f'save file: {result_file}')
