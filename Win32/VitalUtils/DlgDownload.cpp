#include "stdafx.h"
#include "VitalUtils.h"
#include "DlgDownload.h"
#include "Https.h"

IMPLEMENT_DYNAMIC(CDlgDownload, CDialogEx)

CDlgDownload::CDlgDownload(string host, string remotepath, string localpath)
: CDialogEx(CDlgDownload::IDD, nullptr), m_host(host), m_remotepath(remotepath), m_localpath(localpath) {
	m_strStatus = (host + remotepath).c_str();
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
	m_thread_download = thread(&CDlgDownload::download_thread_func, this);
	return TRUE;
}

void CDlgDownload::OnDestroy() {
	if (m_thread_download.joinable()) m_thread_download.join();

	CDialogEx::OnDestroy();
}

void CDlgDownload::OnProgress(size_t dwRead, size_t dwTotal) {
	if (!dwTotal) return;
	
	//TRACE("%u %u\n", dwRead, dwTotal);

	int iperc = m_ctrlProgress.GetPos();
	int newperc = int((dwRead * 100) / dwTotal);
	if (newperc < 0) newperc = 0;
	else if (newperc > 100) newperc = 100;
	if (newperc < iperc + 3) return;

	//TRACE("%u\n", newperc);

	m_ctrlProgress.SetPos(newperc);
}

void CDlgDownload::download_thread_func() {
	theApp.log("Download started");

	Http http(m_host); // localhost:443 µî
	if (!http.download(m_remotepath, m_localpath, [this](size_t dwRead, size_t dwTotal)->bool{ OnProgress(dwRead, dwTotal); return !m_bCancelling; })) {
		m_bCancelling = false;
		PostMessage(WM_COMMAND, IDCANCEL);
		return;
	}

	PostMessage(WM_COMMAND, IDOK);

	theApp.log("Download finished");
}
