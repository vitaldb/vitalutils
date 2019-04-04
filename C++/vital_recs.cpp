#include <stdio.h>
#include <stdlib.h>  // exit()
#include <assert.h>
#include <zlib.h>
#include <string>
#include <vector>
#include <map>
#include <stdarg.h>  // For va_start, etc.
#include <memory>    // For std::unique_ptr
#include <time.h> 
#include "GZReader.h"
#include "Util.h"
using namespace std;

void print_usage(const char* progname) {
	fprintf(stderr, "Usage : %s -OPTIONS INPUT_FILENAME INTERVAL [DNAME/TNAME]\n\n\
OPTIONS : one or many of the followings. ex) -rl\n\
  a : print absolute time (instead of relative time)\n\
  r : all tracks should be exists\n\
  l : replace blank value with the last value\n\
  h : print header at the first row\n\
  c : print filename at the first column\n\
  n : print the closest value from the start of the time interval as a representative\n\
  m : print mean value as a representative for numeric and wave tracks\n\
  s : skip blank rows\n\n\
INPUT_FILENAME : vital file name\n\n\
INTERVAL : time interval of each row in sec. default = 1. ex) 1/100\n\n\
DEVNAME/TRKNAME : comma seperated device and track name list. ex) BIS/BIS,BIS/SEF\n\
  if omitted, all tracks are exported.\n\n", basename(progname).c_str());
}

double minval(vector<double>& v) {
	double ret = DBL_MAX;
	for (int i = 0; i < v.size(); i++)
		if (v[i] < ret)
			ret = v[i];
	return ret;
}

double maxval(vector<double>& v) {
	double ret = DBL_MIN;
	for (int i = 0; i < v.size(); i++)
		if (v[i] > ret)
			ret = v[i];
	return ret;
}

