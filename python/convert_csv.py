import os

idir = "D:/Research/VitalDB/r2_deid_research"

odir = idir + "_csv"
if not os.path.exists(odir):
    os.makedirs(odir)
for dirname, dirs, files in os.walk(idir):
    for filename in files:
        ipath = '{}/{}'.format(dirname, filename)
        opath_trk = '{}/{}.trk.csv'.format(odir, filename)
        opath_num = '{}/{}.num.csv'.format(odir, filename)

        if os.path.exists(opath_trk):
            continue

        # touch file
        open(opath_trk, 'w').close()

        # run vital_csv synchronously
        cmd = 'vital_csv "{}" "{}"'.format(ipath, odir)
        print(cmd + "... ", end='')
        if os.system(cmd) != 0:
            print("error")
        else:
            print('done')
