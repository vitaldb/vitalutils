# ICU 병상 이동 데이터 전처리 및 ICU vital file 매칭


## 목차
1. [준비할 데이터](#준비할-데이터)
2. [전처리 과정](#전처리-과정)

    2-1. [결측값 대체](#1-admission-table---icuout-결측값-대체)

    2-2. [bedmove table 정제](#3-bedmove-테이블을-admission-테이블-기준으로-정제)

3. [매칭 알고리즘 원칙](#매칭-알고리즘-원칙)


> ## 준비할 데이터
* ### admission table 
    - 중환자실 입퇴실 정보

    |column|description|
    |--------|-----|
    |hid|환자번호|
    |icuroom | ICU type|
    |icuin   | 중환자실 입실시간|
    |icuout  | 중환자실 퇴실시간|

* ### bedmove table 
    - ICU 입실 후 병상 이동 시간
    
    |column|description|
    |--------|-----|
    |icuroom| ICU type 
    |bed	| 병상번호
    |hid 	| 환자번호
    |bedin	| 병상에 들어온 시간
    |bedout | 병상에서 나간 시간


* ### filelist table
    - 취득방법: Vitalserver API

    |column|description|
    |--------|-----|
    |filename| 파일 이름 (ex) bedname_yymmdd_hhmmss.vital
    |dtstart| 녹화 시작 시간
    |dtend 	| 녹화 종료 시간
    |adt1	| filename 별 저장된 매칭id1 (Intellivue, NihonKohden 환자 모니터에서만 취득 가능)
    |adt2 | filename 별 저장된 매칭id2 (한 파일에 최대 2명까지 기록됨)

* ### tracklist table
    - 취득방법: Vitalserver API

    |column|description|
    |--------|-----|
    |filename| 파일 이름
    |dtstart| 녹화 시작 시간
    |dtend 	| 녹화 종료 시간
    |trks	| 트랙 리스트 (ex) [‘Intellivue/HR’,...]


    > Vital Server API를 통해 filelist, tracklist를 추출합니다.
    <pre><code>
    # 아래의 코드 실행 전에  pip install vitaldb 로 vitaldb library를 설치해주세요.
    df_filelist = pd.DataFrame(vitaldb.api.filelist(bedname, dtstart, dtend, hid))
    df_tracklist = pd.DataFrame(vitaldb.api.tracklist(bedname, dtstart, dtend))
    </code></pre>



> ## 전처리 과정

1. adt(filename 별 저장된 환자번호)취득이 불가능한 경우 중환자실 입실 후 병상 이동 정보를 이용합니다.
2. Vital file과 환자 정보를 매칭하기 위해서는 중환자실 입실 후 병상 이동 정보에 대한 전처리 과정이 필요합니다.
3. 전체 예시 코드를 보고 싶으시다면 01_refine_bedmoves.py 파일을 참고하세요.

>> #### (1) admission table - icuout 결측값 대체

- 원인: 데이터 추출 기간 내에 퇴실하지 않은 환자, 퇴원, 사망, 또는 EMR 오류로 icuout 결측값이 발생합니다.

- 과정
1) icuin 기준으로 오름차순 정렬한다.
2) 동일한 hid에서 icuout 결측값은 다음 icuin으로 대체한다. 다음 icuin이 존재하지 않으면 데이터 추출 기간의 마지막 날짜로 대체한다.
3) icuout_null column을 생성하고 icuout이 결측값일 때 1, 결측값이 아닐 때 0으로 채운다.

<pre><code>
#line 58~74
def FillAdmNull(x):
    new=[]

    for i in range(len(x.icuout)):
        if i == len(x.icuout)-1:
            if str(x.icuout[i]) == 'NaT':
                new.append(pd.to_datetime(end_date + ' 23:59:59'))
            else:
                new.append(x.icuout[i])
        else:
            if str(x.icuout[i]) == 'NaT' or x.icuout[i] > x.icuin[i+1]:
                new.append(x.icuin[i+1])
            else:
                new.append(x.icuout[i])
    return new

dfadm.sort_values(by='icuin',inplace=True)
dfadm = dfadm.groupby(['hid'],as_index=False).agg({'icuroom':list, 'icuin':list, 'icuout':list, 'icuout_null':list})
dfadm['icuout'] = dfadm.apply(FillAdmNull, axis=1)

</code></pre>

>> #### (2) bedmove table - bedout 결측값 대체

1) bedin 기준으로 오름차순 정렬한다.
2) 동일한 hid에서 bedout 결측값은 다음 bedin으로 대체한다. 다음 bedin이 존재하지 않으면 데이터 추출 기간의 마지막 날짜로 대체한다.
3) bedout_null column을 생성하고 bedout이 결측값일 때 1, 결측값이 아닐 때 0으로 채운다.

<pre><code>
#line 40~55
def FillBmNull(x):

    new=[]
    for i in range(len(x['bedout'])):
        if i == len(x.bedout)-1:
            if str(x.bedout[i]) == 'NaT':
                new.append(pd.to_datetime(end_date + ' 23:59:59'))
            else:
                new.append(x.bedout[i])
        elif str(x.bedout[i]) =='NaT':
            new.append(x.bedin[i+1])
        else:
            new.append(x.bedout[i])
    return new

dfbm.sort_values(by='bedin',inplace=True)
dfbm = dfbm.groupby(['hid'],as_index=False).agg({'icuroom':list,'bed':list,'bedin':list, 'bedout':list, 'bedout_null':list})
dfbm['bedout'] = dfbm.apply(FillBmNull, axis=1)

