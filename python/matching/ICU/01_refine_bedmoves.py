import pandas as pd
import os
from datetime import datetime
from datetime import timedelta
import numpy as np

# admission & bed_indout 데이터를 저장할 디렉토리 및 파일명 설정
start_date = '2020-01-01'     # 데이터 추출 시작 날짜
end_date = '2023-07-31'       # 데이터 추출 마지막 날짜

start = start_date.replace('-', '')[2:]
end = end_date.replace('-', '') [2:]
moves_dir = './' + start + '_' + end

start_date = datetime.strptime(start_date, '%Y-%m-%d')

if not os.path.exists(moves_dir):
    os.makedirs(moves_dir)

bm_filename = f'{moves_dir}/bedmove_{start}_{end}.csv'
adm_filename = f'{moves_dir}/admission_{start}_{end}.xlsx'
bmnull_filename = f'{moves_dir}/bedmove_null.csv'
icunull_filename = f'{moves_dir}/icu_null.csv'
moves_filename = f'{moves_dir}/moves_{start}_{end}.csv'

# load admission & bedmove table
dfadm = pd.read_excel(adm_filename, parse_dates=['입실시간','퇴실시간'])
dfadm.rename(columns={'환자번호':'hid', '입실병동':'icuroom', '입실시간':'icuin', '퇴실시간':'icuout'}, inplace=True)
dfadm = dfadm[['hid','icuroom','icuin','icuout']]
dfbm = pd.read_csv(bm_filename, parse_dates=['bedin','bedout'], low_memory=False)
dfbm.rename(columns={'WD_DEPT_CD' : 'icuroom', 'BED_NO' : 'bed', 'IN_DTM' : 'bedin', 'OUT_DTM' : 'bedout'}, inplace=True)

# null을 확인하는 column 추가
dfbm.loc[dfbm['bedout'].isnull(), 'bedout_null'] = 1
dfbm.loc[dfbm['bedout'].notnull(), 'bedout_null'] = 0
dfadm.loc[dfadm['icuout'].isnull(), 'icuout_null'] = 1
dfadm.loc[dfadm['icuout'].notnull(), 'icuout_null'] = 0

# 1. bedout 결측값 대체
def FillBmNull(x):
    new=[]

    for i in range(len(x.bedout)):
        if i == len(x.bedout)-1:
            # 마지막 bedout이 결측값이라면 추출기간의 마지막 날짜로 채운다.
            if str(x.bedout[i]) == 'NaT':
                new.append(pd.to_datetime(end_date + ' 23:59:59'))
            else:
                new.append(x.bedout[i])
        # bedout 값이 없고 환자의 다음 bedin 기록이 존재한다면 다음 bedin으로 대체한다.        
        elif str(x.bedout[i]) =='NaT':
            new.append(x.bedin[i+1])
        else:
            new.append(x.bedout[i])
    return new

# 2. icuout 결측값 대체
def FillAdmNull(x):
    new=[]

    for i in range(len(x.icuout)):
        if i == len(x.icuout)-1:
            # 마지막 icuout이 결측값이라면 추출기간의 마지막 날짜로 채운다.
            if str(x.icuout[i]) == 'NaT':
                new.append(pd.to_datetime(end_date + ' 23:59:59'))
            else:
                new.append(x.icuout[i])
        else:
            # 다음 icuin이 존재할 때 icuout이 결측값이거나 icuout이 다음 icuin 보다 크다면 다음 icuin으로 대체한다.
            if (str(x.icuout[i]) == 'NaT') or (x.icuout[i] > x.icuin[i+1]):
                new.append(x.icuin[i+1])
            else:
                new.append(x.icuout[i])
    return new

# 1. bedmove bedin 기준으로 오름차순 정렬하고 FillbmNull 함수 적용
dfbm.sort_values(by='bedin',inplace=True)
dfbm = dfbm.groupby(['hid'],as_index=False).agg({'icuroom':list,'bed':list,'bedin':list, 'bedout':list, 'bedout_null':list})
dfbm['bedout'] = dfbm.apply(FillBmNull, axis=1)
dfbm = dfbm.explode(list(['icuroom','bed','bedin','bedout','bedout_null']), ignore_index=True)
dfbm = dfbm.loc[(dfbm['bedout'] - dfbm['bedin'] > timedelta(minutes=1))]

# 2. admission icuin 기준으로 오름차순 정렬하고 FillAdmNull 함수 적용
dfadm.sort_values(by='icuin',inplace=True)
dfadm = dfadm.groupby(['hid'],as_index=False).agg({'icuroom':list, 'icuin':list, 'icuout':list, 'icuout_null':list})
dfadm['icuout'] = dfadm.apply(FillAdmNull, axis=1)
dfadm = dfadm.explode(list(['icuroom','icuin','icuout','icuout_null']), ignore_index=True)
dfadm = dfadm[dfadm['icuin']!=dfadm['icuout']]

