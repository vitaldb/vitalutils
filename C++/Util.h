#pragma once
#include <string>
#include <memory>
#include <stdarg.h>
#include <regex>
#include <time.h>
using namespace std;

inline bool is_numeric(string s) {
    int num_dot = 0;
    int num_e = 0;
    int num_n = 0;
    bool was_e = false;
    for (auto c : s) {
        if (c == '.') {
            if (num_e) return false;
            if (num_dot) return false;
            num_dot++;
            was_e = false;
        }
        else if (c == 'e' || c == 'E') {
            if (num_e) return false;
            if (!num_n) return false;
            num_e++;
            num_n = 0;
            was_e = true;
        }
        else if (c == '-' || c == '+') {
            if (num_n && !was_e) return false;
            was_e = false;
        }
        else if (c >= '0' && c <= '9') {
            num_n++;
            was_e = false;
        }
        else {
            return false;
        }
    }
    if (num_e && !num_n) return false;
    return true;
}

string num_to_str(double d) {
	static char buf[4096];
	auto len = snprintf(buf, sizeof(buf), "%g", d);
	return string(buf, len);
}

inline unsigned int str_to_uint(const string& s) {
	return strtoul(s.c_str(), nullptr, 10);
}

string to_lower(string strToConvert) {
	transform(strToConvert.begin(), strToConvert.end(), strToConvert.begin(), ::tolower);
	return strToConvert;
}

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
	
	bool need_quote = false;
	
	if (s.find(',') != string::npos) need_quote = true;
	if (s.find('\n') != string::npos) need_quote = true;
	if (s.find('\r') != string::npos) need_quote = true;

	if (need_quote) s = '"' + s + '"';

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

