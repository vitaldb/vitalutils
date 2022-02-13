#include <stdio.h>
#include <stdlib.h>  // exit()
#include <stdio.h>
#include <assert.h>
#include <zlib.h>
#include <string>
#include <vector>
#include <map>
#include <set>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h> 
#include "GZReader.h"
#include "Util.h"
#include <queue>
#include <complex>
using namespace std;

template<typename T>
class MA {
public:
	MA(size_t size = 5000) : m_size(size), m_sum(0) {
	}
	void SetSize(size_t size) {
		while (m_vals.size() >= m_size) {
			auto removed = m_vals.front();
			m_vals.pop();
			m_sum -= removed;
		}
		m_size = size;
	}
	void clear() {
		m_sum = 0;
		m_vals = {};
	}
	void Push(T v) {
		if (m_vals.size() == m_size) {
			auto removed = m_vals.front();
			m_vals.pop();
			m_sum -= removed;
		}
		m_vals.push(v);
		m_sum += v;
	}
	T Get() const {
		return (T)(m_sum / m_vals.size());
	}
protected:
	queue<T> m_vals;
	size_t m_size;
	double m_sum;
};

#define PI 3.14159265358979

static vector<double> ComputeLP(int FilterOrder) {
	vector<double> NumCoeffs(FilterOrder + 1);
	NumCoeffs[0] = 1;
	NumCoeffs[1] = FilterOrder;
	int m = FilterOrder / 2;
	for (int i = 2; i <= m; ++i) {
		NumCoeffs[i] = (double)(FilterOrder - i + 1) * NumCoeffs[i - 1] / i;
		NumCoeffs[FilterOrder - i] = NumCoeffs[i];
	}
	NumCoeffs[FilterOrder - 1] = FilterOrder;
	NumCoeffs[FilterOrder] = 1;

	return NumCoeffs;
}

static vector<double> ComputeHP(int FilterOrder) {
	auto NumCoeffs = ComputeLP(FilterOrder);
	for (int i = 0; i <= FilterOrder; ++i)
		if (i % 2) NumCoeffs[i] = -NumCoeffs[i];
	return NumCoeffs;
}

static vector<double> TrinomialMultiply(int FilterOrder, const vector<double>& b, const vector<double>& c) {
	vector<double> RetVal(4 * FilterOrder);
	RetVal[2] = c[0];
	RetVal[3] = c[1];
	RetVal[0] = b[0];
	RetVal[1] = b[1];
	for (int i = 1; i < FilterOrder; ++i) {
		RetVal[2 * (2 * i + 1)] += c[2 * i] * RetVal[2 * (2 * i - 1)] - c[2 * i + 1] * RetVal[2 * (2 * i - 1) + 1];
		RetVal[2 * (2 * i + 1) + 1] += c[2 * i] * RetVal[2 * (2 * i - 1) + 1] + c[2 * i + 1] * RetVal[2 * (2 * i - 1)];
		for (int j = 2 * i; j > 1; --j) {
			RetVal[2 * j] += b[2 * i] * RetVal[2 * (j - 1)] - b[2 * i + 1] * RetVal[2 * (j - 1) + 1] +
				c[2 * i] * RetVal[2 * (j - 2)] - c[2 * i + 1] * RetVal[2 * (j - 2) + 1];
			RetVal[2 * j + 1] += b[2 * i] * RetVal[2 * (j - 1) + 1] + b[2 * i + 1] * RetVal[2 * (j - 1)] +
				c[2 * i] * RetVal[2 * (j - 2) + 1] + c[2 * i + 1] * RetVal[2 * (j - 2)];
		}
		RetVal[2] += b[2 * i] * RetVal[0] - b[2 * i + 1] * RetVal[1] + c[2 * i];
		RetVal[3] += b[2 * i] * RetVal[1] + b[2 * i + 1] * RetVal[0] + c[2 * i + 1];
		RetVal[0] += b[2 * i];
		RetVal[1] += b[2 * i + 1];
	}

	return RetVal;
}

