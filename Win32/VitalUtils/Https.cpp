#include "stdafx.h"
#include "Https.h"
#include <vector>
#include "UTIL.h"
#include <fstream>
#ifdef _WIN32
#else
#include <arpa/inet.h>
#include <curl/curl.h>
#endif

using namespace std;

Http::Http(const string& strHostName, int nPort, const string& szUserName, const string& szPassword) {
	srand((unsigned int)time(nullptr));

	// hostname에서 콜론(:) 이 있으면 그 뒤를 포트로 뽑는다.
	// 이는 nPort를 덮어쓴다.
	auto serverip = strHostName;
	auto icolon = serverip.find_first_of(':');
	if (icolon != string::npos) {
		nPort = str_to_uint(substr(serverip, icolon + 1));
		serverip = substr(serverip, 0, icolon);
	}

	m_bSecure = (nPort == 443);
	m_strHost = serverip;
	m_nPort = nPort;
	m_szUserName = szUserName;
	m_szPassword = szPassword;
}

Http::~Http() {
}

inline unsigned char toHex(const unsigned char& x) {
	return (unsigned char)((unsigned int)x + ((x > 9) ? 55 : 48));
}

inline unsigned char toByte(const unsigned char& x) {
	return (unsigned char)((unsigned int)x - ((x > 57) ? 55 : 48));
}

string url_decode(string sIn) {
	string ret;
	for (size_t i = 0; i < sIn.size(); i++) {
		auto c = sIn[i];
		if ('%' == c) {
			if (i + 2 < sIn.size()) {
				ret += (char)((toByte(sIn[i + 1]) % 16 << 4) + toByte(sIn[i + 2]) % 16);
				i += 2;
			}
		} else if ('+' == c) {
			ret += ' ';
		} else {
			ret += c;
		}
	}
	return ret;
}

string url_encode(string sIn) {
	string ret;
	for (unsigned char c : sIn) {
		if (isalnum(c) || '-' == c || '_' == c || '.' == c) {
			ret += c;
		} else if (isspace(c)) {
			ret += '+';
		} else {
			ret += '%';
			ret += toHex(c >> 4);
			ret += toHex(c % 16);
		}
	}
	return ret;
}

bool Http::send_post(const string& strPath, const map<string, string>& posts, string& ret) {
	vector<string> headers;
	string payload;
	headers.push_back("Content-type: application/x-www-form-urlencoded");

	for (auto& it : posts) {
		if (!payload.empty()) payload.append("&");
		payload.append(url_encode(it.first));
		payload.append("=");
		payload.append(url_encode(it.second)); // to UTF8 and RFC1738
	}

	return send_request("POST", strPath, headers, payload, ret, "", nullptr);
}

// files by path
bool Http::send_post(const string& strPath, const map<string, string>& posts, const map<string, string>& files, string& ret, function<bool(size_t, size_t)> pcb) {
	vector<string> headers;
	string payload;
	if (files.empty()) {
		headers.push_back("Content-type: application/x-www-form-urlencoded");

		for (auto& it : posts) {
			if (!payload.empty()) payload.append("&");
			payload.append(url_encode(it.first));
			payload.append("=");
			payload.append(url_encode(it.second)); // to UTF8 and RFC1738
		}
	}
	else { // multipart mime
		string delim = "----" + num_to_str(rand()) + num_to_str(rand()) + num_to_str(rand());

		headers.push_back("Content-type: multipart/form-data; boundary=" + delim);

		for (auto& it : posts) {
			payload += "--" + delim + "\r\nContent-Disposition: form-data; name=\"" + it.first + "\"\r\n\r\n" + it.second + "\r\n";
		}

		for (auto& it : files) {
			if (it.second.empty()) continue;

			// begin of file
			auto path = it.second;

			ifstream fs(path.c_str(), ios::binary);
			if (fs.fail()) continue; // 실패

			payload += "--" + delim + "\r\nContent-Disposition: form-data; name=\"" + it.first + "\"; filename=\"" + basename(path) + "\"\r\nContent-Type: application/octet-stream\r\n\r\n";

			// read file
			payload.insert(payload.end(), istreambuf_iterator<char>(fs), {});

			fs.close();

			// end of file
			payload += "\r\n";
		}

		// end of the post
		payload += "--" + delim + "--\r\n";
	}
	return send_request("POST", strPath, headers, payload, ret, "", pcb);
}

