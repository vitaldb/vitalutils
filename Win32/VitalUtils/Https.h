#pragma once
#include "stdafx.h"
#include <wininet.h>
#include <vector>
#include <map>
#include <list>
#include <functional>
using namespace std;

CString URLEncode(CString sIn);
CString URLDecode(CString sIn);

struct PTRLEN {
	PTRLEN(void* p, size_t l) : pBuf(p), nLen(l) {}
	void* pBuf;
	size_t nLen;
};

struct Http {
public:
	Http() = default;
	Http(LPCTSTR strHostName, int nPort = 80, LPCTSTR szUserName = nullptr, LPCTSTR szPassword = nullptr);
	virtual ~Http();

public:
	bool m_bSecure = false;
	HINTERNET m_hConnect = nullptr;
	HINTERNET m_hSession = nullptr;
	CString m_strHost;
	CString m_szUserName;
	CString m_szPassword;
	int m_nPort = INTERNET_DEFAULT_HTTP_PORT; // 80
	bool m_bOpened = false;
protected:
	CString m_strLastError;
	int m_nReturnCode = 0;
public:
	int GetReturnCode() { return m_nReturnCode; }
	CString GetLastError() { return m_strLastError; }

public:
	virtual bool Open(); // 기존 접속 정보로 접속한다.
	virtual bool Open(LPCTSTR strHostName, int nPort = 80, LPCTSTR szUserName = nullptr, LPCTSTR szPassword = nullptr);
	void Close();
	
	// 파라미터
public:
	// callback function for progress notification
	// if it return false --> cancel downloading
	bool Download(LPCTSTR strRemotePath, LPCTSTR strLocalPath, function<bool(DWORD,DWORD)> pcb = nullptr);
	// UTF8로 변환하여 전송한다.
	bool SendGet(LPCTSTR strRemotePath, CString& ret);
protected:
	bool Send(CString strMethod, CString strPath, CString strPayload, CString& ret);
};

struct Https : public Http {
public:
	Https() {
		m_bSecure = true;
		m_nPort = INTERNET_DEFAULT_HTTPS_PORT;
	};
	Https(LPCTSTR strHostName, int nPort = INTERNET_DEFAULT_HTTPS_PORT, LPCTSTR szUserName = nullptr, LPCTSTR szPassword = nullptr) {
		m_bSecure = true;
		Open(strHostName, nPort, szUserName, szPassword);
	};
};
