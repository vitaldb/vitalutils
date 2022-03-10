#pragma once
#include "afxcmn.h"
#include <thread>
#include "unzip.h"

using namespace std;

class CDlgUnzip : public CDialogEx {
	DECLARE_DYNAMIC(CDlgUnzip)

public:
	CDlgUnzip(const string& ipath, const string& odir);

// Dialog Data
	enum { IDD = IDD_DOWNLOAD };

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support

	DECLARE_MESSAGE_MAP()

public:
	thread m_thread_unzip;
	bool m_bCancelling = false;

	HZIP m_hz = nullptr;
	string m_ipath;
	string m_odir;
	string m_status;

	CStatic m_ctrlStatus;
	CProgressCtrl m_ctrlProgress;

public:
	void unzip_thread_func();
	afx_msg void OnBnClickedCancel();
	virtual BOOL OnInitDialog();
	afx_msg void OnDestroy();
	void OnProgress(size_t dwRead, size_t dwTotal);
};
