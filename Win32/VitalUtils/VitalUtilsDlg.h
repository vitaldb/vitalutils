#pragma once
#include "afxwin.h"
#include "afxcmn.h"
#include "OptRunScript.h"
#include "OptRecsDlg.h"
#include "OptRenameDlg.h"
#include "OptDelTrksDlg.h"
#include "OptCopyFilesDlg.h"
#include <map>
#include <set>
#include <shared_mutex>
#include "Canvas.h"

using namespace std;

struct VITAL_FILE_INFO {
	string filename;
	string dirname;
	string path;
	time_t mtime = 0;
	size_t size = 0;
	time_t dtstart = 0;
	time_t dtend = 0;
	time_t dtlen = 0;
};

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
	void LoadCache(string dirname);
	void SaveCaches();

public:
	Queue<string> m_jobs;
	mutex m_mutex_cache;
	set<string> m_cache_updated;
	Queue<string> m_scans;
	Queue<mtime_filesize_path> m_parses;
	map<string, mtime_filesize_trklist> m_path_trklist; // 여기에 트랙 데이터가 들어간다
	mutex m_mutex_trk;
	mutex m_mutex_long;

	COptRunScriptDlg m_dlgRun;
	COptCopyFilesDlg m_dlgCopy;
	COptRecsDlg m_dlgRecs;
	COptRenameDlg m_dlgRename;
	COptDelTrksDlg m_dlgDelTrks;

	bool m_bExiting = false;
	bool m_bStopping = false;
	enum { JOB_NONE, JOB_SCANNING, JOB_PARSING, JOB_RUNNING } m_nJob = JOB_NONE; // 현재 진행 중인 작업 종류
	time_t m_dtstart = 0; // 현재 진행중인 작업 시작 시각
	size_t m_ntotal = 0; // 현재 진행중인 작업의 총 수

	struct ThreadCounter {
		void Inc() {
			lock_guard<mutex> lk(m_mutex);
			m_cnt++;
		}
		void Dec() {
			lock_guard<mutex> lk(m_mutex);
			m_cnt--;
		}
		unsigned int Get() {
			lock_guard<mutex> lk(m_mutex);
			return m_cnt;
		}
	private:
		mutex m_mutex;
		unsigned int m_cnt = 0;
	} m_nrunning; // 현재 진행중인 쓰레드의 총 수

	vector<thread> m_thread_worker;
	void worker_thread_func();

public:
	HICON m_hIcon;

	// 각 윈도우 선택하는 버튼
	CButton m_ctrlSelRun;
	CButton m_ctrlSelCopyFiles;
	CButton m_ctrlSelRecs;
	CButton m_ctrlSelDelTrks;
	CButton m_ctrlSelRenameTrks;
	CButton m_ctrlSelRenameDev;

	CButton m_btnRun;
	CButton m_btnStop;
	CButton m_btnIdir;
	CButton m_btnScan;
	CButton m_btnSaveList;
	CButton m_btnTrkAll;
	CButton m_btnTrkNone;
	CButton m_btnFileAll;
	CButton m_btnFileNone;
	CButton m_btnOdir;
	CButton m_btnClear;
	CButton m_btnSelect;

	int m_nLastTrkSel = -1;
	int m_nLastFileSel = -1;
	CRichEditCtrl m_ctrLog;
	CString m_strIdir;
	CString m_strOdir;
	CListBox m_ctrList;
	CString m_strProgress;

	BOOL m_bSkip = FALSE;
	BOOL m_bMakeSubDir = FALSE;
	Canvas m_canFolder;
	CStatic m_ctrlOdirStatic;
	CStatic m_ctrlIdirStatic;
	CStatic m_ctrProgress;
	CEdit m_ctrlFilter;
	CComboBox m_ctrlSelOper;
	CStatic m_ctrlTrkCnt;
	CStatic m_ctrlFileCnt;
	CListCtrl m_ctrlFileList;

	// 체크 버튼
	CButton m_ctrlExact;
	CButton m_ctrlMakeSubDir;
	CButton m_ctrlSkip;

	int m_nOldCy = 0;
	int m_nOldCx = 0;

	// LVS_OWNERDATA 속성인경우 SetItemText, SetItemData는 사용 불가하다
	// 따라서 내가 item data를 처리해야 한다
	vector<VITAL_FILE_INFO*> m_shown;
	shared_mutex m_mutex_dtnames;
	set<string> m_dtnames;

	shared_mutex m_mutex_file;
	vector<VITAL_FILE_INFO*> m_files;

	// filename의 ascending 으로 시작
	int m_nSortItem = -1;
	bool m_bSortAsc = true;
	CListBox m_ctrlTrkList;
	CEdit m_ctrlTrkFilter;
	CEdit m_ctrIdir;
	CEdit m_ctrOdir;
	CEdit m_ctrlSelTrks;

public:
	afx_msg void OnHdnItemclickFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnBnClickedTrkAdd();
	afx_msg void OnLvnBegindragFilelist(NMHDR *pNMHDR, LRESULT *pResult);
	afx_msg void OnEnKillfocusIdir();
	afx_msg void OnEnKillfocusOdir();
	afx_msg void OnBnClickedIdirOpen();
	afx_msg void OnLbnDblclkTrklist();
	afx_msg void OnEnChangeTrkFilter();

	// checksel: 만일 true 이고 Add 된 트랙이 없다면 선택된 트랙이라도 사용한다.
	vector<string> get_selected_trks(bool checksel = false);

	afx_msg void OnEnChangeSelectedTrks();
	void UpdateFileList();
	void UpdateTrkList();
	void AddSelTrks();
};
