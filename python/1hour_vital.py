import os
import datetime
import copy
import numpy as np
import shutil
from joblib import Parallel, delayed
import utils as vitaldb

# raw path
RAW_DIR = 'c:/Vital/Raw/'
RAW_DIR = r'C:\Users\lucid\OneDrive\Desktop\SICU1_04_220616_230000/'

# save path
OUTPUT_DIR = 'C:/Vital/Output/'

USE_MULTIPROCESS = False

# 1시간 이내 파일 인지 아닌지 확인
def cut_vital_file(prefix_done_list, filepath):
    filename = os.path.basename(filepath)
    try:
        vf = vitaldb.VitalFile(filepath)
    except:
        return
    if not vf.dtstart:  # 1KB 파일 등 이상한 파일
        return
    if vf.dtend > vf.dtstart + 48 * 3600:  # 48 시간 이상 파일도 이상한 파일
        return
        
    newdir = OUTPUT_DIR + filepath[len(RAW_DIR):-len(filename)]
    os.makedirs(newdir, exist_ok=True)

    print(f'cutting {filename}')
    dtstart_hour = (int(vf.dtstart) // 3600) * 3600
    dtend_hour = (int(vf.dtend) // 3600) * 3600
    for dthour in range(dtstart_hour, dtend_hour + 3600, 3600):
        filestart = max(vf.dtstart, dthour)
        fileend = min(vf.dtend, dthour + 3600)
        if fileend - filestart < 1:  # 커팅 과정에서 생기는 1초 이내 짜투리 파일은 삭제
            continue

        # 모든 파일은 반드시 cut.vital 확장자
        newname = filename[:-19] + datetime.datetime.fromtimestamp(filestart).strftime("%y%m%d_%H%M%S") + '.cut.vital'
        prefix = newname.split('.')[0][:-4]
        if prefix in prefix_done_list:  # 이미 완료된 prefix에 대한 cut 파일은 생성하지 않는다
            continue

        newvf = copy.deepcopy(vf)
        newvf.crop(filestart, fileend)
        try:
            # newDatetime = newdt.strftime("%y%m%d_%H%M%S")
            print(f'-> {newname} ({newvf.dtend - newvf.dtstart:.1f} sec)')
            newpath = newdir + newname
            newvf.to_vital(newpath + '.tmp') 
            if os.path.exists(newpath+'.tmp'):
                shutil.move(newpath+'.tmp', newpath)
        except:
            print(f'error file: {file}')

# cutfilepath_list로 지정된 경로들 중에서 prefix가 포함된 파일들을 합침
def merge_vital_file(cutfilepath_list, prefix):
    print(f'merging {prefix}')
    matched_path_list = [filepath for filepath in cutfilepath_list if prefix in filepath]  # 이번에 합쳐야할 파일 목록들을 뽑음
    if len(matched_path_list) == 0:
        return
    odir = os.path.dirname(matched_path_list[0])
    opath = odir + '/' + prefix + '0000.vital'  # YYMMDD_HH0000.vital 파일명으로 합침
    if len(matched_path_list) == 1:
        shutil.move(matched_path_list[0], opath)
    else:  # merge 필요
        try:
            vf = vitaldb.VitalFile(matched_path_list)
            vf.to_vital(opath+'.tmp')
            for filepath in matched_path_list:
                print(f'removing {os.path.basename(filepath)}')
                os.remove(filepath)
            if os.path.exists(opath + '.tmp'):
                shutil.move(opath+'.tmp', opath)
        except:
            pass

if __name__ == '__main__':
    # STEP1: cut vital files
    prefix_done_list = set()
    for rootdir, dirs, files in os.walk(OUTPUT_DIR):
        for filename in files:
            if filename.endswith('.vital'):
                if filename.endswith('.cut.vital'):  # 이전 작업의 쓰레기
                    os.remove(rootdir + '/' + filename)
                else:  # 완료된 prefix
                    prefix = filename.split('.')[0][:-4]
                    prefix_done_list.add(prefix)
            if filename.endswith('.tmp'):  # 이전 작업의 쓰레기
                os.remove(rootdir + '/' + filename)

    # 입력 폴더에서 파일명을 기준으로 변경할 파일만 추출
    todo_path_list = set()
    for rootdir, dirs, files in os.walk(RAW_DIR):
        for filename in files:
            if filename[-6:] == '.vital':
                todo_path_list.add(os.path.join(rootdir, filename))

    if USE_MULTIPROCESS:
        Parallel(os.cpu_count())(delayed(cut_vital_file)(prefix_done_list, filepath) for filepath in todo_path_list)
    else:
        for filepath in todo_path_list: cut_vital_file(prefix_done_list, filepath)

    # STEP2: merge vital files
    cutfilepath_list = set()
    prefix_todo_list = set()
    for rootdir, dirs, files in os.walk(OUTPUT_DIR):
        for filename in files:
            if filename.endswith('.cut.vital'):  # cut.vital 인 파일만 합친다
                cutfilepath_list.add(rootdir + '/' + filename)
                prefix = filename.split('.')[0][:-4]
                prefix_todo_list.add(prefix)

    if USE_MULTIPROCESS:
        Parallel(os.cpu_count())(delayed(merge_vital_file)(cutfilepath_list, prefix) for prefix in prefix_todo_list)
    else:
        for prefix in prefix_todo_list: merge_vital_file(cutfilepath_list, prefix)
