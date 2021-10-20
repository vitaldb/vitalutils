import requests
import json
import gzip
import os

API_URL = "https://vitaldb.net/api/"

access_token = None

def login(id, pw):
    global access_token
    # request an access token to use VitalDB API
    res = requests.post(API_URL + "login", params={"id":id, "pw":pw})
    if 200 != res.status_code:
        return False
    access_token = json.loads(res.content)["access_token"]  # get the token from response
    return True


# request file list
# bedname = "TEST"
# startdate = "2021-08-01"
# enddate = "2021-08-31"
def filelist(bedname=None, startdate=None, enddate=None):
    global access_token
    pars = {"access_token": access_token}
    if bedname:
        pars['bedname'] = bedname
    if startdate:
        pars['startdate'] = startdate
    if enddate:
        pars['enddate'] = enddate
    res = requests.get(API_URL + "filelist", params=pars)
    if 200 != res.status_code:
        return []
    return json.loads(gzip.decompress(res.content))


# request file download
def download(fileid, localpath):
    global access_token
    res = requests.get(API_URL + "download", params={"access_token":access_token, "filename": fileid})
    if 200 != res.status_code:
        return False
    with open(localpath, "wb") as f:
        f.write(res.content)
    return True


if __name__ == '__main__':
    # path to save downloaded files
    DOWNLOAD_DIR = "Download"
    if not os.path.exists(DOWNLOAD_DIR):
        os.mkdir(DOWNLOAD_DIR)

    # issue access token
    if login(id="vitaldb_test", pw="vitaldb_test"):
        files = filelist()
        for f in files:
            print("Downloading: " + f['filename'], end='...', flush=True)
            opath = DOWNLOAD_DIR + '/' + f['filename']
            if os.path.isfile(opath): # check if file exists
                if os.stat(opath).st_size == int(f['filesize']):
                    print('already done')
                    continue
                #os.utime(opath, (mtime, mtime))
            download(f['fileid'], opath)
            print('done')
