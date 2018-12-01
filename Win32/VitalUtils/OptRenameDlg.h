#pragma once
#include "afxwin.h"
#include "EditEx.h"

class COptRenameDlg : public CDialogEx {
	DECLARE_DYNAMIC(COptRenameDlg)

public:
	COptRenameDlg(CWnd* pParent = NULL);   // standard constructor
	virtual ~COptRenameDlg();

	enum { IDD = IDD_OPT_RENAME };

public:

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support
	DECLARE_MESSAGE_MAP()

public:
	virtual void OnOK() {};
	virtual void OnCancel() {};
	virtual BOOL OnInitDialog();
public:
	CEditEx m_ctrlTo[30];
	CStatic m_ctrlFrom[30];
	CString m_strFrom[30];
	CString m_strTo[30];
	void UpdateForm();
};
