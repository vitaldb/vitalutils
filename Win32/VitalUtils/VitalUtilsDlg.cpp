#include "stdafx.h"
#include <afxole.h>
#include "VitalUtils.h"
#include "VitalUtilsDlg.h"
#include "afxdialogex.h"

#define LVIS_CHECKED 0x2000 
#define LVIS_UNCHECKED 0x1000

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

CVitalUtilsDlg::CVitalUtilsDlg(CWnd* pParent)
: CDialogEx(IDD_VITALUTILS_DIALOG, pParent) {
	m_hIcon = AfxGetApp()->LoadIcon(IDR_MAINFRAME);
}

void CVitalUtilsDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_LOG, m_ctrLog);
	DDX_Text(pDX, IDC_IDIR, m_strIdir);
	DDX_Text(pDX, IDC_ODIR, m_strOdir);
	DDX_Check(pDX, IDC_SKIP, m_bSkip);
	DDX_Control(pDX, IDC_RUN, m_btnRun);
	DDX_Control(pDX, IDC_STOP, m_btnStop);
	DDX_Text(pDX, IDC_TOOL_DESC6, m_strProgress);
	DDX_Control(pDX, IDC_FILELIST, m_ctrlFileList);
	DDX_Control(pDX, IDC_TRKLIST, m_ctrlTrkList);
	DDX_Check(pDX, IDC_MAKE_SUBDIR, m_bMakeSubDir);

	DDX_Control(pDX, IDC_SEL_COPY, m_ctrlSelCopyFiles);
	DDX_Control(pDX, IDC_SEL_RECS, m_ctrlSelRecs);
	DDX_Control(pDX, IDC_SEL_DEL_TRKS, m_ctrlSelDelTrks);
	DDX_Control(pDX, IDC_SEL_RENAME_TRKS, m_ctrlSelRenameTrks);
	DDX_Control(pDX, IDC_SEL_RENAME_DEV, m_ctrlSelRenameDev);

	DDX_Control(pDX, IDC_BTN_IDIR, m_btnIdir);
	DDX_Control(pDX, IDC_RESCAN, m_btnRescan);
	DDX_Control(pDX, IDC_SAVE_LIST, m_btnSaveList);
	DDX_Control(pDX, IDC_TRK_ALL, m_btnTrkAll);
	DDX_Control(pDX, IDC_TRK_NONE, m_btnTrkNone);
	DDX_Control(pDX, IDC_FILE_ALL, m_btnFileAll);
	DDX_Control(pDX, IDC_FILE_NONE, m_btnFileNone);
	DDX_Control(pDX, IDC_BTN_ODIR, m_btnOdir);
	DDX_Control(pDX, IDC_CLEAR, m_btnClear);
	DDX_Control(pDX, IDC_TOOL_DESC4, m_ctrlOdirStatic);
	DDX_Control(pDX, IDC_FOLDER, m_ctrlIdirStatic);
	DDX_Control(pDX, IDC_TOOL_DESC6, m_ctrProgress);
	DDX_Control(pDX, IDC_SELECT, m_btnSelect);
	DDX_Control(pDX, IDC_FILTER, m_ctrlFilter);
	DDX_Control(pDX, IDC_TRK_OPER, m_ctrlSelOper);
	DDX_Control(pDX, IDC_EXACT, m_ctrlExact);
	DDX_Control(pDX, IDC_TRACK_COUNT, m_ctrlTrkCnt);
	DDX_Control(pDX, IDC_FILE_COUNT, m_ctrlFileCnt);
	DDX_Control(pDX, IDC_TRK_FILTER, m_ctrlTrkFilter);
}

CString g_name = _T("VitalUtils");

BEGIN_MESSAGE_MAP(CVitalUtilsDlg, CDialogEx)
	ON_WM_PAINT()
	ON_WM_TIMER()
	ON_WM_CLOSE()
	ON_WM_SIZE()
	ON_WM_QUERYDRAGICON()
	ON_BN_CLICKED(IDC_BTN_IDIR, &CVitalUtilsDlg::OnBnClickedBtnIdir)
	ON_BN_CLICKED(IDC_BTN_ODIR, &CVitalUtilsDlg::OnBnClickedBtnOdir)
	ON_BN_CLICKED(IDC_RUN, &CVitalUtilsDlg::OnBnClickedRun)
	ON_BN_CLICKED(IDC_STOP, &CVitalUtilsDlg::OnBnClickedCancel)
	ON_BN_CLICKED(IDC_CLEAR, &CVitalUtilsDlg::OnBnClickedClear)
	ON_WM_DESTROY()
	ON_NOTIFY(LVN_GETDISPINFO, IDC_FILELIST, &CVitalUtilsDlg::OnGetdispinfoFilelist)
	ON_LBN_SELCHANGE(IDC_TRKLIST, &CVitalUtilsDlg::OnSelchangeTrklist)
	ON_NOTIFY(NM_DBLCLK, IDC_FILELIST, &CVitalUtilsDlg::OnNMDblclkFilelist)
	ON_BN_CLICKED(IDC_RESCAN, &CVitalUtilsDlg::OnBnClickedRescan)
	ON_BN_CLICKED(IDC_TRK_ALL, &CVitalUtilsDlg::OnBnClickedTrkAll)
	ON_BN_CLICKED(IDC_TRK_NONE, &CVitalUtilsDlg::OnBnClickedTrkNone)
	ON_BN_CLICKED(IDC_FILE_ALL, &CVitalUtilsDlg::OnBnClickedFileAll)
	ON_BN_CLICKED(IDC_FILE_NONE, &CVitalUtilsDlg::OnBnClickedFileNone)
	ON_BN_CLICKED(IDC_SAVE_LIST, &CVitalUtilsDlg::OnBnClickedSaveList)

	ON_BN_CLICKED(IDC_SEL_COPY, &CVitalUtilsDlg::OnBnClickedSelCopyFiles)
	ON_BN_CLICKED(IDC_SEL_RENAME_DEV, &CVitalUtilsDlg::OnBnClickedSelRenameDev)
	ON_BN_CLICKED(IDC_SEL_DEL_TRKS, &CVitalUtilsDlg::OnBnClickedSelDelTrks)
	ON_BN_CLICKED(IDC_SEL_RECS, &CVitalUtilsDlg::OnBnClickedSelRecs)
	ON_BN_CLICKED(IDC_SEL_RENAME_TRKS, &CVitalUtilsDlg::OnBnClickedSelRenameTrks)

	ON_CBN_SELCHANGE(IDC_TRK_OPER, &CVitalUtilsDlg::OnCbnSelchangeTrkOper)
	ON_NOTIFY(LVN_ITEMCHANGED, IDC_FILELIST, &CVitalUtilsDlg::OnLvnItemchangedFilelist)
	ON_BN_CLICKED(IDC_SELECT, &CVitalUtilsDlg::OnBnClickedSelect)
	ON_NOTIFY(HDN_ITEMCLICK, 0, &CVitalUtilsDlg::OnHdnItemclickFilelist)
	ON_BN_CLICKED(IDC_TRK_SELECT, &CVitalUtilsDlg::OnBnClickedTrkSelect)
END_MESSAGE_MAP()

