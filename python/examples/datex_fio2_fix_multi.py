import os
import vitaldb
from multiprocessing import Pool

IDIR = r'.'

def fixit(filepath):
    print(filepath)
    TRACK_NAME = 'Datex-Ohmeda/FIO2'
    vf = vitaldb.VitalFile(filepath, skip_records=True)
    changed = False
    if TRACK_NAME in vf.trks:
        vf = vitaldb.VitalFile(filepath)
        newrecs = []
        for rec in vf.trks[TRACK_NAME].recs:
            if 20 < rec['val'] < 110:
                newrecs.append(rec)
            else:
                changed = True
        vf.trks[TRACK_NAME].recs = newrecs
        
    if not changed:
        return

    temppath = filepath + '.fixed'
    if vf.to_vital(temppath):
        os.remove(filepath)
        os.rename(temppath, filepath)

if __name__ == '__main__':
    filelist = []
    print('Scanning files')
    for root, dirnames, filenames in os.walk(IDIR):
        for filename in filenames:
            filepath = os.path.join(root, filename)
            if not filepath.lower().endswith('.vital'):
                continue
            filelist.append(filepath)
            if len(filelist) % 1000 == 0:
                print(f'{len(filelist)} files found')
    print(f'{len(filelist)} files found')
    Pool().map(fixit, filelist)
