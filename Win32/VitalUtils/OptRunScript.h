#pragma once
#include "afxwin.h"
#include "EditEx.h"

class COptRunScriptDlg : public CDialogEx {
	DECLARE_DYNAMIC(COptRunScriptDlg)

public:
	COptRunScriptDlg(CWnd* pParent = NULL);   // standard constructor
	virtual ~COptRunScriptDlg();

	enum { IDD = IDD_OPT_RUN_SCRIPT };

public:

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support
	DECLARE_MESSAGE_MAP()

public:
	virtual void OnOK() {};
	virtual void OnCancel() {};
	virtual BOOL OnInitDialog();
	CComboBox m_ctrlScript;
	CString m_strScript;
	afx_msg void OnBnClickedSetupPython();
};
