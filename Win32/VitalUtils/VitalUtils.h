#pragma once

#ifndef __AFXWIN_H__
	#error "PCH에 대해 이 파일을 포함하기 전에 'stdafx.h'를 포함합니다."
#endif

#include "resource.h"		// 주 기호입니다.
#include <list>
#include <set>
#include <map>
#include <vector>
#include "QUEUE.h"
#include <thread>
#include <mutex>

using namespace std;

bool exec_cmd(string cmdLine, string ofile);
string exec_cmd_get_error(string cmd);
string exec_cmd_get_output(string cmd);
string get_last_error_string();
string make_lower(string s);
string substr(const string& s, size_t pos = 0, size_t len = -1);
vector<string> explode(string str, string sep);
vector<string> explode(const string& str, const char sep);
string extname(string path);
string dirname(string path);
string basename(string path);
time_t filetime_to_unixtime(const FILETIME& ft);
string get_module_path();
string get_module_dir();
bool file_exists(string path);
string replace_all(string message, const string& pattern, const string& replace);
string ltrim(string s, const char* c = " \r\n\v\t");
string rtrim(string s, const char* c = " \r\n\v\t");
string trim(string s, const char* c = " \r\n\v\t");
string ltrim(string s, char c);
string rtrim(string s, char c);
string trim(string s, char c);
string dt_to_str(time_t t);
bool get_file_contents(LPCTSTR path, vector<BYTE>& ret);

template <typename... Args>
inline string str_format(const char* format, Args... args) {
	size_t size = snprintf(nullptr, 0, format, args...) + 1;  // Extra space for '\0'
	auto buf = make_unique<char[]>(size);
	snprintf(buf.get(), size, format, args...);
	return string(buf.get(), buf.get() + size - 1);  // We don't want the '\0' inside
}

typedef pair<time_t, string> timet_string;

class CVitalUtilsApp : public CWinApp {
public:
	CVitalUtilsApp();

// 재정의입니다.
public:
	virtual BOOL InitInstance();

public:
	DECLARE_MESSAGE_MAP()

public:
	CString m_ver;
	
	Queue<pair<time_t, string>> m_msgs;

	void log(string msg);
	void InstallPython();
};

extern CVitalUtilsApp theApp;
