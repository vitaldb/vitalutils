#include "stdafx.h"
#include "Https.h"
#include <wininet.h>
#pragma comment(lib, "WinInet")
#include <vector>
using namespace std;

Http::Http(LPCTSTR strHostName, int nPort, LPCTSTR szUserName, LPCTSTR szPassword) {
	Open(strHostName, nPort, szUserName, szPassword);
}

Http::~Http() {
	Close();
}

bool Http::Open() {
	return Open(m_strHost, m_nPort, m_szUserName, m_szPassword);
}

CString GetLastInetErrorString() {
	HMODULE hInet = GetModuleHandle("wininet.dll");
	LPVOID lpMsgBuf;
	int i = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER |
						  FORMAT_MESSAGE_FROM_SYSTEM |
						  FORMAT_MESSAGE_IGNORE_INSERTS |
						  FORMAT_MESSAGE_FROM_HMODULE,
						  hInet,
						  12029,
						  MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
						  (LPTSTR)&lpMsgBuf,
						  0,
						  NULL);
	CString str((LPCTSTR)lpMsgBuf);
	LocalFree(lpMsgBuf);
	return str;
}

bool Http::Open(LPCTSTR strHostName, int nPort, LPCTSTR szUserName, LPCTSTR szPassword) {
	m_hSession = ::InternetOpen("Vital Recorder", INTERNET_OPEN_TYPE_PRECONFIG, NULL, 0, 0);
	if (!m_hSession) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}

	m_hConnect = ::InternetConnect(m_hSession, strHostName, nPort, szUserName, szPassword, INTERNET_SERVICE_HTTP, 0, 0);
	if (!m_hConnect) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}
	m_strHost = strHostName;
	m_nPort = nPort;
	m_szUserName = szUserName;
	m_szPassword = szPassword;
	m_bOpened = true;
	return true;
}

void Http::Close() {
	if (m_hConnect) {
		::InternetCloseHandle(m_hConnect);
		m_hConnect = 0;
	}

	if (m_hSession) {
		::InternetCloseHandle(m_hSession);
		m_hSession = 0;
	}

	m_bOpened = false;
}

bool Http::Download(LPCTSTR strRemotePath, LPCTSTR strLocalPath, function<bool(DWORD, DWORD)> pcb) {
	m_nReturnCode = 0;

	// does not send the request to the Internet when called.
	HINTERNET hRequest = ::HttpOpenRequest(m_hConnect, "GET", strRemotePath, "HTTP/1.1", "*/*", NULL,
		(m_bSecure?(INTERNET_FLAG_SECURE | SECURITY_IGNORE_ERROR_MASK):0) | INTERNET_FLAG_NO_UI | INTERNET_FLAG_KEEP_CONNECTION | INTERNET_FLAG_PRAGMA_NOCACHE | INTERNET_FLAG_DONT_CACHE | INTERNET_FLAG_RELOAD, NULL);
	if (!hRequest) return false;

	// sends the request and establishes a connection over the network.
	BOOL bRet = ::HttpSendRequest(hRequest, NULL, 0, NULL, 0);
	if (!bRet) {
		::InternetCloseHandle(hRequest);
		m_strLastError = "Internet connection failed";
		return false;
	}

	DWORD dwTotalSize = 0;
	if (pcb) {
		// retreive total size
		DWORD dwBufLen = sizeof(dwTotalSize);
		HttpQueryInfo(hRequest, HTTP_QUERY_CONTENT_LENGTH | HTTP_QUERY_FLAG_NUMBER, (LPVOID)&dwTotalSize, &dwBufLen, 0);
	}

	FILE* f = fopen(strLocalPath, "wb");
	if (!f) return false;

	// open object
	char szBuffer[8192];
	DWORD dwTotalRead = 0;
	DWORD dwRead = 0;
	while (::InternetReadFile(hRequest, szBuffer, 8191, &dwRead) && dwRead > 0) {
		fwrite(szBuffer, 1, dwRead, f);
		dwTotalRead += dwRead;
		if (pcb) if (!pcb(dwTotalRead, dwTotalSize)) {
			fclose(f);
			return false;
		}
	}
	fclose(f);

	DWORD dwCodeLen = 255;
	char strQueryCode[255] = { 0x0 };
	if (!HttpQueryInfo(hRequest, HTTP_QUERY_STATUS_CODE, &strQueryCode, &dwCodeLen, NULL)) return false;
	int retcode = m_nReturnCode = atoi(strQueryCode);
	if (retcode != 200) return false;

	::InternetCloseHandle(hRequest);
	return true;
}

