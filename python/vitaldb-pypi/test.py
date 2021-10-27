import pandas as pd
import os
import vitaldb
import vitaldb
import os

OUTPUT_DIR = 'download'
if not os.path.exists(OUTPUT_DIR):
    os.mkdir(OUTPUT_DIR)
    
vitaldb.api.login('vitaldb_test', 'vitaldb_test')
df = pd.read_excel('list.xlsx')
for idx, row in df.iterrows():
    filename = row['filename']
    opath = OUTPUT_DIR + '/' + filename
    if os.path.exists(opath):
        continue
    print('downloading ' + filename, end='...')
    vitaldb.api.download(filename, opath)
    print('done')

quit()

# path to save downloaded files
DOWNLOAD_DIR = "Download"
if not os.path.exists(DOWNLOAD_DIR):
    os.mkdir(DOWNLOAD_DIR)

# issue access token
if vitaldb.api.login(id="vitaldb_test", pw="vitaldb_test"):
    vf = vitaldb.VitalFile(vitaldb.api.download('TEST1_211020_142621.vital'))
    print(vf.get_track_names())
    quit()

    files = vitaldb.api.filelist()
    print(f'{len(files)} files')

    for f in files:
        print("Downloading: " + f['filename'], end='...', flush=True)
        opath = DOWNLOAD_DIR + '/' + f['filename']
        if not vitaldb.api.download(f['filename'], opath):
            print('failed')
        else:
            print('done')

quit()

import boto3
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from joblib import Parallel, delayed

# cpu core 갯수를 설정
ncpu = pa.cpu_count()
print('{} cpu core'.format(ncpu))
pa.set_cpu_count(ncpu)
pa.set_io_thread_count(ncpu)

bucket_name = 'vitaldb-parquets'
prefix = 'vitaldb2017/1608/D1'
track_names = ['Solar8000/HR', 'SNUADC/ECG_II']

odir = 'vital_files'
if not os.path.exists(odir):
    os.mkdir(odir)

# 병렬 처리
s3 = boto3.resource('s3')
def save_file(uri, track_names):
    opath = odir + '/' + os.path.splitext(os.path.basename(uri))[0] + '.vital'
    vitaldb.VitalFile(uri, track_names).to_vital(opath)

# 1개로 테스트
for obj in s3.Bucket(bucket_name).objects.filter(Prefix=prefix):
    save_file(f's3://{bucket_name}/{obj.key}', track_names)
    break
quit()

Parallel(ncpu)(delayed(save_file)(f's3://{bucket_name}/{obj.key}', track_names) for obj in s3.Bucket(bucket_name).objects.filter(Prefix=prefix))

import vitaldb

# 오픈 데이터셋을 그대로 vital 파일로 저장
for caseid in range(1, 6389):
    vitaldb.VitalFile(caseid).crop(-1800, None).to_vital('crop{}.vital'.format(caseid))
    break
quit()

# 오픈 데이터셋에서 특정 트랙가진 모든 case에서 해당 트랙을 로딩하여 vital 파일로 저장
track_names = ['SNUADC/ECG_II', 'Solar8000/HR']
for caseid in vitaldb.find_cases(track_names):
    vitaldb.VitalFile(caseid, track_names).to_vital('{}.vital'.format(caseid))
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
vf = vitaldb.VitalFile(ipath)
print('({:.3f} sec)'.format(time.time() - dtstart), flush=True, end='...')
dtstart = time.time()
print('saving', flush=True, end='...')
vf.to_parquet(opath)
print('({:.3f} sec)'.format(time.time() - dtstart), flush=True, end='...')
print('done')