UINT WINAPI RescanThread(void* p) {
	theApp.Log("Scanning folder");

	auto pDlg = (CVitalUtilsDlg*)(theApp.m_pMainWnd);
	auto rootdir = pDlg->m_strIdir;
	Queue<CString> remain;
	remain.Push(CString("\\")); // root directory
	CString dirname;
	while (remain.Pop(dirname)) {
		CString path = rootdir + dirname;

		WIN32_FIND_DATA fd;
		ZeroMemory(&fd, sizeof(WIN32_FIND_DATA));

		HANDLE hFind = FindFirstFile(path + "*.*", &fd);
		for (BOOL ret = (hFind != INVALID_HANDLE_VALUE); ret; ret = FindNextFile(hFind, &fd)) {
			if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) { // directory
				if (strcmp(fd.cFileName, ".") == 0) continue;
				if (strcmp(fd.cFileName, "..") == 0) continue;
				remain.Push(dirname + fd.cFileName + "\\");
			} else { // 파일
				if (ExtName(fd.cFileName) != "vital") continue;

				auto p = new VITAL_FILE_INFO();
				p->path = rootdir + dirname + fd.cFileName;
				p->filename = fd.cFileName;
				p->dirname = dirname; // 보여주는 목적으로만 사용한다.
				p->dirname.Trim('\\'); // 따라서 앞 뒤의 슬래쉬는 불필요하다
				p->mtime = FileTimeToUnixTime(fd.ftLastWriteTime);
				p->size = fd.nFileSizeLow + fd.nFileSizeHigh * ((ULONGLONG)MAXDWORD + 1);

				EnterCriticalSection(&theApp.m_csFile);
				theApp.m_files.push_back(p);
				LeaveCriticalSection(&theApp.m_csFile);
			}
		}
		FindClose(hFind);
	}
	CString str; str.Format("Scanning folder done. %d files", theApp.m_files.size());
	theApp.Log(str);

	// 메인 쓰레드에서 타이머에 의해 이들을 목록에 넣을 것이다.

	// 기존에 parsing 했던 cache를 읽음
	// 어차피 현재 cache 파일이 없으므로 읽지 않음
//	char temp[MAX_PATH];
//	SHGetSpecialFolderPathA(NULL, temp, CSIDL_LOCAL_APPDATA, FALSE);
//	CString sLocalAppDataFolder(temp);
//	sLocalAppDataFolder += "\\VitalUtils";
//	CreateDirectory(sLocalAppDataFolder, NULL);

	// 루트 폴더에 있는 파일을 읽어옴
	map<CString, DWORD_CString> cachedata;
	CString cachepath = rootdir + "\\trks.tsv";
	if (FileExists(cachepath)) {
		CStdioFile cachefile(cachepath, CFile::modeRead | CFile::typeText);
		CString line;
		while (cachefile.ReadString(line)) {
			auto tabs = Explode(line, '\t');
			if (tabs.size() < 3) continue;
			// 상대 경로\t시간\t트랙목록
			DWORD mtime = strtoul(tabs[1], nullptr, 10);
			auto path = rootdir + "\\" + tabs[0];
			cachedata[path] = make_pair(mtime, tabs[2]);
		}
		cachefile.Close();
	}

	// 캐쉬에 없는 파일 목록을 m_parses 에 넣음
	theApp.m_dtstart = time(nullptr);
	theApp.m_ntotal = 0;
	theApp.m_bparsing = true;
	theApp.Log("Parsing started");
	for (int i = 0; ; i++) {
		EnterCriticalSection(&theApp.m_csFile);
		if (i >= theApp.m_files.size()) {
			LeaveCriticalSection(&theApp.m_csFile);
			break;
		}
		auto p = theApp.m_files[i];
		LeaveCriticalSection(&theApp.m_csFile);

		bool hascache = false;
		auto it = cachedata.find(p->path);
		if (it != cachedata.end()) { // 캐쉬가 존재
			auto& t = cachedata[p->path]; // 경로와 시간이 같음
			if (t.first == p->mtime) hascache = true;
		}

		if (!hascache) { // 캐쉬가 없음. 파징 목록에 추가
			theApp.m_parses.Push(make_pair(p->mtime, p->path));
			theApp.m_ntotal++;
			// 파징이 끝나면 각 쓰레드에서 m_path_trklist 로 옮겨 준다
		} else {
			theApp.m_path_trklist[p->path] = cachedata[p->path];
		}
	}

	// 파징 끝날 때 까지 기다림
	auto lastsize = theApp.m_path_trklist.size();
	while (theApp.m_parses.GetSize()) {
		if (lastsize + 500 < theApp.m_path_trklist.size()) {// 만일 cachedata의 길이가 1000 이상 증가하면
			CString str; 
			str.Format("Parsing... %d remained", theApp.m_parses.GetSize());
			theApp.Log(str);
			lastsize = theApp.m_path_trklist.size();
			theApp.SaveCache(cachepath);
		} else {
			// cache를 저장
			Sleep(500); 
		}
		TRACE("parsing %d\n", theApp.m_parses.GetSize());
	}
	while (theApp.m_nrunning.Get()) { // 잔무를 끝냄
		TRACE("running %d\n", theApp.m_nrunning.Get());
		Sleep(500);
	}

	theApp.Log("Parsing done");
	theApp.m_ntotal = 0;
	theApp.m_bparsing = false;

	// 최종 cache를 저장
	theApp.SaveCache(cachepath);

	// 모든 파일들은 theApp.m_path_trklist에 존재
	// 모든 트랙 종류를 합침
	set<CString> tempset;
	for (const auto& it : theApp.m_path_trklist) {
		auto devtrks = Explode(it.second.second, ',');
		tempset.insert(devtrks.begin(), devtrks.end());
	}
	EnterCriticalSection(&theApp.m_csTrk);
	theApp.m_devtrks.clear();
	theApp.m_devtrks.insert(tempset.begin(), tempset.end());
	LeaveCriticalSection(&theApp.m_csTrk);

	return 0;
}

typedef BOOL(WINAPI *LPFN_ISWOW64PROCESS) (HANDLE, PBOOL);
LPFN_ISWOW64PROCESS fnIsWow64Process;

BOOL IsWow64() {
	BOOL bIsWow64 = FALSE;
	auto fnIsWow64Process = (LPFN_ISWOW64PROCESS)GetProcAddress(GetModuleHandle(TEXT("Kernel32")), "IsWow64Process");
	if (fnIsWow64Process != NULL) {
		if (!fnIsWow64Process(GetCurrentProcess(), &bIsWow64)) {
			// handle error
		}
	}

	return bIsWow64;
}

bool DirExists(CString path) {
	DWORD dwAttrib = GetFileAttributes(path);
	return (dwAttrib != INVALID_FILE_ATTRIBUTES && (dwAttrib & FILE_ATTRIBUTE_DIRECTORY));
}

BOOL CVitalUtilsDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	m_ctrlSelOper.SelectString(0, "OR");

	m_canFolder.LoadIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_FOLDER), IMAGE_ICON, 16, 16, 0));

	m_ctrlSelCopyFiles.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_COPY), IMAGE_ICON, 16, 16, 0));
	m_ctrlSelRecs.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_CSV), IMAGE_ICON, 16, 16, 0));
	m_ctrlSelDelTrks.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_DEL), IMAGE_ICON, 16, 16, 0));
	m_ctrlSelRenameDev.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_DEV), IMAGE_ICON, 16, 16, 0));
	m_ctrlSelRenameTrks.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_TRK), IMAGE_ICON, 16, 16, 0));

	m_btnSaveList.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_SAVE), IMAGE_ICON, 16, 16, 0));
	m_btnClear.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_CLEAR), IMAGE_ICON, 16, 16, 0));
	m_btnRun.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_RUN), IMAGE_ICON, 16, 16, 0));
	m_btnStop.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_STOP), IMAGE_ICON, 16, 16, 0));
	m_btnSelect.SetIcon((HICON)LoadImage(AfxGetResourceHandle(), MAKEINTRESOURCE(IDI_SELECT), IMAGE_ICON, 16, 16, 0));

	// 이 대화 상자의 아이콘을 설정합니다.  응용 프로그램의 주 창이 대화 상자가 아닐 경우에는
	//  프레임워크가 이 작업을 자동으로 수행합니다.
	SetIcon(m_hIcon, TRUE);			// 큰 아이콘을 설정합니다.
	SetIcon(m_hIcon, FALSE);		// 작은 아이콘을 설정합니다.

	m_ctrLog.SetOptions(ECOOP_XOR, ECO_SAVESEL);

	m_strIdir = theApp.GetProfileString(g_name, _T("idir"));
	if (!DirExists(m_strIdir)) {
		char temp[MAX_PATH];
		SHGetSpecialFolderPath(NULL, temp, CSIDL_MYDOCUMENTS, FALSE);
		m_strIdir = temp;
	}

	m_strOdir = theApp.GetProfileString(g_name, _T("odir"));
	if (!DirExists(m_strOdir)) {
		char temp[MAX_PATH];
		SHGetSpecialFolderPath(NULL, temp, CSIDL_DESKTOPDIRECTORY, FALSE);
		m_strOdir = temp;
	}

	UpdateData(FALSE);

