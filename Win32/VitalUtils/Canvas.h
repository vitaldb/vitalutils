#pragma once 
#include <afxwin.h>
#include <math.h>
#include <vector>
using namespace std;

// COLORREF는 BGR로 저장되어있고
// COLOR은 BITMAP 파일에서 사용하는 ARGB 순이다.
// A = 불투명도. 0 = 완전투명, FF = 완전불투명
#define REF2COLOR(x) (COLORAMask|((x>>16)&0x000000FF)|(x&0x0000FF00)|((x<<16)&0xFF0000))
#define COLOR2REF(x) (((x>>16)&0x000000FF)|(x&0x0000FF00)|((x<<16)&0xFF0000))

const DWORD COLORAMask = 0xFF000000UL;
const DWORD COLORRMask = 0x00FF0000UL;
const DWORD COLORGMask = 0x0000FF00UL;
const DWORD COLORBMask = 0x000000FFUL;

#define COLORA(x) (((x) & COLORAMask) >> 24)
#define COLORR(x) (((x) & COLORRMask) >> 16)
#define COLORG(x) (((x) & COLORGMask) >> 8)
#define COLORB(x) (((x) & COLORBMask))

typedef DWORD COLOR;

static inline COLOR COLORRGB(BYTE r, BYTE g, BYTE b) {
	return 0xFF000000 | (((DWORD)r << 16) & COLORRMask) | (((DWORD)g << 8) & COLORGMask) | ((DWORD)b & COLORBMask);
}
static inline COLOR COLORARGB(BYTE a, BYTE r, BYTE g, BYTE b) {
	return (((DWORD)a << 24) & COLORAMask) | (((DWORD)r << 16) & COLORRMask) | (((DWORD)g << 8) & COLORGMask) | ((DWORD)b & COLORBMask);
}

static inline COLOR AddColor(COLOR c1, COLOR c2) {
	SHORT a = COLORA(c1);
	a += COLORA(c2);
	SHORT r = COLORR(c1);
	r += COLORR(c2);
	SHORT g = COLORG(c1);
	g += COLORG(c2);
	SHORT b = COLORB(c1);
	b += COLORB(c2);
	if (r > 255) r = 255;
	if (g > 255) g = 255;
	if (b > 255) b = 255;
	if (a > 255) a = 255;
	return COLORARGB((BYTE)a, (BYTE)r, (BYTE)g, (BYTE)b);
}

#define FILTER_PI  double (3.1415926535897932384626433832795)
#define FILTER_2PI double (2.0 * 3.1415926535897932384626433832795)
#define FILTER_4PI double (4.0 * 3.1415926535897932384626433832795)

extern USHORT alpha_table[256][256];
void init_alpha_table();

