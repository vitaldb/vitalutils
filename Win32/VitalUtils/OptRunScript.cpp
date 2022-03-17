#include "stdafx.h"
#include "VitalUtils.h"
#include "OptRunScript.h"
#include "afxdialogex.h"

IMPLEMENT_DYNAMIC(COptRunScriptDlg, CDialogEx)

COptRunScriptDlg::COptRunScriptDlg(CWnd* pParent /*=NULL*/)
: CDialogEx(COptRunScriptDlg::IDD, pParent) {
}

COptRunScriptDlg::~COptRunScriptDlg() {
}

void COptRunScriptDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_SCRIPT, m_ctrlScript);
	DDX_Control(pDX, IDC_STATIC_PYTHON, m_ctrlStaticPython);
	DDX_Control(pDX, IDC_INSTALL_PYTHON, m_ctrlInstallPython);
}

BEGIN_MESSAGE_MAP(COptRunScriptDlg, CDialogEx)
	ON_WM_DESTROY()
	ON_BN_CLICKED(IDC_INSTALL_PYTHON, &COptRunScriptDlg::OnBnClickedInstallPython)
END_MESSAGE_MAP()

BOOL COptRunScriptDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();
	auto python_path = get_python_path();
	
	if (fs::exists(python_path)) { // 파이선 인터프리터가 이미 설치됨
		m_ctrlStaticPython.ShowWindow(SW_HIDE);
		m_ctrlInstallPython.ShowWindow(SW_HIDE);
	}

	auto dirs = {
		get_module_dir() + "scripts\\",
		dirname(python_path) + "Lib\\site-packages\\pyvital\\filters",
		get_conf_dir() + "filters"
	};

	for (auto sdir : dirs) {
		error_code ec;
		for (auto it : fs::directory_iterator(sdir, ec)) {
			if (it.is_regular_file()) {
				auto filename = it.path().filename().string();
				if (substr(filename, 0, 1) == "_") continue;
				if (substr(filename, filename.size() - 3) == ".py") {
					auto filepath = it.path().string();
					string label;
					if (filepath.find("scripts") != -1) label += "scripts/";
					if (filepath.find("pyvital") != -1) label += "pyvital/";
					if (filepath.find("filters") != -1) label += "filters/";
					label += filename;
					auto idx = m_ctrlScript.AddString(label.c_str());
					m_ctrlScript.SetItemDataPtr(idx, new string(filepath));
				}
			}
		}
	}

	if (m_ctrlScript.GetCount() > 0) m_ctrlScript.SetCurSel(0);
	return TRUE;
}

void COptRunScriptDlg::OnDestroy() {
	CDialogEx::OnDestroy();
	for (int i = 0; i < m_ctrlScript.GetCount(); i++) {
		auto pstr = m_ctrlScript.GetItemDataPtr(i);
		if (pstr) delete pstr;
	}
}

void COptRunScriptDlg::OnBnClickedInstallPython() {
	theApp.install_python();

	// kill myself
	auto module_path = get_module_path();
	ShellExecute(NULL, "open", module_path.c_str(), nullptr, nullptr, SW_SHOW);
	if (theApp.m_pMainWnd) {
		theApp.m_pMainWnd->PostMessage(WM_NCDESTROY, 0, 0);
		theApp.m_pMainWnd->PostMessage(WM_QUIT, 0, 0);
	}
}
