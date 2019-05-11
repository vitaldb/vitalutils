#include "stdafx.h"
#include "VitalUtils.h"
#include "DlgDownload.h"
#include "afxdialogex.h"
#include "Https.h"
#include <process.h>
#include <Tlhelp32.h>
#include <winbase.h> 
#include <string.h>

IMPLEMENT_DYNAMIC(CDlgDownload, CDialogEx)

CDlgDownload::CDlgDownload(CWnd* pParent, LPCTSTR url, LPCTSTR localpath)
: CDialogEx(CDlgDownload::IDD, pParent), m_strUrl(url), m_strLocalPath(localpath) {
	m_strStatus = m_strUrl;
	if (m_strUrl.Left(8).MakeLower() != "https://") {
		AfxMessageBox("URL is not HTTPS");
		return;
	}
}

bool WaitForEvt(HANDLE hEvent, DWORD nMilisec) {
	return WaitForSingleObject(hEvent, nMilisec) == WAIT_OBJECT_0;
}

typedef UINT(*THREADPROC)(LPVOID);
CWinThread* NewThread(THREADPROC f, LPVOID p) {
	auto pthread = AfxBeginThread(f, p, THREAD_PRIORITY_NORMAL, 0, CREATE_SUSPENDED);
	pthread->m_bAutoDelete = FALSE;
	pthread->ResumeThread();
	return pthread;
}

void DeleteThread(CWinThread* &pWinThread, DWORD timeout = 1000) {
	CWinThread* pThread = pWinThread;

	// 두번 실행되도 문제 없게
	if (!pWinThread) return;
	pWinThread = nullptr;

	auto dwThreadId = GetThreadId(pThread->m_hThread);

	// 현 스레드에서 자신을 wait 하고 삭제하는 경우? 이런 경우는 설계를 변경해야한다.
	// 쓰레드가 자신을 delete 할 경우 return 후 결과값 저장시 assert fail 이 발생한다.
	ASSERT(GetCurrentThreadId() != dwThreadId);

	if (pThread->m_hThread) {
		//		TRACE(NumToStr(GetUt()) + "wait start %x\n", dwThreadId);
		//		auto t1 = GetUt();
		if (!WaitForEvt(pThread->m_hThread, timeout)) { // 정상 종료 시 thread object가 signaled 상태가 되므로 WAIT_OBJECT_0 리턴
														//if (GetUt() - t1 > 0.8) {
														//	int a = 0;
														//}
														// 쓰레드를 강제 종료하면 메모리 누수가 생긴다.
														//			TRACE(NumToStr(GetUt()) + " terminate thread %x\n", dwThreadId);
			TerminateThread(pThread->m_hThread, 0);
		}
	}

	delete pThread;
}

CDlgDownload::~CDlgDownload() {
	DeleteThread(m_pDownloadThread);
}

void CDlgDownload::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Text(pDX, IDC_STATUS, m_strStatus);
	DDX_Control(pDX, IDC_PROGRESS1, m_ctrlProgress);
}

BEGIN_MESSAGE_MAP(CDlgDownload, CDialogEx)
	ON_BN_CLICKED(IDCANCEL, &CDlgDownload::OnBnClickedCancel)
	ON_WM_DESTROY()
END_MESSAGE_MAP()

void CDlgDownload::OnBnClickedCancel() {
	m_bCancelling = true;

	CDialogEx::OnCancel();
}

BOOL CDlgDownload::OnInitDialog() {
	CDialogEx::OnInitDialog();
	m_ctrlProgress.SetRange(0, 100);

	ASSERT(!m_pDownloadThread);
	m_pDownloadThread = NewThread([](LPVOID p)->UINT{((CDlgDownload*)p)->DownloadThreadFunc(); return 0; }, this);

	return TRUE;
}

void CDlgDownload::OnDestroy() {
	// 다운로드 중지
	DeleteThread(m_pDownloadThread);

	CDialogEx::OnDestroy();
}

void CDlgDownload::OnProgress(DWORD dwRead, DWORD dwTotal) {
	if (!dwTotal) return;

	int iperc = m_ctrlProgress.GetPos();
	int newperc = (dwRead * 100) / dwTotal;
	if (iperc == newperc) return;
	m_ctrlProgress.SetPos(newperc);
}

void CDlgDownload::DownloadThreadFunc() {
	// theApp.Log("DownloadThread started");

	CString str = m_strUrl.Mid(8);
	
	int ipos = str.Find("/");
	CString strHost = str.Left(ipos);
	CString strRemotePath = str.Mid(ipos);

	Https https(strHost);
	if (!https.Download(strRemotePath, m_strLocalPath, [this](DWORD dwRead, DWORD dwTotal)->bool{ OnProgress(dwRead, dwTotal); return !m_bCancelling; })) {
		m_bCancelling = false;
		PostMessage(WM_COMMAND, IDCANCEL);
		return;
	}

	// 자기 자신을 종료 시킨다
	PostMessage(WM_COMMAND, IDOK);
	theApp.Log("Download completed");
}

