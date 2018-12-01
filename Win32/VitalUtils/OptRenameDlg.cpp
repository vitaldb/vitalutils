#include "stdafx.h"
#include "VitalUtils.h"
#include "VitalUtilsDlg.h"
#include "OptRenameDlg.h"
#include "afxdialogex.h"

IMPLEMENT_DYNAMIC(COptRenameDlg, CDialogEx)

COptRenameDlg::COptRenameDlg(CWnd* pParent /*=NULL*/)
: CDialogEx(COptRenameDlg::IDD, pParent) {
}

COptRenameDlg::~COptRenameDlg() {
}

void COptRenameDlg::DoDataExchange(CDataExchange* pDX) {
	CDialogEx::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_TO1, m_ctrlTo[0]);
	DDX_Control(pDX, IDC_TO2, m_ctrlTo[1]);
	DDX_Control(pDX, IDC_TO3, m_ctrlTo[2]);
	DDX_Control(pDX, IDC_TO4, m_ctrlTo[3]);
	DDX_Control(pDX, IDC_TO5, m_ctrlTo[4]);
	DDX_Control(pDX, IDC_TO6, m_ctrlTo[5]);
	DDX_Control(pDX, IDC_TO7, m_ctrlTo[6]);
	DDX_Control(pDX, IDC_TO8, m_ctrlTo[7]);
	DDX_Control(pDX, IDC_TO9, m_ctrlTo[8]);
	DDX_Control(pDX, IDC_TO10, m_ctrlTo[9]);
	DDX_Control(pDX, IDC_TO11, m_ctrlTo[10]);
	DDX_Control(pDX, IDC_TO12, m_ctrlTo[11]);
	DDX_Control(pDX, IDC_TO13, m_ctrlTo[12]);
	DDX_Control(pDX, IDC_TO14, m_ctrlTo[13]);
	DDX_Control(pDX, IDC_TO15, m_ctrlTo[14]);
	DDX_Control(pDX, IDC_TO16, m_ctrlTo[15]);
	DDX_Control(pDX, IDC_TO17, m_ctrlTo[16]);
	DDX_Control(pDX, IDC_TO18, m_ctrlTo[17]);
	DDX_Control(pDX, IDC_TO19, m_ctrlTo[18]);
	DDX_Control(pDX, IDC_TO20, m_ctrlTo[19]);
	DDX_Control(pDX, IDC_TO21, m_ctrlTo[20]);
	DDX_Control(pDX, IDC_TO22, m_ctrlTo[21]);
	DDX_Control(pDX, IDC_TO23, m_ctrlTo[22]);
	DDX_Control(pDX, IDC_TO24, m_ctrlTo[23]);
	DDX_Control(pDX, IDC_TO25, m_ctrlTo[24]);
	DDX_Control(pDX, IDC_TO26, m_ctrlTo[25]);
	DDX_Control(pDX, IDC_TO27, m_ctrlTo[26]);
	DDX_Control(pDX, IDC_TO28, m_ctrlTo[27]);
	DDX_Control(pDX, IDC_TO29, m_ctrlTo[28]);
	DDX_Control(pDX, IDC_TO30, m_ctrlTo[29]);
	DDX_Control(pDX, IDC_FROM1, m_ctrlFrom[0]);
	DDX_Control(pDX, IDC_FROM2, m_ctrlFrom[1]);
	DDX_Control(pDX, IDC_FROM3, m_ctrlFrom[2]);
	DDX_Control(pDX, IDC_FROM4, m_ctrlFrom[3]);
	DDX_Control(pDX, IDC_FROM5, m_ctrlFrom[4]);
	DDX_Control(pDX, IDC_FROM6, m_ctrlFrom[5]);
	DDX_Control(pDX, IDC_FROM7, m_ctrlFrom[6]);
	DDX_Control(pDX, IDC_FROM8, m_ctrlFrom[7]);
	DDX_Control(pDX, IDC_FROM9, m_ctrlFrom[8]);
	DDX_Control(pDX, IDC_FROM10, m_ctrlFrom[9]);
	DDX_Control(pDX, IDC_FROM11, m_ctrlFrom[10]);
	DDX_Control(pDX, IDC_FROM12, m_ctrlFrom[11]);
	DDX_Control(pDX, IDC_FROM13, m_ctrlFrom[12]);
	DDX_Control(pDX, IDC_FROM14, m_ctrlFrom[13]);
	DDX_Control(pDX, IDC_FROM15, m_ctrlFrom[14]);
	DDX_Control(pDX, IDC_FROM16, m_ctrlFrom[15]);
	DDX_Control(pDX, IDC_FROM17, m_ctrlFrom[16]);
	DDX_Control(pDX, IDC_FROM18, m_ctrlFrom[17]);
	DDX_Control(pDX, IDC_FROM19, m_ctrlFrom[18]);
	DDX_Control(pDX, IDC_FROM20, m_ctrlFrom[19]);
	DDX_Control(pDX, IDC_FROM21, m_ctrlFrom[20]);
	DDX_Control(pDX, IDC_FROM22, m_ctrlFrom[21]);
	DDX_Control(pDX, IDC_FROM23, m_ctrlFrom[22]);
	DDX_Control(pDX, IDC_FROM24, m_ctrlFrom[23]);
	DDX_Control(pDX, IDC_FROM25, m_ctrlFrom[24]);
	DDX_Control(pDX, IDC_FROM26, m_ctrlFrom[25]);
	DDX_Control(pDX, IDC_FROM27, m_ctrlFrom[26]);
	DDX_Control(pDX, IDC_FROM28, m_ctrlFrom[27]);
	DDX_Control(pDX, IDC_FROM29, m_ctrlFrom[28]);
	DDX_Control(pDX, IDC_FROM30, m_ctrlFrom[29]);
	DDX_Text(pDX, IDC_FROM1, m_strFrom[0]);
	DDX_Text(pDX, IDC_FROM2, m_strFrom[1]);
	DDX_Text(pDX, IDC_FROM3, m_strFrom[2]);
	DDX_Text(pDX, IDC_FROM4, m_strFrom[3]);
	DDX_Text(pDX, IDC_FROM5, m_strFrom[4]);
	DDX_Text(pDX, IDC_FROM6, m_strFrom[5]);
	DDX_Text(pDX, IDC_FROM7, m_strFrom[6]);
	DDX_Text(pDX, IDC_FROM8, m_strFrom[7]);
	DDX_Text(pDX, IDC_FROM9, m_strFrom[8]);
	DDX_Text(pDX, IDC_FROM10, m_strFrom[9]);
	DDX_Text(pDX, IDC_FROM11, m_strFrom[10]);
	DDX_Text(pDX, IDC_FROM12, m_strFrom[11]);
	DDX_Text(pDX, IDC_FROM13, m_strFrom[12]);
	DDX_Text(pDX, IDC_FROM14, m_strFrom[13]);
	DDX_Text(pDX, IDC_FROM15, m_strFrom[14]);
	DDX_Text(pDX, IDC_FROM16, m_strFrom[15]);
	DDX_Text(pDX, IDC_FROM17, m_strFrom[16]);
	DDX_Text(pDX, IDC_FROM18, m_strFrom[17]);
	DDX_Text(pDX, IDC_FROM19, m_strFrom[18]);
	DDX_Text(pDX, IDC_FROM20, m_strFrom[19]);
	DDX_Text(pDX, IDC_FROM21, m_strFrom[20]);
	DDX_Text(pDX, IDC_FROM22, m_strFrom[21]);
	DDX_Text(pDX, IDC_FROM23, m_strFrom[22]);
	DDX_Text(pDX, IDC_FROM24, m_strFrom[23]);
	DDX_Text(pDX, IDC_FROM25, m_strFrom[24]);
	DDX_Text(pDX, IDC_FROM26, m_strFrom[25]);
	DDX_Text(pDX, IDC_FROM27, m_strFrom[26]);
	DDX_Text(pDX, IDC_FROM28, m_strFrom[27]);
	DDX_Text(pDX, IDC_FROM29, m_strFrom[28]);
	DDX_Text(pDX, IDC_FROM30, m_strFrom[29]);
	DDX_Text(pDX, IDC_TO1, m_strTo[0]);
	DDX_Text(pDX, IDC_TO2, m_strTo[1]);
	DDX_Text(pDX, IDC_TO3, m_strTo[2]);
	DDX_Text(pDX, IDC_TO4, m_strTo[3]);
	DDX_Text(pDX, IDC_TO5, m_strTo[4]);
	DDX_Text(pDX, IDC_TO6, m_strTo[5]);
	DDX_Text(pDX, IDC_TO7, m_strTo[6]);
	DDX_Text(pDX, IDC_TO8, m_strTo[7]);
	DDX_Text(pDX, IDC_TO9, m_strTo[8]);
	DDX_Text(pDX, IDC_TO10, m_strTo[9]);
	DDX_Text(pDX, IDC_TO11, m_strTo[10]);
	DDX_Text(pDX, IDC_TO12, m_strTo[11]);
	DDX_Text(pDX, IDC_TO13, m_strTo[12]);
	DDX_Text(pDX, IDC_TO14, m_strTo[13]);
	DDX_Text(pDX, IDC_TO15, m_strTo[14]);
	DDX_Text(pDX, IDC_TO16, m_strTo[15]);
	DDX_Text(pDX, IDC_TO17, m_strTo[16]);
	DDX_Text(pDX, IDC_TO18, m_strTo[17]);
	DDX_Text(pDX, IDC_TO19, m_strTo[18]);
	DDX_Text(pDX, IDC_TO20, m_strTo[19]);
	DDX_Text(pDX, IDC_TO21, m_strTo[20]);
	DDX_Text(pDX, IDC_TO22, m_strTo[21]);
	DDX_Text(pDX, IDC_TO23, m_strTo[22]);
	DDX_Text(pDX, IDC_TO24, m_strTo[23]);
	DDX_Text(pDX, IDC_TO25, m_strTo[24]);
	DDX_Text(pDX, IDC_TO26, m_strTo[25]);
	DDX_Text(pDX, IDC_TO27, m_strTo[26]);
	DDX_Text(pDX, IDC_TO28, m_strTo[27]);
	DDX_Text(pDX, IDC_TO29, m_strTo[28]);
	DDX_Text(pDX, IDC_TO30, m_strTo[29]);
}

