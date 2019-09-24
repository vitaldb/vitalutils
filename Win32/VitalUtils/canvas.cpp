#include "stdafx.h"
#include "Canvas.h"
#include <math.h>
#include <ocidl.h>
#include <olectl.h>
#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include <malloc.h>

#define _CRT_SECURE_NO_DEPRECATE

#pragma warning(disable : 4244 4018)

#pragma once
#include <math.h>
#define BOUND(x,a,b) (((x) <= (a)) ? (a) : (((x) > (b)) ? (b) : (x)))
#define PS_MAX_DEPTH 4

static const double D2R = 0.017453292519943295769236907684886;
static const double TPI = 6.283185307179586476925286766559;
static const double HPI = 1.5707963267948966192313216916398;
static const double PI = 3.1415926535897932384626433832795;

#define HIMETRIC_INCH	2540

USHORT alpha_table[256][256];

Canvas::Canvas(HGLOBAL hdib) {
	Create(hdib);
}

Canvas::Canvas(int w, int h) {
	Create(w, h);
}

// create from memory
Canvas::Canvas(BYTE* pBuf, int nBuf) {
	Create(pBuf, nBuf);
}

// create from file
Canvas::Canvas(const char* filename) {
	Create(filename);
}

Canvas::Canvas(const Canvas& can) {
	Create(can);
}

Canvas::Canvas(const char* str, COLOR col, LOGFONT& lf, BYTE alpha, int padx, int pady) {
	Create(str, col, lf, alpha);
}

Canvas::Canvas(const char* str, COLOR col, CFont& font, BYTE alpha, int padx, int pady) {
	Create(str, col, font, alpha);
}

Canvas::Canvas(const char* str, COLOR col, HFONT hfont, BYTE alpha, int padx, int pady) {
	Create(str, col, hfont, alpha);
}

Canvas::Canvas(const char* str, COLOR col, const char* face, int size, bool bold, bool italic, BYTE alpha) {
	CFont font;
	font.CreateFontA(size, 0, 0, 0,
		bold ? FW_BOLD : FW_NORMAL,
		italic ? TRUE : FALSE,
		0, 0,
		DEFAULT_CHARSET,
		OUT_SCREEN_OUTLINE_PRECIS,
		CLIP_DEFAULT_PRECIS,
		PROOF_QUALITY,
		DEFAULT_PITCH, face);
	Create(str, col, font, alpha);
}

Canvas::~Canvas() {
	Destroy();
}

bool Canvas::Create(const Canvas& can) {
	bool ret = Create(can.GetWidth(), can.GetHeight());
	if (ret == false) return false;

	memcpy(m_pPixels, can.GetBuffer(), can.GetBufferLength());
	return true;
}

bool Canvas::Create(const char* str, COLOR col, const char* face, int size, bool bold, bool italic, BYTE alpha) {
	CFont font;
	font.CreateFont(size, 0, 0, 0, bold ? FW_BOLD : FW_NORMAL, italic ? TRUE : FALSE, 0, 0, DEFAULT_CHARSET, 0, 0, 0, 0, face);
	return Create(str, col, font, alpha);
}

bool Canvas::Create(const char* str, COLOR col, LOGFONT& lf, BYTE alpha, int padx, int pady) {
	CFont font; font.CreateFontIndirectA(&lf);
	return Create(str, col, font, alpha, padx, pady);
}

bool Canvas::Create(const char* str, COLOR col, CFont& font, BYTE alpha, int padx, int pady) {
	return Create(str, col, (HFONT)font.m_hObject, alpha, padx, pady);
}

bool Canvas::Create(const char* str, COLOR col, HFONT hfont, BYTE alpha, int padx, int pady) {
	// 크기를 얻어옴
	int width = 0;
	int height = 0;
	GetTextSize(hfont, str, width, height);

	// canvas를 생성
	if (!Create(width + padx * 2, height + pady * 2)) return false;

	// 투명 검정색으로 칠한다.
	Fill(COLORARGB(0, 0, 0, 0));

	::SetTextColor(m_hDC, COLOR2REF(col));
	::SetBkMode(m_hDC, TRANSPARENT);

	HFONT oldfont = (HFONT)::SelectObject(m_hDC, hfont);
	::TextOut(m_hDC, padx, pady, str, strlen(str));
	::SelectObject(m_hDC, oldfont);

	// 기존에 색깔이 있던 영역에 alpha를 먹임
	DWORD da = (DWORD)(255 - alpha) << 24;
	DWORD* end = m_pPixels + GetWidth() * GetHeight();
	for (DWORD* p = m_pPixels; p < end; p++)
		if (COLORA(*p) == 0) *p |= da;

	return true;
}

