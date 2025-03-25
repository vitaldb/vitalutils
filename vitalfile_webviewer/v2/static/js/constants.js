/**
 * Constants Module
 * Shared constants used across the application
 */

// Monitor type mapping
export const MONTYPES = {
    1: "ECG_WAV",
    2: "ECG_HR",
    3: "ECG_PVC",
    4: "IABP_WAV",
    5: "IABP_SBP",
    6: "IABP_DBP",
    7: "IABP_MBP",
    8: "PLETH_WAV",
    9: "PLETH_HR",
    10: "PLETH_SPO2",
    11: "RESP_WAV",
    12: "RESP_RR",
    13: "CO2_WAV",
    14: "CO2_RR",
    15: "CO2_CONC",
    16: "NIBP_SBP",
    17: "NIBP_DBP",
    18: "NIBP_MBP",
    19: "BT",
    20: "CVP_WAV",
    21: "CVP_CVP",
    22: "EEG_BIS",
    23: "TV",
    24: "MV",
    25: "PIP",
    26: "AGENT1_NAME",
    27: "AGENT1_CONC",
    28: "AGENT2_NAME",
    29: "AGENT2_CONC",
    30: "DRUG1_NAME",
    31: "DRUG1_CE",
    32: "DRUG2_NAME",
    33: "DRUG2_CE",
    34: "CO",
    36: "EEG_SEF",
    38: "PEEP",
    39: "ECG_ST",
    40: "AGENT3_NAME",
    41: "AGENT3_CONC",
    42: "STO2_L",
    43: "STO2_R",
    44: "EEG_WAV",
    45: "FLUID_RATE",
    46: "FLUID_TOTAL",
    47: "SVV",
    49: "DRUG3_NAME",
    50: "DRUG3_CE",
    52: "FILT1_1",
    53: "FILT1_2",
    54: "FILT2_1",
    55: "FILT2_2",
    56: "FILT3_1",
    57: "FILT3_2",
    58: "FILT4_1",
    59: "FILT4_2",
    60: "FILT5_1",
    61: "FILT5_2",
    62: "FILT6_1",
    63: "FILT6_2",
    64: "FILT7_1",
    65: "FILT7_2",
    66: "FILT8_1",
    67: "FILT8_2",
    70: "PSI",
    71: "PVI",
    72: "SPHB",
    73: "ORI",
    75: "ASKNA",
    76: "PAP_SBP",
    77: "PAP_MBP",
    78: "PAP_DBP",
    79: "FEM_SBP",
    80: "FEM_MBP",
    81: "FEM_DBP",
    82: "EEG_SEFL",
    83: "EEG_SEFR",
    84: "EEG_SR",
    85: "TOF_RATIO",
    86: "TOF_CNT",
    87: "SKNA_WAV",
    88: "ICP",
    89: "CPP",
    90: "ICP_WAV",
    91: "PAP_WAV",
    92: "FEM_WAV",
    93: "ALARM_LEVEL",
    95: "EEGL_WAV",
    96: "EEGR_WAV",
    97: "ANII",
    98: "ANIM",
    99: "PTC_CNT",
};

// Device ordering for track view
export const DEVICE_ORDERS = [
    'SNUADC',
    'SNUADCW',
    'SNUADCM',
    'Solar8000',
    'Primus',
    'Datex-Ohmeda',
    'Orchestra',
    'BIS',
    'Invos',
    'FMS',
    'Vigilance',
    'EV1000',
    'Vigileo',
    'CardioQ'
];

// Layout sizing constants
export const DEVICE_HEIGHT = 25;
export const HEADER_WIDTH = 140;
export const PAR_WIDTH = 160;
export const PAR_HEIGHT = 80;