static vector<double> ComputeDenCoeffs(int FilterOrder, double Lcutoff, double Ucutoff) {
	int k;            // loop variables
	double theta;     // PI * (Ucutoff - Lcutoff) / 2.0
	double cp;        // cosine of phi
	double st;        // sine of theta
	double ct;        // cosine of theta
	double s2t;       // sine of 2*theta
	double c2t;       // cosine 0f 2*theta
	double PoleAngle;      // pole angle
	double SinPoleAngle;     // sine of pole angle
	double CosPoleAngle;     // cosine of pole angle
	double a;         // workspace variables

	cp = cos(PI * (Ucutoff + Lcutoff) / 2.0);
	theta = PI * (Ucutoff - Lcutoff) / 2.0;
	st = sin(theta);
	ct = cos(theta);
	s2t = 2.0 * st * ct;        // sine of 2*theta
	c2t = 2.0 * ct * ct - 1.0;  // cosine of 2*theta

	vector<double> RCoeffs(2 * FilterOrder);
	vector<double> TCoeffs(2 * FilterOrder);

	for (k = 0; k < FilterOrder; ++k) {
		PoleAngle = PI * (double)(2 * k + 1) / (double)(2 * FilterOrder);
		SinPoleAngle = sin(PoleAngle);
		CosPoleAngle = cos(PoleAngle);
		a = 1.0 + s2t * SinPoleAngle;
		RCoeffs[2 * k] = c2t / a;
		RCoeffs[2 * k + 1] = s2t * CosPoleAngle / a;
		TCoeffs[2 * k] = -2.0 * cp * (ct + st * SinPoleAngle) / a;
		TCoeffs[2 * k + 1] = -2.0 * cp * st * CosPoleAngle / a;
	}

	auto DenomCoeffs = TrinomialMultiply(FilterOrder, TCoeffs, RCoeffs);

	DenomCoeffs[1] = DenomCoeffs[0];
	DenomCoeffs[0] = 1.0;
	for (k = 3; k <= 2 * FilterOrder; ++k)
		DenomCoeffs[k] = DenomCoeffs[2 * k - 2];
	DenomCoeffs.resize(2 * FilterOrder + 1);

	return DenomCoeffs;
}

vector<double> ComputeNumCoeffs(int FilterOrder, double Lcutoff, double Ucutoff, const vector<double>& DenC) {
	double Numbers[11] = { 0,1,2,3,4,5,6,7,8,9,10 };
	int i;

	vector<double> NumCoeffs(2 * FilterOrder + 1);

	vector<std::complex<double>> NormalizedKernel(2 * FilterOrder + 1);

	auto TCoeffs = ComputeHP(FilterOrder);

	for (i = 0; i < FilterOrder; ++i) {
		NumCoeffs[2 * i] = TCoeffs[i];
		NumCoeffs[2 * i + 1] = 0.0;
	}
	NumCoeffs[2 * FilterOrder] = TCoeffs[FilterOrder];
	double cp[] = {
		2 * 2.0 * tan(PI * Lcutoff / 2.0),
		2 * 2.0 * tan(PI * Ucutoff / 2.0)
	};

	//	double Bw = cp[1] - cp[0];

		//center frequency 
	double Wn = sqrt(cp[0] * cp[1]);
	Wn = 2 * atan2(Wn, 4);
	const std::complex<double> result = std::complex<double>(-1, 0);

	for (int k = 0; k < 11; k++) {
		NormalizedKernel[k] = std::exp(-sqrt(result) * Wn * Numbers[k]);
	}

	double b = 0;
	double den = 0;
	for (int d = 0; d < 11; d++) {
		b += (NormalizedKernel[d] * NumCoeffs[d]).real();
		den += (NormalizedKernel[d] * DenC[d]).real();
	}
	for (int c = 0; c < 11; c++) {
		NumCoeffs[c] = (NumCoeffs[c] * den) / b;
	}

	return NumCoeffs;
}

