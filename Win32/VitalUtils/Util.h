#pragma once
#include "VitalUtils.h"
#include <string>
#include <memory>
#include <stdarg.h>
#include <regex>
#include <time.h>
using namespace std;

time_t filetime_to_unixtime(const FILETIME& ft);
string replace_all(string message, const string& pattern, const string& replace);
string replace_all(string s, const char from, const char to);

string ltrim(string s, const char* c = " \r\n\v\t");
string rtrim(string s, const char* c = " \r\n\v\t");
string trim(string s, const char* c = " \r\n\v\t");
string ltrim(string s, char c);
string rtrim(string s, char c);
string trim(string s, char c);
bool get_file_contents(LPCTSTR path, vector<BYTE>& ret);
string dt_to_str(time_t t);

string get_module_path();
string get_module_dir();

string get_last_error_string();

string exec_cmd_get_error(string cmd);

string exec_cmd_get_output(string cmd);

// pipe 된 실행을 하고 출력 결과를 ofile 에 저장함
bool exec_cmd(string cmdLine, string ofile);

template <typename... Args>
inline string str_format(const char* format, Args... args) {
	size_t size = snprintf(nullptr, 0, format, args...) + 1;  // Extra space for '\0'
	auto buf = make_unique<char[]>(size);
	snprintf(buf.get(), size, format, args...);
	return string(buf.get(), buf.get() + size - 1);  // We don't want the '\0' inside
}

string substr(const string& s, size_t pos, size_t len = -1);
string make_lower(std::string s);
string extname(string path);
string dirname(string path);
time_t filetime_to_unixtime(const FILETIME& ft);
string implode(const vector<string>& arr, string sep);
string GetLastInetErrorString();

template <typename... Args>
inline string str_format(const string& format, Args... args) {
	size_t size = snprintf(nullptr, 0, format.c_str(), args...) + 1;  // Extra space for '\0'
	auto buf = make_unique<char[]>(size);
	snprintf(buf.get(), size, format.c_str(), args...);
	return string(buf.get(), buf.get() + size - 1);  // We don't want the '\0' inside
}

string num_to_str(int d);
string num_to_str(unsigned long long d);
string num_to_str(unsigned char d);
string num_to_str(unsigned int d);
string num_to_str(double f);
string num_to_str(double f, int prec);
unsigned int str_to_uint(const string& s);
string to_lower(string strToConvert);
string basename(string path, bool withext = true);

inline string string_format(const std::string fmt_str, ...) {
	int final_n, n = ((int)fmt_str.size()) * 2; // Reserve two times as much as the length of the fmt_str
	string str;
	unique_ptr<char[]> formatted;
	va_list ap;
	while (1) {
		formatted.reset(new char[n]); // Wrap the plain char array into the unique_ptr
		strcpy(&formatted[0], fmt_str.c_str());
		va_start(ap, fmt_str);
		final_n = vsnprintf(&formatted[0], n, fmt_str.c_str(), ap);
		va_end(ap);
		if (final_n < 0 || final_n >= n)
			n += abs(final_n - n + 1);
		else
			break;
	}
	return std::string(formatted.get());
}

string escape_csv(string s);

inline vector<string> explode(string str, string sep) {
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

inline vector<string> explode(const string& s, const char c) {
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

inline string ltrim(std::string s, const std::string& drop = " ") {
	return s.erase(0, s.find_first_not_of(drop));
}

double parse_dt(string str);

string get_conf_dir();
string get_python_path();