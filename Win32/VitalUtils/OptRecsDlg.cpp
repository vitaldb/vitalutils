#include "stdafx.h"
#include "VitalUtils.h"
#include "OptRecsDlg.h"
#include "afxdialogex.h"

IMPLEMENT_DYNAMIC(COptRecsDlg, CDialogEx)

COptRecsDlg::COptRecsDlg(CWnd* pParent /*=NULL*/)
: CDialogEx(COptRecsDlg::IDD, pParent) {
}

COptRecsDlg::~COptRecsDlg() {
}

void COptRecsDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Check(pDX, IDC_ABSTIME, m_bAbstime);
	DDX_Check(pDX, IDC_HEADER, m_bPrintHeader);
	DDX_Check(pDX, IDC_RESTRICTED, m_bRestricted);
	DDX_Check(pDX, IDC_LAST, m_bLast);
	DDX_Text(pDX, IDC_INTERVAL, m_fInterval);
	DDV_MinMaxDouble(pDX, m_fInterval, 0.001, 99999);
	DDX_Control(pDX, IDC_INTERVAL, m_ctrInterval);
	DDX_Check(pDX, IDC_CASENAME, m_bPrintFilename);
	DDX_Control(pDX, IDC_OUTPUT_FILE, m_ctrlOutputFile);
	DDX_Check(pDX, IDC_LONGITUDINAL, m_bLong);
	DDX_Check(pDX, IDC_SKIP_BLANK, m_bSkipBlank);
	DDX_Check(pDX, IDC_PRINT_MEAN, m_bPrintMean);
	DDX_Check(pDX, IDC_PRINT_CLOSEST, m_bPrintClosest);
	DDX_Text(pDX, IDC_OUTPUT_FILE, m_strOutputFile);
	DDX_Control(pDX, IDC_HEADER, m_ctrlHeader);
	DDX_Control(pDX, IDC_CASENAME, m_ctrlPrintFilename);
}

BEGIN_MESSAGE_MAP(COptRecsDlg, CDialogEx)
	ON_EN_KILLFOCUS(IDC_INTERVAL, &COptRecsDlg::OnEnKillfocusInterval)
	ON_BN_CLICKED(IDC_LONGITUDINAL, &COptRecsDlg::OnBnClickedLong)
END_MESSAGE_MAP()

BOOL COptRecsDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	return TRUE;  // return TRUE unless you set the focus to a control
				  // 예외: OCX 속성 페이지는 FALSE를 반환해야 합니다.
}

void COptRecsDlg::OnEnKillfocusInterval() {
	UpdateData(TRUE); // it will check the min and max value
}

void COptRecsDlg::OnBnClickedLong() {
	UpdateData();
	m_ctrlOutputFile.EnableWindow(m_bLong);
	if (m_bLong) {
		m_ctrlPrintFilename.EnableWindow(FALSE);
		m_ctrlHeader.EnableWindow(FALSE);
		m_bPrintHeader = FALSE;
		m_bPrintFilename = TRUE;
		UpdateData(FALSE);
	} else {
		m_ctrlPrintFilename.EnableWindow(TRUE);
		m_ctrlHeader.EnableWindow(TRUE);
	}
}
