import os
import gzip
import wave
import wfdb
import shutil
import datetime
import tempfile
import numpy as np
import pandas as pd
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

TYPE_WAV = 1
TYPE_NUM = 2
TYPE_STR = 5

COLOR_RED = 4294901760
COLOR_PINK = 4294951115
COLOR_GREEN = 4278255360
COLOR_ORANGE = 4294944000
COLOR_SKYBLUE = 4287090426
COLOR_TAN = 4291998860
COLOR_YELLOW = 4294967040
COLOR_WHITE = 0xffffff

class Track:
    def __init__(self, name, type=2, col=None, montype=0, dname='', unit='', fmt=1, srate=0, gain=1.0, offset=0.0, mindisp=0, maxdisp=0, recs=None):
        self.type = type
        self.fmt = fmt
        self.name = name
        self.srate = srate
        self.unit = unit
        self.mindisp = mindisp
        self.maxdisp = maxdisp
        self.gain = gain
        self.offset = offset
        if col is None:
            self.col = Track.find_color(name)
        else:
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

    def find_color(name):
        if name in {'I', 'II', 'III', 'V', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'aVR', 'aVL', 'aVF', 'MLII',
                'DeltaQTc', 'HR', 'PVC', 'QT', 'QT-HR', 'QTc', 'ST-I', 'ST-II', 'ST-III', 'ST-V', 'PULSE'}:
            return COLOR_GREEN
        elif name in {'ABPSys', 'ABPDias', 'ABPMean', 'PAPSys', 'PAPDias', 'PAPMean'}:
            return COLOR_RED
        elif name in {'Pleth', 'SpO2', 'Pulse (SpO2)'}:
            return COLOR_SKYBLUE
        elif name in {'CVP'}:
            return COLOR_ORANGE
        elif name in {'CO', 'CI', 'SV', 'SVI'}:
            return COLOR_PINK
        elif name in {'Resp', 'RR', 'RESP'}:
            return COLOR_YELLOW
        return COLOR_WHITE
    
    def __repr__(self):
        return f'Track(\'{self.name}\', \'{self.type}\', \'{self.col}\', \'{self.montype}\', \'{self.dname}\', \'{self.unit}\', \'{self.fmt}\', \'{self.srate}\', \'{self.gain}\', \'{self.offset}\', \'{self.mindisp}\', \'{self.maxdisp}\', \'{self.recs}\')'    

# 4 byte L (unsigned) l (signed)
# 2 byte H (unsigned) h (signed)
# 1 byte B (unsigned) b (signed)
FMT_TYPE_LEN = {1: ('f', 4), 2: ('d', 8), 3: ('b', 1), 4: ('B', 1), 5: ('h', 2), 6: ('H', 2), 7: ('l', 4), 8: ('L', 4)}

