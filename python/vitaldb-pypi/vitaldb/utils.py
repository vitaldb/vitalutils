import os
import s3fs
import gzip
import wave
import wfdb
import shutil
import datetime
import tempfile
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from copy import deepcopy
from urllib import parse, request
from struct import pack, unpack_from, Struct


unpack_b = Struct('<b').unpack_from
unpack_w = Struct('<H').unpack_from
unpack_s = Struct('<h').unpack_from
unpack_f = Struct('<f').unpack_from
unpack_d = Struct('<d').unpack_from
unpack_dw = Struct('<L').unpack_from
pack_b = Struct('<b').pack
pack_w = Struct('<H').pack
pack_s = Struct('<h').pack
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


# open dataset trks
dftrks = None

class Device:
    def __init__(self, name, typename='', port=''):
        self.name = name
        if not typename:
            self.type = name
        else:
            self.type = typename
        self.port = port

class Track:
    def __init__(self, name, type=2, col=0xffffff, montype=0, dname='', unit='', fmt=1, srate=0, gain=1.0, offset=0.0, mindisp=0, maxdisp=0, recs=None):
        self.type = type  # 1: wav, 2: num, 5: str
        self.fmt = fmt
        self.name = name
        self.srate = srate
        self.unit = unit
        self.mindisp = mindisp
        self.maxdisp = maxdisp
        self.gain = gain
        self.offset = offset
        self.col = col
        self.montype = montype
        self.dname = dname
        if dname:
            self.dtname = dname + '/' + name
        else:
            self.dtname = name
        if recs is None:
            self.recs = []
        else:
            self.recs = recs

    def _distinct_values(self):
        """Get a list of all distinct values in the track.
        :return: list of distinct values, as a sorted 1D numpy array
        """
        if not self.recs:
            return np.array([])
        def rec_list_values(recs):
            n = len(recs)
            if n == 1:
                return np.unique(recs[0]['val'])
            recs1 = recs[:n//2]
            recs2 = recs[n//2:]
            return np.union1d(rec_list_values(recs1),
                              rec_list_values(recs2))
        return rec_list_values(self.recs)

# 4 byte L (unsigned) l (signed)
# 2 byte H (unsigned) h (signed)
# 1 byte B (unsigned) b (signed)
FMT_TYPE_LEN = {1: ('f', 4), 2: ('d', 8), 3: ('b', 1), 4: ('B', 1), 5: ('h', 2), 6: ('H', 2), 7: ('l', 4), 8: ('L', 4)}

TRACK_INFO = {
    'SNUADC/ART': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': 4294901760}, 
    'SNUADC/ECG_II': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': 4278255360}, 
    'SNUADC/ECG_V5': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': 4278255360}, 
    'SNUADC/PLETH': {'srate': 500.0, 'maxdisp': 100.0, 'col': 4287090426}, 
    'SNUADC/CVP': {'unit': 'cmH2O', 'srate': 500.0, 'maxdisp': 30.0, 'col': 4294944000}, 
    'SNUADC/FEM': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': 4294901760}, 

    'SNUADCM/ART': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': 4294901760}, 
    'SNUADCM/ECG_II': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': 4278255360}, 
    'SNUADCM/ECG_V5': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': 4278255360}, 
    'SNUADCM/PLETH': {'srate': 500.0, 'maxdisp': 100.0, 'col': 4287090426}, 
    'SNUADCM/CVP': {'unit': 'cmH2O', 'srate': 500.0, 'maxdisp': 30.0, 'col': 4294944000}, 
    'SNUADCM/FEM': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': 4294901760}, 

    'Solar8000/HR': {'unit': '/min', 'mindisp': 30.0, 'maxdisp': 150.0, 'col': 4278255360}, 
    'Solar8000/ST_I': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ST_II': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ST_III': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ST_AVL': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ST_AVR': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ST_AVF': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/ART_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/ART_SBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/ART_DBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/PLETH_SPO2': {'mindisp': 90.0, 'maxdisp': 100.0, 'col': 4287090426}, 
    'Solar8000/PLETH_HR': {'mindisp': 50.0, 'maxdisp': 150.0, 'col': 4287090426}, 
    'Solar8000/BT': {'unit': 'C', 'mindisp': 20.0, 'maxdisp': 40.0, 'col': 4291998860}, 
    'Solar8000/VENT_MAWP': {'unit': 'mbar', 'maxdisp': 20.0, 'col': 4287090426}, 
    'Solar8000/ST_V5': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': 4278255360}, 
    'Solar8000/NIBP_MBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/NIBP_SBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/NIBP_DBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/VENT_PIP': {'unit': 'mbar', 'mindisp': 5.0, 'maxdisp': 25.0, 'col': 4287090426}, 
    'Solar8000/VENT_RR': {'unit': '/min', 'maxdisp': 50.0, 'col': 4287090426}, 
    'Solar8000/VENT_MV': {'unit': 'L/min', 'maxdisp': 8.0, 'col': 4287090426}, 
    'Solar8000/VENT_TV': {'unit': 'mL', 'maxdisp': 1000.0, 'col': 4287090426},
    'Solar8000/VENT_PPLAT': {'unit': 'mbar', 'maxdisp': 20.0, 'col': 4287090426}, 
    'Solar8000/GAS2_AGENT': {'col': 4294944000},
    'Solar8000/GAS2_EXPIRED': {'unit': '%', 'maxdisp': 10.0, 'col': 4294944000}, 
    'Solar8000/GAS2_INSPIRED': {'unit': '%', 'maxdisp': 10.0, 'col': 4294944000}, 
    'Solar8000/ETCO2': {'unit': 'mmHg', 'maxdisp': 60.0, 'col': 4294967040}, 
    'Solar8000/INCO2': {'unit': 'mmHg', 'maxdisp': 60.0, 'col': 4294967040}, 
    'Solar8000/RR_CO2': {'unit': '/min', 'maxdisp': 50.0, 'col': 4294967040}, 
    'Solar8000/FEO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/VENT_INSP_TM': {'unit': 'sec', 'maxdisp': 10.0, 'col': 4287090426}, 
    'Solar8000/VENT_SET_TV': {'unit': 'mL', 'maxdisp': 800.0, 'col': 4287090426}, 
    'Solar8000/VENT_SET_PCP': {'unit': 'cmH2O', 'maxdisp': 40.0, 'col': 4287090426}, 
    'Solar8000/VENT_SET_FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/RR': {'unit': '/min', 'maxdisp': 50.0, 'col': 4294967040},
    'Solar8000/CVP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': 4294944000}, 
    'Solar8000/FEM_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/FEM_SBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/FEM_DBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'Solar8000/PA_MBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': 4294901760}, 
    'Solar8000/PA_SBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': 4294901760}, 
    'Solar8000/PA_DBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': 4294901760}, 
    'Solar8000/VENT_MEAS_PEEP': {'unit': 'hPa'}, 
    'Solar8000/VENT_COMPL': {'unit': 'mL/cmH2O', 'mindisp': 17.0, 'maxdisp': 17.0}, 

    'Primus/CO2': {'unit': 'mmHg', 'srate': 62.5, 'maxdisp': 60.0, 'col': 4294967040}, 
    'Primus/AWP': {'unit': 'hPa', 'srate': 62.5, 'mindisp': -10.0, 'maxdisp': 30.0}, 
    'Primus/INSP_SEVO': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/EXP_SEVO': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/PAMB_MBAR': {'unit': 'mbar', 'maxdisp': 1500.0}, 
    'Primus/MAWP_MBAR': {'unit': 'mbar', 'maxdisp': 40.0}, 
    'Primus/MAC': {'maxdisp': 2.0}, 
    'Primus/VENT_LEAK': {'unit': 'mL/min', 'maxdisp': 1000.0}, 
    'Primus/INCO2': {'unit': 'mmHg', 'maxdisp': 5.0},
    'Primus/ETCO2': {'unit': 'mmHg', 'maxdisp': 50.0, 'col': 4294967040}, 
    'Primus/FEO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FIN2O': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FEN2O': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/SET_FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/SET_FRESH_FLOW': {'unit': 'mL/min', 'maxdisp': 10000.0}, 
    'Primus/SET_AGE': {'maxdisp': 100.0}, 
    'Primus/PIP_MBAR': {'unit': 'mbar', 'mindisp': 5.0, 'maxdisp': 25.0, 'col': 4287090426}, 
    'Primus/COMPLIANCE': {'unit': 'mL / mbar', 'maxdisp': 100.0}, 
    'Primus/PPLAT_MBAR': {'unit': 'mbar', 'maxdisp': 40.0}, 
    'Primus/PEEP_MBAR': {'unit': 'mbar', 'maxdisp': 20.0, 'col': 4287090426}, 
    'Primus/TV': {'unit': 'mL', 'maxdisp': 1000.0, 'col': 4287090426}, 
    'Primus/MV': {'unit': 'L', 'maxdisp': 10.0, 'col': 4287090426}, 
    'Primus/RR_CO2': {'unit': '/min', 'maxdisp': 30.0}, 
    'Primus/SET_TV_L': {'unit': 'L', 'maxdisp': 1.0}, 
    'Primus/SET_INSP_TM': {'unit': 'sec', 'maxdisp': 10.0}, 
    'Primus/SET_RR_IPPV': {'unit': '/min', 'maxdisp': 10.0}, 
    'Primus/SET_INTER_PEEP': {'unit': 'mbar', 'maxdisp': 10.0}, 
    'Primus/SET_PIP': {'unit': 'mbar', 'maxdisp': 10.0}, 
    'Primus/SET_INSP_PAUSE': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/INSP_DES': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/EXP_DES': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/FLOW_N2O': {'unit': 'mL/min', 'maxdisp': 10000.0}, 
    'Primus/FLOW_AIR': {'unit': 'mL / min', 'maxdisp': 10000.0}, 
    'Primus/FLOW_O2': {'unit': 'mL / min', 'maxdisp': 10000.0}, 
    'Primus/SET_FLOW_TRIG': {'unit': 'L/min', 'maxdisp': 10.0}, 
    'Primus/SET_INSP_PRES': {'unit': 'mbar', 'maxdisp': 30.0}, 

    'BIS/EEG1_WAV': {'unit': 'uV', 'srate': 128.0, 'mindisp': -100.0, 'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/EEG2_WAV': {'unit': 'uV', 'srate': 128.0, 'mindisp': -100.0, 'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/BIS': {'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/SQI': {'unit': '%', 'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/EMG': {'unit': 'dB', 'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/SR': {'unit': '%', 'maxdisp': 100.0, 'col': 4292714717}, 
    'BIS/SEF': {'unit': 'Hz', 'maxdisp': 30.0, 'col': 4292714717}, 
    'BIS/TOTPOW': {'unit': 'dB', 'mindisp': 40.0, 'maxdisp': 100.0, 'col': 4292714717}, 

    'Orchestra/RFTN20_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/RFTN20_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/RFTN20_CP': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/RFTN20_CE': {'maxdisp': 15.0, 'col': 4288335154},
    'Orchestra/RFTN20_CT': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/PPF20_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/PPF20_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/PPF20_CP': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/PPF20_CE': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/PPF20_CT': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/ROC_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/ROC_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/NTG_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/NTG_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/FUT_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/FUT_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/PGE1_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/PGE1_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/NEPI_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/NEPI_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/PHEN_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/PHEN_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/RFTN50_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/RFTN50_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/RFTN50_CP': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/RFTN50_CE': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/RFTN50_CT': {'maxdisp': 15.0, 'col': 4288335154}, 
    'Orchestra/DOPA_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/DOPA_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/OXY_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/OXY_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/DEX2_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/DEX2_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/EPI_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/EPI_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/MRN_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/MRN_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/DEX4_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/DEX4_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/DTZ_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/DTZ_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/VASO_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/VASO_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/DOBU_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/DOBU_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/NPS_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/NPS_VOL': {'unit': 'mL', 'maxdisp': 200.0}, 
    'Orchestra/VEC_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/VEC_VOL': {'unit': 'mL', 'maxdisp': 200.0},
    'Orchestra/AMD_RATE': {'unit': 'mL/h', 'maxdisp': 200.0}, 
    'Orchestra/AMD_VOL': {'unit': 'mL', 'maxdisp': 200.0},

    'FMS/FLOW_RATE': {'unit': 'mL/min', 'maxdisp': 500.0, 'col': 4286611584}, 
    'FMS/INPUT_TEMP': {'unit': 'C', 'maxdisp': 40.0}, 
    'FMS/OUTPUT_TEMP': {'unit': 'C', 'maxdisp': 40.0}, 
    'FMS/INPUT_AMB_TEMP': {'unit': 'C', 'maxdisp': 40.0}, 
    'FMS/OUTPUT_AMB_TEMP': {'unit': 'C', 'maxdisp': 40.0}, 
    'FMS/TOTAL_VOL': {'unit': 'mL', 'maxdisp': 10000.0, 'col': 4286611584}, 
    'FMS/PRESSURE': {'unit': 'mmHg', 'maxdisp': 100.0}, 

    'Vigilance/CO': {'unit': 'L/min', 'mindisp': 1.0, 'maxdisp': 15.0, 'col': 4294951115}, 
    'Vigilance/CI': {'unit': 'L/min/m2', 'mindisp': 1.0, 'maxdisp': 5.0, 'col': 4294951115}, 
    'Vigilance/SVO2': {'unit': '%', 'mindisp': 30.0, 'maxdisp': 100.0}, 
    'Vigilance/SV': {'unit': 'ml/beat', 'mindisp': 58.0, 'maxdisp': 125.0}, 
    'Vigilance/SVI': {'unit': 'ml/beat/m2', 'mindisp': 33.0, 'maxdisp': 72.0}, 
    'Vigilance/HR_AVG': {'unit': '/min', 'mindisp': 102.0, 'maxdisp': 113.0}, 
    'Vigilance/BT_PA': {'unit': 'C', 'mindisp': 20.0, 'maxdisp': 40.0}, 
    'Vigilance/SQI': {'mindisp': 1.0, 'maxdisp': 4.0},
    'Vigilance/RVEF': {'unit': '%', 'maxdisp': 100.0}, 
    'Vigilance/EDV': {'unit': 'ml', 'mindisp': 173.0, 'maxdisp': 238.0}, 
    'Vigilance/EDVI': {'unit': 'ml/m2', 'mindisp': 101.0, 'maxdisp': 138.0}, 
    'Vigilance/ESV': {'unit': 'ml', 'mindisp': 96.0, 'maxdisp': 134.0}, 
    'Vigilance/ESVI': {'unit': 'ml/m2', 'mindisp': 56.0, 'maxdisp': 78.0}, 
    'Vigilance/SNR': {'unit': 'dB', 'mindisp': -10.0, 'maxdisp': 20.0}, 

    'EV1000/ART_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': 4294901760}, 
    'EV1000/CO': {'unit': 'L/min', 'mindisp': 1.0, 'maxdisp': 15.0, 'col': 4294951115}, 
    'EV1000/CI': {'unit': 'L/min/m2', 'mindisp': 1.0, 'maxdisp': 5.0, 'col': 4294951115}, 
    'EV1000/SVV': {'unit': '%', 'maxdisp': 100.0, 'col': 4294951115}, 
    'EV1000/SV': {'unit': 'ml/beat', 'mindisp': 40.0, 'maxdisp': 69.0}, 
    'EV1000/SVI': {'unit': 'ml/beat/m2', 'mindisp': 26.0, 'maxdisp': 44.0}, 
    'EV1000/CVP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': 4294944000}, 
    'EV1000/SVR': {'unit': 'dn-s/cm5', 'mindisp': 1079.0, 'maxdisp': 1689.0}, 
    'EV1000/SVRI': {'unit': 'dn-s-m2/cm5', 'mindisp': 1673.0, 'maxdisp': 2619.0}, 

    'CardioQ/FLOW': {'unit': 'cm/sec', 'srate': 180.0, 'mindisp': -100.0, 'maxdisp': 1000.0, 'col': 4278255360}, 
    'CardioQ/ABP': {'unit': 'mmHg', 'srate': 180.0, 'maxdisp': 300.0, 'col': 4294901760}, 
    'CardioQ/CO': {'unit': 'L/min', 'mindisp': 1.0, 'maxdisp': 15.0, 'col': 4294951115}, 
    'CardioQ/SV': {'unit': 'mL', 'maxdisp': 100.0}, 
    'CardioQ/HR': {'unit': '/min', 'maxdisp': 200.0}, 
    'CardioQ/MD': {'maxdisp': 2000.0}, 
    'CardioQ/SD': {'maxdisp': 100.0}, 
    'CardioQ/FTc': {'maxdisp': 40.0}, 
    'CardioQ/FTp': {'maxdisp': 200.0}, 
    'CardioQ/MA': {'maxdisp': 100.0}, 
    'CardioQ/PV': {'maxdisp': 100.0}, 
    'CardioQ/CI': {'unit': 'L/min/m2', 'mindisp': 1.0, 'maxdisp': 5.0, 'col': 4294951115}, 
    'CardioQ/SVI': {'unit': 'ml/m2', 'maxdisp': 100.0}, 

    'Vigileo/CO': {'unit': 'L/min', 'mindisp': 1.0, 'maxdisp': 15.0, 'col': 4294951115}, 
    'Vigileo/CI': {'unit': 'L/min/m2', 'mindisp': 1.0, 'maxdisp': 5.0, 'col': 4294951115}, 
    'Vigileo/SVV': {'unit': '%', 'maxdisp': 100.0, 'col': 4294951115}, 
    'Vigileo/SV': {'unit': 'ml/beat'}, 
    'Vigileo/SVI': {'unit': 'ml/beat/m2'}, 

    'Invos/SCO2_L': {'unit': '%', 'maxdisp': 100.0}, 
    'Invos/SCO2_R': {'unit': '%', 'maxdisp': 100.0}, 
    }


class VitalFile:
    """A VitalFile class.
    :param dict devs: device info
    :param dict trks: track info & recs
    :param double dtstart: file start time
    :param double dtend: flie end time
    :param float dgmt: dgmt = ut - localtime in minutes. For KST, it is -540.
    """
    
    def __init__(self, ipath, track_names=None, skip_records=False, exclude=None, userid=None):
        """Constructor of the VitalFile class.
        :param ipath: file path, list of file path, or caseid of open dataset
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param skip_records: read track names only for fast reading
        """
        self.devs = {}  # dname -> Device(type, port)
        self.trks = {}  # dtname -> Track(type, fmt, unit, mindisp, maxdisp, col, srate, gain, offset, montype, dname)
        self.dtstart = 0
        self.dtend = 0
        self.dgmt = 0
        self.order = []  # optional: order of dtname

        # tracks including
        if isinstance(track_names, str):
            if track_names.find(','):
                track_names = track_names.split(',')
            else:
                track_names = [track_names]

        # tracks excluding
        if isinstance(exclude, str):
            if exclude.find(','):
                exclude = exclude.split(',')
            else:
                exclude = [exclude]
        
        if exclude is not None:
            exclude = set(exclude)

        if isinstance(ipath, int):
            if skip_records:
                raise NotImplementedError
            self.load_opendata(ipath, track_names, exclude)
            return
        elif isinstance(ipath, list):
            for path in ipath:
                vf = VitalFile(path)
                if self.dtstart == 0:  # open the first file
                    self.devs = vf.devs
                    self.trks = vf.trks
                    self.dtstart = vf.dtstart
                    self.dtend = vf.dtend
                    self.dgmt = vf.dgmt
                else:  # merge from the next file
                    if abs(self.dtstart - vf.dtstart) > 7 * 24 * 3600:  # maximum length of vital file < 7 days
                        continue
                    self.dtstart = min(self.dtstart, vf.dtstart)
                    self.dtend = max(self.dtend, vf.dtend)
                    # merge devices
                    for dname, dev in vf.devs.items():
                        if dname not in self.devs:
                            self.devs[dname] = dev
                    # merge tracks
                    for dtname, trk in vf.trks.items():
                        if dtname in self.trks:
                            self.trks[dtname].recs.extend(trk.recs)
                        else:
                            self.trks[dtname] = trk
                    # merge order
                    for dtname in vf.order:
                        if dtname not in self.order:
                            self.order.append(dtname)

            # sorting tracks
            #for trk in self.trks.values():
            #    trk.recs.sort(key=lambda r:r['dt'])
            
            return

        # check ipath is url
        ext = os.path.splitext(ipath)[1]
        ipos = ext.find('&')
        if ipos > 0:
            ext = ext[:ipos]
        ipos = ext.find('?')
        if ipos > 0:
            ext = ext[:ipos]

        if isinstance(userid, str):
            if ext == '.parquet':
                bedname = ipath[:-22]
                month = ipath[-21:-17]
                ipath = f's3://vitaldb-parquets/{userid}/{month}/{bedname}/{ipath}'
            elif ext == '.vital':
                bedname = ipath[:-20]
                month = ipath[-19:-15]
                ipath = f's3://vitaldb-myfiles/{userid}/{month}/{bedname}/{ipath}'

        if ext == '.vital':
            self.load_vital(ipath, track_names, skip_records, exclude)
        elif ext == '.parquet':
            if skip_records:
                raise NotImplementedError
            self.load_parquet(ipath, track_names, exclude)


    def get_samples(self, track_names, interval, return_datetime=False, return_timestamp=False):
        """Get track samples.
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        :return: [[samples of track1], [samples of track2]...]
        """
        if not interval:  # maximum sampling rate
            max_srate = max([trk.srate for trk in self.trks.values()])
            interval = 1 / max_srate
        if not interval:
            interval = 1
        assert interval > 0

        # parse comma separated track names
        if isinstance(track_names, str):
            if track_names.find(','):
                track_names = track_names.split(',')
            else:
                track_names = [track_names]

        if track_names is None:  # if track_names is None, return all tracks
            track_names = [trk.dtname for trk in self.trks.values()]

        # removing duplicated track names with the same order
        track_names = list(dict.fromkeys(track_names))

        ret = []
        for dtname in track_names:
            vals = self.get_track_samples(dtname, interval)
            ret.append(vals)

        # return time column
        if return_datetime: # in this case, numpy array with object type will be returned
            tzi = datetime.timezone(datetime.timedelta(minutes=-self.dgmt))
            ret.insert(0, datetime.datetime.fromtimestamp(self.dtstart, tzi) + np.arange(len(ret[0])) * datetime.timedelta(seconds=interval))
            track_names.insert(0, 'Time')
        elif return_timestamp:
            ret.insert(0, self.dtstart + np.arange(len(ret[0])) * interval)
            track_names.insert(0, 'Time')

        return ret, track_names


    def crop(self, dtfrom=None, dtend=None):
        if dtfrom is None:
            dtfrom = self.dtstart
        elif dtfrom < 0:
            dtfrom = self.dtend + dtfrom
        elif dtfrom < 946684800:
            dtfrom = self.dtstart + dtfrom

        if dtend is None:
            dtend = self.dtend
        elif dtend < 0:
            dtend = self.dtend + dtend
        elif dtend < 946684800:
            dtend = self.dtstart + dtend

        if dtend < dtfrom:
            return

        for dtname, trk in self.trks.items():
            new_recs = []
            for rec in trk.recs:
                if dtfrom <= rec['dt'] <= dtend:
                    new_recs.append(rec)
            self.trks[dtname].recs = new_recs
        self.dtstart = dtfrom
        self.dtend = dtend
        return self
        

    def get_track_names(self):
        return list(self.trks.keys())


    def rename_device(self, oldname, newname):
        """ rename tracks
        :param oldname: device name
        :param newname: target name
        """
        if newname.find('/') >= 0:
            raise ValueError('newname should not include the slash')
        if newname == oldname:
            raise ValueError('newname should not be same with oldname')

        for dname, dev in self.devs.items():
            if dname == oldname:
                dev.name = newname
                self.devs[newname] = self.devs.pop(oldname)
                break

        mapping = {}
        for old_dtname, trk in self.trks.items():
            if trk.dname == oldname:
                trk.dname = newname
                trk.dtname = newname + '/' + trk.name
                mapping[old_dtname] = trk.dtname
                if old_dtname in self.order:
                    self.order[self.order.index(old_dtname)] = trk.dtname
        
        for oldname, newname in mapping.items():
            self.trks[newname] = self.trks.pop(oldname)

    def rename_devices(self, mapping):
        """ rename devices
        :param mapping: {oldname : newname} eg) {'SNUADC': 'SUPER_NICE_ADC'}
        """
        if not isinstance(mapping, dict):
            raise TypeError('mapping must be a dict')
        for oldname, newname in mapping.items():
            self.rename_device(oldname, newname)

    def rename_track(self, dtname, target):
        """ rename tracks
        :param dtname: track name. only first matching tracks will be renamed
        :param target: target name. it should not include the device name.
        """
        if target.find('/') >= 0:
            raise ValueError('target name should not include the device name')

        trk = self.find_track(dtname)
        if trk is None:
            return None
        oldname = trk.dtname
        newname = trk.dname + '/' + target
        trk.dtname = newname
        trk.name = target
        if oldname in self.trks:
            self.trks[newname] = self.trks.pop(oldname)
        if oldname in self.order:
            self.order[self.order.index(oldname)] = newname
        return trk

    def rename_tracks(self, mapping):
        """ rename tracks
        :param mapping: {oldname : newname} eg) {'ECG_II': 'ECG_2'}
        """
        if not isinstance(mapping, dict):
            raise TypeError('mapping must be a dict')
        for dtname, target in mapping.items():
            self.rename_track(dtname, target)


    def remove_device(self, dname):
        """ remove track by name
        :param dname: device name. eg) SNUADC/ECG
        """
        if dname in self.devs:
            self.devs.pop(dname)

        dtnames = []
        for dtname, trk in self.trks.items():
            if trk.dname == dname:
                dtnames.append(dtname)
        for dtname in dtnames:
            self.trks.pop(dtname)
            if dtname in self.order:
                self.order.remove(dtname)

    del_device = remove_device

    def remove_devices(self, dnames):
        """ remove devices by name
        :param dnames: list of device name. eg) ['SNUADC/ECG']
        """
        if isinstance(dnames, str):
            dnames = [dnames]
        for dname in dnames:
            self.remove_device(dname)
    
    del_devices = remove_devices

    def remove_track(self, dtname):
        """ remove track by name
        :param dtname: track name. eg) SNUADC/ECG
        """
        trk = self.find_track(dtname)
        if trk is None:
            return None
        dtname = trk.dtname
        if dtname in self.trks:
            del self.trks[dtname]
        if dtname in self.order:
            self.order.remove(dtname)
        return trk

    del_track = remove_track

    def remove_tracks(self, dtnames):
        """ remove tracks by name
        :param dtnames: list of track names. eg) ['SNUADC/ECG']
        """
        if isinstance(dtnames, str):
            dtnames = [dtnames]
        for dtname in dtnames:
            self.del_track(dtname)
    
    del_tracks = remove_tracks

    def add_track(self, dtname, recs, srate=0, unit='', mindisp=0, maxdisp=0, after=None):
        if len(recs) == 0:
            return

        if 'val' not in recs[0] or 'dt' not in recs[0]:
            return

        srate = float(srate)
        unit = str(unit)
        mindisp = float(mindisp)
        maxdisp = float(maxdisp)

        dname = ''
        tname = dtname
        if dtname.find('/') >= 0:
            dname, tname = dtname.split('/')

        # add device
        if dname not in self.devs:
            self.devs[dname] = Device(dname)

        # track type: wav=1, num=2, str=5
        ntype = 2
        if srate > 0:
            ntype = 1
        elif isinstance(recs[0]['val'], str):
            ntype = 5
        self.trks[dtname] = Track(tname, ntype, fmt=1, srate=srate, unit=unit, mindisp=mindisp, maxdisp=maxdisp, dname=dname, recs=recs)

        # change track order
        if after is not None:
            if not hasattr(self, 'order') or len(self.order) == 0:
                self.order = self.get_track_names()
            if dtname in self.order:  # remove if it already exists
                self.order.remove(dtname)
            self.order.insert(self.order.index(after) + 1, dtname)

    def anonymize(self):
        # 1. create a deep copy of self
        vf = deepcopy(self)
        # 2. subtract dtstart from all dt of each trk rec
        for dtname in vf.trks:
            trk = vf.trks[dtname]
            for rec in trk.recs:
                if 'dt' in rec:
                    rec['dt'] -= vf.dtstart
                else:
                    continue
        # 3. set dtend -= dtstart
        vf.dtend -= vf.dtstart
        # 4. set dtstart to 0
        vf.dtstart = 0

        return vf

    def find_track(self, dtname):
        """Find track from dtname
        :param dtname: device and track name. eg) SNUADC/ECG_II
        """
        if dtname in self.trks:
            return self.trks[dtname]
        for trk_dtname, trk in self.trks.items():  # find track
            if trk_dtname.endswith(dtname):
                return trk                    
        return None

    def get_track_samples(self, dtname, interval):
        """Get samples of each track.
        :param dtname: track name
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        """
        if self.dtend <= self.dtstart:
            return []

        # return length
        nret = int(np.ceil((self.dtend - self.dtstart) / interval))
        trk = self.find_track(dtname)
        if trk is None:
            return np.full(nret, np.nan)
        if trk.type == 2:  # numeric track
            ret = np.full(nret, np.nan, dtype=np.float32)  # create a dense array
            for rec in trk.recs:  # copy values
                idx = int((rec['dt'] - self.dtstart) / interval)
                if idx < 0:
                    idx = 0
                elif idx >= nret:
                    idx = nret - 1
                ret[idx] = rec['val']
            return ret
        elif trk.type == 5:  # str track
            ret = np.full(nret, np.nan, dtype='object')  # create a dense array
            for rec in trk.recs:  # copy values
                idx = int((rec['dt'] - self.dtstart) / interval)
                if idx < 0:
                    idx = 0
                elif idx >= nret:
                    idx = nret - 1
                ret[idx] = rec['val']
            return ret
        elif trk.type == 1:  # wave track
            # preserve space for return array
            nsamp = int(np.ceil((self.dtend - self.dtstart) * trk.srate))
            ret = np.full(nsamp, np.nan, dtype=np.float32)
            for rec in trk.recs:  # copy samples
                sidx = int(np.ceil((rec['dt'] - self.dtstart) * trk.srate))
                eidx = sidx + len(rec['val'])
                srecidx = 0
                erecidx = len(rec['val'])
                if sidx < 0:  # before self.dtstart 
                    srecidx -= sidx
                    sidx = 0
                if eidx > nsamp:  # after self.dtend
                    erecidx -= (eidx - nsamp)
                    eidx = nsamp
                ret[sidx:eidx] = rec['val'][srecidx:erecidx]

            # gain offset conversion
            if trk.fmt > 2:  # 1: float, 2: double
                ret *= trk.gain
                ret += trk.offset

            # up sampling
            
            # downsampling
            if trk.srate != int(1 / interval + 0.5):
                ret = np.take(ret, np.linspace(0, nsamp - 1, nret).astype(np.int64))

            return ret

    def _get_track_gain_offset(self, dtname, sample_bits=16):
        """Determine the quantization scale of waveform samples.

        Gain is defined here as the smallest measurable change in
        physical units (the reciprocal of WFDB gain); offset is the
        physical value corresponding to an integer sample value of
        zero.  If the track is not natively stored in an integer
        format, we will try to guess a suitable gain and offset value
        to fit in the specified number of bits.

        :param dtname: name of the waveform track
        :param sample_bits: maximum output resolution in bits
        :return: (gain, offset)
        """
        trk = self.find_track(dtname)
        if trk is None:
            return 1, 0

        if trk.type == 1 and trk.fmt > 2:
            return trk.gain, trk.offset

        max_sample = 2**(sample_bits - 1) - 1
        min_sample = -(2**(sample_bits - 1) - 1)
        n_sample_values = max_sample - min_sample + 1

        values = trk._distinct_values()
        values = values[np.isfinite(values)]
        for n in range(len(values), n_sample_values):
            gain = (values[-1] - values[0]) / (n - 1)
            offset = values[0] - (gain * min_sample)
            conv_values = np.round((values - offset) / gain)
            diff = np.abs(conv_values * gain + offset - values)
            if diff.max() < gain * 0.05:
                return gain, offset

        gain = (values[-1] - values[0]) / (n_sample_values - 1)
        offset = values[0] - (gain * min_sample)
        return gain, offset

    def to_pandas(self, track_names, interval, return_datetime=False, return_timestamp=False):
        """
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        """
        ret, track_names = self.get_samples(track_names, interval, return_datetime, return_timestamp)
        return pd.DataFrame(np.transpose(ret), columns=track_names)


    def to_numpy(self, track_names, interval, return_datetime=False, return_timestamp=False):
        """
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        """
        ret, track_names = self.get_samples(track_names, interval, return_datetime, return_timestamp)
        return np.transpose(ret)


    def to_wav(self, opath, track_names, srate=None):
        """ Save as wave file
        :param opath: file path to save.
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param srate: sample frequency. eg) 500
        """
        assert srate > 0
        vals = self.to_numpy(track_names, 1 / srate)

        # fill nan
        vals = pd.DataFrame(vals).interpolate(limit_direction='both').values

        scale = np.abs(vals).max(axis=0)  # normalize tracks
        scale[scale == 0] = 1  # not to divide by zero
        vals *= (2 ** 15 - 1) / scale # scaling

        vals = vals.astype("<h")  # Convert to little-endian short int
        with wave.open(opath, "w") as f:
            f.setnchannels(vals.shape[1])
            f.setsampwidth(2)  # 2 bytes per sample
            f.setframerate(srate)
            f.writeframes(vals.tobytes())


    def to_csv(self, opath, track_names, interval, return_datetime=False, return_timestamp=False):
        """
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        """
        df = self.to_pandas(track_names, interval, return_datetime, return_timestamp)
        return df.to_csv(opath, index=False, encoding='utf-8-sig')


    def to_wfdb(self, opath, track_names=None, interval=None):
        """ save as wfdb files
        """
        if not interval:  # maximum sampling rate
            max_srate = max([trk.srate for trk in self.trks.values()])
            interval = 1 / max_srate
        if not interval:
            interval = 1
        assert interval > 0

        # parse comma separated track names
        if isinstance(track_names, str):
            if track_names.find(','):
                track_names = track_names.split(',')
            else:
                track_names = [track_names]

        if track_names is None:  # if track_names is None, return all tracks
            track_names = [trk.dtname for trk in self.trks.values()]

        # wav, num, str 을 나눈다.
        wav_track_names = []
        wav_units = []
        num_track_names = []
        for track_name in track_names:
            trk = self.find_track(track_name)
            if trk is None:
                continue
            if trk.type == 1:  # wav
                wav_track_names.append(trk.dtname)
                wav_units.append(trk.unit)
            elif trk.type == 2:  # num
                num_track_names.append(trk.dtname)

        # save wave tracks
        df = self.to_pandas(wav_track_names, interval, return_timestamp=True)

        adc_gain = []
        baseline = []
        for track_name in wav_track_names:
            gain, offset = self._get_track_gain_offset(track_name)
            adc_gain.append(1 / gain)
            baseline.append(int(round(-offset / gain)))

        # wfdb-python 4.0.0 converts samples incorrectly
        # (https://github.com/MIT-LCP/wfdb-python/issues/418)
        p_signal = df.values[:,1:]
        d_signal = p_signal * adc_gain + baseline
        d_signal = np.round(d_signal).astype('int16')
        d_signal[np.isnan(p_signal)] = -32768

        wfdb.wrsamp(os.path.basename(opath),
            write_dir=os.path.dirname(opath),
            fs=float(1/interval), units=wav_units, 
            sig_name=wav_track_names, 
            d_signal=d_signal,
            adc_gain=adc_gain,
            baseline=baseline,
            fmt=['16'] * len(wav_track_names))
        df.rename(columns={'Time':'time'}, inplace=True)
        df['time'] = (df['time'] - self.dtstart)
        df = df.round(4)
        ret = df.to_csv(f'{opath}w.csv.gz', encoding='utf-8-sig', index=False)

        # save numeric tracks
        df = self.to_pandas(num_track_names, 1, return_timestamp=True)
        df.rename(columns={'Time':'time'}, inplace=True)
        df['time'] = (df['time'] - self.dtstart).astype(int)
        df = df.round(4)
        ret = df.to_csv(f'{opath}n.csv.gz', encoding='utf-8-sig', index=False)

        return ret

    def to_vital(self, opath, compresslevel=1):
        """ save as vital file
        :param opath: file path to save.
        """
        f = gzip.GzipFile(opath, 'wb', compresslevel=compresslevel)

        # save header
        if not f.write(b'VITA'):  # check sign
            return False
        if not f.write(pack_dw(3)):  # version
            return False
        if not f.write(pack_w(10)):  # header len
            return False
        if not f.write(pack_s(self.dgmt)):  # dgmt = ut - localtime
            return False
        if not f.write(pack_dw(0)):  # instance id
            return False
        if not f.write(pack_dw(0)):  # program version
            return False

        # save devinfos
        did = 0
        dname_dids = {}
        for dname, dev in self.devs.items():
            if dname == '': 
                continue
            
            # issue did
            did += 1
            dname_dids[dname] = did

            ddata = pack_dw(did) + pack_str(dev.type) + pack_str(dev.name) + pack_str(dev.port)
            if not f.write(pack_b(9) + pack_dw(len(ddata)) + ddata):
                return False

        # save trks
        tid = 0
        dtname_tids = {}
        for dtname, trk in self.trks.items():
            #stime = time.time()

            # issue tid
            tid += 1
            dtname_tids[dtname] = tid

            # find device id
            dname = trk.dname
            did = 0
            if dname in dname_dids:
                did = dname_dids[dname]

            ti = pack_w(tid) + pack_b(trk.type) + pack_b(trk.fmt) + pack_str(trk.name) \
                + pack_str(trk.unit) + pack_f(trk.mindisp) + pack_f(trk.maxdisp) \
                + pack_dw(trk.col) + pack_f(trk.srate) + pack_d(trk.gain) + pack_d(trk.offset) \
                + pack_b(trk.montype) + pack_dw(did)
            if not f.write(pack_b(0) + pack_dw(len(ti)) + ti):
                return False
            
            # save recs
            for rec in trk.recs:
                rdata = pack_w(10) + pack_d(rec['dt']) + pack_w(tid)  # infolen + dt + tid (= 12 bytes)
                if trk.type == 1:  # wav
                    rdata += pack_dw(len(rec['val'])) + rec['val'].tobytes()
                elif trk.type == 2:  # num
                    fmtcode, fmtlen = FMT_TYPE_LEN[trk.fmt]
                    rdata += pack(fmtcode, rec['val'])
                elif trk.type == 5:  # str
                    rdata += pack_dw(0) + pack_str(rec['val'])

                if not f.write(pack_b(1) + pack_dw(len(rdata)) + rdata):
                    return False

            #print(f'{dtname } @ {time.time()-stime}')


        # save trk order
        if len(self.order) > 0:
            tids = np.array([dtname_tids[dtname] for dtname in self.order], dtype=np.dtype('H'))
            cdata = pack_b(5) + pack_w(len(tids)) + tids.tobytes()
            if not f.write(pack_b(6) + pack_dw(len(cdata)) + cdata):
                return False

        f.close()
        return True

    def get_dt(self, year, month, day, hour=0, minute=0, second=0.0):
        """ get unix timestamp based on the file's timezone
        """
        tz = datetime.timezone(datetime.timedelta(minutes=-self.dgmt))
        nsec = int(second)
        microsec = int((second - nsec) * 1000000)
        return datetime.datetime(year, month, day, hour, minute, nsec, microsec, tz).timestamp()

    save_vital = to_vital

    def to_parquet(self, opath):
        """ save as parquet file
        """
        rows = []
        for _, trk in self.trks.items():
            dtname = trk.name
            dname = ''
            if dname in self.devs:
                dev = self.devs[dname]
                if 'name' in dev:
                    dname = dev.name
                    dtname = dname + '/' + dtname  # 장비명을 앞에 붙임

            # concat wave records
            newrecs = []
            if trk.type == 1 and trk.srate > 0:
                srate = trk.srate
                newrec = {}
                for rec in trk.recs:
                    if not newrec:  # 첫 샘플
                        newrec = rec
                    elif abs(newrec['dt'] + len(newrec['val']) / srate - rec['dt']) < 1.1 / srate and len(newrec['val']) < srate:
                        # continue from the previous rec
                        newrec['val'] = np.concatenate((newrec['val'], rec['val']))
                    else:  # inturrupted
                        newrecs.append(newrec)
                        newrec = rec
                if newrec:
                    newrecs.append(newrec)
                trk.recs = newrecs

            for rec in trk.recs:
                row = {'tname': dtname, 'dt': rec['dt']}
                if trk.type == 1:  # wav
                    vals = rec['val'].astype(np.float32)
                    if trk.fmt > 2:  # 1: float, 2: double
                        vals *= trk.gain
                        vals += trk.offset
                    row['wval'] = vals.tobytes()
                    row['nval'] = trk.srate
                elif trk.type == 2:  # num
                    # row['val'] = pack_f(np.float32(rec['val']))
                    row['nval'] = rec['val']
                elif trk.type == 5:  # str
                    row['sval'] = rec['val']
                rows.append(row)

        df = pd.DataFrame(rows)
        if 'nval' in df:
            df['nval'] = df['nval'].astype(np.float32)
        
        df.to_parquet(opath, compression='gzip')


    def load_opendata(self, caseid, track_names, exclude):
        global dftrks
        
        if not caseid:
            raise ValueError('caseid should be greater than zero')
            return

        if dftrks is None:  # for cache
            dftrks = pd.read_csv("https://api.vitaldb.net/trks")

        tids = []
        dtnames = []
        for dtname in track_names:
            rows = dftrks.loc[(dftrks['caseid'] == caseid) & (dftrks['tname'].str.endswith(dtname))]
            if len(rows) == 0:
                continue
            row = rows.iloc[0]
            
            # make device
            dtname = row['tname']
            dname = ''
            tname = dtname
            if dtname.find('/') >= 0:
                dname, tname = dtname.split('/')
            if dname not in self.devs:
                self.devs[dname] = Device(dname)

            try:  # read tracks
                url = 'https://api.vitaldb.net/' + row['tid']
                dtvals = pd.read_csv(url, na_values='-nan(ind)').values
            except:
                continue

            if len(dtvals) == 0:
                continue

            if dtname in self.trks:  # already read
                continue
            
            # sampling rate
            if np.isnan(dtvals[:,0]).any():  # wav
                ntype = 1
                interval = dtvals[1,0] - dtvals[0,0]
                assert interval > 0
                srate = 1 / interval
            else:  # num
                ntype = 2  
                srate = 0
            # no string type in open dataset

            # default track information
            if dtname in TRACK_INFO:
                trk = Track(tname, **TRACK_INFO[dtname], type=ntype, dname=dname)
                trk.srate = srate
            else:
                trk = Track(tname, ntype, srate=srate, dname=dname)

            self.trks[dtname] = trk

            # parsing the records
            if ntype == 1:  # wav
                assert srate > 0
                # seperate with 1sec interval
                interval = dtvals[1,0] - dtvals[0,0]
                dtvals = dtvals.astype(np.float32)
                for i in range(0, len(dtvals), int(srate)):
                    trk.recs.append({'dt': dtvals[0,0] + i * interval, 'val': dtvals[i:i+int(srate), 1]})
            else:  # num
                for dt, val in dtvals:  # copy values
                    trk.recs.append({'dt': dt, 'val': val})

            # open dataset always starts with 0
            dt = dtvals[-1,0]
            if dt > self.dtend:
                self.dtend = dt

        return

    def load_parquet(self, ipath, track_names, exclude):
        filts = None
        if track_names:
            filts = [['tname', 'in', track_names]]
        df = pq.read_table(ipath, filters=filts).to_pandas()

        # df = pd.read_parquet(ipath)

        self.dtstart = df['dt'].min()
        self.dtend = df['dt'].max()
        for _, row in df.iterrows():
            # tname, dt, sval, wval, nval
            dtname = row['tname']
            if not dtname:
                continue

            # including and excluding tracks
            if track_names:
                if dtname not in track_names:
                    continue
            if exclude:
                if dtname in exclude:
                    continue

            # for specifying device name
            dname = ''
            tname = dtname
            if dtname.find('/') >= 0:
                dname, tname = dtname.split('/')
            if dname not in self.devs:
                self.devs[dname] = Device(dname)

            # create tracks
            if dtname not in self.trks:  # new track
                if 'wval' in row and row['wval'] is not None:
                    ntype = 1  # wav
                    srate = row['nval']
                elif 'sval' in row and row['sval'] is not None:
                    ntype = 5  # str
                    srate = 0
                elif 'nval' in row and row['nval'] is not None:
                    ntype = 2  # num
                    srate = 0
                else:
                    continue

                # basic track information from the track name
                trk = Track(tname, ntype, srate=srate, dname=dname)
                self.trks[dtname] = trk

            # reading records
            trk = self.trks[dtname]
            rec = {'dt': row['dt']}
            if trk.type == 1:  # wav
                rec['val'] = np.frombuffer(row['wval'], dtype=np.float32)
                # rec['val'] = np.array(Struct('<{}f'.format(len(row['wval']) // 4)).unpack_from(row['wval'], 0), dtype=np.float32)
                # TODO: dtend may be incorrect
            elif trk.type == 2:  # num
                rec['val'] = row['nval']
            elif trk.type == 5:  # str
                rec['val'] = row['sval']
            else:
                continue
            trk.recs.append(rec)
        

    # track_names: list of dtname to read. If track_names is None, all tracks will be loaded
    # skip_records: read track names only
    # exclude: track names to exclude
    def load_vital(self, ipath, track_names=None, skip_records=False, exclude=None):
        # check if ipath is url
        iurl = parse.urlparse(ipath)
        if iurl.scheme and iurl.netloc:
            if iurl.scheme == 's3':
                fs = s3fs.S3FileSystem(anon=False)
                f = fs.open(iurl.netloc + iurl.path, 'rb')
            else:
                response = request.urlopen(ipath)
                f = tempfile.NamedTemporaryFile(delete=True)
                shutil.copyfileobj(response, f)
                f.seek(0)
        else:
            f = open(ipath, 'rb')

        # read file as gzip
        f = gzip.GzipFile(fileobj=f)

        # parse header
        if f.read(4) != b'VITA':  # check sign
            return False

        f.read(4)  # file version
        buf = f.read(2)
        if buf == b'':
            return False
        headerlen = unpack_w(buf, 0)[0]
        header = f.read(headerlen)  # read header

        self.dgmt = unpack_s(header, 0)[0]  # dgmt = ut - localtime

        # parse body
        try:
            tid_dtnames = {}  # tid -> dtname for this file
            did_dnames = {}  # did -> dname for this file
            while True:
                buf = f.read(5)
                if buf == b'':
                    break
                pos = 0

                packet_type = unpack_b(buf, pos)[0]; pos += 1
                packet_len = unpack_dw(buf, pos)[0]; pos += 4

                if packet_len > 1000000: # maximum packet size should be < 1MB
                    break
                
                buf = f.read(packet_len)
                if buf == b'':
                    break
                pos = 0

                if packet_type == 9:  # devinfo
                    did = unpack_dw(buf, pos)[0]; pos += 4
                    devtype, pos = unpack_str(buf, pos)
                    name, pos = unpack_str(buf, pos)
                    port = ''
                    if len(buf) > pos + 4:  # port is optional
                        port, pos = unpack_str(buf, pos)
                    if not name:
                        name = devtype
                    self.devs[name] = Device(name, devtype, port)
                    did_dnames[did] = name
                elif packet_type == 0:  # trkinfo
                    did = col = 0
                    montype = 0
                    unit = ''
                    gain = offset = srate = mindisp = maxdisp = 0.0
                    tid = unpack_w(buf, pos)[0]; pos += 2
                    trktype = unpack_b(buf, pos)[0]; pos += 1
                    fmt = unpack_b(buf, pos)[0]; pos += 1
                    tname, pos = unpack_str(buf, pos)

                    if packet_len > pos:
                        unit, pos = unpack_str(buf, pos)
                    if packet_len > pos:
                        mindisp = unpack_f(buf, pos)[0]
                        pos += 4
                    if packet_len > pos:
                        maxdisp = unpack_f(buf, pos)[0]
                        pos += 4
                    if packet_len > pos:
                        col = unpack_dw(buf, pos)[0]
                        pos += 4
                    if packet_len > pos:
                        srate = unpack_f(buf, pos)[0]
                        pos += 4
                    if packet_len > pos:
                        gain = unpack_d(buf, pos)[0]
                        pos += 8
                    if packet_len > pos:
                        offset = unpack_d(buf, pos)[0]
                        pos += 8
                    if packet_len > pos:
                        montype = unpack_b(buf, pos)[0]
                        pos += 1
                    if packet_len > pos:
                        did = unpack_dw(buf, pos)[0]
                        pos += 4

                    dname = ''
                    if did and did in did_dnames:
                        dname = did_dnames[did]
                        dtname = dname + '/' + tname
                    else:
                        dtname = tname

                    matched = False
                    if not track_names:  # for reading user definded tracks
                        matched = True
                    elif dtname in track_names:
                        matched = True
                    else:  # matching with tolerance
                        for sel_dtname in track_names:
                            if dtname.endswith(sel_dtname) or (dname + '/*' == sel_dtname): # only track name is specified or all tracks in a specific device
                                matched = True
                                break
                    if exclude and matched:  # excluded tracks
                        if dtname in exclude:
                            matched = False
                        else:  # exclude with tolerance
                            for sel_dtname in exclude:
                                if dtname.endswith(sel_dtname) or (dname + '/*' == sel_dtname):
                                    matched = False
                                    break
                    if not matched:
                        continue
                    
                    tid_dtnames[tid] = dtname
                    self.trks[dtname] = Track(tname, trktype, fmt=fmt, unit=unit, srate=srate, mindisp=mindisp, maxdisp=maxdisp, col=col, montype=montype, gain=gain, offset=offset, dname=dname)
                elif packet_type == 1:  # rec
                    if len(buf) < pos + 12:
                        continue

                    infolen = unpack_w(buf, pos)[0]; pos += 2
                    dt = unpack_d(buf, pos)[0]; pos += 8
                    tid = unpack_w(buf, pos)[0]; pos += 2
                    pos = 2 + infolen

                    if tid not in tid_dtnames:  # tid not to read
                        continue
                    dtname = tid_dtnames[tid]

                    if dtname not in self.trks:
                        continue
                    trk = self.trks[dtname]

                    if self.dtstart == 0 or (dt > 0 and dt < self.dtstart):
                        self.dtstart = dt
                    
                    if dt > self.dtend:
                        self.dtend = dt

                    if skip_records:  # skip records
                        continue

                    fmtlen = 4
                    rec_dtend = dt
                    if trk.type == 1:  # wav
                        fmtcode, fmtlen = FMT_TYPE_LEN[trk.fmt]
                        if len(buf) < pos + 4:
                            continue
                        nsamp = unpack_dw(buf, pos)[0]; pos += 4
                        if len(buf) < pos + nsamp * fmtlen:
                            continue
                        samps = np.ndarray((nsamp,), buffer=buf, offset=pos, dtype=np.dtype(fmtcode)); pos += nsamp * fmtlen
                        trk.recs.append({'dt': dt, 'val': samps})
                        if trk.srate > 0:
                            rec_dtend = dt + len(samps) / trk.srate
                            if rec_dtend > self.dtend:
                                self.dtend = rec_dtend
                    elif trk.type == 2:  # num
                        fmtcode, fmtlen = FMT_TYPE_LEN[trk.fmt]
                        if len(buf) < pos + fmtlen:
                            continue
                        val = unpack_from(fmtcode, buf, pos)[0]; pos += fmtlen
                        trk.recs.append({'dt': dt, 'val': val})
                    elif trk.type == 5:  # str
                        pos += 4  # skip
                        if len(buf) < pos + 4:
                            continue
                        s, pos = unpack_str(buf, pos)
                        trk.recs.append({'dt': dt, 'val': s})
                elif packet_type == 6:  # cmd
                    cmd = unpack_b(buf, pos)[0]; pos += 1
                    if cmd == 6:  # reset events
                        if 'EVENT' in self.trks:
                            self.trks['EVENT'].recs = []
                    elif cmd == 5:  # trk order
                        cnt = unpack_w(buf, pos)[0]
                        pos += 2
                        tids = np.ndarray((cnt,), buffer=buf, offset=pos, dtype=np.dtype('H'))
                        self.order = []
                        for tid in tids:
                            if tid in tid_dtnames:
                                self.order.append(tid_dtnames[tid])
                        pos += cnt * 2

        except EOFError:
            pass

        # sorting tracks
        # for trk in self.trks.values():
        #     trk.recs.sort(key=lambda r:r['dt'])

        f.close()
        return True

    def run_filter(self, run, cfg):
        # find input tracks
        track_names = []  # input 의 트랙명을 순서대로 저장
        srate = 0
        last_dtname = 0
        for inp in cfg['inputs']:
            matched_dtname = None
            for dtname, trk in self.trks.items():  # find track
                if (inp['type'].lower() == 'wav') and (trk.type != 1):
                    continue
                if (inp['type'].lower() == 'num') and (trk.type != 2):
                    continue
                if (inp['type'].lower() == 'str') and (trk.type != 5):
                    continue
                if trk.name.lower().startswith(inp['name'].lower()) or\
                    (inp['name'].lower()[:3] == 'ecg') and (trk.name.lower().startswith('ecg' + inp['name'].lower()[3:])) or \
                    (inp['name'].lower()[:3] == 'art') and (trk.name.lower().startswith('abp' + inp['name'].lower()[3:])) or \
                    (inp['name'].lower()[:3] == 'abp') and (trk.name.lower().startswith('art' + inp['name'].lower()[3:])):
                    matched_dtname = trk.dtname
                    if trk.srate:
                        if srate < trk.srate:
                            srate = trk.srate
                    last_dtname = dtname
                    break
            if not matched_dtname:
                print(inp['name'] + ' not found')
                quit()
            track_names.append(matched_dtname)

        if srate == 0:
            srate = 100

        # extract samples
        vals = self.to_numpy(track_names, 1 / srate).flatten()

        # output records
        output_recs = []
        for output in cfg['outputs']:
            output_recs.append([])

        # run filter
        # TODO: multi track inputs
        # TODO: numeric / string track inputs
        for dtstart_seg in np.arange(self.dtstart, self.dtend, cfg['interval'] - cfg['overlap']):
            dtend_seg = dtstart_seg + cfg['interval']
            idx_dtstart = int((dtstart_seg - self.dtstart) * srate)
            idx_dtend = int((dtend_seg - self.dtstart) * srate)
            outputs = run({cfg['inputs'][0]['name']: {'srate':srate, 'vals': vals[idx_dtstart:idx_dtend]}}, {}, cfg)
            if outputs is None:
                continue
            for i in range(len(cfg['outputs'])):
                output = outputs[i]
                for rec in output:  # convert relative time to absolute time
                    rec['dt'] += dtstart_seg
                    output_recs[i].append(rec)

        # add output tracks
        for i in range(len(cfg['outputs'])):
            out = cfg['outputs'][i]
            unit = out['unit'] if 'unit' in out else ''
            srate = out['srate'] if 'srate' in out else 0
            mindisp = out['min'] if 'min' in out else 0
            maxdisp = out['max'] if 'max' in out else 1
            self.add_track(out['name'], output_recs[i], after=last_dtname, srate=srate, unit=unit, mindisp=mindisp, maxdisp=maxdisp)
            if out['name'] in self.trks:
                last_dtname = out['name']


def vital_recs(ipath, track_names=None, interval=None, return_timestamp=False, return_datetime=False, return_pandas=False, exclude=None):
    """Constructor of the VitalFile class.
    :param ipath: file path to read
    :param interval: interval of each sample. if None, maximum resolution. if there is no wave tracks, 1 sec
    :param return_timestamp: return unix timestamp
    :param return_datetime: return datetime of each sample at first column
    :param return_pandas: return pandas dataframe
    """
    # convert string like "SNUADC/ECG_II,Solar8000" to the list
    if isinstance(track_names, str):
        if track_names.find(',') != -1:
            track_names = track_names.split(',')
        else:
            track_names = [track_names]

    vf = VitalFile(ipath, track_names, exclude=exclude)
    if return_pandas:
        return vf.to_pandas(track_names, interval, return_datetime, return_timestamp)
    return vf.to_numpy(track_names, interval, return_datetime, return_timestamp)


def vital_trks(ipath):
    """Read track names from the vital file
    :param ipath: file path to read
    """
    ret = []
    vf = VitalFile(ipath, skip_records=True)
    return vf.get_track_names()


if __name__ == '__main__':
    vf = VitalFile('https://vitaldb.net/1.vital')
    vf.to_wfdb('Y:\\Release\\ex11_wfdb\\1', interval=1/100)
    quit()

    vf = VitalFile('Z:\\C1\\202206\\220601\\C1_220601_092848.vital')
    new_vf = vf.anonymize_vital()
    print(new_vf.dtstart, new_vf.dtend)
    print(new_vf.trks['Intellivue/CO2_WAV'].recs[0])
    new_vf.to_vital('C:\\Users\\vitallab\\OneDrive - SNU\\바탕 화면\\test.vital')
    quit()

    import pyvital.filters.ecg_hrv as f
    vf = VitalFile('https://vitaldb.net/1.vital')
    vf.run_filter(f.run, f.cfg)
    vf.to_vital('filtered.vital')
    #vf.remove_devices(['SNUADC', 'BIS'])
    #vf.to_vital('edited.vital')
    quit()

    vf = VitalFile('https://vitaldb.net/1.vital')
    vf.to_vital('1.vital')
    quit()
    
    TRACK_NAMES = ['ECG_II', 'ART']
    vf = VitalFile(1, TRACK_NAMES)  # load the first case from open dataset
    print(f'{len(vf.get_track_names())} tracks')
    vals = vf.to_numpy(TRACK_NAMES, 1/100)
    print(vals)
    quit()

    TRACK_NAMES = ['SNUADC/ECG_II', 'Solar 8000M/HR']
    vf = VitalFile("https://vitaldb.net/1.vital")
    vals = vf.to_numpy(TRACK_NAMES, 1/100)
    print(vals)
    quit()

    vf = VitalFile(['1-1.vital', '1-2.vital'])
    vf.to_vital('merged.vital')
    quit()
    
    TRACK_NAMES = ['SNUADC/ECG_II', 'Solar 8000M/HR']
    vf = VitalFile("https://vitaldb.net/1.vital")
    vf.to_vital('1.vital')
    quit()

    #df = vf.to_pandas(TRACK_NAMES, 1/60, return_datetime=True)
    #df.to_csv('1.csv', index=False, encoding='utf-8-sig')
    quit()

    
    #vals = vital_recs("https://vitaldb.net/1.vital", return_timestamp=True, return_pandas=True)
    #print(vals)
    vf = VitalFile("https://vitaldb.net/1.vital")
    print(vf.get_track_names())
    df = vf.to_pandas(TRACK_NAMES, 1)
    print(df.describe())
    #vf.crop(300, 360)
    #vf.to_wav('1.wav', ['SNUADC/ECG_II'], 44100)
