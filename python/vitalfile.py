import gzip
import numpy as np
from struct import pack, unpack_from, Struct
from binascii import hexlify as hex

unpack_b = Struct('<b').unpack_from
unpack_w = Struct('<H').unpack_from
unpack_f = Struct('<f').unpack_from
unpack_d = Struct('<d').unpack_from
unpack_dw = Struct('<L').unpack_from
pack_b = Struct('<b').pack
pack_w = Struct('<H').pack
pack_f = Struct('<f').pack
pack_d = Struct('<d').pack
pack_dw = Struct('<L').pack


def unpack_str(buf, pos):
    strlen = unpack_dw(buf, pos)[0]
    pos += 4
    val = buf[pos:pos + strlen].decode('utf-8', 'ignore')
    pos += strlen
    return val, pos


def pack_str(s):
    sutf = s.encode('utf-8')
    return pack_dw(len(sutf)) + sutf


# 4 byte L (unsigned) l (signed)
# 2 byte H (unsigned) h (signed)
# 1 byte B (unsigned) b (signed)
def parse_fmt(fmt):
    if fmt == 1:
        return 'f', 4
    elif fmt == 2:
        return 'd', 8
    elif fmt == 3:
        return 'b', 1
    elif fmt == 4:
        return 'B', 1
    elif fmt == 5:
        return 'h', 2
    elif fmt == 6:
        return 'H', 2
    elif fmt == 7:
        return 'l', 4
    elif fmt == 8:
        return 'L', 4
    return '', 0


