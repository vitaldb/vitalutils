"""
ROOT 장비 트랙의 int32 -> uint32 잘못 읽기 버그 수정 스크립트
"""
import os
import struct
import vitaldb
import numpy as np
from multiprocessing import Pool

IDIR = r'.'
ODIR = 'fixed'

UINT32_MAX = 0xFFFFFFFF
THRESHOLD = 4000000  # 비정상 값 감지 임계값 (divisor=1000 기준)

# ROOT 트랙별 divisor 값
KNOWN_DIVISORS = {
    'ROOT/DELTA_BASE_SO2_1': 1,
    'ROOT/DELTA_BASE_SO2_2': 1,
    'ROOT/DELTA_O2_HBI_1': 10,
    'ROOT/DELTA_H_HBI_1': 10,
    'ROOT/DELTA_C_HBI_1': 10,
    'ROOT/DELTA_O2_HBI_2': 10,
    'ROOT/DELTA_H_HBI_2': 10,
    'ROOT/DELTA_C_HBI_2': 10,
}


def to_scalar(val):
    """numpy 배열이나 리스트를 스칼라로 변환"""
    if val is None:
        return None
    if isinstance(val, np.ndarray):
        return float(val.flat[0]) if val.size > 0 else None
    if isinstance(val, (list, tuple)):
        return float(val[0]) if len(val) > 0 else None
    return float(val)


def fix_value(wrong_val, divisor):
    """uint32로 잘못 해석된 값을 int32로 복원"""
    uint32_val = int(round(wrong_val * divisor)) & UINT32_MAX
    int32_val = struct.unpack('i', struct.pack('I', uint32_val))[0]
    return int32_val / divisor


def fixit(filepath):
    """단일 vital 파일의 ROOT 트랙 버그 수정"""
    try:
        vf = vitaldb.VitalFile(filepath)
        changed = False
        
        for track_name, divisor in KNOWN_DIVISORS.items():
            if track_name not in vf.trks:
                continue
            
            for rec in vf.trks[track_name].recs:
                val = to_scalar(rec.get('val'))
                if val is not None and val > THRESHOLD:
                    rec['val'] = fix_value(val, divisor)
                    changed = True
        
        if not changed:
            return
        
        # 출력 경로 생성 (폴더 구조 유지)
        relpath = os.path.relpath(filepath, IDIR)
        outpath = os.path.join(IDIR, ODIR, relpath)
        os.makedirs(os.path.dirname(outpath), exist_ok=True)
        
        if vf.to_vital(outpath):
            print(f"Saved: {outpath}")
        
    except Exception as e:
        print(f"Error processing {filepath}: {e}")


if __name__ == '__main__':
    filelist = []
    odir_abs = os.path.abspath(os.path.join(IDIR, ODIR))
    
    print(f'Scanning files in: {IDIR}')
    for root, dirnames, filenames in os.walk(IDIR):
        # ODIR 폴더는 탐색에서 제외
        if os.path.abspath(root).startswith(odir_abs):
            continue
        
        for filename in filenames:
            if filename.lower().endswith('.vital'):
                filelist.append(os.path.join(root, filename))
    
    print(f'{len(filelist)} files found')
    Pool().map(fixit, filelist)
    print("Done!")
