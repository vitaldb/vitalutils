#pragma once
#include <string>
#include <memory>
#include <stdarg.h>
#include <regex>
#include <time.h>
using namespace std;

string basename(string path) {
	for (auto i = (int)path.size() - 1; i >= 0; i--) {
		if (path[i] == '\\' || path[i] == '/') 
			return path.substr(i+1);
	}
	return path;
}

std::string string_format(const std::string fmt_str, ...) {
	int final_n, n = ((int)fmt_str.size()) * 2; // Reserve two times as much as the length of the fmt_str
	std::string str;
	std::unique_ptr<char[]> formatted;
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

string escape_csv(string s) {
	int qpos = s.find('"');
	if (qpos > -1) s.insert(s.begin() + qpos, '"');
	int cpos = s.find(',');
	if (cpos > -1) s = '"' + s + '"';
	return s;
}

vector<string> explode(const string& s, const char& c) {
	string buff{ "" };
	vector<string> v;

	for (auto n : s) {
		if (n != c) buff += n; else
			if (n == c && buff != "") { v.push_back(buff); buff = ""; }
	}
	if (buff != "") v.push_back(buff);

	return v;
}

vector<string> explode(const string& str, const string& sep) {
	vector<string> v;
	size_t ipos = 0;
	while(1) {
		size_t nextpos = str.find(sep, ipos);
		if (nextpos == string::npos) {
			v.push_back(str.substr(ipos));
			break;
		} else {
			v.push_back(str.substr(ipos, nextpos - ipos));
		}
		ipos = nextpos + sep.size();
	}
	return v;
}

string replace_all(string str, const string &pattern, const string &replace) {
	string::size_type pos = 0;
	string::size_type offset = 0;
	while ((pos = str.find(pattern, offset)) != string::npos) {
		str.replace(str.begin() + pos, str.begin() + pos + pattern.size(), replace);
		offset = pos + replace.size();
	}
	return str;
}

inline std::string ltrim(std::string s, const std::string& drop = " ") {
	return s.erase(0, s.find_first_not_of(drop));
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
	st.tm_sec = second;

	return (double)mktime(&st) + second - (int)(second);
}