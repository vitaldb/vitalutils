#pragma once
#include "afxcmn.h"
#include <thread>

using namespace std;

class CDlgDownload : public CDialogEx {
	DECLARE_DYNAMIC(CDlgDownload)

public:
	CDlgDownload(string host, string remotepath, string localpath);

// Dialog Data
	enum { IDD = IDD_DOWNLOAD };

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support

	DECLARE_MESSAGE_MAP()

public:
	thread m_thread_download;
	bool m_bCancelling = false;
	string m_host;
	string m_localpath;
	string m_remotepath;
	CString m_strStatus;
	CProgressCtrl m_ctrlProgress;

public:
	void download_thread_func();
	afx_msg void OnBnClickedCancel();
	virtual BOOL OnInitDialog();
	afx_msg void OnDestroy();
	void OnProgress(size_t dwRead, size_t dwTotal);
};
