import datetime
import requests
import json
import gzip
import os

API_URL = None
access_token = None

def setserver(ip, port=None, secure=False):
    global API_URL
    if ip is None:
        return False
    
    internet_protocol = ["http", "https"]
    API_URL = internet_protocol[int(secure)] + "://" + ip
    if port != None:
        API_URL += ":" + str(port)
    API_URL += "/api/"
        
    return True

def login(id, pw, host=None, port=None):
    global access_token

    if host is None:
        host = 'vitaldb.net'
        port = 443
    elif port is None:
        port = 80
        
    setserver(host, port, port==443)

    # request an access token to use VitalDB API
    res = requests.post(API_URL + "login", params={"id":id, "pw":pw})
    if 200 != res.status_code:
        return False
    access_token = json.loads(res.content)["access_token"]  # get the token from response

    return True

'''def to_timestamp(dt):
    if isinstance(dt, str):
        defstr = '2000-01-01 00:00:00'
        if len(dt) < len(defstr):
            dt += defstr[len(dt):]
        dt = datetime.datetime.strptime(dt, "%Y-%m-%d %H:%M:%S")
    if isinstance(dt, datetime.datetime):
        dt = dt.timestamp()
    return dt'''

# request file list
# bedname = "TEST"
# startdate = "2021-08-01"
# enddate = "2021-08-31"
def filelist(bedname=None, dtstart=None, dtend=None, hid=None, notimestamp=None, unixtimestamp=None):
    global access_token
    if access_token is None:
        raise Exception('Please login first')

    pars = {"access_token": access_token}
    if bedname:
        if isinstance(bedname, (list, set, tuple)):
            bedname = ','.join(bedname)
        pars['bedname'] = bedname
    #dtstart = to_timestamp(dtstart)
    #dtend = to_timestamp(dtend)
    if dtstart:
        pars['dtstart'] = dtstart
    if dtend:
        pars['dtend'] = dtend
    if hid:
        pars['hid'] = 1
    if notimestamp:
        pars['notimestamp'] = 1
    if unixtimestamp:
        pars['unixtimestamp'] = 1
    res = requests.get(API_URL + "filelist", params=pars)
    if 200 != res.status_code:
        raise Exception('API Server Error: ' + res.content.decode('utf-8'))
    return json.loads(gzip.decompress(res.content))

def tracklist(bedname=None, dtstart=None, dtend=None):
    global access_token
    if access_token is None:
        raise Exception('Please login first')

    pars = {"access_token": access_token}
    if bedname:
        if isinstance(bedname, (list, set, tuple)):
            bedname = ','.join(bedname)
        pars['bedname'] = bedname
    #dtstart = to_timestamp(dtstart)
    #dtend = to_timestamp(dtend)
    if dtstart:
        pars['dtstart'] = dtstart
    if dtend:
        pars['dtend'] = dtend
    res = requests.get(API_URL + "tracklist", params=pars)
    if 200 != res.status_code:
        raise Exception('API Server Error: ' + res.content.decode('utf-8'))
    return json.loads(gzip.decompress(res.content))

# request file download
# localpath를 안적으면 url만 리턴
def download(filename, localpath=None):
    global access_token
    if access_token is None:
        raise Exception('Please login first')

    asurl = 0
    if localpath is None:
        asurl = 1
    res = requests.get(API_URL + "download", params={"access_token":access_token, "filename": filename, "asurl": asurl})
    if 200 != res.status_code:
        raise Exception('API Server Error: ' + res.content.decode('utf-8'))
    if localpath is None:
        try:
            return res.content.decode('utf-8')
        except UnicodeDecodeError:
            return res.url
    if os.path.isdir(localpath):
        localpath = os.path.join(localpath, filename)
    with open(localpath, "wb") as f:
        f.write(res.content)
    return True


def bedlist():
    global access_token
    if access_token is None:
        raise Exception('Please login first')

    pars = {"access_token": access_token}
    res = requests.get(API_URL + "bedlist", params=pars)
    if 200 != res.status_code:
        raise Exception('API Server Error: ' + res.content.decode('utf-8'))
    if res.headers.get("Content-Encoding") == "gzip":
        data = gzip.decompress(res.content)
    else:
        data = res.content
    return json.loads(data)


def receive(vrcode=None, bedname=None, track_names=None, dtstart=None, dtend=None):
    global access_token
    if access_token is None:
        raise Exception('Please login first')

    if isinstance(dtstart, datetime.datetime):
        dtstart = dtstart.timestamp()
    if isinstance(dtend, datetime.datetime):
        dtend = dtend.timestamp()
    pars = {"access_token": access_token, 'vrcode':vrcode}
    if bedname:
        if isinstance(bedname, (list, set, tuple)):
            bedname = ','.join(bedname)
        pars['bedname'] = bedname
    if track_names:
        if isinstance(track_names, (list, set, tuple)):
            track_names = ','.join(track_names)
        pars['track_names'] = track_names
    if dtstart:
        pars['dtstart'] = dtstart
    if dtend:
        pars['dtend'] = dtend

    res = requests.get(API_URL + "receive", params=pars)
    if 200 != res.status_code:
        raise Exception('API Server Error: ' + res.content.decode('utf-8'))
    return json.loads(gzip.decompress(res.content))


if __name__ == '__main__':
    # path to save downloaded files
    DOWNLOAD_DIR = "Download"
    if not os.path.exists(DOWNLOAD_DIR):
        os.mkdir(DOWNLOAD_DIR)
