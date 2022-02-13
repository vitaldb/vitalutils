import numpy as np
import vitaldb

vals = vitaldb.load_trks([
    'eb1e6d9a963d7caab8f00993cd85bf31931b7a32',
    '29cef7b8fe2cc84e69fd143da510949b3c271314',
    '829134dd331e867598f17d81c1b31f5be85dddec'
], 60)
print(vals)
quit()

trks = vitaldb.vital_trks("00001.vital")
print(trks)
quit()

vals = vitaldb.vital_recs("00001.vital", 'SNUADC/ECG_II,Solar 8000M/ST_II', 0.01)
vals = vals[:2000, :]
print(vals)

ecg = vals[:,0]
print(ecg)

st = vals[:,1]
st_valid = st[~np.isnan(st)]
print(st_valid)

import matplotlib.pyplot as plt
plt.plot(np.arange(len(ecg)), ecg)
plt.plot(np.arange(len(st)), st)
plt.show()