// Pic of all the cOLORS: HTTP://WWW.CODEPROJECT.COM/KB/GDI/XHTMLDRAW/XHTMLDRAW4.PNG
const COLOR COLOR_ALICEBLUE(0XFFF0F8FF);
const COLOR COLOR_ANTIQUEWHITE(0XFFFAEBD7);
const COLOR COLOR_AQUA(0XFF00FFFF);
const COLOR COLOR_AQUAMARINE(0XFF7FFFD4);
const COLOR COLOR_AZURE(0XFFF0FFFF);
const COLOR COLOR_BEIGE(0XFFF5F5DC);
const COLOR COLOR_BISQUE(0XFFFFE4C4);
const COLOR COLOR_BLACK(0XFF000000);
const COLOR COLOR_ALMOSTBLACK(0XFF252525); // USEFUL FOR A RENDERER'S CLEAR COLOR COLOR_SO BLACK DOESN'T HIDE UNLIT DRAWS
const COLOR COLOR_BLANCHEDALMOND(0XFFFFEBCD);
const COLOR COLOR_BLUE(0XFF0000FF);
const COLOR COLOR_BLUEVIOLET(0XFF8A2BE2);
const COLOR COLOR_BROWN(0XFFA52A2A);
const COLOR COLOR_BURLYWOOD(0XFFDEB887);
const COLOR COLOR_CADETBLUE(0XFF5F9EA0);
const COLOR COLOR_CHARTREUSE(0XFF7FFF00);
const COLOR COLOR_CHOCOLATE(0XFFD2691E);
const COLOR COLOR_CORAL(0XFFFF7F50);
const COLOR COLOR_CORNFLOWERBLUE(0XFF6495ED);
const COLOR COLOR_CORNSILK(0XFFFFF8DC);
const COLOR COLOR_CRIMSON(0XFFDC143C);
const COLOR COLOR_CYAN(0XFF00FFFF);
const COLOR COLOR_DARKBLUE(0XFF00008B);
const COLOR COLOR_DARKCYAN(0XFF008B8B);
const COLOR COLOR_DARKGOLDENROD(0XFFB8860B);
const COLOR COLOR_DARKGRAY(0XFFA9A9A9);
const COLOR COLOR_DARKGREEN(0XFF006400);
const COLOR COLOR_DARKKHAKI(0XFFBDB76B);
const COLOR COLOR_DARKMAGENTA(0XFF8B008B);
const COLOR COLOR_DARKOLIVEGREEN(0XFF556B2F);
const COLOR COLOR_DARKORANGE(0XFFFF8C00);
const COLOR COLOR_DARKORCHID(0XFF9932CC);
const COLOR COLOR_DARKRED(0XFF8B0000);
const COLOR COLOR_HIGHRED(0XFFED315A);
const COLOR COLOR_DARKSALMON(0XFFE9967A);
const COLOR COLOR_DARKSEAGREEN(0XFF8FBC8F);
const COLOR COLOR_DARKSLATEBLUE(0XFF483D8B);
const COLOR COLOR_DARKSLATEGRAY(0XFF2F4F4F);
const COLOR COLOR_DARKTURQUOISE(0XFF00CED1);
const COLOR COLOR_DARKVIOLET(0XFF9400D3);
const COLOR COLOR_DEEPPINK(0XFFFF1493);
const COLOR COLOR_DEEPSKYBLUE(0XFF00BFFF);
const COLOR COLOR_DIMGRAY(0XFF696969);
const COLOR COLOR_DODGERBLUE(0XFF1E90FF);
const COLOR COLOR_FIREBRICK(0XFFB22222);
const COLOR COLOR_FLORALWHITE(0XFFFFFAF0);
const COLOR COLOR_FORESTGREEN(0XFF228B22);
const COLOR COLOR_FUCHSIA(0XFFFF00FF);
const COLOR COLOR_GAINSBORO(0XFFDCDCDC);
const COLOR COLOR_GHOSTWHITE(0XFFF8F8FF);
const COLOR COLOR_GOLD(0XFFFFD700);
const COLOR COLOR_GOLDENROD(0XFFDAA520);
const COLOR COLOR_GRAY(0XFF808080);
const COLOR COLOR_GREEN(0XFF008000);
const COLOR COLOR_GREENYELLOW(0XFFADFF2F);
const COLOR COLOR_HONEYDEW(0XFFF0FFF0);
const COLOR COLOR_HOTPINK(0XFFFF69B4);
const COLOR COLOR_INDIANRED(0XFFCD5C5C);
const COLOR COLOR_INDIGO(0XFF4B0082);
const COLOR COLOR_IVORY(0XFFFFFFF0);
const COLOR COLOR_KHAKI(0XFFF0E68C);
const COLOR COLOR_LAVENDER(0XFFE6E6FA);
const COLOR COLOR_LAVENDERBLUSH(0XFFFFF0F5);
const COLOR COLOR_LAWNGREEN(0XFF7CFC00);
const COLOR COLOR_LEMONCHIFFON(0XFFFFFACD);
const COLOR COLOR_LIGHTBLUE(0XFFADD8E6);
const COLOR COLOR_LIGHTCORAL(0XFFF08080);
const COLOR COLOR_LIGHTCYAN(0XFFE0FFFF);
const COLOR COLOR_LIGHTGOLDENRODYELLOW(0XFFFAFAD2);
const COLOR COLOR_LIGHTGREY(0XFFD3D3D3);
const COLOR COLOR_LIGHTGREEN(0XFF90EE90);
const COLOR COLOR_LIGHTPINK(0XFFFFB6C1);
const COLOR COLOR_LIGHTSALMON(0XFFFFA07A);
const COLOR COLOR_LIGHTSEAGREEN(0XFF20B2AA);
const COLOR COLOR_LIGHTSKYBLUE(0XFF87CEFA);
const COLOR COLOR_LIGHTSLATEGRAY(0XFF778899);
const COLOR COLOR_LIGHTSTEELBLUE(0XFFB0C4DE);
const COLOR COLOR_LIGHTYELLOW(0XFFFFFFE0);
const COLOR COLOR_LIME(0XFF00FF00);
const COLOR COLOR_LIMEGREEN(0XFF32CD32);
const COLOR COLOR_LINEN(0XFFFAF0E6);
const COLOR COLOR_MAGENTA(0XFFFF00FF);
const COLOR COLOR_MAROON(0XFF800000);
const COLOR COLOR_MEDIUMAQUAMARINE(0XFF66CDAA);
const COLOR COLOR_MEDIUMBLUE(0XFF0000CD);
const COLOR COLOR_MEDIUMORCHID(0XFFBA55D3);
const COLOR COLOR_MEDIUMPURPLE(0XFF9370D8);
const COLOR COLOR_MEDIUMSEAGREEN(0XFF3CB371);
const COLOR COLOR_MEDIUMSLATEBLUE(0XFF7B68EE);
const COLOR COLOR_MEDIUMSPRINGGREEN(0XFF00FA9A);
const COLOR COLOR_MEDIUMTURQUOISE(0XFF48D1CC);
const COLOR COLOR_MEDIUMVIOLETRED(0XFFC71585);
const COLOR COLOR_MIDNIGHTBLUE(0XFF191970);
const COLOR COLOR_MINTCREAM(0XFFF5FFFA);
const COLOR COLOR_MISTYROSE(0XFFFFE4E1);
const COLOR COLOR_MOCCASIN(0XFFFFE4B5);
const COLOR COLOR_NAVAJOWHITE(0XFFFFDEAD);
const COLOR COLOR_NAVY(0XFF000080);
const COLOR COLOR_OLDLACE(0XFFFDF5E6);
const COLOR COLOR_OLIVE(0XFF808000);
const COLOR COLOR_OLIVEDRAB(0XFF6B8E23);
const COLOR COLOR_ORANGE(0XFFFFA500);
const COLOR COLOR_ORANGERED(0XFFFF4500);
const COLOR COLOR_ORCHID(0XFFDA70D6);
const COLOR COLOR_PALEGOLDENROD(0XFFEEE8AA);
const COLOR COLOR_PALEGREEN(0XFF98FB98);
const COLOR COLOR_PALETURQUOISE(0XFFAFEEEE);
const COLOR COLOR_PALEVIOLETRED(0XFFD87093);
const COLOR COLOR_PAPAYAWHIP(0XFFFFEFD5);
const COLOR COLOR_PEACHPUFF(0XFFFFDAB9);
const COLOR COLOR_PERU(0XFFCD853F);
const COLOR COLOR_PINK(0XFFFFC0CB);
const COLOR COLOR_PLUM(0XFFDDA0DD);
const COLOR COLOR_POWDERBLUE(0XFFB0E0E6);
const COLOR COLOR_PURPLE(0XFF800080);
const COLOR COLOR_RED(0XFFFF0000);
const COLOR COLOR_ROSYBROWN(0XFFBC8F8F);
const COLOR COLOR_ROYALBLUE(0XFF4169E1);
const COLOR COLOR_SADDLEBROWN(0XFF8B4513);
const COLOR COLOR_SALMON(0XFFFA8072);
const COLOR COLOR_SANDYBROWN(0XFFF4A460);
const COLOR COLOR_SEAGREEN(0XFF2E8B57);
const COLOR COLOR_SEASHELL(0XFFFFF5EE);
const COLOR COLOR_SIENNA(0XFFA0522D);
const COLOR COLOR_SILVER(0XFFC0C0C0);
const COLOR COLOR_SKYBLUE(0XFF87CEEB);
const COLOR COLOR_SLATEBLUE(0XFF6A5ACD);
const COLOR COLOR_SLATEGRAY(0XFF708090);
const COLOR COLOR_SNOW(0XFFFFFAFA);
const COLOR COLOR_SPRINGGREEN(0XFF00FF7F);
const COLOR COLOR_STEELBLUE(0XFF4682B4);
const COLOR COLOR_TAN(0XFFD2B48C);
const COLOR COLOR_TEAL(0XFF008080);
const COLOR COLOR_THISTLE(0XFFD8BFD8);
const COLOR COLOR_TOMATO(0XFFFF6347);
const COLOR COLOR_TURQUOISE(0XFF40E0D0);
const COLOR COLOR_VIOLET(0XFFEE82EE);
const COLOR COLOR_WHEAT(0XFFF5DEB3);
const COLOR COLOR_WHITE(0XFFFFFFFF);
const COLOR COLOR_WHITESMOKE(0XFFF5F5F5);
const COLOR COLOR_YELLOW(0XFFFFFF00);
const COLOR COLOR_YELLOWGREEN(0XFF9ACD32);
const COLOR COLOR_OOOIIGREEN(0XFF8DC81D);
const COLOR COLOR_MICROSOFTBLUEPEN(0XFFFF3232);
const COLOR COLOR_MICROSOFTBLUEBRUSH(0XFFA08064);
const COLOR COLOR_TANGENTSPACENORMALBLUE(0XFF7F7FFF); // Z-UP
const COLOR COLOR_OBJECTSPACENORMALGREEN(0XFF7FFF7F); // Y-UP

