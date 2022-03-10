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
#include "util.h"

using namespace std;

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
	bool install_python();
};

extern CVitalUtilsApp theApp;