void Canvas::FillRect(LPRECT lpRect, COLOR col, BYTE alpha) {
	FillRect(lpRect->left, lpRect->top, lpRect->right, lpRect->bottom, col, alpha);
}

void Canvas::FillRect(int X1, int Y1, int X2, int Y2, COLOR col, BYTE alpha) {
	if (X1 > X2) { int temp = X2; X2 = X1; X1 = temp; }
	if (Y1 > Y2) { int temp = Y2; Y2 = Y1; Y1 = temp; }
	for (int y = Y1; y < Y2; y++)
		for (int x = X1; x < X2; x++)
			SetPixel(x, y, col, alpha);
}

void Canvas::Fill(COLOR col) {
	COLOR* p;
	COLOR* pEnd = m_pPixels + m_nWidth * m_nHeight;
	for (p = m_pPixels; p < pEnd; p++) *p = col;
}

void Canvas::FillAlpha(DWORD alpha) {
	alpha = ((alpha & 0x000000FF) << 24) & 0xFF000000;
	COLOR* p;
	COLOR* pEnd = m_pPixels + m_nWidth * m_nHeight;
	for (p = m_pPixels; p < pEnd; p++) *p = (*p & 0x00FFFFFF) | alpha;
}

// http://www.cs.unc.edu/~mcmillan/comp136/Lecture6/Lines.html
void Canvas::DrawLine(int x0, int y0, int x1, int y1, COLOR col) {
	HPEN pen = CreatePen(PS_SOLID, 1, COLOR2REF(col));
	HPEN oldpen = (HPEN)SelectObject(m_hDC, pen);
	MoveToEx(m_hDC, x0, y0, NULL);
	LineTo(m_hDC, x1, y1);
	SelectObject(m_hDC, oldpen);
	DeleteObject(pen);
	return;

	int dy = y1 - y0;
	int dx = x1 - x0;
	int stepx, stepy;

	if (dy < 0) { dy = -dy;  stepy = -1; } else { stepy = 1; }
	if (dx < 0) { dx = -dx;  stepx = -1; } else { stepx = 1; }
	dy <<= 1;                                                  // dy is now 2*dy
	dx <<= 1;                                                  // dx is now 2*dx

	SetPixel(x0, y0, col);
	if (dx > dy) {
		int fraction = dy - (dx >> 1);                         // same as 2*dy - dx
		while (x0 != x1) {
			if (fraction >= 0) {
				y0 += stepy;
				fraction -= dx;                                // same as fraction -= 2*dx
			}
			x0 += stepx;
			fraction += dy;                                    // same as fraction -= 2*dy
			SetPixel(x0, y0, col);
		}
	} else {
		int fraction = dx - (dy >> 1);
		while (y0 != y1) {
			if (fraction >= 0) {
				x0 += stepx;
				fraction -= dy;
			}
			y0 += stepy;
			fraction += dx;
			SetPixel(x0, y0, col);
		}
	}
}

// 존나 좋은 DrawLine 함수
// http://www.cs.unc.edu/~mcmillan/comp136/Lecture6/Lines.html
void Canvas::DrawLine(int x0, int y0, int x1, int y1, COLOR col, BYTE alpha) {
	int dy = y1 - y0;
	int dx = x1 - x0;
	int stepx, stepy;

	if (dy < 0) { dy = -dy;  stepy = -1; } else { stepy = 1; }
	if (dx < 0) { dx = -dx;  stepx = -1; } else { stepx = 1; }
	dy <<= 1;                                                  // dy is now 2*dy
	dx <<= 1;                                                  // dx is now 2*dx

	SetPixel(x0, y0, col, alpha);
	if (dx > dy) {
		int fraction = dy - (dx >> 1);                         // same as 2*dy - dx
		while (x0 != x1) {
			if (fraction >= 0) {
				y0 += stepy;
				fraction -= dx;                                // same as fraction -= 2*dx
			}
			x0 += stepx;
			fraction += dy;                                    // same as fraction -= 2*dy
			SetPixel(x0, y0, col, alpha);
		}
	} else {
		int fraction = dx - (dy >> 1);
		while (y0 != y1) {
			if (fraction >= 0) {
				x0 += stepx;
				fraction -= dy;
			}
			y0 += stepy;
			fraction += dx;
			SetPixel(x0, y0, col, alpha);
		}
	}
}