bool Http::Send(CString strMethod, CString strPath, CString strPayload, CString& ret) {
	m_nReturnCode = 0;
	ret = "";

	// Canonical Request를 생성한다.
	// does not send the request to the Internet when called.
	HINTERNET hRequest = ::HttpOpenRequest(m_hConnect, strMethod, strPath, "HTTP/1.1", "text/*", NULL,
										   (m_bSecure?(INTERNET_FLAG_SECURE | SECURITY_IGNORE_ERROR_MASK):0) | INTERNET_FLAG_NO_UI | INTERNET_FLAG_KEEP_CONNECTION | INTERNET_FLAG_PRAGMA_NOCACHE | INTERNET_FLAG_DONT_CACHE | INTERNET_FLAG_RELOAD, NULL);
	if (!hRequest) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}

	// sends the request and establishes a connection over the network
	BOOL bRet = FALSE;
	if (strPayload.IsEmpty()) {
		bRet = ::HttpSendRequest(hRequest, NULL, 0L, NULL, 0);
	} else {
		// add some parameters
		CString aHeader;
		aHeader.Format("Content-type: application/x-www-form-urlencoded\r\nContent-length: %d\r\n", strPayload.IsEmpty() ? 0 : strPayload.GetLength());
		//::HttpAddRequestHeaders(hRequest, (LPCTSTR)aHeader, aHeader.GetLength(), HTTP_ADDREQ_FLAG_ADD);
		bRet = ::HttpSendRequest(hRequest, (LPCTSTR)aHeader, aHeader.GetLength(), (LPVOID)(LPCTSTR)strPayload, strPayload.GetLength());
	}

	if (!bRet) {
		m_strLastError = GetLastInetErrorString();
		::InternetCloseHandle(hRequest);
		return false;
	}

	// open object
	char szBuffer[1024];
	DWORD dwRead = 0;
	while (::InternetReadFile(hRequest, szBuffer, 1023, &dwRead) && dwRead > 0) {
		szBuffer[dwRead] = 0;
		ret += szBuffer;
		Sleep(1);
	}

	DWORD dwCodeLen = 255;
	char strQueryCode[255] = { 0x0 };
	if (!HttpQueryInfo(hRequest, HTTP_QUERY_STATUS_CODE, &strQueryCode, &dwCodeLen, NULL)) {
		return false;
	}

	int retcode = m_nReturnCode = atoi(strQueryCode);
	if (retcode != 200) {
		m_strLastError = ret;
		return false;
	}

	::InternetCloseHandle(hRequest);
	return true;
}

bool Http::SendGet(LPCTSTR strPath, CString& ret) {
	return Send("GET", strPath, "", ret);
}

inline BYTE toHex(const BYTE &x) {
	return x > 9 ? x + 55 : x + 48;
}


inline BYTE toByte(const BYTE &x) {
	return x > 57 ? x - 55 : x - 48;
}

CString URLDecode(CString sIn) {
	CString sOut;
	const int nLen = sIn.GetLength() + 1;
	register LPBYTE pOutTmp = NULL;
	LPBYTE pOutBuf = NULL;
	register LPBYTE pInTmp = NULL;
	LPBYTE pInBuf = (LPBYTE)sIn.GetBuffer(nLen);
	//alloc out buffer
	pOutBuf = (LPBYTE)sOut.GetBuffer(nLen);

	if (pOutBuf) {
		pInTmp = pInBuf;
		pOutTmp = pOutBuf;
		// do encoding
		while (*pInTmp) {
			if ('%' == *pInTmp) {
				pInTmp++;
				*pOutTmp++ = (toByte(*pInTmp) % 16 << 4) + toByte(*(pInTmp + 1)) % 16;
				pInTmp++;
			} else if ('+' == *pInTmp)
				*pOutTmp++ = ' ';
			else
				*pOutTmp++ = *pInTmp;
			pInTmp++;
		}
		*pOutTmp = '\0';
		sOut.ReleaseBuffer();
	}
	sIn.ReleaseBuffer();

	return sOut;
}

CString URLEncode(CString sIn) {
	CString sOut;
	const int nLen = sIn.GetLength() + 1;
	register LPBYTE pOutTmp = NULL;
	LPBYTE pOutBuf = NULL;
	register LPBYTE pInTmp = NULL;
	LPBYTE pInBuf = (LPBYTE)sIn.GetBuffer(nLen);
	//alloc out buffer
	pOutBuf = (LPBYTE)sOut.GetBuffer(nLen * 3);

	if (pOutBuf) {
		pInTmp = pInBuf;
		pOutTmp = pOutBuf;
		// do encoding
		while (*pInTmp) {
			if (isalnum(*pInTmp) || '-' == *pInTmp || '_' == *pInTmp || '.' == *pInTmp)
				*pOutTmp++ = *pInTmp;
			else if (isspace(*pInTmp))
				*pOutTmp++ = '+';
			else {
				*pOutTmp++ = '%';
				*pOutTmp++ = toHex(*pInTmp >> 4);
				*pOutTmp++ = toHex(*pInTmp % 16);
			}
			pInTmp++;
		}
		*pOutTmp = '\0';
		sOut.ReleaseBuffer();
	}
	sIn.ReleaseBuffer();

	return sOut;
}