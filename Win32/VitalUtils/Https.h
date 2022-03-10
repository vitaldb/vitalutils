#pragma once
#include "stdafx.h"
#ifdef _WIN32
#include <wininet.h>
#pragma comment(lib, "WinInet")
#else
#include <curl/curl.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#endif

#include <vector>
#include <map>
#include <list>
#include <functional>
using namespace std;

struct Http {
public:
	Http() = default;
	// 443일 때만 secure 이다
	Http(const string& strHostName, int nPort = 80, const string& szUserName = "", const string& szPassword = "");
	virtual ~Http();

public:
	bool m_bSecure = false;
	string m_strHost;
	string m_szUserName;
	string m_szPassword;
	int m_nPort = 80; // 80
	bool m_ctrlCutfile = false;
protected:
	string m_strLastError;
	int m_nReturnCode = 0;
public:
	int get_return_code() { return m_nReturnCode; }
	string get_last_error() { return m_strLastError; }
	
	// 파라미터
public:
	// 결국 모든 요청은 다 여기로 온다.
	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const unsigned char* payload, size_t payload_len, vector<unsigned char>& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);

	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const vector<unsigned char>& payload, vector<unsigned char>& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);
	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const string& payload, vector<unsigned char>& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);

	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const unsigned char* payload, size_t payload_len, string& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);
	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const vector<unsigned char>& payload, string& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);
	bool send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const string& payload, string& ret, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr);

	bool send_post(const string& strPath, const map<string, string>& posts, string& ret);
	bool send_post(const string& strPath, const map<string, string>& posts, const map<string, string>& files, string& ret, function<bool(size_t, size_t)> pcb = nullptr);
	bool send_post(const string& strPath, const map<string, string>& posts, const map<string, vector<unsigned char>>& files, string& ret);
	bool download(const string& strPath, const string& strLocalPath = "", function<bool(size_t, size_t)> pcb = nullptr) {
		string ret;
		return send_request("GET", strPath, {}, "", ret, strLocalPath, pcb);
	}
};

struct Https : public Http {
public:
	Https(const string& strHostName, int nPort = 443) : Http (strHostName, nPort) {};
};
