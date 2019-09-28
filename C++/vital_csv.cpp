#include <stdio.h>
#include <stdlib.h>  // exit()
#include <assert.h>
#include "zlib128/zlib.h"
#include <string>
#include <vector>
#include <map>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h>
#include <set> 
#include <iostream>
#include "GZReader.h"
#include "Util.h"
#include <random>

using namespace std;

void print_usage(const char* progname) {
	fprintf(stderr, "Usage : %s INPUT_FILENAME [OUTPUT_FOLDER]\n\n", basename(progname).c_str());
}

/*
trks
- tid, filename, type(n,w,s), trkname

nums
- 숫자값
- tid, dt, val

wavs
- wave 1초 단위로 자름
- tid, dt, val

strs
- 문자열값
- tid, dt, val
*/
int main(int argc, char* argv[]) {
	random_device rd;
	mt19937_64 rnd(rd());

	srand(time(nullptr));

	const char* progname = argv[0];
	argc--; argv++; // 자기 자신의 실행 파일명 제거

	if (argc < 1) { // 최소 1개의 입력 (파일명)은 있어야함
		print_usage(progname);
		return -1;
	}

	// filename은 E1_190601_213110.vital
	// caseid는 E1_190601_213110
	string filename = basename(argv[0]);
	string caseid = filename;
	auto dotpos = caseid.rfind('.'); // remove extension
	if (dotpos != -1) caseid = caseid.substr(0, dotpos);

	string odir = ".";
	if (argc > 1) odir = argv[1];
	
	GZReader gz(argv[0]); // 파일을 열어
	if (!gz.opened()) {
		fprintf(stderr, "file does not exists\n");
		return -1;
	}

	// header
	char sign[4];
	if (!gz.read(sign, 4)) return -1;
	if (strncmp(sign, "VITA", 4) != 0) {
		fprintf(stderr, "file does not seem to be a vital file\n");
		return -1;
	}
	if (!gz.skip(4)) return -1; // version

	unsigned short headerlen; // header length
	if (!gz.read(&headerlen, 2)) return -1;

	short dgmt;
	if (headerlen >= 2) {
		if (!gz.read(&dgmt, sizeof(dgmt))) return -1;
		headerlen -= 2;
	}

	if (!gz.skip(headerlen)) return -1;
	headerlen += 2; // 아래에서 재사용 하기 위해

	// 한 번 훑으면서 트랙 이름, 시작 시간, 종료 시각 구함
	map<unsigned short, double> tid_dtstart; // 트랙의 시작 시간
	map<unsigned short, double> tid_dtend; // 트랙의 종료 시간
	map<unsigned int, string> did_dnames;
	map<unsigned short, unsigned char> tid_rectypes; // 1:wav,2:num,5:str
	map<unsigned short, unsigned char> tid_recfmts;
	map<unsigned short, double> tid_gains;
	map<unsigned short, double> tid_offsets;
	map<unsigned short, double> tid_srates;
	map<unsigned short, string> tid_tnames;
	map<unsigned short, string> tid_dnames;
	set<unsigned short> tids;

	double dtstart = DBL_MAX;
	double dtend = 0;

	unsigned char rectype = 0;
	unsigned int nsamp;
	unsigned char recfmt;
	unsigned int fmtsize;
	double gain;
	double offset;
	unsigned short infolen = 0;
	double dt_rec_start = 0;
	unsigned short tid = 0;

	while (!gz.eof()) { // body는 패킷의 연속이다.
		unsigned char type = 0;
		if (!gz.read(&type, 1)) break;
		unsigned int datalen = 0;
		if (!gz.read(&datalen, 4)) break;
		if (datalen > 1000000) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		if (type == 0) { // trkinfo
			tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet;
			rectype = 0; if (!gz.fetch(rectype, datalen)) goto next_packet;
			//cout << (int)rectype << endl;
			unsigned char recfmt; if (!gz.fetch(recfmt, datalen)) goto next_packet;
			string tname, unit;
			//float minval, maxval, srate;
			float minval, maxval, srate = 0;
			//cout << maxval << endl;
			unsigned int col, did = 0;
			double adc_gain = 1, adc_offset = 0;
			unsigned char montype;
			if (!gz.fetch(tname, datalen)) goto save_and_next_packet; // !SSH Changed from next_packet
			if (!gz.fetch(unit, datalen)) goto save_and_next_packet;
			if (!gz.fetch(minval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(maxval, datalen)) goto save_and_next_packet;
			if (!gz.fetch(col, datalen)) goto save_and_next_packet;
			if (!gz.fetch(srate, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_gain, datalen)) goto save_and_next_packet;
			if (!gz.fetch(adc_offset, datalen)) goto save_and_next_packet;
			if (!gz.fetch(montype, datalen)) goto save_and_next_packet;
			if (!gz.fetch(did, datalen)) goto save_and_next_packet;

		save_and_next_packet:
			string dname = did_dnames[did];
			//cout << did << endl;
			tid_tnames[tid] = tname;
			tid_dnames[tid] = dname;
			tid_rectypes[tid] = rectype;
			//cout << dname << endl;
			//cout << (int)rectype << endl;
			tid_recfmts[tid] = recfmt;
			tid_gains[tid] = adc_gain;
			tid_offsets[tid] = adc_offset;
			tid_srates[tid] = srate;
			tid_dtstart[tid] = DBL_MAX;
			tid_dtend[tid] = 0.0;
		}

		if (type == 9) { // devinfo
			unsigned int did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
			//cout << dname << endl;
		} else if (type == 1) { // rec
			unsigned short infolen = 0; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start = 0; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			unsigned short tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet;

			tids.insert(tid);

			// 트랙 속성을 가져옴
			rectype = tid_rectypes[tid]; // 1:wav,2:num,3:str
			auto srate = tid_srates[tid];
			unsigned int nsamp = 0;
			double dt_rec_end = dt_rec_start; // 해당 레코드 종료 시간
			if (rectype == 1) { // wav
				if (!gz.fetch(nsamp, datalen)) goto next_packet;
				if (srate > 0) dt_rec_end += nsamp / srate;
			}

			// 시작 시간, 종료 시간을 업데이트
			if (tid_dtstart[tid] > dt_rec_start) tid_dtstart[tid] = dt_rec_start;
			if (tid_dtend[tid] < dt_rec_end) tid_dtend[tid] = dt_rec_end;
			if (dtstart > dt_rec_start) dtstart = dt_rec_start;
			if (dtend < dt_rec_end) dtend = dt_rec_end;
		}

	next_packet:
		if (!gz.skip(datalen)) break;
	}

	gz.rewind(); // 되 감음

	if (!gz.skip(10 + headerlen)) return -1; // 헤더를 건너뜀

	// 메모리로 다 올리자
	map<unsigned short, vector<pair<double, float>>> nums;
	map<unsigned short, vector<pair<double, string>>> strs;
	map<unsigned short, vector<short>> wavs; // 전체 트랙별로 하나씩 생성
	for (auto tid : tids) { // 미리 벡터를 생성하여 대규모 데이터의 이동을 방지한다.
		auto rectype = tid_rectypes[tid];
		if (rectype == 1) {
			int wave_tid_size = ceil((tid_dtend[tid] - tid_dtstart[tid]) * tid_srates[tid]); //to make enough memory
			wavs[tid] = vector<short>(wave_tid_size);
		}
		else if (rectype == 2) {
			nums[tid] = vector<pair<double, float>>();
		}
		else if(rectype == 5) {
			strs[tid] = vector<pair<double, string>>();
		}
	}
	while (!gz.eof()) {// body를 다시 parsing
		unsigned char type = 0; if (!gz.read(&type, 1)) break;
		unsigned int datalen = 0; if (!gz.read(&datalen, 4)) break;
		if (datalen > 1000000) break;
		if (type != 1) { goto next_packet2; } // 이번에는 레코드만 읽음

		infolen = 0; if (!gz.fetch(infolen, datalen)) goto next_packet2;
		dt_rec_start = 0; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet2;
		tid = 0; if (!gz.fetch(tid, datalen)) goto next_packet2;
		if (!tid) goto next_packet2; // tid가 없으면 출력하지 않음
		if (dt_rec_start < tid_dtstart[tid]) goto next_packet2;

		// 트랙 속성을 가져옴
		rectype = tid_rectypes[tid]; // 1:wav,2:num,3:str
								 //cout << "rectype :" << (int)rectype << ", tid :" << tid << endl;
		auto srate = tid_srates[tid];
		nsamp = 0;
		if (rectype == 1) if (!gz.fetch(nsamp, datalen)) { goto next_packet2; }
		recfmt = tid_recfmts[tid]; // 1:flt,2:dbl,3:ch,4:byte,5:short,6:word,7:int,8:dword
		fmtsize = 4;
		switch (recfmt) {
		case 2: fmtsize = 8; break;
		case 3: case 4: fmtsize = 1; break;
		case 5: case 6: fmtsize = 2; break;
		}
		//gain = gains[tid];
		//offset = offsets[tid];

		if (rectype == 1) { // wav
			int idxrec = (dt_rec_start - dtstart) * srate;
			auto& v = wavs[tid];
			if (idxrec < 0) { goto next_packet2; }
			if (idxrec + nsamp >= v.size()) { goto next_packet2; }
			for (int i = 0; i < nsamp; i++) { // 각 샘플에 대해
				auto idxrow = idxrec + i; // 현 sample의 인덱스

				short cnt = 0; // 모든 샘플은 short 형 cnt 로 변환된다
				switch (recfmt) {
				case 1: {
					//float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
					//sval = string_format("%f", fval);
					break;
				}
				case 2: {
					//double fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
					//sval = string_format("%lf", fval);
					break;
				}
				case 3: {
					char ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				case 4: {
					unsigned char ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				case 5: {
					short ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				case 6: {
					unsigned short ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				case 7: {
					int ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				case 8: {
					unsigned int ival; if (!gz.fetch(ival, datalen)) { goto next_packet2; }
					cnt = ival;
					break;
				}
				}
				v[idxrow] = cnt;
			}
		} else if (rectype == 2) { // num
			float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
			nums[tid].push_back(make_pair(dt_rec_start, fval));
		} else if (rectype == 5) { // str
			if (!gz.skip(4, datalen)) { goto next_packet2; }
			string sval; if (!gz.fetch(sval, datalen)) { goto next_packet2; }
			strs[tid].push_back(make_pair(dt_rec_start, sval));
		}

	next_packet2:
		if (!gz.skip(datalen)) break;
	}

	// tid로부터 dbtid를 생성
	map<unsigned int, unsigned long long> tid_dbtid;
	for (auto tid : tids) {
		if (tid_dbtid.find(tid) != tid_dbtid.end()) continue;
		tid_dbtid[tid] = rnd();
	}

	// 트랙 정보를 저장함
	auto f = ::fopen((odir + "/" + filename + ".trk.csv").c_str(), "wt");
	for (auto tid : tids) {
		// tid, filename, type(n,w,s), trkname, dtstart, dtend, srate, gain, offset
		auto rectype = tid_rectypes[tid];
		char type = 0;
		if (rectype == 1) type = 'w';
		else if (rectype == 2) type = 'n';
		else if (rectype == 5) type = 's';
		else continue;
		fprintf(f, "%llu, \"%s\",%c,\"%s/%s\",%f,%f,%f,%f,%f\n", tid_dbtid[tid], caseid.c_str(), type, tid_dnames[tid].c_str(), tid_tnames[tid].c_str(), tid_dtstart[tid], tid_dtend[tid], tid_srates[tid], tid_gains[tid], tid_offsets[tid]);
	}
	::fclose(f);

	// 숫자값을 저장함
	f = ::fopen((odir + "/" + filename + ".num.csv").c_str(), "wt");
	for (auto it : nums) {
		auto& tid = it.first;
		auto& recs = it.second;
		for (auto& rec : recs) {
			fprintf(f, "%llu,%f,%f\n", tid_dbtid[tid], rec.first, rec.second);
		}
	}
	::fclose(f);

	f = ::fopen((odir + "/" + filename + ".str.csv").c_str(), "wt");
	for (auto it : strs) {
		auto& tid = it.first;
		auto& recs = it.second;
		for (auto& rec : recs) {
			fprintf(f, "%llu,%f,%f\n", tid_dbtid[tid], rec.first, escape_csv(rec.second));
		}
	}
	::fclose(f);

	// wav를 저장함
	f = ::fopen((odir + "/" + filename + ".wav.csv").c_str(), "wt");
	for (auto it : wavs) {
		auto& tid = it.first;
		auto& v = it.second;
		auto srate = tid_srates[tid];
		// 1초마다 행을 만든다
		for (auto dt = 0.0; dt < v.size() / srate; dt += 1.0) {
			int idx_start = dt * srate;
			int idx_end = idx_start + ceil(srate);
			if (idx_end > v.size()) idx_end = v.size();
			fprintf(f, "%llu,%f", tid_dbtid[tid], dtstart + dt);
			for (int idx = idx_start; idx < idx_end; idx++) {
				fprintf(f, ",%d", v[idx]);
			}
			fprintf(f, "\n");
		}
	}
	::fclose(f);

	return 0;
}