//	m_imglist.Create(IDB_CHECKBOX, 16, 0, RGB(255, 0, 255));
//	m_ctrlFileList.SetImageList(&m_imglist, LVSIL_SMALL);

	m_ctrlFileList.SetExtendedStyle(LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES);
	m_ctrlFileList.InsertColumn(0, "Filename", LVCFMT_LEFT, 170);
	m_ctrlFileList.InsertColumn(1, "Location", LVCFMT_LEFT, 110);
	m_ctrlFileList.InsertColumn(2, "Modification", LVCFMT_LEFT, 120);
	m_ctrlFileList.InsertColumn(3, "Size", LVCFMT_RIGHT, 65);
	
	// 도구 선택 다이알로그들을 만듬
	m_dlgCopyFiles.Create(IDD_OPT_COPY_FILES, this);
	m_dlgRecs.Create(IDD_OPT_RECS, this);
	m_dlgRename.Create(IDD_OPT_RENAME, this);
	m_dlgDelTrks.Create(IDD_OPT_DEL_TRKS, this);

	m_ctrlFilter.SetLimitText(0);

	CRect rwSelRecs;
	m_ctrlSelRecs.GetWindowRect(rwSelRecs);
	ScreenToClient(rwSelRecs);
	m_dlgCopyFiles.SetWindowPos(NULL, rwSelRecs.left, rwSelRecs.bottom + 15, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
	m_dlgRecs.SetWindowPos(NULL, rwSelRecs.left, rwSelRecs.bottom + 15, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
	m_dlgRename.SetWindowPos(NULL, rwSelRecs.left, rwSelRecs.bottom + 15, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
	m_dlgDelTrks.SetWindowPos(NULL, rwSelRecs.left, rwSelRecs.bottom + 15, 0, 0, SWP_NOSIZE | SWP_NOZORDER);

	m_ctrlSelRecs.SetCheck(TRUE);

	// 입력 디렉토리 읽기 시작
	OnBnClickedRescan();

	// refresh timer
	SetTimer(0, 1000, nullptr);
	SetTimer(1, 1000, nullptr);

	m_b64 = IsWow64();

	return TRUE;  // 포커스를 컨트롤에 설정하지 않으면 TRUE를 반환합니다.
}

// 대화 상자에 최소화 단추를 추가할 경우 아이콘을 그리려면
//  아래 코드가 필요합니다.  문서/뷰 모델을 사용하는 MFC 응용 프로그램의 경우에는
//  프레임워크에서 이 작업을 자동으로 수행합니다.
void CVitalUtilsDlg::OnPaint() {
	CPaintDC dc(this); // 그리기를 위한 디바이스 컨텍스트입니다.
	if (IsIconic()) {
		SendMessage(WM_ICONERASEBKGND, reinterpret_cast<WPARAM>(dc.GetSafeHdc()), 0);

		// 클라이언트 사각형에서 아이콘을 가운데에 맞춥니다.
		int cxIcon = GetSystemMetrics(SM_CXICON);
		int cyIcon = GetSystemMetrics(SM_CYICON);
		CRect rect;
		GetClientRect(&rect);
		int x = (rect.Width() - cxIcon + 1) / 2;
		int y = (rect.Height() - cyIcon + 1) / 2;

		// 아이콘을 그립니다.
		dc.DrawIcon(x, y, m_hIcon);
	} else {
		CRect rw;
		m_ctrlIdirStatic.GetWindowRect(rw); ScreenToClient(rw);
		m_canFolder.BitBltTrans(dc.m_hDC, rw.left - 25, rw.top - 2);

		m_ctrlOdirStatic.GetWindowRect(rw); ScreenToClient(rw);
		m_canFolder.BitBltTrans(dc.m_hDC, rw.left - 25, rw.top - 2);

		CDialogEx::OnPaint();
	}
}

// 사용자가 최소화된 창을 끄는 동안에 커서가 표시되도록 시스템에서
//  이 함수를 호출합니다.
HCURSOR CVitalUtilsDlg::OnQueryDragIcon() {
	return static_cast<HCURSOR>(m_hIcon);
}

void CVitalUtilsDlg::OnBnClickedBtnIdir() {
	UpdateData(TRUE);
	auto olddir = m_strIdir;
	while (true) {
		BROWSEINFO bi;
		ZeroMemory(&bi, sizeof(bi));
		TCHAR szDisplayName[MAX_PATH];
		szDisplayName[0] = ' ';

		bi.hwndOwner = NULL;
		bi.pidlRoot = NULL;
		bi.pszDisplayName = szDisplayName;
		bi.lpszTitle = _T("Please select a folder:");
		bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_USENEWUI;
		bi.lParam = NULL;
		bi.iImage = 0;

		LPITEMIDLIST pidl = SHBrowseForFolder(&bi);
		TCHAR szPathName[MAX_PATH];
		_tcsncpy_s(szPathName, (LPCTSTR)m_strIdir, MAX_PATH);
		if (NULL == pidl) return;

		BOOL bRet = SHGetPathFromIDList(pidl, szPathName);
		if (!bRet) return;
		
		CString newdir(szPathName);

		if (newdir.Left(m_strOdir.GetLength()) == m_strOdir ||
			m_strOdir.Left(newdir.GetLength()) == newdir) {
			AfxMessageBox("Output folder must not overlap with input folder\nPlease select another folder");
			continue;
		}

		m_strIdir = newdir;
		break;
	}
	UpdateData(FALSE);

	theApp.WriteProfileString(g_name, _T("idir"), m_strIdir);
	if(m_strIdir != olddir) OnBnClickedRescan();
}

int CALLBACK BrowseCallbackProc(HWND hwnd, UINT uMsg, LPARAM lParam, LPARAM lpData) {
	switch (uMsg) {
	case BFFM_INITIALIZED: {
		// 해당 Control ID는 shell32.dll version 5.0 이상에서 사용된다.
		// 하위 버전에서는 현재 tree control이 id가 다르며
		// 새폴더 버튼을 생성할 수 없다.
		HWND hShell = GetDlgItem(hwnd, 0);  // 0x00000000(Shell Class)
		HWND hTree = GetDlgItem(hShell, 100); // 0x00000064(Tree Control)
		HWND hNew = GetDlgItem(hwnd, 14150); // 0x00003746(New Folder Button)
		HWND hOK = GetDlgItem(hwnd, 1);  // 0x00000001(OK Button)
		HWND hCancel = GetDlgItem(hwnd, 2);  // 0x00000002(Cancel Button)
		HWND hStatic = GetDlgItem(hwnd, 14146); // 0x00003742(Static Control)
												
		if (!hShell || !hTree || !hNew || !hOK || !hCancel) return 0;  // 하나라도 못가져오면 기본 구성으로 처리한다.

		CRect rectWnd;
		CRect rectNew;
		CRect rectOK;
		CRect rectCancel;
		GetClientRect(hwnd, &rectWnd);
		GetClientRect(hNew, &rectNew);
		GetClientRect(hOK, &rectOK);
		GetClientRect(hCancel, &rectCancel);

		MoveWindow(hNew, rectWnd.left + 10, rectWnd.bottom - rectNew.Height() - 10, rectNew.Width(), rectNew.Height(), TRUE);  // 새 폴더 Button 변경
		MoveWindow(hOK, rectWnd.right - 10 - rectCancel.Width() - 5 - rectOK.Width(), rectWnd.bottom - rectOK.Height() - 10, rectOK.Width(), rectOK.Height(), TRUE);  // 확인 Button
		MoveWindow(hCancel, rectWnd.right - 10 - rectCancel.Width(), rectWnd.bottom - rectCancel.Height() - 10, rectCancel.Width(), rectCancel.Height(), TRUE);  // 취소 Button
	}
	break;
	case BFFM_SELCHANGED:
	case BFFM_VALIDATEFAILED:
		break;
	}
	return 0;
}

void CVitalUtilsDlg::OnBnClickedBtnOdir() {
	UpdateData(TRUE);

	while (true) {
		BROWSEINFO bi;
		ZeroMemory(&bi, sizeof(bi));
		TCHAR szDisplayName[MAX_PATH];
		szDisplayName[0] = ' ';

		bi.hwndOwner = NULL;
		bi.pidlRoot = NULL;
		bi.pszDisplayName = szDisplayName;
		bi.lpszTitle = _T("Please select a folder:");
		bi.ulFlags = BIF_NEWDIALOGSTYLE | BIF_USENEWUI;
		bi.lpfn = BrowseCallbackProc;
		bi.lParam = NULL;
		bi.iImage = 0;

		LPITEMIDLIST pidl = SHBrowseForFolder(&bi);
		TCHAR szPathName[MAX_PATH];
		_tcsncpy_s(szPathName, (LPCTSTR)m_strOdir, MAX_PATH);
		if (NULL == pidl) return;

		BOOL bRet = SHGetPathFromIDList(pidl, szPathName);
		if (!bRet) return;

		CString newdir(szPathName);

		if (newdir.Left(m_strIdir.GetLength()) == m_strIdir ||
			m_strIdir.Left(newdir.GetLength()) == newdir) {
			AfxMessageBox("Output folder must not overlap with input folder\nPlease select another folder");
			continue;
		}

		m_strOdir = szPathName;
		break;
	}
	UpdateData(FALSE);

	theApp.WriteProfileString(g_name, _T("odir"), m_strOdir);
}

#include <queue>
#include <vector>
#include <set>
using namespace std;

void CVitalUtilsDlg::OnBnClickedRun() {
	UpdateData(TRUE);

	// 툴 골라잡음
	CString strTool, strPre, strPost;
	if (m_ctrlSelCopyFiles.GetCheck()) {
		strTool = "copy";
	} else if (m_ctrlSelRecs.GetCheck()) {
		strTool = _T("vital_recs");
		if (m_b64) strTool += _T("_x64");

		// 옵션 가져옴
		m_dlgRecs.UpdateData();
		if (m_dlgRecs.m_bAbstime) strPre += _T("a");
		if (m_dlgRecs.m_bRestricted) strPre += _T("r");
		if (m_dlgRecs.m_bLast) strPre += _T("l");
		if (m_dlgRecs.m_bPrintHeader) strPre += _T("h");
		if (m_dlgRecs.m_bPrintFilename) strPre += _T("c");
		if (!strPre.IsEmpty()) strPre = _T("-") + strPre;

		strPost.Format(_T("%f "), m_dlgRecs.m_fInterval);

		// 추출할 트랙
		CString strDevTrk = "";
		for (int i = 0; i < m_ctrlTrkList.GetCount(); i++) {
			if (!m_ctrlTrkList.GetSel(i)) continue;
			CString s; m_ctrlTrkList.GetText(i, s);
			if (s.Find(',') >= 0) continue;

			if (!strDevTrk.IsEmpty()) strDevTrk += ',';
			strDevTrk += s;
		}
		if (!strDevTrk.IsEmpty()) {
			strPost += _T("\"") + strDevTrk + _T("\"");
		}
	} else if (m_ctrlSelDelTrks.GetCheck()) {
		strTool = "vital_edit_trks";

		// 삭제 할 트랙
		CString smsg;
		CString strDevTrk = "";
		for (int i = 0; i < m_ctrlTrkList.GetCount(); i++) {
			if (!m_ctrlTrkList.GetSel(i)) continue;
			CString s; m_ctrlTrkList.GetText(i, s);
			if (s.Find(',') >= 0) continue;

			if (!strDevTrk.IsEmpty()) strDevTrk += ',';
			strDevTrk += s;

			if (!smsg.IsEmpty()) smsg += '\n';
			smsg += s;
		}
		
		if (IDYES != AfxMessageBox("Are you sure to delete these trackes?\n" + smsg, MB_YESNO)) {
			return;
		}

		if (!strDevTrk.IsEmpty()) {
			strPost += _T("\"") + strDevTrk + _T("\"");
		}
	} else if (m_ctrlSelRenameTrks.GetCheck()) {
		strTool = "vital_edit_trks";

		// 이름 변경할 트랙
		CString smsg;
		m_dlgRename.UpdateData();
		bool bdelsure = false;
		for (int i = 0; i < 30; i++) {
			auto from = m_dlgRename.m_strFrom[i];
			auto to = m_dlgRename.m_strTo[i];
			if (from == to) continue;
			if (from.IsEmpty()) continue;
			if (from.Find(',') >= 0) continue;
			if (to.Find(',') >= 0) continue;
			if (to.IsEmpty() && !bdelsure) {
				if (IDYES != AfxMessageBox("Tracks witout names will be deleted. Are you sure?\n", MB_YESNO)) {
					m_dlgRename.m_ctrlTo[i].SetFocus();
					return;
				} else {
					bdelsure = true;
				}
			}

			if (!strPost.IsEmpty()) strPost += ',';
			strPost += from + "=" + to;

			if (!smsg.IsEmpty()) smsg += '\n';
			smsg += from + " -> " + to;
		}
		strPost = "\"" + strPost + "\"";

		if (IDYES != AfxMessageBox("Are you sure to change track names?\n" + smsg, MB_YESNO)) {
			return;
		}
	} else if (m_ctrlSelRenameDev.GetCheck()) {
		strTool = "vital_edit_devs";

		// 이름 변경할 장비
		m_dlgRename.UpdateData();
		auto from = m_dlgRename.m_strFrom[0];
		auto to = m_dlgRename.m_strTo[0];
		if (from.IsEmpty()) return;
		if (to.IsEmpty()) return;
		if (from.Find(',') >= 0) return;
		if (to.Find(',') >= 0) return;

		strPost = _T("\"") + from + _T("\" \"") + to + _T("\"");

		if (IDYES != AfxMessageBox("Are you sure to change device name?\n" + from + " -> " + to, MB_YESNO)) {
			return;
		}
	} else {
		AfxMessageBox("not implemented");
		return;
	}

	// 선택된 것이 없다면 모두 선택한다
	if (m_ctrlFileList.GetSelectedCount() == 0) {
		OnBnClickedFileAll();
	}

	theApp.m_ntotal = 0;
	theApp.m_dtstart = time(nullptr);

	CString idir = m_strIdir;
	idir = idir.TrimRight('\\');

	CString odir = m_strOdir;
	odir = odir.TrimRight('\\');

	if (odir.IsEmpty()) {
		odir = idir;
	}

	// recs 의 경우는 piped 이고 이 경우에는 tool strpre ifile strpost > ofile 형태가 된다.
	// 그 외에는 tool strpre ifile ofile strpost 형태가 된다.
	bool is_recs = (strTool.Left(10) == "vital_recs");
	if (m_dlgRecs.m_bLong) { // longitudinal 인데 파일이 존재하면?
		if (m_dlgRecs.m_strOutputFile.IsEmpty()) {
			AfxMessageBox("Please enter output file name");
			m_dlgRecs.m_ctrlOutputFile.SetFocus();
			return;
		}
		auto ofile = odir + "\\" + m_dlgRecs.m_strOutputFile;
		if (FileExists(ofile)) {
			if (IDYES != AfxMessageBox("Are you sure to overwrite previous file?\n", MB_YESNO)) {
				m_dlgRecs.m_ctrlOutputFile.SetFocus();
				return;
			}
		}

		if (!m_ctrlTrkList.GetSelCount()) {
			AfxMessageBox("Please select trks");
			return;
		}

		// 기존 파일을 비움
		auto fa = fopen(ofile, "wb");
		fprintf(fa, "Filename,Time");
		bool bfirst = true;
		for (int i = 0; i < m_ctrlTrkList.GetCount(); i++) {
			if (!m_ctrlTrkList.GetSel(i)) continue;
			CString s; m_ctrlTrkList.GetText(i, s);
			fprintf(fa, ",%s", s);
		}
		fprintf(fa, "\r\n");
		fclose(fa);
	}

	m_ctrLog.SetWindowText(_T(""));
	m_btnRun.EnableWindow(FALSE);
	m_btnStop.EnableWindow(TRUE);

	m_ctrlSelCopyFiles.EnableWindow(FALSE);
	m_ctrlSelRecs.EnableWindow(FALSE);
	m_ctrlSelDelTrks.EnableWindow(FALSE);
	m_ctrlSelRenameTrks.EnableWindow(FALSE);
	m_ctrlSelRenameDev.EnableWindow(FALSE);

	// 실제 툴 실행 명령을 job 리스트에 추가함
	for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
		if (m_ctrlFileList.GetItemState(i, LVIS_SELECTED)) {
			auto ifile = m_shown[i]->path;

			// sub directory 생성이면?
			CString subdir;
			if (m_bMakeSubDir) {
				subdir = DirName(ifile).TrimRight('\\').Mid(idir.GetLength());
				CreateDir(odir + '\\' + subdir + '\\');
			}

			CString ofile = BaseName(ifile);
			if (is_recs) {
				ofile = ofile.Left(ofile.ReverseFind('.')); // remove ext
				ofile = ofile + _T(".csv");
			}

			auto opath = odir + '\\' + subdir + '\\' + ofile;

			if (is_recs && m_dlgRecs.m_bLong) {
				opath = odir + '\\' + m_dlgRecs.m_strOutputFile;
			}

			// 파일 존재시 삭제이면?
			if (m_bSkip) if (FileExists(opath)) continue;

			// 최종 명령문
			CString strJob;
			if (is_recs) {
				strJob = strTool + _T(".exe ") + strPre + _T(" \"") + ifile + _T("\" ") + strPost + " >";
				if (is_recs && m_dlgRecs.m_bLong) strJob += '>'; // longitudinal
				strJob += "\"" + opath + "\"";
			} else if (strTool == "copy") {
				strJob = strTool + " " + ifile + "|" + opath;
			} else {
				strJob = strTool + _T(".exe ") + strPre + _T(" \"") + ifile + _T("\" \"") + opath + _T("\" ") + strPost;
			}

			// 실행 큐에 추가
			theApp.AddJob(strJob);
		}
	}

	UpdateData(FALSE);
}

int CVitalUtilsDlg::GetNumVisibleLines() {
	CRect rect;
	long nFirstChar, nLastChar;
	long nFirstLine, nLastLine;

	// Get client rect of rich edit control
	m_ctrLog.GetClientRect(rect);

	// Get character index close to upper left corner
	nFirstChar = m_ctrLog.CharFromPos(CPoint(0, 0));

	// Get character index close to lower right corner
	nLastChar = m_ctrLog.CharFromPos(CPoint(rect.right, rect.bottom));
	if (nLastChar < 0) {
		nLastChar = m_ctrLog.GetTextLength();
	}

	// Convert to lines
	nFirstLine = m_ctrLog.LineFromChar(nFirstChar);
	nLastLine = m_ctrLog.LineFromChar(nLastChar);

	return (nLastLine - nFirstLine);
}

CString SpanToStr(double dtSpan) {
	CString str;
	if (dtSpan > 3600 * 24) {
		int sec = (int)dtSpan;
		int mins = (int)(sec / 60); sec %= 60;
		int hrs = mins / 60; mins %= 60;
		int days = hrs / 24; hrs %= 24;
		str.Format(_T("%d d %d h"), days, hrs);
	} else if (dtSpan > 3600) {
		int sec = (int)dtSpan;
		int mins = (int)(sec / 60); sec %= 60;
		int hrs = mins / 60; mins %= 60;
		str.Format(_T("%d h %d m"), hrs, mins);
	} else if (dtSpan > 60) {
		int sec = (int)dtSpan;
		int mins = sec / 60; sec %= 60;
		str.Format(_T("%d m %d s"), mins, sec);
	} else {
		if (dtSpan == (int)dtSpan) str.Format(_T("%d s"), (int)dtSpan);
		else str.Format(_T("%.3f s"), dtSpan);
	}
	return str;
}

CString BaseName(CString path, bool withext) {
	auto str = path.Mid(max(path.ReverseFind('/'), path.ReverseFind('\\')) + 1);
	if (withext) return str;
	return str.Left(str.ReverseFind('.'));
}

CString InsertComma(__int64 dwNumber) {
	CString str;
	str.Format(_T("%u"), dwNumber);
	for (int i = str.GetLength() - 3; i > 0; i -= 3)
		str.Insert(i, _T(","));
	return (str);
}

CString FormatSize(__int64 dwFileSize) {
	int dwNumber = round(dwFileSize / 1048576.0);
	CString ret;
	ret.Format(_T("%s MB"), InsertComma(dwNumber));
	return ret;
}

CString DtToStr(time_t t) {
	tm* ptm = localtime(&t); // simple conversion
	SYSTEMTIME st;
	st.wYear = (WORD)(1900 + ptm->tm_year);
	st.wMonth = (WORD)(1 + ptm->tm_mon);
	st.wDayOfWeek = (WORD)ptm->tm_wday;
	st.wDay = (WORD)ptm->tm_mday;
	st.wHour = (WORD)ptm->tm_hour;
	st.wMinute = (WORD)ptm->tm_min;
	st.wSecond = (WORD)ptm->tm_sec;
	CString str;
	str.Format(_T("%04d-%02d-%02d %02d:%02d:%02d"), st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
	return str;
}

void CVitalUtilsDlg::OnTimer(UINT_PTR nIDEvent) {
	if (nIDEvent == 0) { // refresh timer
		CString str;
		pair<DWORD, CString> msg;
		while (theApp.m_msgs.Pop(msg)) {
			str += DtToStr(msg.first) + " " + msg.second + _T("\r\n");
		}

		if (!str.IsEmpty()) {
			int nLength = m_ctrLog.GetWindowTextLength();
			// put the selection at the end of text
			m_ctrLog.SetSel(nLength, nLength);
			// replace the selection
			m_ctrLog.ReplaceSel(str);

			// scroll to last
			int nVisible = GetNumVisibleLines();
			m_ctrLog.LineScroll(m_ctrLog.GetLineCount());
			m_ctrLog.LineScroll(1 - nVisible);
		}

		// update progress
		if (theApp.m_nrunning.Get()) {
			auto nremain = theApp.m_bparsing ? theApp.m_parses.GetSize() : theApp.m_jobs.GetSize();
			auto ndone = theApp.m_ntotal - nremain;
			auto tspan = difftime(time(nullptr), theApp.m_dtstart);
			auto speed = tspan ? (ndone / tspan) : 1.0;
			auto eta = nremain / speed;

			CString str;
			if (theApp.m_ntotal) {
				str.Format(_T("%d/%d (%d%%) @ %d threads, ETA %s"), ndone, theApp.m_ntotal,
					(ndone * 100) / theApp.m_ntotal, theApp.m_nrunning.Get(), SpanToStr(eta));
				m_ctrProgress.SetWindowText(str);
			}
		} else { // 실행이 종료됨
			m_ctrProgress.GetWindowText(str);
			if (str != "All done!") {
				str = _T("All done!");
				m_ctrProgress.SetWindowText(str);
			}
			if (!m_btnRun.IsWindowEnabled()) { 
				m_btnRun.EnableWindow(TRUE);
				m_btnStop.EnableWindow(FALSE);

				m_ctrlSelCopyFiles.EnableWindow(TRUE);
				m_ctrlSelRecs.EnableWindow(TRUE);
				m_ctrlSelDelTrks.EnableWindow(TRUE);
				m_ctrlSelRenameTrks.EnableWindow(TRUE);
				m_ctrlSelRenameDev.EnableWindow(TRUE);
			}
		}
	} else if (nIDEvent == 1) {
		// 추가로 adding 되었을 때
		if (m_shown.size() != theApp.m_files.size()) {
			if (!m_ctrlTrkList.GetSelCount()) {
				m_shown = theApp.m_files; // m_shown 을 업데이트
				// 원래는 현재의 sorting 기준에 맞춰 재정렬 해야한다
			}
			m_ctrlFileList.SetItemCountEx(m_shown.size(), LVSICF_NOINVALIDATEALL | LVSICF_NOSCROLL);
		}
		
		if (m_ctrlTrkList.IsWindowEnabled() == theApp.m_bparsing)
			m_ctrlTrkList.EnableWindow(theApp.m_bparsing ? FALSE : TRUE);

		// parsing이 추가로 되었을 때
		if (m_ctrlTrkList.GetCount() != theApp.m_devtrks.size()) {
			theApp.Log("Updating track list");
			EnterCriticalSection(&theApp.m_csTrk);
			vector<CString> copy(theApp.m_devtrks.begin(), theApp.m_devtrks.end());
			LeaveCriticalSection(&theApp.m_csTrk);
			
			// 트랙 리스트를 완전히 새로 만든다
			m_ctrlTrkList.SetRedraw(FALSE);
			auto nscr = m_ctrlTrkList.GetTopIndex();
			m_ctrlTrkList.ResetContent();
			for (const auto& s : copy)
				m_ctrlTrkList.AddString(s);
			m_ctrlTrkList.SetTopIndex(nscr);
			m_ctrlTrkList.SetRedraw(TRUE);
			m_ctrlTrkList.RedrawWindow();

			theApp.Log("Updating track list done");
		}

		CString oldstr, newstr;
		m_ctrlFileCnt.GetWindowText(oldstr);
		newstr.Format("%d/%d", m_ctrlFileList.GetSelectedCount(), m_shown.size());
		if (oldstr != newstr) {
			m_ctrlFileCnt.SetWindowText(newstr);
		}

		m_ctrlTrkCnt.GetWindowText(oldstr);
		newstr.Format("%d/%d", m_ctrlTrkList.GetSelCount(), theApp.m_devtrks.size());
		if (oldstr != newstr) {
			m_ctrlTrkCnt.SetWindowText(newstr);
		}
	}

	CDialogEx::OnTimer(nIDEvent);
}

void CVitalUtilsDlg::OnBnClickedCancel() {
	theApp.m_jobs.Clear();
	theApp.m_ntotal = 0;
}

void CVitalUtilsDlg::OnBnClickedClear() {
	m_ctrLog.SetWindowText(_T(""));
}

void CVitalUtilsDlg::OnSize(UINT nType, int cx, int cy) {
	CDialogEx::OnSize(nType, cx, cy);

	CRect rwFileList;
	m_ctrlFileList.GetWindowRect(rwFileList);
	ScreenToClient(rwFileList);
	m_ctrlFileList.SetWindowPos(nullptr, 0, 0, rwFileList.Width(), cy - rwFileList.top - 10, SWP_NOZORDER | SWP_NOMOVE);

	CRect rwTrkList;
	m_ctrlTrkList.GetWindowRect(rwTrkList);
	ScreenToClient(rwTrkList);
	m_ctrlTrkList.SetWindowPos(nullptr, 0, 0, rwTrkList.Width(), cy - rwTrkList.top - 10, SWP_NOZORDER | SWP_NOMOVE);

	CRect rwLog;
	m_ctrLog.GetWindowRect(rwLog);
	ScreenToClient(rwLog);
	m_ctrLog.SetWindowPos(nullptr, 0, 0, cx - rwLog.left - 10, cy - rwLog.top - 10, SWP_NOZORDER | SWP_NOMOVE);
}

void CVitalUtilsDlg::OnOK() {
}

void CVitalUtilsDlg::OnCancel() {
}

void CVitalUtilsDlg::OnClose() {
	CDialogEx::OnCancel();
}

void CVitalUtilsDlg::OnDestroy() {
	KillTimer(0);
	KillTimer(1);
	CDialogEx::OnDestroy();
}

void CVitalUtilsDlg::OnGetdispinfoFilelist(NMHDR *pNMHDR, LRESULT *pResult) {
	NMLVDISPINFO *pDispInfo = reinterpret_cast<NMLVDISPINFO*>(pNMHDR);

	LVITEM* pItem = &(pDispInfo->item);
	EnterCriticalSection(&theApp.m_csFile);
	if (pItem->iItem >= m_shown.size()) {
		LeaveCriticalSection(&theApp.m_csFile);
		return;
	}
	auto p = m_shown[pItem->iItem];
	LeaveCriticalSection(&theApp.m_csFile);
	if (pItem->mask & LVIF_TEXT) {
		switch (pItem->iSubItem) {
		case 0: strncpy(pItem->pszText, p->filename, pItem->cchTextMax - 1); break;
		case 1: strncpy(pItem->pszText, p->dirname, pItem->cchTextMax - 1); break;
		case 2: strncpy(pItem->pszText, DtToStr(p->mtime).Left(16), pItem->cchTextMax - 1); break;
		case 3: strncpy(pItem->pszText, FormatSize(p->size), pItem->cchTextMax - 1); break;
		}
	} 

/*	if (pItem->mask & LVIF_IMAGE) {
		// LVIS_STATEIMAGEMASK에 따라 15개의 상태값을 저장할 수 있다
		pItem->iImage = (pItem->state & LVIS_CHECKED)?1:0;
	}
	
	if (pItem->mask & LVIF_STATE) {
		if (m_ctrlFileList.GetItemState(pItem->iItem, LVIS_SELECTED)) {
			pItem->state |= INDEXTOSTATEIMAGEMASK(2);
		} else {
			pItem->state |= INDEXTOSTATEIMAGEMASK(1);
		}
		pItem->stateMask |= LVIS_STATEIMAGEMASK;
	}
	*/
	*pResult = 0;
}

BOOL CVitalUtilsDlg::PreTranslateMessage(MSG* pMsg) {
	if (pMsg->message == WM_KEYDOWN) {
		if (pMsg->wParam == VK_DELETE) {
			if (IDYES != AfxMessageBox("Are you sure to delete these files?", MB_YESNO)) {
				return TRUE;
			}

		}
		if (::GetKeyState(VK_CONTROL) < 0) {
			switch (pMsg->wParam) {
			case 'A': // ctrl+a
				if (GetFocus()->m_hWnd == m_ctrlFileList.m_hWnd) {
					m_ctrlFileList.SetRedraw(FALSE);
					for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
						m_ctrlFileList.SetItemState(i, LVIS_SELECTED, LVIS_SELECTED);
					}
					m_ctrlFileList.SetRedraw(TRUE);
					m_ctrlFileList.RedrawWindow();
				} else if (GetFocus()->m_hWnd == m_ctrlTrkList.m_hWnd) {
					m_ctrlTrkList.SelItemRange(TRUE, 0, m_ctrlTrkList.GetCount());
					m_ctrlTrkList.Invalidate();
				}
				return TRUE;
			case 'C': // ctrl+c
				if (GetFocus()->m_hWnd == m_ctrlFileList.m_hWnd) {
					DWORD strlen = 0;
					vector<CString> showns;
					for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
						if(m_ctrlFileList.GetItemState(i, LVIS_SELECTED) != LVIS_SELECTED) continue;
						auto p = m_shown[i];
						showns.push_back(p->path);
						strlen += p->path.GetLength() + 1;
					}
					DWORD buflen = strlen + sizeof(DROPFILES) + 2;
					buflen = (buflen / 32 + 1) * 32;

					BeginWaitCursor();

					HGLOBAL hMemFile = ::GlobalAlloc(GMEM_ZEROINIT | GMEM_MOVEABLE | GMEM_DDESHARE, buflen);
					auto pbuf = (char*)::GlobalLock(hMemFile);
					((DROPFILES*)pbuf)->pFiles = sizeof(DROPFILES);
					pbuf += sizeof(DROPFILES);
					for (auto& s : showns) {
						strcpy(pbuf, s);
						pbuf += s.GetLength() + 1;
					}
					::GlobalUnlock(hMemFile);

					strlen += showns.size(); // '\r\n'을 할거이므로
					HGLOBAL hMemText = ::GlobalAlloc(GMEM_MOVEABLE, strlen);
					pbuf = (char*)::GlobalLock(hMemText);
					for (auto& s : showns) {
						strcpy(pbuf, s);
						pbuf += s.GetLength();
						(*pbuf++) = '\r';
						(*pbuf++) = '\n';
					}
					::GlobalUnlock(hMemText);

					OpenClipboard();
					EmptyClipboard();
					SetClipboardData(CF_HDROP, hMemFile);
					SetClipboardData(CF_TEXT, hMemText);
					CloseClipboard();

					EndWaitCursor();
				}
				return TRUE;
			}
		}
	}
	return CDialogEx::PreTranslateMessage(pMsg);
}