TRACK_INFO = {
    'SNUADC/ART': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'SNUADC/ECG_II': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': COLOR_GREEN}, 
    'SNUADC/ECG_V5': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': COLOR_GREEN}, 
    'SNUADC/PLETH': {'srate': 500.0, 'maxdisp': 100.0, 'col': COLOR_SKYBLUE}, 
    'SNUADC/CVP': {'unit': 'cmH2O', 'srate': 500.0, 'maxdisp': 30.0, 'col': COLOR_ORANGE}, 
    'SNUADC/FEM': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': COLOR_RED}, 

    'SNUADCM/ART': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'SNUADCM/ECG_II': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': COLOR_GREEN}, 
    'SNUADCM/ECG_V5': {'unit': 'mV', 'srate': 500.0, 'mindisp': -1.0, 'maxdisp': 2.5, 'col': COLOR_GREEN}, 
    'SNUADCM/PLETH': {'srate': 500.0, 'maxdisp': 100.0, 'col': COLOR_SKYBLUE}, 
    'SNUADCM/CVP': {'unit': 'cmH2O', 'srate': 500.0, 'maxdisp': 30.0, 'col': COLOR_ORANGE}, 
    'SNUADCM/FEM': {'unit': 'mmHg', 'srate': 500.0, 'maxdisp': 200.0, 'col': COLOR_RED}, 

    'Solar8000/HR': {'unit': '/min', 'mindisp': 30.0, 'maxdisp': 150.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_I': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_II': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_III': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_AVL': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_AVR': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ST_AVF': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/ART_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/ART_SBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/ART_DBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/PLETH_SPO2': {'mindisp': 90.0, 'maxdisp': 100.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/PLETH_HR': {'mindisp': 50.0, 'maxdisp': 150.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/BT': {'unit': 'C', 'mindisp': 20.0, 'maxdisp': 40.0, 'col': COLOR_TAN}, 
    'Solar8000/VENT_MAWP': {'unit': 'mbar', 'maxdisp': 20.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/ST_V5': {'unit': 'mm', 'mindisp': -3.0, 'maxdisp': 3.0, 'col': COLOR_GREEN}, 
    'Solar8000/NIBP_MBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/NIBP_SBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/NIBP_DBP': {'unit': 'mmHg', 'maxdisp': 200.0}, 
    'Solar8000/VENT_PIP': {'unit': 'mbar', 'mindisp': 5.0, 'maxdisp': 25.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_RR': {'unit': '/min', 'maxdisp': 50.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_MV': {'unit': 'L/min', 'maxdisp': 8.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_TV': {'unit': 'mL', 'maxdisp': 1000.0, 'col': COLOR_SKYBLUE},
    'Solar8000/VENT_PPLAT': {'unit': 'mbar', 'maxdisp': 20.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/GAS2_AGENT': {'col': COLOR_ORANGE},
    'Solar8000/GAS2_EXPIRED': {'unit': '%', 'maxdisp': 10.0, 'col': COLOR_ORANGE}, 
    'Solar8000/GAS2_INSPIRED': {'unit': '%', 'maxdisp': 10.0, 'col': COLOR_ORANGE}, 
    'Solar8000/ETCO2': {'unit': 'mmHg', 'maxdisp': 60.0, 'col': COLOR_YELLOW}, 
    'Solar8000/INCO2': {'unit': 'mmHg', 'maxdisp': 60.0, 'col': COLOR_YELLOW}, 
    'Solar8000/RR_CO2': {'unit': '/min', 'maxdisp': 50.0, 'col': COLOR_YELLOW}, 
    'Solar8000/FEO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/VENT_INSP_TM': {'unit': 'sec', 'maxdisp': 10.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_SET_TV': {'unit': 'mL', 'maxdisp': 800.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_SET_PCP': {'unit': 'cmH2O', 'maxdisp': 40.0, 'col': COLOR_SKYBLUE}, 
    'Solar8000/VENT_SET_FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Solar8000/RR': {'unit': '/min', 'maxdisp': 50.0, 'col': COLOR_YELLOW},
    'Solar8000/CVP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': COLOR_ORANGE}, 
    'Solar8000/FEM_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/FEM_SBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/FEM_DBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'Solar8000/PA_MBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': COLOR_RED}, 
    'Solar8000/PA_SBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': COLOR_RED}, 
    'Solar8000/PA_DBP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': COLOR_RED}, 
    'Solar8000/VENT_MEAS_PEEP': {'unit': 'hPa'}, 
    'Solar8000/VENT_COMPL': {'unit': 'mL/cmH2O', 'mindisp': 17.0, 'maxdisp': 17.0}, 

    'Primus/CO2': {'unit': 'mmHg', 'srate': 62.5, 'maxdisp': 60.0, 'col': COLOR_YELLOW}, 
    'Primus/AWP': {'unit': 'hPa', 'srate': 62.5, 'mindisp': -10.0, 'maxdisp': 30.0}, 
    'Primus/INSP_SEVO': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/EXP_SEVO': {'unit': 'kPa', 'maxdisp': 10.0}, 
    'Primus/PAMB_MBAR': {'unit': 'mbar', 'maxdisp': 1500.0}, 
    'Primus/MAWP_MBAR': {'unit': 'mbar', 'maxdisp': 40.0}, 
    'Primus/MAC': {'maxdisp': 2.0}, 
    'Primus/VENT_LEAK': {'unit': 'mL/min', 'maxdisp': 1000.0}, 
    'Primus/INCO2': {'unit': 'mmHg', 'maxdisp': 5.0},
    'Primus/ETCO2': {'unit': 'mmHg', 'maxdisp': 50.0, 'col': COLOR_YELLOW}, 
    'Primus/FEO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FIN2O': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/FEN2O': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/SET_FIO2': {'unit': '%', 'maxdisp': 100.0}, 
    'Primus/SET_FRESH_FLOW': {'unit': 'mL/min', 'maxdisp': 10000.0}, 
    'Primus/SET_AGE': {'maxdisp': 100.0}, 
    'Primus/PIP_MBAR': {'unit': 'mbar', 'mindisp': 5.0, 'maxdisp': 25.0, 'col': COLOR_SKYBLUE}, 
    'Primus/COMPLIANCE': {'unit': 'mL / mbar', 'maxdisp': 100.0}, 
    'Primus/PPLAT_MBAR': {'unit': 'mbar', 'maxdisp': 40.0}, 
    'Primus/PEEP_MBAR': {'unit': 'mbar', 'maxdisp': 20.0, 'col': COLOR_SKYBLUE}, 
    'Primus/TV': {'unit': 'mL', 'maxdisp': 1000.0, 'col': COLOR_SKYBLUE}, 
    'Primus/MV': {'unit': 'L', 'maxdisp': 10.0, 'col': COLOR_SKYBLUE}, 
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

    'EV1000/ART_MBP': {'unit': 'mmHg', 'maxdisp': 200.0, 'col': COLOR_RED}, 
    'EV1000/CO': {'unit': 'L/min', 'mindisp': 1.0, 'maxdisp': 15.0, 'col': 4294951115}, 
    'EV1000/CI': {'unit': 'L/min/m2', 'mindisp': 1.0, 'maxdisp': 5.0, 'col': 4294951115}, 
    'EV1000/SVV': {'unit': '%', 'maxdisp': 100.0, 'col': 4294951115}, 
    'EV1000/SV': {'unit': 'ml/beat', 'mindisp': 40.0, 'maxdisp': 69.0}, 
    'EV1000/SVI': {'unit': 'ml/beat/m2', 'mindisp': 26.0, 'maxdisp': 44.0}, 
    'EV1000/CVP': {'unit': 'mmHg', 'maxdisp': 30.0, 'col': COLOR_ORANGE}, 
    'EV1000/SVR': {'unit': 'dn-s/cm5', 'mindisp': 1079.0, 'maxdisp': 1689.0}, 
    'EV1000/SVRI': {'unit': 'dn-s-m2/cm5', 'mindisp': 1673.0, 'maxdisp': 2619.0}, 

    'CardioQ/FLOW': {'unit': 'cm/sec', 'srate': 180.0, 'mindisp': -100.0, 'maxdisp': 1000.0, 'col': COLOR_GREEN}, 
    'CardioQ/ABP': {'unit': 'mmHg', 'srate': 180.0, 'maxdisp': 300.0, 'col': COLOR_RED}, 
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
    def __init__(self, ipath=None, track_names=None, header_only=False, skip_records=None, exclude=None, userid=None, maxlen=None):
        """Constructor of the VitalFile class.
        :param ipath: file path, list of file path, or caseid of open dataset.
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param header_only: read track names, dtstart, dtend, and dgmt only
        :param skip_records: alias for header_only
        """
        self.devs = {}  # dname -> Device(type, port)
        self.trks = {}  # dtname -> Track(type, fmt, unit, mindisp, maxdisp, col, srate, gain, offset, montype, dname)
        self.dtstart = 0
        self.dtend = 0
        self.dgmt = 0
        self.order = []  # optional: order of dtname
        self.ipath = ipath

        if skip_records is not None: 
            header_only = skip_records

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

        if ipath is None:
            dt = datetime.datetime.now()
            self.dtstart = dt.timestamp()
            dt = dt.replace(tzinfo=datetime.timezone.utc)
            dtutc = dt.timestamp()
            self.dgmt = -int((dtutc - self.dtstart) / 60)  # dgmt = ut - localtime in minutes. For KST, it is -540
            return
        elif isinstance(ipath, int):
            if header_only:
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
            self.load_vital(ipath, track_names, header_only, exclude, maxlen)
        elif ext == '.hea':
            self.load_wfdb(ipath, track_names, header_only, exclude)
        elif ext == '.parquet':
            if header_only:
                raise NotImplementedError
            self.load_parquet(ipath, track_names, exclude)


    def __repr__(self):
        return f'VitalFile(\'{self.ipath}\', \'{self.track_names}\', \'{self.header_only}\')'

    def get_samples(self, track_names, interval, return_datetime=False, return_timestamp=False):
        """Get track samples.
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        :return: [[samples of track1], [samples of track2]...]
        """
        if len(track_names) == 0:
            return [], ['Time'] if return_datetime or return_timestamp else [] 

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

    def add_track(self, dtname, recs, srate=0, unit='', mindisp=0, maxdisp=0, after=None, col=None):
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

        ntype = TYPE_NUM
        if srate > 0:
            ntype = TYPE_WAV
        elif isinstance(recs[0]['val'], str):
            ntype = TYPE_STR
        
        trk = Track(tname, ntype, fmt=1, srate=srate, unit=unit, mindisp=mindisp, maxdisp=maxdisp, dname=dname, recs=recs, col=col)
        self.trks[dtname] = trk

        # change track order
        if after is not None:
            if not hasattr(self, 'order') or len(self.order) == 0:
                self.order = self.get_track_names()
            if dtname in self.order:  # remove if it already exists
                self.order.remove(dtname)
            self.order.insert(self.order.index(after) + 1, dtname)
        
        return trk

    def anonymize(self, dt=datetime.datetime(2100,1,1)):
        """Move all datetimes to specific timepoint
        :param dt: datetime or unix timestamp to move. Time zone of dt will be overwitten by UTC
        """
        if isinstance(dt, datetime.datetime):
            dt = dt.replace(tzinfo=datetime.timezone.utc)
            dt = dt.timestamp()

        # 1. create a deep copy of self
        vf = deepcopy(self)
        shift = dt - vf.dtstart

        # 2. subtract dtstart from all dt of each trk rec
        for dtname in vf.trks:
            trk = vf.trks[dtname]
            for rec in trk.recs:
                if 'dt' in rec:
                    rec['dt'] += shift
                else:
                    continue

        # 3. set dtstart and dtend
        vf.dtend += shift
        vf.dtstart = dt
        vf.dgmt = 0

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

            # downsampling
            if trk.srate != int(1 / interval + 0.5):
                ret = np.take(ret, np.linspace(0, nsamp - 1, nret).astype(np.int64))

            # nan value
            ret[np.isinf(ret) | (ret > 4e9)] = np.nan

            return ret


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

        # wav, num, str tracks
        wav_track_names = []
        wav_units = []
        wav_gains = []
        wav_offsets = []
        num_track_names = []
        for track_name in track_names:
            trk = self.find_track(track_name)
            if trk is None:
                continue
            if trk.type == 1:  # wav
                wav_track_names.append(trk.dtname)
                wav_units.append(trk.unit)
                if trk.gain == 0:
                    trk.gain = 1.0
                if trk.fmt <= 2:  # 1: float, 2: double
                    wav_gains.append(0)
                    wav_offsets.append(0)
                else:
                    wav_gains.append(1 / trk.gain)
                    wav_offsets.append(int(round(-trk.offset / trk.gain)))
                # vitaldb: (cnt + trk.offset / trk.gain) * trk.gain = val
                # physionet: (cnt - baseline) / gain = val
            elif trk.type == 2:  # num
                num_track_names.append(trk.dtname)

        # save wave tracks
        df = self.to_pandas(wav_track_names, interval, return_timestamp=True)
        wav_vals = df.values[:, 1:]

        # estimate gain and offset
        for itrk in range(len(wav_track_names)):
            if wav_gains[itrk] == 0:
                minval = np.nanmin(wav_vals[:,itrk])
                maxval = np.nanmax(wav_vals[:,itrk])
                if minval == maxval:
                    newgain = 1
                else:
                    # Format 16: -32768 to +32767
                    # mapping: minval to maxval -> -32767 to 32766
                    newgain = float(32766 - (-32767)) / (maxval - minval)
                # physionet: cnt = val * gain + baseline
                # -32767 = minval * gain + baseline
                newoffset = -32767 - int(round(minval * newgain))
                # wav_cnts = wav_vals * newgain + newoffset
                wav_gains[itrk] = newgain
                wav_offsets[itrk] = newoffset

        wfdb.wrsamp(os.path.basename(opath),
            write_dir=os.path.dirname(opath),
            fs=float(1/interval), units=wav_units, 
            sig_name=wav_track_names, 
            p_signal=wav_vals, 
            adc_gain=wav_gains,
            baseline=wav_offsets,
            fmt=['16'] * len(wav_track_names))

        # df.rename(columns={'Time':'time'}, inplace=True)
        # df['time'] = (df['time'] - self.dtstart)
        # df = df.round(4)
        # ret = df.to_csv(f'{opath}w.csv.gz', encoding='utf-8-sig', index=False)

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
        if not f.write(pack_w(26)):  # header len
            return False
        if not f.write(pack_s(self.dgmt)):  # dgmt = ut - localtime
            return False
        if not f.write(pack_dw(0)):  # instance id
            return False
        if not f.write(pack_dw(0)):  # program version
            return False
        if not f.write(pack_d(self.dtstart)):  # dtstart
            return False
        if not f.write(pack_d(self.dtend)):  # dtend
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

        # save trkinfo
        tid = 0
        dtname_tids = {}
        for dtname, trk in self.trks.items():
            # issue tid
            tid += 1
            dtname_tids[dtname] = tid

            # find did from dname
            dname = trk.dname
            did = 0
            if dname in dname_dids:
                did = dname_dids[dname]

            # calculate the length of recs
            reclen = 0
            for rec in trk.recs:
                reclen += 17  # 1 (packet type) + 4 (rec len) + 2 (infolen) + 8 (dt) + 2 (tid)
                if trk.type == 1:  # wav
                    fmtcode, fmtlen = FMT_TYPE_LEN[trk.fmt]
                    reclen += 4 + fmtlen * len(rec['val'])
                elif trk.type == 2:  # num
                    fmtcode, fmtlen = FMT_TYPE_LEN[trk.fmt]
                    reclen += fmtlen
                elif trk.type == 5:  # str
                    reclen += 8 + len(rec['val'].encode('utf-8'))
            
            ti = pack_w(tid) + pack_b(trk.type) + pack_b(trk.fmt) + pack_str(trk.name) \
                + pack_str(trk.unit) + pack_f(trk.mindisp) + pack_f(trk.maxdisp) \
                + pack_dw(trk.col) + pack_f(trk.srate) + pack_d(trk.gain) + pack_d(trk.offset) \
                + pack_b(trk.montype) + pack_dw(did) + pack_dw(reclen)
            if not f.write(pack_b(0) + pack_dw(len(ti)) + ti):
                return False

        # save recs
        for dtname, trk in self.trks.items():
            tid = dtname_tids[dtname]
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

        if track_names is None:
            track_names = dftrks.loc[dftrks['caseid'] == caseid, 'tname']

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
                ntype = TYPE_WAV
                interval = dtvals[1,0] - dtvals[0,0]
                assert interval > 0
                srate = 1 / interval
            else:  # num
                ntype = TYPE_NUM
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
        df = pd.read_parquet(ipath)
        df = df['tname'].isin(track_names)

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
                    ntype = TYPE_WAV
                    srate = row['nval']
                elif 'sval' in row and row['sval'] is not None:
                    ntype = TYPE_STR
                    srate = 0
                elif 'nval' in row and row['nval'] is not None:
                    ntype = TYPE_NUM
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
        

    def load_wfdb(self, ipath, track_names=None, header_only=False, exclude=None):
        ipath = ipath.replace('\\', '/')
        
        isurl = not os.path.exists(ipath)
        if not isurl:
            isurl = ipath.lower().startswith('http://') or ipath.lower().startswith('https://')

        pn_dir = os.path.dirname(ipath)
        pn_dir = pn_dir.lstrip('https://physionet.org/files/')
        hea_name = os.path.splitext(os.path.basename(ipath))[0]

        # parse header
        if isurl:
            hea = wfdb.rdheader(hea_name, pn_dir=pn_dir, rd_segments=True)
        else:
            hea = wfdb.rdheader(pn_dir + '/' + hea_name, rd_segments=True)

        if not hea.base_datetime:
            self.dtstart = 0
        else:
            self.dtstart = float(hea.base_datetime.replace(tzinfo=datetime.timezone.utc).timestamp())

        # sig_name -> channel_names
        channel_names = []
        for dtname in hea.sig_name:
            if ((not track_names) or (dtname in track_names)) and ((not exclude) or dtname not in exclude):
                if dtname not in channel_names:
                    channel_names.append(dtname)

        # read waveform samples
        if isurl:
            vals, fields = wfdb.rdsamp(hea_name, pn_dir=pn_dir, channel_names=channel_names, return_res=32)
        else:
            vals, fields = wfdb.rdsamp(pn_dir + '/' + hea_name, channel_names=channel_names, return_res=32)
        
        srate = float(fields['fs'])
        assert srate >= 1

        for ich in range(len(channel_names)):
            dtname = channel_names[ich]
            trk = Track(dtname, TYPE_WAV, srate=srate)
            self.trks[dtname] = trk
            
            dtend = self.dtstart + len(vals) / srate
            if dtend > self.dtend:
                self.dtend = dtend

            # seperate with 1sec records
            for istart in range(0, len(vals), int(srate)):
                trk.recs.append({'dt': self.dtstart + istart / srate, 'val': vals[istart:istart+int(srate), ich]})

        # read numeric values (mimic3)
        numeric_filename = os.path.splitext(ipath)[0] + 'n.hea'
        if ipath.find('mimic3wdb') >= 0 or (not isurl and os.path.exists(numeric_filename)):
            try:
                # parse header for numeric value
                if isurl:
                    hea = wfdb.rdheader(hea_name + 'n', pn_dir=pn_dir, rd_segments=True)
                else:
                    hea = wfdb.rdheader(pn_dir + '/' + hea_name + 'n', rd_segments=True)
            except:
                pass
            else:
                if not hea.base_datetime:
                    dtstart = self.dtstart
                else:
                    dtstart = float(hea.base_datetime.replace(tzinfo=datetime.timezone.utc).timestamp())
                    if abs(dtstart - self.dtstart) > 48 * 60 * 60:
                        raise ValueError()
                    if dtstart < self.dtstart:
                        self.dtstart = dtstart

                # sig_name -> channel_names
                channel_names = []
                for dtname in hea.sig_name:
                    if dtname in self.trks:  # already loaded
                        continue
                    if ((not track_names) or (dtname in track_names)) and ((not exclude) or dtname not in exclude):
                        if dtname not in channel_names:
                            channel_names.append(dtname)

                # read numeric samples
                if isurl:
                    vals, fields = wfdb.rdsamp(hea_name + 'n', pn_dir=pn_dir, channel_names=channel_names)
                else:
                    vals, fields = wfdb.rdsamp(pn_dir + '/' + hea_name + 'n', channel_names=channel_names)
                
                srate = float(fields['fs'])
                assert srate > 0

                for ich in range(len(channel_names)):
                    dtname = channel_names[ich]
                    trk = Track(dtname, TYPE_NUM)
                    self.trks[dtname] = trk
                    
                    dtend = dtstart + len(vals) / srate
                    if dtend > self.dtend:
                        self.dtend = dtend

                    # read all values
                    for idx in range(len(vals)):
                        if not np.isnan(vals[idx, ich]):
                            trk.recs.append({'dt': dtstart + idx / srate, 'val': vals[idx, ich]})

        # read numeric values (mimic4)
        numeric_filename = os.path.splitext(ipath)[0] + 'n.csv.gz'
        if ipath.find('mimic4wdb') >= 0 or (not isurl and os.path.exists(numeric_filename)):
            try:
                df = pd.read_csv(numeric_filename, low_memory=False)
            except:
                pass
            else:
                if 'time' in df.columns:
                    df['time'] = hea.base_datetime.replace(tzinfo=datetime.timezone.utc).timestamp() + df['time'] / hea.counter_freq
                    for colname in df.columns:
                        if colname == 'time':
                            continue

                        dtname_unit = colname.split('[')
                        dtname = dtname_unit[0].rstrip(' ')
                        unit = dtname_unit[1].rstrip(']')

                        if ((not track_names) or (dtname in track_names)) and ((not exclude) or dtname not in exclude):
                            subdf = df[['time', colname]]
                            vals = subdf[~subdf[colname].isnull()].values
                            if pd.api.types.is_numeric_dtype(df[colname]):
                                trk = Track(dtname, TYPE_NUM, unit=unit)
                                for i in range(len(vals)):
                                    trk.recs.append({'dt': vals[i,0], 'val': vals[i,1]})
                            else:
                                trk = Track(dtname, TYPE_STR, unit=unit)
                                for i in range(len(vals)):
                                    trk.recs.append({'dt': vals[i,0], 'val': str(vals[i,1])})
                            self.trks[dtname] = trk
                        
                    self.dtend = float(df['time'].max())

    # track_names: list of dtname to read. If track_names is None, all tracks will be loaded
    # header_only: read track names only
    # exclude: track names to exclude
    def load_vital(self, ipath, track_names=None, header_only=False, exclude=None, maxlen=None):
        # check if ipath is url
        iurl = parse.urlparse(ipath)
        if iurl.scheme and iurl.netloc:
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
        if headerlen >= 26:
            self.dtstart = unpack_d(header, 10)[0]
            self.dtend = unpack_d(header, 18)[0]

        # how many bytes to skip the records in this track
        tid_reclens = {}  # tid -> reclen

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
                    if trktype == 1 or trktype == 2:
                        if fmt not in FMT_TYPE_LEN: 
                            continue
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
                    reclen = 0
                    if packet_len > pos:
                        reclen = unpack_dw(buf, pos)[0]
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
                    
                    tid_reclens[tid] = reclen

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
                        if tid in tid_reclens:
                            if tid_reclens[tid] > 5 + packet_len:
                                f.seek(tid_reclens[tid] - (5 + packet_len), 1)
                        continue
                    dtname = tid_dtnames[tid]

                    if dtname not in self.trks:
                        continue
                    trk = self.trks[dtname]

                    if self.dtstart == 0 or (dt > 0 and dt < self.dtstart):
                        self.dtstart = dt
                    
                    if dt > self.dtend:
                        self.dtend = dt

                    if header_only:  # skip records
                        continue

                    if maxlen is not None:
                        if self.dtstart > 0:
                            if dt > self.dtstart + maxlen:
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
        except Exception as e:
            print(f'Error in reading file: {e}')
            return False

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
    vf = VitalFile(ipath, header_only=True)
    return vf.get_track_names()


def list_wfdb(dbname):
    dbname = dbname.rstrip('/')
    if '.' not in dbname:
        ver = wfdb.io.download.get_version(dbname)
        dbname = f'{dbname}/{ver}'
    recs = wfdb.io.download.get_record_list(dbname)
    ret = []
    for hea_name in recs:
        if hea_name.endswith('/'):
            ret.extend(list_wfdb(f'{dbname}/{hea_name}'))
        else:
            ret.append(f'{dbname}/{hea_name}.hea')
    return ret


if __name__ == '__main__':
    VitalFile('1.vital')
    quit()
    srate = 500  # sampling rate for ecg

    # sample data from the VitalDB open dataset
    vf = VitalFile(1, ['ECG_II', 'HR'])
    ecg = vf.to_numpy('ECG_II', 1/srate).flatten()  # ecg waveform (500Hz) = [     nan      nan      nan ... 0.33651  0.435255 0.237764]
    hrs = vf.to_numpy('HR', 1).flatten()  # heart rates (1 sec) = [nan 88. nan ... nan nan nan]

    # create a new vital file
    vf = VitalFile()

    # add waveform track (ecg)
    recs = []  # 1 sec blocks for ecg track
    for istart in range(0, len(ecg), int(srate)):
        recs.append({'dt': vf.dtstart + istart / srate, 'val': ecg[istart:istart + int(srate)]})
    vf.add_track('ECG_II', recs, srate=srate, unit='mV', mindisp=0, maxdisp=0, col=COLOR_GREEN)

    # add numeric track (heart rate)
    recs = []
    for i in range(len(hrs)):
        recs.append({'dt': vf.dtstart + i, 'val': hrs[i]})
    vf.add_track('HR', recs, unit='/min', mindisp=0, maxdisp=150)

    # add string track (events)
    recs = [{'dt': vf.dtstart, 'val': 'Anesthesia Start'}, {'dt': vf.dtstart + len(ecg) / srate, 'val': 'Anesthesia End'}, ]
    vf.add_track('EVENT', recs)

    vf.to_vital('1.vital', compresslevel=9)
    quit()

    dtstart = datetime.datetime.now()
    # dtstart = datetime.datetime.now()

    # dbname = 'mitdb'
    # dbname = 'mimic3wdb'
    # ver = wfdb.io.download.get_version(dbname)
    # dbname = f'{dbname}/{ver}'
    #recs = wfdb.io.download.get_record_list(dbname)

    #urls = list_wfdb('mimic3wdb')
    # print(datetime.datetime.now() - dtstart)

    # print(recs)
    # print(len(recs))
    # quit()

    # for url in urls:
    #     print(f'Downloading {url}', end='...', flush=True)
    #     VitalFile(url).to_vital(os.path.basename(url) + '.vital')
    #     print('done')
    # quit()

    # import urllib.request
    # from bs4 import BeautifulSoup

    # tempdir = 'mimic4wdb'
    # dbname = 'mimic4wdb/0.1.0/waves/p100/p10014354/81739927'

    # dtstart = datetime.datetime.now()
    # if not os.path.exists(tempdir):
    #     os.mkdir(tempdir)
    # rooturl = 'https://physionet.org/files/' + dbname
    # html = urllib.request.urlopen(rooturl).read().decode('utf-8')
    # for link in BeautifulSoup(html, "html.parser").find_all('a'):
    #     url = rooturl + '/' + link.get('href')
    #     if url.endswith('.hea') or url.endswith('.dat') or url.endswith('.gz'):
    #         f = urllib.request.urlopen(url)
    #         with open(tempdir + '/' + os.path.basename(url), 'wb') as fo:
    #             shutil.copyfileobj(f, fo)
    # print(datetime.datetime.now() - dtstart)

    
    # dtstart = datetime.datetime.now()
    # vf = VitalFile(tempdir + '/' + os.path.basename(dbname) + ".hea")
    # print(datetime.datetime.now() - dtstart)

    # vf.to_vital('1.vital')

    # quit()

    # dtstart = datetime.datetime.now()
    # signals, fields = wfdb.rdsamp('81739927', pn_dir='mimic4wdb/0.1.0/waves/p100/p10014354/81739927')
    # print(datetime.datetime.now() - dtstart)
    # print(signals)
    # print(fields)
    # quit()

    files = os.listdir("./Download")
    for f in files:
        print(f)
        vf = VitalFile("./Download/" + f)
        print(vf.get_track_names())
    quit()
    # vf = VitalFile('https://physionet.org/files/mimic4wdb/0.1.0/waves/p100/p10014354/81739927/81739927_0001.hea', ['II', 'V'])
    # vf = VitalFile('https://physionet.org/files/mimic4wdb/0.1.0/waves/p100/p10014354/81739927/81739927.hea', ['II', 'V'])
    #vf = VitalFile(r"C:\Users\lucid\physionet.org\files\mimic4wdb\0.1.0\waves\p100\p10014354\81739927\81739927.hea")
    # vf.to_vital('mimic4.vital')
    # quit()

    VitalFile('https://vitaldb.net/1.vital').anonymize().to_vital('anonymized.vital')
    quit()

    vf = VitalFile('1.vital', ['ART', 'EEG1_WAV'])
    vf.to_wfdb('1', interval=1/500)
    vals = vf.to_numpy(['ART','EEG1_WAV'], 1/500)
    print(vals[10000:-10000])
    print(np.nanmin(vals, axis=0))
    print(np.nanmax(vals, axis=0))
    print(np.nanmax(vals, axis=0) - np.nanmin(vals, axis=0))
    print()
    vals, trks = wfdb.rdsamp('1')
    print(vals[10000:-10000])
    print(np.nanmin(vals, axis=0))
    print(np.nanmax(vals, axis=0))
    print(np.nanmax(vals, axis=0) - np.nanmin(vals, axis=0))
    quit()

    import pyvital.filters.ecg_hrv as f
    vf = VitalFile('https://vitaldb.net/2.vital')
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