# replace icuroom name
dfbm['icuroom'].replace({'PEICU':'PICU', 'RICU':'CPICU', 'SICU':'SICU1'}, inplace=True)
dfadm['icuroom'].replace({'PEICU':'PICU', 'RICU':'CPICU', 'SICU':'SICU1'}, inplace=True)

dfbm['hid'] = dfbm['hid'].astype(str)
dfadm['hid'] = dfadm['hid'].astype(str)

# admission table에는 기록이 있으나 bedmove에 없는 환자 리스트 확인(bm_null.csv)
icu_in = pd.merge_asof(dfadm.sort_values('icuin'), dfbm.sort_values('bedin'), left_on='icuin', right_on='bedin', by=['hid' ,'icuroom'], direction="nearest")
icu_out = pd.merge_asof(dfadm.sort_values('icuout'), dfbm.sort_values('bedout'), left_on='icuout', right_on='bedout', by=['hid' ,'icuroom'], direction="nearest")
icu_merge = pd.concat([icu_in, icu_out]).drop_duplicates()
bm_null = icu_merge.loc[((icu_merge['bed'].isnull()) & (start_date < icu_merge['icuout'])),['hid','icuroom','icuin','icuout']]
bm_null.to_csv(bmnull_filename, index=False, encoding='utf-8-sig')

print('merging bedmove table with admission table start... ')
# bedmoves 테이블을 기준으로 merge, bedin과 가장 근접한 icuin, bedout과 가장 근접한 icuout을 찾아 각각 merge 후 concatenate
# -> 같은 icu로 재입실 하는 경우를 고려하여 bedin, bedout 을 기준으로 각각 병합
bed_in = pd.merge_asof(dfbm.sort_values('bedin'), dfadm.sort_values('icuin'), left_on='bedin', right_on='icuin', by=['hid' ,'icuroom'], direction="nearest")
bed_out = pd.merge_asof(dfbm.sort_values('bedout'), dfadm.sort_values('icuout'), left_on='bedout', right_on='icuout', by=['hid' ,'icuroom'], direction="nearest")
df_merge = pd.concat([bed_in, bed_out]).drop_duplicates()

# bedmove table에는 기록이 있으나 admission table에 없는 환자 리스트 확인(icu_null.csv)
icu_null = df_merge.loc[((df_merge['icuin'].isnull()) & (start_date<=(df_merge['bedin'])))]
icu_null = icu_null[['icuroom', 'bed', 'hid', 'bedin','bedout']]
icu_null.to_csv(icunull_filename, index=False, encoding='utf-8-sig') 

# bedmove table에만 기록이 있는 환자 merge table에 포함
icu_null = icu_null.loc[icu_null['icuroom'].str.contains('CU')]
icu_null['icuin'] = icu_null['bedin']
icu_null['icuout'] = icu_null['bedout']
icu_null['icuout_null'] = 1
icu_null['bedout_null'] = 1

df_merge = pd.concat([df_merge, icu_null])
df_merge = df_merge.loc[df_merge['icuin'].notnull()]
df_merge = df_merge.loc[df_merge['bedin'] < df_merge['bedout']]
df_merge = df_merge.loc[df_merge['icuin'] < df_merge['icuout']]
df_merge = df_merge.loc[(df_merge['bedin'] < df_merge['icuout']) & (df_merge['icuin'] < df_merge['bedout'])] 

# 중복제거
df_merge['중복'] = df_merge.duplicated(subset=['hid','icuroom','bed','bedin','bedout'], keep=False)
df_merge.sort_values(['hid','icuin'],inplace=True)
df_true = df_merge.loc[df_merge['중복']!=True]
df_dup = df_merge.loc[df_merge['중복']==True]
df_dup = df_dup.loc[((df_dup['icuout_null'] == 0.0) & (df_dup['bedout_null'] == 0.0)) | ((df_dup['icuin'] <= df_dup['bedin']) & (df_dup['bedout_null'] == 1.0))]
df_merge = pd.concat([df_true, df_dup], ignore_index=True)[['hid','icuroom','bed','bedin','bedout','icuin','icuout','bedout_null','icuout_null']]