bool Http::send_post(const string& strPath, const map<string, string>& posts, const map<string, vector<unsigned char>>& files, string& ret) {
	vector<string> headers;
	string payload;
	if (files.empty()) {
		headers.push_back("Content-type: application/x-www-form-urlencoded");

		for (auto& it : posts) {
			if (!payload.empty()) payload.append("&");
			payload.append(url_encode(it.first));
			payload.append("=");
			payload.append(url_encode(it.second)); // to UTF8 and RFC1738
		}
	}
	else { // multipart mime
		string delim = "----" + num_to_str(rand()) + num_to_str(rand()) + num_to_str(rand());

		headers.push_back("Content-type: multipart/form-data; boundary=" + delim);

		for (auto& it : posts) {
			payload += "--" + delim + "\r\nContent-Disposition: form-data; name=\"" + it.first + "\"\r\n\r\n" + it.second + "\r\n";
		}
		for (auto& it : files) {
			if (it.second.empty()) continue;

			// begin of file
			payload += "--" + delim + "\r\nContent-Disposition: form-data; name=\"" + it.first + "\"; filename=\"" + it.first + "\"\r\nContent-Type: application/octet-stream\r\n\r\n";

			// real file
			payload.insert(payload.end(), (char*)&it.second[0], (char*)&it.second[0] + it.second.size());

			// end of file
			payload += "\r\n";
		}

		// end of the post
		payload += "--" + delim + "--\r\n";
	}
	return send_request("POST", strPath, headers, payload, ret, "", nullptr);
}

#ifndef _WIN32
int xferinfo(void* pcb, curl_off_t dltotal, curl_off_t dlnow, curl_off_t ultotal, curl_off_t ulnow) {
	//TRACE("%u / %u\n", dlnow, dltotal);
	return !(*(function<bool(size_t, size_t)>*) pcb) ((size_t)dlnow, (size_t)dltotal);
}

size_t write_to_file(char* ptr, size_t sz, size_t cnt, void* f) {
	//TRACE("%d bytes written\n", sz * cnt);
	return fwrite(ptr, sz, cnt, (FILE*)f);
}

size_t write_to_str(char* ptr, size_t sz, size_t cnt, void* resultBody) {
	//TRACE("%d bytes received\n", sz * cnt);
	auto v = (vector<unsigned char>*)(resultBody);
	v->insert(v->end(), ptr, ptr + sz * cnt);
	return sz * cnt;
}
#endif

bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const string& payload, string& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	return send_request(strMethod, strPath, headers, (unsigned char*)payload.c_str(), payload.size(), ret, strLocalPath, pcb);
}
bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const vector<unsigned char>& payload, string& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	return send_request(strMethod, strPath, headers, &payload[0], payload.size(), ret, strLocalPath, pcb);
}
bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const unsigned char* payload, size_t payload_len, string& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	vector<unsigned char> v;
	auto bret = send_request(strMethod, strPath, headers, payload, payload_len, v, strLocalPath, pcb);
	ret.assign(v.begin(), v.end()); // copy buffer
	return bret;
}

bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const string& payload, vector<unsigned char>& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	return send_request(strMethod, strPath, headers, (unsigned char*)payload.c_str(), payload.size(), ret, strLocalPath, pcb);
}
bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const vector<unsigned char>& payload, vector<unsigned char>& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	return send_request(strMethod, strPath, headers, &payload[0], payload.size(), ret, strLocalPath, pcb);
}

// 결국 모든 send는 다 이리로 온다.
bool Http::send_request(const string& strMethod, const string& strPath, const vector<string>& headers, const unsigned char* payload, size_t payload_len, vector<unsigned char>& ret, const string& strLocalPath, function<bool(size_t, size_t)> pcb) {
	if (m_strHost.empty()) return false;

	m_nReturnCode = 0;
	ret.clear();

	FILE* f = nullptr;
	if (!strLocalPath.empty()) { // download 일 때
		f = fopen(strLocalPath.c_str(), "wb");
		if (!f) return false;
	}

#ifndef _WIN32
	// 리눅스
	auto curl = curl_easy_init();
	if (!curl) {
		m_strLastError = "connection error";
		return false;
	}
	curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L); // 서버 응답은 10초 이내에 와야함
	curl_easy_setopt(curl, CURLOPT_TIMEOUT, 1800L); // 모든 curl 작업은 30분 이내에 끝나야함

	curl_slist* headerlist = nullptr;
	if (!headers.empty()) {
		for (auto& s : headers) {
			// To avoid overwriting an existing non-empty list on failure, 
			// the new list should be returned to a temporary variable 
			// which can be tested for NULL before updating the original list pointer.
			auto temp = curl_slist_append(headerlist, s.c_str());
			if (!temp) {
				curl_slist_free_all(headerlist);
			} else {
				headerlist = temp;
			}
		}
		curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headerlist);
	}

	string url;
	if (m_bSecure) {
		url = "https://" + m_strHost + strPath;
		curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
		curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
	} else {
		url = "http://" + m_strHost + strPath;
	}

	curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
	curl_easy_setopt(curl, CURLOPT_PORT, m_nPort);

	if (payload_len && strMethod == "POST") {
		curl_easy_setopt(curl, CURLOPT_POST, true);
		curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, payload_len);
		curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload);
	}
	else {
		curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, strMethod.c_str());
	}

	if (f) { // 파일로 다운로드
		curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_to_file);
		curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void*)f);
	}
	else { // 문자열로 리턴
		curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_to_str);
		curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void*)&ret);
	}

	// 업로드 동안에는 m_noti_exit 을 체크하지못한다.
	// 따라서 업로드 스레드가 종료되지 못하고 대기가 걸릴 수 있다.
	if (pcb) { // 진행 상태 콜백
		curl_easy_setopt(curl, CURLOPT_NOPROGRESS, false);
		curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, xferinfo);
		curl_easy_setopt(curl, CURLOPT_XFERINFODATA, (void*)&pcb);
	}

	if (payload_len) TRACE("uploading %d bytes...", payload_len);

	auto res = curl_easy_perform(curl);
	if (res != CURLE_OK) TRACE("failed: %s\n", curl_easy_strerror(res));
	//else TRACE("done [%s] \n", ret.c_str());

	curl_easy_cleanup(curl); // cleanup
	
	if (headerlist) {
		curl_slist_free_all(headerlist);
	}

	if (f) fclose(f);

	return res == CURLE_OK;

