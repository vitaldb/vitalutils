#include "stdafx.h"
#include "VitalUtils.h"
#include "VitalUtilsDlg.h"
#include <time.h>
#include <thread>
#include <cctype>
#include <algorithm>
#include "dlgdownload.h"
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

string dt_to_str(time_t t) {
	tm* ptm = localtime(&t); // simple conversion
	SYSTEMTIME st;
	st.wYear = (WORD)(1900 + ptm->tm_year);
	st.wMonth = (WORD)(1 + ptm->tm_mon);
	st.wDayOfWeek = (WORD)ptm->tm_wday;
	st.wDay = (WORD)ptm->tm_mday;
	st.wHour = (WORD)ptm->tm_hour;
	st.wMinute = (WORD)ptm->tm_min;
	st.wSecond = (WORD)ptm->tm_sec;
	return str_format("%04d-%02d-%02d %02d:%02d:%02d", st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
}

// create dir recursively
string get_module_path() {
	char temp_path[MAX_PATH];
	GetModuleFileName(AfxGetInstanceHandle(), temp_path, sizeof(temp_path));
	return temp_path;
}

string get_module_dir() {
	return dirname(get_module_path());
}

string get_last_error_string() {
	//Get the error message, if any.
	DWORD errorMessageID = ::GetLastError();
	if (errorMessageID == 0) return ""; //No error message has been recorded

	LPSTR messageBuffer = nullptr;
	size_t size = FormatMessageA(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
								 NULL, errorMessageID, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPSTR)&messageBuffer, 0, NULL);

	string message(messageBuffer, size);

	//Free the buffer.
	LocalFree(messageBuffer);

	return message;
}

// output과 error를 모두 받음
string exec_cmd_get_error(string cmd) {
	HANDLE hPipeRead, hPipeWrite;

	SECURITY_ATTRIBUTES saAttr = { sizeof(SECURITY_ATTRIBUTES) };
	saAttr.bInheritHandle = TRUE;   //Pipe handles are inherited by child process.
	saAttr.lpSecurityDescriptor = NULL;

	// Create a pipe to get results from child's stdout.
	if (!CreatePipe(&hPipeRead, &hPipeWrite, &saAttr, 0))
		return "";

	STARTUPINFO si = { sizeof(STARTUPINFO) };
	si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
	si.hStdOutput = hPipeWrite;
	si.hStdError = hPipeWrite;
	si.wShowWindow = SW_HIDE;       // Prevents cmd window from flashing. Requires STARTF_USESHOWWINDOW in dwFlags.

	PROCESS_INFORMATION pi = { 0 };

	BOOL fSuccess = CreateProcess(NULL, (LPSTR)cmd.c_str(), NULL, NULL, TRUE, CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi);
	if (!fSuccess) {
		theApp.log(cmd + " " + get_last_error_string());
		CloseHandle(hPipeWrite);
		CloseHandle(hPipeRead);
		return "";
	}

	string ret;
	bool bProcessEnded = false;
	for (; !bProcessEnded;) {
		// Give some timeslice (50ms), so we won't waste 100% cpu.
		bProcessEnded = WaitForSingleObject(pi.hProcess, 50) == WAIT_OBJECT_0;

		// Even if process exited - we continue reading, if there is some data available over pipe.
		for (;;) {
			char buf[1024];
			DWORD dwRead = 0;
			DWORD dwAvail = 0;
			if (!::PeekNamedPipe(hPipeRead, NULL, 0, NULL, &dwAvail, NULL))
				break;

			if (!dwAvail) // no data available, return
				break;

			if (!::ReadFile(hPipeRead, buf, min(sizeof(buf) - 1, dwAvail), &dwRead, NULL) || !dwRead)
				// error, the child process might ended
				break;

			ret.append(buf, dwRead);
		}
	} //for

	CloseHandle(hPipeWrite);
	CloseHandle(hPipeRead);
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	return ret;
}