void CVitalUtilsDlg::OnNMDblclkFilelist(NMHDR *pNMHDR, LRESULT *pResult) {
	LPNMITEMACTIVATE pNMItemActivate = reinterpret_cast<LPNMITEMACTIVATE>(pNMHDR);
	if (pNMItemActivate->iItem < m_shown.size()) {
		auto path = m_shown[pNMItemActivate->iItem]->path;
		ShellExecute(NULL, "open", GetModuleDir() + "\\vital.exe", "/f " + path, nullptr, SW_SHOW);
	}
	*pResult = 0;
}

void CVitalUtilsDlg::OnBnClickedRescan() {
	// 기존 선택들을 전부 지우고
	m_ctrlTrkList.SetCurSel(-1);
	m_ctrlTrkList.ResetContent();
	m_shown.clear();

	// 기존 파일 선택을 전부 지우고
	m_ctrlFileList.SetItemCountEx(0, NULL);

	EnterCriticalSection(&theApp.m_csFile);
	auto copy = theApp.m_files;
	theApp.m_files.clear();
	LeaveCriticalSection(&theApp.m_csFile);
	for (auto& p : copy)
		delete p;

	// 캐쉬도 전부 날림
	theApp.m_devtrks.clear();
	theApp.m_path_trklist.clear();

	// 입력 디렉토리 읽기 쓰레드 시작
	_beginthreadex(0, 0, RescanThread, 0, 0, 0);
}