void Canvas::TextOut(int x, int y, COLOR col, LPCTSTR pString) {
	COLORREF oldcolor = ::SetTextColor(m_hDC, COLOR2REF(col));
	int nOldMode = SetBkMode(m_hDC, TRANSPARENT);
	::TextOut(m_hDC, x, y, pString, strlen(pString));
	SetBkMode(m_hDC, nOldMode);
	::SetTextColor(m_hDC, oldcolor);
}

void Canvas::DrawText(LPCTSTR pString, COLOR col, LPRECT pRect, UINT uFormat) {
	COLORREF oldcolor = ::SetTextColor(m_hDC, COLOR2REF(col));
	int oldmode = SetBkMode(m_hDC, TRANSPARENT);
	::DrawText(m_hDC, pString, strlen(pString), pRect, uFormat);
	SetBkMode(m_hDC, oldmode);
	::SetTextColor(m_hDC, oldcolor);
}

void Canvas::RoundBitBlt(HDC hdc, int round, int x, int y) {
	HRGN rgn;
	rgn = CreateRoundRectRgn(x, y, x + GetWidth(), y + GetHeight(), round, round);
	// we don't free the region handle as the system deletes it when it is no longer needed
	SelectClipRgn(hdc, rgn);
	::BitBlt(hdc, x, y, GetWidth(), GetHeight(), m_hDC, 0, 0, SRCCOPY);
	SelectClipRgn(hdc, NULL);
	DeleteObject(rgn);
}

void Canvas::BitBltTrans(HDC hDest, int left, int top) {
	BitBltTrans(hDest, left, top, GetPixel(0, 0));
}

void Canvas::BitBltTrans(HDC hDest, int left, int top, COLOR clr_trans) {
	if (!m_hDCMask) {
		m_hDCMask = CreateCompatibleDC(hDest);
		m_hBitmapMask = CreateBitmap(GetWidth(), GetHeight(), 1, 1, NULL);
		m_hOldBitmapMask = (HBITMAP)SelectObject(m_hDCMask, m_hBitmapMask);
	}

	// 칼라 -> 흑백 변환 시, 배경색과 일치 하는 픽셀을 white로 그렇지 않은 픽셀을 black로 변환한다. 
	// 현재 dcMsk에는 투명 색만 흰색으로, 나머지는 검정색으로 되어있다.
	COLORREF oldBkColor = SetBkColor(m_hDC, COLOR2REF(clr_trans));
	::BitBlt(m_hDCMask, 0, 0, GetWidth(), GetHeight(), m_hDC, 0, 0, SRCCOPY);

	// 흑백 -> 컬러 변환 시, 컬러 DC의 배경색과 전경색을 사용한다.
	::SetTextColor(hDest, RGB(0, 0, 0));
	::SetBkColor(hDest, RGB(255, 255, 255));

	// xor를 두번 하면 원래의 값으로 복호화 된다. 그러나 그것은 and에서 살아남았을 때 즉 배경일 때 말이다.
	// 배경이 아니라 이미지일 때는 xor 결과가 0으로 지워지고 다시 xor 할 경우 이미지가 0과 다른가 이므로 단순 복사된다.
	::BitBlt(hDest, left, top, GetWidth(), GetHeight(), m_hDC, 0, 0, SRCINVERT); // xor
	::BitBlt(hDest, left, top, GetWidth(), GetHeight(), m_hDCMask, 0, 0, SRCAND);
	::BitBlt(hDest, left, top, GetWidth(), GetHeight(), m_hDC, 0, 0, SRCINVERT); // xor

	SetBkColor(m_hDC, oldBkColor);
}

void Canvas::BitBlt(HDC hDest, const RECT &rc, int sx, int sy) {
	::BitBlt(hDest, rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, m_hDC, sx, sy, SRCCOPY);
}

void Canvas::BitBlt(HDC hDest, int x, int y) {
	::BitBlt(hDest, x, y, GetWidth(), GetHeight(), m_hDC, 0, 0, SRCCOPY);
}

void Canvas::StretchBlt(HDC hDest, const RECT &rc) {
	::StretchBlt(hDest, rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, m_hDC, 0, 0, GetWidth(), GetHeight(), SRCCOPY);
}

void Canvas::StretchBlt(HDC hDest, const RECT &rc, int sx, int sy, int sw, int sh) {
	::StretchBlt(hDest, rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, m_hDC, sx, sy, sw, sh, SRCCOPY);
}