string exec_cmd_get_output(string cmd) {
	string strResult;
	HANDLE hPipeRead, hPipeWrite;

	SECURITY_ATTRIBUTES saAttr = { sizeof(SECURITY_ATTRIBUTES) };
	saAttr.bInheritHandle = TRUE;   //Pipe handles are inherited by child process.
	saAttr.lpSecurityDescriptor = NULL;

	// Create a pipe to get results from child's stdout.
	if (!CreatePipe(&hPipeRead, &hPipeWrite, &saAttr, 0))
		return strResult;

	STARTUPINFO si = { sizeof(STARTUPINFO) };
	si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
	si.hStdOutput = hPipeWrite;
	si.hStdError = NULL;
	si.wShowWindow = SW_HIDE;       // Prevents cmd window from flashing. Requires STARTF_USESHOWWINDOW in dwFlags.

	PROCESS_INFORMATION pi = { 0 };

	BOOL fSuccess = CreateProcess(NULL, (LPSTR)cmd.c_str(), NULL, NULL, TRUE, CREATE_NEW_CONSOLE, NULL, NULL, &si, &pi);
	if (!fSuccess) {
		theApp.log(cmd + " " + get_last_error_string());
		CloseHandle(hPipeWrite);
		CloseHandle(hPipeRead);
		return strResult;
	}

	bool bProcessEnded = false;
	for (; !bProcessEnded;) {
		// Give some timeslice (50ms), so we won't waste 100% cpu.
		bProcessEnded = WaitForSingleObject(pi.hProcess, 50) == WAIT_OBJECT_0;

		// Even if process exited - we continue reading, if there is some data available over pipe.
		for (;;) {
			char buf[1024];
			DWORD dwRead = 0;
			DWORD dwAvail = 0;
			if (!::PeekNamedPipe(hPipeRead, NULL, 0, NULL, &dwAvail, NULL))
				break;

			if (!dwAvail) // no data available, return
				break;

			if (!::ReadFile(hPipeRead, buf, min(sizeof(buf) - 1, dwAvail), &dwRead, NULL) || !dwRead)
				// error, the child process might ended
				break;

			buf[dwRead] = 0;
			strResult += buf;
		}
	} //for

	CloseHandle(hPipeWrite);
	CloseHandle(hPipeRead);
	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);
	return strResult;
}