# 첫번째 bedin 이 icuin 보다 이전에 기록되었고 bedout - bedin 시간이 1시간 이내라면 삭제한다.
def RemoveBedmove(x):

    new = []
    for i in range(len(x.bedin)):
        if len(x.bedin) > 1 and i == 0 and (x.bedin[i] < x.icuin) and (x.bedout[i] - x.bedin[i] < pd.Timedelta(hours=1)):
            new.append('NaT')
        else:
            new.append(x.bedin[i])
    return new
            
# 3. refine_bedin_with_icuin
def ChangeBedIn(x):

    new_bedin = []
    for i in range(len(x.bedin)):
        if i==0:
            new_bedin.append(x.icuin)
        else:
            new_bedin.append(x.bedin[i])
    return new_bedin

# 4. refine_bedout_with_icuout
def ChangeBedOut(x):

    new_bedout = []
    for i in range(len(x.bedout)):
        if i == len(x.bedout) -1:
            if (x.icuout_null[i] == 1.0) and (x.bedout_null[i] == 0.0):
                new_bedout.append(x.bedout[i])
            else:
                new_bedout.append(x.icuout)
        else:
            if x.bedout[i] != x.bedin[i+1]:
                new_bedout.append(x.bedin[i+1])
            else:
                new_bedout.append(x.bedout[i])
    return new_bedout

# 5. refine_null_bedout
# bedout_null 을 다시 수정한다.
def CheckNullBedOut(x):

    new = []
    for i in range(len(x.bedout)):
        if i != len(x.bedout)-1 and x.bedin[i+1] <= x.bedout[i] and (x.bedout_null[i] == 1.0 or x.icuout_null[i] == 1.0):
            new.append(x.bedin[i+1])
        else:
            new.append(x.bedout[i])
    return new

print('refining bedmoves...')
# 3, 4. bedin 기준으로 오름차순 정렬하고 RemoveBedmove, ChangeBedIn, ChangeBedOut 함수 적용하여 bedin, bedout 수정
df_merge.sort_values(by='bedin',inplace=True)
df_merge = df_merge.groupby(['icuroom','hid','icuin','icuout'],as_index=False).agg({'bed':list, 'bedin':list, 'bedout':list, 'icuout_null':list, 'bedout_null':list})
df_merge['bedin'] = df_merge.apply(RemoveBedmove, axis=1)
df_merge = df_merge.explode(list(['bed','bedin','bedout','bedout_null','icuout_null']), ignore_index=True)
df_merge = df_merge.loc[df_merge['bedin'].notnull()]

df_merge.sort_values(by='bedin',inplace=True)
df_merge = df_merge.groupby(['icuroom','hid','icuin','icuout'],as_index=False).agg({'bed':list, 'bedin':list, 'bedout':list, 'icuout_null':list, 'bedout_null':list})
df_merge['bedin'] = df_merge.apply(ChangeBedIn, axis=1)
df_merge['bedout'] = df_merge.apply(ChangeBedOut, axis=1)
df_merge = df_merge.explode(list(['bed','bedin','bedout','bedout_null','icuout_null']), ignore_index=True)

# 5. bedin 기준으로 오름차순 정렬하고 CheckNullBedout 함수 적용하여 1.에서 대체한 bedout 결측치를 수정한다.
df_merge.sort_values(by='bedin',inplace=True)
df_merge = df_merge.groupby(['icuroom','bed'],as_index=False).agg({ 'hid':list, 'icuin':list,'icuout':list,'bedin':list, 'bedout':list, 'icuout_null':list, 'bedout_null':list})
df_merge['bedout'] = df_merge.apply(CheckNullBedOut, axis=1)
df_merge = df_merge.explode(list(['hid','icuin','icuout','bedin','bedout','bedout_null','icuout_null']), ignore_index=True)
df_merge['bed']= df_merge['bed'].astype(int)
moves_refine = df_merge[['hid','icuroom','bed','bedin','bedout']]

# location_id를 filelist의 vrname에 맞게 수정
moves_refine['bed'] = moves_refine['bed'].astype(str)
moves_refine.loc[moves_refine['icuroom']=='DICU1', 'icuroom'] = 'DICU'
moves_refine['location_id1'] = moves_refine['icuroom'] +'_'+ moves_refine[~moves_refine['icuroom'].str.contains('CCU|CPICU')]['bed'].str.zfill(2)
moves_refine['location_id2'] = moves_refine['icuroom'] +'_'+ moves_refine[moves_refine['icuroom'].str.contains('CCU|CPICU')]['bed']
moves_refine['location_id'] = moves_refine['location_id1'].fillna('') + moves_refine['location_id2'].fillna('')

df_moves = moves_refine[['hid','icuroom','location_id','bedin','bedout']]
df_moves.to_csv(moves_filename, index=False, encoding='utf-8-sig')

