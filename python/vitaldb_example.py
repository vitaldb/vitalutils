import matplotlib.pyplot as plt
import vitaldb

cases = vitaldb.load_vital('SNUADC/ART,Solar8000/ART_SBP,Solar8000/ART_DBP,Solar8000/ART_MBP,Solar8000/CVP_MBP', interval=1/100, maxcases=10)

for caseid, case in cases.items():
    plt.figure(figsize=(20, 5))
    plt.plot(case['SNUADC/ART'][:500])
    plt.savefig('{}.png'.format(caseid))
