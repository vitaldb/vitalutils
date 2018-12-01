import io
import os
import csv
import subprocess
import pandas as pd
rootdir = r"d:/research/vitaldb/ex8_note_deid"
for dir, dirs, files in os.walk(rootdir):
    for file in files:
        ipath = '{}/{}'.format(dir, file)
        cmd = r'C:\Program Files (x86)\Vital Recorder\utilities\vital_trks.exe {}'.format(ipath)
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        df = pd.read_csv(io.StringIO(p.stdout.read().decode('utf-8')), comment='#')

        usen2o = False
        for i, row in df.iterrows():
            if row['tname'] != 'FEN2O'
                continue
            usen2o = row['maxval'] > 10
            break

        print('{},{}'.format(file, int(usen2o)))
