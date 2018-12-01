#pragma once
#include "afxwin.h"
#include "EditEx.h"

class COptDelTrksDlg : public CDialogEx {
	DECLARE_DYNAMIC(COptDelTrksDlg)

public:
	COptDelTrksDlg(CWnd* pParent = NULL);   // standard constructor
	virtual ~COptDelTrksDlg();

	enum { IDD = IDD_OPT_DEL_TRKS };

public:

protected:
	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support
	DECLARE_MESSAGE_MAP()

public:
	virtual void OnOK() {};
	virtual void OnCancel() {};
	virtual BOOL OnInitDialog();
};
