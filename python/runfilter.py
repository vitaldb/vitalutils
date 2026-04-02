import os
import vitaldb
import sys
import numpy as np
import io
import importlib

ipath = "https://vitaldb.net/samples/00001.vital"
opath = "g:\\test\\0001.vital"
#mpath = "C:\\Users\\lucid\\AppData\\Roaming\\VitalRecorder\\python\\Lib\\site-packages\\pyvital\\filters\\abp_ppv.py"
mpath = 'ecg_hrv'

if len(sys.argv) > 1:
    ipath = sys.argv[1]
if len(sys.argv) > 2:
    opath = sys.argv[2]
if len(sys.argv) > 3:
    mpath = sys.argv[3]

# if not os.path.exists(ipath) or len(sys.argv) < 2:
#     print('Usage: pythone.exe ' + os.path.basename(sys.argv[0]) + ' INPUT_FILE_PATH OUTPUT_FILE_PATH FILTER_MODULE_PATH')
#     quit()

if os.path.exists(mpath):
    sys.path.insert(0, os.path.dirname(mpath))
    modname = os.path.basename(mpath)[:-3]
else:  # 경로는 아니다
    if mpath.lower().endswith('.py'):
        mpath = os.path.basename(mpath)[:-3]
    if mpath.find('.') == -1:
        mpath = 'pyvital.filters.' + mpath
    modname = mpath

#f = importlib.import_module(modname)
import pyvital.filters.ecg_hrv as f

if f.cfg['interval'] < f.cfg['overlap']:
    f.cfg['overlap'] = 0

# read input file
vf = vitaldb.VitalFile(ipath)
if hasattr(vf, 'run_filter'):
    vf.run_filter(f.run, f.cfg)
else:
    # find input tracks
    track_names = []  # input 의 트랙명을 순서대로 저장
    srate = 0
    last_dtname = 0
    for inp in f.cfg['inputs']:
        matched_dtname = None
        for dtname, trk in vf.trks.items():  # find track
            if (inp['type'].lower() == 'wav') and (trk.type != 1):
                continue
            if (inp['type'].lower() == 'num') and (trk.type != 2):
                continue
            if (inp['type'].lower() == 'str') and (trk.type != 5):
                continue
            if trk.name.lower().startswith(inp['name'].lower()) or\
                (inp['name'].lower()[:3] == 'art') and (trk.name.lower().startswith('abp' + inp['name'].lower()[3:])) or \
                (inp['name'].lower()[:3] == 'abp') and (trk.name.lower().startswith('art' + inp['name'].lower()[3:])):
                matched_dtname = trk.dtname
                if trk.srate:
                    if srate < trk.srate:
                        srate = trk.srate
                last_dtname = dtname
                break
        if not matched_dtname:
            print(inp['name'] + ' not found')
            quit()
        track_names.append(matched_dtname)

    if srate == 0:
        srate = 100

    # extract samples
    vals = vf.to_numpy(track_names, 1 / srate).flatten()

    # run filter
    import numpy as np
    output_recs = []
    for output in f.cfg['outputs']:
        output_recs.append([])

    for dtstart_seg in np.arange(vf.dtstart, vf.dtend, f.cfg['interval'] - f.cfg['overlap']):
        dtend_seg = dtstart_seg + f.cfg['interval']
        idx_dtstart = int((dtstart_seg - vf.dtstart) * srate)
        idx_dtend = int((dtend_seg - vf.dtstart) * srate)
        outputs = f.run({f.cfg['inputs'][0]['name']: {'srate':srate, 'vals': vals[idx_dtstart:idx_dtend]}}, {}, f.cfg)
        if outputs is None:
            continue
        for i in range(len(f.cfg['outputs'])):
            output = outputs[i]
            for rec in output:  # convert relative time to absolute time
                rec['dt'] += dtstart_seg
                output_recs[i].append(rec)

    # add output tracks
    for i in range(len(f.cfg['outputs'])):
        dtname = f.cfg['outputs'][i]['name']
        vf.add_track(dtname, output_recs[i], after=last_dtname)
        last_dtname = dtname

# save to vital file
odir = os.path.dirname(opath)
if not os.path.exists(odir):
    os.makedirs(odir)
vf.to_vital(opath)
