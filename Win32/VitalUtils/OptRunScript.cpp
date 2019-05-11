#include "stdafx.h"
#include "VitalUtils.h"
#include "OptRunScript.h"
#include "afxdialogex.h"

IMPLEMENT_DYNAMIC(COptRunScriptDlg, CDialogEx)

COptRunScriptDlg::COptRunScriptDlg(CWnd* pParent /*=NULL*/)
: CDialogEx(COptRunScriptDlg::IDD, pParent), m_strScript(_T("")) {
}

COptRunScriptDlg::~COptRunScriptDlg() {
}

void COptRunScriptDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_SCRIPT, m_ctrlScript);
	DDX_CBString(pDX, IDC_SCRIPT, m_strScript);
}

BEGIN_MESSAGE_MAP(COptRunScriptDlg, CDialogEx)
	ON_BN_CLICKED(IDC_SETUP_PYTHON, &COptRunScriptDlg::OnBnClickedSetupPython)
END_MESSAGE_MAP()

BOOL COptRunScriptDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	WIN32_FIND_DATA fd;
	ZeroMemory(&fd, sizeof(WIN32_FIND_DATA));

	HANDLE hFind = FindFirstFile(GetModuleDir() + "scripts\\*.py", &fd);
	for (BOOL ret = (hFind != INVALID_HANDLE_VALUE); ret; ret = FindNextFile(hFind, &fd)) {
		if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue;
		m_ctrlScript.AddString(fd.cFileName);
	}
	FindClose(hFind);

	if (m_ctrlScript.GetCount() > 0) m_ctrlScript.SetCurSel(0);

	return TRUE;
}

void COptRunScriptDlg::OnBnClickedSetupPython() {
	theApp.InstallPython();
	theApp.Log("Python installed");
}