/*
void Canvas::DrawArrow(CPoint from, CPoint to, COLORREF col, int width, int height)
{
// draw a DrawLine between the 2 endpoint
DrawLine(from.x, from.y, to.x, to.y, col);

double theta = atan2(from.y - to.y, from.x - to.x);
const double ti = 3.14159265358979;

// 중심점을 구한다.
double mid_x = to.x - height * cos(theta + ti);
double mid_y = to.y - height * sin(theta + ti);

// 삼각형을 만들어서 fill 하는 방법으로 한다.
CPoint point[3];
point[0] = to;
point[1] = CPoint(int(mid_x + width * cos(theta + ti / 2.0)),
int(mid_y + width * sin(theta + ti / 2.0)));
point[2] = CPoint(int(mid_x + width * cos(theta - ti / 2.0)),
int(mid_y + width * sin(theta - ti / 2.0)));

CRgn rgn;
rgn.CreatePolygonRgn(point, 3, WINDING);

CBrush brush;
brush.CreateSolidBrush(col);
m_pDC->FillRgn(&rgn, &brush);
}
*/

bool Canvas::SaveBMP(LPCTSTR lpszFileName) const {
	HBITMAP hBitmap = (HBITMAP)GetCurrentObject(m_hDC, OBJ_BITMAP);

	// The .BMP file format is as follows:
	// BITMAPFILEHEADER / BITMAPINFOHEADER / color table / pixel data

	// We need the pixel data and the BITMAPINFOHEADER.
	// We can get both by using GetDIBits:
	BITMAP bitmapObject;
	GetObject(hBitmap, sizeof(BITMAP), &bitmapObject);

	BITMAPINFO *bmi = (BITMAPINFO *)malloc(sizeof(BITMAPINFOHEADER) + 256 * sizeof(RGBQUAD));
	memset(&bmi->bmiHeader, 0, sizeof(BITMAPINFOHEADER));
	bmi->bmiHeader.biSize = sizeof(BITMAPINFOHEADER);

	int scanLineCount = GetDIBits(m_hDC, hBitmap, 0, bitmapObject.bmHeight,
		NULL, bmi, DIB_RGB_COLORS);

	// This is important:
	// GetDIBits will, by default, set this to BI_BITFIELDS.
	bmi->bmiHeader.biCompression = BI_RGB;

	BITMAPINFOHEADER* bmih = &bmi->bmiHeader;
	int bytesPerPixel = (bmih->biBitCount == 32 ? 4 : 3);
	int bytesPerRow = ((bmih->biWidth * bytesPerPixel + 3) & ~3);
	int imageBytes = bmih->biHeight * bytesPerRow;

	char *pBits = (char *)malloc(imageBytes);

	scanLineCount = GetDIBits(m_hDC, hBitmap, 0, bitmapObject.bmHeight,
		pBits, bmi, DIB_RGB_COLORS);

	// OK, so we've got the bits, and the BITMAPINFOHEADER.
	// Now we can put them in a file.
	HANDLE hFile = CreateFile(lpszFileName, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, 0, NULL);
	if (hFile != INVALID_HANDLE_VALUE) {
		// We don't deal with writing anything else at the moment.
		if (bmi->bmiHeader.biBitCount == 32) {
			// .BMP file begins with a BITMAPFILEHEADER,
			// so we'll write that.
			BITMAPFILEHEADER bmfh;
			bmfh.bfType = MAKEWORD('B', 'M');
			bmfh.bfSize = sizeof(BITMAPFILEHEADER)
				+ sizeof(BITMAPINFOHEADER)
				+ (bmi->bmiHeader.biClrUsed * sizeof(RGBQUAD))
				+ bmi->bmiHeader.biSizeImage;
			bmfh.bfReserved1 = 0;
			bmfh.bfReserved2 = 0;
			bmfh.bfOffBits = sizeof(BITMAPFILEHEADER)
				+ sizeof(BITMAPINFOHEADER)
				+ (bmi->bmiHeader.biClrUsed * sizeof(RGBQUAD));

			DWORD bytesWritten;
			WriteFile(hFile, &bmfh, sizeof(BITMAPFILEHEADER), &bytesWritten, NULL);

			// Then it's followed by the BITMAPINFOHEADER structure
			WriteFile(hFile, &bmi->bmiHeader, sizeof(BITMAPINFOHEADER),
				&bytesWritten, NULL);

			// Then the colour table.
			// ...which we don't support yet.

			// Then the pixel data.
			WriteFile(hFile, pBits, imageBytes, &bytesWritten, NULL);
		}
		CloseHandle(hFile);
	}
	free(pBits);
	free(bmi);
	return true;
}

