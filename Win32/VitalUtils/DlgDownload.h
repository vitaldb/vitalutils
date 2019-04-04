#pragma once
#include "afxcmn.h"
using namespace std;

class CDlgDownload : public CDialogEx
{
	DECLARE_DYNAMIC(CDlgDownload)

public:
	CDlgDownload(CWnd* pParent, LPCTSTR url, LPCTSTR localpath);
	virtual ~CDlgDownload();

// Dialog Data
	enum { IDD = IDD_DOWNLOAD };

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support

	DECLARE_MESSAGE_MAP()

public:
	CWinThread* m_pDownloadThread = nullptr;
	void DownloadThreadFunc();
	bool m_bCancelling = false;
	CString m_strStatus;
	CString m_strUrl;
	CString m_strLocalPath;
	CProgressCtrl m_ctrlProgress;
	afx_msg void OnBnClickedCancel();
	virtual BOOL OnInitDialog();
	afx_msg void OnDestroy();
	void OnProgress(DWORD dwRead, DWORD dwTotal);
};