// sha1 관련 함수들
inline static uint32_t rol(const uint32_t value, const size_t bits) { return (value << bits) | (value >> (32 - bits));}
inline static uint32_t blk(const uint32_t* block, const size_t i) { return rol(block[(i + 13) & 15] ^ block[(i + 8) & 15] ^ block[(i + 2) & 15] ^ block[i], 1);}
inline static void R0(const uint32_t* block, const uint32_t v, uint32_t& w, const uint32_t x, const uint32_t y, uint32_t& z, const size_t i) {
    z += ((w & (x ^ y)) ^ y) + block[i] + 0x5a827999 + rol(v, 5);
    w = rol(w, 30);
}
inline static void R1(uint32_t* block, const uint32_t v, uint32_t& w, const uint32_t x, const uint32_t y, uint32_t& z, const size_t i) {
    block[i] = blk(block, i);
    z += ((w & (x ^ y)) ^ y) + block[i] + 0x5a827999 + rol(v, 5);
    w = rol(w, 30);
}
inline static void R2(uint32_t* block, const uint32_t v, uint32_t& w, const uint32_t x, const uint32_t y, uint32_t& z, const size_t i) {
    block[i] = blk(block, i);
    z += (w ^ x ^ y) + block[i] + 0x6ed9eba1 + rol(v, 5);
    w = rol(w, 30);
}
inline static void R3(uint32_t* block, const uint32_t v, uint32_t& w, const uint32_t x, const uint32_t y, uint32_t& z, const size_t i) {
    block[i] = blk(block, i);
    z += (((w | x) & y) | (w & x)) + block[i] + 0x8f1bbcdc + rol(v, 5);
    w = rol(w, 30);
}
inline static void R4(uint32_t* block, const uint32_t v, uint32_t& w, const uint32_t x, const uint32_t y, uint32_t& z, const size_t i) {
    block[i] = blk(block, i);
    z += (w ^ x ^ y) + block[i] + 0xca62c1d6 + rol(v, 5);
    w = rol(w, 30);
}
inline static void process_block(const char* buf, uint32_t* digest) {
    uint32_t block[16] = { 0, };
    for (size_t i = 0; i < 64; i += 4) {
        block[i / 4] = (buf[i + 3] & 0xFF)
            | (buf[i + 2] & 0xFF) << 8
            | (buf[i + 1] & 0xFF) << 16
            | (buf[i + 0] & 0xFF) << 24;
    }

    // Copy digest[] to working vars
    uint32_t a = digest[0];
    uint32_t b = digest[1];
    uint32_t c = digest[2];
    uint32_t d = digest[3];
    uint32_t e = digest[4];

    // 4 rounds of 20 operations each. Loop unrolled
    R0(block, a, b, c, d, e, 0);
    R0(block, e, a, b, c, d, 1);
    R0(block, d, e, a, b, c, 2);
    R0(block, c, d, e, a, b, 3);
    R0(block, b, c, d, e, a, 4);
    R0(block, a, b, c, d, e, 5);
    R0(block, e, a, b, c, d, 6);
    R0(block, d, e, a, b, c, 7);
    R0(block, c, d, e, a, b, 8);
    R0(block, b, c, d, e, a, 9);
    R0(block, a, b, c, d, e, 10);
    R0(block, e, a, b, c, d, 11);
    R0(block, d, e, a, b, c, 12);
    R0(block, c, d, e, a, b, 13);
    R0(block, b, c, d, e, a, 14);
    R0(block, a, b, c, d, e, 15);
    R1(block, e, a, b, c, d, 0);
    R1(block, d, e, a, b, c, 1);
    R1(block, c, d, e, a, b, 2);
    R1(block, b, c, d, e, a, 3);
    R2(block, a, b, c, d, e, 4);
    R2(block, e, a, b, c, d, 5);
    R2(block, d, e, a, b, c, 6);
    R2(block, c, d, e, a, b, 7);
    R2(block, b, c, d, e, a, 8);
    R2(block, a, b, c, d, e, 9);
    R2(block, e, a, b, c, d, 10);
    R2(block, d, e, a, b, c, 11);
    R2(block, c, d, e, a, b, 12);
    R2(block, b, c, d, e, a, 13);
    R2(block, a, b, c, d, e, 14);
    R2(block, e, a, b, c, d, 15);
    R2(block, d, e, a, b, c, 0);
    R2(block, c, d, e, a, b, 1);
    R2(block, b, c, d, e, a, 2);
    R2(block, a, b, c, d, e, 3);
    R2(block, e, a, b, c, d, 4);
    R2(block, d, e, a, b, c, 5);
    R2(block, c, d, e, a, b, 6);
    R2(block, b, c, d, e, a, 7);
    R3(block, a, b, c, d, e, 8);
    R3(block, e, a, b, c, d, 9);
    R3(block, d, e, a, b, c, 10);
    R3(block, c, d, e, a, b, 11);
    R3(block, b, c, d, e, a, 12);
    R3(block, a, b, c, d, e, 13);
    R3(block, e, a, b, c, d, 14);
    R3(block, d, e, a, b, c, 15);
    R3(block, c, d, e, a, b, 0);
    R3(block, b, c, d, e, a, 1);
    R3(block, a, b, c, d, e, 2);
    R3(block, e, a, b, c, d, 3);
    R3(block, d, e, a, b, c, 4);
    R3(block, c, d, e, a, b, 5);
    R3(block, b, c, d, e, a, 6);
    R3(block, a, b, c, d, e, 7);
    R3(block, e, a, b, c, d, 8);
    R3(block, d, e, a, b, c, 9);
    R3(block, c, d, e, a, b, 10);
    R3(block, b, c, d, e, a, 11);
    R4(block, a, b, c, d, e, 12);
    R4(block, e, a, b, c, d, 13);
    R4(block, d, e, a, b, c, 14);
    R4(block, c, d, e, a, b, 15);
    R4(block, b, c, d, e, a, 0);
    R4(block, a, b, c, d, e, 1);
    R4(block, e, a, b, c, d, 2);
    R4(block, d, e, a, b, c, 3);
    R4(block, c, d, e, a, b, 4);
    R4(block, b, c, d, e, a, 5);
    R4(block, a, b, c, d, e, 6);
    R4(block, e, a, b, c, d, 7);
    R4(block, d, e, a, b, c, 8);
    R4(block, c, d, e, a, b, 9);
    R4(block, b, c, d, e, a, 10);
    R4(block, a, b, c, d, e, 11);
    R4(block, e, a, b, c, d, 12);
    R4(block, d, e, a, b, c, 13);
    R4(block, c, d, e, a, b, 14);
    R4(block, b, c, d, e, a, 15);

    // Add the working vars back into digest
    digest[0] += a;
    digest[1] += b;
    digest[2] += c;
    digest[3] += d;
    digest[4] += e;
}

inline string sha1(const string& str) {
    static const size_t BLOCK_BYTES = 64;

    uint32_t digest[5] = { 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0 };
    uint64_t total_bits = (uint64_t)str.size() * 8;
    for (int i = 0; i + BLOCK_BYTES <= str.size(); i += BLOCK_BYTES) {
        process_block(&str[i], digest);
    }

    // 마지막 블록 뒤에 남은 문자열
    int ipos = (str.size() / BLOCK_BYTES) * BLOCK_BYTES;
    string s(&str[ipos], str.size() - ipos);
    s += (char)0x80;
    // 뒤에 null 8개 붙임 (길이 저장 용)
    for (int i = 0; i < 8; i++) s += (char)0x0;
    // 블록 크기로 맞춤
    while(s.size() % BLOCK_BYTES) s += (char)0x0;
    // 마지막 8개에 길이 붙임
    for (int i = 0; i < 8; i++) {
        s[s.size() - 1 - i] = total_bits & 0xFF;
        total_bits >>= 8;
    }

    // 블록 처리
    for (int i = 0; i < s.size(); i += BLOCK_BYTES) {
        process_block(&s[0], digest);
    }

    string ret;
    char buf[9];
    for (size_t i = 0; i < sizeof(digest) / sizeof(digest[0]); i++) {
        snprintf(buf, sizeof(buf), "%08x", digest[i]);
        ret += buf;
    }
    return ret;
}
