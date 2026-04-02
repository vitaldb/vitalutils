import urllib.request
from joblib import Parallel, delayed

def download(caseid):
    url = f'https://api.vitaldb.net/{caseid}.vital'
    print(url)
    urllib.request.urlretrieve(url, f'{caseid}.vital')

Parallel(-1)(delayed(download)(caseid) for caseid in range(1,6389))