class VitalFile:
    def __init__(self, ipath, sels=None):
        self.load_vital(ipath, sels)

    def crop(self, ):
        pass

    def get_samples(self, tname, dname=None, dtstart=None, dtend=None):
        trk = self.find_track(tname, dname)
        if not trk:
            return None
        srate = trk['srate']
        if srate == 0:
            return None
        recs = trk['recs']
        if dtstart is None:
            dtstart = recs[0]['dt']
        if dtend is None:
            dtend = recs[-1]['dt'] + len(recs[-1]['val']) / srate

        nsamp = int(np.ceil((dtend - dtstart) * srate))
        ret = np.empty((nsamp, ), np.float32)
        ret.fill(np.nan)

        # 실제 샘플을 가져와 채움
        for rec in recs:
            sidx = int(np.ceil((rec['dt'] - dtstart) * srate))
            eidx = sidx + len(rec['val'])
            srecidx = 0
            erecidx = len(rec['val'])
            if sidx < 0:  # dtstart 이전이면
                srecidx -= sidx
                sidx = 0
            if eidx > nsamp:  # dtend 이후이면
                erecidx -= (eidx - nsamp)
                eidx = nsamp
            ret[sidx:eidx] = rec['val'][srecidx:erecidx]

        # gain offset 변환
        ret *= trk['gain']
        ret += trk['offset']

        return ret

    def find_track(self, tname, dname=None):
        did = 0  # did = 0 if dname == ''
        if dname:
            for dev in self.devs.values():
                if dname == dev['name']:
                    did = dev['did']
                    break
        for trk in self.trks.values():  # find event track
            if trk['name'] == tname:
                if dname is not None:
                    if did != trk['did']:
                        continue
                return trk
        return None

    def save_vital(self, ipath, compresslevel=1):
        f = gzip.GzipFile(ipath, 'wb', compresslevel=compresslevel)

        # save header
        if not f.write(b'VITA'):  # check sign
            return False
        if not f.write(pack_dw(3)):  # version
            return False
        if not f.write(pack_w(10)):  # header len
            return False
        if not f.write(self.header):  # save header
            return False

        # save devinfos
        for did, dev in self.devs.items():
            if did == 0: continue
            ddata = pack_dw(did) + pack_str(dev['name']) + pack_str(dev['type']) + pack_str(dev['port'])
            if not f.write(pack_b(9) + pack_dw(len(ddata)) + ddata):
                return False

        # save trkinfos
        for tid, trk in self.trks.items():
            ti = pack_w(tid) + pack_b(trk['type']) + pack_b(trk['fmt']) + pack_str(trk['name']) \
                + pack_str(trk['unit']) + pack_f(trk['mindisp']) + pack_f(trk['maxdisp']) \
                + pack_dw(trk['col']) + pack_f(trk['srate']) + pack_d(trk['gain']) + pack_d(trk['offset']) \
                + pack_b(trk['montype']) + pack_dw(trk['did'])
            if not f.write(pack_b(0) + pack_dw(len(ti)) + ti):
                return False

            # save recs
            for rec in trk['recs']:
                rdata = pack_w(10) + pack_d(rec['dt']) + pack_w(tid)  # infolen + dt + tid (= 12 bytes)
                if trk['type'] == 1:  # wav
                    rdata += pack_dw(len(rec['val'])) + rec['val'].tobytes()
                elif trk['type'] == 2:  # num
                    fmtcode, fmtlen = parse_fmt(trk['fmt'])
                    rdata += pack(fmtcode, rec['val'])
                elif trk['type'] == 5:  # str
                    rdata += pack_dw(0) + pack_str(rec['val'])

                if not f.write(pack_b(1) + pack_dw(len(rdata)) + rdata):
                    return False

        # save trk order
        if hasattr(self, 'trkorder'):
            cdata = pack_b(5) + pack_w(len(self.trkorder)) + self.trkorder.tobytes()
            if not f.write(pack_b(6) + pack_dw(len(cdata)) + cdata):
                return False

        f.close()
        return True

    def load_vital(self, ipath, sels=None):
        f = gzip.GzipFile(ipath, 'rb')

        # parse header
        if f.read(4) != b'VITA':  # check sign
            return False

        f.read(4)  # version
        buf = f.read(2)
        if buf == b'':
            return False

        headerlen = unpack_w(buf, 0)[0]
        self.header = f.read(headerlen)  # skip header

        # parse body
        self.devs = {0: {}}  # device names. did = 0 represents the vital recorder
        self.trks = {}
        self.dtstart = 4000000000  # 2100
        self.dtend = 0
        try:
            selids = set()
            while True:
                buf = f.read(5)
                if buf == b'':
                    break
                pos = 0

                type = unpack_b(buf, pos)[0]; pos += 1
                datalen = unpack_dw(buf, pos)[0]; pos += 4

                buf = f.read(datalen)
                if buf == b'':
                    break
                pos = 0

                if type == 9:  # devinfo
                    did = unpack_dw(buf, pos)[0]; pos += 4
                    type, pos = unpack_str(buf, pos)
                    name, pos = unpack_str(buf, pos)
                    port, pos = unpack_str(buf, pos)
                    self.devs[did] = {'name': name, 'type': type, 'port': port}
                elif type == 0:  # trkinfo
                    did = col = 0
                    montype = unit = ''
                    gain = offset = srate = mindisp = maxdisp = 0.0
                    tid = unpack_w(buf, pos)[0]; pos += 2
                    type = unpack_b(buf, pos)[0]; pos += 1
                    fmt = unpack_b(buf, pos)[0]; pos += 1
                    name, pos = unpack_str(buf, pos)
                    if sels is not None and name not in sels:
                        continue
                    selids.add(tid)
                    if sels is not None:
                        sels.remove(name)
                    if datalen > pos:
                        unit, pos = unpack_str(buf, pos)
                    if datalen > pos:
                        mindisp = unpack_f(buf, pos)[0]
                        pos += 4
                    if datalen > pos:
                        maxdisp = unpack_f(buf, pos)[0]
                        pos += 4
                    if datalen > pos:
                        col = unpack_dw(buf, pos)[0]
                        pos += 4
                    if datalen > pos:
                        srate = unpack_f(buf, pos)[0]
                        pos += 4
                    if datalen > pos:
                        gain = unpack_d(buf, pos)[0]
                        pos += 8
                    if datalen > pos:
                        offset = unpack_d(buf, pos)[0]
                        pos += 8
                    if datalen > pos:
                        montype = unpack_b(buf, pos)[0]
                        pos += 1
                    if datalen > pos:
                        did = unpack_dw(buf, pos)[0]
                        pos += 4
                    if not did:
                        if did not in self.devs:
                            continue
                    self.trks[tid] = {'name': name, 'type': type, 'fmt': fmt, 'unit': unit, 'srate': srate,
                                      'mindisp': mindisp, 'maxdisp': maxdisp, 'col': col, 'montype': montype,
                                      'gain': gain, 'offset': offset, 'did': did, 'recs': []}
                elif type == 1:  # rec
                    infolen = unpack_w(buf, pos)[0]; pos += 2
                    dt = unpack_d(buf, pos)[0]; pos += 8
                    tid = unpack_w(buf, pos)[0]; pos += 2
                    pos = 2 + infolen

                    if dt < self.dtstart:
                        self.dtstart = dt
                    if dt < self.dtend:
                        self.dtend = dt

                    if tid not in self.trks:
                        continue

                    trk = self.trks[tid]
                    if tid not in selids:
                        continue

                    fmtlen = 4
                    # gain, offset 변환은 하지 않은 raw data 상태로만 로딩한다.
                    # 항상 이 변환이 필요하지 않기 때문에 변환은 get_samples 에서 나중에 한다.
                    if trk['type'] == 1:  # wav
                        fmtcode, fmtlen = parse_fmt(trk['fmt'])
                        nsamp = unpack_dw(buf, pos)[0]; pos += 4
                        samps = np.ndarray((nsamp,), buffer=buf, offset=pos, dtype=np.dtype(fmtcode)); pos += nsamp * fmtlen
                        trk['recs'].append({'dt': dt, 'val': samps})
                    elif trk['type'] == 2:  # num
                        fmtcode, fmtlen = parse_fmt(trk['fmt'])
                        val = unpack_from(fmtcode, buf, pos)[0]; pos += fmtlen
                        trk['recs'].append({'dt': dt, 'val': val})
                    elif trk['type'] == 5:  # str
                        pos += 4  # skip
                        str, pos = unpack_str(buf, pos)
                        trk['recs'].append({'dt': dt, 'val': str})
                elif type == 6:  # cmd
                    cmd = unpack_b(buf, pos)[0]; pos += 1
                    if cmd == 6:  # reset events
                        evt_trk = self.find_track('EVENT', '')
                        if evt_trk:
                            evt_trk['recs'] = []
                    elif cmd == 5:  # trk order
                        cnt = unpack_w(buf, pos)[0]; pos += 2
                        self.trkorder = np.ndarray((cnt,), buffer=buf, offset=pos, dtype=np.dtype('H')); pos += cnt * 2

        except EOFError:
            pass

        # sorting tracks
        for trk in self.trks.values():
            trk['recs'].sort(key=lambda r:r['dt'])

        f.close()
        return True


# example
#print(load_vital("1.vital", ['ECG']))

# import cProfile
# cProfile.run('VitalFile("1.vital")')

# vit = VitalFile("1.vital")
# vals = vit.get_samples("ECG")
#
# import matplotlib.pyplot as plt
# plt.plot(vals)
# plt.show()