void CVitalUtilsDlg::OnSelchangeTrklist() {
	UpdateData(TRUE);
	vector<CString> devtrks;
	for (int i = 0; i < m_ctrlTrkList.GetCount(); i++) {
		if (!m_ctrlTrkList.GetSel(i)) continue;
		CString s; m_ctrlTrkList.GetText(i, s);
		devtrks.push_back(s);
	}

	CString str; m_ctrlSelOper.GetWindowText(str);
	bool is_or = (str == "OR");

	// 보여질 파일 목록을 업데이트
	vector<VITAL_FILE_INFO*> newshown;
	for (int i = 0; ; i++) {
		EnterCriticalSection(&theApp.m_csFile);
		if (i >= theApp.m_files.size()) {
			LeaveCriticalSection(&theApp.m_csFile);
			break;
		}
		auto p = theApp.m_files[i];
		LeaveCriticalSection(&theApp.m_csFile);

		auto filedevtrk = theApp.m_path_trklist[p->path].second;
		if (filedevtrk.Left(1) != ',') filedevtrk = ',' + filedevtrk;
		if (filedevtrk.Right(1) != ',') filedevtrk = filedevtrk + ',';
		bool shown = false;
		if (is_or) { // 선택된 트랙 중 하나라도 있으면 보여짐
			for (const auto& dt : devtrks) {
				if (filedevtrk.Find(CString(",") + dt + ",") >= 0) {
					shown = true;
					break;
				}
			}
		} else { // 하나라도 없으면 안보임
			shown = true;
			for (const auto& dt : devtrks) { 
				if (filedevtrk.Find(CString(",") + dt + ",") < 0) {
					shown = false;
					break;
				}
			}
		}
		if (shown) newshown.push_back(p);
	}

	m_shown = newshown; // 자동으로 갯수에 반영될 것이다

	// rename 창을 업데이트
	m_dlgRename.UpdateForm();

	// 보여질 파일 목록을 업데이트
	m_ctrlFileList.Invalidate();

	UpdateData(FALSE);
}

