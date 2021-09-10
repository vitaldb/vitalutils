import numpy as np
import pandas as pd

def load_trk(tid, interval=1):
    if isinstance(tid, list) or isinstance(tid, set) or isinstance(tid, tuple):
        return load_trks(tid, interval)

    try:
        url = 'https://api.vitaldb.net/' + tid
        dtvals = pd.read_csv(url, na_values='-nan(ind)').values
    except:
        return np.empty(0)

    if len(dtvals) == 0:
        return np.empty(0)
    
    dtvals[:,0] /= interval  # convert time to row
    nsamp = int(np.nanmax(dtvals[:,0])) + 1  # find maximum index (array length)
    ret = np.full(nsamp, np.nan)  # create a dense array
    
    if np.isnan(dtvals[:,0]).any():  # wave track
        if nsamp != len(dtvals):  # resample
            ret = np.take(dtvals[:,1], np.linspace(0, len(dtvals) - 1, nsamp).astype(np.int64))
        else:
            ret = dtvals[:,1]
    else:  # numeric track
        for idx, val in dtvals:  # copy values
            ret[int(idx)] = val

    return ret


def load_trks(tids, interval=1):
    trks = []
    maxlen = 0
    for tid in tids:
        trk = load_trk(tid, interval)
        trks.append(trk)
        if len(trk) > maxlen:
            maxlen = len(trk)
    if maxlen == 0:
        return np.empty(0)
    ret = np.full((maxlen, len(tids)), np.nan)  # create a dense array
    for i in range(len(tids)):  # copy values
        ret[:len(trks[i]), i] = trks[i]
    return ret


# open dataset trks
dftrks = None

def load_case(caseid, tnames, interval=1):
    global dftrks

    if not caseid:
        return None
    if dftrks is None:
        dftrks = pd.read_csv("https://api.vitaldb.net/trks")

    tids = []
    for tname in tnames:
        tid = dftrks[(dftrks['caseid'] == caseid) & (dftrks['tname'] == tname)]['tid'].values[0]
        tids.append(tid)
    
    return load_trks(tids, interval)


if __name__ == '__main__':
    vals = load_trks([
        'eb1e6d9a963d7caab8f00993cd85bf31931b7a32',
        '29cef7b8fe2cc84e69fd143da510949b3c271314',
        '829134dd331e867598f17d81c1b31f5be85dddec'
    ], 60)
    print(vals)