bool Canvas::Create(int w, int h) {
	static bool bFirst = true;
	if (bFirst) {
		bFirst = false;

		// BYTE * BYTE 의 가능한 결과를 전부 저장
		USHORT i, j;
		for (i = 0; i < 256; i++)
			for (j = 0; j < 256; j++)
				alpha_table[i][j] = i * j;
	}

	Destroy();

	if (w == 0 || h == 0) return false;

	m_hDC = CreateCompatibleDC(NULL);
	ASSERT(m_hDC);

	BITMAPINFO bi;
	bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
	bi.bmiHeader.biWidth = w;
	bi.bmiHeader.biHeight = -h;
	bi.bmiHeader.biPlanes = 1;
	bi.bmiHeader.biBitCount = 32;
	bi.bmiHeader.biCompression = BI_RGB;
	bi.bmiHeader.biSizeImage = 0;
	bi.bmiHeader.biXPelsPerMeter = 0;
	bi.bmiHeader.biYPelsPerMeter = 0;
	bi.bmiHeader.biClrUsed = 0;
	bi.bmiHeader.biClrImportant = 0;
	m_hBitmap = CreateDIBSection(m_hDC, &bi, DIB_RGB_COLORS, (void**)&m_pPixels, NULL, 0);
	if (m_pPixels == NULL) {
		MessageBox(NULL, "비트맵을 만들수가 없습니다.", 0, 0);
		return false;
	}

	m_hOldBitmap = (HBITMAP)SelectObject(m_hDC, m_hBitmap);

	// 빠른 접근을 위해 각 행의 첫 포인터를 저장해 둔다.
	auto pData = (DWORD**)malloc(sizeof(DWORD*) * h);
	for (UINT y = 0; y < h; y++) pData[y] = m_pPixels + w * y;
	assert(!m_pData);
	m_pData = pData;

	m_nWidth = w;
	m_nHeight = h;

	GdiFlush();

	return true;
}

bool Canvas::Create(HGLOBAL hGlobal) {
	DWORD dwSize = GlobalSize(hGlobal);

	LPSTREAM pstm = nullptr;
	// create IStream* from global memory
	HRESULT hr = CreateStreamOnHGlobal(hGlobal, TRUE, &pstm);
	if (FAILED(hr) || pstm == NULL) return false;

	// Use IPicture stuff to use JPG / GIF files
	IPicture* pPicture = nullptr;
	hr = ::OleLoadPicture(pstm, dwSize, FALSE, IID_IPicture, (LPVOID *)&pPicture);
	if (FAILED(hr) || pPicture == NULL) return false;
	pstm->Release();

	HBITMAP hB = nullptr;
	pPicture->get_Handle((unsigned int*)&hB);

	// image의 크기를 얻어옵니다.
	BITMAP bm;
	GetObject(hB, sizeof(BITMAP), (LPSTR)&bm);
	int nWidth = bm.bmWidth;
	int nHeight = bm.bmHeight;

	Create(nWidth, nHeight);

	// get width and height of picture
	long hmWidth;
	long hmHeight;
	pPicture->get_Width(&hmWidth);
	pPicture->get_Height(&hmHeight);

	// display picture using IPicture::Render
	RECT rc; SetRect(&rc, 0, 0, nWidth, nHeight);
	pPicture->Render(m_hDC, 0, 0, nWidth, nHeight, 0, hmHeight, hmWidth, -hmHeight, &rc);
	pPicture->Release();

	// 투명도를 불투명도로 바꾼다.
	DWORD* buf = m_pPixels;
	DWORD* end = m_pPixels + m_nWidth * m_nHeight;
	for (; buf < end; buf++) *buf = *buf ^ 0xFF000000;

	return true;
}

// .gif, .jpg, .bmp, .ico, .emf, .wmf
bool Canvas::Create(const char *filename) {
	// open file
	HANDLE hFile = CreateFile(filename, GENERIC_READ, 0, NULL, OPEN_EXISTING, 0, NULL);
	if (INVALID_HANDLE_VALUE == hFile) {
		MessageBox(NULL, filename, NULL, NULL);
		return false;
	}

	// get file size
	DWORD dwFileSize = GetFileSize(hFile, NULL);
	if (-1 == dwFileSize) return false;

	// buf memory based on file size
	HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE, dwFileSize);
	if (NULL == hGlobal) return false;

	LPVOID pvData = GlobalLock(hGlobal);
	if (NULL == pvData) return false;

	DWORD dwBytesRead = 0;
	// read file and store in global memory
	BOOL bRead = ReadFile(hFile, pvData, dwFileSize, &dwBytesRead, NULL);
	if (FALSE == bRead) return false;
	GlobalUnlock(hGlobal);
	CloseHandle(hFile);

	// 메모리 비트맵으로부터 Canvas 객체를 생성
	bool ret = Create(hGlobal);

	GlobalFree(hGlobal);

	return ret;
}

