import vitalfile
import arr
import numpy as np

class Histogram:
    def __init__(self, minval=0, maxval=100, resolution=1000):
        self.minval = minval
        self.maxval = maxval
        self.bins = [0] * resolution
        self.total = 0

    def getbin(self, v):
        if v < self.minval:
            return 0
        if v > self.maxval:
            return self.bins[-1]
        bin = int((v-self.minval) / (self.maxval - self.minval) * len(self.bins))
        if bin >= len(self.bins):
            return len(self.bins) - 1
        return bin

    def learn(self, v):
        """
        add tnew data
        """
        bin = self.getbin(v)
        self.bins[bin] += 1
        self.total += 1

    # minimum value -> 0, maximum value -> 1
    def percentile(self, v):
        if self.total == 0:
            return 0
        # number of values less than the value
        cnt = 0
        bin = self.getbin(v)
        for i in range(bin):
            cnt += self.bins[i]
        return cnt / self.total * 100


# filter should be called sequentially
hist_ppga = Histogram(0, 15, 1000)
hist_hbi = Histogram(240, 2000, 1000)  # HR 30-250 --> HBI 240-2000

hbis = []
ppgas = []

import os
idir = r'C:\Users\lucid80\Desktop\SPI_PLETH'
#odir = r'C:\Users\lucid80\Desktop\SPI_PLETH'
filenames = os.listdir(idir)
for filename in filenames:
    print(filename)
    ipath = os.path.join(idir, filename)
    vit = vitalfile.VitalFile(ipath, ['SPI', 'PLETH'])
    vals = vit.get_samples('PLETH')
    srate = 100
    for istart in range(0, len(vals), 60*srate):
        data = vals[istart:istart+60*srate]
        try:
            minlist, maxlist = arr.detect_peaks(data, 100)  # extract beats
            for i in range(len(maxlist) - 1):
                hbi = (maxlist[i + 1] - maxlist[i]) / srate * 1000
                ppga = data[maxlist[i + 1]] - data[minlist[i]]
                hbis.append(hbi)
                ppgas.append(ppga)
                hist_hbi.learn(hbi)
                hist_ppga.learn(ppga)
        except:
            pass
#   print('{}\t{}\t{}\t{}'.format(np.mean(hbis), np.std(hbis), np.mean(ppgas), np.std(ppgas)))
print(','.join(map(str, hist_hbi.bins)))
print(','.join(map(str, hist_ppga.bins)))


#import scipy.stats as st
#st.norm.cdf()