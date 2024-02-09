import csv
import subprocess

ipath = "1.vital"
interval = 1
p = subprocess.Popen('vital_recs.exe -h "{}" {}'.format(ipath, interval), stdout=subprocess.PIPE)
output = p.communicate()[0].decode("utf-8")
for row in csv.reader(output.splitlines()):
    print(row)
