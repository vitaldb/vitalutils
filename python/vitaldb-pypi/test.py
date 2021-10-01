import vitaldb

# 오픈 데이터셋에서 특정 트랙가진 모든 case에서 해당 트랙을 로딩하여 vital 파일로 저장
import vitaldb
track_names = ['SNUADC/ECG_II', 'Solar8000/HR']
for caseid in vitaldb.find_cases(track_names):
    vitaldb.VitalFile(caseid, track_names).to_vital('{}.vital'.format(caseid))
    break
quit()

# 오픈 데이터셋을 그대로 vital 파일로 저장
for caseid in range(1, 6389):
    vitaldb.VitalFile(caseid).to_vital('{}.vital'.format(caseid))
    break
quit()

# 오픈 데이터셋에서 특정 트랙가진 모든 case에서 해당 트랙을 로딩하여 이용한 후 vital 파일로 저장
track_names = ['SNUADC/ECG_II', 'Solar8000/HR']
for caseid in vitaldb.find_cases(track_names):
    vf = vitaldb.VitalFile(caseid, track_names)
    vals = vf.to_numpy(track_names, 0.002)
    print(vals.shape)
    print(vals)
    quit()
    vf.to_vital('{}.vital'.format(caseid))
    break
quit()

trks = vitaldb.vital_trks("1.vital")
print(trks)

vals = vitaldb.vital_recs("https://vitaldb.net/samples/00001.vital", 'ART_MBP', return_timestamp=True)
print(vals)

import pandas as pd
import time

ipath = '1.vital'
opath = '1.parquet'
vitaldb.VitalFile(opath).to_vital('re'+ipath)
#vf = vitaldb.VitalFile(ipath)

quit()

dtstart = time.time()
print('reading', flush=True, end='...')

df = vitaldb.VitalFile(ipath).to_pandas()

print('({:.3f} sec)'.format(time.time() - dtstart), flush=True, end='...')
dtstart = time.time()
print('saving', flush=True, end='...')

df.to_parquet(opath, compression='gzip')

print('({:.3f} sec)'.format(time.time() - dtstart), flush=True, end='...')
print('done')

df.info()
