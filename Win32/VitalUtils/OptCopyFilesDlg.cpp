#include "stdafx.h"
#include "VitalUtils.h"
#include "OptCopyFilesDlg.h"
#include "afxdialogex.h"

IMPLEMENT_DYNAMIC(COptCopyFilesDlg, CDialogEx)

COptCopyFilesDlg::COptCopyFilesDlg(CWnd* pParent /*=NULL*/)
: CDialogEx(COptCopyFilesDlg::IDD, pParent) {
}

COptCopyFilesDlg::~COptCopyFilesDlg() {
}

void COptCopyFilesDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Check(pDX, IDC_TRACKS, m_bTracks);
}

BEGIN_MESSAGE_MAP(COptCopyFilesDlg, CDialogEx)
END_MESSAGE_MAP()

BOOL COptCopyFilesDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	return TRUE;
}

