#include "stdafx.h"
#include "EditEx.h"

IMPLEMENT_DYNAMIC(CEditEx, CEdit)

CEditEx::CEditEx()
{

}

CEditEx::~CEditEx()
{
}

BEGIN_MESSAGE_MAP(CEditEx, CEdit)
END_MESSAGE_MAP()

BOOL CEditEx::PreTranslateMessage(MSG* pMsg)
{
	if (pMsg->message == WM_KEYDOWN && ::GetKeyState(VK_CONTROL) < 0)
	switch (pMsg->wParam)
	{
		case 'Z': Undo(); return TRUE;
		case 'X': Cut(); return TRUE;
		case 'C': Copy(); return TRUE;
		case 'V': Paste(); return TRUE;
		case 'A': SetSel(0, -1); return TRUE;
	}
	return CEdit::PreTranslateMessage(pMsg);
}