// .gif, .jpg, .bmp, .ico, .emf, .wmf
bool Canvas::Create(BYTE* pBuf, int nBuf) {
	// buf memory based on file size
	HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE, nBuf);
	if (NULL == hGlobal) return false;

	LPVOID pvData = GlobalLock(hGlobal);
	if (NULL == pvData) return false;
	memcpy(pvData, pBuf, nBuf);
	GlobalUnlock(hGlobal);

	// 메모리 비트맵으로부터 Canvas 객체를 생성
	bool ret = Create(hGlobal);

	GlobalFree(hGlobal);

	return ret;
}

void Canvas::Destroy() {
	m_pPixels = nullptr;

	// pData를 삭제한 후 메모리를 해제해야한다.
	if (m_pData) {
		auto pData = m_pData;
		m_pData = nullptr;
		free(pData);
	}

	if (m_hDC) {
		::SelectObject(m_hDC, m_hOldBitmap);
		m_hOldBitmap = NULL;

		::DeleteDC(m_hDC);
		m_hDC = NULL;
	}

	if (m_hBitmap) {
		::DeleteObject(m_hBitmap); // 이 때 m_pPixels 의 메모리가 헤재된다.
		m_hBitmap = NULL;
	}

	m_nWidth = 0;
	m_nHeight = 0;

	if (m_hDCMask) {
		::SelectObject(m_hDCMask, m_hOldBitmapMask);
		m_hOldBitmapMask = NULL;

		::DeleteDC(m_hDCMask);
		m_hDCMask = NULL;
	}

	if (m_hBitmapMask) {
		::DeleteObject(m_hBitmapMask);
		m_hBitmapMask = NULL;
	}
}

void LastError() {
	DWORD dwErrorNo = GetLastError();
	LPVOID lpMsgBuf;
	if (!FormatMessage(
		FORMAT_MESSAGE_ALLOCATE_BUFFER |
		FORMAT_MESSAGE_FROM_SYSTEM |
		FORMAT_MESSAGE_IGNORE_INSERTS,
		NULL,
		dwErrorNo,
		MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),// Default language
		(LPTSTR)&lpMsgBuf,
		0,
		NULL)) {
		// Handle the error.
		return;
	}

	// 이곳을 바꾸면 오류를 적당히 처리 가능하다
	::MessageBox(NULL, (LPCTSTR)lpMsgBuf, "Error", MB_OK | MB_ICONINFORMATION);

	// Free the buffer.
	LocalFree(lpMsgBuf);
}

void Canvas::GetTextSize(HFONT hfont, LPCTSTR str, CSize& sz) {
	int w, h;
	Canvas::GetTextSize(m_hDC, hfont, str, w, h);
	sz.cx = w;
	sz.cy = h;
}

void Canvas::GetTextSize(HDC hdc, LPCTSTR str, int& width, int& height) {
	width = height = 0;

	// 문자열의 높이와 너비를 구함
	SIZE size;
	if (!::GetTextExtentPoint32(hdc, str, strlen(str), &size)) {
		LastError();
		return;
	}
	width = size.cx;
	height = size.cy;
}

void Canvas::GetTextSize(HDC hdc, HFONT hfont, LPCTSTR str, int& width, int& height) {
	HFONT oldfont = (HFONT)SelectObject(hdc, hfont);
	GetTextSize(hdc, str, width, height);
	SelectObject(hdc, oldfont);
}

void Canvas::GetTextSize(HFONT hfont, LPCTSTR str, int& width, int& height) {
	HDC mdc = CreateCompatibleDC(NULL);
	Canvas::GetTextSize(mdc, hfont, str, width, height);
	DeleteDC(mdc);
}

void Canvas::GetTextSize(CFont& font, LPCTSTR str, int& width, int& height) {
	Canvas::GetTextSize((HFONT)font.m_hObject, str, width, height);
}

void Canvas::GetTextSize(LPCTSTR str, CSize& sz) {
	int w, h;
	GetTextSize(m_hDC, str, w, h);
	sz.cx = w;
	sz.cy = h;
}

void Canvas::GetTextSize(LPCTSTR face, int size, LPCTSTR str, int& width, int& height) {
	CFont font;
	font.CreateFont(size, 0, 0, 0, 0, 0, 0, 0, DEFAULT_CHARSET, 0, 0, PROOF_QUALITY, 0, face);
	GetTextSize(font, str, width, height);
}

void Canvas::GetTextSize(LOGFONT& lf, LPCTSTR str, int& width, int& height) {
	CFont font;
	font.CreateFontIndirect(&lf);
	GetTextSize(font, str, width, height);
}