// hf, lf (in hz)
void butter_bandpass(int order, double lf, double hf, double srate, vector<double>& a, vector<double>& b) {
	double nrate = srate / 2.0; // nyquist
	lf /= nrate;
	hf /= nrate;
	a = ComputeDenCoeffs(order, lf, hf);
	b = ComputeNumCoeffs(order, lf, hf, a);
}

// x : input
// z : final phase (input,output)
vector<double> filter(const vector<double>& a, const vector<double>& b, const vector<double>& x, vector<double>& z) {
	if (z.size() == 0) z.resize(a.size()); // 0으로 초기화
	vector<double> y(x.size());
	unsigned int i = 0;
	for (const auto& xi : x) {
		double yi = b[0] * xi + z[0];           // Filtered value 
		for (unsigned int j = 1; j < a.size(); j++) {    // Update conditions 
			z[j - 1] = b[j] * xi + z[j] - a[j] * yi;
		}
		y[i++] = yi;                      // write to output 
	}
	return y;
}

vector<float> filter_int(const vector<double>& a, const vector<double>& b, const vector<short>& x, vector<double>& z) {
	if (z.size() == 0) z.resize(a.size()); // 0으로 초기화
	vector<float> y(x.size()); // 리턴
	unsigned int i = 0;
	for (const auto& xi : x) {
		double yi = b[0] * xi + z[0]; // Filtered value 
		for (unsigned int j = 1; j < a.size(); j++) { // Update conditions 
			z[j - 1] = b[j] * xi + z[j] - a[j] * yi;
		}
		y[i++] = (float)(yi); // write to output
	}
	return y;
}

