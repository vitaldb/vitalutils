import vitalfile
import os
import shutil

idir = r'\\Vitalnew\snuhor\ex8_note'
for path, dir, files in os.walk(idir):
    for filename in files:
        filepath = "{}/{}".format(path, filename)
        print(filename, end='\t')
        vit = vitalfile.VitalFile(filepath)
        print(int(vit.dtstart))
