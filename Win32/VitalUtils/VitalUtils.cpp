#include "stdafx.h"
#include "VitalUtils.h"
#include "VitalUtilsDlg.h"
#include <time.h>
#include <thread>
#include <cctype>
#include <algorithm>
#include "dlgdownload.h"
#include "dlgunzip.h"
#include <filesystem>
#include <chrono>
namespace fs = std::filesystem;

#pragma comment(lib, "Version.lib")

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

BEGIN_MESSAGE_MAP(CVitalUtilsApp, CWinApp)
	ON_COMMAND(ID_HELP, &CWinApp::OnHelp)
END_MESSAGE_MAP()

CVitalUtilsApp::CVitalUtilsApp() {
	// 다시 시작 관리자 지원
	m_dwRestartManagerSupportFlags = AFX_RESTART_MANAGER_SUPPORT_RESTART;

	// TODO: 여기에 생성 코드를 추가합니다.
	// InitInstance에 모든 중요한 초기화 작업을 배치합니다.
}

CVitalUtilsApp theApp;

BOOL CVitalUtilsApp::InitInstance() {
	// 응용 프로그램 매니페스트가 ComCtl32.dll 버전 6 이상을 사용하여 비주얼 스타일을
	// 사용하도록 지정하는 경우, Windows XP 상에서 반드시 InitCommonControlsEx()가 필요합니다.
	// InitCommonControlsEx()를 사용하지 않으면 창을 만들 수 없습니다.
	INITCOMMONCONTROLSEX InitCtrls;
	InitCtrls.dwSize = sizeof(InitCtrls);
	// 응용 프로그램에서 사용할 모든 공용 컨트롤 클래스를 포함하도록
	// 이 항목을 설정하십시오.
	InitCtrls.dwICC = ICC_WIN95_CLASSES;
	InitCommonControlsEx(&InitCtrls);

	CWinApp::InitInstance();

	if ( !fs::exists(get_module_dir() + "utilities\\vital_trks.exe") || 
		(!fs::exists(get_module_dir() + "utilities\\vital_recs.exe") && !fs::exists(get_module_dir() + "utilities\\vital_recs_x64.exe"))) {
		AfxMessageBox(_T("vital_recs.exe and vital_trks.exe should be exist in utilities folder"));
		return FALSE;
	}

	// initialize winsock
	WSADATA wd;
	if (WSAStartup(MAKEWORD(2, 2), &wd) != 0) return FALSE;

	AfxOleInit();
	AfxEnableControlContainer(); //현재 프로젝트에서 ActiveX컨트롤을 사용할 수 있게 해줌
	AfxInitRichEdit();

	// 대화 상자에 셸 트리 뷰 또는
	// 셸 목록 뷰 컨트롤이 포함되어 있는 경우 셸 관리자를 만듭니다.
	CShellManager *pShellManager = new CShellManager;

	// MFC 컨트롤의 테마를 사용하기 위해 "Windows 원형" 비주얼 관리자 활성화
	CMFCVisualManager::SetDefaultManager(RUNTIME_CLASS(CMFCVisualManagerWindows));

	SetRegistryKey(_T("VitalUtils"));

	CVitalUtilsDlg dlg;
	m_pMainWnd = &dlg;
	INT_PTR nResponse = dlg.DoModal();
	if (nResponse == IDOK) {
		// TODO: 여기에 [확인]을 클릭하여 대화 상자가 없음질 때 처리할
		//  코드를 배치합니다.
	} else if (nResponse == IDCANCEL) {
		// TODO: 여기에 [취소]를 클릭하여 대화 상자가 없음질 때 처리할
		//  코드를 배치합니다.
	} else if (nResponse == -1) {
	}

	// 위에서 만든 셸 관리자를 삭제합니다.
	if (pShellManager != NULL) {
		delete pShellManager;
	}

#if !defined(_AFXDLL) && !defined(_AFX_NO_MFC_CONTROLS_IN_DIALOGS)
	ControlBarCleanUp();
#endif

	// 대화 상자가 닫혔으므로 응용 프로그램의 메시지 펌프를 시작하지 않고  응용 프로그램을 끝낼 수 있도록 FALSE를
	// 반환합니다.
	return FALSE;
}

void CVitalUtilsApp::log(string msg) {
	// 관용구 제거
	auto trivial = get_module_dir();
	msg = replace_all(msg, trivial, "");
	if (msg.empty()) return;
	
	m_msgs.Push(make_pair((DWORD)time(nullptr), msg));
}

bool CVitalUtilsApp::install_python() {
	auto python_path = get_python_path();

	// C:\Users\lucid\AppData\Roaming\VitalRecorder\python
	string odir = dirname(python_path);

	// download setup program to tmp dir
	error_code ec;
	auto tmpdir = fs::temp_directory_path(ec);
	auto localpath = tmpdir.string() + str_format("python_%u.zip", time(nullptr));
	CDlgDownload dlg_download("vitaldb.net:443", "/python.zip", localpath);
	if (IDOK != dlg_download.DoModal()) {
		AfxMessageBox("Download error");
		return false;
	}
	if (fs::file_size(localpath, ec) < 1000 * 1000) {  // 용량이 너무 작지는 않은지 확인
		TRACE("python < 1MB\n");
		return false;
	}

	//string localpath = "C:\\Users\\lucid\\OneDrive\\Desktop\\python_1646734847.zip";

	// 기본 설치 폴더
	CDlgUnzip dlg_unzip(localpath, odir);
	if (IDOK != dlg_unzip.DoModal()) return false;

	AfxMessageBox("filter server installed successfully!");
	return true;
}

bool get_file_contents(LPCTSTR path, vector<BYTE>& ret) {
	auto f = fopen(path, "rb");
	if (!f) return false;
	fseek(f, 0, SEEK_END);
	auto len = ftell(f);
	rewind(f);
	ret.resize(len);
	fread(&ret[0], 1, len, f);
	fclose(f);
	return true;
}

string ltrim(string s, char c) {
	return s.erase(0, s.find_first_not_of(c));
}

// trim from end (in place)
string rtrim(string s, char c) {
	return s.erase(s.find_last_not_of(c) + 1);
}

// trim from both ends (in place)
string trim(string s, char c) { return rtrim(ltrim(s, c), c); }

string ltrim(string s, const char* c) {
	return s.erase(0, s.find_first_not_of(c));
}

// trim from end (in place)
string rtrim(string s, const char* c) {
	return s.erase(s.find_last_not_of(c) + 1);
}

// trim from both ends (in place)
string trim(string s, const char* c) { return rtrim(ltrim(s, c), c); }