int main(int argc, char* argv[]) {
	if (argc < 3) {
		fprintf(stderr, "Fix SKNA tracks.\n\n\
Usage : %s INPUT_PATH OUTPUT_PATH\n\n\
INPUT_PATH: vital file path\n\
OUTPUT_DIR: output file path\n", basename(argv[0]).c_str());
		return -1;
	}
	argc--; argv++;

	////////////////////////////////////////////////////////////
	// parse dname/tname
	////////////////////////////////////////////////////////////
	GZWriter fw(argv[1]); // 쓰기 파일을 연다.
	GZReader fr(argv[0]); // 읽을 파일을 연다.
	if (!fr.opened() || !fw.opened()) {
		fprintf(stderr, "file open error\n");
		return -1;
	}

	// header
	BUF header(10);

	char sign[4];
	if (!fr.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	memcpy(&header[0], sign, 4);

	char ver[4];
	if (!fr.read(ver, 4)) return -1; // version
	memcpy(&header[4], ver, 4);

	unsigned short headerlen; // header length
	if (!fr.read(&headerlen, 2)) return -1;
	memcpy(&header[8], &headerlen, 2);

	header.resize(10 + headerlen);
	if (!fr.read(&header[10], headerlen)) return -1;

	fw.write(&header[0], header.size());

	map<unsigned long, string> did_dname;
	map<unsigned long, BUF> did_di;
	map<unsigned short, string> tid_tname;
	map<unsigned short, BUF> tid_ti;
	map<unsigned short, unsigned long> tid_did;
	map<unsigned short, BUF> tid_recs;

	// 한번 읽으면서 파일 시작, 종료 시각만 구함
	double dtstart = DBL_MAX;
	double dtend = 0;

	short ch_last[2] = { 0, };
	unsigned short tid_ch[2] = { 0, };
	unsigned short tid_skna[2] = { 0, };
	unsigned short tid_iskna[2] = { 0, };
	unsigned short tid_askna[2] = { 0, };

	// 필터링 된 신호
	vector<double> m_z[2];
	vector<double> m_a; // 계수
	vector<double> m_b;
	MA<double> m_iskna[2]; // 100 ms = 400 samples
	MA<double> m_askna[2]; // 10 sec = 40000 samples
	MA<short> m_ma_baseline[2];
	butter_bandpass(5, 500, 1000, 4000, m_a, m_b);
	for (int ch = 0; ch < 2; ch++) {
		m_ma_baseline[ch].SetSize(4000);
		m_iskna[ch].SetSize(400); // 0.1초마다
		m_askna[ch].SetSize(40000); // 10초평균
	}
	int cnt_max = 32767;
	int cnt_min = -32767;
	double volt_max = 2420 / 12.0;
	double volt_min = -2420 / 12.0;
	double m_gain = (volt_max - volt_min) / (cnt_max - cnt_min);
	double m_askna_dt = 0;

	// 한 번에 읽으면서 devinfo, trkinfo 만 다 쓴다
	while (!fr.eof()) { // body는 패킷의 연속이다.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if (packet_len > 1000000) break; // 1MB 이상의 패킷은 버림
		if (packet_type == 1) {
			fr.skip(packet_len);
			continue; // rec
		}

		BUF packet_header(5);
		packet_header[0] = packet_type;
		memcpy(&packet_header[1], &packet_len, 4);

		// 일괄로 복사해야하므로 일괄로 읽을 수 밖에 없음
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;
		if (packet_type == 9) { // devinfo
			unsigned long did = 0; if (!buf.fetch(did)) continue;
			string dtype; if (!buf.fetch_with_len(dtype)) continue;
			string dname; if (!buf.fetch_with_len(dname)) continue;
			if (dname.empty()) dname = dtype;
			did_dname[did] = dname;
		}
		else if (packet_type == 0) { // trkinfo
			unsigned short tid; if (!buf.fetch(tid)) continue;
			buf.skip(2);
			string tname; if (!buf.fetch_with_len(tname)) continue;
			if (tname == "CH1") {
				tid_ch[0] = tid;
			}
			else if (tname == "CH1_SKNA") {
				tid_skna[0] = tid;
			}
			else if (tname == "CH1_ISKNA") {
				tid_iskna[0] = tid;
			}
			else if (tname == "CH1_ASKNA") {
				tid_askna[0] = tid;
			}
			else if (tname == "CH2") {
				tid_ch[1] = tid;
			}
			else if (tname == "CH2_SKNA") {
				tid_skna[1] = tid;
			}
			else if (tname == "CH2_ISKNA") {
				tid_iskna[1] = tid;
			}
			else if (tname == "CH2_ASKNA") {
				tid_askna[1] = tid;
			}
		}

		// 그 외 패킷
		fw.write(&packet_header[0], packet_header.size());
		fw.write(&buf[0], buf.size());
	}

	fr.rewind(); // 되 감음
	if (!fr.skip(10 + headerlen)) return -1; // 헤더를 건너뜀

	// rec 읽으면서 쓴다.
	while (!fr.eof()) { // body는 패킷의 연속이다.
		unsigned char packet_type; if (!fr.read(&packet_type, 1)) break;
		unsigned long packet_len; if (!fr.read(&packet_len, 4)) break;
		if(packet_len > 1000000) break; // 1MB 이상의 패킷은 버림
		if (packet_type != 1) {
			fr.skip(packet_len);
			continue; // rec
		}

		BUF packet_header(5);
		packet_header[0] = packet_type;
		memcpy(&packet_header[1], &packet_len, 4);
		
		// 일괄로 복사해야하므로 일괄로 읽을 수 밖에 없음
		BUF buf(packet_len);
		if (!fr.read(&buf[0], packet_len)) break;

		buf.skip(2);
		double dt; if (!buf.fetch(dt)) continue;
		unsigned short tid; if (!buf.fetch(tid)) continue;

		int ch = -1;
		if (tid == tid_skna[0]) continue;
		else if (tid == tid_skna[1]) continue;
		else if (tid == tid_iskna[0]) continue;
		else if (tid == tid_iskna[1]) continue;
		else if (tid == tid_askna[0]) continue;
		else if (tid == tid_askna[1]) continue;
		else if (tid == tid_ch[0]) { // 마지막 값을 첫값과 같게 함
			ch = 0;
		} else if (tid == tid_ch[1]) {
			ch = 1;
		}
		if (ch != -1) {
			unsigned long nsamp; if (!buf.fetch(nsamp)) continue;
			if (!nsamp) continue;
			
			vector<short> vals(nsamp);
			if (!buf.fetch(&vals[0], 2 * nsamp)) continue;

			// 마지막 값을 기준으로 이동
			short shift = ch_last[ch] - vals[0];
			//printf("%d\n", shift);
			// 다음번을 위해 마지막 값을 남김
			ch_last[ch] = vals[nsamp - 1] + shift;
			for (auto& v : vals) {
				//printf("   %d -> %d\n", v, v + shift);
				v += shift;
			}

			// 다 이어붙인 다음에 moving average를 적용
			for (auto& v : vals) {
				m_ma_baseline[ch].Push(v);
				v -= m_ma_baseline[ch].Get();
			}

			// raw 데이터를 저장
			unsigned short infolen = 10;
			fw.write(&packet_header[0], packet_header.size());
			fw.write(infolen);
			fw.write(dt);
			fw.write(tid);
			fw.write(nsamp);
			fw.write(&vals[0], 2 * nsamp);

			// 필터링
			auto filtered = filter_int(m_a, m_b, vals, m_z[ch]);
			vector<float> iskna; // skna wave를 위한 샘플들
			int i = 0;
			for (auto& v : filtered) {
				v = (float)(v * m_gain); // 필터링 결과(short)를 float로 바꿈
				auto av = fabs(v); // 절대값을 취함
				// skna를 구함
				m_iskna[ch].Push(av);
				m_askna[ch].Push(av);
				if ((i++) % 40 == 0) {// 4000 Hz -> 100 Hz
					iskna.push_back((float)m_iskna[ch].Get() * 1000.0f); // mv를 uv로 바꿈
				}
			}

			// filtered 데이터를 저장
			if (tid_skna[ch]) {
				nsamp = filtered.size();
				packet_type = 1;
				packet_len = 12 + 4 + nsamp;
				fw.write(packet_type);
				fw.write(packet_len);
				fw.write(infolen);
				fw.write(dt);
				fw.write(tid_skna[ch]);
				fw.write(nsamp);
				for (auto& v : filtered) {
					float val = v * m_gain * 1000; // cnt -> mv -> uv
					val = val * 127 + 0.5f; // 필터링 결과(short)를 float로 바꿈
					char c = 0;
					if (val <= CHAR_MIN) c = CHAR_MIN;
					else if (val >= CHAR_MAX) c = CHAR_MAX;
					else c = static_cast<char>(val);
					fw.write(c);
				}
			}

			// iskna 데이터를 저장
			if (tid_iskna[ch]) {
				nsamp = iskna.size();
				packet_type = 1;
				packet_len = 12 + 4 + 4 * nsamp;
				fw.write(packet_type);
				fw.write(packet_len);
				fw.write(infolen);
				fw.write(dt);
				fw.write(tid_iskna[ch]);
				fw.write(nsamp);
				fw.write(&iskna[0], 4 * nsamp);
			}

			// askna 데이터를 저장
			if (tid_askna[ch]) {
				packet_type = 1;
				packet_len = 12 + 4;
				float val = (float)m_askna[ch].Get() * 1000.0f;
				fw.write(packet_type);
				fw.write(packet_len);
				fw.write(infolen);
				fw.write(dt);
				fw.write(tid_askna[ch]);
				fw.write(val);
			}
			continue;
		}
		
		// 그 외 패킷
		fw.write(&packet_header[0], packet_header.size());
		fw.write(&buf[0], buf.size());
	}

	return 0;
}