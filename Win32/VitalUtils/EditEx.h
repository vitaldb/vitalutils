#pragma once

class CEditEx : public CEdit
{
	DECLARE_DYNAMIC(CEditEx)

protected:
	DECLARE_MESSAGE_MAP()
public:
	virtual BOOL PreTranslateMessage(MSG* pMsg);
};