void CVitalUtilsDlg::OnCbnSelchangeTrkOper() {
	OnSelchangeTrklist();
}

void CVitalUtilsDlg::OnBnClickedTrkAll() {
	m_ctrlTrkList.SelItemRange(TRUE, 0, m_ctrlTrkList.GetCount());
	m_dlgRename.UpdateForm();
}

void CVitalUtilsDlg::OnBnClickedTrkNone() {
	m_ctrlTrkList.SelItemRange(FALSE, 0, m_ctrlTrkList.GetCount());
	m_dlgRename.UpdateForm();
}

void CVitalUtilsDlg::OnBnClickedFileAll() {
	m_ctrlFileList.SetRedraw(FALSE);
	for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
		m_ctrlFileList.SetItemState(i, LVIS_SELECTED, LVIS_SELECTED);
	}
	m_ctrlFileList.SetRedraw(TRUE);
	m_ctrlFileList.SetFocus();
	m_ctrlFileList.RedrawWindow();
}

void CVitalUtilsDlg::OnBnClickedFileNone() {
	m_ctrlFileList.SetRedraw(FALSE);
	for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
		m_ctrlFileList.SetItemState(i, ~LVIS_SELECTED, LVIS_SELECTED);
	}
	m_ctrlFileList.SetRedraw(TRUE);
	m_ctrlFileList.RedrawWindow();
}