#else
	HINTERNET hSession = ::InternetOpen("Vital Recorder", INTERNET_OPEN_TYPE_PRECONFIG, NULL, 0, 0);
	if (!hSession) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}

	HINTERNET hConnect = ::InternetConnect(hSession, m_strHost.c_str(), m_nPort, m_szUserName.empty() ? nullptr : m_szUserName.c_str(), m_szPassword.empty() ? nullptr : m_szPassword.c_str(), INTERNET_SERVICE_HTTP, 0, 0);
	if (!hConnect) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}

	// 크기가 큰 파일일 때는 upload timeout 을 늘린다
	if (payload_len > 20 * 1024 * 1024) {
		DWORD dwTimeout = (DWORD)(payload_len);  // 20 MB -> 20 * 1024초 -> 5분
		if (dwTimeout > 1800 * 1000) dwTimeout = 1800 * 1000; // 최대 30분
		InternetSetOption(hConnect, INTERNET_OPTION_SEND_TIMEOUT, &dwTimeout, sizeof(dwTimeout));
	}

	// Canonical Request를 생성한다.
	// does not send the request to the Internet when called.
	HINTERNET hRequest = ::HttpOpenRequest(hConnect, strMethod.c_str(), strPath.c_str(), "HTTP/1.1", "*/*", NULL,
		(m_bSecure ? (INTERNET_FLAG_SECURE | SECURITY_IGNORE_ERROR_MASK) : 0) | INTERNET_FLAG_NO_UI | INTERNET_FLAG_KEEP_CONNECTION | INTERNET_FLAG_PRAGMA_NOCACHE | INTERNET_FLAG_DONT_CACHE | INTERNET_FLAG_RELOAD, NULL);
	if (!hRequest) {
		m_strLastError = GetLastInetErrorString();
		return false;
	}

	string strHeader = implode(headers, "\r\n") + "\r\n";

	// sends the request and establishes a connection over the network
	BOOL bRet = false;
	if (payload_len) {
		strHeader += "Content-length: " + num_to_str(payload_len) + "\r\n";
		bRet = ::HttpSendRequest(hRequest, strHeader.c_str(), (DWORD)strHeader.size(), (void*)payload, (DWORD)payload_len);
	}
	else {
		bRet = ::HttpSendRequest(hRequest, strHeader.c_str(), (DWORD)strHeader.size(), NULL, 0);
	}

	if (!bRet) {
		m_strLastError = GetLastInetErrorString();
		::InternetCloseHandle(hRequest);
		return false;
	}

	char szBuffer[8192];
	DWORD dwRead = 0;
	unsigned int dwTotalSize = 0;
	if (pcb) { // retreive total size
		DWORD dwBufLen = sizeof(dwTotalSize);
		HttpQueryInfo(hRequest, HTTP_QUERY_CONTENT_LENGTH | HTTP_QUERY_FLAG_NUMBER, (LPVOID)& dwTotalSize, &dwBufLen, 0);
	}

	DWORD dwTotalRead = 0;
	while (::InternetReadFile(hRequest, szBuffer, 8191, &dwRead) && dwRead > 0) {
		if (f) dwRead = (DWORD)fwrite(szBuffer, 1, dwRead, f); // 파일로 저장할 때
		else ret.insert(ret.end(), szBuffer, szBuffer + dwRead); // string으로 받아갈 때
		dwTotalRead += dwRead;
		if (pcb) if (!pcb(dwTotalRead, dwTotalSize)) {
			if (f) fclose(f);
			return false;
		}
	}
	if (f) fclose(f);

	DWORD dwCodeLen = 255;
	char strQueryCode[255] = { 0x0 };
	if (!HttpQueryInfo(hRequest, HTTP_QUERY_STATUS_CODE, &strQueryCode, &dwCodeLen, NULL)) {
		return false;
	}

	unsigned int retcode = m_nReturnCode = str_to_uint(strQueryCode);
	if (retcode != 200) 
		return false;

	::InternetCloseHandle(hRequest);

	if (hConnect) {
		::InternetCloseHandle(hConnect);
		hConnect = 0;
	}

	if (hSession) {
		::InternetCloseHandle(hSession);
		hSession = 0;
	}

	return true;
#endif
}