BEGIN_MESSAGE_MAP(COptRenameDlg, CDialogEx)
	ON_WM_SHOWWINDOW()
END_MESSAGE_MAP()

BOOL COptRenameDlg::OnInitDialog() {
	CDialogEx::OnInitDialog();

	return TRUE;  // return TRUE unless you set the focus to a control
				  // 예외: OCX 속성 페이지는 FALSE를 반환해야 합니다.
}

void COptRenameDlg::UpdateForm() {
	auto pdlg = (CVitalUtilsDlg*)theApp.m_pMainWnd;
	if (!pdlg) return;

	int nchanged = 0;
	if (pdlg->m_ctrlSelRenameDev.GetCheck()) { // 장비명 변경 시
		for (int i = 0; i < pdlg->m_ctrlTrkList.GetCount(); i++) {
			if (pdlg->m_ctrlTrkList.GetSelCount() > 0) if (!pdlg->m_ctrlTrkList.GetSel(i)) continue;
			CString s; pdlg->m_ctrlTrkList.GetText(i, s);
			auto dtname = Explode(s, '/');
			if (dtname.size() < 2) continue;
			auto dname = dtname[0];
			if (dname.IsEmpty()) continue;
			m_strFrom[0] = m_strTo[0] = dname;
			nchanged = 1;
			break; // 하나만 설정하면 끝이다
		}
	} else if (pdlg->m_ctrlSelRenameTrks.GetCheck()) {
		for (int i = 0; i < pdlg->m_ctrlTrkList.GetCount(); i++) {
			if (pdlg->m_ctrlTrkList.GetSelCount() > 0) if (!pdlg->m_ctrlTrkList.GetSel(i)) continue;
			CString s; pdlg->m_ctrlTrkList.GetText(i, s);
			if (s == "/EVENT") continue;
			auto dtname = Explode(s, '/');
			if (dtname.size() < 2) continue;
			auto dname = dtname[0];
			auto tname = dtname[1];
			m_strFrom[nchanged] = s;
			m_strTo[nchanged] = tname;
			nchanged++;
			if (nchanged >= 30) break; // 최대 30개 까지 설정하면 끝이다
		}
	}
	for (int i = nchanged; i < 30; i++) {
		m_strFrom[i] = m_strTo[i] = "";
	}
	for (int i = 0; i < 30; i++) {
		int sw = (i < nchanged) ? SW_SHOW : SW_HIDE;
		m_ctrlTo[i].ShowWindow(sw);
		m_ctrlFrom[i].ShowWindow(sw);
	}
	UpdateData(FALSE);
}
