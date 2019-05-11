#pragma once
#include "afxwin.h"
#include "EditEx.h"
#include "afxcmn.h"
#include "OptRunScript.h"
#include "OptRecsDlg.h"
#include "OptRenameDlg.h"
#include "OptDelTrksDlg.h"
#include "OptCopyFilesDlg.h"
#include <map>
#include <set>
#include "Canvas.h"

using namespace std;

class CVitalUtilsDlg : public CDialogEx {
public:
	CVitalUtilsDlg(CWnd* pParent = NULL);	// 표준 생성자입니다.

#ifdef AFX_DESIGN_TIME
	enum { IDD = IDD_VITALUTILS_DIALOG };
#endif

protected:
	virtual void DoDataExchange(CDataExchange* pDX);	// DDX/DDV 지원입니다.

// 구현입니다.
protected:
	DECLARE_MESSAGE_MAP()
	afx_msg void OnPaint();
	afx_msg HCURSOR OnQueryDragIcon();
	afx_msg void OnBnClickedBtnIdir();
	afx_msg void OnBnClickedBtnOdir();
	afx_msg void OnBnClickedRun();
	afx_msg void OnTimer(UINT_PTR nIDEvent);
	afx_msg void OnBnClickedCancel();
	afx_msg void OnClose();
	afx_msg void OnBnClickedClear();
	afx_msg void OnSize(UINT nType, int cx, int cy);
	afx_msg void OnDestroy();
	afx_msg void OnGetdispinfoFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnSelchangeTrklist();
	afx_msg void OnNMDblclkFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnBnClickedRescan();
	afx_msg void OnBnClickedTrkAll();
	afx_msg void OnBnClickedTrkNone();
	afx_msg void OnBnClickedFileAll();
	afx_msg void OnBnClickedFileNone();
	afx_msg void OnBnClickedSaveList();
	afx_msg void OnBnClickedSelRunScript();
	afx_msg void OnBnClickedSelCopyFiles();
	afx_msg void OnBnClickedSelRenameDev();
	afx_msg void OnBnClickedSelDelTrks();
	afx_msg void OnBnClickedSelRecs();
	afx_msg void OnBnClickedSelRenameTrks();
	afx_msg void OnCbnSelchangeTrkOper();
	afx_msg void OnLvnItemchangedFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnBnClickedSelect();
	virtual BOOL OnInitDialog();
	virtual BOOL PreTranslateMessage(MSG* pMsg);
	virtual void OnOK();
	virtual void OnCancel();
	int GetNumVisibleLines();
public:
	COptRunScriptDlg m_dlgRun;
	COptCopyFilesDlg m_dlgCopy;
	COptRecsDlg m_dlgRecs;
	COptRenameDlg m_dlgRename;
	COptDelTrksDlg m_dlgDelTrks;
public:
	HICON m_hIcon;

	// 각 윈도우 선택하는 버튼
	CMFCButton m_ctrlSelRun;
	CMFCButton m_ctrlSelCopyFiles;
	CMFCButton m_ctrlSelRecs;
	CMFCButton m_ctrlSelDelTrks;
	CMFCButton m_ctrlSelRenameTrks;
	CMFCButton m_ctrlSelRenameDev;

	CMFCButton m_btnRun;
	CMFCButton m_btnStop;
	CMFCButton m_btnIdir;
	CMFCButton m_btnScan;
	CMFCButton m_btnSaveList;
	CMFCButton m_btnTrkAll;
	CMFCButton m_btnTrkNone;
	CMFCButton m_btnFileAll;
	CMFCButton m_btnFileNone;
	CMFCButton m_btnOdir;
	CMFCButton m_btnClear;
	CMFCButton m_btnSelect;

	int m_nLastTrkSel = -1;
	int m_nLastFileSel = -1;
	CRichEditCtrl m_ctrLog;
	CString m_strIdir;
	CString m_strOdir;
	bool m_b64;
	CListBox m_ctrList;
	CString m_strProgress;

	CListBox m_ctrlTrkList;
	BOOL m_bSkip = TRUE;
	BOOL m_bMakeSubDir = TRUE;
	Canvas m_canFolder;
	CStatic m_ctrlOdirStatic;
	CStatic m_ctrlIdirStatic;
	CStatic m_ctrProgress;
	CEditEx m_ctrlFilter;
	CComboBox m_ctrlSelOper;
	CButton m_ctrlExact;
	CStatic m_ctrlTrkCnt;
	CStatic m_ctrlFileCnt;
	CListCtrl m_ctrlFileList;

	int m_nOldCy = 0, m_nOldCx = 0;

	// LVS_OWNERDATA 속성인경우 SetItemText, SetItemData는 사용 불가하다
	// 따라서 내가 item data를 처리해야 한다
	vector<VITAL_FILE_INFO*> m_shown;
	// filename의 ascending 으로 시작
	int m_nSortItem = -1;
	bool m_bSortAsc = true;
	afx_msg void OnHdnItemclickFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnBnClickedTrkSelect();
	CEditEx m_ctrlTrkFilter;
	afx_msg void OnLvnBegindragFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	CEditEx m_ctrIdir;
	CEditEx m_ctrOdir;
	afx_msg void OnEnKillfocusIdir();
	afx_msg void OnEnKillfocusOdir();
	afx_msg void OnBnClickedIdirOpen();
};