void CVitalUtilsDlg::OnBnClickedSaveList() {
	CString szFilter = _T("Comma-Seperated Values (*.csv)|*.csv|");
	CFileDialog dlg(FALSE, "CSV", NULL, OFN_EXPLORER | OFN_OVERWRITEPROMPT | OFN_HIDEREADONLY, szFilter, this);
	int result = dlg.DoModal();
	if (result != IDOK) return;

	theApp.Log("Saving list");

	auto showns = m_shown;
	auto devtrks = theApp.m_devtrks;

	auto filepath = dlg.GetPathName();
	FILE* fo = fopen(filepath, "wt");
	if (!fo) {
		theApp.Log("Saving list failed! " + GetLastErrorString());
		return;
	}
	// 헤더를 출력
	fprintf(fo, "Filename,Path,");
	bool is_first = true;
	for (const auto& trkname : devtrks) {
		if (is_first) is_first = false;
		else fputc(',', fo);
		fputs(trkname, fo);
	}

	fprintf(fo, "\n");
	for (auto& it : showns) {
		fprintf(fo, "%s,%s", BaseName(it->path), it->path);
		auto& tl = Explode(theApp.m_path_trklist[it->path].second, ',');
		map<CString, BYTE> trk_exists;
		for (const auto& trkname : tl) trk_exists[trkname] = 1;
		for (const auto& trkname : devtrks) {
			fputc(',', fo);
			fputc(trk_exists[trkname]?'1':'0', fo);
		}
		fputc('\n', fo);
	}
	fclose(fo);

	theApp.Log("Saving list done");
}

void CVitalUtilsDlg::OnBnClickedSelCopyFiles() {
	m_dlgCopyFiles.ShowWindow(SW_SHOW);
	m_dlgRecs.ShowWindow(SW_HIDE);
	m_dlgRename.ShowWindow(SW_HIDE);
	m_dlgDelTrks.ShowWindow(SW_HIDE);
}

void CVitalUtilsDlg::OnBnClickedSelRecs() {
	m_dlgCopyFiles.ShowWindow(SW_HIDE);
	m_dlgRecs.ShowWindow(SW_SHOW);
	m_dlgRename.ShowWindow(SW_HIDE);
	m_dlgDelTrks.ShowWindow(SW_HIDE);
}

void CVitalUtilsDlg::OnBnClickedSelRenameDev() {
	m_dlgCopyFiles.ShowWindow(SW_HIDE);
	m_dlgRecs.ShowWindow(SW_HIDE);
	m_dlgRename.ShowWindow(SW_SHOW);
	m_dlgRename.UpdateForm();
	m_dlgDelTrks.ShowWindow(SW_HIDE);
}

