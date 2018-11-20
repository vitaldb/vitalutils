import io
import subprocess
import pandas as pd

ipath = "1.vital"
interval = 1
p = subprocess.Popen('vital_recs.exe -h "{}" {}'.format(ipath, interval), stdout=subprocess.PIPE)
df = pd.read_csv(io.StringIO(p.stdout.read().decode('utf-8')), index_col=0)
print(df)