</code></pre>

>> #### (3) bedmove 테이블을 admission 테이블 기준으로 정제

- bedmove 테이블은 병상이동을 한 당시에 기록되지 않았기 때문에 시간에 오류가 있을 수 있습니다. 
  따라서 admission table의 입퇴실 기록을 기준으로 bedin, bedout을 정제합니다.

* **bedmove, admission table 병합**

1) hid와 icuroom이 같고, bedin을 기준으로 가장 가까운 시간을 값으로 하는 icuin을 찾아 두 테이블을 merge한다.
2) hid와 icuroom이 같고, bedout을 기준으로 가장 가까운 시간을 값으로 하는 icuout을 찾아 두 테이블을 merge한다.
3) 1-1, 1-2의 결과물을 concatenate한 후 중복을 제거한다.

<pre><code>
bed_in = pd.merge_asof(dfbm.sort_values('bedin'), dfadm.sort_values('icuin'), left_on='bedin', right_on='icuin', by=['hid' ,'icuroom'], direction="nearest")
bed_out = pd.merge_asof(dfbm.sort_values('bedout'), dfadm.sort_values('icuout'), left_on='bedout', right_on='icuout', by=['hid' ,'icuroom'], direction="nearest")
df_merge = pd.concat([bed_in, bed_out]).drop_duplicates()

</code></pre>
* **bedin 수정**
4) bedin 기준으로 오름차순 정렬한다.
5) 동일한 hid, icuroom, icuin, icuout에서 첫번째 bedin은 icuin으로 교체한다.


<pre><code>
#line 149~157
def ChangeBedIn(x):

    new_bedin = []
    for i in range(len(x.bedin)):
        if i==0:
            new_bedin.append(x.icuin)
        else:
            new_bedin.append(x.bedin[i])
    return new_bedin

df_merge.sort_values(by='bedin',inplace=True)
df_merge = df_merge.groupby(['icuroom','hid','icuin','icuout'],as_index=False).agg({'bed':list, 'bedin':list, 'bedout':list, 'icuout_null':list, 'bedout_null':list})
df_merge['bedin'] = df_merge.apply(ChangeBedIn, axis=1)


</code></pre>

* **bedout 수정**
6) 동일한 hid, icuroom, icuin, icuout에서 bedout이 다음 bedin 보다 크다면 bedout은 다음 bedin으로 교체한다.
7) 동일한 hid, icuroom, icuin, icuout에서 마지막 bedout은 icuout_null=1이고 bedout_null=0일 때를 제외하고 icuout으로 교체한다.

<pre><code>
#line 160~174
def ChangeBedOut(x):

    new_bedout = []
    for i in range(len(x.bedout)):
        if i == len(x.bedout) -1:
            if (x.icuout_null[i] == 1.0) and (x.bedout_null[i] == 0.0):
                new_bedout.append(x.bedout[i])
            else:
                new_bedout.append(x.icuout)
        else:
            if x.bedout[i] != x.bedin[i+1]:
                new_bedout.append(x.bedin[i+1])
            else:
                new_bedout.append(x.bedout[i])
    return new_bedout

df_merge['bedout'] = df_merge.apply(ChangeBedOut, axis=1)

</code></pre>

* **결측값이었던 값 수정**
8) bedin 기준으로 오름차순 정렬한다.
9) 동일한 icuroom, bed에서 bedout_null = 1이거나 icuout_null = 1이고 bedout이 다음 bedin 보다 크거나 같다면 bedout은 다음 bedin으로 수정한다.

<pre><code>
#line 178~186
def CheckNullBedOut(x):

    new = []
    for i in range(len(x.bedout)):
        if i != len(x.bedout)-1 and x.bedin[i+1] <= x.bedout[i] and (x.bedout_null[i] == 1.0 or x.icuout_null[i] == 1.0):
            new.append(x.bedin[i+1])
        else:
            new.append(x.bedout[i])
    return new

df_merge.sort_values(by='bedin',inplace=True)
df_merge = df_merge.groupby(['icuroom','bed'],as_index=False).agg({'hid':list, 'icuin':list,'icuout':list,'bedin':list, 'bedout':list, 'icuout_null':list, 'bedout_null':list})
df_merge['bedout'] = df_merge.apply(CheckNullBedOut, axis=1)
</code></pre>

-----


> ## 매칭 알고리즘 원칙


1) 길이가 6분 이내의 파일은 삭제한다.
2) valid column을 생성하고, trks 파일의 trks에 HR 과 SPO2가 모두 존재하지 않으면 0을, 둘 중 하나라도 존재하면 1을 할당한다.
3) adt 파일과 trks 파일을 filename 기준으로 병합하여 filelist.csv 파일을 만든다.
4) filelist.csv 파일의 filename에서 bedname을 추출하여 location_id 컬럼을 만든다.
5) 정제를 완료한 bedmove table (이지케어텍 api활용, 전처리 프로세스 참고)의 icuroom 과 bed를 합쳐 location_id 칼럼을 만든다. 이때 4.의 location_id 와 같은 형식으로 만든다.
6) location_id가 일치하고 bedin - 1hour < dtstart <= bedout 을 만족하는 hid를 찾아 filelist 테이블에 매칭한다. 
7) 하나의 파일에 매칭되는 hid가 한개 이상이라면 행을 추가한다.