// pipe 된 실행을 하고 출력 결과를 ofile 에 저장함
bool exec_cmd(string cmdLine, string ofile) {
	auto jobid = GetThreadId(GetCurrentThread());

	// 예제 코드 https://stackoverflow.com/questions/7018228/how-do-i-redirect-output-to-a-file-with-createprocess
	SECURITY_ATTRIBUTES sa;
	sa.nLength = sizeof(sa);
	sa.lpSecurityDescriptor = NULL;
	sa.bInheritHandle = TRUE;

	// 파이프를 생성. // temp file 을 연다.
	bool ret = false;
	HANDLE fo = CreateFile(ofile.c_str(), GENERIC_WRITE, FILE_SHARE_WRITE | FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
	if (fo == INVALID_HANDLE_VALUE) {
		theApp.log(str_format("[%d] cannot open file", jobid));
		return false;
	}

	// 에러를 출력할 파이프를 생성
	// https://msdn.microsoft.com/ko-kr/library/windows/desktop/ms682499(v=vs.85).aspx
	HANDLE stder, stdew;
	if (!CreatePipe(&stder, &stdew, &sa, 0)) {
		theApp.log("cannot create pipe");
		return false;
	}
	if (!SetHandleInformation(stder, HANDLE_FLAG_INHERIT, 0)) {
		theApp.log("set handle information");
		return false;
	}

	STARTUPINFO si = {};
	si.cb = sizeof(si);
	si.wShowWindow = SW_HIDE;
	si.hStdOutput = fo;
	si.hStdError = stdew;
	si.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;

	PROCESS_INFORMATION pi = {};

	if (!CreateProcess(NULL, (LPSTR)cmdLine.c_str(), NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
		theApp.log("createprocess error " + get_last_error_string());
		goto clean;
	}
	
	char buf[4096];
	while (1) {
		if (WAIT_TIMEOUT != WaitForSingleObject(pi.hProcess, 500)) break;
		for (DWORD dwAvail = 0; PeekNamedPipe(stder, 0, 0, 0, &dwAvail, 0) && dwAvail; dwAvail = 0) {
			DWORD dwRead = 0;
			ReadFile(stder, buf, min(4095, dwAvail), &dwRead, 0);
			theApp.log(string(buf, dwRead));
		}
	}
	// 프로세스 종료
	CloseHandle(pi.hThread);
	CloseHandle(pi.hProcess);

	ret = true;

clean:
	if (fo) CloseHandle(fo);

	if (stder) CloseHandle(stder);
	if (stdew) CloseHandle(stdew); // 에러에다가 우리가 쓸 일 없음

	return ret;
}

string substr(const string& s, size_t pos, size_t len) {
	try {
		return s.substr(pos, len);
	}
	catch (...) {
	}
	return "";
}

string make_lower(std::string s) {
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
	return s;
}

string extname(string path) {
	auto pos = path.find_last_of('.');
	if (pos == string::npos) return "";
	return make_lower(substr(path, pos + 1));
}

string dirname(string path) {
	return substr(path, 0, path.find_last_of("/\\") + 1);
}

string basename(string path) {
	return substr(path, path.find_last_of("/\\") + 1);
}

time_t filetime_to_unixtime(const FILETIME &ft) {
	ULARGE_INTEGER ull;
	ull.LowPart = ft.dwLowDateTime;
	ull.HighPart = ft.dwHighDateTime;
	return (time_t)(ull.QuadPart / 10000000ULL - 11644473600ULL);
}

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

	if ( !file_exists(get_module_dir() + "utilities\\vital_trks.exe") || 
		(!file_exists(get_module_dir() + "utilities\\vital_recs.exe") && !file_exists(get_module_dir() + "utilities\\vital_recs_x64.exe"))) {
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

string replace_all(string res, const string& pattern, const string& replace) {
	string::size_type pos = 0;
	string::size_type offset = 0;
	while ((pos = res.find(pattern, offset)) != string::npos) {
		res.replace(res.begin() + pos, res.begin() + pos + pattern.size(), replace);
		offset = pos + replace.size();
	}
	return res;
}

void CVitalUtilsApp::log(string msg) {
	// 관용구 제거
	auto trivial = get_module_dir();
	msg = replace_all(msg, trivial, "");
	if (msg.empty()) return;
	
	m_msgs.Push(make_pair((DWORD)time(nullptr), msg));
}

vector<string> explode(string str, string sep) {
	vector<string> ret;
	if (str.empty()) return ret;
	if (str.size() < sep.size()) str += sep;
	else if (substr(str, str.size() - sep.size()) != sep) str += sep;

	for (size_t i = 0, j = 0; (j = str.find(sep, i)) != string::npos; i = j + sep.size()) {
		ret.push_back(substr(str, i, j - i));
	}
	if (ret.empty()) {
		ret.push_back(str);
	}
	return ret;
}

vector<string> explode(const string& s, const char c) {
	string buf;
	vector<string> ret;
	for (auto n : s) {
		if (n != c)
			buf += n;
		else if (n == c) {
			ret.push_back(buf);
			buf.clear();
		}
	}
	if (!buf.empty()) ret.push_back(buf);
	return ret;
}

void CVitalUtilsApp::InstallPython() {
	char tmpdir[MAX_PATH];
	GetTempPath(MAX_PATH, tmpdir);

	CString strSetupUrl = "https:/""/vitaldb.net/python_setup.exe";
	CString tmppath; tmppath.Format("%spysetup_%u.exe", tmpdir, time(nullptr));
	CDlgDownload dlg(nullptr, strSetupUrl, tmppath);
	if (IDOK != dlg.DoModal()) {
		AfxMessageBox("Cannot download python setup file.\nPlease download it from " + strSetupUrl + "\nand run it in the Vital Recorder installation folder");
		return;
	}

	SHELLEXECUTEINFO shExInfo = { 0 };
	shExInfo.cbSize = sizeof(shExInfo);
	shExInfo.fMask = SEE_MASK_NOCLOSEPROCESS;
	shExInfo.hwnd = 0;
	shExInfo.lpVerb = _T("runas"); // Operation to perform
	shExInfo.lpFile = tmppath; // Application to start    
	shExInfo.lpParameters = ""; // Additional parameters
	shExInfo.lpDirectory = get_module_dir().c_str(); // 현재 프로그램 디렉토리에 압축을 풀어야함
	shExInfo.nShow = SW_SHOW;
	shExInfo.hInstApp = 0;

	if (!ShellExecuteEx(&shExInfo)) {
		AfxMessageBox("cannot start installer");
		return;
	}

	if (WAIT_OBJECT_0 != WaitForSingleObject(shExInfo.hProcess, INFINITE)) {
		AfxMessageBox("cannot install python");
		return;
	}

	CloseHandle(shExInfo.hProcess);

	theApp.log("Python installed");
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

