import os
import gzip
import numpy as np
import datetime
import tempfile
import shutil
import pandas as pd
import wave
import pyarrow.parquet as pq
from urllib import parse, request
from struct import pack, unpack_from, Struct
import s3fs

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


dtname_tis = {
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


# open dataset trks
dftrks = None


class VitalFile:
    """A VitalFile class.
    :param dict devs: device info
    :param dict trks: track info & recs
    :param double dtstart: file start time
    :param double dtend: flie end time
    :param float dgmt: dgmt = ut - localtime in minutes. For KST, it is -540.
    """
    
    def __init__(self, ipath, track_names=None, track_names_only=False, exclude=[], userid=None):
        """Constructor of the VitalFile class.
        :param ipath: file path, list of file path, or caseid of open dataset
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param track_names_only: read track names only
        """
        # 아래 5개 정보만 로딩하면 된다.
        self.devs = {}  # did -> devinfo (name, type, port). did = 0 represents the vital recorder
        self.trks = {}  # tid -> trkinfo (name, type, fmt, unit, mindisp, maxdisp, col, srate, gain, offset, montype, did)
        self.dtstart = 0
        self.dtend = 0
        self.dgmt = 0

        if isinstance(ipath, int):
            if track_names_only:
                raise NotImplementedError
            self.load_opendata(ipath, track_names, exclude)
            return
        elif isinstance(ipath, list):
            dname_to_dids = {}  # 최종 파일에서의 dname -> did mapping
            dtname_to_trks = {}  # 최종 파일에서의 dtname -> trk mapping
            for path in ipath:
                vf = VitalFile(path)
                if self.dtstart == 0:  # 첫 파일은 무조건 여는거
                    self.dtstart = vf.dtstart
                    self.dtend = vf.dtend
                    self.devs = vf.devs
                    self.trks = vf.trks
                    self.dgmt = vf.dgmt
                    dname_to_dids = {dev['name']: did for did, dev in vf.devs.items()}
                    dtname_to_trks = {trk['dtname']: trk for tid, trk in vf.trks.items()}
                else:  # 그 다음 파일 부터는 합쳐야 함
                    if abs(self.dtstart - vf.dtstart) > 7 * 24 * 3600:
                        # 모든 파일은 7일 이내에 있어야 한다
                        continue
                    
                    self.dtstart = min(self.dtstart, vf.dtstart)
                    self.dtend = max(self.dtend, vf.dtend)

                    for did, dev in vf.devs.items():
                        dname = dev['name']
                        if dname in dname_to_dids:
                            did = dname_to_dids[dname]
                        else:  # 처음 나왔으면
                            did = max(self.devs.keys()) + 1
                            dname_to_dids[dname] = did
                            self.devs[did] = dev
                    
                    for tid, trk in vf.trks.items():
                        dtname = trk['dtname']
                        if dtname.find('/') != -1:
                            dname, tname = dtname.split('/')
                            if dname in dname_to_dids:
                                trk['did'] = dname_to_dids[dname]
                            else:
                                continue  # did를 찾을 수 없는 장비이다
                        if dtname in dtname_to_trks:  # 기존 파일에 이미 트랙이 존재
                            selftrk = dtname_to_trks[dtname]
                            selftrk['recs'].extend(trk['recs'])
                            selftrk['tid'] = max(self.trks.keys()) + 1
                            selftrk['did'] = trk['did']
                        else:
                            tid = max(self.trks.keys()) + 1  # 새 tid를 발급
                            dtname_to_trks[dtname] = trk  # 트랙이 추가됨
                            trk['tid'] = tid
                            self.trks[tid] = trk

            # sorting tracks -> VR에서 파일을 열 때 sorting을 하기 때문에 저장 시 sorting은 불필요하다.
            #for trk in self.trks.values():
            #    trk['recs'].sort(key=lambda r:r['dt'])
            
            return

        # url 형태인 경우, 파라미터 부분을 제거한다
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

        # 포함할 트랙
        if isinstance(track_names, str):
            if track_names.find(','):
                track_names = track_names.split(',')
            else:
                track_names = [track_names]

        # 제외할 트랙
        if isinstance(exclude, str):
            if exclude.find(','):
                exclude = exclude.split(',')
            else:
                exclude = [exclude]
        exclude = set(exclude)

        if ext == '.vital':
            self.load_vital(ipath, track_names, track_names_only, exclude)
        elif ext == '.parquet':
            if track_names_only:
                raise NotImplementedError
            self.load_parquet(ipath, track_names, exclude)


    def get_samples(self, track_names, interval, return_datetime=False, return_timestamp=False):
        """Get track samples.
        :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
        :param track_names_only: read track names only
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        :return: [[samples of track1], [samples of track2]...]
        """
        if not interval:  # interval 이 지정되지 않으면 최대 해상도로 데이터 추출
            max_srate = max([trk['srate'] for trk in self.trks.values()])
            interval = 1 / max_srate

        if not interval:  # 500 Hz
            interval = 0.002

        assert interval > 0

        # 포함할 트랙
        if isinstance(track_names, str):
            if track_names.find(','):
                track_names = track_names.split(',')
            else:
                track_names = [track_names]

        # 순서를 유지하면서 중복을 없앰
        track_names = list(dict.fromkeys(track_names))
        
        if not track_names:
            track_names = [trk['dtname'] for trk in self.trks.values()]

        ret = []
        for dtname in track_names:
            col = self.get_track_samples(dtname, interval)
            ret.append(col)

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

        for tid, trk in self.trks.items():
            new_recs = []
            for rec in trk['recs']:
                if dtfrom <= rec['dt'] <= dtend:
                    new_recs.append(rec)
            self.trks[tid]['recs'] = new_recs
        self.dtstart = dtfrom
        self.dtend = dtend
        return self
        

    def get_track_names(self):
        dtnames = []
        for tid, trk in self.trks.items():
            if trk['dtname']:
                dtnames.append(trk['dtname'])
        return dtnames

    def del_track(self, dtname):
        """ delete track by name
        :param dtname: device and track name. eg) SNUADC/ECG
        """
        for tid, trk in self.trks.items():
            if trk['dtname'] == dtname:
                del self.trks[tid]
                break


    def add_track(self, dtname, recs, srate=0, unit='', mindisp=0, maxdisp=0):
        if len(recs) == 0:
            return

        if 'val' not in recs[0] or 'dt' not in recs[0]:
            return

        dname = ''
        trkdid = 0
        tname = dtname
        if dtname.find('/') >= 0:
            dname, tname = dtname.split('/')

        for devdid, dev in self.devs.items():
            if dname == dev['name']:
                trkdid = devdid
                break

        # 장치 추가
        if dname and not trkdid:
            trkdid = max(self.devs.keys()) + 1
            self.devs[trkdid] = {'name': dname, 'type': dname, 'port': ''}

        # 트랙 종류 판정: wav=1, num=2, str=5
        ntype = 2
        if srate > 0:
            ntype = 1
        elif isinstance(recs[0]['val'], str):
            ntype = 5

        tid = max(self.trks.keys()) + 1
        self.trks[tid] = {
            'type': ntype, 
            'fmt': 1, # float32
            'dtname': dtname,
            'name': tname,
            'srate': srate,
            'unit': unit,
            'mindisp': mindisp,
            'maxdisp': maxdisp,
            'gain': 1.0,
            'offset': 0.0,
            'col': 0xffffff,
            'montype': 0,
            'did': trkdid,
            'recs': recs}


    def get_track_samples(self, dtname, interval):
        """Get samples of each track.
        :param dtname: track name
        :param interval: interval of samples in sec. if None, maximum resolution. if no resolution, 1/500
        """
        if self.dtend <= self.dtstart:
            return []

        # 리턴 할 길이
        nret = int(np.ceil((self.dtend - self.dtstart) / interval))

        trk = self.find_track(dtname)
        if trk:
            if trk['type'] == 2:  # numeric track
                ret = np.full(nret, np.nan, dtype=np.float32)  # create a dense array
                for rec in trk['recs']:  # copy values
                    idx = int((rec['dt'] - self.dtstart) / interval)
                    if idx < 0:
                        idx = 0
                    elif idx >= nret:
                        idx = nret - 1
                    ret[idx] = rec['val']
                # if return_pandas:  # 현재 pandas sparse data를 to_parquet 함수에서 지원하지 않음
                #     return pd.Series(pd.arrays.SparseArray(ret))
                return ret
            elif trk['type'] == 5:  # str track
                ret = np.full(nret, np.nan, dtype='object')  # create a dense array
                for rec in trk['recs']:  # copy values
                    idx = int((rec['dt'] - self.dtstart) / interval)
                    if idx < 0:
                        idx = 0
                    elif idx >= nret:
                        idx = nret - 1
                    ret[idx] = rec['val']
                return ret
            elif trk['type'] == 1:  # wave track
                srate = trk['srate']
                recs = trk['recs']

                # 자신의 srate 만큼 공간을 미리 확보
                nsamp = int(np.ceil((self.dtend - self.dtstart) * srate))
                ret = np.full(nsamp, np.nan, dtype=np.float32)

                # 실제 샘플을 가져와 채움
                for rec in recs:
                    sidx = int(np.ceil((rec['dt'] - self.dtstart) * srate))
                    eidx = sidx + len(rec['val'])
                    srecidx = 0
                    erecidx = len(rec['val'])
                    if sidx < 0:  # self.dtstart 이전이면
                        srecidx -= sidx
                        sidx = 0
                    if eidx > nsamp:  # self.dtend 이후이면
                        erecidx -= (eidx - nsamp)
                        eidx = nsamp
                    ret[sidx:eidx] = rec['val'][srecidx:erecidx]

                # gain offset 변환
                if trk['fmt'] > 2:  # 1: float, 2: double
                    ret *= trk['gain']
                    ret += trk['offset']

                # 업샘플
                
                # 다운샘플
                if srate != int(1 / interval + 0.5):
                    ret = np.take(ret, np.linspace(0, nsamp - 1, nret).astype(np.int64))

                return ret

        # 트랙을 찾을 수 없을 때
        return np.full(nret, np.nan)


    def find_track(self, dtname):
        """Find track from dtname
        :param dtname: device and track name. eg) SNUADC/ECG_II
        """
        dname = None
        tname = dtname
        if dtname.find('/') != -1:
            dname, tname = dtname.split('/')

        for trk in self.trks.values():  # find track
            if trk['name'] == tname:
                did = trk['did']
                if did == 0 or not dname:
                    return trk                    
                if did in self.devs:
                    dev = self.devs[did]
                    if 'name' in dev and dname == dev['name']:
                        return trk

        return None


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


    def to_vital(self, opath, compresslevel=9):
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
        for did, dev in self.devs.items():
            if did == 0: 
                continue
            ddata = pack_dw(did) + pack_str(dev['type']) + pack_str(dev['name']) + pack_str(dev['port'])
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

    save_vital = to_vital

    def to_parquet(self, opath):
        """ save as parquet file
        """
        rows = []
        for _, trk in self.trks.items():
            dtname = trk['name']
            dname = ''
            did = trk['did']
            if did in self.devs:
                dev = self.devs[did]
                if 'name' in dev:
                    dname = dev['name']
                    dtname = dname + '/' + dtname  # 장비명을 앞에 붙임

            # 웨이브 트랙이면 대략 1초 단위로 이어붙임
            # parquet 파일에서 특별한 길이 제한은 없음
            newrecs = []
            if trk['type'] == 1 and trk['srate'] > 0:
                srate = trk['srate']
                newrec = {}
                for rec in trk['recs']:
                    if not newrec:  # 첫 샘플
                        newrec = rec
                    elif abs(newrec['dt'] + len(newrec['val']) / srate - rec['dt']) < 1.1 / srate and len(newrec['val']) < srate:
                        # 이전 샘플에서 이어짐
                        newrec['val'] = np.concatenate((newrec['val'], rec['val']))
                    else:  # 이어지지 않음
                        newrecs.append(newrec)
                        newrec = rec
                if newrec:
                    newrecs.append(newrec)
                trk['recs'] = newrecs

            for rec in trk['recs']:
                row = {'tname': dtname, 'dt': rec['dt']}
                if trk['type'] == 1:  # wav
                    vals = rec['val'].astype(np.float32)
                    if trk['fmt'] > 2:  # 1: float, 2: double
                        vals *= trk['gain']
                        vals += trk['offset']
                    row['wval'] = vals.tobytes()
                    row['nval'] = trk['srate']
                elif trk['type'] == 2:  # num
                    # row['val'] = pack_f(np.float32(rec['val']))
                    row['nval'] = rec['val']
                elif trk['type'] == 5:  # str
                    row['sval'] = rec['val']
                rows.append(row)

        df = pd.DataFrame(rows)
        if 'nval' in df:
            df['nval'] = df['nval'].astype(np.float32)
        
        df.to_parquet(opath, compression='gzip')


    def load_opendata(self, caseid, track_names, exclude):
        global dftrks
        if not caseid:
            return
        if dftrks is None:  # 여러번 실행 시 한번만 로딩 되면 됨
            dftrks = pd.read_csv("https://api.vitaldb.net/trks")

        trks = dftrks.loc[dftrks['caseid'] == caseid]
        dname_to_dids = {}
        dtname_to_tids = {}
        for _, row in trks.iterrows():
            dtname = row['tname']
            tid = row['tid']

            # 포함 트랙, 제외 트랙
            if track_names:
                if dtname not in track_names:
                    continue
            if exclude:
                if dtname in exclude:
                    continue

            # 장비명을 지정
            dname = ''
            did = 0
            tname = dtname
            if dtname.find('/') >= 0:
                dname, tname = dtname.split('/')

            if dname:
                if dname in dname_to_dids:
                    did = dname_to_dids[dname]
                else:  # 처음 나왔으면
                    did = len(dname_to_dids) + 1
                    dname_to_dids[dname] = did
                    self.devs[did] = {'name': dname, 'type': dname, 'port': ''}

            # 실제 레코드를 읽음
            try:
                url = 'https://api.vitaldb.net/' + tid
                dtvals = pd.read_csv(url, na_values='-nan(ind)').values
            except:
                return
            if len(dtvals) == 0:
                return

            # tid를 발급
            tid = 0
            if dtname in dtname_to_tids:
                tid = dtname_to_tids[dtname]
            else:  # 처음 나왔으면
                tid = len(dtname_to_tids) + 1  # tid를 발급
                dtname_to_tids[dtname] = tid

                # open dataset 은 string 이 없기 때문에 반드시 num 혹은 wav
                # 구분은 시간행에 결측값이 있는지로 이루어짐
                if np.isnan(dtvals[:,0]).any():  # wav
                    ntype = 1
                    interval = dtvals[1,0] - dtvals[0,0]
                    assert interval > 0
                    srate = 1 / interval
                else:  # num
                    ntype = 2  
                    srate = 0

                # 트랙명으로부터 가져온 기본 트랙 정보
                default_ti = {'unit': '', 'mindisp': 0, 'maxdisp': 0, 'col': 0xffffff, 'gain': 1.0, 'offset': 0.0, 'montype': 0}
                if dtname in dtname_tis:
                    trk = {**default_ti, **dtname_tis[dtname]}
                else:
                    trk = dict(default_ti)

                trk['dtname'] = dtname
                trk['name'] = tname
                trk['type'] = ntype
                trk['fmt'] = 1  # float32
                trk['srate'] = srate
                trk['did'] = did
                trk['recs'] = []

                self.trks[tid] = trk

            # 실제 레코드를 저장
            if ntype == 1:  # wav
                assert srate > 0
                # 1초 단위로 나눠 담자
                interval = dtvals[1,0] - dtvals[0,0]
                dtvals = dtvals.astype(np.float32)
                for i in range(0, len(dtvals), int(srate)):
                    trk['recs'].append({'dt': dtvals[0,0] + i * interval, 'val': dtvals[i:i+int(srate), 1]})
            else:  # num
                for dt, val in dtvals:  # copy values
                    trk['recs'].append({'dt': dt, 'val': val})

            # open dataset 은 시작이 항상 0이고 정렬이 되어있다
            dt = dtvals[-1,0]
            if dt > self.dtend:
                self.dtend = dt

        return

    def load_parquet(self, ipath, track_names, exclude):
        dname_to_dids = {}
        dtname_to_tids = {}

        filts = None
        if track_names:
            filts = [['tname', 'in', track_names]]
        df = pq.read_table(ipath, filters=filts).to_pandas()

        # 아래 코드도 동일하지만 filters 지원이 안된다.
        # df = pd.read_parquet(ipath)

        self.dtstart = df['dt'].min()
        self.dtend = df['dt'].max()
        for _, row in df.iterrows():
            # tname, dt, sval, wval, nval
            dtname = row['tname']
            if not dtname:
                continue

            # 포함 트랙, 제외 트랙
            if track_names:
                if dtname not in track_names:
                    continue
            if exclude:
                if dtname in exclude:
                    continue

            # 장비명을 지정
            dname = ''
            did = 0
            tname = dtname
            if dtname.find('/') >= 0:
                dname, tname = dtname.split('/')

            if dname:
                if dname in dname_to_dids:
                    did = dname_to_dids[dname]
                else:  # 처음 나왔으면
                    did = len(dname_to_dids) + 1
                    dname_to_dids[dname] = did
                    self.devs[did] = {'name': dname, 'type': dname, 'port': ''}

            # tid를 발급
            tid = 0
            if dtname in dtname_to_tids:
                tid = dtname_to_tids[dtname]
            else:  # 처음 나왔으면
                tid = len(dtname_to_tids) + 1  # tid를 발급
                dtname_to_tids[dtname] = tid
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

                # 트랙명으로부터 가져온 기본 트랙 정보
                default_ti = {'unit': '', 'mindisp': 0, 'maxdisp': 0, 'col': 0xffffff, 'gain': 1.0, 'offset': 0.0, 'montype': 0}
                if dtname in dtname_tis:
                    trk = {**default_ti, **dtname_tis[dtname]}
                else:
                    trk = dict(default_ti)

                trk['dtname'] = dtname
                trk['name'] = tname
                trk['type'] = ntype
                trk['fmt'] = 1  # float32
                trk['srate'] = srate
                trk['did'] = did
                trk['recs'] = []

                self.trks[tid] = trk

            # 실제 레코드를 읽음
            trk = self.trks[tid]
            rec = {'dt': row['dt']}
            if trk['type'] == 1:  # wav
                rec['val'] = np.frombuffer(row['wval'], dtype=np.float32)
                #rec['val'] = np.array(Struct('<{}f'.format(len(row['wval']) // 4)).unpack_from(row['wval'], 0), dtype=np.float32)
                
                # TODO: dtend가 부정확할 수 있으므로 조정 필요
            elif trk['type'] == 2:  # num
                rec['val'] = row['nval']
            elif trk['type'] == 5:  # str
                rec['val'] = row['sval']
            else:
                continue

            trk['recs'].append(rec)
        

    # track_names: 로딩을 원하는 dtname 의 리스트. track_names가 None 이면 모든 트랙이 읽혀짐
    # track_names_only: 트랙명만 읽고 싶을 때
    # exclude: 제외할 트랙
    def load_vital(self, ipath, track_names=None, track_names_only=False, exclude=[]):
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
        header = f.read(headerlen)  # header 전체를 읽음

        self.dgmt = unpack_s(header, 0)[0]  # dgmt = ut - localtime

        # parse body
        try:
            sel_tids = set()
            while True:
                buf = f.read(5)
                if buf == b'':
                    break
                pos = 0

                packet_type = unpack_b(buf, pos)[0]; pos += 1
                packet_len = unpack_dw(buf, pos)[0]; pos += 4

                if packet_len > 1000000: # 1개의 패킷이 1MB 이상이면
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
                    if len(buf) > pos + 4:  # port는 없을 수 있다
                        port, pos = unpack_str(buf, pos)
                    if not name:
                        name = devtype
                    self.devs[did] = {'name': name, 'type': devtype, 'port': port}
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
                    if did and did in self.devs:
                        if did and did in self.devs:
                            dname = self.devs[did]['name']
                        dtname = dname + '/' + tname
                    else:
                        dtname = tname

                    matched = False
                    if not track_names:  # 사용자가 특정 트랙만 읽으라고 했을 때
                        matched = True
                    elif dtname in track_names:  # dtname (현재 읽고 있는 트랙명)이 track_names에 지정된 것과 정확히 일치할 때
                        matched = True
                    else:  # 정확히 일치하지는 않을 때
                        for sel_dtname in track_names:
                            if dtname.endswith('/' + sel_dtname) or (dname + '/*' == sel_dtname): # 트랙명만 지정 or 특정 장비의 모든 트랙일 때
                                matched = True
                                break

                    if exclude and matched:  # 제외해야할 트랙이 있을 때
                        if dtname in exclude:  # 제외해야할 트랙명과 정확히 일치할 때
                            matched = False
                        else:  # 정확히 일치하지는 않을 때
                            for sel_dtname in exclude:
                                if dtname.endswith('/' + sel_dtname) or (dname + '/*' == sel_dtname): # 트랙명만 지정 or 특정 장비의 모든 트랙일 때
                                    matched = False
                                    break
                    
                    if not matched:
                        continue
                    
                    sel_tids.add(tid)  # sel_tids 는 무조건 존재하고 앞으로는 sel_tids의 트랙만 로딩한다
                    self.trks[tid] = {'name': tname, 'dtname': dtname, 'type': trktype, 'fmt': fmt, 'unit': unit, 'srate': srate,
                                      'mindisp': mindisp, 'maxdisp': maxdisp, 'col': col, 'montype': montype,
                                      'gain': gain, 'offset': offset, 'did': did, 'recs': []}
                elif packet_type == 1:  # rec
                    if len(buf) < pos + 12:
                        continue

                    infolen = unpack_w(buf, pos)[0]; pos += 2
                    dt = unpack_d(buf, pos)[0]; pos += 8
                    tid = unpack_w(buf, pos)[0]; pos += 2
                    pos = 2 + infolen

                    if self.dtstart == 0 or (dt > 0 and dt < self.dtstart):
                        self.dtstart = dt
                    
                    if dt > self.dtend:
                        self.dtend = dt

                    if track_names_only:  # track_name 만 읽을 때
                        continue

                    if tid not in self.trks:  # 이전 정보가 없는 트랙이거나
                        continue

                    if tid not in sel_tids:  # 사용자가 트랙 지정을 했는데 그 트랙이 아니면
                        continue

                    trk = self.trks[tid]

                    fmtlen = 4
                    # gain, offset 변환은 하지 않은 raw data 상태로만 로딩한다.
                    # 항상 이 변환이 필요하지 않기 때문에 변환은 나중에 한다.
                    rec_dtend = dt
                    if trk['type'] == 1:  # wav
                        fmtcode, fmtlen = parse_fmt(trk['fmt'])
                        if len(buf) < pos + 4:
                            continue
                        nsamp = unpack_dw(buf, pos)[0]; pos += 4
                        if len(buf) < pos + nsamp * fmtlen:
                            continue
                        samps = np.ndarray((nsamp,), buffer=buf, offset=pos, dtype=np.dtype(fmtcode)); pos += nsamp * fmtlen
                        trk['recs'].append({'dt': dt, 'val': samps})
                        
                        if trk['srate'] > 0:
                            rec_dtend = dt + len(samps) / trk['srate']
                            if rec_dtend > self.dtend:
                                self.dtend = rec_dtend
                    elif trk['type'] == 2:  # num
                        fmtcode, fmtlen = parse_fmt(trk['fmt'])
                        if len(buf) < pos + fmtlen:
                            continue
                        val = unpack_from(fmtcode, buf, pos)[0]; pos += fmtlen
                        trk['recs'].append({'dt': dt, 'val': val})
                    elif trk['type'] == 5:  # str
                        pos += 4  # skip
                        if len(buf) < pos + 4:
                            continue
                        s, pos = unpack_str(buf, pos)
                        trk['recs'].append({'dt': dt, 'val': s})
                elif packet_type == 6:  # cmd
                    cmd = unpack_b(buf, pos)[0]; pos += 1
                    if cmd == 6:  # reset events
                        evt_trk = self.find_track('/EVENT')
                        if evt_trk:
                            evt_trk['recs'] = []
                    elif cmd == 5:  # trk order
                        cnt = unpack_w(buf, pos)[0]; pos += 2
                        self.trkorder = np.ndarray((cnt,), buffer=buf, offset=pos, dtype=np.dtype('H')); pos += cnt * 2

        except EOFError:
            pass

        # sorting tracks
        # for trk in self.trks.values():
        #     trk['recs'].sort(key=lambda r:r['dt'])

        f.close()
        return True


def vital_recs(ipath, track_names=None, interval=None, return_timestamp=False, return_datetime=False, return_pandas=False, exclude=[]):
    """Constructor of the VitalFile class.
    :param ipath: file path to read
    :param track_names: list of track names, eg) ['SNUADC/ECG', 'Solar 8000/HR']
    :param interval: interval of each samples. if None, maximum resolution. wave 트랙이 없으면 0.002 초 (500Hz)
    :param return_timestamp: 
    :param return_datetime: 
    :param return_pandas: 
    """
    # 만일 SNUADC/ECG_II,Solar8000 형태의 문자열이면?
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
    # 트랙 목록만 읽어옴
    ret = []
    vf = VitalFile(ipath, track_names_only=True)
    for trk in vf.trks.values():
        tname = trk['name']
        dname = ''
        did = trk['did']
        if did in vf.devs:
            dev = vf.devs[did]
            if 'name' in dev:
                dname = dev['name']
        ret.append(dname + '/' + tname)
    return ret


if __name__ == '__main__':
    # vf = VitalFile(['1-2.vital', '1-3.vital'])
    # vf.to_vital('merged.vital')
    # quit()
    
    #vals = vital_recs("https://vitaldb.net/samples/00001.vital", return_timestamp=True, return_pandas=True)
    #print(vals)
    vf = VitalFile("https://vitaldb.net/samples/00001.vital")
    print(vf.get_track_names())
    track_names = ['SNUADC/ECG_II', 'Solar 8000M/HR']
    df = vf.to_pandas(track_names, 1)
    print(df.describe())
    #vf.crop(300, 360)
    #vf.to_wav('1.wav', ['SNUADC/ECG_II'], 44100)
