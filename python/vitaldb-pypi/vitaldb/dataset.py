import numpy as np
import pandas as pd

# open dataset trks
api_url = "https://api.vitaldb.net"
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
    if isinstance(tid, list) or isinstance(tid, set) or isinstance(tid, tuple):
        return load_trks(tid, interval)

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
    trks = []
    maxlen = 0
    for tid in tids:
        if tid:
            trk = load_trk(tid, interval)
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

    Parameters:
        caseid (int): caseID from 1 to 6388
        track_names (list or string):  a list of track names or a string with track names separated by comma
        interval (int, optional): time interval (= 1 / sample rate). Defaults to 1.

    Returns:
        ndarray: 2D numpy array. Row by time and Column by track. 
    """
    global dftrks

    if not caseid:
        return None

    if dftrks is None:
        dftrks = pd.read_csv(f"{api_url}/trks")

    if isinstance(track_names, str):
        if track_names.find(','):
            track_names = track_names.split(',')
        else:
            track_names = [track_names]

    tids = []
    for dtname in track_names:
        tid_values = dftrks.loc[(dftrks['caseid'] == caseid) & (dftrks['tname'].str.endswith(dtname)), 'tid'].values
        if len(tid_values):
            tids.append(tid_values[0])
        else:
            tids.append(None)
    
    return load_trks(tids, interval)


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