// Monitor view parameter groups
export const MONITOR_GROUPS = [
    { 'fgColor': '#00FF00', 'wav': 'ECG_WAV', 'paramLayout': 'TWO', 'param': ['ECG_HR', 'ECG_PVC'], 'name': 'ECG' },
    { 'fgColor': '#FF0000', 'wav': 'IABP_WAV', 'paramLayout': 'BP', 'param': ['IABP_SBP', 'IABP_DBP', 'IABP_MBP'], 'name': 'ART' },
    { 'fgColor': '#82CEFC', 'wav': 'PLETH_WAV', 'paramLayout': 'TWO', 'param': ['PLETH_SPO2', 'PLETH_HR'], 'name': 'PLETH' },
    { 'fgColor': '#FAA804', 'wav': 'CVP_WAV', 'paramLayout': 'ONE', 'param': ['CVP_CVP'], 'name': 'CVP' },
    { 'fgColor': '#DAA2DC', 'wav': 'EEG_WAV', 'paramLayout': 'TWO', 'param': ['EEG_BIS', 'EEG_SEF'], 'name': 'EEG' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT_CONC', 'AGENT_NAME'], 'name': 'AGENT' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT1_CONC', 'AGENT1_NAME'], 'name': 'AGENT1' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT2_CONC', 'AGENT2_NAME'], 'name': 'AGENT2' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT3_CONC', 'AGENT3_NAME'], 'name': 'AGENT3' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT4_CONC', 'AGENT4_NAME'], 'name': 'AGENT4' },
    { 'fgColor': '#FAA804', 'paramLayout': 'TWO', 'param': ['AGENT5_CONC', 'AGENT5_NAME'], 'name': 'AGENT5' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG_CE', 'DRUG_NAME'], 'name': 'DRUG' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG1_CE', 'DRUG1_NAME'], 'name': 'DRUG1' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG2_CE', 'DRUG2_NAME'], 'name': 'DRUG2' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG3_CE', 'DRUG3_NAME'], 'name': 'DRUG3' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG4_CE', 'DRUG4_NAME'], 'name': 'DRUG4' },
    { 'fgColor': '#9ACE34', 'paramLayout': 'TWO', 'param': ['DRUG5_CE', 'DRUG5_NAME'], 'name': 'DRUG5' },
    { 'fgColor': '#FFFF00', 'wav': 'RESP_WAV', 'paramLayout': 'ONE', 'param': ['RESP_RR'], 'name': 'RESP' },
    { 'fgColor': '#FFFF00', 'wav': 'CO2_WAV', 'paramLayout': 'TWO', 'param': ['CO2_CONC', 'CO2_RR'], 'name': 'CO2' },
    { 'fgColor': '#FFFFFF', 'paramLayout': 'VNT', 'name': 'VNT', 'param': ['TV', 'RESP_RR', 'PIP', 'PEEP'], },
    { 'fgColor': '#F08080', 'paramLayout': 'VNT', 'name': 'NMT', 'param': ['TOF_RATIO', 'TOF_CNT', 'PTC_CNT'], },
    { 'fgColor': '#FFFFFF', 'paramLayout': 'BP', 'param': ['NIBP_SBP', 'NIBP_DBP', 'NIBP_MBP'], 'name': 'NIBP' },
    { 'fgColor': '#DAA2DC', 'wav': 'EEGL_WAV', 'paramLayout': 'TWO', 'param': ['PSI', 'EEG_SEFL', 'EEG_SEFR'], 'name': 'MASIMO' },
    { 'fgColor': '#FF0000', 'paramLayout': 'TWO', 'param': ['SPHB', 'PVI'], },
    { 'fgColor': '#FFC0CB', 'paramLayout': 'TWO', 'param': ['CO', 'SVV'], 'name': 'CARTIC' },
    { 'fgColor': '#FFFFFF', 'paramLayout': 'LR', 'param': ['STO2_L', 'STO2_R'], 'name': 'STO2' },
    { 'fgColor': '#828284', 'paramLayout': 'TWO', 'param': ['FLUID_RATE', 'FLUID_TOTAL'], 'name': 'FLUID' },
    { 'fgColor': '#D2B48C', 'paramLayout': 'ONE', 'param': ['BT'] },
    { 'fgColor': '#FF0000', 'wav': 'PAP_WAV', 'paramLayout': 'BP', 'param': ['PAP_SBP', 'PAP_DBP', 'PAP_MBP'], 'name': 'PAP' },
    { 'fgColor': '#FF0000', 'wav': 'FEM_WAV', 'paramLayout': 'BP', 'param': ['FEM_SBP', 'FEM_DBP', 'FEM_MBP'], 'name': 'FEM' },
    { 'fgColor': '#00FF00', 'wav': 'SKNA_WAV', 'paramLayout': 'ONE', 'param': ['ASKNA'], 'name': 'SKNA' },
    { 'fgColor': '#FFFFFF', 'wav': 'ICP_WAV', 'paramLayout': 'TWO', 'param': ['ICP', 'CPP'] },
    { 'fgColor': '#FF7F51', 'paramLayout': 'TWO', 'param': ['ANIM', 'ANII'] },
    { 'fgColor': '#99d9ea', 'paramLayout': 'TWO', 'param': ['FILT1_1', 'FILT1_2'] },
    { 'fgColor': '#C8BFE7', 'paramLayout': 'TWO', 'param': ['FILT2_1', 'FILT2_2'] },
    { 'fgColor': '#EFE4B0', 'paramLayout': 'TWO', 'param': ['FILT3_1', 'FILT3_2'] },
    { 'fgColor': '#FFAEC9', 'paramLayout': 'TWO', 'param': ['FILT4_1', 'FILT4_2'] },
];

// Parameter layout definitions
export const PARAM_LAYOUTS = {
    'ONE': [
        {
            name: { baseline: 'top', x: 5, y: 5 },
            value: { fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 10) }
        }
    ],
    'TWO': [
        {
            name: { baseline: 'top', x: 5, y: 5 },
            value: { fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: 42 }
        },
        {
            name: { baseline: 'bottom', x: 5, y: (PAR_HEIGHT - 4) },
            value: { fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8) }
        }
    ],
    'LR': [
        {
            name: { baseline: 'top', x: 5, y: 5 },
            value: { fontsize: 40, align: 'left', x: 5, y: (PAR_HEIGHT - 10) }
        },
        {
            name: { align: 'right', baseline: 'top', x: PAR_WIDTH - 3, y: 4 },
            value: { fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 10) }
        }
    ],
    'BP': [
        {
            name: { baseline: 'top', x: 5, y: 5 },
            value: { fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: 37 }
        },
        {
            value: { fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8) }
        }
    ],
    'VNT': [
        {
            name: { baseline: 'top', x: 5, y: 5 },
            value: { fontsize: 38, align: 'right', x: PAR_WIDTH - 45, y: 37 }
        },
        {
            value: { fontsize: 30, align: 'right', x: PAR_WIDTH - 5, y: 37 }
        },
        {
            value: { fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: (PAR_HEIGHT - 8) }
        }
    ]
};

// Application version
export const APP_VERSION = '1.0.0';

// Local storage keys
export const STORAGE_KEYS = {
    SETTINGS: 'vital-viewer-settings',
    RECENT_FILES: 'vital-viewer-recent-files'
};

// Maximum number of recent files to remember
export const MAX_RECENT_FILES = 10;