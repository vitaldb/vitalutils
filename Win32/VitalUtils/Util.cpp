#include "stdafx.h"
#include "Util.h"

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

string GetLastInetErrorString() {
	HMODULE hInet = GetModuleHandle("wininet.dll");
	LPVOID lpMsgBuf;
	int i = FormatMessage(
		FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
		FORMAT_MESSAGE_IGNORE_INSERTS | FORMAT_MESSAGE_FROM_HMODULE,
		hInet, 12029, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
		(LPTSTR)&lpMsgBuf, 0, NULL);
	string str((LPCTSTR)lpMsgBuf);
	LocalFree(lpMsgBuf);
	return str;
}

string basename(string path, bool withext) {
	auto str = substr(path, path.find_last_of("/\\") + 1);
	if (withext) return str;
	return substr(str, 0, str.find_last_of('.'));
}

string escape_csv(string s) {
	auto qpos = s.find('"');
	if (qpos != -1) s.insert(s.begin() + qpos, '"');

	bool need_quote = false;

	if (s.find(',') > -1) need_quote = true;
	if (s.find('\n') > -1) need_quote = true;
	if (s.find('\r') > -1) need_quote = true;

	if (need_quote) s = '"' + s + '"';

	return s;
}

double parse_dt(string str) {
	regex pattern("^(([0-9]{4})[\\/-]((1[0-2])|([0]?[1-9]))[\\/-]((3[0-1])|([1-2][0-9])|([0]?[1-9]))[ ])?(([0-4]?[0-9])):([0-5]?[0-9])(:(([0-5]?[0-9])([\\.][0-9]{1,3})?))?");
	cmatch matches;
	if (!regex_search(str.c_str(), matches, pattern)) return 0.0;

	tm st;
	string s = matches.str(2);
	st.tm_year = atoi(ltrim(s.c_str(), "0").c_str()) - 1900;
	s = matches.str(3).c_str();
	st.tm_mon = atoi(ltrim(s.c_str(), "0").c_str()) - 1;
	s = matches.str(6).c_str();
	st.tm_mday = atoi(ltrim(s.c_str(), "0").c_str());
	s = matches.str(10).c_str();
	st.tm_hour = atoi(ltrim(s.c_str(), "0").c_str());
	s = matches.str(12).c_str();
	st.tm_min = atoi(ltrim(s.c_str(), "0").c_str());
	s = matches.str(14).c_str();
	double second = atof(ltrim(s.c_str(), "0").c_str());
	st.tm_sec = (int)second;

	return (double)mktime(&st) + second - (int)(second);
}

string replace_all(string s, const char from, const char to) {
	replace(s.begin(), s.end(), from, to);  // replace all 'x' to 'y'
	return s;
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
string get_conf_dir() {
	TCHAR szPath[MAX_PATH] = { 0 };
	if (!SUCCEEDED(SHGetFolderPath(NULL, CSIDL_APPDATA | CSIDL_FLAG_CREATE, NULL, SHGFP_TYPE_CURRENT, szPath)))
		return "";
	string ret = rtrim(szPath, '\\');
	ret += "\\VitalRecorder\\";
	CreateDirectory(ret.c_str(), NULL);
	return ret;
}

string get_python_path() {
	return get_conf_dir() + "python\\python.exe";
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

time_t filetime_to_unixtime(const FILETIME& ft) {
	ULARGE_INTEGER ull;
	ull.LowPart = ft.dwLowDateTime;
	ull.HighPart = ft.dwHighDateTime;
	return (time_t)(ull.QuadPart / 10000000ULL - 11644473600ULL);
}

string implode(const vector<string>& arr, string sep) {
	string ret;
	for (unsigned int i = 0; i < arr.size(); i++) {
		if (i > 0) ret += sep;
		ret += arr[i];
	}
	return ret;
}

string num_to_str(int d) {
	return str_format("%d", d);
}

string num_to_str(unsigned long long d) {
	return str_format("%u", d);
}

string num_to_str(unsigned char d) {
	return str_format("%u", d);
}

string num_to_str(unsigned int d) {
	return str_format("%u", d);
}

string num_to_str(double f) {
	auto str = str_format("%f", f);
	if (str.find('.') != string::npos) str = rtrim(str, '0');
	return rtrim(str, '.');
}

string num_to_str(double f, int prec) {
	if (prec < 0) return num_to_str(f);
	auto fmt = str_format("%%.%uf", prec);
	auto str = str_format(fmt, f);
	return str;
	//if (str.find('.') != string::npos) str = rtrim(str, '0');
	//return rtrim(str, '.');
}

unsigned int str_to_uint(const string& s) {
	return strtoul(s.c_str(), nullptr, 10);
}

string to_lower(string strToConvert) {
	transform(strToConvert.begin(), strToConvert.end(), strToConvert.begin(), ::tolower);
	return strToConvert;
}
