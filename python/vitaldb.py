import numpy as np
import pandas as pd
import os
import requests
import pickle

def load_vital(tnames, caseids=[], interval=1, maxcases=10, cachedir='__trks__'):
    """
    최대 maxcases 개 case에서 tnames에 지정된 트랙들을 읽어서 리턴한다.

    다운로드 된 트랙 csv 파일들은 cachedir 디렉토리에 저장된다.

    리턴 값 : {
        caseid1 : {
            tnames[0] : values of tnames[0],
            tnames[1] : samples of tnames[1],
            ...
            tnames[n] : samples of tnames[n],
        },
        caseid2 : {
            tnames[0] : values of tnames[0],
            tnames[1] : samples of tnames[1],
            ...
            tnames[n] : samples of tnames[n],
        },
        ...
    }

    values는 np.array 타입이며 case 길이 / interval 개의 행을 가진다. 데이터 타입 (dtype) 은 wave와 numeric은 float32 형이고 string 은 파이선 문자열 (object 형)이다.

    결측값은 np.nan로 채워진다.


    """
    if not isinstance(tnames, list):
        if isinstance(tnames, str):
            tnames = tnames.split(',')
        else:
            return None

    if interval == 0:
        return None

    # create cache folder
    if not os.path.exists(cachedir):
        os.mkdir(cachedir)
    
    # load track list
    cachepath = cachedir + "/trks.cache"
    if not os.path.exists(cachepath):
        trks = {}
        try:
            print('downloading track list...', end='', flush=True)
            trks = pd.read_csv("https://api.vitaldb.net/trks", dtype=str, compression='gzip')
            print('done')
        except Exception as e:
            print(e)
            return None
    
        # collect tracks by cases
        print('parsing tracks...', end='', flush=True)
        cases = {}
        for ___, trk in trks.iterrows():
            caseid = int(trk['caseid'])
            if caseid not in cases:
                cases[caseid] = {}
            cases[caseid][trk['tname']] = trk
        print('done')

        with open(cachepath, 'wb') as f:
            pickle.dump(cases, f)
    else:
        print('loading track list...', end='', flush=True)
        with open(cachepath, 'rb') as f:
            cases = pickle.load(f)
        print('done')

    # filter cases which don't have all tnames
    if len(caseids) == 0:
        print('filter cases...', end='', flush=True)
        for caseid, trks in cases.items():
            not_exist = False
            for tname in tnames:
                if tname not in trks:
                    not_exist = True
                    break
            if not_exist:
                continue
            caseids.append(caseid)
            if len(caseids) >= maxcases:
                break
        print('done')

    # download tracks
    ret = {}
    for caseid in caseids:
        ret[caseid] = {}
        trkdata = {}
        trkends = []
        for tname in tnames:
            url = "https://api.vitaldb.net/trks/" + cases[caseid][tname]['tid']
            cachepath = cachedir + "/" + os.path.basename(url)
            if not os.path.exists(cachepath):
                try:
                    print('downloading {} for {}/{}...'.format(url, caseid, tname), end='', flush=True)
                    with open(cachepath, "wb") as f:
                        f.write(requests.get(url).content)
                    print('done')
                except Exception as e:
                    continue

            ttype = cases[caseid][tname]['ttype']
            if ttype == 'W':
                try:
                    vals = pd.read_csv(cachepath, header=None, dtype=float).values.flatten() * float(cases[caseid][tname]['gain']) + float(cases[caseid][tname]['bias'])
                except Exception as e:
                    continue

                trkdata[tname] = vals
                srate = float(cases[caseid][tname]['srate'])
                if srate > 0:
                    trkends.append(vals.shape[0] / srate)
            elif ttype == 'N':
                try:
                    vals = pd.read_csv(cachepath, header=None, dtype=float).values
                except Exception as e:
                    continue

                trkends.append(vals[-1,0])
                trkdata[tname] = vals
            elif ttype == 'S':
                try:
                    vals = pd.read_csv(cachepath, header=None, dtype=str).values
                except Exception as e:
                    continue

                trkends.append(float(vals[-1,0]))
                trkdata[tname] = vals

        # define caseend and caselen
        caseend = max(trkends)
        caselen = int(caseend / interval) + 1

        # create return object from trkdata
        for tname in tnames:
            ttype = cases[caseid][tname]['ttype']
            if ttype == 'W':
                srate = float(cases[caseid][tname]['srate'])
                if srate != 1 / interval: # resample
                    vals = np.take(trkdata[tname].flatten(), np.linspace(0, len(trkdata[tname])-0.01, caselen, dtype=int))
                if len(vals) < caselen:
                    vals.extend(np.full(caselen - len(vals), np.nan))
            elif ttype == 'N':
                vals = np.full(caselen, np.nan, dtype=float)
                vals[(trkdata[tname][:,0] / interval).astype(int)] = trkdata[tname][:,1]
            elif ttype == 'S':
                vals = np.full(caselen, '', dtype=object)
                vals[(trkdata[tname][:,0].astype(float) / interval).astype(int)] = trkdata[tname][:,1]
            else:
                vals = np.full(caselen, np.nan)

            ret[caseid][tname] = vals
    
    return ret