class Canvas {
public:
	Canvas() = default;
	Canvas(int w, int h);
	Canvas(const Canvas& can);
	Canvas(const Canvas& can, int width, int height);
	Canvas(BYTE* pBuf, int w1, int h1, int w2, int h2);

	// create from file or memory
	Canvas(HGLOBAL hdib);
	Canvas(const char* filename);
	Canvas(BYTE* pBuf, int nBuf);

	// alpha : 불투명도
	Canvas(const char* str, COLOR col, CFont& font, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	Canvas(const char* str, COLOR col, HFONT hfont, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	Canvas(const char* str, COLOR col, LOGFONT& lf, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	Canvas(const char* str, COLOR col, const char* face, int size, bool bold = false, bool italic = false, BYTE alpha = 255);

	// by capture
	Canvas(HWND hwnd);

	virtual ~Canvas();

public:
	bool Create(HWND hwnd);
	bool Create(int w, int h);
	bool Create(HGLOBAL hdib);
	bool Create(BYTE* pBuf, int nBuf);
	bool Create(const Canvas& can);

	// create resizing
	bool Create(BYTE* pBuf, int w1, int h1, int w2, int h2);
	bool Create(const Canvas& can, int width, int height);
	bool Create(HINSTANCE hInst, LPCTSTR lpBitmapName);
	bool Create(HINSTANCE hInst, WORD uint);
	bool Create(HINSTANCE hInst, LPCTSTR lpBitmapName, LPCTSTR lpType);
	bool Create(HINSTANCE hInst, WORD uint, LPCTSTR lpType);

	// create loading
	bool Create(const char* filename);

	// alpha : 불투명도
	bool Create(const char* str, COLOR col, HFONT hfont, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	bool Create(const char* str, COLOR col, CFont& font, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	bool Create(const char* str, COLOR col, LOGFONT& lf, BYTE alpha = 255, int padx = 0, int pady = 0);

	// alpha : 불투명도
	bool Create(const char* str, COLOR col, const char* face, int size, bool bold = false, bool italic = false, BYTE alpha = 255);

	bool LoadTGA(const char *name);
	bool LoadIcon(HICON hIcon);
	bool LoadIcon(HINSTANCE hInst, LPCTSTR lpIconName);
	bool LoadIcon(HINSTANCE hInst, UINT nIcon);
	void Destroy();
	void SaveRaw(FILE* f) const {
		fwrite(&m_nWidth, sizeof(int), 1, f);
		fwrite(&m_nHeight, sizeof(int), 1, f);
		if (m_nWidth && m_nHeight)
			fwrite(m_pPixels, 4, m_nWidth * m_nHeight, f);
	}
	void ReadRaw(FILE* f) {
		int width, height;
		fread(&width, sizeof(int), 1, f);
		fread(&height, sizeof(int), 1, f);
		Create(width, height);
		if (width && height)
			fread(m_pPixels, 4, width * height, f);
	}

public:
	// alpha : 불투명도
	void DrawRect(int X1, int Y1, int X2, int Y2, COLOR Col, BYTE alpha) {
		if (X1 > X2) { int temp = X2; X2 = X1; X1 = temp; }
		if (Y1 > Y2) { int temp = Y2; Y2 = Y1; Y1 = temp; }

		// 세로선
		DrawLine(X1, Y1, X1, Y2, Col, alpha);
		DrawLine(X2, Y1, X2, Y2, Col, alpha);

		// 가로선
		DrawLine(X1, Y1, X2, Y1, Col, alpha);
		DrawLine(X1, Y2, X2, Y2, Col, alpha);
	}

	void DrawRect(int X1, int Y1, int X2, int Y2, COLOR Col) {
		if (X1 > X2) { int temp = X2; X2 = X1; X1 = temp; }
		if (Y1 > Y2) { int temp = Y2; Y2 = Y1; Y1 = temp; }

		// 세로선
		DrawLine(X1, Y1, X1, Y2, Col);
		DrawLine(X2, Y1, X2, Y2, Col);

		// 가로선
		DrawLine(X1, Y1, X2, Y1, Col);
		DrawLine(X1, Y2, X2, Y2, Col);
	}

	void DrawRect(LPRECT lpRect, COLOR col) {
		if (lpRect) DrawRect(lpRect->left, lpRect->top, lpRect->right, lpRect->bottom, col);
	}

	// alpha : 불투명도
	void DrawRect(LPRECT lpRect, COLOR col, BYTE alpha) {
		if (lpRect) DrawRect(lpRect->left, lpRect->top, lpRect->right, lpRect->bottom, col, alpha);
	}

	void Rect(int left, int top, int right, int bottom, COLOR bcol, COLOR pcol) {
		HBRUSH hbrush = CreateSolidBrush(COLOR2REF(bcol));
		HBRUSH oldbrush = (HBRUSH)SelectObject(m_hDC, hbrush);
		HPEN hpen = CreatePen(PS_SOLID, 0, COLOR2REF(pcol));
		HPEN oldpen = (HPEN)SelectObject(m_hDC, hpen);
		::Rectangle(m_hDC, left, top, right, bottom);
		SelectObject(m_hDC, oldpen);
		DeleteObject(hpen);
		SelectObject(m_hDC, oldbrush);
		DeleteObject(hbrush);
	}

	void Rect(const CRect& rc, COLOR bcol, COLOR pcol) {
		Rect(rc.left, rc.top, rc.right, rc.bottom, bcol, pcol);
	}

	void FillRect(LPRECT lpRect, COLOR col, BYTE alpha);
	void FillRect(int X1, int Y1, int X2, int Y2, COLOR Col, BYTE alpha);
	void FillRect(const CRect& rc, COLOR bcol) {
		HBRUSH hBrush = CreateSolidBrush(COLOR2REF(bcol));
		::FillRect(m_hDC, rc, hBrush);
		DeleteObject(hBrush);
	}
	void FillEllipse(const CRect& rc, COLOR bcol) {
		CRgn rgn;
		rgn.CreateEllipticRgn(rc.left, rc.top, rc.right, rc.bottom);

		HBRUSH hbrushbg = CreateSolidBrush(COLOR2REF(bcol));
		//		HBRUSH hbrushfg = CreateSolidBrush(COLOR2REF(fgclr));

		::FillRgn(m_hDC, rgn, hbrushbg);
		//		::FrameRgn(m_hDC, rgn, hbrushfg, 1, 1);   //draws a border around the specified region by using the specified brush. 

		DeleteObject(hbrushbg);
		//		DeleteObject(hbrushfg);
	}
	void FillRect(int left, int top, int right, int bottom, COLOR bcol) {
		CRect rc(left, top, right, bottom);
		FillRect(rc, bcol);
	}

	void RoundRect(CRect rect, int cornersize, COLOR fgclr, COLOR bgclr) {
		CRgn rgn;
		rgn.CreateRoundRectRgn(rect.left, rect.top, rect.right, rect.bottom, cornersize, cornersize);

		HBRUSH hbrushbg = CreateSolidBrush(COLOR2REF(bgclr));
		HBRUSH hbrushfg = CreateSolidBrush(COLOR2REF(fgclr));

		::FillRgn(m_hDC, rgn, hbrushbg);
		::FrameRgn(m_hDC, rgn, hbrushfg, 1, 1);   //draws a border around the specified region by using the specified brush. 

		DeleteObject(hbrushbg);
		DeleteObject(hbrushfg);
	}

	void FillRoundRect(CRect rect, int cornersize, COLOR bgclr) {
		CRgn rgn;
		rgn.CreateRoundRectRgn(rect.left, rect.top, rect.right, rect.bottom, cornersize, cornersize);
		HBRUSH hbrushbg = CreateSolidBrush(COLOR2REF(bgclr));
		::FillRgn(m_hDC, rgn, hbrushbg);
		DeleteObject(hbrushbg);
	}

	void DrawLine(int x0, int y0, int x1, int y1, COLOR col);
	void DrawLine(int X1, int Y1, int X2, int Y2, COLOR Col, BYTE alpha);
	void Fill(COLOR col);
	void FillAlpha(DWORD alpha);
	void SetTextColor(COLOR col) { ::SetTextColor(m_hDC, col); }
	void TextOut(int x, int y, COLOR col, LPCTSTR pString);
	void DrawText(LPCTSTR pString, COLOR col, LPRECT pRect, UINT uFormat = 0);
	HDC GetHDC() { return m_hDC; }
	DWORD GetBufferLength() const { return m_nWidth * m_nHeight * sizeof(COLOR); }
	void RoundBitBlt(HDC hdc, int round, int x = 0, int y = 0);
	void BitBlt(HDC hDest, int x = 0, int y = 0);
	void BitBlt(HDC hDest, const RECT &rc, int sx = 0, int sy = 0);
	void BitBltTrans(HDC hDest, int left = 0, int top = 0);
	void BitBltTrans(HDC hDest, int left, int top, COLOR clr_trans);
	void StretchBlt(HDC hDest, const RECT& rc, int sx, int sy, int sw, int sh);
	void StretchBlt(HDC hDest, const RECT &rc);
	inline void SetPixel(unsigned int x, unsigned int y, COLOR col) {
		// 밖으로 빠져나가는 경우
		if (x >= m_nWidth) return;
		if (y >= m_nHeight) return;

		// 정상적인 경우
		if (m_pData) m_pData[y][x] = col;
		else m_pPixels[y * m_nWidth + x] = col;
	}

	// 밖으로 빠져나가는지 체크
	inline void SetPixel(unsigned int x, unsigned int y, COLOR col, BYTE alpha) {
		// 밖으로 빠져나가는 경우
		if (x >= m_nWidth) return;
		if (y >= m_nHeight) return;

		// 정상적인 경우
		COLOR& dst = m_pData[y][x];
		COLOR& src = col;
		BYTE ialpha = 255 - alpha;
		m_pData[y][x] = COLORRGB(
			(alpha_table[(src & COLORRMask) >> 16][alpha] + alpha_table[(dst & COLORRMask) >> 16][ialpha]) >> 8,
			(alpha_table[(src & COLORGMask) >> 8][alpha] + alpha_table[(dst & COLORGMask) >> 8][ialpha]) >> 8,
			(alpha_table[(src & COLORBMask)][alpha] + alpha_table[(dst & COLORBMask)][ialpha]) >> 8
			);
	}

	// 밖으로 빠져나가는지를 체크함
	COLOR GetPixel(unsigned int x, unsigned int y) const {
		if (m_nWidth == 0) return 0;
		if (m_nHeight == 0) return 0;

		// 밖으로 빠져나가는 경우에는 마지막 픽셀을 리턴
		if (x < 0) {
			if (y < 0) return m_pData[0][0];
			else if (y < m_nHeight) return m_pData[y][0];
			else return m_pData[m_nHeight - 1][0];
		} else if (x < m_nWidth) {
			if (y < 0) return m_pData[0][x];
			else if (y < m_nHeight) return m_pData[y][x];
			else return m_pData[m_nHeight - 1][x];
		} else {
			if (y < 0) return m_pData[0][m_nWidth - 1];
			else if (y < m_nHeight) return m_pData[y][m_nWidth - 1];
			else return m_pData[m_nWidth - 1][m_nWidth - 1];
		}
		return 0;
	}

	static inline COLOR BlendColor(float f1, COLOR c1, float f2, COLOR c2, float f3, COLOR c3, float f4, COLOR c4) {
		float a = f1*COLORA(c1) + f2*COLORA(c2) + f3*COLORA(c3) + f4*COLORA(c4);
		if (a < 0) a = 0; if (a > 255) a = 255;
		float r = f1*COLORR(c1) + f2*COLORR(c2) + f3*COLORR(c3) + f4*COLORR(c4);
		if (r < 0) r = 0; if (r > 255) r = 255;
		float g = f1*COLORG(c1) + f2*COLORG(c2) + f3*COLORG(c3) + f4*COLORG(c4);
		if (g < 0) g = 0; if (g > 255) g = 255;
		float b = f1*COLORB(c1) + f2*COLORB(c2) + f3*COLORB(c3) + f4*COLORB(c4);
		if (b < 0) b = 0; if (b > 255) b = 255;
		return COLORARGB((BYTE)a, (BYTE)r, (BYTE)g, (BYTE)b);
	}

	COLOR GetPixel(double x, double y, bool round) const {
		// 위치에 따라 인접 4개 픽셀의 평균을 구한다.
		COLOR b = 0;
		int ix = (int)floor(x);
		int iy = (int)floor(y);

		// 소수 부분이 0.5보다 큰가 작은가가 중요하다.
		// 그것을 구하기 위해 0.5를 더한 후 1보다 큰가 작은가를 비교한다.
		float fx = (float)(x - ix) + 0.5f;
		float fy = (float)(y - iy) + 0.5f;

		COLOR* pl = GetLine((iy - 1 + GetHeight()) % GetHeight());
		COLOR* l = GetLine(iy);
		COLOR* nl = GetLine((iy + 1) % GetHeight());

		int px = (ix - 1 + GetWidth()) % GetWidth();
		int nx = (ix + 1) % GetWidth();

		if (fx < 1) {
			if (fy < 1) return BlendColor((fx)* (fy), l[ix],
				(1 - fx) * (fy), l[px],
				(fx)* (1 - fy), pl[ix],
				(1 - fx) * (1 - fy), pl[px]);
			else if (fy >= 1) return BlendColor((+fx) * (2 - fy), l[ix],
				(1 - fx) * (2 - fy), l[px],
				(+fx) * (fy - 1), nl[ix],
				(1 - fx) * (fy - 1), nl[px]);
		} else if (fx >= 1) {
			if (fy < 1) return BlendColor((2 - fx) * (fy), l[ix],
				(fx - 1) * (fy), l[nx],
				(2 - fx) * (1 - fy), pl[ix],
				(fx - 1) * (1 - fy), pl[nx]);
			else if (fy >= 1) return BlendColor((2 - fx) * (2 - fy), l[ix],
				(fx - 1) * (2 - fy), l[nx],
				(2 - fx) * (fy - 1), nl[ix],
				(fx - 1) * (fy - 1), nl[nx]);
		}
		return 0;
	}

	unsigned int GetWidth() const {
		return m_nWidth;
	}

	unsigned int GetHeight() const {
		return m_nHeight;
	}

	COLOR* GetBuffer() const {
		return m_pPixels;
	}

	COLOR* GetLine(DWORD y) const {
		return m_pData[y];
	}

public:
	HDC m_hDC = NULL;
	HBITMAP m_hBitmap = NULL;
	HBITMAP m_hOldBitmap = NULL;

protected:
	unsigned int m_nWidth = 0;
	unsigned int m_nHeight = 0;

	DWORD* m_pPixels = nullptr;
	DWORD** m_pData = nullptr; // 각 행의 첫번째 열의 주소

protected:
	HDC m_hDCMask = NULL;
	HBITMAP m_hBitmapMask = NULL;
	HBITMAP m_hOldBitmapMask = NULL;

public:
	void GetTextSize(HFONT hfont, LPCTSTR str, CSize& sz);
	void GetTextSize(LPCTSTR str, CSize& sz);

	static void GetTextSize(HDC hdc, LPCTSTR str, int& width, int& height);
	static void GetTextSize(HDC hdc, HFONT hfont, LPCTSTR str, int& width, int& height);
	static void GetTextSize(CFont& font, LPCTSTR str, int& width, int& height);
	static void GetTextSize(HFONT hfont, LPCTSTR str, int& width, int& height);
	static void GetTextSize(LOGFONT& lf, LPCTSTR str, int& width, int& height);
	static void GetTextSize(LPCTSTR face, int size, LPCTSTR str, int& width, int& height);

	bool CreateFromDesktopCapture(void);
	void Blend(Canvas &can1, Canvas &can2, BYTE factor);
	void FlipV(void);
	void Resize(const Canvas& can, int width, int height);
	void Resize(int NewWidth, int NewHeight);
	bool SaveBMP(LPCTSTR lpszFileName) const;
};