bool Canvas::CreateFromDesktopCapture(void) {
	// get screen resolution
	int xScrn = ::GetSystemMetrics(SM_CXSCREEN);
	int yScrn = ::GetSystemMetrics(SM_CYSCREEN);

	if (Create(xScrn, yScrn) == false) return false;

	// create a DC for the screen
	HDC hScrDC = CreateDC("DISPLAY", NULL, NULL, NULL);

	// bitblt screen DC to memory DC
	::BitBlt(GetHDC(), 0, 0, xScrn, yScrn, hScrDC, 0, 0, SRCCOPY);

	DeleteDC(hScrDC);

	return true;
}

void Canvas::Blend(Canvas& can1, Canvas& can2, BYTE factor) {
	if (can1.GetWidth() != can2.GetWidth() || can1.GetHeight() != can2.GetHeight()) return;
	if (GetWidth() != can1.GetWidth() || GetHeight() != can1.GetHeight())
		Create(can1.GetWidth(), can1.GetHeight());

	DWORD* buf = GetBuffer();
	DWORD* end = buf + GetHeight() * GetWidth();

	DWORD* buf1 = can1.GetBuffer();
	DWORD* buf2 = can2.GetBuffer();

	BYTE ifactor = 255 - factor;
	for (; buf < end; buf++, buf1++, buf2++) {
		*buf = COLORRGB(
			(alpha_table[factor][COLORR(*buf1)] + alpha_table[ifactor][COLORR(*buf2)]) >> 8,
			(alpha_table[factor][COLORG(*buf1)] + alpha_table[ifactor][COLORG(*buf2)]) >> 8,
			(alpha_table[factor][COLORB(*buf1)] + alpha_table[ifactor][COLORB(*buf2)]) >> 8);
	}
}

void Canvas::FlipV() {
	// 버퍼에 있는 데이터를 임시 공간으로 복사한다.
	DWORD* temp = new DWORD[m_nWidth * m_nHeight];
	memcpy(temp, m_pPixels, m_nWidth * m_nHeight * 4);

	// 줄을 바꾸며 복사한다.
	unsigned int y;
	for (y = 0; y < m_nHeight; y++)
		memcpy(m_pPixels + y * m_nWidth, temp + (m_nHeight - 1 - y) * m_nWidth, m_nWidth * 4);

	delete[] temp;
}
                                              
bool Canvas::Create(HINSTANCE hInst, WORD uint) {
	return Create(hInst, MAKEINTRESOURCE(uint));
}

bool Canvas::Create(HINSTANCE hInst, WORD uint, LPCTSTR lpType) {
	return Create(hInst, MAKEINTRESOURCE(uint), lpType);
}

// Create(AfxGetResourceHandle(), MAKEINTRESOURCE(IDB_PNG1), "PNG");
bool Canvas::Create(HINSTANCE hInst, LPCTSTR lpBitmapName, LPCTSTR lpType) {
	// 리소스ID와 타입으로 리소스정보를 읽어 옵니다
	HRSRC resInfo = FindResource(hInst, lpBitmapName, lpType);

	// 리소스정보를 이용하여 리소스를 읽어옵니다
	HGLOBAL hRes = LoadResource(hInst, resInfo);

	// 메모리에 로드된 리소스를 잠그고 접근할수 있는 포인터를 얻어 옵니다
	LPSTR lpRes = (LPSTR)LockResource(hRes);

	// 리소스의 전체 크기를 얻습니다
	int Size = SizeofResource(hInst, resInfo);

	// HGLOBAL 타입의 메모리를 할당하여 리소스 데이터를 복사합니다
	HGLOBAL hGlobal = ::GlobalAlloc(GMEM_MOVEABLE, Size);
	LPVOID pvData = ::GlobalLock(hGlobal);
	CopyMemory(pvData, lpRes, Size);
	Create(hGlobal);
	::GlobalUnlock(hGlobal);
	::GlobalFree(hGlobal);

	return true;
}

bool Canvas::Create(HINSTANCE hInst, LPCTSTR lpBitmapName) {
	HDC MemDC = CreateCompatibleDC(NULL);
	HBITMAP MyBitmap = LoadBitmap(hInst, lpBitmapName);
	HBITMAP OldBitmap = (HBITMAP)SelectObject(MemDC, MyBitmap);

	BITMAP bm;
	GetObject(MyBitmap, sizeof(BITMAP), (LPSTR)&bm);

	Create(bm.bmWidth, bm.bmHeight);

	::BitBlt(m_hDC, 0, 0, bm.bmWidth, bm.bmHeight, MemDC, 0, 0, SRCCOPY);

	SelectObject(MemDC, OldBitmap);
	DeleteObject(MyBitmap);
	DeleteDC(MemDC);

	return true;
}

