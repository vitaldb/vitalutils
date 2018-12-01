#pragma once
#include "afxwin.h"
#include "EditEx.h"

class COptCopyFilesDlg : public CDialogEx {
	DECLARE_DYNAMIC(COptCopyFilesDlg)

public:
	COptCopyFilesDlg(CWnd* pParent = NULL);   // standard constructor
	virtual ~COptCopyFilesDlg();

	enum { IDD = IDD_OPT_COPY_FILES };

public:

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support
	DECLARE_MESSAGE_MAP()

public:
	virtual void OnOK() {};
	virtual void OnCancel() {};
	virtual BOOL OnInitDialog();
};
