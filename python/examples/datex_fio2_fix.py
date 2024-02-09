import vitaldb
import os

IDIR = r'.'

for root, dirnames, filenames in os.walk(IDIR):
    for filename in filenames:
        filepath = os.path.join(root, filename)
        if not filepath.lower().endswith('.vital'):
            continue
        print(f'Reading {filepath}...', end='')
        vf = vitaldb.VitalFile(filepath)
        newrecs = []
        print('Fixing...', end='')
        for rec in vf.trks['Datex-Ohmeda/FIO2'].recs:
            if 20 < rec['val'] < 110:
                newrecs.append(rec)
        vf.trks['Datex-Ohmeda/FIO2'].recs = newrecs
        print('Saving...', end='')
        temppath = filepath + '.fixed'
        if vf.to_vital(temppath, compresslevel=1):
            os.remove(filepath)
            os.rename(temppath, filepath)
        print('Done')
