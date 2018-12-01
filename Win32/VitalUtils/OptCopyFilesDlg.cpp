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
}

BEGIN_MESSAGE_MAP(COptCopyFilesDlg, CDialogEx)
END_MESSAGE_MAP()

BOOL COptCopyFilesDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	return TRUE;  // return TRUE unless you set the focus to a control
				  // 예외: OCX 속성 페이지는 FALSE를 반환해야 합니다.
}

