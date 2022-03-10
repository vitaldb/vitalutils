#include "stdafx.h"
#include "VitalUtils.h"
#include "DlgUnzip.h"
#include "Https.h"
#include "util.h"

IMPLEMENT_DYNAMIC(CDlgUnzip, CDialogEx)

CDlgUnzip::CDlgUnzip(const string& ipath, const string& odir)
: CDialogEx(CDlgUnzip::IDD, nullptr), m_ipath(ipath), m_odir(odir) {
}

void CDlgUnzip::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_STATUS, m_ctrlStatus);
	DDX_Control(pDX, IDC_PROGRESS1, m_ctrlProgress);
}

BEGIN_MESSAGE_MAP(CDlgUnzip, CDialogEx)
	ON_BN_CLICKED(IDCANCEL, &CDlgUnzip::OnBnClickedCancel)
	ON_WM_DESTROY()
END_MESSAGE_MAP()

void CDlgUnzip::OnBnClickedCancel() {
	m_bCancelling = true;
	CDialogEx::OnCancel();
}

BOOL CDlgUnzip::OnInitDialog() {
	CDialogEx::OnInitDialog();
	SetWindowText("Decompressing");
	m_status = "";
	m_ctrlProgress.SetRange(0, 100);
	m_thread_unzip = thread(&CDlgUnzip::unzip_thread_func, this);
	return TRUE;
}

void CDlgUnzip::OnDestroy() {
	if (m_thread_unzip.joinable()) m_thread_unzip.join();

	if (m_hz) CloseZip(m_hz);
	m_hz = nullptr;

	CDialogEx::OnDestroy();
}

void CDlgUnzip::OnProgress(size_t dwRead, size_t dwTotal) {
	if (!dwTotal) return;
	
	//TRACE("%u %u\n", dwRead, dwTotal);

	int iperc = m_ctrlProgress.GetPos();
	int newperc = int((dwRead * 100) / dwTotal);
	if (newperc < 0) newperc = 0;
	else if (newperc > 100) newperc = 100;
	if (newperc < iperc + 3) return;

	m_ctrlStatus.SetWindowText(m_status.c_str());
	m_ctrlProgress.SetPos(newperc);
}

void CDlgUnzip::unzip_thread_func() {
	m_hz = OpenZip(m_ipath.c_str(), nullptr);
	ZIPENTRY ze; GetZipItem(m_hz, -1, &ze);
	int numitems = ze.index;
	
	// calculate total size
	size_t dwTotal = fs::file_size(m_ipath);
	size_t dwRead = 0;
	for (int i = 0; i < numitems; i++) {
		if (m_bCancelling) break;
		GetZipItem(m_hz, i, &ze);
		
		auto opath = replace_all(m_odir + ze.name, '/', '\\');
		fs::create_directories(dirname(opath));
		UnzipItem(m_hz, i, opath.c_str());
		dwRead += ze.comp_size;

		m_status = ze.name;

		OnProgress(dwRead, dwTotal);
	}

	PostMessage(WM_COMMAND, IDOK);
}