void CVitalUtilsDlg::OnBnClickedSelDelTrks() {
	m_dlgCopyFiles.ShowWindow(SW_HIDE);
	m_dlgRecs.ShowWindow(SW_HIDE);
	m_dlgRename.ShowWindow(SW_HIDE);
	m_dlgDelTrks.ShowWindow(SW_SHOW);
}

void CVitalUtilsDlg::OnBnClickedSelRenameTrks() {
	m_dlgCopyFiles.ShowWindow(SW_HIDE);
	m_dlgRecs.ShowWindow(SW_HIDE);
	m_dlgRename.ShowWindow(SW_SHOW);
	m_dlgRename.UpdateForm();
	m_dlgDelTrks.ShowWindow(SW_HIDE);
}

void CVitalUtilsDlg::OnLvnItemchangedFilelist(NMHDR *pNMHDR, LRESULT *pResult) {
	LPNMLISTVIEW pNMLV = reinterpret_cast<LPNMLISTVIEW>(pNMHDR);
	bool shiftpressed = ::GetKeyState(VK_SHIFT) < 0;
	auto iItem = pNMLV->iItem;
	TRACE("item %d, old %d, new %d\n", iItem, pNMLV->uOldState, pNMLV->uNewState);
	if (iItem == -1 && (pNMLV->uOldState & LVIS_SELECTED) && ((pNMLV->uNewState & LVIS_SELECTED) == 0)) { // deselect all
//		auto iItem = pNMLV->iItem;
//		TRACE("item:%d, old:%x, new:%x\n", iItem, pNMLV->uOldState, pNMLV->uNewState);
//		m_ctrlFileList.SetItemState(m_nLastFileSel, LVIS_SELECTED, LVIS_SELECTED);
		TRACE("selecting: %d\n", m_nLastFileSel);
	}
	if ((pNMLV->uNewState & LVIS_SELECTED) && ((pNMLV->uOldState & LVIS_SELECTED) == 0)) {// 선택이면?
		m_nLastFileSel = iItem; // 최종 선택 아이템 저장
		TRACE("saving lastsel: %d\n", iItem);
	}
	/*
	if (pNMLV->uNewState & LVIS_SELECTED) {// 선택이면?
		if (shiftpressed) {
			if (m_nLastFileSel >= 0 && m_nLastFileSel != iItem) {
				for (int i = min(iItem, m_nLastFileSel); i < max(iItem, m_nLastFileSel); i++) {
					m_ctrlFileList.SetItemState(i, LVIS_SELECTED, LVIS_SELECTED);
				}
			}
		} else {
			m_nLastFileSel = iItem; // 최종 선택 아이템 저장
		}
		*pResult = 1;
		return;
	} 
	
	if ((pNMLV->uOldState & LVIS_SELECTED) && (0 == (pNMLV->uNewState & (LVIS_SELECTED | LVIS_FOCUSED)))) { // focus가 없는데 deselect 이면?
		m_ctrlFileList.SetItemState(iItem, LVIS_SELECTED, LVIS_SELECTED); // 다시 선택해줌
		*pResult = 1;
		return;
	}*/

	// 아무런 동작 안함
	*pResult = 0;
}

void CVitalUtilsDlg::OnBnClickedTrkSelect() {
	// 검색어에 따라 데이터를 선택. 무조건 검색어들의 OR 이다. 필요하면 더 정확한 (예를 들어 파일명) 검색어를 넣으면 되므로
	CString str; m_ctrlTrkFilter.GetWindowText(str);
	auto lines = Explode(str, '\n');
	for (auto& line : lines) {
		line = line.Trim().MakeLower();
	}
	for (int i = 0; i < m_ctrlTrkList.GetCount(); i++) {
		CString s; m_ctrlTrkList.GetText(i, s);
		s.MakeLower();
		bool shown = false;
		for (auto& line : lines) {
			if (line.IsEmpty()) continue;
			if (s.Find(line) >= 0) {
				shown = true;
				break;
			}
		}
		m_ctrlTrkList.SetSel(i, shown);
	}
	m_ctrlTrkList.SetFocus();
}

void CVitalUtilsDlg::OnBnClickedSelect() {
	// 파일명에 정확히 일치
	BOOL exact = m_ctrlExact.GetCheck();
	// 검색어에 따라 데이터를 선택. 무조건 검색어들의 OR 이다. 필요하면 더 정확한 (예를 들어 파일명) 검색어를 넣으면 되므로
	CString str; m_ctrlFilter.GetWindowText(str);
	auto lines = Explode(str, '\n');
	for (auto& line : lines) {
		line = line.Trim().MakeLower();
	}
	m_ctrlFileList.SetRedraw(FALSE);
	for (int i = 0; i < m_ctrlFileList.GetItemCount(); i++) {
		auto path = m_shown[i]->path;
		path.MakeLower();
		bool shown = false;
		for (auto& line : lines) {
			if (line.IsEmpty()) continue;
			if (!exact) {
				if (path.Find(line) >= 0) {
					shown = true;
					break;
				}
			} else {
				if (path == line) {
					shown = true;
					break;
				}
				CString filename = BaseName(path);
				if (filename == line) {
					shown = true;
					break;
				}
				// 확장자는 항상 .vital 임
				CString casename = filename.Left(filename.GetLength()-6);
				if (casename == line) {
					shown = true;
					break;
				}
			}
		}
		m_ctrlFileList.SetItemState(i, shown?LVIS_SELECTED:0, LVIS_SELECTED);
	}
	m_ctrlFileList.SetRedraw(TRUE);
	m_ctrlFileList.RedrawWindow();
	m_ctrlFileList.SetFocus();
}

void CVitalUtilsDlg::OnHdnItemclickFilelist(NMHDR *pNMHDR, LRESULT *pResult) {
	LPNMHEADER phdr = reinterpret_cast<LPNMHEADER>(pNMHDR);

	int olditem = m_nSortItem;

	if (m_nSortItem == phdr->iItem) {
		m_bSortAsc = !m_bSortAsc;
	} else {
		m_nSortItem = phdr->iItem;
		m_bSortAsc = true;
	}

	HDITEM hi;
	hi.mask = HDI_FORMAT;
	m_ctrlFileList.GetHeaderCtrl()->GetItem(m_nSortItem, &hi);
	if (m_bSortAsc) {
		hi.fmt |= HDF_SORTUP;
		hi.fmt &= ~HDF_SORTDOWN;
	} else {
		hi.fmt |= HDF_SORTDOWN;
		hi.fmt &= ~HDF_SORTUP;
	}
	m_ctrlFileList.GetHeaderCtrl()->SetItem(m_nSortItem, &hi);

	if (olditem != m_nSortItem) { // 이전 아이템의 화살표를 삭제
		m_ctrlFileList.GetHeaderCtrl()->GetItem(olditem, &hi);
		hi.fmt &= ~HDF_SORTDOWN;
		hi.fmt &= ~HDF_SORTUP;
		m_ctrlFileList.GetHeaderCtrl()->SetItem(olditem, &hi);
	}

	m_ctrlFileList.SetRedraw(FALSE);
	switch (m_nSortItem) {
	case 0:
		if (m_bSortAsc) sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->filename < b->filename; });
		else sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->filename > b->filename; });
		break;
	case 1:
		if (m_bSortAsc) sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->dirname < b->dirname; });
		else sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->dirname > b->dirname; });
		break;
	case 2:
		if (m_bSortAsc) sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->mtime < b->mtime; });
		else sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->mtime > b->mtime; });
		break;
	case 3:
		if (m_bSortAsc) sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->size < b->size; });
		else sort(m_shown.begin(), m_shown.end(), [](const VITAL_FILE_INFO* a, const VITAL_FILE_INFO* b) -> bool { return a->size > b->size; });
		break;
	}
	m_ctrlFileList.SetRedraw(TRUE);
	m_ctrlFileList.RedrawWindow();

	*pResult = 0;
}