int main(int argc, char* argv[]) {
	const char* progname = argv[0];
	argc--; argv++; // 자기 자신의 실행 파일명 제거

	bool absolute_time = false;
	bool all_required = false;
	bool fill_last = false;
	bool print_header = false;
	bool print_filename = false;
	bool print_mean = false;
	bool print_closest = false;
	bool skip_blank_row = false;
	if (argc > 0) {
		string opts(argv[0]);
		if (opts.substr(0, 1) == "-") {
			argc--; argv++;
			if (opts.find('a') != -1) absolute_time = true;
			if (opts.find('r') != -1) all_required = true;
			if (opts.find('l') != -1) fill_last = true;
			if (opts.find('h') != -1) print_header = true;
			if (opts.find('c') != -1) print_filename = true;
			if (opts.find('m') != -1) print_mean = true;
			if (opts.find('s') != -1) skip_blank_row = true;
			if (opts.find('n') != -1) print_closest = true;
		}
	}

	double epoch = 1.0; // 사용자가 지정한 시간 간격
	if (argc < 1) { // 최소 1개의 입력 (파일명)은 있어야함
		print_usage(progname);
		return -1;
	}

	////////////////////////////////////////////////////////////
	// parse epoch
	////////////////////////////////////////////////////////////
	if (argc >= 2) {
		string sspan(argv[1]);
		int pos = sspan.find('/');
		epoch = atof(sspan.c_str());
		if (pos > 0) {
			double divider = atof(sspan.substr(pos + 1).c_str());
			if (divider == 0) {
				fprintf(stderr, "divider of [TIMESPAN] should not be 0\n");
				return -1;
			}
			epoch /= divider;
		}
	}
	if (!epoch) {
		fprintf(stderr, "[TIMESPAN] should be > 0\n");
		return -1;
	}

	////////////////////////////////////////////////////////////
	// parse dname/tname
	////////////////////////////////////////////////////////////
	vector<string> tnames; // 컬럼별 출력할 트랙명
	vector<string> dnames; // 컬럼별 출력할 장비명
	vector<unsigned short> tids; // 컬럼별 출력할 tid

	bool alltrack = true;
	if (argc >= 3) {
		alltrack = false;
		tnames = explode(argv[2], ',');
		int ncols = tnames.size();
		tids.resize(ncols);
		dnames.resize(ncols);
		for (int j = 0; j < ncols; j++) {
			int pos = tnames[j].find('/');
			if (pos != -1) {// devname 을 지정
				dnames[j] = tnames[j].substr(0, pos);
				tnames[j] = tnames[j].substr(pos + 1);
			}
		}
	}

	string filename = argv[0];

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

	// 한 번 훑음
	// 첫 번째에서는 트랙 이름과
	// 전체 시작 시간 및 종료 시각 을 구함
	map<unsigned short, double> tid_dtstart; // 트랙의 시작 시간
	map<unsigned short, double> tid_dtend; // 트랙의 종료 시간
	map<unsigned long, string> did_dnames;
	map<unsigned short, unsigned char> rectypes; // 1:wav,2:num,5:str
	map<unsigned short, unsigned char> recfmts; // 
	map<unsigned short, double> gains;
	map<unsigned short, double> offsets;
	map<unsigned short, float> srates;
	map<unsigned short, string> tid_tnames;
	map<unsigned short, string> tid_dnames;
	map<unsigned short, int> tid_col;
	map<unsigned short, bool> tid_used;

	while (!gz.eof()) { // body는 패킷의 연속이다.
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(datalen > 1000000) break;

		// tname, tid, dname, did, type (NUM, STR, WAV), srate
		if (type == 0) { // trkinfo
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;
			unsigned char rectype; if (!gz.fetch(rectype, datalen)) goto next_packet;
			unsigned char recfmt; if (!gz.fetch(recfmt, datalen)) goto next_packet;
			string tname, unit; 
			float minval, maxval, srate; 
			unsigned long col, did;
			double adc_gain, adc_offset;
			unsigned char montype;
			if (!gz.fetch(tname, datalen)) goto next_packet;
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
			tid_tnames[tid] = tname;
			tid_dnames[tid] = dname;
			rectypes[tid] = rectype;
			recfmts[tid] = recfmt;
			gains[tid] = adc_gain;
			offsets[tid] = adc_offset;
			srates[tid] = srate;
			tid_dtstart[tid] = DBL_MAX;
			tid_dtend[tid] = 0.0;

			if (!alltrack) { // 데이터가 존재 하든, 존재하지 않든 항상 입력된 tname 순서로 출력한다.
				int col = -1;
				for (int i = 0; i < tnames.size(); i++) {
					if (tnames[i] == tname	)
						if (dnames[i].empty() || dnames[i] == dname) {
							col = i;
							break;
						}
				}
				if (col == -1) continue;
				tids[col] = tid;
				tid_col[tid] = col;
			}
		} else if (type == 9) { // devinfo
			unsigned long did; if (!gz.fetch(did, datalen)) goto next_packet;
			string dtype; if (!gz.fetch(dtype, datalen)) goto next_packet;
			string dname; if (!gz.fetch(dname, datalen)) goto next_packet;
			if (dname.empty()) dname = dtype;
			did_dnames[did] = dname;
		} else if (type == 1) { // rec
			unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet;
			double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet;
			if (!dt_rec_start) goto next_packet;
			unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet;

			// 트랙 속성을 가져옴
			unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
			float srate = srates[tid];
			unsigned long nsamp = 0;
			double dt_rec_end = dt_rec_start; // 해당 레코드 종료 시간
			if (rectype == 1) { // wav
				if (!gz.fetch(nsamp, datalen)) goto next_packet;
				if(srate > 0) dt_rec_end += nsamp / srate;
			}

			if (alltrack && !tid_used[tid]) { // 모두 출력하는 경우에는 처음 등장할 때 순서를 정한다.
				int col = tnames.size();
				tnames.push_back(tid_tnames[tid]); // 등장하는 순서대로 tnames에 집어넣음
				dnames.push_back(tid_dnames[tid]);
				tids.push_back(tid);
				tid_col[tid] = col;
				tid_used[tid] = true;
			}

			// 시작 시간, 종료 시간을 업데이트
			if (tid_dtstart[tid] > dt_rec_start) tid_dtstart[tid] = dt_rec_start;
			if (tid_dtend[tid] < dt_rec_end) tid_dtend[tid] = dt_rec_end;
		} 

next_packet:
		if (!gz.skip(datalen)) break;
	}

	double dtstart = 0;
	double dtend = 0;
	vector<double> dtstarts, dtends;
	for (auto tid : tids) {
		if (!tid) continue;
		dtstarts.push_back(tid_dtstart[tid]);
		dtends.push_back(tid_dtend[tid]);
	}
	
	if (dtstarts.empty() || dtends.empty()) {
		fprintf(stderr, "No data\n");
		return -1;
	}

	if (all_required) {// 모든 트랙이 존재해야함
		// 모든 트랙의 dtstart 중 최대 부터 dtend 의 최소까지
		dtstart = maxval(dtstarts);
		dtend = minval(dtends); // 하나라도 존재하지 않으면 dtstart = DBL_MAX, dtend = 0 이 된다.
	} else {
		// 모든 트랙의 dtstart 중 최소 부터 dtend 의 최대 까지
		dtstart = minval(dtstarts);
		dtend = maxval(dtends);
	}

	if (dtend <= dtstart) {
		fprintf(stderr, "No data\n");
		return -1;
	}
	if (dtend - dtstart > 48 * 3600) {
		fprintf(stderr, "Data duration > 48 hrs\n");
		return -1;
	}

	gz.rewind(); // 되 감음
	if (!gz.skip(10 + headerlen)) return -1; // 헤더를 건너뜀
											 
	// 결과를 저장할 리스트를 생성
	int ncols = tids.size();
	int nrows = ceil((dtend - dtstart) / epoch);

	// 모든 값들을 메모리로 올릴 준비
	// 파일의 맨 뒤라도 가장 빠른 시간의 데이터가 올 수 있기 때문에 전체를 메모리로 올려야 한다.
	vector<vector<string*>> rows(nrows);
	for (int i = 0; i < nrows; i++) rows[i].resize(ncols); // 각 트랙의 출력 결과를 담고 있는 테이블 // 이정도 메모리는 되어야 실행된다.

	// 평균 출력할 때만 사용
	vector<vector<double>> sums(nrows);
	vector<vector<int>> cnts(nrows);
	if (print_mean) {
		for (int i = 0; i < nrows; i++) {
			sums[i].resize(ncols); // 0으로 초기화
			cnts[i].resize(ncols);
		}
	}

	// 가장 가까운 값 출력할 때만 사용
	vector<vector<double>> dists(nrows);
	if (print_closest) {
		for (int i = 0; i < nrows; i++) {
			dists[i].resize(ncols);
			for (int j = 0; j < ncols; j++) {
				dists[i][j] = DBL_MAX;
			}
		}
	}

	///////////////////////////////////////////
	// body를 다시 parsing 하면서 값들을 읽음
	///////////////////////////////////////////
	vector<bool> has_data_in_col(ncols);
	vector<bool> has_data_in_row(nrows);
	while (!gz.eof()) {// body를 다시 parsing
		unsigned char type; if (!gz.read(&type, 1)) break;
		unsigned long datalen; if (!gz.read(&datalen, 4)) break;
		if(datalen > 1000000) break;
		if (type != 1) { goto next_packet2; } // 이번에는 레코드만 읽음

		unsigned short infolen; if (!gz.fetch(infolen, datalen)) goto next_packet2;
		double dt_rec_start; if (!gz.fetch(dt_rec_start, datalen)) goto next_packet2;
		if (dt_rec_start < dtstart) goto next_packet2; 
		unsigned short tid; if (!gz.fetch(tid, datalen)) goto next_packet2; 
		if (tid_col.find(tid) == tid_col.end()) goto next_packet2; // tid가 없으면 출력하지 않음
		unsigned int icol = tid_col[tid];

		// 트랙 속성을 가져옴
		unsigned char rectype = rectypes[tid]; // 1:wav,2:num,3:str
		float srate = srates[tid];
		unsigned long nsamp = 0;
		if (rectype == 1) if (!gz.fetch(nsamp, datalen)) { goto next_packet2; }
		unsigned char recfmt = recfmts[tid]; // 1:flt,2:dbl,3:ch,4:byte,5:short,6:word,7:long,8:dword
		unsigned int fmtsize = 4;
		switch (recfmt) {
		case 2: fmtsize = 8; break;
		case 3: case 4: fmtsize = 1; break;
		case 5: case 6: fmtsize = 2; break;
		}
		double gain = gains[tid];
		double offset = offsets[tid];

		if (rectype == 1) { // wav
			for (int i = 0; i < nsamp; i++) { // wave내의 각 샘플에 대해
				// 현 sample이 어느 행에 속하는가?
				// closest 인 경우에는 반올림하고 나머지는 그냥 interval 내에 속한 샘플들만 출력
				double frow = (dt_rec_start + (double)i / srate - dtstart) / epoch;
				int irow = frow + (print_closest ? 0.5 : 0.0);
				if (irow < 0) { goto next_packet2; }
				if (irow >= nrows) { goto next_packet2; }

				// 이번 샘플을 처리할 것인지를 매우 빠르게 판단해야함
				bool skip_this_sample = true;
				if (print_closest) { // closest 인 경우에는 이전 distance 보다 가까운 경우만 처리
					double fdist = fabs(frow - irow);
					if (fdist < dists[irow][icol]) {
						dists[irow][icol] = fdist;
						skip_this_sample = false;
					}
				} else if (print_mean) { // 평균일 경우에는 모든 샘플을 처리
					skip_this_sample = false;
				} else { // 그 외의 경우에는 이전 값이 없는 경우만 처리
					skip_this_sample = rows[irow][icol];
				}

				// 이번 샘플을 건너 뜀
				if (skip_this_sample) {
					if (!gz.skip(fmtsize, datalen)) break;
					continue;
				}

				string sval;
				float fval;
				switch (recfmt) {
				case 1: { // float
					float v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					sval = string_format("%f", v);
					fval = v;
					break;
				}
				case 2: { // double
					double v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					sval = string_format("%lf", v);
					fval = v;
					break;
				}
				case 3: { // char
					char v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 4: { // byte
					unsigned char v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 5: { // short
					short v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 6: { // word
					unsigned short v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 7: { // long
					long v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				case 8: { // dword
					unsigned long v; if (!gz.fetch(v, datalen)) { goto next_packet2; }
					fval = v * gain + offset;
					sval = string_format("%f", fval);
					break;
				}
				}
				
				if (print_mean) {
					sums[irow][icol] += fval;
					cnts[irow][icol] ++;
				} else {
					rows[irow][icol] = new string(sval);
				}
				has_data_in_col[icol] = true;
				has_data_in_row[irow] = true;
			}
		} else if (rectype == 2) { // num
			double frow = (dt_rec_start - dtstart) / epoch;
			int irow = frow + (print_closest ? 0.5 : 0.0);
			if (irow < 0) { goto next_packet2; }
			if (irow >= nrows) { goto next_packet2; }
			
			// 이번 샘플을 처리할 것인지를 매우 빠르게 판단해야함
			bool skip_this_sample = true;
			if (print_closest) { // closest 인 경우에는 이전 distance 보다 가까운 경우만 처리
				double fdist = fabs(frow - irow);
				if (fdist < dists[irow][icol]) {
					dists[irow][icol] = fdist;
					skip_this_sample = false;
				}
			} else if (print_mean) { // 평균일 경우에는 모든 샘플을 처리
				skip_this_sample = false;
			} else { // 그 외의 경우에는 이전 값이 없는 경우만 처리
				skip_this_sample = rows[irow][icol];
			}

			if (skip_this_sample) { goto next_packet2; }

			float fval; if (!gz.fetch(fval, datalen)) { goto next_packet2; }
			if (print_mean) {
				sums[irow][icol] += fval;
				cnts[irow][icol] ++;
			} else {
				rows[irow][icol] = new string(string_format("%f", fval));
			}
			
			has_data_in_col[icol] = true;
			has_data_in_row[irow] = true;
		} else if (rectype == 5) { // str
			double frow = (dt_rec_start - dtstart) / epoch;
			int irow = frow + (print_closest ? 0.5 : 0.0);
			if (irow < 0) { goto next_packet2; }
			if (irow >= nrows) { goto next_packet2; }

			// 이번 샘플을 처리할 것인지를 매우 빠르게 판단해야함
			bool skip_this_sample = true;
			if (print_closest) { // closest 인 경우에는 이전 distance 보다 가까운 경우만 처리
				double fdist = fabs(frow - irow);
				if (fdist < dists[irow][icol]) {
					dists[irow][icol] = fdist;
					skip_this_sample = false;
				}
			} else { // 그 외의 경우에는 이전 값이 없는 경우만 처리
				skip_this_sample = rows[irow][icol];
			}

			if (skip_this_sample) { goto next_packet2; }

			if (!gz.skip(4, datalen)) { goto next_packet2; }
			string sval; if (!gz.fetch(sval, datalen)) { goto next_packet2; }
			rows[irow][icol] = new string(escape_csv(sval));
			has_data_in_col[icol] = true;
			has_data_in_row[irow] = true;
		}
		
next_packet2:
		if (!gz.skip(datalen)) break;
	}

	if(all_required) // 한 변수라도 데이터가 없으면?
		for (int j = 0; j < ncols; j++)
			if (!has_data_in_col[j]) {
				fprintf(stderr, "No data\n");
				return -1;
			}


	///////////////////////////////////////////////////////
	// 읽기 종료, 결과를 출력
	///////////////////////////////////////////////////////
	if (print_mean) {
		for (int i = 0; i < nrows; i++) {
			for (int j = 0; j < ncols; j++) {
				if (cnts[i][j]) {
					double m = sums[i][j] / cnts[i][j];
					rows[i][j] = new string(string_format("%f", m));
				}
			}
		}
	}

	// 헤더 행을 출력
	if (print_header) {
		if (print_filename) printf("Filename,"); // 뒤에 time은 반드시 있으므로 , 를 붙여도 안전
		printf("Time"); // 트랙명을 출력
		for (int j = 0; j < ncols; j++) {
			string str = tnames[j];
			if (!dnames[j].empty()) str = dnames[j] + "/" + str;
			putchar(',');
			printf(str.c_str());
		}
		putchar('\n');
	}

	vector<string> lastval(ncols); // 각 컬럼의 마지막 값
	for (int i = 0; i < nrows; i++) { // 각 행의 데이터를 출력
		if (skip_blank_row) {
			if (!has_data_in_row[i]) continue;
		}

		double dt = dtstart + i * epoch;

		if (print_filename) {
			printf(basename(filename).c_str());
			putchar(','); // 뒤에 time은 반드시 있으므로 , 를 붙여도 안전
		}

		// 시간을 출력
		if (absolute_time) {
			time_t t_local = (time_t)dt - dgmt * 60;
			tm * ts = gmtime(&t_local);
			printf("%04d-%02d-%02d %02d:%02d:%02d.%03d", ts->tm_year + 1900, ts->tm_mon + 1, ts->tm_mday, ts->tm_hour, ts->tm_min, ts->tm_sec, (__int64)((dt - (__int64)dt) * 1000));
		} else {
			printf("%lf", dt - dtstart);
		}

		// 값을 출력
		for (int j = 0; j < ncols; j++) {
			string val;
			if (rows[i][j]) val = *rows[i][j];
			if (fill_last) {
				if (val.empty()) val = lastval[j]; // 값이 없으면 마지막 값을 출력
				else lastval[j] = val; // 값이 있으면 그 값을 마지막 값으로 캐쉬
			}
			printf(",%s", val.c_str());
		}

		printf("\n");
	}

	for (int i = 0; i < nrows; i++)
		for (int j = 0; j < ncols; j++)
			if (rows[i][j])
				delete rows[i][j];

	return 0;
}