bool Canvas::LoadIcon(HINSTANCE hInst, UINT nIcon) {
	return LoadIcon(hInst, MAKEINTRESOURCE(nIcon));
}

bool Canvas::LoadIcon(HINSTANCE hInst, LPCTSTR lpIconName) {
	// LoadIcon creates a shared icon. DestroyIcon should not be called for shared icon.
	HICON hIcon = ::LoadIcon(hInst, lpIconName);
	return LoadIcon(hIcon);
}

bool Canvas::LoadIcon(HICON hIcon) {
	ASSERT(hIcon);

	HDC memDC = CreateCompatibleDC(m_hDC);
	ASSERT(memDC);

	ICONINFO info;
	VERIFY(GetIconInfo(hIcon, &info));

	BITMAP bmp;
	GetObject(info.hbmColor, sizeof(bmp), &bmp);
	HBITMAP hBitmap = (HBITMAP)::CopyImage(info.hbmColor, IMAGE_BITMAP, 0, 0, 0);
	ASSERT(hBitmap);
	HBITMAP hOldBmp = (HBITMAP)::SelectObject(memDC, hBitmap);
	Create(bmp.bmWidth, bmp.bmHeight);
	::BitBlt(m_hDC, 0, 0, bmp.bmWidth, bmp.bmHeight, memDC, 0, 0, SRCCOPY);
	::SelectObject(memDC, hOldBmp);

	DeleteObject(info.hbmColor);
	DeleteObject(info.hbmMask);
	DeleteDC(memDC);

	return true;
}

bool Canvas::Create(HWND hwnd) {
	WINDOWPLACEMENT oldwp;
	GetWindowPlacement(hwnd, &oldwp);
	bool bmin = (oldwp.showCmd & SW_SHOWMINIMIZED) != NULL; // 트레이에 들어가있거나 최소화이면 true
	BOOL bshown = IsWindowVisible(hwnd); // 트레이에 들어가있으면 false, 일반 최소화이면 true
	bool bPrevAnimation;
	LONG oldstyle;
	if (bmin) {
		// Inquire animation flag
		ANIMATIONINFO anim;
		anim.cbSize = sizeof(ANIMATIONINFO);
		SystemParametersInfo(SPI_GETANIMATION, 0, &anim, 0);
		bPrevAnimation = (anim.iMinAnimate != 0);

		// Disable animation
		anim.iMinAnimate = FALSE;
		SystemParametersInfo(SPI_SETANIMATION, 0, &anim, 0);

		CRect rw = oldwp.rcNormalPosition;
		int width = rw.Width();
		int height = rw.Height();

		// get window style
		if (!bshown) {
			auto style = oldstyle = GetWindowLong(hwnd, GWL_EXSTYLE);
			style |= WS_EX_TOOLWINDOW;
			style &= ~WS_EX_APPWINDOW;
			SetWindowLong(hwnd, GWL_EXSTYLE, style);
		}

		// 새 위치로 이동
		WINDOWPLACEMENT wp = oldwp;
		wp.rcNormalPosition.left = -width;
		wp.rcNormalPosition.top = -height;
		wp.rcNormalPosition.right = 0;
		wp.rcNormalPosition.bottom = 0;
		SetWindowPlacement(hwnd, &wp);
		SetWindowPos(hwnd, NULL, -width, -height, 0, 0, SWP_NOZORDER | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOREDRAW | (bshown ? 0 : SWP_HIDEWINDOW));
		ShowWindow(hwnd, SW_SHOWNOACTIVATE);
	}

	CRect rw; GetWindowRect(hwnd, rw);
	Create(rw.Width(), rw.Height());
	PrintWindow(hwnd, m_hDC, NULL);

	if (bmin) {
		SetWindowPlacement(hwnd, &oldwp);

		if (!bshown) {
			ShowWindow(hwnd, SW_MINIMIZE);
			ShowWindow(hwnd, SW_HIDE);
			SetWindowLong(hwnd, GWL_EXSTYLE, oldstyle);
		} else ShowWindow(hwnd, oldwp.showCmd);

		// Set back previous animation
		ANIMATIONINFO anim;
		anim.cbSize = sizeof(ANIMATIONINFO);
		anim.iMinAnimate = bPrevAnimation;
		SystemParametersInfo(SPI_SETANIMATION, 0, &anim, 0);
	}

	return true;
}

Canvas::Canvas(HWND hwnd) {
	Create(hwnd);
}

