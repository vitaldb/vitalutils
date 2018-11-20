import io
import os
import csv
import subprocess
import pandas as pd
rootdir = r"//Vitalnew/vital_data/Monthly_Confirmed/SNUH_OR"
for dir, dirs, files in os.walk(rootdir):
    for file in files:
        ipath = '{}/{}'.format(dir, file)
        cmd = 'vital_trks {}'.format(ipath)
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        df = pd.read_csv(io.StringIO(p.stdout.read().decode('utf-8')), comment='#')

        devs = []
        for index, row in df.iterrows():
            if row['tname'] != 'SV':
                continue
            devs.append(row['dname'])

        if not devs:
            continue

        print('{},{}'.format(ipath[len(rootdir)+1:], ','.join(devs)))