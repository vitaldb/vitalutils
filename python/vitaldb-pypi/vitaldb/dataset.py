import warnings

import numpy as np
import pandas as pd

# open dataset trks
api_url = "https://api.vitaldb.net"
# Open-dataset vital-file version served under a versioned prefix
# (https://api.vitaldb.net/<DATASET_VERSION>/<caseid>.vital). The legacy
# unversioned path (https://api.vitaldb.net/<caseid>.vital) is kept intact
# for backward compatibility; new library versions request the versioned,
# packed files which are smaller and stream a single track efficiently.
DATASET_VERSION = "1.0.1"
dftrks = None
dfci = None
dflabs = None

def load_clinical_data(caseids=[], params=[]):
    """Load clinical information for the specified caseIDs and specified parameters into a dataframe.

    Parameters:
        caseids (list, optional): caseIDs from 1 to 6388. Defaults to [], which returns clinical information of all caseID.
        params (list, optional): parameter list to filter clinical information. Please refer to "Parameter List" section from vitaldb.net/dataset Overview

    Returns:
        Dataframe: clinical information.
    """
    global dfci
    if dfci is None:
        dfci = pd.read_csv(f"{api_url}/cases")
    
    res = None
    if not caseids:
        res = dfci
    res = dfci[dfci["caseid"].isin(caseids)]
    if params:
        existing_params = [param for param in params if param in dfci.columns]
        res = res[existing_params]
    return res

def load_lab_data(caseids=[], params=[]):
    """Load lab results for the specified caseIDs and specified parameters into a dataframe.

    Parameters:
        caseids (list, optional): caseIDs from 1 to 6388. Defaults to [], which returns lab results of all caseID.
        params (list, optional): parameter list to filter lab results. Please refer to "Parameter List" section from vitaldb.net/dataset Overview

    Returns:
        Dataframe: lab results
    """
    global dflabs
    if dflabs is None:
        dflabs = pd.read_csv(f"{api_url}/labs")
    
    res = None
    if not caseids:
        res = dflabs
    res = dflabs[dflabs["caseid"].isin(caseids)]
    if params:
        existing_params = [param for param in params if param in dfci.columns]
        res = res[existing_params]
    return res

def load_trk(tid, interval=1):
    warnings.warn(
        "load_trk()/the per-track CSV API is deprecated; use "
        "vitaldb.load_case(caseid, track_names) or VitalFile, which read the "
        "packed .vital file. The CSV track endpoints may be removed in a "
        "future release.",
        DeprecationWarning, stacklevel=2)
    if isinstance(tid, list) or isinstance(tid, set) or isinstance(tid, tuple):
        return load_trks(tid, interval)
    return _load_trk_nowarn(tid, interval)


def _load_trk_nowarn(tid, interval=1):
    try:
        url = f"{api_url}/{tid}"
        dtvals = pd.read_csv(url, na_values='-nan(ind)', dtype=np.float32).values
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
    warnings.warn(
        "load_trks()/the per-track CSV API is deprecated; use "
        "vitaldb.load_case(caseid, track_names) or VitalFile, which read the "
        "packed .vital file. The CSV track endpoints may be removed in a "
        "future release.",
        DeprecationWarning, stacklevel=2)
    trks = []
    maxlen = 0
    for tid in tids:
        if tid:
            trk = _load_trk_nowarn(tid, interval)
            trks.append(trk)
            if len(trk) > maxlen:
                maxlen = len(trk)
        else:
            trks.append(None)

    if maxlen == 0:
        return np.empty(0)

    ret = np.full((maxlen, len(tids)), np.nan)  # create a dense array

    for i in range(len(tids)):  # copy values
        if trks[i] is not None:
            ret[:len(trks[i]), i] = trks[i]

    return ret

def get_track_names(caseids=[]):
    """Return a list of track names of the specified caseIDs

    Parameters:
        caseids (list, optional): caseIDs from 1 to 6388. Defaults to [], which returns track names of all caseID.

    Returns:
        Dataframe: track names by caseID
    """
    warnings.warn(
        "get_track_names() relies on the per-track 'trks' index, which is "
        "deprecated. Track names are available from the .vital file via "
        "VitalFile(caseid).get_track_names(). The trks index may be removed "
        "in a future release.",
        DeprecationWarning, stacklevel=2)
    global dftrks
    if dftrks is None:
        dftrks = pd.read_csv(f"{api_url}/trks")

    return dftrks[dftrks['caseid'].isin(caseids)].groupby('caseid')["tname"].apply(list).reset_index(name="tnames")

def find_cases(track_names):
    """Return a list of caseID for cases with the given tracklist.

    Parameters:
        track_names (list or string): a list of track names or a string with track names separated by comma

    Returns:
        List: caseIDs
    """
    warnings.warn(
        "find_cases() relies on the per-track 'trks' index, which is "
        "deprecated and may be removed in a future release.",
        DeprecationWarning, stacklevel=2)
    global dftrks
    if dftrks is None:
        dftrks = pd.read_csv(f"{api_url}/trks")

    if isinstance(track_names, str):
        if track_names.find(','):
            track_names = track_names.split(',')
        else:
            track_names = [track_names]

    return list(set.intersection(*[set(dftrks.loc[dftrks['tname'].str.endswith(dtname), 'caseid']) for dtname in track_names]))

def load_case(caseid, track_names, interval=1):
    """Load case data with the given track names in a 2D numpy array. Row by time and Column by track.

    Reads the case's packed ``.vital`` file directly from the versioned
    open-dataset path (https://api.vitaldb.net/<DATASET_VERSION>/<caseid>.vital).
    The ``.vital`` file is the authoritative source: all tracks share one
    timeline, so samples are correctly aligned in absolute time. (The older
    per-track CSV API could be shifted by a per-case constant relative to
    the recording, which is why this now reads the vital file.)

    Parameters:
        caseid (int): caseID from 1 to 6388
        track_names (list or string):  a list of track names or a string with track names separated by comma
        interval (int, optional): time interval (= 1 / sample rate). Defaults to 1.

    Returns:
        ndarray: 2D numpy array. Row by time and Column by track.
    """
    from .utils import VitalFile

    if not caseid:
        return None

    if isinstance(track_names, str):
        if ',' in track_names:
            track_names = track_names.split(',')
        else:
            track_names = [track_names]

    vf = VitalFile(f"{api_url}/{DATASET_VERSION}/{caseid}.vital", track_names)
    return vf.to_numpy(track_names, interval)


if __name__ == '__main__':
    # print(get_track_names([858, 859, 560]))
    # quit()
    # vals = load_case(858, ['SNUADC/ECG_II', 'SNUADC/PLETH', 'BIS/EEG1_WAV', 'BIS/BIS'], 1/100)
    # print(type(vals))
    ci = load_clinical_data()
    print(ci)
    # labs = load_lab_data([858, 859])
    # print(labs)
    # quit()

    caseids = find_cases('ECG_II,PLETH')
    print(type(caseids))
    quit()
    
    # vals = load_case(1, ['ECG_II', 'ART'])
    # print(vals)
    # quit()
    # vals = load_trks([
    #     'eb1e6d9a963d7caab8f00993cd85bf31931b7a32',
    #     '29cef7b8fe2cc84e69fd143da510949b3c271314',
    #     '829134dd331e867598f17d81c1b31f5be85dddec'
    # ], 60)
    # print(vals)